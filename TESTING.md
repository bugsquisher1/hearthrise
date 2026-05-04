# Hearthrise — Testing

> **One rule:** every bug we fix gets a test added in the same commit.
> If a bug came back after a "fix," the fix wasn't real — it just hid until conditions lined up again.

---

## TL;DR — how to run the tests

**In the browser, on the live site:**

1. Press `Ctrl+Shift+T`, OR click the floating 🧪 **Test** button (bottom-left of the screen).
2. An alert pops up with `X/Y passed, Z failed, N runtime errors`.
3. Open DevTools → Console for the per-test pass/fail log (✓ or ✗ with the failing assertion).

**In code (e.g. for automation):**

```js
const r = window.__smokeTest({ verbose: false });
// r = { total, passed, failed, runtimeErrors, results: [...], timestamp }
```

`results[i] = { name, status: 'PASS'|'FAIL', why?: 'reason' }`.

---

## What the suite covers

The suite lives at `src/features/smoke-test.js`. As of build 126 it has ~50 tests organised into five sections:

### 1. Boot + data integrity
- `G` is defined; `SKILLS_DEF`, `ITEMS`, `MONSTERS` populated
- ≥14 skills, ≥25 monsters, ≥80 items
- All critical DOM containers exist (`#top-gold`, `#panel-profile`, etc.)
- Companions data + state present

### 2. Icon + asset health
- `_skillIcon` is empty (emoji fallback — b122)
- No `_itemPath` or `_monsterIcon` entries point at unshipped folders (`icons3/`, `assets/raw-bundle/`)
- `_roomIcon` ≥6 entries, `_plotBuildingIcon` ≥3
- Shipped items resolve to `assets/icons-bundle/` paths

### 3. Renderers
- Each tab activates and its panel becomes `.active`
- `renderSkills`, `renderMonsterList`, `renderInvFancy`, `renderProfile`, `renderHouse`, `renderFarm` don't throw
- Smoke check for visual overlaps via `findUiOverlaps()`

### 4. Regression suite (b119–b125)
Each fixed bug has a guard so it can't silently come back:
- **b119** — `renderProfile` survives missing DOM nodes
- **b122** — `_skillIcon` stays empty + topbar avatar not a 404
- **b123** — feat-buttons are `display:grid` on mobile (the cascade-specificity fix)
- **b124** — `prof-toolbar` is `display:none` on mobile + SW kill-switch script in `<head>`
- **b125** — no references to legacy snapshot HTMLs in DOM
- **build-version** — every `?v=` cache-buster matches `HearthriseBuild.cache`
- **bug-report** — 🐛 button renders (Discord webhook configured)
- **service-worker** — registered when served over https
- **cloud-config** — `HearthriseSupabase` has a real URL + JWT anon key

### 5. Interactive coverage — clicks every button + simulates player actions
**Click coverage:**
- Every bottom-nav tab activates its panel
- Every sidebar nav item activates its panel
- Topbar Quests/Bell/Save/Settings buttons fire
- Profile feat-buttons (Achievements / Bestiary / Last Session / Lifetime Stats)
- All 6 combat tier chips
- Combat monster row click → preview modal
- Skill rows + activity tiles
- Inventory sub-tabs
- House tabs + the upgrade button
- Farm plot tiles
- Bounty rows
- Stable companion cards
- Market search + sort buttons
- Bug-report 🐛 button opens modal
- Settings tabs

**Player-action E2E:**
- Gain XP from a skill tick (mining → copper_rock)
- Equip + unequip a weapon (bronze_sword)
- Start + stop combat (slime)
- Cook a fish
- Plant + harvest a farm plot
- Upgrade a house room
- Create + cancel a market listing
- Purchase a market listing
- Claim a daily quest
- Save + reload localStorage round-trip
- Smelt a copper bar (artisan loop)
- Equip + unequip a companion
- Join + leave a clan

**Every player-action test snapshots `G` at the start and restores it at the end.** The suite is idempotent — running it 100x in a row should not change the player's save by even a gold piece.

---

## When to run

| Trigger | Frequency |
|---|---|
| Before pushing any change to `src/legacy.js`, `src/styles/*.css`, or `index.html` | **Always.** |
| After any commit that touches a render path | Always. |
| Casually — once a day during active development | Strongly recommended. |
| In CI on every push | TODO (see "Future: GitHub Action" below). |

If you ship a change that isn't in CI yet, run the suite manually on the live deploy after it propagates.

---

## When a test fails

1. **Read the failure reason** — the alert / console line tells you exactly what assertion broke. It will name the file and method involved.
2. **Don't disable the test** — the test is the contract. If the contract changed, update the test in the same commit as the behaviour change. (b126 is named after exactly this lesson — two stale tests stayed `FAIL` because behaviour was changed in b122/b125 without updating the assertions.)
3. **Don't ship while a test fails.** If a test fails and you push anyway, you're saying "I know this bug is here; I'm choosing to ship it." That's fine occasionally but should be a deliberate decision, not an accident.

---

## When to add a new test

> **Whenever you fix a bug OR ship a new feature. No exceptions.**

Two trigger conditions:

**1. Bug fixes** — every fix gets a regression test in the same commit. The test should fail without the fix and pass with it. That's how we know the fix is real instead of "the symptom went away on this branch but the underlying mechanism is still broken." Section 4 of the suite (the b119–b125 regression block) is the model.

**2. New features** — every new feature gets at least one happy-path E2E test in the same commit it ships. The test exercises the feature the way a player would: open the panel, click the button, verify the state changed. Section 5 of the suite (player actions: mining, equip, combat, farm, market, etc.) is the model.

The "extra time" rule: budget 10–20% of every feature's build time for its tests. A 2-hour feature gets ~15 min of test work. A full-day feature gets ~1 hour. Tests written *during* the feature take a fraction of the time of tests written later (you already have the API surface and edge cases in your head). Tests written *after* a regression are always the most expensive — you're rebuilding context plus paying interest on the bug.

The pattern:

```js
// b<N>: <one-line summary of what broke + why>
() => tryRun('b<N>: <short test name>', () => {
  // Arrange: set up the conditions the bug needed
  const snap = snapshotG();
  try {
    // Act: trigger the path that used to crash
    window.someFunctionThatBroke();
    // Assert: the bug is gone
    assert(<the property that should hold>, 'human-readable failure reason');
  } finally { restoreG(snap); }
}),
```

Add it to the `TESTS` array in `src/features/smoke-test.js`, near the section that fits (regression suite, click coverage, or player actions).

---

## Future: GitHub Action

Right now the suite runs in-browser. The next step is running it in headless Chrome on every push to `main`, so a regression can never reach the live site silently.

Sketch of what we'd add:

```yaml
# .github/workflows/smoke-test.yml
name: Smoke Test
on: [push]
jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npx playwright install chromium
      - run: npx http-server . -p 8080 &
      - run: |
          npx playwright test -e "
            const { chromium } = require('playwright');
            (async () => {
              const b = await chromium.launch();
              const p = await b.newPage();
              await p.goto('http://localhost:8080');
              await p.waitForFunction(() => window.__smokeTest);
              const r = await p.evaluate(() => window.__smokeTest({verbose:false}));
              console.log(JSON.stringify(r, null, 2));
              process.exit(r.failed > 0 ? 1 : 0);
              await b.close();
            })();
          "
```

~30 minutes of work. Worth it once the suite is stable for a week.

---

## Living document

When the suite changes, this file should change with it. Keeping the suite + this README in sync is part of the test discipline.
