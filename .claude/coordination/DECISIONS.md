# DECISIONS

_Team-wide decisions and their rationale. Append newest at top. Every entry: DECISION · WHY · AFFECTED AGENTS · DATE. A decision here is binding until explicitly superseded by a later entry._

---

### 2026-08-09 · Auto-eat: 5,000g → 100 Bounty Marks; LAUNCH NOTE: raise mark prices at release (Tyler)
**Decision:** The auto-eat trait is purchased with 100 Bounty Marks, not gold. STANDING LAUNCH-CHECKLIST ITEM: all Bounty Mark prices get a raising pass before release — record, do not act yet.
**Affected agents:** Systems (this change), Designer (the release-time mark-price pass).

### 2026-08-09 · Work-order visibility + posting permissions + opt-in voting (Tyler, binding)
**Decision:** (1) An active Work Order is OBVIOUS to every member: what the clan is building, every material needed, live fulfillment per material (e.g. Hall upgrade → the whole clan sees "Timber Beams 340/600 · Iron Fittings 80/200 · Labour 1,200/4,800") — prominent on the clan panel, not buried in a modal. (2) ONLY the Clan Leader and Vice Leaders may post work orders. (3) OPT-IN VOTING: leadership may open the next work order to a member vote (leadership chooses candidates or opens nominations; one vote per member; server-authoritative; result posts the order). Voting is leadership's choice per order — not mandatory governance.
**Why:** Tyler 2026-08-09. Maps onto the clan-overhaul rank model — reconcile "Vice Leader" with the existing role/charge columns (likely: leader + a 'vice' charge; Designer aligns naming).
**Affected agents:** Systems (clan panel WO display + gating + vote RPCs/migration — QUEUED behind the clan-scene agent, same surfaces), Designer (vote flow spec details), QA.

### 2026-08-09 · Presence rework: blessings are presence-gated; flat +12% removed (Tyler, binding)
**Decision:** Tyler: "if you're offline the event doesn't apply to you... you only get that stuff WHILE online. One week it may be 12% exp, another week it may be +10% gold find." The daily/weekly rotating blessings apply ONLY while present (b226's presence definition: tab visible + input ≤10min + activity running). Offline = base rate, no blessing. The b226 flat presence ×1.12 is REMOVED — the rotating calendar replaces it as the entire online-pays mechanic. Blessing pool rotates varied boost TYPES (xp, gold find, gather/smith speed...; goldFind is wired since b222). Rally (join-gated live events) unchanged.
**Why:** Product-owner economy direction 2026-08-09, superseding the b226 flat bonus.
**Affected agents:** Systems (implementation b227), Designer (pool variety + pacing appendix update), QA (offline-excludes-blessings regression).

### 2026-08-09 · Pacing APPROVED with re-anchor: first 99 ≈ 8 WEEKS (Tyler)
**Decision:** The pacing-overhaul package ships, re-anchored from the spec's 28-day first-99 to **~56 days (8 weeks)** — all-99 lands ≈16-18 months. Offline cap becomes the **12h DAILY budget** (approved explicitly). Presence bonus ×1.12 XP-only stands. All five modeling bug fixes ship with it (skillMs offline dampener, farming ×14, VENDOR_RAW_RATE 0.20, Mithril Rock regression, per-item daily counters). Renown weights only rise + renownHigh ratchet + Founder's mark. Constants re-derived from the spec's own model; Designer ratifies the derived table at integration.
**Why:** Tyler's choices via decision gate 2026-08-09.
**Affected agents:** Systems (implementation), Designer (ratify derived constants), QA (rate regression tests).

### 2026-08-09 · Pacing directive — endgame is MONTHS away, presence bonus 10-15% (Tyler, binding)
**Decision:** Tyler on the audit's P0 evidence (9h offline = WC 62 + 16,110 logs): "way too many logs for only 9 hours... the exp seems a bit fast too. I like the idea of an online boost, however I think it should be more like 10-15%. I don't want people hitting end game for at least a few months." Binding parameters: (1) online-presence bonus exists but is +10-15%, NOT the 25-50% the audit suggested; (2) overall XP/yield pacing must be retuned so endgame (99s / top gear) takes MONTHS of normal play — rate reductions are authorized, which supersedes the earlier additive-only framing; (3) earned progress is never clawed back — only rates going forward change.
**Why:** Product-owner pacing call 2026-08-09.
**Affected agents:** Game Designer (pacing model + retune spec — the whole curve, offline AND active, vs a months-to-99 target), Systems (implementation + presence bonus), QA (rate regression tests).

### 2026-08-08 · Accounts are REQUIRED — no account-less play (Tyler, binding rework)
**Decision:** "I do not want any local saves to be available. The users should all be prompted to create an account when they access the game. Whether that be browser or when we migrate to an app for iOS or Steam." Enforced: account creation prompt at game access on every platform; no anonymous/local-only play path. NUANCE (Coordinator, to prevent over-rotation): signed-in accounts KEEP local persistence as the offline cache + offline-progression bank — what is removed is playing without an account, not local caching for account holders. Existing beta players' local saves must be ADOPTED into their new account on first sign-in (sync seam exists), never discarded.
**Why:** Product-owner directive 2026-08-08; realizes the recorded online-only north star.
**Affected agents:** Systems (the rework), QA (the smoke suite currently runs account-less — needs a harness seam), Designer (FTUE re-sequencing), all future work (anon degraded paths become network-resilience paths, not product surfaces).

### 2026-08-08 · Cooking never gated on the Kitchen — open fire + burn chance (Tyler, binding)
**Decision:** Cooking works from the tier-1 camp on the open fire, with a burn chance (burnt food = lost input, vendor-trash output). The Kitchen ladder buys RELIABILITY via the `noBurn` key (formerly a ghost key — now has its designated producer), plus its existing speed/yield rungs. Burn also falls with cooking skill per recipe. Forge/Workshop/Shrine workbench gates unchanged. Amendment recorded in `homestead-deepening.md` §2; Designer owns the burn curve at Phase-1 build.
**Why:** Product-owner rule 2026-08-08. Also note: the LIVE game currently hard-gates cooking on the Kitchen (`homestead.js WORKBENCH` + `startArtisan`) — Wave 4's homestead Phase 1 must remove that gate for cooking and add the burn mechanic together.
**Affected agents:** Game Designer (burn curve), Systems (gate removal + burn implementation + noBurn wiring), QA (burn-rate regression tests).

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
