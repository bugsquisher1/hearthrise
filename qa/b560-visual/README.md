# b560 visual gate: assembled set, 1280x800 and 922x423

Branch `qa/b560-visual`, cut from `origin/set/b560` at `88ba67e7ba207a0237dccc34335c7d8b4fbcb180`, which contains `a1bbf15` (b373 in-page P1) plus `88ba67e` (deeds, batch 5 pack 4). 70 PNGs: 35 at 1280x800 and 35 at 922x423. No game code was touched.

**How the shots were made.** I used headless Chromium (`/opt/pw-browsers/chromium-1194`) and a scratch driver that is not committed. The driver imports `bootPage()` and `serve()` from `tests/visual-qa.mjs`, which sets `window.__HR_TEST_HARNESS__=true` before load, applies the `MID_GAME` fixture, and dismisses FTUE and overlays. The sandbox cannot reach Supabase or Google Fonts, so the run used `--offline-fonts`. That has three effects:

- Every page renders in the **fallback system fonts**, not Cinzel or Alegreya. Text widths and wrapping can differ from what players see.
- The player shows as "Signed out" and "Reconnecting…".
- Before every shot except the toast shot, the driver hid the sandbox-only transient pill (`#hr-net-banner`) and any `.notif` toasts.

**Fixture states.** Each state was reached through the module's own published seam, not through raw DOM edits:

| State | Seam |
|---|---|
| Lifetime counts, pending | `HearthriseLifetime.__swapView(null)` |
| Lifetime counts, realm | `HearthriseLifetime.__swapView(view)` with kills 1,284, bounties 17, quests 7 of 11, and so on |
| Charm counters known | `HearthriseCharms.noteEnvelope({bestiary:{kills_by_class}})` with 1,500 kills per class |
| Server-stated bag (Night Plan) | `HearthriseAccrual.reconcileInventory(G,{inventory})` |
| Vigour meter | `HearthriseAccrual.hydrateHunt(G,{vigour})` |
| Week and day goals | `window.HearthriseGoalState = {peek}` (the same stub WEEK-C uses) |
| Signed in on slot 0 | `HearthriseAuth.getSession/isSignedIn/currentUserId` and `HearthriseProfile.activeSlot` |
| Leaderboards | `hr_leaderboard` answered by a Playwright route with a canned server envelope |
| Death sheet | `HearthriseDeathSheet.show()` |
| Buy Back sheet | `openBuyback()` |
| Codex | `HearthriseCodex.open(id)` |

For the Buy Back row, `G.buyback` was seeded with one past sale so the row draws.

## Findings (read these first)

1. **The Lifetime chip on the Fight screen is hidden whenever the server's Vigour meter is present.** `legacy.css:3740` has `.activity-bar:has(.ab-vigour) .ab-meta .ab-tkills { display:none }`, added 2026-09-27 in `0a83f84` ("THE CHIP EARNS ITS ROOM"). Any player with a stated Vigour meter never sees the b342-2 "Lifetime" chip while fighting. At 922 the "away: you fall" chip is also clipped off in that state. It shows correctly (pending dash, then 1,284) only when no Vigour meter is stated, as in `fight-lifetime-*`. This looks intended by the Vigour lane, but it undercuts the chip that b560 just fixed. Routing to the Game Designer for a decision.
2. **At 922x423 the Home hearth band's realm cells do not fit the 56px strip.** Measured: band y 70–126. The figures ("—", "12", "1,520") start at y 65–68, so their tops are clipped. The labels "XP today", "Kills today" and "Gold earned" wrap to two lines ending at y 130–132, so their bottoms are clipped. The hero name "Adventurer" is also cut off at the top of the band. The activity bar (y 44–72) overlaps the band by 2px. The "Kills today" and "Gold earned" cells are new in this set (`8e954e2`). This was measured in fallback fonts, so it needs a re-check with real fonts. It shows in `home-hearth-band-922x423`, and in the background of `events-login-toast-922x423` and `settings-922x423`. P2, routing to the Art Director.
3. **Earlier issues that are still present, none of them new in b560:**
   - At 922, the Fight arena's stance buttons run into each other ("AccurateAggressiveDefensiveControlled"), and the food row overlaps the "measuring… / SESSION" lines. The same appears in `qa/b559-visual-2/fight-with-meter-922x423.png`.
   - At 1280, the Fight rail's LOADOUT header is cut after "+0 str ·".
   - At 1280, the Inventory equipment slot labels break mid-word ("Neckla/ce", "Weapo/n", "Offhan/d"). Fallback fonts may contribute.
   - At 1280 with the page scrolled to the top, the fixed bug-report button (x 1233–1268) covers about 14px of the Account card's "Lifetime Stats" button.
   - On the Codex (and Settings) sheet, the title and Close button scroll out of view once the sheet body is scrolled. This was already flagged in b559.
4. **These are harness artefacts, not bugs:**
   - The death sheets read "back up at 40% health · 60 / 60". The HP is full because `show()` was called without a real fall.
   - The tip on the death sheets offers Auto-Eat from the Bounty Shop. `G.traits` is empty in the harness, so the sheet treats Auto-Eat as not owned.
   - Achievements "— / 30" and Days running "—" stay pending in both Hero states, because their seams (`HearthriseDeeds`, the play streak) were not fed.
   - The "Your standing" best-skill row never drew, because the server skill record is unknown in the harness and `bestSkillBoard()` returns null. So both the podium and the chase cases were shown on the Total Level row.

Everything else I checked against the brief's "must / must not" list passed.

## Per-file notes

### 1. Home
- `home-hearth-band-1280x800.png`: the hearth band shows XP today "—" (pending), Kills today 12, Gold earned 1,520. Looks correct.
- `home-hearth-band-922x423.png`: the same band collapsed to its 56px strip. **Clipped**: the name is cut at the top, the figures are cut at the top, and the two-line labels are cut at the bottom (finding 2).
- `home-standing-{1280x800,922x423}.png`: "Your standing" chase row: "Total Level · You stand #7 on the Total Level board, 12 levels behind Bran." The chip reads "IN THE FIRST TEN", then the boards-read line and "updated 3m ago". Looks correct, no overlap.
- `home-standing-podium-{1280x800,922x423}.png`: podium row: "You stand #3 on the Total Level board, 14 levels behind Cyn." with the chip "ON THE PODIUM". Looks correct. On this fresh page the Hunter's Ledger below shows its pending state ("Nearest charm —", "Nearest trophy —"), which is correct: a dash, not 0.
- `home-your-week-{1280x800,922x423}.png`: the "Your week" card reads "Since Monday, midnight UTC", then the woodcutter lead line, then Logs cut 180, Monsters slain 64, Dishes cooked 22. Looks correct.
- `home-realm-{1280x800,922x423}.png`: "The realm" card shows The Open Coffers ("a day for trade and treasure", TODAY), The Grand Fair ("a week of fairs across the realm", THIS WEEK), and "Blessings remain active while you are online." It contains **no numbers** (the digit scan came back empty) and no rate, yield or gold-find promise. Looks correct.
- `home-hunters-ledger-{1280x800,922x423}.png`: the Hunter's Ledger card is present and intact: "Mammal charm · 500 kills to Banesworn" with a progress bar and the "Bestiary →" link.
- `home-night-plan-{1280x800,922x423}.png`: "Right now" while idle. The Night Plan strip correctly draws nothing when nothing is running, and there are no Night Plan doors (`.np-door` count 0).
- `home-night-plan-fighting-{1280x800,922x423}.png`: "Right now" while fighting, with the bag stated by the server. The Night Plan strip is present: "Tonight: you fall against Slime and lie knocked out for part of the night, earning nothing while you are down." The doors row on Home only appears on the away card after a real away receipt, and that needs a live Supabase round-trip, so it was not reached. The same doors do render on the Fight rail (see `fight-rail-tonight`). The activity bar here shows "Lifetime —" and "away: you fall".

### 2. Character → Hero tab (Hero's Tally + Account grid)
- `hero-tally-pending-{1280x800,922x423}.png`: hero card stats: Combat Lv 69, Total Lv 780, Gold 250.0K, **Kills "—"** (pending dash, not 0). Looks correct.
- `hero-tally-realm-{1280x800,922x423}.png`: the same card with **Kills 1.3K**, the realm's count, formatted with K like the Gold cell. Looks correct.
- `hero-account-pending-{1280x800,922x423}.png`: Account grid: Quests "—", Achievements "— / 30", Bounties "—", Days running "—". No stray 0. The "Lifetime Stats" door is in the foot row. Looks correct.
- `hero-account-realm-{1280x800,922x423}.png`: Account grid with Quests **7 / 11** and Bounties **17**. Achievements and Days running stay "—" (harness, finding 4). At 1280 this frame is the same as the tally frame because the whole card fits. At 1280 with the page at the top, the bug-report button overlaps the right end of "Lifetime Stats" (finding 3).

### 3. Lifetime Stats sheet
- `lifetime-stats-pending-{1280x800,922x423}.png`: pending. Every realm count is "—" (Monsters slain, Falls, Bounties, Resources, Dishes, every section row, Kinds studied, and "Kinds of beast —"). Combat and Total level, Gold and Gems show as numbers. Looks correct.
- `lifetime-stats-settled-{1280x800,922x423}.png`: settled. 1,284 slain, 6 falls, 17 bounties, 5,230 gathered, 620 cooked, the Fighting rows, "Kinds studied 11 of 11", and per-kind rows at 1,500.
- **Header versus close button, measured.** At 1280, the title spans x 325–536 (y 45–76) and the subline spans x 325–728 (y 80–100). The ✕ spans x 933–963 (y 35–65). Neither overlaps it. At 922 the result is the same: the title and subline end at x 549 and the ✕ starts at x 754. The header clears the close button.

### 4. Social
- `social-skill-board-{1280x800,922x423}.png`: Skills → Attack board. Row 1 reads "QA Visual (you) **THE FIRST BLADE**" (the named crown). The standing sentence is "You are #1 of 38 ranked. You hold the Attack crown as the First Blade, 3,140 xp clear of Cyn." The card head reads "Attack · #1 of 38 · updated 3m ago". Looks correct.

### 5. Events
- `events-blessing-{1280x800,922x423}.png`: Today's Blessing card: "The Open Coffers — a day for trade and treasure · today", "The Grand Fair — a week of fairs across the realm · this week", and "Blessings remain active while you are online." It shows **a name and the day's purpose only**. The digit and percent scan came back empty, and so did the scan for rate, yield, gold-find and bonus words. Looks correct.
- `events-login-toast-{1280x800,922x423}.png`: the real login toast, captured on a fresh browser context as the page booted, with toasts left visible for this shot only. It reads "Today's blessing: The Open Coffers — a day for trade and treasure". No numbers. Looks correct. At 922 it sits over the "Go train" button, which is expected for a transient toast.

### 6. Fight screen rail
- `fight-lifetime-pending-{1280x800,922x423}.png`: Fighting Slime with no Vigour meter stated. The activity bar reads "… DEF 60 · 2,276 to go **Lifetime —** away: you fall Stop". The chip shows the pending dash. The rail shows LOADOUT, PROVISIONS, TONIGHT, CHARM & TROPHY, and DROPS; the Vigour block is hidden at height 0, which is correct when no meter is stated.
- `fight-lifetime-realm-{1280x800,922x423}.png`: the same frame with **"Lifetime 1,284"**. Looks correct. At 922 the bar truncates "Fighti…", as designed. The overlapping arena buttons are the pre-existing issue in finding 3.
- `fight-rail-vigour-{1280x800,922x423}.png`: with the Vigour meter stated, the VIGOUR block renders "300 / 720 min today · 720 free · renews 12:00 AM", then "Refill +120 min · 6,917 gold" and "0 of 5 refills bought today". The bar chip reads "Vigour 420 min". **The Lifetime chip is `display:none` here** (finding 1).
- `fight-rail-tonight-{1280x800,922x423}.png`: the TONIGHT (Night Plan) block renders its sentence, the cook line, the gather line and three doors ("Buy food at the Local Shop", "Cook before you go", "Gather tonight instead"). Intact.
- `fight-rail-charm-{1280x800,922x423}.png`: CHARM & TROPHY reads "Vermin charm · 500 to Banesworn" and "Slime trophy · 2,500 to Quarry", followed by DROPS THIS FIGHT. Intact.

### 7. Knocked-out (death) sheet
- `death-sheet-known-{1280x800,922x423}.png`: known killer, a Giant Rat (chosen because the Slime has no elemental weakness, so it cannot show the element line). Title "The Giant Rat got you". Rows: "Slain by Giant Rat · no kills", kept everything, back up at 40% (see finding 4), first fall, run picks up. Buttons: "Fight Giant Rat again" and "Back to the War Table".
- `death-sheet-known-scrolled-{1280x800,922x423}.png`: the same sheet scrolled to the foot. The Know-your-foe block shows the field note, the **weapon line** ("Giant Rat is weak to 2H Hammer attacks…"), the **element line** ("Its kind gives way to frost: enchant your weapon with the frost rune…"), and the **"Field notes" door**. Everything required is present.
- `death-sheet-unknown-{1280x800,922x423}.png`: unknown killer. Title "You fell". The first row reads **"Slain in battle"** with **no count** next to it (the value cell is empty). There is no Know-your-foe block and no Field notes door. Buttons: "Fight again" and "Back to the War Table". Looks correct: no "undefined", "NaN" or placeholder.

### 8. Local Shop
- `shop-buyback-row-{1280x800,922x423}.png`: "VENDOR BUY-BACK · Buy back sold items · The realm keeps no buy-back counter yet", with a **disabled** "Buy Back" button (`disabled=true`, no onclick). Looks correct.
- `buyback-sheet-{1280x800,922x423}.png`: the Buy Back sheet reads only "The realm keeps no buy-back counter yet. Vendor sales are final." There is **no counter line and no numbers**. Looks correct.
- `more-sheet-{1280x800,922x423}.png`: More sheet entries are Skills, Recipe Book, Codex, Lifetime Stats, Events, Clan, Party, Items, House, Stable, Social, Shops, Chat, Settings and Bounty Board. There is **no Buy Back door**, and a text scan for "buy back" found nothing. At 922 the last row (Bounty Board) sits below the fold and the sheet scrolls to reach it.

### 9. Combat and Inventory
- `combat-screen-{1280x800,922x423}.png`: War Table (Bounty, Boss of the Day, Weekly Boss, Dungeon, Clan Raid, World Event, and the monster grid). It renders cleanly with no overlap. At 1280, Boss of the Day states "drop odds ×1.5 · kill XP ×1.25 · away too". That is the engine-paid boss layer, not a blessing.
- `inventory-screen-{1280x800,922x423}.png`: the Bag grid, filters and equipment doll render. At 1280 the slot labels break mid-word ("Neckla/ce", "Weapo/n", "Offhan/d"), which is a pre-existing issue that fallback fonts may make worse (finding 3). At 922 the Bag, Equip and Saved tabs are clean.

### 10. Settings and Hearth Codex vol. II
- `settings-{1280x800,922x423}.png`: sections are **Audio, Display, Gameplay, Chat & Privacy, Account**. The Data section is **absent**. The Codex row (`#set-open-codex`) is present.
- `codex-vol2-vigour-{1280x800,922x423}.png`, `codex-vol2-dungeons-…`, `codex-vol2-boss-of-the-day-…`, `codex-vol2-lucky-finds-…`: the four volume-II entries (per the CHANGELOG: Vigour, Dungeons, Boss of the Day, Lucky finds), each opened in the Hearth Codex. The groups are First things, Fighting, Home and hands, Coin and Records. None of the entries contains a digit. The text is readable at both sizes. The sheet title and Close button scroll out of view when the body is scrolled (finding 3).

## Not captured

Everything the brief asked for was captured. The Night Plan doors on Home's away card were not reached: they only draw after a real away receipt, which needs a live Supabase round-trip. The same doors do render on the Fight rail (`fight-rail-tonight`).
