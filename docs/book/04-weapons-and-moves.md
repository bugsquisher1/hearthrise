# 4. Weapons and moves

Every weapon, every move, the action bar that runs them, and the effects they leave behind.

---

## 4.1 Weapon ways
**[Unchanged]** (the wraps are new)

A hero can pick up any weapon. The weapon decides the hero's "way" (the game's word is discipline), which moves they know, and which skill trains.

| Way | Weapon | Trains | Seat in a party | Armor that suits it |
|---|---|---|---|---|
| **Shield** | Sword and shield | Melee | Tank (front) | Heavy |
| **Sword** | Sword (two hands free) | Melee | Melee (front) | Heavy |
| **Dual Axe** | Hatchets (two-handed) | Melee | Melee (front) | Heavy |
| **Club** | Warhammer or club (two-handed) | Melee | Melee (front) | Heavy |
| **Ranged** | Bow (two-handed) or crossbow | Ranged | Ranger (back, range 7) | Medium |
| **Destruction** | Wand, with a spellbook in the off hand | Magic | Mage (back, range 7) | Light |
| **Restoration** | Staff (two-handed) | Magic | Healer (back, range 7) | Light |
| **Wraps** (later) | Wraps (two-handed) | Melee | Support (front) | Medium |

- Any weight of armor can be worn by anyone. The table shows what fits best.
- Heavy armor adds health. Light armor adds mana.
- A mage's and a healer's plain attack costs 1 mana.
- Melee seats reach 1 tile. Ranged and magic seats reach 7.

## 4.2 How a move works
**[Unchanged]**

- A move sits on one of three **lanes**. After a move on a lane, that lane waits a short moment before the next one: Offense 2 s, Support 2 s, Heal 1 s.
- Each move has its own **cooldown** and **mana** cost.
- Some moves burn a **rune** (spells) or **arrows** (bow moves). Chapter 8 covers supplies.
- **Better runes make a move stronger.** A rune comes in five grades: Chalked, Scored, Etched, Carved and Graven. Each grade up adds about 10% to the move's strength and costs a bit more mana. With no rune of your own, a spell uses the store's Chalked rune.
- Mana comes back at 25% of max mana a minute, plus what food and drink give.
- An area move needs at least 2 monsters to be worth casting, and hits a 3 by 3 area.
- Moves unlock at a skill level (for example Frost Slam at Melee 12). "Known" means from the start.

## 4.3 Every move
**[Unchanged]** unless marked. 23 live moves.

### Every weapon

| Move | Lane · cooldown · mana | Unlock | What it does |
|---|---|---|---|
| **Mend** | Heal · 6 s · 15 | Known | Heals you for 11% of max health when you're under 50% |

### Shield

| Move | Lane · cooldown · mana · supply | Unlock | What it does |
|---|---|---|---|
| **Challenge** | Support · 8 s · free | Known | Taunts monsters onto you |
| **Frost Slam** | Support · 6 s · 6 · Ice rune | Melee 12 | Hits every monster around you and Chills them. Party only |
| **Shelter** | Support · 30 s · 25 · Earth rune | Melee 20 | Shields the whole party within 8 tiles. Party only |
| **Flame Strike** | Offense · 8 s · 10 · Fire rune | Known | A strong fire hit (shared with Sword) |
| **Power Strike** | Offense · 6 s · 6 | Known | A heavy hit (shared with Sword and Club) |

### Sword

| Move | Lane · cooldown · mana · supply | Unlock | What it does |
|---|---|---|---|
| **Flame Strike** | Offense · 8 s · 10 · Fire rune | Known | A strong fire hit |
| **Power Strike** | Offense · 6 s · 6 | Known | A heavy hit |
| **Turning Cut** | Offense · 8 s · 8 | Melee 10 | Spins and hits every monster around you (shared with Dual Axe and Club) |

### Dual Axe

| Move | Lane · cooldown · mana · supply | Unlock | What it does |
|---|---|---|---|
| **Rend** | Offense · 6 s · 8 · Rupture rune | Known | Two quick hits that leave Bleed |
| **Turning Cut** | Offense · 8 s · 8 | Melee 10 | Hits every monster around you |

### Club

| Move | Lane · cooldown · mana · supply | Unlock | What it does |
|---|---|---|---|
| **Power Strike** | Offense · 6 s · 6 | Known | A heavy hit |
| **Quarry Blow** | Offense · 8 s · 10 · Earth rune | Known | A strong earth hit. **[Changed]** reworked into Stagger in wave 3 |
| **Turning Cut** | Offense · 8 s · 8 | Melee 10 | Hits every monster around you |

### Ranged

| Move | Lane · cooldown · mana · supply | Unlock | What it does |
|---|---|---|---|
| **Hunter's Mark** | Support · 12 s · 8 | Known | Marks a monster. It takes 20% more damage for 8 s |
| **Precision Shot** | Offense · 6 s · 6 · 1 arrow | Known | An aimed shot |
| **Raking Shot** | Offense · 8 s · 10 · 2 arrows | Ranged 10 | Hits a 4-tile line |
| **Flame Volley** | Offense · 10 s · 15 · 3 arrows · Fire rune | Known | Fire arrows on an area |

### Destruction

| Move | Lane · cooldown · mana · supply | Unlock | What it does |
|---|---|---|---|
| **Frost Lance** | Offense · 6 s · 20 · Ice rune | Known | A strong frost hit |
| **Fireball** | Offense · 8 s · 25 · Fire rune | Known | A fire blast on an area |
| **Hoarfrost** | Offense · 10 s · 22 · Ice rune | Magic 14 | Frost on an area. Chills |
| **Arcane Barrier** | Support · 20 s · 30 · Earth rune | Known | Shields yourself when you're under 85% |

### Restoration

| Move | Lane · cooldown · mana · supply | Unlock | What it does |
|---|---|---|---|
| **Greater Mend** | Heal · 2 s · 25 · Water rune | Known | A big heal on one ally under 70% |
| **Circle of Renewal** | Heal · 12 s · 50 · Water rune | Known | Heals the party within 8 tiles when 2 or more are under 80% |
| **Spring Tide** | Heal · 60 s · 120 · Water rune | Magic 20 | A huge party heal when the party is under 85% in a fight |
| **Protective Ward** | Support · 12 s · 25 · Earth rune | Known | Shields one ally under 80% |
| **Green Sickness** | Offense · 10 s · 20 · Poison rune | Known | Poison on an area. Leaves Sickness |
| **Undertow** | Offense · 20 s · 15 · Water rune | Known | A water hit, only while alone. **[Changed]** cut in 0.3 |

### Switched off today

| Move | What it was | Plan |
|---|---|---|
| Brand | A storm hit, mana back on a kill | Held. Comes back as Sword only |
| Reave | A necrotic hit that heals for 30% of damage | Held. Sword only. It's the only melee lifesteal |
| Updraft | A fourth area spell on the wand | **Cut** |
| Blight | A necrotic area that halves monster healing | Held until a monster that heals exists |

## 4.4 The moves pass
**[New in 0.3]**

A designer measured every move on the real engine before the Roads were written. What changes in 0.3:

| Move | Change | Why |
|---|---|---|
| **Challenge** | Its suggested condition becomes "my HP is at least 60%". The hero holding Challenge falls back at a lower line (15% on Steady, 27% on Careful) | Pulling every blow onto one hero tripped the fall back early. As measured, the Challenge made a four hold far shallower |
| **Shelter** | Suggested condition becomes "the party has at least 2 heroes under 80%" | Its old trigger waited for a monster to cast, and nothing cast on the early grounds. It never fired |
| **Greater Mend** | Made smaller | Without it a four held far shallower and earned 48% less XP. It was half the game |
| **Undertow** | Cut. Its "alone" idea becomes a shared rule: some strikes deal double damage while you hunt alone. Green Sickness gets it | It only cast alone, and everyone has a party from Level 5 |
| **Hunter's Mark** | Marks your own target if it isn't marked, else the healthiest monster in reach | Picks a better target |
| **Precision Shot** | Shoots a Shooter, Caster or Stalker in range first, else your target | Picks the back-row threat |
| **Updraft** | Removed | A fourth area spell on the wand |

Not final: Frost Slam may fold into the Challenge as "Cold Challenge" if it can't earn its own road. Circle of Renewal may become a branch. Every number is re-measured after the pass.

## 4.5 Wave 3: answers to wind-ups
**[New in 0.3]** (lane W3)

Monsters wind up before big blows and spells. Wave 3 adds moves that answer them.

| Move | Weapon | What it does |
|---|---|---|
| **Stagger** | Club (replaces Quarry Blow) | Ends the target's wind-up and pushes its next swing back |
| **Parry** | Sword | Support, 10 s. Your target's next blow within 2 s lands for 0 |
| **Gash** | Dual Axe | Every monster beside you takes a light hit and 1 Bleed stack |
| **Silenced** (an effect) | Several | The monster can't start a spell |

Not final: if a move's engine piece slips, its road moves to a later 0.3.x patch rather than holding the release.

## 4.6 Effects moves leave behind
**[Unchanged]**, with new effects in 0.3

| Effect | What it does | Lasts | Stacks |
|---|---|---|---|
| **Bleed** | Damage every second | 6 s | Up to 5 (6 or 7 with a waystone or a Signature, 10 with the Open Wounds vow) |
| **Sickness** | The monster takes 10% more damage | 6 s | 1 |
| **Chill** | The monster is 30% slower | 4 s | 1 |

**New in 0.3** (lane E2): Poison, "hero deals more for a while", "hero takes less for a while", "monster deals less", heals over time, and Silenced. **Armor Break** (the monster's armor drops) comes with the wraps.

Only one copy of an effect counts on a monster. A second source of Chill on a Chilled monster adds nothing.

## 4.7 Elements and resistances
**[Unchanged]**

- Spells and some strikes carry an element: **Fire**, **Frost** or **Poison**. Everything else is physical.
- Each monster resists or is weak to each element, from immune-ish to very weak. The bestiary shows it.
- A hero can resist elements with gear, up to 40% each, and physical damage up to 10%.
- Some monster families are weak or tough against a kind of weapon. Slimes, for example, are weak to hammers and resist arrows.
- The bar can check "my target is weak to it" and "my target is resistant to it".

**Rune families:** Earth, Water, Fire, Ice, Poison and Rupture. A seventh, Storm, is hidden.

## 4.8 The action bar
**[Unchanged]**

The bar is where a player shows skill. It's the build.

- **20 slots**, two rows of 10.
- **5 saved bar presets** per hero.
- Each line says **what** (use a move, eat or drink, attack with an item) and **when**.
- Up to **3 conditions** per line.
- **The first line that can fire, fires.** Put the most important line first.
- Up to **3 stop rules** per hunt (for example, stop when food runs low).
- New moves arrive with a suggested condition already filled in.

**The conditions a line can check:**

| Condition | Example |
|---|---|
| My HP | my HP is below 60% |
| My mana | my mana is below 30% |
| An ally's HP or mana | the lowest ally's HP is below 50% |
| How many allies are hurt | the party has at least 2 heroes under 70% health |
| How many it would hit | it would hit at least 3 monsters |
| The party's HP | the party's HP is below 85% |
| Monsters casting | the pack has at least 1 monster casting at me |
| The fight is on | |
| My target is weak to it / resists it | |
| My target is a boss | |
| How many I have left | I have at most 50 of the loaded ammo left |
| An effect | my target lacks Bleed |
| **New in 0.3:** my target's HP | my target's HP is at least 30% |
| **New in 0.3:** my target is Marked | |
| **New in 0.3:** my target's Bleed stacks | my target has at least 5 Bleed stacks |
| **New in 0.3:** my last move | my last move is not Power Strike |

## 4.9 Targeting, stance and distance
**[Unchanged]**

| Setting | Options |
|---|---|
| **Target mode** | Nearest, Lowest HP, Highest HP %, Strongest, Follow the leader |
| **First target** | Pick one monster kind on a ground to always hit first, per hero |
| **Fight stance** | Offensive (deal 10% more, take 10% more), Balanced, Defensive (deal 10% less, take 15% less) |
| **Distance** | How far a hero stands from the fight, 1 to 8 tiles |

Each seat comes with sensible defaults. A tank starts Balanced on Nearest. Melee starts Offensive and follows the leader.

The fight stance is not the Risk setting. Risk is about how deep the party pushes (chapter 5).

## 4.10 Do blows always land?
**[Changed]**

The redesign says a blow lands, with no separate roll to hit. Dodge and block become moves and Traits.

Not final: the 0.3 plan keeps today's hit math, where a blow's chance to land compares aim against evasion. The change to "a blow lands" comes later with the ratio defenses. See the contradictions list.

## 4.11 Armor
**[Unchanged]**

- Armor turns some of a blow aside and soaks some of the rest. Together they cut a blow by at most 60%.
- Ward (magic defense) works against spells.
- A shield block also trains Defense double.

Not final: the redesign moves armor and ward to a ratio, so a point of defense is worth something at every Level. Not in 0.3.

---

# The wraps: the party's support

## 4.12 What the support is
**[Later patch]** (R-X3, recommended for 0.3 but may slip to 0.3.1)

The wraps are hidden today. They become the party's **support**, the seat whose job is making the other three better.

**How it plays:**
- You stand in the front row next to your tank and hit what it holds.
- Your hits are weak on purpose. Each one leaves something on the monster that helps the whole party.
- **Coal** cracks a monster's armor so every hit on it lands harder.
- **Cold Palm** slows a monster and keeps a caster from starting a spell.
- **Lye** makes a monster hit softer.
- You keep one fire going for the party: **Open Fire** (everyone hits harder) or **Banked Fire** (everyone gets mana back faster, so the company drinks less).
- **Warm Stone** puts a small shield on whoever a monster is winding up to hit, or on your tank.
- A party with a support holds deeper on hard grounds and bosses than one with a fourth damage dealer. It kills slower on easy farms and swarms.

## 4.13 The support's moves
**[Later patch]**

| Move | Lane · cooldown · mana · supply | Unlock | What it does |
|---|---|---|---|
| **Coal Hands** | Offense · 6 s · 8 | Known | Hits your target. Armor Break: −25% armor for 6 s |
| **Coal Palm** | Offense · 10 s · 12 · Fire rune | Melee 20 | Hits your target and every monster next to it. Armor Break on each |
| **Cold Palm** | Offense · 12 s · 12 · Ice rune | Melee 12 | Range 5. Silenced for 3 s and Chill for 4 s. Aims at a caster first |
| **Lye** | Offense · 8 s · 12 · Poison rune | Melee 10 | Weakened: the monster deals 8% less for 8 s |
| **Open Fire** | Aura · always on | Known | Party: +4% damage within 8 tiles |
| **Banked Fire** | Aura · always on | Melee 15 | Party: +25% mana regeneration within 8 tiles |
| **Warm Stone** | Support · 10 s · 15 | Melee 8 | Shields the hero a wind-up is aimed at, or your tank under 70% |
| **Mend** | Heal · 6 s · 15 | Known | As every weapon |

- One fire at a time. All four strikes fit the bar, so you never swap strikes per ground.
- A lone support deals double damage with its strikes (the shared alone rule). It's the slowest way to hunt alone, and still fair.
- The wraps' own self-heal is cut. Sustain comes from the fires and Warm Stone.
- Weapons: **Practice Wraps** (Level 1) and **Sluicer's Wraps** (renamed from Sluicer's Knuckles, Level 15).

## 4.14 The support's country: the Hearth
**[Later patch]**

- The Hearth is the tenders' quarter of Havora, right beside the Great Hearth.
- Five roads: Coal (Coal Hands and Coal Palm), Fire (both fires), Cold, Warm Stone and Lye. 48 points in all.
- Five vows: Stand Close, Hush, Deep Cracks, Lye Spill and Rear Guard (chapter 15).
- It borders Shield and Restoration.

The fire-tenders who keep the Great Hearth are already in the game's story, from the Fire-Tender's Cap and the Soapboiler's Boots in the Catacombs.

Not final: three of the five Hearth roads, the Hearth's borders, and every number. The support is judged by what the party gains, never by its own damage.
