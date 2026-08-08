---
description: Show team state — agents, branches, worktrees, active tasks, blockers, integration status
---

Produce a concise **team status** report. Gather from reality first, then the coordination files:

1. `git status -sb`, `git log --oneline -5`, `git worktree list`, `git branch -vv`.
2. Smoke/version-guard state if known or cheap to check.
3. `.claude/coordination/ACTIVE_WORK.md`, `INTEGRATION_QUEUE.md`, `CONFLICTS.md`, `CURRENT_STATE.md`.

Report, tightly:
- **Base:** main HEAD, version, remote sync, working-tree cleanliness, last green smoke count.
- **Per agent:** current task, files claimed, status (idle/in-progress/blocked/ready), blockers.
- **Integration queue:** what's ready, in what order.
- **Open conflicts:** code + semantic.
- **Recommended next action.**

Keep it a scannable briefing, not a wall of text. Flag anything where the files disagree with git reality.
