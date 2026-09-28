# b560 visual gate, pass 3 (set/b560 @ 92e050c)

Branch `qa/b560-visual-3`, cut from `origin/set/b560` at
`92e050c8603f28c816374ec7450e402c07d9ea19`, which contains (in order)
`3c51c0f` FIGHT-PHONE-DENSITY, `9f2b51e` HOME-BAND-922, `92e050c` DEEDS-POLISH,
and `d81f4b9` the settle-first client half (F2). 26 PNGs: 13 shots at
1280x800 and the same 13 at 922x423. No game code was touched.

## How the shots were made

Headless Chromium (`/opt/pw-browsers/chromium-1194`) via a scratch Playwright
driver (`qa/b560-visual-3/driver.mjs`, not committed) that imports `bootPage()`
and `serve()` from `tests/visual-qa.mjs` — the same substrate passes 1 and 2
used. `window.__HR_TEST_HARNESS__ = true` is set before load, the `MID_GAME`
fixture is applied, and FTUE/overlays are dismissed by `bootPage()` itself.
Supabase and Google Fonts are unreachable in this sandbox (egress 403), so the
run used `--offline-fonts`; every shot renders in the **fallback system
fonts**, not Cinzel/Alegreya, and the account reads "Signed out / offline
reconnecting". `#hr-net-banner` and `.notif` toasts were removed before every
shot except the two toast shots (`deeds-toast*`, `settling-toast`), which need
them visible.

### Seams used, one per state

| State | Seam |
|---|---|
| Hearth band, one known + one pending cell | `window.HearthriseGoalState = { peek: () => ({ 'd:kill_any': { have: 12, target: 10 } }) }` (the HOME-BAND-922 regression's own fixture — `gold_500`/others stay unlisted, so their cell reads the pending dash) |
| Realm Lifetime kills | `HearthriseLifetime.__swapView({ counts: { kills: { n: 1284, exact: true } } })` |
| Fighting Slime | `window.showTab('combat'); window.startCombat('slime')` |
| Vigour meter | `HearthriseAccrual.hydrateHunt(G, { vigour: METER })`, `HearthriseVigourMount.paint()`, `window.refreshActivityBar()` (`METER` is the FIGHT-PHONE-DENSITY test's own fixture) |
| Deeds unlock toast, single | `HearthriseDeeds.tick({...})` with the store pre-seeded `{ first_kill: 0 }` (already seen, open) and `states.first_kill = 'done'` — a genuine 0→done crossing, not first sight (first sight only seeds, per `deeds.js` `tick()`; it does not toast) |
| Deeds unlock toast, batch | the same `tick()` seeded with `{ first_kill: 1, kill_50: 0, kill_250: 0 }` and all three now `'done'` — two crossings in one tick, fired within the first toast's 4.2s life |
| Achievements sheet reopen | `window.openAchievements()`, set `#ach-list.scrollTop = 2000`, close, reopen |
| Claim control latched / open | `window.HearthriseSettleFirst.__setLatchProbe(() => true/false)` then `sweepSettleLatch()` — the exact test seams `src/net/settle-first.js` publishes for this; a real goal was made claimable by seeding `G.dailyGoals = { picks: ['kill_any'], startValues: { kill_any: 0 } }` and `G.stats.kills = 999`, which satisfies `isComplete()`'s local fallback (no live `hr_goal_state` round trip needed) |
| Settling toast, second refusal | `window.HearthriseSettleFirst.__setClear(() => Promise.resolve())` (skip the real accrue-driven wait, which needs the blocked network) plus a stub `HearthriseGoalClaim.claimGoal` that calls the REAL `withSettleFirstRetry(() => Promise.resolve({ error: 'settle_first' }))` — both the first send and the one retry refuse, so the promise `claimQuestReward` awaits resolves to the settle_first body after the retry has already happened, and the toast comes from the real `settleRefusalText()` path, not a hand-written string |
| Character Account door / fabs | `window.showTab('character')`, then `.cr-acct-foot` scrolled into view (a fixed fab's overlap with a scrolling door can't be judged at scroll 0 once the page is taller than the viewport) |

## FINDINGS — none

Every measurement the brief asked for came back clean. No new defect and no
regression from the four merged lanes.

1. **HOME-BAND-922 holds.** At 922x423 the band is `y 72–127`; the activity
   bar ends at `y 72`; the hero name is `y 78–100` — fully inside the band and
   never touching the bar. All three `.hd-led` cells (`—`/`XP today`,
   `12`/`Kills today`, `—`/`Gold earned`) sit inside `.hd-hearth-in`'s rect
   (`72–127 × 66–920`) with zero px of slop, and no `.hd-led span` label wraps
   (each measured height equals one line height). Same at 1280x800 (band
   `131–322`). This was the exact pass-1 defect (clipped name, clipped
   figures, two-line labels cut at the bottom) — fixed.
2. **FIGHT-PHONE-DENSITY holds.** With a Vigour meter stated, `.ab-vigour`
   ("Vigour 626 min"), `.ab-tkills` ("Lifetime 1,284") and `.ab-away` all
   drew non-zero, visible rects fully inside the activity bar at both sizes —
   at 922x423 the previously-hidden Lifetime chip (`legacy.css:3740`'s
   `display:none` under `:has(.ab-vigour)`) is gone; `.ab-tkills` measured
   `46–69 × 738–805`, well inside the bar's `44–72 × 64–922`. Without a meter
   (`fight-dry`) the Lifetime and away chips still draw correctly. This was
   the pass-1 defect (Lifetime hidden whenever Vigour was stated) — fixed.
3. **Stance grid and food row (922x423) hold.** Four `.csb-btn` stance
   buttons, every pairwise gap exactly 4px (Accurate/Aggressive/Defensive/
   Controlled, 2×2), and the food row (`y 345–389`), metrics line
   (`390–407`) and session line (`408–427`) are three non-overlapping rows.
4. **LOADOUT header (1280x800) holds.** `#fsm-totals`'s parent measured
   `scrollWidth 214 === clientWidth 214` — "Loadout +0 atk · +0 str · +0 def"
   is whole, not clipped after "+0 str ·" as in the pre-b560 build.
5. **Character Account door (both sizes) holds.** Scrolled into view, the
   "Lifetime Stats" door (1280: `y 727–771, x 1014–1191`) does not intersect
   the bug-report fab (`y 709–738, x 1233–1268`) — a clear ~15px vertical
   gap. At 922x423 landscape the fab relocates to the rail's foot (by design,
   `theme-cozy.css` "Bug-report FAB = the rail's FOOT", `y 379–423, x 0–64`)
   and the door (`y 342–386, x 656–833`) is nowhere near it.
   `#btn-chat-mobile` lives inside the closed "More" sheet at both sizes, so
   it measured a `0×0` rect (not rendered) — there is nothing for the door to
   intersect; this is expected, not a defect.
6. **DEEDS-POLISH holds, all three claims.** A genuine 0→done crossing opens
   exactly one `.ach-toast` reading "Achievement unlocked! / First Blood" —
   both lines one line tall. A second crossing fired while the first toast is
   still up **replaces** it (`document.querySelectorAll('.ach-toast').forEach(old => old.remove())`
   in `showAchToast`) — `toastCount === 1` at both sizes, title
   "Achievement unlocked!" one line, name "Slayer and 1 more" one line
   (well under the two-line budget). Reopening the Achievements sheet after
   scrolling `#ach-list` to 2000 lands back at `scrollTop 0`.
7. **The settle-first latch and its toast both work end to end.** Before the
   boot settle answers (`bootSettlePending()` stubbed true, `sweepSettleLatch()`
   run), the real `.qm-q-claim` button in the Quests sheet is `disabled=true`,
   carries `data-hr-latched`, `aria-busy="true"`, renders at `opacity: 0.6`
   with the CSS-injected "…" pending mark ("CLAIM …"). After the boot settle
   answers (`bootSettlePending()` stubbed false, swept again) the same button
   is enabled, unlatched, reads "CLAIM" plain. Driving a real claim through
   the exported `withSettleFirstRetry` with a fetch that always answers
   `settle_first` produces the toast **"Settling your night first — try
   again in a moment"** verbatim, via the real `settleRefusalText()` lookup —
   confirming the retry ran once and the second refusal is what the player
   is told, not a raw error code.

## Per-file notes

### 1. Home hearth band
- `home-band-{1280x800,922x423}.png`: see finding 1. `HearthriseGoalState`
  fed one known cell (Kills today, 12) and left the rest (XP today, Gold
  earned) pending, matching the HOME-BAND-922 regression's own fixture.

### 2–3. Fight activity bar (Vigour states)
- `fight-vigour-{1280x800,922x423}.png`: Fighting Slime, Vigour meter stated
  (626 min remaining, matching the FIGHT-PHONE-DENSITY fixture), realm
  Lifetime 1,284. See finding 2.
- `fight-dry-{1280x800,922x423}.png`: same fight, no Vigour meter. Lifetime
  and away chips still draw (`Lifetime 1,284`, away pending dash since no
  Night Plan chip was fed this pass).

### 4. Fight arena foot
- `fight-foot-{1280x800,922x423}.png`: see findings 3 and 4. At 1280 the
  equipment slot labels still break mid-word ("Neckla/ce", "Weapo/n",
  "Offhan/d") — this is the **pre-existing** issue pass 1 flagged (finding 3
  there), unrelated to any of this set's four lanes, unchanged.

### 5. Character page (Skills tab, Account grid)
- `character-foot-{1280x800,922x423}.png`: see finding 5.

### 6. Deeds toasts
- `deeds-toast-{1280x800,922x423}.png`: single unlock, "Achievement
  unlocked! First Blood".
- `deeds-toast-batch-{1280x800,922x423}.png`: batch form fired a second time
  while the first toast was still up. Exactly one toast on screen, reading
  "Achievement unlocked! Slayer and 1 more" — the second crossing replaced
  the first rather than stacking (the pass-2 defect, now fixed).

### 7. Achievements sheet reopen
- `deeds-reopen-{1280x800,922x423}.png`: sheet scrolled to 2000px, closed,
  reopened — screenshot shows the reopened sheet at the top of the Fighting
  group (First Blood/Slayer/Champion/Hero of the Realm), `scrollTop` measured
  0. The pass-2 defect (reopens at the previous scroll position) is fixed.

### 8. Claim latch and the settling toast
- `claim-latched-{1280x800,922x423}.png`: Quests sheet, Daily tab, "Slay 10
  monsters" 10/10 claimable — the Claim button reads "CLAIM …", dimmed,
  disabled, `aria-busy`.
- `claim-open-{1280x800,922x423}.png`: same sheet after the boot settle
  answers — "CLAIM", enabled, plain.
- `settling-toast-{1280x800,922x423}.png`: the toast fired by the real
  claim handler after two settle_first refusals, reading "Settling your
  night first — try again in a moment". The quest strip in the background
  shows the quest struck through/at 10/10 because the harness's direct
  `claimQuestReward()` call ran against real client-side goal state — a
  harness artefact of testing the toast in isolation, not a defect.

### 9. Inventory and War Table (cross-lane check)
- `inventory-{1280x800,922x423}.png`: Bag grid, filters, equipment doll.
  Renders cleanly; the mid-word equipment label break at 1280 noted above is
  the only pre-existing issue, unchanged by this set.
- `combat-{1280x800,922x423}.png`: War Table (Bounty, Boss of the Day,
  Weekly Boss, Dungeon, Clan Raid, monster grid). Clean at both sizes, no
  overlap from any of the four lanes' CSS changes.

## Harness artefacts (not bugs)

- Every shot renders in fallback system fonts and shows "Signed out /
  reconnecting" — the sandbox cannot reach Google Fonts or Supabase.
- The Home "Daily reward" and "Your first day" onboarding cards are the
  MID_GAME fixture's natural state, not fed deliberately for this pass.
- `#btn-chat-mobile` measured a 0×0 rect because the "More" sheet it lives in
  was never opened this pass (see finding 5) — expected, not a miss.
- The quest strip shown struck-through in `settling-toast-*` reflects the
  harness's own direct `claimQuestReward()` call against local goal state,
  not a server round trip.

## Not captured

Everything the brief asked for was captured.
