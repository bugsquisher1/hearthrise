# 17. Talents as a map: the Roads

The approved direction for Talents (Tyler, 2026-11-22: "I like it a lot"). It replaces the move-ranks screen of `02-architecture.md` 1b and keeps its branches (`16-talent-branches.md`) as the crossroads. Only mechanics are taken from the genre's big talent trees. No names, layout, look or text are taken from any game. Every number is a starting value for the Balance Lab, not a measured one.

**The headline goal is build variety** (Tyler: "having a lot of options for unique builds is what will keep people hooked", "Theory crafting is fun", and "we need some more hybrid options and more choices"). That means many real paths for each weapon, hybrids that are real builds, and no single best build.

Sketch: `17-talent-tree-sketch.html` (desktop window and phone sheet, Charcoal & Gold tokens).

---

## 1. The name and the shape

**The window is called Talents.** That's the genre word and it stays. What it shows is **the Roads**: a map of the country around Havora, with the Great Hearth in the middle of town and roads leading out of it.

- **The Great Hearth is the start.** Every hero starts there, whatever they wield. It's the one node you own for free.
- **Seven countries, one per weapon,** in a ring of uneven regions around Havora. Going clockwise from the west: Club, Dual Axe, Ranged, Destruction, Shield, Restoration, Sword (the seven `DISCIPLINES` in `src/data/abilities.js`). Each touches two neighbors and the town. The order puts the hybrids people ask for side by side: Shield next to Restoration and Destruction, Sword next to Restoration, and Dual Axe next to Ranged.
- **Shared moves sit where their weapons meet.** Turning Cut (sword, axes, club) lives in Club country, between Sword and Dual Axe. Flame Strike and Power Strike live in Sword country, on the road out of Havora. A shield hero reaches them through town.
- **Node kinds, each named for something on a road:**

| Node | Looks like | What it is |
|---|---|---|
| Milestone | Small square stone | One small stat, or one rank of the move whose road it's on |
| Waystone | Ringed dot at the end of a dashed side path | A small rule with some flavor, like "+1 Bleed stack cap" |
| Crossroads | Diamond with 3 options | Pick 1 of 3. These are the branches from 16 |
| Border town | Small house on a border road | Pick 1 move from either country and use it with any weapon, at a cost |
| Hybrid crossroads | Dashed diamond past a border town | Pick 1 of 3 that combine the two countries. Opens only once you own a crossroads on each side |
| Vow | Red standing stone (dashed for hybrid vows) | A rule that changes how you play, with a cost |
| Open road | Three dots | One more rank of that move per point, forever |

Why roads: Hearthrise is a game of towns and roads (Havora, the Ox Road, Carter's Rest, the hearth everyone comes home to). A gold road map on charcoal, with a lit hearth in the middle, reads as ours from a screenshot. It isn't a starfield or a circle cut into parts.

## 2. How it plays

- **You get 1 point every Level,** starting at Level 2. Spend it on any node that touches a node you own.
- **Walking a move's road ranks it up.** Then the road forks three ways at crossroads I and again at crossroads II. Two dashed side paths leave every move road, each ending in a waystone.
- **Cross a border to break the weapon lock.** A border town lets you put one neighbor's move on your bar with your current weapon, at a cost. Past the town, a hybrid crossroads mixes the two countries.
- **Vows change the rules,** and each one has a cost. You can hold 1 vow at Level 30, 2 at Level 80 and 3 at Level 200. A hybrid vow takes a slot like any other.
- **Level 200 is a big deal.** It opens your third vow slot and one final form, a crossroads at the end of one move's road.
- **The rest is from 1b, unchanged:** drafts are free, applying a draft costs gold by Level, "Spend as suggested" can stay on, saved builds can be set per ground, and a death takes your last spends off first.

## 3. Breaking the weapon lock

Today your bar comes only from your weapon, which caps hybrids. Four ways were weighed.

| Option | Verdict | Why |
|---|---|---|
| **Border towns** | **Take it** | One point buys one neighbor's move with any weapon, at a stated cost. It's a node on the map, so it costs points, shows on a screenshot and resets like everything else. No new gear slot, no second item to find |
| **Hybrid crossroads at borders** | **Take it** | The fun half of a hybrid. Each border gets a fork of 3 options that only open when you own a crossroads in both countries. That's where a hybrid stops being two half builds |
| **Hybrid vows** | **Take it**, 7 of them, one per border | Build-defining rules for a two-country hero. They require a crossroads on both sides, so they can't be taken on the way past |
| Off-hand or second weapon slot | **Reject** | It adds a gear slot to every hero, a second weapon to find, trade and temper, and a second gear power budget. Bar slots would double. Border towns give the same freedom for points, with nothing new to carry |

**How a border town works.**

- Each of the 7 border towns offers 2 moves, one from each country. You pick 1. With the native weapon, a town pick does nothing, so in practice you take the other country's move.
- Label form: "Use Greater Mend with any weapon · −30% healing".
- **Borrowed: max 2.** Max 1 per town and 2 in total, counting Havora's crossing.
- **Havora crossing** sits on a short road in town and offers any move from any country, at −40%. It's the way to hybrid two countries that aren't neighbors.
- A borrowed move takes a normal bar slot. It still uses its rune or arrows. Party-only and solo-only rules still apply.
- A borrowed move uses whatever you own on its own road. A Shield hero who walks into Restoration and takes Split Mending gets a Split Mending Greater Mend, at −30%.
- A borrowed move scales with, and trains, the skill of the weapon you hold. That's a Systems call, flagged in section 13.

## 4. Node counts per country

Each move road has 4 milestones, crossroads I, 8 milestones and crossroads II (both pick 1 of 3), then the open road. Two side paths leave every move road (1 milestone and a waystone each). Roads cost 3 milestones from Havora, 2 between moves, and 2 to each vow. Club gets 2 extra side paths and Dual Axe gets 4. Each border road has 2 milestones, a town, a hybrid crossroads, 2 milestones and a hybrid vow.

| Country | Moves | Milestones | Waystones | Crossroads (options) | Vows | Points to own all |
|---|---|---|---|---|---|---|
| The Hearth | Mend, Havora crossing | 17 | 2 | 2 (6) | 0 | 22 |
| Shield | 3 | 59 | 6 | 6 (18) | 5 | 76 |
| Sword | 2 | 43 | 4 | 4 (12) | 5 | 56 |
| Club | 2 | 45 | 6 | 4 (12) | 5 | 60 |
| Dual Axe | 1 | 31 | 6 | 2 (6) | 5 | 44 |
| Ranged | 4 | 75 | 8 | 8 (24) | 5 | 96 |
| Destruction | 4 | 75 | 8 | 8 (24) | 5 | 96 |
| Restoration | 6 | 107 | 12 | 12 (36) | 5 | 136 |
| 7 border roads | 7 towns | 28 | | 7 hybrid (21) | 7 hybrid | 49 |
| **Total** | **23** | **480** | **52** | **53 (159)** | **42** | **635** |

Plus 23 open roads and 23 final forms (a hero takes one final form). The sketch is drawn from these counts.

What this means (COMPUTED):

- The first crossroads comes at Level 9 and the second at about Level 18.
- A Level 200 hero has 199 points, about 31% of the map.
- A pure healer owns all of Restoration and Mend by about Level 155, then spends into neighbors.
- Past about Level 590 a hero could own every milestone and waystone. They'd still be unique through their 53 picks, their three vows, their two borrowed moves and their final form.

**Small countries.** Club and Dual Axe are real choices until wave 3 adds Brand, Reave and the fist line:

- Club has 2 moves, since Turning Cut lives there now.
- Dual Axe has 4 extra side paths and 5 vows, all about Bleed.
- Each borders two countries, so each has two border towns and two hybrid vows.
- An axe hero has 44 points of their own, plus 14 on each of their two borders. That's 72 points of axe-themed choices before they touch anything generic.

## 5. Four countries laid out

Tooltip labels only. Crossroads I text is from `16-talent-branches.md`, unchanged. In 16, rank 15 depended on the rank 5 pick. On a map that would split every road into nine ends, so crossroads II doesn't depend on crossroads I here. Waystones are the same size as a milestone (section 9).

### Shield

| Road | Node | Tooltip |
|---|---|---|
| Havora to Shield | Milestone x3 | +2% max health / +2% armor / +2% max health |
| **Challenge** (known from Level 1) | Milestone x4 | +1 Challenge rank · Longer taunts |
| | Crossroads I | **Wide Challenge** (Suggested): Taunts up to 3 nearby enemies, −50% taunt duration · **Hard Challenge**: Taunted enemy deals 15% less damage to you while taunted · **Guarding Challenge**: Casts on its own when an enemy attacks a back-row ally, and taunts that enemy (party only) |
| | Milestone x8 | +1 Challenge rank |
| | Crossroads II | **Answering**: Next block after Challenge staggers the attacker · **Mended** (Suggested): +10% healing received while an enemy is taunted by you · **Echoing Challenge**: Recasts when a taunt ends early · +4s cooldown |
| | Side path | Milestone (+2% armor), then waystone: **Challenge range +1 tile** |
| | Side path | Milestone (+2% max health), then waystone: **Challenge: +3% armor for 4s** |
| To Frost Slam | Milestone x2 | +2% armor / +2% ward |
| **Frost Slam** (learned at Level 12, party only) | Milestone x4 | +1 Frost Slam rank · More damage, stronger Chill |
| | Crossroads I | **Long Frost** (Suggested): Chill lasts 6 s (from 4 s), +2 s cooldown · **Pinning Frost**: Hits your target only, +50% chill · **Slowing Frost**: Chill slows spell wind-ups 2x as much and attacks 50% less |
| | Milestone x8 | +1 Frost Slam rank |
| | Crossroads II | **Cold Ground** (Suggested): Frozen ground for 4s · Chills enemies on it · **Quick Slam**: −3s cooldown · −20% damage · **Wide Slam**: +1 tile radius · −15% damage |
| | Side path | Milestone (+2% ward), then waystone: **Chill also slows wind-ups 10%** |
| | Side path | Milestone (+2% armor), then waystone: **Frost Slam radius +1 tile** |
| To Shelter | Milestone x2 | +2% max health / +2% ward |
| **Shelter** (learned at Level 20, party only) | Milestone x4 | +1 Shelter rank · Bigger shields |
| | Crossroads I | **Steady Shelter** (Suggested): −40% shield, −15 s cooldown · **Deep Shelter**: Shields only the 2 lowest-health allies, +80% shield · **Stone Wall**: +100% shield on you, −30% shield on allies |
| | Milestone x8 | +1 Shelter rank |
| | Crossroads II | **Ready Shelter**: Casts when an ally drops below 30% health · +10s cooldown · **Long Shelter** (Suggested): +4s shield duration · **Bright Shelter**: +15% healing received while shielded |
| | Side path | Milestone (+2% ward), then waystone: **Shelter −5s cooldown** |
| | Side path | Milestone (+2% max health), then waystone: **Shelter: +10% shield on allies below 50% health** |
| (each move) | Open road | +1 rank of that move per point |
| Vow roads | Milestone x2 each | +2% max health / +2% armor |
| | **Vow: Hold Fast** | Requires Level 30 · Enemies attacking you can't switch targets · −25% damage dealt Best for: keeping a pack off your back row |
| | **Vow: Bodyguard** | Requires Level 30 · Take 30% of damage dealt to allies within 2 tiles · Max health from healing: 80% Best for: parties whose damage dealers can't take a hit |
| | **Vow: Cold Iron** | Requires Level 30 · When hit: Chill the attacker for 2s · −15% damage dealt Best for: packs that stay on you, melee-heavy grounds |
| | **Vow: Unbroken** | Requires Level 30 · A lethal hit leaves you at 1 health for 3s · 60s cooldown · −10% max health Best for: Bold stance, bosses with big single hits |
| | **Vow: Front Line** | Requires Level 30 · Allies within 2 tiles: +10% damage dealt · −15% damage dealt by you Best for: parties of four with melee damage dealers |

### Restoration

| Road | Node | Tooltip |
|---|---|---|
| Havora to Restoration | Milestone x3 | +2% max mana / +2% healing done / +2% mana regeneration |
| **Greater Mend** | Milestone x4 | +1 Greater Mend rank · More healing |
| | Crossroads I | **Quick Mending**: −50% healing, 1 s cooldown · **Deep Mending**: Only casts on allies below 40% health, +60% healing · **Split Mending** (Suggested): 30% of the heal also lands on the next lowest-health ally |
| | Crossroads II | **Thrifty Mending** (Suggested): 50% mana back on targets below 25% health · **Lingering Mending**: 25% of the heal again over 4s · **Reaching Mending**: +3 tiles range |
| | Side paths | Waystones: **Greater Mend range +1 tile** / **Greater Mend −2 mana cost** |
| **Circle of Renewal** | Milestone x2, then x4 | +2% healing done / +2% max mana, then +1 Circle of Renewal rank |
| | Crossroads I | **Lasting Circle** (Suggested): Heals over 6 s instead of at once, +30% healing · **Tight Circle**: Only allies within 3 tiles, +40% healing · **Light Circle**: −40% mana, −25% healing |
| | Crossroads II | **Wide Circle**: +3 tiles reach · −15% healing · **Mana Circle** (Suggested): +2% mana to each ally healed · **Fast Circle**: −25% cooldown · −20% healing |
| | Side paths | Waystones: **Circle radius +1 tile** / **Circle −5s cooldown** |
| **Spring Tide** (learned at Level 20) | Milestone x2, then x4 | +2% mana regeneration / +2% max health, then +1 Spring Tide rank |
| | Crossroads I | **Ebb Tide**: −50% healing, −50% cooldown, −50% mana · **High Tide** (Suggested): Healing past full health stays as a shield · **Turning Tide**: +50% healing on allies below 30% health, −25% on the rest |
| | Crossroads II | **Rising Tide** (Suggested): −15s cooldown · **Clearing Tide**: Removes 1 harmful effect from each ally healed · **Deep Tide**: +30% healing · +20s cooldown |
| | Side paths | Waystones: **Spring Tide: +2% mana to you** / **Spring Tide −10s cooldown** |
| **Green Sickness** | Milestone x2, then x4 | +2% ward / +2% max mana, then +1 Green Sickness rank |
| | Crossroads I | **Lingering Sickness** (Suggested): Sickness lasts 10 s (from 6 s), −30% damage · **Single Dose**: Hits the target only, Sickness 20% (from 10%) · **Draining Sickness**: Heals the lowest-health ally for 20% of damage dealt |
| | Crossroads II | **Weakening Sickness** (Suggested): Sick enemies: −10% damage dealt · **Wide Sickness**: Also hits enemies next to the target · −20% damage · **Fast Sickness**: −3s cooldown · −20% damage |
| | Side paths | Waystones: **Sickness +1s** / **Green Sickness −2 mana cost** |
| **Protective Ward** | Milestone x2, then x4 | +2% healing done / +2% ward, then +1 Protective Ward rank |
| | Crossroads I | **Tank Ward** (Suggested): +40% shield, only on the ally with the most enemies on them · **Twin Ward**: Shields 2 allies, −40% shield each · **Lasting Ward**: Unused shield returns as mana when recast, −20% shield |
| | Crossroads II | **Quick Ward** (Suggested): −30% cooldown · −20% shield · **Mending Ward**: +10% healing received while the ward holds · **Deep Ward**: +30% shield · +6s cooldown |
| | Side paths | Waystones: **Ward +1s duration** / **Ward: +10% shield on your tank** |
| **Undertow** (solo only) | Milestone x2, then x4 | +2% max health / +2% mana regeneration, then +1 Undertow rank |
| | Crossroads I | **Heavy Undertow** (Suggested): Target deals 20% less damage for 4 s, −20% damage · **Riptide**: Also hits enemies next to the target, −40% damage · **Drowning Pull**: 30% of damage dealt heals you, −20% damage |
| | Crossroads II | **Cold Undertow**: Chill for 2s · **Deep Pull** (Suggested): +30% damage vs enemies below 50% health · **Dragging Undertow**: Pulls the target 2 tiles toward you |
| | Side paths | Waystones: **Undertow range +1 tile** / **Undertow −2s cooldown** |
| (each move) | Milestone x8 between the forks | +1 rank of that move |
| (each move) | Open road | +1 rank of that move per point |
| Vow roads | Milestone x2 each | +2% healing done / +2% max mana |
| | **Vow: Watchful Healing** | Requires Level 30 · Requires staff · +40% healing while an enemy is winding up · −15% healing at other times Best for: grounds full of casters and big wind-ups |
| | **Vow: Still Mind** | Requires Level 30 · +100% mana regen after 3s without casting · +30% spell mana cost Best for: long hunts with quiet gaps between pulls |
| | **Vow: Fast Renewal** | Requires Level 30 · Requires staff · Heals over time tick 2× as fast · +40% mana cost on instant heals Best for: steady area damage |
| | **Vow: Battle Healer** | Requires Level 30 · Requires staff · Undertow usable in a party · +30% Undertow and Green Sickness damage · +25% heal mana cost Best for: parties that need more damage than healing |
| | **Vow: Lifeline** | Requires Level 30 · Requires staff · Heals on allies below 25% health: instant, no mana · 10s cooldown per ally · −10% healing Best for: Deadly grounds with spiky damage |

### Club

| Road | Node | Tooltip |
|---|---|---|
| Havora to Club | Milestone x3 | +2% max health / +2% damage / +2% armor |
| **Quarry Blow** | Milestone x4 | +1 Quarry Blow rank · More damage |
| | Crossroads I | **Breaking Blow** (Suggested): Applies Sickness (target takes 10% more damage for 6 s), −30% damage · **Rockfall**: Hits the 3×3 area around the target, −50% damage · **Cold Stone**: +40% damage vs chilled targets |
| | Crossroads II | **Long Sickness** (Suggested): +3s Sickness from Quarry Blow · **Heavy Quarry**: +30% damage · +3s cooldown · **Cold Quarry**: Chill for 2s |
| | Side paths | Waystones: **Quarry Blow −1s cooldown** / **Quarry Blow: −5% enemy armor for 4s** |
| **Turning Cut** (learned at Level 10) | Milestone x2, then x4 | +2% damage / +2% armor, then +1 Turning Cut rank |
| | Crossroads I | **Wide Turn** (Suggested): Hits enemies up to 2 tiles away, −25% damage · **Close Turn**: +40% damage, 3 targets max · **Bleeding Turn**: Applies 1 Bleed stack to each target, −30% damage |
| | Crossroads II | **Fast Turn** (Suggested): −2s cooldown · **Guarded Turn**: −5% damage taken per enemy hit for 3s · max 15% · **Reaping Turn**: +20% damage vs enemies below 30% health |
| | Side paths | Waystones: **Turning Cut +1 max target** / **Turning Cut −1s cooldown** |
| Extra side paths | Waystone x2 | **Sickness you apply +1s** / **Hits on Sick enemies: +1 mana** |
| (each move) | Milestone x8 between the forks, open road | +1 rank of that move |
| Vow roads | Milestone x2 each | +2% damage / +2% max health |
| | **Vow: Crushing Blows** | Requires Level 30 · Attacks ignore 30% of armor · +25% cooldowns Best for: high-armor Brutes |
| | **Vow: Aftershock** | Requires Level 30 · Requires club · Quarry Blow hits again after 2s for 40% · +4s Quarry Blow cooldown Best for: tough packs that stand still |
| | **Vow: Lingering Blows** | Requires Level 30 · Requires club · Hits refresh Sickness · −15% damage vs enemies without Sickness Best for: bosses, long fights |
| | **Vow: Braced** | Requires Level 30 · −20% damage taken while all your attacks are on cooldown · −10% damage dealt Best for: solo melee, burst then hold |
| | **Vow: Ground Breaker** | Requires Level 30 · Requires club · Quarry Blow leaves broken ground for 4s · Enemies on it: −15% armor · +3s Quarry Blow cooldown Best for: parties of melee hitters |

### Dual Axe

| Road | Node | Tooltip |
|---|---|---|
| Havora to Dual Axe | Milestone x3 | +2% damage / +2% max health / +2% damage |
| **Rend** | Milestone x4 | +1 Rend rank · More Bleed damage |
| | Crossroads I | **Deep Cuts** (Suggested): Bleed lasts 50% longer · **Spread**: Bleed jumps to 1 nearby enemy when the target dies · **Quick Rend**: −30% cooldown, −20% Bleed damage |
| | Crossroads II | **Deep Wounds** (Suggested): +20% damage vs 5+ Bleed stacks · **Fast Bleed**: Bleed ticks 20% faster · **Fresh Cuts**: Rend hits refresh all Bleed stacks |
| | Side paths | Waystones: **Bleed stack cap +1** / **Bleed ticks 10% faster** |
| Extra side paths | Waystone x4 | **Rend −1s cooldown** / **First hit on a new target: +1 Bleed stack** / **Kills on bleeding enemies: +2% health** / **Bleeding enemies: −5% damage dealt** |
| (Rend) | Milestone x8 between the forks, open road | +1 Rend rank |
| Vow roads | Milestone x2 each | +2% damage / +2% max health |
| | **Vow: Open Wounds** | Requires Level 30 · Requires axes · Bleed stacks up to 10 · −40% damage per Bleed stack Best for: long fights, bosses |
| | **Vow: Frenzy** | Requires Level 30 · Requires axes · −3% cooldowns per bleeding enemy within 3 tiles · max 15% · +10% damage taken Best for: big packs in a party |
| | **Vow: Twin Rend** | Requires Level 30 · Requires axes · Rend: 2 charges · −25% Rend damage Best for: fast pulls, spreading Bleed |
| | **Vow: Bleed Out** | Requires Level 30 · Requires axes · Bleeding enemies below 15% health die · −20% Bleed damage Best for: tough enemies with lots of health |
| | **Vow: Clean Cuts** | Requires Level 30 · Requires axes · Bleed deals all its damage at once · Bleed can't stack Best for: swarms that die before Bleed ticks |

**Checked against 14, 15 and 16** (2026-11-22). These were cut or reworded because they repeated something:

- A damage cut on a Greater Mend target (Signature #17).
- Sickness jumping on death (#28).
- A ward that hits back (#21).
- "Less damage from chilled enemies" (Trait #25).
- Challenge applying Chill (#1, so Frost Warden uses Cold Shoulder below).
- Circle giving damage to the allies it heals (#18).
- Hunter's Mark moving on death (#9).

Healing Shelter heals when Shelter is cast. #26 heals when an earth-rune shield breaks. They're different triggers and both can be worn.

**Bleed cap with the waystone:** 5, then 6 with the waystone or #29, and 7 with both. Open Wounds sets 10, and nothing adds to it.

## 6. The seven borders

| Border | Town (pick 1) | Hybrid crossroads (pick 1 of 3) | Hybrid vow |
|---|---|---|---|
| **Club · Dual Axe** | Use Rend with any weapon · −30% damage / Use Quarry Blow with any weapon · −30% damage | **Crushing Cuts**: Rend: 2 Bleed stacks on Sick enemies · **Torn Armor**: Bleeding enemies: −10% armor · **Heavy Bleed**: Quarry Blow +5% damage per Bleed stack | **Butcher**: Requires Level 30 · Requires a Club and a Dual Axe crossroads · Bleed kills: Quarry Blow ready again · −20% Rend damage |
| **Dual Axe · Ranged** | Use Rend with any weapon · −30% damage / Use Raking Shot with any weapon · −30% damage · Uses arrows | **Barbed Arrows**: Precision Shot: 1 Bleed stack · **Marked Wounds**: Bleed ticks 20% faster on marked enemies · **Open Shot**: Precision Shot +3% damage per Bleed stack | **Blood Trail**: Requires Level 30 · Requires a Dual Axe and a Ranged crossroads · Ranged attacks: 1 Bleed stack · −15% ranged damage |
| **Ranged · Destruction** | Use Hunter's Mark with any weapon · −30% mark effect / Use Frost Lance with any weapon · −30% damage | **Frost Arrows**: Precision Shot: Chill for 2s · −15% damage · **Spell Mark**: Fireball +15% damage vs marked enemies · **Mana Arrows**: Precision Shot +20% damage · +6 mana cost | **Spellbow**: Requires Level 30 · Requires a Ranged and a Destruction crossroads · Ranged attacks deal frost damage · +3 mana per ranged attack |
| **Destruction · Shield** | Use Hoarfrost with any weapon · −30% damage / Use Challenge with any weapon · −30% taunt duration | **Cold Shoulder**: Taunted enemies: +15% frost damage taken · **Frost Shelter**: Shelter: Chill attackers of shielded allies for 2s · **Rime Plate**: +3% armor per Chilled enemy within 2 tiles · max 15% | **Winter Guard**: Requires Level 30 · Requires a Destruction and a Shield crossroads · Chilled enemies: −10% damage to allies within 3 tiles · −10% damage dealt |
| **Shield · Restoration** | Use Greater Mend with any weapon · −30% healing / Use Shelter with any weapon · −30% shield | **Healing Shelter**: Shelter heals 50% of the shield · **Guarded Mend**: +20% Greater Mend on taunting allies · **Taunting Guard**: Challenge: +5% max health shield per enemy taunted | **Shield Priest**: Requires Level 30 · Requires a Shield and a Restoration crossroads · Block: heal 3% max health · −20% healing on others |
| **Restoration · Sword** | Use Circle of Renewal with any weapon · −30% healing / Use Flame Strike with any weapon · −30% damage | **Mending Strike**: Flame Strike: heal the lowest-health ally for 25% of damage dealt · **Mana Strike**: Power Strike hits: +2% mana · **Second Strike**: After a heal, next Flame Strike +20% damage | **Mending Blade**: Requires Level 30 · Requires a Restoration and a Sword crossroads · 15% of melee damage heals the lowest-health ally · −20% spell healing |
| **Sword · Club** | Use Flame Strike with any weapon · −30% damage / Use Quarry Blow with any weapon · −30% damage | **Tempered Strikes**: Power Strike after Quarry Blow: +25% damage · **Cutting Weight**: Turning Cut +15% damage vs Sick enemies · **Iron Rhythm**: Turning Cut hits: Power Strike −1s cooldown | **Smith's Arm**: Requires Level 30 · Requires a Sword and a Club crossroads · Power Strike and Quarry Blow share a cooldown · +40% damage on both |

**Havora crossing:** Use any move with any weapon · −40% power. Counts toward the 2 borrowed moves.

## 7. The other vows

Sword, Ranged and Destruction have 5 vows each. Tooltip labels.

| Vow | Country | Tooltip | Best on | Weak on |
|---|---|---|---|---|
| **Single Combat** | Sword | +20% single-target damage · −40% damage on attacks that hit 2+ enemies | Bosses, Brutes | Swarms |
| **Riposte** | Sword | Requires sword · After a block: next Flame Strike or Power Strike free, +30% damage · 6s cooldown · −10% armor | Hard hitters | Casters (no blocks to answer) |
| **Flowing Cuts** | Sword | Requires sword · +6% damage per different move in a row · max 3 · Same move twice: reset | Long fights with a full bar | Short pulls |
| **Duelist's Guard** | Sword | Requires sword · −20% damage taken from your target · +10% damage taken from others | Bosses, solo vs one enemy | Swarms |
| **Pressing Attack** | Sword | +4% damage per hit on the same target · max 20% · New target: reset | Bosses | Packs that die fast |
| **Long Range** | Ranged | Requires bow or crossbow · +2 attack range · +25% damage taken from enemies in melee range | Parties with a tank, Shooters | Solo vs Stalkers |
| **Marked Prey** | Ranged | Requires bow or crossbow · Hunter's Mark lasts until the target dies · −30% damage vs unmarked enemies | Bosses, one big target at a time | Packs |
| **Point Blank** | Ranged | Requires bow or crossbow · +25% damage vs enemies within 2 tiles · −20% damage beyond 4 tiles | Solo, Stalkers | Shooters at range |
| **Volley Stance** | Ranged | Requires bow or crossbow · −30% Flame Volley and Raking Shot cooldowns · Precision Shot unusable | Big packs | Bosses |
| **Hail of Arrows** | Ranged | Requires bow or crossbow · Attacks hit 1 extra enemy · −35% damage per hit | Packs of 3+ | Single targets |
| **Cold Focus** | Destruction | Requires wand · +20% frost spell damage · +2s Chill duration · Can't cast fire spells | Caster grounds, protecting a party | Fire-weak grounds, big packs |
| **Fire Focus** | Destruction | Requires wand · +20% fire spell damage · Fireball +1 tile radius · Can't cast frost spells | Big packs, fire-weak grounds | Casters (no Chill) |
| **Echo Cast** | Destruction | Requires wand · 20% chance: spell casts twice · +25% spell mana cost | Short hunts, big mana pools | Long hunts |
| **Barrier Mage** | Destruction | Requires wand · Arcane Barrier recasts when it breaks · 20s cooldown · −20% spell damage while it holds | Solo, Deadly grounds | Speed farming |
| **Heavy Casting** | Destruction | Requires wand · +40% spell damage · +50% cooldowns | Bosses, tough single enemies | Swarms |

**Stacking.** Every vow is a rule row on a stacking key from `15-signature-candidates.md`. Winter Guard and Weakening Sickness are on "monster deals less damage", so the largest counts. Echo Cast and Riposte are on "free casts and cooldown resets", so a free cast can't set off another. Cold Focus and Fire Focus can't both be held.

## 8. Builds: the map, Traits and Signatures together

A build has four layers:

- **The map:** crossroads, waystones, borrowed moves, vows and final form.
- **Traits:** up to one gear tier of them (`14-trait-candidates.md`).
- **One Signature** (`15-signature-candidates.md`).
- **The bar:** which moves, in what order.

Each layer reads something different. The map changes your moves, Traits pay off when a condition is met, and the Signature links two things. A strong build makes all four point the same way. That's the theorycraft.

How much room there is (COMPUTED). Shield alone has 9 x 9 x 9 = 729 ways to pick its six crossroads. Add 2 waystones a move, 42 vows for 3 slots, and 15 borrowed-move picks for 2 slots. Most combinations won't be good. The point is that the good ones aren't all the same.

### Ten example builds

| Build | Weapon and countries | Key nodes | Vows | Traits | Signature |
|---|---|---|---|---|---|
| **Bleed Axe** | Axes. Club border for Turning Cut | Rend: Deep Cuts, Deep Wounds. Turning Cut: Bleeding Turn. Waystone: Bleed stack cap +1 | Open Wounds, Bleed Out | #4 Worrier, #21 Scorched Grip, #30 Lime Pit | #7 Floodwater Hatchets |
| **Frost Lock Mage** | Wand | Hoarfrost: Deep Hoarfrost. Frost Lance: Shatter. Arcane Barrier: Thick Barrier | Cold Focus, Still Mind | #5 Snuffed, #18 Floodmark, #16 Full Wick | #15 Catacomb Shroud |
| **Shield-Heal** | Staff. Shield border | Greater Mend: Split Mending. Protective Ward: Twin Ward. Town: Use Shelter with any weapon | Bodyguard, Still Mind | #23 Behind the Bar, #29 Crag Shelter, #6 Last File | #36 Cairn Belt |
| **Mark Sniper** | Bow | Hunter's Mark: Long Mark. Precision Shot: Aimed Shot | Long Range, Marked Prey | #22 Slate Hand, #34 Lookout's Promise, #2 Soft Scale | #9 Lurcher's Collar |
| **Armor Breaker** | Club. Sword country for Power Strike | Quarry Blow: Breaking Blow, Heavy Quarry. Power Strike: Heavy Strike | Crushing Blows, Ground Breaker | #3 Ram's Head, #37 Hask's Bargain, #27 Captain's Due | #8 Stable Troll's Maul |
| **Battle Priest** (new) | Sword. Restoration border | Flame Strike: Finishing Strike. Power Strike: Guard Strike. Town: Use Circle of Renewal with any weapon (Lasting Circle). Hybrid crossroads: Mending Strike | Mending Blade, Pressing Attack | #14 Goaded, #11 Pyre Tender, #39 Bolting Team | #18 Brewer's Apron |
| **Frost Warden** (new) | Sword and shield. Destruction border | Challenge: Hard Challenge. Frost Slam: Long Frost. Town: Use Hoarfrost with any weapon (Deep Hoarfrost). Hybrid crossroads: Rime Plate | Winter Guard, Cold Iron | #25 Numbed, #7 Bailey Stand, #5 Snuffed | #42 Night Carter's Boots |
| **Bleed Ranger** (new) | Bow or crossbow. Dual Axe border | Raking Shot: Clean Sweep. Precision Shot: Piercing Shot. Hybrid crossroads: Open Shot. Waystone: Bleed stack cap +1 (walked into Dual Axe) | Blood Trail, Long Range | #4 Worrier, #19 Ledge Footing, #2 Soft Scale | #12 Wyvern Barb Crossbow |
| **Spellbow** (new) | Bow. Destruction border | Hunter's Mark: Long Mark. Town: Use Frost Lance with any weapon (Chilling Lance). Hybrid crossroads: Frost Arrows | Spellbow, Marked Prey | #16 Full Wick, #22 Slate Hand, #13 Slack Water | #11 Provost's Longbow |
| **Crush and Bleed** (new) | Club. Dual Axe border | Quarry Blow: Breaking Blow. Town: Use Rend with any weapon (Deep Cuts). Hybrid crossroads: Heavy Bleed | Butcher, Lingering Blows | #4 Worrier, #30 Lime Pit, #3 Ram's Head | #43 Bull's Tooth |

Shield-Heal can also be built the other way round. A sword-and-shield tank takes the town's Greater Mend, the Healing Shelter crossroads, and Shield Priest with Hold Fast, wearing #3 Grave Guard's Mail.

### Each build is best somewhere and on none of them all

| Build | Swarms | Brutes | Casters, Shooters | Bosses | Solo | Party of 4 | Bold stance |
|---|---|---|---|---|---|---|---|
| Bleed Axe | Weak | Good | OK | **Best** | Good | OK | OK |
| Frost Lock Mage | Weak | OK | **Best** | Good | OK | Good | Good |
| Shield-Heal | OK | Good | OK | OK | **Best** (duo, no tank) | Weak | OK |
| Mark Sniper | Weak | OK | Good | **Best** | Weak | Good | OK |
| Armor Breaker | Weak | **Best** | Weak | Good | OK | OK | Good |
| Battle Priest | OK | Good | Weak | OK | Good | **Best** (no healer) | OK |
| Frost Warden | Good | Good | **Best** | OK | OK | Good | Weak |
| Bleed Ranger | Weak | **Best** | OK | Good | Good | OK | OK |
| Spellbow | OK | Good | Good | Good | Weak | OK | **Best** |
| Crush and Bleed | OK | Good | Weak | **Best** | OK | Good | OK |

These marks are design intent (JUDGMENT), not measurements. Section 9 has the Lab check that holds them. Swarms are still thin. Fire Focus, Hail of Arrows, Volley Stance and Clean Cuts are the pack vows, and a sample pack build from them goes in the Lab library next.

## 9. The balance rule

One step is one Level of rating (`04-math-strategy.md` section 1). At `payStep` 0.7%, a step held is about 0.7% pace (COMPUTED there). Everything below is sized in those steps.

| Node | Size | Why |
|---|---|---|
| Milestone | `pointShare` of a Level's step, starting at 1/3 step (about 0.23% pace). Every milestone is the same size, rank or stat | It's the 1b point. It puts a hero on the curve, not above it |
| Waystone | Same as a milestone. Its flavor is budget-neutral across the ground mix | Flavor, not power. It can't be felt alone, and it can tip a build |
| Crossroads, hybrid crossroads | Costs 1 point and carries a milestone's share. Options are budget-neutral across the mix. On any one ground, best and worst option are at most 3 steps apart (about 2%) | Options differ by what they're good against, not by size |
| Border town | Costs 1 point. A borrowed move at −30% (−40% from Havora) and equal points lands at least 3 steps behind the same move in its native hands | A hybrid gains reach, never the native's job done better |
| Vow, hybrid vow | Costs 1 point, no milestone share. +3 to +4 steps where it fits, at least −3 where it doesn't. Mean across the mix between −1 and +1 step | A trade, not an upgrade. Slots at 30, 80 and 200 |
| Final form | Sized like a crossroads | Level 200 changes how a move plays, not a number |

- **The ceiling.** With Traits and a Signature worn, the best build the Lab can find beats the suggested path by at most 5 to 10% pace (7 to 14 steps) at the edge of a step on a mix of grounds. That's the 1b ceiling, the 14 Trait cap (one gear tier) and the 15 Signature size, all on one ledger. The suggested path holds its own suggested vows.
- **No single best build.** The Lab keeps a library of named builds: the ten above, then one hybrid for each of the 7 borders, then more. Its cells are a ground's monster mix x party size x stance. The targets are hypotheses:
  - Every build in the library is top 3 in at least one cell.
  - No build is top in more than 25% of cells.
  - A build that fails either target gets rewritten, not buffed.
- **Hybrids aren't traps.** Border milestones are the same size as any milestone, a town is one point, and the hybrid crossroads and vows sit on the same budget as native ones. A hybrid loses depth in its own moves, not power. The Lab reads each border's hybrid build with the same top-3 test.
- **Vows on one key don't pile up.** Two vows on the same key follow that key's rule: the largest counts, or they add up to the key's cap.

## 10. Theorycrafting tools

| Tool | What it does | Server work |
|---|---|---|
| **Build planner** | Draft a whole build (map, Traits, Signature, bar) without spending points, even past your Level, and save it as a plan. A plan can be applied later, cut to your points | Yes. Drafting happens only in the browser. Saving a plan is a server write: the server checks every node id, road link, pick, borrowed-move count, vow count, and Trait or Signature id against its own catalogue, and caps the plan's size and the number of plans |
| **Share codes** | A short build code to copy and paste. Ladder entries get a **Copy build** button | Yes. The server makes codes from builds it holds, never the browser. A pasted code is decoded and checked like a saved plan, and anything unknown is refused. Codes hold node ids and picks only, never points, gold or items. Applying one is a normal reset, cut to your points |
| **Test on the dummy** | Run a drafted build on the house training dummy (`src/data/gold-sinks.js`) and read the analyzer: damage, healing, mana per minute | Yes. The server runs the one combat engine on the draft for a short fight, with no XP, gold or loot. Runs per hour are limited to keep server cost down |
| **Details** | A toggle on tooltips that shows exact numbers and stacking keys. Cards stay short when it's off | No. It reads the catalogue numbers the tooltip already uses |

## 11. The Roads against the move-ranks design

| | Move ranks and branches (1b, 16) | The Roads |
|---|---|---|
| Where the build lives | On the bar | On a map. The bar card still shows rank and branch, read from the same rows |
| What a point buys | One rank of a move you know | A rank, a stat, a waystone, a crossroads, a border town or a vow |
| Build-defining choices | Branch picks | 3-way picks at every fork, 7 hybrid crossroads, 42 vows for 3 slots, 2 borrowed moves |
| Hybrids | A second weapon's moves, if you train them | Border towns break the weapon lock. Hybrid crossroads and vows reward it |
| Long chase | Ranks with no top. Level 200 final form | The map fills up. Vow slots at 30, 80 and 200. Final form. Open roads |
| New player | Easy | Harder. "Spend as suggested" and a gold suggested road carry it |
| Phone | One card | Pan and zoom map plus a side card (see the sketch) |
| Writing cost | About 8 branch rows a move | 6 crossroads options and 2 waystones a move, 42 vows, 21 hybrid options |
| Risk of one best path | Low | Higher, because vows and borrowed moves are strong. Held by section 9 |
| Looks like ours | No screen of its own | A road map out of Havora |

## 12. How to build it

1. **One set of data, two views.** The map is the move ranks and branches laid out as roads, plus stats, waystones, towns and vows. There's still one build, and the bar card keeps showing rank and branch.
2. **Sample first.** Lay out Shield, Restoration, the Hearth and the Shield · Restoration border, then play them on a phone at 922 x 423 with "Spend as suggested" on and off. The other countries come after that (`DESIGN_STANDARDS.md` section 9).
3. **Vows and borders are the point.** Milestones are the measured 2% that can't be felt, so the fun lives in forks, vows and borrowed moves. If the sample shows a vow that's always right or never worth it, fix the vow before adding milestones.

## 13. Hand-offs

| To | What |
|---|---|
| Systems | Borrowed moves: which skill a borrowed move scales with and trains (proposed: the weapon you hold), and its rune or ammo use. The border town and vow rows need adjacency, "requires a crossroads in both countries" gates, and borrowed and vow slot counts, all checked on the server |
| Systems | New engine pieces: take damage for an ally (Bodyguard), lethal hit to 1 health (Unbroken), shared cooldown (Smith's Arm), damage type change (Spellbow), charges (Twin Rend), Bleed paid at once (Clean Cuts), execute (Bleed Out) |
| Backend | Plan slots, share codes and dummy runs are new server surfaces. All of them are in the pre-EA Security review |
| Art | Node shapes, the ring of countries, and the phone zoom levels. The sketch is rough. Restoration is crowded with six moves and needs more room |

## 14. Repeated decisions (the first principle)

| Where a player could repeat a choice | How it's removed |
|---|---|
| Spending a point every Level | "Spend as suggested", or a saved plan's order, as a standing rule |
| The same build on a second hero | Copy build from another hero or a ladder entry, or a share code |
| Changing builds for a hall | A saved build per ground in the company plan, applied at the Start |
| A death takes a Level | The last spend comes off, and the standing rule puts it back on the next Level |
| New countries add roads | The standing rule follows the suggested road into them |

## 15. Walk-through: a new Shield hero on the suggested road

Wielding a sword and shield, with "Spend as suggested" on. Move unlock Levels are from `src/data/abilities.js` (Challenge has no unlock, Frost Slam unlocks at 12, Shelter at 20). Every node is one in sections 5 and 6.

| Level | Point | Owned before this step | Spends on | Doable because |
|---|---|---|---|---|
| 1 | none | The Great Hearth | nothing | Points come with each Level gained |
| 2 to 4 | 1 to 3 | Hearth | Havora to Shield milestones | Each touches the last |
| 5 to 8 | 4 to 7 | Entry road | Challenge ranks 1 to 4 | Challenge is known from Level 1 |
| 9 | 8 | Challenge rank 4 | Challenge crossroads I: Wide Challenge | Next to rank 4. Guarding is party only, so the suggestion skips it |
| 10 to 17 | 9 to 16 | Crossroads I | Challenge ranks 5 to 12 | The road continues |
| 18 | 17 | Rank 12 | Challenge crossroads II: Mended | Next to rank 12 |
| 19 to 20 | 18 to 19 | Challenge ranks | Road to Hold Fast, 2 milestones | It leaves Challenge's road after crossroads I. The vow needs Level 30 |
| 21 to 22 | 20 to 21 | Shield junction | Road to Frost Slam, 2 milestones | Next to the junction |
| 23 to 26 | 22 to 25 | Frost Slam road start | Frost Slam ranks 1 to 4 | Frost Slam learned at Level 12 |
| 27 | 26 | Frost Slam rank 4 | Frost Slam crossroads I: Long Frost | Next to rank 4 |
| 28 | 27 | Shield junction | Shield · Restoration border road, milestone 1 | The border road leaves the Shield junction |
| 29 | 28 | Challenge rank 3 | Challenge side path milestone (+2% armor) | The side path leaves rank 3 |
| 30 | 29 | Hold Fast road | **Vow: Hold Fast** | Requires Level 30, and its road is owned |
| 31 to 32 | 30 to 31 | Border milestone 1 | Border milestone 2, then the border town: Use Greater Mend with any weapon | Next to each other. Greater Mend takes a free bar slot and uses its water rune |

That's the gold build in the sketch at Level 34, with 2 points unspent. The hybrid crossroads past the town stays locked until this hero owns a Restoration crossroads, which is 9 more points into Greater Mend's road.

## 16. Open questions

- Is −30% right for a borrowed move, and −40% from Havora? The Lab sets both against the "3 steps behind native" rule.
- Two borrowed moves: is that enough for hybrids, or does a third at Level 200 fit beside the third vow?
- Vow slots at 30, 80 and 200. With 42 vows, is 80 too late for a second?
- Does Restoration need a bigger country on the map, or a zoomed default view on phones?
