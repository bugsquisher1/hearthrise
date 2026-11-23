# 17. Talents as a map: the Roads (v3)

The approved direction for Talents (Tyler, 2026-11-22: "I like it a lot"). v3 applies the review's ten changes (`18-roads-review.md`, all approved 2026-11-22) and the early ramp (Tyler, 2026-11-22: "It seems like the buffs are way too strong too early"). The whole-game budget it sits in is `19-power-ledger.md`. Only mechanics are taken from the genre's big talent trees. Every number is a starting value for the Balance Lab, not a measured one.

**The goal is build variety:** many real paths for each weapon, hybrids that are real builds, no single best build.

Sketch: `17-talent-tree-sketch.html` (v2 geometry). UX: `18-roads-ux-mock.html` (zoom tiers, route preview, node states).

---

## 0. What changed in v3

| # | Change (approved) | Where |
|---|---|---|
| R1 | Stat stones gone. 115 rank stones, down from 480 milestones. A real choice every 2 to 4 Levels | 2, 4, 13 |
| R2 | Vows sized in steps: +10 where they fit, −8 where they don't, at full size | 7, 9 |
| R3 | Balanced against the best saved build per ground. Vow costs always bite | 7, 9 |
| R4 | Borrowing priced by measured value. Borrowed heals share Mend's clock | 3 |
| R5 | Borders are a data list of 9 pairs, adding Destruction·Restoration and Sword·Shield | 6 |
| R6 | The Hearth is the fist generalist's home | 3 |
| R7 | No dead nodes: low-health nodes keyed to the fall-back line, block nodes held, cooldown cuts off full lanes, solo Shield gets nodes | 5, 9 |
| R8 | Second vow at Level 50. "Spend as suggested" never takes a vow | 2 |
| R9 | The report shows healing by source, damage taken by seat, supplies by depth | 10 |
| R10 | Free re-spend when content arrives. A Milepost every 50 Levels past 200 | 2 |
| Ramp | Every talent number grows with Level, full at Level 200. Borrowing opens by value | 2, 3, 9 |

## 1. The shape

**The window is called Talents.** It shows **the Roads**: a map of the country around Havora, with the Great Hearth in the middle of town and roads leading out of it.

- **The Great Hearth is the start.** Every hero owns it for free. It holds Mend's road and the Havora crossing. The Hearth, the support's country, sits beside it (`22-fists-support.md`, 2026-11-22).
- **Seven countries, one per weapon** (the seven `DISCIPLINES` in `src/data/abilities.js`). Where they sit is art. Which countries touch is a data list (section 6), so a new country adds borders and never cuts one.
- **Shared moves sit where their weapons meet.** Turning Cut lives in Club. Flame Strike and Power Strike live in Sword. A Shield hero reaches them through Havora.

| Node | Looks like | What it is | Costs |
|---|---|---|---|
| Rank stone | Small square stone | +1 rank of the move whose road it's on | 1 point |
| Crossroads | Diamond, 3 options | Pick 1 of 3 | 1 point |
| Waystone | Ringed dot off the road | A small rule | 1 point |
| Border town | Gabled house on a border road | Use one move from the other country with any weapon | 1 point |
| Hybrid crossroads | Diamond with an inner diamond | Pick 1 of 3 that combine two countries. Needs a crossroads in each | 1 point |
| Vow | Steel menhir | A rule with a cost. Takes a vow slot | 1 point |
| Open road | Three dots | +1 rank of that move per point, forever | 1 point each |
| Final form | Diamond at the end of a road | Level 200. Pick 1 of 3 on one move | 1 point |
| Milepost | Stone with a number | Level 250, 300, 350 and on. Pick 1 of 3 from the latest release | 1 point |

## 2. How it plays

- **1 point every Level,** from Level 2. Spend it on any node that touches one you own.
- **A move's road:** 3 rank stones, crossroads I, 2 rank stones, crossroads II, then the open road. A waystone sits off the road after each crossroads. The next move's road leaves at crossroads I.
- **Borders:** a border road leaves a country's first move road. Town, then hybrid crossroads, then hybrid vow. No stones on it.
- **Vow slots:** 1 at Level 30, 2 at Level 50, 3 at Level 200. A vow sits beside its country's first crossroads.
- **"Spend as suggested" never takes a vow.** It walks past it, and the vow goes on the return card as one of the three choices. It reads the hero's plan: party or solo, front or back row, and the worn Signature.
- **Numbers grow with Level.** Every number on a talent node is shown at full size in this doc. A hero gets `ramp(L) = min(1, L / 200)` of it (`19-power-ledger.md` section 2). The card shows the hero's own number. Rules (who it hits, what it unlocks, what it costs to use) are whole from the start.
- **Level 200 is the day your build is at full size.** It opens the third vow slot and one final form.
- **Past 200:** a Milepost every 50 Levels. Pick 1 of 3: a new waystone or a third crossroads on a move you slot, from the latest release.
- **When content arrives:** a release that adds nodes gives every hero one free reset, good until the next release. A full map is never a reason to skip new content.
- **The rest is from 1b:** drafts are free, applying a draft costs gold by Level, saved builds can be set per ground, a death takes your last spends first.

## 3. Breaking the weapon lock

**Border towns** let a hero use one move from the other country with any weapon. **The Havora crossing** offers any move from any country, one price band harsher. **Max 2 borrowed moves**, counting the crossing.

**Priced by value** (measured in `18-roads-review-measured.md` section 3). V0 is what the move adds at full power, in held steps (an offense move: its pace gain ÷ 0.7%):

| V0 at full power | Border town | Havora crossing |
|---|---|---|
| 4 steps or less | No penalty | −30% |
| 4 to 10 | −30% | −50% |
| 10 to 20 | −50% | Not offered |
| Over 20 | Change what drives its value, then measure again | Not offered |

**Borrowing opens by value.** A borrow opens at `max(20, 200 × V ÷ 14)` Levels, rounded up to a 10. V is its value after the penalty. So a borrow is never bigger than the build slice allows at that Level (`19-power-ledger.md` section 2).

**Rules for a borrowed move:**

| Rule | Ruling |
|---|---|
| Whose blow it reads | The native weapon's reference blow at the hero's Level, never the holder's. A club is never the best healer |
| Heals (the heal rule) | **A borrowed heal shares one clock with Mend:** one cooldown of 6 s for both, and casting either starts it. Chosen over Magic scaling because the measured value is in the cast count (a borrowed Greater Mend at 20% power still added 15.7 steps on 800 casts an hour) |
| Reach | The native move's reach (Greater Mend: 7 tiles) |
| Training | Trains the skill its row names. Spells pay Magic at Mend's rate (`magicXpMult` 250), never the native row's |
| Taunts | A borrowed Challenge taunts from any seat, its hold × its power |
| Supplies | Uses its own rune or arrows |
| Native moves | A borrowed move uses whatever you own on its own road |

**Measured and starting values:**

| Move | V0 (measured) | Band | Opens at |
|---|---|---|---|
| Hunter's Mark | about 2 (pace) | No penalty | 30 |
| Frost Lance | about 4 (pace) | No penalty | 60 |
| Fireball | about 8 (pace) | −50% (−30% measured just over the cap) | 80 |
| Shelter | 8.5 ± 4.2 (doesn't follow its power) | −30% | 90 at a border, 70 at Havora (the formula: 200 × 5.95 ÷ 14 = 85, up to 90. Ruled 2026-11-23, `29-tuning-pass.md`: the formula, not the hand 120) |
| Challenge | 0 ± 3.7. Re-measure after the holder line (on the tank's own bar it cost 62.7 held, `23` section 3) | No penalty | 20 |
| Hoarfrost | 15.8 ± 2.4 (`23`, held lost without it) | −50% at a border. Not offered at Havora | 120 |
| Protective Ward | 16.1 ± 3.9 (`23`, held lost without it) | −50% at a border. Not offered at Havora | 120 |
| Power Strike | 4.2 (pace, `18` section 7) | −30% | 50 at a border, 30 at Havora |
| Flame Strike | 6.3 (pace) | −30% | 70 at a border, 50 at Havora |
| Rend | 7.1 (pace) | −30% | 80 at a border, 60 at Havora |
| Circle of Renewal | 7.1 ± 2.0 (held) | −30% | 80 at a border, 60 at Havora |
| Turning Cut | 11.0 (pace, ± 1.4) | −50% at a border. Not offered at Havora | 80 |
| Raking Shot | 0 (nothing measurable off a bow) | No penalty | 20 |
| Greater Mend | 97.4 ± 3.9 before the heal rule (`18` section 7: a sword in a four with no healer, 7-tile reach). Re-measure after its re-size (`healPm` 2540) | Re-measure under the heal rule. Target: 10 or less | 150 at V 10, 80 at V 5 |
| Every other borrowable move | Not measured | Lab | Lab |

**The Hearth, the support's country** (2026-11-22, replaces the generalist). The wraps are the party's support, not an all-rounder. They borrow like every weapon: 2 slots, the standard bands. Country, kit, borders and balance rule: `22-fists-support.md`.

## 4. Node counts

Per move: 5 rank stones, 2 crossroads, 2 waystones. Dual Axe has 2 extra waystones. Each country has 4 vows. Each border: town, hybrid crossroads, hybrid vow.

| Country | Moves | Rank stones | Crossroads | Waystones | Vows | Points to own all |
|---|---|---|---|---|---|---|
| The Hearth | Mend, Havora crossing | 5 | 2 | 2 | 0 | 10 |
| Shield | 3 | 15 | 6 | 6 | 4 | 31 |
| Sword | 3 (Parry in wave 3) | 15 | 6 | 6 | 4 | 31 |
| Club | 2 (Stagger, Turning Cut) | 10 | 4 | 4 | 4 | 22 |
| Dual Axe | 2 (Gash in wave 3) | 10 | 4 | 6 | 4 | 24 |
| Ranged | 4 | 20 | 8 | 8 | 4 | 40 |
| Destruction | 4 | 20 | 8 | 8 | 4 | 40 |
| Restoration | 5 (Undertow cut) | 25 | 10 | 10 | 4 | 49 |
| 9 borders | 9 towns | 0 | 9 hybrid | 0 | 9 hybrid | 27 |
| **Total** | **24** | **120** | **57** | **50** | **37** | **274** |

Plus 24 open roads, 24 final forms (a hero takes one) and the Mileposts. Parry's and Gash's roads (9 + 9 points) count once their rows exist. Until then the total is 256.

- 120 rank stones against 480 milestones in v2 (25%). 154 of 274 nodes are choices (56%, up from 24%).
- A pure healer owns Restoration and Mend by about Level 60, then spends into neighbors and open roads.
- The map is full at about Level 275. From then the choices are which move gets the rank, and the Mileposts.

## 5. Four countries laid out

Tooltip labels only. Numbers are full size (Level 200). "Near fall-back" means a hero's health is within 15 points of the stance's fall-back line (Careful 60%, Steady 40%, Bold 27%). The hero holding the Challenge has a lower line (Steady 15%, Careful 27%, `23` section 3), so its near fall-back is Steady 30%, Careful 42%. Crossroads options sit within 3 steps of each other on any ground.

### Shield

| Road | Node | Tooltip |
|---|---|---|
| **Challenge** (known from Level 1. Suggested condition: my HP is at least 60%) | Rank stone x3 | +1 Challenge rank |
| | Crossroads I | **Long Hold** (Suggested, party): Taunt holds 12 s (from 8 s) · +4 s cooldown · **Hard Challenge** (Suggested, solo): Taunted enemy: −6% damage to you · Casts when solo · **Guarding Challenge**: Casts when an enemy attacks a back-row ally · Party only |
| | Waystone | **Challenge range +1 tile** |
| | Rank stone x2 | +1 Challenge rank |
| | Crossroads II | **Drawing Challenge**: Taunted Stalkers stay for the full taunt · **Mended** (Suggested): +6% healing received while you hold a taunt · **Echoing Challenge**: Recasts when a taunt ends early · +4 s cooldown |
| | Waystone | **Challenge: −2% damage taken for 4 s** |
| **Frost Slam** (Melee 12, party only. Re-measured after the holder line: under +4 steps, it becomes the Challenge option Cold Challenge and this road goes) | Rank stone x3 | +1 Frost Slam rank |
| | Crossroads I | **Long Frost** (Suggested): Chill 6 s (from 4 s) · +2 s cooldown · **Pinning Frost**: Target only · +50% Chill · **Slowing Frost**: Chill slows wind-ups 2× · −50% Chill on attacks (dead where nothing winds up) |
| | Waystone | **Frost Slam usable solo · −30% Chill** |
| | Rank stone x2 | +1 Frost Slam rank |
| | Crossroads II | **Cold Ground** (Suggested): Frozen ground 4 s · Chills enemies on it · **Quick Slam**: −3 s cooldown · −20% damage · **Wide Slam**: +1 tile radius · −15% damage |
| | Waystone | **Frost Slam radius +1 tile** |
| **Shelter** (Melee 20, party only. Suggested condition: the party has at least 2 heroes under 80%) | Rank stone x3 | +1 Shelter rank |
| | Crossroads I | **Steady Shelter** (Suggested): −40% shield · −15 s cooldown · **Deep Shelter**: 2 lowest-health allies only · +80% shield · **Stone Wall**: +100% shield on you · −30% on allies |
| | Waystone | **Shelter −5 s cooldown** |
| | Rank stone x2 | +1 Shelter rank |
| | Crossroads II | **Ready Shelter**: Casts when an ally is near fall-back · +10 s cooldown · **Strong Shelter** (Suggested): +20% shield (was Long Shelter, +4 s: a shell has no duration, ruled 2026-11-23 in `29-tuning-pass.md`) · **Bright Shelter**: +6% healing received while shielded |
| | Waystone | **Shelter: +10% shield on allies near fall-back** |

Solo: Hard Challenge, the Frost Slam waystone and Last Stand (section 7) give a lone Shield hero three live nodes. Answering and Riposte come back on Parry's road (Sword, below).

### Restoration

| Road | Node | Tooltip |
|---|---|---|
| **Greater Mend** (its node numbers follow the Lab re-size, `healPm` 2540) | Crossroads I | **Light Mending**: −40% mana · −25% healing · **Deep Mending**: +40% healing on allies near fall-back · **Split Mending** (Suggested): 30% of the heal also lands on the next lowest-health ally |
| | Crossroads II | **Thrifty Mending** (Suggested): 50% mana back on allies near fall-back · **Lingering Mending**: 25% of the heal again over 4 s · **Reaching Mending**: +3 tiles range |
| | Waystones | **Greater Mend range +1 tile** / **Greater Mend −2 mana** |
| **Circle of Renewal** | Crossroads I | **Lasting Circle** (Suggested): Heals over 6 s · +30% healing · **Tight Circle**: Allies within 3 tiles only · +40% healing · **Light Circle**: −40% mana · −25% healing |
| | Crossroads II | **Rallying Circle**: +30% healing on allies near fall-back · **Mana Circle** (Suggested): +2% mana to each ally healed · **Front Circle**: +15% healing on the front row · −15% on the back row |
| | Waystones | **Circle −5 mana** / **Circle: +5% healing on the front row** |
| **Spring Tide** (Magic 20) | Crossroads I | **Ebb Tide**: −50% healing, cooldown and mana · **High Tide** (Suggested): Healing past full health stays as a shield · **Turning Tide**: +50% healing on allies near fall-back · −25% on the rest |
| | Crossroads II | **Rising Tide** (Suggested): −15 s cooldown · **Clearing Tide**: Removes 1 harmful effect from each ally healed · **Deep Tide**: +30% healing · +20 s cooldown |
| | Waystones | **Spring Tide: +2% mana to you** / **Spring Tide −10 s cooldown** |
| **Green Sickness** (double damage while alone, the alone rule) | Crossroads I | **Lingering Sickness** (Suggested): Sickness 10 s (from 6 s) · −30% damage · **Single Dose**: Target only · Sickness 20% (from 10%) · **Draining Sickness**: Heals the lowest-health ally for 20% of damage dealt |
| | Crossroads II | **Weakening Sickness** (Suggested): Sick enemies: −6% damage dealt · **Wide Sickness**: Also hits enemies next to the target · −20% damage · **Fast Sickness**: −3 s cooldown · −20% damage |
| | Waystones | **Sickness +1 s** / **Green Sickness −2 mana** |
| **Protective Ward** | Crossroads I | **Tank Ward** (Suggested): +40% shield · Ally with the most enemies on them only · **Twin Ward**: Shields 2 allies · −40% shield each · **Lasting Ward**: Unused shield returns as mana on recast · −20% shield |
| | Crossroads II | **Quick Ward** (Suggested): −30% cooldown · −20% shield · **Mending Ward**: +6% healing received while the ward holds · **Deep Ward**: +30% shield · +6 s cooldown |
| | Waystones | **Protective Ward +5% shield** (was Ward +1 s, ruled 2026-11-23) / **Ward: +10% shield on your tank** |
| (each move) | Rank stones | 3 before crossroads I, 2 before II. +1 rank of that move |

Wide Circle and Fast Circle are cut: Circle's 8-tile radius already covers the party, and the heal lane runs about 77% full. Undertow's road is cut with the move (`23` section 4): it cast only alone, and a company joins at Level 5.

### Club

| Road | Node | Tooltip |
|---|---|---|
| **Stagger** (wave 3, replaces Quarry Blow. Ends the target's wind-up) | Crossroads I | **Long Stagger** (Suggested): Next swing pushed back 2 s (from 1 s) · **Shaken**: A wind-up it ends: target −10% damage for 4 s · **Wide Stagger**: Also ends wind-ups next to the target · −30% damage |
| | Crossroads II | **Heavy Stagger** (Suggested): +30% damage · +3 s cooldown · **Laid Open**: A wind-up it ends: next ally hit on the target +20% · **Sure Blow**: A wind-up it ends: 50% of its mana back |
| | Waystones | **Stagger −2 mana** / **Stagger: −5% enemy armor for 4 s** (Armor Break key) |
| **Turning Cut** (Melee 10) | Crossroads I | **Wide Turn** (Suggested): Hits up to 2 tiles away · −25% damage · **Close Turn**: +40% damage · 3 targets max · **Heavy Turn**: +30% damage · +2 s cooldown |
| | Crossroads II | **Mending Turn** (Suggested): +1% health per enemy hit · max 5% · **Guarded Turn**: −2% damage taken per enemy hit for 3 s · max 6% · **Reaping Turn**: +20% damage vs targets below 30% health |
| | Waystones | **Turning Cut +1 max target** / **Turning Cut −2 mana** |

The club's offense lane runs 78% full with Stagger, so it has no cooldown cuts. Fast Turn and the −1 s waystones are cut. Stagger's road is written now so its rows are ready, but it opens with blow wind-ups in wave 3. Until then the club has one road of its own.

### Dual Axe

| Road | Node | Tooltip |
|---|---|---|
| **Rend** | Crossroads I | **Deep Cuts** (Suggested): Bleed lasts 50% longer · **Spread**: Bleed jumps to 1 nearby enemy when the target dies · **Quick Rend**: −30% cooldown · −20% Bleed damage |
| | Crossroads II | **Deep Wounds** (Suggested): +20% damage vs 5+ Bleed stacks · **Fast Bleed**: Bleed ticks 20% faster · **Fresh Cuts**: Rend hits refresh all Bleed stacks |
| | Waystones (4) | **Bleed stack cap +1** / **Bleed ticks 10% faster** / **First hit on a new target: +1 Bleed stack** / **Kills on bleeding enemies: +2% health** |
| **Gash** (wave 3. Every monster beside you: a light hit and 1 Bleed stack) | Crossroads I, II, waystones | Written in R-X1 with its row |

The axe's offense lane runs about 58% full, so Quick Rend stays. It is the axe's one "faster" option. With Gash the lane runs 83%.

### Sword: Parry (wave 3)

Parry: support lane, 10 s, your target's next blow within 2 s lands 0. Suggested condition: my target is winding up a blow. It needs blow wind-ups, so it opens in wave 3.

| Road | Node | Tooltip |
|---|---|---|
| **Parry** | Crossroads I | **Riposte** (Suggested): A blow you Parry: your next hit on that monster +30% · **Answering**: A blow you Parry: Power Strike ready again · **Long Parry**: Catches a blow within 3 s (from 2 s) |
| | Crossroads II, waystones | Written in R-X1 |

**Sword, Ranged and Destruction** take their crossroads from `16-talent-branches.md`, with these v3 changes: Quick Strike becomes **Cheap Strike** (−40% mana · −20% damage), since sword and club lanes are full. Finishing Strike, Opening Strike, Aimed Shot, Clean Sweep, Reaping Turn, Deep Wounds, Spell Mark and Tempered Strikes work as passives now and become bar conditions when the four bar metrics land (section 11).

**Bleed cap:** 5, then 6 with the waystone or Signature #29, 7 with both. Open Wounds sets 10, and nothing adds to it.

## 6. Borders (a data list)

Nine rows. A new country adds rows and never cuts one.

| Border | Town (pick 1) | Hybrid crossroads (pick 1 of 3) | Hybrid vow |
|---|---|---|---|
| **Club · Dual Axe** | Use Rend with any weapon / Use Stagger with any weapon | **Crushing Cuts**: Rend: 2 Bleed stacks on enemies with Armor Break · **Torn Armor**: Bleeding enemies: −10% armor · **Heavy Bleed**: Stagger +5% damage per Bleed stack | **Butcher**: Bleed kills: Stagger ready again · +10% Rend mana cost |
| **Dual Axe · Ranged** | Use Rend with any weapon / Use Raking Shot with any weapon · Uses arrows | **Barbed Arrows**: Precision Shot: 1 Bleed stack · **Marked Wounds**: Bleed ticks 20% faster on marked enemies · **Open Shot**: Precision Shot +3% damage per Bleed stack | **Blood Trail**: Ranged attacks: 1 Bleed stack · −3% ranged damage |
| **Ranged · Destruction** | Use Hunter's Mark with any weapon / Use Frost Lance with any weapon | **Frost Arrows**: Precision Shot: Chill 2 s · −15% damage · **Spell Mark**: Fireball +15% damage vs marked enemies · **Mana Arrows**: Precision Shot +20% damage · +6 mana | **Spellbow**: Ranged attacks deal frost damage · +3 mana per ranged attack |
| **Destruction · Shield** | Use Hoarfrost with any weapon / Use Challenge with any weapon | **Cold Shoulder**: Taunted enemies: +15% frost damage taken · **Frost Shelter**: Shelter: Chill attackers of shielded allies 2 s · **Rime Plate**: −1% damage taken per Chilled enemy within 2 tiles · max 6% | **Winter Guard**: Chilled enemies: −6% damage to allies within 3 tiles · −3% damage dealt |
| **Shield · Restoration** | Use Greater Mend with any weapon / Use Shelter with any weapon | **Healing Shelter**: Shelter heals 50% of the shield · **Guarded Mend**: +20% Greater Mend on taunting allies · **Taunting Guard**: Challenge: shield of 2% max health per enemy taunted | **Shield Priest**: Challenge cast: heal yourself 3% max health · −3% healing on others |
| **Restoration · Sword** | Use Circle of Renewal with any weapon / Use Flame Strike with any weapon | **Mending Strike**: Flame Strike heals the lowest-health ally for 25% of damage dealt · **Mana Strike**: Power Strike hits: +2% mana · **Second Strike**: After a heal: next Flame Strike +20% damage | **Mending Blade**: 10% of melee damage heals the lowest-health ally · −3% spell healing |
| **Sword · Club** | Use Flame Strike with any weapon / Use Stagger with any weapon | **Tempered Strikes**: Power Strike on a target Stagger just stopped: +25% damage · **Cutting Weight**: Turning Cut +15% damage vs Sick enemies · **Iron Rhythm**: Turning Cut hits: +1 mana | **Smith's Arm**: Stagger ends a wind-up: next Power Strike +40% · Power Strike +2 s cooldown |
| **Destruction · Restoration** (new) | Use Frost Lance with any weapon / Use Greater Mend with any weapon | **Cold Mercy**: Frost Lance heals the lowest-health ally for 20% of damage dealt · **Sick Fire**: Fireball +15% damage vs Sick enemies · **Still Water**: Hoarfrost: allies in the area +6% healing received | **Hedge Healer**: Wand: borrowed Greater Mend at full power · −3% spell damage |
| **Sword · Shield** (new) | Use Turning Cut with any weapon / Use Challenge with any weapon | **Guard Cut**: Turning Cut hits: −2% damage taken for 3 s · **Pressing Guard**: Challenge: next Power Strike +20% damage · **Second Front**: Challenge taunts only enemies on allies · Party only | **Off Tank**: Sword alone: taunted enemy −6% damage to you · −3% damage dealt |

Every hybrid vow also reads: Requires a crossroads in both countries.

**Not on the list,** so only through Havora: Ranged·Restoration, Ranged·Shield, Ranged·Sword, Ranged·Club, Destruction·Sword, Destruction·Club, Destruction·Dual Axe, Restoration·Club, Restoration·Dual Axe, Shield·Club, Shield·Dual Axe, Sword·Dual Axe.

## 7. Vows

**Shape:** a gain on a condition and a cost that always bites, wherever it's worn. A cost never cuts max health (the Stalker rule in `src/data/monster-roles.js`). Full size: +18 steps on its condition, −8 always. So +10 on its best cell, −8 on its worst, about 0 across the mix. Every vow also reads "Requires Level 30" and its weapon.

| Vow | Country | Tooltip | Best on | Weak on |
|---|---|---|---|---|
| **Hold Fast** | Shield | Enemies on you can't switch targets · −3% damage dealt | Stalkers, Shooters | Solo |
| **Bodyguard** | Shield | Take 30% of damage dealt to back-row allies within 2 tiles · −3% damage dealt · Party only | Casters, Stalkers | Brutes |
| **Cold Iron** | Shield | Hit in melee: Chill the attacker 2 s · −3% damage dealt | Brutes, Swarms | Shooters, Casters |
| **Last Stand** | Shield | Near fall-back: −20% damage taken for 4 s · 30 s cooldown · −3% damage dealt | Solo, bosses, Bold | Swarms |
| **Watchful Healing** | Restoration | Enemy winding up: +20% healing · −3% healing | Casters | Brutes, and every ground with no wind-ups (Muster Barrows, Hask's Ford until C2) |
| **Still Mind** | Restoration | 3 s without casting: +50% mana regen · +10% spell mana cost | Brutes, few big pulls | Swarms, Casters |
| **Battle Healer** | Restoration | Green Sickness +20% damage · −3% healing | Parties that need damage | Deadly grounds |
| **Lifeline** | Restoration | Ally near fall-back: next heal instant, no mana · 10 s per ally · −3% healing | Bold, big single hits | Swarms |
| **Crushing Blows** | Club | Brutes: attacks ignore 20% armor · −3% damage dealt | Brutes | Swarms, Casters |
| **Aftershock** | Club | Stagger also hits monsters beside the target · −3% damage dealt | Casters, tight packs | Stalkers |
| **Lingering Blows** | Club | Hits refresh Sickness · −3% damage dealt | Bosses, Brutes | Swarms |
| **Braced** | Club | All your attacks on cooldown: −6% damage taken · +10% mana cost | Solo melee | Parties with a tank |
| **Open Wounds** | Dual Axe | Bleed stacks up to 10 · −3% damage dealt | Bosses, Brutes | Swarms |
| **Frenzy** | Dual Axe | −3% cooldowns per bleeding enemy within 3 tiles · max 15% · +3% damage taken | Swarms | Bosses |
| **Bleed Out** | Dual Axe | Bleeding enemies below 15% health die · −3% damage dealt | Brutes, bosses | Swarms |
| **Clean Cuts** | Dual Axe | Bleed deals all its damage at once · Bleed can't stack | Swarms | Bosses |
| **Single Combat** | Sword | Brutes and bosses: +6.5% damage · −3% damage dealt | Brutes, bosses | Swarms |
| **Duelist's Guard** | Sword | −6% damage taken from your target · +3% damage taken | Solo, bosses | Swarms |
| **Pressing Attack** | Sword | +1% damage per hit on the same target · max 6.5% · New target: reset · +3% damage taken | Bosses | Swarms |
| **Flowing Cuts** | Sword | A different move than last: +6.5% damage · Same move twice: −3% | Long fights, full bar | Short pulls |
| **Long Range** | Ranged | +2 attack range · +3% damage taken | Shooters, parties with a tank | Solo vs Stalkers |
| **Marked Prey** | Ranged | Hunter's Mark lasts until the target dies · −3% damage dealt | Bosses, Brutes | Swarms |
| **Point Blank** | Ranged | Enemies within 2 tiles: +6.5% damage · +3% damage taken | Solo, Stalkers | Shooters |
| **Hail of Arrows** | Ranged | Attacks hit 1 extra enemy · −3% damage per hit | Swarms | Bosses |
| **Cold Focus** | Destruction | +20% frost spell damage · +2 s Chill · Can't cast fire spells | Casters | Swarms |
| **Fire Focus** | Destruction | +20% fire spell damage · Fireball +1 tile radius · Can't cast frost spells | Swarms | Casters |
| **Barrier Mage** | Destruction | Arcane Barrier recasts when it breaks · 20 s cooldown · −3% spell damage | Stalkers, solo | Parties with a tank |
| **Heavy Casting** | Destruction | +20% spell damage · +50% cooldowns | Bosses, Brutes | Swarms |

Plus the 9 hybrid vows in section 6. Percent conversions: 18 steps on all damage is +6.5%, on one move about +20%. 8 steps is −3% damage dealt or +3% damage taken.

**Cut or held from v2:** Riposte (back as a Parry option, wave 3). Unbroken (a lethal hit never comes on Steady, replaced by Last Stand). Fast Renewal, Ground Breaker, Front Line, Twin Rend, Echo Cast, Volley Stance (repeats, short-hunt picks or cooldown cuts on full lanes).

**Stacking.** Every vow is a rule row on a key from `15-signature-candidates.md`. Winter Guard and Weakening Sickness share "monster deals less damage": the largest counts. Cold Focus and Fire Focus can't both be held.

## 8. Builds: the map, Traits and Signatures together

A build has four layers: the map (crossroads, waystones, borrowed moves, vows, final form), Traits (`14-trait-candidates.md`), one Signature (`15-signature-candidates.md`) and the bar. A strong build makes all four point the same way. Each layer has its own slice of the ledger (`19-power-ledger.md`), so a strong build is a fit, not a pile.

| Build | Weapon and countries | Key nodes | Vows | Traits | Signature |
|---|---|---|---|---|---|
| **Bleed Axe** | Axes. Club border | Rend: Deep Cuts, Deep Wounds. Gash (wave 3). Waystone: Bleed stack cap +1 | Open Wounds, Bleed Out | #4 Worrier, #21 Scorched Grip, #30 Lime Pit | #7 Floodwater Hatchets |
| **Frost Lock Mage** | Wand | Hoarfrost: Deep Hoarfrost. Frost Lance: Shatter. Arcane Barrier: Thick Barrier | Cold Focus, Still Mind | #5 Snuffed, #18 Floodmark, #16 Full Wick | #15 Catacomb Shroud |
| **Shield-Heal** | Staff. Shield border | Greater Mend: Split Mending. Protective Ward: Twin Ward. Town: Use Shelter with any weapon | Lifeline, Still Mind | #23 Behind the Bar, #29 Crag Shelter, #6 Last File | #36 Cairn Belt |
| **Mark Sniper** | Bow | Hunter's Mark: Long Mark. Precision Shot: Aimed Shot | Long Range, Marked Prey | #22 Slate Hand, #34 Lookout's Promise, #2 Soft Scale | #9 Lurcher's Collar |
| **Armor Breaker** | Club. Sword country for Power Strike | Stagger: Shaken, Heavy Stagger. Waystone: −5% enemy armor. Power Strike: Heavy Strike. Sickness from a healer's Green Sickness | Crushing Blows, Aftershock | #3 Ram's Head, #37 Hask's Bargain, #27 Captain's Due | #8 Stable Troll's Maul |
| **Battle Priest** | Sword. Restoration border | Flame Strike: Finishing Strike. Power Strike: Guard Strike. Town: Use Circle of Renewal. Hybrid: Mending Strike | Mending Blade, Pressing Attack | #14 Goaded, #11 Pyre Tender, #39 Bolting Team | #18 Brewer's Apron |
| **Frost Warden** | Sword and shield. Destruction border | Challenge: Hard Challenge. Frost Slam: Long Frost. Town: Use Hoarfrost. Hybrid: Rime Plate | Winter Guard, Cold Iron | #25 Numbed, #7 Bailey Stand, #5 Snuffed | #42 Night Carter's Boots |
| **Bleed Ranger** | Bow. Dual Axe border | Raking Shot: Clean Sweep. Precision Shot: Piercing Shot. Hybrid: Open Shot | Blood Trail, Long Range | #4 Worrier, #19 Ledge Footing, #2 Soft Scale | #12 Wyvern Barb Crossbow |
| **Spellbow** | Bow. Destruction border | Hunter's Mark: Long Mark. Town: Use Frost Lance. Hybrid: Frost Arrows | Spellbow, Marked Prey | #16 Full Wick, #22 Slate Hand, #13 Slack Water | #11 Provost's Longbow |
| **Crush and Bleed** | Club. Dual Axe border | Stagger: Long Stagger. Town: Use Rend. Hybrid: Heavy Bleed | Butcher, Lingering Blows | #4 Worrier, #30 Lime Pit, #3 Ram's Head | #43 Bull's Tooth |
| **Hedge Healer** (new) | Wand and staff. Destruction · Restoration | Frost Lance: Chilling Lance. Town: Use Greater Mend. Hybrid: Cold Mercy | Hedge Healer, Cold Focus | #5 Snuffed, #16 Full Wick | none yet |
| **Lone Wall** (new, solo) | Sword and shield | Challenge: Hard Challenge. Waystone: Frost Slam usable solo. Shelter: Stone Wall | Last Stand, Hold Fast | #7 Bailey Stand, #25 Numbed | #3 Grave Guard's Mail |

| Build | Swarms | Brutes | Casters, Shooters | Bosses | Solo | Party of 4 | Bold |
|---|---|---|---|---|---|---|---|
| Bleed Axe | Weak | Good | OK | **Best** | Good | OK | OK |
| Frost Lock Mage | Weak | OK | **Best** | Good | OK | Good | Good |
| Shield-Heal | OK | Good | OK | OK | **Best** (duo) | Weak | OK |
| Mark Sniper | Weak | OK | Good | **Best** | Weak | Good | OK |
| Armor Breaker | Weak | **Best** | Weak | Good | OK | OK | Good |
| Battle Priest | OK | Good | Weak | OK | Good | **Best** (no healer) | OK |
| Frost Warden | Good | Good | **Best** | OK | OK | Good | Weak |
| Bleed Ranger | Weak | **Best** | OK | Good | Good | OK | OK |
| Spellbow | OK | Good | Good | Good | Weak | OK | **Best** |
| Crush and Bleed | OK | Good | Weak | **Best** | OK | Good | OK |
| Hedge Healer | Good | OK | Good | Weak | Good | **Best** (no tank) | OK |
| Lone Wall | Good | Good | OK | Good | **Best** | Weak | Good |

Design intent (JUDGMENT). The library test (section 9) holds them.

## 9. The balance rule

One step is one Level of rating. At `payStepXp` 0.7%, a step held is about 0.7% pace. Full sizes below. A hero gets `ramp(L)` of every talent number.

| Node | Size | Why |
|---|---|---|
| Rank stone | `pointShare`, a third of a Level's step | On the curve, not above it |
| Crossroads, hybrid crossroads, final form | Best and worst option at most 3 steps apart on any ground | Options differ by what they're good against |
| Waystone | At most 3 steps on its best cell | A small rule that can tip a build |
| Vow | +18 on its condition, −8 always: +10 best, −8 worst, about 0 across the mix | A trade you feel, never a free upgrade |
| Border town | Priced by value (section 3). Never more than a vow | A hybrid gains reach, not the native's job |
| Milepost | Same as a crossroads | New choice, not new power |

**The build slice.** Every talent step on a hero at one moment (crossroads, waystones, vows, borrows, final form), gains minus costs, is clamped at `buildStepsMax` 14 × `ramp(L)`. 14 steps is 10% pace, the top of the 5 to 10% ceiling. Costs are never clamped. So two vows on one condition reach the cap, and a third vow buys coverage (another condition), not size.

**The ceiling, per ground (R3).** The best saved build the Lab can find for a ground beats the suggested path by at most 5 to 10% pace (7 to 14 steps) on that ground, with the same Level, kit, Traits and Signature. The suggested path reads the worn Signature and takes the vows the return card suggests. Step rows are clamped by the engine. Rules and borrows are held by the Lab.

**No single best build.** The library: the twelve builds above, then one hybrid per border. Cells: a ground's monster mix × party size × stance.

- Every build is top 3 in at least one cell.
- No build is top in more than 25% of cells.
- A build that fails is rewritten, not buffed. Every release runs the library with its new rows.

**No dead nodes.**

- No cooldown cut on a move whose lane runs over 75% full on its weapon's suggested bar. Moves with a cooldown of 30 s or more are exempt.
- Low-health effects key to "near fall-back", never a fixed percent.
- Nothing that reads a block ships before a block exists.
- No "short hunt" as a best-for. Hunts are long.
- Every node fires on the dummy analyzer before it ships.

## 10. What the report shows (R9)

So a tank build and a damage build don't both just read "Depth 14":

| Line | Label |
|---|---|
| Healing by source | Healing: Greater Mend 61% · Mend 22% · Borrowed 17% |
| Damage taken by seat | Damage taken: Front 58% · Back 42% |
| Supplies by depth | Supplies: 11,200 an hour at Depth 12 |

## 11. Theorycrafting tools

| Tool | What it does | Server work |
|---|---|---|
| **Build planner** | Draft a whole build past your Level and save it as a plan. Plan route drafts the path to a far node | Saving is a server write. The server checks every node, link, pick, borrowed and vow count, and Trait and Signature id against its catalogue |
| **Share codes** | Copy and paste a build. Ladder entries get **Copy build** | Codes are made on the server from builds it holds. A pasted code is checked like a plan |
| **Test on the dummy** | Run a draft on the training dummy and read the hunt analyzer | One combat engine, short fight, no XP or loot, runs per hour limited |
| **Builds like yours** | Held depth, XP an hour, healing, mana and supplies for the nearest library build on each ground | A nightly table (about 2,040 entries). Every number labeled an estimate |
| **Details** | Exact numbers, steps and stacking keys on tooltips | No |

## 12. How to build it

1. **Engine first:** the four bar metrics (target health %, marked, Bleed stacks, last move cast), "near fall-back", the ramp and the build slice clamp, borrowed rows on the bar with the heal rule. Exact lanes: `19-power-ledger.md` section 5.
2. **Sample:** the Hearth, Shield, Restoration and their border, played on a phone at 922 × 423 with "Spend as suggested" on and off, and the library test on them.
3. **Then the rest,** country by country, each through the library test before it ships.

## 13. Walk-through: a new Shield hero on the suggested road

Sword and shield, "Spend as suggested" on, plan solo until Level 5 (the company joins there), then party. Unlocks are skill levels from `src/data/abilities.js` (Challenge none, Frost Slam Melee 12, Shelter Melee 20). Assumes Melee keeps pace with Level (its unlock waits otherwise, as a locked slot does). Point k arrives at Level k + 1.

| Level | Point | Holds before this step | Spends on | Doable because |
|---|---|---|---|---|
| 1 | none | The Hearth | nothing | Points come with Levels |
| 2 to 4 | 1 to 3 | Hearth | Challenge rank stones 1 to 3 | The first stone touches the Hearth. Challenge known from Level 1 |
| 5 | 4 | Rank 3 | **Challenge crossroads I** | Next to rank 3. Party plan, so Long Hold is suggested |
| 6 | 5 | Crossroads I | Waystone: Challenge range +1 tile | Off crossroads I |
| 7 to 8 | 6 to 7 | Crossroads I | Challenge rank stones 4 to 5 | The road goes on |
| 9 | 8 | Rank 5 | **Challenge crossroads II**: Mended | Next to rank 5 |
| 10 | 9 | Crossroads II | Waystone: −2% damage taken for 4 s | Off crossroads II |
| 11 | 10 | Challenge crossroads I | Frost Slam rank stone 1 (waits for Melee 12) | Frost Slam's road leaves crossroads I |
| 12 to 13 | 11 to 12 | Frost Slam stone 1 | Frost Slam rank stones 2 to 3 | Frost Slam learned at Melee 12 |
| 14 | 13 | Rank 3 | **Frost Slam crossroads I**: Long Frost | Next to rank 3 |
| 15 | 14 | Crossroads I | Waystone: Frost Slam usable solo | Off crossroads I |
| 16 to 17 | 15 to 16 | Crossroads I | Frost Slam rank stones 4 to 5 | The road goes on |
| 18 | 17 | Rank 5 | **Frost Slam crossroads II**: Cold Ground | Next to rank 5 |
| 19 | 18 | Crossroads II | Waystone: Frost Slam radius +1 tile | Off crossroads II |
| 20 to 22 | 19 to 21 | Frost Slam crossroads I | Shelter rank stones 1 to 3 | Shelter learned at Melee 20 |
| 23 | 22 | Rank 3 | **Shelter crossroads I**: Steady Shelter | Next to rank 3 |
| 24 | 23 | Crossroads I | Waystone: Shelter −5 s cooldown | Off crossroads I |
| 25 to 26 | 24 to 25 | Crossroads I | Shelter rank stones 4 to 5 | The road goes on |
| 27 | 26 | Rank 5 | **Shelter crossroads II**: Strong Shelter | Next to rank 5 |
| 28 | 27 | Crossroads II | Waystone: +10% shield on allies near fall-back | Off crossroads II |
| 29 | 28 | Shield country | Havora to Sword: Power Strike rank stone 1 | Shield heroes wield Power Strike. Its road starts at Havora |
| 30 | 29 | Vow slot 1 opens | Spend as suggested goes on to Power Strike stone 2. **The return card offers Hold Fast** | A vow is never taken by the rule |
| 30+ | | | The player takes Hold Fast with the next point, or not | Hold Fast sits beside Challenge's crossroads I, owned at 5 |

Borrowing: the Sword · Shield town is reachable at Level 29, but Turning Cut's value isn't measured, so its opening Level waits on the Lab. The Shield · Restoration town's Greater Mend opens at 80 to 150, by its measured value under the heal rule.

**Choices per 10 Levels:** 4 (Levels 1 to 10), 4 (11 to 20), 5 (21 to 30, with the vow). v2 had 5 in 30 Levels. Every 2 to 2.5 Levels against the target of 2 to 4.

**Walk-through: a Level 40 wand-and-staff hybrid** (R5). A wand hero: Destruction road (Frost Lance known), crossroads I at Level 5 (Chilling Lance), II at 9, Fireball road from 11, its crossroads I at 14. Border road to Destruction · Restoration leaves Frost Lance's road: hybrid crossroads needs a Restoration crossroads too, so Greater Mend's road from Havora (3 stones, crossroads I) at points 15 to 18. Town at point 19 (Level 20): Use Greater Mend with any weapon, owned but waiting for its opening Level (80 to 150). Hybrid crossroads (Cold Mercy) at Level 21. Vow 1 at 30: Cold Focus. Hedge Healer as vow 2 at 50. Doable from real nodes. The borrow itself is the late piece, on purpose.

**Walk-through: Level 600** (R10). The map is full at about 266. Points since go to open roads on slotted moves. Mileposts at 250 to 600: 8 picks. A release that adds a country gives a free reset: the hero moves open-road points onto the new roads once, at no cost.

## 14. Repeated decisions (the first principle)

| Where a player could repeat a choice | How it's removed |
|---|---|
| Spending a point every Level | "Spend as suggested" or a saved plan's order, as a standing rule |
| Taking a vow | Asked once on the return card. The plan remembers it for later heroes |
| The same build on a second hero | Copy build, or a share code |
| Changing builds for a ground | A saved build per ground in the company plan, applied at the Start |
| A death takes a Level | The last spend comes off, and the standing rule puts it back |
| New content | The standing rule follows the suggested road. One free reset per release |

## 15. Open questions

- Does the heal rule land a borrowed Greater Mend at 10 steps or less? If not, which of Magic scaling or Mend's cooldown next.
- Is Level 200 the right point for full size, or does mid-game theorycraft want 120 to 150? `19-power-ledger.md` section 3.
- Is 4 vows a country enough with Mileposts adding more later?
- Does Frost Slam clear +4 steps once the holder line lands, or does it fold into the Challenge as Cold Challenge (`23` section 4)?

## Changes from the spell audit

2026-11-22, from `23-spell-audit.md` section 8, and Tyler's rulings the same day (Updraft cut, the tank falls back at 15% on Steady).

- Borrow table: Hoarfrost (V0 15.8) and Protective Ward (V0 16.1) added, both −50% at a border, not offered at Havora, open at 120. Challenge and Greater Mend flagged for re-measure.
- Node counts: Sword gets Parry, Dual Axe gets Gash (wave 3), Restoration loses Undertow. 24 moves, 274 points (256 until wave 3). Healer owns its country by about Level 60. Map full at about 275.
- Near fall-back: the Challenge holder's line is Steady 15%, Careful 27%.
- Challenge: suggested condition "my HP is at least 60%". Wide Challenge becomes Long Hold.
- Frost Slam: re-measure, Cold Challenge fallback. Slowing Frost flagged dead where nothing winds up.
- Shelter: suggested condition "2+ heroes under 80%".
- Greater Mend: numbers follow the re-size. Green Sickness: the alone rule.
- Undertow's road cut.
- Quarry Blow's road becomes Stagger's: Breaking Blow, Rockfall, Cold Stone, Long Sickness, Heavy Quarry, Cold Quarry out. Long Stagger, Shaken, Wide Stagger, Heavy Stagger, Laid Open, Sure Blow in. Waystones renamed.
- Turning Cut: Bleeding Turn cut, Heavy Turn in. Club lane note now 78%.
- Gash road placed on Dual Axe. Parry road placed on Sword, with Riposte and Answering back as options.
- Passives list: Deep Pull out.
- Borders: Club · Dual Axe and Sword · Club now use Stagger. Crushing Cuts keys to Armor Break, Heavy Bleed and Butcher to Stagger. Tempered Strikes and Smith's Arm rewritten.
- Vows: Battle Healer is Green Sickness +20%. Aftershock: Stagger hits beside the target. Watchful Healing weak where nothing winds up. Riposte no longer held.
- Builds: Bleed Axe takes Gash, Armor Breaker and Crush and Bleed take Stagger.
- Walk-through: Level 5 suggests Long Hold. Still doable: it's an option on the same crossroads.
- Open question added on Frost Slam.

## Changes from the full map

2026-11-23, lane/roads-countries (game designer). Every country and border is now data in `src/data/talents.js` (269 nodes, 171 options), each option on a piece the engine plays. Where this doc names an option the engine can't play, it is re-written to keep its job:

- **Nothing held** (Strong Shelter and Strong Ward, `29-tuning-pass.md` 3.8). Quick Slam and Wide Slam pay in Chill, since Frost Slam lands no blow, so their "−20% damage" never bit.
- **No target-health or monster-type reads.** Finishing, Opening, Clean Sweep, Reaping, Picked and Aimed (vs marked) become what the hit leaves behind: Sickness, Weakened, Sapped, Armor Break, Chill, a second hit later, or the overkill carried to the next enemy.
- **Bleed's cap and tick speed have no seam.** Its picks and the axe's four waystones move Bleed's length and strength. Spread is Jagged Rend (target Sick). Vows: Open Wounds (crits lay 2 stacks), Frenzy (kills ready Rend sooner), Bleed Out (Bleed +40%), Clean Cuts (overkill carried).
- **Hunter's Mark's own numbers have no seam.** Its picks are what marking does for the archer: Hunter's Focus, Quick Mark, Calm Mark, Stalking Mark, Ready Mark, Sharp Mark.
- **Weapon and stance vows.** Single Combat, Braced and Point Blank hold alone, Long Range in a party. Duelist's Guard and Marked Prey ride a cast. Cold Focus and Fire Focus pay in the other element's damage.
- **Hybrids that repeated a country option at no cost** are re-written to join the two countries (Barbed Arrows, Frost Arrows, Mana Arrows, Wide Wounds, Hamstring, Cold Shoulder, Rime Plate, Second Strike, Tempered Strikes, Pressing Guard, Shield Wall, Covering Strike).
- **Towns wait on the Lab.** A town move with no measured value (Power Strike, Flame Strike, Turning Cut, Rend, Raking Shot, Circle of Renewal) shows and lends nothing until it is measured. Four towns wait whole: Club · Dual Axe, Dual Axe · Ranged, Restoration · Sword, Sword · Club. Their hybrids and vows work now.
- **Shared roads are walked by every weapon that casts the move.** After Shelter, a Shield hero's suggested road goes on to Power Strike and Flame Strike in Sword (section 13). A club hero goes on to Power Strike, an axe or sword hero to Turning Cut.
- **Quarry Blow and Undertow have no road.** Stagger replaces one in wave 3 and the other is cut.

## Changes from the town values

2026-11-23, lane/roads-borrow-values (systems), measured in `18-roads-review-measured.md` section 7.

- **Every town move has a value.** Power Strike, Flame Strike, Turning Cut, Rend, Raking Shot and Circle of Renewal are measured (table in section 3), so all four waiting towns lend. Greater Mend is measured again and stays past the last band, not offered until V4.
- **A pick that lends nothing is refused.** A town or crossing pick whose move has no band answers `not_offered` (the spend, a saved build, the server's twin), so no point buys nothing. A map with an unmeasured town move, or a town that lends nothing at all, doesn't generate.
- **Open (CONFLICTS 2026-11-23):** four town sides still get nothing (Shield at Shield · Restoration, Dual Axe at Club · Dual Axe, Sword at Sword · Club, Destruction at Destruction · Restoration), and four more lend a move the engine can't cast for them yet (Shelter to a healer, Raking Shot to an axe, Challenge to a mage and to a sword).
