# Hearthrise Development Team

Five specialist agents + a Coordinator, operating as **one** development organization to make Hearthrise actually better — not merely different, larger, or more polished.

## The five specialists (`.claude/agents/`)
| Agent | Owns | Model |
|---|---|---|
| **Art Director** | Visual quality — hierarchy, type, colour, iconography, feedback, layout | opus |
| **Asset Director** | Asset library integrity — organization, style-fit, runtime references | sonnet |
| **Game Designer** | Player experience — progression, rewards, pacing, game feel, retention | opus |
| **QA Engineer** | Reliability — exploratory + regression testing, verifying others' work | opus |
| **Systems Engineer** | Technical integrity — architecture, data/economy/save, performance | opus |

Every agent works to `.claude/coordination/PROFESSIONAL_STANDARD.md`: think like an owner, verify everything, self-critique, protect the player, leave it better, and produce a **Change Contract** before declaring READY.

## How it runs (this environment)
This is realized as **Coordinator-dispatched subagents** (see `DECISIONS.md` 2026-08-08). One session acts as Coordinator: it reads the coordination files, dispatches a specialist via the Agent tool with the matching `agentType` (e.g. `art-director`), gives it its task, and integrates the result. When a specialist must **write files in parallel** with another, dispatch it with `isolation: "worktree"` so concurrent writes don't collide. Specialists that only analyze/propose can run in the shared tree.

> The spec's named worktrees (`hearthrise-art`, `hearthrise-assets`, …) map onto per-dispatch worktree isolation here. If you later want true multi-terminal parallelism, each specialist's `.claude/agents/*.md` brief + this coordination system also work as-is for a separate Claude Code session opened per worktree.

## Shared institutional memory (`.claude/coordination/`)
- **CURRENT_STATE.md** — the live snapshot (build, tests, direction, constraints, known bugs).
- **ACTIVE_WORK.md** — who's doing what, which files are claimed.
- **OWNERSHIP.md** — domain boundaries + shared/contested surfaces.
- **DISCOVERIES.md** — hard-won knowledge, so nobody relearns it.
- **DECISIONS.md** — binding team decisions + rationale.
- **CONFLICTS.md** — open conflicts (code AND semantic).
- **HANDOFFS.md** — agent-to-agent teaching.
- **INTEGRATION_QUEUE.md** — what's READY, in dependency order.
- **CHANGELOG.md** — what actually landed on main.
- **agents/*.md** — each specialist's running log.

## Commands (`.claude/commands/`)
`/coordinate` · `/status` · `/handoff` · `/commit-ready` · `/integrate` · `/verify`

## The two loops
**Specialist:** OBSERVE → UNDERSTAND → DISCOVER → DOCUMENT → TEACH → WORK → TEST → SELF-CRITIQUE → COMMIT → HANDOFF → COORDINATE → INTEGRATE → VERIFY → IMPROVE.
**Coordinator:** OBSERVE → CONSOLIDATE → IDENTIFY CONFLICTS → DISTRIBUTE KNOWLEDGE → SEQUENCE WORK → INTEGRATE → VERIFY → REPORT.

## Non-negotiables (Final Directive)
No placeholders/fakes · no emoji as art · original content · server-authoritative economy · no pay-to-win · Hearth Token IAP-only (never PvE-minted) · decide autonomously within your authority · fix, don't just document · verify visual changes visually.

## Working facts (repo)
- Base: `main` @ `119a698`, v0.9.2-beta (b217), remote in sync. **Pushing `main` auto-deploys to production.**
- Tests: `node tests/run-smoke.mjs` → 175/175. Guard: `bash bump-version.sh --check`. CI mirrors both.
- Preview: `hearthrise-qa` port 8123. Sticky cache — force-reload and confirm the build.
- Content authored ONCE in `src/data/*`; merged into the engine via `main.js`. Theme rules scoped. `assets/` structure frozen.
