# QA Engineer — running log

_Your private journal. Newest at top. Team-wide items also go to `DISCOVERIES.md` / `HANDOFFS.md`._

## Standing knowledge
- Gate: `node tests/run-smoke.mjs` (262/262 at b223, 0 runtime errors) + `bash bump-version.sh --check`. CI mirrors both.
- Preview `hearthrise-qa` port 8123; sticky cache — force-reload, confirm the build under test. Wipe save: no-op `saveLocal` first.
- Try to BREAK it: fresh/existing accounts, empty/full inventory, max/min, rapid/interrupted actions, reload mid-action, save/load, offline, multi-tab, long sessions.
- Watch list: offline double-pay (stale `G.lastSeen`), XSS via names→innerHTML, PvE token mint, `snapshotG` save-shape drift, unlock deadlocks.
- Bug flow: reproduce → minimize → severity → root cause → fix/route → reproduce → regression test → verify surroundings.

## Log
### 2026-08-08 · exploratory attack on b219→b223 (branch `agent-qa-pass`, worktree `manual-qa`, port 8152)
First solo dispatch. Attacked cross-feature seams, abuse, state corruption and the fresh-account
front door. **Fixed 1 · routed 5 · cleared 12.** Smoke 262/262 (mine included, verified red without
the fix). No version bump.

**Fixed here** — P2 What's-New sheet stacked on the FTUE tour. `src/welcome-modal.js` guarded on
`.hr-ftue`, which has matched nothing since b141; the tour renders `.ftue-root > .ftue-card.show`.
post-signup-welcome.js:88 and identity.js:1043 were corrected in b221 — this file was the last
straggler. Sheet (z 99998) opened UNDER the tour card (z 99999) with a full-screen scrim the
spotlight can't punch through. Now guards `.ftue-root .ftue-card.show, .hr-id-scrim, .hr-dl-scrim`.
Verified live: tutorial → What's-New → daily reward, strictly sequential, no starvation.

**Routed — hand these to the owners verbatim** (kept here, not in DISCOVERIES.md: the dispatch
scoped me to my own log so the shared files stay conflict-free while other agents are in flight).

1. **P2 → Systems · The welcome-back modal reports HALF the offline yield actually granted.**
   `processOffline()` (legacy.js ~590) replays gathering at FULL rate with an entitlement/renown/
   homestead-boosted cap. `calcCatchup()` (~6465) and `calcRichCatchup()` (~6856) — display-only
   since the b214 fix — still apply `* 0.5` "50% efficiency offline" and a hardcoded 12h cap.
   Measured: 3h away granted **99,810 XP / 5,383 logs**; the modal said **+45,000 XP / +2,700
   Normal Log**. It is the only report a player gets of their offline session, and it is 2× wrong.
   Repro: no-op `saveLocal`, hand-write a save with `activeSkill:'woodcutting'`,
   `skillTargetId:'normal_tree'`, `lastSeen: Date.now()-3*3600000`; reload; compare the modal to
   `G.lastOfflineSummary`. Fix direction: render `G.lastOfflineSummary` (already holds the true
   numbers) instead of recomputing a second, disagreeing model.

2. **P2 → Systems · Multi-tab is silent last-writer-wins data loss.**
   Two tabs, same origin. Tab B earns and saves; Tab A — open the whole time with a stale `G` in
   memory — autosaves 90s later and destroys Tab B's entire session. No `storage` listener, no
   lock, no warning UI. Reproduced with two live tabs: A held gold 500, disk held B's 777,777.
   Fix direction: a tab lock, or a `storage`-event reconciliation plus a visible warning.

3. **P3 → Systems · `processOffline()` is not idempotent.** It never advances `G.lastSeen` (only
   `saveLocal()` does). Called twice it pays twice — measured 99,782 → 200,610 XP. Latent, not
   live: `loadLocal()` runs once per page life today and slot switching does `location.reload()`.
   **The naive fix is wrong** — advancing `lastSeen` inside `processOffline` blanks the
   welcome-back modal, which reads the same watermark 1.8s later. Contrast b222's rested-XP
   watermark (`G.restedAt`), which IS idempotent: verified banking 30 charges exactly once across
   both a double call and a real reload.

4. **P3 → Systems · One unknown `cropId` kills the whole Farm page.** `legacy.js:2148`
   (`crop.icon`) and `:2437` (`crop.prod`) do `CROPS[p.cropId].x` unguarded, so a plot holding a
   crop this client doesn't know — a cloud save from a newer build mid-rollout, or a retired crop
   id — throws and the error boundary replaces the entire Farm panel with "Something broke here".
   `HearthriseFarm.isReady()` already defends exactly this ("unknown crop — never auto-ready");
   the renderers don't. Repro: `G.farmPlots=[{cropId:'__missing__',plantedAt:Date.now(),
   waterings:[],state:'growing'}]`, reload, open Farm.

5. **P3 → Game Designer · Renaming leaves your own open market listings under the old name.**
   `seller` is denormalised onto the listing at list time. Ownership keys off `sellerId`, so
   nothing is broken — but the player sees a name that is no longer theirs. Decide: re-render
   from identity, or accept the listing as an immutable ledger entry.

**Cleared with evidence (do not re-test blind):** name validator refuses all 41 hostile inputs
(zero-width, RTL/isolate overrides, emoji, homoglyph, SQL, `__proto__`, fullwidth, lone surrogate);
avatar pipeline refuses SVG both by MIME and by content-sniff, re-encodes to webp, no XSS;
farm growth is purely timestamp-derived so offline == online exactly, and `min(bonus, elapsed)`
holds at 2× against duplicated/NaN/±1e15 waterings; Water All idempotent across 20 taps (4
waterings, 8 XP); daily-reward claim idempotent across 10 taps (+500 once); muster join idempotent
across 15 taps and the toast queue collapses the burst to 2; muster pill survives `_setSkew` at
±1e15/NaN/±Infinity with no NaN, no negative countdown; leaderboards survive 400 category/board
switches plus hostile ids with no error and no DOM injection; rested XP is watermarked and does NOT
double-bank (b222 SEAM 3 verified through a real reload); every new G field survives save/load
(whole-G JSON, no allowlist); corrupt `restedXp`/`restedAt`/`G.muster`/`waterings` all recover.

**Test-artifact trap I fell into (don't repeat):** calling `window.renderSkillDetail(id)` directly
sets `window.__viewedSkillId` (block 39 view-other-skills guard) and then SUPPRESSES every
engine-driven re-render for the active skill — it looks exactly like the b220 category-chip
staleness bug. Driven through `openSkillDetail()` (the real click path) the chips update correctly:
cooking Lv 1 → 35 flipped "Feasts & Draughts Lv 5" → "Feasts & Draughts 14" as designed.

**Not covered — honest gaps for the next pass:** anything needing a signed-in Supabase session
(server muster join/claim, clan Hunt, leaderboard writes, cloud-save conflict, cross-client
whisper); chat-pill drag was exercised only through `Chat.setPosition` (clamping correct), not by
real pointer drag during a toast relayout; inventory doll tabs under simultaneous combat +
gathering; mobile/landscape.

### 2026-08-08 · bootstrap
Baseline green: 175/175. No active task. QA also verifies other agents' work before integration.
