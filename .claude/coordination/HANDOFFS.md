# Handoffs

### 2026-10-25 · SYSTEMS (lane/b-tutorial-rings, tutorial lane 2) → COORDINATOR / DESIGNER / ART · what shipped and what is left

1. **Interface live:** `coachFactsOf(cs, account)` (src/shell/launcher.js) passes read / roster / slotsOwned / playLimit (`AccountSession.statedLimit()`, never a fallback) / sellable (`bag-model.js lootSale`, the button's own plan) / upgrades into `pointerCardOf`; the residue `coach.read` holds Got it presses and read-on-sight cards (`noteCoachSight`, the display tick). `ringPlan` rings `card.hooks` deepest first for every other anchor; the characters screen rings Create hero itself (boot.js `ringCharacters`).
2. **Services is the Shop's third tab** (Tyler 10-25): window row gone, `tabKeys: { r: 'services' }` on the Shop (window-manager.js `openTab`/`takeTab`), services.js is now the tab's pane; Blessing cards ring Shop icon -> Services tab -> next Bless; the death popup has a Blessings button there. The stamina-low card rings the bar lane's new `+` (`data-coach-hook="stamina-buy"`).
3. **Designer, decide:** "Sell all loot" now keeps a material a recipe the hero can make NOW spends (Silk Thread at Crafting 1, Copper Ore at Smithing 1), row 22; Normal Log is still sold (no client recipe spends it; the house costs are server-side). The return keeps the hunt bar (Summary only) while the summary is open and drops it when the summary closes; say if it should go at once.
4. **Still open (not in this lane):** row 15 (Hunt prep copy), 16 (stance numbers on the bar's panel), 18 (Hunts opens on the card's ground), 21 (Bless all), 23 (Plant all), 24, 26; the cards that say "Press slot N" inside Configure action have no `inWindow` words (lane 1 data); `[hunt-scene] no sprite for unit N (null)` warnings seen on the phone run (world renderer).

### 2026-10-25 · SYSTEMS (lane/b-tutorial-cards, tutorial lane 1) → TUTORIAL LANE 2 (rings and placement) · the interface

Lane 1 is data and facts only; every card shows today without the hooks below (no ring there yet). Lane 2:
1. **Pass the shell's facts:** `pointerCardOf(cs, sh)` (src/session/tutorial-sections.js header). `sh.read` = the residue `coach.read` (string ids; add it to sanitizeCoach, display state like `alerts.seen`); `sh.roster` = AccountSession roster rows + `open`/`hunting`; `sh.slotsOwned`, `sh.playLimit` (limit()); `sh.sellable` = bag-model lootToSell priced and unlocked via sellPlan (the SAME function the button uses); `sh.upgrades` = upgrade-plan's Equip upgrades items. Absent = that card is passed by (never a wall), so B4, C4, D1-D3, F4, F5, F7, C1, D4, D5, E1 are invisible until this lands.
2. **Got it / read on sight:** a card with `gotIt` gets a Got it button that adds its id to `coach.read`; a `read` card without `gotIt` (first_eat, first_drink, stamina_low) is added to `coach.read` once it has been on screen its readMs.
3. **New hooks to add (each card's `hooks`, tokens written by cardFor):** `[data-coach-hook="level"]` (Level medallion), `[data-coach-hook="stamina"]` (stamina timer), `[data-coach-hook="stance"]` (the stance control, back on the bar per Tyler 10-25), `[data-hs-win="shop"] [data-coach-hook="sell-confirm"]` (Sell all loot's confirmation), `[data-hs-win="inventory"] [data-rule-item]` (a This hunt row's loot rule), `[data-hs-win="hunt-prep"] [data-coach-hook="setup-save"]` (Save current setup). Existing selectors the cards name for ringPlan: `.ca-rs[data-store="{store}"]`, `.ca-cond[data-cond="0"] [data-x="dec"]`, `.hw-tab[data-tab="sell"|"hunt"]`, `[data-hs-act="sell-loot"|"bless"|"equip-upgrades"|"setups"]`, `.hw-slot[data-slot="weapon"]`, `.char-tool[data-app="characters"]`, `.char-pick[data-app="create"]`, `.char-tab[data-slot="{other}"]`.
4. **ringPlan:** the new anchors (inventory, shop, services, storage, hunt_prep, house, characters, strip) fall to `default: []` after the icon ring; read `card.hooks` there. `card.textIn` is the card's words inside its window (row 20). `heldCard`'s `passed` replay assumes only the first-minute cards are AUTO (validate() enforces reactive cards come after them).


### 2026-10-24 · ART DIRECTOR (lane/a-mobile-p1) → BAR REDESIGN LANE + SECOND PHONE LANE · what 667x375 still breaks

Left alone because those lanes own the files (brief: action-bar.js, launcher.js, character-strip.js):
1. **Action bar (bar redesign):** at 667x375 the phone bar's content is ~40 px wider than the screen (slots 10/20 and the plaque cut at the right edge; `.hb-bar` max-width calc(100vw - 16px) cannot hold its min content). Measure at 667x375, not only 922x423.
2. **Icon row and character strip (second phone lane):** at 667x375 the icon row is 710 px (16 x 44 px) and loses its last icon (Report a problem); the character strip is 726 px. lane/a-mobile-p1 clipped `.app.is-game` and `.hs-screen` (`overflow: clip`), so they no longer make the page pan sideways, but the row itself must fit.
3. **Coach card (second phone lane):** on a phone, while the analyzer shows, the coach card under the hunt bar is hidden by hunt.css (it covered the analyzer's head and close). If the coach should instead move, that is launcher.js's placeCoach.
### 2026-10-24 · SYSTEMS (lane/b-tutorial-fixes) → DESIGNER / lane/a-mobile-p1 · found while playing the fixed tutorial

1. **(designer, balance)** The kit tank (sword + shield, no armor) the chain sends into Meadowbrook Thicket at Level 5 died 4 times there (Level 5-10, killed by a Gray Wolf, death_log) in the harness; the 10-24 playtest hero, with Shop gloves, died 0 times. The chain teaches no armor before the Thicket. Look before the phone tester's first Thicket hunt (art/review/tutorial-fixes-2026-10-24/README.md).
2. **(lane/a-mobile-p1, hunt.css:586)** Configure action at 667x375 is 800 px wide (`max-width: none` vs the window's inline 800 px; the coach card hidden, same width): Save is off-screen, so no bar edit works at that size. `max-width: 100%` beside the existing `min-width: 100%` should fit it (shot s02 in the same folder).
3. **(designer, copy)** "Out to the brook" said "about a quarter of an hour"; the Cellar pays ~4,100 Level XP/h, so Level 5 is ~25 min: the card now says "about 25 minutes".

### 2026-10-22 · ART DIRECTOR (lane/b-hunts-detail) → BACKEND / SYSTEMS · the Lane C half of the Hunts page

The client half (B #1, A #1, A #5, B #3) is built on lane/b-hunts-detail from data the envelope already carries. What it could not show needs server fields (Lane C first, then a B lane wires them):
1. **Every setup's bar** in `hr_hunt_presets_view` (first four actions; supply slots with item, own count and store row): Go as shows icons and Before you go lines for a setup that is not on yet.
2. **A #2** `hunt_density.preset` (the setup per ground): Go as pre-picks it.
3. **C #1** finder listings carry their own ground + seat level + leader flag: today `p_hunt` matches the ground a party last hunted.
4. **C #5** seat readiness reasons in the party view: Before you go becomes one line per seat for a leader.
5. **A #6** `hunt_bests.supply_h`: the gold runway line.
6. (Systems, client) `refusal.js` reads `item_id` only; `hr_hunt_preset_apply` sends `item` with `missing_item`.

### 2026-10-20 05:10 UTC · PC COORDINATOR → CLOUD SESSION · PRIORITY: the live engine

**Tyler (05:05 UTC): "That live engine is the most crucial piece for the rest of this to work. Stay on top of the cloud session and make sure it doesn't stray."**
1. **`lane/b-live-hunt` stays with the CLOUD (Tyler 05:30 UTC; the PC agent was stopped before pushing anything).** It is priority 1: option B's core next (browser runs the engine live for the viewed party, `hunt.live`, member assembly into `src/core`, per-swing reconcile, live HP bars). Push after every working step, at least hourly, and post status here. Engine deploy and applies go through the PC.
2. **One tracker:** the live tracker is the artifact https://claude.ai/artifact/7dvCZ7Z3XyALQtamvQXd1t ("Hearthrise Build Review"). It's on the same second account, so use ArtifactData directly: `builds`, `tests`, `questions`, `events`, `items`. `TRACKER.md` is only a read-only mirror the PC keeps; don't record answers there. Your five 10-20 answer blocks are being folded into the artifact now.
3. **Bestiary (Tyler 10-20, final):** kill stages DOUBLED to 2,500 / 5,000 / 10,000 / 20,000; relic boosts stay ×1.05 / 1.12 / 1.18 / 1.25. Your other bestiary answers stand.
4. **Shipped tonight:** v0.2.14 server + engine (hr-accrue 73c8d5c9, consume-cd-travel) are live; client on GitHub now. Rebase/merge `main` before the engine deploy so the bundle carries `src/core/hunt/consumables.js` + `conditions.js` + `hunt-spawn.js` from it.
5. **Main is red since v0.2.13** (client-guards: "Self-checks may not delete a row they did not create" + "Pixel item icons"; economy-selftests: "Hunt core — movement, leash, world step"; db-replay-7: "Lane S2 server"). If any of those is in your lanes' files, fix at source in that lane and say so here.

### 2026-10-20 03:15 UTC · PC COORDINATOR (second account) → CLOUD SESSION · seat taken; integration order

**Seat:** the PC session holds COORDINATOR.md from 03:00 UTC. Cloud stays a lane worker: push lane branches, report here (newest at top, on your branch is fine: I fetch `claude/*` and merge notes into main). I apply, deploy, push `main`. The tracker artifact returns 404 for this account; until Tyler re-shares it, rulings come from memory `rulings-of-record` (tracker answers through 10-20 folded in).

**Integration order** (one at a time; each later lane merges `main` and REGENERATES its `*.generated.sql` with `--new` after the one before it lands; never hand-merge):
1. `lane/c-consume-cd-travel` (PC): 10-28 consume-defaults, hunt-enter-after-stamina, **hunt-sessions-catalogue.generated**. Back with its lane to merge main (apply-order conflict). Note: same date as the cloud's 10-28 catalogues, so content names / new ground / bestiary regenerate on top of it.
2. `lane/a-names-nowalk` (PC) @64ddd39fa: pin restated (live holds the 08-11 body comment-stripped, md5 f03cc173); replay green. Applies after 1.
3. `lane/a-party-invite-menu` (PC): 10-30 party-invite-player, town-activity-yields, hunt-sessions-catalogue.generated. Being finished now.
4. `lane/c-reopen-rpc-sweep` (cloud, READY @c02b3d37f).
5. Then as each reports ready: content names → new ground 25–32 → bestiary (needs `relicMult` from live engine) → live engine → action bar → sql-tests-green → name registry → server cleanup (on top of S1; edge redeploy).

**Cloud, please:** keep each lane's report to sha + guards with exit codes + apply order + `pack-edge --hash` if the edge moved. Don't start new lanes on `src/core/hunt/consumables.js`, `src/data/hunts.js`, `src/data/consumables.js`, party/social menu files, or `tools/gen-hunt-sessions.mjs` until items 1–3 are on main.

### 2026-10-20 · CLOUD SESSION (second account) → the PC session taking over as Coordinator · cloud lanes

**Takeover:** the PC terminal signed in with the second account takes the Coordinator role (COORDINATOR.md) while the primary account is out until 2026-10-24 17:00 UTC. The cloud session has no Supabase token: it stages, pushes lane branches and reports; the PC session applies, deploys, pushes `main` and posts Discord. Nothing in this list is applied. Verify each sha against `git ls-remote` before merging; lanes still running will push newer shas.

| Lane | Branch | State (at writing) | Server files (apply in this order) | Notes |
|---|---|---|---|---|
| Reopen RPC sweep (S1) | `lane/c-reopen-rpc-sweep` @ `c02b3d37f` | READY | `2026-10-30-reopen-rpc-sweep.sql` (after party-security) | Drops dormant gold/gem claim RPCs (reopen BLOCKER), revokes `hr_market_*`, new guard `tests/rpc-execute-surface.mjs`. live-hash-drift wants 15 bodies out + new `hr_rpc_gate` (yours, after apply). |
| Server cleanup | `lane/c-server-cleanup` | building (on top of S1) | `2026-10-31-server-cleanup.sql` + edge (deletes `market.js`, `unlock-buy.js`) | Drops clans/raids/old market/companions/world events/quests/leaderboards/workers/unlock buys/`hr_trait_buy`. KEEPS `hr_login_claim`, `hr_farm_upgrade_plot` (reopen review list), hero-slot buying, set_activity/artisan. Edge redeploy needed. |
| Live engine (option B) | `lane/b-live-hunt` (PC WIP `ab64f8b81` + cloud commits) | building | new dated migrations (retire `hr_hunt_party_create`, `hunt.live`) + hr-accrue edge | Also: brown squares, caster bolt pick (scene.js), eat refused mid-hunt, req.json cap, `relicMult` seam. Report gives the edge hash. Play gate on live. |
| Action bar | `lane/b-vitals-hub` (PC WIP `944e305ad` + cloud) | building | none expected | Vitals hub, swap/insert, struck-slot reasons, settings folded into the bar. Desktop visual gate. |
| Bestiary | `lane/c-bestiary` | building | `2026-10-28-bestiary-account.sql`, `2026-10-28-bestiary-catalogue.generated.sql` | Account-wide kills, stages 1,250/2,500/5,000/10,000, relic x1.05/1.12/1.18/1.25, gold fee via ledger, new window. Needs the live-engine `relicMult` seam. |
| Content names | `lane/d-content-names` | final checks | `2026-10-28-content-names-catalogue.generated.sql`, `2026-10-28-content-names-hunt-sessions-catalogue.generated.sql` | Filler-word renames, `discipline` on 4 magic drops. |
| New ground L25–32 | `lane/d-ground-25-32` | building | `2026-10-28-hunterall-132.sql`, `-hunts-catalogue`, `-hunt-sessions-catalogue`, `-pebblebrook-catalogue` (generated) | Measured walk-through in its report. |
| run-sql-tests reds | `lane/c-sql-tests-green` | building | `2026-10-30-social-rate-rejections.sql` | The 14 static failures on main. |
| Name registry (MED sec) | `lane/c-name-registry` | building | `2026-10-30-name-registry.sql` | Display vs character name collision, both directions. |

**Merge hazard:** content names, the new ground and bestiary each regenerate overlapping `*.generated.sql` catalogues (hunts, hunt-sessions) dated 2026-10-28. Never hand-merge them: merge one lane, then have the next lane merge `main` and regenerate with `--new` (CLAUDE.md §5), so the newest generated file carries every row.

**Shipped already (v0.2.12):** `lane/a-caster-vfx`, `lane/a-monster-art-gaps`, `lane/a-bug-bridge-bounds`.
**Parked by Tyler:** PixelLab art (approved, but no connector in the cloud; run it from the PC when wanted).
**Open, needs a human:** database backups stopped after 2026-10-14 (PITR off), per the primary account's note above.

### 2026-10-20 01:45 UTC · PC Coordinator nearly out of weekly usage (97%; resets 2026-10-24 17:00 UTC)

**Live:** v0.2.13 (main 762bf0dc7). Applied today: core rebuild (15:15), hero-slots, bar-three-conditions, analyzer-basic, party-flow, party-security, town-own-characters, Andy allowlist, alpha premium. Edge hr-accrue 8c16396c. bug-report-bridge redeployed (v0.2.12).

**Pending, owned by PC agents (may finish after this note):**
- lane/a-names-nowalk @109d97c31: real names + no auto-walk. Client tests green on main+lane. Its migration 2026-10-29-character-names-everywhere.sql FAILED its pin on prod (hr_chat_name_authority moved, live md5 f03cc173…; rolled back, nothing applied 02:50 UTC). Restate it from the live body (re-pin), re-run the self-check, then apply + ship. Client half must not ship before the migration.
- lane/a-party-invite-menu: "Invite to party" on right-click; starting a hunt/party stops town activities; no default fishing after hunts; burying ends server-side. Has a STAGED migration: apply, then ship.

- lane/c-consume-cd-travel @dc7344370 (pushed, report not received): food+drink share ONE 2 s cooldown, "Millrace Sewer" → "The Sewer", travel_s = 0, the two hunt-core red tests fixed. Check its migrations/edge, apply, deploy, ship.

**Other account (cloud) lanes:** live engine (lane/b-live-hunt @ab64f8b81, option B), action bar (lane/b-vitals-hub), reopen RPC sweep (needs rebase onto v0.2.11+), content names, server cleanup, art audit, new ground 25-32, bestiary, PixelLab art (approved). Cloud has NO Supabase token: anything with a migration or edge change waits for the PC Coordinator (after the reset) or extra usage.

**Tracker:** https://claude.ai/artifact/81VCt3YuFkKbrtke5u9jqK (Tyler answers questions + row notes there; read BOTH at session start). Rulings: memory rulings-of-record. Gap list: .claude/coordination/sim-gap-list-2026-10-19.md. Lanes + files: ACTIVE_WORK.md.

**Known open bugs:** Andy's/Tyler's heroes can be stuck "busy" (hidden activity) — workaround Inventory > Stop (Andy reports no Stop line visible: the Stop line may not render; party-invite-menu lane fixes the cause server-side). Windows still push the world (lane/a-windows-float @09eac2750 is old WIP, unfinished). No death popup yet. Backups stopped after 2026-10-14 (PITR off): investigate.
