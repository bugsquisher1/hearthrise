# Team CHANGELOG

_Integrated changes, newest first. This is the team's record of what actually landed on `main` — distinct from the game's player-facing CHANGELOG. Every entry: build/commit · what · who · verification._

---

### 2026-08-08 · `8ae0680` · Wave 1 Systems — readable queued toasts + draggable chat pill (#7, #8) · Systems Engineer
New `src/features/toasts.js`: body-size type, length-scaled duration (4-9s), real queue with coalescing (xN), pause-on-hover, click-dismiss, MEASURED clearance of chat pill/bug button/bottom nav. Chat pill drag-to-reposition with normalised persisted position via the storage seam. Beta card emoji removed + tokenized. Bonus fix: daily-reward toast printed raw SVG path text (pre-existing). +8 regression tests. **Verified:** 185/185 x3 runs, browser-measured non-overlap, drag persistence across reload. Local only — not pushed.

### 2026-08-08 · `6470793` · **b218 SHIPPED to production** · Coordinator
Wave 0 released on Tyler's "ship it": version bumped 217->218 (59 tags + 47 ESM specifiers), player CHANGELOG entry added, final gate 177/177 + cache-buster OK, pushed to origin/main.

### 2026-08-08 · `19595db` · Wave 0 Art — readable type scale + Hearthrise wordmark (#1, #2) · Art Director
~x1.13 proportional scale across all 3 sheets (body 14->16px, ~700 declarations, hierarchy preserved) + `--t-*` ramp raised. Header brand replaced: inline-SVG shield emblem + gilt Cinzel "HEARTHRISE" lockup (old crest was dark-brown-on-black, near-zero contrast). **Verified:** smoke 177/177 post-merge, Coordinator re-verified rendered screens + narrow-viewport brand collapse on :8125. Local only — not pushed.

### 2026-08-08 · `8878ba8` · Wave 0 Systems — inventory sub-tab persistence + companion stats (#3, #4) · Systems Engineer
Doll sub-tab (Equipment|Stats|Companion) no longer snaps back to Equipment on activity-driven re-renders (`window._tdPane` persisted, restored on rebuild). Companion sub-tab now shows the companion's own name/level/XP-bar/bonuses/proc instead of a bare slot icon. +2 regression tests. **Verified:** smoke 177/177, cache-buster OK, before/after browser repro, console clean. Local only — not pushed.

### 2026-08-08 · `4d54eb3` · Wave 0 design specs (#10, #11, #12) · Game Designer
`docs/design/{clan-overhaul,leaderboards,crafting-cooking-taxonomy}.md` — buildable blueprints for Waves 2–3. 4 semantic conflicts filed in `CONFLICTS.md`. Docs only.

### 2026-08-08 · `119a698` · Repo cleanup — archive unused art, reorganize docs · Coordinator
Moved root docs → `docs/{design,planning,reports}/`; archived unused/superseded art + icon tooling under gitignored `_archive/`; added `ASSET_MANIFEST.md`; updated `.gitignore`. No code/gameplay change. **Verified:** move-not-delete confirmed, smoke 175/175, pushed to `origin/main`.

### 2026-08-08 · `5ac5ab9` · b217 — onboarding guides prep before combat; auto-eat is a purchased trait · (audit session)
Onboarding guidance before combat; auto-eat gated behind a purchased trait. **Verified:** in HEAD, smoke green.

### 2026-08-08 · Team system bootstrap · Coordinator
Established `.claude/coordination/**`, five specialist agent definitions, and team commands. Infrastructure only — no game change.

---

_(New integrations below, newest first.)_
