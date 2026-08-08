# DECISIONS

_Team-wide decisions and their rationale. Append newest at top. Every entry: DECISION · WHY · AFFECTED AGENTS · DATE. A decision here is binding until explicitly superseded by a later entry._

---

### 2026-08-08 · Castle + Homestead are the twin ultimate progression pillars (Tyler, vision-level)
**Decision:** "The clan castle and the personal homestead [are] the ultimate points of progression in this game, outside of the obvious maxing skills." Both pillars get the same depth arc and the SAME interaction language (clickable rooms → per-room themed modals with upgrade ladders). The room-modal machinery being built for the castle must be a reusable seam; the homestead adopts it next wave. Future content investment prioritizes deepening these two pillars.
**Why:** Product-owner vision directive 2026-08-08.
**Affected agents:** all — Game Designer (homestead deepening program next), castle-panel builder (reusable seam, relayed), Art Director (one visual language across both).

### 2026-08-08 · Castle page: block-built visuals + clickable rooms with per-room themed modals (Tyler, binding)
**Decision:** The clan/castle page incorporates castle-block (stone/masonry) visual language, and EVERY room/building/section is clickable, expanding a modal themed to that specific room carrying its corresponding information and upgrade ladder (Tyler's example: kitchen modal → stove upgrades). Not six generic modals with different titles — each modal reads as ITS room. Tyler: big detailed ask, quality over speed, "okay if it takes some time."
**Why:** Product-owner direction 2026-08-08; strengthens the spec's existing modals-keep-the-page-clean rule into the page's core interaction model.
**Affected agents:** castle-panel builder (relayed mid-build), Art Director (beauty pass must deepen per-room theming), Game Designer (room info architecture).

### 2026-08-08 · Autonomous wave progression authorized
**Decision:** Tyler: "Keep pushing through the waves automatically, you're the coordinator." The Coordinator runs waves end-to-end — dispatch, integrate, verify (full gate: smoke green + browser verification), bump build, ship to production — without per-wave sign-off. Any wave that fails the gate, opens a P0/P1 regression risk, or requires a product-owner judgment call (economy, monetization, destructive changes) STOPS and asks.
**Why:** Product-owner directive; the gate (177/177 + visual verification + regression tripwires) is the safety net.
**Affected agents:** all.

### 2026-08-08 · New backlog items #13-#16 (farming/watering, event discoverability, world-event cadence + topbar timer, clan boss events)
**Decision:** Added per Tyler. #13 direction: watering becomes OPTIONAL (speeds growth) so auto-replant works unattended and active play is rewarded — Designer specs the numbers. #15 direction: world events 2x/day, joinable once/day per player, visible countdown in the topbar. #16: clan-tier group-boss events, designed alongside the clan castle (#10).
**Affected agents:** Game Designer (specs), Systems, Art.

### 2026-08-08 · Team system realized as Coordinator-dispatched subagents
**Decision:** The five specialists are Claude Code subagent definitions (`.claude/agents/*.md`) dispatched by a Coordinator session, not five persistent overnight processes. Worktree isolation is applied per-dispatch when a specialist writes files, to avoid parallel-write collisions.
**Why:** Matches Claude Code's actual primitives (no persistent daemons); keeps integration under one coordinating owner; still gives true isolation for concurrent writes. (Product owner chose this over separate-session-per-worktree.)
**Affected agents:** all.

### 2026-08-08 · Push cleanup + audit to production
**Decision:** Committed the verified-safe asset/doc cleanup as its own commit (`119a698`) and pushed it plus the audit commit `5ac5ab9` to `origin/main` (auto-deploys).
**Why:** Product owner directed "commit AND push everything"; cleanup was verified move-not-delete, smoke 175/175. Gives the team a clean, green, in-sync base.
**Affected agents:** all.

---

### 2026-08-08 · Backlog sequenced into 4 waves; implementation serialized on the monolith
**Decision:** Tyler's 12-item list is triaged in `BACKLOG.md` and sequenced Wave 0→3. Because most items touch `src/legacy.js`, implementation is serialized per wave; only disjoint-footprint work runs in parallel (via worktree isolation), and design/spec work runs read-only in parallel up front. Wave 0 = the tab-snap-back unblocker (#3) + foundational type/logo (#1,#2) + design specs for later waves.
**Why:** Reckless parallel edits to the entangled monolith would produce merge/semantic conflicts; readable type (#1) must land before other visual work rebases onto it; the snap-back bug (#3) sabotages all UI verification until fixed.
**Affected agents:** all.

_(New decisions below, newest first.)_
