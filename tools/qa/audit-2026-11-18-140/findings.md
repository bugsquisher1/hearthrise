# Post-patch audit — v0.2.140 (main 51ca4d461), 2026-11-18

Local world only (`tools/qa/local-world.mjs`, port 8794), played blind under the 9 standing audit rules. Accounts: **opal/Oren** (fresh, desktop 1440x900, then phone 922x423 touch; Level 1 → 23), **pa/Pell** (phone) + **pb/Bram** (desktop), two fresh friends in a party at the Sewer. Catacombs skipped (switch off).
Shots (65, under 200 KB) are kept outside the repo, as asked: `side-session-notes/local_03c2e428-6ac9-4dd1-9fbf-3f3e78f08e4f/audit-140-shots/`. Only this file is committed.

**Counts:** P0 0 · P1 0 · P2 6 · P3 7. Replayed: B1, B4, B5, B6, N1, N2 fixed; B2 half (double pick gone, but no food line shows anywhere now); B3 not reproduced (the new stop text has its own problem).

## P0

**None.** Double-clicked: Take (tally), Sell all junk + its confirm, Bless again → Bless all, Buy Fang Studs (3,000 gp), Deposit all materials, Hearth Chest Use. Each one acted or charged once.

## Findings, ranked by quit risk

| id | sev | persona | what happened (screen text quoted) | repro | shot | likely file |
|---|---|---|---|---|---|---|
| C1 | P2 | friends | **A friend leaving ends your hunt.** Bram (leader, 11 h stamina) and Pell entered the Sewer together. Pell pressed Leave after 20 min; Bram was back in town: "Pell left the hunt, so Bram came home too. Start a gathering job before a hunt to resume it after". In a semi-idle game friends log off at different times, so the first to leave sends everyone home. The second sentence doesn't fit (Bram had no gathering job). Settings did survive on both (target, stance, bar), which is what 140 promised. | Two accounts, party, Enter with party at the Sewer; member taps Leave | `pb-63-party-leader-summary` | party hunt end (hr-hunt-party-sweep / party session end), end-reason copy |
| C2 | P2 | friends | **Two friends with the same weapon lose about a third of their XP.** Party window: "Classes: 1 of 4. Level XP each: about -35% vs solo in The Sewer. Mix Melee, Ranger, Mage and Healer for more". Measured: 18,792 Level XP/h each at Level 5-6 vs 32,767/h for the solo Oren at the same Level and ground (−43%). Two new friends who both take the sword and shield (the first style on the create screen) are punished for grouping. | Two fresh sword-and-shield heroes, party, Sewer 20 min; compare with a solo Sewer run | `pb-61-party-window`, `pb-62-party-sewer-card` | party XP formula (`src/core/*party*`) |
| C3 | P2 | anyone using the yard | **The away card's Gold leaves out the yard.** Day 2: "Gold +29,219 gp / 29,219 gp in coins … Then Oren went to the yard to train Melee." The purse moved +25,925; the Training window says "Paid: 3,294 gold". Day 1: card +14,568, purse +12,074 ("Paid: 2,494 gold"). Without the yard the card matches the purse exactly (Cellar +210 → 735 with the 25 gp tally; Sewer +4,619 → 5,594). | Any hunt with "Train Melee at the yard", away past stamina end; compare card, purse and Training "Paid" | `opal-23-away-wickstead-into-yard`, `opal-24-training-window`, `opal-43-away-wickstead-day2` | `src/shell/away-recap.js` (yard branch) |
| C4 | P2 | anyone away | **Hunts that end while you're away vanish from Earlier hunts.** Both Wickstead days (2,924 and 5,902 kills) and the Glade death never show in Hunt summary → Earlier hunts. The list fills up with "Training Yard … Training stopped" rows instead (5 of 7 rows on the phone). After OK on the away card there is no way to see those hunts again. The Tower run, which ended in view, is listed. | Hunt into the yard while away; return; press OK; open the summary (L) | `opal-26-yard-summary-earlier-hunts`, `opal-59-phone-summary` | hunt history projection / summary list |
| C5 | P2 | anyone past 50 | **No weak-food line anywhere.** With Salted Shrimp (72 HP) in slot 4, no ground card shows a slot line at Level 5 (in 139 the Barrows and the Hold did) or Level 16 (Glade, in range, 384 HP). Hunt prep and its "Ready to hunt?" checklist don't either; only the Hold's hall says "Requires Salted Swordfish or better on every bar". The two-picks bug (B2) is gone, but so is the warning behind the 137 Krell's Hold death. Couldn't check at 50+. | Slot 4 = Salted Shrimp; open every ground card at 5 and 16; Hunt prep → Oren: ready | `opal-17-hold-card-shrimp`, `opal-46-glade-card-l16`, `opal-48-prep-checklist` | ground food check (`src/shell/hunts-window*.js`) |
| C6 | P2 | min-maxer, melee | **The Oak Wand out-melees the Iron Sword.** Oak Wand: "Melee accuracy +7, Melee damage +8, Magic accuracy +7, Magic damage +8". Iron Sword: "Melee accuracy +7, Melee damage +6". Equip upgrades says "Weapon: pick on the doll", and the doll's list puts Oak Wand first. A sword-and-shield player is better off holding a wand. | Level 16, bag with both; Inventory → Weapon slot | `opal-45-weapon-pick-list` | `src/data/items*` weapon stats |
| C7 | P3 | new player | **The yard blocks town things with the wrong reason.** While training at the yard: Equip upgrades is off with "Leave the hunt to put these on."; the chest's Use is off with "Not available while hunting"; Deposit all materials is greyed with no reason; Dispatch loot says "works in town"; the phone's Hunts sheet says "Hunting in Training Yard. Leave to switch hunts". The yard also starts on its own after the Tower, because the last ground's "Train Melee" carries over. | Tower run (or any hunt) with the yard after; open Inventory, Hearth Chest, Storage | `opal-25-equip-upgrades-off-during-yard`, `opal-31-storage-off-while-yard`, `opal-40-chest-window`, `opal-57-phone-hunts-while-yard` | off-why copy (`src/shell/*`), after-hunt carry-over |
| C8 | P3 | min-maxer | **Empty Gloves slot still offers medium.** Hero in 4 heavy pieces, Gloves empty: the list shows "Studded Leather Bracers" (medium) first, then "Iron Gauntlets". Empty Body/Belt/Cape/Amulet said "Nothing in bag fits here". Equip upgrades itself did pick heavy (Iron Gauntlets, Iron Belt → "6 heavy, +28% max HP"). | Level 12, both gloves in bag, Inventory → Gloves: empty | `opal-34-empty-gloves-slot` | empty-slot fit list (`src/shell/*inventory*`) |
| C9 | P3 | anyone | **The gold-reserve stop sentence contradicts itself.** "Gold reserve reached. Store supplies cost 9,706 gp and the coins brought in 14,325 gp, so your gold fell to your 20,000 gp reserve." Coins beat the cost, and the purse was 5,594, under the reserve, not down to it. It doesn't give the purse. (I set the reserve to 20,000 mid-hunt to see the stop. B3's natural case didn't recur: a 5 h solo Sewer run at Level 5 from 975 gp ended +4,517.) | Sewer hunt, More fight settings → Gold reserve 20000 | `opal-21-gold-reserve-stop-text` | END_REASON copy (`src/data/hunt-sessions.js`) |
| C10 | P3 | anyone | **Stop training takes 10-16 s with no feedback.** The first press looked like it did nothing (window unchanged, no toast); the training summary came 16.5 s later on the phone. Possibly local-engine lag (the world's settle lag ran 10-64 s); check on live. | Training Yard → Stop (or the HUD's Stop training) | `opal-24-training-window` | yard stop intent / pending state |
| C11 | P3 | crafter | **Jewelry text.** Smithing → Unlocks lists "Banded Signet", "Fang Studs" and "Seam Jasper Band" twice each, with identical tooltips. The notes say Fang Studs "help your swings land, or give you some mana back"; the piece says "+1% Critical chance … they help you crit". "Hallmark: Requires a Fine piece in the bag" still doesn't say what a Hallmark or a Fine piece is; the Reforge heading is hidden until you own one. | Gathering and crafting → Smithing; hover Unlocks | `opal-51-smithing-unlocks-hover`, `opal-52-fang-studs-tip`, `pb-65-reforge-tab` | `src/data/item-descriptions.js`, smithing unlocks list |
| C12 | P3 | new player | **The farm coach's More shows nothing.** "Plant your land / Press Plant on each empty plot / More" expands to "Press Plant on each empty plotLess" (no extra text; "Less" runs into the sentence). I saw no line saying where the land is; the card before says "Town → Farm (J) → Plant Turnip Seeds". | Fresh hero, Got it to the farm card, open Farm (J), More | `opal-06-farm-coach`, `opal-07-farm-coach-more` | coach copy (`src/data/text/*`) |
| C13 | P3 | yard users | **The yard charges a whole hour up front.** Stopped after a minute: "Paid at the yard 248 gp / Time 1 min". The Training window says "Paid hourly in advance", but the hunt card only says "248 gold/h, up to 12 h · Can't pay: waits in town", and "Can't pay" reads like a status when the purse holds 22,203. | Glade card with the yard; start, stop at once | `opal-27-glade-deadly-confirm` | hunt card after-hunt copy |

HARNESS (not findings): the local world never fires pg_cron, so `hr-hunt-after` (yard start), `hr-town-refresh` (online counter) ran by hand after each wait. The browser clock doesn't move with world skips, so summary start times drift ("started 11:49 AM" for a hunt that began after a 4:42 PM one).

## Replayed findings (139 and the first-hour audit)

| id | 140 claim | verdict | evidence |
|---|---|---|---|
| B1 store food won't stick in a slot | pick survives Back | **fixed**: slot 4 → Salted Trout, Back, Save, reload: live bar "Slot 4: Salted Trout", every card "then Salted Trout (40 gp)" | `opal-14`, `opal-15` |
| B2 Hold gives two picks; none on Pyre/Slake/Ford | one food line per slot | **half**: no double pick, but no slot line on any card at 5 or 16 (C5) | `opal-16`, `opal-17`, `opal-46` |
| B3 gold-reserve stop with a positive balance | says why with numbers | **not reproduced** (5 h solo, no stop); the forced stop gives numbers but contradicts itself (C9) | `opal-21` |
| B4 yard card drops Gold, Kills, Best find | keeps them | **fixed**: "Gold +14,568 gp … Kills 2,924 … Best find Iron Platebody … Then Oren went to the yard" (the yard fee is left out: C3) | `opal-23` |
| B5 no Bless again on the away card | Bless again | **fixed**: "3 Blessings saved 17,909 Level XP … used up" + Bless again → Shop Services → Bless all, once | `opal-28`, `opal-29` |
| B6 Equip upgrades puts on a medium belt | weight rule | **fixed**: Iron Belt, "6 heavy, +28% max HP" (empty-slot list still mixes: C8) | `opal-44` |
| N1 Tower enters with no food/Level warning | — | **fixed**: "Before entering / Food … / Drink … / Gold …"; "Death penalty None" so no Level line needed | `opal-35` |
| N2 no Hearth Chest in the Town menu | in the Town menu | **fixed**: Town → Hearth Chest; Use opened one Bronze key | `opal-05`, `opal-41` |

## The 140 changes, played

| change | verdict | evidence |
|---|---|---|
| Fang Studs | bought 3,000 gp (once on double-click), worn: "+1% Critical chance" (text vs notes: C11) | `opal-52` |
| Seam Jasper Band + 3 stones | shop 12,000 gp, "Requires Level 30, now 16"; Smithing unlock at 30; stones not reachable | `opal-51` |
| Goblin Diggers drop Seam Jasper | Warrens card: "Seam Jasper / Goblin Digger / 0.24%" | `pb-64` |
| Reforge a Hallmarked piece | not reachable (no Fine piece, Smithing 1) | `pb-65` |
| Farm coach says where your land is | not seen (C12) | `opal-07` |
| Got it moves the coach chain on | **fixed**: Tamsin's rats → Rats in the mill → Fights on its own → Level up → Plant your land → Action bar | `opal-03` |
| Hero-slot buy asks first | not reachable: "Buy a hero slot for 300,000 gold" off, "Need 299,025 more gold" | `opal-12` |
| Item tips say Requires Level N | **fixed**: "Requires Level 15, now 9" | `opal-22` |
| Sell all junk keeps Best find | **fixed**: Rook's Whistle (Rare) kept; "Sell 3 stacks?" | `opal-54` |
| Double-click doesn't select button text | **fixed**: selection empty after double-clicks | — |
| Deposit all materials | **works**: "Put away 23 stacks."; off with no reason while at the yard (C7) | `opal-32` |
| Fast clicks queue | **fixed**: 12 fast presses, all 12 landed, no "Too many changes" | `opal-33` |
| Tower labels | **fixed**: "Kill XP 37.5% of hunting", "Stoke … x1 150 Cinders", "Spat out, no XP lost / XP lost None" | `opal-35`, `opal-39`, `opal-40` |
| End card Gold = away card = purse | **holds** without the yard; with the yard the card leaves out the fee (C3) | `opal-08`, `opal-21`, `opal-43` |
| Gold-reserve stop says why | numbers yes, sentence wrong (C9) | `opal-21` |
| Yard keeps Gold/Kills/Best find | **fixed** (B4) | `opal-23` |
| Bless again on the away card | **fixed** (B5) | `opal-28` |
| Analyzer says Coins | **fixed**: "Coins 9 gp / Unsold loot value 1 gp / Supplies cost 0 gp" | `opal-42` |
| Hunt prep pick survives Back | **fixed** (B1) | `opal-15` |
| One food line per slot | no line at all (C5) | `opal-46` |
| Empty armor slots offer only your weight | not for gloves (C8) | `opal-34` |
| Parties keep settings when one hunt ends | **fixed**: Bram "target=strongest, Offensive", Pell "target=weakest, Defensive", bars unchanged after Pell left (but Bram was sent home: C1) | `pb-63` |
| Hearth Chest in the Town menu | **fixed** (N2) | `opal-05` |
| Phone: summary names next ground | **fixed**: "Next ground: Meadowbrook Thicket / Levels 5–15, recommended for Level 5" (922x423) | `pa-60` |
| Phone: Hunts sheet whole lines | **fixed**: no clipped text measured | `opal-56` |

## Level 1-23 pass (fresh account, diary)

| point | hunted h | Level | purse | XP/h seen |
|---|---|---|---|---|
| Cellar 30 min | 0.5 | 5 | 735 | 9.1k |
| Sewer solo 5 h | 5.5 | 9 | 5,594 | 35.7k |
| Wickstead 6.6 h → yard 10 h | 12.1 | 12 | 19,869 | 32k |
| Glade Deadly, died in a minute → yard | 12.1 | 12 | 21,913 | — |
| Tower floors 1-19, 9 min | 12.3 | 12 | 21,410 | — |
| Wickstead 12 h → yard 11 h | 24.3 | 16 | 47,335 | 35.9k |
| Glade 12 h → yard 11 h | 36.3 | 22 | 87,582 | 78.1k |
| Glade 15 min (phone) | 36.5 | 23 | 91,357 after junk | 81.2k |

Against the 10-25 table (L10 at 6 h, L25 at 36 h): Level 22 at 36 h, about 3 Levels behind, a little ahead of 139's run (Level 22 at ~40 h). Gold at 22 is 88k (139: 129k with no Fang Studs or Tower).

## Top findings by quit risk

1. **C1**: one friend leaving sends the whole party home.
2. **C2**: two friends with the same weapon get about a third less XP each than solo.
3. **C5**: the weak-food warning is gone everywhere (it was behind the Krell's Hold death).
4. **C3 / C4**: the away card leaves out the yard fee, and away hunts vanish from Earlier hunts.
5. **C6**: the Oak Wand out-melees the Iron Sword.
