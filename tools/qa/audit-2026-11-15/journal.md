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
