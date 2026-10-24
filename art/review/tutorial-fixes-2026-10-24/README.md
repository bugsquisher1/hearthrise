# Tutorial fixes, played (lane/b-tutorial-fixes, 2026-10-24)

The designer's playtest (`../tutorial-playtest-2026-10-24/`, PRIORITY_BOARD "New-player tutorial playtest") replayed on
this branch: brand-new accounts in the real client (`play.html`, headless Chromium) against the replayed migration
chain and the real `hr-accrue` handler (the designer's harness, pointed at this worktree). The player is a script that
does only what the coach says: press the ringed control, read the card, close a window once the card has left it.
Only waiting is compressed (the scratch database's hunt clock is moved back); every press is a real intent.

What changed on screen: every card rings the real control it names (a 2 px gold ring, blinks 6 times as it lands,
then holds still; no glow); a card whose controls live in a window shows INSIDE that window, under its title; a ring
below a window's fold is scrolled into view once; Enter closes Hunts once the server shows the hunt; a card the server
finishes on its own (the first kill, a level) stays up long enough to read; "Tell your hero when" names and rings the
slot that really holds the Cooked Shrimp (slot 4 on v0.2.42's bar); the town half is in the chain (plant in the cellar
wait, cook, the bar, Tamsin's task); the Sewer card is a party card, so a solo hero ends on Tamsin's payment and
"What next" (which names the Sewer and how to make a party).

## Shots

| Shot | What it shows |
|---|---|
| 01-town-ring-on-hunts-desk | first screen: card 1 under the icon row, the ring on Hunts (the first of 16 unlabeled icons) |
| 02-card-in-hunts-ring-on-enter-desk | Hunts open: card 1 inside the window, the ring on Enter (Mill Cellar is picked) |
| 03-hunts-closed-card-2-desk | after Enter the window closed itself: "Your hero fights alone" is on screen |
| 04-card-3-desk | "That's a level" on screen (held: the first kill came 3 s in) |
| 05-plant-card-ring-farm-icon-desk | in the cellar wait: "Plant your land", ring on the Farm icon |
| 06-card-in-farm-ring-plant-desk | the card inside the Farm, ring on an empty plot's Plant |
| 07-cash-in-ring-leave-desk | Level 5: "Cash in", ring on Leave hunt |
| 08-cook-card-ring-start-desk | "Cook your catch" inside Gathering and crafting, ring on Cook Shrimp's Start |
| 09-bar-card-slot-4-ring-save-desk | "slot 4 is your own Cooked Shrimp" inside Configure action on slot 4, ring on Save |
| 10-tamsin-ring-weight-desk | "Tamsin's wolves" inside her tally, ring on the armor weight |
| 11-tamsin-ring-take-scrolled-in-desk | the weight picked: her board scrolled to 200 Gray Wolves, ring on Take |
| 12-thicket-ring-on-line-desk / 13-thicket-ring-on-enter-desk | "Into the Thicket": its line, then Enter |
| 14-paid-in-town-card-desk | in the Thicket: "Paid in town" with the tally on screen |
| 15-what-next-party-pitch-desk | paid ("Tamsin paid ... 480 gp and a Bronze Platebody"): What next, with the party pitch |
| p01..p06 (922x423, touch) | ring on Hunts; card in the Hunts sheet with the ring on the Mill Cellar line (the phone shows the list first); card 2 under the hunt bar; the Farm sheet scrolled to the ringed Plant; Configure action on slot 4 with Save ringed; "Back to the list" ringed when the sheet shows another ground |
| s01 (667x375) | after a reload: the bar card and the ring on slot 4 |
| s02 (667x375) | PRE-EXISTING, not this lane: Configure action is 800 px wide on a 667 px screen, so Save is off-screen (same width with the card hidden; hunt.css:586 `max-width: none` against the window's inline 800 px) |

## Step timings (desktop run `desk5`; phone run `phone2` within 2 s of it)

| Step | Time from the first screen | Note |
|---|---|---|
| First screen, ring on Hunts | 0:03 | |
| Hunts open, card inside, ring on Enter | 0:05 | phone: ring on the line, then Enter at 0:07 |
| Enter: Hunts closes, card 2 | 0:07 | card 2 held at least 8 s |
| Card 3 | 0:23 | stays until Level 2 or a skill 2: 0:28 (desk4) to 2:55 (desk5) |
| Plant your land: Farm, Plant, Turnip | +7 s | done while the cellar hunt runs |
| Out to the brook (Level 5) | ~25 min real | compressed here; the designer measured ~4,100 Level XP/h in the Cellar = 25 min to Level 5's 1,736 XP (the card's old "a quarter of an hour" is now "about 25 minutes") |
| Cash in: Leave pressed to in town | 27 s | the server's leave countdown |
| Cook, bar, Tamsin, Thicket | 19 s, 3 s, 5 s, 5 s | script pace (no reading); every press found by its ring, no dead end |
| Tamsin's 200 Gray Wolves, paid, What next | ~50 min real | designer's measure: 103 wolves per 25 min; reached What next with the party pitch |

## Found on the way (not fixed here)

- The desktop kit tank died 4 times in the Thicket (Level 5-10, no armor, killed by a Gray Wolf; death_log) on the
  compressed clock; the designer's run, with Shop gloves, had none. Worth a balance look before the tester's first
  Thicket hunt.
- Configure action at 667x375 (s02): Save unreachable, so no bar edit is possible at that size.
- After a hunt ends in town, the hunt bar and the analyzer stay up (designer's #6); the card hangs under that bar.
