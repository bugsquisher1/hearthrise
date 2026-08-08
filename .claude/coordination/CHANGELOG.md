# Team CHANGELOG

_Integrated changes, newest first. This is the team's record of what actually landed on `main` — distinct from the game's player-facing CHANGELOG. Every entry: build/commit · what · who · verification._

---

### 2026-08-08 · `119a698` · Repo cleanup — archive unused art, reorganize docs · Coordinator
Moved root docs → `docs/{design,planning,reports}/`; archived unused/superseded art + icon tooling under gitignored `_archive/`; added `ASSET_MANIFEST.md`; updated `.gitignore`. No code/gameplay change. **Verified:** move-not-delete confirmed, smoke 175/175, pushed to `origin/main`.

### 2026-08-08 · `5ac5ab9` · b217 — onboarding guides prep before combat; auto-eat is a purchased trait · (audit session)
Onboarding guidance before combat; auto-eat gated behind a purchased trait. **Verified:** in HEAD, smoke green.

### 2026-08-08 · Team system bootstrap · Coordinator
Established `.claude/coordination/**`, five specialist agent definitions, and team commands. Infrastructure only — no game change.

---

_(New integrations below, newest first.)_
