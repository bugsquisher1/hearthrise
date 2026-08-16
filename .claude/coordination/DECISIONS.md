# DECISIONS

_Team-wide decisions and their rationale. Append newest at top. Every entry: DECISION · WHY · AFFECTED AGENTS · DATE. A decision here is binding until explicitly superseded by a later entry._

---

### 2026-08-17 · COMBAT REWORK SPEC — APPROVED by Tyler ('i like the combat spec')
**Decision (Tyler, direct).** docs/design/combat-screen-rework.md is approved: the two-screen
architecture (THE WAR TABLE menu + THE FIGHT stage), Melvor-density-with-order as the bar, the
preview state replacing the 'Awaiting a foe' void, nav-opens-live-fight, and the fold audit
(27 KEEP / 3 MERGE incl. barn_rat→rat / 3 RENAME / 1 differentiate — aliases make progress-safe).
Build order per the spec's own recommendation: cards 01-16 as the Phase-1 block (pure
render/routing/CSS, no engine), folds ride along (one-line aliases, reversible), backdrops (17)
DEFERRED until backdrop art exists (Tyler's web-UI session or later — no spend). The hidden-Flee
P1 is absorbed by the fight screen's action bar. Ships through the RELEASE VISUAL GATE.
**Date:** 2026-08-17.

---

### 2026-08-17 · LIVE-PLAY SETTLEMENT is the next program — SUPERSEDES the feature order (Tyler, direct)
**Decision (Tyler, after the b359 P0):** live play must be recorded server-side — "kill monster,
kill is recorded on the server, exp is recorded on the server, and all loot gained is recorded on
the server." The working architecture: **live play is away accrual that happens while you're
watching** — the client tick becomes display prediction, and the client SETTLES every ~30-60s (and
on switch/hide/close) through the SAME accrual engine, watermark, and idempotent apply that already
pay away time. No per-swing round trips. Spec first (backend-architect, in flight →
docs/design/live-settlement.md), phased strangler-fig build after, Security gate before each deploy.
**This outranks the remaining feature list** until live play is server-recorded, because it retires
the b359 emergency merge (a deliberate, temporary authority weakening) and closes the last
client-authored progression surface. The b359 merge and its test forms (B359-1, the rewritten b337
and B339-5) retire ONLY when settlement makes the envelope complete — record.js:119-144 is the
ordering rule. **Date:** 2026-08-17.

---

### 2026-08-16 · HUNT BAND FAIRNESS — APPLIED to production (Coordinator)
`2026-08-12-raid-band-fairness.sql` is **APPLIED** (was staged since 2026-08-12; item #1 in Tyler's
locked build order). Replaced 4 functions: `hr_hunt_share`, `hr_hunt_band`, `hr_hunt_band_mul`,
`raid_claim__ungated`. Its self-checks include LIVE controls (an ordinary current-week solo claim
must still work and write a ledger row; an eligibility refusal must survive the rewrite) — all
passed at apply time, which is the verification. **Effect for players: `below_band` is deleted as
an outcome — no action by any clanmate can move another member below being paid; the band is now
measured against your share of the boss (`max_hp / members_at_declare`), not against other players'
damage.** Still open, unchanged: when `2026-08-12-clan-members-rls-drop.sql` lands it MUST ship a
companion revoke of clan_members/clans i/u/d grants or the nightly detector raises. **Date:** 2026-08-16.
### 2026-08-17 · §8.4 RULED — STONE COMES FROM A QUARRY LANE (P2), NOT A MINING BY-PRODUCT (P1)
**Decision (Game Designer, under delegated design authority; `consumable-economy.md` §8.4 left this
OPEN and recommended P1).** Stonemason gains three **input-free** recipes — Quarry Rubble (1),
Quarry Granite (30), Quarry Basalt (70) — and that is where stone enters the game. The `byprod:`
field on `ROCKS` proposed by P1 is **not** built.

**Why, in the order the reasons mattered.** (1) **Server authority decides it.** P1 edits
`resolveGatherAction`, which is vendored into `hr-accrue` under a pinned payload hash; P2 is legal
server-side today (`artisan` is a PAYABLE_KIND, `recipeInputs({})` already works, and Prayer's bury
actions ship the mirror case). A content skill must not be the change that re-pins the combat
engine. (2) **The new-player wall.** Round 2 is a wipe, so *every* player meets this skill at level
1; under P1 a player with no mining history opens an empty skill, under P2 they press one button and
are a mason. (3) **Time is the honest price of a castle** — P1 makes stone a free rider on an
activity already being done, so castle goods would cost no time that was not already spent.
(4) **It does not duplicate the mining fantasy** (the doc's stated objection): mining pulls metal for
the forge, quarrying cuts building stone for the wall, and a quarry rung is not in `ROCKS` so it
cannot disturb the b226 "every gathering rung is strictly better" invariant.

**The cost, stated:** the lane mints from nothing, so all three stones are `raw: true` (vendor bids
20%) and a smoke guard asserts every input-free artisan output carries the flag. **P1 remains
available later as a pure convenience** that tops up the same items; it composes with this lane
rather than replacing it, and is a better second change than it would have been a first.

**AFFECTED:** Systems (no engine change requested), Security (one priced faucet), Fletching (the
precedent for lane shape), Art/Asset (three new material icons).

---

### 2026-08-16 · BESTIARY CHARMS (PROG-01, Tibia-style) — direction APPROVED by Tyler
**Decision (Tyler, direct: "The bestiary system that tibia has would be SOOOOOO SICK").** The
Tibia-style bestiary is approved as a direction: kill-count progress per monster unlocks bestiary
entries; completing entries earns charm points spent on category-scoped perks. It composes with
the monster-rework taxonomy (its value scales with the approved category system) and its power
lives inside `weaknessInfo` with a `MAX_BANE_MULT` invariant — NEVER as a `getBonus` key, or the
server engine reads it as zero (designer's routed flag). Kill-thresholds, charm list, and point
economy flow through the review book; sequencing stays behind the monster rework it depends on.
**Date:** 2026-08-16.

---

### 2026-08-16 · REVIEW BOOK ROUND 2 — Tyler's full approval sweep (review-decisions.json, generatedAt 1786860824128)
**Decision (Tyler, via the review book export — BINDING).**
- **All 81 monsters APPROVED** (every MON-* card), including the Tibia-derived 11-class taxonomy, renames, and tier fill. DEC-NEUT-01/DEC-ALIAS-01/DEC-ELEM-04 (Poison) approved.
- **All items APPROVED**: every ITEM-PLAN-* (1-10) and every surviving ITEM-NEW-* card. Rejected six stay rejected.
- **Progression: PROG-01 (Bestiary Charms), PROG-02 (Diaries), PROG-03, PROG-08 APPROVED.** PROG-04/05/06/07/09/10 = maybe (parked, not rejected).
- **Events: ALL FIVE EVT-* cards APPROVED** — the Kindling/Beacon ships as spec'd (rev 2, ember-over-vendor valuation, 50/50 seeded tie-break).
- **DNG-VAMP-01**: Tyler requested the actual WWDITS cast names (Lazlo, Nadja, Nandor the Relentless, Gizmo, Colin Robinson) with named drops. **UNRESOLVED — Coordinator advised verbatim protected names/characters are an IP risk for a commercial launch; parody-distance alternates proposed to Tyler.** Do not wire real-cast names into src/data without a later explicit entry here.
The exported file is committed at repo root (`review-decisions.json`). **Date:** 2026-08-16.

---

### 2026-08-16 · THE KINDLING / THE BEACON — APPROVED by Tyler, enthusiastically
**Decision (Tyler, direct: "I LOVE THE KINDLING AND BEACON IDEA").** The events rework's headline
is approved: The Muster is replaced by **The Kindling** (daily donation pool) and **The Beacon**
(weekly pool + blessing vote), per `docs/design/events-donations-and-voting.md`. The rename, the
embers donation concept, and the vote-then-boost shape are locked. Fine-grained parameters
(tier thresholds, blessing-roll list, caps) still flow through the review book, but implementers
may treat the system's existence and shape as settled. The three routed flags in CONFLICTS.md
(fuse re-split, `beaconWeekKey`, away-channel rule) bind the implementation. **Date:** 2026-08-16.

---

### 2026-08-16 · Post-cutover feature ORDER locked (Tyler, batch 2)
**Decision (Tyler, direct).** The Coordinator's recommended order is adopted as the build sequence,
with Coordinator discretion to run overlapping items simultaneously: **Hunt band fairness (staged,
apply it) → Completion Log → Quest Board rework → Supply projection + Fletching (one arc: the
depletion economy) → World-boss blessing → then the remaining list as previously numbered.**
Back burner: Practice tiers, buy-offers return. Elements/enchanting stays sequenced after the
monster rework (batch-1 ruling).

**The governing priority right now is THEORIZING THE SYSTEMS** — making them "fun / understandable
but deep, familiar but unique" (Tyler's words). Design/spec work leads; implementation follows
Tyler's approvals through the review book. Every new system spec is held to that bar: a player
should recognize the shape from games they love (OSRS/Melvor/Tibia/Idle Clans lineage) and still
find something Hearthrise-only in it.

**Affected:** all agents. Design-first dispatches take precedence over feature implementation
except where implementation is nearly free (staged migrations, small QoL). **Date:** 2026-08-16.

---

### 2026-08-16 · Tyler's post-cutover feature rulings (batch 1)
**Decision (Tyler, direct).** Against the numbered post-cutover feature list:
- **Back burner:** "Practice" familiarity tiers (#6) and buy-offers return (#11). Not cancelled — deprioritized.
- **Elements/enchanting (#12):** sequence AFTER the monster rework (#7), because the monster rework redoes all weaknesses and elements hang off them. Steal liberally from RuneScape/Melvor — the original spec is a starting point, not a contract ("It doesn't have to be exactly how I laid it out. Just make it make sense.").
- **Monster rework (#7):** the Game Designer produces a LIBRARY of monster categories/types/enemies as candidates; Tyler picks from it. Nothing ships un-picked.
- **Auto-eat** must ALSO be purchasable in the bounty shop (100-mark auto-eat already decided 2026-08-09) so it can't be missed.
- **UI:** on every building-upgrade panel, the "Build (hearthstone)" button moves to the TOP — no scrolling to find it.
- **Events rework:** rename "The Muster" (name TBD by Designer). Replace the pick-one-rally shape with **daily + weekly donation pools** that boost the daily/weekly blessing: e.g. daily blessing is combat XP → a shared donation pool (food/gold) fills tiers granting +1–5% to that blessing; weekly is the same at much larger donation totals, also +1–5%. Add a **voting system for the weekly blessing** — needs a wider blessing-roll library; voting closes 1 day before the weekly reset, and the weekly reset is **Sunday night**.
- **The Review Book:** Tyler wants an interactive HTML review page where he browses designer-proposed content (monster library, current + upcoming items, progression-advancement options) and approves/rejects each with notes. Designer content is custom but steals from Tibia, OSRS, RS3, EverQuest, Melvor, Idle Clans — use their wikis/online libraries. Tyler's exported decisions become binding design input.

**Affected:** game-designer (monster library, events/blessing design, item + progression option catalogues), systems-engineer (bounty-shop auto-eat, build-button placement), Coordinator (review book build + decision import). **Date:** 2026-08-16.

---

### 2026-08-12 · The Hunt band is measured against the boss, and there is no unpaid band
**Decision (Game Designer, own authority).** `raid_claim`'s contribution band stops ranking players
against each other. The bar is now `hr_hunt_share(max_hp, members_at_declare)` — the pool split over
the roster it was sized for — and the ladder is floored: champion ×1.3 at 1.5× your share, full ×1.0
at 0.5×, partisan ×0.6 below that. `below_band` is deleted as an outcome; the RPC can no longer
refuse a chest for being small, only for being absent. On a week the boss survived the band floors
at `full`, because the payout is already multiplied by the partial factor and a clan that fell short
must not be cut twice. Staged as `supabase/migrations/2026-08-12-raid-band-fairness.sql`; NOT applied.

**Why.** The median was chosen (b223) to be clan-size-independent, and it is — but it made every
member's chest a function of every other member's damage, and `percentile_cont` interpolates, so in
a clan of two the bar simply IS the other player's number. Executed proof
(`tests/raid-band-denial.mjs`): hold a member's week completely fixed at 1,800 damage over 3 strikes
in a Tier I Hunt for two, and sweep her clanmate's week across its legal range (3,000 → 25,000, the
per-day clamp × 5). Her verdict walks full ×1.0 → partisan ×0.6 → **below_band, nothing** — three of
seven legal clanmate weeks pay her nothing, with no forgery and nobody doing anything wrong. A
co-operative weekly event in which the selfish play is to hope your friends underperform is the
inverse of the point.

**Both named remedies, not one.** Banding against `max_hp` alone is insufficient: total damage is
bounded by the pool, so shares are a contended resource and a heavy hitter still eats HP others would
have earned out of. The floor is what actually removes the primitive — with no unpaid band, no action
by any player can move any other player below being paid.

**What still stops a free-rider.** Nothing about that changed: `no_contribution` (zero damage) and
`too_few_strikes` (fewer than 2 strikes, which are 2 separate UTC days), plus joined-after-declare and
joined-after-kill. Those gates are absolute and unmovable by anyone else. The bands rank how well you
did; they were never what decided whether you were allowed to eat.

**Balance.** The chest pays gold/gems/materials, never XP, so this is outside the +52% permanent-power
fuse and cannot move the 8-week first-99 anchor (pacing-overhaul A.4). The ceiling is unchanged
(champion ×1.3, once per week, PK-guarded). The floor rises 0 → 0.6 only for members who were being
denied by other people's arithmetic. Champion inflation is bounded by the boss: Σdamage ≈ max_hp and
Σshare = max_hp, so at most two thirds of a roster can be at 1.5×.

**Affected agents:** Systems (owns applying the migration and the `median`→`share` envelope key),
Art Director (the Hunt card gained three lines of rule copy — the density call is theirs).

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
