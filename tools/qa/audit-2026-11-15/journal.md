# Full-game playthrough audit — journal (started 2026-11-15)

Brief: Tyler 2026-11-14, a full-game playthrough from Level 1 to the last hunt; run by the QA/design auditor session on 2026-11-15.
Method: `tools/qa/local-world.mjs` (real play.html + real hr-accrue engine on the replayed chain, fresh account from the sign-in screen,
time skip only by `wait`/`skip`), wrapped by a scratch side-port for READ-ONLY SQL so every screen number is checked against the server row.
Short real-time checks on live with the signed-in QA account (no time skip, no SQL). Findings: `findings.md` (same folder).

Resume: start the world (`node <scratch>/audit-world.mjs`, serve :8787 + side :8788), sign in as the account named in the last entry
(email `<name>@local-world.test`, the tool's throwaway password). The local world is in memory: a restart loses the heroes, so each
entry records the state needed to re-reach it with `wait`.

## Ground ladder (data, v0.2.132 = origin/main e11afdb10)
Mill Cellar 1-8 · Meadowbrook Thicket 5-15 · Wickstead 8-18 · the Sewer 8-25 (party, Rat King call) · Mosslight Glade 16-31 ·
Coppercap Warrens 32-50 (party, call) · Hask's Ford 45-60 · the Slake 50-65 · the Muster Barrows 55-75 · the Pyre Field 70-90 ·
Krell's Hold 85-110 (+ Krell's hall). Training yards (4 skills) and house dummies.

## Entries

### Day 1, sitting 1 (local world, origin/main e11afdb10, v0.2.132; 1280x720, headless Chrome via a scratch Playwright driver)
- Account `auditor`, hero **Corwen** (sword and shield, the default kit). Sign-up -> "Check your email" -> sign in -> 1 hero slot ("A second hero slot costs 300,000 gold ... about a week").
- Create screen: name + 4 colour rows + "How you fight" (no class pick, every weapon owned, the one in hand sets the style). Clear.
- Town, first tips: "Tamsin's rats" (take the Giant Rats task) BEFORE "Rats in the mill" (open Hunts, enter the Mill Cellar). Took the task (25 Giant Rats -> 25 gp + Bronze Helm).
- Hunts window: 11 grounds listed Cellar..Krell's Hold, each "In your range / Above / Far above". Cellar card names food (20 own Cooked Shrimp, then store Salted 14 gp), drink (store Thin Turnip Juice 10 gp), stamina 12 h, gold 500.
- Entered the Cellar. 2:07 -> Level 2, 17 kills, 349 XP. Coach "Plant your land" (Farm: 2 plots, 8 Turnip Seeds, "Plant 2 empty plots", Water = twice as fast for 2 h). Then bar explainer, tally explainer.
- ~6 min: 25 rats. Coach: "That's 25 rats. Leave the hunt and she pays you in town."
- Leave: "Leaving in 18s" countdown every time (finishes the fight under way; designed). Summary: Equip 1 better piece (Bronze Helm), Bless I-III free -> both one press, server rows match. Tamsin paid 25 gp + Bronze Helm.
- Hearth: Bones -> Fuel all 8 -> Inner Flame 124 XP. Coach "Back down for Level 5": entered the Cellar, CLOSED the page, `wait 15 --away`.
  Return card: "While you were away (15 min) ... Level 3 to 5, +2,134 Level XP, +102 gold, 102 kills. Still hunting". **Level 5 at 22 hunted min.** Cellar 9.3k XP/h, +1.6k gp/h.
- "Sell what only pays coin" -> Shop Sell -> Sell all junk 92 gp (Venom Sac + Rat Tail); server 692 -> 784.
- Tally: weight picker (Heavy/Medium/Light + slot order), "She skips a slot you already wear at that tier or better" (11-11 #3 landed). Took 200 Gray Wolves.
- Thicket Normal: coach "A spell costs runes" -> slot 6 -> Spells -> Flame Strike -> Plain Fire Rune -> Save (11-11 #5 landed: "then Spells"; "Waits for Power Strike (slot 2) when both are ready").
  **Thicket watched hour: 24.0k XP/h, 3.36k gp/h gross, 715 gp/h supplies (299 runes, 45 juice), balance 2.64k/h, 7 own shrimp eaten.** Level 5 -> 7 in 1 h; 200 wolves done in ~1.8 h; Level 8 at 2 h.
- Coach chain at the Thicket: drink explainer, then "set slot 3 to 55% (4 HP wasted)", then "now Salted eats before your own between 55-60%, set slot 4 to 55%", then "Hunt until your 200 Gray Wolves are down" (already 200/200).
- Cooking: Cook Wolf Meat now at Cooking 1 (11-11 #4 landed). 249 meat -> 204 cooked + 45 burnt in ~16 min, Cooking 1 -> ~16 (2,942 XP); bench tax 448 gp = the exact purse gap.
- Mining Copper Rock started as a town job, Turncoats taken, Wickstead Normal entered, page closed, `wait 720 --away` (16 s real).
  Return: "While you were away (12 h 0 min), Corwen hunted Wickstead: Level 8 to 12, +361,678 Level XP, +24,554 gold, 4,955 kills. Your best find this hunt was the Wolfbone Necklace. The hunt has ended 2 h 1 min ago. Out of stamina, so Corwen came home. Then Corwen went back to mining the Copper Rock." (11-11 #2 and #6 landed.)
  **Wickstead 10 h: 31.8k XP/h, balance 3.6k gp/h, 2,706 runes + 323 juice, 0 food eaten (216 carried).** Mining 2 h -> 12,497 XP. Server purse 22,359 = 2,961 + 24,554 - 2,706 - 3,230 + 780 (Tamsin) exactly.
  Bag: 16 Iron Platebody, 14 Bramble Blade, 5 Iron Platelegs, 11 Studded body, 11 Adept top ... all reqLv 15, so no Equip offer at 12 (correct).
- Loot plan: This hunt tab = one select per item (Keep/Deposit/Sell/Don't pick up); set 15 to Sell; Dispatch loot "Sold 15 stacks for 6,401 gp", server 22,359 -> 28,760.
- Town windows: Storage (100 stacks, chests in the House), House (Homestead 400 gp + 20 Copper Ore + 30 Normal Log; dummy 150,000 g after the Homestead), Training Yard (200 g/h, skill XP only, 12 h max), Weighhouse "isn't trading right now" (chain ships it OFF: `2027-02-14-market-on.sql` is excluded from the replay order; check live).
- Glade Dangerous at Level 12 (4 under), "Enter anyway": **dead in 62 s**, 6 kills, "Killed by Walking Vine". Death card: "Dying cost 6,258 Level XP ... Your 3 Blessings saved you 18,774 Level XP" (6,258 + 18,774 = 25,032 = 6% of the Level XP held; server level_xp fell by exactly 6,258). Back in town, back to mining. Shop > Services has **Bless all** (11-11 #10 landed), one press, 3 rows.
- Stamina refill: "+4 h for 4,000 gp" at L12, double press bought one; next 4,534 (price = (1,000 + 250 x Level) x escalation; 5,384 at L15). Wickstead nets ~3.6k/h, so a refill always pays for itself.
- Wickstead 6 h more (page closed): Level 12 -> 15, 33.4k XP/h, +3.9k gp/h. "Equip 6 better pieces" put on the **Bramble Blade** (11-11 #1 landed), Iron Platebody/Platelegs/Belt, Wolfbone Necklace, Fang Studs. Mining accrual is credited lazily on the next read (13,046 -> 24,717): not a bug.
- Smithing: 1,514 Bronze Bars from 3,026 Copper Ore in ~1.8 h, Smithing 1 -> 28, bench tax 1,135 gp. Smithing makes hatchets, warhammer, Ironbound Shield, tools, whetstones, salts; **no sword** (swords drop).
- Woodcutting Normal Tree 12 h: 12,560 Normal Logs, Woodcutting 1 -> 46. Oak 12 h: +6,758 Oak Log, 46 -> 52. Gathering levels come very fast in bulk.
- House: Hearthside Homestead bought (400 gp + 20 Copper Ore + 30 Normal Log), Millrace Crate built (+20 stacks). Next: Farmstead (2,500 gp, 40 Oak Log, 4 Wolf Pelt, 25 Copper Ore, 10 Cooked Shrimp), Kitchen (40,000 gp + 60 Iron Bar + 60 Oak Plank + 50 Cooked Trout), Garden (600 gp + 20 Wheat).
- Glade Normal from 15: watched 30 min = 79.7k XP/h, +7.3k gp/h, 29 meals (food finally matters). 8 h: 15 -> 17. 12 h: 17 -> 24 (74.4k XP/h, +8.8k gp/h, 19 Iron Platebody). 12 h: 24 -> 28 (77.2k XP/h, +9.4k gp/h).
- **Hunted ~59 h by Level 28.** Practice Shield still worn at 28 (Equip upgrades never offers the shop's Bronze-Rimmed +3 or Smithing's Ironbound +5).
- Crafting: Normal Plank x11,250 in 12 h, Crafting 1 -> 41 (one recipe, no choices). Iron Rock 12 h: +6,000 Iron Ore, Mining 35 -> 51.
- Glade to 31 (12 h: 79.7k XP/h, +9.9k gp/h; summary: "Wear Steel Helm (+5 Defense). Your full set's +2% critical chance ends." — set bonuses are named, good).
- Hero slot 2 bought at Level 31 with 321,736 gp (about 83 hunted h, ~7 days at 12 h/day: "about a week" holds). **Ilsa** (staff): bar auto-fills a healer setup (Greater Mend, Circle of Renewal, Green Sickness, Undertow, Spring Tide).
- Party of own heroes: Ilsa invites Corwen by name, he joins at once. L1 Ilsa + L31 Corwen at the Glade: "You earn 1% of a full share of Level XP here, so far under Level 31" (no carry, good). Ilsa leaving sent Corwen home ("Ilsa left the hunt, so Corwen came home too.", end_reason party_member_left). **F7 (P1) found here.**
- Solo healer, Mill Cellar 1 h: Level 1 -> 5, 8.5k XP/h, 0 deaths (the 10-18 solo-healer rule holds). Loot plan is per hero, no copy (F11).
- Corwen solo Warrens 31 -> 36 in 11.5 h: 139k XP/h before bonuses, but only +4.7k gp/h: 2,710 store Salted Shrimp eaten (37,940 gp). Ilsa Thicket 6 -> 10 (17.3k XP/h as healer vs 21k as tank).
- Days (12 h hunt + 12 h rest each): Corwen Warrens 36 -> 39 -> 42 -> 45; Ilsa Wickstead 10 -> 15, Glade 15 -> 23 -> 27.
- **Hask's Ford at 45** (watched 2 min + 1 h): 191k XP/h, +10.7k gp/h, 35 store meals an hour, Mithril/Snakeskin/Warlock drops. Better than the Warrens alone on both XP and gold. Lore line reads as a story ("Captain Hask sold this river crossing to Lord Krell..."). Ford 45 -> 47.75 -> 49.99 in two days.
- **Purse 1,010,859 gp at Level 50** (~150 hunted hero-hours, 2 heroes). Bought slot 3 (750,000): **Maren** (wand), mage bar auto-filled.
- Party Corwen (49) + Ilsa (34) at the Warrens 12 h: 2,472,387 Level XP each (206k/h with bonuses; Corwen alone there was 160k/h), +8.1k gp/h each, no food bought (healer). Corwen 49 -> 52, Ilsa 34 -> 38. Maren solo Cellar 1 -> 9 (9.2k XP/h).
- Live check attempt (as asked, a few times a day): the built-in pane is signed OUT on https://hearthrise.net (no password typing on production) and Claude in Chrome isn't connected. Live serves v0.2.132 (build-info). Blocked; retry later.
- Rest day used for untested skills: Maren Fishing (Shrimp Spot 12 h: 7,714 shrimp, 1 -> 38); Ilsa Mining Rune Essence (9,000, 1 -> 46); Runecrafting needs essence -> blanks -> Chalked runes (6 blanks -> 45 runes), "for your own use"; Corwen Hearth: Fuel all 11,574 Bones -> Inner Flame +180k XP (to 26; Grave Dust needs 46, Bone Chips 40).
- **The Slake at 52**: 214k XP/h, +12.7k gp/h on Plain runes (Flame Strike 18% of damage). Switched to Carved Fire Rune (16 gp, Configure action lists every tier with its damage): about +18% XP (~253k/h) for -28% gold (~9.2k/h). A real trade, but nothing on screen ever suggested it after the Thicket coach. Slake 52 -> 54 -> 56.
- **The Muster Barrows at 56, alone, Normal, "In your range"**: died in 8 min (Barrow Knight), twice (F14). Weapon was still the L15 Bramble Blade (F15, P1, sent). Food Salted Shrimp 72 HP on 850 HP. Shark: held, -59k gp/h; Lobster: -21k gp/h. With Ilsa (healer, 44, "they could die" warning): 300k XP/h, +3.3k gp/h. (A Blessing miss on the first death was a harness artefact: local-world's skip moves hunt clocks but not player_blessings.bought_at; hr_blessing_take reads bought_at <= settled_to.)
- Party UX: "You are already in a party with someone" while viewing Corwen meant Ilsa (F16).
- Bags past cap ("145 of 120 spaces") are by design and explained in the bag. Clearing old stacks took 187 single Sell presses (F18).
- Duo at the Barrows, days: Corwen 56 -> 58 -> 60 (Rune set offered by Equip upgrades at 60) -> 62 -> 64 -> 65.8; Ilsa 44 -> 59.9; Maren (Glade) 17 -> 37. Purse 2.13M.
- Slot 4 bought (1,500,000): **Bryn** (bow), ranger bar auto-filled. All four classes on one account.
- **The Pyre Field at 70** ("Safe at your level"): duo 420k XP/h, +17.7k gp/h; ALONE at the floor it held too, 335k XP/h, +11.3k gp/h on Salted Lobster (30 an hour). So the lone gap is 65-70 only (Barrows needs a healer). F7's false "1 min of stamina" alerts showed again (local chain predates the live server fix), three alert cards over the fight (F13 class).
- Pyre days (duo): Corwen 70.6 -> 72 -> 74 -> 75.7 -> 77.3 -> 78.8; Ilsa 65.7 -> 74.9; Maren (Ford) 45 -> 59; Bryn (Wickstead) 16 -> 29. **Purse 4,490,143 gp at Level 78** with all 4 slots bought.
- Windows toured: Character (Level 78, damage 1-42, Inner Flame 26 "+34.2%", Bestiary 41 of 55 slain, still the Practice Shield), Hunt prep (setups 0 of 3, stance, target, gold to keep, drag-to-swap bar), Leaderboards (15 boards incl. Gold Given), Havora (Hearth powders 2,000 gp x5/day, Round 5,000 x3/day, Works 1,000,000 gp project "raising the Weighhouse", 25,000 a day an account; gave 25,000, plaque 1st), Settings > Help (plain, accurate).
- Pyre days 2: Corwen 78.8 -> 80.3 -> 81.7 -> 83.2 -> 84.5 -> **85.8**; Ilsa 82.6; Maren 68.5 (died alone at the Barrows, Barrow Knight: F14 again); Bryn 41. Purse 8.19M.
- **Krell's Hold at 85** (duo, Normal): 12 h = 6,607,768 Level XP each (357k/h before bonuses, ~550k/h with), +16.6k to 20.4k gp/h, Emberforged/Dragonhide/Archmage drops, Equip upgrades took them. 8 Hall Keys each from one day.
- The hall card teaches the fight: "Every hero needs Salted Lobster or better ... Everyone: Eat under 75%, Healer: Circle of Renewal when 2 are under 80%, Healer: Greater Mend under 85%, Party: a tank and a healer". Confirm dialog names the phases, "uses up your Hall Key, win or lose", 10 minutes.
- Krell tries: (1) duo, Lobster, every card change: time ran out at 17% ("after he got enraged ... Your Challenge fired 1 time"), -22.9k gp; (2) duo + Offensive + Graven Fire Rune: Corwen died to Krell (Blessings applied: 1.5%); (3) duo + Salted Shark both: time ran out at 15%, -43.1k gp; (4) **trio with Maren (67, mage, 18 under, no warning in the hall flow): "You beat Lord Krell." in 7:54**, -38.5k gp. The win paid 7,240 Level XP and 132 gp a hero (ledger), no item, no reveal (F21).
- During the fight three alert cards (two false F7 stamina lines, an away card, then "Maren died...") covered Krell; the boss bar stayed readable at the top. At 11:21 of a 10-min fight the screen still showed "Lord Krell 77%" while the server had ended it at 10:00 with him at 17% (settle lag after a skip; harness, not a live claim).
- **The last hunt reached: Corwen Level 87, ~330 hunted hours on him (12 h a day plus a few refills), 4 heroes, 8.6M gp.**
