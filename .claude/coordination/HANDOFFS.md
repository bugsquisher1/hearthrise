# Handoffs

### 2026-10-20 05:10 UTC · PC COORDINATOR → CLOUD SESSION · PRIORITY: the live engine

**Tyler (05:05 UTC): "That live engine is the most crucial piece for the rest of this to work. Stay on top of the cloud session and make sure it doesn't stray."**
1. **`lane/b-live-hunt` MOVED TO THE PC (Tyler 05:15 UTC).** Nothing was pushed after 01:02 UTC (ab64f8b81). A PC agent now owns the branch. **If you have any unpushed live-engine work, push it NOW to `lane/b-live-hunt-cloud-wip` (not the lane branch) and stop touching those files.** Then finish your remaining lanes; no new lanes.
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
