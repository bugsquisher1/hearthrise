# Client health over a long session — 2026-11-11 (lane/r-client-health, qa-engineer)

Tool: `node tools/qa/long-session.local.mjs` (new). It runs the real `play.html`, the real engine and the 10 s world tick on the replayed chain (`tools/qa/local-world.mjs`), headless Chromium, 1280x720. Fixture: a new account and a party of 4 own heroes (Lumen and LumenA..C, new Level 1 heroes in their starting kit) hunting the Mill Cellar. The viewed hero is watched, and the hunt is aged 2 game minutes per real minute (`world.skip`). Before each sample: 3 forced GCs, then CDP counters plus an init-script census (timers, rAF, sockets, topics, canvases, fetches).

Two full runs:
- **before**: the first full run. Its harness held Playwright element handles, which inflated nodes in its churn rows (see "Harness lesson").
- **after**: the handle-free harness, with 10 hunt cycles added.

There was no client fix between the two runs, because no client leak was found. The comparison is the harness, not the game.

## Over time

| Phase | min | heap MB | DOM nodes (CDP) | elements | listeners | timeouts / intervals | rAF / frame | fps p50 / p95 ms | long tasks | WS / topics | canvases (Mpx) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| before: start | 2 | 15.6 | 3475 | 1336 | 225 | 6 / 9 | 2.25 | 60 / 16.7 | 0 | 1 / 8 | 19 (2.68) |
| before: watch min 10 | 12 | 17.6 | 3550 | 1389 | 225 | 6 / 9 | 1.00 | 60 / 16.7 | 0 | 1 / 8 | 19 (2.68) |
| before: watch min 20 | 22 | 18.1 | 3560 | 1396 | 225 | 6 / 9 | 1.00 | 60 / 16.7 | 0 | 1 / 8 | 19 (2.68) |
| before: watch min 30 | 32 | 18.8 | 3559 | 1396 | 225 | 6 / 9 | 1.00 | 60 / 16.7 | 0 | 1 / 8 | 19 (2.68) |
| before: watch min 40 | 42 | 19.0 | 3570 | 1403 | 225 | 6 / 9 | 1.00 | 60 / 16.7 | 0 | 1 / 8 | 19 (2.68) |
| before: 10 hero switches | 42 | 18.2 | 4753 * | 1403 | 264 | 6 / 9 | 1.00 | 60 / 16.7 | 0 | 1 / 8 | 24 (2.47) |
| before: windows x20 | 44 | 21.1 | 47258 * | 1403 | 264 | 6 / 9 | 1.00 | 60 / 16.7 | 0 | 1 / 8 | 24 (2.47) |
| before: hidden 15 min | 59 | 21.0 | 47273 * | 1410 | 264 | 6 / 9 | 1.00 | 60 / 16.8 | 0 | 1 / 8 | 24 (2.47) |
| before: frozen 5 min | 64 | 21.0 | 47268 * | 1410 | 264 | 6 / 9 | 1.00 | 60 / 16.8 | 0 | 1 / 8 | 24 (2.47) |
| after: start | 2 | 15.8 | 4047 | 1344 | 264 | 6 / 9 | 0.99 | 60 / 16.8 | 0 | 1 / 8 | 24 (2.68) |
| after: watch min 10 | 12 | 17.6 | 4107 | 1389 | 264 | 6 / 9 | 1.00 | 60 / 16.8 | 0 | 1 / 8 | 24 (2.68) |
| after: watch min 20 | 22 | 18.5 | 4128 | 1403 | 264 | 6 / 9 | 1.00 | 60 / 16.7 | 0 | 1 / 8 | 24 (2.68) |
| after: watch min 30 | 32 | 18.6 | 4137 | 1410 | 264 | 6 / 9 | 1.00 | 60 / 16.7 | 0 | 1 / 8 | 24 (2.68) |
| after: watch min 40 | 42 | 18.7 | 4137 | 1410 | 264 | 6 / 9 | 1.00 | 60 / 16.7 | 0 | 1 / 8 | 24 (2.68) |
| after: 5 / 10 hero switches | 42 | 19.1 / 18.3 | 4143 / 4139 | 1410 | 264 | 6 / 9 | 1.00 | 60 / 16.7 | 0 | 1 / 8 | 24 (2.47) |
| after: windows x5 / x20 | 43 | 20.1 / 20.4 | 4486 / 4488 | 1410 | 264 | 6 / 9 | 1.00 | 60 / 16.7 | 0 | 1 / 8 | 24 (2.47) |
| after: hunt cycles x5 / x10 | 50 | 20.9 / 21.4 | 4270 / 4270 | 1258 | 264 | 7 / 9 | 1.00 | 60 / 16.7 | 0 | 1 / 8 | 24 (2.68) |
| after: hidden 15 min | 65 | 20.8 | 4462 | 1389 | 264 | 7 / 9 | 1.19 | 60 / 16.7 | 0 | 1 / 8 | 25 (2.69) |
| after: frozen 5 min | 70 | 21.1 | 4461 | 1389 | 264 | 6 / 9 | 1.00 | 60 / 16.8 | 0 | 1 / 8 | 24 (2.68) |

\* Harness artifact: unreleased Playwright handles. Not seen with the handle-free harness.

Separate runs on the same harness:
- 30 hunt cycles: heap 18.3 → 19.8 MB, nodes 4258 → 4259, everything else flat.
- 20 cycles with `--retainers`, and a 10-switch / 20-round churn run: no detached DOM.
- A second tab on the same account, both tabs visible for 5 minutes: no refusal in either tab, and tab 1 stayed live (20 distinct pictures in 10 s).

Windows opened: Hunts, Bag, Character, Gathering and crafting, Market, and the Monster page (from a creature on the Hunts page). Each was opened 20 times.

## Monotonic growth (P1 bar: grows without bound)

**None.** Each candidate, with the evidence that it is bounded:
- **Heap.** It rises 15.8 → about 18.5 MB over the first 20 minutes, then holds 18.3 to 19.3 MB over the last 20. The heap-snapshot diff from minute 10 to 40 is:
  - about 650 KB of V8 compiled code (InstructionStream, TrustedByteArray, Code): the JIT warming up;
  - about 70 KB of DevTools network buffers, which are the harness's own Network domain;
  - about 300 KB of numbers, strings and objects, consistent with capped caches filling up: timeline `maxEvents`, recorder `max` 600, `LOG_MAX_LINES`, catalogue-keyed analyzer rows.
- **Heap across hunt cycles.** About 80 KB a cycle over cycles 5 to 30, and the rate is falling (+0.6, +0.1, +0.4, +0.1, +0.3 MB per 5 cycles). The diff is the same mix: JIT code, DevTools buffers, and the performance timeline's LCP and layout-shift entries, which the browser caps at 150. No app object kind grows.
- **DOM.** Nodes and elements are flat across switches, windows and cycles. After the churn and after the cycles, the heap-snapshot walk finds no detached DOM.
- **Listeners, timers and loops.**
  - Listeners stay at 264 (225 + 39 in the before run until its first switch; this is one-time, see below).
  - Timeouts stay at 6 to 7: 4 are `HuntPoll._set` (src/session/character-session.js:86), one per hero, and the 7th is a bounded `answerAges` timeout (src/shell/intent-words.js:192).
  - Intervals stay at 9, all page-lifetime: diagnostics, new-version, connection, supabase auto-refresh, social poll, 3 town presences, and the shell ticker.
  - rAF stays at 1.00 per frame (the World loop only).
- **The first switch.** It adds 39 listeners and 5 off-DOM canvases one time, and they stay flat through 10 more switches and 30 cycles. That is consistent with per-character caches that are already capped, such as hero-dye (24 looks). It is not growth.
- **Sockets and channels.** 1 WebSocket and 8 topics for the whole session (4 hero topics and 4 chat topics). Away drops the hero topics and the return rejoins them.

## The hidden tab

Hidden 15 minutes (emulated: visibilityState is hidden and there are no animation frames):
- **Asks while hidden:**
  - 1 hr-accrue, inside the 15 s `awayAfterMs`;
  - 14 hr_social_poll, the designed 55 s presence stamp (`CHAT_LIMITS.friendsPollAwayMs`);
  - 1 auth refresh (the token's hour ran out while hidden; the refresh worked);
  - nothing else.
- **WebSocket frames while hidden:** 50, all on the chat topics, because the hero topics are dropped while away.
- **Shown again:** first engine ask and first fresh picture at 120 ms, the hunt view live (16 distinct pictures in 10 s), Leave present.
- **Chrome's freeze** (Page.setWebLifecycleState frozen, 5 min): the first fresh frame comes 116 ms after the thaw, with 20 distinct pictures in 10 s.
- **The before run** gave the same results: 157 ms and 138 ms.

## Verdict on "Chrome QA tabs freeze after idle" (CLAUDE.md §9)

**The game client is not the cause, as far as this harness can reach.** Ruled out:
- the client accumulating anything (heap, DOM, listeners, timers, render loops, sockets, topics, canvases) over 70 minutes with a party of 4;
- failing to resume from hidden or from Chrome's lifecycle freeze (about 120 ms);
- the token refresh while hidden;
- a second visible tab on the same account (no refusals, no stall).

**Found on the tool side:** `tools/qa/pane-probe.js` waits for animation frames, and a hidden tab gets none. On a QA tab left behind another tab, the probe never answered, and that reads exactly as "the tab froze". The old probe hung on a hidden page and on a page hidden part way through (my 15 s cap). The fixed probe answers in 1 ms with "the tab is hidden" and marks a run whose frames stop as `stalled`. The harness's hidden phase now checks this on the real page.

**Not ruled out** (headless cannot reach these):
- real Chrome background throttling (Playwright launches with throttling disabled; the hidden state here is emulated);
- Memory Saver tab discard (that is a reload, not a freeze);
- hidden for longer than 1 hour with the token expired before the wake;
- the browser-pane/extension connection itself.

## Other findings

- **P3, routed to backend-architect (lane C).** An own hero's hunt started anywhere but this page (a second tab, a phone, or a Start from outside) shows "In town, idle" until the world tick's first flush settle (`flush_seconds` 90). In the local world, 5 consecutive 70 s party hunts started from outside never appeared on the page. Cause: `hr_party_nudge` (2027-02-11-party-nudge.sql §1) skips the caller's own account, and solo starts send no nudge. Pressing Enter on the stale tab is refused, and the refusal's resync heals it.
- **P4, local world only.** Each Market window open is a 409 `market_closed` (20 per run), which shows as console noise. The client handles it (`sc.closed`, src/shell/windows/market/state.js:57).

## Harness lesson

`page.waitForSelector` and `page.$` return an ElementHandle, and a handle that is never disposed keeps its tree alive after the page lets the tree go. In the before run, this looked like 2,120 leaked nodes per window round and about 1,200 nodes on the first switch. The harness now waits with locators.

## Raw data

The JSON for every sample is in the lane's scratchpad:
- `before.json`
- `after.json`
- `cycles30.json`
- `churn.json`
- `tab2.json`

To re-create it: `node tools/qa/long-session.local.mjs --watch 40 --cycles 10 --retainers --snap-at 10 --out after.json` (about 72 min).
