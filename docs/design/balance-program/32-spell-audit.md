# Balance program 32: the spell audit

Game-designer, `lane/d-spell-audit` (plan lane L57), 2026-11-20, on `set/v0.2.143` with `set/v0.2.144` merged. Nothing in the game was changed: no code, no data, no migration. One measuring tool was added, `tools/balance-sim/staged/spell-audit.mjs`.

**Why this exists.** Tyler, 2026-11-20, on call 23-9 (when the Storm and Bone rune families unlock): "Depends on what the designer says when he audits all of the current spells against the direction of the game". The plan puts this audit before L17 (every cast becomes a share of the caster's own blow, call 21-5) and before L44 (Necrotic and Storm).

**Labels**, as in `01-model.md`: MEASURED (with the command), READ FROM DATA, CITED, RULED, ASSUMED, PROPOSED.

**How it was measured.** `node tools/balance-sim/staged/spell-audit.mjs` (no play, exit 0). It is the method of `spell-ratios.mjs` at Levels 10, 50, 110 and 185: the game's own rows and functions, one cast on a same-Level regular of a full ground, the caster on its measured career line. The dark rows (the six fist strikes, the four Necrotic and Storm spells) are read from a planted copy of `src/data` with their two switches on, so the tree is untouched. Every number below is from that one run unless it says otherwise.

**What is ASSUMED in it.** Skills past Level 100 are the projection `spell-ratios.mjs` uses. No weapon exists past tier 7, so Level 185 is read twice: on the Level 110 kit, and on the same kit with its weapon on the ruled line past Dawnsteel (about x Level / 110, Tyler 11-16, `staged/weapon-line.js`). The fist rows are read on the hammer's kit as a stand-in (the wraps exist at tiers 1 and 2 only). **Under the rule** means the audit's reading of the ruled spell rule, not the lane that builds it: a cast lands `max hit x share x step`, step 1.00 / 1.15 / 1.30 / 1.45 / 1.60 for versions I to V (21-combat B5, PROPOSED), each row's share fitted so its Level 60 cast equals today's, the rows with no versions on B5's own openings. **Not done:** nothing here was played. The rule was not planted in the engine. That is L17's.

---

## A. Summary

### Verdicts

49 rows: 23 live abilities, 6 dark designs that are built (the fist line's two strikes, each in three elements, and the four Necrotic and Storm spells), 12 Necrotic and Storm spells that exist on paper only, 8 rune families.

| Verdict | Count | Rows |
|---|---|---|
| KEEP | 27 | 19 live abilities, Brand, Reave, six rune families (Fire, Ice, Earth, Water, Poison, Rupture) |
| FIX | 7 | Turning Cut, Rend, Mend, the fist Hands, the fist Palm, Updraft, Blight |
| MERGE | 1 | Cleave, into Turning Cut |
| CUT | 0 | |
| NEW | 14 | the twelve paper spells of L44, the Storm family, the Bone family |

KEEP means the design stands and only its number changes form under the spell rule. FIX means something beyond that conversion has to change (a cooldown, a trigger, the clock it shares, the thing its number reads). Nothing is filler enough to cut. One pair is the same decision twice.

### The answer to 23-9

**Storm Runes at Runecrafting 65. Bone Runes at Runecrafting 80. The whole family opens at once (all five tiers). The store's copy of each is on sale from the day the spells open. The spells keep their own unlocks (weapon skill 25 and 40).** Section D has the reasons and the alternative.

### The five changes that matter most

| # | Change | Why, in one line | Evidence |
|---|---|---|---|
| 1 | Storm at Runecrafting 65, Bone at 80 | They are the only two families no hero needs, so they are the right ones to sit high on the ladder, and under the spell rule a family is the only real event the ladder has left | D, tool sections 7, 8, 9 |
| 2 | Cleave merges into Turning Cut, and Rend goes to 8 s with an 8 s bleed | The bar budget is red on two families. Dropping one axes row is not enough (1.25 becomes 0.92 against a 0.85 cap). This lands axes on 0.83 | C1, tool section 6 |
| 3 | Mend heals a share of max HP | It is the one button every hero has and it is dead from Level 10 to 15 (half a monster blow at 10, a tenth at 110). As a share of the blow a hammer would heal itself 1.6 times what a tank does | B, C2, tool sections 3 and 5 |
| 4 | L17 fits every cast at Level 10 and at Level 60, and guards heals in monster blows | Fitted at Level 60 alone the rule takes 40 to 50% off every Level 10 cast, and a heal still loses a fifth of its worth by 185 on the weapon line | C4, tool section 3 |
| 5 | The dark rows are fixed before they go live | Updraft and Blight add to the wand's lane (1.18). The fist line fills 2.08 lanes with six rows, and its strikes are fixed numbers, not shares of the blow as 21-combat says | C1, C3, tool sections 3 and 6 |

---

## B. Every spell and rune family

### B1. What it is for, who uses it, when, at what cost, and the verdict

Ways: tank (sword and shield), sword (alone), axes, hammer (club), bow and crossbow (one list today), wand (Mage), staff (Healer), fists (dark). Seats: tank, melee damage, ranged damage, magic damage, healer. Unlocks are in the row's own skill. The Level and hours beside them are in B3. Mana is version I to version V. READ FROM DATA: `src/data/abilities.js`, `runes.js`, `statuses.js`, `rule-subjects.js`.

**Live abilities (23)**

| Row | What it is for, and the decision it gives | Ways and seats | Unlock | Cost | Verdict | Why, against the direction |
|---|---|---|---|---|---|---|
| `challenge` Challenge | Pulls a monster onto the tank. The decision is being the tank at all | tank | 1 | 0 mana, 8 s | KEEP | The seat's defining button. No number to decay. Only the shield has it (RULED 11-19) |
| `frost_slam` Frost Slam | Chills every monster beside the tank. Control for a party, slotted once on a trigger | tank, party only | Melee 12 | 6 to 12 mana, Ice rune, 6 s | KEEP | A status of 30 to 50% by rune tier, so it holds at every Level. Holds and controls, never kills (RULED 11-19) |
| `shelter` Shelter | A shell on the whole party before a group spell lands | tank, party only | Melee 20 | 25 to 52 mana, Earth rune, 30 s | KEEP | The tank's reason to carry runes. Its number is the problem, not its design: 1.08 blows at 10, 0.54 at 110 (B2) |
| `flame_strike` Flame Strike | The blade's rune strike. Pay a Fire rune for a hard single hit with an element | tank, sword | 1 | 10 to 21 mana, Fire rune, 8 s | KEEP | The sword's only element and only rune choice. Off the tank's default bar by ruling (11-19) |
| `power_strike` Power Strike | The free strike every melee hero starts with | tank, sword, axes, hammer, fists | 1 | 6 mana, 6 s | KEEP | The first skill a new melee player is given and a dead button by Level 60 to 75. The spell rule's headline repair |
| `turning_cut` Turning Cut | The sweep for melee without a shield. Fires when several stand beside the hero | sword, axes, hammer | Melee 10 | 8 mana, 8 s | FIX | Already a share of the blow and holds. It takes Cleave's job (below), so its starting trigger moves from 3 monsters to 2. Its defense is taken twice today, which the rule ends |
| `cleave` Cleave | Up to three monsters in front | axes, hammer | 1 | 8 mana, 6 s | MERGE | The same decision as Turning Cut: "the hit-several button". Under the rule both are a share of the blow on a pack. It is also what puts both families over the bar budget |
| `rend` Rend | The axes' rune strike. Two hits and a bleed that stacks to five | axes | 1 | 8 to 17 mana, Rupture rune, 6 s | FIX | The axes' identity (RULED 10-16) and worth keeping. Its hits are 5% of a monster at 110 and the bleed is four fifths of the cast. To fit the budget it goes to 8 s, with a bleed that lasts 8 s so stacks still hold, and the bleed reads the axes' blow |
| `hunters_mark` Hunter's Mark | Marks one monster to take 20% more. The decision is who to mark | bow, crossbow | 1 | 8 mana, 12 s | KEEP | A percentage, so it holds at every Level. On the support lane, outside the offense budget |
| `flame_volley` Flame Volley | The Ranger's fire area. Three shots and a Fire rune | bow, crossbow | 1 | 15 to 31 mana, Fire rune, 3 ammo, 10 s | KEEP | A real choice beside Raking Shot: element and a square against no element and a line |
| `precision_shot` Precision Shot | The Ranger's free single shot | bow, crossbow | 1 | 6 mana, 1 ammo, 6 s | KEEP | Dead by Level 65 like Power Strike. Repaired by the rule |
| `raking_shot` Raking Shot | An arrow line with no element | bow, crossbow | Ranged 10 | 10 mana, 2 ammo, 8 s | KEEP | Already a share of the blow and holds from 10 to 250. The area a resistant monster cannot shrug off (Andy 11-06) |
| `fireball` Fireball | The Mage's area damage | wand | 1 | 25 to 52 mana, Fire rune, 8 s | KEEP | The Mage's core button and the Fire family's biggest consumer |
| `frost_lance` Frost Lance | The Mage's single-target strike | wand | 1 | 20 to 41 mana, Ice rune, 6 s | KEEP | The decision is single target or area by ground. Today it one-shots a Level 10 monster (128%). The rule ends that |
| `hoarfrost` Hoarfrost | An ice area that slows the pack. Damage or control | wand | Magic 14 | 22 to 46 mana, Ice rune, 10 s | KEEP | Not a second Fireball: less damage, a slow, the other element |
| `arcane_barrier` Arcane Barrier | A shell on the Mage alone, refunded if recast full | wand | 1 | 30 to 62 mana, Earth rune, 20 s | KEEP | Self-only by ruling (10-23). 1.45 blows at 10, 0.46 at 185: converted by the rule |
| `greater_mend` Greater Mend | The Healer's main heal | staff | 1 | 25 to 52 mana, Water rune, 2 s | KEEP | The seat itself. 1.82 blows at 10, 0.89 at 110, 0.57 at 185 today |
| `circle_of_renewal` Circle of Renewal | The steady party top-up | staff | 1 | 50 to 104 mana, Water rune, 12 s | KEEP | A different trigger and job from Spring Tide (steady against the save). The weakest heal for its mana: under half a blow a hero by 95 |
| `spring_tide` Spring Tide | The once-a-minute party save | staff | Magic 20 | 120 to 249 mana, Water rune, 60 s | KEEP | Tyler's design (11-08) with a measured trigger. Holds to 250 |
| `green_sickness` Green Sickness | A weak area that makes everything it hits take 10% more | staff | 1 | 20 to 41 mana, Poison rune, 10 s | KEEP | Its worth is the mark, a percentage that never decays. It is the Poison family's only live consumer |
| `protective_ward` Protective Ward | A shell on one ally | staff | 1 | 25 to 52 mana, Earth rune, 12 s | KEEP | The Healer's answer to a blow that is coming, where a heal answers one that landed |
| `undertow` Undertow | The lone Healer's strike | staff, alone only | 1 | 15 to 31 mana, Water rune, 20 s | KEEP | Tyler's ruling (11-09). A party never sees it fire, so it costs the party seat nothing |
| `mend` Mend | The self-heal every hero has, on mana alone | every way | 1 | 15 mana, 6 s | FIX | The free floor and the only reason a melee hero trains Magic. Half a monster blow at Level 10 and a fifth by 50. It reads the Magic of a hero who never trained Magic, which is why it never grows |

**Dark designs that are built (6)**

| Row | What it is for | Ways | Unlock | Cost | Verdict | Why |
|---|---|---|---|---|---|---|
| `fire_hands`, `ice_hands`, `poison_hands` (one design) | The fist line's strike on mana alone, in the element the player picks | fists | 1 (reads Magic) | 8 mana, 6 s | FIX | Element by choice is the fist's promise (RULED 11-18). But the three are three rows with three cooldowns, so a bar can hold all three and the choice is gone. One clock for the three. And they are fixed numbers ([8, 14]), dead by Level 65 like Power Strike |
| `fire_palm`, `ice_palm`, `poison_palm` (one design) | The same strike made stronger with a rune | fists | 1 (reads Magic) | 12 to 25 mana, a rune of its element, 8 s | FIX | A rune for more power is a real choice. It must stand in for the Hands (share their clock), or the fist's lane is 0.92 even with one element |
| `brand` Brand | The sword's Storm strike. A kill gives mana back | tank (party only), sword | Melee 25 | 10 to 21 mana, Storm rune, 8 s | KEEP | Built the right way: it stands in for a strike, so it is a choice of element and never an extra cast. Measured to its band (CITED, `elements-6b-table.mjs`) |
| `reave` Reave | The sword's Necrotic strike. 30% of the damage comes back as HP | tank (party only), sword | Melee 40 | 12 to 25 mana, Bone rune, 10 s | KEEP | Same. Its leech is a percentage and holds |
| `updraft` Updraft | The Mage's Storm area. Mana back for each monster hit | wand | Magic 25 | 22 to 46 mana, Storm rune, 10 s | FIX | It does not name a row it stands in for, so it adds to the wand's lane: 0.78 becomes 0.98 with one and 1.18 with both. It stands in for Fireball or Hoarfrost |
| `blight` Blight | The Mage's Necrotic area. Everything hit heals half as much | wand | Magic 40 | 25 to 52 mana, Bone rune, 10 s | FIX | The same missing stand-in. And its rider only matters where monsters mend, which is Krell's Hold today and the Ox Road when it opens: say so on its card |

**The twelve that exist on paper (itemization plan, Appendix B3), all NEW for L44**

| Family | Storm (skill 25) | Necrotic (skill 40) | The audit's note for the build |
|---|---|---|---|
| Hammer | Anvil Ring | Toll | The hammer's first rune spells and first element. Anvil Ring stands in for Turning Cut, Toll for Power Strike |
| Axes | Crossarc | Fester | Crossarc was "up to three in front", which is Cleave's shape. With Cleave merged it stands in for Turning Cut. Fester ("harder if it is bleeding") is the best design of the sixteen: it builds on what the weapon already does |
| Bow | Fork Shot | Pall Arrow | Stand in for Precision Shot |
| Crossbow | Live Bolt | Leech Bolt | The bow and the crossbow are one ability list today (`ranged`). A crossbow pair needs its own list first (C3) |
| Staff | Static Ward | Tithe | The Healer's offense lane is full at its 0.30 cap. Tithe stands in for Green Sickness or Undertow. Static Ward is a shell, so it stands in for Protective Ward on the support lane |
| Fists | Live Hand | Draw | Stand in for the Hands. Reave, Leech Bolt and Draw are one mechanic three times. That is fine across families (a player holds one weapon), and it is why they must not all be sized alike |

**Rune families (8)**

| Family | Who spends it today | Dark | Verdict | Why |
|---|---|---|---|---|
| Fire | Flame Strike, Flame Volley, Fireball | Fire Palm | KEEP | Three ways spend it. The busiest family |
| Ice | Frost Slam, Frost Lance, Hoarfrost | Ice Palm | KEEP | Two ways, damage and control |
| Earth | Shelter, Arcane Barrier, Protective Ward | none | KEEP | The shell family. Three seats, one job, which is what a family should be |
| Water | Greater Mend, Circle of Renewal, Spring Tide, Undertow | none | KEEP | The Healer's whole supply |
| Poison | Green Sickness | Poison Palm | KEEP | Thin: five rune rows, five recipes and five store rows for one weak spell. The fist line gives it a second consumer. Not worth a new spell on its own account |
| Rupture | Rend | none | KEEP | Thin in the same way, and it is the axes' own (RULED 10-23). No change |
| Storm (hidden) | none | Brand, Updraft, six more on paper | NEW | Runecrafting 65 (section D) |
| Bone (absent) | none | Reave, Blight, six more on paper | NEW | Runecrafting 80 (section D) |

### B2. What each cast does at Levels 10, 50, 110 and 185

MEASURED, `spell-audit.mjs` section 3. Damage is one cast as a share of a same-Level monster's HP (a row that hits several: each target). Heals and shells are in monster blows (a monster's largest blow is 22% of a hero's HP at every Level). "185" is on the Level 110 kit. "185 line" is the same cast with the weapon on the ruled line past Dawnsteel. A dark Necrotic or Storm row is not castable at Level 10.

For scale, the hero's own average landed swing as a share of the monster (tool section 2): hammer 32% / 20% / 15% / 5%, sword 21% / 16% / 12% / 4%, bow 26% / 17% / 12% / 8%, wand 36% / 25% / 20% / 13%. The melee swing at 185 is the to-hit collapse (42 to 52% to hit) that L15 removes.

**Damage**

| Cast (read on) | Today: 10 / 50 / 110 / 185 | Under the rule: 10 / 50 / 110 / 185 | 185 line |
|---|---|---|---|
| Power Strike (tank) | 43% / 11% / 4% / 2% | 28% / 19% / 14% / 10% | 12% |
| Power Strike (hammer) | 43% / 11% / 4% / 2% | 46% / 24% / 20% / 13% | 18% |
| Flame Strike (sword) | 93% / 46% / 22% / 11% | 51% / 43% / 36% / 24% | 30% |
| Turning Cut (sword), a target | 20% / 15% / 10% / 6% | 22% / 15% / 11% / 7% | 9% |
| Turning Cut (hammer), a target | 33% / 18% / 15% / 9% | 35% / 18% / 16% / 10% | 14% |
| Cleave (axes), a target | 37% / 9% / 3% / 1% | 23% / 17% / 13% / 8% | 10% |
| Rend, its two hits (axes) | 51% / 25% / 5% / 3% | 27% / 25% / 20% / 13% | 17% |
| Rend with its bleed, a whole cast | 175% / 66% / 27% / 17% | not sized (the bleed has to be converted first) | |
| Precision Shot (bow) | 41% / 10% / 4% / 2% | 31% / 20% / 15% / 10% | 12% |
| Raking Shot (bow), a target | 30% / 20% / 14% / 9% | 31% / 21% / 15% / 10% | 13% |
| Flame Volley (bow), a target | 59% / 29% / 12% / 5% | 34% / 28% / 23% / 15% | 19% |
| Frost Lance (wand) | 128% / 62% / 32% / 17% | 63% / 55% / 50% / 31% | 38% |
| Fireball (wand), a target | 81% / 39% / 18% / 8% | 40% / 35% / 31% / 20% | 24% |
| Hoarfrost (wand), a target | 60% / 29% / 12% / 5% | 30% / 25% / 23% / 15% | 18% |
| Green Sickness (staff), a target | 39% / 19% / 6% / 2% | 21% / 17% / 15% / 9% | 12% |
| Undertow (staff, alone) | 90% / 44% / 21% / 10% | 49% / 39% / 35% / 22% | 28% |
| Fist Hands (dark, hammer's kit) | 48% / 12% / 5% / 2% | 19% / 10% / 8% / 5% | 7% |
| Fist Palm (dark, hammer's kit) | 61% / 15% / 7% / 6% | 24% / 13% / 11% / 8% | 11% |
| Brand (dark, sword) | no / 41% / 20% / 9% | no / 39% / 33% / 22% | 28% |
| Reave (dark, sword) | no / 29% / 12% / 5% | no / 27% / 23% / 15% | 19% |
| Updraft (dark, wand), a target | no / 29% / 12% / 5% | no / 25% / 23% / 15% | 18% |
| Blight (dark, wand), a target | no / 23% / 9% / 2% | no / 20% / 18% / 11% | 14% |

**Heals and shells, in monster blows**

| Cast | Today: 10 / 50 / 110 / 185 | Under the rule: 10 / 50 / 110 / 185 | 185 line |
|---|---|---|---|
| Greater Mend | 1.82 / 1.34 / 0.89 / 0.57 | 1.00 / 1.20 / 1.21 / 0.79 | 0.99 |
| Circle of Renewal, each hero | 0.91 / 0.67 / 0.44 / 0.29 | 0.50 / 0.60 / 0.60 / 0.39 | 0.49 |
| Spring Tide, each hero | 5.47 / 4.02 / 2.66 / 1.72 | 3.01 / 3.60 / 3.63 / 2.36 | 2.96 |
| Protective Ward | 1.09 / 0.80 / 0.53 / 0.34 | 0.60 / 0.72 / 0.73 / 0.47 | 0.59 |
| Arcane Barrier | 1.45 / 1.07 / 0.71 / 0.46 | 0.72 / 0.94 / 0.96 / 0.63 | 0.76 |
| Shelter, each hero | 1.08 / 0.80 / 0.54 / 0.35 | 0.59 / 0.76 / 0.72 / 0.49 | 0.62 |
| Mend (tank) | 0.50 / 0.22 / 0.13 / 0.09 | 0.50 / 0.52 / 0.44 / 0.30 as a share of the blow | 0.38 |
| Mend (hammer) | 0.46 / 0.18 / 0.10 / 0.07 | 0.83 / 0.65 / 0.62 / 0.41 as a share of the blow | 0.57 |

**No number to measure:** Challenge (a taunt), Frost Slam (a chill of 30 to 50% by rune tier, for 4 s of every 6), Hunter's Mark (+20% for 8 s of every 12). All three hold at every Level because they are percentages.

Three readings of the two tables:

1. **Today every fixed-number cast is at its best at Level 10 and falls from there**, as 21-combat found. The rule holds each one within a narrow band from 50 to 110.
2. **Fitted at Level 60, the rule takes 40 to 50% off every cast at Level 10** (Frost Lance 128% to 63%, Greater Mend 1.82 blows to 1.00, the tank's Power Strike 43% to 28%). Part of that is wanted: the Level 10 one-shot goes. Part is not: it is the new player's first hours (C4).
3. **Heals and shells still sag past 110 under the rule.** A hero's HP and a monster's blow grow with Level. A staff's blow grows with the weapon, and the weapon line grows slower than HP. Greater Mend is 1.21 blows at 110, 0.99 at 185 on the weapon line and 0.79 without it (C4).

### B3. When each row arrives

MEASURED, tool section 7 (the career line's skill at each Level, the pace targets' hours).

| Skill | About Level | Hunted hours | What opens |
|---|---|---|---|
| 1 | 1 | 0 | every other live row: 16 abilities and Mend |
| 10 to 14 | 7 | 4 | Turning Cut, Raking Shot, Frost Slam, Hoarfrost |
| 15 | 7 to 8 | 4 to 5 | version II of every rune spell |
| 20 | 9 to 10 | 5 to 6 | Shelter, Spring Tide. **The last live spell** |
| 25 | 11 to 13 | 8 to 12 | the Storm spells (dark) |
| 30 | 15 to 17 | 16 to 20 | version III |
| 40 | 27 to 29 | 47 to 57 | the Necrotic spells (dark) |
| 45 | 34 to 35 | 84 to 89 | version IV |
| 60 | 59 to 60 | 246 to 254 | version V. **The last version** |
| | 200 | 1,680 | nothing since hour 254 |

---

## C. What the audit found

### C1. Spells that break the bar budget (G23)

MEASURED, tool section 6. The lane filled is the sum of the 2 s offense lane over each offense row's cooldown. A row that stands in for another shares its clock and adds nothing.

| Family | Cap | Live today | With the dark rows as written | After this audit |
|---|---|---|---|---|
| Sword and shield | 0.60 | 0.58 | 0.58 | 0.58 |
| Sword alone | 0.85 | 0.83 | 0.83 | 0.83 |
| Two axes | 0.85 | **1.25** | **1.25** | 0.83 |
| Club or hammer | 0.85 | **0.92** | **0.92** | 0.58 |
| Bow, crossbow | 0.85 | 0.78 | 0.78 | 0.78 |
| Wand | 0.85 | 0.78 | **1.18** | 0.78 |
| Staff | 0.30 | 0.30 | 0.30 | 0.30 |
| Fists (dark) | 0.85 | dark | **2.08** | 0.67 |

- **Two axes, 1.25.** 21-combat said one of the four rows leaves. That is not enough: without Cleave the axes are Power Strike 6 s, Turning Cut 8 s and Rend 6 s, which is 0.92. Two changes are needed. PROPOSED: Cleave merges into Turning Cut, and Rend goes to an 8 s cooldown. A bleed stack lasts 6 s and a new landing refreshes every stack (READ FROM DATA, `src/core/hunt/status.js`), so on an 8 s cooldown the stacks would fall off between casts. The bleed therefore lasts 8 s too, and L17 sizes its tick so a held bleed is worth what it is today.
- **Club, 0.92.** The same merge takes it to 0.58: Power Strike and Turning Cut. That is a gap, not a breach (C3).
- **Wand with the dark sample, 1.18.** Brand and Reave carry `replaces`. Updraft and Blight do not. Each must name Fireball and Hoarfrost. The 6b sample measured the wand at +2.7% and +8.5% (CITED) only because the wand has little spare lane. Under the ruled budget that is still an added cast.
- **Fists, 2.08.** Six rows, each with its own cooldown: three Hands at 6 s, three Palms at 8 s, and Power Strike. PROPOSED: one clock for the Hands whatever the element, and the Palm stands in for the Hands. That is 0.67.
- **The staff is full at its cap.** Green Sickness 10 s and Undertow 20 s are exactly 0.30. Any Healer offense spell L44 adds must stand in for one of them.

### C2. Spells that are dead past a Level

MEASURED, tool section 5, on today's rule. Dead means one cast is under half an own swing (under a quarter a target for a row that hits several), or a heal or shell is under half a monster blow. The swing is taken at a 95% to-hit so the melee to-hit collapse does not flatter a cast.

| Dead from Level | Rows |
|---|---|
| 10 to 15 | Mend |
| 60 to 75 | Power Strike, Precision Shot, the fist Hands |
| 85 to 95 | the fist Palm, Rend's hits, Circle of Renewal |
| 120 to 135 | Shelter, Protective Ward, Cleave, Green Sickness's damage |
| 170 | Arcane Barrier, Blight |
| 210 to 250 | Hoarfrost, Updraft, Reave, Greater Mend, Flame Volley |
| holds to 250 | Flame Strike, Turning Cut, Raking Shot, Fireball, Frost Lance, Spring Tide, Undertow, Brand |

Two notes. Cleave reads late here because the bar for an area row is a quarter of a swing a target. Against a single monster it is at half a swing by Level 50 to 60 (0.53 swings at 50), which is 21-combat's reading. And Mend is the finding: it is the only spell every hero holds, it is on the heal lane of every bar, and it stops mattering before the tutorial grounds end. It reads Magic, and a melee hero's Magic is 28 at Level 60.

Under the rule none of these rows dies. That is the case for L17, and this audit found nothing against it.

### C3. Gaps: a way or seat with no meaningful spell choice

1. **Every way, from hunted hour 6.** The last live spell opens at skill 20, which is Level 9 or 10. The last version opens at Level 60, hour 254. From there to Level 200 (hour 1,680) the bar never changes. Necrotic and Storm add two events, at hours 8 to 12 and 47 to 57. The long chase has no spell in it. This audit does not fill that with more spells. More buttons is not the fix: gear, uniques and the Tower own the long chase. It is named here so nobody reads "every way has a full kit" as "every Level has something to look forward to on the bar".
2. **The hammer, at every Level.** Three buttons, no rune, no element, and all three are slotted and never thought about again. After the merge it is two. This is the hammer's identity more than a fault: the hardest plain swing, the smallest bill, the least to set up. It is the right first weapon for a new player. Its first real choices are its Storm and Necrotic pair at Melee 25 and 40. PROPOSED: leave it so. The alternative is in section F.
3. **The crossbow, as a family.** It shares the bow's list row for row. The sixteen-spell plan counts eight families and writes a crossbow pair. `abilities.js` has seven lists. L44 either gives the crossbow its own list or ships fourteen spells.
4. **The tank alone.** Power Strike, Flame Strike and Mend. Low on purpose (RULED 11-19). Not a gap.
5. **The Healer in a party, on offense.** One row (Green Sickness). Low on purpose (the 0.30 cap). Not a gap.
6. **The Poison and Rupture families.** One live spell each. Thin, kept (B1).

### C4. Three things L17 must know before it sizes anything

1. **Fit at both ends.** A hero's blow grows 2.6 to 3.5 times from Level 10 to 60 (`spell-ratios.mjs`: the hammer 18 to 46, the wand 17 to 59). Today's casts grow about 2.4 times over the same Levels. So any share fitted at Level 60 lands lower at Level 10, and the proposed version steps (x1.6 across the five) widen that, because versions II to V arrive between Levels 8 and 60 and so act as a second Level curve. The table in B2 is that fit: 40 to 50% off at Level 10. PROPOSED for L17: fit each row at Level 10 and at Level 60, take the version step that falls out of the two (it will be well under x1.6), and report the pace of Levels 1 to 15 for a lone tank, a lone sword and a lone Mage. The early brackets of the Level curve were split on today's casts.
2. **Heals and shells are sized against a monster's blow, not the healer's.** The rule says a share of the caster's blow (RULED, 21-5) and the audit does not reopen it. But the thing a heal has to keep up with is the monster's blow, which is 22% of a hero's HP at every Level. Past 110 the staff's blow grows slower than HP, even on the ruled weapon line. PROPOSED: L17 adds a guard cell in monster blows (Greater Mend at least 1.0, Shelter at least 0.6, at every guard point), so the weapon line past tier 7 is sized to hold it when it is built.
3. **Mend cannot be one share of the blow.** It is one row for every weapon. A hammer's blow is 1.6 times a tank's at Level 10 and 1.4 times at 110, so the hardest hitter would be the best self-healer and the tank the worst (0.83 blows against 0.50). PROPOSED: Mend heals a share of max HP, about 11% (its Level 10 worth today). The fist line's own heal already has that form. This is an exception to 21-5 and is in section F.

### C5. Smaller findings

| # | Finding | Evidence | Goes to |
|---|---|---|---|
| 1 | 21-combat says the fist strikes "are already shares of the wraps' own blow". They are not: Hands is `dmg [8, 14]`, Palm `dmg [10, 18]`. Only the fist's own heal scales (a share of max HP). The fists need the same conversion as everyone | READ FROM DATA, `abilities.js` | L43 |
| 2 | Turning Cut and Raking Shot have the defense taken twice today: once in the blow, once off the cast. It costs them about a tenth at Level 110 | MEASURED, B2 (10% today, 11% under the rule) | L17 |
| 3 | Rend's worth is its bleed, and the bleed is a fixed number too: 1 to 3 a second, +0.4% a Melee level. Five stacks held are 52% of a monster a second at Level 10 and 9% at 110 | MEASURED, tool section 4 | L17 |
| 4 | Necrotic is strong on 101 of 190 monsters as staged (beasts, vermin and people take 15% more) and Storm on 7 (constructs). By Level the living classes fill Levels 2 to 40 and the undead, who resist it, fill 45 to 125. So Necrotic unlocks at about Level 28, just as the bestiary turns against it, and Storm has one weak monster below Level 173 | MEASURED, tool section 10 | L44 |
| 5 | Blight's Withered matters only where a monster mends. That is Krell's Hold today and the Ox Road when it opens | READ FROM DATA, `src/data/grounds/*/pack.js` | L44 |
| 6 | The melee swing at Level 185 lands 42 to 52% of the time. Nothing here fixes that. It is L15's | MEASURED, tool section 2 | L15 |

---

## D. Call 23-9: when the Storm and Bone families unlock

**Recommendation: Storm Runes at Runecrafting 65, Bone Runes at Runecrafting 80. Each family opens whole (all five tiers at once). The store sells its copy of each from the day the spells open. The spells keep weapon skill 25 and 40.**

What the audit adds to the items dive's reason ("so the skill has something new past 60"):

1. **They are the only two families no hero needs.** Every live family feeds a button a seat cannot play without: Fire is Fireball, Water is every heal, Earth is every shell, Ice is Frost Lance. Storm and Necrotic are ruled as a choice of element, worth at most 5% for one and 10% for both (RULED, 21-6). A late rune gate on them takes no button from anyone. A late gate on any of the first six would.
2. **Under the spell rule, a family is the only real event the ladder has left.** Today a rune tier is the big step: version V lands 4.1 times version I. Under the ruled rule a tier is about 15%. So the five tier unlocks at Runecrafting 1 to 60 become small, and the six live families all open at level 1. Two new families are the two biggest things Runecrafting can still hand a player. They should not be spent at level 1.
3. **Nobody is blocked, and the gap is what makes the rune worth binding.** A store rune lands 75% of a bound one (READ FROM DATA). So a hero casts Brand at Melee 25 on the store's rune from day one. A binder's own Fire cast still beats a store Storm cast on a neutral monster. Runecrafting 65 is the moment Storm becomes a real choice for a self-supplied hero, and 80 the same for Necrotic. That is a reason to level the skill and the first rune worth listing for a friend.
4. **The hours are right.** MEASURED, tool section 8: Runecrafting 60 is 46 chain hours, 65 is 60, 80 is 184, 99 is 1,073. With the Sealing Rune planned at 75 (121 hours) and a sixth tier held for 90 (454 hours), the ladder past 60 has something every 5 to 10 levels, which is what every other skill has. An Own four has about 140 town hero-hours a week (CITED, 23-items), so a binder is at 65 within days of Graven, and at 80 after about five weeks of one hero's town time or under two weeks of the whole four's.
5. **They arrive long before the monsters do.** Necrotic's ground is the Ox Road (Levels 112 to 128) and Storm's is the Old Guard (138 to 155, planned). A hero is at Level 110 after about 700 hunted hours. Any account that binds at all is past 80 by then.
6. **Bone is the later one because it is worth more.** As staged, Necrotic is strong on about half the bestiary and Storm on almost none of it (C5 row 4). The more valuable family should be the longer chase. It also keeps one order on the hero's side: Storm first, then Necrotic, for the spell and for the rune.

**Why the whole family at once.** A binder at 65 already has every tier's level. The tier a hero may cast is still gated by the caster's own skill (I to V at 1 / 15 / 30 / 45 / 60), as built. Splitting each family's five tiers over more levels would make a weak Chalked Storm Rune harder to bind than a Graven Fire Rune, which reads as a mistake.

**The alternative: Runecrafting 25 and 40, the same numbers as the spells.** You can bind what you can cast at the same level, which is the rule every other family follows. It is the simplest thing to teach. It leaves Runecrafting 61 to 99 as 1,027 hours of one recipe until a sixth tier exists. (The ruling page's alternative, all eight families from level 1, is worse than either: a rune bindable 24 levels before any hero can cast it.)

**What would change this answer.** If L17 keeps big version steps (a tier worth far more than 15%), reason 2 weakens. If the store's share moves off 75%, reason 3 has to be re-read. If L44 sizes either element above the ruled 5% and 10%, a late gate starts to cost power and the answer becomes 25 and 40.

---

## E. The order L17 and L44 should build in

**L17 (the spell rule), in this order:**

1. Plant the rule on a copy and fit every row at Level 10 and at Level 60 (C4 item 1). Print this audit's table again from the planted engine. Until that table reads right, nothing else is built.
2. The rows with no versions first: Power Strike, Precision Shot, Mend (as a share of max HP if section F item 4 is taken). They are the smallest change and the one a player feels in the first hour.
3. The damage rune rows. Rend last of them, with its bleed converted and held 8 s.
4. Heals and shells, with the guard cell in monster blows (C4 item 2). Shelter is sized here, before L18 touches the Tower.
5. The bar budget's data: Cleave out of both lists and off the default melee bar (`rule-subjects.js` `melee_dps`), Turning Cut's starting trigger at 2, Rend at 8 s. G23 green. A hero whose bar holds Cleave keeps a working bar: the slot becomes Turning Cut.
6. Re-measure: G2 (the ways), the pace of Levels 1 to 15, the wand against the hammer. Both paths, as the plan says.

**L43 (fists)** then converts its strikes with the same fit, gives the Hands one clock and makes the Palm stand in for them.

**L44 (Necrotic and Storm), in this order:**

1. The class layer first (C5 row 4): decide who is weak to what before any spell is sized, because a spell's worth on a ground is its element.
2. The four built rows re-sized under the rule. Updraft and Blight name the rows they stand in for.
3. The crossbow's own list, or the decision to ship fourteen.
4. The other twelve as a sample and then batches (DESIGN_STANDARDS, sample before expanding): the hammer's pair and the axes' pair first, since those two families have the least to choose from today. Every row names what it stands in for. The staff's pair stands in for Green Sickness or Undertow, and for Protective Ward.
5. The runes: Storm at Runecrafting 65, Bone at 80, ten recipe rows, the store's copies from the spells' unlock.
6. The go-live lane, with the art, as `necrotic-storm.js` already lists.

---

## F. Tyler rules on

1. **When Storm and Bone runes unlock (call 23-9).** Recommend Storm at Runecrafting 65 and Bone at Runecrafting 80. The whole family opens at once and the store sells both from the day the spells open, so nobody is blocked. Alternative: Runecrafting 25 and 40, the same numbers as the spells, which leaves Runecrafting with nothing new from 61 to 99.
2. **Cleave.** Recommend it merges into Turning Cut, which then fires from two monsters. They are the same button and Cleave is what puts axes and hammers over the bar budget. Alternative: keep Cleave for the hammer only, on an 8 second cooldown, and accept that the hammer has two sweeps that are never a choice.
3. **Rend.** Recommend an 8 second cooldown with a bleed that lasts 8 seconds and grows with the axes' own hit. Alternative: Rend stays at 6 seconds and the axes lose Power Strike instead.
4. **Mend, the self-heal everyone has.** Recommend it heals a share of your max HP, about 11 percent, at every Level. This is an exception to "every heal is a share of your own hit". Alternative: keep it a share of your hit, and a hammer then heals itself about 1.6 times what a tank does.
5. **The hammer.** Recommend it stays the simple weapon with two buttons until its Storm and Necrotic spells at Melee 25 and 40. Alternative: give it a hammer-only strike that spends an Earth rune, so it has a rune choice from Level 1 like the sword and the axes.
6. **The crossbow.** Recommend it gets its own spell list when Necrotic and Storm are built, so "each weapon type" is eight families and sixteen spells. Alternative: the bow and the crossbow keep sharing one list and one pair, and fourteen spells ship.
7. **Who is weak to Necrotic.** Recommend only people take more of it (humans and humanoids). Beasts and vermin take it in full. As staged it is the best element on about half of all monsters, which makes it an answer and not a choice. Alternative: keep it as staged and let the spell lane measure it.
8. **A caster's first hours under the spell rule.** Recommend the spell lane sizes every cast at Level 10 and at Level 60, so the Level 10 one-shot goes but heals and the first strikes are not cut in half. Alternative: size at Level 60 only as first written, and the first ten Levels get slower for every weapon except the hammer.

---

## G. Evidence register

**MEASURED:** `node tools/balance-sim/staged/spell-audit.mjs` (exit 0), sections 1 to 10: every number in B2, B3, C1, C2, C5 and the Runecrafting hours in D. `node tools/balance-sim/staged/spell-ratios.mjs` (exit 0) agrees with it at Levels 10 and 110 for every row both print, but for Rend, which this tool counts as its two hits.

**READ FROM DATA:** `src/data/abilities.js` (every row, lane, cooldown, mana, unlock, `replaces`, `party`, `alone`), `src/data/runes.js` (families, tiers), `src/data/necrotic-storm.js` and `src/data/fists.js` (the two switches), `src/data/statuses.js` (bleed, chill, sickness, Withered), `src/data/rule-subjects.js` (the default bars), `src/data/monster-classes.js` (the staged element layer), `src/core/hunt/status.js` (a new landing refreshes every stack), `src/core/hunt/damage.js` (the defense comes off before the version), `tools/balance-program/guard-cells.mjs` (the budget caps).

**CITED:** `21-combat.md` B4 and B5 (the rule, the opening sizes, the 6b sample's +12.8%, +29.2%, +2.7%, +8.5%), `23-items.md` section 4 (46 / 184 / 1,073 chain hours, 140 town hero-hours a week, the Sealing Rune at 75), `docs/design/itemization-plan.md` Appendix B3 (the sixteen spells and their names), `staged/morrow-grid.js` (the Old Guard's band).

**RULED:** tank spells party only and never a lone tank's kill speed, sword and shield slow alone on purpose (11-19). Necrotic and Storm, a spell for each weapon type, the Storm and Bone families (11-18). Every cast a share of the caster's blow (21-5), new spells replace a slot (21-6), 23-9 waits on this audit (11-20). Turning Cut for all melee without a shield (11-16). Undertow alone only (11-09). Spring Tide (11-08). Rune families and five tiers (10-23).

**ASSUMED:** skills past Level 100. The version steps and each row's share under the rule (the audit's fit, not L17's). The fist rows on the hammer's kit. The weapon line at 185 as a plain x Level / 110 on today's tier 7 weapon. That Runecrafting hours past 60 go with XP (checked at 80: 184 hours, as 23-items reads).

**PROPOSED:** every verdict, the unlock levels, the build orders, the eight items of section F.

**Not done.** Nothing was played. The rule was not planted in the engine. The merge of Cleave was not measured for pace (a hero cannot fire all its rows on one lane today, so the expectation is a small change, and L17's step 6 measures it). The narrowed Necrotic layer of F item 7 was not measured.
