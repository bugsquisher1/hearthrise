# Client-prediction retirement map

Written 2026-09-16 by the systems-engineer lane, against the decision in
`docs/planning/LIVE_WORLD_BRIEF.md` (Tyler, 2026-09-16): Hearthrise moves to a server world
tick plus a push channel; the client becomes a window that applies pushed envelopes and
predicts nothing; accrual-on-return becomes reconnect catch-up. From that date no new
client-prediction or reconciliation code is written.

This document is the map for the retirement, the client-side half of the delta contract the
tick service must honour, and the standing guard that keeps the surface from growing while the
tick is built. It designs no server.

Every line count below was measured on this tree (build b545) by classifying top-level
declarations into line spans — not estimated. The spans are stated so the next reader can
re-measure them.

---

## 1. Retirement map

### 1.1 The four buckets

| Bucket | Meaning under the tick |
|---|---|
| **PREDICT** | Display-only client optimism and the machinery that exists to undo it. **Retires** as each channel's push lands. |
| **APPLY** | Turns a server statement into `G`. **Keeps** — this is the code that will apply a pushed delta. It is the asset, not the debt. |
| **TRANSPORT** | Endpoint, token, classification, backoff, cadence, lifecycle. **Keeps**, re-pointed from fetch to socket. |
| **PRESENT** | Receipts, sheets, copy. **Keeps** — unchanged by where state comes from. |
| **RESIDUE** | The client-only preference allowlist. **Keeps** (CLAUDE.md §6). |

### 1.2 `src/net/accrue.js` — 5,795 lines

| Bucket | Lines | Span(s) | What it is |
|---|---|---|---|
| header | 110 | 1–110 | the file's contract prose |
| TRANSPORT | **973** | 111–155, 180–543, 544–640, 5138–5511, 5703–5795 | config, slot resolution, request build, response classification, accrual gate + backoff, `requestAccrual`, `settle()` funnel, the 90 s settle loop (`SETTLE_INTERVAL_MS`), keepalive/unload/visibility triggers, `beginServerAccrual` |
| PREDICT | **1,273** | 156–179, 641–764, 765–894, 895–1889 | `mayClientWrite`, the replacement-loss gate (`describeReplacement`), the server-bag mirror + gate readers (`serverItemCount`, `gateItemCount`, `unaccountedEquipped`, `equippedCount`, `consumedKeysOf`), the whole inventory ARM/ABSOLUTE apparatus (`isEnvelopeAbsolute`, `maybeAutoArm`, `INVENTORY_ARM_FLAG_KEY`, `fetchServerArmPermission`), envelope-drift accounting and the flip-drift reporter, and the client-clock fall/knockout timers (`fallReaskTick`, `fallCeilingTick`, `fallState`) |
| APPLY | **2,571** | 1890–4460 | the 19 `reconcile*` functions, `applyEnvelopeState` (571 lines), auto-eat observation, `reconcileInventory` (333), `applyEnvelope` |
| PRESENT | **868** | 4461–5137, 5512–5702 | `summaryFromAway`, the receipt classifier and sentence builders, the halted/replacement sheets |

**Reading:** the brief calls this file "replaced". Measured, only 22% of it is prediction. The
2,571-line APPLY block is precisely the delta applier the push channel needs, and it survives
the cutover almost intact (see §2 for the three changes it does need).

### 1.3 `src/net/predict.js` — 576 lines, 100% PREDICT

The display-prediction scratch bag (`G._pred`), its coverage-boundary retirement rule, and the
`predictXp` / `predictBalance` / `predictedXpMap` API. Four consumers: `main.js` (bare import),
`balance.js`, `record.js`, `skill-record.js`, plus `legacy.js` through `window.HearthrisePredict`.
Retires whole when combat + gather push at tick cadence: its entire reason for existing is that
"the server settles a LAGGING window" (its own header), which a 10 s tick removes.

### 1.4 `src/net/record.js` — 1,926 lines

| Bucket | Lines | Span(s) | What it is |
|---|---|---|---|
| header | 126 | 1–126 | |
| PREDICT | **773** | 127–899 | the `SERVER_OF_RECORD` registry, the b347 fingerprint machinery (`fingerprintSkills/Balance/Equipment/Rooms/RestedAt`), the per-field arm switches, `clientMayWrite`, `stripServerOfRecord` |
| APPLY | **542** | 900–1137, 1585–1888 | `applyRecord`, `recordValue`/`recordLastKnown` (the known/unknown read), the boot `settle` that applies the record and retires predictions |
| TRANSPORT | **485** | 1138–1584, 1889–1926 | endpoint/token, `buildLoadRequest`, outcome classification, boot-retry schedule, `requestRecord`, `beginRecordLoad` |

The fingerprint layer is prediction debt, not authority: it exists to answer "has anything other
than the server moved this field", a question a push channel answers by construction (the frame
replaces the field). It retires with `predict.js`, not before — `record.js` is the only thing
that retires predictions today (`coverageBoundary` → `retirePredictions`, lines 1051–1053).

### 1.5 `src/net/sync.js` — 1,804 lines

| Bucket | Lines | Span(s) | What it is |
|---|---|---|---|
| header | 112 | 1–112 | |
| TRANSPORT | **1,216** | 113–356, 357–445, 446–704, 705–864, 1341–1607, 1608–1804 | event allowlist/limiter/buffer + flush, save-health reporting, the auth gate (token status, refresh, backoff, clock-trust), write retry, the single-active-session claim + heartbeat, `setupSync` lifecycle |
| RESIDUE transport | **236** | 865–1100 | `buildSnapshotRequest`, `derivedSnapshotFields`, `snapshotIfDue` — uploads the residue bag |
| PREDICT-adjacent | **240** | 1101–1340 | `pullLatestDetailed`, `readRealmProjection`, `describeCloudSave`, `verifyCloudSave` — the cloud-vs-local reconcile that decides which save "wins". Under a tick there is no rival local save to reconcile; this shrinks to a connect-time read |

**Nothing in sync.js is deleted by the push channel.** The socket needs every one of the 1,216
transport lines: the same token holder, the same backoff shape, the same session claim (a second
tab must not hold a second socket).

### 1.6 `src/net/client-state.js` — 973 lines — RESIDUE, keep whole

`RESIDUE_FIELDS` (lines 109–409) is the client-only preference allowlist with a forbidden-field
detector and a 64 KB cap. CLAUDE.md §6 already forbids using it for anything a player would miss
after a reload. It is orthogonal to prediction and is out of the guard's scope.

### 1.7 `src/legacy.js` — the locally-computed, authoritative-looking numbers

Not a whole-file classification: the named functions that compute or hold a number a player
reads as truth. ~739 lines across 16 functions.

| Function | Lines | Bucket | Note |
|---|---|---|---|
| `combatTick` | 29 | PREDICT | drives `HearthriseCore.combatSim.simulateTick` from a browser timer — *the engine is not the problem; driving it from a client clock is* |
| `addXp` | 74 | PREDICT | routes to `hrPredictXp` for stamped skills |
| `hrPredictXp` / `hrSkillXpDisplay` / `skillXp` / `getLevel` / `hrDisplaySkills` | 92 | PREDICT | the display accessors (server truth + prediction) |
| `accrueRestedXp`, `tickPlayMs`, `applyGoldFind`/`goldFindMult` | 123 | PREDICT | client-clock accrual and multipliers for display |
| `finalizeBounty` | 162 | PREDICT | local bounty completion shown before the server's turn-in |
| `hrCreditCombatXpFlush`, `hrBountyCadenceCredit`, `hrKillCredit*` (4500–4605), `goldSettle*` (10454–10490), `creditServerAwayKills` | 259 | TRANSPORT (intent plumbing) | these are intents and receipts, not prediction — they stay and re-point |

### 1.8 Totals

| Bucket | Lines | Fate |
|---|---|---|
| PREDICT | **2,862** (accrue 1,273 + predict 576 + record 773 + legacy ~480 display-only, minus overlap counted once) | retires channel by channel |
| APPLY | **3,113** (accrue 2,571 + record 542) | keeps — becomes the delta applier |
| TRANSPORT | **2,933** (accrue 973 + record 485 + sync 1,216 + legacy 259) | keeps, re-pointed to the socket |
| PRESENT | **868** | keeps |
| RESIDUE | **1,209** (client-state 973 + sync 236) | keeps |

### 1.9 The "browser says X, server says Y" hotspots (2026-09-13/14 class)

| Hotspot | Where it lives | Mechanism | What the tick fixes |
|---|---|---|---|
| **Goblin Seal — card said "have 2", server said "no key"** | `src/net/accrue.js:797` `serverItemCount` / `:811` `gateItemCount` (the plaster), root in the attended kill's client-rolled drop + the merge-mode `Math.max` bag fold at `reconcileInventory` (4024–4356) | attended kills roll drops with the client's `Math.random` for display; the settle pays the server's seeded re-simulation; the one-way merge ratchet can never remove the client's key | with the tick rolling drops server-side there is no client roll to disagree with; `gateItemCount`'s dual-source read retires |
| **Phantom seeds** | same class; the gate reader is the same `gateItemCount`, the consumers are `src/dungeons.js` `keyHeld` and `legacy.js` `heldByServer`; the seed debit is server-owned in `src/net/farm-sync.js:303` | a client-displayed seed count that the server's `hr_farm_plant` refuses (`insufficient_seed`) | same: one source for the count |
| **The Depot's dormant fold** | `src/net/accrue.js:1965` `reconcileBank` + `lastBankFold` (1960–1964), and the bag side at `noteServerBagMove` (2013–2035) | the bank fold is absolute, the BAG fold is still merge in prod, so a confirmed deposit debits server-side and the client's bag never drops; the `'absent'` fold mode had to be invented so an unsent bank did not render as "empty" | a push frame always states both containers, so "absent" and "merge" both stop existing |

All three are the same defect: **two sources for one number, with a one-way merge between them.**
They are not bugs in `predict.js` (whose coverage rule is sound and does retire); they are in the
inventory/bank folds, which exist because the envelope is a lagging fetch rather than a push.

---

## 2. The envelope-delta contract, from the client side

What the tick service must honour so the client can apply a frame with **no merge logic**. This is
the client's requirement list, not a server design.

### 2.1 What `hr_state_of` already gives (measured on `supabase/migrations/2026-09-14-hr-state-of-restatement.sql`)

Root keys: `ok`, `version`, `now`, `buffs`, `place`, `dungeon_cooldowns`, `state` (22 flat
scalars including `gold`, `gems`, `marks`, `dungeon_scrip`, `hp`, `max_hp`, `bank_cap`,
`active_kind/id/since`, `accrued_to`, the watermarks, the auto-eat triple, `tool_carry`),
`skills`, `inventory`, `bank`, `equipment`, `enchant`, `workers`, `farm`, `progress`,
`progress_truncated`, `client_state`, `total_level`, `unlocked_recipes`, `gem_unlocks`,
`renown_high`, `bounty`, `hero_slots`, `traits`, `companions`, `inventory_complete`.

It is already **a whole-state projection with a version and a server `now`**, and it already
does the one thing that matters most: `buffs[].remaining_ms` is computed server-side against the
same `now()` the frame reports, so no client clock is an input.

### 2.2 The five rules a pushed frame must satisfy

1. **Presence = full replacement; absence = no statement.** A frame may carry any subset of the
   root keys, but any container it *does* carry is the complete value of that container. No
   patch language, no per-key deltas inside a container, no deep merge. This single rule is what
   deletes merge logic on the client: `reconcileBank`'s `'absent'`/`'absolute'` modes and
   `reconcileInventory`'s merge branch both collapse to an assignment.
   *Today's blocker:* the bag is still merge-mode in prod (`isEnvelopeAbsolute()` false,
   `hr:envelopeMerge` kill switch, `inventory_complete` marker). The tick must never emit a frame
   under merge semantics.
2. **Monotonic `version`, and the client drops stale frames.** Every frame carries the
   character's `version` and the client applies a frame only if `version > lastAppliedVersion`
   — out-of-order delivery and reconnect replay are then free.
   *Today's gap:* `applyEnvelope` parks `res.version` in `G._serverAccrual` (accrue.js:4430) and
   **nothing gates on it**. That gate is a prerequisite, not an optimisation.
3. **Every clock ships as an absolute instant AND a server-computed `remaining_ms`.** `buffs`
   already does. `dungeon_cooldowns` ships ISO only, so the client subtracts clocks for the
   countdown; that must be added before the countdown is a pushed surface.
4. **Whole-frame application, or none.** A frame is applied inside one function that either
   writes every carried container or writes nothing; a throw halfway must not leave `G` half
   from one frame and half from another. `applyEnvelopeState` already returns a `written`
   manifest — it needs the transaction boundary around it.
5. **Receipts ride beside state, never derived from it.** "What just happened" (`away.items`,
   `hearthfind`, level-ups, deaths) stays a separate, signed payload the client renders but never
   diffs out of two state snapshots. `summaryFromAway` already has this shape and keeps it.

Two things the client does **not** need and should not be given: a JSON-Patch dialect (it forces
merge logic back in), and per-field timestamps (the frame's `version` + `now` are sufficient).

### 2.3 Minimum change to accept a push instead of a fetch

The client already has exactly one funnel. `requestAccrual` (accrue.js:480) does
fetch → `classifyAccrueResponse` → `settle(verdict)` → `fire('onApplied')` → `applyEnvelope`.
The push path replaces only the first step.

1. **`src/net/accrue.js` — one new export, ~40 lines.**
   `deliverEnvelope(res, { source: 'push' })`: version-gate (rule 2), then call the existing
   `settle({ outcome: 'accrued', body: res })` path. No change to `applyEnvelope`,
   `applyEnvelopeState` or any `reconcile*`. The frame arrives as the same object shape the
   fetch returns, so the 2,571-line APPLY block is untouched.
2. **`src/net/sync.js` — one new export, ~120 lines.**
   `connectPush({ url, onFrame })` that (a) takes the token from the existing holder
   (`currentToken` / `withAuthHeaders`, lines 446–460, 643–654), (b) reuses `newAuthGate` /
   `decideAuthGate` / `nextAuthBackoffMs` for reconnect backoff rather than inventing a second
   one, (c) refuses to open while `pauseSync()` is set or the session claim was lost
   (lines 1495–1594) so a second tab cannot hold a second socket, and (d) on open, runs the
   existing `requestAccrual` once as catch-up and applies frames only after it answers.
3. **The settle loop becomes the fallback.** `SETTLE_INTERVAL_MS` (90 s) stays wired and fires
   only while the socket is down; `decideSettle` already takes the decision as a pure function,
   so this is one extra condition, not a rewrite.
4. **Nothing is deleted in the first step.** Prediction retires per channel behind the same flag
   that switches a channel to push — which is what makes the guard in §3 a ratchet rather than a
   deletion order.

---

## 3. The guard: `tests/no-new-prediction.mjs`

A ratchet over the prediction surface. It may fall; it may not grow.

| Rule | Asserts | Baseline (2026-09-16, b545) |
|---|---|---|
| PRED-1 | prediction / `*ForDisplay` call sites in `src/**` (suite excluded) | 35 |
| PRED-2 | the exact predicted-field set (`PREDICTED_BALANCE_FIELDS` + the `CLEARS` retirement map) | `gems, gold, skills` |
| PRED-3 | `predict.js` exported-symbol count | 19 |
| PRED-4 | the exact set of exported `reconcile*` functions in `src/net/**` | 26, listed in the file |
| PRED-5 | non-vacuity — the registry files were actually read and each census is plausibly populated |
| PRED-6 | `--selftest`: 8 controls, including a CLEAN arm (guard-hygiene R3) |

`src/core/**` is deliberately out of scope: those engines are dual-runtime and are the code the
tick will run. Driving them from a browser timer is prediction; the engines are not.

**Registration.** `tools/lane-done.mjs` takes a registry (`STEPS`), so the guard is registered
there, next to `tests/ci-shape.mjs`. It is **not** in `.github/workflows/smoke.yml` — this lane
was briefed not to edit the workflow, and `tests/ci-shape.baseline.json` pins its step list. Its
CI home is the `guards` job beside `tests/no-client-xp-mint.mjs`, as two steps:

```yaml
      - name: no new client prediction (ratchet)
        run: node tests/no-new-prediction.mjs
      - name: no new client prediction — mutation proof
        run: node tests/no-new-prediction.mjs --selftest
```

Until the Coordinator adds them, the file is listed in `tests/guards-unregistered.json` with that
reason, so `tests/guard-hygiene.mjs` stays green honestly rather than by omission.

---

## 4. Disagreements with the brief, with evidence

1. **"~7k lines of client prediction/mirror get retired" overstates it by roughly 2.5×.**
   Measured: `accrue.js` is 1,273 prediction lines out of 5,795 — the other 4,522 are the
   envelope applier (2,571), transport (973) and receipts (868), all of which the push channel
   still needs. `client-state.js` (973) is the residue allowlist and is KEEP by CLAUDE.md §6, not
   "replaced". The honest retirement figure is **~2,860 lines** (accrue 1,273 + predict.js 576 +
   record.js fingerprint layer 773 + ~480 display-only in legacy.js) — and none of it can be
   deleted before the channel it serves is pushed. This matters for scheduling: the tick does not
   buy back 7k lines on day one.
2. **The 2026-09-13/14 bug class does not live in `predict.js`.** The brief says "every 'browser
   says X, server says Y' bug of the last week lives here" and names `accrue.js`/`predict.js`/
   residue. Measured (§1.9), all three named incidents live in the **inventory and bank folds**
   (`reconcileInventory`'s merge branch, `reconcileBank`'s `'absent'` mode) plus the attended
   client-rolled drop in the combat loop. `predict.js`'s coverage rule is sound and retires
   correctly; deleting it would not have prevented any of the three. The tick fixes them by
   removing the second source, which is the brief's conclusion — but via a different file.
3. **Step 3 of the sequence ("push channel; retire predict.js") has a prerequisite the brief does
   not name: the inventory absolute flip.** A push frame under today's merge semantics would be
   applied by `reconcileInventory`'s `Math.max` ratchet and could still not remove an item — i.e.
   the Goblin Seal class survives the tick. The flip (`isEnvelopeAbsolute`, the `hr:envelopeMerge`
   kill switch) must land before or with the first pushed inventory frame.
4. **A whole-frame version gate is missing today — the pattern exists, but only for gold.**
   `isEnvelopeApplicable` requires `res.version` to be a finite number (accrue.js:286) and
   `applyEnvelope` parks it (4429), but nothing refuses an older frame. The one place that does
   is `src/net/gold.js:285` `lastVersion` / `:599` `if (env.version < lastVersion) return { stale: true … }`.
   With a 10 s tick and any reordering, applying every frame unconditionally is a state rewind on
   every other field. Lifting gold.js's rule to the envelope is a ~10-line change and belongs in
   step 1, not step 3.

---

## 5. Known limitations of this map

- The `legacy.js` numbers are a named-function measurement (16 functions, ~739 lines), not a
  whole-file classification; the monolith's render glue reads predicted values in many more
  places than it computes them, and those read sites are counted by the guard's PRED-1 census
  rather than by line.
- Bucket boundaries inside `accrue.js` are drawn at top-level declarations. A few functions
  straddle buckets (`applyEnvelopeState` observes the arm flags as well as applying state); they
  are counted once, in APPLY.
- No runtime measurement was taken for this lane: it is a static map plus a guard. The tick's
  parity gate (brief step 1) is where the runtime evidence belongs.
