---
description: Create or review an agent-to-agent knowledge handoff
argument-hint: [from-agent] -> [to-agent] : [subject]
---

Create or review a handoff in `.claude/coordination/HANDOFFS.md`.

If arguments describe a new handoff (`$ARGUMENTS`), append an entry at the top using this structure, filled from the actual work just done — no placeholders:
```
### <DATE> · FROM <agent> → TO <agent(s)>
WHAT I LEARNED:
WHAT I CHANGED:
WHAT YOU NEED TO KNOW:
WHAT I NEED FROM YOU:
WHAT MUST NOT BE CHANGED:
WHAT SHOULD BE TESTED:
```
Also mirror any durable, team-wide fact into `DISCOVERIES.md`, and update the receiving agent's `agents/<to>.md` log so they'll see it when next dispatched.

If no arguments, **review** open handoffs: list unresolved ones, who owes what to whom, and recommend which to action next.
