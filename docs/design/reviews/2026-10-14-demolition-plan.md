# Hearthrise demolition plan (origin/main b584, 2026-10-14)

The first thing to merge is **D3, then D2, then D1**. The P1 screen fixes start only after that. Every agent works from the **SAFETY REVIEW** corrections, not the raw inventory. Agents find legacy.js code by function name, never by line number.

**Off-limits to all three lanes (owned by in-flight lanes):**
- C2 owns: `src/core/{combat-sim,combat,away,botd*}.js`, `src/net/{accrue,record}.js`, all of `supabase/functions/hr-accrue/**`, and the tests C2 edits (goal-counters, renown-projection, party-settle, run-sql-tests, hunt-stance-stop, vigour*).
- B1 owns: `combat-screens.js`, `death-sheet.js`, `render/hunt-panel.js`, `core/hunt.js`, `render/retreat.js`.
- B1 and W4 own: `src/world/**`.
- Final pass only: `smoke.yml`, `ci-shape`, `test-file-ratchet` and every JSON baseline.

## 1. System table

| System | Client | Data | SQL | Tests | Lane | Order |
|---|---|---|---|---|---|---|
| Clans / castle / feasts | delete clans.js, clan-seat.js, clan-seat-ui.js, clan-seat.css; strip chat.js (clan channel), perks.js clanPerks, spine-reveal | reveals pane:clan and war:clanhunt; isCastleGood label only (castle goods stay as room costs) | M1: 18 tables, ~45 fns, 3 triggers, 30 baseline rows; restate hr_offline_cap_ms, hr_name_guard | delete 4 clan-*.mjs; strip the clan half of clan-seat-and-front-door.js | D1 / D3 / M1 | 1 |
| Raids / clan hunt / lone hunt | delete raids.js and raid-bosses.js; item-authority loses its raid partition | gen-raid-boss-rewards.mjs | M1: clan_raids, raid_claims, raid_contributions; old hr_hunt_tiers/bosses/boss_reward named explicitly (never drop by prefix); hr_max_hunt_tier | raid-band-denial, raid-card-copy, tests/sql/raid-*.sql | D1 / D2 / M1 | 1 |
| Parties | delete net/party.js, render/party-panel.js, core/party-split.js plus its barrel export | codex party rows, pane:party | M2 (tick fns call hr_partied): 8 tables, ledger trigger, cron hr-party-reap | 11 party*.mjs | D1 client; engine/edge goes to C2 | 3 |
| Muster / rally / world events / blessings | delete muster.js and world-events.js; the hunt-panel clock moves to a neutral `hr-clock.js` (B1 adopts it) | gen-rally-action-times.mjs, reveals pane:events | M1: 4 tables, ~30 fns; the blessed receipt flag stays with C2 | muster-chest-xp-credit, rally-points-server, blessing-promise-honesty; split quest-xp-absence-pay | D1 / D3 / M1 | 1 |
| Renown | delete renown.js and renown-ranks.js | rewards flag:renown_rank, card:renown | M1: hr_claim_rank, hr_renown_of. M2: renown_high column, hr_perks_of ladder, hr_apply ratchet | renown-kill-faucet, renown half of collection-renown-claim-drift | D1 / D3 / M1+M2 | 1 (projection 3) |
| Daily quests, login reward, streaks | delete daily-quests.js, this-week.js, daily-reward.js, streak-chip.js; split goal-claim.js and quest-nav.js | goal-catalogue daily rows only; rewards.js daily:login; data/this-week.js | M1: hr_claim_daily, hr_tally_state, hr_daily_task_*, hr_login_*. M2: streak columns. claim_reward verb removal goes to C2 | login-reward, this-week, daily-harvest-eligibility, goal-gold-retune; goal-board-gone.mjs becomes the absence guard | D1 / D2 / D3 | 1 (streak cols 3) |
| Deeds (achievements) | delete deeds.js and render/achievements.js. KEEP farm_deed and renderHouse's deed price | data/deeds.js | none | deeds.mjs | D1 / D2 | 1 |
| Leaderboards (renown, clan_power, bosses boards) | strip leaderboards.js and standings.js | — | M1: restate hr_lb_boards and leaderboard_ranked | leaderboard-* re-pin | D3 / M1 | 2 |
| Bounty + Marks + Bounty Hunter + traits | delete core/bounty.js, bounty-progress.js, marks-record.js; strip legacy bounty block and TRAITS. climb-marks.js and mark-lore.js are KEEP | shops bounty table and marks currency, skills bountyHunter, gen-bounty-monsters, derive-marks | M1: active_bounty, hr_bounty_* tables, 15 fns, hr_traits, hr_trait_buy. M2: bounty branch of hr_credit_kills (C2), marks column | 8 bounty/marks/trait .mjs; split bounty-and-artisan.js (artisan half stays) | D1 / D2 / M1+M2 | 1 |
| Dungeons, scrip, QM, keys | delete dungeons.js, dungeon-scavenger.js, net/dungeon-*.js, spoils-sheet, dungeon-lore | data/dungeons.js; item-authority loses QM_STOCK. Rooms must be re-costed and spine step 17 rewritten first | M1: hr_dungeons, hr_dungeon_loot, hr_qm_offers, 5 fns; hr_unlock_offers req_item. M2: scrip column. Verbs go to C2 | 6 dungeon/QM .mjs | D1 / D2 / M1 | 2 (after designer ruling) |
| Hearth Token, earned gems, themes, IAP | delete gem-unlocks.js and house-themes.js; split gem-sites.js (keep the spend rows); strip legacy IAP, HOUSE_THEMES, buyTheme. KEEP theme-picker.js and the hero switcher | shops theme, cosmetic and iap rows; hearth_token item | M1: hr_gem_unlocks, hr_buy_gem_unlock, hr_day_budget_*. M2: hearth_tokens column, wallet credit callers. Bank and hero-slot pricing need a ruling | gem-daily-budget, gem-unlock-buy; re-pin gem-site-census | D1 / D2 / M1+M2 | 2 |
| Discord gift becomes the Hearthkin Banner | edit discord-invite.js | new banners.js | restate hr_claim_discord_gift (lane C, Security GO) | discord-gift rebind | separate lane C | before gem credit drops |
| Charms (trophies are KEEP) | delete hunters-ledger.js+css, core/charms.js, render/bestiary-charms.js; strip the charms read in bestiary-trophies | bestiary-charms, charm-lore | none. Multiplier removal goes to C2 | CHARM-*, HLEDGER-* | D1 / D2 | 1 (engine 3) |
| Companions / pets | delete companions.js, pets.js, pet-session.js, companion-lines; strip climb-marks COMPANION_MAX_LEVEL and the doll pet slot | companions.js and companion-unlocks.js data; shops companion rows | M2: hr_companion_grants, hr_companion_equip/grant, companion_equipped (hr_perks_of, hr_farm_harvest). Edge goes to C2 | 10 companion*.mjs | D1 / D2 / M2 | 3 |
| Gear recipes, scrolls, slot ladders, tools, Enchant v1 | delete net/enchant.js, core/tools.js, features/tools.js; strip legacy enchant and tool UI. KEEP recipe-book.js, recipe-scrolls.js, GEAR_ITEMS, elements.js | delete about 227 gear rows, the 5 scrolls, GEAR_RECIPES/GEAR_LADDERS, the 30 tool recipes, enchant runes | M2: tool_carry, enchant, hr_runes, plus one catalogue regen (also regenerates C2's hunt catalogue). Spine quests that pay tools are re-rewarded with a Security GO | enchant-intent, recipe-yield gear arm; ELEM-*; re-point CRAFT fixtures | D2 / D1 / M2 | 2 |
| Stonemason | — | BLOCKED until whetstones, fine/deep rune blanks, ashlar and keystone are re-homed and spine step 13 is rewritten | M2 | w0e and b357 cases | D2 after ruling | 4 |
| Boss of the Day card | delete boss-of-the-day.js and its CSS. botd.js and the combat-xp-cap WEEKLY_BONUS go to C2 | codex row | none | BOTD-ROW-1 | D1 | 1 (engine 3) |
| Set the Night / night plan | delete set-the-night.js, night-plan.js, night-plan.css, tools/set-the-night-page.mjs | — | none | NIGHT-PLAN-* | D1 | 1 |

## 2. Deletion lanes (no shared files with each other or with C2, B1 or W4)

- **D3 `lane/demo-keep-strip`, about 14 h, starts now.** Removes deleted-system reads from the KEEP files listed here, so later file deletes cannot break a reader.
  - Files: `src/chat.js`, `core/perks.js` (clanPerks and renownAllXp; makeBonus output must stay byte-identical), `net/{goal-claim,gold-sites,gem-sites,client-state,sync,activity,vigour}.js`, `features/{home-dashboard,character-page,profile-launchpad,spine-pointer,spine-reveal,journal,chronicle*,power-budget,homestead,climb-marks,leaderboards,standings,discord-invite,item-index}.js`, `settings-page.js`, `multi-character.js`, `render/{bestiary-trophies,bestiary,shop,equipment-doll,icons}.js`, `screens/{inventory,shop-counter}.js`, new `src/net/hr-clock.js`.
  - Also deletes the node tests and guards that cover only the deleted client surfaces in those files.
  - Chronicle needs a designer ruling. Until then it reads defensively.
- **D2 `lane/demo-data`, about 14 h, runs in parallel with D3.**
  - Files: `src/data/**`, except `hunts.js`, `supplies.js` and `world/**`.
  - Covers: recipes, shops, reveals, codex, signposts, screen-primers, goal-catalogue (daily rows only), rewards, gear-tiers recipe half, wave3, slot-ladders, library2, boss-forge, the stonecraft stonemason half (only after the ruling), deeds, renown-ranks, raid-bosses, dungeons, companions, bestiary-charms, catalogue-coherence (prune or VENDOR_TRASH the orphans, minus the KEEP consumers in review item 13), item-authority.
  - Also covers the generators `tools/gen-*.mjs` and `derive-*.mjs`, plus the data-importing node tests (lucky-finds, field-salvage, w0f, lore-notes and similar).
  - Data rows only. No catalogue SQL regen; that is M2.
- **D1 `lane/demo-shell`, about 20 h, merges main/set into itself after D3 lands.**
  - Files: `index.html`, `src/main.js` (rebase on B1's +4), `src/legacy.js`, `src/core-bridge.js`, `src/core/index.js` barrel, the whole-file client deletes in the table, `legacy.css`, `theme-cozy.css`, `audit-overrides.css`, `art-direction.css`, `board-and-shop.css`, `src/features/smoke/*.js`, `smoke-test.js`.
  - Ratchets `monolith-ratchet` down with its own tool.
  - One suite runs on the assembled set (§3.3a), plus the visual gate on Home, Inventory, Homestead and Settings.
- **Not in this sweep (Phase 2, after C2 and B1 merge):** engine and edge pieces go to C2 as a follow-on. These are:
  - party fence and tick-party
  - the botd/NO_BONUS, charm and trophy multipliers
  - the enchant third argument and tool speed
  - companion XP
  - the claim_reward, enchant, dungeon_settle and quartermaster_buy verbs
  - the accrue.js/record.js calls to renown, daily, companion and enchant code

  The final CI pass on `smoke.yml` and the baselines happens after C2, B1 and W4 merge, with each baseline regenerated by its own tool.

## 3. Server drops (lane C, staged by an agent, applied by the Coordinator)

**Preconditions for both migrations:**
- The wipe migration has been applied. `lane/c-closed-rebuild` does not exist locally or on origin, so the Coordinator must name an owner first.
- C2's `2026-10-21/22-hunt-sessions*.sql` has been applied.
- Both migrations chain after C2's restatement of `hr_rpc_gate` and `hr_assert_grant_hygiene` and re-derive from those bodies.

**M1 `2026-10-2x-demolition-drops.sql`: drops only. Light Security review; the reviewer confirms that no KEEP body reads these objects.**
- Drops tables, functions (including the `__ungated` twins), triggers, policies and baseline rows for: clans and castle, raids and the old clan hunt, muster/rally/world_event, bounty and traits, dungeons and QM, gem unlocks and themes, dailies, login, and hr_claim_rank.
- Restates only these KEEP readers: `hr_offline_cap_ms`, `hr_name_guard` (drop only the clans trigger), `hr_lb_boards` plus the `leaderboard_ranked` matview, `hr_rpc_gate` buckets, `hr_assert_grant_hygiene`, and `hr_client_rpc_baseline`.
- Carries a §4 self-check that executes SQL and asserts the objects are absent and the KEEP objects are present.

**M2 `2026-10-2x-demolition-restate.sql`: full Security GO, because it touches hr_apply, XP and items.**
- One restatement of `hr_apply`, `hr_state_of`, `hr_put_client_state__ungated` and `hr_perks_of`.
- Drops these columns: marks, active_bounty, renown_high, streak_*, tool_carry, enchant, dungeon_scrip, hearth_tokens, companion_equipped.
- Drops the party tables, ledger trigger and cron, with `hr_tick_roster`, `hr_settle_first_of`, `hr_accrue_cap_ms` and `hr_return_anchor_stamp` restated.
- Also drops hr_runes and hr_companion_grants.
- One catalogue regen covers both `2026-08-11-catalogue.generated.sql` and C2's hunt catalogue.
- The spine quest rewards are restated (bone_key and the tools leave road_hunt and road_forge/craft/cook).
- `player_ledger` kinds are **not** narrowed.

Both migrations must pass `schema-drift` with a byte-identical replay and `apply-order-honesty`. After the apply, the Coordinator runs `live-hash-drift --live --write` and `restore-census` and reclassifies the dropped tables. Repo migration files stay in place because they are the replay chain.

## 4. What stays for now, and who removes it

| Stays | Because | Removed by |
|---|---|---|
| Trophies (trophy_claim, hr_trophy_of, render/bestiary-trophies) | read by the bestiary, the Trophy Room, B1's hunt tracker and W4's wall | never; it is KEEP |
| `elements.js`, `MAX_TOTAL_DAMAGE_MULT`, WEEKLY_BONUS in combat-xp-cap | kill-time cap; lockstep SQL `hr_credit_combat_xp` | C2 (Security GO if changed) |
| goals.js, QUEST_REWARDS, CLAIMABLES, quest-nav, goal-claim transport | spine, hr_claim_quest, edge claim-reward | stays; only the daily halves go |
| Castle goods (timber_beam, iron_fitting, field_ration), wolf_pelt, dragon_gem, ancient_rune, rat_tail, small_fang | Homestead room costs and COACH_LOOT | designer re-cost, then D2 |
| Stonemason, blueprints, keys, farm_deed dungeon source | whetstones, rune blanks, Manor and rung-5 costs, spine steps 13 and 17 | designer ruling, then D2 + M2 |
| Gem wallet, bank space and hero-slot gem prices; Discord gem credit | the KEEP spend paths would be stranded | gold-reprice ruling plus the Banner lane, then M2 |
| Engine and edge refs (party fence, botd, charms, enchant, tools, companions, blessed flag, accrue/record calls) | inside C2 and B1 files | C2 follow-on |
| Ledger kinds clan, raid, rally, renown, enchant, bounty | append-only rows would violate a narrowed check | leave as-is |
| Item catalogue rows (gear, keys) | kept until Tyler's new roster lands | the roster lane |

## 5. Clean-slate guard: `tests/demolition-absence.mjs`

This extends `goal-board-gone.mjs` and is registered in `smoke.yml`. It ships with `--selftest`/`--mutate` proof: re-inserting one identifier must turn it red.

**Must be absent from `src/**`, `index.html` and `supabase/functions/**`:**
- Globals: HearthriseClans, HearthriseClanSeat(UI), HearthriseRaids, HearthriseParty, HearthriseMuster, HearthriseWorldEvents, HearthriseRenown, HearthriseDailyQuests, HearthriseDaily, HearthriseStreakChip, HearthriseDeeds, HearthriseBountyView, HearthriseCharms, HearthriseCompanions, HearthriseGemUnlocks, HearthriseTools.
- Constants and fields: DAILY_TASK_POOL, RAID_BOSSES, BOUNTY_SHOP, IAP_CATALOG, HOUSE_THEMES, partyIntentFence.
- Verbs: 'enchant', 'dungeon_settle', 'quartermaster_buy', 'claim_reward'.
- Data: no ITEMS row with `type:'tool'` or an elemental `tag:'rune'`; no skill `bountyHunter` or `stonemason`.

**Must be absent from `hr_client_rpc_baseline`, `hr_rpc_gate` and the schema replay:**
- `clan_*`, `raid_*`, `clan_hunt_declare`, `hr_party_*`, `world_event_*`, `hr_rally_*`, `hr_claim_rank`, `hr_claim_daily`, `hr_tally_state`, `hr_accept_bounty`, `hr_claim_bounty`, `hr_bounty_spend`, `hr_trait_buy`, `hr_buy_gem_unlock`, `hr_companion_equip`, `hr_companion_grant`.
- `hr_apply` must refuse the delta keys tool_carry, enchant and companion_xp.
- `hr_state_of` must not project marks, renown_high, streak_*, dungeon_scrip or hearth_tokens.

**Staging:**
- The client half lands with D1.
- The SQL half lands with M1, and its M2 assertions arm after M2 applies.
- Until C2 merges, an allowlist names the remaining engine identifiers, and the guard fails if that list grows.