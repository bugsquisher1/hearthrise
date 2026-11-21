# The designer's rulings before wave 1: D-1, D-2 and D-11

**RULED by the game designer** 2026-11-21 on `lane/d-designer-w0`, from `set/v0.2.144` at d02707929. Docs only. No game code, data, migration or tool is touched. Chapters 00 to 13 and `decisions/` are not edited. Each ruling ends with the edits the integrator makes.

**Evidence words.** MEASURED carries a run id. PLAYED is `review/02-four-hero-hour.md`. COMPUTED is arithmetic from data rows on this branch. JUDGMENT is a design call. UNKNOWN names what would settle it. Every balance number measured before FB-1's fix at 02364f03a is marked "before the fix". No rule below is sized on one. Each such rule reads a row FB-3's replay fills.

**Player words.** Lines in quotes are the exact words. They use "party" and "heroes". "Company" stays design vocabulary (2026-11-14, genre words).

---

## 0. One screen

| Ruling | In one or two sentences |
|---|---|
| **D-1 The Path** | One table, 21 row families, each reading its Level from its own system's file and gated on that system's flag. Every Level 1 to 30 names a next thing within 3 Levels except Levels 16, 25 and 26, which only the harder-tier rows can fill, and those read FB-3's replay. |
| **D-1 The wand card** | The card says casting costs gold and how much the first hunt loses. The number fills from check C1. |
| **D-1 The first objective** | In the first hour the coach rings only screen controls, never a thing standing in town. The card sits under the top bar, Chat sits bottom left, and a layout test holds them apart. |
| **D-1 The first Dangerous offer** | No Level and no ground. A harder tier is offered when the party's last hunt there read Safe and the tier's risk row, read at the gear the party wears, is inside the ruled death band. Until then the tier stays a warned choice. |
| **D-1 Weapon tags** | A stub row. FB-5 fills it last from check C1. |
| **D-2 Gear** | A standing plan line, "Wear upgrades", puts better gear on at every Start and every hunt end, in town. Nothing changes inside a running hunt. A visiting player gets one press that leaves, equips and goes back in. |
| **D-2 Leader** | The hero the engine already sends in front (`ROLE_ORDER`, `src/data/hunt-roles.js`). The plan says who and why. The player may pin another. |
| **D-2 Needs you** | Eight kinds in a fixed order: what stops a hero hunting, then what costs progress, then gains. One row a kind for the account, three shown. |
| **D-11 The rest plan's ending** | The usual ending is a standing job with no count. It starts no hunt, never loops, and stops by itself after 24 hours. "Wait in town" stays as a choice. |

**What Tyler can veto, one line each.**

1. **Reversal row 27.** "Veto 27" puts "wait in town" back as the usual ending. Heroes then stand idle for nearly all 12 rested hours (COMPUTED, section 3.2).
2. **Reversal row 27b, new.** "Veto 27b" puts "hunt again, once" back as a rest plan ending. It was in the plan he approved on 2026-11-20. I removed it because it gives a free player the 12 hour day in one visit, which is what the Premium bar sells (COMPUTED, section 3.3).

**One thing the plan owner must know.** The Path has no real row for Levels 16, 25 and 26 until FB-7's tier-risk file lands in wave 2. FB-5's guard names those three Levels and passes on them until then, and fails on any other hole (section 1.1).

---

## 1. D-1, before FB-5 and FB-7

### 1.1 The Path

**The row.** A new file in `src/data`, owned by FB-5. One frozen row for each line below.

| Field | Meaning |
|---|---|
| `id` | Stable, `[a-z0-9_]` |
| `opener` | One of three. `{ kind: 'level', from: <file and export> }`. `{ kind: 'event', event: <id>, expectLevel: <n> }`. `{ kind: 'accounts', from: <file and export> }` |
| `opens` | Window ids from `src/data/shell-windows.js`, or a feature id |
| `flag` | The file and export in the row's own system that says the system is live. Missing or false means the row is off. The lane that owns the system adds the export when it lands. No later lane edits the Path file |
| `scope` | `account`, `hero` or `way`. An `account` row's card is shown once for the account |
| `line` | The words on the Town menu, What next, the end card and the return card |
| `card` | The coach card id, or none |

**Rules.**

1. **A Level is never typed in the Path.** A `level` opener names the export it reads. The guard fails a row whose export is missing while its flag is on.
2. **An event opener carries `expectLevel`.** It is the Level by which the walked first hour meets the event. It exists only so the guard can count the row. It gates nothing.
3. **The guard.** With every first-build flag on: for every Level L from 1 to 30, some `account` row has a Level or `expectLevel` in L+1 to L+3. `way` rows never count, because not every account has that weapon. Every `opens` id must exist in `shell-windows.js`.
4. **The guard until the tier-risk file exists.** FB-5 ships it strict, with one named list: the Levels it expects the harder-tier rows to fill (16, 25, 26). A hole on that list prints and passes. Any other hole fails. FB-7 deletes the list in the commit that adds the generated file, with a mutant that proves the guard bites. A hole still open then is a real red.
5. **If the replay leaves a hole.** The fix is content at the data layer, never a row made up for the guard. The precedent is the two crafted cloaks added for the same gap (Graypelt Cloak at Level 8, Houndskin Cloak at Level 22, `src/data/slot-ladders.js`). I rule that rung when the hole is known, with the asset director.
6. **Announced, never taken away.** A player who knows the game may open anything the server allows. The Path only decides when the coach and the menu say it.

**The rows.** "Source" is where the Level or the event lives today. Every name was looked up on this branch.

| # | Opener | Opens | Source of the Level or event | Flag lives in | Scope | The line |
|---|---|---|---|---|---|---|
| 1 | Event `start`, expect 1 | Hunts, Inventory, Character, the Book, Shop, Tamsin's tally, Chat | Always | None | account | "Open Hunts and pick the Mill Cellar." |
| 2 | Event `first_kill`, expect 1 | The action bar | The hunt's tally | None | account | "Your hero fights by itself. Open a slot on the bar to change how." |
| 3 | Event `first_leave`, expect 4 | The end card, the hunt report, Blessings, the loot plan | `tally-tasks.js` cellar_giant_rats, 25 Giant Rats | FB-7's report flag for the report line | account | "Rats done. Tamsin has gear for you." |
| 4 | Event `first_level_5`, expect 5 | Heroes two to four, the hero strip, the party plan, Storage | `hunt-grounds.js` mill_cellar `endsAtLevel` 5 | `shops.js` hero slot rows (FB-5) | account | "{Name} has outgrown the Mill Cellar. You have three more heroes to make, and the Sewer wants a full party." Press "Build your party". Second press "Go on alone to Meadowbrook Thicket" |
| 5 | Level, the ground's floor | Meadowbrook Thicket. The Sewer for a party | `hunts.js` band[0] of `meadowbrook_thicket` and `millrace_sewer`, both 5 | `hunts.js` (a ground with no `staged`) | hero | "Level 5. Meadowbrook Thicket" and "Level 5. The Sewer, for a party" |
| 6 | Event `party_ready`, expect 5 | The first party hunt | Every hero at the Sewer's floor | FB-6's party flag | account | "Your party is ready for the Sewer." Press "Gather and go" |
| 7 | Event `party_hunt_10min`, expect 6 | Skills, the rest plan, the Farm, the House as a goal | FB-6's rest plan | FB-6's rest plan flag | account | "When stamina runs out your heroes go to work. Here is their plan." |
| 8 | Event `party_hunt_15min`, expect 6 | The safe-to-close line | The first party hunt, 15 minutes in | None | account | "It is safe to close the game. Your party hunts for about {hours} more hours, then goes to work. Come back in about {back} hours." |
| 9 | Level 8 | Wickstead | `hunts.js` wickstead band[0] | `hunts.js` | hero | "Level 8. Wickstead" |
| 10 | Level 8 | Graypelt Cloak, made at the Crafting bench from 6 Wolf Pelts | `slot-ladders.js` graypelt_cloak `reqLv` 8, recipe stitch_graypelt_cloak, Crafting 1 | `slot-ladders.js` | hero | "Level 8. Graypelt Cloak. Stitch it from 6 Wolf Pelts." |
| 11 | Event `first_stamina_end`, expect 10 | The return card. The Hearthside Homestead. The Weighhouse. The clan roster line. The calendar banner | `hunt-sessions.js` STAMINA_MAX_MS and the `stamina` end | Return card: FB-6. Weighhouse: FB-9's market flag. Clans and calendar: FB-12's flags | account | "Your heroes are back in town." The Homestead line: "You can build the Hearthside Homestead." |
| 12 | Level 10 | Talents, then the Burning Tower, then the Hearth Chest, in that order, one card each (chapter 10 section 10) | Talents: FB-11's file. Tower: `tower.js` TOWER_RULES.minLevel 10. Chest: its Bronze Key is the key of the Tower floor 10 landing (`chests.js` `from` is a floor), so it follows the Tower and holds no Level of its own | FB-11's flag. `tower.js` | Talents account, Tower hero | "Level 10. Talents", "Level 10. The Burning Tower", "Level 10. The Hearth Chest" |
| 13 | Level 10 | The Training Yard. No card. It is offered in the rest plan's picker | `training.js` minLevel 10 | `training.js` | hero | "Level 10. Training Yard" |
| 14 | Level 12 | Grayjaw's Ruff, a rare drop from Old Grayjaw in Meadowbrook Thicket | `items.js` grayjaws_ruff `reqLv` 12. `hunt-grounds.js` line 229 puts `grayjaw` in the Thicket | `items.js` | hero | "Level 12. Grayjaw's Ruff. Old Grayjaw drops it in the Thicket." |
| 15 | Level 13 | The world boss, for each hero sent | FB-13's boss file holds the Level | FB-13's flag | hero | "Level 13. {Boss name}" |
| 16 | Level 15 | Iron gear. The Banded Signet and the Wolfbone Necklace at Smithing 15 | `gear-tiers.js` iron `level` 15. `slot-ladders.js` banded_signet and wolfbone_torc `reqLv` 15 | `gear-tiers.js` | hero | "Level 15. Iron gear" |
| 17 | Level 16 | Mosslight Glade. The Roll of Honor | `hunts.js` mosslight_glade band[0]. `hunt-tutorial.js` ROLL_LEVEL | `hunts.js` | hero | "Level 16. Mosslight Glade" |
| 18 | Level, every fifth from 15 | A Talent point | FB-11's point rule (one point every five Levels, RULED 2026-11-21) | FB-11's flag | hero | "Level {N}. A Talent point" |
| 19 | Level 22 | Houndskin Cloak, from 12 Wolf Pelts and 1 Bear Pelt | `slot-ladders.js` houndskin_cloak `reqLv` 22, recipe stitch_houndskin_cloak | `slot-ladders.js` | hero | "Level 22. Houndskin Cloak" |
| 20 | Level 30 | Steel gear. Blessings cost gold | `gear-tiers.js` steel `level` 30. `blessings.js` freeUntilLevel 30 | Their own files | hero | "Level 30. Steel gear" and, from Level 28 on the end card, "Blessings are free until Level 30." |
| 21 | Level 32 | Coppercap Warrens | `hunts.js` coppercap_warrens band[0] | `hunts.js` | hero | "Level 32. Coppercap Warrens" |
| 22 | Level, generated. One row for each open ground and harder tier | That tier on that ground, for a party in the Level's gear | FB-7's tier-risk file: the lowest played Level where the mid row is inside the offer band of section 1.4 | FB-7's flag | hero | "Level {N}. {Tier} on {ground}, for a party in this Level's gear" |
| 23 | Level, read for the hero's weapon | A move the weapon unlocks | `abilities.js` `unlock`, by discipline. Today Turning Cut and Raking Shot 10, Frost Slam 12, Hoarfrost 14, Shelter and Spring Tide 20 | `abilities.js` | way | "Level {N}. {Move}" |
| 24 | Set by D-8 | On call | FB-14's file | FB-14's flag | account | D-8 |
| 25 | Accounts a day | The Town Crier | `gold-sinks.js` line 73 holds its Level 10. The count is FB-12's | FB-12's flag | account | Chapter 06 |
| 26 | Stub | The weapon cards' tags | Section 1.5 | FB-5 | account | Section 1.5 |

**Rows chapter 08 lists that are not first-build rows.** The Rat King's Hall (`boss-halls.js` holds only Krell's hall, and halls wait). The Honors lines at Level 100 and up. Both arenas at Levels 20 and 30. Old grounds at your Level. Tempering, Hallmarks and linings keep their openers with chapter 03 and get rows when FB-8 lands them. They stay off the table, as the Path's own rule says.

**The guard's coverage, with every first-build flag on.** COMPUTED from the rows above.

| At Level | Next thing | At Level | Next thing | At Level | Next thing |
|---|---|---|---|---|---|
| 1, 2, 3 | 4 (first Leave), 5 | 11 | 12, 13 | 21 | 22 |
| 4 | 5 | 12 | 13, 15 | 22, 23, 24 | 25 (Talent point) |
| 5, 6 | 8 | 13, 14 | 15, 16 | **25, 26** | **None. Needs a row at 27 or 28** |
| 7 | 8, 10 | 15 | 16 | 27, 28, 29 | 30 |
| 8 | 10 | **16** | **None. Needs a row at 17, 18 or 19** | 30 | 32 |
| 9, 10 | 10 or 12, 13 | 17, 18, 19, 20 | 20 (Talent point), 22 | | |

Three things this table shows.

- **Two holes, Levels 16 and 25 to 26.** Nothing in `src/data` opens at 17 to 19 or at 27 to 28. Row 22 is what should fill them: Deadly on Wickstead (band 8 to 18), on the Sewer (5 to 25) and on Mosslight Glade (16 to 31) each turn safe for a mid kit somewhere inside the band. Where is UNKNOWN until the replay.
- **Talents carry four Levels.** Without rows at 20 and 25 the stretch from 17 to 24 has one row. If FB-11 slips, the guard goes red at 17, 22, 23 and 24.
- **If the world boss ships dark, Level 10 still holds** on Grayjaw's Ruff at 12.

### 1.2 The wand card's cost line

**The rule, on data.** A weapon card carries a cost line when either holds: its first move spends a rune (`abilities.js` `rune` on the first move of the starter set's discipline), or its start-kit cell on check C1 reads net gold under zero by Level 5. The line's number is C1's net gold for that cell, rounded to the nearest 25. FB-5 fills it with the tags (section 1.5).

**The words.**

| Card | Cost line |
|---|---|
| Wand and spellbook | "Casting costs gold. Each Fireball uses 1 rune and some mana. The store sells both as you go. Your first hunt spends about 100 gold more than it picks up in coins, and its loot sells for more than that. You start with 500." (Replaced by D-3, `review/08-designer-d3.md` section 2.5. The default {N} is 100.) |
| Staff, Hatchets | "Uses runes. The store sells them for 1 gold each as you cast." |
| Club | No cost line. Power Strike needs no rune. Quarry Blow's rune is said on the bar |
| Sword and shield, Bow and crossbow | No cost line |

Until C1 reads, {N} is 100. PLAYED once: the wand hero went Level 1 to 5 in 16 minutes, earned 146 gold in coin and spent 251 on runes and drinks, with an XP weekend running. If C1 reads the wand at or over zero after the replay, the second and third sentences stay and the fourth goes.

**Two facts for FB-5 from the data.** The store's first rune is the Chalked Fire Rune at 1 gold (`supply-basics.js` STORE_RUNE_PRICE[0]). Chapter 08 calls it a Plain Fire Rune, which is no item. And `start-kit.js` START_EQUIPMENT wears every new hero in `practice_sword` and `practice_shield`. The pick must wear the picked row of STARTER_SETS, off hand included, or the mage keeps the shield, as PLAYED.

### 1.3 Where the first objective sits, for the art director

Chat stays open by default at the bottom left (RULED 2026-10-22). What PLAYED broke was not the card. The card sits in one line under the top bar's icon row and already shows beside Chat (`shell-windows.js` `besideCoach`). The thing it pointed at, Tamsin's board, is a sprite in the town at tile 103, 45, and it stood under Chat's 400 by 280 window.

| # | Rule | Who |
|---|---|---|
| 1 | **In the loop deck the coach rings only screen controls.** A top bar icon, a line of the Town menu, or a control inside a window. Never a sprite in the town or on a hunting ground. Tamsin's first task is taken on entry (GR-78), so the first card rings Hunts in the top bar | FB-5, data. A card row whose ring names a world station fails the coach guard |
| 2 | **Any Path row that lives at a town station is rung on its Town menu line.** The sprite stays a second way in | FB-5 |
| 3 | **The card's home is the top right, docked under the icon row.** The opposite corner from Chat. On a hunt it docks under the hunt top bar, as today | Art director confirms the dock at 1280 by 720 and 1920 by 1080 |
| 4 | **A window that holds a ringed control opens above Chat and clear of it** when the screen has the room. Hunts is the first | Art director, `window-manager.js` open rules (FB-5 owns them) |
| 5 | **If the player has dragged or stretched Chat over the card or the ring, the card and the ring draw above Chat.** Chat is never moved or shrunk by the game | Art director |
| 6 | **The test.** For every loop deck card, at 1280 by 720 and 1920 by 1080, with Chat open at its default size and place: the card's box and the ringed control's box do not touch Chat's box. Measured from layout, not from constants | FB-5, "The first objective visible with Chat open" in its test list |

Phones need no rule. Chat does not start open there (`start-open.js`: desktop only).

### 1.4 The first Dangerous offer

**What is true today.** Every open ground but the Mill Cellar carries Dangerous and Deadly from its floor (`hunt-tiers.js` GROUND_TIERS). One coach card offers Dangerous at Level 8 to a hero with a helm and body armor (`hunt-tutorial.js` DANGER_LEVEL, DANGER_KIT). MEASURED before the fix, runs 44925664434 and 44928035806: at Wickstead's floor a mid four read 142 deaths in 1,000 hours on Dangerous, the Sewer's floor read 41, and an arrival four wiped. The line beside the tier reads a mid kit, and a new party wears less.

**The rule. It names no Level and no ground.**

1. **Picking a harder tier is always allowed.** It is a warned choice with one confirm (RULED 2026-11-04). Nothing here locks a tier.
2. **Offering is separate from allowing.** The game offers a tier T on a ground G to a party (the coach card, What next, the "Needs you" row, the Recommended mark) only when both hold:
   - **Safe here.** The party's last hunt on G, one tier below T, ran at least `minHours` and its report read Safe: no hero under 50% health.
   - **Inside the band.** The tier-risk row for G and T, read at the party's gear state and Level, is at or under `offerMax[T]`.
3. **`offerMax` is the top of the tier's ruled band for a mid party**, read from the standards file and never typed twice: 30 deaths in 1,000 hunted hours for Dangerous, 100 for Deadly (band S6, `tools/balance-program/standards.mjs`).
4. **The gear state is the party's weakest hero's.** A hero reads `best`, `mid` or `low` as the highest of the matrix's three kits (`GEAR_STATES`, the same file) it meets in every worn slot at its Level. A hero under the low kit reads `low` and the line says so. The weakest decides because a four falls together: MEASURED before the fix, when the front hero fell the other three died in the same hunt in every sampled wipe.
5. **The Level is the party's lowest.** Between two played Level points the row reads the worse neighbor.
6. **Unmeasured means not offered.** A cell the matrix has not played is never offered and its risk line says "Not tested yet."
7. **The first offer** is the first time rule 2 passes for the account. It is an event opener on the Path, `first_harder_tier`, with `expectLevel` filled from the replay. DANGER_LEVEL and DANGER_KIT are retired by FB-5.

**Data.** In the tier-risk system's hand-written file, beside the generated one, both FB-7's:

| Row | Value | Label |
|---|---|---|
| `offerMax` | Read from S6: `{ dangerous: 30, deadly: 100 }` | RULED bands (2026-11-21, 50-5 and the page) |
| `minHours` | 1 | JUDGMENT. One hunted hour is the least a Safe reading means anything. A data row |
| `gearState` | `weakest` | JUDGMENT, on the wipe reading above |
| The generated rows | ground, tier, gear state (`low`, `mid`, `best`), party size 4 and 1, Level point, deaths in 1,000 hunted hours, hero-hours played | FB-3's replay. UNKNOWN today |

**One ask of FB-3.** The pre-fix runs played each ground at its floor and its top. For the five open grounds under Level 32, play one more point at the middle of the band, at all three gear states. Without it rule 5 reads the floor for half the band and the first offer comes late. That is 5 grounds by 2 tiers by 3 states.

**The words. FB-7 owns the line.**

| Where | When | Words |
|---|---|---|
| The tier's risk line | No death in the row | "Parties in gear like yours did not die here in testing." |
| | A rate | "Parties in gear like yours lost a hero about once every {N} hours here." N is 1,000 over the row, rounded to 5, 10, 25, 50 or 100 |
| | Over 1,000 | "Parties in gear like yours were wiped out here." |
| | The party reads `low` | Add "Wear this Level's gear to lower the risk." |
| | Under the low kit | Add "Your gear is below what this was tested with." |
| | The weakest hero decides | Add "Read for {Name}, your weakest hero." |
| | Not played | "Not tested yet." |
| The offer, on the end card and the return card | Rule 2 passes | "That hunt was Safe. Your party can try {Tier} here." Press "Try {Tier}" |
| The confirm, when a tier is picked that is not offered | Always | "{Tier} is risky for your party here." Then the risk line. Presses "Enter" and "Back" |

The formula is public (RULED 2026-11-08), so the Book shows the row's number and the hours behind it.

**What this does to a new party.** UNKNOWN until the replay, and the rule does not need to know. On the pre-fix numbers a new four would be offered Dangerous on the Thicket first, where the mid row read no death, and only once its heroes wear full Bronze. It would not be offered Wickstead at Level 8.

### 1.5 The weapon cards' tags. A stub

| Row | Filled by | From | Until then |
|---|---|---|---|
| `tag` for each of the six STARTER_SETS rows: "Good alone" or "Best in a party. Slow alone." | FB-5, last | Check C1 on the fixed engine: Level 5 in 15 to 20 minutes, no death, net gold at or over zero | Sword and shield and Staff carry "Best in a party. Slow alone." (the tank's slow lone pace is RULED 2026-11-19). The other four cards carry no tag. The Club keeps its "Good first hero" mark |

A way that fails C1 on time gets "Slow alone". A way that fails on gold gets a cost line (section 1.2), never a worse tag.

### 1.6 The walk-through against real data

For each step: what the player holds from the steps before it and the real kit, and the proof the step is doable. Checked on this branch today. "New" means FB-5 or FB-6 builds it.

| # | Minute | Step | Holds before it | Checked in | Doable |
|---|---|---|---|---|---|
| 1 | 0:00 | Create the first hero, pick a way | Nothing | `start-kit.js` STARTER_SETS: tank, dual_axes, club, mage, ranger, healer. Every practice item is in `items.js` at `reqLv` 1 | Yes. The pick is new |
| 2 | 0:01 | Land in town. The coach rings Hunts | 500 gold, 8 Turnip Seeds, 10 Raw Shrimp, 20 Cooked Shrimp, 50 Bronze Arrows, 10 Coarse Whetstones, the practice set (`start-kit.js` START_CURRENCY, START_INVENTORY) | `shell-windows.js`: `hunts` is a top bar window. The ring is a screen control (section 1.3) | Yes |
| 3 | 0:02 | Open Hunts, press the Mill Cellar, Enter | 8 hours of stamina | `hunts.js` mill_cellar band 1 to 8. `hunt-tiers.js`: Normal only. `hunt-sessions.js` free bar 8 h | Yes. PLAYED: hunting inside two minutes |
| 4 | 0:02 | Tamsin's Giant Rats task is taken | Nothing needed | `tally-tasks.js` cellar_giant_rats: 25 Giant Rats, 25 gold. Giant Rat is Level 2 in `monsters.js` | New (GR-78) |
| 5 | 0:03 | Open one bar slot, change one number | The picked weapon | `abilities.js`: every discipline has a move with `unlock` 0. `start-kit.js` START_BAR slot 1 eats under 60% | Yes. A rune way pays 1 gold a cast from the 500 |
| 6 | 0:10 | 25 rats, Leave, wear the piece | 25 kills (PLAYED at about minute 10, Level 4) | `tally-tasks.js` TALLY_RULES slotOrder starts at helmet. Bronze Helm is `reqLv` 1 | Yes |
| 7 | 0:10 | Keep my party blessed | Level 4 | `blessings.js` freeUntilLevel 30 | Yes. The standing choice is new |
| 8 | 0:17 | Level 5, the Cellar ends | Level 5 (PLAYED at minute 17, with an XP weekend) | `hunt-grounds.js` mill_cellar endsAtLevel 5, groupFit both | Yes. The words are new |
| 9 | 0:17 | Build the party: three heroes, pre-filled | One hero | Four free slots are RULED 2026-11-21. `hunt-roles.js`: sword with shield is the tank, staff the healer, bow the ranger | New |
| 10 | 0:20 | One Start: three lone Cellar hunts, the first hero to the Thicket | Three Level 1 heroes with 20 Cooked Shrimp each. One Level 5 hero | Thicket band 5 to 15. `tally-tasks.js` thicket_gray_wolves: 200 Gray Wolves, 480 gold. Gray Wolf 8, Gray Wolf Pup 5 | The hunts yes. One Start is new |
| 11 | 0:36 | The recruits reach Level 5. Gather and go | Four heroes at Level 5 to 6 | `millrace_sewer` band 5 to 25, groupFit both | Yes. The party with no invite is new |
| 12 | 0:37 | Enter the Sewer on Normal. The leader is the shield | The pre-filled party | `hunt-roles.js` ROLE_ORDER puts the tank first (section 2.2). Drain Rat 10, Sump Slime 10, Sewer Kobold 13, Culvert Bat 15, Cistern Spider 20. `hunt-grounds.js` line 209: the Rat King's room, forParty 2, Rat King 25 | Yes. PLAYED: no death in about 9 hours. MEASURED before the fix (check C3): no death in 64 hero-hours. FB-3 replays C3 |
| 13 | 0:38 | Wear upgrades before and after | A helm each | `upgrade-plan.js`: strictly better over the whole worn set | Standing line is new (section 2.1) |
| 14 | 0:50 | The rest plan card | 10 Raw Shrimp | `gathering.js`: Shrimp Spot, Copper Rock and Normal Tree all `req` 1. `recipes.js` cook_shrimp `req` 1 | New (section 3) |
| 15 | 0:55 | "It is safe to close the game" | Four heroes hunting | `hunt-sessions.js`: about 7 of the 8 hours left | New. One line |
| 16 | First return | Build the Hearthside Homestead | Over 400 gold. Ore and logs from the rest plan | `shops.js` property.homestead: 400 gold, 20 Copper Ore, 30 Normal Logs | Yes |
| 17 | Later | The first harder tier is offered | A Safe hunt of an hour, and gear that reads mid | Section 1.4 | New. When is UNKNOWN until the replay |

**Where the hour still breaks on real data.** One place. Step 13: in the Sewer a new four has no body armor. Tamsin gives one piece a task in slot order, helm first. The pre-filled party survives that (step 12), so the hour holds, and the standing "Wear upgrades" line is what keeps it from repeating the PLAYED nine hours with a bare tank.

### 1.7 Evidence

| Claim | Label |
|---|---|
| The four breaks of the first hour | PLAYED, one play, one account, an XP weekend and a 12 hour bar |
| Every name, Level, cost and band in sections 1.1 and 1.6 | COMPUTED or read from `src/data` on this branch |
| The guard's two holes | COMPUTED from the rows |
| The harder-tier rows fill the holes | UNKNOWN. FB-3's replay with the middle point |
| Wickstead 142, the Sewer 41, arrival wipes | MEASURED before the fix, runs 44925664434 and 44928035806. Used only as the reason for the rule |
| The wand loses about 100 gold by Level 5 | PLAYED once. C1 replaces it |
| The first stamina end comes at about Level 10 | COMPUTED: Level 10 by 6 hunted hours (RULED 2026-11-20) and a free bar of 8 |
| The first Leave comes at Level 4 | PLAYED twice at about minute 10 (chapter 08, and `27-retention.md`) |
| The weakest hero decides | JUDGMENT, on a before-the-fix reading |
| `minHours` 1 | JUDGMENT |
| The card and Chat do not overlap at the two sizes | UNKNOWN. I read the code and did not look at the screen. The art director reads it |

### 1.8 For the integrator

- **08 section 2.1, the minute table.** 0:01: the coach rings Hunts in the top bar, and the Town menu line for Tamsin's tally is a second way in. 0:10: "Rats done. Tamsin has gear for you." 0:17: the press reads "Build your party". 0:36: "Your party is ready for the Sewer." 0:55: "Your party hunts for about..."
- **08 section 2.1, the first-move table and the kit table.** "Plain Fire, Water, Earth and Rupture Rune" become "Chalked". The data has no Plain rune.
- **08 section 2.3, the tier's own line.** It reads the gear state the party wears, by its weakest hero. Replace "deaths in 1,000 hunted hours for a mid-geared party" with the words of section 1.4.
- **08 section 2.5, the table.** Replace it with section 1.1's rows. The Level 8 row loses "the first Dangerous offer" and the helm-and-body condition. Add the event `first_harder_tier`. Move the Rat King's Hall, Honors lines and the arenas to "planned, waits". Item 6 of section 5 closes for 21 to 24 (the Houndskin Cloak at 22) and stays open for 17 to 19 and 27 to 28, owned by FB-7's rows.
- **08 section 6, the Path guard.** Add rules 2 to 5 of section 1.1.
- **13 section 2.3.** No new known red. FB-5's Path guard passes on its named list of three Levels until FB-7 lands and deletes the list. Say so in FB-5's and FB-7's test rows.
- **13 FB-3.** Add the middle-of-band point for the five grounds under Level 32.
- **13 FB-5.** "Raise your company" reads "Build your party". The pick wears the whole STARTER_SETS row. DANGER_LEVEL and DANGER_KIT are retired.
- **13 FB-7.** It owns `offerMax`, `minHours`, the gear state reader and the words of section 1.4.

---

## 2. D-2, before FB-6

### 2.1 Gear found mid-hunt

**The rule.** Gear goes on in town, by a standing choice. Nothing is worn inside a running hunt.

| # | Rule | Detail |
|---|---|---|
| 1 | **A plan line, "Wear upgrades".** Set once for the account. On for a new account | A starting plan line is edited, never built (chapter 08) |
| 2 | **When it acts.** At every Start, before the hero enters. At every hunt end, before the rest plan runs. Browser open or closed | Both are moments the hero is in town. The server does it in the same statement set as the Start or the end |
| 3 | **What it wears.** Exactly the picks `src/shell/upgrade-plan.js` makes today: strictly better over the whole worn set for the hero's way to fight. A trade-off is never worn by the line | The pick moves to `src/core` so the server makes it. FB-6 |
| 4 | **Across the four.** A piece one hero holds that is strictly better for another is passed and worn, by FB-6's equip RPC through the server's wield gate | Own heroes only. Never a guest |
| 5 | **The Setup follows.** The worn piece replaces the old one in the Setup the hero is using. No Save question | It is the same slot, upgraded |
| 6 | **It is always reported.** One line on the end card and the return card | "Brenna put on Bronze Helm and Bronze Platebody." |
| 7 | **Mid-hunt, the game changes nothing.** Upgrades found during a hunt wait for its end | |
| 8 | **A visiting player gets one press.** When a hunting party holds upgrades, the return card and the party card show it | "Equip upgrades and go back in". One intent: the party's hunt ends at its next lap as `changed`, the upgrades go on, and the same hunt starts again through the restart door |
| 9 | **Not in a boss room or the Tower.** The press waits | "After this fight" |
| 10 | **Trade-offs are a "Needs you" row**, never a silent swap | Section 2.3, kind 4 |

**Why not a safe moment inside the hunt.**

- **The reference day does not need it.** COMPUTED from the stamina day: a free hero's hunt ends at hour 8 and the visit is at hour 12. A Premium hero hunts 12 and rests 12. At every visit of the two-visit day the heroes are in town, so rule 2 has already worn everything.
- **A hunt is one kit.** The report's change line compares this hunt with the last. A kit that changes at hour 3 makes that line false.
- **FB-6 holds no engine file.** A swap inside the settle is an engine change in a batch that has no room for it (13 section 2.2).
- **The press covers the rest.** A player who checks in mid-hunt gets the gear on in one press.

**What it fixes.** PLAYED: the tank fought nine hours with no armor while a helm sat in her bag from minute 17. Rule 2 wears that helm at the Sewer's Start.

**Exploit read.** No item, gold or XP is made. Every move goes through the existing equip gate and FB-6's own-heroes RPC, journalled. A piece passed to another hero leaves the old one in a bag, where the loot plan sells it as it would any worse piece. Security reads the RPC with the rest of FB-6.

**Revisit.** If the playtest shows the mid-hunt press used more than once a visit, wearing at the lap boundary goes to the next engine batch as its own item.

### 2.2 The leader's default

| # | Rule |
|---|---|
| 1 | **The plan's leader is the hero the engine sends in front.** That is the first hero by `ROLE_ORDER` in `src/data/hunt-roles.js`: tank, then melee, ranger, mage, healer. It is the pick `pickLeader` in `src/core/hunt/roles.js` already makes for the pull. One row decides both |
| 2 | **Ties** go to the higher Level, then the lower slot |
| 3 | **It is worked out at every Start.** A hero who changes weapon changes the answer |
| 4 | **The player may pin a leader.** One control on the party card, "Change leader". A pin holds until that hero leaves the party, then rule 1 is back |
| 5 | **A guest never leads.** An on-call hero takes the settings it is given |
| 6 | **The leader's plan row holds the party's ground and tier** (RULED 2026-10-20). Editing them on any hero's row edits the leader's |
| 7 | **The words**, on the party card under the leader's name: "{Name} leads. {Name} walks in front and picks the hunt for the party." |

No new rule and no new number. PLAYED: the mage led because she was on screen. With this the pre-filled party's shield leads.

### 2.3 The order of "Needs you"

**Data.** Rows in `src/data/hunt-after.js`, FB-6's. Each line provider (13 section 1.3 point 5) supplies a kind and nothing else. The rank is the row's.

| Rank | Band | Kind | Shown when | Words | The press |
|---|---|---|---|---|---|
| 1 | Stops a hero hunting | `outgrown` | A hero's last ground ended `outgrown` | "{Name} has outgrown {ground}." | "Go to {next ground}", for the whole party |
| 2 | | `cannot_start` | Carry on would be refused for a hero: a full bag or full Storage, or the last hunt ended `gold_out`, `heals_out`, `runes_out`, `ammo_out` or on its spending budget | "{Name}'s bag is full." or "{Name} ran out of {thing}." | "Sell by loot plan", or "Change the plan" |
| 3 | Costs progress | `death` | A hero died and stands with no Blessing. Hidden when "Keep my party blessed" is on and paid | "{Name} died and lost {xp} Level XP. No Blessing is on." | "Bless" |
| 4 | | `gear_choice` | "Wear upgrades" is off and upgrades wait, or a trade-off waits | "Better gear is waiting for {n} heroes." | "Equip upgrades for all four", or "Choose" for a trade-off |
| 5 | Gains | `tier_offer` | Section 1.4 rule 2 passes | "That hunt was Safe. Your party can try {Tier} here." | "Try {Tier}" |
| 6 | | `ground_opened` | A hero reached a ground's floor since the last visit | "{Ground} is open." | "Go to {ground}" |
| 7 | | `talent_points` | Unspent points with no plan (chapter 10) | "{n} Talent points to spend." | "Spend" |
| 8 | | `can_build` | The account holds a home's whole cost | "You can build the {home}." | "Build" |

**Rules.**

1. **One row a kind for the account.** Heroes are merged into it. Never four rows of one kind.
2. **Three are shown**, by rank. If more wait, one line under them: "{n} more". It opens the list.
3. **Inside a kind**, the hero named first is the one worst off: the most hours since it could last hunt, then the larger loss.
4. **A new system takes a band, not a number.** Its provider says which of the three bands it is in and goes last in that band. A rank above an existing row is a designer call.
5. **Done by Carry on is never a row.** Chapter 08 lists "a job queue that ended with stamina full" under Needs you. That is what Carry on is for. It is one line of the night, not a decision.
6. **Never sold and never an ad.** No row offers a refill, a Crown or a boost.

### 2.4 Walk-through and evidence

| Step | Holds | Checked | Doable |
|---|---|---|---|
| The Sewer's Start wears Brenna's helm | A Bronze Helm in her bag from Tamsin | `upgrade-plan.js` picks it: `defB` 3 against an empty slot. `items.js` `reqLv` 1 | Yes, once the line is built |
| The party forms and the shield leads | Sword and shield, staff, bow, wand or club | `hunt-roles.js`: `tank` is first in ROLE_ORDER | Yes |
| The 8 hour return shows gear | Bronze Helm, Bronze Platebody and 1 more in a bag (PLAYED) | With the line on, they were worn at the hunt's end. With it off, kind 4 shows | Yes |
| A hunt ends `outgrown` | A Level 5 hero in the Cellar | `hunt-sessions.js` END_ORDER holds `outgrown`, `gold_out`, `heals_out`, `runes_out`, `ammo_out`, `changed` | Yes. Every end reason named above is a real row |

| Claim | Label |
|---|---|
| Heroes are in town at every visit of the two-visit day | COMPUTED from the ruled stamina day |
| The engine picks the front hero by ROLE_ORDER | Read from `src/core/hunt/pull-cycle.js` and `roles.js` |
| On by default is right for "Wear upgrades" | JUDGMENT. The playtest reads how often a player turns it off |
| Three rows are enough | JUDGMENT. Chapter 08's target. The playtest counts how often "{n} more" shows |
| The pick can run on the server | UNKNOWN. `upgrade-plan.js` is pure and has no DOM, so it should. FB-6 confirms |

### 2.5 For the integrator

- **08 section 2.2.** Add the plan line "Wear upgrades" beside "Keep my company blessed". The leader row: the default is the engine's front hero by ROLE_ORDER, and the player may pin one.
- **08 section 2.4.** Replace the "What can appear in Needs you" paragraph with section 2.3. Remove "a job queue that ended with stamina full" from it.
- **08 section 2.1, 0:38 to 0:55.** "Gear drops and 'Equip upgrades for all four' is one press" becomes "gear is worn at the hunt's end by the standing line".
- **`review/02-four-hero-hour.md` section 4**, "Three things the design does not yet cover": items 1 and 2 are ruled here.
- **13 FB-6.** Its test "a tank with no armor at the end card is dressed by one press" becomes "is dressed at the next Start with no press", viewed and closed. Add the mid-hunt press, and the pick moved to `src/core`.

---

## 3. D-11, before FB-6 and FB-10

### 3.1 The rule

**A rest plan is a queue and then an ending. It starts no hunt. It never loops.**

| Part | Rule |
|---|---|
| **The queue** | Up to three steps, each a job with a count, run in order (chapter 08, GR-80). A bench step may run until its inputs are gone |
| **The ending** | One of three, chosen once for each hero and kept: a **standing job**, **Train**, or **Wait in town** |
| **The standing job** | One job with no count. In the first build it is "Gather the best I can": the highest node of one gathering skill that the hero's skill level opens. The player picks the skill. A new hero's is the trade its starting rest plan gave it |
| **Train** | Paid yard time by the hour (RULED 2026-11-15). Never a default, because it spends gold. Open from Level 10 (`training.js`) |
| **The usual ending** | The standing job. It is what a new account gets and what "Reset the plan" gives |
| **When the ending stops** | At the hero's next Start. When its bag is full. When the purse cannot pay the next hour of Train. Or `standingMaxHours` after the hunt ended, whichever is first. Then the hero waits in town |
| **`standingMaxHours`** | 24. A data row in `hunt-after.js`. It covers both rests of the 12 hour day and one missed visit. An account away a week comes back to one day of work, not seven |
| **It starts no hunt** | Nothing in a rest plan can enter a hunt. A hunt starts on a press in a session (CLAUDE.md section 1, RULED 2026-10-18 and 2026-11-20) |
| **It never loops** | The queue runs once. The ending runs once. When the ending stops the plan is over until the next hunt ends |
| **If it cannot run** | No node the hero can work, or no gold for the yard: the hero falls to "Gather the best I can" in its starting trade, and the return card says so once (chapter 11 section 3.3) |
| **Both paths** | The plan runs when a hunt ends for any reason, browser open or closed |
| **What waits** | The week's castle labor and "Fuel the Hearth" as standing jobs. They come with the castle and the Hearth merge |

**Data.** FB-6 owns `src/data/hunt-after.js`.

| Row | Value |
|---|---|
| `REST_ENDINGS` | `standing`, `train`, `wait`. Each a row with `runs`, as AFTER_CHOICES is today |
| `REST_ENDING_DEFAULT` | `standing` |
| `standingMaxHours` | 24 |
| `JOB_NEXTS` | The `hunt` row is removed. `wait` stays. FB-10 may drop the table if the queue makes it redundant |
| `validateAfter` | Keeps "the default may not cost gold" and "a choice waits in town". Adds "no ending runs a hunt" |

**The words.**

| Where | Words |
|---|---|
| The rest plan card, the ending | "When the list is done" with three choices: "Keep gathering", "Train at the yard" and "Wait in town" |
| Under "Keep gathering" | "{Name} gathers {skill} until the next hunt. It stops by itself after 24 hours." |
| Under "Train at the yard" | "{Name} trains {skill}. It costs {fee} gold an hour and stops when the gold runs out." |
| The return card, when the cap ended it | "{Name} worked for 24 hours and then waited in town." |
| The return card, when the bag ended it | "{Name}'s bag filled up after {hours} hours of work." |

### 3.2 Why

RULED 2026-11-21: a hero works in town for all 12 rested hours, and every town system is sized for that. A plan of counted steps cannot do it.

COMPUTED from `gathering.js` and the starting rest plan of chapter 08:

| Starting step | Actions | Time an action | The step takes |
|---|---|---|---|
| Fish 100 at the Shrimp Spot | 100 | 3.5 s | 5 min 50 s |
| Mine 20 Copper Ore | 20 | 3.0 s | 1 min |
| Chop 30 Normal Logs | 30 | 3.0 s | 1 min 30 s |

A free hero rests 4 hours and then 8. With "wait in town" as the ending, the miner works one minute of the first four hours and stands still for the other 239. That is 99.6% idle against a ruling that says zero. Counts large enough to fill the rest are the same job with a number the player must guess and retype as the skill grows, which is a decision repeated by hand.

### 3.3 What it reverses, plainly

| Row | What Tyler approved | What this rules | Veto |
|---|---|---|---|
| **27** | 2026-11-20, plan row L08 and call 27-1: every job takes a count and a "then". A plan's list ends in "wait in town" or "hunt again, once" | The usual ending is a job with no count. "Wait in town" is a choice, not the default. A gathering job in the queue still always takes a count | "Veto 27". The ending goes back to "wait in town" and FB-6 drops `standing` from the rows |
| **27b** | The same row: a counted job may end in "hunt again, once", started by the server with the browser closed | The first build's rest plan has no ending that starts a hunt | "Veto 27b". The `hunt` row of JOB_NEXTS comes back and FB-10 keeps a way to start it |

**Why 27b.** I did not go looking for it. Staged 1026 cannot be given a fate without it, because its sweep exists only to start that hunt.

COMPUTED from the ruled stamina day (stamina drains one for one hunting and rests one for one at every other instant, free bar 8 hours):

| Hour | A free hero with "hunt again, once" |
|---|---|
| 0 | One visit. Carry on |
| 0 to 8 | Hunts 8 hours. Stamina 0 |
| 8 to 12 | A counted job sized to 4 hours. Stamina 4 |
| 12 to 16 | The server starts the hunt again. 4 more hours |
| 16 to 24 | Rests. Stamina 8 |
| 24 | The next visit. 12 hunted hours on one visit |

"Two visits a day is the free game" was RULED 2026-11-21 (50-12). One visit for 12 hours is what the Premium bar gives (RULED 2026-10-17). So "hunt again, once" hands every free player Premium's one felt benefit for the price of picking a count. Call 27-1's own words were "No hunt ever starts by itself", and GR-81 already refuses a hunt started for an outgrown ground on that ground. The ending that starts a hunt is the exception to both, and it breaks a third ruling. It goes.

What 27b costs: the PLAYED case it was built for, a lone hero sent to mine 20 ore who never came back. That case is now closed three other ways. Counts end the job. The account has four heroes, so one gathering does not stop the hunting. And the return card's Carry on sends every hero back in one press.

### 3.4 What staged 1026 becomes

`supabase/migrations/1026-job-counts.sql`, staged and never applied. FB-10 owns the file. **Ruling: re-cut. The counts stay, the sweep goes.**

| Part of 1026 | Under this ruling |
|---|---|
| `hr_job_next_sweep`, `hr_job_next_start`, the cron job `hr-job-next` every minute | **Withdrawn.** Their only work is starting a hunt after a job. No rest plan starts a hunt, so nothing is left for a sweep to do |
| The ledger kind for a THEN (`job_then`) | Withdrawn with it |
| `active_next`, `errand_next` and their CHECK of `wait` or `hunt` | The `hunt` value is withdrawn. FB-10 keeps the columns only if the queue needs a pointer to the next step. Otherwise they go |
| "A gathering job must carry a count" (the edge refuses one without) | **Kept, with one exception.** A queue step always takes a count. The standing job is the one job with none, and it carries `standingMaxHours` in its place. The 6,001 ore case stays closed, because nothing without an end can be started |
| `active_count`, `active_left` on a gathering job, the `job_end` facts the card reads, the errand that keeps and gives back a count, "a gathering job resumes after a hunt only with a count left", the `bench_run` section's `left`, `count`, `ended` | **Kept as the contract.** `job_end.next` and `next_state` lose their hunt values |
| The four splices in `hr_apply` that count a job down an action at a time | **FB-10's call.** In closed form a counted step's end is its start plus count times the action's time, and the standing job's end is its start plus the cap. Both are known at the start. The design needs the count and the end, not the countdown |
| `tests/job-counts.mjs` | Loses its hunt arms. Gains, viewed and closed: the standing job starts no hunt, stops at the cap, stops at a Start, stops at a full bag, and a plan never runs twice |

**The server shape this allows.** JUDGMENT, for FB-10 to confirm. Every end in a rest plan is an instant the server can compute when the hunt ends: each step's count times its action time, then the ending's cap. So the plan needs no sweep at all. The next settle or the next read lays the steps out by arithmetic and pays each at its three points. That is the closed-form shape FB-10 exists to build, and it removes a statement a minute for every account from the budget of 15 cents (RULED 2026-11-21).

Whether FB-10 edits 1026 in place or withdraws it and carries the kept parts in its closed-form file is FB-10's. It was never applied, so either is open.

### 3.5 Walk-through

| Step | Holds | Checked | Doable |
|---|---|---|---|
| A hunt ends on stamina, browser closed | A rest plan | `hunt-sessions.js` END_ORDER `stamina`. RESUME_AFTER_END runs the plan on every automatic end | Yes |
| The miner mines 20 Copper Ore | Mining 1 | `gathering.js` copper_rock `req` 1, 3.0 s, 1 ore an action | Yes. One minute |
| The queue is done. The standing job starts: "Gather the best I can", Mining | Mining 1 or more | `gathering.js` ROCKS, each with `req`. The best node is the highest `req` at or under the hero's level | New. The reader is a few lines over real rows |
| Four hours pass. The player presses Carry on | Stamina 4 | A Start stops the job and pays it to that instant (chapter 11 section 3.5) | Yes |
| The player is away two days | Nothing | The cap ends the job at hour 24. The hero waits. No hunt starts | New |
| The player picks "Train at the yard" at Level 6 | Level 6 | `training.js` minLevel 10 | Refused with the Level, and the choice is not listed under Level 10 |

### 3.6 Evidence and what is unknown

| Claim | Label |
|---|---|
| A starting step takes 1 to 6 minutes | COMPUTED from `gathering.js` |
| "Hunt again, once" makes a one-visit free day | COMPUTED from the ruled stamina rules. Not played |
| The plan needs no sweep in closed form | JUDGMENT. FB-10 confirms on the town-hour fixture |
| 24 hours is the right cap | JUDGMENT. A data row. The playtest reads how often a hero hits it |
| **What a hero gathers in 12 rested hours** | **UNKNOWN, and the largest risk here.** COMPUTED at today's rate: 14,400 actions a hero a day at 3 seconds each. PLAYED before: 6,001 Copper Ore in 8 hours. The bag stops it sooner, and I did not measure where. Sizing town work for 12 rested hours is band T7 and FB-10's town-hour fixture, and FB-9's prices read it. This ruling makes that sizing urgent. It does not do it |
| Whether a full bag is the right stop, or work should fill Storage | UNKNOWN. FB-10 and FB-9, with the fixture |

### 3.7 For the integrator

- **00 section 5.3, row 27.** Replace the last two cells: "RULED by the designer 2026-11-21 (`review/05-designer-rulings.md` section 3). The standing job stops by itself after 24 hours. For Tyler's veto."
- **00 section 5.3, new row 27b.** "A rest plan has no ending that starts a hunt. Reverses 'hunt again, once' of the plan approved 2026-11-20 (L08, 27-1). Reason: it gives a free player the 12 hour day on one visit. For Tyler's veto."
- **08 section 2.2, the job queue rows.** "The list ends in 'wait in town' or 'hunt again, once'" becomes "The list ends in a standing job, Train, or wait in town. Nothing in it starts a hunt." The standing job row loses "PROVISIONAL" for its place as the usual ending and gains the 24 hour cap.
- **08 section 2.9, the last row.** "A loop that restarts hunts" stays NEVER. Add "an ending that starts a hunt once" beside it, with row 27b.
- **11 sections 3.2, 3.3 and 3.6.** "Until the hero next hunts" becomes "until the hero next hunts, its bag fills, or 24 hours pass". In the first build the standing job's choices are Gather the best I can, Train and Wait in town. Labor and Fuel the Hearth wait.
- **13 section 1.3, the staged table.** 1026: "Re-cut by FB-10. Counts kept, the sweep and the hunt THEN withdrawn (D-11)."
- **13 section 3.5, the playtest row.** "Staged 1026: job counts and a sweep that starts jobs every minute" loses the sweep.
- **13 FB-10 and FB-6.** FB-6 owns the rows of `hunt-after.js` in section 3.1. FB-10 owns the server half and 1026.

---

## 4. What I did not check

- I did not open the game. Section 1.3 is read from `shell-windows.js`, `launcher.js`, `start-open.js` and `stations.js`. The art director's read of the two screen sizes is the check.
- No number here was run. Every measured figure is quoted from a run made before the fix and used only as a reason.
- I did not read the 626 lines of 1026 past its header and contract. Section 3.4 rules on what its own header says it does.
- I did not check that `upgrade-plan.js` imports nothing the server cannot load.
- Whether a full bag stops a gathering job today is taken from 1026's header, not from the engine.
- The Path's rows for chapter 03's systems (Tempering, Hallmarks, linings) are not ruled here. They get rows when FB-8 lands them.
