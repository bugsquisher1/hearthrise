# b560 visual gate, pass 2 (set/b560 @ 88ba67e)

These screenshots come from the headless test harness (`window.__HR_TEST_HARNESS__ = true`), with Supabase and Google Fonts blocked. That setup has four side effects on every shot:
- the fallback font is used;
- a "The realm is slow" pill sits at the top centre;
- the account shows "Signed out / Reconnecting";
- the transient "Today's blessing" card appears on some shots.
None of those come from the deeds lane.

How each state was reached:
- The deeds poll was parked with `HearthriseDeeds.__setPollEnabled(false)`.
- Pending = `HearthriseLifetime.__swapView(null)`, plus a readers wrapper that returns unknown for every source.
- Settled = a complete progress statement sent through the real `HearthriseLifetime.noteEnvelope`: kills 999, crits 1000, rare 3, bounties 12, chopped 500, mined 499, fished 0, harvest 100, planted 40, tool 7, cooked 100, burnt 50, smithed 120, crafted 999. A readers wrapper also sets melee levels 52/50/48/51, 3 of 8 rooms, and dragon kills known = 0.
- The toast was fired by the watcher's pure `HearthriseDeeds.tick` with a seeded open-to-done crossing, which calls `showAchToast` the same way `openToast` does.

## Deeds sheet
- deeds-pending-1280x800.png: top of sheet with every deed pending. Every progress cell is the dash; there is no "0" and no placeholder. The blessing card overlaps the sheet's right edge (transient).
- deeds-pending-922x423.png: the same at mobile landscape. All dashes. **The transient blessing card covers the right half of the Close button.**
- deeds-pending-scrolled-1280x800.png: bottom of the pending sheet (Skills group). All dashes.
- deeds-pending-scrolled-922x423.png: the same at mobile landscape. All dashes. The blessing card again covers the right half of Close.
- deeds-settled-1280x800.png: settled, top of sheet. First Blood, Slayer and Champion show "Earned ✓"; Hero of the Realm shows "999 / 1,000". Nothing clipped.
- deeds-settled-922x423.png: the same at mobile landscape. The list viewport is only about 270px tall (about 1.5 rows visible), but nothing is clipped.
- deeds-settled-reopened-1280x800.png: the sheet as it looked on reopen, before scrolling back to the top. **P3: the sheet reopens at the previous scroll position (scrollTop 3310), not at the top.** `#ach-list` is reused and its scrollTop is never reset.
- deeds-settled-reopened-922x423.png: the same P3 at mobile landscape (scrollTop 3608 on reopen).
- deeds-settled-scrolled-1280x800.png: mid sheet. Green Thumb Earned, Sower 40 / 250, Good Tools 7 / 100, then the "At the bench" heading with Chef Earned. The headings render with content, not bare.
- deeds-settled-scrolled-922x423.png: the same at mobile landscape.
- deeds-settled-scrolled-end-1280x800.png: end of sheet. Grandmaster 52 / 75, 99 Club 52 / 99, Well-Rounded Earned, Combat Master 48 / 50. Nothing sits under Close.
- deeds-settled-scrolled-end-922x423.png: the same at mobile landscape.
- The partial or not-yet-started ("locked") tiers across the whole list are: Hero of the Realm 999/1,000, Legendary 999/5,000, Loot Goblin 3/25, Wanted Poster 12/50, Dragon Slayer 0/1, Quarryman 499/500, Angler 0/500, Anvil-Ringer 120/500, Estate Owner 3/8. Five group headings are present.
- Note: the sheet title reads "Achievements", not "Deeds of the Realm". That may be intentional; flagging it for the designer.

## Unlock toast
- deed-unlock-toast-1280x800.png: "Achievement unlocked! Hero of the Realm" in the top-right corner, above the hero stat tiles. **P3: the 240px toast has a wide empty icon column on the left, so its text wraps to four lines ("Achievement / unlocked! / Hero of the / Realm").**
- deed-unlock-toast-922x423.png: the same at mobile landscape, with the same four-line wrap. The toast covers the hero card's upper right (transient).
- deed-unlock-toast-batch-1280x800.png: the batch form ("Hero of the Realm and 2 more") fired while the first toast was still up. **P3: toasts do not stack; the second sits almost exactly on top of the first, and only the first's edge peeks out.** In real play `tick` fires one toast per batch, so this needs back-to-back batches inside 4.2s to happen.
- deed-unlock-toast-batch-922x423.png: the same overlap at mobile landscape.

## Character page
- character-hero-1280x800.png: Hero tab, top, pending. The Kills tile shows the dash, not 0.
- character-hero-922x423.png: the same at mobile landscape.
- character-account-pending-1280x800.png: Account grid, pending. Achievements reads "— / 30" on **one line** (measured 25px tall, one line box). Quests, Bounties and Days running show the dash.
- character-account-pending-922x423.png: the same at mobile landscape. "— / 30" is on one line.
- character-account-settled-1280x800.png: Account grid, settled. Achievements 16 / 30, Quests 0 / 11, Bounties 12. **P3, not caused by deeds: the floating bug-report and chat buttons overlap the right end of the "Lifetime Stats" button.**
- character-account-settled-922x423.png: the same at mobile landscape. Clean, and "16 / 30" is on one line.
- character-hero-settled-1280x800.png: Hero card settled (Kills 999).
- character-hero-settled-922x423.png: the same at mobile landscape.
- character-hero-bottom-pending-1280x800.png: bottom of the Hero tab (Melee/Ranged/Magic, Best Rates). No gap or shift where the old legacy ACHIEVEMENTS elements used to be. The legacy selectors `#achievements-list`, `.achievements-grid` and `#panel-achievements` each match 0 elements.
- character-hero-bottom-pending-922x423.png: the same at mobile landscape. The blessing card covers the Runecrafting/Stonemason rates (transient).
- character-overview-pending-1280x800.png: Character landing (Skills sub-tab), whose Account block is `#csk-account`. "— / 30" is on one line. **The same P3 bug/chat button overlap on "Lifetime Stats".**
- character-overview-pending-922x423.png: the same at mobile landscape. "— / 30" is on one line.
- character-overview-settled-1280x800.png: overview Account settled, 16 / 30. The block height is 371px pending and 371px settled, so there is **no layout shift** (#char-hero is also the same height, 1282px, in both states).
- character-overview-settled-922x423.png: the same at mobile landscape (370px in both states).
- character-lifetime-stats-settled-1280x800.png: the Lifetime Stats sheet (the tally rows). Pending rows show the dash. "Resources gathered 0" is a fixture artifact: its stat key was not in my statement, which was sent as complete. "Bounties turned in" wraps to two lines ("IN" alone on the second), which is cosmetic.
- character-lifetime-stats-settled-922x423.png: the same at mobile landscape. Only the summary tiles are visible above the fold. Nothing is clipped.

## Home
- home-1280x800.png: Home screen. The deeds watcher added nothing: no .ach-row, overlay or toast on Home (0 matched).
- home-922x423.png: the same at mobile landscape. **P3, not caused by deeds (probably older): the banner's "Adventurer" name is cut off under the idle bar, and "XP TODAY / KILLS TODAY / GOLD EARNED" wrap to two lines and are clipped at the bottom of the banner.** The blessing card covers "Go train" (transient).

## Could not reach
- A signed-in, server-backed session. The only runtime errors were three "Failed to fetch" per viewport, from the blocked Supabase calls.
- A real deed crossing driven by a live envelope. The toast was driven through the pure `tick` seam instead.
