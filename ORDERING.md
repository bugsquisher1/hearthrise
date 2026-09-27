| Rank | Pack | Value / lane-hour | Can start | Merge after |
|---|---|---|---|---|
| 1 | The Night Plan (2.0 h) | P1: the day-2 wall (52 deaths across 3 players on 09-26; QA heroes knocked out 11h51m / 11h36m) | now | none |
| 2 | Plain Words (1.5 h) | P1: invisible Vigour pay cut; the dungeon screen promises a multiplier the server never pays | now, no shared files | none |
| 3 | Hunter's Ledger (2.0 h) | Week-long ladder plus the most frequent free delight (11 classes × charm ranks at 25/100/500 kills) | now | converts tests/lore-notes.mjs to a SETS table, so it lands first |
| 4 | Lucky Finds Unveiled (2.0 h) | The rarest week-1 moment finally gets a moment; the chase list gives hunters a reason to choose a spot | now | after 1 (legacy.js welcome region, home-dashboard awayCardHtml) and after 3 (lore-notes.mjs) |
| 5 | Homestead Almanac (1.5 h) | Meaning for the homestead spine; answers 'why grow this?' | now | after 3 and 4 (lore-notes.mjs) |

Five lines were written and checked with pure node imports, not played live (Tyler is streaming):
- All 86 lore lines pass LORE-4/5/6, and their keys match MONSTER_CLASSES, CHARM_RANKS, the 26 lucky rows, ROOM_PERKS and MAX_PLOT_LEVEL.
- The night.* lines pass SIGN-3/5, and the Codex text passes CODEX-3/4.
- None of the five packs touches the b559 fix-lane files (companions.js, collection-log.js, activities-grid.js, renown.js, daily-reward.js, accrue.js, theme-cozy.css). The two pop-up packs (3 and 4) wait on HearthriseSheet.topOpen(), the same check the in-flight popup fix uses.
- origin/set/b559 has moved from 05fba6a3 to c3ac50ec (companion-procs merge); on that tip tests/lore-notes.mjs reads its word list from COMPANION_LABELS in src/render/companion-lines.js, so branch from the new tip.
- In home-dashboard.js, homestead.js and combat-screens.js the CR-1 comment headroom is 0-1 lines, so add no comments there.
- I did not run lane-done.

Deliberately left out:
- **Hero's Record** (achievements and lifetime stats rendered '|| 0' from residue; 'Estate Owner' says 6 rooms when there are 8) is batch 5.
- **The dungeon-spoils rarity reveal** is batch 5.
- **Lane-A honesty sweep, not content:** the Settings Data section still promises import/restore/erase with BLOB_RETIRED; the War Table bounty count ignores bountyShownProgress; Market 7-day stats come from a device-local, Math.random-seeded store; the set bonus reads 'Tier N'; the Hero class map misses two skills.
- **New P1 (§6 class) found while reading, needs a design call:** the House card, Home 'Your holding' and the client's offlineCapHours() promise property and renown offline hours (homestead.js:539, :544; home-dashboard.js:1515; legacy.js:1229-1236). The server cap hr_offline_cap_ms adds only clan levels (2026-08-11-accrual.sql:63-100). So the game says '+1h … +4h offline cap' and shows up to 16h away maxima, but pays 12h. My ruling: strip the claim client-side now (lane A). Making the perk real would be a lane-C + Security item for Systems.
