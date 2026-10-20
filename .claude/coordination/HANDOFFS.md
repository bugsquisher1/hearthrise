# Handoffs

### 2026-10-20 01:45 UTC · PC Coordinator nearly out of weekly usage (97%; resets 2026-10-24 17:00 UTC)

**Live:** v0.2.13 (main 762bf0dc7). Applied today: core rebuild (15:15), hero-slots, bar-three-conditions, analyzer-basic, party-flow, party-security, town-own-characters, Andy allowlist, alpha premium. Edge hr-accrue 8c16396c. bug-report-bridge redeployed (v0.2.12).

**Pending, owned by PC agents (may finish after this note):**
- lane/a-names-nowalk: real hero names everywhere (character_names) + no auto-walk. Client only. Ship when green.
- lane/a-party-invite-menu: "Invite to party" on right-click; starting a hunt/party stops town activities; no default fishing after hunts; burying ends server-side. Has a STAGED migration: apply, then ship.

**Other account (cloud) lanes:** live engine (lane/b-live-hunt @ab64f8b81, option B), action bar (lane/b-vitals-hub), reopen RPC sweep (needs rebase onto v0.2.11+), content names, server cleanup, art audit, new ground 25-32, bestiary, PixelLab art (approved). Cloud has NO Supabase token: anything with a migration or edge change waits for the PC Coordinator (after the reset) or extra usage.

**Tracker:** https://claude.ai/artifact/81VCt3YuFkKbrtke5u9jqK (Tyler answers questions + row notes there; read BOTH at session start). Rulings: memory rulings-of-record. Gap list: .claude/coordination/sim-gap-list-2026-10-19.md. Lanes + files: ACTIVE_WORK.md.

**Known open bugs:** Andy's/Tyler's heroes can be stuck "busy" (hidden activity) — workaround Inventory > Stop (Andy reports no Stop line visible: the Stop line may not render; party-invite-menu lane fixes the cause server-side). Windows still push the world (lane/a-windows-float @09eac2750 is old WIP, unfinished). No death popup yet. Backups stopped after 2026-10-14 (PITR off): investigate.
