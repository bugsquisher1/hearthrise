# Navigation audit, 2026-11-11 (art director, lane/d-ux-flow-audit)

**How.** The real `play.html` on `tools/qa/local-world.mjs serve` (origin/set/v0.2.121 e0b12e4cc), one headless Chromium. A new account from the sign-in screen, hero **Wren** (sword and shield). 46 minutes in the Mill Cellar, then a 4 hour Thicket run (time skip, real engine), so the mid-game rows read a Level 8 bag of 40 stacks. Desktop at 1440 x 900 (the `d-` shots), the dock checked again at 1920 x 1080 (`d1920-`), the phone at 922 x 423 with touch on (`m-`). Every shot is in `before/`. "Press" is a click or tap, "screen" is one window body's visible height (desktop 399 to 513 px, phone 271 to 331 px), measured as scrollHeight / clientHeight.

**Not covered.** A real phone (the touch was emulated in Chromium), other players (the local world has one account, so the party finder is always empty), the Weighhouse, Farm and House, and a death. The Hunts clip at open (lane/a-windows-no-clip), Tamsin's window (lane/d-tally-board-mocks) and the crafting stations (lane/d-station-ui) are recorded here only as rows on the path, not redone.

## The 12 things a player does most in hours 1 to 20

| # | Task | Path today (desktop) | Presses | Scroll | Where the next step is not visible, dead ends | Evidence |
|---|---|---|---|---|---|---|
| 1 | Start a hunt | H (or the first icon) → the ground is picked for you → Enter | 2 | Ground page 1,222 px in 399 (3 screens); phone 1,328 in 271 (5) | Enter is pinned, good. What the hunt will cost (food, drink, stamina, gold, Blessings) is two screens under Enter. The list's last ground is cut at open (a-windows-no-clip) | d-10, d-11, m-02, m-03 |
| 2 | Come back, read the summary | Leave hunt → 30 s "Leaving in 27s" → the summary docks at the right | 1 + 30 s | 971 in 513 (2); phone 963 in 331 (3) | The gold button is **"Next: Every weapon is a style"**, the first coach card, unrelated to the hunt, after 46 min and again after 4 h. 4,587 gp of unsold loot and 4 upgrades are not on the card. Top loot is by count | d-13, d-14, d-30, m-08 |
| 3 | Sell loot | Four routes, four rules: (a) Inventory, press a stack, Sell at the window's foot; (b) Inventory, Junk chip, "Sell all junk" appears, confirm; (c) Shop V, Sell tab, "Sell all junk" keeps 15 stacks worth 2,984 gp ("Sell those by hand"); (d) Dispatch loot, off until each item has a plan in its own dropdown | (b) 3, (c) 4 + 1 per material line (15) | Shop Sell 1,918 in 693 at 1920; This hunt 1,958 in 379 (5) | Opening the Shop closes the Inventory at 1440. The sale's question pushes the grid down to 96 px. Three gold buttons at once (Got it, Sell, Sell for 293 gp) | d-16 to d-20, d-32, d-35 |
| 4 | Deposit | T → the bag's grid is under the fold → each press moves ONE item, Shift moves the stack | 1 + 1 per stack (14 stacks: 15) | 602 in 513; phone 638 in 331, the bag is fully under the fold | Opening Storage closes the Inventory at 1440 (both fit at 1920). In the Inventory the same press **selects**; in Storage it **moves**. A paragraph explains it | d-27, d-33, d1920-01, m-06 |
| 5 | Equip an upgrade | Summary → Open bag (the summary closes) → Equip upgrades | 2 | none on desktop; phone the picked line sits at 337 to 414 of 423 | The best path in the game, but it starts from a text press on the summary and the summary is gone after it. One item: press it, then Equip at the window's foot, 300 px from the item | d-15, d-31, m-05 |
| 6 | Buy food | None. The Shop sells gear, tools and seeds only. Food is bought one at a time by the bar's slot 4 at the store price | (no path) | Shop Buy 1,819 in 513 (3.5); phone 2,288 in 331 (7) | A player who looks for food in the Shop finds none. The only words are the coach line "slot 4 buys Salted Shrimp at 14 gp" and the bar's "Food: store" | d-19, d-29, m-07 |
| 7 | Bless | V → Services (third tab) → Bless all; R opens it on Services | 3 (2 with R) | 756 in 513 | The Hunts page says "in the Shop's Services tab" as plain words, no link. Tempering also lives here | d-21, d-10 |
| 8 | Take a Tally task | Q (or tap Tamsin) → Take | 2 | 1,005 in 513 (2); phone 1,098 in 331 (3) | The six grounds she names are not links (0 links in the window) | d-22, m-09 |
| 9 | Cook | G → Cooking → Start | 3 | 849 in 513 for 5 recipes | "‹ All skills" is this window's back; Hunts' is "Back to the list", Settings' is "‹ All settings" | d-23, d-24 |
| 10 | Craft | G → Smithing (or Crafting) → Start | 3 | 3 of 17 Smithing rows in view on desktop, 0 on a phone (lane/d-station-ui) | Same as 9 | lane/d-station-ui before/ |
| 11 | Join a party | Y → Find a party → a ground and a weapon → Search | 3 to 4 | none | Party and Gathering fit side by side (440 + 380), then opening Hunts (960) closed both without a word | d-25 |
| 12 | Find a monster's facts | H → a ground → the creature's name. No icon, no key, no bestiary | 3 | Monster 968 in 513 | Opens a second window at the left. With Hunts open, the two cover the world from edge to edge at 1440. Its band has no key chip, the others do | d-26 |

## Across every window

| What | Today | Evidence |
|---|---|---|
| Windows open at once | At most 3, the dock at most 60% of the width. At 1440 two of Inventory (560), Storage (540), Character (560) and Shop (480) never fit: each new one closes the older one with no word. At 1920 two fit and the third closes the oldest. Hunts (960) closes everything at 1440 | d-19, d-33, d1920-01 |
| The way back | Three wordings and three places: "Back to the list" (Hunts, phone only), "‹ All skills" (Gathering), "‹ All settings" (Settings). No other window has one; a link out to another window (monster, Storage) has no way back | d-24, d-26 |
| A press on an item | Inventory: picks it. Storage: moves one. Shop: each row has its own Sell button instead | d-16, d-27, d-20 |
| Tabs | Inventory: Bag, This hunt, then a second row of 9 chips. Shop: Buy, Sell, Services. Party: Invites, Find a party. Analyzer: two rows (This hero, Party; Session, Training, Taken, Dealt). Each sits in the body at a different height | d-15, d-20, d-25, d-11 |
| Header | Some show the key chip (H, B, L, Y, G, T), Monster facts does not. Gathering and crafting takes two lines | d-25, d-26 |
| Gold buttons | One primary per view is the rule (ART_DIRECTION §9). The Inventory showed three (Got it, Sell, Sell for 293 gp) | d-18 |
| The icon row | 18 icons in one row with no words, the name on hover only (phone: hold). Beside it "All characters", "Characters" and "Sign out" as text | d-03, m-01 |
| The coach | The first card stays the summary's gold button and the Inventory's top line for as long as it is unread: 4 hours of play here | d-14, d-15, d-30, d-31 |
| Phone sheet | The action bar runs under the sheet (slots 8 and up hidden). The chips row is cut ("Mat") with no sign it scrolls. Storage still says "House (E)" on a phone | m-04, m-06 |

## Why it feels overwhelming: the top 5, by how often a player hits them

| Rank | Reason | Rows that prove it | Hit |
|---|---|---|---|
| 1 | **Every window is a long scroll, and the thing you came to do is at the foot or under the fold.** The Shop is 3.5 screens on desktop and 7 on a phone, the Hunts page 3 and 5, This hunt 5, Storage hides the bag, the picked item lives 300 px from the item | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12 | 11 of 12 tasks |
| 2 | **Windows replace each other without a word, and the pairs a task needs can't be open together.** Bag + Storage, Bag + Shop, Bag + Character never fit at 1440. Open bag closes the summary. Hunts closes everything | 2, 3, 4, 5, 11, 12 + "Windows open at once" | 6 of 12, every trip to town |
| 3 | **The return trip has no home.** After a hunt the summary points at a coach card; selling has four routes with four rules; deposit is one press per stack; the upgrade is a text press away. This is the loop a player does every time they come back | 2, 3, 4, 5 + "The coach" | 4 of 12, every hunt |
| 4 | **The same gesture means different things in two windows.** A press picks in the bag and moves in Storage; three ways back; tabs in four places; key chips on some heads; up to three gold buttons | 3, 4, 9, 11, 12 + "The way back", "A press on an item", "Tabs", "Header" | 5 of 12 + 4 shell rows |
| 5 | **Places are named and not linked, and some things have no door.** Food has no shop. Blessings are the Shop's third tab, named in Hunts as words. Monsters only through a hunt page. Tamsin's grounds are not links | 6, 7, 8, 12 | 4 of 12 |

The icon row (18 unlabeled icons) is the doorway to all of it, but a player learns it in an hour, so it ranks below these five; Flow A still groups it.
