# Crafting stations: fixes to today's window (mocks, 2026-11-11)
Base: every station opens Gathering and crafting on its skill (`src/shell/windows/work.js`), captured on main v0.2.118 via `tools/qa/local-world.mjs`. Boards: `stations-desktop.html`, `stations-phone.html`. New rules: `mock.css` part 1, tokens only.

**Problems, worst first.** (1) Wall of text: 3 of 17 Smithing rows in view at 1920x1080, none at 922x423; 4-6 lines a row, the fee sentence on nearly every row. (2) Can make, short and locked look alike; "Start" reads as plain text. (3) Short rows name only the first missing input, in a long sentence (Houndskin never mentions its Bear Pelt). (4) No row says what it's for or how many you have (heals 72, wear at Level 15, 12 Cooked Shrimp). (5) The running line scrolls away.

**What the mock changes.**
- Rows: two lines (name, then "Material · 11 XP each" or a red "You need 2 Iron Bar and 1 Oak Plank"), the icon in the bag's 44 px pocket with your count, a sunk "Make 7" press that says the count. Locked rows show "Smithing 20" on the right.
- Groups under the Can make sort (lane/a-station-sort's control): Can make, Missing materials, Higher level, with counts.
- Press a row to open it (the Hunts list's gold picked row): every input with "you have N" and, if short, where it drops as links; what it's for (uses as links, wear Level); time, XP, burn and fee; 1 / 5 / All and the one gold Make.
- Running: the row turns gold with "3 of 7 made" on a bar and Stop; the "Making Bronze Bar" line is pinned to the window's foot.
- Head: the title band names the skill; the 7-line intro becomes the skill's one-sentence use (hidden on phones), and the bag/Storage/fee rule is said once under the list.

**Not changed.** The frame, width, place, fonts, colors and 32 px item art; the skills list; Hallmark; the engine, intents and counts (1/5/All and their per-row defaults); the where-to-get data; gathering rows (same window, today's look until checked). No search, categories, favorites or new-recipe mark yet (search needed past ~25 rows: Smithing 60 lists 33).
