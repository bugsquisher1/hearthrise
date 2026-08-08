# QA Engineer — running log

_Your private journal. Newest at top. Team-wide items also go to `DISCOVERIES.md` / `HANDOFFS.md`._

## Standing knowledge
- Gate: `node tests/run-smoke.mjs` (175/175, 0 runtime errors) + `bash bump-version.sh --check`. CI mirrors both.
- Preview `hearthrise-qa` port 8123; sticky cache — force-reload, confirm the build under test. Wipe save: no-op `saveLocal` first.
- Try to BREAK it: fresh/existing accounts, empty/full inventory, max/min, rapid/interrupted actions, reload mid-action, save/load, offline, multi-tab, long sessions.
- Watch list: offline double-pay (stale `G.lastSeen`), XSS via names→innerHTML, PvE token mint, `snapshotG` save-shape drift, unlock deadlocks.
- Bug flow: reproduce → minimize → severity → root cause → fix/route → reproduce → regression test → verify surroundings.

## Log
### 2026-08-08 · bootstrap
Baseline green: 175/175. No active task. QA also verifies other agents' work before integration.
