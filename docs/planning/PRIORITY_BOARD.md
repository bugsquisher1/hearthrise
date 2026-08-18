# Hearthrise — Living Priority Board

**The single source of truth for what's done, in flight, queued, and decided.**
Maintained by the Coordinator: backlog items are added here consistently as they
arise (player reports, feature ideas, discoveries) so nothing is lost. The HTML
board artifact renders this file. Keep status, priority, order, and notes current.

Legend — **Status:** ✅ shipped · 🔧 in progress · 📋 spec'd (approved, not built) ·
🧊 backlog · ⛔ blocked · ⏸️ back-burner (deprioritized, not cancelled).
**Priority:** P0 (now) · P1 (soon) · P2 (this cycle) · P3 (nice-to-have).

_Last updated: 2026-08-18 (b382). Current build: **b382**, live._

> **LOCKED DIRECTION (Tyler, 2026-08-18): STRUCTURE-FIRST. PAUSE ALL NEW FEATURES
> until the game is in a SCALABLE STATE. Beta pushed to NEXT WEEK (~2026-08-25).**
> Supersedes the 2026-08-17 "full list before beta." Build for the end-state
> ([[build-for-the-end-state]]: large-scale multiplayer semi-idle), clean code is a
> must. Only server-authority + the structural/architecture work (§9) proceed;
> bug-fixes allowed; NO new content/features until the exit criteria below hold.
>
> **SCALABLE-STATE EXIT CRITERIA (all must hold to resume features):**
> 1. Server-authority record flips ARMED + security-signed (gold + inventory un-forgeable). §2.
> 2. Render layer extracted from `legacy.js` → `src/render/*` far enough that UI changes are safe. §9.
> 3. Core screens on CSS tokens (no hardcoded colors on shipped surfaces). §9.
> 4. `hr-accrue` load-tested at target concurrency. §9.

## 1a · WHAT SHIPPED (the 2026-08-17 push, now closed) + WHAT'S PAUSED

| Item | Status | Pri | Notes |
|---|---|---|---|
| Sell fix (b377) · Clan gate (b378) · Elements/enchanting (b379) | ✅ | — | All shipped live. Enchant's full logged-in round-trip still to confirm on QA account. |
| Server-auth safety machinery (b380 inventory · b381 gold · b382 baseline) | ✅ dormant | — | The flips' safety layers, shipped dormant. See §2 for arm runway. |
| Quest-board rework | ⏸️ PAUSED | — | Design DONE, build PAUSED until scalable-state. Consolidates 4 quest systems → one board; unblocks DAILY_COUNTERS. Resume after §9. |
| Kindling / Beacon events (Muster) | ⏸️ PAUSED | — | Approved design; build PAUSED until scalable-state. |

## 1 · LAUNCH READINESS (beta → next week; after scalable-state)

| Item | Status | Pri | Notes |
|---|---|---|---|
| Dedicated test account | ⛔ | **P0** | Tyler action (Coordinator **cannot create accounts**). Unblocks the team playthrough + enchant round-trip verify. |
| Full-systems team playthrough + BALANCE audit | 🧊 | **P0** | After scalable-state: team runs every system on the test account, finds bugs + tunes balance. Then open keys. |
| Wire rooms + banner tiers | 🔧 | P2 | Generated & on disk; visible-seam cleanup (fits the render/CSS track). |
| Backups / restore DRILL | 🧊 | **P0** | HARD blocker for arming BOTH record flips. Needs a rehearsed run (runbook exists: docs/design/restore-runbook.md). |

**Decision pending Tyler:** wipe timing (confirmed: wipe before new players). See §7.

---

## 2 · SERVER-AUTHORITY PROGRAM (the integrity foundation — post-launch)

_Backend-architect plan delivered 2026-08-17 (review-ready, in security review). Key rulings folded in below._

| Item | Status | Pri | Notes |
|---|---|---|---|
| **Gold + gems → SERVER_OF_RECORD** (the pre-beta piece) | 🔧 | **P0** | Security GO-WITH-FIXES — all three code conditions now CLOSED: (1) clan contribute gated by b378 clan-block; (2+3) **b381** gated every client-authored gold grant behind `clientMayWriteRecordField` (no-op today, real gate on flip) + added census L8 guard so no ungated value-transfer can regress. F1–F10 confirmed closed. Gold/gems still UNARMED (record.js untouched). **Remaining before the ARM** (uncomment record.js:248-251): **(A)** credit muster/raid/quest/bounty/daily/renown gold SERVER-SIDE — else those rewards pay ZERO on flip (ties into DAILY_COUNTERS/MARKS_COLUMN; quest-board rework unblocks the daily/quest half). **(B)** reliability's restore drill. **(C)** the wipe. Safety is done; the reward-crediting + drill + wipe are the runway. |
| Inventory-absolute flip — **REAL-LAUNCH, not beta** | 🧊 | P1 | Expert verdict: CANNOT be made safe pre-beta. Needs every live bag-writer server-side (Model A: gather/craft/combat-drop via the accrual window — multi-day) + a rehearsed restore drill + (under amnesty) a wipe first, or absolute-apply irreversibly deletes freshly-crafted items. **b376 merge-mitigation IS the correct beta posture** (no data loss, dupe remains). Do NOT rush-arm before beta. |
| **Inventory flip → arm "server owns the bag"** — THE SINGLE ACTIVE TRACK | 🔧 | **P0** | Sole priority (Tyler, 2026-08-17). Step 1 (audit) + **Step 2 (ownership predicate + carve-out) SHIPPED DORMANT b380** — `serverOwnedItem` partition + guards, `isInventoryAbsolute()` false in prod so behaviour is unchanged. **Security review: GO-WITH-CONDITIONS.** **KEY REFRAME (verified):** the cross-player forgery boundary for ITEMS is ALREADY held today by the server market/apply RPCs reading `player_inventory` under lock — a forged item quantity can't be listed/sold/traded to another player *now*. The three residuals (forged excluded items, overlap items magic_essence/wheat, companion doubleDrop) are LOCAL-display/data-loss only, NONE cross-player. **Arm conditions:** (1) complete server inventory baseline [the real blocker — live craft/drop chains settle completely+in-order], (2) rebuild the partition against a loaded `window.DUNGEONS` at the arm site + guard test, (3) completeness guards in release gate, (4) equip flip armed, (5) drift soak. Then restore drill → wipe → arm. |
| Clan pass 2 | ⛔ | P1 | `clan_contribute` mints 10M/day (no debit), `clan_feast_deposit` free meter, slot-derivation fix, revoke dormant `clans` grants. Revoke of dormant grants = rank 2 (cheap, safe, shippable now); `clan_contribute_gold` depends on gold ownership above. |
| Phase 3 ledger accumulator | 🧊 | P2 | Before real player growth (per-write journalling at scale). |
| Leaderboards off server tables | ✅ | — | Shipped (b374). Last cross-player ranking forgery closed. |
| Equip / market / clan-deposit authority | ✅ | — | Shipped. Forged values can't cross to another player's economy. |

---

## 3 · FEATURE ROADMAP (the original ~15-point list; superseded mid-week by the integrity program)

| # | Item | Status | Pri | Notes |
|---|---|---|---|---|
| 7 | Monster rework (Tibia 11 classes) | ✅ | — | Folded 111→108, painted portraits. |
| — | Combat rework (War Table + Fight) | ✅ | — | Shipped b365. |
| — | Items / itemization + Review Book | ✅ | — | Review book shipped; item waves wired. |
| — | Hunt band fairness | ✅ | — | Applied to prod. |
| 13 | Auto-eat in bounty shop | ✅ | — | 100-mark unlock; honesty fixed b373. |
| 14 | Build-button-to-top + QoL | ✅ | — | + level-up celebration, requirement inspector, etc. |
| 10 | Muster → Kindling/Beacon events + donation pools + weekly blessing vote | 📋 | P2 | Approved, NOT built (only name echoes exist in code). Weekly reset Sunday night; vote closes 1 day prior. |
| — | Bestiary Charms (PROG-01) | 📋 | P2 | Approved, NOT built. |
| — | Diaries (PROG-02), PROG-03, PROG-08 | 📋 | P2 | Approved, NOT built. |
| 12 | Elements / enchanting | 🧊 | P2 | Gated on monster rework (done) → now next-eligible. Steal from RS/Melvor. |
| — | Completion Log · Quest Board rework · supply-projection UI · world-boss blessing | 🧊 | P3 | From the batch-2 build sequence; mostly unbuilt. |
| 6 | Practice / familiarity tiers | ⏸️ | — | Back-burner. Spec in progression-depth.md Phase 2. |
| 11 | Buy-offers return | ⏸️ | — | Back-burner. |

---

## 4 · ART PIPELINE

| Item | Status | Pri | Notes |
|---|---|---|---|
| Combat/skills/bounty backgrounds (12) | ✅ | — | Shipped b375, painterly, per monster class. |
| Home banner repaint | ✅ | — | Shipped b374 (dawn splash). |
| Rooms (8) + banner tiers (6) | 🔧 | P1 | Generated via API, on disk, queued to wire. |
| Re-roll 2 rejected backgrounds (demon, board_planks) | 🧊 | P3 | Fall back cleanly meanwhile. |
| Re-roll room interiors to matched painterly style | 🧊 | P3 | Interiors came out more storybook-outlined than landscapes. Tyler's call after seeing them wired. |
| **Full icon re-do to quality bar (512 items + 111 monsters)** | 🧊 | P2 | The big future art investment. NOT a quick swap (transparent, 32–64px, ~$25–40, multi-day). Post-ship. |

---

## 5 · GAME MODES (after base game proven)

| Item | Status | Pri | Notes |
|---|---|---|---|
| Ironman · Group Ironman · Hardcore Ironman · Hardcore (normal) · Hardcore Group Ironman | 🧊 | future | Needs server-authority to enforce (Ironman = server trade restriction; Hardcore = server-attested death). Per-account server flag at creation. Strong retention lever. |

---

## 6 · DEFERRED DESIGN SPECS (ready to build when slotted)

| Item | Status | Pri | Notes |
|---|---|---|---|
| Super-rare "fabled" drops (reveal + clan broadcast + shareable card) | 📋 | P2 | ~2-day Phase 1, plumbing 80% there. Behind integrity work. `docs/design/super-rare-drops.md`. |
| Layered-additive homestead art | 🧊 | P3 | The clan-castle-style build-up; richer than tier-swap. |
| Enchant v2 — permanent per-weapon binding + expensive wipe rune | 🧊 | P2 | Tyler direction (2026-08-17): v1 enchant is ephemeral (clears on any weapon swap, re-applied for 1 rune). Make it PERMANENT per-weapon (each weapon remembers its element, survives swaps) and require an EXPENSIVE "wipe" rune to change it — for commitment/weight + a rune/gold economy sink. Needs per-weapon-instance tracking (v1 deferred it). Wipe price is the key tuning knob (meaningful vs. punishing). Decide permanence + wipe cost in the enchant balance pass at the launch gate; build post server-authority. |
| Enchant v2 — magic as the FLEXIBLE style (dual-element) | 🧊 | P2 | Tyler direction (2026-08-17): today magic enchants identically to melee (one element, +15% vs weak). Give the three styles distinct identities: melee/ranged commit to their one bound element; MAGIC can channel a *different* element per fight, covering two weaknesses = versatility as its identity. NOTE: the current build has no per-cast element selection (magic is just a combat style), so this is a NEW magic subsystem, not a tune. Decide alongside enchant permanence in the enchant/magic-identity design pass; post server-authority. |

---

## 7 · DECISIONS PENDING TYLER

| Decision | Default acting-on | Notes |
|---|---|---|
| Wipe vs. amnesty at cutover | amnesty | Repo says amnesty (2026-08-15). Recommend ONE wipe right before widening invite, gated on record-flip + currency authority + a restore drill. |
| Stand up the test account | — | Highest-leverage launch-prep enabler. |
| Room-interior style re-roll | — | After seeing rooms wired. |

---

## 8 · KNOWN RESIDUALS / SMALL BUGS

| Item | Status | Pri | Notes |
|---|---|---|---|
| Craft material dupe | documented | P2 | Accepted pre-wipe trade (dupe > data loss). Real fix = inventory authority (§2). |
| 32px requirement chips below 44px tap target | 🧊 | P3 | Art-director handoff. |
| P3 polish backlog (various from audits) | 🧊 | P3 | In `.claude/coordination/DISCOVERIES.md`. |

---

## 9 · CODE HEALTH / ARCHITECTURE (the clean-code track — Tyler: "clean code is a must")

_Code-health audit 2026-08-18. Headline: **on a real trajectory to the large-scale-multiplayer end-state — the hard bet (server-authority) is won and proven live, the logic core (`src/core`) is clean/pure/dual-runtime. The liability is the RENDER layer.** Four-layer scorecard: Data 85% · Logic 80% · **Render 20%** · Platform 40% — "built the load-bearing half first."_

| Item | Status | Pri | Notes |
|---|---|---|---|
| `legacy.js` render-layer split → `src/render/*` | 🔧 **active** | **P1** | The monolith is **18.8k lines**, mostly UI wiring. Strangler-fig, one domain at a time, behind the smoke suite + visual gate. **Extraction #1 SHIPPED b383**: Lifetime Stats modal → `src/render/lifetime-stats.js` (−155 lines, pure refactor, visual-gate identical). Pattern established: `docs/design/render-extraction-pattern.md` (extraction log seeded). Continuing overnight. THE fix for recurring visual-gate breaks (b361 class). |
| CSS → tokens, screen-by-screen (convert-as-you-go) | 🔧 | P1 | 1,756 hardcoded hex, 1,343 `!important` across 9 sheets (theme-cozy.css alone: 947 !important). Guard tests catch each conversion. Start with combat + inventory (densest, break most). Unblocks the render layer + themes/skins. |
| Adopt `src/platform/storage.js` across 37 direct-localStorage files | 🧊 | P2 | Mechanical, one file at a time. Prereq for the Steam/mobile platform seam. |
| Load-test `hr-accrue` at a few hundred concurrent intents | 🧊 | P2 | The one "fine at 5, unknown at 500" — verify pooler connlimit 20 + rate-bucket throughput before real launch. |
| Correct doc drift as the split proceeds | 🔧 | P3 | CLAUDE.md line-count corrected 2026-08-18; keep SYSTEMS_MAP in sync when render extraction starts. |
| Do NOT | — | — | Rewrite the monolith wholesale (rejected); widen bump script into supabase/tests (trap); reintroduce a 2nd away-combat path or a data double-copy (both guard-tested). |
