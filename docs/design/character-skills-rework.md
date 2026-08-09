# Character / Skills Screen Rework — Design + Migration-Safety Spec

**Author:** Game Designer + Art Director · **Date:** 2026-08-09 · **Status:** PLAN (no game code touched)
**Brief:** `DECISIONS.md` → "Character/Skills screen rework — PLAN FIRST" (Tyler, 2026-08-09).
**Guardrail (Tyler, verbatim):** "do it smart, don't break any functionality or ruin anything that sets us back."
**Build gate:** this ships AFTER the in-flight `bonus-rebase` (b228) and `rally-v2` branches merge (collision surfaces in §7).

This document is written so a Systems agent can build **Phase 1** without rediscovering the codebase. Every claim below is grounded in the current source (file + region + function names given inline). Read §6 (migration-safety table) before touching anything — it is the point of this doc.

---

## 0. What Tyler asked for

1. **"Your Heroes" character-select moves from the Character screen to the Home screen.**
2. A **new Character screen that combines Skills + Character**, OSRS-style-but-our-own (the classic dense skills grid: skill icon + current level, total level at the bottom).
3. **Keep the Equipment tab.**
4. Each **skill tile routes the player to where to do that activity** (reuse the b227 quest-nav seam — do NOT invent new routing).
5. (Coordinator addendum, 2026-08-09) The OSRS **"Account" summary stat panel** — Combat Level, Total Level, Total XP, Quests Completed, Achievements Completed, Combat Tasks Completed, Collections Logged, Time Played — folded into the Hero/Stats sub-tab, **each mapped to a real data source** (no fakes; §5).

---

## 1. Ground truth — how these screens work TODAY

### 1.1 The Character screen (`#panel-character`)
- **Markup:** `index.html:341` — `<section class="panel" id="panel-character"></section>` (empty; filled by JS).
- **Live renderer:** `src/features/character-page.js` → `renderCharacter()` (line 298), wired by `setupCharacterPage()` (line 307). It sets `window.renderCharacter` and wraps `showTab` so `'character'` → `renderCharacter()` after 30ms.
- **Sections it paints (in order):**
  - `buildHeroCard()` (149) — avatar (via `getActiveAvatar()`→`HearthriseIdentity.getAvatarUrl()`, b221/b227 upload seam), name (`playerName()`→`HearthriseIdentity.getDisplayName()`), Founder's mark (`founderMarkHtml()`, b226), top-skill, HP, and 4 stat tiles: Combat Lv / Total Lv / Gold / Kills.
  - `buildSlotsCard()` (194) — **"Your Heroes".** ⚠️ This is a **static 3-slot paywall MOCKUP**: it shows the active char + two hard-coded "Locked · Hearth Hall premium" slots + a "Learn more" button. **It does NOT read `multi-character.js` and cannot switch characters.** It is a marketing placeholder — a fake under the Final Directive. (The *real* switcher is §1.4.)
  - `buildCombatCard()` (236) — Melee / Ranged / Magic style cards (Attack/Strength/Defense levels + equipment bonuses via `getEquipmentBonusFor()`).
  - `buildRatesCard()` (254) — best XP/hr per skill, computed through `window.actionRate` (b226, the single rate calculator — **reads `getBonus`, so `bonus-rebase` changes these numbers**).
  - `buildEquipSummaryCard()` (274) — slots filled + total STR/ATK/DEF + a **"Manage gear →" button that does `showTab('inventory')`** (the actual equipment doll lives in Inventory today — §1.5).

- **DEAD legacy twins (important):** `legacy.js:7173` defines its own `window.renderCharacter` (hero + per-skill cards + paper-doll via `applyCharExtensions()` at 9107, wrapped at 9096). Because `main.js` is a deferred ESM module that calls `setupCharacterPage()` at boot **after** `legacy.js` runs (index.html: `legacy.js?v=227` at line 833, `main.js` module later), **the ESM `renderCharacter` overwrites the legacy one.** The legacy 7173/9096/`applyCharExtensions` code path, `buildActivityCard()`, and the `.char-skill-card` patcher **never run on the Character screen.** Do not "preserve" them — they are already dead. (The 2s auto-refresh interval at `legacy.js:7288` still fires and calls the *current* `window.renderCharacter`, i.e. the ESM one — that is fine and must keep working.)

### 1.2 The Skills screen (`#panel-skills`)
- **Markup:** `index.html:377-386` — two cards: `#skills-list` (left, `.layout-2col-a`) and `#skill-detail` + `#skill-detail-title` (right, `.layout-2col-b`).
- **Live renderer:** `src/features/activities-grid.js` — `renderSkillsList()` (298, paints the left list; Gathering + Artisan categories, combat filtered out) and `renderSkillDetail(id)` (221, paints the right tile grid). `setupActivitiesGrid()` (341) sets both on `window`, and wraps `showTab` so entering `'skills'` auto-opens the first non-combat skill.
- **`renderSkillDetail(id)` composition:** `buildHead(id)` (54 — skill icon + level + XP bar + the b134 "Stop at Lv" train-goal control) → optional b220 category strip (`window.HearthriseArtisanCat`) → tiles (`tileForGather` / `tileForArtisan`). Combat skills short-circuit to `showTab('combat')` (225). Farming shows a single "Open the Farm tab" tile (269).
- **Entry seam:** `openSkillDetail(id)` (`legacy.js:3219`) = `openSkill=id; showTab('skills'); renderSkillDetail(id)`. This is the seam quest-nav and Home both call.
- **The left-list tile** (`renderSkillsList`, 320): `<button class="skill-tile" onclick="openSkillDetail('<id>')">` with medallion + name + xp bar + level. **This is the closest thing we already have to the OSRS grid** — the rework densifies and relocates it.

### 1.3 The Home screen (`#panel-profile`)
- **Renderer:** `src/features/home-dashboard.js` (IIFE) → `render()` (341) draws into `#hd-root` inside `#panel-profile`. Gated by `enabled()` (localStorage `hearthrise:home-v2`). Wraps `showTab` (671) so `'profile'` → `render()`; also a 1500ms `setInterval(maybeRender)` (677).
- **Sections:** hearth band (identity + today's ledger) → **Next up** (milestone via `HearthriseLaunchpad.getNextMilestone` + up-to-3 daily quests, each routed through `questRoute()`→`HearthriseQuestNav`) → **Your holding** (homestead) → **Right now** → **Rise to the throne** (renown) → **The realm** (world events — `HearthriseWorldEvents`, the `rally-v2` collision surface) → **Upkeep**.
- Wiring is delegated in `wire()` (640) via `[data-hd]` attributes.

### 1.4 "Your Heroes" — the REAL character switcher (`src/multi-character.js`)
- **State:** `window.HearthriseProfile` — `profile = { activeSlot, unlockedSlots, slots:[{id,name,combatLv,totalLv,createdAt,lastSeen}], entitlements, ... }`. `MAX_SLOTS=5`, `SLOT_COSTS_GEMS=[0,200,500,900,1500]`.
- **API:** `listSlots()`, `switchSlot(id)`, `unlockSlot(id)`, `canUnlockNext()`, `init()`.
- **Switch flow (`switchSlot`, 101):** `saveLocal()` → copy `hearthbound-save-v2` into `hearthrise:char:<active>` → set `activeSlot` → load target slot into `hearthbound-save-v2` → **caller does `location.reload()`** (line 295). The reload is how the engine re-boots onto the new save. **Preserve the reload** — it is not a bug; the monolith has no live save-swap.
- **Current UI:** `injectUI()` (230) builds the `#char-select-overlay` drawer and `openCharacterSelect()`; **it is wired to the TOPBAR avatar click** (`wireAvatar`, 309) — NOT to the Character page. The drawer renders real + locked/buyable slots.
- **Account gate (b224):** the whole module (`init`, migration, slot UI) waits behind `HearthriseGate.whenOpen` (225). Slots belong to an account; nothing runs signed-out.

### 1.5 The Equipment paper-doll (`buildTibiaDoll`, `_tdPane`, b218)
- **Where it lives TODAY:** injected into **`#panel-inventory`** (`renderInvFancy`, `legacy.js:9878`; doll built at 9615/9650), NOT the Character screen. The Character screen only shows the *summary* card (§1.1 `buildEquipSummaryCard`).
- **`window.buildTibiaDoll()` (`legacy.js:9367`)** returns a widget with **three internal sub-tabs** (`_tdPane`, 9501-9527): **Equipment** (`gear` — the doll), **Stats** (`stats` — `window.renderEquipmentStatsHTML()`), **Companion** (`pet` — the b218 companion pane at 9383+, reading `G.companions.equipped`/`window.COMPANIONS`, with companion level/XP). `window._tdPane` persists the chosen internal pane across auto-refresh (the b218 snap-back fix — the exact pattern the rework must copy).

### 1.6 Nav + `showTab` + all the aliases
- **Nav entries:** `index.html:171` `<button class="nav-btn" data-tab="character">`, `:190` `data-tab="skills"`; bottom-nav `bn-btn` `character` (543) and `skills` (545).
- **`showTab(tab)` (`legacy.js:2761`):** the base function. Resolves aliases (`castle/clanseat/…→clan`; `shops/shop/market/…→shop|market`), then activates `#panel-<tab>`, sets `activeTab`, and calls the per-tab renderer. It is wrapped **many** times (chained `orig`/`_prevST` closures at 5137, 5490, 6351, 6721, 6864, 7279, 7646, 7940, 8536, 10098, 10282 in legacy.js, plus character-page.js, activities-grid.js, home-dashboard.js, nav-consolidation.js, ftue.js). **Any rework must add behavior by wrapping, never by editing the base signature.**
- **Every route that currently resolves to these two tabs (must keep resolving):**
  - `showTab('character')` — nav button, bottom-nav, character-page hook.
  - `showTab('skills')` — nav button, bottom-nav, `openSkillDetail` (3219), Home "cook" (`home-dashboard.js:657` `nav('skills')`), quest-nav `SKILL()` (`quest-nav.js:85` `dest('skills', …)`), the legacy skill-tile onclick (`legacy.js:3029/3214`).
  - `openSkillDetail(id)` — quest-nav `goToQuest` (`quest-nav.js:260`), Home, legacy skill cards.
  - **quest-nav `questDestination`/`go`** (`src/features/quest-nav.js`) — the b227 routing seam. `SKILL(id)` returns `{tab:'skills', skillId:id, detail:<lane>}`; `goToQuest` writes `window._artisanCat[skillId]=detail` then `showTab('skills')` then `openSkillDetail(id)`. **This is the seam the skill tiles reuse — do not rebuild it.**
  - **FTUE** (`src/ftue.js`): step `id:'skills'` targets `button[data-tab="skills"]` (line 70); step `combat` targets `button[data-tab="combat"]`; step `inventory` `button[data-tab="inventory"]`. The selector must still resolve to a real element.

---

## 2. The new combined Character screen

### 2.1 Sub-tab structure — **Skills · Equipment · Hero** (recommended)

**Decision: three top-level sub-tabs, in this order, defaulting to Skills.**

| Sub-tab | Contains | Why here |
|---|---|---|
| **Skills** (default) | Identity strip (avatar, name, CL, Total Lv) + the OSRS-our-own **skills grid** + total-level footer; selecting a tile opens that skill's activity detail (the existing `renderSkillDetail` tile grid) or routes to Combat/Farm | This is the merge Tyler asked for and the screen's primary job. It is what the game is *about* (train skills), so it is the front door. |
| **Equipment** | `window.buildTibiaDoll()` — the paper-doll (its internal Equipment/Stats/Companion b218 panes intact) | Directive #3 "keep the Equipment tab." Reuses the existing doll seam verbatim; companion pane comes for free. |
| **Hero** | Identity header + the **Account stat grid** (§5) + Melee/Ranged/Magic combat breakdown (`buildCombatCard`) + best-rates (`buildRatesCard`) | The "who am I / how am I doing" screen. Absorbs today's character-page identity + combat + rates content and the OSRS Account summary. |

**Why this split (reasoning, since the brief asks me to reason it):**
- **Skills leads, not Hero.** OSRS opens the Skills tab on the character interface for a reason — in an idle-RPG the skills grid is the dashboard of progression. Making Hero the default would bury the thing Tyler explicitly wants featured.
- **Equipment stays a first-class tab, not a modal.** Directive #3 is explicit, and the doll already exists as a self-contained widget (`buildTibiaDoll`) — promoting it costs almost nothing and removes the current oddity that "gear" lives under *Inventory* while the Character screen only shows a summary with a "Manage gear →" jump.
- **Three, not four or five.** Combat-style cards and best-rates are *identity/analytics*, not their own destinations; they belong under Hero. Renown stays where it is (Home "Rise to the throne" + its ladder modal) — it is a meta-spine, not a character-sheet field, and duplicating it here would fork state.
- **Companion is NOT a top-level sub-tab.** It is already the third internal pane of `buildTibiaDoll` (b218). Keep it there (under Equipment) rather than adding a fourth top-level tab, so we do not double-nest or fork the companion widget.

**Known redundancy to resolve in Phase 2 (flag, don't fix in Phase 1):** the doll's *internal* "Stats" pane (`renderEquipmentStatsHTML`) overlaps the Hero sub-tab's equipment-bonus content. Phase 1 keeps both (zero behavior change). Phase 2 may collapse the doll's internal Stats pane and let Hero own all stats, leaving the doll with Equipment + Companion.

### 2.2 Sub-tab mechanics — copy the `_tdPane` / `_shopsPane` pattern exactly
- Persist the active sub-tab in a **session `window._charPane`** field (`'skills' | 'equip' | 'hero'`, default `'skills'`), identical to `_tdPane` (`legacy.js:9501`) and `_shopsPane` (`nav-consolidation.js:50`). **This is mandatory** — the Character panel auto-refreshes (the 2s interval at `legacy.js:7288` + any tick repaint). Without a persisted pane, the b218 snap-back bug reappears (Stats/Companion snapping back to Equipment within seconds). The whole point of `_tdPane` was to fix exactly this; do not relearn it.
- `renderCharacter()` reads `window._charPane` on every build and restores it; the sub-tab strip's click handler writes `window._charPane` then shows the pane (same shape as `applyPane` at `legacy.js:9508`).

### 2.3 The OSRS-our-own skills grid (the Skills sub-tab)
- **The grid is the merge of today's `renderSkillsList` tiles + an identity header on top.** Each tile = **skill icon + current level + a thin XP-to-next micro-bar** (we already compute `xpPct`/`xpToNext` in `buildHead`; the left-list tile at `activities-grid.js:320` already renders icon+name+bar+level — densify it into the OSRS square-tile look). **Total level** sits in the footer (source: `getTotalLevel()`).
- **Each tile is a door (directive #4) — reuse the EXISTING seam, invent nothing:**
  - Gathering / artisan skill tile → `openSkillDetail(id)` → opens the skill's activity detail (the `renderSkillDetail` tile grid). In the combined screen the detail renders **into the Skills sub-tab's detail region** (the relocated `#skill-detail`), not a separate panel.
  - Farming tile → route to Farm (`quest-nav.js` `SKILL('farming')`→`FARM()`→`showTab('farming')`).
  - Combat skills (attack/strength/…/bountyHunter) → `showTab('combat')` (already how `renderSkillDetail` handles `cat==='combat'`, line 225).
  - The routing authority is **`window.HearthriseQuestNav`** — but for a *direct tile click* the simplest honest call is the same `openSkillDetail(id)` the grid already uses (which itself does the combat/farm short-circuit). Do not add a parallel router.
- **Two states, one sub-tab:** GRID (all skills) ⇄ DETAIL (one skill's activities). Provide a back affordance (a "‹ All skills" link, or keep the b220 header) to return to the grid. Phase 1 may keep the existing **two-pane** layout (grid list left, detail right) relocated under the Skills sub-tab — that is the lowest-risk path and preserves `renderSkillsList` + `renderSkillDetail` unchanged. Phase 2 upgrades to a true grid-first → detail-drilldown flow with OSRS tile art.
- **The b220 category lanes and b227 quest "Go"** live exactly where they do now — inside `renderSkillDetail` (the category strip via `HearthriseArtisanCat`, and quest arrivals via `goToQuest`→`openSkillDetail`). They move with the detail region into the Skills sub-tab; **no code change to the lane strip or quest-nav is required** — they render into `#skill-detail` wherever it is mounted.

### 2.4 Where the render seams mount
- **Reuse `#panel-character`** as the host. Give it three regions: a sub-tab strip + `#char-skills` (Skills), `#char-equip` (Equipment), `#char-hero` (Hero).
- **Relocate the skills seams by ID, do not duplicate them.** `renderSkillsList()` writes to `#skills-list`; `renderSkillDetail()` writes to `#skill-detail` + `#skill-detail-title`. **Keep those exact IDs** and mount them inside `#char-skills` (move the markup from `#panel-skills` or render into re-created same-ID nodes). Because activities-grid.js targets elements *by id*, moving the ids is transparent to it. `#panel-skills` becomes a thin alias host (§3).

---

## 3. Nav folding — Skills folds into Character, without breaking a single route

**Do NOT delete the `skills` route. Re-point it.** Recommended approach:

1. **Nav rail / bottom-nav:** remove the standalone **"Skills"** `nav-btn`/`bn-btn` (index.html:190, 545) *only after* step 2 guarantees the alias still works. The **"Character"** entry becomes the single door.
2. **`showTab('skills')` becomes an alias** that: opens the Character screen (`character`), selects the **Skills** sub-tab (`window._charPane='skills'`), and (if a `skillId` was in flight) opens its detail. Implement by **wrapping** `showTab` (never editing the base) — the same wrapper pattern used everywhere. Concretely: in the wrapper, if `tab==='skills'`, force `_charPane='skills'` and route to `'character'` (then let `openSkillDetail` run as today). `openSkillDetail(id)` (legacy 3219) currently does `showTab('skills')` — with the alias, that now lands on Character/Skills and still calls `renderSkillDetail(id)`. **Every quest-nav route, Home "cook", and legacy skill-tile onclick keeps working unchanged** because they all funnel through `showTab('skills')` + `openSkillDetail`.
3. **`#panel-skills` markup:** keep it OR fold its two cards into `#char-skills`. If kept as a hidden compatibility host, ensure the active-panel machinery still points the user at `#panel-character`. Cleanest: move the `#skills-list` + `#skill-detail` markup into `#panel-character`'s Skills region and leave `#panel-skills` as an empty deprecated stub (so no stale renderer errors). **Whichever you choose, `#skills-list`, `#skill-detail`, `#skill-detail-title` must exist in the DOM** or activities-grid.js's `getElementById` calls no-op and the grid goes blank.
4. **FTUE:** the step `target: 'button[data-tab="skills"]'` (`ftue.js:70`) must still resolve. Two options: (a) update the step to `button[data-tab="character"]` and reword to "Train skills on the Character screen," or (b) keep a `data-tab="skills"` element in the nav that is an alias button. **Recommendation: (a)** — update the FTUE step (it is one string) rather than keep a ghost nav button. (Note: `ftue.js` also has the P1 listener-leak bug already filed by the Designer — coordinate so the FTUE edit rides the same fix, not a second uncoordinated pass.)
5. **`activeTab` semantics:** `showTab` sets `activeTab='character'` for the combined screen. Any code branching on `activeTab==='skills'` (e.g. `legacy.js:2401` `renderSkillDetail` during skill progress; 2823 `refreshAll`; 8151) must be checked — with the alias, `activeTab` will be `'character'` while the Skills sub-tab is showing, so those `activeTab==='skills'` guards would stop refreshing the live progress bar. **Fix: broaden those guards to `(activeTab==='skills' || (activeTab==='character' && window._charPane==='skills'))`** (or publish a small helper `isSkillsVisible()`). This is the subtlest breakage in the whole rework — see §8 risk #1.

---

## 4. "Your Heroes" on Home

### 4.1 Shape
- Add a **"Your Heroes"** section to `home-dashboard.js` `render()`, styled with the existing `hd-*` token language (no new box types — reuse `.hd-h` heading + `.hd-rows` + a slot row). Suggested placement: high in the **right column** ("how you're doing" rail) or directly under the hearth band, since character identity is a top-of-screen concern. It **replaces nothing essential** — it is additive; the fake `buildSlotsCard` paywall (§1.1) is *deleted from character-page.js*, so the only "Your Heroes" surface becomes this real one + the topbar-avatar drawer.
- **Content per slot** (read from `HearthriseProfile.listSlots()`): portrait/initial, name, `Cmb Lv` / `Tot Lv`, `active` pill or `last seen` (`timeSince`), and locked/buyable rows up to `MAX_SLOTS` (reuse `canUnlockNext()` for the buy affordance). This is exactly what `multi-character.js` `render()` (248) already builds for the drawer — **extract that markup into a shared render helper** so Home and the drawer cannot drift.

### 4.2 Behavior — reuse `multi-character.js` verbatim
- **Switch:** clicking a non-active slot → `confirm(...)` → `HearthriseProfile.switchSlot(id)` → **`location.reload()`** (preserve the reload; §1.4). Do not attempt a live in-memory swap in Phase 1 — the engine boots from `hearthbound-save-v2` and has no hot-swap seam; a live swap is a separate, risky project.
- **Buy slot:** `HearthriseProfile.unlockSlot(id)` (gems), then re-render.
- **Account gate:** `multi-character.js` is gated behind `HearthriseGate.whenOpen` and `HearthriseProfile.profile` is null until then. **Home's Heroes section must render nothing (or a quiet "sign in to manage characters" line) until `HearthriseProfile.profile` exists** — read defensively, exactly like home-dashboard already guards `HearthriseRenown`/`HearthriseWorldEvents` with `try/catch` and existence checks.
- **Keep the topbar-avatar drawer** (`openCharacterSelect`) — it is a fine secondary entry and other code may call it. Home becomes the primary, always-visible surface; the drawer stays as the quick-switch. Both call the same `switchSlot`, so they cannot diverge.

### 4.3 What it joins/replaces in Home's composition
- **Joins:** the existing right-rail sections (Right now / Rise to the throne / The realm / Upkeep). It is one more `.hd-rows` block.
- **Replaces:** nothing on Home. On **Character**, it replaces the deleted `buildSlotsCard` fake.

---

## 5. The Account stat grid (Hero sub-tab) — every stat mapped to a REAL source

A clean OSRS-our-own stat grid at the top of the **Hero** sub-tab. **No fabricated numbers (Final Directive).** Each cell:

| Stat | Real data source | Status |
|---|---|---|
| **Combat Level** | `getCombatLevel()` | ✅ exists |
| **Total Level** | `getTotalLevel()` (also shown on the Skills grid footer) | ✅ exists |
| **Total XP** | `Object.values(G.skills).reduce((a,b)=>a+(b||0),0)` | ✅ derivable, no new state |
| **Quests Completed** | `(G.quests||[]).filter(q=>q.done).length` — the persistent quest array (`legacy.js:2095/2210`) | ⚠️ real, with a caveat: this is the *current fixed quest list's* done-count, not a lifetime cumulative that includes daily tasks (`G.daily.tasks` reset each day and are not counted). **Also:** `legacy.js:9549` reads `G.quests.list` — a **stale/incorrect access** (the canonical shape is an array); use `G.quests` directly and flag that legacy line for Systems. If Tyler wants a true lifetime figure incl. dailies, that needs a new counter (`G.stats.questsCompleted++` on completion) — flag, don't fake. |
| **Achievements Completed** | Count of `ACHIEVEMENTS` (`legacy.js:7698`) where `G.achievements[a.id]?.unlocked` | ✅ exists — real achievements system with `unlocked` flags. This is the honest 1:1 mapping (not Chronicle/renown). Display `X / ACHIEVEMENTS.length`. |
| **Combat Tasks Completed** | `G.bountyHunter.completed` (`legacy.js:646` initializer `completed:0`) | ✅ confirmed — Bounty Hunter contracts are the natural "combat tasks." Label it "Bounties Completed" (our-own naming). |
| **Collections Logged** | `HearthriseCollection.getStats(G)` → `monFound + itemFound` over totals (`collection-log.js:35-47`) | ✅ exists. Display `logged / total` and/or `overall%`. |
| **Time Played** | **No counter exists.** Only timestamps: `G.createdAt` and `G.lastSeen` (`legacy.js:648-652`). | ❌ **NEEDS NEW WORK.** Spec: add `G.stats.playMs` — a tick-driven accumulator incremented in the main game loop while the tab is present (reuse the b226 presence definition already used for blessings, so idle-in-background time is not counted; anchor to the existing loop, do not add a new interval). Initialize on the save-migration bump; backfill nothing (honest zero for existing saves, or seed from `createdAt` only if Tyler prefers — flag the choice). Render it OSRS-style behind a **"Click to reveal"** so it is opt-in. **Do not display Time Played until this counter is built** — an unbuilt cell must be omitted, never faked. |

**Stat-grid layout:** 4-across on desktop, 2-across on mobile, each cell = big number + small-caps label (matches the `hd-led` / `cr-hero-stat` treatment already in the codebase). Total XP and Time Played get the "click to reveal" affordance OSRS uses for its precise figures.

---

## 6. Migration-safety audit — the point of this doc

Every piece of functionality on the two current screens (and their adjacent surfaces), with its disposition. **Nothing on this list may silently vanish.**

### 6.1 Character screen (`character-page.js`)
| # | Item | Disposition |
|---|---|---|
| 1 | Hero card: avatar (b221/b227 upload via `HearthriseIdentity`) | **Moved** → Hero sub-tab identity header (+ Skills sub-tab strip). Avatar upload seam untouched. |
| 2 | Name + Founder's mark (b226) | **Moved** → Hero header. |
| 3 | Top-skill / HP / CL / TL / Gold / Kills tiles | **Merged** → into the Account stat grid (§5) where a real source exists; HP stays on Hero header. |
| 4 | `buildSlotsCard()` "Your Heroes" static paywall mockup | **Deliberately CUT** (reason: it is a fake — static, non-functional, violates Final Directive). Its *intent* is **moved** to Home as the real selector (§4). |
| 5 | Combat style cards (Melee/Ranged/Magic) `buildCombatCard` | **Moved** → Hero sub-tab. |
| 6 | Best-rates card `buildRatesCard` (via `actionRate`) | **Moved** → Hero sub-tab. (Numbers shift under `bonus-rebase`; structure unchanged.) |
| 7 | Equipment **summary** card + "Manage gear →" (`showTab('inventory')`) | **Merged/upgraded** → replaced by the real **Equipment sub-tab** (the doll). Keep a "Full inventory →" link to `inventory` for the bag. |
| 8 | `setupCharacterPage` showTab hook (`'character'`→render) | **Preserved** (extended to restore `_charPane`). |
| 9 | 2s auto-refresh (`legacy.js:7288`) | **Preserved** — must respect `_charPane` (see risk #2). |
| 10 | Legacy `renderCharacter`/`applyCharExtensions`/`buildActivityCard`/`.char-skill-card` patch (7173/9096/9107) | **Already dead** (overwritten by ESM at boot). Safe to leave; optionally remove in a later cleanup. Not part of Phase 1. |

### 6.2 Skills screen (`activities-grid.js` + legacy)
| # | Item | Disposition |
|---|---|---|
| 11 | `renderSkillsList()` (left grid list) | **Moved** → Skills sub-tab grid (densified to OSRS tiles in Phase 2). Same `#skills-list` id. |
| 12 | `renderSkillDetail(id)` tile grid (`buildHead` + tiles) | **Moved** → Skills sub-tab detail region. Same `#skill-detail`/`#skill-detail-title` ids. |
| 13 | b134 train-goal "Stop at Lv" control (`buildHead`) | **Preserved** (part of `buildHead`, moves with the detail). |
| 14 | b220 artisan category lanes (`HearthriseArtisanCat` strip) | **Preserved** — renders into `#skill-detail` wherever mounted. |
| 15 | b227 quest routing (`questDestination`/`goToQuest`/`_artisanCat`) | **Preserved verbatim** — the tiles reuse it; no change to quest-nav.js. |
| 16 | `openSkillDetail(id)` seam (`legacy.js:3219`) | **Preserved** — now lands on Character/Skills via the `skills` alias. |
| 17 | `setupActivitiesGrid` showTab hook (auto-open first skill on `'skills'`) | **Preserved** — fires via the `skills` alias. |
| 18 | Combat-skill short-circuit → `showTab('combat')` (line 225) | **Preserved.** |
| 19 | Farming tile → Farm tab | **Preserved.** |
| 20 | Live progress refresh guards `activeTab==='skills'` (2401/2823/8151) | **Merged/modified** — broaden to include Character+Skills-sub-tab (risk #1). |

### 6.3 Equipment doll (b218, `legacy.js`)
| # | Item | Disposition |
|---|---|---|
| 21 | `buildTibiaDoll()` paper-doll | **Moved/promoted** → Equipment sub-tab of Character (also still available in Inventory in Phase 1 — do not remove the Inventory copy until verified). |
| 22 | `_tdPane` internal Equipment/Stats/Companion tabs + persistence | **Preserved verbatim** (the widget is reused whole). |
| 23 | Companion pane (b218) — level/XP/stats, `G.companions` | **Preserved** (inside the doll's Companion pane). |
| 24 | `renderEquipmentStatsHTML()` (doll Stats pane) | **Preserved** Phase 1; **flagged** for Phase 2 de-dup vs Hero stats. |

### 6.4 "Your Heroes" / multi-character (`multi-character.js`)
| # | Item | Disposition |
|---|---|---|
| 25 | `HearthriseProfile` state + API (`listSlots/switchSlot/unlockSlot/canUnlockNext`) | **Preserved verbatim** — Home reuses it. |
| 26 | `switchSlot` → `location.reload()` flow | **Preserved** (documented as intentional). |
| 27 | Topbar-avatar drawer (`openCharacterSelect`, `wireAvatar`) | **Preserved** as secondary entry. |
| 28 | Account gate (`HearthriseGate.whenOpen`) | **Preserved** — Home reads defensively, renders nothing signed-out. |
| 29 | Slot markup builder (drawer `render()` at 248) | **Refactored** into a shared helper so Home + drawer share one renderer. |

### 6.5 Home (`home-dashboard.js`)
| # | Item | Disposition |
|---|---|---|
| 30 | b226 skill-milestone / "Next up" cards (`getNextMilestone`, quests) | **Preserved** — untouched; Heroes section is additive. |
| 31 | Hearth band, Your holding, Right now, Renown, The realm, Upkeep | **Preserved** — Heroes is one new `.hd-rows` block. |
| 32 | "The realm" world-events section | **Preserved** — but it is the `rally-v2` collision surface (§7); merge after. |

### 6.6 Nav / routing / FTUE
| # | Item | Disposition |
|---|---|---|
| 33 | `showTab('character')` (nav, bottom-nav, hooks) | **Preserved.** |
| 34 | `showTab('skills')` (nav button + all deep links) | **Merged** → alias resolving to Character/Skills sub-tab. Route preserved, nav button removed. |
| 35 | Standalone "Skills" nav-btn/bn-btn (index.html:190/545) | **Deliberately CUT** (folded into Character) — only after the alias (#34) is proven. |
| 36 | FTUE step `button[data-tab="skills"]` (ftue.js:70) | **Modified** → retarget to `character` + reword (coordinate with the filed FTUE listener-leak fix). |
| 37 | `#panel-skills` markup (index.html:377) | **Merged** into `#panel-character` (or kept as empty deprecated stub); ids `#skills-list`/`#skill-detail`/`#skill-detail-title` **must remain in the DOM**. |
| 38 | `activeTab==='skills'` branches (2401/2823/8151/refreshAll) | **Modified** (risk #1). |

**Headline:** 38 items audited — **~26 preserved** (verbatim or relocated with no behavior change), **~9 moved/merged** (relocated with adjusted mounting/guards), **~3 deliberately cut** (#4 fake paywall slots; #35 standalone Skills nav button; and #10 already-dead legacy renderCharacter path noted for later cleanup). Plus **8 new stat-grid rows** (§5): 7 mapped to real sources, **1 (Time Played) flagged as new counter work** — omitted until built, never faked.

---

## 7. Sequencing + collision surfaces (build AFTER bonus-rebase + rally-v2)

**Order it after both in-flight branches merge.** Collision surfaces:

- **`home-dashboard.js` — the real collision.** `rally-v2` edits the **"The realm"** section (world-events/rally) in this same file. This rework **adds a "Your Heroes" section** to the same `render()`. → **Land the Heroes section as a new self-contained function** appended after `rally-v2` merges, so the two edits touch different regions of `render()` and merge cleanly. Do not start Heroes-on-Home until rally-v2's home-dashboard edits are in `main`.
- **`character-page.js buildRatesCard` / Hero rates + stat grid** — read `actionRate`/`getBonus`, whose **magnitudes** `bonus-rebase` (b228) changes. **Structural, no collision; numeric, yes** — the rates/derived cells will display rebased numbers automatically (they go through the same calculator). Nothing to merge, but QA must re-verify displayed rates after b228.
- **No branch touches `character-page.js`, `activities-grid.js`, `multi-character.js`, or `quest-nav.js` structurally** → those are low-collision. The bulk of the rework lives there.
- **`legacy.js showTab` guards** (#20/#38) — both branches may add `showTab` wrappers; ours must chain, not replace. Add the alias in a fresh wrapper after their wrappers exist.

### 7.1 Phase 1 — the combined screen + Heroes-on-Home (behind existing seams)
- Build the 3 sub-tabs in `#panel-character` (`_charPane` persistence).
- **Relocate** `#skills-list` / `#skill-detail` into the Skills sub-tab (reuse renderers by id).
- Add the **`skills` → Character/Skills alias** (wrapper) + broaden the `activeTab==='skills'` guards.
- Promote `buildTibiaDoll()` into the Equipment sub-tab.
- Build the **Hero** sub-tab: identity + Account stat grid (§5, minus Time Played) + combat cards + rates.
- Delete `buildSlotsCard` fake; add real **Your Heroes** to Home (shared slot-render helper; account-gated).
- Remove the standalone Skills nav button; retarget the FTUE step.
- Keep the Inventory doll copy and `#panel-skills` stub until verified, then clean up.
- **No visual/OSRS-art polish yet** — reuse existing tile styles.

### 7.2 Phase 2 — visual polish / OSRS-grid art
- True OSRS-our-own square skill-tile grid (icon + level + micro-bar), total-level footer, grid→detail drilldown.
- De-dup the doll's internal Stats pane vs Hero stats (#24).
- Build the **Time Played** counter (`G.stats.playMs`) + "click to reveal" reveal for Total XP / Time Played.
- Remove the now-redundant Inventory doll injection (if the Equipment sub-tab fully covers it) and the `#panel-skills` stub.

### 7.3 Tests that must exist (smoke-test.js) — before AND after
**Baseline (capture before, must still pass after):**
- `showTab('character')` activates `#panel-character` and paints.
- `showTab('skills')` + `openSkillDetail('mining')` opens the mining tile grid.
- `openSkillDetail('cooking')` shows the b220 lane strip; `goToQuest` for a cooking goal (`quest-nav`) lands on cooking with the right `_artisanCat` lane.
- `HearthriseProfile.listSlots()` returns slots; the topbar-avatar drawer opens.
- FTUE step target selector resolves to a real element.

**New (after):**
- Character sub-tab switch persists across a simulated auto-refresh (set `_charPane='hero'`, call `renderCharacter()`, assert Hero still shown) — the b218 snap-back regression, re-guarded.
- `showTab('skills')` alias lands on `#panel-character` with `_charPane==='skills'` and the grid rendered.
- Live skill-progress bar updates while the Skills sub-tab is visible under `activeTab==='character'` (the #1 risk guard).
- `openSkillDetail('smithing')` renders inside the Character screen (detail region present).
- Equipment sub-tab contains the doll with working Equipment/Stats/Companion internal tabs; companion pane reads `G.companions`.
- Home renders a real "Your Heroes" block from `HearthriseProfile`; clicking a slot invokes `switchSlot` (mock `location.reload`); renders nothing when `HearthriseProfile.profile` is null (signed-out).
- The fake `cr-slots` paywall is gone from the Character DOM.
- Account stat grid: each of the 7 built stats reads its mapped source and matches (`getCombatLevel`, `getTotalLevel`, ΣG.skills, quests-done, achievements-unlocked, `bountyHunter.completed`, collection getStats). Time Played cell is **absent** until its counter exists.

---

## 8. Blunt list — how this could set us back, and how the plan avoids each

1. **The `skills` → `character` alias silently stops the live progress bar.** Multiple hot paths gate on `activeTab==='skills'` (`legacy.js:2401/2823/8151`). Once Skills is a sub-tab, `activeTab` is `'character'`, so those guards go false and the training XP bar / tile progress stop refreshing — a subtle "the game feels frozen" regression that no compile error catches. **Mitigation:** broaden every such guard to a single helper `isSkillsVisible()` (`activeTab==='skills' || (activeTab==='character' && _charPane==='skills')`), and add the live-progress smoke test above. This is the highest-risk item; enumerate all `activeTab==='skills'` sites before editing.
2. **Sub-tab snap-back (the b218 bug, reborn).** The Character panel auto-refreshes every 2s; a naive sub-tab that isn't persisted in a `window._*` field will snap back to Skills within seconds — exactly the bug `_tdPane` was created to fix. **Mitigation:** copy the `_tdPane`/`_shopsPane` session-field pattern precisely (`window._charPane`), restore-on-build.
3. **`showTab` wrapper-chain ordering + deep-link routes.** `showTab` is wrapped ~12× in legacy.js plus 4 feature files; the `skills` alias must **chain** after the others (especially activities-grid's auto-open hook and any rally-v2/bonus-rebase wrappers) or it either double-fires or pre-empts `openSkillDetail`. Deep links from quest-nav, Home "cook", FTUE, and legacy skill tiles all funnel through `showTab('skills')`/`openSkillDetail`. **Mitigation:** add the alias in one fresh wrapper installed last; keep `#skills-list`/`#skill-detail`/`#skill-detail-title` in the DOM; regression-test every deep link; sequence the build *after* the other branches so their wrappers already exist.

**Additional lower-severity traps:** (a) `G.quests.list` stale read at `legacy.js:9549` — fix to `G.quests` when wiring Quests Completed; (b) the FTUE listener-leak P1 is already filed — do the FTUE retarget in that same fix, not a second pass; (c) don't remove the Inventory doll copy or `#panel-skills` until the promoted copies are verified (Phase 2), so a mistake is never load-bearing mid-migration; (d) Time Played must stay omitted until its counter ships — a placeholder "0h" would itself be the fake the Directive forbids.

---

## 9. One-screen handoff to Systems (Phase 1 build order)
1. Add `#panel-character` sub-tab shell + `window._charPane` (copy `_tdPane`).
2. Relocate `#skills-list`/`#skill-detail`/`#skill-detail-title` into the Skills sub-tab; verify `renderSkillsList`/`renderSkillDetail` still paint by id.
3. Install the `skills`→Character/Skills alias wrapper; broaden `activeTab==='skills'` guards via `isSkillsVisible()`.
4. Mount `buildTibiaDoll()` in the Equipment sub-tab.
5. Build the Hero sub-tab: identity + Account stat grid (§5, 7 built stats) + `buildCombatCard` + `buildRatesCard`.
6. Delete `buildSlotsCard`; add real Your Heroes to Home (shared slot helper from `multi-character.js` drawer; account-gated; `switchSlot`+reload preserved).
7. Remove standalone Skills nav button; retarget FTUE step.
8. Add the smoke tests in §7.3. Verify in-browser: train a skill and watch the bar move on the Skills sub-tab; switch sub-tabs and wait 3s (no snap-back); switch characters from Home.
