# Chapter 10: Talents, a build choice every five Levels

Part of "Hearthrise: the game we are building". Lane `lane/d-level-choices` (game designer, 2026-11-21), cut from `set/v0.2.144`. Docs only. No game code, data or migration was changed. No other chapter was edited. Section 13 lists what the integrator has to change elsewhere.

**How to read the labels.**

- **RULED** (date): the owner decided it. About this system the owner ruled one thing, and section 0 states it. Other RULED tags cite older rulings by date.
- **PROPOSED**: this chapter's design. It is the designer's call and it is not validated. In the status words of the re-issued book it is PROVISIONAL, and what it waits on is in section 12.
- **PROVISIONAL**: a number. Every number in this chapter is provisional until the balance matrix plays it, including the ones with arithmetic behind them.
- Evidence: **MEASURED** (a run on the real engine or a count from a file), **COMPUTED** (arithmetic on named inputs), **JUDGMENT** (a design opinion), **UNKNOWN**.

This chapter adds no row to the pile of decided calls. The critical review (`review/00-critical-review.md`) found 121 of 155 rows with no measurement behind them. Nothing here is measured either, and it says so.

---

## 0. One screen

**What is ruled.** RULED 2026-11-21: a build choice every five Levels is designed now and built with the first build, inside the power budget and modelled in the balance matrix from the start, so the game is balanced once. That lifts the hold of 2026-11-05 and replaces the direction of GR-61 (Kindlings on Inner Flame). The mechanic may be inspired by another game. The name, the look, the words and the numbers are Hearthrise's own.

**The problem.** Past Level 45 a Level is hours of play for +10 health and +10 mana. Two heroes with the same weapon at the same Level differ only by jewelry. Levels never end, so this is the longest empty stretch in the game.

**The shape.** One system called **Talents**. A hero earns one talent point every five Levels, for ever. A point goes into one of a few tracks. A track does two things.

1. Every rank gives a small stat on a curve that flattens and never passes its ceiling.
2. At set ranks (3, 8, 15, 25, 40) the track unlocks a rule that changes how the hero plays its seat.

The flattening curve pays a hero for spreading out. The unlocks pay a hero for going deep. That tension is the decision. It is a hybrid of the two proposals on the table, and section 2 says why neither wins alone.

**What a player does.** At Level 10 the Talents panel opens with two points. The player spends them, or presses Use suggested. From then on a point arrives every five Levels. A player who wants to choose each time chooses each time. A player who does not sets a plan once, and the server spends each new point by that plan, on all four heroes, with no press. A reset costs gold.

**The power budget.** Talent power is not a bonus on top of the game. Every hero at a Level holds the same number of points, so the system is part of the plain hero, the way mid gear is. Monsters, tiers and the Level table are sized against a hero that carries a suggested build. The whole system is sized to one gear band: an empty hero against a full one never differs by more than one weapon step on offense and one armor step on defense, at any Level. COMPUTED on the provisional curve: the fastest build is at most 1.2% faster than the suggested build, so the pace ceiling of chapter 06 moves from 1.65 to about 1.67.

**The sample.** Five tracks, each with a stat line and one unlock, all PROVISIONAL: Force (damage), Footing (monsters land less often), Grit (health), Reserve (mana) and Linger (bleeds, burns and sicknesses). Section 4. The full set is at most eight tracks, and none is written until these five are played.

**What the matrix needs.** Six knobs, one data file of tracks, one suggested build for each harness way, four contrast builds and four new bands. Section 8 gives the exact rows.

**What stays unknown until played.**

- Whether the picks are a build or a tax form. The test is in section 12, and failing it cuts the system.
- Whether a point that adds under 1% is felt at all, and whether the first unlock on day 2 is soon enough.
- Whether a point every six days at Level 400 is a rhythm or a drought.
- Every size in section 4. All five unlocks need engine work: two wait on the modifier table's "when" column and three need a hook of their own.
- The reset price in gold. The wage formula it reads is not written.
- Anything about the arenas. They wait on their own engine check.

---

## Read log

| Source | How much |
|---|---|
| The brief, the owner's request of 2026-11-21, `review/00-critical-review.md`, `review/F-framework-audit.md` | Whole |
| The rulings of record | The 2026-11-18 to 2026-11-21 block whole, and every line that mentions a tree, a wheel or Level choices. Private. Cited by date only |
| `46-from-scratch.md` | Change 5 and section 7 whole |
| `56-review-progression.md` | Section 4.1, trace 3, its rows on change 5 and on stat points |
| `47-itemization-fit.md` | C10 and C19 whole |
| `60-game-review.md` | The rows on the build choice |
| `decisions/all.json` | GR-61, GR-3, GR-4, GR-7, GR-23, GR-39, CORE-3, CORE-4, MM-12, MM-13, MM-24, MM-25, MM-26, read by script |
| `01-core-and-combat.md` | 2.1, 2.3, 2.4, 2.8 opening, 2.10, 2.13, and section 5 by search |
| `03-items-and-crafting.md` | 2.2, the perk table and sizes of 2.6, Tempering in 2.8, the E bands of section 6 |
| `05-progression.md` | 2.1, 2.2 opening, 2.4, 2.9, 2.16 |
| `06-mmo-layer.md` | 2.2 and 2.6 |
| `08-player-experience.md` | By search: the first hour table and the Path rows |
| `44-formula-architecture.md`, `itemization-plan.md` | Not read directly. I used the book chapters that carry them. A claim about either rests on the chapter |
| Code | `knobs.json`, `standards.mjs` (band list printed by script), `matrix-plan.mjs` (ways and lineups), `play-ground.mjs` and `member.js` (how a cell sets Tempering, buffs and perks), by search |

Every existing thing this chapter names was searched in `src/data` or the tools first: Challenge, Rend, Blight, Green Sickness, Frost Slam, Shelter and Mend in `abilities.js`. Thrift in `jewelry.js`. The shooter rule in `src/core/hunt/targeting.js`. The Character window in `shell-windows.js`. "Not available while hunting" in `refusal-words.js`. `player_ledger` in the stamina refill migration. No file in `src/data` or `src/core` uses the word Talent.

---

## 1. The purpose test

**The player problem.** Three, and they are one hole.

1. A Level past 45 gives nothing a player chooses. COMPUTED in study 60 from the spell data: nothing on any bar changes after hunted hour 254.
2. Two heroes of one weapon at one Level are the same hero. The owner asked on 2026-11-18 that each character not be exactly the same.
3. With no lineup test and party XP by size alone (GR-3, the owner's pick on the page of 2026-11-21), the book has no answer to what makes preparing a party a decision. Section 6 says how far this system answers it. It is a partial answer.

**The decision it adds.** Where the next point goes, every five Levels, for the whole life of a hero. Spread for the stat or dig for the unlock. And once for each hero: what kind of holder, shooter, caster or healer this one is.

**What it plugs into.**

| It plugs into | How |
|---|---|
| The modifier table (chapter 01, step R20) | Every rank and every unlock is a row on a key the table already has. No talent adds a key, a multiplier or a lane row |
| Gold | A reset is a gold sink priced in hours of the hero's own hunting. Journalled |
| The party | Unlocks are seat rules. Some fire only in a party, through the party-only row rule that exists (RULED 2026-11-09, 2026-11-19) |
| The arenas | The Even Arena gives every hero the same points and reads no real allocation. The Open Arena reads the hero as it stands |
| The four heroes of an account | A build is saved for each hero, copied between heroes, and spent by a plan with no press |
| The balance matrix | The harness heroes carry the suggested builds from the first run |

Three reviews found this hole separately (46, 56 and 52, with 47 agreeing after reading them). That is evidence the hole is real. It is not evidence that this fix is fun.

---

## 2. The shape, and the alternatives

PROPOSED. JUDGMENT throughout.

| Shape | What is good | Why it does not win alone |
|---|---|---|
| **Points into about six stat tracks with diminishing returns** (46, change 5) | Smallest thing that fits endless Levels. Every row is a coefficient. A respec sink | Diminishing returns have a solved answer: keep every track's next point equal. Everyone finds the same split in a week, and a point is then a percent nobody feels. 46 named this risk itself. It also proposed a luck track and a town work track, and section 3.6 removes both |
| **Kindlings on Inner Flame** (56, GR-61) | Reuses a skill and drops that exist. A pick of one from three is easy on a phone | Its clock is Inner Flame, and the ruling of 2026-11-21 asks for a choice every five Levels. It was fenced into a 2% budget, which is too small to make two tanks play differently. A pick of one from three at each rung is a fixed set of rungs, which someone has to author for ever |
| **A fixed tree** | The most authored, the most identity | It ends. Levels do not. Every node is hand content, which is the mass generation the creative standards rule out. A tree drawn as a graph is the worst thing to use on a landscape phone |
| **This chapter: tracks with unlocks** | The stat line is one formula and never ends. The unlocks are the authored part, and they are few. Breadth and depth pull against each other, so there is no single equal-marginal answer | It is two ideas in one system, so it must stay small: five tracks in the sample, eight at most, five unlock ranks |

**What I took from each.** From 46: the clock (five Levels), the tracks, the gold reset, coefficients only. From 56: the three fences of the itemization fit, the rule that a pick is made in town and copied, free changes for a young hero, and the sameness test that cuts the system if it fails. From the tree: authored rules at set depths, in a list and not a graph.

**What I did not reuse, and why.** Inner Flame stays a skill that pays regen. Hanging Talents on it would put the build on a second clock beside Level, and the ruling names Level. That leaves Inner Flame's flat stretch past level 100 unsolved. Section 13 hands it back as open.

**Why Level may feed a build when no blow may read a Level.** RULED 2026-11-04 and 2026-11-18: a fight is stats against stats. That rule holds here without exception. Level opens the door and the fight reads what is behind it, which is exactly how gear works: a piece names the Level that may wear it, and the blow reads the piece. A talent rank is a stored stat row on the hero. No formula in a blow, a heal or a monster's aim takes Level as an input. GR-64 ("no stat points a Level") was written to protect that rule, and it needs rewording, not breaking. Section 13.

---

## 3. The rule

All PROPOSED. Numbers PROVISIONAL.

### 3.1 Points

`talent points earned = floor(highest Level reached / talentEvery)`

- `talentEvery` opens at 5. RULED 2026-11-21 for the rhythm.
- It reads the highest Level the hero has ever reached. A death can take a Level (CLAUDE.md section 6). It never takes a talent point back, so a death never forces a hero to unspend. The server stores the count and only ever raises it.
- The Talents panel opens at Level 10 (`talentOpensAt`, a row of the Path in chapter 08). The point earned at Level 5 waits for it, so the first screen holds two points. Section 10 says why.
- Points are never bought, traded, gifted or sold for gold or Crowns. Unspent points never expire.

COMPUTED from the Level table of chapter 05 (the law's hours for a plain four, at 12 hours a day):

| Level | Points held | Hunted hours for each point since the row above | Days for each point |
|---|---|---|---|
| 10 | 2 | 3 | 0.3 |
| 25 | 5 | 10 | 0.8 |
| 50 | 10 | 26 | 2.2 |
| 100 | 20 | 43 | 3.6 |
| 200 | 40 | 54 | 4.5 |
| 400 | 80 | 73 | 6.0 |
| 1,000 | 200 | 158 | 13.2 |

The rhythm slows with the Level table. That is the Level law, not a choice of this chapter. UNKNOWN whether a choice every six days at Level 400 reads as a rhythm.

### 3.2 A track's stat line

`value(rank) = trackMax x talentPower x rank / (rank + talentHalf)`

- One curve for every track. It is the shape the game already uses for armor and for Inner Flame regen, so it is no new kind of formula.
- `talentHalf` opens at 10 ranks. At rank 10 a track pays half its ceiling.
- `trackMax` is a number on the track's data row.
- `talentPower` opens at 1.0 and scales every track at once. It is the one dial that turns the whole system up or down.
- The curve never passes `trackMax`. That is the point of this shape. A curve that grows for ever, however slowly, tilts hero power against monsters at Level 2,000, and the gear curve exists to prevent exactly that. The cost is honest: past rank 40 a rank pays almost nothing, and what keeps a point worth spending there is the next unlock or a track not yet opened.

COMPUTED, for a track with a ceiling of 10%:

| Rank | 1 | 3 | 5 | 8 | 10 | 15 | 25 | 40 | 80 | 200 |
|---|---|---|---|---|---|---|---|---|---|---|
| Pays | 0.9% | 2.3% | 3.3% | 4.4% | 5.0% | 6.0% | 7.1% | 8.0% | 8.9% | 9.5% |

### 3.3 Unlocks

- A track unlocks one rule at ranks 3, 8, 15, 25 and 40. The ranks are one list for every track (`talentUnlockRanks`, content data).
- An unlock is a row on the modifier table with a "when" column, the same column GR-39 gives a narrow jewelry perk. It is sized like one: about 5% inside its case, never more.
- An unlock is written by what a row does, never by weapon or ground. "Taunts you cast" is allowed. "Challenge" is not. "A monster that shoots" is allowed. "In the Sewer" is not.
- An unlock that changes who a monster attacks can be switched off on the hero's Setup, and the switch is remembered. A rule a player cannot turn off is a trap on the wrong ground.
- New unlock ranks past 40, and new tracks, arrive with new regions. That follows the ruled pattern for perks (2026-11-18: sizes stop, new regions bring new perks). Nothing past the sample is written in this chapter.

COMPUTED: reaching rank 40 in eight tracks takes 320 points, which is Level 1,600. So which unlocks to hold is a live choice for longer than any content is planned.

### 3.4 The plan: a choice made once

The first principle (2026-10-18): a decision made once is remembered, reusable and copyable. A hero in an idle game crosses a multiple of five while the browser is closed. Four heroes would be four presses every five Levels for ever.

- A hero may hold a **plan**: a weight from 0 to 3 on each track. When a point arrives, the server spends it on the track furthest below its share of the weights. Ties go to the first track in the list. It is one small pure function, the same on the server and in the browser.
- A hero with no plan banks its points. The return card shows one line for the account, and unspent points count as one of the card's decisions.
- **Use suggested** sets the plan to the suggested weights for the hero's weapon way. The suggested weights are data rows, and they are the same rows the balance matrix plays (section 8). So a player who presses it once sits on the seat the Level table is timed on.
- **Copy from** sets one hero's plan to another hero's allocation and spends what is free along it. It never unspends.
- A changed allocation counts from the next hunt the hero starts. Spending is allowed while a hero hunts. A reset is not.

### 3.5 Reset

- One action: reset this hero. Every point comes back. There is no price for moving a single point.
- Price: `talentResetHours` of the hero's own hunting wage at its Level, in gold. It opens at 3 hours. The wage formula (roadmap step R15) is not written, so **this chapter prints no gold number**. The critical review says to use prices in hours only for new prices. This is a new price.
- Free while the hero's highest Level is under `talentFreeResetLevel`, which opens at 30. A new player cannot be trapped in a bad first pick.
- Every reset writes one ledger row, including a free one at zero gold.
- JUDGMENT on the size: dear enough that a hero is not rebuilt for every ground, cheap enough that a wrong build is fixed the same day. COMPUTED: one reset a week for one hero is 3 of 84 hunted hours, about 3.6% of that hero's weekly hunting gold. UNKNOWN how often players reset.

### 3.6 Fences

Each one comes from a ruling or from the book, and each is a guard a build lane can write.

| Fence | From |
|---|---|
| No blow, heal or monster roll reads a Level. Talents are stored rows | RULED 2026-11-04, 2026-11-18 |
| No talent touches a drop, Magic Find or Luck. Luck has two feeds and no more. The luck track of 46 is dropped | RULED 2026-11-20. 47, C19 |
| No talent moves coin from kills | MM-25: no coin buff, ever |
| No talent moves Level XP. A Level XP track would be the only right pick, and the Level law must not read its own modifiers | Chapter 05, 2.4 |
| No talent copies a jewelry perk's case or a unique's property kind. Jewelry stays the worn build layer | 47, C10 |
| No talent takes a share off a blow. Plate sits at the 60% cap from Level 110, so such a row would be dead for a tank and a way past the cap for anyone else. Protection is written on the Defense rating or on health | Chapter 01, 2.4. CORE-4 |
| No talent adds a row to a bar lane or shortens a cooldown. It may change a row that is already inside the bar budget | Chapter 01, 2.8 and section 5 item 11 |
| No talent changes attack speed | RULED 2026-10-15 |
| No talent row is keyed on a weapon, a ground or a monster name | RULED 2026-11-21, the formula brief |
| Premium gives no points and no free reset. Crowns buy neither. Gold bought with Crowns pays a reset like any gold | RULED 2026-11-18: power is never sold for Crowns directly |
| No town work track in the first set. Town work is in no matrix cell, so it could not be balanced once | The framework audit, 3.3 |

---

## 4. The sample: five tracks

**Everything in this section is PROVISIONAL.** It is a sample to be played and corrected, as the creative standards require before any batch. Names are working names. The text home and the copy rules give the final ones.

The modifier key each stat line sits on is one the table of chapter 01 already has. "Hook" says whether the engine can carry the row today. I checked hooks by search in `src/core/member.js`, not by a full read.

| Track | Stat line | `trackMax` | Key it sits on | Rank 3 unlock (one authored for each track) | Hook today |
|---|---|---|---|---|---|
| **Force** | Damage dealt | 10% | "Permanent perks and food buffs to damage", which sums and caps at 20% | **Focus fire.** +6% damage to a monster that another hero of the party is also attacking. Nothing alone | Stat: yes, a damage permille on the member. Unlock: needs the "when" column |
| **Footing** | Defense rating, as a percent of the hero's own rating. Monsters land less often | 12% of rating. Target: a full track is about 5% less damage taken an hour for the hero in front, found on the matrix | The Defense rating, beside the protection buffs of CORE-4 | **Surrounded.** With three or more monsters on the hero, Footing counts half again | Stat: yes, the member's `def`. Unlock: needs the "when" column |
| **Grit** | Max health | 12% | `heroHp`, beside plate's health share | **Draw fire.** Monsters that shoot aim at this hero first. Can be switched off on the Setup | Stat: yes. Unlock: needs one row in the shooter rule of `targeting.js` |
| **Reserve** | Max mana | 15% | `heroMana`, beside cloth's mana share | **Deep well.** Under 30% mana, mana regen in a fight doubles | Stat: yes. Unlock: needs a condition on the regen row |
| **Linger** | Bleeds, burns, chills and sicknesses the hero applies tick harder | 10% | The status tick. It is inside the +30% cap on "takes more" where a status makes a monster take more (CORE-3) | **Carry over.** When a monster dies with the hero's status on it, the status moves to one monster beside it for its remaining time | Stat: UNKNOWN. The census lists the status tick as an unnamed number. Unlock: needs a hook |

**One example of depth, to show where the higher ranks go. Not sized.** Grit rank 8, **Stand in**: when a hero beside this one would be dropped under 20% health by a blow, this hero takes half of it, once every 30 seconds. A party-only row.

**Why these five.**

- Each sits on a different key, so no two are the same choice at different prices.
- None is a jewelry perk's case. The built perks cover crit, misses, the first blow, low health, bosses, ranged blows, heavy hits, food, drink and free casts. That is why there is no healing track: "heals and shields are stronger" is the Echo perk. A healer builds from Reserve, Grit and Footing instead, which gives three different healers: one that never runs dry, one that survives the shooters, one that is hard to hit.
- Two of the five unlocks, Draw fire and Carry over, change what happens in a fight and are not a percent. Draw fire gives any tough hero a job that today only a bow's target rule answers. MEASURED on a real four (chapter 01): 28% of the damage taken landed on the healer, nearly all from monsters shooting the back row.
- Footing is written on the rating, so it is the first thing in the book that makes a plate hero tougher past Level 110 where armor only keeps it level. The critical review named that gap.

**Two tanks that play differently.** A shield tank on Footing and Surrounded takes fewer blows and holds the pack. A shield tank on Grit, Draw fire and Stand in takes more blows, on purpose, for the three behind it. Same weapon, same gear, a different party around each. JUDGMENT. Whether both are within reach of each other on the matrix is the test.

**What the sample leaves out on purpose.** Tracks six to eight. Unlocks at ranks 8 to 40, except the one unsized example. A town work track. Anything for the arenas.

---

## 5. The power budget

### 5.1 Where the power comes from

It comes out of the baseline, not on top of it. PROPOSED.

Every hero at Level L holds `floor(L / 5)` points. Nobody has more. Paying buys none. So Talents create no gap between a payer and a free player, or between gear states. The only gap is between a hero whose points sit well and one whose points sit badly.

So the reference hero changes. The pace seat becomes "a mid-geared four, each hero on the suggested build for its way". Monsters, the tier table, the Deadly sizing and the Level law are fitted against that hero from the first full matrix run. This is what the ruling of 2026-11-21 means by not balancing twice.

### 5.2 The size

PROPOSED, PROVISIONAL. **The whole system is sized to one gear band.**

| Reading | Size | Basis |
|---|---|---|
| A hero with every point in Force against a hero with none | At most +10% damage, ever. +6.9% at Level 110 | COMPUTED. About one weapon step (RULED 2026-10-25: +5 to 8%) |
| A hero with every point in protection against a hero with none | Target about one armor step, 3 to 5% less damage taken, plus up to 12% health | TARGET. The rating size is found on the matrix |
| The fastest build against the suggested build, same hero | At most 1.012 at any Level, falling to 1.003 by Level 1,000 | COMPUTED from the curve and the suggested weights of section 8. Diminishing returns do this by construction |
| An empty build against the suggested build | About 0.95 on its main reading | COMPUTED for Force at Level 110: 5.65% |

So a player who ignores Talents is about one weapon step behind, which is real and is not a wall. A player who studies them gains about 1% in pace over one who pressed Use suggested, and gains the unlocks, which is where the build lives.

COMPUTED, suggested builds by Level (points in Force, Footing, Grit, Reserve):

| Level | Points | A damage hero (weights 3, 0, 1, 1) | Its Force | All in Force | A shield tank (1, 2, 2, 0) | Its Footing and Grit |
|---|---|---|---|---|---|---|
| 10 | 2 | 1, 0, 1, 0 | 0.9% | 1.7% | 0, 1, 1, 0 | 1.1% each |
| 25 | 5 | 3, 0, 1, 1 | 2.3% | 3.3% | 1, 2, 2, 0 | 2.0% each |
| 50 | 10 | 6, 0, 2, 2 | 3.8% | 5.0% | 2, 4, 4, 0 | 3.4% each |
| 110 | 22 | 13, 0, 5, 4 | 5.7% | 6.9% | 4, 9, 9, 0 | 5.7% each |
| 200 | 40 | 24, 0, 8, 8 | 7.1% | 8.0% | 8, 16, 16, 0 | 7.4% each |
| 400 | 80 | 48, 0, 16, 16 | 8.3% | 8.9% | 16, 32, 32, 0 | 9.1% each |
| 1,000 | 200 | 120, 0, 40, 40 | 9.2% | 9.5% | 40, 80, 80, 0 | 10.7% each |

### 5.3 How it stacks

| Against | How Talents meet it |
|---|---|
| **The gear curve and the +17% band** (GR-4) | Separate. Gear is the weapon damage term of Power. Force is a modifier after Power. A full Force track is worth about one band step and can never be worth two, because the curve has a ceiling |
| **Best gear over mid, about 15%** (standard 50-3) | Unchanged. Both gear states carry the same suggested build, so bands P4 and S5 read gear and nothing else |
| **Tempering** | The Blows track and Force are both permanent damage. If both sit on the 20% key, Force (up to 10%), a full Blows track (about 5%) and food share one cap, and the cap starts to bite late. That is a brake I want. I did not verify in code what else sums on that key. The formula lane confirms it |
| **Jewelry perks** (GR-39) | Separate keys by the fence of 3.6. A matched perk set stays capped at 9%. Unlocks are sized like a narrow perk and are counted in band TL1 below, so the two together cannot make a second weapon |
| **The buff caps** (MM-24 to MM-26) | Damage buffs are their own key, +15% at most, and multiply with Force. Protection buffs are Defense rating rows, the same key as Footing. So the floor the to-hit formula is owed (CORE-4) is now owed for two reasons. It must land before Footing is final |
| **The 1.65 ceiling** (MM-26) | COMPUTED: 1.15 x 1.15 x 1.25 x 1.012 = 1.67. The integrator restates the reference as "a plain four on suggested builds" |
| **Blessings and death** | Nothing. A death takes no point. No talent cuts the death cost |
| **Premium** | Nothing. See the fence |
| **The Level law** | The law is fitted with suggested builds in. A build's stat lines rise from about 1% at Level 10 toward their ceilings, so a hero gains a bounded few percent against monsters over its life. XP for a Level is derived from hours, so the law absorbs it. Band P2 must still hold from Level 110 to 5,000, and the ceiling is why it can |
| **Deadly** | Sized on the mid four with suggested builds. A four built all for safety must not turn a mid-geared party into a best-gear party. Band TL3 holds that |

### 5.4 The knobs it adds

For `tools/balance-program/formulas/knobs.json`. All arrive with the Talents build step. None exists in the game today.

| Knob | Opens at | What it moves |
|---|---|---|
| `talentEvery` | 5 Levels | How often a point arrives. RULED for the rhythm |
| `talentHalf` | 10 ranks | How fast a track flattens. Lower pays breadth more |
| `talentPower` | 1.0 | Every track's ceiling at once. The system's master dial |
| `talentUnlockSize` | 1.0 | Every unlock's size at once, against its authored row |
| `talentResetHours` | 3 hours of wage | The gold sink |
| `talentFreeResetLevel` | Level 30 | How long a new hero may change its mind for nothing |

Content data, not knobs: each track's `trackMax`, the unlock ranks, the unlock rows, the suggested weights for each way, and `talentOpensAt`.

---

## 6. Does this make preparing a party a decision

The critical review asks what makes preparing a party a decision now that no lineup is made to fail and party XP is paid by size alone.

**The honest answer: partly, and only once Deadly bites.**

What it adds:

- **A second axis for every seat.** The four is chosen by weapon. Talents then say what each one is for. A hammer in front on Footing and Surrounded is a holder by build, not by a shield. That makes "a hammer and three mages" a party someone prepared, and not a default.
- **Jobs that have no owner today.** Somebody takes the shooters (Draw fire). Somebody stands in for the healer (Stand in). Whoever carries them gives up damage for it. Who carries them is a decision about the four, not about one hero.
- **A reason to look at the hunt report.** If the healer died twice last night, the answer can be a build and not only a better helm.

What it does not do:

- It forces nothing. Nothing here makes a lineup fail, and that is the ruling.
- MEASURED in the book at the opening dials, one seed and one hour, direction only: every lineup held Deadly with no deaths. While that is true, no defensive talent is worth a point and every four takes Force. **This system cannot make preparation matter by itself. The harder tiers have to bite first.** It is a second reason to do review step 1 before sizing anything here.
- At Level 110 the shield and the hammer hold the same, because both sit at the armor cap. Footing gives them something to differ by. Whether it is enough is a matrix question (the contrast build B of section 8).

---

## 7. Arenas, the four heroes, and what it must not touch

**The Even Arena.** PROPOSED, and it waits on the arena engine check (MM-41) like everything else there. Every hero gets the same number of points, the count for the arena's reference Level. The player sets an arena build for each hero once. It is saved, it is free to change, and no gold is ever spent on it, because paying does nothing in the Even Arena (MM-37). A real allocation is not read. So a Level 12 hero and a Level 300 hero bring the same points, and the build decides, which is what the owner asked of that arena on 2026-11-21. If a track misbehaves hero against hero, the reference kit switches that track off with one content flag.

**The Open Arena.** It reads the hero as it stands, with its real points and its real allocation. A higher Level brings more points there. Matching is by gear band (MM-38), and a band is about 20 to 55 Levels wide, so two heroes in one band differ by at most about 11 points. COMPUTED on the curve: about 1% of a stat line at most, and that is at low Level where ranks are steep.

**Four heroes on one account.** Points belong to the hero, because Level does. One purse pays every reset. The return card carries one line for the account, never four. Use suggested and Copy from each act on one hero or on all four with one press.

**It does not touch.** Drops, Luck, coin, Level XP, the death cost, stamina, town work, the market, attack speed, the mitigation cap, the roll rule.

---

## 8. What the balance matrix needs

This is written so the simulator lane can add it alongside its fixes to the death rule, the store bill and the seats. Until those land, a talent row moves numbers the tool already reads badly, and nothing here is final.

### 8.1 Data

One new file in the game, `src/data/talents.js`, read by the harness the way it reads every other data file. PROVISIONAL rows:

```
curve:        value = trackMax * talentPower * rank / (rank + talentHalf)
talentEvery:  5        talentHalf: 10        talentPower: 1.0
unlockRanks:  [3, 8, 15, 25, 40]

tracks (id, stat, trackMax):
  force    damage dealt, permille on the permanent damage key      100
  footing  Defense rating, permille of the hero's own rating       120
  grit     max health, permille                                    120
  reserve  max mana, permille                                      150
  linger   status tick, permille                                   100

suggested weights (force, footing, grit, reserve, linger), by harness way:
  tank       1 2 2 0 0
  sword      3 1 1 0 0
  hammer     3 1 1 0 0
  axes       2 0 1 0 2
  bow        3 0 1 1 0
  crossbow   3 0 1 1 0
  mage       3 0 1 1 0
  healer     0 1 2 2 0
```

The ways are the eight of `tools/balance-sim/styles.mjs`. Points at a cell's Level are `floor(L / 5)`, spent by the plan rule of 3.4. At Levels 1 to 4 a hero holds none.

### 8.2 How a cell carries it

A cell already sets Tempering through `opts.temper` on the fixture (`play-ground.mjs`). Talents ride beside it: `opts.talents`, a function from the seat's way and Level to an allocation, placed on `m.perks.talents`. The member then turns the allocation into rows.

Four stat lines can be played today through seams that exist: Force as a damage permille, Footing on the member's `def`, Grit on max health, Reserve on max mana. Linger's stat line and all five unlocks need hooks. **So the first matrix pass reads four stat lines and no unlock.** That pass can size `talentPower` and the track ceilings. It cannot say anything about whether builds differ, because the unlocks are where they differ.

### 8.3 Builds to play

| Build | What | It answers |
|---|---|---|
| **Suggested** | The weights above, on every seat | The new reference. Every existing band is re-read with it in |
| **A. All Force** | Every point in Force, on each damage way and on the four | The build edge on pace |
| **B. The built holder** | The hammer with the tank's weights (1, 2, 2), in the two lineup cells that put a hammer in front | Whether a build can do what the shield does where armor is capped |
| **C. Empty** | No points spent | What ignoring the system costs |
| **D. All safety** | Every hero on Footing and Grit, the four on Deadly | Whether talents alone buy the best-gear death band |

Cells: the lone ways and the standard four, mid gear, at Levels 25, 60, 110, 185 and 400, on Normal for a lone hero and Deadly for the four. Builds A to D only at those five Levels. That is a small block beside the lineup block, not a new axis on the full grid. The suggested build is on in every cell of every run.

### 8.4 Bands

For `tools/balance-program/standards.mjs`. PROPOSED ids. All PROVISIONAL.

| Band | Reads | Range | Why |
|---|---|---|---|
| **TL1** build edge, pace | Level XP an hour, the fastest build over the suggested build, same seat | At most 1.05. Red over 1.08 | A build is never worth a weapon step over a sensible one. It includes unlocks once they are hooked |
| **TL2** the empty build | Level XP an hour, build C over the suggested build | 0.90 to 0.97 | Ignoring Talents costs something real, and never a tenth of the game |
| **TL3** build edge, safety | Deaths in 1,000 hours on Deadly, build D, mid gear | Never under 30 | Under 30 is the best-gear band (S6). Talents must not replace gear |
| **TL4** more than one good build | For each way, the number of builds within 3% of the best on that seat's main reading | At least two | The matrix's stand-in for the sameness test of section 12. One build alone at the top is a red |

Existing bands that must be read with the suggested build in, from the first full run: P1 and P2 (the Level table and pace against the contract to Level 5,000), P4 and S5 (best gear over mid), S3, S4 and S6 (the tier bands), X19 (every way within 1.5 of the median, each on its own suggested build) and C3 (the new four in the Sewer, where a hero holds one point and the panel is not yet open). E7, the Add pool, does not read Talents. Talents are baseline and TL1 bounds them.

One row for `proposals.json`: Talents, playable for four stat lines, not modelled for Linger and the unlocks.

---

**Measured since, in chapter 12.** From `12-balance-pass.md` section 3.10 (R0, 145 cells, and R2). TL1 holds: the fastest build reads 0.99 to 1.022 of the suggested one. TL2 misses under Level 185: the empty build reads 1.00 at Level 25 and 0.96 at Level 400, against a band of 0.90 to 0.97. TL4 holds and says the builds are alike. On the edge of a tier a build decides who lives: at Level 185 on Deadly the suggested build had no death and the empty build 12, in 128 hero-hours each. The unlocks are still unmodelled. Every size stays PROVISIONAL.

## 9. The server shape

A build spec for a backend lane. Nothing here is built. It follows CLAUDE.md sections 1 and 6: the client sends intents and draws the state the server returns.

### 9.1 What the server owns

| Thing | Shape |
|---|---|
| **The catalogue** | `src/data/talents.js` is the one source. The server holds its copy the way it holds the Tempering catalogue, generated and never typed twice |
| **The pure rules** | `src/core/talents.js`, dual-runtime, imported by the edge: points for a Level, a rank's value, validate an allocation, spend by a plan, the reset price, and allocation to modifier rows |
| **The state** | One row for each hero: points earned (raise-only), the allocation by track, the plan weights, the unlock switches, a version. Per-user RLS like every player table |
| **The read** | The allocation rides the projection the settle already reads for Tempering (`hr_perks_of`), so a hunt reads it with no new statement. The member reads `perks.talents` where it reads `perks.temper` |

### 9.2 Intents

Each is one `SECURITY DEFINER` RPC. The client sends only what is listed. It never sends a rank total, a point count, a price or a Level.

| Intent | Client sends | Server does | Refuses when |
|---|---|---|---|
| Spend | hero, track id, count | Checks the track against its catalogue and the count against free points. Raises the rank | Unknown track. Not enough points. Not the caller's hero. Panel not open yet |
| Set plan | hero, weights for each track | Stores the weights. Spends free points by the plan | A weight outside 0 to 3. Unknown track |
| Use suggested | hero, or all | Sets the plan from the catalogue's weights for the hero's way | |
| Copy | from hero, to hero | Sets the target's plan from the source's allocation. Spends free points. Never unspends | Heroes of different accounts |
| Switch an unlock | hero, unlock id, on or off | Stores the switch | The hero does not hold the unlock |
| Reset | hero | Computes the price from the server's Level and wage. Debits gold. Clears the allocation. Writes one ledger row | Not enough gold. The hero is hunting. Over the day's clamp |
| Arena build | hero, weights | Stores the arena allocation at the reference points. No gold | Later, with the arenas |

**Points arrive on the server.** When a settle raises a hero's highest Level across a multiple of five, the same write raises points earned. If the hero has a plan, the pure plan function spends the point in that write. No client is involved, so it works with the browser closed. New ranks count from the hero's next hunt start, so a running hunt's numbers never change under it.

### 9.3 Money and the ledger

Reset is the only place gold moves. It is a money surface: the price is computed on the server, the debit and the clear are one transaction, and `player_ledger` gets one row with the hero, the price, the Level and the allocation that was cleared. A free reset writes the same row at zero. A clamp of ten resets a hero a day stops churn. It goes inside the one Security review before Early Access with every other gold surface.

### 9.4 The self-check a migration must carry

1. The ranks of a hero never sum to more than its points earned.
2. Points earned equal `floor(highest Level / talentEvery)` and never fall, through a death that takes a Level.
3. A reset debits exactly the server's price and writes exactly one ledger row, or changes nothing.
4. An unknown track, a foreign hero and a negative count are each refused with no change.
5. Spending by a plan twice with no new point changes nothing.
6. A hunt settled with the browser open and the same hunt settled closed give the same result when a point arrives mid-hunt. Both paths, as section 4 of CLAUDE.md asks.
7. The chain replays with a byte-identical second apply.

### 9.5 Projection and the panel

- `hr_state_of` projects for each hero: points earned, points free, the allocation, the plan, the switches, the reset price in gold and whether the reset is free. Every number on the panel comes from that projection and is replaced by each envelope. The browser computes none of them. Nothing here is a residue field.
- One panel component, **Talents**, opened from the Character window. It is a window on desktop and a slide-out sheet on a phone, the same component.
- It is a list, never a graph. One row for each track: name, rank, what it pays now, what the next rank pays, the next unlock and how many ranks away it is, and one control to spend a point. Five rows in the sample, eight at most. Above the list: "Talent points: 2". Below it: Use suggested, Copy from, Plan, Reset with its price.
- Labels are standard words: Talents, Talent points, Rank, Spend, Plan, Use suggested, Copy from, Reset. No sentence sits on a control.
- A good mechanic that reads badly is the art director's to fix. This chapter does not lay the panel out.

### 9.6 Cost

ESTIMATED, not measured. No statement is added to a settle, because the allocation rides a read the settle already makes. Points earned are written inside a write that already happens, once every five Levels for a hero. Storage is one small row for each hero. The intents are rare: a few a week for an account. UNKNOWN until the backend lane confirms that the Tempering seam can carry it. If it cannot, this section is wrong and the cost must be measured against the budget of 15 cents an account a month (RULED 2026-11-21).

---

## 10. The new-player path

**When.** The panel opens at Level 10, not Level 5. PROPOSED.

Level 5 is the busiest minute of the first hour: the first ground ends and the other three heroes arrive (chapter 08). The critical review calls that hour the largest unplayed change in the book. It gets nothing added. Level 10 is about hunted hour 6 on the Level table, which is the first or second return visit. The player has four heroes, has seen a hunt report, and has a reason to ask how a hero gets better.

Opening with two points is deliberate. One point is a button. Two points are the lesson: both in one track, or one in each.

**How it is taught.** One coach card, fired by the first hero on the account to reach Level 10 in town or on the return card. It rings the real Talents control on the Character window. It teaches one thing: spend a point. A second card fires only after the first spend and rings Use suggested, with the option to apply it to the other three heroes in one press. Nothing else is taught until the first reset is possible.

Chapter 08 already puts the Burning Tower and the Hearth Chest at Level 10, one card each. The Path's rule is one lesson at a time. The integrator orders the three. My order: Talents on the first return after Level 10, the Tower after the first spend.

**What a player sees at the first point.** The panel with five rows. Force reads "Rank 0. Damage +0.0%. Next +0.9%. Unlock at Rank 3: Focus fire". Two points to spend. The honest weakness: +0.9% is not something a player feels in a hunt. The first thing they feel is an unlock, at Level 15 if they put three points in one track. That is about day 2. UNKNOWN whether that is soon enough. If the sample says it is not, the first unlock moves to rank 2, which is a data row.

**The walk-through.** Each step uses only what the steps before it give.

| Step | The player does | Needs | Holds from the steps before | Checked against | Doable |
|---|---|---|---|---|---|
| 1 | A hero reaches Level 5 | The first ground | The start kit | `hunt-grounds.js`: the Mill Cellar ends at Level 5. PLAYED twice at about minute 17 (chapter 08) | Yes. One point is earned and nothing is shown |
| 2 | A hero reaches Level 10 | Grounds for Levels 5 to 10 | Level 5, four heroes | The Thicket's band is 5 to 15 and the Sewer's is 5 to 25 (chapter 08 walk-through). Hour 6 on the Level table | Yes. Two points earned |
| 3 | The return card shows one line for Talent points | The return card | Two points on at least one hero | The away window exists in `shell-windows.js`. The line is new | New build |
| 4 | Opens the Character window and the Talents panel | The Character window | Step 3 | `shell-windows.js`, id `character`. The panel is new | New build |
| 5 | Spends one point in Force | Two free points | Step 2 | The Spend intent of 9.2 | New build. Needs no gold and no item |
| 6 | Spends the second point, or presses Use suggested | One free point | Step 5 | The suggested weights of 8.1 exist for all eight ways | New build |
| 7 | Applies suggested plans to the other three heroes | Three more heroes with points | Four heroes from the first hour (RULED 2026-11-21) | A hero under Level 10 gets its plan now and its points when it gets there | New build |
| 8 | Sends the four back out | One Start | The company plan | Chapter 08. The new ranks count from this hunt | Yes |
| 9 | At Level 15 a third point arrives while away and the plan spends it | A plan | Step 6 or 7 | Section 9.2, points arrive on the server | New build |
| 10 | Resets a hero for nothing | Highest Level under 30 | Any spent point | The Reset intent. "Not available while hunting" exists in `refusal-words.js` | New build |

No step needs an item, a monster or a screen that does not exist or is not named here as new. No step spends gold before Level 30.

---

## 11. Risks

| Risk | How it is handled | What would show it failed |
|---|---|---|
| **One best split that everyone copies** | Diminishing returns alone would cause this, so the unlocks pull the other way. Unlocks are seat rules whose worth depends on the party around the hero. TL4 on the matrix, the sameness test in play | Over 80% of heroes of one way on the same two top tracks. Then the system is cut, not tuned |
| **Power creep on top of gear** | The curve has a ceiling. The whole system is one gear band. It is baseline, so it sits under the monsters and not over them. TL1 to TL3 | Any build over 1.05 of suggested. P2 failing past Level 400 |
| **Choice paralysis on a phone** | A list of five rows, eight at most, one control each. Two points at the first screen. Use suggested. No graph | A new player who closes the panel without spending. Read in session replays |
| **A point that is not felt** | Named plainly in section 10. Unlocks carry the feel | Players banking points and never spending |
| **A chore times four heroes** | The plan spends points with no press. One line on the return card. Copy from | The return card's visit running over 4 minutes (standard X10) |
| **A trap for a new player** | Free resets under Level 30. Unlocks that move aggro can be switched off | Deaths that cluster after a first pick |
| **Resetting for every ground** | A price in hours of hunting, a day's clamp, and an edge of about 1% for doing it | Reset rows in the ledger above one a hero a week |
| **Payers buying an edge** | Points cannot be bought. A payer can afford more resets, which is flexibility and not power. That fits "real, not broken" (RULED 2026-11-21) | Nothing to watch beyond the reset count |
| **Cost to the server** | No new statement in a settle. Rare intents | The backend lane's measurement |
| **It is balanced on a tool that cannot read survival** | It is not final until the death fault is fixed. Footing, Grit and TL3 are survival numbers | The framework audit's list still open |
| **Scope** | The first build ships five tracks and the rank 3 unlocks, behind the Path row. Unlock ranks 8 and up wait for the sample | A request for tracks six to eight before the sample is played |

**Exploit review.** JUDGMENT, not a Security review.

- A forged client can send a track id and a count. The server checks both. No value from the browser reaches gold, another player or a ranking.
- Dying to lose a Level and gaining it again earns nothing, because points read the highest Level and only rise.
- A hero cannot be reset mid-hunt, so a build cannot be flipped for one boss room and flipped back inside a hunt.
- Banking points and spending them later gains nothing over spending them now.
- Neither arena pays gold, XP or drops, so an arena build cannot be farmed.
- Draw fire and Stand in move damage between heroes of one party. Neither can reach a monster's reward or another account.

---

## 12. What stays unknown, and what decides it

| Unknown | What decides it | It is settled when |
|---|---|---|
| Is it a build or a tax form | The sample of five, played in the playtest. Read the share of heroes of each way on the most common top two tracks, and whether anyone resets | Under 80% sameness in every way with at least 20 heroes. Over 80% cuts it |
| Is a rank felt | The same playtest, and banked points in the data | Fewer than one hero in five holds unspent points for a day with no plan |
| Every track ceiling, `talentHalf`, `talentPower` | The matrix, four stat lines, after the tool's three fixes | TL1 to TL3 green on two seeds of two hours |
| Every unlock size | The modifier table's "when" column (step R20), then one cell with the unlock in and out of its case, as GR-39 asks for perks | Each unlock reads 3 to 6% in its case |
| Does Footing make a plate hero tougher past Level 110 | Build B and the to-hit floor | The built hammer holds where the plain one does not, or it does not and the track is rethought |
| Does it make party preparation a decision | Only after Deadly is sized. Then the lineup cells with builds B and D | At least three different fours within 5% of the best on Deadly |
| The reset price in gold | The wage formula (R15) | A number exists and is checked against played gold |
| The rhythm past Level 300 | Nobody will reach it in a playtest | UNKNOWN for a long time. The Honors page and new unlock ranks with new regions are the fallbacks |
| The arenas | MM-41 | Heroes can fight heroes in the engine |

**What I did not check.**

- I did not run the matrix, the engine or a browser. Nothing in this chapter is MEASURED by me. Every MEASURED line quotes the book.
- I did not read `44-formula-architecture.md` or `itemization-plan.md` directly.
- I did not verify in code what sums on the permanent damage key, whether the Tempering projection can carry an allocation, or where the status tick lives.
- The sample's unlocks were not walked through the engine. All five need engine work and its cost is not estimated.
- I did not check the sample against the sixteen planned Necrotic and Storm spells or the fists, which are not live.

---

**After the balance pass.** `12-balance-pass.md` measured four stat lines and no unlock. The stat lines sit inside the power budget and cannot be felt away from a tier's edge. What settles the rest is unchanged: one unlock played in a cell.

## 13. For the integrator

I edited no other chapter and no decision file. I checked this list against the book as re-issued on `set/v0.2.144` at 660f265a8, which I merged into this lane.

**Already done by the re-issue. Nothing to change.** The index and the first build in `00-the-game.md` name level choices and this file. GR-61 reads SUPERSEDED in the decision files and in chapters 05 and 08. Still-missing item 11 of chapter 01 points here.

**Still needed.**

| Where | Change |
|---|---|
| `00-the-game.md`, section 1 | "which a design lane is writing" becomes a pointer to this chapter. The first build gains its scope from section 11 here: five tracks and the rank 3 unlocks. Unlock ranks 8 and up, tracks six to eight and the arena build go in the "what waits" table, until the sample is played |
| `decisions/all.json` and its files | Add one row for Talents with the status PROVISIONAL, this chapter as its source and section 12 as what it waits on. No number in it is decided. GR-64 is amended as below |
| `05-progression.md`, 2.1 and section 4 | The row "no stat points a Level" (GR-64) is reworded: a hero earns a talent point every five Levels, stored as rows, and no blow reads a Level. No prestige, no rebirth and no fourteenth skill stand |
| `05-progression.md`, 2.8 and 2.9 | The pointer "which a design lane is writing" is updated. The Inner Flame row still calls the skill "the home of its build", which it no longer is. Inner Flame keeps regen and its fuels. Its flat stretch past level 100 is OPEN again with no owner. GR-82's line "Inner Flame stays a skill and pays in Kindlings" loses its second half |
| `05-progression.md`, section 7 | The superseded row "Marks every five Levels into six tracks" now states the opposite of the ruling. It is removed or turned around |
| `05-progression.md`, 2.2 and 2.4 | The pace seat is "a mid-geared four on suggested builds". The three faster clocks of 2.4 gain a factor of at most 1.012 |
| `01-core-and-combat.md`, 2.1 | The modifier table gains no key. Add talent rows as sources on five existing keys: permanent damage, the Defense rating, `heroHp`, `heroMana` and the status tick. The to-hit floor owed by CORE-4 now also bounds Footing |
| `01-core-and-combat.md`, 2.13 | Add the six knobs of 5.4. Add the fences of 3.6 beside the combat fence |
| `03-items-and-crafting.md` | E7, the Add pool, does not read Talents. The 2% set aside for worn in and then for Kindlings is unspent. The purpose worn in had (two heroes with the same sword end up different, M12 of study 47) is owned by Talents. Check Tempering's Blows track against the 20% permanent damage cap with Force beside it |
| `04-economy-and-crowns.md` | One new gold sink: the talent reset, in hours of wage, with no gold number until R15 exists. It is not a Crowns surface. Premium gives nothing here. The store sells no points and no resets |
| `06-mmo-layer.md`, 2.2 and 2.6 | The power budget's reference row reads "a plain four in mid gear on suggested builds", and the ceiling reads about 1.67. MM-13 gains what each arena reads of Talents (section 7). The Even Arena's reference kit gains a points count |
| `08-player-experience.md` | The Path row that still lists Kindlings becomes Talents at Level 10, with its order against the Tower and the Hearth Chest. One line on the return card. Setups carry the plan and the unlock switches. The first hour is unchanged |
| `09-platform-and-measurement.md` | The knobs, bands TL1 to TL4, the build block of 8.3, one `proposals.json` row, and one cost row marked ESTIMATED. The census should count `src/core/talents.js` when it exists |
| A conflict to carry, not to solve here | Setups already have an OPEN question on priced slots (T-fix-3). This chapter adds no second build slot for a hero, priced or free, so it takes no side |

---

## 14. Source map

| Section | Rests on |
|---|---|
| 0, 1 | The ruling of 2026-11-21. 46 change 5. 56 section 4.1. 60 rows 7 and 8. The critical review, sections 2, 3.1 and 6 |
| 2 | 46, 56, 47 C10. Chapter 05, 2.1 and 2.9. GR-61, GR-64 |
| 3 | The first principle of 2026-10-18. 47 C10 and C19. Chapter 01, 2.1, 2.4 and 2.8. MM-25. CORE-4 |
| 4 | Chapter 01, 2.10. Chapter 03, the perk table. `abilities.js`, `jewelry.js`, `targeting.js`, `member.js` by search |
| 5 | Chapter 03, 2.2 and 2.8. Chapter 05, 2.2, 2.4 and 2.16. Chapter 06, 2.2. `knobs.json` |
| 6 | GR-3. The critical review, 3.1 and row 6 of section 7. Chapter 01, 2.10 |
| 7 | Chapter 06, 2.6. MM-13, MM-37, MM-38, MM-41 |
| 8 | The framework audit. `matrix-plan.mjs`, `standards.mjs`, `play-ground.mjs` |
| 9 | CLAUDE.md sections 1, 4 and 6. The stamina refill migration as the ledger pattern |
| 10 | Chapter 08, the first hour and the Path |
