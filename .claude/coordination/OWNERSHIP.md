# OWNERSHIP

_Logical ownership boundaries. Ownership prevents collisions — it does **not** mean another agent may never touch an area. If you need to modify an area you don't own, **coordinate first** (note it in `ACTIVE_WORK.md`, and raise a handoff/conflict if it's non-trivial)._

| Domain | Owner | Primary surfaces |
|---|---|---|
| Visual quality, UI, layout, theming presentation | **Art Director** | CSS (`*.css`, `art-direction.css`, `theme-*.css`), DOM structure in render functions, `src/data/glyphs.js` (visual use), typography, colour tokens |
| Asset library integrity | **Asset Director** | `assets/**`, `_archive/**`, `ASSET_MANIFEST.md`, asset references across the code, `src/data/glyphs.js` (atlas contents) |
| Player experience, balance, content design | **Game Designer** | `src/data/*` (balance values, drop tables, recipes, gear-tiers, XP), progression/reward/loop tuning, renown/daily/collection design |
| Reliability, testing | **QA Engineer** | `tests/**`, `smoke-test.js`, `.github/workflows/`, regression coverage; may touch any file to fix a clear bug (route non-trivial ones) |
| Technical integrity, architecture, economy enforcement | **Systems Engineer** | `main.js`, `legacy.js` engine, `src/**` architecture, `supabase/schema.sql`, save/state (`snapshotG`), storage seam, performance |
| Coordination, integration, sequencing | **Coordinator** | `.claude/coordination/**`, `.claude/agents/**`, merge/integration into `main` |

## Shared / contested surfaces (always coordinate)
- **`src/data/glyphs.js`** — Asset Director owns atlas contents; Art Director owns visual application. Touch together.
- **`src/data/*`** — Game Designer owns *values*; Systems Engineer owns *shape/schema*. A schema change that alters balance is a semantic conflict — flag it.
- **`legacy.js`** — huge and entangled; Systems Engineer is primary, but Art Director (render DOM) and Game Designer (data hooks) reach in. Announce edits in `ACTIVE_WORK.md` before touching.
- **CSS theming** — Art Director owns look; Systems Engineer owns the scoping architecture that prevents theme leaks. Coordinate on structural CSS.

## Rules
- Never reset, force-push, or discard another agent's branch or uncommitted work.
- Never silently resolve a meaningful (code or semantic) conflict — surface it in `CONFLICTS.md`.
- When two agents will touch the same file, the one who owns it leads; the other coordinates timing.
