# Hearthrise — Living Priority Board

**The single source of truth for what's done, in flight, queued, and decided.**
Maintained by the Coordinator: backlog items are added here consistently as they
arise (player reports, feature ideas, discoveries) so nothing is lost. The HTML
board artifact renders this file. Keep status, priority, order, and notes current.

Legend — **Status:** ✅ shipped · 🔧 in progress · 📋 spec'd (approved, not built) ·
🧊 backlog · ⛔ blocked · ⏸️ back-burner (deprioritized, not cancelled).
**Priority:** P0 (now) · P1 (soon) · P2 (this cycle) · P3 (nice-to-have).

_Last updated: 2026-08-18 (b376). Current build: **b376**, live._

---

## 1 · LAUNCH READINESS (gate for inviting 10–20 new players)

| Item | Status | Pri | Notes |
|---|---|---|---|
| Brand-new account signup + true first session | ⛔ | **P0** | The launch-gating unknown. NOBODY who isn't Tyler has created an account + played this build from zero. Coordinator **cannot create accounts** (prohibition) — needs Tyler or a test account. |
| Dedicated test account | ⛔ | **P0** | Unblocks the above + every future new-player test forever. Tyler action: throwaway email + signup, or do signup while Coordinator observes. |
| Clean FTUE re-run on current build | 🧊 | P1 | b372 run found bugs (slot-clone, silent death, identity bleed, rename freeze) — ALL fixed in b373/b374, never re-verified clean end-to-end. Needs the test account. |
| Wire rooms + banner tiers | 🔧 | P1 | Generated & on disk; closes the last visible seam (grey placeholder rooms next to painted everything). |
| Backups / restore DRILL | 🧊 | P2 | Pro plan now has daily backups; a RESTORE has never been tested. Reliability flagged it a HARD cutover blocker (matters most once server owns progression). |

**Decision pending Tyler:** wipe vs. amnesty at cutover (acting on amnesty). See §7.

---

## 2 · SERVER-AUTHORITY PROGRAM (the integrity foundation — post-launch)

| Item | Status | Pri | Notes |
|---|---|---|---|
| Record flip — server owns gold/skills/**inventory** | 🧊 | **P1** | Plumbed & tested, armed for equipment only. The permanent cure for the craft dupe AND the last self-forgeable economy. Highest-value server work. Needs Security review before arming inventory. |
| Inventory baseline adoption (craft-dupe real fix) | 🧊 | P1 | Server must own the WHOLE bag so craft settlement replays against the real inventory. Same work as the record flip. Interim mitigation shipped b376 (no more data loss; dupe remains). |
| Clan pass 2 | ⛔ | P1 | `clan_contribute` mints 10M/day (no debit), `clan_feast_deposit` free meter, slot-derivation fix, revoke dormant `clans` grants. Clan domain security-BLOCKED until done. |
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
