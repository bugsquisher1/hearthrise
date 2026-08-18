# Hearthrise — Living Priority Board

**The single source of truth for what's done, in flight, queued, and decided.**
Maintained by the Coordinator: backlog items are added here consistently as they
arise (player reports, feature ideas, discoveries) so nothing is lost. The HTML
board artifact renders this file. Keep status, priority, order, and notes current.

Legend — **Status:** ✅ shipped · 🔧 in progress · 📋 spec'd (approved, not built) ·
🧊 backlog · ⛔ blocked · ⏸️ back-burner (deprioritized, not cancelled).
**Priority:** P0 (now) · P1 (soon) · P2 (this cycle) · P3 (nice-to-have).

_Last updated: 2026-08-17 (b377). Current build: **b377**, live._

> **LOCKED DECISION (Tyler, 2026-08-17): FULL LIST BEFORE BETA, DATE SLIPS.**
> Tyler chose to build the whole pre-beta list — server-authority program,
> elements/enchanting, block clan, quest-board rework, kindling/beacon events —
> THEN stand up the test account for a full team playthrough, THEN open the 20
> keys (date moved past "tomorrow"; remaining budget goes to building now and
> bug-fixing once keys open). Coordinator flagged the bug-injection + budget risk;
> Tyler accepted it with eyes open. The five items below in §1a are now the gate.

## 1a · THE PRE-BETA BUILD LIST (the locked gate)

| Item | Status | Pri | Notes |
|---|---|---|---|
| Server-authority program (record flip: gold/skills/inventory + clan pass 2) | 🔧 | **P0** | backend-architect producing the review-ready plan; arming gated on security + reliability sign-off + restore drill. The data-loss-sensitive long pole. See §2. |
| Block clan as "Coming Soon" | ✅ | — | SHIPPED b378. Roadmap card + `contribute()`/`feastDeposit()` hard-disabled behind `CLAN_LAUNCHED`. Visual gate passed (1440×900 + 922×423). ALSO closed security's P0 gold-flip blocker (Finding #1). One flag re-enables when clan pass-2 lands. |
| Elements / enchanting | 📋→build | **P0** | Design DONE (game-designer, 2026-08-17): tight v1 — bind ember/frost/poison to weapon, ×1.15 vs element-weak, rides existing `weaknessInfo` seam (bane.js twin), one `enchant` verb cloning `equip`, essences drop→runes crafted at Crafting 25. Away-parity for free. Ready to build; queued behind clan-block integration. |
| Quest-board rework | 📋→build | **P0** | Design DONE (game-designer, 2026-08-17, verified by playing a fresh save): CONSOLIDATION not new mechanics — 4 overlapping quest systems (onboarding chain, daily tasks, daily/weekly goals, bounties) → ONE board, 3 shelves + bounty tab, one progress model, one Claim gesture, capacity-gated daily draws (fixes "Kill 60 at CL1"). New `src/data/quests.js`. Server side (`player_quest_progress` + `claim_reward` for kind:'quest') UNBLOCKS DAILY_COUNTERS. Ready to build; queued. Client consolidation degrades gracefully to today's payout if server slips (switch OFF), so not beta-blocking. |
| Kindling / Beacon events (Muster) | 📋 | **P0** | Approved design exists; needs build-ready spec reconciling it with current code, then build. |

## 1 · LAUNCH READINESS (after the build list, before opening keys)

| Item | Status | Pri | Notes |
|---|---|---|---|
| Dedicated test account | ⛔ | **P0** | Tyler action (Coordinator **cannot create accounts**). Unblocks the team playthrough + every future new-player test. |
| Full-systems team playthrough | 🧊 | **P0** | After the build list lands: team runs every system (UI/UX/Art/Systems) on the test account, finds bugs. Then open 20 keys. |
| Wire rooms + banner tiers | 🔧 | P1 | Generated & on disk; closes the last visible seam (grey placeholder rooms next to painted everything). |
| Backups / restore DRILL | 🧊 | P1 | Pro plan has daily backups; a RESTORE has never been tested. HARD blocker for arming the server-authority record flip. |

**Decision pending Tyler:** wipe vs. amnesty at cutover (acting on amnesty). See §7.

---

## 2 · SERVER-AUTHORITY PROGRAM (the integrity foundation — post-launch)

_Backend-architect plan delivered 2026-08-17 (review-ready, in security review). Key rulings folded in below._

| Item | Status | Pri | Notes |
|---|---|---|---|
| **Gold + gems → SERVER_OF_RECORD** (the pre-beta piece) | 🔧 | **P0** | Security verdict (2026-08-17): **GO-WITH-FIXES**. F1–F10 CONFIRMED closed, strip switch-gated, snapshot denylist intact, RLS clean, reversible. Blockers before uncommenting record.js:248-251: **(1 P0)** gate `clans.js contribute()` under serverAccrualActive() — CONVERGES with the clan-block work (that gate closes this). **(2 P1)** confirm muster/raid/quest/bounty grant RPCs credit server gold or gate them (else earned rewards erased on flip). **(3 P1)** add a census guard: every deferred transfer site must be switch-gated or have no server counterparty. **(4)** reliability's restore drill (blob-stripped = no client re-upload path) — still outstanding, likely needs Tyler/reliability; won't fully arm tonight. |
| Inventory-absolute flip — **REAL-LAUNCH, not beta** | 🧊 | P1 | Expert verdict: CANNOT be made safe pre-beta. Needs every live bag-writer server-side (Model A: gather/craft/combat-drop via the accrual window — multi-day) + a rehearsed restore drill + (under amnesty) a wipe first, or absolute-apply irreversibly deletes freshly-crafted items. **b376 merge-mitigation IS the correct beta posture** (no data loss, dupe remains). Do NOT rush-arm before beta. |
| Live gather/craft/combat-drop → server (Model A) | 🧊 | P1 | Systems work that makes the bag complete so the inventory flip can later arm. Ship UNARMED (no flag) first, watch `envelopeDrift`. Prereq for the inventory flip; a real-launch track. |
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
