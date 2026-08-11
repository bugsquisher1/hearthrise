# DISCOVERIES

_Important things agents learn about the codebase, game, or constraints. Append new entries at the top. Every entry: DATE · AGENT · DISCOVERY · AFFECTED SYSTEMS · REQUIRED ACTION. This is how the team avoids rediscovering the same knowledge._

---

### 2026-08-11 · Art Director · `legacy.css`'s mobile `.panel.active` declares ONE explicit grid track in each axis, `!important` — any panel that tries to become a real grid on a phone silently lands in implicit tracks
**Discovery:** in `@media (max-width:900px), (max-height:540px) and (max-width:1024px)`,
`legacy.css` sets `.panel.active { grid-template-columns: 1fr !important; grid-template-rows: auto !important }`.
Two consequences that look like browser bugs and cost me an hour:
1. `grid-column: 1 / -1` resolves `-1` against the **explicit** grid, i.e. line 2 — so a "span
   everything" item is laid out at the width of column 1. Measured: 607px where 842px was expected.
2. With one explicit row, everything you place lands in implicit `auto` rows, and `align-content`'s
   default `stretch` then splits the panel's height **evenly** between them. A 30px sub-tab strip
   measured **106px**.
Neither declaration errors, neither shows up in `getComputedStyle` as wrong (it faithfully reports
the implicit tracks), and both are silent.
**Affected systems:** any panel-level grid authored inside a mobile/short-viewport media query
(inventory now; combat, skills, farm next).
**Required action:** when you declare `grid-template-columns/rows` on `.panel.active` inside a mobile
media query, declare them `!important` — otherwise your track list never applies. Prefer explicit line
numbers over `-1` there, and set `align-content: start` unless you want the even split.

### 2026-08-11 · Art Director · `.main` still reserves 68px for a bottom nav that is a LEFT RAIL in landscape — 16% of a 423px screen
**Discovery:** `theme-cozy.css` `@media (max-width:540px), (max-height:540px) and (max-width:1024px)`
sets `.main, #app .main, .panel.active { padding-bottom: calc(60px + var(--safe-b) + 8px) !important }`.
b317 reclaimed that reserve on `.panel.active` and `#panel-combat.active` but **not on `.main`**, so
in the b310 landscape-rail layout (where the bottom nav is a left rail and the reserve is a phantom)
every panel was capped at 287px of a 423px viewport before it rendered anything. Fixed for landscape
only — in PORTRAIT the bottom nav is real and the reserve must stay.
**Affected systems:** every panel on a landscape phone, not just inventory.
**Required action:** other short-viewport work should assume it now has ~68px more to spend, and
should not re-add a bottom-nav-sized bottom pad in the landscape-rail block.

### 2026-08-11 · Art Director · `renderInvFancy()` destroys the inventory's own Bag/Equip/Saved navigation on every tick; it was only restored by a 1500ms poll
**Discovery:** `renderInvFancy()` does `panel.innerHTML = …` on the whole `#panel-inventory`, which
deletes `#inv-mob-tabs` (inserted by `inventory-mobile-tabs.js` as `firstChild`). The only thing
putting it back was a `setInterval(…, 1500)`. It fires on every combat/skill tick, so on a phone the
screen's primary in-screen navigation was blinking out for up to a second and a half at a time.
Same shape as the b230 finding (`market.js` re-rendering its own nav control away).
**Affected systems:** `src/inventory-mobile-tabs.js`, `renderInvFancy` in `legacy.js`.
**Required action:** fixed with a `MutationObserver` on the panel (restores within one microtask; the
poll stays as a backstop) and `window.HearthriseInvSubTabs = {install, paintIcons, subs}` is now
published so a caller — or a test — can restore it synchronously. **If you add another strip that a
wholesale re-render can eat, observe the mutation; do not poll.**

### 2026-08-11 · Art Director · The Active Effects card — the game's ONLY buff panel — has been `display:none` since the Home dashboard shipped
**Discovery:** `#active-effects-card` (food buffs + house buffs, `renderActiveEffects` in legacy.js
block 8) is appended to `#panel-profile`. `home-dashboard.js`'s b213 reset hides every legacy card in
that panel: `#panel-profile.active:has(#hd-root) > .card{display:none !important}`. Measured in-browser:
computed `display:none`, rect 0x0. So `__renderBuffsSection` has been painting buff rows into an
invisible container, and the ONLY visible statement about buffs anywhere in the game was Home's
one-liner **"Food buff active."** — no name, no magnitude, no clock. House buffs have no visible surface
at all.
**Affected systems:** `legacy.js` block 8 (`renderActiveEffects`), block 36 (`__renderBuffsSection`,
`refreshBuffTimers`), `home-dashboard.js`, `audit-overrides.css` + `legacy.css` `.buff-row` /
`.active-effects-card` rules (~30 selectors styling a hidden element).
**Required action:** b326 gave buffs a real home — Home's **Upkeep** block now renders the full ladder
(name · magnitude · preserved time · paused state), which is where the away ruling's "a paused buff
renders as paused" clause actually lands. The legacy card is still dead: someone should either delete it
and its food section outright, or **give HOUSE buffs a surface** — they are currently unreadable, and
`renderActiveEffects` still emits literal emoji for them (🍳🔨⭐🍀🌿🌾🎃🔥🧰), a 0-emoji-rule violation
that is only invisible by accident. Systems/Asset Director.

### 2026-08-08 · Systems Engineer · ES modules re-wrap `window.*` AFTER every classic script — never assert a hook by reading a marker off a live global
**Discovery:** `window.killMonster` / `window.addXp` are wrapped by at least six places (legacy's bestiary
+ level-up IIFEs, `collection-log.js`, `pets.js`, `dungeons.js`, and `companions.js`). Five are classic
scripts and run in document order; **`companions.js` is an ES module imported by `main.js`**, so it is
deferred and re-wraps AFTER *every* classic script has finished — including anything appended at the very
bottom of `index.html`. Your wrapper is still in the chain and still fires, but a `fn.__myMarker` flag you
set is no longer on the outermost function, so a test that reads the marker off the global reports a hook
you definitely installed as missing. Cost a red smoke test on the Chronicle wave.
**Affected systems:** anything wrapping a legacy global — collection-log, pets, companions, dungeons,
chronicle, and any future decorator.
**Required action:** compose (capture `orig`, call it, never replace), and if you need to *prove* the hook
exists, keep your own installation registry inside your module (`HearthriseChronicle._hooks()` is the
pattern) rather than probing the global.

### 2026-08-08 · Systems Engineer · There are TWO save allowlists and they fail in opposite directions
**Discovery:** new persistent state on `G` has to be registered in two unrelated places, and forgetting
either is silent.
1. `snapshotG()` in `src/features/smoke-test.js` — a manual field list the suite restores after every
   player-action test. **Missing → the suite writes its test data into the real player's save.**
2. `snapshot(G)` in `src/net/events.js` — the CLOUD payload allowlist. **Missing → the field survives
   locally forever and is silently destroyed the first time the player restores on another device.**
The local save itself is `JSON.stringify(G)`, so it needs no registration at all — which is exactly why
these two get forgotten: everything looks fine until a test run or a device switch.
**Affected systems:** every feature that adds a `G.*` field.
**Required action:** when you add persistent state, add it to BOTH lists in the same commit, with a
comment saying why it belongs in the cloud payload (or a deliberate note saying why it does not).

### 2026-08-09 · Systems Engineer · `isPresent()` is TRUE during offline catch-up — a presence gate alone is not a gate
**Discovery:** `processOffline()` runs inside `loadLocal()`, on a **visible** tab, with the presence
input timestamp **freshly initialised** and an activity **set**. Every clause of "the player is here"
is satisfied while the game is simulating an absence. Anything gated on presence therefore applies in
full to offline output unless it *also* checks an explicit offline-replay flag. This is not
hypothetical: b204's world-event blessings applied to every offline catch-up from the day they
shipped, and b226's flat ×1.12 presence bonus multiplied every offline `addXp` grant for the same
reason. Measured in the browser: a 3h absence paid **11,250 XP** with the b227 latch and **36,000 XP**
with the latch removed and nothing else changed.

**Second half of the same trap:** bonuses that are *baked* rather than *read* escape any live gate.
`G.skillMs` froze the gather/artisan speed stack at `startSkill()`, and the offline replay divides
elapsed time by it — so a session begun under a speed bonus carried that speed into the night no
matter what the gate said. Live-read keys (`allXP`, `combatXP`, `goldFind`, `farmYield`, `noBurn`)
gate themselves; baked ones must be re-derived.

**Affected systems:** `legacy.js` (`processOffline`, `processOfflineCombat`, `addXp`, `startSkill`,
`startArtisan`), `features/world-events.js`, and **every future system that pays differently online**.

**Required action — regression tripwire:**
1. Every new simulator of elapsed wall-clock runs inside `withOfflineReplay()`. No exceptions. This
   is the b214 double-pay class of bug wearing a different hat.
2. Gate on `HearthrisePresence.blessingsApply()`, never on `isPresent()` alone.
3. A bonus that affects a DURATION must be re-derived through `activityIntervalMs()`, not stored.
4. Guard tests: *"OFFLINE output is byte-identical with and without an active blessing"* and *"the
   replay latch shuts the blessing even on a visible, active, freshly-touched tab"* in `smoke-test.js`.

**Also found (filed, not fixed):** `#dash-active` — the legacy Home dashboard block — is
`display:none` since the b219 Home rewrite. The offline welcome-back line it hosts (b225's burn
count, b226's daily-budget readout, b227's rate note) is **invisible to players**; the only surface
they see is the transient `processOffline()` toast.

**Also found:** `getBonus('rareDrop')` has **no consumer**. `rareDrop` exists only as an
equipment/pet ITEM stat (`getEquipmentStats().rareDrop`). Do not grant it from rooms, clans, renown
or events until a drop-roll seam reads it.

---

### 2026-08-08 · Coordinator · Seeded ground-truth (from project memory + audits)
**Discovery:** The following are established facts, carried in so no agent relearns them the hard way.
- **Data double-copy trap (fixed b215):** `legacy.js` top-level `const ITEMS/MONSTERS/...` lexically shadow `window.*`, so ESM data never reached the engine. Fix: `legacy` publishes `window.__LEGACY_INLINE`; `main.js` identity-merges ESM in. Guard test asserts identity. **Do not reintroduce.**
- **Theme-leak trap (fixed b216):** ~310 `html:not([data-theme])` rules were always-true, painting retired cozy-light under hearthlight; plus unscoped cocoa/cream rules; `:root` held light tokens. Fix: rescoped to `body[data-theme="cozy-light"]`; `:root` now dark. Guard tests fail if patterns return.
- **Offline rewards paid 2–3×/login (fixed b214):** processOffline + two catch-up systems read the same unrefreshed `G.lastSeen`.
- **Stored XSS (fixed b214):** market `sellerName` → `innerHTML` (JWT theft). Sanitize all user-supplied strings before DOM insertion.
- **hearth_token minted in PvE (fixed b214):** dropped at chance 1.0 in all 6 dungeons — the IAP-only bond must never mint in PvE.
- **XP_TABLE gap (fixed b215):** level 99 needs 11,805,606; it was missing, making 99 unreachable.
**Affected systems:** engine data flow, theming, economy, offline, security.
**Required action:** All agents treat these as regression tripwires — guard tests exist; keep them green.

**Affected systems:** all.
**Required action:** none — reference material.

---

### 2026-08-08 · Coordinator · b224 ship incident — two traps, both mine
**Discovery:** (1) A worktree contained a `node_modules` JUNCTION into the main tree; `rm -rf` on the worktree dir followed it and gutted the main tree's node_modules. (2) My ship command chained gate→commit→push as separate statements in one call: the gate silently failed (no node_modules), the commit never happened, and the push still ran — production briefly served hotfix code under the OLD ?v cache keys (the exact CLAUDE.md mixed-cache trap). Caught within minutes; bump committed and pushed; kill-switch + v=224 heals all clients.
**Affected systems:** ship discipline.
**Required action (binding on Coordinator):** never `rm -rf` a worktree that may contain junctions — use `git worktree remove` and if it fails, inspect before force-deleting. Never put gate/commit/push in one compound call — run the gate, READ its output, then commit, then push, as separate verified steps. Agents: do not create junctions in worktrees; run tests via an explicit path to the main tree's node_modules instead.

### 2026-08-08 · Game Designer · THREE LIVE PRODUCTION EXPLOITS in the raid economy
**Discovery:** (1) **P1 — unlimited raid strikes:** the 1/day limit is client-side only (`raids.js:93`, `G.raids.lastStrikeDay`); the `raid_strike` RPC (`schema.sql:377`) has NO day check — a tampered save strikes unlimited times (bounded only by the 50k clamp). (2) **P2 — chest-hopping:** `claim()` pays the FULL chest to any contributor and `clan_members` join/leave is open (`schema.sql:288-293`) — join a near-dead pool, strike once, claim, leave, repeat. (3) **P3 — solo claim replay:** `st.claimed[wk]` is local-only; a save edit re-grants the chest.
**Affected systems:** raids, clan economy, gold/gem supply.
**Required action:** Systems Engineer hardening task dispatched (Wave 1b). Server-side enforcement in Supabase; client mirrors for UX only. Also note: `HearthriseWorldEvents` doubles as the shared clock utility raids depends on (`_hash`, `utcDayKey`, `utcWeekKey`) — never rename/restructure it; add new systems ALONGSIDE.

### 2026-08-08 · Coordinator · Feature code is more modular than the monolith memory implies — use the right file
**Discovery:** `legacy.js` lives at **`src/legacy.js`** (not repo root). Several requested areas have dedicated modules: `src/features/companions.js`, `src/features/clans.js`, `src/features/ui-overlap.js` (chat/notification overlap handling), `src/chat.js`, `src/net/auth.js`, `src/multi-character.js`, `src/market.js`, plus renown/raids/pets/homestead/daily-reward/collection-log under `src/features/`. Styles: `src/styles/{legacy,theme-cozy,audit-overrides}.css`.
**Affected systems:** all UI/feature work.
**Required action:** Prefer editing the dedicated feature module over `src/legacy.js` when one exists — smaller blast radius, fewer merge collisions. `src/legacy.js` is still the entangled core (render loop, tabs, toasts) — announce edits to it in `ACTIVE_WORK.md`.

### 2026-08-08 · Coordinator · `src/legacy.js` entanglement forbids reckless parallel edits
**Discovery:** Almost every backlog item ultimately touches `src/legacy.js` (render loop, `showTab`, toasts, inventory). Fanning out many agents to edit it in parallel guarantees merge conflicts and semantic breakage.
**Affected systems:** integration strategy.
**Required action:** Serialize `legacy.js` implementation across waves; parallelize only work with disjoint footprints (CSS vs engine) via worktree isolation, plus read-only design/spec work. Coordinator integrates one logical change at a time.

_(New discoveries below this line, newest first.)_

### 2026-08-11 · QA · The server tier is now RUNNABLE IN `node` — PGlite executes the real migrations
**Discovery:** all four server-authority migrations (`player-state`, `catalogue.generated`,
`apply-engine`, `market-v2`) apply **verbatim and clean** to **PGlite 0.5.4 (PostgreSQL 18, WASM)**
in-process. The only scaffolding needed is `tests/sql/pglite-fixture.sql`: `auth.users`, `auth.uid()`
(reads `request.jwt.claim.sub`, exactly as Supabase does), `public.profiles`, and a `cron.*` shim
whose `unschedule()` raises on a missing job (that raise is why `hr_cron_drop` exists, so the shim
keeps the guard live). The fixture also recreates the **pre-market-v2 world** — the v1 table plus the
two armed nightly jobs — so market-v2 §0c's escrow-ordering assertion is a real check here and not
vacuous. `hr_apply` is reachable via `set role hr_engine`; `pg_advisory_xact_lock`,
`hashtextextended`, `gen_random_uuid`, PL/pgSQL, RLS DDL and `SECURITY DEFINER` all work.

**Affected systems:** the whole server tier's testability.
**Required action (Systems Engineer):** `tests/sql/server-authority.test.sql` today can only run by
being emitted and pasted at a live database — 215 KB through an HTTP-fetch trick, against production,
inside a rolled-back transaction. It could run **on every push** through this fixture instead. Worth
doing: the S6 intent-collision defect was found only when someone actually executed a block that had
passed three reviews by being read.
**Limits, stated:** the harness runs as owner, so RLS and EXECUTE grants are NOT enforced against it
(those stay with `run-sql-tests.mjs` + the behavioural suite), and PGlite is a single backend, so
locks are exercised but never raced.

### 2026-08-11 · QA · Conservation fuzz shipped; 10/10 planted violations caught, 0 real ones found
**Discovery:** `tests/conservation-fuzz.mjs` proves the property Security asked for — after N seeded
random ops across M characters, `Σ inventory + Σ equipment + Σ listings` per item and
`Σ gold + Σ market_sales.tax` reconcile against modelled mint/burn counters. ~61,000 ops across 24
seeds, up to 4,000 ops × 12 characters: **no conservation violation in the foundation.** The escrow
path (list→cancel, list→buy, list→expire) conserves exactly, rejections move nothing, replays apply
once, and the b328 degrade ladder reaches `accrue_forfeit` moving the watermark and nothing else.
**A clean fuzz is worth nothing on its own**, so `--selftest` plants ten real conservation bugs in
the migration text and demands each is caught. All ten are. Two of the ten exist only to prove
sub-assertions are not decoration.
**Affected systems:** market v2, hr_apply, accrual, CI.
**Required action:** keep `node tests/conservation-fuzz.mjs --selftest --ops=400` green (~22s, wired
into `.github/workflows/smoke.yml`). **Adding an RPC that moves value without adding an op to the
fuzz's table is how this stops being a proof.** Anyone editing the migrations must re-check the
injection anchors — a stale anchor fails LOUD (exit 2) by design, not silently.
