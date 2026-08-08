# CURRENT_STATE

_The team's shared snapshot of where Hearthrise is. Updated at every COORDINATE and after every integration. Keep it true._

**Last updated:** 2026-08-08 · by Coordinator (team bootstrap)

## Build & branch
- **main HEAD:** `119a698` — `chore: repo cleanup — archive unused art, reorganize docs`
- **Preceding:** `5ac5ab9` b217 (onboarding guides prep before combat; auto-eat is a purchased trait) · `93c83b2` b217 (art-direction pass)
- **Version:** v0.9.2-beta (build b217)
- **Remote:** in sync with `origin/main`. Pushing to `main` **auto-deploys** to production (https://bugsquisher1.github.io/hearthrise/).
- **Working tree:** clean.

## Build/test state
- **Smoke:** `node tests/run-smoke.mjs` → **175/175 green, 0 runtime errors** (last verified 2026-08-08 pre-push).
- **Version guard:** `bash bump-version.sh --check`.
- **CI:** `.github/workflows/smoke.yml` (headless Playwright + version-guard; verified to fail on breakage).
- Local preview: `hearthrise-qa`, port 8123 (`.claude/launch.json` also has `hearthrise-static` on 8000). Cache is sticky — force-reload and confirm the build under test.

## Backbone
Supabase is LIVE in production — chat/market/clans/raids/leaderboards are genuinely multiplayer for signed-in players. `supabase/schema.sql` applied. Economy is server-authoritative.

## Art direction (current)
"Forge & Stone" medieval, hearthlight (dark) default theme. 0 emoji rendered as art. Icons = baked atlas in `src/data/glyphs.js`. Type: Alegreya Sans + Cinzel. Containment is earned (no wall-of-cards). See `.claude/coordination/agents/art-director.md` and project memory `art-direction-system`.

## Gameplay direction (current)
Online-only social idle-RPG, OSRS-scale north star. All skills to 99 (data-driven gear tiers in `src/data/gear-tiers.js`). "Rise to the Throne" renown meta-spine + daily login + collection log are the retention pillars. No pay-to-win (Season Pass removed).

## Major technical constraints
- Content authored ONCE in `src/data/*`; `main.js` merges ESM into `window.__LEGACY_INLINE` (identity merge). Never reintroduce the data double-copy.
- Theme rules must be scoped (`:root` = dark tokens; `body[data-theme="cozy-light"]` for the retired light theme).
- `assets/` structure is frozen (icons-bundle paths wired ~360 places). Prefer add over rename.
- `snapshotG` save allowlist is a manual 24-field list — fragile.

## Known bugs / open items
- **Design (Game Designer):** Cellar +500 storage perk feeds nothing; solo raid pool one-tap chest; "harvest 25 crops" harsh for starters; `deaths` never increments; ~25 tier-3–6 drops are recipe-less vendor trash; only 2 real bosses.
- **Systems debt:** `showTab` wrapped 23×; `wrapShowTab`/`HearthriseIdentity` built but unused; 27 files use `localStorage` directly; ~3,000 lines inert cozy-light CSS deletable; gear wield/level-requirement seam unbuilt.
- No open P0/P1 as of bootstrap.

## Active initiatives
- **Team system bootstrap** (this) — establishing the five-specialist coordination system. See `TEAM.md`.

## Integration status
Nothing in the integration queue. Base is clean and green.
