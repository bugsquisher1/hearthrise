# The bonus rebase — the whole boost economy at small numbers

**Owner:** Game Designer · **Date:** 2026-08-09 · **Build measured:** b229 (`827ecba`) + the in-flight
`agent-homestead` worktree.
**Brief:** `DECISIONS.md` → *2026-08-09 · Bonus magnitudes rebase: "increments of 2%"* (Tyler, binding,
global). Tyler: *"the % boosts across the board are way too high. 50% smithing? it should be like
increments of 2%."*
**Reads against:** `pacing-overhaul.md` Appendix A (as amended by A.8), `clan-overhaul.md` §7–8,
`homestead-deepening.md` §6.

Every number in §1 was read out of the shipped source, not inferred from a spec. Where a doc and the
code disagreed, the code is what is recorded.

---

## 0 · The headline

| | today | **rebased** |
|---|---|---|
| live bonus sources in the `getBonus` chain | **42**, across **7** additive wrapper layers | 42 (none deleted) |
| permanent ceiling, any single key | **+52%** `allXP` · **+90%** `smithSpeed` | **+15%** |
| the fuse | `allXP ≤ 0.60`, applied to the castle's own share only | **≤ 0.20 per key, applied to the whole chain** |
| temporary ceiling | unbudgeted — feast is explicitly outside the fuse | **≤ 0.15 per key**, budgeted and clamped |
| absolute peak on one key | ~+115% (permanent + blessing + Last Call feast) | **+30%** |
| the grammar | 0.1% to 50%, no rule | **whole percents only; 2% step, 1% half-step** |
| what the whole boost economy buys | 19.6 days off the 57.2-day first-99 floor | **7.5 days** |

One sentence for the change note: **boosts stop being a pacing lever and become a feel system.**
That is the point of the smallness, and §3 argues it properly.

---

## 1 · The census — every live source, read from the code

`getBonus` is not a function. It is a **base function plus six additive monkey-patch wrappers**, each
of which does `t += …`, installed in this order:

| # | layer | file | adds |
|---|---|---|---|
| 0 | base | `src/legacy.js:1182` | room rungs (`bk`/`bv`/`bx`), plot buildings, renown `allXP`, homestead capstone |
| 1 | companions | `src/legacy.js:10682` | `getCompanionBonus()[key]` |
| 2 | food & drink buffs | `src/legacy.js:11767` | `getBuffBonuses()[key]` |
| 3 | clan level perks | `src/features/clans.js:367` | `myPerks()[key]` — all percentages already stripped |
| 4 | castle | `src/features/clan-seat-ui.js:366` | `castleBonus(key)` = fused permanent + feast |
| 5 | muster aura | `src/features/muster.js:644` | `LIVE_XP_AURA` on `allXP` |
| 6 | blessings | `src/features/world-events.js:193` | `liveBonusFor(key)`, presence-gated |

**This shape is itself a finding.** The only fuse in the game lives at layer 4 and reduces *only layer
4's own contribution* (`fuseAllXp`, `clan-seat-ui.js:297`). Layers 1, 2, 5 and 6 are added afterwards
and nothing clamps the output. §4 fixes this.

### 1.1 Homestead — 8 room ladders + 3 plot buildings + 1 capstone (`legacy.js:329-368`, `1188-1198`)

| room | key | L1 | L2 | L3 | L4 *(in flight)* | L5 *(in flight)* |
|---|---|---|---|---|---|---|
| Kitchen | `cookSpeed` (+`noBurn` `bx`) | +10% / .13 | +25% / .19 | +50% / .25 | — | — |
| Forge | `smithSpeed` | +10% | +25% | +50% | — | — |
| Workshop | `craftSpeed` | +10% | +25% | +50% | — | — |
| Shrine | `prayerSpeed` | +10% | +25% | +50% | — | — |
| Library | `allXP` | +5% | +10% | **+20%** | — | — |
| Trophy Room | `combatXP` | +5% | +12% | +25% | — | — |
| Garden | `farmYield` | +1 | +2 | +4 | — | — |
| Cellar | `storage` | +500 | +1500 | +5000 | — | — |

`storage` has never been read by anything (`homestead-deepening.md` §3.4 ruling; repurposed in flight).

Plot buildings: **Toolshed** `gatherSpeed +5%` · **Scarecrow** `farmYield +0.1` · **Watchtower**
`combatXP +2%`. Property capstone: **Hearthrise Castle → `allXP +5%`**.

**The in-flight provisional** (`agent-homestead`, ratified/amended in §5.1): speed rooms
+2/4/6/8/10%, Library and Trophy +1/2/3/4/5%, Cellar duration +4/8/12/16/20%, Garden +1/2/4/6/8,
`noBurn` 13/19/25 unchanged, procs (`yield_cooking`, `yield_smithing`, `craftSave`) 4/8%.
**Workshop and Shrine were not reached before the branch was read and are still at +10/25/50/50/60.**

### 1.2 Renown — 12 ranks (`src/features/renown.js:37-50`)

Six ranks grant `allXP`, six grant offline hours. `allXP` at Squire **2** · Baron **3** · Count **3** ·
Duke **4** · King **5** · High King **5** = **+22%**. Offline +12 h. `getPerks()` already declares
`bankSlots` / `marketSlots` / `dailyTasks` / `dropRate` and **no rank grants any of them.**

### 1.3 Castle — 6 buildings, the feast ladder, Last Call (`clan-seat-ui.js:60-88`, `clan-seat.js:256-289`)

| building | key | per level | at L10 |
|---|---|---|---|
| Treasury | `goldFind` | 0.005 | +5% |
| Sawmill | `craftSpeed` | 0.005 | +5% |
| Smeltery | `smithSpeed` | 0.005 | +5% |
| War Room | `raidPower` | 0.01 | **+10%** — exactly on `CASTLE_KEY_CAP` |
| Tavern | `restedXp` | 0.02 | **+20%** — *exempt from the key cap* (`clan-seat-ui.js:269`) |
| Great Hall | `allXP` | 0.01 / castle tier | +5% at T5 |

**Feast ladder** (`clan-seat.js:277`), and **Last Call** doubles every effect for the final 30 minutes
at Tavern ≥ 7:

| Tavern | hours | `allXP` | yield → `gatherSpeed` | artisan → cook/smith/craft |
|---|---|---|---|---|
| 1–3 | 1 | 0.08 | — | — |
| ≥4 | 2 | 0.12 | 0.08 | — |
| ≥7 | 3 | 0.15 | 0.10 | 0.10 |
| **≥10** | 4 | **0.18** → **0.36** at Last Call | 0.12 → 0.24 | 0.12 → 0.24 |

Also: `hearthScale()` duration `1+0.04×lvl` / magnitude `1+0.02×lvl` (**inert — `registerBuffScaler`
has no live caller**), `leftoversChance` 0.005/lvl, `upkeepDiscount` −1%/lvl, `perkScaleFor` strained
×0.6 / dormant ×0.

**Clan level perks are already at zero percent** (`clans.js:49`) — Lv4 +1h, Lv7 +2h, Lv10 a banner.
`clan-overhaul.md` §8.3's re-scope has shipped.

### 1.4 Blessings — 9 daily + 6 weekly (`world-events.js:70-91`), presence-gated

Daily: `gather_surge` gatherSpeed **.25** · `forge_fires` smith+craft **.30** · `harvest_fest` farmYield
**+2** · `scholars_day` allXP **.15** · `hunters_moon` combatXP **.20** · `feast_day` cookSpeed **.30** ·
`quiet_vigil` prayerSpeed **.30** · `open_coffers` goldFind **.15** · `steady_fire` noBurn **.25** +
cookSpeed **.10**.
Weekly: `grand_fair` allXP **.12** · `kings_bounty` goldFind **.10** · `deep_veins` gatherSpeed **.15** ·
`war_drums` combatXP **.15** · `guild_works` all three artisan speeds **.20** · `long_harvest` farmYield
**+1** + gatherSpeed **.08**.

Daily and weekly stack additively. Worst live stack today: `forge_fires` + `guild_works` =
**`smithSpeed` +50% and `craftSpeed` +50%, from the calendar alone.**

### 1.5 Muster · companions · food & drink

- **Muster** `LIVE_XP_AURA = 0.10` on `allXP` while joined (`muster.js:58`).
- **Companions** (`legacy.js:10661`, `data/companions.js`) — and this is the source no spec has ever
  budgeted. Base values `gatherSpeed .05–.06`, `cookSpeed .08–.10`, `smithSpeed .10`, `craftSpeed .10`,
  `farmYield .10–.15`, **all scaled by `1 + 0.05×(lv−1)` over 30 levels = ×2.45.** A level-30 Forge Imp
  is **`smithSpeed +24.5%`** — larger than the entire castle Smeltery ladder and half the homestead
  Forge, from a pet.
- **Food & drink buffs** (`data/items.js`, `BUFFS_DEF` at `legacy.js:11554`) — 24 items, 1%–**50%**.
  The outliers: Lich Soul Soup `gold_find` **50%**, Moonbloom Elixir `all_xp` **12%**, Carrot Stew
  `farm_yield` 15%, Goldenroot Roast `gather_speed` 12%, Ember Tart `combat_xp` 12%. Buffs merge by
  `Math.max` on magnitude, so the ladder's top rung is what matters.

### 1.6 Outside the chain (four multipliers, all ruled out of scope in §2.4)

Tool ladder `gatherSpeed` **.05 → .35** (`tools.js:33`, added at `legacy.js:2132` alongside
`getBonus('gatherSpeed')`) · worker efficiency **25% → 52% of player rate** (`workers.js:30`) ·
`PACE = {xp:0.39, actionMs:1.60}` · combat `WEAKNESS_BONUS {damage:1.20, accuracy:1.15}`.

### 1.7 Ghosts — six keys with a producer or a reader, but not both

`storage` (Cellar produces, nothing reads) · `dropRate`, `damage`, `monsterRespawn`, `crit`
(`BUFFS_DEF` maps eight food items onto them; **`getBonus` is never called with any of them**) ·
`rareDrop` (pets and equipment carry it; nothing reads it) · plus the House-panel display keys
`hearthXP`, `kitDrop`, `farmYieldPct` and the companion keys `xpB`, `goldBonus`, `prayerXp`, which are
misspellings of live keys. **A ghost cannot be rebased — it is already zero.** §5.4 files them.

**Census total: 42 live sources inside the chain, 4 outside it, 6 ghosts.**

---

## 2 · The new grammar

### 2.1 The step

> **Every percentage a source grants is a whole number of percent.**
> **The step is 2%. Wide keys use a 1% half-step.**

A key is **wide** if it pays on more than one skill's worth of activity: `allXP`, `combatXP`,
`goldFind`. A key is **narrow** if it pays on one activity: `cookSpeed`, `smithSpeed`, `craftSpeed`,
`prayerSpeed`, `gatherSpeed`, `raidPower`, and the procs.

A five-rung room ladder is therefore **+2/4/6/8/10%** on a narrow key and **+1/2/3/4/5%** on a wide one.
No grant is ever a fraction of a percent — `0.005/level` is deleted from the vocabulary, and §4's
grammar test makes that structural.

**Why wide keys get the smaller step, which looks backwards and is not.** `allXP` at +5% pays on all
fifteen skills, every action, forever. `cookSpeed` at +10% pays only while you are cooking, and only
as `1/(1−s)` = +11.1% of cooking throughput. Per point of headline, a wide key is worth several times
a narrow one. Equal headline numbers on unequal keys is exactly how the +52%/+90% world happened.

### 2.2 The ceiling

> **Permanent design ceiling: +15% on any single key, from all sources combined.**
> **Permanent fuse: ≤ 0.20 per key.** (Replaces `allXP ≤ 0.60` and the artisan `≤ 0.85`.)
> **Temporary budget: ≤ +15% per key, clamped separately.**
> **Absolute peak: +30% on one key.** Nothing in the game may exceed it.

+15% is not arbitrary — it is what the pillars sum to when each is given its designed share, and two
keys land on it exactly (§3.1). The fuse sits 5 points above the design, which is the same
eight-points-of-headroom shape `homestead-deepening.md` §H4 used, scaled down: a fuse that binds today
is a nerf, a fuse that never binds is a guarantee.

The **budget shares** that produce +15%:

| share | who | why |
|---|---|---|
| **10%** | the homestead room ladder | the solo pillar must stand alone — two thirds of the budget, matching `clan-overhaul.md` §8's homestead +45% vs castle +25% asymmetry |
| **3%** | a castle wing at L10 | ≥ a room rung (2%), and the wing's *function* (storehouse cap, −4% Beam input, Hunt tier ceiling) is the larger half of what it pays |
| **2%** | a maxed companion | a 1-in-2,500 pet at level 30 is worth about one room rung |

### 2.3 Temporary power, and why smallness is what makes ceremony work

> **The realm can never hand you more than you have earned.** The temporary budget equals the
> permanent one: +15%. The most blessed moment in the game exactly doubles your permanent stack.

This is the whole argument for the rebase, so it is worth stating plainly rather than asserting.

Today a Tavern-10 Last Call pays **+36% `allXP`** on top of a **+52%** permanent stack: a **69%**
uplift on what you already had. It is enormous in absolute terms and it is *invisible in relative
terms*, because everything else is enormous too. The player cannot tell a Last Call from a Tuesday
without reading a number.

Rebased, Last Call pays **+8%** on a **+15%** stack: a **53%** uplift — the same order of magnitude of
*feeling*, at a fifth of the absolute cost to pacing. And because the baseline is tiny, the ceremony
is now the largest single thing on the screen. **Smallness is what makes a spike legible.** You cannot
have a peak without a plain.

The second half of the argument is the one that protects the earned/granted hierarchy, and it is
arithmetic, not taste. A weekly blessing at **+4% `allXP`** looks bigger than a maxed Library at
**+5%**. It is not:

```
Grand Fair, +4% allXP, presence-gated (A.8):  4% × (2.5 active h / 14.5 effective h)  =  0.69% of the week
The Great Library, +5% allXP, permanent:      5% × (14.5 / 14.5)                      =  5.00% of every week, forever
                                                                                         → the Library is worth 7.2×
```

So a blessing may carry a *larger headline* than the thing you paid 300,000 gold and two Keystones for,
and still be worth a seventh of it. That is the correct shape: the calendar is a reason to look, the
Library is a reason to build.

**Blessings are therefore NOT cut by the same factor as permanent sources.** Permanent sources come
down ~4–6×; blessings come down ~4× but land at a *higher* number than a room rung on purpose, because
they are already discounted twice — temporary, and presence-gated to ~17% of the day. Cutting them to
2% would take the calendar's expected value to +0.3% on the day, which is not a small bonus but an
absent one, and b227 shipped the calendar as the *entire* online-pays mechanic. Filed under §3.3 as a
surface the rebase would otherwise have killed.

### 2.4 What is in scope, and what is not

**In scope — the 2% grammar governs every `getBonus` key**: multipliers on XP, action speed, yield,
gold find, and the output procs. This is precisely the set Tyler named ("the % boosts across the
board") and precisely the set the power budget already exists to police.

**Out of scope, ruled deliberately:**

| excluded | why |
|---|---|
| **the gathering tool ladder** (`.05 → .35`) | It is *gear*, not a perk: a ladder you visibly climb, one item at a time, not a bonus that accumulates behind the scenes. A Rune Axe that saves 2% is not a Rune Axe. Also decisive: the 57.2-day floor in `pacing-overhaul.md` A.2 was derived **with the tool ladder applied** — rebasing it re-opens the anchor Tyler approved, which is a pacing change wearing a bonus-rebase costume. |
| **gear stats, monster stats, drop rates, combat `WEAKNESS_BONUS`** | Same class. A weapon's damage is not a boost. |
| **`PACE.xp` / `PACE.actionMs`** | The pacing dials. Untouched by definition — see §3. |
| **worker efficiency (25→52%)** | Not a multiplier on your rate; a *fraction* of it, paid by a parallel producer. It inherits `PACE` automatically and cannot inflate. |
| **food *heal* amounts** | Capacity, not throughput. |
| **duration, capacity, reliability and access rewards** | §2.5 — the load-bearing exemption. |

**Borderline, ruled in scope: food and draught buffs that grant a `getBonus`-class key.** A +12% `all_xp`
elixir is indefinitely renewable — a player with the materials keeps it up permanently — so it behaves
as permanent power and must live inside the grammar. Food buffs that grant *damage* would be gear
class, but every one of them is a ghost today (§1.7), so the question is moot until they are wired.

### 2.5 The exemption that makes expensive rungs survivable

> **The 2% grammar governs throughput multipliers only.** Rewards of **duration**, **capacity**,
> **reliability** and **access** are outside it, are not charged to the power budget, and are the
> preferred payload for any rung that costs a Keystone.

The reasoning is that these four classes do not compound and do not scale a rate:

- **Reliability** — the Kitchen's `noBurn` 13/19/25%. Removing a failure state is felt at any size, and
  it cannot stack into a faucet: burn-proof is burn-proof, and there is no burn-proof-er.
- **Capacity** — the Shrine's "one action buries 5 bones", the Garden's flat `farmYield`. It changes
  what an action *is*, not how fast it runs.
- **Duration** — the Cellar's buff extension. It lengthens a window; it never raises a magnitude.
  `homestead-deepening.md` §H7 already draws this line (`buffScaleFor` returns `{duration, magnitude}`
  and the Cellar touches only `duration`).
- **Access** — a market slot, a daily-task slot, a rested-charge cap.

This is not a loophole. It is the *answer* to the brief's real question: a 300,000-gold rung cannot be
justified by +2%, and the honest fix is not to inflate the 2% — it is to stop paying in percentages at
the top of a ladder. §5.3 lists every rung that converts.

---

## 3 · The table — current → new, every source

### 3.1 Permanent

| source | key | current | **new** | note |
|---|---|---|---|---|
| **Homestead — Kitchen** L1–L5 | `cookSpeed` | 10/25/50 *(L4–5 unbuilt)* | **2 / 4 / 6 / 8 / 10** | ratifies the in-flight ladder |
| **Homestead — Forge** L1–L5 | `smithSpeed` | 10/25/50 | **2 / 4 / 6 / 8 / 10** | ratified |
| **Homestead — Workshop** L1–L5 | `craftSpeed` | 10/25/50/50/60 | **2 / 4 / 6 / 8 / 10** | ⚠ **not yet applied in flight** |
| **Homestead — Shrine** L1–L5 | `prayerSpeed` | 10/25/50/50/60 | **2 / 4 / 6 / 8 / 10** | ⚠ **not yet applied in flight** |
| **Homestead — Library** L1–L5 | `allXP` | 5/10/20 | **1 / 2 / 3 / 4 / 5** | ratified; §5.3 replaces its L4/L5 `restedXp` payload |
| **Homestead — Trophy** L1–L5 | `combatXP` | 5/12/25 | **1 / 2 / 3 / 4 / 5** | ratified |
| **Homestead — Garden** L1–L5 | `farmYield` | +1/2/4 | **+1 / 2 / 4 / 6 / 8** | flat units — **unchanged**, outside the grammar |
| **Homestead — Cellar** L1–L5 | `buffDuration` | *(`storage`, dead)* | **+20 / 40 / 60 / 80 / 100%** | ⚠ **amends the in-flight +4…20%** — duration is exempt (§2.5, §5.1) |
| Kitchen `noBurn` | `noBurn` | 13 / 19 / 25 | **13 / 19 / 25** | reliability — **unchanged** |
| Kitchen / Forge procs L4–L5 | `yield_cooking`, `yield_smithing` | *(spec 12/25%)* | **4 / 8%** | ratifies the in-flight proc grammar |
| Workshop procs L4–L5 | `craftSave` | *(spec 10/20%)* | **4 / 8%** | ratified |
| Toolshed | `gatherSpeed` | +5% | **+2%** | |
| Watchtower | `combatXP` | +2% | **+2%** | already in grammar |
| Scarecrow | `farmYield` | +0.1 *(floors to 0)* | **+1** | needs the flooring fix — §5.4 |
| Property capstone (Hearthrise Castle) | `allXP` | +5% | **+2%** | |
| **Renown** — Squire | `allXP` | +2% | **+1%** | |
| Renown — Baron | `allXP` | +3% | **+1%** | |
| Renown — **Count** | `allXP` | +3% | **→ +1 market listing slot** | converts (§5.3) |
| Renown — Duke | `allXP` | +4% | **+1%** | |
| Renown — **King** | `allXP` | +5% | **→ +1 daily task slot** | converts (§5.3) |
| Renown — High King | `allXP` | +5% | **+1%** | |
| Renown — offline hours (6 ranks) | `offlineHours` | +1/1/2/2/3/3 = 12h | **unchanged** | capacity class |
| **Castle** — Great Hall | `allXP` | +1%/tier → +5% | **+1% at T2, T3, T4, T5 → +4%** | |
| Castle — Treasury | `goldFind` | 0.005/lvl → +5% | **+1% at L4, L7, L10 → +3%** | |
| Castle — Sawmill | `craftSpeed` | 0.005/lvl → +5% | **+1% at L4, L7, L10 → +3%** | |
| Castle — Smeltery | `smithSpeed` | 0.005/lvl → +5% | **+1% at L4, L7, L10 → +3%** | |
| Castle — War Room | `raidPower` | 0.01/lvl → +10% | **+1% at L4, L7, L10 → +3%** | Hunt *tier ceiling* is the building's real reward |
| Castle — Tavern | `restedXp` | 0.02/lvl → +20% | **→ a flat XP quantum** | converts (§5.3) |
| Castle — upkeep discount | — | −1%/lvl | **unchanged** | a cost reduction, not throughput |
| Castle — leftovers | — | 0.5%/lvl → 5% | **unchanged** | already in grammar |
| Castle — `perkScaleFor` strained / dormant | — | ×0.6 / ×0 | **unchanged** | a state multiplier |
| **Companions** — narrow-key base | `gatherSpeed` etc. | .05 – .10 | **.01** | ×2.45 at Lv30 → **+2.45%** |
| Companions — `farmYield` | `farmYield` | .10 – .15 | **+1 flat** | see the flooring fix, §5.4 |
| Companions — proc chances (instant action, refund, double yield) | — | 3 / 4 / 8% | **unchanged** | already in grammar |
| **Clan level ladder** | all | 0 | **0** | already re-scoped |
| **Tool ladder** | `toolSpeed` | .05 → .35 | **unchanged** | out of scope (§2.4) |

**The resulting permanent stacks — this is the audit:**

| key | composition | **total** |
|---|---|---|
| `allXP` | Library 5 + capstone 2 + renown 4 + Great Hall 4 | **15%** ← on the ceiling exactly |
| `smithSpeed` | Forge 10 + Smeltery 3 + companion 2.45 | **15.45%** |
| `craftSpeed` | Workshop 10 + Sawmill 3 + companion 2.45 | **15.45%** |
| `cookSpeed` | Kitchen 10 + companion 2.45 | **12.45%** |
| `prayerSpeed` | Shrine 10 | **10%** |
| `combatXP` | Trophy 5 + Watchtower 2 | **7%** |
| `gatherSpeed` | Toolshed 2 + companion 2.45 *(tools excluded)* | **4.45%** |
| `goldFind` | Treasury 3 | **3%** |
| `raidPower` | War Room 3 | **3%** |
| `farmYield` | Garden 8 + Scarecrow 1 + companion 1 | **+10 flat** |
| `noBurn` | Kitchen | **25%** *(reliability)* |

Nothing exceeds the +0.20 fuse; two keys sit on the +15% design ceiling; the 0.45 overshoot on the two
artisan keys is the companion, and it is deliberate — it is the margin the fuse exists to absorb.

### 3.2 Temporary

| source | key | current | **new** |
|---|---|---|---|
| **Feast** Tavern 1–3 / ≥4 / ≥7 / ≥10 | `allXP` | .08 / .12 / .15 / **.18** | **.01 / .02 / .03 / .04** |
| Feast — yield | `gatherSpeed` | — / .08 / .10 / .12 | **— / .01 / .02 / .03** |
| Feast — artisan | cook/smith/craft | — / — / .10 / .12 | **— / — / .03 / .04** |
| **Last Call** (Tavern ≥7, final 30 min) | ×2 on every effect | `allXP` **.36** | **×2 → `allXP` +8%** ← the ceremony peak |
| Tavern Hearth — buff **duration** | — | +4%/lvl → +40% | **unchanged** (duration class) |
| Tavern Hearth — buff **magnitude** | — | +2%/lvl → +20% | **+1%/lvl → +10%** |
| **Muster** live aura | `allXP` | +10% | **+2%** |
| **Daily** `gather_surge` | `gatherSpeed` | .25 | **.04** |
| Daily `forge_fires` | smith + craft | .30 each | **.04 each** |
| Daily `feast_day` | `cookSpeed` | .30 | **.04** |
| Daily `quiet_vigil` | `prayerSpeed` | .30 | **.04** |
| Daily `scholars_day` | `allXP` | .15 | **.03** |
| Daily `hunters_moon` | `combatXP` | .20 | **.03** |
| Daily `open_coffers` | `goldFind` | .15 | **.03** |
| Daily `steady_fire` | `noBurn` / `cookSpeed` | .25 / .10 | **.25 unchanged / .02** |
| Daily `harvest_fest` | `farmYield` | +2 | **+2 unchanged** (flat units) |
| **Weekly** `grand_fair` | `allXP` | .12 | **.04** |
| Weekly `kings_bounty` | `goldFind` | .10 | **.04** |
| Weekly `deep_veins` | `gatherSpeed` | .15 | **.06** |
| Weekly `war_drums` | `combatXP` | .15 | **.04** |
| Weekly `guild_works` | cook + smith + craft | .20 each | **.06 each** |
| Weekly `long_harvest` | `farmYield` / `gatherSpeed` | +1 / .08 | **+1 unchanged / .04** |
| **Food & drink buffs** — tier 1 (Cooked Shrimp, Herring, Roasted Carrot) | any | 1–5% | **1%** |
| tier 2 (Cooked Trout, Vegetable Stew) | any | 3–5% | **2%** |
| tier 3 (Moonfish Fillet, Pumpkin Pie, Baked Potato, Cooked Lobster) | any | 8–10% | **3%** |
| tier 4 (Goldenroot Roast, Ember Tart, Dragon Stew, Cooked Shark) | any | 10–12% | **4%** |
| tier 5 (Moonbloom Elixir, **Lich Soul Soup**, Void Banquet, Hunter's Feast) | any | 12–**50%** | **5%** |

**Worst-case temporary stacks under the new table:**

| key | conjunction | total |
|---|---|---|
| `allXP` | Last Call 8 + Grand Fair 4 + Scholar's Day 3 + muster 2 + Moonbloom Elixir 5 | 22 → **clamped to 15** |
| `craftSpeed` | Last Call 8 + Guild Works 6 + Forge Fires 4 | 18 → **clamped to 15** |
| `gatherSpeed` | Deep Veins 6 + Gathering Surge 4 + Last Call 6 + Goldenroot Roast 4 | 20 → **clamped to 15** |

The clamp is reachable only at a full conjunction — the right weekly, the right daily, a Last Call
feast, and a draught in hand. **That is a feature, not an accident:** it is a visible ceiling players
chase, and it must be surfaced ("the realm's blessing is at its limit") rather than silently applied.
`allXP` at the clamp, over the permanent ceiling, is **+30% — exactly double what you earned.**

---

## 4 · The fuse, the guards, and every test that must move

### 4.1 The fuse has to move out of the castle

The fuse today (`clan-seat-ui.js:297`) computes `room = 0.60 − otherPermanentAllXp()` and reduces
**only the castle's own contribution**. It sits at layer 4 of a seven-layer chain, so companions,
buffs, the muster aura and the blessings are all added *after* it and are unpoliced. It also polices
one key.

> **Systems ask:** move the budget to a dedicated `src/features/power-budget.js`, installed **last** in
> the wrapper chain (after `world-events.js`), applying:
> ```
> permanent(key) ≤ 0.20          // the fuse
> temporary(key) ≤ 0.15          // the ceremony budget
> total(key)     ≤ 0.30          // the absolute peak
> ```
> This requires the chain to distinguish permanent from temporary. The cheapest honest shape is for the
> two temporary layers (feast, blessings, muster aura, buffs) to contribute through a second accumulator
> the final wrapper can read, rather than through the same `t +=`.

### 4.2 The constants

| constant | file | today | **new** |
|---|---|---|---|
| `PERMANENT_ALLXP_CAP` | `clan-seat-ui.js:127` | 0.60 | **0.20** — and it becomes per-key, not `allXP`-only |
| `CASTLE_KEY_CAP` | `clan-seat-ui.js:125` | 0.10 | **0.05** |
| `CASTLE_TOTAL_CAP` | `clan-seat-ui.js:126` | 0.25 — **declared and never applied** | **0.12, and enforced** |
| artisan speed clamp | `homestead-deepening.md` §H3 (unbuilt) | 0.85 | **superseded by the 0.20 per-key fuse** |
| `restedXp` clamp | §H5 (unbuilt) | 0.50 | **superseded — becomes a 1,600 XP/charge quantum ceiling** |

### 4.3 Every assertion Systems must retune

Read from `src/features/smoke-test.js` (348 tests today).

| line | assertion | → new |
|---|---|---|
| 6839 | Great Hall T5 `allXP` 0.05 | **0.04** |
| 6840 | Treasury 10 `goldFind` 0.05 | **0.03** |
| 6841 | Sawmill 10 `craftSpeed` 0.05 | **0.03** |
| 6842 | Smeltery 10 `smithSpeed` 0.05 | **0.03** |
| 6843 | War Room 10 `raidPower` 0.10 | **0.03** |
| 6844 | Tavern 10 `restedXp` 0.20 | **respec — assert the XP quantum, not a potency** |
| 6848 | `largest ≤ CASTLE_KEY_CAP` | ≤ **0.05** |
| 6852 | castle throughput ≤ `CASTLE_TOTAL_CAP` | ≤ **0.12**, and now actually enforced |
| 6868 | strained scales perks to 60% → 0.03 | **0.018** |
| **6875 — the fuse test** | | |
| 6892 | `permanentAllXp() === 0.32` (renown .22 + capstone .05 + GH .05) | **0.10** (renown .04 + capstone .02 + GH .04) |
| 6894 | `≤ PERMANENT_ALLXP_CAP` | ≤ **0.20** |
| 6904 | "with 58% banked the castle may add only 2%" | rescale to **0.18 banked → 0.02** |
| 6906 | fuse lands the stack on 0.60 | **0.20** |
| 6910/6911 | renown stubbed 0.70, castle adds 0 | stub **0.25** |
| 8741 | live `getBonus('allXP') ≤ 0.60` | ≤ **0.20** — the only fuse assert that runs on the real stack |
| 6700 | `feastEffect(10).allXP === 0.18`, `.hours === 4` | **0.04**, hours unchanged |
| 6701 | `feastEffect(1).allXP === 0.08`, `feastEffect(5).yield === 0.08` | **0.01**, **0.02** |
| 6704 | Last Call `allXP ≈ 0.36` | **0.08** |
| 6918/6925/6926 | `feastBonus('allXP') 0.18` / Last Call `0.36` / `craftSpeed 0.24` | **0.04 / 0.08 / 0.08** |
| 6687–6690 | `hearthScale(10).duration 1.4`, `.magnitude 1.2` | duration **1.4 unchanged**, magnitude **1.10** |
| 6692 / 7027 / 7038 | `restedPotency(10) 0.20`, strained 0.12 | **respec to the quantum** |
| 1491 | `raidPowerMult() − 1.10` | **1.03** |
| 8299 | Kitchen L2 `cookSpeed` delta 0.25 | **0.04** |
| 8273/8278/8246-8253 | Kitchen `noBurn` 13/19/25 + burn table | **unchanged — assert they did not move** |
| 433–436 | `bestToolSpeed` 0.05 / 0.25 | **unchanged — and now load-bearing** (§2.4's exclusion) |
| 8889 | blessing consumer probes at 0.15 / 0.20 / 0.15 / 0.30 / 0.25 / +2 | rescale to the §3.2 values |
| 1871 | renown `perks.allXP > 0` | still passes — **but see the new tests** |
| 9172 | renown weights 14 / 900 / 0.5 | **unchanged** (pacing, not bonuses) |
| 9110 / 9126 / 9258 / 9089 / 8562-8628 | the whole b226 pacing block | **unchanged — do not touch** |

**⚠ One test will break structurally, not numerically.** `smoke-test.js:8746` forces a synthetic
all-keys blessing of 0.50 and asserts `bonusFor('allXP') === 1.0`. A final clamp wrapper will cap that
at 0.30. The offline-replay latch is what this test exists to guard and it must keep guarding it —
either the test asserts through `bonusFor` (pre-clamp) rather than `getBonus`, or it drops its
magnitudes into legal range. **Systems' call; flagged so it is not discovered at the gate.**

### 4.4 New tests — four, and the first one is the one that matters

1. **The grammar test.** Walk `ROOMS`, `RANKS`, the castle `BUILDINGS` table, `FEAST_TIERS`, both
   blessing pools, `COMPANIONS` and `BUFFS_DEF`, and assert **every percentage magnitude is a whole
   number of percent** (`Math.abs(v*100 − Math.round(v*100)) < 1e-9`), with a small explicit
   allow-list for the non-percentage classes (`farmYield`, `noBurn`, duration, proc chances already in
   grammar). *This is the single test that prevents the whole thing re-drifting, and there is nothing
   like it in the suite today.*
2. **The whole-chain per-key fuse.** Max out every permanent source simultaneously — every room at L5,
   High King, castle tier 5 with all buildings at 10, a level-30 companion — and assert
   `getBonus(k) ≤ 0.20` **for every key**, not just `allXP`. The census found no aggregate ceiling test
   for any non-`allXP` key; that gap is how `smithSpeed` reached +90% unnoticed.
3. **The temporary budget.** With the maximal conjunction of §3.2 live, assert temporary ≤ 0.15 and
   total ≤ 0.30 on every key.
4. **Renown perk magnitudes, pinned literally.** The suite asserts only that `perks.allXP > 0`; the
   +22% figure exists nowhere except a stub and two comments. Pin the four ranks at +1% each and the
   total at +4%.

---

## 5 · Interaction, conversions and phasing

### 5.1 The homestead provisional — ratified, with three amendments

**Ratified as shipped in flight:** the four workbench speeds at **+2/4/6/8/10%**; Library and Trophy at
**+1/2/3/4/5%**; Garden at **+1/2/4/6/8** flat; Kitchen `noBurn` **13/19/25 unchanged**; the three procs
at **4/8%**. The agent's reasoning for each of these is correct and matches §2.1's wide/narrow rule —
including its instinct that procs deserve the larger number because they fire rarely.

**Three amendments:**

1. **P1 — Workshop and Shrine are still at +10/25/50/50/60.** Six rooms were retuned and two were not.
   They must come to **+2/4/6/8/10** in the same commit, or the House screen ships with a Sawpit at
   +50% next to a Double Bellows at +6% and the rebase reads as a bug.
2. **The Cellar goes back up: `buffDuration` +20/40/60/80/100%.** Duration is exempt from the grammar
   (§2.5) and was cut by mistake — the directive names *boosts*, and a duration is not one. At
   +20% a maxed Deep Cellar turns a 6-minute buff into 7m12s, which is a 320,000-gold rung nobody can
   perceive. At +100% it is twelve minutes, and it costs the power budget exactly nothing because
   `buffScaleFor` touches duration only (`homestead-deepening.md` §H7).
3. **Library L4/L5 `restedXp` 4/8% is dead on arrival.** 8% potency on one XP grant is single-digit XP.
   Ship the rungs with the **XP-quantum** payload in §5.3 instead, or ship them inert and let Systems
   respec in b229 — but do not ship a percentage there, because it is the one number in the spec that
   is provably worth nothing.

### 5.2 Pacing, restated honestly

The A.4 model gives days-to-first-99 (gathering) as `57.2 / (1 + allXP)`.

| | old table | **new table** |
|---|---|---|
| floor — no perks at all | 57.2 d | **57.2 d** |
| a player with Library L3 and a mid renown rank | 43.1 d (+33%) | **54.4 d** (+5%) |
| the most decorated player in the game | 37.6 d (+52%) | **49.7 d** (+15%) |
| …with ceremony uptime | 35.9 d | **49.2 d** |
| **headroom the whole boost economy buys** | **19.6 days** | **7.5 days** |

Tyler has been told and accepts this. Two consequences that are *not* in that table and must be stated:

**Artisan skills take the largest hit, and it is not close.** Artisan throughput scales as `1/(1−speed)`,
so a maxed Kitchen at +60% was worth **×2.50** and the new +12.45% is worth **×1.14**. A maxed cook's 99
therefore takes **×2.19 longer in game-hours than it did** — the single biggest change the rebase makes
to anyone's day, and far larger than the ×1.15 the `allXP` cut costs a gatherer. That is correct and
intended (a room should not two-and-a-half-times a skill), but it means the artisan block of the
all-15-99s estimate collapses onto its no-perks column: **≈18–19 months** against the 16–18 month
target, at the top of the band.

**The lever for that, if it needs one, is `PACE`, not this table.** And that is the deepest thing the
rebase achieves: with boosts confined to ±15%, **pacing is governed by two constants and nothing else.**
Today a designer cannot answer "how long is a 99?" without knowing which of forty-two sources a player
holds. After this, the answer is `PACE`, plus or minus a week. The bonus economy stops being a hidden
second pacing dial, which is exactly the class of drift the professional standard exists to catch.

### 5.3 What becomes pointless at 2%, and what it converts to

Seven surfaces. Each one is a case where shrinking the number would have shipped a dead reward.

| surface | why 2% kills it | **converts to** |
|---|---|---|
| **Library L4 / Castle Tavern `restedXp`** | Potency multiplies **one XP grant** per charge. At 8% a charge is worth single-digit XP; 80 charges is under a minute of play. It was already inert at 20% (`pacing-overhaul.md` §8.6). | **A flat XP quantum per charge.** Library L4 = **800 XP/charge**, L5 = **1,600 XP/charge** *and* cap **80 → 120**; castle Tavern L10 = **1,600 XP/charge**. Aggregate ceiling **1,600/charge** — §H5's "two roads, one ceiling" survives verbatim. 120 charges × 1,600 = 192,000 XP ≈ 5–6 hours of retuned gathering: a felt welcome-back. |
| **Kitchen / Forge / Workshop L5** (the Keystone rungs) | 300,000 gold + 2 Keystone + a Dragon Scale for **+2% more speed** than L4 is an insult, and it is the rung the whole property ladder exists to reach. | **Batch capacity — one action produces five.** The Shrine's already-specced "one action buries 10 bones" (§3.7) generalised to the other three benches. The +10% speed and +8% proc stay; they simply stop being what justifies the price. *A capacity change touches no `getBonus` key, cannot stack, and is felt every single action.* |
| **Renown Count (rank 7)** | +1% on a rank that costs 13,500 renown reads as nothing after +3%. | **+1 market listing slot.** `getPerks()` already declares `marketSlots` and nothing has ever granted it. |
| **Renown King (rank 11)** | "King of your own realm · +1% XP" is a bathetic unlock line for 72,000 renown. | **+1 daily task slot** (the declared `dailyTasks` field), on top of the 300,000 g / 250 gems it already pays. |
| **Blessings** | A 5× cut takes the calendar's expected value to **+0.3% on the day** — and b227 shipped the calendar as the *entire* online-pays mechanic. | **Cut ~4× to 3–6%, not to 2%**, on the double-discount argument in §2.3. A weekly is worth "about a whole Library, for a week you are present." |
| **Scarecrow · Bunny · Squirrel · Carrot Stew · Roasted Pumpkin** | All grant fractional `farmYield`, and `harvestPlot` **floors** the total (`legacy.js:2390`) — five purchased perks that have paid exactly zero since launch. | **Stop flooring.** `qty += floor(b) + (Math.random() < (b % 1) ? 1 : 0)`. One line; revives five dead perks; makes flat-unit yield work at small values, which is precisely the smallness problem in another costume. |
| **War Room `raidPower` 10 → 3%** | The building that hosts the Hunt paying +3% looks thin. | **No conversion needed — restate the reward.** The War Room's actual payload is the **Hunt tier ceiling** — the highest Hunt the clan may declare — which is access, not throughput, and is what the top of that ladder is really for. The panel copy must lead with it. |

**Ratified as already correct, and cited as the exemplars:** Kitchen `noBurn` (reliability), Garden flat
`farmYield` (capacity), Shrine bulk-bury (capacity), Trophy L4's rarest-kills display (access), renown's
six offline-hour ranks (capacity), Tavern leftovers 5% (a proc already in grammar).

### 5.4 Found in the census, filed not fixed

- **`combatXP` skips ranged and magic** (`legacy.js:1508` reads only attack/strength/defense/hitpoints).
  The Trophy Room, the Watchtower, War Drums and Hunter's Moon all pay nothing to two of the seven
  combat styles. **P1, pre-existing, → Systems.**
- **`CASTLE_TOTAL_CAP` is declared and never applied** (`clan-seat-ui.js:126`) — a cap that only a
  reporting function reads is not a cap. §4.2 gives it a real job.
- **`hearthScale()` is inert** — `registerBuffScaler` has no live caller, so the Tavern's advertised
  +40% duration / +20% magnitude has never applied. Rebasing a ghost is free; wiring it is Systems'.
- **Frostfin Supper's `defense` buff is a silent no-op** (`items.js:159` vs `BUFFS_DEF`).
- **Five buff keys have zero readers** (`dropRate`, `damage`, `monsterRespawn`, `crit`, `rareDrop`) —
  eight food items promise nothing. Rebase their magnitudes anyway (§3.2) so they are already in
  grammar the day they are wired.
- **Companion `xpB`, `goldBonus`, `prayerXp` are misspellings** of `allXP`, `goldFind` and
  `prayerSpeed`. Fox, Lichling, Raccoon, Owl and Grave Wisp pay nothing. Fixing the names is a buff to
  five pets and must be done *with* the rebase, not after it, or it lands as an unbudgeted increase.

### 5.5 Phasing and ownership

| phase | who | what |
|---|---|---|
| **in flight** | homestead agent | §5.1 — ratified, plus the three amendments (Workshop + Shrine ladders, Cellar back to +20…100%, Library `restedXp` payload) |
| **b228** | Systems | Castle building per-level values → +1% at L4/L7/L10 · Great Hall +1%/tier from T2 · feast ladder + Last Call · all 15 blessings · renown (4 ranks to +1%, Count and King converted) · muster aura +2% · companion base .01 · food buff tier ladder · Toolshed +2% · the three cap constants · **the fuse relocated to a final `power-budget.js` wrapper** · the four new tests + the ~30 retuned assertions in §4.3 |
| **b228, same commit** | Systems | The `farmYield` flooring fix (§5.3) and the companion key-name fix (§5.4) — both are *unbudgeted increases* if they land separately from the rebase |
| **b229** | Systems | The `restedXp` quantum respec (§5.3) and the L5 batch-capacity rungs (§5.3) — both are new mechanics, not retunes, and neither blocks b228 |
| **b229** | Designer | The change note. §5.2's honest sentence, in the game, on the build that ships it. |

### 5.6 Migrations — checked, and the answer is "two, not none"

**Castle building perk values are client-side only.** `hr_castle_buildings`
(`supabase/migrations/2026-08-08-clan-seat.sql:233`) stores `name`, `district`, `base_gold`,
`base_bundle` — costs, not perks. The perk table is `clan-seat-ui.js:60-81`. **No migration.**

**Two server mirrors DO carry magnitudes and must move in lockstep, or the client and the server will
disagree about what a feast is worth:**

| what | where | change |
|---|---|---|
| feast `all_xp` ladder + `last_call_ms` | `2026-08-08-clan-seat.sql:1104` | 0.18 / 0.15 / 0.12 / 0.08 → **0.04 / 0.03 / 0.02 / 0.01**; `last_call_ms` unchanged |
| rested potency `least(10, v_lv) * 0.02` | `2026-08-08-clan-seat.sql:1151`, `:1170` | → the XP quantum, when b229 respecs it; until then → `least(10, v_lv) * 0.004` so the two sides agree |

Everything else in the rebase — rooms, renown, companions, buffs, blessings, muster — is client data
with no server twin.

---

## 6 · Conflicts raised

1. **The fuse cannot police a chain it sits in the middle of.** Moving it to a final wrapper is an
   architectural change, not a value change, and it is the only way the ≤0.20 / ≤0.15 / ≤0.30 budget is
   enforceable rather than aspirational. **→ Systems, ruling required before b228 builds.**
2. **`smoke-test.js:8746` breaks structurally under a final clamp** (§4.3). The offline-replay latch it
   guards is load-bearing and must keep being guarded. **→ Systems + QA.**
3. **`homestead-deepening.md` §H2/§H3/§H4 and `clan-overhaul.md` §8.1/§8.2/§8.4 are all superseded by
   this document's §2.2 and §3.** Both specs' power-budget sections should carry a pointer rather than
   be silently left disagreeing with the shipped numbers. **→ Designer, next touch.**
4. **`pacing-overhaul.md` A.4's boost columns are now wrong** (+20 / +33 / +52% no longer exist). §5.2
   is the replacement table; A.4 needs an amendment note. **→ Designer, next touch.**
5. **The `farmYield` flooring fix and the companion key-name fix are power *increases*** and must land
   inside the rebase commit, not after it. **→ Systems.**
6. **`combatXP` skipping ranged and magic** is a live P1 orthogonal to this spec. **→ Systems.**
