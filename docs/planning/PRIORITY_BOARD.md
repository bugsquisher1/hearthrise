# Hearthrise — Living Priority Board

**The single source of truth for what's done, in flight, queued, and decided.**
Maintained by the Coordinator: backlog items are added here consistently as they
arise (player reports, feature ideas, discoveries) so nothing is lost. The HTML
board artifact renders this file. Keep status, priority, order, and notes current.

Legend — **Status:** ✅ shipped · 🔧 in progress · 📋 spec'd (approved, not built) ·
🧊 backlog · ⛔ blocked · ⏸️ back-burner (deprioritized, not cancelled).
**Priority:** P0 (now) · P1 (soon) · P2 (this cycle) · P3 (nice-to-have).

_Last updated: 2026-08-23 (§10 Huntera adoptions added). Current build: **b460**, live. **🔒 GOLD+GEMS ARMED — server-authority program COMPLETE.**_

> **🌙 OVERNIGHT AUTONOMOUS RUN (2026-08-18 night → 2026-08-19), for Tyler on wake:**
> Ran the team on the structure-first program while you slept. **16 builds shipped (b388–b403), all gated (deterministic smoke + visual gate), all live.**
> - **Bug batch (b388–b393):** farming/cooking-XP root fix, worker rebalance, Stable tab + drop tables, offline-clarity UX, enchant discoverability + fire→ember wording.
> - **b394 gather-XP rebalance** (your Mithril report) — engine deployed via your paste + client synced, edge-guard green.
> - **Render-layer extraction #3–7** (b395/b397/b398/b400/b401): Achievements, Bestiary, Equipment Bonuses, level-up toast, **equipment paper-doll (164 lines)** → `src/render/*`, all pure-refactor + byte-identical.
> - **b399 test-determinism:** killed the b227 flake — **suite is now deterministic, 937/937**. The ratchet is trustworthy.
> - **b402 dead-code retirement** (~55 lines, airtight-proven) · **b403** negative gear-bonus display fix · **b404** objectives popout (final leaf).
> - **Capstone QA PASS:** the assembled b404 build (all 17 builds stacked) verified sound — 8 render modules load+coexist, zero overflow at 1440×900 + 922×423, no collisions on the Profile screen where they converge, 224 rapid tab-switches 0 errors, 938/938. One PRE-EXISTING finding (not a regression, designer call): the Active Effects card is force-hidden on Home by the `#panel-profile:has(#hd-root) > .card` rule — retire the dormant card or resurface it.
>
> **⛔ NEEDS YOUR DECISION / IN-LOOP (not done autonomously — on purpose):**
> 1. **Gold-arming: NO-GO** (§2). Verification proved arming breaks the economy (fail-closes every unstamped balance → 885/934). Real blocker = a **direction call**: build a stamped-envelope test harness (test-only, must be reviewed) OR a Security ruling on `balanceOf` fallback. Verified diff on branch `fix/gold-arm-staged`.
> 2. **Render controllers + showTab tap-registry (Tier-2):** the next render phase, b361-class core-nav-wiring — **execution-ready plan scoped** (registry-first, then buildTibiaDoll✓→shop→farm→inventory→profile→combat, one-per-commit). Held for your in-loop session.
> 3. **CSS→tokens:** the big theme debt — **execution-ready plan scoped.** Key finding: the token *architecture* is already mature; the debt is un-converted component *literals*, and the easy "Class A" (literal already = a token's cozy value) ones are nearly exhausted. Most remaining are "Class B" — foreign colors (teal remnants, status reds) whose conversion **mints a token + shifts Hearthlight = a design decision no test can judge.** So it's structurally in-loop: ~9 screen-batches (order: homestead/clan shakedown → inventory → combat → buttons → …), <20 new tokens, each with a cozy-identical guard test + your per-screen coherence review. Not unattended-safe.
> 4. **Engine (hr-accrue) deploys:** still your one-command paste (harness blocks me). Nothing engine-side is pending right now.

> **LOCKED DIRECTION (Tyler, 2026-08-18): STRUCTURE-FIRST. PAUSE ALL NEW FEATURES
> until the game is in a SCALABLE STATE. Beta pushed to NEXT WEEK (~2026-08-25).**
> Supersedes the 2026-08-17 "full list before beta." Build for the end-state
> ([[build-for-the-end-state]]: large-scale multiplayer semi-idle), clean code is a
> must. Only server-authority + the structural/architecture work (§9) proceed;
> bug-fixes allowed; NO new content/features until the exit criteria below hold.
>
> **SCALABLE-STATE EXIT CRITERIA (all must hold to resume features):**
> 1. Server-authority record flips ARMED + security-signed (gold + inventory un-forgeable). §2. — ✅ **GOLD+GEMS ARMED LIVE b421 (2026-08-20).** Inventory flip is REAL-LAUNCH (not beta) by expert verdict; b376 merge-mitigation is the correct beta posture. Currency authority = DONE.
> 2. Render layer extracted from `legacy.js` → `src/render/*` far enough that UI changes are safe. §9.
> 3. Core screens on CSS tokens (no hardcoded colors on shipped surfaces). §9.
> 4. `hr-accrue` load-tested at target concurrency. §9.

## 1a · WHAT SHIPPED (the 2026-08-17 push, now closed) + WHAT'S PAUSED

| Item | Status | Pri | Notes |
|---|---|---|---|
| Sell fix (b377) · Clan gate (b378) · Elements/enchanting (b379) | ✅ | — | All shipped live. Enchant's full logged-in round-trip still to confirm on QA account. |
| Server-auth safety machinery (b380 inventory · b381 gold · b382 baseline) | ✅ dormant | — | The flips' safety layers, shipped dormant. See §2 for arm runway. |
| Beta bug batch — farming-66 / cooking-XP-reset (b388) · workers OP (b389) · Stable tab + monster drops (b390) | ✅ | — | b388: client-only skills (farming/cooking) no longer stomped downward on reconcile (skill-authority.js carve-out) — the real "Farming locked at 66 / cooked food vanished" root cause. b389: worker crew was 3.12× an active player 24/7 free — eff 25%→10%, steeper hire costs. b390: Stable tab re-added to nav + legacy block-32 dup deleted; monster cards show full drop table. Remaining from batch: offline-XP *clarity* (b391, in progress) + Mithril report (awaiting Tyler resend). |
| Offline-clarity UX (b391) | ✅ | — | The communication half of the offline-confusion complaints (bug half fixed in b388): never-return-to-silence card, proactive 12h-cap row, attributed return payoff. Visual-gate PASS, live. |
| Enchant clarity (b392) | ✅ | — | Tyler's "super confusing / I don't see an enchant option." Root cause: enchant lived only on the Combat loadout, not the Inventory tab the game directs players to. Now mounted under the Inventory paper-doll + empty-state picker teaches the essence→rune path. Visual gate caught a mobile clip (withdrawn as a harness false-positive), PASS, live. |
| Mithril mining report | ⛔ awaiting Tyler | — | Report got cut off ("Mithril requires 60 mining, gives 37 exp, takes 10.1s… Build:"). Need the resend to know the actual complaint (yield? time? XP?). |
| Quest-board rework | ⏸️ PAUSED | — | Design DONE, build PAUSED until scalable-state. Consolidates 4 quest systems → one board; unblocks DAILY_COUNTERS. Resume after §9. |
| Kindling / Beacon events (Muster) | ⏸️ PAUSED | — | Approved design; build PAUSED until scalable-state. |

## 1 · LAUNCH READINESS (beta → next week; after scalable-state)

| Item | Status | Pri | Notes |
|---|---|---|---|
| Dedicated test account | ⛔ | **P0** | Tyler action (Coordinator **cannot create accounts**). Unblocks the team playthrough + enchant round-trip verify. |
| Full-systems team playthrough + BALANCE audit | 🧊 | **P0** | After scalable-state: team runs every system on the test account, finds bugs + tunes balance. Then open keys. |
| Wire rooms + banner tiers | 🔧 | P2 | Generated & on disk; visible-seam cleanup (fits the render/CSS track). |
| Backups / restore DRILL | 🧊 | **P0** | HARD blocker for arming BOTH record flips. Needs a rehearsed run (runbook exists: docs/design/restore-runbook.md). |
| **Beta-morning bug wave (b461)** | 🔧 | **P0** | 2026-08-23, live players: (1) quest-modal claims silently dead under arm → `hr_claim_goal` server credit + honest toasts; (2) worker_hire/farm_land/bank offers wiped by the b459 unlock regen → **re-applied live**; (3) stale impossible daily slates → heal-on-load; (4) residue-save listener stacking per token refresh → 60/min rate gate → once-latch; (5) mobile "stats reset to Lv1" — server rows intact, client display; boot-probe telemetry added, needs device screenshot. |
| **Runecrafting coherence** | 🔧 | **P1** | Tyler 2026-08-23: "doesn't make sense." Verified: enchant runes are CRAFTING recipes, Runecrafting's runes are ammo nothing spends (E1 unbuilt), no level-1 on-ramp (needs Stonemason 8), three rune vocabularies. Game-designer ruling+build in worktree: Runecrafting owns rune binding, level-1 on-ramp, honest purpose for the ammo ladder, unified naming. |
| Ammo consumption in the fight (E1) | 🧊 | P2 | The designed consumable loop's gate (consumable-economy.md §E1): arrows/runes/whetstones spent per swing, fail-soft ×0.25 when dry. Touches the SHA-pinned combat-sim (repack + redeploy + AWAY-1 parity). Not a drive-by; schedule after beta stabilises. |

**Decision pending Tyler:** wipe timing (confirmed: wipe before new players). See §7.

---

## 2 · SERVER-AUTHORITY PROGRAM (the integrity foundation — post-launch)

_Backend-architect plan delivered 2026-08-17 (review-ready, in security review). Key rulings folded in below._

| Item | Status | Pri | Notes |
|---|---|---|---|
| **Gold + gems → SERVER_OF_RECORD** | ✅ **ARMED LIVE (b421, 2026-08-20)** | — | **DONE — the server-authority program is complete.** Tyler pressed the trigger 2026-08-20 after the full deps program (path B: build all 6 reward deps + farming, then flip clean = zero regression). Shipped b412–b420 (muster/raid in-RPC credit · bestiary/collection/streak/renown tracking · daily/quest/collection/renown/bounty claim RPCs · bounty board+marks · companion pet-perk model · server-owned farming · companion un-gate). The flip itself = 2-line client-only uncomment (record.js SERVER_OF_RECORD gold/gems), NO migration/edge (server has owned gold since cutover). Gated GO on all three: **armed suite 960/960 deterministic** (income-regression gone — every earned-gold source server-paid), **security GO** (no forged value crosses to another player's economy/ranking), **release visual gate PASS** (boot fail-closed em-dash + disabled spends, no NaN/crash, both viewports). Read-path harness `stampBalanceLikeLoad` drives the real applyRecord path. Non-blocking residuals: unwired gem sinks (unlockSlot) show em-dash-pending until next hr_load (honest, beta-wipe moots); companion non-gold procs (refundIngredients/doubleDrop) mint INVENTORY ungated — safe until INVENTORY arms (separate flip), then extend the rollProc defer. |
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
| — | **Bulk / quantity buy from shop** | 🧊 | P2 | Paione (2026-08-20): "could we buy stuff in quantity? 300 seeds, 50k iron arrows." Add a quantity param to the buy flow. CHEAPER to do correctly now that every buy goes through a server verb — add the qty arg server-side rather than bolting on a client loop. Slot after the arm. |
| — | **Marks/bounty-shop chest contents + pricing** | 🧊 design | P2 | Fingerguns (2026-08-20): wants ideas for what mark-purchasable chests contain (ammo/materials/gold/deeds) + per-item cost, once everything else is unlocked. Bounty shop is intentionally CHEAP for beta (wipes between releases). Delegated to game-designer for a proposal. Paione hit everything at bounty lvl 20 — shop needs more depth/sinks past the current ceiling. |
| — | Workers gather Stonemason rocks | ⏸️ paused | P2 | Paione + Tyler (2026-08-18): workers already gather wood/ore/fish; stone is a raw material too, so not gathering it is a gap from when Stonemason shipped. Tyler: "yes we should make sure the worker can gather rocks." Small gap-fill — good EARLY pickup once the feature-pause lifts. Files: src/features/workers.js, src/data/stonecraft.js. |
| — | Worker passive-XP trickle (design Q) | 🧊 discuss | P3 | Paione: workers give ~0.1% of normal XP. Tyler: "we need to discuss the exp portion." Nice retention hook BUT passive XP changes progression pacing — game-designer sizes how much / which skills / does it stack (100 workers × % balloons). Not a gut number. Discuss when the pause lifts. |

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
| **Crafted arrows/ammo not consumed in combat** | 🧊 **BUG** | P2 | Paione (2026-08-20): arrows craft fine but aren't spent when used in combat. Server-authority territory (combat + ammo consumption are server-owned) — fix in the combat domain, not a client patch. |
| Shields exist but unobtainable | 🧊 | P2 | Paione (2026-08-20): shield items are defined but have no drop/craft/shop source. Fingerguns confirmed: "created; but no way to obtain at the moment." Pure data-row fix (add a source) — content pass. |

---

## 9 · CODE HEALTH / ARCHITECTURE (the clean-code track — Tyler: "clean code is a must")

_Code-health audit 2026-08-18. Headline: **on a real trajectory to the large-scale-multiplayer end-state — the hard bet (server-authority) is won and proven live, the logic core (`src/core`) is clean/pure/dual-runtime. The liability is the RENDER layer.** Four-layer scorecard: Data 85% · Logic 80% · **Render 20%** · Platform 40% — "built the load-bearing half first."_

| Item | Status | Pri | Notes |
|---|---|---|---|
| `legacy.js` render-layer split → `src/render/*` | 🔧 **active — rolling** | **P1** | Monolith 18.8k lines. Strangler-fig, one domain at a time, behind smoke + visual gate. Pattern: `docs/design/render-extraction-pattern.md`. **Shipped:** #1 **b383** Lifetime Stats · #2 **b384** Active Effects · #3 **b395** Achievements · #4 **b397** Bestiary · #5 **b398** Equipment Bonuses — all pure-refactor, both-theme visual gate PASS. Companions/Stable dup resolved b390. **Clean leaf helpers ~exhausted (1-2 left); next phase = tab/screen CONTROLLERS** (renderCombat/Inventory/Profile/Farm/Shop/buildTibiaDoll) — bigger, need per-controller mapping not the mechanical pattern; scope deliberately (higher blast radius). Serialized: one agent on legacy.js at a time. |
| Test-determinism (kill the b227/b334 flakes) | 🔧 | **P1** | Root cause (investigated 2026-08-19): flakes are ASYNC wrapper installation (setTimeout 600ms sets `__viewedSkillId`; setInterval 200ms wrapAll), NOT static load-order. **Tier 1** (make `__viewedSkillId` synchronous in base openSkillDetail → kills b227) = safe unattended, IN PROGRESS. **Tier 2** (adopt the unused `safe.js` tap registry, replace ~30 `window.showTab` reassignments with deterministic taps) = the real fix but ~40 sites of core nav wiring, silent failure, b361-class → **HELD for Tyler-in-the-loop, fold into the controller extraction**. A deterministic suite is the foundation the riskier debt work rests on. |
| CSS → tokens | 🧊 **held for Tyler** | P1 | 1,756 hardcoded hex. HIGH value (themes/skins backlog → one token set). BUT tokenizing deliberately changes Hearthlight (default theme) component-by-component; piecemeal overnight = players see a half-converted theme with no one eyeballing cumulative coherence. Do as a coordinated pass WITH Tyler reviewing the whole-theme result, not unattended. |
| CSS → tokens, screen-by-screen (convert-as-you-go) | 🔧 | P1 | 1,756 hardcoded hex, 1,343 `!important` across 9 sheets (theme-cozy.css alone: 947 !important). Guard tests catch each conversion. Start with combat + inventory (densest, break most). Unblocks the render layer + themes/skins. |
| Adopt `src/platform/storage.js` across 37 direct-localStorage files | 🧊 | P2 | Mechanical, one file at a time. Prereq for the Steam/mobile platform seam. |
| Load-test `hr-accrue` at a few hundred concurrent intents | 🧊 | P2 | The one "fine at 5, unknown at 500" — verify pooler connlimit 20 + rate-bucket throughput before real launch. |
| Correct doc drift as the split proceeds | 🔧 | P3 | CLAUDE.md line-count corrected 2026-08-18; keep SYSTEMS_MAP in sync when render extraction starts. |
| Do NOT | — | — | Rewrite the monolith wholesale (rejected); widen bump script into supabase/tests (trap); reintroduce a 2nd away-combat path or a data double-copy (both guard-tested). |

---

## 10 · HUNTERA-DERIVED ADOPTIONS (option B — Tyler, 2026-08-23)

_Discovery 2026-08-23: **Huntera** (huntera.com.br, BR, launched 2026-08-21) is a browser Tibia clone — Angular + Phaser real-time tile world, custom authoritative WS server (123 intents / 184 events), automation-first combat, escrowed market, PIX + Solana coin store, "RMT liberado." Tyler's call: **do NOT clone it** (CipSoft IP, original tile art, a second real-time engine); **adopt its best ideas into Hearthrise.** Game-designer ruled (final authority), systems-engineer costed against live server surfaces. Both agree on the order below. **All items gated behind the scalable-state exit criteria** (top of board) — nothing here starts before render extraction / CSS tokens / `hr-accrue` load test, and none of it precedes the inventory flip's real-launch schedule (items 1–4 are flip-independent, which is why they sort first)._

**Effort classes:** ① data-row+UI · ② client feature on an existing RPC · ③ new server verb · ④ new table · ⑤ touches SHA-pinned `combat-sim.js` (repack + Tyler-paste redeploy + AWAY-1 parity).

| # | Item | Status | Pri | Class / effort | Notes |
|---|---|---|---|---|---|
| 0 | **Living Town — shared presence plaza** (the hook Tyler named) | 📋 **DECIDED (Tyler 2026-08-23): 3–5 day throwaway FEEL SPIKE is the FIRST POST-BETA item** — gray-box Phaser scene in a worktree, CC0 placeholder tiles, click-to-walk, Realtime presence, camp fight replayed from real combat-sim events; zero art spend, nothing ships. Spike verdict decides whether the real (art-gated) build gets a scoped program. | P2 (spike) → art-gated (real build) | ②/④ M–L (3–5 wk eng + ART) | Tyler (2026-08-23, playing Huntera): "the coolest part is having a living world in the town and seeing other players on the screen." NOT the second-engine problem — the veto is on shared *authoritative combat*; a town is **cosmetic presence**: one Phaser scene from a Tiled map, click-to-walk, players broadcast position a few×/s over **Supabase Realtime** (already used for chat), name labels + chat bubbles, sharded ~50–80/plaza instance. Hunts stay the server-resolved sim (walk to the gate, tap a camp) — zero change to `hr_apply`/away parity/security. Free hooks once bodies are on screen: emotes, click-a-player → gear/level (server data), clan colours, market as a stall, world-boss crowd at the gate. **Blocker = art** (coherent tileset + walk cycles + outfit/gear variants under the art freeze). Designer to rule on identity (cozy hearth-town, Idle Clans mobile density) before any prototype. |
| 1 | **Sell-lock + loot filter** | 📋 | P2 | ① S (1–2 d) | Flag an item "never auto-sell / never vendor"; loot-class filter for what the bag keeps. Cheapest real win; no new verb. |
| 2 | **Session Tally + Watch Report** (hunt-analyzer) | 📋 | P2 | ② S–M (2–4 d) · **first post-pause pickup** | Surfaces XP/h, gold/h, drops/h, supplies/h, net, per-monster kills, **session bests** on the Fight screen; the away side writes the SAME shape into the welcome-back card so live and offline read identically. Data already exists server-side: `player_ledger` (own-read RLS, one row per apply window — per-kill granularity comes from `hr_bestiary_of` deltas) + `windowEnvelope()` in accrual.js (`paidMs` not `awayMs`). Copy the `src/net/market-history.js` read-only-cache precedent; extends the existing `Ledger` in combat-screens.js. **Rule: reports settled server credit only — never a projection.** No migration, no repack, no security review. |
| 3 | **Bestiary Charms (PROG-01)** | 📋 | P2 | ① probably no new verb | Already approved §3; Huntera's bestiary-completion bonus = this. Server bestiary counters exist (`2026-08-20-bestiary.sql`). |
| 4 | **Standing Orders — B1 "Withdraw when"** | 📋 | P2 | ③+⑤ M (3–5 d) · do ALONE so AWAY-1 has one variable | War Table card, three clauses: *Provisions* (= today's auto-eat, unchanged) · **Withdraw when** HP danger / food out / bag full / after N hours · *Steward* (see #6). Rules are **columns on `player_state`** written by one narrow SECURITY DEFINER RPC (`hr_set_battle_rules`, copy `hr_set_auto_eat` exactly — callable by `authenticated`, not `hr_engine`, clamped on write, read identically by live tick + `computeAccrual`; bind SQL↔JS with a test like `tests/auto-eat-authority.mjs`). Evaluated in `simulateSpan` (which already terminates early on death). **Rules are a TABLE like `AWAY_SCOPE`** — unknown rule = inert, never "stop". Withdraw ends the span early = self-nerf, safe, mints nothing. Biggest away-quality lever we lack ("you died at hour two"). |
| 5 | **Loadout presets ("Marching Orders")** | 🧊 | P3 | ② S | Gear + food + orders saved as one named preset. QoL, no new sim. |
| 6 | **Standing Orders — Steward auto-sell on return** | 📋 | P3 | ③ M | Auto-sell chosen loot classes on return, **server-priced NPC vendor verb only** (`vendor-sell.js` exists) — never locked/bind-on-pickup items, never above vendor, never a client-computed credit. |
| 7 | **Quarry** (prey-style focus pick) | 📋 design-deconflict first | P3 | ③+⑤ M (4–6 d) | A LAYER, not a duplicate: bounties = contracts for Marks; **Quarry = one bestiary-studied monster you're focused on, chosen free once/day, +drop/+XP vs that species only.** Bonus applies inside `simulateSpan` per UTC segment like `botd`. Sibling columns on `active_bounty` / reroll = marks via `hr_bounty_spend`. **Designer must deconflict bounty / BotD / Quarry (three "kill this for more" layers) before build.** If it ever grants Marks or a second reroll currency → kill it. Reject Huntera's wildcard currency. |
| 8 | **Depot → Bank client UI** | 📋 | P2 (post-wipe) | ② S (1–2 d) | Server half is BUILT and dormant: `player_bank`, `hr_bank_move(p_slot,p_item,p_qty,p_dir,p_idem)` (locked, idempotent, rate-gated, journalled), `hr_state_of` projects `res.bank`. `G.bank` is client-authored today. Also the fix for the dead Cellar "+500 storage" perk. Flip couples to `INVENTORY_ARM_ENABLED`. |
| 9 | **Standing Orders — B2 targeting priority + ammo/rune selection** | 🧊 | P3 | ③+⑤ M | Changes fight outcomes/drop table → separate parity run. **Blocked on E1** (ammo consumption; `src/core/ammo.js` "NOT YET WIRED"), already scheduled post-beta. |
| 10 | **Enchant v2 + Tempers** (imbuements MERGED) | 📋 | P2 | ④ M–L (6–10 d) | Designer: one enchanting system, two axes — permanent element binding (board §6) + **Tempers** = charge-limited slots fed by monster materials (the home for ~25 vendor-trash tier-3–6 drops). NOT a separate shrine (would split the rune economy). Engineer: `player_inventory` PK `(user_id,slot,item_id)` has no instance dimension and adding one means rewriting `hr_apply` (forbidden) → use a **sibling `player_item_instances` table, the `bank-store.sql` precedent**. Timestamp-expiry tempers are cheaper than the wipe-rune economy. |
| 11 | **Buy-offer order book (escrowed, two-sided, partial fills)** | 📋 | P2 — **last; not pre-launch** | ③④ XL (12–20 d) | Designer: highest-value economy item ("nobody online to sell to me" dead moment). Engineer: buy-offers were **deliberately demolished** (`2026-08-17-market-buy-offers-lockdown.sql`: no server model/RPC/escrow — client escrowed its own gold). Genuine server rebuild: gold-escrow ledger, matcher under the existing market lock discipline, partial fills, cancel refunds, history. Hardest concurrency item on the board. **Prereqs: Phase 3 ledger accumulator (§2) + `hr-accrue` load test.** Then unhide the UI. |
| 12 | Guild log / directory / ranks | 🧊 | P3 | ②/③ S–M | Cheap retention; gated behind the clan-contribute mint fix (§2 Clan pass 2). |
| 13 | Friends list | 🧊 | P3 | ④ S–M | Mutual-consent table; `display_names` is the name authority. |
| 14 | Arena → PvE ladder · Discord/push alerts on the platform seam | 🧊 | P3 | — | Later. (Telegram-style per-user webhook secrets declined — new abuse surface for what Discord serves.) |

**Explicitly REJECTED (do not re-propose):** stamina with paid refills / VIP tiers (our daily cap is the honest version and must never be purchasable) · coin transfer by character name · face-to-face trade (RMT/scam rail, defeats market authority) · PIX / USDC / USDT coin store / any RMT (Bond stays IAP-only, non-mintable) · death-protection "blessings" (no item loss on death → fake stakes) · chase/keep-distance + spell rotation bar + follow-member (no tile world) · **instanced party hunts — TECHNICAL VETO** (`hr_apply` is single-character by construction; shared authoritative tick across N characters = a second engine; co-op stays on shared objectives: muster/raid contribution) · hunt-analyzer profit shown as a projection · setting sprawl (every rule must be server-evaluable or away-play diverges from live — the one failure the away architecture exists to prevent).

**Already HAVE (do not rebuild):** auto-eat (potion rules) · offline training · hunt catalog by level · cyclopedia (Review Book + item index) · quick-sell/NPC sell · daily reward · highscores (b374) · polls (`clan_vote_*`) · support tickets (`bug_report_submit`) · arena/raids (`raid_strike/claim`, `hr_hunt_band`, muster).
