# Hearthrise — Testing

> **One rule:** every bug we fix gets a test added in the same commit.
> If a bug came back after a "fix," the fix wasn't real — it just hid until conditions lined up again.

---

## How to run the tests

The record gate is the GitHub matrix (`.github/workflows/smoke.yml`, CLAUDE.md §3.3). Locally:

| Command | What it is |
|---|---|
| `node tools/lane-done.mjs` | the lane gate: ratchets, client guards, the replay guards your diff touches (CLAUDE.md §4) |
| `node tests/run-smoke.mjs` | the node guard suite: server, engine, economy, catalogue, asset, secret and edge-payload checks |
| `node tests/client-boot.mjs` | boots the client in headless Chromium |
| `node tests/hunt-core/<module>.mjs`, `tests/session-core.mjs`, `tests/envelope-contract.mjs` | module tests for the hunt engine, character sessions and the envelope |
| `node tests/schema-drift.mjs` | replays the migration chain (byte-identical second apply) |
| `node tests/run-ci-local.mjs` | reproduces a GitHub red locally; never a gate |
| `node tests/core-loop.mjs` | the nightly loop against the real edge verbs |

The in-browser suite (`src/features/smoke-test.js`, `Ctrl+Shift+T`) was deleted with the old client on 2026-10-17.

---

## When a test fails

1. **Read the failure reason** — the ✗ line names the assertion that broke.
2. **Don't disable the test** — the test is the contract. If the contract changed, update the test in the same commit as the behaviour change.
3. **Don't ship while a test fails.** A guard is never loosened, skipped or deleted to get green (CLAUDE.md §2); the one exception is Tyler's 2026-10-19 test-only push while the game is closed (CLAUDE.md §3.3).

---

## When to add a new test

> **Whenever you fix a bug OR ship a new feature. No exceptions.**

Two trigger conditions:

**1. Bug fixes** — every fix gets a regression test in the same commit. The test should fail without the fix and pass with it. That's how we know the fix is real instead of "the symptom went away on this branch but the underlying mechanism is still broken."

**2. New features** — every new feature gets at least one happy-path E2E test in the same commit it ships. The test exercises the feature the way a player would: send the intent, read the envelope the server returns, verify the state changed. Anything touching combat, death, hunt sessions, stamina or supplies also gets a test with the browser closed (the hunt keeps running on the server).

The "extra time" rule: budget 10–20% of every feature's build time for its tests. A 2-hour feature gets ~15 min of test work. A full-day feature gets ~1 hour. Tests written *during* the feature take a fraction of the time of tests written later (you already have the API surface and edge cases in your head). Tests written *after* a regression are always the most expensive — you're rebuilding context plus paying interest on the bug.

Put the test in the owning module's test file under `tests/` (e.g. `tests/hunt-core/<module>.mjs`) and register any new file in `.github/workflows/smoke.yml`. A standing guard also carries a `--selftest` or `--mutate` proof that it goes red when the code it guards breaks.

### The fixture rule (named after four instances, 2026-08-30)

> **A fixture assembled from a base object — or hard-coding a value it does not
> own — tests the fixture, not the system.** Build every fixture from the
> producer's REAL output, and read every threshold from the catalogue that owns it.

The four instances that earned this a name, all found by security review or
mutation proof, none by the suite itself:

1. The (since retired) away-vs-live parity fixtures compared the two sides *with each other*, so
   an away-only condition planted on `fx.autoEat` moved both identically and
   stayed green — the blind spot that let a false "server only eats away" premise
   survive two weeks and nearly ship an item-destroying "fix" (b497).
2. The renown-faucet prune probe ran on rows younger than the prune's own 7-day
   floor, so "nothing was deleted" passed identically whether the rows were
   protected or not. A nothing-was-deleted assertion is evidence ONLY when
   something else WAS deleted in the same run.
3. The bounty-accept refusal fixture was built on a success base carrying
   `bounty_id` — a shape the server cannot emit — so the test passed while the
   entire refusal branch was dead code (b497 F7).
4. `intent-mismatch.mjs` hard-coded a goal target of 25, so a legitimate balance
   retune turned an unrelated guard red with a message pointing at the intent
   cache (fixed in b497 by reading the target from `hr_goal_rewards`).

---

## Living document

When the suite changes, this file should change with it.
