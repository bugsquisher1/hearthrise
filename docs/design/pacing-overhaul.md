# Pacing overhaul — the progression retune

**Owner:** Game Designer · **Date:** 2026-08-09 · **Build measured:** b225 (`24514eb`)
**Brief:** `DECISIONS.md` → *2026-08-09 · Pacing directive* (Tyler, binding) and the P0 of
`docs/reports/AUDIT-2026-08-08-player-journey.md`.
**Binding parameters I am designing inside:** presence bonus **+10–15%, not more**; endgame (99s /
top gear) takes **months** of normal play; **rate reductions are authorized**; **earned progress is
never clawed back**.

Every number below was derived from the shipped data (`src/data/gathering.js`, `recipes.js`,
`items.js`, `XP_TABLE` in `legacy.js`) by simulating the actual action loop — best-tool speed ladder
included, rung switching at the real level gates. No estimates carried over from the audit.

---

## 0 · The headline

| | first 99 | all 15 skills to 99 | 9h offline, fresh account | max gold faucet (raw vendoring) |
|---|---|---|---|---|
| **Today** | **4.5 days** | ~106 days | WC **59–62** · **16,200** logs · **129,600 g** | **560,000 g/h** (6.7 M per 12h) |
| **Retuned** | **28 days** | **~10.3 months** | WC **44** · **7,449** logs · **11,918 g** | **77,000 g/h** (0.93 M per 12h) |
| factor | **×6.2 slower** | **×3.0 slower** | ×2.2 fewer logs, **×10.9 less gold** | **×7.3 smaller** |

Three constants and one seam do all of it:

| lever | value | what it does |
|---|---|---|
| `PACE.xp` | **0.55** | global XP multiplier on every skill action (see §4.1 for the per-skill curve correction folded in) |
| `PACE.actionMs` | **1.45** | global action-duration multiplier on gathering + artisan |
| offline cap | **12h/day budget** (was 12h per gap) | kills the multi-login banking pattern; the honest sleep pattern is untouched |
| presence | **×1.12 XP while online** | Tyler's +10–15%, implemented as a bonus — nothing is taken away |

Plus two data corrections that are pacing bugs in their own right and must ship with it:
**raw-material vendor rate 0.20** (§6) and **farming XP ×14** (§8.3 — farming 99 is currently
unreachable by a factor of ~40).

---

## 1 · The current reality, measured

### 1.1 Hours to level, today

Simulated against the shipped tables, best owned tool applied, player always on the best rung they
can use. "+25% allXP" is the realistic mid-game stack (Library 20% + a renown rank).

**0% allXP (fresh player, no perks):**

| skill | L50 | L75 | L92 | **L99** | items at 99 | vendor gold at 99 |
|---|---|---|---|---|---|---|
| Woodcutting | 2.0h | 16.2h | 67.1h | **120.5h** | 50,707 | 27.3 M |
| Mining | 2.7h | 29.5h | 130.7h | **235.8h** | 104,289 | 58.2 M |
| Fishing | 3.1h | 24.7h | 115.3h | **203.7h** | 75,688 | 38.5 M |
| Cooking | 0.9h | 6.6h | 26.7h | **46.1h** | 39,127 | — |

**+25% allXP:** Woodcutting **96.5h**, Mining **189.3h**, Fishing **163.4h**, Cooking **36.9h**.
**+52% allXP (the CONFLICTS ceiling):** Woodcutting **79.4h**.

### 1.2 XP per hour per rung — where the curve actually is

| | tier 1 | tier 4 | tier 7 | items/h at tier 1 |
|---|---|---|---|---|
| Trees | 30,000 xp/h | 51,429 | 91,385 | **1,800** |
| Rocks | 21,600 xp/h | 33,429 | 46,500 | **1,800** |
| Fish | 10,286 xp/h | 36,000 | 55,286 | **2,057** |

Two pre-existing defects visible here, both fixed by §4.1:
- **Woodcutting is ~2× faster to 99 than mining or fishing.** Trees carry the highest xp-per-second
  at every rung. It is the starter skill and it is also the fastest 99 in the game.
- **Mithril Rock (req 60, 32,000 xp/h) is *slower* than Gold Rock (req 45, 33,429 xp/h).** The
  ladder goes backwards at level 60 — a player who unlocks mithril and switches is punished.

### 1.3 Offline behaviour — what `processOffline()` actually does

`src/legacy.js:546` → `doSkillAction(true)`; the comment is explicit: *"Offline gather runs at the
same rate as active play — no dampening."* Cap `Math.min(elapsed, cap)`, cap = 12h F2P / 16h
Offline+, plus renown, property (`+1…+4h`) and clan (`+1…+2h`) hours.

**The cap is per login gap, not per day.** A player with a 9h sleep gap and a 9h work gap banks
**18–19 hours of full-rate progress every day** and still has their evening free to play. Combined
with 2.5h of active play, today's engaged player converts wall-clock into progress at
**≈21.5 effective game-hours per day**. That, not the XP table, is why the first 99 lands in 4.5 days.

### 1.4 The audit's 9h repro, reproduced arithmetically

9h ÷ 3.0s = 10,800 actions × 25 XP = 270,000 XP → **Woodcutting 59**, 1.5 logs/action =
**16,200 logs** = **129,600 gold** at the vendor. The audit measured WC 62 / 16,110 logs; the
difference is renown/room bonuses on that save. The model is sound.

### 1.5 The `allXP` stack today

| source | max |
|---|---|
| Library room (L1–L3) | +20% |
| Renown ranks (cumulative) | +22% |
| Castle capstone `isCastle()` | +5% |
| Clan perks | +5% |
| **permanent total** | **+52%** (fuse ≤ 0.60 — CONFLICTS 2026-08-08 §3) |
| Rally aura while mustered | +10% |
| World event (Scholar's Day / Grand Fair) | +10–15% |
| Tavern-10 Feast at Last Call | +36% |

### 1.6 **DISCOVERY — offline already has an accidental, invisible, gear-dependent dampener**

`startSkill()` stores the **raw** duration (`G.skillMs = ms`, line 1621) and computes
`actualMs = ms × (1 − gatherSpeed − toolSpeed)` into a **local** (line 1625). `processOffline()`
divides by `G.skillMs` (line 594). Same shape in the artisan path (line 7086 / line 586).

**Consequence:** a player with a Rune Axe and a Toolshed gathers up to **30–40% slower offline than
online**, and nothing in the game says so. Today's offline is therefore *not* "the same rate as
active play" for anyone geared — it is the same rate only for the fresh account the audit tested.

This must be made deliberate: store `actualMs`, so **the presence bonus in §5 is the only
online/offline differential in the game.** An invisible gear-scaled penalty is the exact kind of
drift the professional standard exists to catch. **Owner: Systems.**

---

## 2 · The target curve, and why

### 2.1 What "endgame in months" has to mean

Endgame is not the first 99. In OSRS a dedicated player's first 99 arrives in weeks and the max cape
takes a year or more; that gap *is* the retention structure. Melvor Idle — the closest structural
analogue and the proof-of-model this project already cites — has the same shape: a single skill maxes
in tens of hours of idle time, full completion runs past a thousand.

Hearthrise's session model differs in one decisive way: **it converts wall-clock, not attention.**
A Hearthrise player banks ~21 hours a day whatever they do. So the target must be stated in *days*,
not hours, and the day-conversion rate is a design lever equal in weight to the XP rate.

### 2.2 The target

| milestone | target | why |
|---|---|---|
| First skill to 99 | **4 weeks** | Late enough to be a real climb; early enough that the first month has a landmark ending. A first 99 at 4 months is how you lose people in week 3. |
| Any second/third 99 | 4 weeks each | Skills train one at a time (`G.activeSkill` is singular) — the ladder is additive by construction. |
| Combat 99s | ~5 weeks each | Combat ticks are not slowed (§4.4); combat is long because there are seven of them. |
| **All 15 skills to 99 (max)** | **~10 months** | Tyler's "months", with room. |
| **Top gear — Hunt-forged BIS** | **≥16 Hunt weeks ≈ 4 months, floor** | Rate-independent. See §7. |
| First house upgrade | ~25 min of play | Unchanged in feel; the requirement is 30 logs. |
| Combat 25 (first dungeon) | ~3 days | The audit's "six locked doors" becomes one visible door a few days out. |

### 2.3 The day model this is measured against

The **engaged player**: 2.5h active per day, plus overnight idle, plus incidental gaps.

|  | today | retuned |
|---|---|---|
| offline hours credited/day | 19 (per-gap cap, multi-login) | **12** (daily budget) |
| active hours/day | 2.5 | 2.5 × 1.12 presence = 2.8 |
| **effective game-hours/day** | **21.5** | **14.8** |

The cap change alone is ×1.45. The rate constants supply the remaining ×4.3 on the first 99.

---

## 3 · Rate-side, not XP_TABLE-side — settled

**Stretching `XP_TABLE` is forbidden.** `G.skills[sk]` stores raw accumulated XP and `levelFromXp()`
reads the table. Multiply the table by anything > 1 and **every existing player is instantly demoted**
— a level-70 miner wakes up at 58. That is the literal definition of clawing back earned progress and
it violates the binding directive.

Rate-side changes are the opposite: every stored XP number keeps its meaning, every level survives,
only future earning changes. **Decision: all pacing changes are rate-side. Locked.**

---

## 4 · The retune

### 4.1 Gathering XP — final values

Two things are folded into one table: the global `PACE.xp = 0.55`, and a per-skill curve correction
that brings the three gathering skills within ±3% of each other at 99 (§1.2's woodcutting outlier).
Effective per-skill multipliers: **Woodcutting ×0.33**, **Mining ×0.6325**, **Fishing ×0.5775**.

Publish the final values in `src/data/gathering.js` — an implementer should never have to chain
multipliers to know what a card says.

**TREES** (`ms` unchanged in data; `PACE.actionMs` is applied at the seam)

| rung | req | xp today | **xp new** | qty today | **qty new** |
|---|---|---|---|---|---|
| Normal Tree | 1 | 25 | **8** | [1,2] | **[1,1]** |
| Oak | 15 | 38 | **13** | [1,2] | **[1,1]** |
| Willow | 30 | 68 | **22** | [1,2] | **[1,1]** |
| Maple | 45 | 100 | **33** | [1,2] | [1,2] |
| Yew | 60 | 175 | **58** | [1,1] | [1,1] |
| Runewood | 75 | 240 | **79** | [1,1] | [1,1] |
| Duskwood | 90 | 330 | **109** | [1,1] | [1,1] |

**ROCKS**

| rung | req | xp today | **xp new** | qty today | **qty new** |
|---|---|---|---|---|---|
| Copper | 1 | 18 | **11** | [1,2] | **[1,1]** |
| Iron | 15 | 35 | **22** | [1,2] | **[1,1]** |
| Coal | 30 | 50 | **32** | [1,2] | **[1,1]** |
| Gold | 45 | 65 | **41** | [1,1] | [1,1] |
| Mithril | 60 | 80 | **51** | [1,1] | [1,1] |
| Emberstone | 75 | 110 | **70** | [1,1] | [1,1] |
| Dawnstone | 90 | 155 | **98** | [1,1] | [1,1] |

> Mithril's rate regression (§1.2) survives this table as a *rate* (51 xp / 9.0s = 5.67/s vs gold's
> 41 / 7.0s = 5.86/s). **Additional fix, ship with it: Mithril Rock `ms` 9000 → 8000.** Every rung
> must be strictly better than the one below it or the unlock is a punishment.

**FISH**

| rung | req | xp today | **xp new** | qty today | **qty new** |
|---|---|---|---|---|---|
| Shrimp | 1 | 10 | **6** | [1,3] | **[1,1]** |
| Herring | 10 | 20 | **12** | [1,2] | **[1,1]** |
| Trout | 20 | 30 | **17** | [1,2] | **[1,1]** |
| Lobster | 40 | 80 | **46** | [1,1] | [1,1] |
| Swordfish | 55 | 110 | **64** | [1,1] | [1,1] |
| Frostfin | 66 | 130 | **75** | [1,1] | [1,1] |
| Shark | 76 | 150 | **87** | [1,1] | [1,1] |
| Moonfish | 90 | 215 | **124** | [1,1] | [1,1] |

**Why the low-tier qty flattening.** `[1,2]` on the first three rungs is where the flood lives: it
makes tier-1 gathering out-produce tier-7 gathering **6:1 in raw item count**, at exactly the levels
where the items are worth least and the player has no sink for them. Flattening to `[1,1]` cuts the
tier-1 flood ×1.5 on top of the ×1.45 from `actionMs`, and makes the material ladder read correctly:
better rung, fewer but better items.

### 4.2 Artisan XP

Plain global: **all `ARTISAN_RECIPES` xp × 0.55**, rounded to integer. (Cook Shrimp 30 → 17, Cook
Shark 200 → 110, Cook Moonfish 420 → 231, and so on across cooking / smithing / crafting / prayer.)

No curve correction. Artisan skills look fast in isolation — retuned Cooking 99 is 97.5h vs
Woodcutting's 426h — but they are **input-bound**: cooking to 99 consumes 57,092 raw fish, and
fishing to 99 produces 104,101. The realistic arc is *fish to 99, then cook to 99* ≈ 508h combined.
Adding a second stretch on top would tax the same grind twice.

### 4.3 Action durations

**One constant, one seam.** `PACE.actionMs = 1.45`, applied where `actualMs` is computed in
`startSkill()` and `startArtisan()`. Do **not** multiply the `ms` values in data — a live constant is
what makes future tuning a one-line change and gives QA a single thing to assert.

```
actualMs = max(500, floor(ms × PACE.actionMs × (1 − gatherSpeed − toolSpeed)))
G.skillMs = actualMs            // §1.6 — offline must see the same number
```

Normal Tree 3.0s → 4.35s. Yew 10s → 14.5s. Cook Shrimp 2.4s → 3.5s. Slow enough to be felt, fast
enough that the progress bar still reads as a rhythm rather than a wait.

### 4.4 Combat

**Combat XP × 0.55** (kill XP and the per-damage grants in `combatTick` / `processOfflineCombat`).
**The 2.4s tick is NOT slowed** — slowing combat would change every monster's effective difficulty,
food consumption and death risk at once, and that is a combat-balance change smuggled in under a
pacing task. Kills per hour, drop rates and gold per kill are all untouched.

Consequence to hold in mind: **kills/hour is unchanged while combat XP is 1.8× slower**, which shifts
the renown mix toward the kill term. §8.1 handles it.

### 4.5 What is explicitly NOT retuned

Farm growth timers (real-time — §8.4) · monster HP/attack/drop tables · gold per kill · quest, daily,
bounty and chest payouts (those are authored payouts, not rates) · every buff magnitude (§8.6) ·
the tool-speed ladder · `XP_TABLE` (§3).

---

## 5 · The offline / presence pair

### 5.1 Offline rate: unchanged at 1.00×

**Decision: zero offline rate dampening.** Offline runs at the same per-action rate as active play.
The idle-game promise — *it keeps going while you live your life* — is the reason this genre works,
and the audit was right that nerfing it makes every existing player worse off for no gain the rate
cut doesn't already deliver. Tyler's "way too many logs for only 9 hours" is answered by §4 and §6:
that same 9 hours now yields **7,449 logs worth 11,918 gold** instead of **16,200 worth 129,600** —
2.2× fewer items and **10.9× less gold**.

### 5.2 Presence bonus: **×1.12 XP while online**

- **Magnitude: +12%.** Centre of Tyler's 10–15% band.
- **Applies to:** XP only, from every source (gathering, artisan, combat). **Not** to item yield,
  not to gold, not to drop rates — so presence can never be farmed as an economy faucet, and the
  §6 faucet fix cannot be undone by sitting at the screen.
- **Channel: multiplicative, and outside the `allXP` fuse.**
  ```
  gain = floor(amt × (1 + allXP + combatXP + rested) × presenceMult)
  ```
  It is **not** a perk. Every player has it, always, at the same value, from level 1 — it is a *mode*
  multiplier, not an accumulated power source. Putting it inside the additive block would push the
  +52% permanent stack to +64% and blow the ≤0.60 fuse (CONFLICTS 2026-08-08 §3) for a bonus nobody
  earned. Outside the fuse it also cannot drift, because nothing can ever add to it.
- **Not double-dipping.** Offline is 1.00×, online is 1.12×. The total presence advantage is
  **exactly +12%** — the number Tyler set, with no hidden second nerf underneath it.

### 5.3 The honest definition of "online"

All three must hold, evaluated at the moment XP is granted:

1. `document.visibilityState === 'visible'` — the tab is actually in front.
2. A real user input (`pointerdown` / `keydown` / `touchstart`) within the **last 10 minutes**.
3. An activity is running (which is already true on any XP path).

That is the whole spec. No mouse-jiggle detection, no focus heuristics, no anti-cheat theatre — this
is a +12% XP bonus, not a raid lockout, and the cost of a false positive is 12% of one action. The
10-minute window is deliberately generous: an idle game's player is *watching*, not clicking, and
punishing them for reading their own inventory would be exactly the wrong lesson.

**Surface it.** A quiet indicator in the topbar — *"Hearth's Watch · +12% XP"* — that dims when the
window lapses. A bonus the player cannot see is a bonus that does not change behaviour.

**Note the overlap with the Rally aura:** `muster.js`'s `LIVE_XP_AURA` (+10% allXP) fires on
`joinedThisWindow()` — it rewards having *joined*, not being *present*, and it stays in the additive
`allXP` channel. Different mechanic, different channel; they stack, and that is correct.

### 5.4 The offline cap becomes a **daily budget** — the real wall-clock lever

**Decision: the offline cap is a rolling daily allowance, not a per-gap one.** Same size (12h F2P /
16h Offline+, plus renown / property / clan hours), refilling at 00:00 UTC, drawn down by each
catch-up.

Why this and not a dampener:

- It targets the **degenerate pattern precisely**. The player who sleeps 9h and plays in the evening
  is untouched — they were never banking 19h. The player who logs in twice for thirty seconds to
  double-bank, which the audit identified as the pattern that kills a social game, loses the extra
  bank and nothing else.
- **Nothing earned is removed** — this is a forward-looking accrual rule, not a reset.
- It **rescues four near-dead perks.** `offlineHours` from Offline+, renown ranks, the property ladder
  (+1…+4h) and clan level currently only matter to a player asleep for more than twelve hours. As a
  *daily* budget every player hits the ceiling, so every extra hour is felt every day. The property
  ladder's offline rung goes from decoration to a reason to build.
- Honest to state: *"up to 12 hours of offline progress a day"* is a clearer and more generous-sounding
  promise than the per-gap rule it replaces.

**This is the one change most likely to draw a player complaint**, so it must ship with copy that
names it (welcome-back sheet: *"9h 12m of your 12h daily offline banked · 2h 48m remaining"*) and a
visible remaining-budget readout. Never let a player discover a cap by noticing an absence.

**If this is rejected**, the whole stretch has to move to the rate side: `PACE.xp` drops from **0.55
to 0.40** to hit the same 4-week first 99. I do not recommend it — it makes the active-play experience
absorb 100% of a cost created by absence, which is backwards.

---

## 6 · The economy — gathering is a gold printer, and that is the bigger bug

Yields are not only a pacing number. `invSellOne` / `invSellAll` pay **the full item `v`** for raw
materials, and `v` climbs 2.77× per material tier while gathering throughput stays flat at ~300/h.

**Raw gathering gold per hour, today:**

| mining level | rung | g/h | per 12h offline |
|---|---|---|---|
| 1 | Copper (v 10) | 18,000 | 216,000 |
| 45 | Gold ore (v 100) | 60,504 | 726,000 |
| 60 | Mithril (v 200) | 100,000 | 1.2 M |
| 75 | Emberstone (v 520) | 237,714 | 2.9 M |
| **99** | **Dawnstone (v 1,400)** | **560,000** | **6.7 M** |

For scale: the **King** renown reward — the eleventh of twelve ranks — is 300,000 gold. A maxed miner
out-earns it every 32 minutes, **while asleep**. This is a larger threat to the economy than the log
count Tyler flagged, and it compounds the already-filed craft-to-vendor margin (CONFLICTS 2026-08-08,
Hunt batch §1: Dawnsteel Platebody turns 21,000g of bars into 108,000g).

### 6.1 The fix: raw materials vendor at 0.20 × `v`

One choke-point, mirroring the `applyGoldFind` seam:

```
VENDOR_RAW_RATE = 0.20        // logs, ores, raw fish, raw crops, raw drops
vendorPrice(id) = ITEMS[id].raw ? floor(v × VENDOR_RAW_RATE) : v
```

`v` itself is **not** changed — it stays the book value that market listings, recipe costing, chest
payouts and the collection log all read. Only what the **NPC vendor** pays for an unprocessed material
changes. Add a `raw: true` flag to the material entries in `items.js` (Designer-owned data); the
choke-point is Systems'.

**Why this shape, and why it is good design beyond the arithmetic:** it puts gathering and artisan in
their correct economic roles. Gathering becomes the **material** faucet; smithing, crafting and cooking
become the **gold** path; and the player-to-player **market** becomes the best price for raws, because
another player will pay more than 20% for something they need. That is three systems earning their
keep off one constant.

**Result:** max faucet 560,000 → **77,241 g/h**; 12h offline at mining 99, 6.7 M → **0.93 M**. The 9h
fresh-account run, 129,600 g → **11,918 g**.

### 6.2 Still open after the fix

0.93 M gold per offline day at mining 99 remains the single largest faucet in the game. Two follow-ups
for Systems, not blockers for Phase 1:

- **Dawnstone Ore `v: 1400` is the outlier** — the raw ladder should step ~2.2×, not 2.77× compounding.
- Consider whether tier-7 raws should be **market-only** (no vendor bid at all), which is the cleanest
  statement that endgame gold comes from players, not from an infinite NPC.

### 6.3 The sink side (Phase 2)

The first property upgrade wants **30 normal logs** against a 7,449-log overnight. The flood is only
half a yield problem; the other half is that nothing in the game wants thousands of anything.
Phase 2 scales property, castle and high-tier recipe costs into the thousands, so a full bank reads as
a resource rather than a joke. Coordinates with the homestead-deepening and castle specs.

---

## 7 · Endgame gear — the cadence gate

Rate cuts do not gate best-in-slot; **cadence** does, and it should, because a cadence gate is the one
kind of gate a whale cannot buy past and a no-lifer cannot grind past.

Hunt signature materials come from the weekly clan Hunt (`raids.js HUNT_TIERS`): Tier V yields
**12 mats + a 100% signature drop, once per week**, and Tier V itself requires castle tier 5 + War
Room 12 — months of clan construction before the first Tier V Hunt is even declarable.

**Rule: a full Hunt-forged set must require ≥ 16 Hunt weeks at the player's reachable tier — a hard
floor of ~4 months from the first Hunt, independent of grind, gold or presence.** Price the per-piece
signature-material cost against `HUNT_TIERS[t].mats` to land that floor when the armour recipes are
authored, and hold it: no other source of signature materials, ever. This is what makes "endgame is
months away" true even for the player who does nothing else.

---

## 8 · Interactions — everything the retune touches

### 8.1 Renown — the meta-spine slows unevenly

`renown.js` weights: `totalLevel 10` · `combatLevel 15` · `kill 0.5` · `bossKill 40` · `questDone 200`
· `collection 25` · `skill99 600` · `streakBest 25` · `bountyDone 12` · `goldLog 45`.

Levels come 2.5–3.6× slower after the retune. **Kills do not** (§4.4 leaves combat ticks alone), and
the streak term is pure wall-clock. So without a correction the ladder tilts toward kill-grinding and
away from the "steady grind of levels is the backbone" intent written into that file.

**Decision — raise only, never lower:**

| weight | today | **new** |
|---|---|---|
| `totalLevel` | 10 | **14** |
| `skill99` | 600 | **900** |
| everything else | — | unchanged |

**Lowering `kill` from 0.5 would be the tidier fix and it is forbidden**: a kill-heavy veteran's score
would drop and they could be *demoted a rank*. That is earned progress clawed back, on the surface
whose entire job is to say you climbed. Raising the level weights restores the intended mix from the
other side, and strictly increases every existing player's renown — some will rank *up* on the update,
which is a gift, not a bug.

**Ship the ratchet with it (Systems, one field):** persist `G.renownHigh = max(G.renownHigh,
computeRenown())` and rank off the high-water mark. Then no future weight change, in any direction, can
ever demote anyone. This is the structural guarantee that makes "never clawed back" enforceable rather
than aspirational.

Also fold in the audit's finding #5 while the file is open: subtract the ~310 fresh-account baseline so
the first bar starts near empty and Serf is a win rather than a formality.

### 8.2 Daily and weekly goals — tuned against rates that no longer exist

`DAILY_TASK_POOL` and `DAILY_GOAL_POOL` were authored against 1,800 items/h. "Gather 50 resources" is
**100 seconds** today and ~2.5 minutes after the retune — still not a goal, just a delay. Same for
"Gather 25 logs", "Catch 15 fish", "Mine 25 ores".

**Phase 2 retune target: every daily should be 15–25 minutes of directed play**, and dailies should
point at *different* activities so the set is a plan for the day rather than three restatements of the
grind already running.

Sized against a mid-ladder gathering rate of ~500 items/h after the retune (tier 1 is 828/h, tier 7
is ~250/h), and against ~1,000 actions/h for artisan.

| goal | today | **new** | ≈ time |
|---|---|---|---|
| Gather 50 resources | 50 | **200** | 24 min |
| Gather 120 resources (the "big" daily) | 120 | **500** | 60 min |
| Gather 25 logs | 25 | **150** | 18 min |
| Mine 25 ores | 25 | **150** | 18 min |
| Catch 15 fish | 15 | **150** | 18 min |
| Cook 12 items | 12 | **120** | 7 min + the inputs |
| Cook 5 dishes | 5 | **60** | 3.5 min + the inputs |
| Smith 8 / Craft 8 | 8 | **60** | ~5 min + the inputs |
| Slay 10 / 30 monsters | 10 / 30 | unchanged (combat rate unchanged) | |
| Weekly: Cut 250 logs / Gather 250 ores | 250 | **1,500** | ~3h |
| Weekly: Gain 5 skill levels | 5 | **3** (levels are ~3× slower) | |
| Harvest N crops | `3 × farmPlotCap()` | unchanged — already capability-scaled (b220) | |

Rewards scale with the targets; the gold values move with §6's new economy, not with the old one.

**Bug found while sizing these — file it with the retune.** `DAILY_GOAL_POOL` reads progress from
**item-specific** counters: `collection.normal_log`, `collection.copper_ore`, `collection.shrimp`. A
level-90 woodcutter chopping Duskwood makes **zero** progress on "Gather 25 logs", and "Catch 15 fish"
is unachievable for anyone past Shrimp unless they deliberately downgrade. These goals get *harder*
the better you are, which is backwards, and raising the targets makes it worse. The sources must move
to the aggregate `stats.gathered` / a per-skill counter before §8.2's numbers land.
**Owner: Systems (the source strings), Designer (the targets).**

### 8.3 **Farming 99 is unreachable — P0, and it is not caused by this retune**

Farming XP comes only from planting (**2**), watering, and harvest (`crop.xp × qty`). At the castle's
**12 plots** running Moonbloom (170 XP, 22h grow, 1–2 yield) that is ≈ **3,120 XP per 22 hours**.

11,805,606 ÷ 3,120 × 22h = **83,200 hours ≈ 9.5 years.** At the Manor's 8 plots it is worse.
**Farming to 99 is off by roughly a factor of 40**, in a game whose pitch is every skill to 99.

**Decision: farming is exempt from `PACE.xp`, and crop harvest XP is multiplied by 14** (Turnip 8 →
112, Carrot 12 → 168, Wheat 18 → 252, Potato 25 → 350, Tomato 35 → 490, Pumpkin 60 → 840, Goldenroot
85 → 1,190, Emberfruit 120 → 1,680, Moonbloom 170 → 2,380). Plant XP 2 → 28; watering XP scales the
same way.

Lands farming 99 at **~8 months of continuous real-time farming at 12 plots**, ~12.5 months at 8 —
deliberately the longest single skill, and the one whose only accelerator is the property ladder.
That is exactly the right job for a Homestead pillar skill: slow, passive, and a reason to build.

(Blocked on the already-filed CONFLICTS item: `farm-progression.js TIERS` stops unlocking crops at
Pumpkin, so Goldenroot / Emberfruit / Moonbloom are unplantable at every plot level. Farming's last 37
levels have nothing to plant. **That five-line data fix must land in the same build** or this retune
targets crops that do not exist.)

### 8.4 Farm timers — immune, by design

Growth is real-time (`HearthriseFarm.growthHours()`), so `PACE.actionMs` does not touch it and the
watering window keeps its 2h/2× shape. Do not "correct" for this: farming being wall-clock-bound while
everything else is rate-bound is what gives the day two different rhythms.

### 8.5 Castle Labour — verified immune

`clan-seat.js`: `labourForAction(skillLevel, actions) = (0.5 + lv/99) × actions`, capped at
`DAILY_LABOUR_CAP = 400`/member/day. **Per action, not per hour.** At 4.35s/action a level-50 member
fills the daily cap in ~28 minutes of gathering, against ~20 minutes today. The cap is still trivially
reachable, and the clan's "attendance beats gear" design (a 2× spread from level 20 to 99, not 40×)
survives untouched. **No change needed.** Confirm with a QA assertion so a future rate change cannot
quietly push the cap out of reach.

### 8.6 Rested XP — the seam is broken independently, and the retune makes it worse

`G.restedXp` banks **charges** (1 per 6 min offline, cap 80), and `spendRestedCharge()` burns one
charge to multiply **one XP grant**. Potency is `getBonus('restedXp')`, which is **0 today** — nothing
grants it — so the bank is inert.

The design is wrong at any potency: 80 charges is **80 actions**, which is ~6 minutes of play. Even at
a 50% potency clamp (CONFLICTS 2026-08-08, homestead batch §2) a full 8-hour bank is worth ~400 XP —
undetectable. And `PACE.xp = 0.55` makes each grant smaller, so each charge is worth *less*.

**Decision: re-spec the bank in XP, not in grants, before any pillar grants potency.** A charge should
be worth a fixed quantum of bonus XP (e.g. one charge = +2,000 bonus XP, drained across however many
grants it takes), so 80 charges = 160,000 XP ≈ 5–6 hours of retuned gathering — a genuinely felt
"welcome back" and exactly the mechanic that should reward *returning* rather than staying away.
Whoever ships the Tavern Common Room or Library L4/L5 owns this. Flagged to CONFLICTS.

### 8.7 Buffs, feasts, blessings — no retuning needed

Every multiplier is relative, so the retune preserves each buff's value exactly. It also **improves**
them: with a lower floor, the same +36% Last Call Feast is a larger share of "how fast can I possibly
go", so the ceremony peaks feel more like peaks. The Tavern-10 Feast at Last Call on top of the +52%
permanent stack reaches ~×1.88 of the new base — which is **0.75× today's baseline**. Even the most
buffed moment in the retuned game is slower than an unbuffed moment today. The `≤0.60` fuse is
unchanged and the presence bonus stays outside it (§5.2), so the power budget is not touched.

### 8.8 Tool ladder and gather-speed perks

`(1 − gatherSpeed − toolSpeed)` multiplies the new `actionMs`, so every tool tier and every speed perk
keeps its exact percentage value. Rune Axe still saves 25%. No change — but see §1.6: fixing
`G.skillMs` means those bonuses finally apply offline too, which is a **buff** to every geared player
and helps offset the retune for exactly the veterans most likely to notice it.

---

## 9 · Fairness and migration

### 9.1 The guarantees

1. **No level is lost.** `XP_TABLE` is untouched (§3); every stored XP value keeps its meaning.
2. **No item, gold, gem, rank, pet, collection entry or unlock is removed or revalued.** The 16,110
   logs in someone's bank stay 16,110 logs. Vendor rate (§6.1) changes what the NPC will pay *from now
   on*; it does not reach into anyone's bank.
3. **No renown rank is lost.** Weights only rise (§8.1), and the high-water ratchet makes it structural.
4. **No offline hours already banked are revoked** — the daily budget starts full on the build that
   ships it (§5.4).

### 9.2 Who will actually feel it, and what softens it

| player | what they feel | what softens it |
|---|---|---|
| Mid-grind on a skill (say Mining 74) | The next level takes ~3× longer than the last one. **This is the sharpest edge in the whole change.** | Founder's mark (§9.3) + the release note naming the change plainly. Also: their gear's speed bonuses now work offline (§1.6), a real ~20–30% clawback of the loss for anyone geared. |
| Multi-login banker | ~19h/day → 12h | The budget is visible and named; the remaining balance is on the welcome-back sheet. |
| Maxed gatherer selling raws | Gold income drops ~5× | The player market becomes the better price. Their existing gold is untouched. |
| Farmer | Everything gets *faster* — ×14 (§8.3) | — |
| Brand-new player | Never sees the old rates; sees a first session that unlocks Oak/Iron in ~20 minutes instead of ~5 | — |

### 9.3 Founder's mark

Everyone with a save predating the retune build receives a **one-time cosmetic** — a title and profile
mark, *"of the First Season"* — recorded against the account, never re-issuable.

It costs nothing, grants no power (so it cannot become pay-to-win or a balance exception), and it says
the true thing: *you were here for the fast era, and that era is a fact about the game's history rather
than a mistake we are erasing.* An acknowledged change is a story; an unacknowledged one is a betrayal.
Gate it on `G.createdAt < RETUNE_EPOCH` server-side so it cannot be minted by a save edit.

### 9.4 The release note is part of the change

Say it plainly, in the game, on the build that ships it: what changed, why (the game is meant to last
months, not a week), that nothing was taken away, and that presence now pays +12%. Do not bury a rate
cut in a patch list. The players who notice are the ones who care most, and they are owed the reason.

---

## 10 · Phasing

### Phase 1 — the rate constants + the presence bonus (one build)

Everything here is a single coherent change; splitting it ships a broken intermediate.

| # | change | file | owner |
|---|---|---|---|
| 1 | `PACE = { xp: 0.55, actionMs: 1.45 }` constant + applied at `startSkill` / `startArtisan` / XP grants | `legacy.js` | Systems |
| 2 | Final XP + qty tables (§4.1), Mithril `ms` 9000→8000 | `data/gathering.js` | Designer |
| 3 | Artisan xp × 0.55 (§4.2) | `data/recipes.js` | Designer |
| 4 | Combat XP × 0.55, tick unchanged (§4.4) | `legacy.js` | Systems |
| 5 | Farming exempt from `PACE.xp`, crop XP × 14 (§8.3) + the crop-tier unlock fix | `data/gathering.js`, `farm-progression.js` | Designer |
| 6 | `G.skillMs = actualMs` — offline honours tools/perks (§1.6) | `legacy.js` | Systems |
| 7 | Presence bonus: ×1.12 multiplicative, outside the fuse, online definition per §5.3, topbar indicator | `legacy.js` + a small `presence.js` | Systems + Art |
| 8 | Offline cap → daily budget, with the remaining-balance readout (§5.4) | `legacy.js`, welcome-back sheet | Systems |
| 9 | `raw: true` flags + `VENDOR_RAW_RATE = 0.20` choke-point (§6.1) | `data/items.js`, `legacy.js` | Designer + Systems |
| 10 | Renown weights 10→14 / 600→900 + `renownHigh` ratchet (§8.1) | `features/renown.js` | Systems |
| 11 | Founder's mark, gated on `createdAt` (§9.3) | account/cosmetics | Systems |
| 12 | Release note + welcome-back copy (§9.4) | CHANGELOG + in-game | Designer |

**Regression tests to land in the same commit** (`smoke-test.js`):
- `PACE.xp === 0.55 && PACE.actionMs === 1.45` — the constants are the contract.
- Normal Tree grants 8 XP and 1 log; Cook Shrimp grants 17.
- `G.skillMs` equals the tool/perk-adjusted duration after `startSkill`, not the raw `ms`.
- Presence multiplier is 1.12 when visible + recently-interacted, 1.00 otherwise, and does **not**
  appear in `getBonus('allXP')`.
- `getBonus('allXP') ≤ 0.60` still holds with presence active.
- Offline budget: two 9h gaps in one UTC day credit 12h total, not 18h.
- Vendoring a raw log pays `floor(8 × 0.20) = 1`; vendoring a crafted item pays full `v`.
- Renown is monotonic: a save's rank can never decrease across a weight change.
- Every gathering rung's xp-per-second is strictly greater than the rung below it (catches the
  Mithril class of regression forever).
- Castle Labour daily cap is still reachable in < 45 min of gathering at level 50 (§8.5).

### Phase 2 — goal retunes and sinks

Daily/weekly goal targets (§8.2) · property, castle and high-tier recipe cost scaling (§6.3) ·
Rested XP re-spec (§8.6) · dawnstone `v` / market-only raws (§6.2) · Hunt-forged signature-material
pricing against the 16-week floor (§7).

---

## 11 · Handoffs raised

- **Systems Engineer** — Phase 1 items 1, 4, 6, 7, 8, 10, 11. Three need a ruling from you before
  build: the presence multiplier's placement outside the `allXP` fuse (§5.2); the `renownHigh`
  ratchet (§8.1); and whether the daily offline budget is enforced client-side or wants a server
  watermark like `restedAt` (it is the same double-pay hazard class as b214).
- **QA Engineer** — the regression list above. The two that matter most are the offline-budget
  double-credit test and the strictly-monotonic rung test; both guard against silent re-drift.
- **Art Director** — the Hearth's Watch presence indicator (topbar, must be legible without being
  loud) and the Founder's mark.
- **Coordinator → Tyler** — §5.4 (offline cap becomes a daily budget) is the one change here a player
  could read as a takeaway. It is my recommendation and the arithmetic supports it, but it deserves an
  explicit yes. The fallback if it is rejected is `PACE.xp = 0.40` with the cap untouched.
- **CONFLICTS** — Rested XP re-spec (§8.6); dawnstone raw value / vendor role (§6.2); the crop-tier
  unlock fix must land with §8.3.

---

# Appendix A · As-shipped constants — the 8-week anchor (b226)

**Author:** Systems Engineer · **Date:** 2026-08-09 · **Status:** shipped in b226, awaiting Designer
ratification at integration.
**Brief:** `DECISIONS.md` → *2026-08-09 · Pacing APPROVED with re-anchor*. Tyler took the package
whole with one change: the first-99 anchor moves from the 28 days modelled above to **≈56 days**, and
the offline cap becomes the **12h daily budget** (§5.4, explicitly approved). Everything else — the
presence bonus, the five modelling bugs, the fairness kit — ships as written.

Tyler's reasoning for the slower anchor, recorded because it governs how the headroom below gets
spent: *"we are obviously going to have lots of boosts and events so that 8 weeks will likely be
faster."* **56 days is therefore the UNBOOSTED FLOOR, by design** — a player with no Library, no
renown rank, no clan and no event uptime. The boosted columns in A.4 show what the diet already in
the game does to it, so future boost tuning can see how much of that headroom it is spending.

## A.1 The shipped constants

| lever | §4 proposed | **as shipped** | why it moved |
|---|---|---|---|
| `PACE.xp` | 0.55 | **0.39** | carries the extra stretch from the re-anchor |
| `PACE.actionMs` | 1.45 | **1.60** | takes a slightly larger share, because `actionMs` is the ONLY lever that cuts item throughput, and item volume is what Tyler actually flagged |
| woodcutting curve correction | ×0.60 | **×0.60** | unchanged — a permanent balance fix, not a dial |
| mining / fishing correction | ×1.15 / ×1.05 | **×1.15 / ×1.05** | unchanged |
| offline cap | 12h daily budget | **12h daily budget** | approved as specified |
| presence | ×1.12 XP | **removed (b227)** | replaced by the presence-gated blessing calendar — see A.8 |
| `VENDOR_RAW_RATE` | 0.20 | **0.20** | approved as specified |
| farming crop XP | ×14, exempt from `PACE.xp` | **×14, exempt** | approved as specified |

**One architectural change from §4.1's instruction.** The spec asked for the final XP values to be
published in `gathering.js` so nobody has to chain multipliers. Shipping it that way would have
frozen the pacing dial into 22 data rows, and this document has now been re-anchored once already
before a single player has seen it. So the split is: **the curve correction is baked into the data
(it is a balance statement about the rungs), and `PACE.xp` stays a live constant at one choke-point
(it is a speed statement about the game).** `book × PACE.xp` reproduces §4.1's published table
exactly — Normal Tree 15 × 0.55 = 8, Mithril 92 × 0.55 = 51 — so the spec's arithmetic is intact;
only the dial setting moved. To keep the cards honest, **every XP and duration readout in the game
now renders through `pacedXp()` / `pacedActionMs()` / `actionRate()`**, so no tile, pill or rate
panel can ever quote a number the engine will not pay.

**Book values now in `gathering.js`** (grant = `floor(book × PACE.xp × (1 + allXP))` — since b227 the
blessing rides *inside* `allXP`, so there is no outer multiplier left in the formula):

| | t1 | t2 | t3 | t4 | t5 | t6 | t7 | t8 |
|---|---|---|---|---|---|---|---|---|
| Trees | 15 | 23 | 41 | 60 | 105 | 144 | 198 | — |
| Rocks | 21 | 40 | 57 | 75 | 92 | 126 | 178 | — |
| Fish | 11 | 21 | 32 | 84 | 116 | 137 | 158 | 226 |

## A.2 The arithmetic to the floor

**Restated for b227.** The dials did not move; the *day model* did. Removing the flat ×1.12 takes
0.3 effective hours out of every wall-clock day, so the same XP requirement takes slightly longer
and the floor moves from 56.0 to **57.2 days**. This is stated as a change to the model, not
absorbed by re-tuning `PACE.xp`, because the anchor Tyler approved was "about eight weeks" and 57.2
days *is* about eight weeks — re-cutting a live dial to defend a decimal would be optimising the
document rather than the game.

```
day model (b227)
  offline banked/day   12.0 h   (the daily budget, at 1.00× — no offline dampening)
  active/day            2.5 h   (b226: × 1.12 presence = 2.8 h; b227: the flat bonus is gone)
  effective game-hours per wall-clock day      = 14.5 h   (was 14.8)

the dials (unchanged from b226)
  realised stretch F = PACE.actionMs / (PACE.xp × woodcutting curve 0.60)
                     = 1.60 / (0.39 × 0.60) = 1.60 / 0.234   = 6.838

the baseline
  woodcutting to 99 today, 0% allXP, tool ladder applied (§1.1)  = 120.5 h
  requirement = 120.5 × 6.838                                    = 824.0 effective game-hours

the floor
  824.0 / 14.5 h/day                                             = 56.8 days
  …and 57.2 days once the table below is scaled consistently with A.4's
  per-skill baselines (14.8/14.5 = ×1.0207 on every b226 figure).
  ≈ 8.2 weeks at 0% allXP, on a calendar week that pays your skill nothing.  ✔
```

### A.2b Online value is now a variable, not a constant

The 14.5 h/day above is the **floor**, and unlike b226's 14.8 it is not what a typical day looks
like. The rotating blessing (A.8) is presence-gated, so it rides only the ~2.5 active hours — but
while it rides them it can be worth a great deal:

| the week you got | effective h/day | days to first 99 (woodcutting) |
|---|---|---|
| nothing that touches your skill | 14.5 | **57.2** |
| Grand Fair (+12% all XP) | 14.8 | 56.1 |
| Deep Veins (+15% gather) **and** a Gathering Surge day (+25%) | 16.2 | 51.4 |

Expected value across the whole calendar, weighting each pool entry by its rotation odds, is about
**+1.7% on the day** — i.e. the average engaged day lands near 14.75 h, almost exactly where b226's
flat bonus put it. The difference is entirely in the *shape*: the same average power now arrives as
a reason to check what today is and to train the thing the realm is blessing, instead of as a
constant nobody could perceive. **Nothing was taken from the offline player, who was already at
1.00× and still is.**

Why `actionMs` stopped at 1.60 rather than absorbing more: it is felt on every single action, and it
sets the floor of the game's rhythm. At 1.60 the starting rung is **4.8s** and the tier-7 rung is
**20.8s** (13.5s with a Dawnsteel axe) — slow enough to be felt, fast enough that the progress bar
still reads as a rhythm rather than a wait. Every further 0.1 would have bought ~4% fewer items at
the cost of a visibly draggier first session, which is the worst place in the game to spend it.

## A.3 The as-shipped ladder

| rung | grant | interval | rung | grant | interval |
|---|---|---|---|---|---|
| Normal Tree | 5 XP | 4.8s | Copper Rock | 8 XP | 4.8s |
| Oak | 8 XP | 6.4s | Iron | 15 XP | 7.2s |
| Willow | 15 XP | 8.8s | Coal | 22 XP | 8.8s |
| Maple | 23 XP | 11.2s | Gold | 29 XP | 11.2s |
| Yew | 40 XP | 16.0s | Mithril | 35 XP | **12.8s** ← was 14.4s |
| Runewood | 56 XP | 18.4s | Emberstone | 49 XP | 16.8s |
| Duskwood | 77 XP | 20.8s | Dawnstone | 69 XP | 19.2s |

(Grants shown at 0% allXP, no blessing. Mithril's `ms` 9000 → 8000 closes §1.2's rate regression;
the suite now asserts every rung strictly beats the one below it, permanently.)

## A.4 Floor and typical — the boost headroom

Days to a first 99, at the b227 day model of **14.5 h/day**, at increasing amounts of the *permanent*
boost diet already in the game. The anchor is the leftmost column. (Every figure is the b226 table
scaled by 14.8/14.5 = ×1.0207 — the dials are unchanged, only the day model moved.)

| | **0% (the anchor)** | +20% Library L3 | +33% Library + mid renown + clan | +52% permanent ceiling | +52% & rally/blessing uptime |
|---|---|---|---|---|---|
| Woodcutting | **57.2 d** | 47.7 d | 43.1 d | 37.6 d | 35.9 d |
| Mining | **57.8 d** | 48.3 d | 43.4 d | 38.1 d | 36.2 d |
| Fishing | **55.1 d** | 46.0 d | 41.4 d | 36.3 d | 34.6 d |

Composition of each column, from the shipped numbers: Library L1–L3 **+20%**; renown ranks at
mid-ladder (Squire→Count) **+8%**; clan perks **+5%**; castle capstone **+5%**; the additive fuse
caps the permanent stack at **+52%** (CONFLICTS 2026-08-08 §3). The last column additionally models
~1h/day at the Rally aura (+10%) and the blessing calendar's expected value; **since b227 the
blessing term is presence-only**, so it is worth roughly +1.7% of the day rather than the +4.5% b226
modelled, and it is now *variable* rather than an average anybody actually experiences (A.2b).
**Rested XP contributes exactly nothing today** and is not in any column — its potency is
`getBonus('restedXp')`, which no pillar grants (§8.6); it becomes real headroom the day the Tavern
Common Room ships, and §8.6's re-spec should be priced against this table.

So the honest sentence is: **the floor is a little over eight weeks, a typical engaged player with
the perks currently in the game lands around six, and the most decorated player in the game cannot
get below five.** That is roughly 21 days of headroom between the anchor and the ceiling — the
budget every future boost and event is spending from.

**All 15 skills to 99.** Gathering is exact (166.6 days at 0%, ~135 at +25%). The artisan block
scales ×4.10 against today (`actionMs / PACE.xp`); the combat block scales ×2.56 (XP only — the 2.4s
tick is untouched, §4.4), which is gear-independent and therefore exact. Applied to §0's ~10.3-month
figure those two multipliers bracket the total at **≈15–16 months for a player carrying the typical
+25% stack, and ≈19 months with no permanent perks at all** — inside the 16–18 month target, with
the combat block the least certain term. Farming runs in parallel (wall-clock) rather than adding.

## A.5 The five modelling bugs, as shipped

| | before | after |
|---|---|---|
| `G.skillMs` offline dampener | stored raw `ms`; geared players gathered 30–40% slower offline | stores the tool/perk-adjusted interval — a straight buff to every geared player. *(b227: the offline replay now re-derives the interval instead of trusting the stored one, so a session started under a speed blessing cannot carry blessed speed into an absence. The blessing calendar is the only online/offline differential left.)* |
| Farming XP | 12 plots of Moonbloom → 99 in **9.6 years** | ×14 and exempt from `PACE.xp` → **8.2 months** |
| `VENDOR_RAW_RATE` | Dawnstone at mining 99 printed **646,154 g/h** | **80,769 g/h**; 12h budget 6.7M → **0.97M** |
| Mithril Rock | 8.89 xp/s vs Gold's 9.29 — the unlock was a punishment | strictly faster than Gold at every dial setting, asserted forever |
| Daily-goal counters | "Gather 25 logs" watched `collection.normal_log`; a Duskwood chopper scored 0 | per-skill `stats.chopped/mined/fished`, **seeded from the collection log** so no achievement progress was zeroed to fix it |

## A.6 What the retune does to Tyler's two complaints

| | today | as shipped |
|---|---|---|
| 9h offline on Normal Tree, fresh account | WC **59** · **16,200** logs · **129,600 g** | WC **39** · **6,750** logs · **6,750 g** |
| factor | | **2.4× fewer logs · 19.2× less gold** |

## A.7 Known limitation, filed not fixed

An XP-side stretch raises the total item count for a 99 even as it lowers items *per hour*:
woodcutting to 99 goes from 50,705 logs to 216,020. Per session the player sees **fewer** items
(1/1.60 the rate, plus the `[1,1]` flattening) and far less gold per item, which is what they
actually feel — but a finished bank is four times deeper. §6.3's Phase-2 sink scaling (property,
castle and high-tier recipe costs into the thousands) is now load-bearing rather than a nicety.

---

# Appendix A.8 · b227 — the calendar *is* the online bonus

**Author:** Systems Engineer · **Date:** 2026-08-09 · **Status:** shipped in b227.
**Brief:** `DECISIONS.md` → *2026-08-09 · Presence rework: blessings are presence-gated; flat +12%
removed*. Tyler: *"if you're offline the event doesn't apply to you… you only get that stuff WHILE
online. One week it may be 12% exp, another week it may be +10% gold find."*

## A.8.1 What changed

| | b226 | **b227** |
|---|---|---|
| online bonus | flat **×1.12 XP** while present | **none** — presence is now a gate, worth nothing on its own |
| daily / weekly blessing | applied **always**, including offline | applies **only while present**; base rate offline, in a background tab, or AFK past 10 min |
| where it stacks | outside the additive fuse, multiplicative | **inside** `allXP` / `combatXP` / the speed keys, so the §8 power budget can see it |
| the presence detector | drove the multiplier | **kept**, drives the gate |
| rally / join-gated live events | — | **untouched** |

"Present" is unchanged from b226: tab visible **and** real input within 10 minutes **and** an
activity running.

## A.8.2 The offline audit (the part that had a real bug in it)

Blessings reach the engine through a thin additive wrapper on `getBonus`. `processOffline()` replays
the player's activity through the *same* `doSkillAction` / `doArtisanAction` / `addXp` /
`applyGoldFind` the live loop uses — so **before b227 the blessings did apply to offline output**, in
full, on every catch-up.

Worse for anyone building the gate: `isPresent()` is **true** during a catch-up. `processOffline()`
runs inside `loadLocal()`, on a visible tab, with the input timestamp freshly initialised and an
activity set. A gate written as "blessings apply when `isPresent()`" would have shipped the identical
bug with a new name. (b226's own ×1.12 leaked into offline grants for exactly this reason.)

The fix is a **replay latch**: a depth counter that `processOffline()` holds for the whole
simulation, released in a `finally`. `blessingsApply()` is `!inOfflineReplay() && isPresent()`.
Two regression tests pin it: one runs the same 3-hour absence under a deliberately enormous
all-keys blessing and under no blessing at all and asserts the XP, the item count *and* the action
interval come out identical; the other proves the latch closes even on a visible, active,
freshly-touched tab, survives nesting, and is released after a throw.

**The speed keys needed a second fix.** `gatherSpeed` / `cookSpeed` / … were baked into `G.skillMs`
once, at `startSkill()`, and the offline replay divides elapsed time by that number — so a session
begun under a Gathering Surge carried blessed speed into the night, and an idle player kept it too.
The interval is now derived by one shared function (`activityIntervalMs()`) that the live loop, a
per-action retimer and the offline replay all read. Side benefit: buying a Toolshed or a better axe
mid-session now applies immediately instead of at the next restart.

## A.8.3 The pool as shipped

Nine daily entries × six weekly = 54 combinations, spanning **ten wired keys**. Every key was
verified to have a live consumer, and the suite asserts each one *moves something*.

| daily (rotates 00:00 UTC) | effect | key(s) |
|---|---|---|
| Gathering Surge | +25% gather speed | `gatherSpeed` |
| Forge Fires | +30% smithing & crafting speed | `smithSpeed` `craftSpeed` |
| Harvest Festival | +2 farm yield | `farmYield` |
| Scholar's Day | +15% all XP | `allXP` |
| Hunter's Moon | +20% combat XP | `combatXP` |
| Feast Day | +30% cooking speed | `cookSpeed` |
| Quiet Vigil | +30% prayer speed | `prayerSpeed` |
| **The Open Coffers** *(new)* | +15% gold find | `goldFind` |
| **The Steady Fire** *(new)* | −25% burn chance · +10% cooking speed | `noBurn` `cookSpeed` |

| weekly (rotates on the UTC week index) | effect | key(s) |
|---|---|---|
| The Grand Fair | **+12% all XP** — Tyler's worked example, at his number | `allXP` |
| **The King's Bounty** *(new)* | **+10% gold find** — his other worked example | `goldFind` |
| Deep Veins | +15% gather speed | `gatherSpeed` |
| War Drums | +15% combat XP | `combatXP` |
| Guild Works | +20% artisan speed | `cookSpeed` `smithSpeed` `craftSpeed` |
| **The Long Harvest** *(new)* | +1 farm yield · +8% gather speed | `farmYield` `gatherSpeed` |

**Deliberately absent: `rareDrop`.** It exists as an *item* stat on pets and equipment, but nothing
reads `getBonus('rareDrop')` — a rare-drop blessing would be a promise the engine cannot pay, which
is exactly what `goldFind` and `noBurn` were before b222/b225 wired them. It becomes poolable the day
a drop-roll seam reads it. Also absent: `restedXp` (potency is 0 until the Tavern ships) and
`raidPower` (raids are join-gated live content, out of scope by direction).

## A.8.4 Magnitudes, against the power budget

Existing numbers are **unchanged** and the new families are set at comparable strength, with one
deliberate exception: The Grand Fair moves +10% → **+12%**, because Tyler named that number and
because it is the figure the retired flat presence bonus used to pay — the same headline power, now
earned by showing up in the right week rather than granted every week forever.

This is *temporary* power, which clan-overhaul §8.4 budgets separately from the ≤+52% permanent
stack. Presence-gating **shrank** its real contribution by roughly 5.8×: a blessing used to be paid
across all 14.5 effective hours of a day and now rides only the ~2.5 the player is at the screen.
Whole-calendar expected value is **~+1.7% on the day**, against the +12%-on-active-hours it replaces.
Keeping the magnitudes was therefore the conservative choice; cutting them as well would have made
being online worth measurably *less* than it was before Tyler asked for the opposite.

Worst-case overlap is Scholar's Day inside a Grand Fair week: **+27% `allXP`, for 2.5 hours, one day
in fifty-four.** Against the +47% permanent ceiling that is +74% during those hours — comfortably
inside the precedent §8.4 already sets for the Tavern Feast (+65% for four hours, every day, by
design), and the fuse test asserts the ≤0.60 additive budget still holds on today's real calendar.

## A.8.5 Honesty surfaces

A gated bonus that is not visibly gated is worse than no bonus. Four surfaces state the rule:

- the **live activity note** names only a blessing that touches *this* activity, says "while you
  play", and dims to "— idle" the moment the gate closes (the b226 "+12% present" hint's job);
- **Home → The realm** carries a plain line: *"Blessings apply while you play. Offline progress
  earns the base rate."*;
- the **Events panel blessing card** says the same and changes state live, so the player can watch
  the rule work rather than take the sentence on faith;
- the **welcome-back summary** says *"at the base rate — blessings pay while you play"*, and carries
  `blessed: false` in the summary object so no future renderer can invent a blessing it never
  applied.
