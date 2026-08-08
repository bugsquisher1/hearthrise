# Team CHANGELOG

_Integrated changes, newest first. This is the team's record of what actually landed on `main` — distinct from the game's player-facing CHANGELOG. Every entry: build/commit · what · who · verification._

---

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
