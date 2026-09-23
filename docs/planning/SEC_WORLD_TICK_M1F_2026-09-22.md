# Security review — world tick M1f, the envelope→engine map as a MONEY SURFACE

**Reviewer:** security-engineer (veto) · **Branch reviewed:** `lane/world-tick-m1f` @ `82606827`
(one commit on `next` @ `7b762924`) · **Review branch:** `sec/world-tick-m1f` ·
**Date:** 2026-09-22/23 UTC · **Payload:** `hr-accrue` `c6d03077166838179c8841657b9bb8438c98111635c131222565e75eb09b1ad7`
**Prior verdicts:** `SEC_WORLD_TICK_GATHER_2026-09-19.md`, `SEC_WORLD_TICK_M1_2026-09-21.md`

**EDGE DEPLOY at c6d03077: GO-WITH-CHANGES**

**SHADOW PARITY CLOCK RESTART: GO**

The paying path does not move. I diffed it mechanically rather than by reading: for all **25**
engine inputs `engineInputsFromEnvelope` now produces, at **both** paying call sites
(`index.ts` = `accrue`, `set-activity.js` = `collect`, and through it `equip` and `enchant`),
the expression is **byte-identical** to the one at `7b762924` after resolving the locals the old
sites used — **0 mismatches, 0 keys dropped, 0 keys added**. The one change that lands is the one
the lane exists for: the tick now reads the envelope at the level the accrue path reads it.

One change must land before the deploy (**F2**, `ci-shape` is red on the lane head and does not
touch the payload), and one thing beyond `shadow_accrued_to` must be reset before the 48 h read
(**F1**, proven by repro). **No production writes and no production reads were made.** Every arm
below ran against a PGlite database rebuilt from `supabase/migrations` in
`tests/schema-apply-order.json` order, on synthetic uuids.

---

## 1. Findings

| # | Sev | Title | Status | Where |
|---|---|---|---|---|
| **F1** | **P1 — required before the restart** | Resetting `shadow_accrued_to` does not replace the poisoned rows; it lands corrected rows **beside** them, on overlapping windows | **CONFIRMED by repro** | `2026-09-21-world-tick-settle-fence.sql:461-475` |
| **F2** | **P2 — required before the deploy** | `ci-shape` is RED on the lane head: the two new guard commands are in `smoke.yml` but not in `ci-shape.baseline.json`, so deleting the guard that protects this fix would be silent | **CONFIRMED (exit 1 lane / exit 0 base)** | `tests/ci-shape.baseline.json` |
| **F3** | P2 — before M3 arms | The lane kills the instance, not the class: nothing pins the **level** of the 21 non-gather fields against a real `hr_state_of` envelope | **CONFIRMED (coverage read + execution)** | `tests/world-tick-hydration.mjs` H2e |
| **F4** | P2 — before M3 arms | A production combat tick now receives 9 inputs the old tick never passed. Correct direction, but no guard measures it: the parity fixtures cannot see them | **CONFIRMED (base-vs-lane output identical)** | `tick-shadow.js:133` |
| I-1 | Info | `--mutate` is strictly stronger than the shipped defect (it also zeroes hp/gold/auto-eat). It still bites for the right reason | Accepted | `world-tick-hydration.mjs:110-137` |
| I-2 | Info | `collectCurrentWindow`'s `st` parameter is now redundant with `env.state`; all three callers pass the same object | Accepted | `set-activity.js:704` |
| I-3 | Info | `world-tick-parity` prints P4 decomposition drift (−5.6 %) under the heading "P-G9 caller parity … pay identically". P-G9 is a strict byte-identical `eq()`; the number is not a caller tolerance | Reporting nit | `world-tick-parity.mjs:1062-1064` |

### What is CLOSED by this commit

* The shipped defect. `tick.js:508` now passes `env`, not `st`, and the field list is one function.
* The **second reader**. I swept the payload for any remaining hand-rolled envelope read:
  `enchant.js:259` (`env.enchant`) and `equip.js:294` (`env.equipment`) are the only others and
  both read the **correct** level. There is no sibling instance of this defect left in `hr-accrue`.
* **AWAY-12.** `computeAccrual` is called from exactly three places — `index.ts`,
  `set-activity.js`, `tick-shadow.js` — and all three are now fed from the one map.

---

## 2. Question 1 — BEHAVIOUR PRESERVATION on the paying path

**Method.** Not a read. I stripped comments and string literals from `index.ts` and
`set-activity.js` at `7b762924` and at `82606827`, extracted the depth-1 `key: <expr>` pairs of
each `computeAccrual({…})` literal, resolved the locals the old sites used
(`const accruedToMs`, `const skills` loop body, `const equipment`), normalised the envelope
identifier (`env` at the call sites → `e` in `envelope.js`), and compared expression text.

**Result — 25 keys, both paying call sites, zero mismatches.**

```
key                    accrue(index.ts) collect(set-activity)
accruedToMs            same       same      inventory              same       same
activeSinceMs          same       same      enchant                same       same
activeKind             same       same      buffs                  same       same
activeId               same       same      autoEatEnabled         same       same
combatXpAccruedToMs    same       same      autoEatFood            same       same
hp                     same       same      autoEatPct             same       same
maxHp                  same       same      toolCarry              same       same
gold                   same       same      ammoCarry              same       same
skills                 same       same      fight                  same       same
equipment              same       same      recoveringUntilMs      same       same
consecFalls            same       same      deathsTodayBefore      same       same
deathsLifetimeBefore   same       same      hearthfindReady        same       same
combatStyle            same       same

accrue(index.ts):      keys DROPPED: []   keys ADDED: []
collect(set-activity): keys DROPPED: []   keys ADDED: []
TOTAL KEYS COMPARED: 25   MISMATCHES: 0
```

**No default changed.** Every presence-of-key switch survives with its exact idiom:
`buffs` as `('buffs' in e) ? e.buffs : null`, `recoveringUntilMs` and `consecFalls` as
`('…' in st) ? … : null`, `toolCarry`/`ammoCarry`/`fight`/`combatStyle` as `?? null`,
`enchant`/`equipment`/`inventory` as `|| {}`, `autoEatEnabled`/`hearthfindReady` as `=== true`.
The distinction between `?? null` (no column) and `|| {}` (read-only input) is preserved
key for key — which is the distinction that decides whether the engine emits a delta key and
therefore whether `hr_apply` answers `unknown_delta_key` and costs a player their night.

**The spread cannot be shadowed.** `ENGINE_INPUT_KEYS` (25, frozen) and the keys the function
actually returns are set-equal, checked mechanically (`produced but NOT declared: []`,
`declared but NOT produced: []`). At both call sites the explicit keys around the spread are
disjoint from that set, so spread position changes nothing.

**`collectCurrentWindow`'s three callers.** `set-activity.js:482`, `equip.js:211` and
`enchant.js:182` each pass `env` = `read.state` and `st` = `env.state`, so
`envelope.js`'s `const st = e.state || {}` resolves to the identical object the old code used.
`equip` and `enchant` reach the engine only through this function, so they are covered by the
`collect` column above and need no separate diff.

**Not-envelope inputs are untouched.** `seed`, `perks`, `unlockedRecipes`, `attended`,
`bestiaryKills`, `capMs`, `actionBudget`, `companionXpBacked`, `caller`, `callerAuthority`, the
four catalogues, `userId`, `slot`, `nowMs` are all still named at each call site, unchanged.

---

## 3. Question 2 — does any field now come from the request body or `client_state`?

**No.** Three independent checks:

1. **`envelope.js` is pure.** Its only import is `./intents.js` (the refusal taxonomy, unrelated
   to the engine-input half). The engine-input half contains no `Deno`, `fetch`, `globalThis`,
   `process.`, `Date.now()` or `Math.random` — its argument is the envelope and nothing else.
2. **`client_state` is a sibling, never read.** `hr_state_of` emits `'client_state'` as its own
   top-level key (`2026-09-14-hr-state-of-restatement.sql:607-609`), built by `jsonb_build_object`
   with distinct literal keys — it is **not** merged into the top level. `envelope.js` reads only
   `e.skills`, `e.inventory`, `e.equipment`, `e.enchant`, `e.buffs` and `e.state.*`. The
   player-writable bag is never one of them.
3. **Measured, not asserted.** Against a real envelope the names `envelope.js` reads off
   `env.state` and the names it reads off the top level are **disjoint** — `name exists on BOTH
   levels (ambiguous): none`. There is no key today that could silently resolve to the wrong
   level, and no client-writable column among the 20 `state` columns it reads.

`tick.js:450-461` reads state with `hr_state_of` in its own statement; H3 drives `runTick` with a
hostile roster entry carrying a forged `skills`, `inventory`, `equipment`, `cap_ms`, `version`,
`accrued_to` and `active_kind`, and nothing reaches the engine. `edge-tick-gate` exit 0 —
"reads nothing but selectors from the body".

---

## 4. Question 3 — is the tick's session the accrue path's session? Does the guard prove it?

**Yes to the first, and yes with a named limit to the second.**

`tests/world-tick-hydration.mjs` boots the repo's own migration chain in PGlite, writes a probe at
Mining 61 (302 288 xp — the *first* xp at level 61, i.e. the narrowest margin over the level-60
gate) on `mithril_rock` with a Mithril Pickaxe in the bag, and reads a **real `hr_state_of`
envelope**. It is not a hand-written fixture; H2a asserts the projection's own two-level shape
(`env.skills[mining].xp === 302288` **and** `env.state.mining === undefined`) before it measures
anything, so the file fails loudly rather than silently if a later restatement moves the level.

H2c/H2d then feed **that** envelope to both callers over the same window with the same seed and
assert equal actions and equal yield. `runTick` (H1) fires against the real `hr_tick_settle` and
journals `would_ticks > 0` with **no** `activity` key.

**The `--mutate` contract is sound.** It patches a **copy** under `mkdtemp` (never the tracked
file — S-UM-1 from the 2026-09-20 review is honoured), `exit 2`s if the marker is gone, names
seven arms that MUST go red, and `exit 1`s if any stayed green. Run:

```
world-tick-hydration --mutate: green — restoring `sessionFromRoster(row, env.state)` turns
H1b, H1c, H1d, H2c, H2d, H2e, H4a red (8 arms red in total). The guard bites.
```

**F3 — the limit.** H2e's completeness check covers `skills`, `inventory`, `hp`, `activeId`, and
H2c/H2d are a **gather** behavioural comparison. The other 21 fields are unasserted against a real
envelope. If a future `hr_state_of` restatement moved `enchant`, `buffs` or `combatStyle` between
levels, `envelope.js` would read `{}`/`null`, every guard would stay green, and this exact class of
defect would reappear on the combat channel. The instance is dead; the **class** is not pinned.

I wrote and ran the level assertion; it passes today. It is cheap and belongs in the guard:

```js
// against a REAL envelope: every name read off .state exists there, and vice versa
const stCols = [...body.matchAll(/\bst\.([a-z_]+)/g)].map(m => m[1]);   // + the `'x' in st` forms
const eProj  = [...body.matchAll(/\be\.([a-zA-Z]+)/g)].map(m => m[1]).filter(k => k !== 'state');
assert(stCols.filter(c => !Object.keys(env.state).includes(c)).length === 0);  // except ammo_carry
assert(eProj .filter(c => !Object.keys(env).includes(c)).length === 0);
assert(stCols.filter(c => Object.keys(env).includes(c)).length === 0);         // no ambiguous name
```

Measured result — every read is at a level that exists, with **one** exception:

```
read off .state but NOT present there: [ 'ammo_carry' ]
read off TOP   but NOT present there: none
name exists on BOTH levels (ambiguous): none
```

`ammo_carry` is **correct**: `player_state.ammo_carry` does not exist yet, the code says so, and
the probe confirms it resolves to `null` — the designed self-configuring switch, not a defect.
The guard must therefore allow a declared not-yet-migrated column rather than assert emptiness.

---

## 5. Question 4 — combat inputs and what M3 inherits

**`tick-shadow.js` no longer reads any level itself.** `char` is the flat session
`sessionFromRoster` built, and the thirteen hand-written names are replaced by
`...engineStateOf(char)`, which forwards exactly `ENGINE_STATE_KEYS`. The spread sits between
`seed` and `bestiaryKills`; every key before it (`userId`, `slot`, `nowMs`, `accruedToMs`,
`activeSinceMs`, `activeKind`, `activeId`, `capMs`, `seed`) and after it (`bestiaryKills`,
`items`, `monsters`, `nodes`, `perks`, `caller`, `callerAuthority`) is disjoint from that list, so
nothing is shadowed in either direction. The pointer keys are deliberately named apart, and
`sessionFromRoster` overrides them from the **roster row** after the spread — the fence's mark,
not `state.accrued_to`, which is the §15c overlapping-window defence.

**Two dropped keys are inert, and I verified both rather than taking the comment's word:**

* `goals` — **not an input to `computeAccrual`**. The engine builds its own counter
  (`makeGoalCounter()`, `accrual.js:1759/3232/3593`); there is no `inp.goals` read anywhere.
* `perks` — was `st.perks` off `env.state`, where perks have never lived, so it was already
  `undefined`. It is still `undefined`. The tick prices without perk bonuses — **under**-paying,
  correctly named in the commit rather than silently fixed. `hr_perks_of` is M3's to wire.

**`engineStateOf` preserves absence, and that is load-bearing.** It forwards only keys the
character actually holds, so an offline fixture that never had a column still reads as "no
column". I proved the consequence: `tests/world-tick-parity.mjs` output at `7b762924` and at
`82606827` is **byte-identical** across every combat and gather fixture. There is also no
presence-of-key semantics inside the engine (no `'x' in input` / `Object.keys(inp)` anywhere in
`accrual.js`), and `buffQueueFromServer(undefined)` returns `[]` exactly as `null` does — so
omitting a key and passing `undefined` are indistinguishable to `computeAccrual`.

**F4 — what that identical output also means.** The fixtures do not hold `enchant`,
`combatStyle`, the auto-eat trio, `hearthfindReady`, the death anchors or `combatXpAccruedToMs`,
so they **cannot see** the change. A *production* envelope holds all of them, so a production
combat tick now receives nine inputs the old tick never passed. The direction is right — it is
what the accrue path has always received, and a tick that priced an away fight without auto-eat
or without the player's combat style is the class of defect the styled-grant P0 came from. But for M1f nothing
measures it, because M1f's shadow cohort is **gather**, which reads none of them.

For M1f this is **no risk**: shadow writes no player value (`e15` asserts gold, version and
`accrued_to` unmoved), and gather ignores all nine. **Before M3 arms**, the combat channel needs
the H2 comparison run from a real envelope on a combat pointer — one more probe character in the
same file, not a new guard.

---

## 6. Question 5 — gates, with exit codes I saw

Run in a clean checkout of `82606827`, `npm install --no-audit --no-fund`:

| gate | exit |
|---|---|
| `node tests/world-tick-hydration.mjs` | **0** |
| `node tests/world-tick-hydration.mjs --mutate` | **0** (7 named arms red — the guard bites) |
| `node tests/world-tick-parity.mjs` | **0** |
| `node tests/delta-transport.mjs` | **0** |
| `node tests/delta-transport.mjs --selftest` | **0** — "Every mutation caught." |
| `node tests/accrual-engine.mjs` | **0** |
| `node tests/edge-tick-gate.mjs` | **0** |
| `node tests/world-tick-shadow-chain.mjs` | **0** |
| `node tests/world-tick-writer-authz.mjs` | **0** |
| `node tools/pack-edge.mjs hr-accrue --check` | **0** |
| `node tools/pack-edge.mjs hr-accrue --hash` | **0** — `c6d03077…b09b1ad7`, **matches the brief** |
| `node tests/ci-shape.mjs` | **1 — RED (F2)** |
| `node tools/lane-done.mjs` | **1 — "1 guard(s) red — the lane is not done."** |

Every other `lane-done` ratchet is green (23 of 24). The single red is `ci-shape`.

### F2 — `ci-shape` is red, and it is this lane's

```
CI-SHAPE-6  "node tests/world-tick-hydration.mjs" (job "db-replay-2") is not in
            tests/ci-shape.baseline.json.
CI-SHAPE-6  "node tests/world-tick-hydration.mjs --mutate" (job "db-replay-2") is not in
            tests/ci-shape.baseline.json.
```

`node tests/ci-shape.mjs` exits **1** at `82606827` and **0** at `7b762924`. The commit registered
the new guard in `smoke.yml` (correct, per §5) but did not register it in the baseline, so the
guard that exists to stop this defect recurring is **not pinned against deletion** — a later edit
that removes those two steps from `smoke.yml` would be silent. This is the §4 debt the lane owes
where the code was written.

**Required change (before the deploy):** `node tests/ci-shape.mjs --write`, commit the baseline,
re-run `node tools/lane-done.mjs` to a green last line. It is a `tests/` file: it is **not** in the
edge payload, so it cannot change `c6d03077`. That is why this is GO-WITH-CHANGES and not BLOCK —
it costs one command and no re-verification of the deploy.

---

## 7. The restart — F1, and what else must be reset

The plan is `hr_tick_ownership.shadow_accrued_to = null` for the cohort, then restart the 48 h
read. **That is necessary and not sufficient.**

I first suspected the corrected windows would collide on `hr_tick_shadow_intent_uidx`
(`tickIntentId` is a deterministic sha1 over `shard:user:slot:from:to:version`, and the insert is
`on conflict (user_id, slot, intent_id) do nothing`) and be silently dropped. **I tested it
instead of asserting it, and that is not what happens** — the window *end* is the engine's
settled watermark, which differs once the character can actually mine, so the intent id differs
and the corrected row lands.

**What does happen is worse than harmless.** Repro: seed the Mining-61 probe, fire once with the
**defective** hydration, reset `shadow_accrued_to = null`, fire again with the **fixed** code:

```
after fire 1: 1 shadow row(s)
   intent 13aed066…  ticks=0 qty=0  window 00:13:24.967Z -> 00:13:44.967Z

>>> THE PLANNED RESET: hr_tick_ownership.shadow_accrued_to = null

after fire 2: 2 shadow row(s)
   intent 13aed066…  ticks=0 qty=0  window 00:13:24.967Z -> 00:13:44.967Z      <-- POISONED, still there
   intent ff4b8e51…  ticks=8 qty=8  window 00:13:24.967Z -> 00:14:46.887Z      <-- corrected
```

The poisoned row is **not replaced**. It sits beside the corrected one, sharing `window_from` and
**overlapping** it. A 48 h parity read that groups or sums over `hr_tick_shadow` will
double-count the overlapped span and average real windows against `would_ticks = 0` rows —
i.e. it will report a parity failure that is an artefact of the defect it is supposed to be
measuring the fix for. The 14-day retention (`hr_tick_shadow_prune`) will not clear them for two
weeks, and the poisoned rows are inside any 48 h window starting today.

**Required, in this order:**

1. Deploy `c6d03077` and verify the live `payload_sha256` equals it **first** — a reset against
   the old payload re-measures the defect.
2. `delete from public.hr_tick_shadow where user_id = <cohort> and channel = 'gather' and at < <deploy_ts>;`
   Deletion is safe: `restore-census.baseline.json` classifies this table `operational` +
   `player_value_exempt` — "losing every row of it costs a measurement, not a progression"
   (`2026-09-21-world-tick-settle-fence.sql:262-265`). Fencing every parity read on
   `at >= <deploy_ts>` is an acceptable alternative, but it must then be every read, forever.
3. Then `update public.hr_tick_ownership set shadow_accrued_to = null …` for the cohort.
4. Restart the 48 h clock.

**Nothing else needs resetting.** `player_state` is untouched by a shadow settle (`e15`);
`hr_tick_config.enabled/shadow` are unchanged by this commit; the lease columns are re-taken on
the next fire; `hr_rejections` holds nothing from this defect — the defective run did not refuse,
it *succeeded* at pricing the character at level 0, which is precisely why it was invisible for
four days and why `would_ticks = 0` had to be read as a number rather than as an error.

---

## 8. Residual risks I am accepting

* **F3/F4** — the level of 21 fields, and the combat channel's inputs from a real envelope, are
  unguarded. Bounded today because the cohort is gather-only and shadow writes nothing.
  **These become blocking before M3 arms**, not before this deploy.
* **`perks` is absent from every tick window.** Under-paying, deliberate, named. It must be closed
  before the tick is armed, or an armed tick will pay less than the accrue path for the same
  window and the parity read will show it as a real divergence.
* **`lane/world-tick-m1f` is behind `next`** (`next` is at `372cf67`, b551). This review is of
  `82606827` as briefed. The Coordinator merges `next` into the lane before integration; if that
  merge touches any of the nine files, the 25-key diff above must be re-run — it is scripted and
  takes under a minute.
* I did not review `hr_state_of`'s own body, the cron driver, or the M3 combat channel. This
  review is the envelope→engine map and the five files that changed.
