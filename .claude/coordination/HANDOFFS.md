# Handoffs

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
- lane/a-names-nowalk: real hero names everywhere (character_names) + no auto-walk. Client only. Ship when green.
- lane/a-party-invite-menu: "Invite to party" on right-click; starting a hunt/party stops town activities; no default fishing after hunts; burying ends server-side. Has a STAGED migration: apply, then ship.

- lane/c-consume-cd-travel @dc7344370 (pushed, report not received): food+drink share ONE 2 s cooldown, "Millrace Sewer" → "The Sewer", travel_s = 0, the two hunt-core red tests fixed. Check its migrations/edge, apply, deploy, ship.

**Other account (cloud) lanes:** live engine (lane/b-live-hunt @ab64f8b81, option B), action bar (lane/b-vitals-hub), reopen RPC sweep (needs rebase onto v0.2.11+), content names, server cleanup, art audit, new ground 25-32, bestiary, PixelLab art (approved). Cloud has NO Supabase token: anything with a migration or edge change waits for the PC Coordinator (after the reset) or extra usage.

**Tracker:** https://claude.ai/artifact/81VCt3YuFkKbrtke5u9jqK (Tyler answers questions + row notes there; read BOTH at session start). Rulings: memory rulings-of-record. Gap list: .claude/coordination/sim-gap-list-2026-10-19.md. Lanes + files: ACTIVE_WORK.md.

**Known open bugs:** Andy's/Tyler's heroes can be stuck "busy" (hidden activity) — workaround Inventory > Stop (Andy reports no Stop line visible: the Stop line may not render; party-invite-menu lane fixes the cause server-side). Windows still push the world (lane/a-windows-float @09eac2750 is old WIP, unfinished). No death popup yet. Backups stopped after 2026-10-14 (PITR off): investigate.
