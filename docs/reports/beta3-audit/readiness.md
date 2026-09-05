# THE BETA-3 READINESS VERDICT

> ## ⏫ 2026-09-05 UPDATE (Live: b505 `?v=505`; CI green on `main`)
> The 2026-09-04 verdict below said NO, five measurements. **Four of the five are now closed, and the fifth is materially improved.** What shipped this session (all live, play-gated where a player-facing loop, CI green):
> - **SA-001 attended-loot under-credit → FIXED (b504).** Settle tops up loot/gold from the server's own `hr_kill_credit_log`; play-gated; `attendedChannel:"live"` on prod; food-return gone. *(Blocker #3's root — the mid-game was starved of the drops it needed.)*
> - **SA-021 progression wall → BROKEN OPEN.** Its two roots are fixed: SA-001 (loot starvation) + SA-002 property rung server-truth (b502). Players can now bank the pelts and the property record can no longer deadlock. *(Residual: the DESIGN question "does a 4-pelt gate belong on the sole mid-game path?" is a game-designer ruling still worth making — the mechanism is now reachable, but the gate's tightness is a balance call.)*
> - **SA-008 Bounty-Hunter XP / bounty-strip Lv-1 reset → FIXED (b504).** Turn-ins credit `player_skills.bountyHunter` server-side; proven end-to-end live (0→45, survives the reload path). Board tiers unlock. *(Bounty-strip UI honesty — rendering non-`cull` types that only `cull` can turn in — remains a small UI item.)*
> - **SA-048 bounty difficulty exploit → CLOSED (applied + play-gated).** Forged `hard` on the now-ranked board refused below BH-15; honest play unaffected. *(A NEW exploit b504 opened, caught and closed same session.)*
> - **SA-003 CI red → HEALTHY.** Root cause (in-page 120s budget + then a run-smoke overload misdiagnosis + a real SA-048 test regression in `bounty-difficulty-count`) all fixed; `main` CI is green. **Gate discipline corrected: the local half is `run-ci-local --all` (plain `run-ci-local` skips run-smoke/step 6), and run-smoke now writes its failure transcript to a downloadable artifact.** *(Blocker #4's "the gate is not a gate" — the gate now runs and is green; the DEEPER SA-013 "false-passing runner counts no assertions" is NOT yet addressed — see remaining.)*
> - **Signup door + SA-009 gems → FIXED (b503).** Confirm-link lands you in + resend + invite-as-link; gem spends fail closed honestly. *(Blocker #5's funnel mechanisms.)*
> - **Dungeon scrip (report #3) → DARK-SHIPPED (b505), ARM BLOCKED ON TYLER.** Migrations applied, edge deployed, security-GO, `dungeon-scrip-reload` guard proves reload-survival on the applied chain. Arming needs a live dungeon play-gate the max_hp-10 QA account can't produce (can't earn a key). One action for Tyler.
>
> **CURRENT VERDICT: materially closer, not yet YES.** The beta-2 killers are fixed. Remaining before a beta-3 call (none blocking on a bug now — they are program/design/Tyler items):
> 1. **Arm the dungeon fix** — Tyler plays a dungeon (or provides a keyed/stronger QA account); then a 2-line flip.
> 2. **SA-013 false-passing test runner** — the in-page runner counts no assertions (9 zero-assert tests, ~200 early-returns, 62 `assert(true)` skips). CI is green, but "green" is only as strong as the runner. A P1 test-infrastructure program; every guard's verdict rests on it.
> 3. **First-night gathering-rescue + a `computeAccrual` first-night parity guard** — the largest measured week-1 bounce; not-started.
> 4. **Armor/defence overhaul** — now UNBLOCKED (SA-021 open, so tier-4+ has reachable subjects); P1 balance, engine change + play-gates.
> 5. **Wave-scale load verdict** — re-run `tools/load-probe.mjs` at the beta-3 wave size and commit the output.
> 6. **Tyler-only:** the wipe ceremony (built + rehearsed) + the 20 new invite keys + the itch.io iframe confirm-walk.
>
> **Release confidence for a beta-3 wave TODAY: ~65%** *(2026-09-05 13:55: +10 — SA-013 is now DONE both increments, HR_ASSERT_STRICT ON both gate halves green; the test suite is trustworthy at the assertion level, so the shipped fixes' guards can be believed. Remaining leverage: the dungeon arm (Tyler) + first-night rescue.)* Prior estimate ~55% — up from "not close." The progression wall (the beta-2 funnel-killer) is broken open and the funnel door is fixed, which removes the two failures that defined beta-2; the remaining gap is (a) the dungeon arm awaiting one play, (b) a test runner whose greenness is not yet trustworthy at the assertion level, and (c) two un-started retention/balance programs. A wave could ship on the current fixes and be a real improvement over beta-2, but SA-013 + the first-night rescue are what move confidence past ~80%.
>
> The full 2026-09-04 verdict and evidence follow unchanged for the audit trail.

**Date:** 2026-09-04 · **Tree:** `main` @ `00b927b1` · **Live:** b501 (`?v=501`) · **Source:** gates.json (22 items) corrected by phase-2 adversarial verification (28/34 P0-P1 findings survived, 16/16 guard verdicts survived, 15/56 in-page section verdicts survived, 12/12 coverage gaps confirmed)

---

## 0. THE ANSWER: NO — and not close, measured

The game is **not** in a beta-3 state today. Five measurements, each independently sufficient:

1. **14 of 22 gate items are not started; 0 of 12 in Phase 2 (the door) and Phase 3 (ceremony) are green.** Shipped: 4. In progress: 2. Blocked: 1. Unknown: 1. The two shipped Phase-1 items (auto-eat b500, runecrafting b432/b464) are the smallest two on the list.

2. **The gate list itself is stale — it predates the four open P0s.** None of SA-001 (attended-loot under-credit), SA-002 (residue-ahead property deadlock), SA-003 (CI red), SA-021 (the progression wall) is a gate item, because all four were measured *after* the beta-3 plan was written on 2026-08-31. A gate list that cannot see the P0s cannot certify a release.

3. **The mid-game is provably unreachable for the entire playerbase.** Prod census, 2026-09-04, all 36 characters: the only unlocks that exist anywhere are `property:homestead` (14 players) and `room:kitchen` (9). **Zero Forges, zero Libraries, zero Workshops, zero Gardens. Nobody has ever reached property rung 2. Last unlock of any kind: 2026-08-28.** `smithing`, `crafting`, `bountyHunter` XP = **0 for all 36 players** while `mining` = 964k. Players hold ~170,000 raw materials (60,938 copper ore, 53,591 coal, 33,277 logs) and **zero bars, zero planks**. `hr_rejections` shows `unlock_buy:property.farmstead` → `insufficient_item` **17 times across 6 players, every one `{have:3, need:4, item_id:wolf_pelt}`**. Six players stalled one pelt short of the sole gate to the entire mid-game. Shipping a wave into this is shipping beta-2 again with better instrumentation.

4. **The release gate is not a gate.** CI on `main`: 40 completed runs since 2026-08-29, **zero green** — every release since b488 shipped on the strictly weaker local `run-smoke`. The in-page runner (`smoke-test.js:72-83`) reports PASS for any body that does not throw and counts no assertions: 9 registered tests contain zero assertions, ~200 more can early-return before their first assertion, and 62 `assert(true, …)` skip sites are indistinguishable from passes. Of 12 audited coverage gaps, **12/12 were confirmed real, and 12/12 of the proposed tests would have failed to catch the incident they were written for** — including one guard (B495-3) whose 10-minutes-of-720 floor (1.4%) *passes on the 2.0% first-night death it is named after*.

5. **Every mechanism that cost beta-2 its funnel is still in the code, byte for byte.** `src/net/auth.js:888-894` passes no `emailRedirectTo`; `src/net/account-gate.js:789-790` still reads *"Account created. Confirm the link in your email, then sign in."* — the dead end that cost −11 of 49; there is no resend affordance anywhere in the client; invite codes are still a hand-typed field (13 `refused_unknown` vs 5 redeemed). Worse: the one test that reaches this branch (`smoke-test.js:17119` OPEN-3) **asserts the dead-end copy as production-correct**.

**The bar, not the calendar, sets the date.** What stands between here and beta-3 is: 1 CI lane (in flight) + 2 P0 program builds + 1 designer ruling + 5 door items + a built-and-rehearsed wipe ceremony + 4 acts only Tyler can perform.

---

## 1. GATE STATUS — all 22 items

Evidence is phase-1's, **corrected where phase-2 verification changed it** (corrections marked ⚠).

### Phase 1 — week-one-worth-returning-to

| Item | Status | Measured evidence | Blocker | Tyler-only |
|---|---|---|---|---|
| First-night gathering-rescue prompt | **not-started** | No code, no branch, no design note. `grep` for rescue/gathering-switch finds only the unrelated bounty withdraw at `legacy.js:4377`. ⚠ **Correction:** the guard that would police this (`smoke-test.js:35861` B495-3) has a floor of 10 min of a 720-min night = **1.4%**, while the board's measured first night banks **2.0%** — the guard passes on the live defect. It also runs the *client* core (`combat-sim.simulateSpan`), never `computeAccrual`, so no fixture anywhere measures a fresh character's night on the engine that actually pays it. | Never dispatched. Needs a systems/design lane (no engine change: hook the death/leave-fight path + away preview) **and** a real first-night parity guard. | No |
| Auto-eat completion (b500) | **shipped** | Release `4084ec3c`; `cheapestSufficientFood` `auto-eat.js:307`; `SYNC_ENABLED_TOGGLE=true` `auto-actions.js:215`; live at ?v=501; toggle round-trip verified on prod. | ⚠ **Correction:** the *gate item* shipped, the *class* did not. Attended auto-eaten food still returns on reload: `legacy.js:8483` holds the meal instead of sending an intent whenever the server owns the debit, the hold lives in `_pendingConsume` (`pending-consume.js:105`) which is `_`-scratch on no allowlist with a 10-min TTL, and the settle's re-sim debits its own meals, not the player's. Measured: 7 `cooked_shrimp` returned. Closes only with SA-001. | No |
| Armor/defence overhaul (both ends) | **not-started** | Engine unchanged since b495: `combat.js:46-49` `monsterBaseAccuracy 0.50 / perPoint 0.006 / min 0.10 / max 0.85`; ~0.6%/def point; the 10% floor lands at def = atk+67. Live 2026-09-01: 51.8% → 47.6% with a full starter set. Only design doc `armour-identities.md` pre-dates the P1. | Engine change in SHA-pinned `combat.js` (vendored → repack + edge redeploy + AWAY-1 parity) + security pass + two play-gates. ⚠ **Note:** downstream of SA-021 — zero players hold a bar or a plank, so the tier-4+ saturation half currently has no reachable subject. | No |
| Bounty-strip honesty | **not-started** | `legacy.js:11873-11890` renders the strip from the full ladder (`bounty.js:196-205`) while `BOUNTY_TURN_IN` makes only `cull` offerable. Confirmed live 2026-09-01. ⚠ **Correction (SA-008, verified):** the strip is doubly wrong — `getBountyHunterLevel` (`legacy.js:11533`) reads `G.skills.bountyHunter`, which `applyRecord` overwrites from the server map where the row is seeded 0 and never credited, so the header reads **Lv 1** after every envelope and first-contract pricing regresses to the 15-25-kill bracket. | Small UI change + designer wording call; the level-reset half needs a server credit in `hr_claim_bounty` or a residue read. Not dispatched. | No |
| Weekly capability filter | **not-started** | `legacy.js:20629-20650` `pickWeeklyIds` filters only `goalDealable(def)`; the daily predicate `dailyTaskEligible` (`goal-catalogue.js:193`) has no weekly counterpart; `grep -i weekly` in `2026-08-29-daily-task-eligibility.sql` → nothing. | Client predicate + server mirror in the weekly claim RPC (same union-gate shape as the daily fix) + drift guard. Not dispatched. | No |
| Week sequencing (renown/collection spine) | **not-started** | No design doc or commit after the plan commit `0f34b6ea`; no owner recorded in HANDOFFS. | Game-designer ruling + sequencing spec. | No |
| Runecrafting coherence | **shipped** | `266de764` on main, shipped in b464; CHANGELOG:223. Board row §1:113 is a **stale 🔧 P1** and should be closed. | None. | No |

### Phase 2 — the door

| Item | Status | Measured evidence | Blocker | Tyler-only |
|---|---|---|---|---|
| Confirm-link lands you IN + resend | **not-started** | `auth.js:888-894` signUp passes no `emailRedirectTo`; `account-gate.js:789-790` still says "…then sign in."; no `resend` anywhere in `src/`. ⚠ **Correction (gap check 7):** the suite *ratifies* the dead end — OPEN-3 (`smoke-test.js:17119`) stubs `session:null`, calls it "the real production shape", and asserts the copy at :17190-17194. `emailRedirectTo` / `detectSessionInUrl` / `exchangeCodeForSession` appear **nowhere** in `src/` or `tests/`. No headless guard ever boots with a session (`run-smoke.mjs:1064-1072` returns `session:null`). | Client change (emailRedirectTo + session pickup + `auth.resend`) + Supabase redirect allowlist config + a confirm-handoff guard. Not dispatched. | No |
| Invite LINKS + attribution + founder cosmetic | **not-started** | No URL-parameter handling in `account-gate.js`/`main.js`/`auth.js`; invite is a hand-typed field (`:453-491`). `FOUNDER_TITLE` exists (`legacy.js:3722-3738`) but is tied to nothing. ⚠ **Addition:** nothing tests that the client's `code.toUpperCase()` (`account-gate.js:781`) and the server's `hr_beta_code_norm` agree on human retypings — the untested half of the 13:5 code failure. | Invite-link parsing + attribution column on `beta_invites` + cosmetic grant rule + a normalisation-parity guard. Not dispatched. | No |
| Standing funnel view | **not-started** | No SQL view/RPC/tool; `grep funnel` in supabase → one comment; the 2026-08-31 numbers came from ad-hoc queries. | Read-only view (auth.users confirmed_at × characters × game_events) + a render surface. Not dispatched. | No |
| Stranger play-gate | **not-started** | No artefact anywhere; only mention is the plan line PRIORITY_BOARD.md:20. | A real outside human, recruited by Tyler, **after** the door items ship. | **Yes** |
| CAPTCHA (dormant) | **not-started** | No captcha/turnstile/hcaptcha in `src/`; only a recommendation comment at `2026-08-23-open-beta.sql:1057-1062`; `config.toml` has no entry. | Client token plumbing + Auth provider config. Not dispatched. | No |

### Phase 3 — ceremony

| Item | Status | Measured evidence | Blocker | Tyler-only |
|---|---|---|---|---|
| F3/F4 one-liners | **not-started** | F3: `2026-09-04-auto-eat-at-creation.sql:428-434,474-482` records that hr_import_apply's progress arm is a tautology and the `insert … returning (xmax=0)` count must be restored **before** `import_reopen` is ever set. F4: `2026-08-17-cutover-import.sql:963` still writes `auto_eat_pct = v_ae_pct` unclamped. | Two anchored-splice migrations + cutover guard + live-hash re-pin + security review. Trigger = ceremony scheduled. | No |
| Wipe migration built + rehearsed | **not-started** | No wipe migration or tool exists; only rehearsal artefacts are the 2026-08-16 *import* ceremony. | Author from `restore-census.baseline.json` classes; rehearse on a branch with live-hash before/after. **F3/F4 first.** | No |
| Restore drill | **not-started** | `restore-census.baseline.json:459-461` `last_executed: null`, `measured_rto: null`; banner "RESTORE DRILL: NEVER EXECUTED" on every run; `d5b4b944` records the 2026-08-15 attempt blocked at the one step with no API. | The restore-to-target step has **no Management API** — dashboard click. ~90 s. Then stamp `last_executed` + RTO. | **Yes** |
| PITR on | **blocked** | `restore-census.baseline.json:71` `pitr_enabled:false`, 24h loss window. Deferred by Tyler 2026-08-31 under the budget freeze — **re-open trigger: "before the next beta-wave invites go out."** That trigger is now. | Tyler's spend ruling; dashboard toggle. | **Yes** |
| Wave-scale load verdict | **unknown** | Harness exists (`tools/load-probe.mjs`, `376ec7b7`): "GREEN for the beta wave (54 DAU), AMBER at 10×, ceiling ≈111 DAU"; Supavisor concurrency modelled at :652-657. The board's "connections fail TOTAL at 60" appears **only** in PRIORITY_BOARD.md:20 — no report, no probe output, no DISCOVERIES entry records that run. Not re-run since 2026-08-29. | Re-run at the beta-3 wave size and **commit the output** so the verdict is a repo artefact, not a board sentence. | No |
| Fresh-account playthrough | **not-started** | The 2026-09-01 play-gate was a fresh **slot-2 character on an existing account**, not a fresh account. FTUE + boot-hydration on a brand-new account remain unverified; board :36 requires re-verify on wipe day (a default render on wipe day is indistinguishable from a botched wipe). | Coordinator is prohibited from creating accounts. | **Yes** |
| Secrets + MCP + Sentry armed | **in-progress** | Sentry **armed** (`observability.js:43` DSN, SRI-pinned, loaded first at `index.html:961`). Secrets **not verified** — `edge-quota-watch.yml:15-17` needs `SUPABASE_ACCESS_TOKEN` + `DISCORD_ALERT_WEBHOOK`, workflow inert. MCP **not armed** — ⚠ **re-confirmed this session**: the Supabase MCP server reports "requires authentication". | Tyler: add the two Actions secrets; re-auth the connector from an interactive session. | **Yes** |

### Player-reported reload-loss bugs

| Item | Status | Measured evidence | Blocker | Tyler-only |
|---|---|---|---|---|
| ① Forge/rooms lost on reload — b501 | **shipped (partial)** | `10de43fd`: advance only on server OK via `hrClassifyUnlock` at 4 sites; tests UNLOCK-VERDICT-1/PROP-REFUSE-1/PROP-OK-1; live at ?v=501; refusal branch verified on prod 2026-09-04. ⚠ **Correction (SA-002, verified):** b501 stopped *new* optimistic advances but **cannot repair residue already wrong**. `property-record.js:208` heals RAISE-ONLY (`max(server, residue)`) and `:226` says "NEVER LOWERS", so Paione's residue tier 2 over server rung 1 survives every reload *and re-uploads itself* — Forge refused `prereq_property_tier` ×10 today. The play-gate could not see this because it ran on the QA account where residue == server. | Fix in flight (`fix/property-rung-server-truth`, uncommitted work in worktree). Needs a **residue-AHEAD play-gate fixture**. | No |
| ② Combat keys vanish on reload — b501 | **shipped (partial)** | `3e9aabab`: 6 keys folded into `monsters.js` drop rows; client mint deleted; `tests/dungeon-key-drops.mjs` green; edge payload `ac7481dd` GET-verified. ⚠ **Corrections:** (a) not witnessed as a live drop (0 seals in ~15 kills, expected ~0.5); (b) **SA-001 still retires any client-shown drop, keys included**; (c) the key *debit* is still client-only — `dungeons.js:359`, `:940`, `dungeon-scavenger.js:590` call the bare `removeItem`, so the merge reconcile hands the spent key back and one key runs its dungeon forever. | Key *consumption* closes with dungeon increment 2/3; key *retention* closes with SA-001. | No |
| ③ Dungeon scrip resets to zero — increments | **in-progress** | Main still mints client-side (`dungeons.js:203-212`). Increment 2 built + guard green (7/7 mutations) + security GO for a DARK ship on `worktree-agent-a5887d3f5a7897ba4` @ `5235d76d`, **not on main**. Increment 3 not built. ⚠ **Addition:** `flipArmBlockers()` is **empty** — `unbackedOwnableMintLanes()` (`item-authority.js:473-498`) does not register the Quartermaster lane, so the six QM-purchasable keys are OWNABLE, client-minted, and unguarded; register the lane fail-closed or refuse the QM buy while `QUARTERMASTER_SERVER_BACKED` is false. | (1) designer ruling landed (9 ids BoP, 25 runs/day); (2) increment 3 not built; (3) apply order catalogue→scrip→settle + live-hash re-pin + edge redeploy. Ships as b502 **after** b501's residue-ahead gate. | No |

### Not on the gate list, but blocking beta-3 (add these rows)

| Item | Sev | Status | Why it belongs on the gate |
|---|---|---|---|
| **SA-001** attended-fight loot/food under-credit | **P0** | 🔧 `feat/attended-loot-credit` | Measured on prod: one 3-min fight → `combat/accrue` `qty_in 16` vs 26 client-shown drops; 7 shrimp returned. At scale on Paione over 20 days: **5,711 `combat/xp_credit` rows vs 112 `combat/accrue` rows (51:1)**. Root of report #2 and of every food-return report. |
| **SA-021** the progression wall | **P0** | 🔴 open | Prod census above. The 4-`wolf_pelt` Farmstead is the sole gate to Forge/Workshop/2nd worker; 6 players stalled at `{have:3, need:4}` while the playerbase holds 8 pelts total. Downstream of SA-001. |
| **SA-003** CI red since 2026-08-29 | **P0** | 🔧 `fix/ci-green-lane` (1 commit) | 40 runs, 0 green. Every release since b488 gated on a signal weaker than CI. |
| **SA-009** free themes / cosmetics / gem bank space | P1 | 🔧 `fix/gem-spend-server-backed` | Three ungated `G.gems -=` sites (`legacy.js:9374`, `:9554`, `:4284`) on an armed record field with no server verb: gems refund on the next envelope, residue ownership persists → premium goods are free. |
| **SA-013** false-passing tests | P1 | 🧪 | The runner cannot distinguish coverage from silence. Everything above is certified by it. |

---

## 2. THE CRITICAL PATH — in order

**Legend:** ⚡ = one build · 🏗 = a program (multi-build / migration / edge redeploy / security) · 👤 = Tyler-only.

**Tier 0 — make the gate real (nothing downstream can be trusted until this lands)**

| # | Item | Size | Unblocks |
|---|---|---|---|
| 0.1 | **SA-003 CI-green lane** — fix each red correctly (never loosen), resolve the `live-hash-drift` live≠replay with a real body diff, fill the `--write` REVIEW placeholder, repair `conservation-fuzz`'s hero-slot fixture, re-pin `rpc-resolution` with justification, stub `clanLaunched()` for `raid-card-copy`, add `run-smoke --ci` with a parity guard | 🏗 in flight | **Every other verdict in this document.** A green claim before this is a claim about a weaker gate. |
| 0.2 | **SA-013 assertion counter + gate census** — `tryRun` counts assertions (zero → FAIL, explicit `skip()` → third status), a named-manifest skip ratchet, and `tests/gate-census.mjs` failing on any guard no gate runs (**13 orphan guards today**, three of which this audit's own coverage map cites as live coverage) | ⚡+⚡ | Makes "1118/1118 green" mean something. Would have caught b348, the 13 orphans, and the 12/12 rewritten gap tests. |
| 0.3 | Wire the 4 orphaned guards that already work (`visual-qa.mjs`, `gem-daily-budget.mjs`, `worker-accrual.mjs`, `enchant-intent.mjs`) into `run-smoke` **and** `smoke.yml` | ⚡ | The visual gate stops depending on a Chrome window that collapses. |

**Tier 1 — make the game finishable (the P0s)**

| # | Item | Size | Unblocks |
|---|---|---|---|
| 1.1 | **SA-001 attended-loot credit** — server rolls the drop table for the kills `hr_credit_kills` already credited, under its physical-max cap (the client never names an item), plus a food debit so eaten food stops returning; flush the kill/XP credits **before** `set_activity` (`activity.js` `declareActivity` awaits neither flush today) | 🏗 in flight (RPC + edge redeploy + security) | SA-021, report #2 in full, every food-return report, dungeon increments 2/3, key retention, D1→D2. **The single highest-leverage item on the board.** |
| 1.2 | **SA-002 property rung server truth** — server rung is truth in *both* directions (set, not max), residue becomes a display cache, every capability gate reads the record, gate closed while unloaded, kill the `homestead.js:302` ratchet | ⚡ in flight | 5 hard-locked characters incl. Paione; rooms/workers/plots; report #1 in full. Client-only, no data patch — players self-heal on next load. |
| 1.3 | **SA-021 designer ruling** — does a 4-pelt gate belong on the sole path to the mid-game? Then reproduce on a wolf (kill until the client shows 4; assert the server agrees) | ⚡ ruling + data row | The entire mid-game: smithing, crafting, bountyHunter, all rooms, the 2nd worker, gear progression. |
| 1.4 | **SA-009 gem spends** — fail closed under the gems arm at all three sites, disable the buttons, then a real gem verb in the `hr_buy_hero_slot` shape | ⚡ then 🏗 | Premium-currency integrity before a wave sees it. |
| 1.5 | Dungeon **increment 3** + arm 2+3 together (b502) — `quartermaster_buy`, earn cap excludes spends, `G.inventory.dungeon_scrip`→`G.dungeonScrip`, register the QM lane fail-closed | 🏗 | Report #3 closes. Depends on 1.1 (scrip/loot ride settlement). |

**Tier 2 — week one worth returning to (Phase 1)**

| # | Item | Size | Unblocks |
|---|---|---|---|
| 2.1 | First-night gathering-rescue prompt + a **first-night parity guard** on `computeAccrual` (not the client core) | ⚡+⚡ | D1→D2. The largest measured week-1 bounce cause. |
| 2.2 | Bounty-strip honesty **+ the Lv-1 reset (SA-008)** | ⚡ | Honesty; unblocks re-enabling bounty types later. |
| 2.3 | Weekly capability filter (client predicate + server mirror + drift guard) | ⚡ | Week-2 goal integrity. |
| 2.4 | **Armor/defence overhaul, both ends** | 🏗 (engine + repack + edge + security + 2 play-gates) | Week 2 survivability. *Sequence after 1.1/1.3* — the tier-4 saturation half has no reachable subject while zero players own a bar. |
| 2.5 | Week sequencing ruling (renown/collection spine) | ⚡ ruling | Gives 2.1-2.4 a shape. |

**Tier 3 — the door (Phase 2)**

| # | Item | Size | Unblocks |
|---|---|---|---|
| 3.1 | **Confirm-link lands you IN + resend** — `emailRedirectTo`, session pickup on return, `auth.resend`, **and amend OPEN-3 which currently asserts the dead end as correct** | ⚡ + dashboard config | 73% of the beta-2 funnel loss. |
| 3.2 | **Invite LINKS + attribution + founder cosmetic**, plus a client/server code-normalisation parity guard | ⚡ + server column | Keys 17% → >60%. |
| 3.3 | Standing funnel view (read-only SQL view + a render surface) | ⚡ | Measuring the wave *during* it instead of after. |
| 3.4 | CAPTCHA shipped dormant | ⚡ + config | Wave-day abuse lever. |
| 3.5 | **Stranger play-gate** 👤 | 👤 | The only evidence the door works for someone who did not build it. **Requires 3.1-3.3 shipped first.** |

**Tier 4 — ceremony (Phase 3)** — strictly ordered

| # | Item | Size | Unblocks |
|---|---|---|---|
| 4.1 | F3 (restore the `xmax=0` progress-import count) + F4 (clamp imported `auto_eat_pct` to the tier ceiling) | ⚡⚡ (2 anchored splices + live-hash re-pin + security) | **Blocks 4.2. Both become blocking the moment `import_reopen` is set.** |
| 4.2 | Wipe migration authored from the restore-census classes + rehearsed on a branch, live-hash before/after | 🏗 | The ceremony itself. |
| 4.3 | **Restore drill** 👤 (~90 s, free) — then stamp `last_executed` + RTO | 👤 | The census banner stops nagging; the one cutover-blocker that has never been cleared. **At 34 MB it will never be cheaper.** |
| 4.4 | **PITR ruling** 👤 — the re-open trigger ("before the next wave invites go out") has fired | 👤 | The fresh cohort's first week is exactly what PITR protects. |
| 4.5 | Wave-scale load verdict re-run at beta-3 size, output committed | ⚡ | Replaces an unsourced board sentence with an artefact. |
| 4.6 | **Fresh-account playthrough** 👤 on wipe day | 👤 | FTUE + boot-hydration on a brand-new account — never verified. A default render on wipe day is indistinguishable from a botched wipe. |
| 4.7 | **Secrets (×2) + MCP re-auth** 👤 | 👤 | `edge-quota-watch` stops being inert; specialists regain `execute_sql`. |

**Tyler-only, consolidated (6):** restore drill · PITR ruling · stranger play-gate · fresh-account playthrough · 2 GitHub Actions secrets · Supabase MCP re-auth. Four of them are Tier 4 and can be scheduled as one sitting; the PITR ruling can be made today and its trigger has already fired.

---

## 3. DEFINITION OF DONE — per phase

The bar, with the artefact that proves it. **No phase is done on assertion; each row names the thing that goes red if it regresses.**

### Tier 0 — the gate is real
- **DoD:** A release is green only when *both* `node tests/run-smoke.mjs --ci` and the GitHub run on the release commit are green; no guard exists that no gate runs; no test can report PASS having asserted nothing.
- **Proved by:** a green GitHub run on the release SHA (currently 0/40) · `run-smoke --ci` parity guard derived from `smoke.yml` · `tests/gate-census.mjs` (A1 execution / A2 controls-executed / A3 CI-parity, with its own `--selftest`) · the `tryRun` assertion counter + named skip manifest + a pinned per-test assertion floor · `suite.total` compared against a pinned registration count.

### Tier 1 — the game is finishable
- **DoD:** What the client shows a player earning, the server credits; what the player spends stays spent; a player who can see a capability can use it, and one who cannot is told why.
- **Proved by:** `tests/attended-window-conservation.mjs` (A1 kill-count parity between `hr_credit_kills` and the settle for the *same* window; A2 a held auto-meal is settled or re-sent; A3 no silent retirement across reload — every retired unit named in a receipt) · `tests/reload-truth.mjs` (RT-0 every *scanned* G-write field survives a real `hr_put_client_state` → `hr_state_of` → apply round trip — iterate the **derived write set, never the allowlist**; RT-1b **residue-ahead ⇒ server truth wins downward**, red on main today) · a **progression-reachability guard** (from a fresh character, every rung of the property ladder is reachable with server-credited materials) · `tests/optimistic-heal-census.mjs` (O3: no site may pre-apply a field its reconcile heals raise-only) · the SA-021 wolf reproduction · a **residue-AHEAD play-gate fixture** on prod.

### Tier 2 — week one is worth returning to
- **DoD:** A fresh account's first overnight banks a designer-ruled fraction of the night and does not die from a config the game handed it; every advertised capability is postable; armour changes the number the tutorial promises it changes.
- **Proved by:** `tests/first-night-parity.mjs` (kit-derived fixture, 20 seeds, on `computeAccrual` **and** AWAY-1 parity with the client core; A1 asserts a death means the *whole kit was eaten*; A2's floor is a **named export in `start-kit.js`**, so moving the bar is a reviewed design change) · a bounty-strip test asserting the strip shows only postable types **and** a Bounty-Hunter-level test that survives an envelope · a weekly-eligibility drift guard mirroring the daily one · armour: two play-gates (low end + tier 4) with before/after accuracy measured on prod, plus AWAY-1 parity after the repack.

### Tier 3 — the door
- **DoD:** A person who is not on this team creates an account from a link, clicks the confirm mail, and is **in the game, signed in, playing** without typing anything twice — and we can watch it happen in a standing view.
- **Proved by:** `confirmHandoffGuard` in `run-smoke.mjs` (boots with an auth fragment and **no `__HR_TEST_HARNESS__`**: exactly one `hr_create_character` with an authenticated bearer, then one `hr_load`, gate open <20 s, token cleared from the URL, no factory-default character painted) · CONFIRM-DOOR-1 in-page (signUp carries `emailRedirectTo`; the success copy does **not** match `/then sign ?in/i`; a resend button exists, is cooldowned, and calls `auth.resend`) · INVITE-NORM-1 (client `toUpperCase` ≡ `hr_beta_code_norm` over a human-retyping corpus) · the standing funnel view returning non-zero rows · **the stranger's own account visible in that view.**

### Tier 4 — ceremony
- **DoD:** The wipe has been performed once on a rehearsal target with a before/after live-hash, a backup has actually been opened and timed, and a brand-new account has been played through the first hour on the wiped tree.
- **Proved by:** F3/F4 applied + live-hash re-pinned + security signed · a rehearsal artefact in `cutover-reports/` for the *wipe* (not the 2026-08-16 import) · `restore_drill.last_executed` and `measured_rto` **non-null** in `restore-census.baseline.json` · `pitr_enabled: true` or a written ruling with the trigger explicitly re-deferred · a committed `load-probe` output at wave size · the fresh-account playthrough recorded in the Playtests section with FTUE + boot-hydration verified · `edge-quota-watch` observed firing once.

### Launch week (Phase 4)
- **DoD:** T-48h announce, staggered keys (10+10, 72h re-mint), a receipts changelog (bug → the build that killed it), day-1 presence on 4 surfaces against the severity SLAs, a **pre-decided** rollback ladder with its two nevers (no second wipe, no ad-hoc SQL), and a 48h retro against the targets in §4.
- **Proved by:** the funnel view read at +24h and +48h against the four targets; `hr_rejections` and `c_incident` counts at 0 for week 1.

---

## 4. THE MEASURED FUNNEL TARGETS → the gate items that move each

Baselines are the live 2026-08-31 measurement: **49 signed up → 38 confirmed → 34 characters → 16 active week 1 → 3 now.**

| Target | Baseline | Primary movers | Secondary | Proof it moved |
|---|---|---|---|---|
| **Keys >60%** | 17% (13 `refused_unknown` vs 5 redeemed — hand-retyped from DMs) | **Invite LINKS with attribution** (3.2) — removes retyping entirely | Code-normalisation parity guard (client `toUpperCase` vs `hr_beta_code_norm`); confirm-link (3.1) — a key that leads to a dead end reads as a dead key; CAPTCHA dormant (3.4) so raising key volume does not raise abuse | `beta_invites` redeemed ÷ issued in the standing funnel view; `refused_unknown` count in `hr_rejections` |
| **signup → character >90%** | 69% (−11 at the email wall, of which 9 post-delivery-fix = the confirm-then-sign-in dead end; −4 to the since-fixed silent boot bug) | **Confirm-link lands you IN + resend (3.1)** — the board prices this at **73% of the loss** | Fresh-account playthrough 👤 (4.6) and the boot-veil guard re-verify the −4 on the wiped tree; stranger play-gate (3.5) proves it for a non-builder; CAPTCHA must not add friction | `auth.users.confirmed_at` × `characters` in the funnel view; `confirmHandoffGuard` green in CI |
| **D1 → D2 >60%** | 16 active week 1 → 3 now | **SA-001 loot credit (1.1)** and **SA-021 wall (1.3)** — a player whose drops evaporate and whose mid-game is locked has nothing to come back to; **first-night rescue (2.1)** — the measured largest bounce cause (2.0% of the night, then death) | SA-002 rung truth (1.2) unlocks 5 hard-locked characters; armour overhaul (2.4); weekly filter (2.3); bounty-strip honesty (2.2); week sequencing (2.5); dungeon increments (1.5) | `game_events` D1/D2 in the funnel view; the progression-reachability guard; a prod census showing non-zero Forges/bars/planks |
| **Zero `c_incident` week 1** | n/a (beta-2 had the rpc-gate bucket loss, the silent boot failure, and a red CI nobody read) | **SA-003 CI green (0.1)** + `run-smoke --ci` parity — the mechanism that let three of those ship | Restore drill 👤 (4.3) and PITR 👤 (4.4) turn an incident into a recovery; secrets + MCP + Sentry (4.7) make one visible within minutes; wave-scale load verdict (4.5); wipe rehearsal (4.2); F3/F4 (4.1) | `hr_rejections` severity counts; a green GitHub run on the release SHA; `edge-quota-watch` observed firing |
| *(Same-day report replies)* | n/a | Day-1 presence + 4-surface monitoring (Phase 4) | Standing funnel view (3.3) so a report can be checked against data in minutes | Time-to-first-reply on the Discord report channel |

---

## 5. THE THREE BIGGEST RISKS OF REPEATING BETA-2 — and the gate that closes each

### RISK 1 — Shipping on a green signal that is not green
**How beta-2 did it:** the rpc-gate bucket loss made five verbs refuse 100% with zero telemetry; the silent boot-hydration failure showed a factory character on a real account for 36 s with the net pill reading "Online". Both shipped past a green suite.
**How it is live right now, measured:** CI has been red on `main` for **40 consecutive runs since 2026-08-29 while every release ran on the weaker local gate**; the in-page runner counts no assertions, so 9 zero-assertion tests and ~200 early-return-capable tests are indistinguishable from coverage; **13 guards are executed by no gate at all** — and three of them are cited in this audit's own coverage map as live protection for gold refusal, the signup funnel, and worker accrual; of 56 in-page section verdicts, 41 were refuted on review, most for a single recurring reason (treating deliberately-retained kill-switch coverage as dead pre-cutover coverage) — i.e. the reading of our own suite is itself unreliable.
**Gate that closes it:** Tier 0 in full — **SA-003 CI-green + `run-smoke --ci` parity guard + the `tryRun` assertion counter with a pinned floor + `tests/gate-census.mjs`** (A1 every guard is executed, A2 every `--selftest`/`--mutate` a guard ships is actually run — **46 of 56 are not**, A3 every CI step exists locally). Rule already drafted for CLAUDE.md: *a release is green only when both the local `--ci` run and the GitHub run on the release commit are green.*

### RISK 2 — Shipping an economy that shows the player one thing and pays another
**How beta-2 did it:** "a flag/payout that used to live in the save blob, forgotten on reload" — dead quest claims, daily-reward re-popup, water-all, unbuyable Auto-Eat.
**How it is live right now, measured:** the client shows drops the server does not credit — one 3-minute fight, `qty_in 16` against 26 shown, 7 shrimp returned; at scale on one real player over 20 days, **5,711 XP-credit rows against 112 loot-settle rows (51:1)**. The consequence is not cosmetic: **6 players are stalled at `{have:3, need:4}` on the one item that gates the entire mid-game, and across all 36 characters there is not a single Forge, Library, Workshop, Garden, bar, or plank.** Alongside it, `property-record.js` heals raise-only, so a residue tier that was wrong once is wrong forever; three gem purchases debit client-side with no server verb (free themes/cosmetics/bank space); bank space, Farmer's Deeds, bury-bones and dungeon entry keys are each client-authored or client-debited with no server counterpart.
**Gate that closes it:** **SA-001 loot credit + SA-002 rung truth + SA-021 ruling**, proved by `tests/attended-window-conservation.mjs` (the two writers must agree about the same window; nothing the player watched may vanish without a receipt), `tests/reload-truth.mjs` **RT-1b** (residue ahead ⇒ **server truth wins downward** — red on main today), `tests/optimistic-heal-census.mjs` **O3** (no pre-apply of a field whose reconcile only heals upward), the progression-reachability guard, and a **residue-AHEAD play-gate fixture** — because the b501 gate ran on an account where residue equalled the server and structurally could not see the bug that was live at that moment.

### RISK 3 — Shipping a door no outsider has walked, and finding out from the funnel afterwards
**How beta-2 did it:** the confirm-then-sign-in-again dead end took 11 of 49 before anyone knew; the invite codes failed 3:1 because they were hand-retyped out of DMs; the numbers were only assembled *after* the wave, by ad-hoc query.
**How it is live right now, measured:** `signUp` still passes no `emailRedirectTo`; the copy still says "then sign in"; there is no resend anywhere in the client; the invite is still a hand-typed field; there is **no standing funnel view**, so beta-3's loss would again be discovered retrospectively; **no headless guard has ever booted the game with a session** (the SDK stub returns `session:null` in every guard), so the entire signup→character handoff is untested end to end; and the one in-page test that reaches the sign-up branch **asserts the dead-end copy as "the real production shape"** — the suite is currently defending the bug.
**Gate that closes it:** **confirm-link + resend (3.1), invite links (3.2), standing funnel view (3.3), and the stranger play-gate (3.5) — in that order** — proved by `confirmHandoffGuard` (a real fragment-boot with no harness flag, exactly one `hr_create_character` then one `hr_load`, gate open, token cleared), CONFIRM-DOOR-1 (the copy negative + the resend button + `emailRedirectTo` on the wire), INVITE-NORM-1 (client/server normalisation parity), and the stranger's own row appearing in the funnel view. **Do not schedule the stranger gate before 3.1-3.3 ship** — it would only re-measure the known dead end.

---

## Appendix — refuted phase-1 findings (not carried above)

**P0/P1 findings (6 of 34 refuted):**
- **idx 19** *buyCosmetic ungated gem debit* — refuted as a per-site duplicate of idx 29 (the 3-site gem class, now SA-009); in isolation P2 (the four cosmetics are read by nothing).
- **idx 22** *auto-eat column divergence is the root of the attended gap* — **refuted**: the credited 9 kills match the auto-eat-**ON** model, and no client eat intents landed; the real cause is attended-vs-away pricing in the re-sim (SA-001), not `auto_eat_enabled=false`.
- **idx 24** *merge ratchet hides the under-credit* — refuted as a client-side sub-item of SA-001; the ratchet relocates the snap-down, it does not cause the loss.
- **idx 26** *visibility-gated settle + death-truncating re-sim* — refuted: the proposed "settle regardless of visibility" contradicts a guarded design ruling (SETTLE-5 + the offline-budget watermark) and would reopen the b497 double-debit class; the salvageable half (route the settle envelope's `active_kind` through `reconcileActivityPointer`) folds into SA-001.
- **idx 31** *dungeon entry-key client debit* and **idx 32** *dungeon scrip client-minted* — refuted as duplicates of the already-boarded dungeon-settlement program (SA-015); carried into that lane rather than opened separately. (One survivor from idx 32's review is escalated in §1: the QM lane is missing from `flipArmBlockers()`.)

**In-page section verdicts: 41 of 56 refuted.** The dominant refutation, repeated across ~20 sections: phase-1 read deliberately-retained **kill-switch / OFF-position** coverage as dead pre-cutover coverage and proposed pruning it — which would have deleted the only guard on the disarm path the ops kill switch selects (`hr:serverAccrual=off`). Second most common: proposing a rewrite whose target already exists elsewhere, or one that is mechanically impossible (e.g. moving a `window._hrOfflineBurns` assertion into a Node span sim that has no such counter). **Guard verdicts: 16 of 16 survived** — the orphan/rot findings on `tests/*.mjs` are sound and are folded into Tier 0.3.

**Coverage gaps: 12 of 12 confirmed real; 12 of 12 proposed tests rewritten** — not one of the drafted tests would have caught the incident it was written for. The corrected specs are the ones cited in §3.