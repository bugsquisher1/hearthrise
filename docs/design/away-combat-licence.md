# SPEC — the Field Licence: away combat is earned, not given

**Owner:** Game Designer · **Date:** 2026-08-14 · **Status:** spec, not built.
**Ruling being implemented (Tyler, verbatim):** *"Afk combat exp shouldn't come
immediately, the player should be guided to play the game manually early on to get
the hang of it."*

**Binding documents this sits inside, neither of which it amends:**
[`away-time-ruling.md`](./away-time-ruling.md) (away pays 1.00×, one loop, the
`AWAY_SCOPE` table) and [`pacing-overhaul.md`](./pacing-overhaul.md) (the 57.2-day
first-99 floor, the 12h daily budget).

---

## 0 · The one-line spec

**Away combat does not run until the player has landed 100 kills. That threshold is
called the Field Licence, it is a visible counter on the Combat panel from kill one,
and it is evaluated by the server as an activity precondition — never as a bonus
channel and never as a rate.**

Everything else in this document is honesty work: the licence is worth nothing if the
game keeps quoting an hourly forecast to a character who survives ninety seconds.

---

## 1 · What is actually broken, measured

Reproduced on a brand-new character sent at the game's own **Recommended** foe:

| away | forecast quoted | actually granted | internals |
|---|---|---|---|
| 4h | ~1,360 kills / ~6,800 XP | 2 kills · 34 XP · 3 gold | `ticks:17, died:true` |
| 8h | ~2,720 kills / ~13,584 XP | 3 kills · 49 XP · 6 gold | `ticks:22, died:true` |

Live, the same character dies at 5 kills / 75s and 8 kills / 90s.

The structural cause, from the shipped data:

- `MONSTERS.slime` — `hp:8, atk:2, def:0, xp:5, gp:[1,3]`.
- Fresh save (`legacy.js`): `playerHp:10, playerMaxHp:10`, `inventory:{…shrimp:8}`,
  **`foodSlot: null`**, no `traits.auto_eat`.
- `shrimp.heals: 3` — 8 shrimp is 24 HP of healing against a 10 HP bar, and it is not
  even slotted.
- `auto-actions.js:219` — `if(!(G.traits && G.traits.auto_eat)) return false;`
  **Without the trait, nothing eats. Away, nobody is there to eat manually.** Away
  combat for a new character is therefore not "slow", it is *ninety seconds long*.
- `TRAITS.auto_eat` — `cost: 100, currency: 'marks'`.

**This asymmetry is correct and it is intended.** A tree does not hit back; a Slime
does. Woodcutting pays exactly the base rate for eight hours because nothing about
eight hours of woodcutting requires a decision. Combat requires decisions — which
foe, which weapon, when to eat, when to run — and a game that pays you for eight
hours of a decision you never made has taught you nothing.

**The failure is not the asymmetry. The failure is that the game never says so, and
in three places actively says the opposite:**

1. The monster preview advertises `Kills / hr` and `XP / hr` to a character who
   cannot survive four minutes (`legacy.js:7607–7608`). A forecast is a promise.
2. The FTUE wrap step says *"Train any skill, kill anything that moves, and check
   back tomorrow for offline rewards"* (`ftue.js`, step `wrap`) — one sentence that
   promises away rewards for combat and skills in the same breath.
3. The away card prints "8h away — +34 XP" with no explanation of the gap
   (`home-dashboard.js awayCardHtml`). A small number with a reason is fine. A small
   number with no reason reads as theft.

**Do not fix this by making day-one combat unattended-safe.** The fix is to make the
rule true, visible, and aimable.

---

## 2 · Decision 1 — GATED, not attenuated

### 2.1 The ruling

Away combat is **gated**. Before the Field Licence, a combat activity left running
during an absence **accrues nothing at all**: no XP, no gold, no drops, no kills, no
bounty progress, no daily progress, no deaths. The span is not simulated.

After the licence, away combat pays **1.00×**, exactly as `away-time-ruling.md`
specifies. Nothing about the resolver changes. `AWAY_RATE_MULT` stays 1.00.

### 2.2 Why gated and not attenuated

Three reasons, in order of weight.

**(a) Attenuation is imperceptible here, so it cannot teach anything.** The binding
constraint on a pre-licence away fight is not the rate — it is that the character
dies after ~40 ticks. Four hours away pays 34 XP. Halve it and it pays 17. A player
cannot tell 34 from 17 from broken; both read as "combat doesn't work". A dial that
the player cannot perceive is not a design, it is a number in a file. Zero, by
contrast, has a reason attached and a counter ticking toward its removal.

**(b) An attenuation dial is a second `AWAY_RATE_MULT`, which the binding ruling
forbids by name.** *"The away/active difference is which bonus channels are in scope,
never a rate discount."* A per-activity away rate multiplier is precisely a rate
discount wearing a different hat, and it would be the first crack in the one-line
rule that took a whole program to establish. A **precondition** — "this activity is
not yet eligible to accrue" — is a different category, one the ruling does not speak
to and does not need to.

**(c) Zero is auditable; a fraction is not.** A test can assert "a pre-licence absence
grants exactly nothing" in one line and it will fail loudly forever. A test that
asserts "a pre-licence absence grants 43% of the licensed value" is a test that will
be quietly adjusted the next time a balance number moves.

### 2.3 The threshold: **100 kills**

Named the **Field Licence**. Earned once, permanently, never revoked (the pacing
doc's "earned progress is never clawed back" applies to a permission as much as to a
level).

**Why kills and not a combat level, a quest, or auto-eat:**

| candidate | why not |
|---|---|
| Combat level N | A level does not mean you learned anything, and it does not make you survive. A level-20 character with an empty food slot still dies in ninety seconds. It would gate the wrong variable. |
| A quest | A new content dependency for a P0, and quests can be completed without ever fighting attentively. |
| **Owning auto-eat (100 Bounty Marks)** | The honest candidate — it is the mechanic that actually makes away combat *survive* — but it is **≈1,365 kills / ≈5.5 attended hours** away (§5). That is a week, not "early on", and it means a whole first week in which the Combat tab is the only activity in the game that pays nothing while away. That does not read as "combat is manual", it reads as "combat is broken". See §8 for the version of this spec that picks it anyway, if Tyler prefers. |
| **100 kills** | Directly measures the thing the ruling asks for: you fought, by hand, enough times to have made the decisions. Counts an existing field (`stats.kills`). Reads as a sentence a player can hold in their head. |

**Why 100 specifically — the arithmetic.**

- Fresh character on Slime: measured 5 kills / 75s → ~15s per kill, ~240 kills/hr in
  pure uptime.
- But uptime is not the constraint: 10 HP and 8 unslotted shrimp mean a run is
  ~5 kills, or ~15–20 kills if the player slots the shrimp and eats them. Then they
  are out of food and must fish and cook.
- So **100 kills ≈ 25–30 minutes of combat uptime, delivered as roughly 5–6 runs
  interleaved with fishing, cooking and eating.** That is not a grind; it is the
  entire early-game loop, run five times, which is exactly what "get the hang of it"
  means.
- An engaged first session clears it. A casual player clears it across two or three
  sittings inside the first day. Against a 57.2-day first-99 floor, this is a rounding
  error in pacing terms and a whole tutorial in experience terms — the right trade.

**The alignment that makes it feel designed rather than imposed:** the tier-1 easy
cull bounty on the opening board requires **80–120 kills**
(`BOUNTY_KILL_COUNTS.cull[1]`). **The Field Licence and the player's first Bounty
Mark payout land at almost exactly the same moment.** One session ends with two
unlocks and a visible new goal. Do not tune either number away from the other.

### 2.4 The gate does NOT apply to anything else

Loudly, because this is the class of change that spreads:

**The licence gates exactly one activity type: `combat`.** Gathering, artisan
(cooking/smithing/crafting/prayer), farm growth, cooking-fire, workers, and every
other away-paying activity are **completely untouched** and continue to pay 1.00×
from the first second of the first session. A brand-new player who sets woodcutting
running still banks the full 12h. That contrast is the *point*: the game's answer to
"combat pays nothing tonight" is "then set a skill running, it pays everything".

---

## 3 · Where the threshold lives — server-side, and NOT in `AWAY_SCOPE`

### 3.1 The loud flag the brief asked for

> **I am NOT adding a channel to `AWAY_SCOPE`, and I am NOT setting any existing
> entry to `false`.** `src/core/away.js` is unchanged by this spec, byte for byte.

That table's contract is *"an unknown channel defaults to PAYING, because every
historical away bug was a base reward silently vanishing."* Putting the licence
inside the resolver would make it the twelfth instance of exactly that failure: a
reward disappearing inside a per-grant gate, invisible at the call site, discovered
months later. The licence is a **precondition on whether the span runs at all** —
checked once, before simulation, with a single boolean outcome that the away card is
required to print. Its failure mode is "the whole night is missing and the card says
why", which is loud, single-assertion testable, and impossible to confuse with drift.

### 3.2 Where the code goes

A new **pure core module**, `src/core/licence.js` — no DOM, no window, no timers, no
`Math.random`, matching the `src/core/*` contract:

```
export const FIELD_LICENCE_KILLS = 100;

/** @param state { stats:{kills}, ... }  @returns {ok, kills, need, remaining} */
export function fieldLicence(state) { … }
```

**Who reads it:**

1. **`supabase/functions/hr-accrue/accrual.js` — this is the authority.** It already
   imports `src/core/combat-sim.js`, `botd.js`, `rng.js`, `progression.js`,
   `styles.js`, `xp.js` directly, so importing one more core module costs nothing
   architecturally. `computeAccrual` checks the licence against **server-known
   `stats.kills`** before it calls `simulateSpan`, and returns a summary carrying
   `licence: {ok:false, kills, need}` when it declines to simulate.
2. **The client — display only.** The Combat panel counter, the preview line, the
   leave-prompt and the away card all read the same function so the numbers agree,
   but the client's verdict is prediction, never authority.

**A threshold the client evaluates is a threshold a player edits.** `stats.kills`
lives in the client-authored snapshot today; under the server-authority program it
becomes server-owned along with everything else, and the licence check **must land on
the server side of that migration, not before it**. If accrual is still trusting a
client-supplied kill count when this ships, the gate is decorative — say so in the
commit rather than pretending otherwise.

### 3.3 Two engineering consequences to hand to Systems

1. **A pre-licence combat absence must not draw down the offline budget.** The 12h
   daily budget watermark (`offlineBudget.at`, save invariant 5) is *spent* by a
   catch-up. Charging a player twelve hours of their daily allowance for a night that
   paid nothing is the single most likely way to turn a teaching moment into a
   grievance ticket. The budget is only consumed by a span that was actually
   simulated.
2. **`stats.kills` must not advance during a declined span** — which is automatic,
   because the span is not simulated. That gives a useful identity: **before the
   licence, every kill in `stats.kills` is by construction a hand-landed one**, so no
   second "kills while present" counter is needed and none should be added.

---

## 4 · The honesty surfaces

The ruling's own §"Player-facing honesty" already establishes that a silent penalty
is the sin. Four surfaces, in the order the player meets them.

### 4.1 The monster preview — the sharpest lie in the build

**The rule, and it is the load-bearing sentence of this whole section:**

> **A rate may only be quoted over a span the character can actually survive.**

`estimateCombat()` (`legacy.js:7457`) computes outgoing damage only — it has no model
of incoming damage at all, which is why it happily prints `340 kills/hr` to a
character with a four-minute life expectancy. `forecast()` in
`features/combat-render.js` already has the missing half (`f.foe.accuracy`,
`f.foe.maxHit`). One derived quantity closes it:

```
incomingDps      = foe.accuracy × (1 + foe.maxHit)/2 ÷ (tickMs/1000)
damagePerKill    = incomingDps × killTimeS
effectiveHp      = playerHp
                   + (ownsAutoEat && foodSlot ? inventory[foodSlot] × ITEMS[foodSlot].heals : 0)
survivalKills    = floor(effectiveHp / max(0.01, damagePerKill))
survivalSeconds  = survivalKills × killTimeS
```

**Acceptance criterion, so nobody has to trust my constants:** for a fresh save
(10 HP, bronze sword, empty food slot) against Slime, this must produce
**5 kills ±1 and 75s ±20s** — the live measurement. If it does not, the incoming
model is wrong and the fix is the model, not the copy.

**What the Forecast pane renders.** The per-swing rows (DPS, hit chance, damage,
time to kill) are honest and stay. The two rate rows become conditional:

- **`survivalSeconds < 3600`** — do not print an hourly rate at all. An hourly rate
  for a character who cannot survive an hour is not pessimistic, it is a category
  error. Print the run:
  > **You last** ≈5 kills · **This run** ≈75s · ≈75 XP · ≈10 gold
- **`survivalSeconds ≥ 3600`** — print `Kills / hr` and `XP / hr` as today, plus the
  survival row so the player can still see the ceiling.

**Plus one Away line, always present, three states:**

| state | line |
|---|---|
| no licence | **Away:** not yet — land 100 kills for your Field Licence. **41 / 100.** |
| licence, no auto-eat | **Away:** about **5 kills**, then you fall and the fight ends. Auto-Eat keeps it running. |
| licence + auto-eat + food slotted | **Away:** about **4h 20m**, on 62 Cooked Shrimp. |

The third line is bounded by whichever runs out first — food or the daily budget —
and names which. The same three states drive the "If you stay here" section of the
Stats modal (`combat-render.js buildStats`), which quotes the same four rates.

**Gathering previews are honest today and change in no way.** `legacy.js:4062` and
`:8663` quote `XP/hr` and `items/hr` for an activity whose forecast is exactly true
over an eight-hour absence, because a tree does not hit back. Anyone "harmonising"
the two previews is removing information from the honest one. Written down here so
that instinct has something to bounce off.

### 4.2 The Combat panel — the counter has to exist before the goal does

Two persistent readouts, both of which currently exist nowhere the new player will
look:

1. **The licence counter**, on the Combat panel from kill one, next to the arena —
   not buried in a modal: *"Field Licence — 41 / 100 kills. Fights carry on while
   you're away once it's earned."* On completion, a one-time toast that is allowed to
   be loud: **"Field Licence earned. Your fights now carry on while you're away."**
2. **The Bounty Marks counter with its target**: *"Bounty Marks — 12 · Auto-Eat costs
   100"*. The marks total is currently only legible inside the bounty panel, and the
   thing it buys is only legible inside the trait shop. A currency whose sink is on a
   different screen is a currency the player never forms a plan around.

`TRAITS.auto_eat.desc` should lead with what becomes its headline value:
> *"Auto-Eat — eats for you when your health drops, **including while you're away**.
> Your fights stop being ninety seconds long. Earned with Bounty Marks."*

*(Layout, placement and visual weight of both readouts → **Art Director**. The
content and the trigger conditions are specified here; how they sit on the panel is
not mine.)*

### 4.3 The moment they try to leave

The first time a player hides the tab or navigates away with a combat activity
running and **no licence**, a one-time-per-account, non-blocking sheet on return —
or, better, on the `visibilitychange` before they go:

> **You're leaving with a fight running.**
> Combat won't pay while you're away until you've earned your Field Licence — you're
> at **41 of 100** kills.
> Skills pay in full the whole time you're gone.
> **[ Start Woodcutting ]** **[ Leave it running ]**

Once, ever. Never blocking. "Leave it running" is a real choice and must not nag
again. This prompt is pure client display and touches no authority.

### 4.4 The away card — wording for a death

`home-dashboard.js awayCardHtml` currently prints the away span, the gains, and a
notes list. It is the right structure; it needs two cases. *(The plumbing to surface
`died` on the card is already in flight elsewhere — this is the copy and the
decision about what it tells the player to do next.)*

**The principle to write into the file:**

> **The away card must always explain the gap between what was forecast and what was
> granted.** A small number with a reason is a lesson. A small number with no reason
> is a bug report.

**Case A — no licence, combat was running (nothing accrued):**

> **8h away — your camp was quiet.**
> · *(base)* You left a fight running. Combat doesn't pay away until you've earned
>   your Field Licence — **41 of 100 kills**.
> · *(base)* Gathering, cooking and smithing pay in full while you're away. Set one
>   running before you go.
> **[ Train a skill ]**

Note there is no "capped" line and no budget line, because nothing was spent (§3.3).

**Case B — licensed, died during the absence:**

> **8h away — 3 kills · 49 XP · 6 gold**
> **You fell to a Slime after 4 minutes. The rest of the night was still.**
> · *(held)* A fight ends when you fall. Bring more food, or pick a weaker foe.
> · *(good, only if auto-eat is unowned)* Auto-Eat eats for you while you're away —
>   **62 / 100 Bounty Marks**.
> · *(good, only if auto-eat is owned)* You ran out of food after 4 minutes. Slot more
>   before you go.

**"after 4 minutes" is the load-bearing clause.** "You died" without the elapsed time
does not explain the small number — the player's actual question is *"where did the
other seven hours and fifty-six minutes go?"*, and the answer is the sentence. The
existing summary already carries `ticks` and `died`; elapsed is `ticks × tickMs`, and
the foe is the activity target. Nothing new needs computing.

Everything else on the card — the base-rate note, the Boss-of-the-Day line, the
paused-buff line, the cap line — is unchanged and still governed by
`away-time-ruling.md`.

---

## 5 · Decision 2 — the auto-eat cost STAYS at 100 marks

### 5.1 The arithmetic, corrected

The brief's figure of 1,700–2,000 kills is the **pure-cull** path and it is right for
that path, but it misses the ladder that already exists in `src/core/bounty.js`:

**Phase 1 — Bounty Hunter level 0→5 (culls only).** `unlockedTypes(0) = ['cull']`, so
all three board slots are culls.

| slot | difficulty | required kills | marks | bounty XP |
|---|---|---|---|---|
| 1 | easy (0.85) | 80–120 | `round(6×1×0.85)` = **5** | `round(45×1×0.85)` = **38** |
| 2 | normal | 80–120 | **6** | **45** |
| 3 | normal | 80–120 | **6** | **45** |

Bounty Hunter level runs on the standard `levelFromXp` table, so **level 5 = 388 XP**
≈ **9.2 bounties ≈ 920 kills**, paying ≈ **52 marks**.

**Phase 2 — from Bounty Hunter 5, `proof` unlocks on slot 2** and it is 5.3× better
per kill: `BOUNTY_KILL_COUNTS.proof[1] = [25,35]` (avg 30) for
`round(6 × 1.35) =` **8 marks**.

| | marks per kill |
|---|---|
| tier-1 easy cull | 5 / 100 = **0.05** |
| tier-1 proof | 8 / 30 = **0.27** |

Taking the proof plus one cull per board ≈ 14 marks per ~130 kills. The remaining
48 marks ≈ **3.4 cycles ≈ 445 kills**.

**Total ≈ 1,365 kills ≈ 5.5 hours of attended combat**, over which the character
outgrows Slime, climbs the tier ladder, and gains several combat levels. Not the
1,700–2,000 of the pure-cull read, but the same order.

### 5.2 The position: keep it

**5.5 attended hours is the right size for the first real goal in combat**, and under
this spec it is no longer a tax. The structure the licence creates is two thresholds
answering two different questions:

| | question it answers | cost |
|---|---|---|
| **Field Licence** (100 kills) | *Does away combat pay at all?* | ~30 min |
| **Auto-Eat** (100 marks) | *How long does an away fight last before you fall?* | ~5.5 h |

Before this spec, auto-eat was the gate on both, which is what made 100 marks feel
like a wall — you were paying 5.5 hours for permission to have combat work. After it,
auto-eat is the upgrade that turns a **ninety-second** away fight into an
**all-night** one, which is one of the largest single power steps available in the
early game and is worth every mark. That is a progression goal. The price is correct
for a progression goal and wrong for a tax; the licence is what changes which one it
is. **Do not discount it.**

### 5.3 One micro-change I do recommend, and its exact cost

The 5.5 hours is carried almost entirely by the **invisible** Bounty Hunter 5 proof
unlock. A player who never notices the board is on the 1,700–2,000 path, and their
first ninety minutes of bounty work pay 5 marks against a 100 target — a ratio that
reads as hopeless before the ladder has a chance to show itself.

**"First Blood" — a one-per-account tutorial bounty.** The first bounty a new account
is ever offered is a fixed **10-kill cull worth 5 marks**, generated in slot 1 when
`bountyHunter.completed === 0`, replaced by the normal easy cull thereafter.

- **Total economic cost: 5 marks, once, per account, ever.** Against a 100-mark sink,
  it is 5% of one purchase and it is not repeatable by any means.
- **It must be server-gated on server-known `bountyHunter.completed === 0`**, or it
  is a mintable marks faucet — the exact class of thing the server-authority program
  exists to stop. Flagged to Systems as a hard requirement, not a nicety.
- What it buys: the player finishes a bounty inside their first ten minutes, sees the
  Marks counter move, sees that Auto-Eat costs 100, and forms a plan. It converts the
  bounty board from wallpaper into the combat spine on day one.

### 5.4 What I did NOT change in the bounty economy

`BOUNTY_KILL_COUNTS`, `BOUNTY_BASE_REWARDS`, `BOUNTY_TYPE_MULT`,
`BOUNTY_DIFFICULTY_MULT`, `unlockedTier`, `unlockedTypes`, the reroll costs and the
abandon fee are all **untouched**. Every one of them is load-bearing for tiers 2–6
and for the renown `bountyDone` weight, and re-tuning the tier-1 rung to fix a
first-hour legibility problem would be spending a whole economy to solve a copy
problem. First Blood solves it for 5 marks.

---

## 6 · The first ten minutes, beat by beat

Timings assume an engaged new player who reads.

| t | beat | what makes them want the next thing |
|---|---|---|
| 0:00 | Account gate → FTUE step 1, "Welcome to Hearthrise". | — |
| 0:30 | FTUE step 3, Character/Skills. **Copy unchanged** — *"Pick one and let it run; even when you're offline, progress continues."* It is true for skills. | The idle promise, delivered honestly, on the activity that keeps it. |
| 1:00 | FTUE step 4, Combat. **Copy rewritten** (§7). It now names the deal: monsters hit back, you eat between kills, a fight ends when you fall — and **100 kills earns the Field Licence that lets fights carry on while you're away.** | The first named goal in the game, given before the first fight rather than discovered after a bad night. |
| 2:00 | FTUE wrap. **Copy rewritten**: *"Set a skill running before you close the tab — it pays the whole time you're gone. Combat is for when you're here."* | Two activities, two rhythms, stated in one sentence. |
| 2:30 | Combat panel. Recommended: Slime. Preview shows honest numbers: **≈5 kills · ≈75s this run**, no hourly lie, and **"Away: not yet — 0 / 100."** Below the arena: **Field Licence 0/100** and **Bounty Marks 0 · Auto-Eat costs 100**. | Three visible targets on one screen, all of them reachable. |
| 3:00 | **First Blood** bounty on the board: kill 10 Slimes, 5 marks. Accept. | A ten-minute goal instead of a ninety-minute one. |
| 3:00–5:00 | Fights. ~5 kills, HP hits 3, the arena's eat control asks for a food slot. Player slots raw shrimp (heals 3). Maybe dies once — the death is cheap and instructive. | The eat decision is the mechanic; it is learned by needing it, not by being told. |
| 5:00 | Out of shrimp at ~15–20 kills. **This is the intended dead end.** Fishing is one tab away and the FTUE already pointed at it. | The gathering → cooking → combat chain is discovered by hitting the wall it exists to solve. |
| 5:00–8:00 | Fish, cook, eat. Cooking XP, fishing XP, first level-ups. | Three skills moved in one detour. |
| 8:00 | Back to Slimes. **First Blood completes — +5 marks.** Counter reads **5 / 100 · Auto-Eat**. | The first completed contract, and a legible long goal behind it. |
| 10:00 | ~30–40 kills in. Licence counter reads **38 / 100**. The easy cull bounty (80–120) is accepted and running underneath. | Two nested goals — one a session away, one an evening away. |
| *(closing the tab here)* | The one-time leave sheet: *"You're leaving with a fight running… you're at 38 of 100. Skills pay in full."* **[Start Woodcutting]** | The one moment where the rule could be discovered as a punishment becomes the moment it is taught. |

**Session 2 (or later the same evening):** kill 100 → **Field Licence earned**, and
the easy cull bounty completes within the same stretch → first marks. Combat now pays
away, and the player immediately discovers it pays for about ninety seconds — which
is the moment the 100-mark Auto-Eat goal, already on their screen for two hours,
stops being a number and becomes the thing they want.

---

## 7 · FTUE copy — exact replacements

`src/ftue.js`, `STEPS`:

**`combat` step, `body` — replace:**
> ~~"Combat drops materials for crafting, gold, and rare gear. Remember to equip a
> weapon (Inventory → Equipment) and bring food before the bigger fights."~~

**with:**
> "Combat is the part you play with your hands. Monsters hit back, so you eat between
> kills — and a fight ends when you fall. Land 100 kills and you earn your Field
> Licence, which lets your fights carry on while you're away."

**`wrap` step, `body` — replace:**
> ~~"Train any skill, kill anything that moves, and check back tomorrow for offline
> rewards."~~

**with:**
> "Set a skill running before you close the tab — it pays the whole time you're gone.
> Combat is for when you're here, at least until you've earned your Field Licence."

**`skills` step — unchanged.** *"even when you're offline, progress continues"* is
true for skills and is the promise the game keeps.

---

## 8 · The version Tyler should consider instead — and why I didn't pick it

**Alternative: gate away combat on owning Auto-Eat**, with no new counter, no new
core module, and no new threshold to explain.

It is genuinely tempting: it is the mechanic that *actually* makes away combat
survive, the threshold already exists, it is already priced, and it is already
visible in the trait shop. The whole spec would collapse to §4's honesty work plus
one boolean.

**I rejected it on one number: 5.5 attended hours.** That is roughly a week for a
mixed player. For that week, Combat is the only activity in the game that pays
nothing while away — and the player has no way to tell "this is a deliberate ramp"
from "this is broken", because a week is long enough that the explanatory copy stops
being believed. The ruling says *"early on"*, and a week is not early on. The Field
Licence puts the teaching where the ruling asks for it (the first session) and leaves
auto-eat to do the job it is actually good at (making the night long).

**If Tyler wants the harder version, the change is one line:** `FIELD_LICENCE_KILLS`
becomes `hasTrait('auto_eat')`. Every honesty surface in §4 already reads a single
predicate and would carry the new copy unchanged.

**Three other things worth an explicit overrule:**

1. **The 100 is a dial and I have set it at the low end.** 100 = first session.
   250 ≈ first two or three sittings. 500 ≈ first week. I recommend 100 because the
   licence's job is to teach, not to gate, and because it lands on the same beat as
   the first bounty. If Tyler reads "early on" as "the first week", 500 is the number
   and nothing else in this spec changes.
2. **First Blood (§5.3) is a new marks faucet**, 5 marks once per account. Tiny, but
   it is new value entering the economy during a server-authority rebuild, and it
   deserves a yes rather than an assumption.
3. **Gating to zero means a new player who leaves a fight running overnight gets an
   empty card.** I believe an honest empty card with a counter and a "Train a skill"
   button beats 34 XP with no explanation. It is still the harshest reading of the
   ruling, and it is the thing a player might post about. The mitigation is entirely
   in §3.3(1) — never spend their offline budget on it — and §4.3 — warn them before
   they go, once.

---

## 9 · What I deliberately left alone

- **`src/core/away.js`** — not one byte. No new channel, no `false`, no new dial.
  `AWAY_RATE_MULT` stays 1.00. (§3.1)
- **The away resolver, `combat-sim.js`, and the one-loop mandate.** The licence is
  checked by the *caller*, before `simulateSpan`. `AWAY-1` (seeded parity) and
  `AWAY-12` (no second loop) must stay green untouched, and a licensed player's away
  fight must be byte-identical to today's.
- **Every rate in `pacing-overhaul.md`.** `PACE.xp`, `PACE.actionMs`, the 57.2-day
  floor, the 12h daily budget, the blessing calendar, the presence gate. This spec
  moves no rate. Its entire pacing effect is that a new player's first night of
  combat pays 0 instead of 34 XP — 0.004% of a first-99 requirement.
- **Gathering and artisan previews** (`legacy.js:4062`, `:8663`) — honest today,
  unchanged. (§4.1)
- **The whole bounty economy** except the one-per-account First Blood row. (§5.4)
- **Monster stats, drop tables, gold per kill, `COMBAT_BALANCE.tickMs`, weapon
  families, `spdB`.** No combat balance change is smuggled in here.
- **The four open items from my standing backlog** — cellar storage, the solo raid
  clamp, the 25-crop daily, and the ~25 orphaned tier-3–6 combat drops. All still
  open, none of them this P0.

---

## 10 · Required regression coverage

In `src/features/smoke-test.js`, and mirrored server-side where the accrual runs:

1. **`LICENCE-1` — the gate.** A save at `stats.kills = 99` with a combat activity and
   an 8h absence grants **exactly zero**: XP, gold, items, kills, deaths, bounty
   progress, daily progress, collection-log entries. All zero, asserted field by
   field, not by a summed total.
2. **`LICENCE-2` — the release.** The same save at `stats.kills = 100` produces a
   result **byte-identical** to the same seeded span run against today's build. The
   licence must be a switch, never a modifier.
3. **`LICENCE-3` — the budget.** A declined 8h span leaves `offlineBudget.at`
   unchanged; a subsequent licensed absence the same day still has its full
   allowance. (§3.3)
4. **`LICENCE-4` — `AWAY_SCOPE` is untouched.** Assert the frozen table deep-equals
   `{permanent:true, crit:true, botd:true, heal:true, blessing:false, buff:false}`
   and that `AWAY_RATE_MULT === 1.00`. This test exists to fail if someone
   "simplifies" the licence into the resolver.
5. **`LICENCE-5` — scope.** With `stats.kills = 0`, an 8h **woodcutting** absence
   grants the full unchanged amount. Repeat for one artisan activity. The gate must
   never leak.
6. **`LICENCE-6` — permanence.** Once `ok` is true it can never become false, at any
   kill count, after any death, on any save round-trip.
7. **`LICENCE-7` — the forecast is survivable.** For a fresh save vs Slime,
   `survivalKills` is 5 ±1 and `survivalSeconds` is 75 ±20; and with
   `survivalSeconds < 3600` the rendered preview contains **no** `/hr` string.
   This is the test that keeps the lie from coming back.
8. **`LICENCE-8` — the card explains itself.** A declined absence renders the "Field
   Licence — N of 100" note; a licensed absence with `died:true` renders the foe name
   and the elapsed minutes.
9. **`LICENCE-9` — First Blood is once.** Two consecutive board generations on an
   account with `completed >= 1` never produce a 10-kill bounty; the total marks it
   can ever mint is 5.

---

## 11 · Handoffs

- **Systems Engineer** — `src/core/licence.js`; the check in
  `hr-accrue/accrual.js computeAccrual` **before** `simulateSpan`, against
  server-known `stats.kills`; the summary field `licence:{ok,kills,need}`; the
  budget-not-spent rule (§3.3.1); First Blood server-gated on
  `bountyHunter.completed === 0`; the incoming-damage term added to
  `estimateCombat` / `forecast`. **Read §3.1 before touching `src/core/away.js` —
  the answer is that you do not.**
- **Art Director** — placement and weight of the Field Licence counter and the
  Bounty Marks / Auto-Eat readout on the Combat panel; the licence-earned toast; the
  leave sheet (§4.3). The content is specified; the surfaces are yours. Filed to
  `DISCOVERIES.md`: the Marks currency and its only meaningful sink currently live on
  two different screens, which is why nobody forms a plan around it.
- **QA Engineer** — §10. `LICENCE-2` (byte-identical release) and `LICENCE-4`
  (`AWAY_SCOPE` untouched) are the two that guard the binding ruling; `LICENCE-7`
  guards the honesty.
- **Coordinator → Tyler** — §8. Four items want an explicit yes: the threshold shape
  (100 kills vs owning auto-eat), the number (100 / 250 / 500), the First Blood
  faucet, and the acceptance that a pre-licence overnight shows an empty card.
