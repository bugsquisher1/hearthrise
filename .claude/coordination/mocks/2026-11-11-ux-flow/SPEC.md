# Build spec: three flows (UX flow audit, 2026-11-11)

Evidence: `AUDIT.md`. Screens: `board.html` (before and after side by side), `png/` (after), `before/` (today). Each after screen is today's captured page with the flow changed. The window frame, Cinzel heads, Alegreya body, tokens and 32 px item art are untouched; the new rules are part 1 of `mock.css`, tokens only. Mock numbers are Wren's real ones (Level 8, 4 h Thicket bag) except two marked *illustrative*.

This is not a reskin. Tyler's 10-24 and 10-25 rulings hold: the problems he named ("hard to navigate", "overwhelming", "inventory management still kind of sucks") are fixed, nothing else is restyled.

## A. One way in, one way back (`png/a-shell-desk.png`, `png/a-shell-phone.png`)

**What changes**
1. **One header for every window** (`shell.js frame()`): glyph, crumbs, title, then `?`, key, close. A window that opens a page inside itself (a ground, a monster, a skill, a settings page) shows the path as crumbs: "Hunts › Meadowbrook Thicket › Gray Wolf". Every crumb is a press back. On a phone the crumbs fold to one sunk back press that names where it goes ("‹ Thicket"). This replaces "Back to the list", "‹ All skills" and "‹ All settings".
2. **Tabs live in the band under the title**, one row, same place in every window (Inventory, Shop, Party, Character, Market, Chat). Never two rows of tabs; the bag's kind chips are filters, not tabs, and sit with the search.
3. **`?` is the window's one help line**: what it is for and its keys (the Inventory's "/ search · arrows move..." line moves here off the body).
4. **A link opens a page, not a window** when the page belongs to the window you are in: a monster from a ground's page opens inside Hunts (the Monster window stays for links from elsewhere: chat, the bag's "comes from"). This kills the two-window wall in AUDIT row 12.
5. **The icon row in four groups** with a gap and a dim steel rule: going out (Hunts, Party, Hunt prep, Tally), your hero (Inventory, Character, Gathering and crafting), the town (Shop, Storage, Market, Farm, House, Havora), people (Chat, Friends, Leaderboards), then Settings. Report a problem moves into Settings (it is already off the phone row). "Characters" and "Sign out" leave the top bar for the All characters sheet and Settings, so "All characters" is the one heroes press.
6. **Nothing closes without a word.** When the dock has no room, the window being closed slides out and the icon row's lit underline moves; the new window's band says "Storage closed. T opens it again." for 3 s. (Flow B removes the commonest case.)

**What stays**: the dock, MAX_OPEN 3, the phone's one sheet, every key, Esc (closes the top window, opens Settings when none is open, the genre's habit).

**Player lines**: "Hunts", "Meadowbrook Thicket", "Gray Wolf" (crumbs); "‹ Thicket" (phone back); `?` opens: "Pick a hunt, then Enter. Your hero walks there and fights on its own. H opens this window."; replaced window: "Storage closed. T opens it again."

## B. The Inventory (`png/b-inventory-desk.png`, `png/b-inventory-storage-desk.png`, `png/b-inventory-phone.png`)

**What changes**
1. **Three columns**: the worn doll (as today), the bag grid, and a **counter** with three tabs: **Item** (the picked stack), **Storage** (the chest, today's Storage window), **Sell** (today's Shop Sell tab). Width 860 on desktop (inside the dock's 864 at 1440). T opens the Inventory on Storage; the Shop keeps Buy and Services and its Sell tab opens the Inventory on Sell. So the bag and the chest, or the bag and the shop's prices, are always on screen together: AUDIT rows 3 and 4.
2. **One gesture model, everywhere a pocket is shown** (align with lane/a-inventory-select, which owns the keys): a press **picks** one stack and shows it in the counter. Ctrl or Shift press, or Space, adds to the picks. Arrows move, Enter does the picked stack's one action, Delete sells the picks. In the Storage tab a press still picks; the counter's button moves ("Put the 3 picked away"), Shift-drag or double-press moves a whole stack. Storage no longer moves on a single press (AUDIT "A press on an item").
3. **The Item tab** is the picked stack's whole story: 64 px icon (the 32 px art at x2), name, kind and count, the numbers that matter against what is worn (+6 Defense, +10 health, the shop's price), where it comes from as a link, then **one** gold button (Wear, Eat, Put on the bar, Sell) and steel buttons for the rest (Sell 6 spare, Lock, More). The hover tooltip stays for the grid, but never over the counter.
4. **The pick bar** shows only while two or more stacks are picked, pinned to the window's foot: "3 picked · the shop pays 738 gp · Sell 3 · Put away · Lock · Clear". The sale's question opens in the counter, never pushing the grid down.
5. **Equip upgrades moves to the tab band's right end**: "4 upgrades in your bag · Equip upgrades", steel. The window has one gold button at a time (ART_DIRECTION §9).
6. **The search, the 9 chips and the sort are one row.** The keys line goes into `?`. The coach card does not sit inside the bag's body (it stays on the launcher, as today on a closed window).
7. **Phone**: Worn becomes a tab beside Bag and This hunt, so the grid takes the sheet's width (8 per row, 3 rows in view against 2 today). Search is a press in the tab band. The picked stack rises from the sheet's foot with its one gold button.

**What stays**: the pockets, rarity frames, counts, locks, new marks, the doll, every intent and its server, Dispatch loot and the loot plan (This hunt).

**Player lines**: "Body armor, heavy. 7 in the bag." / "You wear no body armor. Found in Meadowbrook Thicket." / "Wear" / "Sell 6 spare · 540 gp" / "3 picked · the shop pays 738 gp" / "0 of 100 stacks. Every hero on your account shares it." / "Press a stack to put one here. Shift puts the whole stack away." / "Put the 3 picked away" / "Put all materials away" / "4 upgrades in your bag".

## C. Back in town (`png/c-return-desk.png`, `png/c-return-phone.png`)

**What changes**
1. **The summary leads the trip home.** Under one line of numbers ("You left after 4 h 00 min · 1,552 kills · Level 5 to 8 · 76,564 XP · 6,127 gp coin"), a **Back in town** list, each row one press, each row only when it has something to do:
   - **Wear 4 better pieces** (upgrade-plan.js, today's Equip upgrades, ONE `equip`)
   - **Sell 16 stacks of junk** (bag-model.js `lootSale`, today's Sell all junk, ONE `vendor_sell_many`). *Illustrative: 16 stacks and 1,603 gp are the 4 h bag's 31 sell lines less the 15 material stacks the Shop keeps; the build reads `lootSale`.*
   - **Put 15 stacks of materials in Storage** (a new batch move, see sizes). *Illustrative: 2,984 gp is the Shop's own line for those 15 stacks.*
   - **Bless** (Services' Bless all), shown as Done when all three are on.
   A done row turns to a green "Done" and stays, so the player sees what happened.
2. **The gold button is "Hunt the Thicket again"** (today's Hunt again, same intent), "Other hunts" beside it opens Hunts. On a phone the pair is pinned to the sheet's foot.
3. **The coach never takes the summary's gold button.** A coach card that is about the return (Sell what only pays coin, Wear what you found, Before the wolves) rings its row instead. Any other card stays on the launcher.
4. **Best loot**, not Top loot: gear and rare drops first by value, then the rest (this is the designer's re-read #6; build it once here).

**What stays**: the summary window, its key L, the history list, every number's source.

**Player lines**: "Back in town" / "Wear 4 better pieces" / "Bronze Helm, Platebody, Platelegs and Boots. +15 Defense, +40 health." / "Sell 16 stacks of junk" / "1,603 gp. Your materials stay for crafting." / "Put 15 stacks of materials in Storage" / "Worth 2,984 gp. Frees 15 bag spaces." / "Blessed" / "I, II and III are on. Free until Level 30." / "Done" / "Hunt the Thicket again" / "Other hunts" / "Best loot".

## Build lanes and sizes

| Lane | What | Size | Side |
|---|---|---|---|
| 1 | Flow C: Back in town on the summary (rows from upgrade-plan, lootSale, blessings; coach rule; Best loot order; phone pinned foot) | M | client |
| 2 | Batch deposit `hr_bank_move_many` (a list of item and count, one lock, the bag fuse once): feeds C's "Put away" and B's "Put the 3 picked away" | S | server (lane C, migration + §4 self-check) |
| 3 | Flow A: one header (crumbs, tabs in the band, `?`, close), Hunts' pages as crumbs, monster as a page in Hunts, the replaced-window line | M | client (`shell.js`, `window-manager.js` pure + `tests/shell-core.mjs`) |
| 4 | Flow A: icon row groups, Report into Settings, top bar to one heroes press | S | client |
| 5 | Flow B: Inventory counter (Item, Storage, Sell tabs), pick bar, Equip upgrades in the band, one filter row, phone Worn tab and rising drawer; Storage and Shop Sell open it | L | client (inventory/*, storage.js, shop.js); after lane/a-inventory-select lands |

Order: 1 and 2 first (every hunt hits them, smallest), then 3 and 4, then 5. Nothing here touches gold, prices or drops except lane 2, which moves items inside one account.

## Questions only Tyler can answer

1. **Storage and selling inside the Inventory** (B1): one item window with a Storage tab and a Sell tab, instead of three windows that can't be open together at 1440. OK to fold them in? (The Shop keeps Buy and Services; T and V still open them.)
2. **The summary's Back in town list** (C1): should "Sell" there sell junk only (today's rule, materials kept), or everything the loot plan says Sell?
3. **The icon row**: four groups with a gap, or keep one run of 18? Report a problem moving into Settings is part of it.
4. **Inventory width**: 860 px covers more of the town than today's 560 when it's open. Worth it for the bag and the chest side by side?
