# Batch 5 (b560) — ordering and dispatch

RANKED BY PLAYER VALUE PER LANE-HOUR (days 7-30 and the shared world):
1. Standings (1.5h). This is the only shared-world signal with real volume. The self block already exists server-side but is hidden a tab away. It also folds in the dead Friends promise on the same screen.
2. Hero's Tally (2.0h). It fixes one section-6 defect class on four surfaces: the Hero card, Lifetime Stats, the welcome card and the Account grid. It gives two orphaned modals real doors, and it is the observer Deeds needs.
3. This Week (1.5h). It adds the weekly rhythm and fixes the device-local Kills/Harvest figures on the first screen of every day.
4. Deeds (2.0h). It turns 30 client-decided, partly false goals into honest long goals, but it must wait for 2.
5. Know Your Foe (1.5h). It fixes the failure moment. It ranks last only because the Fight screen already prints the weapon weakness.
Total: about 8.5 lane-hours.

DISPATCH:
- Packs 1, 2, 3 and 5 go in parallel from origin/release/b559 (467dcf90) onto set/b560.
- Pack 4 branches from set/b560 once Pack 2 has merged. If that misses the 20:00 UTC cut, it rides b561.
- Before dispatch, the Coordinator should run --write for monolith, comment-ratio, test-file and css-literal on the set base. The SAFE SURFACE survey found 214 legacy lines, 78 b-number comment lines and 4 tests of stale headroom.

FILE OVERLAPS (merge order: 2, 1, 3, 5, 4; any later lane merges set/b560 into itself before reporting):
- home-dashboard.js: Pack 1 adds one line after :1667. Pack 3 edits the hearth band (:1269-1337) and adds one line before :1707. The hunks are separate.
- character-page.js: Packs 2 and 4 both touch it, and they are already sequenced.
- legacy.js: every edit is in place or a deletion, in separate hunks. Pack 2 at :13370, Pack 3 at :17983-18032, Pack 5 at :4960/:4981, Pack 1 at :8933, Pack 4 deletes :13980-14214. Net change is about -95 lines.
- signposts.js: Pack 1 inserts after :33 and Pack 5 after :20.
- main.js: each pack uses its own anchor: :267, :453, :460, :440, and :474/:534.
- smoke.yml: each new guard gets its own step at a separate anchor: :2588, :2737, :2606, :3042, :2596.
- In-page tests: each pack uses its own smoke file.
- No pack touches any of the 83 files hr-accrue packs. Every lane must print pack-edge --hash 184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f and a green lane-done before READY.
- Test budget: 10 new in-page tests of 20 lines or fewer and 0 G seeds, so the TF ratchets only improve.

VERIFIED HERE vs NOT:
- I verified from source that the stat rows, deaths_lifetime and the goal-state `have` values exist. bounty_turnins is live: hr_claim_bounty__ungated agree:true in live-hash-drift.baseline.json.
- All 46 lore lines passed LORE-4/6 in a scratch check, and all 13 signposts lines passed SIGN-3/5.
- Per the read-only brief, I did not play, run lane-done, or run the hash. Each lane plays its own screens on the QA account.

ROUTED, NOT PACKS (these are lane-A class-kills, not content):
- (a) Blessings. Home, Events and a login toast promise gather/craft/cook speed, yield and gold find while online. world-events.js:233-239 adds this to the client getBonus. The engine's bonusFor has no blessing layer (accrual.js:821-843), so the browser predicts rates the server never pays. That is a section-6 P1 for Systems: withdraw the promise and the wrap, and enter it in CONFLICTS.
- (b) Buy Back still lists enabled 'Buy back · N gp' buttons, and a More-sheet door at index.html:724. Every tap fails closed under armed gold (shop-counter.js:283-286). Disable them with a reason.
- (c) P3 fold-ins: none taken. No pack touches the Boss of the Day card, the combat style bar or the Settings header. The 'Cloud is slow' pill overlap is a global sheet/topbar layering rule for the Art Director, not a copy lane.
- (d) The Home 'XP today' figure is kept but is still a device-local delta. Systems handoff: add a daily ev:xp counter.
