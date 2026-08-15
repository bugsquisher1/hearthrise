# SUPPLY PROJECTION — "you have enough to do this for X hours"

**Status:** design proposal, Game Designer, 2026-08-14. Tyler makes the taste calls;
everything labelled **PROPOSAL** is a recommendation, not a decision.
**Scope:** design only. No `src/**` was touched writing this.

> "I think we just need a balance that allows people to afk fight but they need to do
> the preparation and calculation ahead of time. We can provide them with a calculator
> prior to entering combat to go afk. All skills and actions should have this ability."
> — Tyler, 2026-08-14

---

## 0 · The one-line design

**An idle player is not present to react, so every decision they have must be made
before the tab closes. The projection is that decision, made legible.** It answers one
question on every screen where a player commits time — *what runs out first, and when* —
and it answers it with the same numbers the server will pay.

The corollary, which is the whole reason this is a feature and not a tooltip: once the
projection exists, **preparation becomes the game.** Buying 400 arrows stops being
inventory management and becomes "that is my night bought." Raising the auto-eat
threshold stops being a settings slider and becomes "safer, and it costs me two hours."
That trade is already in the engine — see §7, it is measured — and today nothing shows it.

---

## 1 · What the game tells a player today (played, not read)

Local static server on :8000, Playwright through the `__HR_TEST_HARNESS__` seam
(localhost-only, the same one `tests/run-smoke.mjs` declares). Fresh save, b342.

**The new player, measured:** 500 gold · inventory `{turnip_seed:5, carrot_seed:3,
shrimp:8}` · `bronze_sword` equipped · `foodSlot: null` · `traits.auto_eat: false` ·
10/10 HP · combat level 3 · `offlineCapHours()` = 12 · `combatTickMs()` = 2400.

### 1a · The monster preview — the best screen in the game, and it stops one step short

Opening Slime (`window.openMobPreview('slime')`), verbatim:

```
FORECAST
DPS 0.8 · HIT CHANCE 72% · DAMAGE 1–4 · TIME TO KILL 10.6s
YOU LAST   ≈5 kills
THIS RUN   ≈61s · ≈25 XP
Away: not yet — land 100 kills for your Field Licence. 0 / 100.
```

This is already good. b341's rule — *a rate may only be quoted over a span the character
can survive* — is doing real work: the hourly pair is **suppressed** for a character who
dies in 61 seconds. And the Away line already **names a binding constraint** (the Field
Licence) rather than printing a number. That precedent is the design; this document
generalises it.

What it cannot do: `estimateSurvival()` computes `effectiveHp = playerHp + foodPool` and
divides by `incomingDps`. **Health and food are added into one number**, so "≈61s" cannot
distinguish *"buy food"* from *"buy armour"* — and those are opposite purchases. That is
the single biggest gap, and it is Tyler's point 2.

### 1b · The skill screens — the player is asked to do the division

Cooking, verbatim: `Cook Shrimp · 11 XP · 3.8s · Raw 8 · Burn risk: 25%`.
Crafting, verbatim: `Normal Plank · 3 XP · 3.8s · Normal 0`.

A stock count and a per-action time, never multiplied together. `Normal 0` does not say
that starting this activity does nothing at all.

### 1c · The 8-hour cook that lasted 31 seconds — measured end to end

Set `activeSkill='cooking'`, `skillTargetId='cook_shrimp'`, 8 shrimp in the bag, rewind
`lastSeen` and `offlineBudget.at` by 8h, wrap `notify`, call `processOffline()`:

| | |
|---|---|
| Recipe interval away (`offlineIntervalMs(rec.ms)`, activity set) | **3840 ms** (matches the 3.8s on screen) |
| Actions affordable (`8 shrimp ÷ 1`) | **8** |
| Run length | **30.7 seconds** |
| Absence requested | 28,800 seconds |
| Fraction of the night that produced anything | **0.107 %** |

Here is the part that makes this worse than "the game says nothing." **The game says it
exactly once, in a toast — and then immediately talks over itself.** All four toasts of
that run, captured in order by wrapping `notify`:

```
1  "📖 New discovery: Cooked Shrimp (1/457)"
2  "🎯 Quest: Cook 5 dishes"
3  "Out of Raw Shrimp — cooking stopped"                                  ← the truth
4  "⏰ Offline 8.0h at the base rate — +11 items, +80 XP · 1 burnt on the fire"
```

Line 3 is the only honest sentence on the screen, it is third in a stack of four, and
**line 4 — the one that lands last and reads as the summary — describes a full eight-hour
night.**

And `G.lastOfflineSummary`:

```json
{ "hrs": 8, "gainedItems": 11, "gainedXp": 80, "burnt": 1, "capped": false,
  "died": false, "diedAfterMs": 0, "diedTo": null, "licence": {...}, ... }
```

**Twenty-one fields, and not one of them can say "you ran out of shrimp after 31
seconds."** The away loop knows — `legacy.js:1342` is literally
`if(!hasInputs(rec)) break;   // out of materials` — and the only place that fact ever
lands is a toast. It never reaches the durable receipt, so every surface built on
`lastOfflineSummary` (the Home away card, the welcome-back modal, the dashboard line)
renders a 31-second night as an 8-hour one.

This is the *identical* failure b342 fixed for the declined-licence night, in its own
words: *"the only record of a declined night was a toast measured at ~8 seconds, rendered
behind two stacked modals. The player left a fight running overnight, came back, and the
game said nothing."* The same fix — a field on the receipt — was never applied to
supplies.

To actually fill a 12-hour cap on Cook Shrimp you need **11,250 shrimp**. No player will
ever guess that number. That is the feature, in one figure.

### 1d · Consumables that deplete do not exist yet

Eight arrow tiers ship as items with `slot:'ammo'` (`bronze_arrows` … `dawnpoint_arrows`).
Nothing consumes them: `/ammo/i` does not match `combatTick` or `simulateTick`, and a
fresh save's `G.equipped` has no ammo key. **Food is the only depleting consumable
today.** This design is therefore written to accept burn rates that do not exist yet
(§9), rather than to hardcode the one that does.

---

## 2 · Where the code lives, and who calls it

### 2.1 The honest version of "the same code the server runs"

The projection is **closed-form**; the accrual is **stochastic simulation**. They can
never be literally the same function, and a design that claims otherwise is the
"assertions that pass while asserting nothing" failure in a new costume.

What must be shared is everything that could *drift*:

| Shared artefact | Why it must be one copy |
|---|---|
| **`LIMITER`** — the vocabulary of "what ended it" | The projection names it, the simulation reports it, the away card prints it. Three readers, one enum, or the card eventually prints a reason the simulation never produces. |
| **The draw table** — per-action consumption | The simulation **decrements** from it; the projection **divides** by it. Two copies is how a hammer came to swing 26% faster asleep than awake (`combat-sim.js` header, omission 10). |
| **The rate terms** — `swingIntervalMs`, `incomingDps`, `actionMs` | Already in `src/core`. The projection must import them, never re-derive them. |
| **The projection function itself** | One file, imported by the client preview *and* by `hr-accrue`. |

And the binding is enforced by a test, not by a comment — see §10.

### 2.2 The file

**`src/core/supply.js`** — pure ESM, no DOM, no window, no timers, no `Math.random`.
Registered in `src/core/index.js` and in `CORE_MODULES` in `tests/core-purity.mjs`.

It follows **`src/core/licence.js`**, not `src/core/away.js`, and deliberately so.
`licence.js`'s header states the distinction and it is exactly right here:

> `away.js` answers "does this channel of POWER pay while away?"
> `licence.js` answers "is this activity ELIGIBLE TO ACCRUE at all?"

`supply.js` answers a third question — **"for how long, and what stops it?"** It is asked
by the CALLER, BEFORE the span runs, and its output is a statement, never a rate
multiplier. Like the licence, it must not become a `getBonus` channel: a duration folded
into a per-grant gate is invisible at the call site and indistinguishable from drift.

```
projectRun(state, ctx) -> {
  limiter,        // LIMITER.* — what binds first
  limiterId,      // 'shrimp' | 'iron_arrows' | null — the item, so copy can NAME it
  ms,             // the conservative floor (§6) — the number we print
  msMean,         // the expectation (detail surfaces / telemetry only)
  runner,         // the runner-up limiter, when it is close (§5.2)
  runnerMs,
  verdict,        // 'safe' | 'runs-dry' | 'risky' | 'fatal' | 'blocked' (§7)
  fix,            // the actionable term: {kind, id, qty} — "300 more Trout"
  limits: [ {limiter, limiterId, ms, exact:bool}, ... ]   // every limit, ranked
}
```

`limits` being a **ranked list rather than a scalar** is load-bearing. It is what lets
the preview print one line, the Stats modal print five rows, and the shop print "buy 300
more and *arrows* stop being the problem" — from one call, with no second model.

### 2.3 Who calls it

| Caller | Role | Status |
|---|---|---|
| Monster preview modal (`renderPreview`, `awayLineHtml`) | pre-flight | extend the existing line |
| Arena Stats modal (`combat-render.js` `awayRow`) | live | extend the existing row |
| Monster list rows (`renderMonsterList`) | the verdict badge (§7) | new |
| Skill / recipe rows | pre-flight | new |
| `hr-accrue/accrual.js` | **stores the promise** at activity start (§8.2) | new |
| Welcome-back / Home away card | **reconciles** promise vs outcome (§8) | new |

Note the accrual engine currently refuses everything but combat
(`if (inp.activeKind !== 'combat') return {reason: SKIP.UNSUPPORTED}`). Gathering and
artisan accrual are still client-side. **PROPOSAL:** ship `supply.js` client-first, in
`src/core` from day one, with its parity test running in plain Node — so Phase D/E
accrual imports it instead of growing a second copy under deadline.

---

## 3 · The limiter model

**PROPOSAL — the vocabulary.** Every activity in the game is bounded by exactly these,
and the projection's job is to say which one bites first.

```
LIMITER = {
  CAP:      'cap',        // your offline maximum — the good ending
  FOOD:     'food',       // the auto-eat pool empties
  AMMO:     'ammo',       // arrows / runes / whetstone (§9)
  INPUTS:   'inputs',     // an artisan recipe input
  DEATH:    'death',      // their damage outruns your health and food
  LICENCE:  'licence',    // Field Licence unearned — a precondition, not a duration
  UNARMED:  'unarmed',    // no auto-eat trait, or nothing in the food slot
  STORAGE:  'storage',    // the bag fills (§3.2 — not enforced today)
  NONE:     'none',       // nothing here runs out
}
```

**Unknown limiter defaults to NOT binding.** This is the same safe-direction rule
`AWAY_SCOPE` uses in reverse: an unknown *channel* defaults to PAYING, because every
historical away bug was a base reward silently vanishing. An unknown *limiter* defaults
to not binding, because the failure we are guarding against here is the projection
inventing a shortfall the simulation will not produce — a projection that under-promises
because of a limiter nobody implemented is worse than no projection.

### 3.1 Combat

Four independent limits, and the right preparation differs for every one — which is
precisely Tyler's point 2:

| Limiter | Bound by | The player's move |
|---|---|---|
| `LICENCE` | 100 hand-landed kills (`FIELD_LICENCE_KILLS`) | play manually |
| `DEATH` | can a single blow kill you? (§7) | armour, HP, a weaker foe, a higher auto-eat threshold |
| `FOOD` | `(hp + qty × effHeal) / incomingDps` | cook more, or cook *bigger* |
| `AMMO` | `qty / drawPerSwing × swingMs` (§9) | fletch / buy |
| `CAP` | `offlineCapHours()` — 12h base, 16h Offline+ | the good ending |

`DEATH` and `FOOD` are today collapsed into one `effectiveHp` number. **Splitting them is
the core change.** §7 shows they are not merely separable — they are *different kinds of
thing*: survivability is a **binary**, supply is a **duration**.

### 3.2 Gathering

Nothing depletes today (`doSkillAction` contains no `removeItem`/`hasInputs`). The honest
answer is therefore `LIMITER.NONE` bounded by `LIMITER.CAP`, and that is a real answer
worth printing:

> **Nothing here runs out. 12h — your offline maximum.**

That contrast is deliberate and `licence.js` already states it as policy: the game's
answer to "combat pays nothing tonight" is "then set a skill running, it pays
everything." The projection is where that promise becomes visible.

**Two live handoffs.** (a) If the Cellar's "+500 storage" perk is ever enforced —
it is on my standing backlog because it currently feeds nothing — gathering's binding
constraint becomes `STORAGE`, and this surface is where it becomes legible instead of
infuriating. Enforcing storage *without* the projection would be a P1 player-experience
regression. (b) If tool durability or fishing bait is introduced, they slot in as
`AMMO`-class draws with no new code. Both routed to Systems + the consumable designer.

### 3.3 Artisan

The engine already names the binding input. `src/core/artisan.js`:

```js
/** The first input the bag cannot cover, or null. Naming it is what lets the
    caller say "Out of Iron Ore" instead of "Out of materials". */
export function missingInput(recipe, inventory)
```

That comment is this whole feature stated eighteen months early. The projection is its
forward-looking twin:

```
actions = min over inputs of floor(inventory[id] / perAction[id])
ms      = actions × actionMs          // actionMs from offlineIntervalMs, NOT recipe.ms
limiterId = the argmin input
```

**Exact, not estimated** — no dice are involved. Two honest complications:

- **`craftSave`** (Workshop L4/L5) refunds inputs stochastically, so it *extends* the run.
  **PROPOSAL: the printed floor ignores it.** A perk that makes you beat the promise is a
  pleasant surprise; a perk baked into the promise makes the promise fail whenever the
  dice are cold. `msMean` may include it; the printed number may not.
- **`yield_*` and the artisan tool double** raise *output*, never consume *input*. They do
  not move the duration at all. Do not let them into this maths.

### 3.4 Farming

Farming is a different **shape** and must not be forced into the others. It is not "an
activity you set running for N hours"; it is plots that mature on their own clocks. Its
projection is a **deadline**, not a duration:

> **Your last plot is ready in 2h 10m.** Nothing spoils; seeds for 3 more replants.

**PROPOSAL:** same function, same return shape, `limiter: 'none'`, and a distinct
`kind:'deadline'` on the result so the renderer knows it is quoting *time until idle*
rather than *time until empty*. Seeds bind the auto-replant, not the growth.

---

## 4 · The estimate, and how good it actually is

The projection does **not** introduce a new model. It **decomposes the one the game
already ships** (`estimateSurvival`, `legacy.js:7846`) and gives each term a name.

```
incomingPerSwing = foeAcc × (1 + foeMaxHit)/2
swingsPerKill    = killTimeS / swingS
retaliationShare = (swingsPerKill − 1) / swingsPerKill    // the killing blow draws no reply
incomingDps      = incomingPerSwing × retaliationShare / swingS

effHeal          = min(food.heals, maxHp − floor(threshold × maxHp))
foodSeconds      = (hp + qty × effHeal) / incomingDps
```

Only `effHeal` and the split are new. `incomingDps` is lifted verbatim from the existing
estimator, which is the point — two survival models would disagree within a build, and
`combat-render.js` already carries a three-paragraph argument against exactly that.

### Measured accuracy — closed form vs. the real `simulateSpan`

40 trials: 4 monsters (wolf, goblin, skeleton, dark_wizard) × 5 HP/heal/stock loadouts ×
2 seeds, driven through `src/core/combat-sim.js` `simulateSpan` with a scripted `autoEat`
mirroring `HearthriseAuto.maybeAutoEat`.

| | |
|---|---|
| Mean absolute error | **2.82 %** |
| Worst case | **14.3 %** |
| Best cases | 0.1 % on the long runs |

Read that honestly, because it sets the whole tone of §6:

1. 2.8 % mean is more than good enough to be a **projection**.
2. 14.3 % worst case means it must never be printed as a **promise**.
3. The error is **signed both ways and largest on short runs** — which is exactly the
   argument for a hedge that scales with the span (§6.2).

---

## 5 · Naming the binding constraint

### 5.1 The primary line

The format is **duration, em-dash, cause** — cause always present, never optional:

```
4h 20m — you run out of arrows first.
6h 10m — you run out of Oak Logs first.
12h — your offline maximum, not your supplies.
Nothing here runs out. 12h — your offline maximum.
```

The `CAP` phrasing (*"your offline maximum, not your supplies"*) already exists in
`awayLineHtml` and is good. Keep the words.

**The negative-space rule:** a number without a cause is forbidden on every surface. If
the projection cannot name what binds, the renderer prints the *reason it cannot* — never
a bare duration. `4h 20m` alone tells a player nothing they can act on, and it is the
failure mode this feature exists to prevent.

### 5.2 When two limiters are nearly tied

Tyler asked for this case specifically, and it is the highest-value copy rule in the
feature because it is the one that changes what a player *buys*.

If food says 4h 10m and arrows say 4h 25m, then "4h 10m — food" is technically true and
practically useless: the player buys food and gains fifteen minutes.

**PROPOSAL:** when the runner-up is within **25 %** of the leader, name both.

```
4h 10m — food, with arrows right behind it.
```

25 % because it is the band inside which fixing one limiter alone does not meaningfully
move the night. The precise number is a tuning dial (`SUPPLY_TIE_BAND`), and it belongs
in `supply.js` as a named constant, not scattered in a renderer.

The detail surface (Stats modal) always shows the **full ranked list**, so a player who
wants the whole picture gets it without the primary line becoming a table.

### 5.3 "You will die in 90 seconds" — the case that matters most

This is the new player's case, so it gets the most care. Three rules:

**(1) Do not quote seconds. Quote kills.** A new player has no idea whether 90 seconds is
good. They *do* know what a kill is, because the loot table right next to it is priced in
kills. The existing preview already does this (`YOU LAST ≈5 kills`) and it is the right
instinct — keep it and make it the rule.

**(2) It is a refusal, not a forecast.** Different grammar, different colour, no
duration-shaped number:

```
You will die here. About 5 kills.
Goblin hits for 1. Nothing is healing you — put food in the slot.
```

**(3) It must name the fix.** This is why `projectRun` returns `fix`. A verdict without a
remedy is a wall; a verdict with one is a tutorial. The fix is derived, never authored:
the term that, if changed, flips the verdict.

| Situation | Fix |
|---|---|
| No `auto_eat` trait | "Auto-Eat, from the Store" |
| Trait but empty food slot | "put Cooked Shrimp in the slot" |
| Armed but `floor(thr×maxHp) < maxHit` | "raise auto-eat to 60 %, or +3 max HP" |
| Safe but short on stock | "**300 more Trout** covers the night" — *a number they can buy* |

That last row is where the consumable economy gets its demand curve. See §8.4.

---

## 6 · Honesty

Tyler said "roughly" and he is right. Two mechanisms, and they do different jobs.

### 6.1 Exact numbers get no tilde

Where the projection is arithmetic — artisan inputs, ammo per swing, the offline cap —
it is **exact**, and hedging an exact number teaches players to distrust the surface.
`8 shrimp ÷ 1 per cook × 3.84 s = 31 s`. Print `31s`, not `≈31s`.

Where it is an expectation over dice — food burn, death timing — it carries `≈`. The
tilde then means something, because it is not on everything.

`limits[].exact` carries this per-limit so the renderer never has to guess.

### 6.2 Stochastic numbers are a conservative FLOOR, never a mean

**PROPOSAL, and it is the important one.** Printing the mean means **half of all nights
come up short of what the screen said** — and coming up short is precisely the failure
this feature exists to prevent. Printing a conservative floor means most nights *beat*
the promise, which is the direction a promise should be wrong in.

```
ms = msMean × (1 − k · CV(span))
```

where `CV` is the coefficient of variation of the accumulated incoming damage. Because
that is a sum of many independent swings, CV shrinks as `1/√n`: the hedge is large
exactly where the estimate is weak and vanishes where it is strong. Closed-form, cheap
enough for the server, no simulation required.

That property is the reason to prefer it over a flat percentage: the measured error
(§4) is 0.1 % on long runs and 14.3 % on short ones, so a flat hedge would be
simultaneously too timid at 90 seconds and gratuitously pessimistic at 8 hours.

**No ranges in the primary line.** "4h 10m – 5h 30m" is two numbers where the player
needs one decision. Ranges belong on the detail surface, where `msMean` also lives.

### 6.3 The words

Match the conventions already shipped. The gathering bar quotes both an active and an
away rate; b342's away card states plainly when a night paid nothing and why; the Stats
modal already closes with *"These are averages over a long session, not a promise about
the next swing."* **Reuse that sentence.** One voice for uncertainty across the game
is worth more than a better sentence used once.

**Forbidden words on this surface:** "guaranteed", "will last", "safe for". Use "about",
"roughly", "at least", "≈".

---

## 7 · The safety verdict (Melvor fold-in) — proven, and the brief needs one correction

Tyler: *"you can safely idle a monster when your auto-eat threshold exceeds that
monster's hardest hit."* Correct in spirit. Two corrections, both measured.

### 7.1 Max hit is floored, and it is gear-independent

The brief says max hit is `attack × 0.45`. The engine (`src/core/combat.js:232`) says:

```js
const maxHit = Math.max(1, Math.floor(((monster && monster.atk) || 1) * b.monsterAttackDamageScale));
```

`max(1, floor(atk × 0.45))`. The difference is largest exactly where the new player lives:
Goblin (atk 4) is **1**, not 1.8; Slime (atk 2) is **1**, not 0.9.

More important — and this is the fact that makes the whole feature cheap — **armour
reduces monster *accuracy* only, never their max hit** (`monsterCombatRolls` applies
`playerDefense` to `accuracy` and nothing to `maxHit`). So **a monster's hardest possible
blow is a constant of that monster.** The verdict is a pure function of
`(monster.atk, playerMaxHp, autoEatThreshold)`: three numbers, cacheable, stable per row,
and computable for all 31 monsters in microseconds. That is what makes it viable as a
badge on every row of the list.

### 7.2 The exact inequality, swept against the real simulation

The naive form is wrong at the boundary. Auto-eat fires *after* damage and *before* the
death check (`combat-sim.js`), and `maybeAutoEat` refuses at `hp <= 0`. So the worst HP
you can enter a swing at is `floor(threshold × maxHp) + 1` — one point above the line,
because at or below it you were already healed last tick. Survive iff
`floor(threshold × maxHp) + 1 − maxHit > 0`:

> ### S1 — one-shot safety
> **`floor(threshold × playerMaxHp) ≥ maxHit`** &nbsp;&nbsp;(`≥`, not `>`)

**Swept against `simulateSpan`: 4 monsters × 9 HP bars × 3 thresholds = 108 cases,
6-hour spans, unlimited food. 108/108 agreement. Zero mismatches.** The boundary cases
are the proof: `floorHp 2` vs `maxHit 3` died at tick 11; `floorHp 3` vs `maxHit 3`
survived all 9,000 ticks.

There is a second condition, found by sweeping heal sizes:

> ### S2 — drain safety
> **`food.heals ≥ incomingPerSwing`** — each eat must replace more than a swing takes.

Measured on wolf (`incomingPerSwing ≈ 1.10`): `heals:1` **died at tick 107** despite
satisfying S1 with a 20 HP floor against a 3 max hit; `heals:2` survived all 9,000. Rare
with real cooked food, but it is exactly the player nibbling 1 HP scraps, and it deserves
its own message — *"your food is too small to keep up"* — not a generic "risky".

### 7.3 And S1 + S2 still are not "safe" — supply is

Same sweep, safe inequality, 20 food instead of 1,000,000: **died after 445 ticks.**

**That is the thesis of this entire document.** Survivability and supply are not two
features; the safety verdict *is* the supply projection, evaluated at the cap:

| Verdict | Condition | Copy |
|---|---|---|
| **Safe to leave running** | S1 ∧ S2 ∧ supply ≥ cap | "Safe to leave running. **12h** — your offline maximum." |
| **Runs dry** | S1 ∧ S2 ∧ supply < cap | "Safe while it lasts — **4h 20m**, then your food is gone." |
| **Risky** | ¬S1 ∨ ¬S2, expected run long | "You can be killed here. **≈40m**, if the dice are kind." |
| **You will die** | ¬S1 ∧ short, or unarmed | "You will die here. About **5 kills**." |
| **Blocked** | licence unearned | "Not yet — 100 kills for your Field Licence. 0 / 100." |

Note **Safe** and **Runs dry** are both green-ish and both honest — the difference is
whether you get the whole night. That distinction does not exist anywhere in the game
today, and it is the one a prepared player most wants.

### 7.4 Why this replaces the level gate on the list

The monster list currently shows `CL 15` — **what you are permitted to fight, not what you
can survive.** Those are different facts and the second is the one that matters at 11pm.
Measured, the list gives a level-3 player five unlocked tier-1 rows and no way to tell
that all five will kill them.

**PROPOSAL:** keep the lock for locked rows; on unlocked rows show the **verdict badge**.
One glyph plus one word, computed from three numbers. Colour and glyph are the **Art
Director's** call — I am specifying the *state*, not the pixels.

### 7.5 The tradeoff this surfaces for free

Raising the auto-eat threshold raises `floor(thr × maxHp)` — **safer** (S1) — while
lowering `effHeal = min(heals, maxHp − floorHp)` — **more eats, shorter night**.

Measured over 12h on wolf: a 40 HP bar at 0.5 with 20-heal food ate **956** food; a 6 HP
bar at 0.5 with 6-heal food ate **5,381**.

> **Safety costs supply.**

That is a genuine strategic dial that already exists in the engine and is completely
invisible today. The projection makes the Settings slider a decision. Cost to implement:
zero — it falls out of showing both numbers.

---

## 8 · Reconciliation — closing the loop

A projection nobody checks is marketing. The away card must compare the promise to the
outcome.

```
Projected 6h · you got 4h 20m — arrows.
Projected 8h · you got 8h. Everything held.
Projected 12h · you got 31 seconds — you had 8 Shrimp.
```

### 8.1 Fields the away summary needs

Added to `simulateSpan`'s return and mirrored **flat** onto `G.lastOfflineSummary`, beside
`died` / `diedAfterMs` / `diedTo`. Flat and stated, never inferred — b342's rule, and the
reason it exists is that a renderer forced to guess will eventually guess wrong.

| Field | Type | Why |
|---|---|---|
| `stoppedBy` | `LIMITER` | the one word the card is built on. `'cap'` on a full night — *stated*, so "everything held" is a fact and not an inference from `!died`. |
| `stoppedById` | item id \| null | so the card can **name** it: "arrows", "Oak Logs" |
| `paidMs` | ms | span that actually produced. Exists for combat as `survivedMs`; **artisan and gathering have no equivalent and need one.** |
| `projectedMs` | ms | what we promised (§8.2) |
| `projectedLimiter` | `LIMITER` | what we said would bind |
| `consumed` | `{id: qty}` | what the night actually burned — the receipt |

`consumed` is the smallest field with the largest payoff: *"you burned 1,240 arrows"* is
the number that turns fletching from a chore into a supply line the player is running.

### 8.2 The projection must be STORED, not recomputed

**The subtle one, and the one that would be got wrong.** If the welcome-back card
recomputes the projection on return, it computes it from the **post-absence bag** — which
is empty, because that is why the run stopped. It would cheerfully report "projected 0m,
you got 0m" and pass every test while asserting nothing. This repo is at instance #15 of
that family of failure.

**PROPOSAL:** the projection is computed **at activity start** and persisted with the
activity, server-side, alongside `active_since` and `accrued_to`:

```
player_activity.projected_ms       bigint
player_activity.projected_limiter  text
```

Written by the same `start_activity` intent that stamps `active_since`. Never client-
supplied — the server recomputes it from server-owned inventory and equipment, so a
forged projection cannot buy a longer night. It is a **record**, not an input: nothing in
the accrual reads it to decide a grant. It exists solely so the promise and the outcome
can be compared.

Which buys something valuable for free: **`projectedMs` vs `paidMs` becomes a live
telemetry pair.** "What fraction of nights beat their projection?" is then a query, not a
guess, and §6.2's floor is tunable against evidence instead of taste. If that number is
not comfortably above 50 %, the floor is too generous and we will know.

### 8.3 The artisan break must speak

`legacy.js:1342` already detects exhaustion and breaks silently. It needs to record
`stoppedBy = INPUTS`, `stoppedById = missingInput(rec, inv)` — which `artisan.js` already
computes — and `paidMs = actionsRun × actionMs`. **This is a small change with the
largest honesty payoff in the document**, and it is arguably shippable before the rest.
It routes to the **Systems Engineer**: the fields are engine state.

### 8.4 The shop is a reconciliation surface too

Once `fix` exists (§5.3), the market and the vendor can print
*"300 more Cooked Trout covers your night."* That is where consumables acquire a demand
curve grounded in a real number rather than in vibes, and it is the strongest argument
for the consumable-economy program landing *with* this and not after it.

---

## 9 · The interface I need from the consumable-economy designer

**They own the burn rates. I consume them. I do not set them.** This is the contract,
stated explicitly so neither of us invents the other's numbers.

**What I need — one table, in `src/data/`, read by both the simulation and the projection:**

```js
// src/data/consumables.js  (their file, their numbers)
export const DRAW = {
  ranged: { source: 'equipped.ammo', per: 1,    unit: 'swing' },
  magic:  { source: 'inventory',     per: 1,    unit: 'cast', itemFrom: spellRuneCost },
  melee:  { source: 'inventory',     per: 0.02, unit: 'swing', item: 'whetstone' },
};
```

Requirements on the shape, each with a reason:

1. **Per-*action*, not per-hour.** The projection divides stock by draw and multiplies by
   `swingIntervalMs`. A per-hour rate would silently ignore weapon speed — and weapon
   speed is exactly what makes this interesting (a bow's `WEAPON_SPEED_MOD` of 0.88 gives
   `floor(2400 × 0.88) = 2112 ms`, which is where the 13,636-arrows-per-8h figure comes
   from; verified against the constant).
2. **Fractional `per` allowed.** A whetstone consumed every ~50 swings is `per: 0.02`. If
   it must be integral, use the **deterministic fractional carry** in `src/core/tools.js`
   (`advanceToolCarry`) — never an RNG roll. A stochastic draw would make the away replay
   non-byte-identical and break the AWAY-1 parity contract.
3. **The source slot must be named.** Equipped ammo and bagged runes are different pools;
   `limiterId` has to name the right one.
4. **One table, both readers.** The simulation decrements from it; the projection divides
   by it. If they are ever two tables, the screen and the server will disagree and the
   projection becomes a liability rather than a feature.
5. **Fail-soft must be expressible.** Tyler's ruling is that running out keeps you
   training "just very very weak." So the table needs the *depleted* behaviour
   (`whenEmpty: {damageMult: 0.25}` or similar), because the projection has to say
   **"4h 20m, then you keep fighting at a quarter damage"** rather than "4h 20m, then it
   stops." Fail-soft with no forecast reads as the game breaking; **fail-soft with a
   forecast reads as a resource you chose not to buy.** That sentence is the entire
   justification for this feature and it belongs in both our documents.

**What I give back:** `projectRun` returns `fix:{kind:'buy', id, qty}` — the exact
quantity that would push this limiter past the cap. That is their demand curve, computed.

---

## 10 · Test contract

Written in the spirit of AWAY-1: the parity test *is* the design.

| # | Test | Asserts |
|---|---|---|
| **SUP-1** | **Projection/simulation parity.** For N seeded configurations, run `simulateSpan` to completion and assert `summary.stoppedBy === projection.limiter` and `summary.stoppedById === projection.limiterId`. | The limiter vocabulary cannot drift. **This is the contract.** |
| **SUP-2** | **The floor is a floor.** Over ≥200 seeds, `paidMs >= projection.ms` in ≥90 % of runs, and `msMean` within 15 % of the measured mean. | §6.2 is enforced, not aspirational. |
| **SUP-3** | **S1 sweep.** The 108-case sweep of §7.2 as a permanent guard. | The safety inequality holds as the engine changes. |
| **SUP-4** | **S2 guard.** `heals < incomingPerSwing` ⇒ verdict is never `safe`. | The 1-HP-scraps case stays caught. |
| **SUP-5** | **Artisan exactness.** 8 shrimp ⇒ exactly 30,720 ms, `exact:true`, `limiterId:'shrimp'`. | The arithmetic path never acquires a tilde. |
| **SUP-6** | **Empty bag.** 0 inputs ⇒ `ms:0`, `limiter:INPUTS`, and the row cannot be started without saying so. | The `Normal 0` case. |
| **SUP-7** | **Reconciliation.** Exhaust an away artisan run; assert `stoppedBy`, `stoppedById`, `paidMs` are populated and the card renders them. | Regression for §1c — the 8h/31s lie. |
| **SUP-8** | **No bare durations.** Every projection render includes a cause. | §5.1's negative-space rule. |
| **SUP-9** | **Purity.** `supply.js` in `CORE_MODULES`; imports clean in plain Node. | It stays runnable in Deno. |
| **SUP-10** | **Stored, not recomputed.** After an exhausting absence, `projectedMs` reflects the **pre-absence** bag. | §8.2 — the instance-#15 trap. |

SUP-10 is the one that would be omitted and is the one that matters most.

---

## 11 · Rollout — smallest strong increments

Each ships independently and each is worth having alone.

| Wave | Change | Why first |
|---|---|---|
| **1** | `src/core/supply.js` + SUP-1/5/6/9. Artisan + cap only — pure arithmetic, no dice. Wire to skill rows. | Fixes the 8h/31s lie with zero balance risk. |
| **2** | `stoppedBy` / `stoppedById` / `paidMs` on the away summary + the card (§8.1, §8.3). SUP-7. | The receipt starts telling the truth. |
| **3** | The safety verdict (§7) on list rows + preview. SUP-3/4. | Highest value-per-effort; needs no new economy. |
| **4** | Food decomposition — split `effectiveHp` into `DEATH` and `FOOD` (§3.1). SUP-2. | Makes "buy food" vs "buy armour" answerable. |
| **5** | `projected_ms` persisted server-side (§8.2). SUP-10. | Turns the promise into a measurable one. |
| **6** | Ammo/rune/whetstone limiters, on the consumable designer's table (§9). | Lands the day burn rates exist. |

---

## 12 · Boundaries, handoffs, open questions

**Art Director** — the verdict badge (§7.4) is a *state*, not a visual. Four states plus
locked, on rows ~48 px tall, and the primary line must survive a landscape phone. Also:
the preview's Forecast pane is already dense; adding a limiter line is a layout question,
not a copy question.

**Systems Engineer** — `paidMs` for artisan/gathering, and the `stoppedBy` fields
(§8.3). The `player_activity.projected_ms` column (§8.2). Enforcement of `LIMITER.STORAGE`
if the Cellar perk is ever made real (§3.2) — **do not enforce storage before the
projection ships.**

**Consumable-economy designer** — §9 is the contract. They own `per`, `whenEmpty` and
every number in it. I own the division and the words.

**Semantic conflict to watch (`CONFLICTS.md`):** if the consumable design expresses burn
as a *per-hour* rate, this projection is wrong for every weapon whose family speed is not
1.0 — which is four of five families. Per-action or nothing.

**Exploit review.** The projection reads state and prints a string; it grants nothing and
mints nothing, so it opens no economy surface directly. Two real risks:

1. **`projected_ms` must never be client-supplied** (§8.2). It is a server-computed
   record. A client-writable projection is a client-writable night.
2. **The projection must not become a rate.** If anyone ever "rewards" accurate
   preparation with a multiplier, it stops being a statement and becomes a channel, and
   `licence.js`'s header explains at length why that is the twelfth instance of a failure
   we have already fixed eleven times.

**Open questions for Tyler:**

1. **The floor's aggressiveness** (§6.2). I propose ~p20 — most nights beat the promise.
   More conservative reads as timid; less reads as a lie half the time.
2. **The tie band** (§5.2). 25 % is a judgement call.
3. **Does the verdict badge replace the level gate on list rows, or sit beside it?**
   (§7.4). I lean *beside* — the gate is still a real fact — but two badges per row is
   a density problem the Art Director should rule on.
4. **Fail-soft copy.** "then you keep fighting at a quarter damage" needs the actual
   penalty from §9 before it can be written truthfully.

---

## Appendix — every number in this document, and how it was obtained

All measured on b342, local server :8000, harness seam, headless Chromium.
Nothing here is quoted from source comments; every figure was printed by executing.

| Figure | Method |
|---|---|
| New player: 500g, 8 shrimp, no food slot, no auto-eat, 10 HP, CL 3 | read `window.G` after boot |
| Slime preview copy | `openMobPreview('slime')`, `#mp-modal.innerText` |
| Slime forecast: 0.75 dps, 10.6 s TTK, 5 kills, 61.3 s | `window.__estimateCombat(MONSTERS.slime)` |
| Cook Shrimp away interval **3840 ms** | `offlineIntervalMs(rec.ms)` **with `activeSkill`/`skillTargetId` set** — an earlier probe without the activity set returned 3000 and was wrong |
| 8 shrimp = 30.7 s of a 28,800 s night (0.107 %) | computed from the two above |
| 11,250 shrimp to fill a 12 h cap | `ceil(12×3600000 / 3840) × 1` |
| Away summary has 21 fields, none for supply | `Object.keys(G.lastOfflineSummary)` after a forced 8 h `processOffline()` |
| Ammo exists, nothing consumes it | `ITEMS` filter on `slot:'ammo'`; `/ammo/i` vs `combatTick` and `simulateTick` |
| `maxHit = max(1, floor(atk × 0.45))` | `monsterCombatRolls` over all 31 monsters; ratios 0.25–0.5, all consistent with the floor |
| **max hit is gear-independent** | dark_wizard swept over `defB` 0→1000 × defence XP 0→5,000,000: `maxHit` constant at **5** while accuracy fell 0.566 → 0.10 (the floor). Armour buys accuracy, never a smaller worst blow. |
| **S1 `floor(thr×maxHp) ≥ maxHit`: 108/108, 0 mismatches** | sweep through `simulateSpan`, 6 h spans, unlimited food |
| **S2: `heals:1` dies at tick 107, `heals:2` survives 9,000** | same harness, wolf, `incomingPerSwing ≈ 1.10` |
| Safe inequality + only 20 food ⇒ dies at tick 445 | same harness |
| Safety costs supply: 956 vs 5,381 eats per 12 h | same harness, two loadouts |
| **Closed form vs simulation: 2.82 % mean, 14.3 % max, n=40** | 4 monsters × 5 loadouts × 2 seeds |
| Bow 2112 ms | `floor(COMBAT_BALANCE.tickMs × WEAPON_SPEED_MOD.ranged)` = `floor(2400 × 0.88)` |
| `offlineCapHours()` = 12, `FIELD_LICENCE_KILLS` = 100, auto-eat default 0.5 / disabled | read live |
