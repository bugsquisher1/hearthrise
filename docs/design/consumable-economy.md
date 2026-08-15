# DESIGN — the consumable economy: Fletching, Runecrafting, Stonemason

**Status:** proposal. Every ruling below is labelled. Tyler makes the taste calls.
**Author:** Game Designer, 2026-08-15.
**Direction (Tyler, verbatim):** *"Runecrafting / fletching are a must. I have wanted a
stonemason skill anyway, for the castle building aspect. So stonemason could also make
blank runes if that makes sense? We could also make things like sharpening stones that
temporarily increase melee weapon stats in stonemason."*
Plus two later rulings, quoted in §3 and §11.

**Every number in this document was produced by running the real engine** — `src/core/combat.js`,
`combat-sim.js`, `pacing.js`, `artisan.js` and the real `src/data/*` tables, imported into Node.
Nothing here is estimated. Where a number is a *proposal* rather than a measurement it says so.

**Files this document touches:** none. It is design. `src/data/**`, `docs/design/quests.md`,
`docs/design/progression-depth.md` and `docs/design/supply-projection.md` are other agents' and were not opened for writing.

---

## 0 · The rulings, in one screen

| # | Ruling | Where |
|---|---|---|
| R1 | **One mechanic, three styles.** Ranged, magic and melee all consume through the *same* per-swing field (`ammoPerShot`) in the *same* slot (`ammo`). There is not a second consumption path. | §2 |
| R2 | **Consumables deplete while away, and running dry is FAIL-SOFT.** An unsupplied fighter keeps fighting at **×0.25 max hit**. Measured: 26–38% of a supplied night. | §3 |
| R3 | **Burn is a pure function of time**, never of accuracy, kills, or drops. An arrow is spent on the *swing*, hit or miss. This is what makes the pre-flight projection honest. | §4 |
| R4 | **Sharpening stones are charges, not a timer.** A timed buff freezes while away (b336) and would therefore pay nothing overnight — useless in an idle game, and unprojectable. Stones burn per swing at 1/50. | §7 |
| R5 | **Melee's floor stays free; melee's ceiling is paid.** A whetstone is +14–18% max hit for ~30 stones/hour. Melee has no depletion penalty because a sword works unsharpened. The asymmetry is deliberate and is stated plainly rather than hidden. | §7.4 |
| R6 | **All three new skills are ARTISAN skills.** The gathering engine is hard-branched on three skill ids in ~14 sites of `legacy.js`; the artisan engine is generic over `ARTISAN_RECIPES[skill]`. A fourth gathering table is code; a fourth artisan lane is data. | §5 |
| R7 | **The three consumable ladders carry the SAME stat curve**, because they are the same slot. One guard covers all three and no style is quietly ahead. | §6 |
| R8 | **Stonemason needs no workbench.** Forge/Workshop/Shrine gate their skills; a mason works outdoors. This removes the b213/b227 room-cost deadlock class from the castle chain entirely. | §8 |
| R9 | **Elements and enchanting are PHASE TWO** and add meaning to phase-one items rather than replacing them. Phase two ships **9** new items, not 42, and the damage ceiling is a clamped **1.35**. | §11 |
| R10 | **If only one ships, it is Fletching** — because shipping it ships the *mechanism* the other two then reuse as pure data. | §12 |

---

## 1 · The measured gap

`ammo` appears 25 times in the client. Every one is UI: the slot list, the equip-doll
position, the category tab, the icon map, the equip routing. **`src/core/**` and
`supabase/functions/**` contain no reference to `ammo` at all.**

Verified by grep, then **proven by running the real away loop** rather than inferred from it —
a 12-hour absence at level 40 with a longbow and 500 Steel Arrows:

```
ticks = 20,454   kills = 5,824
fx.removeItem called: 0 times
inventory.steel_arrows AFTER = 500  (was 500)
```

5,824 monsters killed, 20,454 arrows loosed, nothing spent.

The b343 ammo ladder shipped today (7 tiers, `slot-ladders.js`) and its own header says so:
*"NOTHING CONSUMES THESE YET."* It also left an interface note addressed to this design. That
interface is honoured in full in §6.1.

Two things follow that are worth stating before any content is designed:

**1.1 — Combat is the only loop in Hearthrise with no input cost.** Gathering costs time.
Artisan costs materials. Farming costs seeds and wall-clock. Combat costs nothing and pays
gold, drops, XP across up to seven skills, bounty progress, quest progress, collection log,
Farmer's Deeds and clan contribution. Measured at level 50 against Dire Wolves, an 8-hour
absence pays **352,005 g of gold + drop book value** and **1.38 M combat XP**, for zero inputs.

**1.2 — One consumable already depletes away, and it is the messy one.** Auto-eat food
consumes while away by design (`away.js CHANNEL.HEAL`, *"survival, not a bonus"*). So the
ruling in §3 is not new behaviour; it is the *generalisation* of behaviour that already ships.
That matters for the argument and it matters for the projection: food is the one existing
consumable whose burn rate is **stochastic** (§4.4).

**1.3 — A live cross-style leak, found while measuring.** `equipmentStats` sums `critB` from
every slot regardless of the active style. A **melee** player who equips Dawnpoint Arrows gets
**+0.03 crit for free**, because melee has no reason to use the ammo slot:

```
melee, no ammo        : { atkB:42, strB:35, critB:0    , weaponType:'sword' }
melee + top arrows    : { atkB:42, strB:35, critB:0.03 , weaponType:'sword' }
```

Whetstones close this by giving melee something it actually wants in that slot — but the leak
exists **today**, before any of this ships. Raised to the itemization agent in §14.

---

## 2 · The one mechanic

> **R1.** Ranged, magic and melee all consume through the same field, in the same slot.

```
consumed_this_swing = ammoPerShot(ITEMS[equipment.ammo])
```

That is the whole engine change. `ammoPerShot` already exists, already ships on seven items,
and its own authoring comment already anticipates being generalised: *"authored as DATA so a
future 'one arrow in five is recovered' perk, or a heavy bolt that costs two, is a data change
and not a code change."* A whetstone that costs **1/50** is the same generalisation in the
other direction.

| style | slot occupant | `ammoPerShot` | fiction |
|---|---|---|---|
| ranged | arrows | 1 | one arrow per shot |
| magic | a bound rune, socketed in the staff | 1 | one rune per cast |
| melee | a whetstone in the belt | 0.02 | one honing every ~2 minutes of swinging |

**Why not three mechanics.** Because the codebase has paid for parallel implementations of one
idea eleven times (`combat-sim.js` header lists them) and once more for `rollProc` and five
times for FNV. A second consumption path would drift from the first in exactly the way
`processOfflineCombat` drifted from `combatTick`. One field, one carry, one guard.

**2.1 — Fractional burn needs a deterministic carry, and the pattern exists.**
`advanceToolCarry` in `src/core/tools.js` is a per-skill fractional accumulator, chosen
*specifically* so an away replay is byte-identical run to run rather than an RNG roll. The
same shape serves `ammoPerShot < 1`, including the `+1e-9` correction that file already
documents (0.02 accumulated 50 times floats short without it). **Do not roll a dice for
consumption** — the away-parity test would go red and the projection would become a lie.

**2.2 — Where the count lives. This is an engine question and it has one right answer.**
Verified by reading `equipItem` (legacy.js:4364): equipping moves **exactly one** unit into the
slot and returns the previous occupant to the bag. `G.equipment` is `{slot: itemId}` with no
quantity. So today, equipping 500 arrows puts **1** in the slot and leaves 499 in the bag.

**Proposal:** `equipItem` special-cases `type === 'ammo'` and does **not** call
`removeItem` — the slot becomes a *pointer* naming which stack is in use, and the whole
quiver stays in the inventory. Consumption decrements `inventory[ammoId]`.

Rejected alternative: `G.equipment.ammo = {id, qty}`. It changes the equipment shape for the
doll, the save snapshot, `hr_start_equipment`, the server catalogue and every renderer, to
express something the inventory already expresses. The pointer model also makes the
projection trivially correct: **the supply the player is asked about is literally
`inventory[ammoId]`**, with no second place for it to hide.

---

## 3 · The fail-soft ruling, and the number

> **Tyler (via Coordinator):** running out does not stop you training — you can still train
> ranged or magic with no arrows/runes, it is *"just very very weak."*

> **R2.** Unsupplied damage is **×0.25 on max hit.**

### 3.1 Why max hit, and not accuracy or XP

| lever | verdict |
|---|---|
| **max hit** ✅ | Near-linear in throughput, floors at 1 so a beginner is protected, affects kills/gold/drops/XP uniformly, and the engine already has the exact hook — `maxHit = max(1, floor(maxHit × mult))` is the same line the style, weakness and food-damage multipliers already use. |
| accuracy ❌ | Clamped to `[0.15, 0.95]`. A multiplier on a clamped value is non-linear *and monster-dependent*: ×0.25 on 0.95 lands at the 0.15 floor (−84%), but a player already at 0.15 against a hard foe loses nothing. Backwards, and unprojectable. |
| XP only ❌ | Kills, gold and drops would flow unchanged, so a loot-focused player would deliberately run dry. A perverse optimum is worse than a punishment. |

### 3.2 The arithmetic, measured

8-hour absence, `simulateSpan` with `away:true`, seeded, zero bonuses, auto-eat on.
Every row is a real run.

| build | mult | kills | gold + drop value | combat XP | food eaten |
|---|---|---|---|---|---|
| **L30 ranged, longbow, Giant Bat** | 1.00 | 4,578 | 87,197 | 861,051 | 333 |
| | 0.50 | 2,638 (58%) | 51,290 (59%) | 435,787 (51%) | 395 (119%) |
| | 0.35 | 2,007 (44%) | 38,571 (44%) | 318,088 (37%) | 414 (124%) |
| | **0.25** | **1,528 (33%)** | **29,734 (34%)** | **235,713 (27%)** | **436 (131%)** |
| | 0.15 | 1,050 (23%) | 20,161 (23%) | 154,765 (18%) | 455 (137%) |
| **L50 ranged, longbow, Dire Wolf** | 1.00 | 2,874 | 352,005 | 1,383,385 | 743 |
| | **0.25** | **816 (28%)** | **102,911 (29%)** | **352,242 (25%)** | **897 (121%)** |
| **L70 ranged, longbow, Bear** | 1.00 | 1,824 | 623,258 | 1,993,181 | 1,340 |
| | **0.25** | **498 (27%)** | **167,311 (27%)** | **508,673 (26%)** | **1,487 (111%)** |
| **L90 ranged, longbow, Night Panther** | 1.00 | 1,646 | 992,830 | 2,809,072 | 2,692 |
| | **0.25** | **437 (27%)** | **256,560 (26%)** | **707,157 (25%)** | **2,940 (109%)** |
| **L30 magic, oak staff, Skeleton** | 1.00 | 2,632 | 71,002 | 687,003 | 409 |
| | **0.25** | **749 (28%)** | **19,508 (27%)** | **171,275 (25%)** | **523 (128%)** |
| **L10 ranged, shortbow, Goblin** | 1.00 | 2,880 | 37,247 | 297,447 | 451 |
| | **0.25** | **1,086 (38%)** | **13,208 (35%)** | **97,508 (33%)** | **527 (117%)** |

**The headline, honestly stated: ×0.25 on max hit pays 25–33% of a supplied night's XP and
26–38% of its gross.** Call it **0.28 at mid and late levels**. It is *better than 0.25* early
because `Math.max(1, …)` binds — at level 10 against a Goblin, ×0.25 and ×0.15 are the same
number, so **the player who has not yet built a supply chain is the least punished by not
having one.** That is not a happy accident to be tolerated; it is the property that makes a
7-day-from-zero beta safe (§12.2), and it should be preserved.

### 3.3 Why 0.25 and not 0.50 or 0.10

- **0.50 is too soft.** It pays ~55% of a night. Supplying only doubles you, and "I forgot my
  arrows" becomes a shrug. The whole point of the ruling is that the loadout decision made
  before the tab closes is *the* decision (§4); a decision worth 2× is interesting, a decision
  worth 4× is the game.
- **0.10 is too hard.** ~15% of a night. That is the number that produces hoarding anxiety, and
  it turns the away card's honest sentence into a bug report. It also over-punishes exactly
  the players who most need slack: someone who mis-estimated by an hour.
- **0.25 sits where "you should have prepared" and "the night still paid" are both true.**
  A player who runs dry at hour 4 of 8 collects `0.5 + 0.5 × 0.28 = 64%` of a full night. They
  lost a third of the night, which they will feel, and they got two-thirds, which they will not
  rage-quit over.

Also note the counter-argument the Coordinator raised — *"at 50% nobody buys arrows"* — is not
what the arithmetic says. Even at 0.50, supplying doubles output for 4–10% of gross (§6.4), so
it is still an obvious yes. **0.50 fails for a design reason, not an economic one:** it makes
running dry cost too little to be worth thinking about, which is the same as not having the
mechanic.

### 3.4 The second-order effect nobody would have predicted, and it must be projected

**Running dry makes you eat more.** Measured above: food consumption rises **+9% to +37%**
when unsupplied, because a fight that takes four times as many swings takes four times as many
*monster* swings too. So the honest projection is **two-segment**: food burns at rate `f` until
the ammo runs out and at up to `1.35 × f` afterwards. A one-segment food projection computed at
the supplied rate will over-promise on exactly the night that already went wrong.

### 3.5 What fail-soft removes from the design

An unsupplied player is **never bricked**, so there is no fail-closed path, no "your character
stopped" state, no zero-progress night, and no need for a pre-flight *block*. This deletes an
entire class of edge case: what happens if a player's supply is destroyed, traded away, or
mis-equipped mid-absence is now the same as any other Tuesday — the numbers get smaller. It
also means the depletion mechanic is safe to ship *before* inventory becomes
server-of-record, because the worst outcome of a forged arrow count is a player who ran at 1.0
when they should have run at 0.25 — a beta that is being wiped anyway (§13.2).

---

## 4 · Burn rates as a public interface

> A separate designer owns the pre-flight projection surface (`docs/design/supply-projection.md`).
> This section is the contract that surface consumes. **It is deliberately written as closed-form
> expressions, not worked examples**, because ambiguity here becomes a wrong number on a player's screen.

### 4.1 The formula, whole

```
swingIntervalMs(eq, style)                                          [src/core/combat.js — EXISTS]
  = max( 600,
         floor( 2400
                × (1 − clamp(eq.spdB, 0, 0.20))
                × WEAPON_SPEED_MOD[eq.weaponType]
                × clamp(style.speedMod, 1.00, 2.00) ) )

WEAPON_SPEED_MOD = { sword: 1.00, hammer: 1.35, ranged: 0.88, magic: 1.05, neutral: 1.00 }

swingsPerHour        = 3_600_000 / swingIntervalMs
consumablesPerHour   = swingsPerHour × ammoPerShot(ITEMS[equipment.ammo])
hoursOfSupply        = inventory[equipment.ammo] / consumablesPerHour       (ammoPerShot > 0)
                     = ∞                                                    (ammoPerShot === 0)
```

Three inputs: **equipped weapon** (family + `spdB`), **chosen style** (`speedMod`), **equipped
ammo** (`ammoPerShot`). All three are known before the tab closes. Nothing stochastic. Nothing
monster-dependent.

### 4.2 The measured table (0 bonuses)

| style · stance | interval | swings/h | **8 h** | **12 h** (F2P cap) |
|---|---|---|---|---|
| ranged · Rapid | 2112 ms | 1,704.5 | **13,636** | 20,455 |
| ranged · Precise | 2217 ms | 1,623.8 | 12,991 | 19,486 |
| ranged · Longrange | 2323 ms | 1,549.7 | 12,398 | 18,597 |
| magic · any | 2520 ms | 1,428.6 | **11,429** | 17,143 |
| sword · any | 2400 ms | 1,500.0 | 12,000 | 18,000 |
| hammer · any | 3240 ms | 1,111.1 | 8,889 | 13,333 |

Worst case the projection must handle is **`spdB` at the 0.20 engine clamp**:

| style | interval | swings/h | 8 h | 12 h |
|---|---|---|---|---|
| ranged · Rapid | 1689 ms | 2,131.4 | **17,052** | 25,577 |
| magic | 2016 ms | 1,785.7 | 14,286 | 21,429 |
| sword | 1920 ms | 1,875.0 | 15,000 | 22,500 |

So the honest bands are: **arrows 1,550–2,131/h · runes 1,429–1,786/h · whetstones 22.2–37.5/h.**

### 4.3 The property that makes all of this work, and it is already true

`simulateSpan` runs `floor(spanMs / tickMs)` ticks for the whole span regardless of what
happens in the fight. Confirmed by execution: **ticks = 13,636 in every 8-hour ranged run
above, at every damage multiplier, against every monster** — the number only moves when the
player dies. Consumption is therefore *exactly* `swings × ammoPerShot`, independent of monster
choice, accuracy, kill rate and drop luck.

**This is why an arrow must be spent on the SWING and not on the HIT.** Spending on hits would
make the burn rate a function of the monster's defence and the player's accuracy — still
computable, but it would mean a high-accuracy build is *cheaper to run*, which inverts the
intent, and it would couple the projection to the monster the player has not picked yet.
**R3: spend on swing.**

### 4.4 The one rate that is NOT closed-form — say it out loud

**Food.** Auto-eat fires when `playerHp < playerMaxHp × autoEatPct` (0.5) and consumes one
`G.foodSlot` item. The count depends on the monster's accuracy roll and damage roll, so it is a
distribution, not a number. The honest expectation:

```
expectedDamagePerHour ≈ swingsPerHour × monsterAccuracy × (1 + monsterMaxHit) / 2
foodPerHour           ≈ expectedDamagePerHour / ITEMS[foodSlot].heals
```

That is projectable **as an estimate**, and it must be labelled as one. My three new
consumables are deterministic *by design choice*, precisely so the projection surface carries
three exact numbers and one estimate rather than four estimates — and so the one soft number is
the one that was already soft before this design existed.

### 4.5 What the projection needs that does not exist yet

`swingIntervalMs` is already in `src/core` and already shared with the accrual Edge Function
(b329 collapsed the two copies). **`consumablesPerHour` and `hoursOfSupply` must live beside
it in `src/core/**` and be called by BOTH the pre-flight projection and the server's away
accrual.** If the projection computes its own copy, the two will disagree, and the player will
be told a number the night does not honour. That is the `deriveTickMs` mistake, pre-registered.

---

## 5 · Why all three are artisan skills

> **R6.** Fletching, Runecrafting and Stonemason are **artisan** skills.

This is a scope finding, not a taste call. Measured in the source:

- **The gathering engine is not generic.** `legacy.js` branches on
  `type === 'woodcutting' | 'mining' | 'fishing'` in **~14 separate sites** (3267–3269, 3410–3412,
  4293–4295, 7256–7258, 7283–7285, 9071–9073, 9845–9847, 10280–10282, 11057–11059, 11198–11203, …).
  A fourth gathering table means editing all of them, in the 9k-line monolith, which
  `CLAUDE.md` marks as the file agents cannot parallelise on.
- **The artisan engine IS generic.** `resolveArtisanAction(recipe, ctx)` takes `skillId` as an
  argument and reads `ARTISAN_RECIPES[skill]`. Adding a lane is ~12 one-line map additions
  (§12.3), most of them `{cooking:…, smithing:…, crafting:…, prayer:…}` dictionaries.
- **`ROCKS` carries a hard invariant that a sideways node would break.** Smoke guard
  *"b226: every gathering rung is strictly faster XP/sec than the one below it"* walks each table
  **in array order**. A quarry node that is deliberately *not* better than coal would fail it.
  Correctly — that guard exists because Mithril Rock was once a punishment to unlock.

**5.1 — One shared speed key, not three new ones.** `speedKeyFor` (`src/core/pacing.js:52`)
maps four artisan skills to four perk keys and **falls back to `gatherSpeed` for anything
unknown**. Three new skills would therefore be silently sped up by the Garden/tool
`gatherSpeed` stack — a live bug the moment the skills land. The fix is *not* to invent
`fletchSpeed` / `runeSpeed` / `masonSpeed`: each new key needs a room rung to produce it, and
there are no more rooms, so all three would be **ghost keys with no producer** — exactly the
`storage` failure the b227 Cellar ruling was written to end. **Proposal: all three map to
`craftSpeed`**, i.e. the Workshop speeds the whole crafting family. One row each in
`ARTISAN_SPEED_KEY` and its five client copies (legacy.js:2235, 3370, 10255,
`activities-grid.js:27`, and core).

---

## 6 · The three supply chains, end to end

```
RANGED
  Woodcutting → logs → Crafting → planks ┐
                                         ├→ FLETCHING → arrows ──────────────→ ammo slot, 1/swing
  Mining → ore → Smithing → bars ────────┘

MAGIC
  Mining → (by-product) → stone → STONEMASON → blocks → rune blanks ┐
                                                                    ├→ RUNECRAFTING → bound runes → ammo slot, 1/swing
  combat drops → magic_essence (tiers 4+) ──────────────────────────┘

MELEE
  Mining → (by-product) → stone → STONEMASON → blocks ┐
                                                      ├→ whetstones ─────────→ ammo slot, 0.02/swing
  Mining → ore → Smithing → bars ─────────────────────┘

CASTLE (not a consumable — the other half of Stonemason)
  STONEMASON → ashlar (Sm 45) ────→ personal property tiers 4-6 + room rungs L4
             → keystone (Sm 60) ──→ personal room rungs L5      [adopted from Crafting]
             → vaultstone (Sm 85) → clan castle tiers 4-5
```

Note what this does to the map: **every existing gathering skill now feeds combat**, and the
one that did not (Mining, whose entire output went to Smithing) now feeds two more skills.

### 6.1 Ranged — the interface with the itemization agent, honoured

The b343 ladder shipped 7 arrow items and 7 `fletch_*` recipes under **crafting**, with a
header saying they are *"the Fletching agent's to relocate"*. I accept that interface as
written and change **none** of its numbers:

| item | tier | Ranged req | `rangeStrB` | `v` | `ammoPerShot` | recipe req | inputs / 500 |
|---|---|---|---|---|---|---|---|
| bronze_arrows | 1 | 1 | 2 | 1 | **0** | 5 | bronze_bar 6, normal_plank 4 |
| barbed_arrows | 2 | 15 | 3 | 1 | 1 | 18 | iron_bar 2, oak_plank 2 |
| steel_arrows | 3 | 30 | 5 | 2 | 1 | 33 | steel_bar 2, willow_plank 2 |
| mithril_arrows | 4 | 45 | 8 | 4 | 1 | 48 | mithril_bar 1, maple_plank 2 |
| rune_arrows | 5 | 60 | 11 | 6 | 1 | 63 | rune_bar 1, yew_plank 1 |
| emberhead_arrows | 6 | 75 | 14 | 9 | 1 | 78 | ember_bar 1, silk_thread 16 |
| dawnpoint_arrows | 7 | 88 | 18 | 12 | 1 | 91 | dawn_bar 1, duskwood_plank 1 (×1000) |

**What Fletching changes: the skill key, and nothing else.** Seven `skill: 'crafting'` become
`skill: 'fletching'`.

**One observation on their file, not a change request.** At `ammoPerShot: 0` a stack never
depletes, so **one** Bronze Arrow is a permanent quiver — the batch of 500 is decorative and
`fletch_bronze_arrows` is really an XP/gold rung wearing an ammo hat. That is fine and I would
keep it (it is a clean first Fletching action), but it should be *known* rather than discovered.

**Fletching should also own bows.** `WEAPON_FAMILIES` in `gear-tiers.js` already carries a
`skill:` field on every family — `bow` says `skill: 'crafting'`, `staff` says `skill: 'crafting'`
— **and the generator ignores it**, routing on `fam.mat === 'bar' ? smithing : crafting`. Making
the generator honour the field it already reads is a two-line change that moves the 7-rung bow
ladder to Fletching as *data*. That is the difference between Fletching being "the arrow tab"
and Fletching being a skill.

### 6.2 Magic — the rune ladder

Runes occupy the ammo slot: **the staff has a socket, and you load it with a bound rune.** This
is the cheapest possible magic consumable (zero new mechanics beyond §2) and it sets up phase
two perfectly, because in phase two the *choice of which rune* becomes a tactical decision
rather than only a tier choice (§11).

**Proposal** — stats mirror the arrow ladder exactly (see R7 / §6.3):

| item | tier | Magic req | `magicStrB` | `v` | `ammoPerShot` | Runecrafting req | inputs / 500 |
|---|---|---|---|---|---|---|---|
| air_rune | 1 | 1 | 2 | 1 | **0** | 5 | rune_blank 40 |
| earth_rune | 2 | 15 | 3 | 1 | 1 | 18 | rune_blank 60 |
| water_rune | 3 | 30 | 5 | 2 | 1 | 33 | rune_blank 90, coal 2 |
| fire_rune | 4 | 45 | 8 | 4 | 1 | 48 | fine_rune_blank 60, coal 4 |
| chaos_rune | 5 | 60 | 11 | 6 | 1 | 63 | fine_rune_blank 90, magic_essence 2 |
| death_rune | 6 | 75 | 14 | 9 | 1 | 78 | deep_rune_blank 60, magic_essence 4 |
| blood_rune | 7 | 88 | 18 | 12 | 1 | 91 | deep_rune_blank 90, ancient_rune 1 |

**Rune values equal arrow values exactly** (`1 / 1 / 2 / 4 / 6 / 9 / 12`) — see R7. The
anti-faucet rule closes on the same intermediates as §6.3: at `rune_blank` v ≈ 5, the water rune
batch is `90 × 5 + 2 × 40 = 530 g` of input for `500 × 2 = 1,000 g` of output = **1.9×** ✓, and
the blanks themselves are `dressed_block 1 (20 g) → 5 blanks`, so `5 × 5 / 20 = 1.25×` ✓.

Design notes:
- **The catalyst enters at tier 4, not tier 1.** `magic_essence` is a *combat drop*
  (Dark Wizard 0.40, Warlock 0.55, Archmage 0.80). Gating low-tier runes on it would make magic
  circular in the bad direction — you would need runes to farm the thing that makes runes.
  From tier 5 the loop is the good kind: kill mages, bind their essence, cast at mages.
- **Magic burns 16% fewer consumables per hour than ranged** (2520 ms vs 2112 ms) at identical
  item values. That is a deliberate, stated discount for the deeper chain — magic's supply
  crosses **two** skills (Stonemason → Runecrafting) where ranged's crosses one. If Tyler
  prefers exact parity, raise rune `v` by ~20%; I recommend the discount.
- The names are chosen so that **phase two can hang elements on them with no renames**
  (§11.2).

### 6.3 Melee — whetstones

**What I own here: the burn rate, the stat curve, the level gates, and the value *constraint*.
The exact `v` and the exact input quantities belong to the itemization agent**, who owns
ammo-slot economics and whose two published rules both bind here (input value 10–20% of gross;
`batch × v` within ~2× input value). I set the frame; they set the numbers.

| item | tier | Attack req | `strB` | `ammoPerShot` | Stonemason req | inputs / batch of 10 |
|---|---|---|---|---|---|---|
| coarse_whetstone | 1 | 1 | 2 | **0** | 6 | dressed_block 1 |
| copper_whetstone | 2 | 15 | 3 | 0.02 | 16 | dressed_block 2, copper_bar 1 |
| iron_whetstone | 3 | 30 | 5 | 0.02 | 31 | dressed_block 3, iron_bar 2 |
| **steel_whetstone** | 4 | 45 | 8 | 0.02 | 46 | **granite_block 3, steel_bar 2** |
| mithril_whetstone | 5 | 60 | 11 | 0.02 | 61 | granite_block 4, mithril_bar 1 |
| rune_whetstone | 6 | 75 | 14 | 0.02 | 76 | basalt_block 3, rune_bar 1 |
| dawn_whetstone | 7 | 88 | 18 | 0.02 | 91 | basalt_block 4, dawn_bar 1 |

**The value constraint, derived rather than guessed.** Two inequalities have to hold at once,
and they pin `v` to a narrow band:

```
(a) cost of a full night ∈ [4%, 10%] of that night's gross
(b) batch × v ≤ ~2 × (input value)          — the anti-faucet rule
```

Worked at the steel rung, against the measured L50 melee night (8 h, gross 243,706 g, 12,000
swings, 240 stones):

```
(a)  total input 9,750 – 24,370 g   →   41 – 102 g of input per stone
(b)  v ≤ 2 × (input per stone)      →   v ≤ 82 – 204
```

With intermediates priced at **`rubble` 6 · `granite` 22 · `basalt` 60** (raw) and
**`dressed_block` 20 · `granite_block` 120 · `basalt_block` 300**, the steel rung's batch costs
`3×120 + 2×150 = 660 g` for 10 stones = **66 g/stone**, so a night costs **15,840 g (6.5% of
gross)** ✓ and `v = 130` gives `10 × 130 / 660 = 1.97×` ✓ — just inside the anti-faucet rule.

**That lands melee's nightly consumable spend at 15,840 g against the archer's 14,727 g for the
same night — a 7.6% difference. Parity by construction.** My earlier instinct of `v = 200` would
have been a **3.03× faucet**; the constraint caught it, which is the reason it is written down
as arithmetic instead of a table.

*Both sides of that parity are computed against **full drop book value**, so the comparison
holds regardless of which definition of "gross" wins the §6.4 argument — but the absolute
percentage moves with it.*

Whetstones carry **`strB` only** — no `critB`, no `spdB`, no `atkB`. `critB` would leak to
every style through `equipmentStats` (§1.3); `spdB` is closed by the b343 ruling (best-in-slot
is 0.16 against a 0.20 clamp).

> **R7.** The three ladders carry the **same stat curve** — `2 / 3 / 5 / 8 / 11 / 14 / 18` —
> because they are the same slot. **Values are then set so that the gold-per-hour cost of being
> fully supplied is the same for all three styles**, which is the property that actually
> matters; the item-value ratio (~30–50× for a whetstone over the arrow at the same tier) is an
> *output* of that, not an input, and it is bounded by the anti-faucet rule rather than chosen.
> One smoke guard can assert the stat curve across all three ladders at once; if a future item
> breaks it the guard says which one.

### 6.4 What supply actually costs, measured through the whole chain

Time to produce one 8-hour night, walking every step from ore and logs, at PACE with zero
bonuses:

| arrows | production time | as a share of the 8 h it supplies | book value of the stack |
|---|---|---|---|
| barbed (t2) | **28.4 min** | 5.9% | 13,636 g |
| steel (t3) | **46.5 min** | 9.7% | 27,272 g |
| mithril (t4) | 32.8 min | 6.8% | 54,544 g |
| rune (t5) | 45.3 min † | 9.4% | 81,816 g |
| emberhead (t6) | 25.0 min † | 5.2% | 122,724 g |
| dawnpoint (t7) | 32.9 min | 6.8% | 163,632 g |

† excludes combat drops in the chain (27 `magic_essence` for rune; 436 `silk_thread` for emberhead).

**Only ~2.5 minutes of that is Fletching.** The other 26–44 minutes is Mining, Woodcutting,
Smithing and Crafting. **That is the whole design goal, in one number:** a ranged player who
wants to sleep through a good night has to have been a miner and a woodcutter, and the arrow
is the receipt.

Against gross: a tier-3 arrow costs **1.08 g of input** (steel_bar 2 + willow_plank 2 = 540 g
per 500) and earns **25.8 g of gross** at the level it is used (352,005 g ÷ 13,636 arrows) —
**4.2% of gross**.

**That is BELOW the itemization agent's own stated 10–20% target, and the discrepancy is worth
naming rather than smoothing over.** The likely cause is that my gross includes the *full book
value* of every drop while theirs probably used vendor bids (`VENDOR_RAW_RATE = 0.20` on raw
materials), which would move a drop-heavy night by a factor of ~3–5. **Both readings are
defensible and neither should be silently adopted.** For design purposes the number that
matters is the one a player experiences, and it sits somewhere in **4–20% of gross** — a real
cost, comfortably short of punitive, which is the right place for a mechanic being introduced.
**Handoff: agree one definition of "gross" with itemization before either of us tunes against
it** (§14), because two agents optimising against two definitions is how a consumable ends up
either free or extortionate.

Melee, same arithmetic (worked in full in §6.3): a steel whetstone covers 50 swings ≈ 1,015 g of
gross, costs ~66 g of input, and an 8-hour sword night needs **240 stones ≈ 15,840 g of input**
— **6.5% of gross, against the archer's 14,727 g for the same night.** Parity by construction,
not by coincidence.

---

## 7 · Sharpening stones — the mechanism decision

This is the trickiest piece and the coordinator's third ruling made it a design criterion:
*if a player cannot be told "your sharpening stone lasts N hours", it fails.*

### 7.1 Why not a timed buff — this is disqualifying, not a preference

The away ruling (`away-time-ruling.md`, locked, binding) is unambiguous:

> *Food / consumable buffs away? **NO — and they do not drain.** A timed buff is **frozen**: it
> neither pays nor ticks down.*

`buffs.js tickBuffs` implements it: `if (ctx && ctx.away) { res.frozen = true; return res; }`.

So a duration-based sharpening stone **pays nothing overnight**. In an idle game whose whole
pitch is that it plays while you are away, that makes melee's consumable a purely-active
mechanic and therefore irrelevant to the loop it is supposed to deepen. It also fails
projection: "lasts 20 minutes" is a lie the moment the tab closes.

**I am not proposing a divergence from b336.** The rule is right — it closed a live exploit
(eat a 10-minute buff, close the tab, collect 12 hours of buffed gathering). The correct
response is to **not be a buff.**

### 7.2 The mechanism: charges, on the consumption channel

A whetstone is consumed per swing at `ammoPerShot: 0.02` — the *same* channel as arrows, which
pays and drains away because it is a spend, not a bonus. Consequences:

- **It works unattended**, which was the hard requirement.
- **It is projectable by the same formula as arrows** (§4.1). No second projection path.
- **It does not touch `AWAY_SCOPE` at all.** `away.js` is unchanged, byte for byte — the same
  reasoning `licence.js` gives for staying out of that table.
- **`stones ÷ stonesPerHour` is a duration**, so the player-facing copy can still read
  *"Keen edge: 8h 00m"* — Tyler's "temporary" framing survives intact in the surface, while
  the mechanic underneath is a spend. The number shown is **derived**, never stored, so it can
  never drift from the thing it describes.

### 7.3 What happens when it expires mid-absence

**Nothing dramatic, and that is the point.** The `strB` from the empty slot stops applying and
max hit drops by 14–18%. There is **no** ×0.25 penalty for melee (§7.4). The away card names
the moment (§10).

Contrast with what a timed buff would have done: at the moment of expiry the game would have to
decide whether the buff was frozen (so it never expired and never paid) or ticking (so it
expired 20 minutes in and 7h40m of the night silently ran without it, with the buff still
reading "20:00" on return). Both answers are bad. The charge model has no such moment.

### 7.4 Melee's floor stays free — the honest statement

> **R5.** A sword works unsharpened. Melee has **no** depletion penalty.

The brief's framing was *"Melvor's melee is free — sharpening stones give melee a cost too, so no
style is the default cheap option."* **With this design that is half true and I will not
pretend otherwise:**

| | floor | ceiling |
|---|---|---|
| ranged / magic | **paid** (0.25× unsupplied) | paid |
| melee | **free** | **paid** (+14–18% max hit for ~30 stones/h) |

Melee's cost is *optional and bounded*; ranged's is *metered and mandatory*. Those are different
shapes, and I think the asymmetry is correct rather than a compromise:

1. **The starting weapon is a Bronze Sword** (`start-kit.js`). A paid melee floor means a
   brand-new character is in the penalty state from second one. The b343 ammo ruling already
   answered the equivalent question for ranged — *"the first rung is therefore free"* — and the
   same answer must apply to the style everyone starts in.
2. **The alternative is durability.** Making melee's floor paid means an unsharpened blade is
   at 0.25×, which is weapon decay wearing a different hat. It is the most-hated mechanic in the
   genre and it is the only version of this design that could make a player *worse off for
   having played*.
3. **At the top of the game every style is paying**, which is the property that actually
   matters. A max-level melee player who does not sharpen is 15% behind; that is a real,
   permanent, visible gap.

**If Tyler wants melee's floor paid too, there is exactly one clean lever** and it should be a
deliberate decision, not a drift: rebase melee weapon `strB` down by ~15% at tiers 4–7 and let
the whetstone restore it, so "sharpened" is today's numbers and "unsharpened" is the nerf. It
costs a re-tune of `WEAPON_FAMILIES` and it is a straight nerf to every existing melee player.
Round 2 wipes, so this is the *only* window in which it is free to do. **Flagged, not taken.**

### 7.5 The projection sentence, checked

- sword, no speed gear: 1,500 swings/h × 0.02 = **30 stones/h** → 240 for 8 h, 360 for 12 h
- hammer: 1,111 × 0.02 = **22.2 stones/h** → 178 for 8 h
- sword at the `spdB` clamp: 1,875 × 0.02 = **37.5 stones/h** → 300 for 8 h

*"You are carrying 210 whetstones — about 7 hours of keen edge on this weapon."* Exact, derived
from three known values, and it moves correctly when the player swaps to a hammer.

---

## 8 · Stonemason and the castle

Tyler wants this skill *for* castle building. Here is what already exists, verified in source,
and the gap it leaves.

### 8.1 What exists

**Personal ladder** (`src/features/homestead.js` TIERS): Wanderer's Camp → Hearthside Homestead
→ Fieldworth Farmstead → **Stonecross Manor** → **Ironvale Keep** → Hearthrise Castle.
Costs are gold + logs + ore + planks + bars + pelts. **There is no stone anywhere in it.**
Tier 4 is literally called *Stonecross*. Room rungs are named *Stone Forge*, *Stone Cellar*,
*Stone Altar* and cost logs and ore.

**Clan ladder** (`hr_castle_tiers`, seeded in `2026-08-08-clan-seat.sql`): Wayside Camp →
Palisade → Timber Hold → **Stone Bailey** → **Fortified Keep**. Materials are
`timber_beam`, `iron_fitting`, `field_ration`, `keystone`. **The Stone Bailey is built out of
timber and iron.**

**And the masonry good already exists, in the wrong skill.** `craft_keystone`
(`timber_beam 3, iron_fitting 3, ancient_fragment 2, cracked_spellstone 1` → `keystone`, req 60)
is authored under **Crafting** — a keystone is the single most masonic object in
architecture. It has exactly the same story as the `fletch_*` recipes: written where a skill
existed, waiting for the skill that should own it.

### 8.2 The two sinks, and which is which

> **Personal sink = the property ladder and its room rungs. Clan sink = `hr_castle_tiers`.**
> They must not share a good, or a player has to choose between their own house and their
> clan's wall, which is a miserable choice to force in a social game.

| good | Stonemason req | feeds | why |
|---|---|---|---|
| `dressed_block` | 1 | intermediate | the base material; not a sink |
| `granite_block` | 30 | intermediate | |
| `basalt_block` | 70 | intermediate | |
| **`ashlar`** | 45 | **personal** — property tiers 4–6, room rungs L4 | the personal capstone good, sitting beside `timber_beam` (Crafting) and `iron_fitting` (Smithing) so the three artisan pillars each contribute one |
| **`keystone`** | 60 | **personal** — room rung L5 | **adopted from Crafting.** Recipe and cost unchanged. |
| **`vaultstone`** | 85 | **clan** — `hr_castle_tiers` 4 and 5 | the clan good. Deliberately the highest Stonemason rung, because a clan castle should need a *specialist*, not a Tuesday. |

**This is a data change on both sides.** Personal: add `ashlar` to the `cost:` of TIERS 4–6 and
the L4 room rungs in `legacy.js`. Clan: add `vaultstone` to the `materials` jsonb of
`hr_castle_tiers` rows 4 and 5, plus the client catalogue regenerate. **I am not redesigning the
clan system** — the ladder, the contribution RPC, the caps and the journal are untouched.

**Balance note for the clan half, flagged to Security/Systems rather than decided here:** the
handoff records that `clan_power` still ranks on `clans.treasury`, and F1 is only half-closed.
Adding a *material* requirement to castle tiers is orthogonal to that (materials go through
`clan_deposit`, which is the properly-journalled path) — but the numbers for `vaultstone` at
tiers 4–5 should be set **after** the treasury-term fix lands, not before, or they will be tuned
against a ranking that is about to change.

### 8.3 The deadlock rule, and how this design stays out of it

b213 and b227 both shipped cost deadlocks: a tier demanded a material whose bench that tier
unlocked. The b227 Workshop case is the sharpest — the Workshop cost 15 planks, planks come
only from Crafting, Crafting is gated on the Workshop.

> **R8. Stonemason requires no workbench.** `WORKBENCH` stays
> `{cooking:'kitchen', smithing:'forge', crafting:'workshop', prayer:'shrine'}`.

A mason works outdoors. This is the same ruling the campfire got for Cooking, and it makes the
deadlock **structurally impossible** for the entire stone chain: `ashlar` can be required by a
property tier because nothing about producing it depends on owning a property tier. The
executable §7 proof in the smoke suite (*"no room rung can require a good the player cannot yet
make"*) will confirm it rather than being asked to trust it.

### 8.4 Where the stone comes from — one open decision

Stonemason needs `rubble`, `granite` and `basalt`, and the game has no stone at all — the
closest thing is a Stone Maul, which is made of planks and copper ore.

**P1 (recommended): stone is a MINING BY-PRODUCT.** One optional field on a `ROCKS` row —
`byprod: 'rubble', byprodQty: [1,2]` — and one line in `doSkillAction`. Every rock also yields
stone; the grade follows the rock's band:

| rocks | by-product |
|---|---|
| copper (1), iron (15), coal (30) | `rubble` |
| gold (45), rich coal (52), mithril (60) | `granite` |
| emberstone (75), dawnstone (90) | `basalt` |

Why this and not a quarry: it **reuses an existing material stream** rather than adding one
(the brief's explicit preference), it does not touch the `ROCKS` xp/sec invariant because it
adds no rungs, it gives Mining a second reason to exist beyond Smithing, and **a player who has
been mining since day one already has a stone pile the day Stonemason opens** — which is the
difference between a new skill feeling like a reward and feeling like homework.

Cost: one engine line, plus extending the *"every gathering rung's output is raw by
construction"* guard to cover `byprod` (it currently walks `prod` only, so a by-product would
slip past the `raw` flag and vendor at full book value instead of 20% — a real faucet, caught
here rather than in production).

**P2 (fallback if the engine line cannot be had): a Quarry lane of input-free Stonemason
recipes.** `resolveArtisanAction` handles it already — `recipeInputs({})` is `{}`,
`missingInput` returns null — and the mirror case ships today (Prayer's bury actions have
`output: null`). 100% data, zero engine. It mints from nothing at a fixed rate, which is
economically identical to a mining node, but it duplicates the mining fantasy and it needs its
own `raw`-flag guard anyway. **P1 is better; P2 is shippable in an afternoon.**

---

## 9 · The three skills as data

### 9.1 The XP curve — there is only one, and it is already shared

`src/core/xp.js XP_TABLE`, 99 entries, **13,034,431 XP to level 99**. It is Melvor's/RuneScape's
curve, it is unified into `legacy.js` by `core-bridge.js` with a drift guard, and the server
reads the same array. **No new curve.** Every rung below is expressed as book XP, which the one
choke-point (`addXp`) multiplies by `PACE.xp = 0.39`.

### 9.2 Calibration — what "to 99" costs in this game today

Measured: hours of *continuous action*, always training the best rung available, zero bonuses.

| skill | hours to 99 |
|---|---|
| woodcutting | 1,098 |
| mining | 1,113 |
| fishing | 1,059 |
| prayer | 417 |
| cooking | 155 |
| **smithing** | **27.8** |
| **crafting** | **25.5** |

**An artisan skill's hours-to-99 is a floor, not a forecast, and the gap is the point.** 26
hours of Crafting needs roughly 1,100 hours of Woodcutting to feed it. The real cost of an
artisan 99 is its *input chain*, which is exactly why adding three artisan skills adds
progression depth without adding a second XP treadmill. **Target for all three new skills: the
25–35 hour band, matching Smithing and Crafting.** Anything slower would be a second Cooking;
anything faster would be free.

### 9.3 FLETCHING

**Does:** turns wood and metal into ammunition and bows.
**Consumes:** planks (Crafting), bars (Smithing), silk thread.
**Produces:** the 7-tier arrow ladder; the 7-tier bow ladder; (phase 2) elemental arrowheads.
**Bench:** none needed — it inherits the Workshop's `craftSpeed` (§5.1) without being gated on it.

Rungs, as authored by itemization, measured through the real pacing pipeline:

| recipe | req | XP/action after PACE | action time | XP/h | batch |
|---|---|---|---|---|---|
| bronze | 5 | 35 | 5.1 s | 24,609 | 500 |
| barbed | 18 | 58 | 5.4 s | 38,382 | 500 |
| steel | 33 | 89 | 5.8 s | 55,625 | 500 |
| mithril | 48 | 128 | 6.1 s | 75,789 | 500 |
| rune | 63 | 175 | 6.4 s | 98,437 | 500 |
| emberhead | 78 | 234 | 6.7 s | 125,357 | 500 |
| dawnpoint | 91 | 319 | 7.0 s | 163,125 | 1000 |

Plus the bow ladder at gates `6 / 20 / 35 / 50 / 65 / 80 / 95` (from
`mat.craft + fam.lvOff`, unchanged). Interleaved, that is **a new rung roughly every 7 levels**
from 5 to 95, which is the density `pacing-overhaul` asks for. Landing in the ~25–30 h band.

### 9.4 RUNECRAFTING

**Does:** binds blank runes into cast-ready runes.
**Consumes:** rune blanks (Stonemason), coal, `magic_essence`, `ancient_rune`.
**Produces:** the 7-tier rune ladder; (phase 2) the three enchanting runes.
**Bench:** none.

Rungs at `5 / 18 / 33 / 48 / 63 / 78 / 91` mirroring Fletching, book XP
`90 / 150 / 230 / 330 / 450 / 600 / 820`, `ms 3200 → 4400`, batch 500 (1000 at t7). Identical
shape to Fletching by design: **two skills that supply two styles should not have two different
grind textures, or one style is quietly the cheap one.**

Seven rungs across 5–91 is thinner than Fletching's fourteen. Two ways to thicken it, both
phase-two-friendly: the three enchanting runes (§11.2) add rungs at ~40/65/85, and a
**"Rebind"** lane (recycle a lower rune into blanks at a loss) adds a low-value, always-available
action of the kind Prayer has. Recommend the first; the second only if the ladder reads thin
in playtest.

### 9.5 STONEMASON

**Does:** cuts stone. Four lanes.
**Consumes:** `rubble` / `granite` / `basalt` (Mining by-product), bars, `iron_fitting`.
**Produces:** blocks (intermediate) · rune blanks (→ Runecrafting) · whetstones (→ melee) ·
castle goods (→ property + clan castle).
**Bench:** **none** (R8).

Proposed ladder — 16 rungs, 1 → 91:

| req | recipe | inputs | output | lane |
|---|---|---|---|---|
| 1 | Dress Rubble | rubble 2 | dressed_block | block |
| 6 | Grind Coarse Whetstones ×10 | dressed_block 1 | coarse_whetstone | melee |
| 8 | Cut Rune Blanks ×5 | dressed_block 1 | rune_blank | magic |
| 16 | Grind Copper Whetstones ×10 | dressed_block 2, copper_bar 1 | copper_whetstone | melee |
| 22 | Split Rune Blanks ×8 | dressed_block 1 | rune_blank | magic (better rung) |
| 30 | Dress Granite | granite 2 | granite_block | block |
| 31 | Grind Iron Whetstones ×10 | dressed_block 3, iron_bar 2 | iron_whetstone | melee |
| 38 | Cut Fine Rune Blanks ×5 | granite_block 1 | fine_rune_blank | magic |
| **45** | **Cut Ashlar** | **granite_block 4, iron_fitting 1** | **ashlar** | **castle (personal)** |
| 46 | Grind Steel Whetstones ×10 | granite_block 3, steel_bar 2 | steel_whetstone | melee |
| **60** | **Set Keystone** | *(adopted verbatim from Crafting)* | **keystone** | **castle (personal)** |
| 61 | Grind Mithril Whetstones ×10 | granite_block 4, mithril_bar 1 | mithril_whetstone | melee |
| 70 | Dress Basalt | basalt 2 | basalt_block | block |
| 74 | Cut Deep Rune Blanks ×5 | basalt_block 1 | deep_rune_blank | magic |
| 76 | Grind Rune Whetstones ×10 | basalt_block 3, rune_bar 1 | rune_whetstone | melee |
| **85** | **Raise Vaultstone** | **basalt_block 6, keystone 1, dawn_bar 1** | **vaultstone** | **castle (clan)** |
| 91 | Grind Dawnsteel Whetstones ×10 | basalt_block 4, dawn_bar 1 | dawn_whetstone | melee |

Four lanes means Stonemason gets four derived category tabs. `recipeCategory()` derives lanes
from item fields and never from a hand-written tag, so this needs one `ARTISAN_CATEGORIES`
block plus one branch in `recipeCategory` — and `isCastleGood(item)` (`item.tag === 'castle'`)
already exists and already claims the castle lane. Land the categories in the **same commit**
as the items: `uncategorized` being empty is a regression test.

---

## 10 · Away honesty — what the card must say

The b342 machinery is already the right shape. `simulateSpan` already returns `survivedMs`,
`diedTo`, `crits`, `featuredMs`, `capped` and `buffsPaused` — *stated by the simulation so a
renderer can never infer*. Depletion joins that payload rather than being derived:

```
+ dryAtMs      : ms into the span at which the equipped ammo hit zero (null = never)
+ dryItemId    : which stack ran out
+ weakMs       : ms simulated at the unsupplied multiplier
+ consumed     : { <itemId>: qty }   — arrows/runes/stones actually spent
```

`dryAtMs` is **derivable in closed form before the span runs** —
`fromMs + floor(stock / ammoPerShot) × tickMs` — so the server computes it, the client renders
it, and neither invents it.

Required copy, in the Field Licence's register (state the fact, then the consequence):

> *"8h 12m away. You ran out of Steel Arrows 4h 20m in — the rest of the night fought at a
> quarter strength. 13,980 arrows would have covered it."*

and when it did not happen:

> *"8h 12m away · 13,980 Steel Arrows spent · quiver still holding 41,000."*

(8h 12m × 1,704.5 arrows/h = 13,977. **Both numbers come from the same expression** — the card
must not round one and floor the other, or a player who bought exactly what they were quoted
will run dry in the last minute and rightly report it as a bug.)

Two rules that follow from the away ruling's own "player-facing honesty" clause:

1. **The card must never say "you ran out" without saying what it cost.** *"the rest paid at a
   trickle"* is a lesson; *"you ran out"* alone is a bug report.
2. **The pre-flight number and the post-hoc number must come from the same function.** If the
   projection said 8 hours and the card says it ran dry at 4h20m, one of them is lying, and the
   only structural defence is that there is one implementation (§4.5).

**UI is not mine.** The card layout, the empty-quiver indicator on the equip doll, and the
"you are fighting unsupplied" state in the combat panel are handed to the **Art Director**
(§14). A mechanic this consequential that reads badly is worse than not shipping it.

---

## 11 · PHASE TWO — elements and enchanting

> **Tyler:** *"Once we get more robust monsters we can do things like ice/fire/poison
> enchantments on arrows and melee weapons so that can be done with enchanting runes too. That
> way instead of a monster just being weak to melee or magic, it can be weak to elements as
> well… Like an ice troll could be weak to both arrows and fire. So that combo is worth
> grinding for."*

Explicitly gated on *"once we get more robust monsters"*. **This does not ship in round 2.**
Phase one must not inflate to accommodate it — it must only *not preclude* it, which §6.2's
rune names already handle.

### 11.1 The two-axis weakness model

Real monster shape today (`src/data/monsters.js`, 31 rows):

```js
slime: { name:'Slime', icon:'🟢', tier:1, family:'Vermin',
         weaponWeak:'sword', hp:8, atk:2, def:0, xp:5, gp:[1,3], drops:[…] }
```

`weaponWeak` is one of `sword | hammer | ranged | magic | neutral` — a **weapon family**, and
`'neutral'` means "no weakness", which pays `NEUTRAL_DROP_BONUS = 1.15` on drops instead.
Resolution lives in one function, `weaknessInfo(monster, eq)`.

**Phase-two shape: one new optional field.** (Tyler's Ice Troll does not exist yet — it is one
of the "more robust monsters" phase two waits for. Written here as the target shape.)

```js
ice_troll: { …, weaponWeak: 'ranged', elementWeak: 'ember', … }
```

Combination — **additive inside the damage term, never multiplicative:**

```
ELEMENT_BONUS   = 0.15                              // damage only; accuracy untouched
WEAKNESS_BONUS.damage = 1.20                        // unchanged

damageMult = 1 + (weaponMatched ? 0.20 : 0) + (elementMatched ? 0.15 : 0)
MAX_WEAKNESS_MULT = 1.35                            // an INVARIANT of the formula, clamped
```

**Why additive.** Multiplicative gives 1.20 × 1.15 = 1.38 today and compounds with every future
axis; the codebase has a standing pattern of making a ceiling *an invariant of the expression*
rather than a promise about a table (`STYLE_SPEED_MIN/MAX`, `SPEED_FUSE`, `critCap`). Additive
with a clamp means a third axis, if one is ever added, cannot silently double the game's
damage. **The ceiling is 1.35 and it is enforced, not hoped for.**

**Why the element is worth less than the weapon.** Matching the weapon family is a large,
slow commitment (a weapon, a gear set, a skill). Matching the element is a loadout swap. The
smaller number keeps the bigger commitment worth more, and keeps the combo a *strong choice*
rather than a mandate: a correct double-match is **+35% output**, a single match is +20% or
+15%, and a mismatch is 1.00. Measured against §3.2's near-linear damage→throughput
relationship, +35% is roughly *"one night in three for free"* — worth grinding for, and not so
large that fighting the wrong monster with the wrong element feels like being punished.

**Element weakness must not touch accuracy.** The b343 ruling is that accuracy is dead for
ranged and magic from mid-game on (a level-99 ranged kit carries 186 points of `rangeAtkB`
against a clamp that binds at 133). An accuracy-based element bonus would pay melee and pay
nobody else.

**Constraint:** at most **one** `elementWeak` per monster. Not a style guideline — a guard.

### 11.2 Enchanting runes, and the tension the Coordinator asked for

Runecrafting gains three enchanting runes, which are **also castable at their own tier**:

| rune | element | Runecrafting req | also castable as |
|---|---|---|---|
| `rune_of_frost` | frost | 40 | a tier-4-equivalent rune |
| `rune_of_ember` | ember | 65 | a tier-5-equivalent rune |
| `rune_of_blight` | blight | 85 | a tier-6-equivalent rune |

**That dual use IS the tension, and it is deliberate.** Every enchanting rune you burn casting
is one you did not spend enchanting 500 arrows for tomorrow night. It is a real "spend it now or
bank it" decision, made by one player about one stack, with no UI to build for it — the choice
is simply which item you put in the socket.

How each style gets an element:

| style | how | why |
|---|---|---|
| **magic** | **free — just socket a different rune.** | Magic *is* the elemental style. Element-switching being frictionless is its class identity, and it is the reward for having the deepest supply chain. |
| **ranged** | a Fletching recipe: `500 arrows + 1 enchanting rune → 500 elemental arrows` | committed in advance |
| **melee** | a Stonemason recipe: `10 whetstones + 1 enchanting rune → 10 elemental whetstones` | committed in advance |

### 11.3 Scope control — 9 items, not 42

The naive shape is 3 elements × 7 tiers × 2 styles = **42 new consumables**. Rejected outright:
it would triple the ammo catalogue to express one bit of information.

**Elemental variants exist at ONE high tier band only** — they are endgame content, which is
exactly what *"once we get more robust monsters"* means:

| | count |
|---|---|
| **items** | **9** — 3 enchanting runes, 3 elemental arrows (~tier 6), 3 elemental whetstones (~tier 6) |
| **recipes** | **9** — 3 Runecrafting binds, 3 Fletching enchants, 3 Stonemason enchants |
| **engine** | `elementWeak` read + `ELEMENT_BONUS` + the 1.35 clamp, all inside `weaknessInfo` |
| **data** | `elementWeak` on whichever of the new monsters want it |

Note the asymmetry that makes this cheap: **magic needs zero new items to participate**, because
its element carrier is the enchanting rune it was already going to socket.

### 11.4 Why this shape fits an idle game specifically

An idle player is **not present to react**, so every unit of depth has to live in *preparation*.
Style × element is the ideal second axis because the entire decision happens at one moment —
the player picks a monster, picks a loadout, and closes the tab — and the answer is knowable in
advance from data the player can see.

Three consequences, all of which are design constraints on phase two:

1. **Nothing may require reacting mid-fight or swapping mid-absence.** No element that changes,
   no monster that rotates its weakness, no proc that wants a response. If a mechanic would be
   better played watching, it does not belong in this game.
2. **The loadout screen is the boss fight.** The interesting question is *"which of my three
   stacks do I put in the socket tonight, and do I have enough of it?"* That is the moment the
   projection surface and the element system are both aimed at.
3. **The away card must grade the choice afterwards.** *"Frost Arrows vs the Ice Troll — +35% all
   night"* is what makes the player feel clever about a decision they made eight hours ago, and
   it is the only feedback channel an absent player has. The `featuredMs` / `featuredDropMult`
   fields already prove this pattern works; element-matched time is the same shape.

---

## 12 · Scope honesty

### 12.1 What a real player reaches in a 7-day beta

Measured: level reached after N hours of continuous action, best available rung, zero bonuses.

| skill | 4 h | 12 h | 24 h | 48 h | **84 h** | 168 h |
|---|---|---|---|---|---|---|
| woodcutting | 33 | 46 | 54 | 62 | **69** | 77 |
| mining | 38 | 50 | 57 | 65 | **70** | 78 |
| fishing | 33 | 47 | 56 | 64 | **70** | 78 |
| cooking | 53 | 65 | 73 | 83 | **90** | 99 |
| smithing | 70 | 87 | 96 | 99 | 99 | 99 |
| crafting | 73 | 88 | 98 | 99 | 99 | 99 |
| prayer | 35 | 60 | 68 | 76 | **82** | 89 |

84 h ≈ taking the entire 12 h/day offline cap every single day of the beta, **on one skill**.
Nobody will. A realistically keen round-2 player spreads across 4–6 activities and lands each
at **10–20 h**, i.e. **gathering in the 45–55 band and combat in the 40–60 band**, with artisan
skills gated by materials rather than by XP.

**Therefore: round 2 exercises tiers 1–3 of all three consumable ladders and nothing above.**
Tier 1 is free (level 1), tier 2 opens at 15, tier 3 at 30. Tiers 4–7 will ship untested.
**Concentrate every hour of tuning on tiers 1–3** and treat 4–7 as content that gets its first
real look in round 3.

**Three new skills from zero is genuinely well-timed for a wipe.** A player who has never seen
Fletching does not experience it as a mid-game skill they are behind on; they experience it as
part of the game. That window closes permanently at cutover.

### 12.2 Why this is safe to put in front of 20 new players

The free tier-1 rung and the `Math.max(1, …)` floor between them mean **a brand-new character
literally cannot be hurt by this system**. At level 10 against a Goblin, ×0.25 and ×0.15 produce
identical output because max hit floors at 1. The mechanic only starts costing at level 15+,
by which point the player has met Mining and Smithing. The failure mode of shipping this to
beginners is that they *do not notice it*, which is the right failure mode.

### 12.3 Engine work vs data work — stated separately, as asked

**ENGINE (the part that is not cheap):**

| # | change | where | cost |
|---|---|---|---|
| E1 | **Consumption in the combat loop** | `src/core/combat-sim.js` `simulateTick` | **The expensive one.** This file is vendored verbatim into `supabase/functions/hr-accrue/`, its payload is SHA-pinned (`deployedPayloadGuard`), and `AWAY-1` asserts a seeded fight is byte-identical away and live. Any edit means: repack, redeploy, re-verify the hash, re-run the parity test. Not a drive-by. |
| E2 | The fractional carry for `ammoPerShot < 1` | a `G.ammoCarry` field + `advanceToolCarry`'s pattern | small, but it is a **new persistent save field** — must NOT go in `NO_SYNC` (invariant 3) |
| E3 | `equipItem` stops removing ammo from the bag | `legacy.js:4364` | small, contained (§2.2) |
| E4 | `consumablesPerHour` / `hoursOfSupply` / `dryAtMs` in `src/core` | new pure functions | small; shared with the projection (§4.5) |
| E5 | `speedKeyFor` rows for three new skills | `src/core/pacing.js` + 4 client copies | 5 one-line map additions (§5.1) |
| E6 | Mining by-product | `doSkillAction` + the `raw`-flag guard | 1 line + 1 guard — **or skip via P2** (§8.4) |
| E7 | `gear-tiers.js` honours `fam.skill` | the recipe generator | 2 lines; moves bows to Fletching as data |
| E8 | Artisan-skill enumeration | ~12 sites in `legacy.js`, `homestead.js`, `activities-grid.js`, `character-page.js` | one-line map/array additions, but they are **in the monolith**, so they serialise against other agents |
| E9 | Away-summary payload fields | `combat-sim.js` return + the card | rides E1 |
| E10 | *(phase 2)* `elementWeak` + `ELEMENT_BONUS` + clamp | `src/core/combat.js weaknessInfo` | small, one function |

**E1 is the gate. Everything else is downstream of it, and E1 is the only piece that touches
the byte-pinned server engine.** An honest sequencing note: E1 should land as its own commit with
its own parity re-verification, not bundled with content.

**DATA (the cheap part — the bulk of this document):**

- 3 rows in `src/data/skills.js`
- ~7 rune items + ~7 whetstone items + 3 block items + 3 blank items + 3 stone materials
- ~7 + ~16 recipes, plus 7 `skill:` re-keys for the existing `fletch_*` rows
- `ARTISAN_CATEGORIES` blocks + `recipeCategory` branches
- `ashlar` into `TIERS` 4–6 and the L4 room rungs
- `vaultstone` into `hr_castle_tiers` rows 4–5 (server data + regenerate)
- flavour text in `item-descriptions.js`

**The server side of "a new skill" is a regenerate, not SQL surgery.** `start-kit.js`'s own
header records it: *"adding a skill to `src/data/skills.js` gives every new character that skill
at 0 with no edit to this file and no edit to SQL."*

### 12.4 If only ONE ships: **Fletching**

Not because it is the best skill — because **shipping it ships the mechanism**. Fletching needs
**E1, E3, E4, E5**; those are then *free* for Runecrafting and Stonemason, which afterwards
become almost pure `src/data` additions (Stonemason adds only E2, the fractional carry, and E6).
Shipping Runecrafting first would need the same engine work *plus* a supply of blanks it does
not have.

Fletching also has the shortest path to done: the items, the recipes, the burn-rate analysis
and an addressed interface note **already exist in the repo**, and the `ammo` slot renders an
empty socket on every player's equip doll today.

**MVP of each:**

| skill | MVP | engine beyond E1/E3/E4/E5 | what it drops |
|---|---|---|---|
| **Fletching** | re-key the 7 `fletch_*` recipes; the free tier-1 rung | none | bows stay in Crafting; elemental arrows are phase 2 |
| **Runecrafting** | 7 rune items + 7 recipes | none | the enchanting runes |
| **Stonemason** | whetstones only, fed by P2's input-free Quarry lane | E2 | castle goods, `keystone` adoption |

**Runecrafting has a hard dependency and it should not be papered over: it needs blanks, and
blanks are Stonemason's.** Two ways to decouple, if magic must ship first:

- **Buy blanks from a shop for gold.** One `EQUIP_SHOP`/`SEED_SHOP`-shaped data row. It is a
  genuine gold sink, which the economy wants, and it is what a player without a mason would do
  in the fiction. Cheap and honest.
- **Blanks from `magic_essence` alone.** *I do not recommend this.* `magic_essence` is a combat
  drop, so magic's entire supply would come from combat, and a mage who runs dry needs to fight
  at ×0.25 to buy their way back up. That is the one circular failure the fail-soft ruling does
  not rescue, because it is a *feedback loop*, not a cliff.

**Recommended round-2 scope, if there is room for more than one:** Fletching **and**
Stonemason-whetstones-only. That gives ranged and melee their consumables — the two styles a
7-day player actually reaches — and defers magic, whose chain is the deepest and whose players
will mostly be below level 30 anyway.

---

## 13 · Server authority

### 13.1 Nothing in this design needs a client-reported number

| value | owner | already true? |
|---|---|---|
| `ammoPerShot`, item stats, recipe inputs | the catalogue, emitted by `tools/gen-catalogues.mjs` | yes |
| swing interval | derived server-side from server-owned equipment; `swingIntervalMs` is already the one shared formula (b329) and `simulateSpan` already clamps `tickMs` to `minTickMs` as a second line of defence | yes |
| remaining stock | `player_inventory` | after cutover |
| the decrement | a server-side inventory mutation inside `hr_apply`, on the same delta as the XP and gold it was earned alongside — *one delta, one transaction, one version bump* | the mechanism exists and is proven |
| `dryAtMs` | derived: `fromMs + floor(stock / ammoPerShot) × tickMs` | pure |
| the pre-flight projection | **display-only prediction**, computed client-side from the same `src/core` function, never authority | the `licence.js` precedent, verbatim |

**No new client-reported value. No new trusted input. No new intent id namespace** — consumption
rides the accrual intent that already exists, so it does not add surfaces to the S6 problem the
handoff warns about for gold.

### 13.2 Two honest limitations, named before they are discovered

1. **Pre-cutover, the arrow count is in the client save blob**, so it is forgeable, so the
   depletion mechanic is *decorative* until `player_inventory` is server-of-record. This is
   exactly the Field Licence's situation (*"the gate is currently DECORATIVE"*) and it should be
   described the same way rather than as enforcement. **The beta wipes, so the cost is zero** —
   but nobody should write "consumption is server-authoritative" in a changelog before it is.
2. **Consumption is a per-tick inventory decrement**, and the ledger is append-only and
   compacted per-absence. It must be **aggregated into the span's single delta**, never written
   per tick — 13,636 arrows over an 8-hour absence is 13,636 ledger rows if anyone gets that
   wrong, and the handoff already records that the ledger holds *"exactly ONE compact aggregated
   row (not per-tick)"*. Flagged to Systems as a hard requirement of E1.

---

## 14 · Handoffs, conflicts and open questions

**→ Itemization agent (owns the ammo ladder's tiers, stats, values):**
- The **interface is accepted unchanged** (§6.1). Fletching changes the `skill:` key and nothing else.
- **A live leak, present today:** a melee player equipping `dawnpoint_arrows` gets **+0.03 crit
  for free** because `equipmentStats` sums `critB` across all slots regardless of style (§1.3,
  verified by execution). Whetstones give melee an opportunity cost, but the leak exists now.
- Proposed rune and whetstone ladders (§6.2, §6.3) reuse **your** stat curve and **your** stated
  rules (input value 10–20% of gross; `batch × v` within ~2× input value). Final stats and values
  are yours; the burn rates and the curve identity (R7) are mine.
- `fletch_bronze_arrows`' batch of 500 is decorative at `ammoPerShot: 0` (§6.1). Not a change request.
- **We need one agreed definition of "gross."** My measure (full drop book value) puts a tier-3
  arrow at **4.2% of gross**; your header targets **10–20%**, which is only reachable if gross
  means vendor bids (`VENDOR_RAW_RATE = 0.20` on raw drops) — a 3–5× swing on a drop-heavy night.
  **Neither of us should tune against our own definition.** Whichever we pick, the whetstone and
  rune ladders must be priced on the same basis or the three styles will not be at parity even
  though both of us can prove they are (§6.4).

**→ Systems Engineer:**
- **E1 touches `combat-sim.js`**, which is vendored into `hr-accrue` and byte-pinned. Land it
  alone, with its own parity re-verification and payload-hash re-derivation.
- **E2 adds a persistent save field** (`ammoCarry`). It must **not** enter `NO_SYNC` (save
  invariant 3: *"adding a persistent-progress field to NO_SYNC = silent cloud data loss"*).
- **Consumption must aggregate into the span's single ledger delta**, never per tick (§13.2).
- **`speedKeyFor` currently falls back to `gatherSpeed`** for unknown skills — three new artisan
  skills would be silently sped by the gathering stack until §5.1 lands. Real bug, not
  hypothetical.
- **The `raw`-flag guard walks `prod` only.** A mining by-product (§8.4 P1) would vendor at full
  book value instead of 20% until the guard is widened. Faucet.

**→ Art Director:**
- The **empty-quiver state must read on the equip doll and in the combat panel.** A player
  fighting at ×0.25 who cannot see why is a support ticket, and this is the single largest
  legibility risk in the design.
- The **away card's dry-out line** (§10) is new copy on an existing surface.
- Stonemason's four category tabs need the same treatment the artisan lanes already got.

**→ Supply-projection designer:**
- §4 is your input contract. **Arrows and runes and whetstones are exact; food is an
  estimate and must be labelled as one** (§4.4).
- **Two-segment projection required**: food burns up to **1.35×** faster after the ammo runs out
  (§3.4). A single-segment food number over-promises on exactly the bad night.
- `consumablesPerHour` / `hoursOfSupply` should live in `src/core` and be called by both of us
  (§4.5). If we each write one, they will disagree.

**→ Tyler — the three calls I want and will not make unilaterally:**
1. **§7.4 — is a free melee floor acceptable?** My recommendation: yes. The lever if not is a
   ~15% `strB` rebase on melee tiers 4–7, and **the wipe is the only free window to do it**.
2. **§8.4 — mining by-product (P1, one engine line) or an input-free Quarry lane (P2, zero
   engine)?** My recommendation: P1.
3. **§3 — is ×0.25 the right "very very weak"?** It measures at 26–38% of a supplied night.
   0.20 would read as 22–30%, 0.30 as 32–44%.

**CONFLICTS.md entries to file:**
- **SEMANTIC (Designer → Systems):** *"Sharpening stones are a temporary buff"* is Tyler's
  wording, and a literal reading collides with the binding away ruling — a timed buff is
  **frozen** away and would pay nothing overnight. Resolved here by making the mechanic a
  charge and keeping "temporary" in the surface copy only (§7). Recorded so nobody later
  "fixes" whetstones into `BUFFS_DEF`.
- **DEPENDENCY (Designer → Systems/Security):** `vaultstone` numbers for `hr_castle_tiers` 4–5
  should be set **after** the `clan_power` treasury-term fix, not before (§8.2).

---

## 15 · Required regression coverage

Written as a spec for QA, in the shape `away-time-ruling.md` uses.

1. **Parity survives depletion.** The `AWAY-1` contract must still hold with consumption live:
   a seeded fight through `away:false` and `away:true` consumes an **identical** number of
   arrows and produces identical XP/gold/kills/drops.
2. **Burn is exact and time-only.** 8 h at `tickMs = 2112` and `ammoPerShot = 1` consumes
   **exactly 13,636** — against three different monsters, at three different accuracy levels,
   and at both damage multipliers.
3. **Fractional burn is deterministic.** 1,000 swings at `ammoPerShot = 0.02` consumes exactly
   20, run twice, with no RNG draw consumed. Assert the carry survives a save round trip.
4. **`ammoPerShot: 0` never depletes.** A 12-hour absence with Bronze Arrows leaves the stack
   untouched and applies no penalty.
5. **The fail-soft floor.** With stock 0 and an ammo-requiring style, `playerRolls().maxHit`
   equals `max(1, floor(supplied × 0.25))`; the span still produces kills, XP, gold and drops;
   `died` is not forced.
6. **Melee is exempt.** A sword with an empty ammo slot rolls its full max hit.
7. **The projection agrees with the outcome.** `hoursOfSupply(...)` computed before a span
   equals `dryAtMs` reported after it, for ten random (weapon, style, `spdB`, stock) tuples.
   *This is the test that keeps the pre-flight promise honest, and it must be mutation-proven:
   breaking either implementation must turn it red.*
8. **Stat-curve identity (R7).** Arrows, runes and whetstones carry the same
   `2/3/5/8/11/14/18` curve at matching tiers; tier 1 of each is `ammoPerShot: 0`; every
   rung above tier 1 is spent.
9. **No cross-style stat leak.** No ammo-slot item carries a stat its own style does not use
   (`critB` and `spdB` on any of the three ladders should fail the guard — see §1.3).
10. **Reachability.** The b243 guard must stay green with `rubble`/`granite`/`basalt`,
    the blanks, the blocks and every whetstone — i.e. every new item has a real source.
11. **No deadlock.** The b227 executable §7 proof (*"no room rung can require a good the player
    cannot yet make"*) must stay green after `ashlar` enters the property and room costs.
12. **Category completeness.** `categorizeRecipes('stonemason').uncategorized` is empty, in the
    same commit that adds the recipes.
13. **`raw` flags.** Every mining by-product is flagged `raw`, so `vendorPrice` pays 20%.
14. **Ledger shape.** An 8-hour absence that consumes 13,636 arrows writes **one** aggregated
    ledger row, not 13,636.
15. *(phase 2)* **The weakness ceiling is an invariant.** `damageMult ≤ 1.35` for every
    (monster, weapon, element) triple in the catalogue, including a hostile monster row
    carrying two elements.

---

## 16 · Reproducing every number in this document

All measurements were produced by importing the real modules into Node and running them —
`src/core/combat.js`, `combat-sim.js`, `styles.js`, `pacing.js`, `artisan.js`, `rng.js`, `xp.js`
and the real `src/data/*` tables. The runs were:

| § | what was measured | how |
|---|---|---|
| §3.2 | 8-hour absences at six damage multipliers × ten builds | `simulateSpan` with `away:true`, seeded `createRng(4242)`, auto-eat modelled at the engine's own 50% threshold |
| §4.2 | swing intervals and burn rates | `swingIntervalMs(eq, style)` across every family × stance × `spdB` ∈ {0, 0.16, 0.20} |
| §6.4 | supply-chain production time | recursive walk of `ARTISAN_RECIPES` + `TREES/ROCKS/FISH_SPOTS` through `pacedActionMs`, terminating at gathered roots and combat drops |
| §9.2, §12.1 | hours to 99 and levels after N hours | greedy best-rung simulation against `XP_TABLE` with `PACE.xp` applied at the grant |
| §1 | ammo is inert | a 12-hour `simulateSpan` with an `fx.removeItem` spy: 20,454 ticks, 0 calls |
| §1.3 | the crit leak | `equipmentStats({weapon:'dawn_sword', ammo:'dawnpoint_arrows'})` vs without |
| §2.2 | where the ammo count lives | read of `equipItem` (legacy.js:4364) |
| §6.3 | the whetstone value band | the two inequalities, solved against the measured L50 melee night |

The game itself was booted and played through the smoke harness's account-wall bypass on a
clean profile: a new character starts with 500 gold, a Bronze Sword, 5 turnip seeds, 3 carrot
seeds and 8 shrimp; **the ammo slot is empty and there is no obtainable arrow in the start
kit.** The Crafting panel already renders an **Ammunition** lane (the b343 `fletch_*` rows), the
House panel shows the six-tier property ladder whose stone-named tiers cost logs and ore, and
the Cellar's five rungs sell buff duration — the seam that a timed sharpening stone would have
been built on, and the reason §7.1 does not build there.
