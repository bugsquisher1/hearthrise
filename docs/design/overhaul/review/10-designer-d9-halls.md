# The designer's ruling D-9, the hall's shape (GR-30), and a check of Mossback (D-6)

**RULED by the game designer** 2026-11-21 on `lane/d-designer-d9`, from `set/v0.2.144` at 642f0988c. Docs only. No game code, data, migration or tool is touched. Chapters 00 to 14, `decisions/` and the earlier review files are not edited. Section 5 lists the edits for the integrator.

**Every number here is a DESIGN HYPOTHESIS.** Tyler asked on 2026-11-21 that no balance parameter change until a game-wide baseline and a multi-variable framework evaluate it. So each number names the outcomes it aims at and the levers it moves, and the framework judges it as one coordinated change. Where the trouble is a mechanic and not a number, this file says so (his Phase 8).

**Evidence words.** MEASURED carries its run. **FB-3** is the matrix lane's two merges on the set: the unlock cell at 856ffcaf4 (local, 2 seeds of 2 hours, the MID four, the proposed game), and the hall check at 9cc9ab4e6. **Probe** is my own local play of `tools/balance-sim/boss-call-table.mjs` through a scratch copy with four extra flags (the boss's blow, his to-hit, the adds' fit, the food of the cell's Level), never committed. A probe row is 8 fights, so it shows direction and never a rate. COMPUTED is arithmetic on named rows. JUDGMENT is a design call. UNKNOWN names what would settle it. Nothing is compared with the game that runs today.

**Player words.** Lines in quotes are the exact words. Labels are genre labels. American spelling. No semicolons, no dashes, no colon-joined clauses.

---

## 0. One screen

| Ruling | In one or two sentences |
|---|---|
| **D-9 The half point** | `talentHalf` 4, not 10. A hero's first two points pay twice what they did (Force rank 2 is +3.3%, not +1.7%), and the ceilings do not move, so the system stays one gear band |
| **D-9 The ceilings** | Unchanged: Force 10%, Footing 12% of rating, Grit 12%, Reserve 15%. The stat lines cannot be felt away from an edge at any size the power budget allows, and on the edge they already decide who lives |
| **D-9 The unlocks** | The first unlock is at rank 2, so the panel's first two points can buy one. Every first-build unlock is one row on the modifier table (R20) with a "when" written in the action bar's own conditions. None fires on a quiet Normal hunt. Each fires when the party is losing |
| **D-9 The four unlocks** | **Cover** (Force): +15% damage while an ally is under half health. **Brace** (Footing): monsters land less often on you while an ally is under half health. **Dig in** (Grit): heal 0.5% of max HP a second while two heroes are under half health. **Deep well** (Reserve): mana comes back twice as fast in a fight under 30% mana |
| **D-9 What moves out** | Focus fire is retired (a damage percent that fires on every Normal kill, MEASURED invisible). Draw fire and Carry over need hooks of their own, so they wait as later unlocks. Linger waits whole until R20 names the status tick. The first build has four tracks |
| **D-9 The plan** | A plan brings each track it weights to its first unlock before it spreads, heaviest weight first. "Use suggested" holds an unlock from Level 10 |
| **GR-30 The verdict** | A health-only hall number is a poor mechanic, not a wrong number. A clock sorts parties by damage alone, and four damage dealers have the most, so it rewards the party it should punish. "Never on his blows" is withdrawn |
| **GR-30 The shape** | A hall is a **Dangerous room**. The boss stays on the one formula with the boss blow cap, and the ruled tier dial lifts his blows and aim as it does on every ground. He stands at his ground's band top. One hall number, **13**, on health |
| **D-6 Mossback** | As written he threatens nobody on Normal (right for Normal) and only a four with no healer on Deadly. His Swipe passes the boss blow cap and comes down to **1800**. Deadly in a room calls **twice the adds**, because a room has no pull and Dangerous and Deadly were one fight at two prices |

**What Tyler can veto, one line.**

1. **D9-1, the ship bar (2026-11-05).** You asked about 85% with a good bar and about 30% with a bad one. On the hall shape ruled here a good bar at the band's middle wins about every fight (Probe C: 8 of 8) and a bad bar about half (4 of 8). This ruling reads your 85% as a floor and grades the bad bar at 50% or under. "Veto D9-1" sends FB-3 to try the hall at Deadly with its doubled wave, which presses the card's party harder, and keeps 85% and 30% as the aim.

Nothing else here bends a ruling of his. The boss blow cap (GR-25, S-15 a) is kept on purpose. Section 2.3 shows what bending it would buy, and it buys about what the Dangerous room buys.

**One thing the plan owner must know.** FB-3's hall check fed every Level the Hold's guide food, Cooked Lobster, which heals 300. That is about three quarters of a Level 25 hero's base health a bite. The probe re-ran Level 25 on the Glade's Cooked Trout (heals 168) and the result held, but the tool should eat the food of the cell's Level (section 2.6).

---

## 1. D-9, before FB-11 starts

### 1.1 What the measurements say, taken apart

| # | What it is | Evidence | Kind |
|---|---|---|---|
| 1 | **A damage percent cannot be felt by a four on Normal.** Its kills are capped by the respawn. Focus fire at +6% on every seat moved Normal damage an hour by +0.1 to +0.7% and Level XP by 0.0 to +0.8%. A planted +100% moved Normal pace only 0.8 to 8.7% | FB-3, 856ffcaf4 | Mechanic |
| 2 | **Damage does count on the edge.** Deadly at Level 60 read +8.5% damage and +3.7% Level XP with Focus fire, on a thin sample where the four hunted 22% of the time. In chapter 12's edge sample the all-Force build died 4 times and the empty build 12 | FB-3. Chapter 12 section 3.10 (R2, 128 hero-hours a build) | Design |
| 3 | **The stat lines sit inside the power budget**, so a four cannot feel them away from an edge. An empty build costs 0 to 4%. On the edge it was 3 wipes against 0 | Chapter 12 section 3.10 and 4.2 | Design |
| 4 | **The first five points are worth nothing a player can see** at a half point of 10. Force rank 2 pays +1.7%. The first unlock needs three points in one track, so it comes at Level 15 at the earliest | COMPUTED from chapter 10's curve. Audit A-13 | Number |
| 5 | **Three of the five authored unlocks need a hook of their own.** Draw fire needs a row in the shooter rule. Carry over needs a status transfer. Linger's own stat line has no named key | Chapter 10 section 4, "Hook today" | Mechanic |

So two of the problems are numbers and three are the mechanic. A damage percent that fires on every kill is the wrong kind of unlock for a game where a four on Normal is held by the respawn (Phase 8). The right kind fires when the four is losing, which is the only place where a few percent decide anything.

### 1.2 The rulings

**Ruling 1. The half point is 4.** `talentHalf` 4. Layer: curve.

| Rank | 1 | 2 | 3 | 5 | 8 | 10 | 15 | 25 | 40 | 80 |
|---|---|---|---|---|---|---|---|---|---|---|
| Force pays, half 4 | 2.0% | 3.3% | 4.3% | 5.6% | 6.7% | 7.1% | 7.9% | 8.6% | 9.1% | 9.5% |
| Force pays, half 10 (was) | 0.9% | 1.7% | 2.3% | 3.3% | 4.4% | 5.0% | 6.0% | 7.1% | 8.0% | 8.9% |

COMPUTED. The ceiling does not move, so every hero ends where it would have, and only the early ranks move up. A damage hero at Level 110 on the suggested build holds Force 7.6% (5.7% at half 10). All in Force at Level 110 is 8.5% (6.9%), still about one weapon step (RULED 2026-10-25, 5 to 8%). The cost is that the late stat line is flatter: rank 40 to rank 80 adds 0.4% where it added 0.9%. That is accepted, because the late depth lives in unlock ranks 8 to 40 and in tracks that arrive with new regions (chapter 10 section 3.3).

**Ruling 2. The ceilings stand.** Force 10%, Footing 12% of the hero's rating, Grit 12%, Reserve 15%. Raising them buys nothing a four feels on Normal (row 1), and it would break TL1, the rule that a build is never worth a weapon step over a sensible one. On the edge the stat lines already sort builds (row 3).

**Ruling 3. The unlocks change kind.** An unlock in the first build is one row on the modifier table of R20: a key the table already has, a size, and a "when". The "when" is written in the action bar's own conditions (`src/data/condition-metrics.js`), so the engine reads one seam and the player reads words already in the game. Every first-build unlock fires only when the party is losing. It does nothing on a quiet Normal hunt, so it never moves the Level pace and it never needs a respawn to be felt.

**Ruling 4. The first unlock is at rank 2.** `talentUnlockRanks` [2, 8, 15, 25, 40]. The panel opens at Level 10 with two points (chapter 10 section 10), so the first choice is real: both in one track for an unlock now, or one in each for two stat lines.

**Ruling 5. A plan reaches an unlock before it spreads.** The plan rule of chapter 10 section 3.4 gains one step in front: a plan first brings each track it weights to its first unlock rank, heaviest weight first, ties by the list's order. Then it spends each point on the track furthest below its share, as written. So "Use suggested" holds an unlock from Level 10, a second at Level 20 and a third at Level 30.

**Ruling 6. Four tracks in the first build.** Linger waits whole until R20 names the status tick as a key and Carry over has its hook. Half a track is a half-built feature, and those stay hidden (CLAUDE.md 3.5). The axes' suggested weights become the damage hero's.

**Ruling 7. Two bands change, two are added.** TL2 (empty against suggested, 0.90 to 0.97) is read on lone heroes only, because a four's pace is held by the respawn (the same reason as P3 in D-3). TL5 and TL6 grade the edge, where the system is for. TL7 holds the unlocks quiet on Normal. Section 1.3.

### 1.3 The hypotheses: what each number aims at, and what it moves

| Number | DESIGN HYPOTHESIS | Outcomes it aims at | Levers it moves | Layer |
|---|---|---|---|---|
| `talentHalf` | 4 | TL2 on a lone hero at Level 25: 0.90 to 0.97. TL1 stays at or under 1.05 | The curve's shape. Every track at once | Curve |
| `talentUnlockRanks` | [2, 8, 15, 25, 40] | A player can hold an unlock at Level 10. TL4 still finds two builds within 3% for every way | Content data | Content |
| Cover | +15% damage dealt while the lowest ally is under 50% health. Party only | TL6. TL7 | Permanent damage key (sums, caps at 20%) | Content row |
| Brace | +40% Defense rating while the lowest ally is under 50% health. Party only | TL6. TL7. The front hero's deaths on the edge | Defense rating key (CORE-4's rows). The to-hit floor bounds it | Content row |
| Dig in | Heal 0.5% of max HP a second while 2 or more heroes are under 50% health. Party only | TL6. TL7 | A hero's own heal over time (the largest counts) | Content row |
| Deep well | Mana regen in a fight ×2 while this hero's mana is under 30%. Alone or in a party | TL6. The healer's dry runs on the edge | The regen row | Content row |
| `talentUnlockSize` | 1.0 | Scales all four at once to land TL6 | Every unlock row | Coefficient |
| The ceilings | As written | TL1, TL3 | Unchanged | Content |

**The bands.** For `tools/balance-program/standards.mjs`, written by FB-3.

| Band | Reads | Range | Status |
|---|---|---|---|
| TL1 | Level XP an hour, the fastest build over the suggested one, with unlocks in | At most 1.05, red over 1.08 | Kept |
| TL2 | Level XP an hour, the empty build over the suggested one, **lone heroes only**. A four prints as a report | 0.90 to 0.97 | Changed reader |
| TL3 | Deaths in 1,000 hours on Deadly, every hero on safety, mid gear | Never under 30 | Kept |
| TL4 | Builds within 3% of the best for each way | At least 2 | Kept |
| **TL5** | On the edge cells, deaths of the empty four over deaths of the suggested four | At least 2 | New. Chapter 12 read 12 against 0 at Level 185 |
| **TL6** | On the edge cells, deaths of the suggested four with its unlocks over the same four with no unlocks | At most 0.67 | New. This sizes `talentUnlockSize` |
| **TL7** | Level XP an hour of a four on Normal, with unlocks over without | 0.99 to 1.01 | New. The unlocks stay quiet where nothing is at stake |

**The edge cells** are the death sample's cells where the suggested four dies at all on Dangerous or Deadly, pooled, plus the Level 185 Deadly cell of chapter 12. A pooled count, because a single cell of 128 hero-hours cannot see a rate under about 23 in 1,000 (chapter 12 section 10).

### 1.4 The rows FB-11 takes

**`src/data/talents.js`.** Content and curve data.

```
curve:        value = trackMax * talentPower * rank / (rank + talentHalf)
talentEvery:  5        talentHalf: 4        talentPower: 1.0
unlockRanks:  [2, 8, 15, 25, 40]
talentUnlockSize: 1.0

tracks (id, stat, trackMax), first build:
  force    damage dealt, permille on the permanent damage key      100
  footing  Defense rating, permille of the hero's own rating       120
  grit     max health, permille                                    120
  reserve  max mana, permille                                      150
  (linger waits: R20 names the status tick, and Carry over has its hook)

unlocks at rank 2 (track, id, key, size, when, partyOnly):
  force    cover      damage dealt        +150 permille  ally_hp_pct lowest lt 50     party only
  footing  brace      Defense rating      +400 permille  ally_hp_pct lowest lt 50     party only
  grit     dig_in     own heal over time  5 permille of max HP a second
                                                         allies_below under_50 gte 2  party only
  reserve  deep_well  regen in a fight    x2             self_mana_pct lt 30          alone or party

suggested weights (force, footing, grit, reserve), by harness way:
  tank       1 2 2 0
  sword      3 1 1 0
  hammer     3 1 1 0
  axes       3 0 1 1
  bow        3 0 1 1
  crossbow   3 0 1 1
  mage       3 0 1 1
  healer     0 1 2 3
```

The healer's Reserve moves from 2 to 3 so the plan reaches Deep well first, since its tie with Grit went to the list's order.

**`src/core/talents.js`.** The plan function gains its first step (ruling 5). It stays one small pure function on both runtimes.

**R20, the modifier table.** The "when" column holds at most one condition in the action bar's shape `{ metric, op, value, subject }`, drawn from `METRICS` in `src/data/condition-metrics.js`, never a `slotOnly` metric. The engine reads it with the bar's own evaluator. A row with no "when" always counts. A party-only row never counts for a hero alone. No unlock adds a metric.

**What the suggested plan holds.** COMPUTED with ruling 5.

| Level | Points | A damage hero (3, 0, 1, 1) | Unlocks | A shield tank (1, 2, 2, 0) | Unlocks | A healer (0, 1, 2, 3) | Unlocks |
|---|---|---|---|---|---|---|---|
| 10 | 2 | Force 2 | Cover | Footing 2 | Brace | Reserve 2 | Deep well |
| 20 | 4 | Force 2, Grit 2 | Cover, Dig in | Footing 2, Grit 2 | Brace, Dig in | Reserve 2, Grit 2 | Deep well, Dig in |
| 30 | 6 | Force 2, Grit 2, Reserve 2 | three | Footing 2, Grit 2, Force 2 | three | Reserve 2, Grit 2, Footing 2 | three |
| 110 | 22 | then by share | three, and Force reaches rank 8 at Level 65 | then by share | three | then by share | three |

### 1.5 The words

The Talents panel (chapter 10 section 9.5). Labels, one a line. Numbers come from the projection.

| Where | Words |
|---|---|
| A track's next unlock | "Unlock at Rank 2: Cover" |
| Cover | "+15% damage while an ally is under 50% HP" and "Party only" |
| Brace | "Monsters hit you less often while an ally is under 50% HP" and "Party only" |
| Dig in | "Heal 0.5% of max HP a second while 2 heroes are under 50% HP" and "Party only" |
| Deep well | "Mana comes back twice as fast in a fight while yours is under 30%" |
| An unlock held | "Cover: on" |

The size in each line is read from the row at `talentUnlockSize`, never typed into the text.

### 1.6 Walk-through, Level 10 to Level 25, on real data

| # | Step | Holds before it | Checked in | Doable |
|---|---|---|---|---|
| 1 | A hero reaches Level 10 | Four heroes from the first hour, about hunted hour 6 | Chapter 10 section 10 step 2. `hunts.js`: the Thicket 5 to 15, the Sewer 5 to 25 | Yes |
| 2 | The return card shows "Talent points: 2" | Two points | Chapter 10 section 10 step 3 | New, FB-11 |
| 3 | Opens Character, then Talents | Step 2 | `src/data/shell-windows.js` id `character`. The panel is new | New, FB-11 |
| 4 | Spends both points in Force and holds Cover | Two free points | `unlockRanks` [2, ...] | New, FB-11 |
| 5 | Or presses "Use suggested" on all four heroes | Step 3 | Section 1.4 weights. A healer gets Deep well, a tank Brace, the rest Cover | New, FB-11 |
| 6 | The four hunts. On a quiet Normal pull no unlock fires | Step 4 or 5 | `ally_hp_pct` with subject `lowest`, `allies_below` with `under_50`, `self_mana_pct`: all in `METRICS` and none `slotOnly` | Yes, once R20 reads the "when" |
| 7 | On the Path's first Dangerous offer (D-1) the front hero drops under half and Cover fires on the other three | Step 6, a party | D-1 section 1.1, the Path row. The party-only rule exists (2026-11-09, 2026-11-19) | Yes |
| 8 | Level 15: a point arrives while away and the plan spends it | A plan | Chapter 10 section 9.2 | New, FB-11 |
| 9 | Level 20: a second unlock | Four points | Section 1.4 table | New, FB-11 |
| 10 | Under Level 30 a reset is free | Any spent point | `talentFreeResetLevel` 30. "Not available while hunting" in `src/data/refusal-words.js` | New, FB-11 |

No step needs an item, gold or a monster. Every condition the unlocks read was searched in `src/data/condition-metrics.js` on this branch.

### 1.7 What FB-3 plays to confirm

In CB-2, the one sizing pass, after FB-11 lands R20 with its "when" column. Until then the scratch hook of `patches/tal-focus-fire.json` is the pattern for planting each row. **4 seeds of 8 hours** a cell, on GitHub, on the proposed base with every CB-2 row in.

| Block | Cells | Builds | Reads |
|---|---|---|---|
| T1, the first points | Every lone way at Levels 10, 15, 20, 25 and 30, Normal, mid gear | Suggested at half 4. Suggested at half 10. Empty | TL2 on lone heroes |
| T2, the edge | The standard four on Dangerous and Deadly at the band floors of the 14 grounds the death sample plays, and Level 185 on Deadly | Suggested with unlocks. Suggested with no unlocks. Empty. All Force. All safety. B, the built holder | TL3, TL5, TL6, deaths in 1,000 hours, hunted share |
| T3, Normal stays quiet | The standard four on Normal at Levels 25, 60, 110, 185 and 400 | Suggested with and without unlocks | TL7 |
| T4, the pace edge | The lineup cells of chapter 10 section 8.3 at Levels 25, 60, 110, 185 and 400 | Suggested. All Force | TL1, TL4 |
| T5, each unlock alone | The standard four, Deadly, at the two Levels of T2 where the suggested four died most | One unlock on, the other three off, for each unlock | Which unlock carries TL6. An unlock that moves no death is cut or re-cased, never enlarged past `talentUnlockSize` |

**What would change this ruling.** TL6 over 0.67 at `talentUnlockSize` 2.0: the edge rules are the wrong kind too, and the Draw fire hook is pulled forward. TL7 outside 0.99 to 1.01: a "when" fires on quiet hunts and is re-cased. TL1 over 1.05: the half point goes back toward 10. TL2 still over 0.97 at Level 25: the first unlock is felt but the stat lines are not, and that is accepted, because TL5 and TL6 are where the system is for.

### 1.8 Evidence

| Claim | Label |
|---|---|
| A damage unlock is invisible to a four on Normal and felt on the edge | MEASURED, FB-3, 856ffcaf4. Local, 2 seeds of 2 hours, thin at Deadly 60 |
| On the edge a build decides who lives | MEASURED, chapter 12 section 3.10, R2. One Level, four seeds |
| The curve's values at half 4 and 10 | COMPUTED from chapter 10 section 3.2 |
| What the suggested plan holds | COMPUTED with ruling 5's rule |
| The metrics exist and are not `slotOnly` | Read from `src/data/condition-metrics.js` |
| No jewelry perk uses these cases | Read from `src/data/jewelry.js` `JEWEL_PERKS`: crit, spells landing harder, cleave, free casts, blows turned aside, health on a kill, misses landing, mana on a kill. None reads an ally's health or a low mana |
| The four unlock sizes | DESIGN HYPOTHESIS. Not played |
| That an edge rule cuts deaths | UNKNOWN until T2 and T5 |

---

## 2. GR-30, the boss halls

### 2.1 What the hall check and the probe show

| Probe | Party | The hall as GR-30 wrote it: formula boss, health ×22, Level 25 | A Dangerous hall at the room's Level, health ×16: Level 25 / 75 | A Dangerous hall, the boss at Level 110 (his band top), health ×16 ×1.10: party at 85 / 98 / 110 |
|---|---|---|---|---|
| A, B, C | Card's party, good bar | 1 of 8 | 8 / 8 | 3 / 8 / 8 |
| | Card's party, the door's bar (its hints) | 0 of 8 | 8 / 8 | 0 / 8 / 8 |
| | Card's party, bad bar | 0 of 8 | 3 / 7 | 0 / 4 / 8 |
| | One gear tier behind, good bar | 0 of 8 | 8 / 8 | 0 / 8 / 8 |
| | The mid four (hammer, bow, mage, healer) | 0 of 8 | 7 / 8 | 7 / 7 / 8 |
| | Four damage dealers, no tank or healer | **8 of 8** | 2 / 2 | 0 / 0 / 0 |
| | A tank and a damage dealer, no healer | 0 of 8 | 0 / 0 | not played |
| | A tank and two healers | 0 of 8 | 0 / 0 | 0 / 0 / 0 |

Wins out of 8 fights. The card's party is a tank, a healer, a hammer and a mage. Probe A ate the Glade's Trout, and on the Hold's Lobster it read the same within one fight. Probes B and C play the tier as the tier dial would, with the boss's blow and aim lifted 2.5 times on the formula row. Probe B did not lift his health by the tier's 1.10, and neither probe lifted his adds.

What it says.

1. **Health only rewards the careless party.** With the boss written so his blows threaten nobody, the hall is a damage race against 10 minutes. Four damage dealers win every fight where the card's party loses every fight. No hall number fixes it, because the four damage dealers always have the most damage. This is the mechanic failing, not a number (Phase 8).
2. **Why the formula boss threatens nobody.** He is written on the party ground's fit, which takes 25% off his blow and 30 points off his to-hit. That fit exists because a party ground lands a pull of eight on one tank at once. A boss in a room fights alone, so the discount leaves him landing 40% for 18% of a hero's base health (COMPUTED, `formulaStats`, role boss, fit party). A regular on a solo ground lands 70% for 22%.
3. **The tier dial alone gives the shape.** On Dangerous the same row lands about 75% for about 45%, and the hall sorts parties by what they lack: no healer and no tank loses, no damage loses to the clock, a bad bar loses often, and the card's party holds. Nothing about the formula, the cap or the boss changed. Only the tier did.
4. **Level is the curve.** With the boss standing at his band top and the party coming up through the band, the card's party is near the clock on arrival and comfortable from the middle. At health ×16 ×1.10 the clock is a wall at the floor (good bar 598 seconds), so the number comes down (ruling 4).
5. **Gear shows only through the clock.** A party one tier behind wins wherever the card's party wins, and loses with it at the floor. Section 2.5 says what that means for the ship bar.

### 2.2 The rulings

**Ruling 1. The hall number acts on health only, and the threat comes from the tier.** GR-30's "never on his blows" is withdrawn as a reason. His blows are the formula's, and the tier decides how hard they land, as on every ground.

**Ruling 2. A hall is a Dangerous room.** One content flag on every hall's hunt: the tier it offers is Dangerous and nothing else. It is the folded tier flag of GR-25 (S-15 a). Layer: content data. A hall fought on Normal is a damage race (row 1 of 2.1), so it does not exist.

**Ruling 3. The boss stays on the one formula.** The boss role, the party ground's fit and the boss blow cap, as built. No hall knob on his blows or aim, and no per-hall number. The ruled tier dial lifts both at run time (R7, "a tier's dial is applied once").

**Ruling 4. One hall number, 13.** Layer: coefficient. With Dangerous's own ×1.10 on health that is ×14.3 the boss role.

**Ruling 5. A hall boss stands at his ground's band top**, and the room is not rescaled to the party. Only a world boss's room is (MM-5). It is already true of the halls that exist: Lord Krell is Level 110 at the top of the Hold's 85 to 110, and the Rat King is Level 25 at the top of the Sewer's 5 to 25 (`monsters.js`, `hunts.js`).

**Ruling 6. Krell's hand rows stay in the first build.** He moves onto the formula with the keyed-halls lane of chapter 14, as GR-30 already says. On this ruling his health then reads about 35,500 against today's 18,000 (COMPUTED, the formula boss at Level 110, 2,482 health, ×14.3). That is not a re-tune for a three (RULED 2026-11-17), and his hall check is re-read at that move.

### 2.3 Why not the other shapes

| Shape | Why not |
|---|---|
| Health only (GR-30 as written) | Rewards four damage dealers, at any number (2.1 row 1) |
| A health number that changes with Level | The cliff moves with Level (FB-3: about ×22 at 25, ×24 at 52, ×28 at 75), so a curve could follow it. But it is still a damage race, and the four damage dealers still win it |
| A room fit that bends the boss blow cap: his steady blow at the cap, to-hit 85%, his marked hit 2.5 times his blow, a stronger pulse | The probe at Levels 25, 52 and 75 sorted parties about as well as the Dangerous room (good bar 8, 8, 8 of 8, four damage dealers 2, 8, 2, bad bar 0, 1, 0). It needs a third fit, a marked hit over a third of a hero's health on Normal, and a veto line against GR-25. The Dangerous room needs none of that |
| Krell's hand rows as the model (7.3 times the health, 2.4 times the blows, 4.1 times the aim of the formula at 110) | They pass the boss blow cap by about 1.65 times at his floor, and the enrage takes a blow to 87% of a Level 98 hero's base health. It works, and it is the per-boss patch the formula ruling forbids |

### 2.4 The hypotheses: what each number aims at, and what it moves

Read at the hall's band middle unless named. "The card's party" is the party the card names, on the door's bar and the card's food, in mid gear.

| Target | DESIGN HYPOTHESIS | Probe reading | Status |
|---|---|---|---|
| H1 The card's party wins | At least 80% | 8 of 8 at 98 and 110 (C) | Reading over the band of GR-30. On the veto line |
| H2 The same party on the bad bar | At most 50%, aiming at 30% | 4 of 8 at 98 (C). 3 and 7 of 8 at 25 and 75 (B) | Level 75 is off |
| H3 Four damage dealers, no tank or healer | At most 30% at every point of the band | 0 of 8 at 85, 98, 110 (C). 2 of 8 at 25, 75 (B) | Holds on the probe |
| H4 A tank and two healers | Loses to the clock, at most 10% | 0 of 8 everywhere | Holds on the probe |
| H5 The card's party at the band floor | At least 50% | 3 and 0 of 8 at ×16 ×1.10. The number comes down for this | The reason for 13 |
| H6 The card's median kill | 55 to 75% of the clock at the middle, under 90% at the floor | 478 and 504 seconds at the middle on ×16 ×1.10, so about 390 and 410 seconds at ×14.3 (65 to 68%). The good bar's 598 at the floor becomes about 485 (81%) | COMPUTED on kill time scaling with health. Not played |
| H7 Challenge on or off | The card's party within 10 points either way | Not played on the Dangerous room | Tyler 2026-11-14: either is a fair choice |
| Report | The mid four. One gear tier behind | The mid four 7 or 8 of 8 at every Level. A tier behind 8 of 8 from the middle and 0 at the floor | Printed, not graded |

| Lever | Hypothesis | Layer |
|---|---|---|
| The hall's tier | Dangerous, one flag | Content |
| The hall number | 13, one number | Coefficient |
| The boss's Level | His ground's band top | Content |
| The boss's kit | His own spell rows, each under the boss blow cap | Content |
| His enrage | His own phase row | Content |
| The card's food | The store food the card names, of his band | Content |
| Not moved | The boss blow cap, the formula's roles and fits, the tier dial | |

If H2 stays off at 75, the first lever is the boss's enrage, then the hall's tier (Deadly with its wave, section 3.3), never a number on one hall.

### 2.5 The ship bar, and what gear means in a hall

Tyler asked on 2026-11-05 for about 85% with a good bar and about 30% with a bad one. On the Dangerous room a good bar wins about every fight from the middle of the band, and a bad bar about half. The levers that would make the card's party lose 15% to the dice are the ones that put it on its own edge: the clock, or blows near its sustain. Both are cliffs in Level and gear. So this ruling grades the good bar as a floor (H1) and the bad bar at 50% or under (H2). That is veto line D9-1.

A party one gear tier behind holds the hall some Levels later than a mid-geared one, and loses only to the clock near the floor. That is the frame chapter 12 section 4.2 gave every kind of power: how many Levels sooner a four holds the next step. The hall reads gear the same way a ground does.

### 2.6 What FB-3 plays to confirm

`tools/balance-sim/boss-call-table.mjs` needs two flags before the run, both tool data: `--tier dangerous` (the tier dial on the room's blows, aim and health, and on its adds) and the food of the cell's Level (the guide food of the open ground whose band holds the party's Level, and its store partner on the door's bar). Then **40 fights a row**, the hall check's rows plus "good bar but no Challenge on the tank".

| Run | Boss | Party Levels | Hall number |
|---|---|---|---|
| R-H1 | The formula boss at 25 in Krell's room, the Rat King's band top | 16, 20, 25 | 11, 13, 16 |
| R-H2 | The formula boss at 110 in Krell's room | 85, 98, 110 | 11, 13, 16 |
| R-H3 | The same at 52 and 75, standing in for Hask's and the Barrows' tops | the band's floor, middle and top | 13 |
| R-H4 | Krell's own rows at 98, as the control | 98 | his own |

It reads H1 to H7 and the report rows, and picks the hall number by H5 and H6. Then the death sample's room cells for Mossback (section 3.5).

### 2.7 Evidence

| Claim | Label |
|---|---|
| Health only gives a cliff that moves with Level, and nobody dies | MEASURED, FB-3, 9cc9ab4e6 |
| Four damage dealers win where the card's party loses | MEASURED, Probe A, 8 fights a row, Level 25, the Glade's Trout and the Hold's Lobster |
| The party fit makes the formula boss land 40% for 18% | COMPUTED, `formulaStats` in `src/data/balance-sheet.js`, role boss, fit party, floor at the room's Level |
| The Dangerous room sorts parties | MEASURED, Probes B and C, 8 fights a row. The tier's health and the adds' tier lift were not applied |
| Bending the cap buys about the same | MEASURED, Probe D, 8 fights a row, Levels 25, 52, 75 |
| Krell's rows against the formula | COMPUTED, `monsters.js` `lord_krell` (health 18,000, atk 247 at tier 6, aim 290) against the formula at 110 |
| Health 13 lands H5 and H6 | COMPUTED from Probe C's kill times. Not played |
| The probe's food leak in the hall check | Read from `src/data/supplies.js` `BAG_GUIDE_BY_HUNT` and `items.js` (Cooked Lobster heals 300, Cooked Trout 168) |

---

## 3. Mossback (D-6), checked

### 3.1 What threat means for a world boss

He never dies, a send runs like a hunt, and a party's share is bars broken times the tier's pay. So there is no win and no loss, and a clock decides nothing. Threat in his room means two things.

1. **Deaths an hour on the tier chosen sit in that tier's band.** The room is always built at the party's own Level, so every send is a four arriving in a band (S-12 a). On Normal no party with a front and a healer dies (at most 5 in 1,000 hero-hours). On Dangerous and Deadly the card's party dies at the ruled count of a four arriving (10 to 30, and 50 to 100), and a four with no healer cannot hold it.
2. **A prepared four out-earns a careless one.** On the hardest tier each can hold, the card's party breaks more points an hour than four damage dealers do. On Normal the careless four may break bars faster. It pays for that in food, and it cannot follow onto the harder tiers.

So a world boss's threat is the tier ladder inside one room, and preparation pays through the tier a four can hold. That is the same frame as a ground.

### 3.2 What the probe shows

Mossback stood in for in Krell's room: the formula boss at Level 25, his Swipe (a cone, 2,000 permille, 12 seconds) and Slam (the whole party, 400, 20 seconds) on Krell's spell slots, enrage ×1.4, every phase on each bar (health ×11, so each fight was one bar). 8 bars a row. The adds were Krell's, not two poachers.

| Party | Normal: bars broken, seconds a bar, food a head | Deadly: deaths in 8 bars, food a head |
|---|---|---|
| The card's party, good bar | 8, 316, 95 | 0, 659 |
| The card's party, the door's bar | 8, 350, 76 | 0, 744 |
| The mid four | 8, 318, 82 | 0, 562 |
| Four damage dealers | 8, **282**, 338 | **2**, 1,348 |
| A tank and a damage dealer | 0 in 10 minutes, 920 | 0, 4,020 |

Deadly was played as the tier dial: his blow and aim on the row lifted 2.5 times.

What it says. On Normal he threatens nobody and four damage dealers break bars fastest, paying 3.6 times the food. That is right for Normal (MM-7: as safe as a Normal hunt). On Deadly he kills a four with no healer about once every 20 minutes and holds nobody else. So the ladder exists as written, and its sizes are UNKNOWN on 8 bars. A version on a room fit with no party discount (his blow 24% of base health, to-hit 70%) killed the mid four in 6 of 8 Deadly bars and the four damage dealers in all 8. That is too sharp for a room farmed by the hour, and it is not taken.

Two things are wrong, and one is a mechanic.

1. **His Swipe passes the boss blow cap.** 2,000 permille of a blow at 18.15% of the room-Level hero's base health is 36.3%. The cap is a third, and it bounds his spells too (RULED, GR-25, S-15 a). COMPUTED.
2. **In a room, Dangerous and Deadly are one fight at two prices** (Phase 8). On a ground the two tiers share one blow number and differ by the pull (chapter 12 section 3.1). A room has no pull. So Deadly differs only by 1.15 against 1.10 on health and pays `bossTierPm` more, and no four would ever send on Dangerous.

### 3.3 The amendments to D-6

| Row | Was | Now, DESIGN HYPOTHESIS | Layer | Outcome it aims at |
|---|---|---|---|---|
| `mossback_swipe` `hitPm` | 2000 | **1800** | Content | 32.7% of the room-Level hero, inside the cap. Its job on Deadly (the no-healer four dies, the card's party holds) is re-read |
| The tier table, a new column `roomWave` | None | **normal 1000, dangerous 1000, deadly 2000**: the permille of a room's own add wave that each phase line calls | Content, one column on the one tier table | Deadly is the bigger pull in a room as it is on a ground (RULED 2026-11-07). Mossback calls two poachers on Normal and Dangerous, four on Deadly. Halls are Dangerous only, so their wave does not move |
| Health of one bar | The boss role times the hall number | The boss role times the hall number of 2.2, **13**, times the tier's health | Coefficient | About 9 to 10 bars a Normal hour for the mid four at Level 25 (COMPUTED from section 3.2's probe, 318 seconds a bar at ×11). MM-5's three Levels within 10% is re-read |
| His fit | The party ground's, as written | **Unchanged** | | Normal stays as safe as a Normal hunt |
| Enrage, Slam, the poachers, the chest, the pool | As written | Unchanged | | |

Words for his tier picker, beside the ground's lines in `hunt-tiers.js` `TIER_LINES`, a `room` variant:

| Tier | Words |
|---|---|
| Normal | "Low risk" (as the ground's) |
| Dangerous | "Hits harder" and "More points" |
| Deadly | "Hits harder, more adds" and "Most points" and "Bring plenty of food" |

The death line stays `TIER_DEATH_LINE`.

### 3.4 The hypotheses for his room

| Target | DESIGN HYPOTHESIS |
|---|---|
| W1 Normal | No party with a front and a healer dies. At most 5 in 1,000 hero-hours |
| W2 Dangerous | The card's party dies 10 to 30 in 1,000 hero-hours or fewer. Four damage dealers die over 100 |
| W3 Deadly | The card's party dies 50 to 100 in 1,000 hero-hours. Four damage dealers cannot hold it (over 150) |
| W4 Points | On the hardest tier each holds by W1 to W3, the card's party earns more points an hour than four damage dealers |
| W5 Bars an hour | The mid four on Normal at Levels 25, 52 and 75 within 10% of each other (MM-5) |

Levers: the Swipe and Slam shares (under the cap), his enrage, `roomWave`, the hall number. Not moved: the cap, the tier dial, the formula's fits.

### 3.5 What FB-3 plays to confirm

The room as a looping cell in the matrix (FB-13's boss room cells): the bar refills and the phases run again until the 8 hours end. **4 seeds of 8 hours** a cell, on GitHub. Levels 13, 25, 52 and 75. Normal, Dangerous and Deadly with `roomWave`. Four parties: the card's party, the mid four, four damage dealers, and a tank with a damage dealer. Reads W1 to W5, `barsPerNormalHour`, and `bossTierPm` beside it. If W3 reads under 50 for the card's party, the first lever is the Slam's cadence under his enrage, then the Swipe's share up to the cap, never his fit.

---

## 4. What I did not check

- The probe is a scratch copy of the hall tool with four flags: the boss's blow as a share of base health, his to-hit, the adds on the solo ground's fit, and the food of a named ground. It is not committed. Each row is 8 fights, which shows direction only. The tier's health and the tier's lift on the adds were not applied in Probes B and C.
- Mossback was played in Krell's room with Krell's adds (a named add and two grave guards), not two poachers, and his Swipe's cone was set to Krell's slot. The room never looped, so deaths an hour are inferred from one bar a fight.
- No unlock was played. The four unlock sizes, the half point's effect on TL2 and every TL band are UNKNOWN until CB-2.
- I did not read R20's design beyond chapter 01's key table. Whether the regen row and the own heal over time are keys on it is taken from chapters 01 and 10.
- I did not play the hall at Deadly with its doubled wave, which is the lever veto D9-1 would need.
- I did not check the four hall bosses past Krell and the Rat King against their bands (Chief Coppercap, Captain Hask). Their halls are built by the keyed-halls lane, not the first build.
- I did not run the game. Nothing here changes a screen except the Talents panel's lines, the hall card's tier and Mossback's tier picker.
- `node tools/lane-done.mjs` was not run. The game is closed and the lane is docs only (CLAUDE.md section 4).

---

## 5. For the integrator

- **00 section 5.5 (the reversal list).** Add D9-1 as written in section 0.
- **00, the open items.** D-9 is ruled here. GR-30's hall shape is ruled here.
- **01 section 2.1, the modifier table.** The "when" column holds one condition from `METRICS` in `src/data/condition-metrics.js`, never `slotOnly`, read by the bar's evaluator. A party-only row never counts alone.
- **01, the hall boss paragraph (line 587 on this branch).** Replace with: "A hall boss is the formula's boss role at his ground's band top, times one hall number on his health. A hall is fought on Dangerous only, and the tier dial lifts his blows and aim as it does on every ground. The card's party wins at least 80% at the band's middle, four damage dealers at most 30%, and a party with no damage loses to the clock (DESIGN HYPOTHESIS, D-9 file section 2)."
- **01 and 02, GR-30's rows.** "Acts on health and the 10 minute clock, never on blows" becomes "acts on health. The threat is the Dangerous tier". The hall number is 13, PROVISIONAL.
- **02 section on halls.** The same paragraph. Krell moves onto the formula with the keyed-halls lane and his health then reads about 35,500. A hall boss stands at his band top.
- **06 section 2.3, MM-5 and MM-7.** MM-7's clause "because the hall number acts on the boss's health and the clock and never on his blows" becomes "because the room's blows are the one formula's at the tier chosen". Add `roomWave`. Add section 3.1's meaning of threat for a world boss and targets W1 to W5.
- **06, Mossback's rows (D-6 in `review/06-designer-rulings-w1.md` section 2.2).** `mossback_swipe` `hitPm` 1800. The bar is the boss role times 13 times the tier's health. Add the tier picker's `room` words.
- **10 sections 3.2, 3.3, 3.4, 4, 5.4, 8.1, 8.4, 10 and 13.** `talentHalf` 4. `unlockRanks` [2, 8, 15, 25, 40]. The plan's first step. The four tracks and four unlocks of section 1.4 here. Linger, Focus fire, Surrounded, Draw fire and Carry over move to a "waits" list with what each waits on. The healer's weights 0, 1, 2, 3 and the axes' 3, 0, 1, 1. TL2 on lone heroes. TL5, TL6 and TL7. The new-player text: "Force reads Rank 0. Damage +0.0%. Next +2.0%. Unlock at Rank 2: Cover".
- **12 section 3.10.** Add: "D-9 ruled the half point at 4 and the unlocks as edge rules (`review/10-designer-d9-halls.md`)".
- **13 section 2.4, D-9's row.** Mark it ruled, and point here.
- **13 FB-11.** Builds four tracks, not five, and the four unlocks of section 1.4 through the "when" column only. No hook in `targeting.js` or `status.js` for unlocks in the first build. Its tests: each unlock in and out of its case, and an unlock never counting for a hero alone where it is party only.
- **13 FB-3.** Add section 1.7's blocks to CB-2's sample, the two tool flags and runs of section 2.6, and section 3.5's room cells.
- **13 FB-13.** `mossback_swipe` 1800, `roomWave`, the hall number 13 for his bar.
- **14, the keyed-halls lane.** Halls are Dangerous only, with the boss at his band top and the hall number 13.
- **`decisions/`.** TAL-1: the half point, the unlock ranks, the four unlocks, Linger waits. GR-30: the new shape, PROVISIONAL, D9-1 on the veto list. MM-5 and MM-7: their reasons as above. GR-25: no change, the cap is kept.
- **`.claude/coordination/DISCOVERIES.md`, two rows, owner FB-3.** The hall check eats the Hold's Cooked Lobster at every Level (heals 300, about three quarters of a Level 25 hero's base health). The hall tool has no tier flag, so a hall's tier cannot be played.
