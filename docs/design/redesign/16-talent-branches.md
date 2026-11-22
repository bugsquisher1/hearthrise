# Talent branch candidates (23 moves)

Pick the ones you like. Every move is a real row in `src/data/abilities.js`. Nothing is live yet, and every number is a starting guess for the Balance Lab.

## How Talents work

- **A point every Level.** Spend it on any move you know to raise its rank by 1.
- **Ranks have no top.** Each rank makes the move a little stronger.
- **Branches at rank 5, 15 and 30.** Pick 1 of 2 or 3. A branch changes how the move plays. Branches at one rank are the same size: each is best on some grounds and on none of them all.
- **Resets cost gold by Level.** Drafting is free. You pay once when you apply it. A new hero's first reset is free.
- **"Spend as suggested"** spends every point and picks every branch for you, and can stay on.

Moves that more than one weapon uses are listed once, under the first. Brand, Reave, Updraft, Blight and the fist strikes are left out until they go live.

---

## Shield

**Challenge** (Shield)
- **A. Wide Challenge** (Suggested): Taunts up to 3 nearby enemies, −50% taunt duration
  Best for: big packs
- **B. Hard Challenge**: Taunted enemy deals 15% less damage to you while taunted
  Best for: hard hitters, bosses
- **C. Guarding Challenge**: Casts on its own when an enemy attacks a back-row ally, and taunts that enemy
  Best for: grounds with ranged enemies or casters
  Note: Party only.

**Frost Slam** (Shield, party only)
- **A. Long Frost** (Suggested): Chill lasts 6 s (from 4 s), +2 s cooldown
  Best for: packs that stay on you
- **B. Pinning Frost**: Hits your target only, +50% chill
  Best for: bosses
- **C. Numbing Frost**: Chill slows spell wind-ups 2× as much and attacks 50% less
  Best for: casters

**Shelter** (Shield, party only)
- **A. Steady Shelter** (Suggested): −40% shield, −15 s cooldown
  Best for: steady damage, long hunts
- **B. Deep Shelter**: Shields only the 2 lowest-health allies, +80% shield
  Best for: big single hits, bosses
- **C. Stone Wall**: +100% shield on you, −30% shield on allies
  Best for: fights where you take nearly all the damage

## Sword

**Flame Strike** (Shield, Sword)
- **A. Searing Strike** (Suggested): Hits 1 extra nearby enemy for 50% damage
  Best for: pairs, small packs
- **B. Finishing Strike**: +40% damage vs targets below 30% health
  Best for: bosses, tough single enemies
- **C. Opening Strike**: +50% damage vs targets above 90% health
  Best for: packs of quick kills
  Note: The opposite of B.

**Power Strike** (Shield, Sword, Club)
- **A. Heavy Strike** (Suggested): +30% damage, +2 s cooldown
  Best for: high-armor enemies
  Note: Armor comes off each hit once, so bigger hits lose less to it.
- **B. Quick Strike**: −2 s cooldown, −30% damage
  Best for: low-armor enemies
  Note: More mana per minute.
- **C. Guard Strike**: −20% damage, −10% damage taken for 3 s
  Best for: holding the front vs bosses

**Turning Cut** (Sword, Dual Axe, Club)
- **A. Wide Turn** (Suggested): Hits enemies up to 2 tiles away, −25% damage
  Best for: big loose packs
- **B. Close Turn**: +40% damage, 3 targets max
  Best for: pairs, small packs
- **C. Bleeding Turn**: Applies 1 Bleed stack to each target, −30% damage
  Best for: dual axes, long fights
  Note: Stacks with Rend's Bleed up to 5.

## Dual Axe

**Rend** (Dual Axe)
- **A. Deep Cuts** (Suggested): Bleed lasts 50% longer
  Best for: long fights, bosses
- **B. Spread**: Bleed jumps to 1 nearby enemy when the target dies
  Best for: big packs
- **C. Quick Rend**: −30% cooldown, −20% Bleed damage
  Best for: fast pulls

## Club

**Quarry Blow** (Club)
- **A. Breaking Blow** (Suggested): Target takes 10% more damage from all sources for 4 s, −30% damage
  Best for: parties, bosses
  Note: Doesn't stack with Green Sickness.
- **B. Rockfall**: Hits the 3×3 area around the target, −50% damage
  Best for: tight packs
- **C. Cold Stone**: +40% damage vs chilled targets
  Best for: parties with Frost Slam or Hoarfrost
  Note: Does little alone.

## Ranged

**Hunter's Mark** (Ranged)
- **A. Long Mark** (Suggested): Lasts 12 s (from 8 s), +15% damage taken (from 20%)
  Best for: bosses, long fights
- **B. Pack Mark**: Marks the target and 2 nearby enemies, +10% damage taken (from 20%)
  Best for: big packs
- **C. Hunter's Call**: Marked target deals 10% less damage, +10% damage taken (from 20%)
  Best for: protecting the tank vs bosses

**Flame Volley** (Ranged)
- **A. Full Volley** (Suggested): +25% damage when hitting 4+ enemies, −15% vs fewer
  Best for: big packs
- **B. Burning Volley**: Enemies hit take 10% more fire damage for 4 s
  Best for: parties with a fire caster, fire-weak grounds
- **C. Spare Arrows**: Costs 1 ammo (from 3), −20% damage
  Best for: long hunts, cheaper supplies

**Precision Shot** (Ranged)
- **A. Aimed Shot** (Suggested): +30% damage vs marked targets
  Best for: bosses, anything you Mark
  Note: Needs Hunter's Mark on the bar.
- **B. Piercing Shot**: Hits 1 enemy behind the target for 50% damage
  Best for: packs in lines
- **C. Wind-up Shot**: +60% damage vs casting targets
  Best for: casters

**Raking Shot** (Ranged)
- **A. Clean Sweep** (Suggested): +50% damage vs targets below 50% health
  Best for: packs, after an area spell
- **B. Close Rake**: 2-tile line (from 4), +40% damage
  Best for: enemies that reach you
- **C. Twice Raked**: Hits twice for 60% damage each, costs 4 ammo (from 2)
  Best for: dense packs when ammo is cheap

## Destruction

**Fireball** (Destruction)
- **A. Wide Fireball** (Suggested): 5×5 area (from 3×3), −30% damage
  Best for: big packs
- **B. Slow Burn**: Hits for 60% damage, then 60% again 3 s later
  Best for: packs of tough enemies
  Note: Wasted on enemies that die to the first hit.
- **C. Small Fireball**: −40% mana, −25% damage
  Best for: long hunts, small mana pools

**Frost Lance** (Destruction)
- **A. Chilling Lance** (Suggested): Applies Chill, −20% damage
  Best for: bosses, hard hitters
- **B. Shatter**: +50% damage vs chilled targets
  Best for: with Hoarfrost or Frost Slam
- **C. Piercing Lance**: Hits a 3-tile line, −35% damage
  Best for: packs in lines

**Hoarfrost** (Destruction)
- **A. Deep Hoarfrost** (Suggested): Chill lasts 6 s (from 4 s), −20% damage
  Best for: packs that hit hard
- **B. Hard Freeze**: No damage, +50% chill
  Best for: protecting the party on Deadly grounds
  Note: Gives no kills.
- **C. Frost Ring**: Hits every enemy next to you instead of the target area, +20% damage
  Best for: enemies that reach the back row

**Arcane Barrier** (Destruction)
- **A. Thick Barrier** (Suggested): +50% shield, +10 s cooldown
  Best for: big single hits, bosses
- **B. Charged Barrier**: +15% spell damage while the shield holds
  Best for: grounds where it rarely breaks
- **C. Shared Barrier**: Also shields the lowest-health ally for 50%
  Best for: parties without a healer

## Restoration

**Greater Mend** (Restoration)
- **A. Quick Mending**: −50% healing, 1 s cooldown
  Best for: steady damage
- **B. Deep Mending**: Only casts on allies below 40% health, +60% healing
  Best for: big single hits
- **C. Shared Mending** (Suggested): 30% of the heal also lands on the next lowest-health ally
  Best for: casters, area damage

**Circle of Renewal** (Restoration)
- **A. Lasting Circle** (Suggested): Heals over 6 s instead of at once, +30% healing
  Best for: steady area damage
- **B. Tight Circle**: Only allies within 3 tiles, +40% healing
  Best for: melee-heavy parties
- **C. Light Circle**: −40% mana, −25% healing
  Best for: long hunts

**Spring Tide** (Restoration)
- **A. Ebb Tide**: −50% healing, −50% cooldown, −50% mana
  Best for: steady damage
- **B. High Tide** (Suggested): Healing past full health stays as a shield
  Best for: big area hits after a wind-up
- **C. Turning Tide**: +50% healing on allies below 30% health, −25% on the rest
  Best for: Deadly grounds

**Green Sickness** (Restoration)
- **A. Lingering Sickness** (Suggested): Sickness lasts 10 s (from 6 s), −30% damage
  Best for: parties, long fights
- **B. Single Dose**: Hits the target only, Sickness 20% (from 10%)
  Best for: bosses
- **C. Draining Sickness**: Heals the lowest-health ally for 20% of damage dealt
  Best for: solo, small parties

**Protective Ward** (Restoration)
- **A. Tank Ward** (Suggested): +40% shield, only on the ally with the most enemies on them
  Best for: parties with a tank
- **B. Twin Ward**: Shields 2 allies, −40% shield each
  Best for: back-row casters vs area damage
- **C. Lasting Ward**: Unused shield returns as mana when recast, −20% shield
  Best for: long hunts, light damage

**Undertow** (Restoration, solo only)
- **A. Heavy Undertow** (Suggested): Target deals 20% less damage for 4 s, −20% damage
  Best for: solo vs hard hitters
- **B. Riptide**: Also hits enemies next to the target, −40% damage
  Best for: solo vs packs
- **C. Drowning Pull**: 30% of damage dealt heals you, −20% damage
  Best for: long solo hunts

## Every weapon

**Mend** (all)
- **A. Second Wind**: +60% healing below 25% health, −20% above
  Best for: Bold, hard hitters
- **B. Steady Mend** (Suggested): Heals over 6 s instead of at once, +25% healing
  Best for: steady damage, long hunts
- **C. Shared Mend**: Also heals the nearest ally for 50%
  Best for: parties without a healer

---

## Rank 15 and 30 come after you pick

Rank 15 branches build on the rank 5 pick, so each rank 5 option gets its own pair. Rank 30 works the same way on the rank 15 pick. These are only examples. The rest get written after rank 5 has been played.

**Challenge at rank 15**
- After **Wide Challenge**: Taunted enemies deal 10% less damage to allies for 3 s / Taunts up to 5 nearby enemies
- After **Hard Challenge**: Damage reduction 25% (from 15%) / Taunted enemy takes 10% more damage from you
- After **Guarding Challenge**: The ally it protected takes 15% less damage for 3 s / −3 s cooldown

**Rend at rank 15**
- After **Deep Cuts**: +20% damage vs targets with 5 Bleed stacks / Bleed ticks 20% faster
- After **Spread**: Bleed jumps to 2 nearby enemies / The jumped Bleed keeps all its stacks
- After **Quick Rend**: Each Rend hit refreshes all Bleed stacks / −2 mana
