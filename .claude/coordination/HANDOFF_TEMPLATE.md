# COORDINATOR HANDOFF — template

_Copy the block below into the top of `HANDOFFS.md` (newest first), fill every line, commit, push, THEN let the incoming holder take `COORDINATOR.md`. Write "none" rather than leaving a line blank. Keep it to one screen._

```
### YYYY-MM-DD HH:MM UTC · COORDINATOR HANDOFF · FROM <session/account> → TO <session/account> · <reason: usage / PC load / etc.>

**Repo state**
- origin/main: <sha> (<version>) · local main == origin/main: yes/no
- Open release/set branches: <name @ sha, GitHub run: green/red/running/not pushed>
- Unpushed work anywhere (worktrees, local branches): <path/branch — or "none, verified by git branch -vv + git worktree list">

**Lanes in flight** (max 3-4)
| Lane | Branch @ sha | Type A/B/C | State (working / READY / blocked) | Next step / who |

**Ready, not yet merged**
- <branch @ sha> — lane-done green? yes/no · conflicts with main? yes/no

**Lane C (DB / economy)**
| Migration file | Security GO? | Applied? (time UTC) | live-hash baseline re-measured? | apply-order note flipped? | restore-census re-pinned? |

**Edge**
- supabase/functions/** changed since last deploy: yes/no · live payload_sha256 == pack-edge --hash: yes/no/unchecked

**Release**
- Last shipped: vX.Y.Z (date) · Discord note posted: yes/no · Next version number: X.Y.Z
- Play gate for the last release: played / unplayed

**Open P0/P1**
- <player-visible bug · lane · status>

**Things only the outgoing session knows** (rulings from Tyler, gotchas, half-formed plans, anything not in git)
- ...

**Do NOT do**
- <e.g. "do not re-apply 2026-10-xx-foo.sql, it landed 17:07 UTC">
```
