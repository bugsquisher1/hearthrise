# DECISIONS

_Team-wide decisions and their rationale. Append newest at top. Every entry: DECISION · WHY · AFFECTED AGENTS · DATE. A decision here is binding until explicitly superseded by a later entry._

---

### 2026-08-09 · re-Master Itemization & Progression Rework — PROGRAM START, AUDIT FIRST (Tyler)
**Decision:** The largest program yet — full audit + rework of itemization/progression/equipment/bosses/dungeons/crafting/gathering/combat/rewards into one cohesive loop ("simple to understand, deep to master"). 20-phase brief; details in memory [[itemization-program]]. Coordinator plan: Phase 1 = 4 parallel READ-ONLY domain audits → synthesize master audit + new-itemization DESIGN → **bring to Tyler for approval before ANY implementation**. Implementation waits on that approval AND on b229 (character rework) shipping (clean base). NO code changes in the audit phase.
**Affected agents:** all (multi-wave). Read-only auditors now; specialists implement per approved design later.

### 2026-08-09 · Character/Skills rework — DESIGN APPROVED (Tyler: "i fuckin love it")
**Decision:** Tyler approved the visual mockup of the new Character screen. LOCKED: three sub-tabs **Skills · Equipment · Hero**, **Skills is the default tab**; Skills = the OSRS-our-own grid (icon + name + moss XP-to-next bar + gilt level, tile routes to the activity via the existing openSkillDetail/quest-nav seam); Equipment reuses buildTibiaDoll wholesale; Hero holds identity + combat cards + the OSRS-style account stat panel (Combat lvl, Total XP, Quests, Bounties=combat tasks, Collections, Renown rank, Time played "click to reveal"; Achievements→Chronicle/renown or flagged; Time played = new `G.stats.playMs` counter). The fake paywall "Your Heroes" is CUT; the real multi-character selector moves to Home. Spec: `docs/design/character-skills-rework.md`. Build AFTER b228 ships (bonus-rebase in flight; both touch Home). Phase 1 = combined screen + Heroes-on-Home behind existing seams; Phase 2 = grid art + playMs + de-dup.
**Affected agents:** Systems (build, next wave after b228).

### 2026-08-09 · Character/Skills screen rework — PLAN FIRST (Tyler, directive + guardrail)
**Decision:** Tyler wants: (1) "Your Heroes" character-select MOVED from the Character screen to the HOME screen; (2) a NEW Character screen COMBINING Skills + Character, OSRS-style-but-our-own (the classic skills grid with levels, ref screenshot); (3) KEEP the Equipment tab (→ sub-tabs within the combined screen); (4) each skill tile routes the player to WHERE to do that activity (reuse the b227 quest-nav `questDestination`/`openSkillDetail` seams). **Guardrail (his words): "do it smart, don't break any functionality or ruin anything that sets us back."** → Produce a design + migration-safety plan BEFORE any code; sequence the build AFTER the in-flight bonus-rebase + rally-v2 agents land (they touch overlapping surfaces); present the plan to Tyler for reaction before building.
**Affected agents:** Game Designer + Art (plan), Systems (build, next wave).

### 2026-08-09 · Rally pledges v2: auto-join when online, themed loot, no plumbing copy (Tyler, binding)
**Decision:** (1) Pledge rule simplifies — pledged + ONLINE during the window = full participation automatically (no separate live-join click); pledged + offline = half honors on return. (2) A visible "Switch to <the other rally>" affordance on the pledged card until the window opens. (3) Chest contents are THEMED to the event: Forge Levy pays smithing/crafting XP + forge-domain items; each rally's reward table derives from its blessing domain. (4) NO implementation-state copy ever — "provisional / recorded on this device" class of strings is banned; if the server can't hold a pledge, the UI degrades silently or hides the affordance.
**Affected agents:** Systems (rally v2), Designer (themed reward tables ratification).

### 2026-08-09 · Bonus magnitudes rebase: "increments of 2%" (Tyler, binding, global)
**Decision:** All percentage boosts across the game are far too large (rooms at +50% smithing etc.). Rebase to a small-increment grammar (~2% steps). Provisional applied to homestead ladders mid-build (speed rooms +2..10%, Library/Trophy +1..5%); the Designer re-derives the FULL bonus table (castle buildings, blessings, feasts, ales, renown perks, workers?) as one coherent budget with a much lower total ceiling, then Systems applies (b228). Levels/costs owned by players never change — only the magnitude a level grants (owner-stated global rebalance, announced in the changelog, never silent). NOTE (flagged to Tyler): this shrinks the boost headroom — typical engaged pace moves toward the 57-day floor.
**Affected agents:** Designer (retune spec NOW), Systems (apply), homestead agent (provisional relayed mid-build).

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
