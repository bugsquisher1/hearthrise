# QA Engineer — running log

_Your private journal. Newest at top. Team-wide items also go to `DISCOVERIES.md` / `HANDOFFS.md`._

## Standing knowledge
- Gate: `node tests/run-smoke.mjs` (262/262 at b223, 0 runtime errors) + `bash bump-version.sh --check`. CI mirrors both.
- Preview `hearthrise-qa` port 8123; sticky cache — force-reload, confirm the build under test. Wipe save: no-op `saveLocal` first.
- Try to BREAK it: fresh/existing accounts, empty/full inventory, max/min, rapid/interrupted actions, reload mid-action, save/load, offline, multi-tab, long sessions.
- Watch list: offline double-pay (stale `G.lastSeen`), XSS via names→innerHTML, PvE token mint, `snapshotG` save-shape drift, unlock deadlocks.
- Bug flow: reproduce → minimize → severity → root cause → fix/route → reproduce → regression test → verify surroundings.

## Log

### 2026-08-31 · Bounty-board hunt (live b486) — six defects, five fixed, one routed

**Method that worked, keep it.** Tyler gave no detail ("there is still a bug with the bounty
board"). A throwaway Playwright driver against the real page (static server + `__HR_TEST_HARNESS__`,
wait for `window.G` && `HearthriseCore`) that DRIVES every interaction and prints a state snapshot
after each one found all six inside twenty minutes. **Reading the code first would have found at
most two** — the shop deadness and the finalize brick only look wrong once you see an enabled Buy
that refuses and a 26/26 bar with `completed: 0`. Print state, not assertions, on the first pass.

**The heuristic that paid.** Every one of the six is the same shape: *a client-side payout or spend
that the record arm turned into a no-op, with the UI still narrating the old behaviour.* Under an
arm, `if (clientMayWriteRecordField(X)) …` is not a gate, it is a DELETION — so every one of them
needs a matching question: **who pays now, and who tells the player?** Next sweep: grep
`clientMayWriteRecordField` for (a) a bare `return`, (b) a `notify` outside the gate, (c) a Buy
button whose `disabled` does not consult it.

**Don't trust an arm-flag comment.** `MARKS_RECORD_ARM_ENABLED = true; // DORMANT` had been wrong
for 32 builds and it misled the Coordinator's triage of bug_reports #46 mid-task. **Measure the arm
in the harness** (`clientMayWriteRecordField('marks')`) before believing any claim about it,
including one from another agent.

**Mutation discipline.** The full runner is 5-10 min on a loaded machine and its node-side guards
time out first, so mutation-proving six tests through it is impractical. A 60-second in-page runner
(`window.__smokeTest({verbose:false})` in my own Playwright script, filtered to the new test names)
made per-fix mutation cheap enough to actually do: all seven fail against the pre-fix code, and
BOUNTY-PAY-1 was re-mutated separately to prove it binds to the FILTER and not merely to the
export's existence.

**Worktrees have no `node_modules`.** `mklink /J` a junction to the main repo's (gitignored) —
`MSYS2_ARG_CONV_EXCL='*' cmd /c mklink /J <worktree>
ode_modules <repo>
ode_modules`.

**Left open (routed, not mine):** the Unlocks strip still lights types the board will not post; the
"Easy" tier-1 cull can require more kills than the "Normal" beside it; `goldBoost`/`cosmeticCloak`
are unimplemented goods. All in HANDOFFS to Designer/Systems.

### 2026-08-23 · TEST-DEBT BURN-DOWN after the b454/b455/b456 cutover — 73 red → 7, and the 7 are real bugs

**What the 73 actually were.** Not 73 problems: ONE problem, 73 times. The harness never runs a real
`hr_load`, so `G._record` is absent and every armed field (`skills`, `equipment`, `rooms`, `marks`,
`restedXp/At`, plus `gold/gems`) reads UNKNOWN and fail-closes. `stampBalanceLikeLoad` had already
solved this for gold/gems; the cutover armed seven more fields and nobody extended it. The fix is
`stampRecordLikeLoad(G)` (smoke-test.js, beside its gold ancestor): builds a real hr_load envelope out
of what G holds — `state.*` scalars, `res.skills`/`res.equipment` at the top level, `res.progress[]`
`room:<id>` rows — and pushes it through the REAL `applyRecord`. It pokes no `_record` internals, so a
green test proves the armed READ path carries the value.

**Three new seam runners, all "drive the position the test is ABOUT".**
`withLocalBlob` (capstone off — saveLocal/loadLocal are no-ops under the arm, which silently turned
nine save/load tests into tests of nothing), `withLocalFarm` (farm RPC routing off — plant/water/
harvest/upgrade now send intents, so the local farm arithmetic had no path to run), and
`restoreGAndRecord` (a test that drives a REAL `loadLocal` ends in `forgetServerOfRecord`, which strips
G and leaves the ambient character at 1/1 hp — that took ACT-1 and four COMBAT-UI tests down with it
until the restore also re-stamped).

**Things I got wrong on the way, worth not repeating.**
1. `applyRecord` replaces `_record` WHOLESALE — mixing the two stampers in one test drops fields.
2. A `const` declared inside `try` is invisible to `finally`. Hoist anything the cleanup touches.
3. A test that caches a DOM node across a render that does `panel.innerHTML = …` is asserting on a
   detached node (ELEM-DISC-4 — it had been passing for the wrong reason for as long as the ambient
   worn set happened to contain a weapon).
4. XP is granted as a FLOOR of `paced * (1+bonus)`, so whether a +5% buff is visible at all depends on
   where the ambient stack leaves that product relative to the next integer. AWAY-16 measured 30000 vs
   30125 in isolation and 36000 vs 36000 inside the suite, same build. Neutralise the ambient stack AND
   pick a magnitude that clears a whole point — then assert the headroom on the real grant path first,
   so a future fixture failure says "fixture", not "the engine paid nothing".

**Two flakes killed with the same tool.** `b217` (cooking quest, 1/2/3 across three runs) was an
unstamped Kitchen rung making a burn-proof range a 25% coin flip. `b334`'s `renderCombat` is a genuine
boot-order race (4/4 boots wrapped, 3/8 suite runs stripped) and is now pinned RACY with its reason
rather than left as a coin-flip red — the same treatment `renderProfile` already carried.

**Also modernised the NODE guards** nobody had looked at: `marks-record`, `rested-record`,
`rooms-record`, `equipment-record`, `farm-sync`, `blob-retire`. Every one asserted `ARM_ENABLED must
ship false` and reached its dormant block via `reset()` — which now falls back to the armed const. Same
treatment: invert the default assertion, force the dormant position through the seam.

**The rule I held throughout:** never delete an assertion to make a run green. 83 assertion lines
removed, 156 added; every removed line is either re-added verbatim inside a seam-forced block, inverted
deliberately with a message naming the new failure, or restated for the armed model with its reason.
Two fixtures that had rotted (`B340-2`, `B347-R3/R4`) are now DERIVED from the registry instead of
listing the fields that happened to be moved when they were written, so the next arm cannot rot them.

**7 red on purpose, 4 real product bugs** — filed in DISCOVERIES.md and routed to Systems Engineer:
the half-flipped cooking arm (4 guards), the dead hero-slot purchase (1, + it blinds `saveSlotGuard`
and `slotSwitchGuard`), the capstone save write bypassing the auth breaker and the gateway retry (2),
and the 30s Settings copy (1).

### 2026-08-11 · CONSERVATION-INVARIANT FUZZ built — `tests/conservation-fuzz.mjs`
Security's three-times-named cutover blocker. Randomised, seeded, ~61,000 ops exercised; **10/10
planted conservation violations caught**; no real violation found in the server-authority foundation.

**The unlock:** the four real migrations apply CLEANLY to **PGlite** (WASM PostgreSQL 18) in-process.
That means the whole server tier is now executable in `node`, with no Docker, no psql, no Supabase
credentials, no branch and nothing left behind. Scaffolding is `tests/sql/pglite-fixture.sql`
(auth.uid/auth.users/profiles + a pg_cron shim). **This is reusable far beyond the fuzz** —
`tests/sql/server-authority.test.sql`, which today can only run by being emitted and pasted at a
database, could run here on every push. Handed to Systems Engineer.

**Falsifiability first.** Ten known conservation bugs are planted as exact-substring patches to the
REAL migration text, and an anchor that matches 0 or 2 times aborts as a HARNESS error — a planted
bug that never got planted is the same defect as an always-null probe. Two of the ten (`gold_double`
and `reject_becomes_ok`) exist specifically to prove sub-assertions are real rather than decorative.

**A trap I fell into and fixed:** my first draft computed `want` (the verdict the server must give)
and never compared it — my own always-null probe, in a harness written to hunt exactly that. Now
divergence on the 14 constructed-rejection ops FAILS the run, and `reject_becomes_ok` proves it.

**Second trap:** the obvious plant for "replay applies twice" (make the intent lookup miss) also
breaks apply-engine's own S6 self-verification, so the migration refuses to install — the fuzz never
ran. Good defence, but it hides the bug class. The plant now leaves the collision branch intact and
removes only the success short-circuit, which is the real b214 double-pay shape and installs fine.

**Third trap:** two PGlite instances in one Node process are not independent — the second boot of the
same bundle failed an assertion the first had just passed. `--selftest` now forks a process per run.

**Could NOT exercise:** true concurrency (PGlite is one backend — locks are exercised, never raced),
RLS/EXECUTE grants (harness runs as owner), pg_cron scheduling itself. Needs a branch.

### 2026-08-08 · systematic click-through, b224+wall (port 8159) → `docs/reports/AUDIT-2026-08-08-clickthrough.md`
Breadth pass, read-only. **418 controls clicked (177 distinct), 0 console errors, 0 page errors.**
7 genuinely dead controls · 2 shipped placeholders · 3 mislabeled · 3 stale-screen · 1 validation bypass ·
Escape closes only 2 of 8 modals · **0 player traps** (every modal has a visible close).

**Method that worked:** two automated sweeps (per-tab multi-pass, then modal-aware with recursive descent
into whatever a control opens), each click bracketed by an idle baseline so the idle game's own ticking is
subtracted — then EVERY flagged candidate re-tested by hand. Full findings in the report; here is what to
carry forward.

**Two harness traps I fell into — do not repeat.** Both manufacture false "dead control" readings and
between them accounted for all 33 initial candidates (0 were real):
1. **Toasts render with class `.notif`, NOT `.toast`.** Any control whose only feedback is a toast reads as
   dead. Hook `window.notify` instead of diffing the DOM. Also hook `prompt`/`confirm`/`alert` — native
   dialogs are invisible to a DOM diff (this is what hid the Home rename bug for a whole pass).
2. **Element index paths go stale** — panels re-render on a timer, so a path captured at enumeration can
   point at a different element, or at an already-active tab, by the time you click it. Re-find fresh by
   (tag, class, text) immediately before each click.
Corollary: a DOM diff can only ever say "something happened". Dead controls are found by asking what
*consumes* the value — that is how the whole Audio section and UI scale fell out.

**Third trap: the scratchpad is shared.** Other agents were live in the same session dir and overwrote two
of my scripts mid-run. Work in a private subdir (`scratchpad/qa-ct/`).

**Worst five (all routed in the report):** Settings › Audio is 4 controls with no audio subsystem in the
build at all (and it is the section that opens by default) · UI scale scales nothing, which matters because
it is what a player reaches for before filing backlog #1/#19 · the topbar Notifications bell has no handler
anywhere in `src/` · Bounty Accept/Abandon mutate state but repaint `#combat-area` instead of the Bounty tab,
so the board lies · Home's rename pencil is a third display-name writer that bypasses `validateName`
entirely, three months after b221 wrote "One writer, one rule set" into `settings-page.js`.

**Cleared with evidence — do not re-flag:** every inventory category chip, market picker/sort/search
(sort+search ARE wired, they filter the *browse* list which is empty offline), farm plot tiles and Plant/Water
All, skills activity tiles, all 49 gated controls (honestly disabled WITH the reason in the label), market
list→cancel round-trip, bounty double-accept guard, the muster "Join" two-step confirm (looks like a stuck
button in a diff; it is a confirmation step), the 8 extra `.farm-tile` nodes (0×0, hidden), collection-log
cells (non-clickable by design until discovered), Reset-character with confirm=No.

**Not covered (needs a live session or progression a fresh account cannot have):** all clan/castle controls
incl. feast call + hunt declare + RoomModal actions, market Buy/buy-offer (no other sellers offline),
identity Claim, server muster claim, leaderboard writes, dungeon/raid content behind combat 25-95,
collection-log drill-in/claim (0/31 discovered), most House rooms, the file-chooser leg of avatar upload and
import save, real pointer-drag of the chat pill, mobile/landscape.

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
