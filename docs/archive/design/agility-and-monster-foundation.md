# Agility, and the monster-rework blast radius

**Owner:** Game Designer · **Date:** 2026-08-15 · **Build measured:** b342 (`main`, smoke 684/684, 0 runtime errors)
**Status:** PART 1 is a **proposal** with the arithmetic behind it. PART 2 is an **audit** — statements of
fact, each verified by execution. **Nothing here is built. No engine code and no `src/data/**` was touched.**

**Binding documents this sits inside and does not amend:**
[`away-time-ruling.md`](./away-time-ruling.md) · [`pacing-overhaul.md`](./pacing-overhaul.md) ·
[`away-combat-licence.md`](./away-combat-licence.md) · [`bonus-rebase.md`](./bonus-rebase.md) ·
[`HANDOFF-server-authority.md`](./HANDOFF-server-authority.md) · `CLAUDE.md` → *Server authority*.

**Standing constraint respected, not duplicated:** `spdB` sits outside the permanent power fuse and a
separate designer is ruling on it. **Nothing proposed here touches `spdB`, `swingIntervalMs`, or the
speed-gear question.** Agility as specified below grants no speed of any kind, deliberately.

**Every number in this document was produced by running the shipped engine** — `src/core/combat.js`,
`src/core/combat-sim.js`, `src/core/away.js`, `src/data/monsters.js`, `src/data/gear-tiers.js` — not by
reading it. §A tells you how to reproduce each table.

---

## 0 · The two answers, up front

**PART 1.** Dodge is *not* a new mechanic — Hearthrise already has an evasion channel, and the player
already sees it in the combat log as *"Wolf misses!"*. It is `monsterCombatRolls`, and Defence level,
`defB` and `bonus('defense')` all feed it at exactly `-0.006` monster accuracy per point (verified: all
three deltas are `0.0060`). That channel **saturates** — it hits its 10% floor and stops paying, for
every monster in the game, from roughly **Steel plate / Defence 30** onward. So a second stat pointed at
the same axis would do nothing for anyone above the early game.

The safe form of dodge is therefore a **post-clamp multiplier, capped at 15%, sourced from exactly one
input — the Agility level — with zero contribution from gear.** The cap is not a taste number: dodge
multiplies survivable away time by `1/(1-d)`, and away time is XP, so `d` *is* an XP multiplier whenever
an absence is food-limited. `1/(1-0.15) − 1 = +17.6%`, which sits inside `power-budget.js`'s
`PERMANENT_CAP` of 0.20. Measured against the real `simulateSpan` on three real builds, the actual
uplift came out **+16.6% / +17.3% / +19.3%**. That is the fuse, derived rather than asserted.

**PART 2.** A monster id is load-bearing in **12 live code/data/SQL files (238 references), 7 player-save
fields, 2 leaderboard columns, 1 server catalogue table, 1 deployed Edge-Function payload and 36 art
files.** The dangerous one is the save: **renaming `dragon` costs a live player 200 Renown, measured in the running
game (412 → 212)**, because Renown re-derives boss kills from `G.bestiary` keyed by monster id — and
`bossKills` and `renown` are both stamped into the leaderboard snapshot. **There is no `MONSTER_ALIAS`.**
`ITEM_ALIAS`/`remapItemIds` exists for items and has no monster equivalent. Building one is the hard
prerequisite for the rework, and it is cheap now and expensive later.

---

# PART 1 — AGILITY

## 1.1 · What I actually did first

I created a brand-new character and played it.

**The first five minutes are a death.** I sent the level-1 character at the game's own *Recommended* foe,
the Slime, and watched:

```
5 kills, then:  playerHp 0/10 -> deaths 0 -> 1   (~45 seconds of live combat)
combat log:  "You hit Slime for 2" / "Slime hits you for 1" / "You miss!" ...
skills after:  attack 73 xp, strength 0, defense 0, hitpoints 1177
```

Two things in that transcript matter more than the death:

1. **`defense` gained zero XP.** The default style for a sword is *Accurate*, which routes 100% of hit XP
   to Attack. A new player who does exactly what the game suggests never raises the one stat that would
   stop the death. (`Defensive` exists and routes all XP to Defence — at the cost of all Attack and
   Strength XP. That is the only way to train it.)
2. `deaths` **does** increment now. The b325 fix is live; that item can come off the standing backlog.

**Thirty minutes in, the difficulty is gone.** With Defence 11, 22 max HP and 200 cooked shrimp slotted,
I fought a Wolf for ten seconds and finished at **22/22 HP and 200/200 food** — monster accuracy 48.2%,
seven consecutive *"Wolf misses!"*. The cliff is entirely in the first half hour, and after it the fight
is not a survival problem at all.

That is the shape the rest of PART 1 is written against: **combat is lethal for thirty minutes and then
never again while you are at the screen.** The place survival still bites is the absence.

## 1.2 · Is dodge the right stat at all? — we already have TWO evasion artefacts

**Yes, we have one, and it is live.** `monsterCombatRolls` (`src/core/combat.js:222`):

```
accuracy = clamp(0.50 + (m.atk − playerDefence) × 0.006, 0.10, 0.85)
playerDefence = levelOf(skills,'defense') + eq.defB + bonus('defense')
```

Executed against the Goblin, one point of each input, measured:

| input | monster accuracy | delta |
|---|---|---|
| Defence level 1, no gear, no perk | 0.5180 | — |
| +1 Defence **level** | 0.5120 | −0.0060 |
| +1 **`defB`** | 0.5120 | −0.0060 |
| +1 **`bonus('defense')`** | 0.5120 | −0.0060 |

**One channel, three doors, identical weight.** And the player already sees the outcome — the combat log
prints `🛡️ Wolf misses!`. A "dodge" that reduces monster accuracy is *literally the same event with a
second name*. If we ship one, it must be a **different** event or the UI is lying about which system
produced it.

**We also have two DEAD defensive artefacts** — designed, authored, read by nothing:

- **`style.defenseMod`** — carried by **all 13 style rows** across the 4 weapon families in
  `src/core/styles.js` (counted by importing the module), plus `DEFAULT_STYLE` in `combat.js`. Grep
  across `src/`, `supabase/`, `tests/`: the only non-declaration hits are a smoke test asserting the
  *copy* must not promise it. So `Defensive` and `Guarded Smash` grant **no defence at all** — only an
  XP route.
- **`COMBAT_BALANCE.defenseXpMiss: 1` and `defenseXpDamageScale: 2`** — declared in `combat.js:42–43`,
  **zero readers anywhere in the repo** (grep returns exactly the two declaration lines). Someone
  designed *"you gain Defence XP when you are missed and when you take damage"* and it was never wired.
  **Wiring it is what would have made the §1.1 death self-correcting** — the character who is being hit
  is exactly the character who should be gaining the stat that stops it. Today they gain nothing.

> **Handoff, and it is bigger than Agility:** wiring `defenseXpMiss`/`defenseXpDamageScale` would give
> every player passive Defence XP from being attacked, which fixes the new-player death without any new
> skill and without any new power channel. It is a **Systems Engineer** change (it lives inside
> `simulateTick`, so it must land in the one loop and pay away identically). I have not proposed a number
> for it here because it interacts with the pacing anchor and belongs in its own ruling. **Recommend it
> is decided before Agility ships**, because if Defence trains passively, Agility's early-game job
> changes.

## 1.3 · The measurement that decides the design: the evasion channel is already saturated

The floor is `monsterMinAccuracy = 0.10`. Reaching it takes `m.atk + 66.7` points of defence. Executed
against a full plate set of each tier at that tier's own level band:

| set | set `defB` | + def level | total points | monsters already at the 10% floor |
|---|---|---|---|---|
| Bronze | 18 | 1 | 19 | **0 / 31** |
| Iron | 36 | 15 | 51 | **0 / 31** |
| Steel | 66 | 30 | 96 | **16 / 31** |
| Mithril | 104 | 45 | 149 | **28 / 31** |
| Rune | 153 | 60 | 213 | **31 / 31** |
| Emberforged | 210 | 75 | 285 | **31 / 31** |
| Dawnsteel | 281 | 88 | 369 | **31 / 31** |

**From Rune upward, every monster in the game is at the minimum hit chance, so every further point of
defence buys exactly nothing.** Best-in-slot `defB` across the whole catalogue is **410** (highest-`defB`
item per distinct `slot` value; a second ring would add 3); the Green Dragon floors at **172 points**.
That is **238 points of dead stat** on the most expensive gear in the game — and it means **the defence
value printed on Mithril, Rune, Emberforged and Dawnsteel armour is decorative for anyone fighting
tier-appropriate content.**

This is the finding that kills the obvious design. **Agility cannot be "more defence points."**

### And survival is not what gates live combat anyway

Time-to-death, real rolls, 200 seeded fights per row, **no food**:

| build | p.acc | m.acc | m.maxHit | TTD | kills before dying |
|---|---|---|---|---|---|
| lv1, bronze sword vs Slime | 72% | 51% | 1 | **1.0 min** | 4.5 |
| lv20 iron vs Wolf | 83% | 21% | 3 | 3.3 min | 11.9 |
| lv40 steel vs Dire Wolf | 95% | 10% | 8 | **4.9 min** | 18.5 |
| lv60 mithril vs Bear | 95% | 10% | 15 | 3.8 min | 9.3 |
| lv75 rune vs Death Knight | 95% | 10% | 26 | 2.7 min | 4.2 |
| lv99 dawnsteel vs Green Dragon | 95% | 10% | 47 | **1.9 min** | 1.9 |

**Every build dies, and the endgame dies fastest.** Evasion is floored at 10% everywhere past tier 3
while `monsterMaxHit = floor(atk × 0.45)` keeps climbing (1 → 47) against an HP pool that caps at 99.
The only thing that keeps anyone alive is **auto-eat**. One hour of combat, auto-eat on:

| build | kills/h | **food/h** | damage taken/h |
|---|---|---|---|
| lv1 vs Slime (heals 3) | 303 | **199** | 601 |
| lv40 steel vs Dire Wolf (heals 12) | 231 | 46 | 572 |
| lv75 rune vs Death Knight (heals 24) | 104 | 78 | 1,892 |
| lv99 dawn vs Green Dragon (heals 30) | 75 | **112** | 3,386 |

**Food, not defence, is the survival stat in this game.** And the same table shows the second thing that
decides the design: at every one of those rows, adding dodge changed **kills/hour by 0** and only moved
the food column. Dodge is a **consumable-cost reducer while you are at the screen** — which is a
perfectly good bonus, and it is exactly the currency the incoming Fletching / Runecrafting / Stonemason
supply skills will trade in.

## 1.4 · The fuse ruling — dodge is excluded from the +52% fuse and gets a HARD ceiling instead

### Why it must not join the additive fuse

The `+52%` permanent stack and the `≤0.60` fuse are enforced by `src/features/power-budget.js`, which is
**a monkey-patch wrapper on the client's `window.getBonus`**. The accrual Edge Function does not run it —
it passes `zeroBonus` (`supabase/functions/hr-accrue/accrual.js:95`, `export function zeroBonus() { return 0; }`)
into the exact same `playerCombatRolls` / `monsterCombatRolls`. So:

> **A dodge routed through a `getBonus` key would be capped on the client and read ZERO on the server.**
> The fuse is a client-only artefact. Putting a server-authoritative combat stat behind it would give us
> two different games and a parity test that has to be taught to lie.

Every source of power on the client goes through a seven-deep wrapper chain that `power-budget.js`
itself documents as having escaped its own fuse once already. **Adding an eighth is the recorded failure
mode, in writing, in that file's header.**

### The cap, derived

Dodge multiplies incoming DPS by `(1−d)`, therefore multiplies survivable time by `1/(1−d)`. When an
absence ends in death **before** the offline cap — which §1.5 shows is the normal case — that is a 1:1
XP multiplier:

| d | `1/(1−d) − 1` = worst-case away XP uplift | verdict against the shipped grammar |
|---|---|---|
| 10.0% | +11.1% | ≤ +15% (`bonus-rebase.md` permanent per-key ceiling) |
| **12.5%** | **+14.3%** | ≤ +15% — strictly inside the stated grammar |
| **15.0%** | **+17.6%** | ≤ +20% (`power-budget.js` `PERMANENT_CAP`) |
| 20.0% | +25.0% | ≤ +30% (`TOTAL_CAP`) |
| 25.0% | +33.3% | **outside every fuse in the game** |
| 57.6% | +135.8% | outside everything — **4.5× the absolute `TOTAL_CAP`** |

**Proposal: `COMBAT_BALANCE.dodgeCap = 0.15`**, beside `critCap: 0.60`, clamped in the same expression
the live tick and the accrual replay both run. `0.125` is the strict-to-`bonus-rebase` alternative and I
would not argue against it. **Tyler's call.** What is *not* a taste call is the shape: **one literal, in
`src/core/combat.js`, inside the one clamp.**

Why 0.576 is in that table: it is what a *plausible* dodge would reach if it were built like crit — the
real best-in-slot `critB` total across the whole catalogue is **0.378**, so a gear `dodgeB` ladder of the
same generosity plus 0.2%/level from Agility lands on **57.6%**, and the crit-style cap of 0.60 **would
not even bind.** That is the mistake this ruling exists to prevent, and the arithmetic says it is
**+136% away XP** — nine times the permanent per-key ceiling.

### The source: Agility level only, no gear, ever

```
dodge = clamp(levelOf(skills,'agility') / 99, 0, 1) × COMBAT_BALANCE.dodgeCap
```

Three properties fall out of "one source, and it is a skill":

1. **It pays away with no new `AWAY_SCOPE` entry** (§1.5), because `skills` is already passed identically
   to both paths.
2. **It is server-owned.** `player_skills` is the server's table; there is nothing for a client to forge.
3. **It can never become a second `spdB`.** No item may carry `dodgeB`, so there is no gear ladder to
   ship, and the standing moratorium is respected by construction rather than by discipline.

### The arithmetic at level 1, 50 and 99 (measured, no food, so TTD is visible)

`dodge = agility/99 × 0.15` → **agi 1 = 0.15% · agi 50 = 7.58% · agi 99 = 15.00%**

| stage | base monster accuracy | TTD @ agi 1 | TTD @ agi 50 | TTD @ agi 99 | gain |
|---|---|---|---|---|---|
| brand-new lv1 vs Slime | 50.6% | 0.97 min | 1.05 min | 1.13 min | **×1.167** |
| mid lv50 steel vs Bear | 10.0% (floored) | 3.17 min | 3.45 min | 3.75 min | **×1.182** |
| max lv99 dawnsteel vs Dragon | 10.0% (floored) | 2.01 min | 2.13 min | 2.31 min | **×1.153** |

Theoretical ceiling `1/(1−0.15) = 1.176×`. The three measured columns bracket it (1.153–1.182, seeded
sampling noise). **The model and the engine agree**, and — the point of the design — the gain is
*identical at every level*, because a post-clamp multiplier is indifferent to whether the channel
underneath it has saturated. That is what makes Agility live for all 99 of its levels instead of dying at
Steel plate the way `defB` does.

### Maximum achievable dodge with best-in-slot everything

**15.0%. Exactly.** Gear contributes zero by design, so the theoretical maximum equals the practical
maximum equals the literal in `COMBAT_BALANCE`. Effect at the ceiling:

- against a monster at the 10% floor: effective hit chance **10.0% → 8.5%**
- time-to-death: **×1.176**, uniformly
- Green Dragon, lv99 best-in-slot, no food: **2.01 min → 2.31 min**
- **it does not remove death.** A maxed player still dies to the Dragon in under two and a half minutes
  unattended without food. The away-death tension the Field Licence was built around **survives intact**
  — verified in §1.5.

## 1.5 · What dodge does to the away accrual, specifically

### `AWAY_SCOPE` — read, not assumed

```
{ permanent: true, crit: true, botd: true, heal: true, blessing: false, buff: false }
AWAY_RATE_MULT = 1.00
channelApplies('permanent', {away:true})              -> true
channelApplies('buff', {away:true})                   -> false
channelApplies('<any unregistered channel>', {away:true}) -> true   // unknown defaults to PAYING
```

**Agility dodge pays away, and it needs no row in that table.** The reason is structural, not a
convention: `AWAY_SCOPE` gates *bonus channels* — things that arrive through `getBonus`. Skill levels are
not a channel; they are state, and `simulateSpan` hands the same `skills` object to
`monsterCombatRolls` on both paths. The accrual engine does the same
(`accrual.js:340 — monsterCombatRolls(m, { eq, skills: state.skills, bonus: zeroBonus })`).

**I want the reasoning on the record rather than the answer**, because the `channelApplies` default is
"unknown pays". If Agility were ever refactored into a `getBonus` key it would *keep working away by
accident* on the client and *silently read zero* on the server. **The rule: dodge must be derived inside
`playerCombatRolls`/`monsterCombatRolls` from `skills`, never from `bonus(...)`.** That belongs in a
guard, not in a comment (§1.8, test 3).

### The measured effect on an absence — this is the number that matters

Real `simulateSpan`, `away:true`, 8-hour span, real food stacks, 16 seeds averaged:

| scenario | survived @ 0% | survived @ 15% | XP @ 0% | XP @ 15% | **uplift** |
|---|---|---|---|---|---|
| new lv1 vs Slime, 20 shrimp | 0.11 h | 0.13 h | 1,754 | 2,093 | **+19.3%** |
| lv40 steel vs Dire Wolf, 200 trout | 5.05 h | 5.92 h | 538,804 | 631,847 | **+17.3%** |
| lv99 dawn vs Dragon, 400 shark | 5.05 h | 5.87 h | 1,552,727 | 1,810,470 | **+16.6%** |

Three things to read off it:

1. **The uplift lands on the derived +17.6%, at every tier.** The fuse arithmetic is not a model — it is
   what the engine does.
2. **The early game is not rescued.** 0.11 h → 0.13 h: a new character still dies **under eight minutes
   into an eight-hour night**, and that already assumes auto-eat works — which for a real new character
   it does not, because `TRAITS.auto_eat` costs 100 marks (`away-combat-licence.md` §1). The true figure
   for a fresh save is worse than this table. **The Field Licence's premise is untouched by a 15%
   dodge**, which is exactly the property Tyler asked me to protect. (It would *not* survive the rejected
   form: at 50% dodge that same lv99/Dragon night goes 4.90 h → 8.00 h and **+63% XP**, and at 75% the
   player simply stops dying.)
3. **The bimodality is the real hazard, and 15% is what tames it.** Measured on a player who is *not*
   food-limited (lv75 rune vs Death Knight, 400 shark, surviving all 8 h at every dodge value):

   | dodge | food used | XP | survived |
   |---|---|---|---|
   | 0% | 355 | 1,719,340 | 8.00 h |
   | 12.5% | 312 | 1,718,871 | 8.00 h |
   | **15%** | **305** | **1,720,420** (+0.06%) | 8.00 h |
   | 75% | 90 | 1,720,187 | 8.00 h |

   **XP does not move at all** — not even at 75%. Dodge buys only food. But the moment the same player is
   food-limited it converts 1:1 into absence length and therefore into XP. Dodge's value is "nothing,
   until it is everything", and the cap is what bounds the "everything".

> **Flag to Systems, not a design change:** at 15% dodge, food consumption falls **355 → 305 (−14.1%),
> measured**. That is a **demand-side change to the cooking economy**, and it compounds with whatever
> Fletching / Runecrafting / Stonemason add to per-hour supply cost. It is a market input, not a balance
> bug, but it should be priced before the three supply skills are tuned.

## 1.6 · The skill itself

### What the player does

**A course of laps, in the gathering engine's shape.** Agility is a `TREES`/`ROCKS`/`FISH_SPOTS`-shaped
activity: pick a course, it runs on `G.activeSkill` / `skillMs` like every other idle action, it accrues
away like every other gathering activity, and it produces **no item**.

Producing nothing is deliberate. Every faucet in this game is a market input and a server-authority
surface; Agility's output is a *level*, and the level is the reward. It also keeps Agility out of the
reachability guard's blast radius entirely.

### The course table (proposal, `src/data/agility.js`)

Seven rungs on the same 1/15/30/45/60/75/90 band structure every other skill uses, so a player is never
more than ~15 levels from a visible upgrade:

| id | name | req | book xp | lap ms | effective xp | effective lap | xp/sec |
|---|---|---|---|---|---|---|---|
| `camp_run` | Wanderer's Run | 1 | 16 | 3200 | 6.2 | 5.1 s | 1.22 |
| `village_run` | Village Rooftops | 15 | 26 | 4300 | 10.1 | 6.9 s | 1.47 |
| `quarry_run` | Quarry Scramble | 30 | 44 | 5800 | 17.2 | 9.3 s | 1.85 |
| `canopy_run` | Canopy Crossing | 45 | 64 | 7200 | 25.0 | 11.5 s | 2.17 |
| `crag_run` | Stormcrag Ledges | 60 | 108 | 10200 | 42.1 | 16.3 s | 2.58 |
| `ember_run` | Emberfall Gantry | 75 | 148 | 11600 | 57.7 | 18.6 s | 3.11 |
| `dawn_run` | Dawnspire Ascent | 90 | 202 | 13000 | 78.8 | 20.8 s | 3.79 |

`book xp` is a **book value**, per the header rule in `src/data/gathering.js`: the live grant is
`floor(book × PACE.xp × (1+allXP))` and `PACE` (0.39 / 1.60) is the one pacing dial. **Do not retune
Agility by rewriting this table.**

**Monotonicity: PASS.** Every rung is strictly better xp/sec than the one below it — the b226 rule the
smoke suite already enforces for `TREES`/`ROCKS`/`FISH_SPOTS`.

**No second XP curve.** `src/core/xp.js` `XP_TABLE`, 99 levels, 13,034,431 XP to 99, unchanged.

### Pacing — sized to the existing anchor, measured

Hours to 99 on the best unlocked rung at 0% bonuses, computed through the real `pacedXp`/`pacedActionMs`:

| skill | hours to 99 | days @ 24 h | days @ 8 h |
|---|---|---|---|
| Woodcutting (shipped) | 1,870.9 | 78.0 | 233.9 |
| Mining (shipped) | 1,705.5 | 71.1 | 213.2 |
| Fishing (shipped) | 2,375.5 | 99.0 | 296.9 |
| **Agility (proposed)** | **1,920.5** | **80.0** | **240.1** |

**Within 2.7% of Woodcutting.** Agility is not a shortcut and it is not a punishment.

### What the player feels, per level

| level | dodge | course | laps to next level |
|---|---|---|---|
| 1 | 0.15% | Wanderer's Run | 14 |
| 15 | 2.27% | Village Rooftops | 34 |
| 30 | 4.55% | Quarry Scramble | 86 |
| 45 | 6.82% | Canopy Crossing | 260 |
| 60 | 9.09% | Stormcrag Ledges | 678 |
| 75 | 11.36% | Emberfall Gantry | 2,184 |
| 90 | 13.64% | Dawnspire Ascent | 7,064 |
| 98 | 14.85% | Dawnspire Ascent | 15,599 |

The honest weakness: **level 10 is worth 1.52% dodge, which no player can feel.** Addressed below.

### Data shape, per the systems map

```js
// src/data/agility.js  (new — grow by adding data, not code)
export const AGILITY_COURSES = [
  { id:'camp_run', name:"Wanderer's Run", icon:'…', req:1, xp:16, ms:3200,
    obstacles:['low_fence','stepping_logs','rope_swing'] },   // presentation + the course-slot layout
  …
];
```

- **`SKILLS_DEF`** gains one row: `agility:{name:'Agility',icon:'…',cat:'combat'}` — `cat:'combat'`
  because its only mechanical output is a combat stat, and the Skills page groups by `cat`.
- **`COMBAT_BALANCE`** gains `dodgeCap: 0.15` (a constant, in the file that owns combat constants).
- **`monsterCombatRolls`** gains one line, inside the existing return, after the existing clamp.
- **`src/core/pacing.js`** — Agility uses `gatherSpeed` via `speedKeyFor`'s default. Confirm that is
  intended rather than inherited; a Toolshed speeding up your obstacle course is a taste call.
- **Everything else is data.** No new feature module, no new `getBonus` key, no `AWAY_SCOPE` row.

### The gap I have not solved, stated rather than hidden

**Levels 1–20 of Agility are mechanically invisible** (≤3% dodge) and they are the levels a round-2 beta
player will actually reach in seven days. Three options, none of which I would ship without Tyler
choosing:

- **(a) Front-load the curve** — `dodge = dodgeCap × (level/99)^0.6`. Computed: **lv10 3.79% · lv20
  5.75% · lv50 9.96% · lv99 15.00%** — it moves the felt progress to where a beta player actually is and
  **lands on exactly the same ceiling**, so §1.4's fuse arithmetic is unchanged. One exponent, one
  source, one cap.
- **(b) Course slots pay something non-power** — unlock cadence, a cosmetic, a collection-log line.
- **(c) Accept it** — Agility is a long-tail skill and the first 20 levels are a promise, like Prayer's.

I lean **(a)**: it costs one exponent, changes no ceiling, and puts the felt progress where the player
actually is.

## 1.7 · Melvor's obstacle course — adopt the shape, reject the payload

**Adopt:** the *course* as the training fiction and as the layout decision. It suits an idle game for the
reason Tyler names — it is set-and-forget, it is a build choice that is not gear, and it gives Agility a
visual identity that a bare "train Agility" button does not. It also maps onto our engine with zero new
code: a course is a gathering node with `prod:null`.

**Reject:** *obstacles granting arbitrary passive bonuses.* In Melvor each obstacle grants a grab-bag of
modifiers. In Hearthrise that would be **an eighth writer into the `getBonus` chain**, and
`src/features/power-budget.js` exists — and installs itself last, on a one-second interval, forever —
precisely because that chain escaped its own fuse once. Its header names the failure: *"a fuse that a
later wrapper escapes is worse than no fuse."* An obstacle course that hands out `+gatherSpeed`,
`+goldFind`, `+allXP` would reproduce it exactly, and this time on the *server*, where `zeroBonus` means
the ceiling is not even present.

**Adapt:** obstacles are **presentation and layout only** in v1 — they name the course, they are what the
art shows, and the slot count grows with level. If they ever pay, they pay in **the one currency Agility
owns** (dodge, inside the same 15% cap) or in a currency with no throughput conversion at all. Which is
the same principle `src/core/styles.js` already applies to `speedMod`: *make the ceiling an invariant of
the formula, not a promise about the table.*

## 1.8 · Regression coverage this would require

Written the way `CLAUDE.md` demands — each must be **mutation-proven RED** with the bug present.

1. **The cap is real and it is the only one.** With Agility 99 and every dodge-granting surface the test
   can find, `dodge ≤ COMBAT_BALANCE.dodgeCap`. Mutation: raise the level term → RED.
2. **No item may carry a dodge stat.** Walk the merged `ITEMS`; assert no entry has `dodgeB` (or any key
   matching `/dodge/i`). Mutation: add one to a test item → RED. *This is the guard that keeps Agility
   from becoming the speed-gear ladder.*
3. **Dodge comes from `skills`, never from `bonus`.** Call `monsterCombatRolls` with a `bonus` that
   returns a large number for every key, and assert the dodge term does not move. Mutation: route it
   through `bonus('dodge')` → RED.
4. **Away parity.** The existing `AWAY-1` byte-identity test, re-run with Agility 99: a seeded fight must
   be identical through `away:false` and `away:true`. Mutation: gate dodge on `!ctx.away` → RED.
5. **Server parity.** `tests/accrual-engine.mjs`'s parity claim, with Agility 99 in `player_skills`.
   Mutation: drop `skills` from the server's `monsterRolls` ctx → RED.
6. **Monotonicity + pacing.** Extend the existing `TREES`/`ROCKS` rung guard to `AGILITY_COURSES`, and
   assert hours-to-99 sits within ±15% of Woodcutting's. Mutation: halve a `ms` → RED.
7. **Death still happens.** At Agility 99, best-in-slot, a lv99 character left on the Green Dragon with
   no food must still report `died:true` inside an 8-hour span. Mutation: raise `dodgeCap` to 0.9 → RED.
   *This is the Field Licence's guard, and it is the most important one in the list.*

## 1.9 · Explicit calls for Tyler

1. **`dodgeCap` = 0.15 (+17.6% worst case, inside `PERMANENT_CAP`) or 0.125 (+14.3%, inside the stated
   +15% grammar)?** I recommend 0.15.
2. **Curve shape:** linear, or the `^0.6` front-load that makes the first twenty levels legible?
3. **Wire `defenseXpMiss` / `defenseXpDamageScale` first?** It is a bigger fix than Agility for the
   problem Agility is being asked to solve, and it changes what Agility is for.
4. **Does the obstacle course pay anything beyond dodge in v1?** My answer is no, for the
   power-budget reason above.

---

# PART 2 — MONSTER REWORK GROUNDWORK (audit)

**Scope note, and I agree with the gate:** this is the blast radius, not the rework. Elements define the
vocabulary a monster is described in; reworking the roster before that vocabulary exists means doing it
twice. Nothing below designs a monster.

## 2.1 · The data shape, printed

31 monsters. Field census across all 31 (`field → how many monsters carry it`):

```
name        31/31      hp          31/31
icon        31/31      atk         31/31
tier        31/31      def         31/31
family      31/31      xp          31/31
weaponWeak  31/31      gp          31/31
drops       31/31      boss         2/31
```

One row, verbatim:

```js
slime:{name:'Slime',icon:'🟢',tier:1,family:'Vermin',weaponWeak:'sword',
       hp:8,atk:2,def:0,xp:5,gp:[1,3],
       drops:[{id:'slime_gel',ch:.8},{id:'bones',ch:.25},{id:'sticky_core',ch:.02}]}
```

**Eleven fields, one optional. There is no element, no resistance, no ability, no level requirement, no
attack style, no speed, and no art reference** (`icon` is an emoji fallback; the real portrait is mapped
by id in `legacy.js`'s `LOCAL_MONSTER_ICON`). `src/data/bosses.js` — the b281 registry — *already* carries
`style`, `weakness`, `resist[]`, `reqLv` and `mechanic`. **That is the shape the monster rework should
converge on, and half of it already exists in the repo.**

## 2.2 · Roster and pacing

| tier | n | atk range | hp range | xp range |
|---|---|---|---|---|
| 1 | 5 | 2–5 | 8–16 | 5–14 |
| 2 | 5 | 7–12 | 24–35 | 24–55 |
| 3 | 5 | 14–24 | 52–78 | 82–135 |
| 4 | **6** | 26–40 | 100–165 | 210–340 |
| 5 | 5 | 48–72 | 190–260 | 475–680 |
| 6 | 5 | 55–105 | 340–520 | 800–1250 |

Weakness distribution looks even — sword 6 · hammer 6 · ranged 7 · magic 6 · neutral 6 — but read
`weaknessInfo()` before trusting that: `matched = weak !== 'neutral' && eq.weaponType === weak`, so a
`neutral` monster **has no weakness at all**; it pays a flat `NEUTRAL_DROP_BONUS` of ×1.15 drops
regardless of what you swing. **So 25 of 31 monsters participate in the weapon triangle, and 6 opt out.**

And there is **exactly ONE axis**. No element, no resistance, no immunity exists anywhere in the monster
data. Tyler's gate is correct: describing a monster is currently a one-word vocabulary.

### Where the roster is thin — the family × tier grid

| family | T1 | T2 | T3 | T4 | T5 | T6 |
|---|---|---|---|---|---|---|
| **Vermin** | slime *(+rat)* | giant_bat | venom_spider | plague_swarm | shadow_creeper | void_parasite |
| **Goblinoid** | goblin | hobgoblin | goblin_brute | goblin_warlord | warband_captain | war_king |
| **Undead** | weak_skeleton | skeleton | zombie | wraith | death_knight | lich |
| **Beast** | small_wolf | wolf | dire_wolf | bear | panther | ancient_bear |
| **Arcane** | — | dark_wizard | warlock | — | archmage | — |
| **Mythic** | — | — | — | lesser_demon | — | dragon |

Read honestly, that grid is the whole diagnosis:

- **Four families run the complete ladder, and they are the same four enemies re-skinned six times.** The
  Beast line is `small_wolf → wolf → dire_wolf → bear → panther → ancient_bear` — two wolves, two bears.
  The Goblinoid line is one goblin, six times, with a bigger hat. A player's entire 99-level combat
  journey is four silhouettes with rising numbers.
- **Arcane has 3 of 6 rungs, Mythic has 2 of 6.** The two most *interesting* families are the two least
  built out.
- **Only 2 bosses in the whole `MONSTERS` table** (`lich`, `dragon`), both tier 6, both weekly/daily
  rotation fodder. The dungeon bosses live in a different file and a different shape.
- **`mountain_troll` is the odd one out and should be looked at first.** It is the sixth tier-4 entry
  (every other tier has five), it duplicates the Beast slot `bear` already holds, and — verified at
  runtime — **it is the one monster with no portrait, no glyph and no `LOCAL_MONSTER_ICON` entry**
  (`_monsterIcon` has 30 keys; `mountain_troll` is `undefined`). It renders as the emoji 🧌, which the
  Final Directive forbids outright. → **Art Director**.
- **There is no level gate on fighting anything.** `startCombat(mId)` (`legacy.js:3088`) checks nothing.
  A level-1 character can click the Green Dragon. The tiers are tabs, not gates, and the only pacing
  signal is the *Recommended* card.

## 2.3 · The dependency map

**19 files hold a literal monster id; 356 quoted references.** Scanned with a **control** (two ids that
do not exist), which returned **0 files** — so the scan is not blind. Of that total, **12 files / 238
references are live code, data or SQL**; the remainder is 4 docs (27), an unshipped `_archive/` pair
(60), and a gitignored local `hearthrise-map.html` (31 — a 174 KB stale roster copy that is **not**
deployed, verified with `git check-ignore`; it is a dev artefact, not a risk).

| refs | file | what breaks if an id changes |
|---:|---|---|
| 93 | `src/features/smoke-test.js` | tests reference `slime`/`rat`/`goblin`/`wolf`/… by name |
| 42 | `src/legacy.js` | **a second, drifted copy of the whole table** (§2.4) + achievements + icon map |
| 31 | `supabase/migrations/2026-08-11-catalogue.generated.sql` | `hr_activity_catalogue` — the server's list of legal `player_state.active_id` |
| 30 | `src/data/glyphs.js` | `HR_MONSTER_GLYPHS`, the baked icon atlas |
| 28 | `src/core/botd.js` | **`DAILY_POOL` (21) + `WEEKLY_POOL` (7)** — and the header says *ORDER IS LOAD-BEARING, append only*: reordering or removing an id **re-rolls the entire Boss-of-the-Day history** |
| 4 | `src/dungeons.js` | dungeon identity (`kind:'mon'`) + **`KEY_DROPS`** |
| 4 | `tests/accrual-engine.mjs` | the server-parity fixture |
| 2 | `src/data/gear-tiers.js` | `warlock`, `archmage` |
| 1 each | `src/core/bounty.js`, `src/utils/data-integrity.js`, `tests/core-purity.mjs`, `tests/run-smoke.mjs` | fallbacks and fixtures |

Plus the **structural** consumers that read `MONSTERS` without naming an id, and therefore break quietly
rather than loudly:

- `src/core/combat.js` / `combat-sim.js` — the one loop. Unknown id → `activeMonster = null`, `STOP`.
- `src/core/bounty.js` — generates board offers **from the live catalogue** and **persists the chosen id
  into the save**.
- `src/features/collection-log.js` — completion % has `Object.keys(MONSTERS).length` as its **denominator**.
- `src/features/renown.js` — sums `bestiary[id].kills` where `MONSTERS[id].boss`.
- `src/features/muster.js` — clan muster points are `10 × MONSTERS[activeMonster].tier`. **Changing a
  tier changes clan contribution rates.**
- `src/features/chronicle.js`, `drop-log.js`, `boss-of-the-day.js`, `companions.js`, `combat-render.js`,
  `home-dashboard.js`, `profile-launchpad.js`, `item-index.js`, `icon-set.js`, `admin.js`.
- `supabase/functions/hr-accrue/{index.ts,accrual.js}` — the deployed engine.

### The dungeon keys are the sharpest edge

`src/dungeons.js` `KEY_DROPS` binds **16 monster ids** to dungeon keys:

```
bone_key        weak_skeleton .025  skeleton .04  zombie .05
goblin_seal     goblin .02  hobgoblin .04  goblin_brute .06  goblin_warlord .10
arcane_tome     dark_wizard .04  warlock .06  archmage .10
obsidian_sigil  death_knight .05  warband_captain .07
void_fragment   plague_swarm .05  void_parasite .10
dragonsbane_key dragon .30                      // "only the dragon itself"
```

**Rename `dragon` and the Ancient Wyrm dungeon becomes permanently unreachable** — its key has exactly
one source. Same single-source risk for `plague_swarm`/`void_parasite` if either is cut.

And 45 of 71 drop items have **exactly one monster source**. Cutting `panther` deletes `shadow_pelt`,
`razor_claw`, `ruby` and `raw_panther_meat` from the game; cutting `dragon` deletes five including
`marrow_cookbook` and `gemcutter_note`.

## 2.4 · Monster ids in a SAVE — the dangerous one

Probed the **live running game** by walking `G` for any string or key matching a monster id:

```
G.bountyHunter.board[0].target = "small_wolf"
G.bountyHunter.board[1].target = "weak_skeleton"
G.bountyHunter.board[2].target = "slime"
G.bestiary.<KEY slime>
G.dropLog.<KEY slime>
G.lastActivity.id = "slime"
```

Full list of save surfaces holding a monster id:

| field | shape | synced? | what a rename does |
|---|---|---|---|
| `G.bestiary` | **keyed by monster id** | **yes** | collection-log entry orphaned; **Renown boss term zeroed** |
| `G.dropLog` | **keyed by monster id**, `.drops` keyed by *item* id | **yes** | the per-monster kill/drop history is orphaned |
| `G.bountyHunter.board[].target`, `.active.target`, `.id` | monster id, and it is **baked into the bounty's own id string** | **yes** | an accepted bounty can never complete |
| `G.bountyHunter.*.proofItem` | item id derived from the monster | **yes** | a proof bounty asks for an item nothing drops |
| `G.lastActivity.id` | monster id | **yes** | the launchpad's Resume points at nothing |
| `G.chronicle.entries[].id` | `'boss:' + monsterId` | **yes** | the idempotency key `record()` de-dupes on is orphaned, so a re-kill under the new id writes a **second** "First kill" row (display text survives — it stores the name at write time) |
| `G.activeMonster` | monster id | **`NO_SYNC`** | the in-flight fight is dropped |
| **snapshot `bossKills`** | derived from `bestiary` × `MONSTERS[].boss` | **leaderboard column** | **the player's Bosses-board score drops** |
| **snapshot `renown`** | derived, includes the boss term | **leaderboard column** | **the player's Throne-board score drops** |

### Measured, in the running game

I set a live character's `bestiary` to 40 dragon kills + 25 lich kills, read Renown, renamed `dragon` →
`wyrm_verdant` in the catalogue with the save still holding the old key, and read Renown again:

```
before rename : HearthriseRenown.compute() = 412
after  rename : HearthriseRenown.compute() = 212      <- 200 Renown, gone
restored      : 412
```

**200 Renown lost from one id.** `computeRenown` is fully derived — it recomputes from scratch on every
call — so the loss is immediate and total.

**It is not a demotion**, and the reason is worth knowing: `effectiveRenown()` keeps a high-water mark in
`G.renownHigh`, so the *rank* does not fall and the perks are not revoked. **What is lost is the
player's progress toward the next rank** — they must re-earn 200 Renown before the bar moves again — and
the **live** number they see on the ladder, and the **leaderboard** value stamped into the snapshot.

`dragon_slayer` in `legacy.js:9820` also carries the id inside a string path — `src:'bestiary.dragon.kills'`
— so that achievement silently stops progressing.

### And there is no `MONSTER_ALIAS`

`legacy.js:826–868` implements `window.ITEM_ALIAS` + `remapItemIds(G)`, applied on **every load**,
covering inventory / equipment / collection / lockedItems / buyback / auto-eat food. Its header says
exactly why: *"a rename silently vaporises a player's inventory… the 'SAFE TO EXTEND' prerequisite."*

**There is no equivalent for monsters.** Grep: `MONSTER_ALIAS` — zero hits.

**Second, pre-existing gap found while looking:** `remapItemIds` does **not** walk
`G.dropLog[monsterId].drops[itemId]`, so *item* renames already orphan the drop log. That is an existing
bug in the item alias layer, independent of monsters. → **Systems Engineer.**

### The legacy.js second copy, and what it silently deletes

`src/legacy.js:92` declares its own inline `const MONSTERS = {…}` (6,955 chars), which `main.js`
`unifyObject` merges with **whole-entry `Object.assign` — ESM wins per key.**

Both copies hold the same 31 ids (nothing legacy-only, nothing ESM-only), but **14 of 31 entries
diverge**, all on `drops`. Twelve are harmless — ESM adds a drop, or the same set is merely reordered
(`wraith`, `lich`). **Two are not:**

```
goblin_brute : legacy has troll_hide @ 8%   -> ESM does not  -> DELETED at runtime
bear         : legacy has troll_hide @ 18%  -> ESM does not  -> DELETED at runtime
```

`troll_hide` survives only because `mountain_troll` drops it at 70%. **`src/utils/data-integrity.js`
compares KEY SETS only** — it would catch a monster present in one copy and not the other, and it cannot
see a field diverging inside an entry, which is why this has been silently live. → a per-entry
deep-compare belongs in that guard. **Systems Engineer.**

## 2.5 · The server surfaces

1. **The Edge Function payload.** `tools/pack-edge.mjs` vendors **`vendor/data/monsters.js`** into
   `hr-accrue` (23 files). Verified by running the packer. So **any edit to `monsters.js` moves
   `payload_sha256` and requires an Edge redeploy**, and `deployedPayloadGuard` will go RED until it
   happens. Since b332 a cache-buster bump alone no longer moves the hash — but a monster change does.
2. **`hr_activity_catalogue`** holds all 31 ids as `('combat','<id>',null,null)`. Generated by
   `tools/gen-catalogues.mjs`; it is the list of ids `player_state.active_id` may legally hold.
3. **The accrual engine fails closed, and that is good:**
   `accrual.js:186 — if (!monsters[inp.activeId]) return { accrued:false, reason: SKIP.NO_TARGET }`.
   `index.ts:340` then returns without writing, so **the watermark is not advanced and the time is not
   confiscated.** The player is not robbed — but their away combat silently pays **nothing, forever**,
   until they pick a different foe, and the only signal is a machine code (`unknown_monster`).
4. **Leaderboards.** `bossKills` and `renown` are stamped into the snapshot
   (`smoke-test.js:8624` — *"bossKills, which the server cannot compute — it has no MONSTERS"*), so a
   monster-id change moves ranked, cross-player values.

## 2.6 · Art

36 PNGs in `assets/icons-bundle/painted/monsters/` — **30 monsters + 6 dungeon/raid bosses**
(`crownless_wyrm`, `emberclad_tyrant`, `hollow_regent`, `maw_below`, `sunken_choir`, `warden_long_dark`).

- **`mountain_troll` has no portrait, no glyph and no icon-map entry.** Confirmed at runtime.
- Every id appears in **three** places that must agree: the PNG filename, `HR_MONSTER_GLYPHS` in
  `src/data/glyphs.js` (generated), and `LOCAL_MONSTER_ICON` in `legacy.js`. A rename is a **three-file**
  rename plus a regenerate, and only the last one is enforced by a smoke assertion.
- Per `itemization-and-art-pipeline.md`, monster portraits are Style B. **A new monster is not a data row
  — it is a data row plus a commissioned portrait plus two map entries.** That is the real per-monster
  cost of a rework and it should be in the estimate.

## 2.7 · What a rework must not break

**P0 — prerequisites. Build these before touching a single id.**

1. **`MONSTER_ALIAS` + `remapMonsterIds(G)`**, applied on every load exactly like `remapItemIds`, covering
   all nine save/snapshot surfaces in §2.4 — including the *string-embedded* ids in `bountyHunter.*.id`
   and `chronicle.entries[].id`. Ships with a round-trip test.
2. **Server-side migration** for `player_state.active_id` and `hr_activity_catalogue`, and a **redeploy
   of `hr-accrue`** in the same change. Note the ordering hazard the handoff already records: the client
   and the deployed payload must not disagree about the roster across a deploy window.
3. **`botd.js` pool ORDER is append-only.** Removing or reordering re-rolls every player's
   Boss-of-the-Day history. If an id in a pool is cut, it must be *aliased*, never deleted.
4. **Single-source drops.** 45 of 71 drop items have exactly one monster source, and
   `dragonsbane_key` has exactly one. Any cut needs a replacement source **in the same commit**, or the
   b243 reachability guard goes RED — which is the system working.
5. **`KEY_DROPS`** (16 ids) must be re-pointed, or a dungeon becomes unreachable.

**P1 — invariants to hold.**

6. **Renown and `bossKills` must not fall.** Aliasing achieves this; nothing else does. The high-water
   mark protects the *rank*, not the progress.
7. **Collection-log denominator.** `Object.keys(MONSTERS).length` is the divisor — **adding monsters
   lowers every existing player's completion %.** With a wipe at cutover that is free *now* and expensive
   after. Strong argument for doing the roster expansion **before** round 2 opens, not after.
8. **The `>= 25` monster-count smoke assertion** (`smoke-test.js:231`) — a rework that shrinks the roster
   below 25 goes RED.
9. **Muster points are `10 × tier`.** Re-tiering a monster changes clan contribution rates. → **Systems.**
10. **93 monster-id references live in the smoke suite.** Any rename is a test-file rename too.

**P2 — housekeeping the rework should absorb.**

11. Reconcile or delete `legacy.js`'s inline `MONSTERS` copy, and deepen `data-integrity.js` to a
    per-entry compare (§2.4).
12. `hearthrise-map.html` (174 KB, 31 stale ids) — **gitignored, so not deployed**; still a stale local
    copy of the roster that will read wrong to the next person who opens it. Regenerate or delete.
13. `mountain_troll`: give it art or fold it into the Beast line.

## 2.8 · What it would cost, honestly

For a rework that keeps all 31 existing ids and **adds** to the roster (fills Arcane T1/T4/T6, Mythic
T1/T2/T3/T5, adds real bosses, adds element + resist fields):

| piece | cost | who |
|---|---|---|
| `MONSTER_ALIAS` + `remapMonsterIds` + round-trip test | **~1 day** — and it is *required* whether or not any id changes, because the rework will change some | Systems |
| Element/resist fields on 31 rows + the combat term that reads them | ~1 day data, ~1 day engine + guards | Designer + Systems |
| **Per NEW monster: data row + Style B portrait + glyph + icon map + drop routing** | **~0.5 day each, and the portrait is the long pole** | Designer + Art + Asset |
| 10 new monsters (fills every hole in the grid) | ~5 days + 10 commissioned portraits | — |
| Catalogue regen + migration + Edge redeploy + payload-hash verify | ~0.5 day, **must be one commit** | Systems |
| Rebalancing `atk`/`hp`/`xp` across a widened roster, re-measured against the pacing anchor | ~1 day | Designer |
| Smoke-suite updates (93 references) | ~0.5 day | QA |

**≈ 10 working days plus ~10 portraits**, and it is **strictly gated on the element system**, exactly as
Tyler said. The one piece worth doing *early and separately* is the alias layer — it is a prerequisite
for the rework, it is independently useful, and it is the thing that turns "rename a monster" from
surgery into a one-line map edit.

**The cheapest high-value slice, if the full rework waits:** fill **Arcane T1 / T4 / T6** and **Mythic
T1 / T2 / T3 / T5** — 7 monsters — which turns two half-built families into complete ladders and breaks
the "four silhouettes, six times" feel without touching a single existing id. Zero migration risk.

## 2.9 · Two corrections to the standing backlog

1. **"~25 tier-3–6 combat drops are vendor-trash with no recipe" is NO LONGER TRUE.** Re-measured against
   all 292 recipes (correctly reading `inputs` — the plural object form — as well as `input`, with
   `bones`/`raw_wolf_meat` as positive controls and a fake id as a negative control): **there are 4
   dead-end drops in the entire game, all tier 1** — `sticky_core`, `rat_tail`, `goblin_ear`,
   `goblin_totem`. Those are **exactly** `window.__DROP_SINK_EXEMPT` in `legacy.js`, the deliberate
   early-gold faucet. **Tier 3–6 dead-end drops: 0.** The b215 armour-tier work closed this. It can come
   off the backlog.
2. **`G.stats.deaths` now increments.** Observed live: 0 → 1 on the level-1 slime death. `resolveDeath`
   in `combat-sim.js` owns it, on both paths. Also off the backlog.

---

## Appendix A · How to reproduce every number here

Each table was produced by importing the shipped modules directly in Node (they run outside a browser by
design — `src/core/*` is DOM-free). No fixtures, no stand-ins.

| § | source of truth | method |
|---|---|---|
| 1.1 | the running game, served from the repo root by a local static server | played a new character; read `G.stats`, `G.skills`, `G.combatLog`, `getMonsterCombatRolls` |
| 1.2 | `src/core/combat.js` | `monsterCombatRolls` with one point of each input, deltas compared |
| 1.3 | `combat.js` + `gear-tiers.js` + `monsters.js` | closed-form floor `atk + (0.50−0.10)/0.006`, then 200-seed Monte Carlo on `rollAttack`/`rollCrit` |
| 1.4 | same Monte Carlo, 200 seeds per cell | the `d`-table is closed-form `1/(1−d)−1`; the level 1/50/99 TTD table is measured and must bracket it |
| 1.5 | `src/core/away.js` + `combat-sim.js` `simulateSpan` | `AWAY_SCOPE` printed; `channelApplies` called with a deliberately unregistered channel; then 16 seeds × 3 builds × `away:true`, food through `fx.autoEat` |
| 1.6 | `src/core/pacing.js` + `xp.js` | best-unlocked-rung integration to 13,034,431 XP through the real `pacedXp`/`pacedActionMs` |
| 2.1–2.2 | `src/data/monsters.js` | field census + family×tier grid |
| 2.3 | whole repo | quoted-id scan **with a two-id control that returned 0 files** |
| 2.4 | the running game | walked `G`; then renamed `dragon` in the live catalogue and re-read `HearthriseRenown.compute()` |
| 2.4b | `legacy.js` + `monsters.js` | brace-matched the inline block, `eval`'d it, deep-compared 31 entries |
| 2.5 | `tools/pack-edge.mjs` | ran `pack('hr-accrue')` and listed the payload |
| 2.6 | filesystem + runtime | `readdir` on `painted/monsters`, cross-referenced against ids, `HR_MONSTER_GLYPHS` and the live `_monsterIcon` |
| 2.9 | `recipes.js` + `gear-tiers.js` | 292 recipes, both input shapes, positive **and** negative controls |

`main` was **684/684, 0 runtime errors** before and after this work. **No source file was modified.**
