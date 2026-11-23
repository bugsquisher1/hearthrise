# Talent branch candidates (22 moves)

Pick the ones you like. Every move is a real row in `src/data/abilities.js`. Nothing is live yet, and every number is a starting guess for the Balance Lab.

## How Talents work

- **A point every Level.** Spend it on any move you know to raise its rank by 1.
- **Ranks have no top.** Each rank makes the move a little stronger.
- **Branches at rank 5, 15 and 30.** Pick 1 of 2 or 3. A branch changes how the move plays. Branches at one rank are the same strength. Each is best on some grounds, and none is best everywhere.
- **Stacking.** Branches follow the stacking keys in `15-signature-candidates.md`. No Signature repeats a branch.
- **Resets cost gold by Level.** Drafting is free. You pay once when you apply it. A new hero's first reset is free.
- **"Spend as suggested"** spends every point and picks every branch for you, and can stay on.

**The Roads v3 (2026-11-22, `17-talent-tree.md`) places these options and supersedes the rank marks above.** Crossroads I comes after a move's third rank stone, crossroads II after its fifth, and II doesn't depend on I. Every number grows with Level, full at Level 200 (`19-power-ledger.md` section 2). Quick Strike becomes Cheap Strike (−40% mana · −20% damage), since sword and club lanes run full. Answering and Riposte come back as Parry's options (wave 3, `17` section 5). Low-health options read "near fall-back".

Moves that more than one weapon uses are listed once, under the first. Brand, Reave, Blight and the fist strikes are left out until they go live. Updraft and Undertow are cut (`23-spell-audit.md`). Parry (sword) and Gash (axes) are new in wave 3 and get their options with their rows.

---

## Shield

**Challenge** (Shield). Suggested condition: my HP is at least 60%. The hero holding it falls back at 15% on Steady, not 25%
- **A. Long Hold** (Suggested): Taunt holds 12 s (from 8 s), +4 s cooldown
  Best for: big packs, a tank with a healer behind it
  Note: Was Wide Challenge. The Challenge already takes every monster within 6 tiles, so "up to 3" was a downgrade.
- **B. Hard Challenge**: Taunted enemy deals 15% less damage to you while taunted
  Best for: hard hitters, bosses
- **C. Guarding Challenge**: Casts on its own when an enemy attacks a back-row ally, and taunts that enemy
  Best for: grounds with ranged enemies or casters
  Note: Party only.

**Frost Slam** (Shield, party only). Re-measured after the holder line. Under +4 steps, it merges into the Challenge as Cold Challenge
- **A. Long Frost** (Suggested): Chill lasts 6 s (from 4 s), +2 s cooldown
  Best for: packs that stay on you
- **B. Pinning Frost**: Hits your target only, +50% chill
  Best for: bosses
- **C. Slowing Frost**: Chill slows spell wind-ups 2× as much and attacks 50% less
  Best for: casters
  Note: Does nothing on Muster Barrows or Hask's Ford until a Caster body exists. Blow wind-ups (wave 3) widen it.

**Shelter** (Shield, party only). Suggested condition: the party has at least 2 heroes under 80% (until a Caster body exists, then a monster casting)
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
  Note: Costs more mana per minute.
- **C. Guard Strike**: −20% damage, −10% damage taken for 3 s
  Best for: holding the front vs bosses

**Turning Cut** (Sword, Dual Axe, Club)
- **A. Wide Turn** (Suggested): Hits enemies up to 2 tiles away, −25% damage
  Best for: big loose packs
- **B. Close Turn**: +40% damage, 3 targets max
  Best for: pairs, small packs
- **C. Heavy Turn**: +30% damage, +2 s cooldown
  Best for: high-armor packs
  Note: Was Bleeding Turn, cut: the axes' Gash (wave 3) bleeds a crowd. Armor comes off each hit once, so bigger hits lose less to it.

## Dual Axe

**Rend** (Dual Axe)
- **A. Deep Cuts** (Suggested): Bleed lasts 50% longer
  Best for: long fights, bosses
- **B. Spread**: Bleed jumps to 1 nearby enemy when the target dies
  Best for: big packs
- **C. Quick Rend**: −30% cooldown, −20% Bleed damage
  Best for: fast pulls

## Club

**Stagger** (Club, wave 3. Replaces Quarry Blow). A hit that ends the target's wind-up and pushes its next swing back 1 s. Suggested condition: my target is winding up
- **A. Long Stagger** (Suggested): Next swing pushed back 2 s (from 1 s)
  Best for: Brutes, bosses
- **B. Shaken**: A wind-up it ends: the target deals 10% less damage for 4 s
  Best for: casters, hard hitters
- **C. Wide Stagger**: Also ends wind-ups on enemies next to the target, −30% damage
  Best for: packs of casters
  Note: Quarry Blow was Flame Strike without the fire, so Breaking Blow, Rockfall and Cold Stone are cut with it.

## Ranged

**Hunter's Mark** (Ranged). Marks your own target if it isn't marked, else the healthiest in reach
- **A. Long Mark** (Suggested): Lasts 12 s (from 8 s), +15% damage taken (from 20%)
  Best for: bosses, long fights
- **B. Pack Mark**: Marks the target and 2 nearby enemies, +10% damage taken (from 20%)
  Best for: big packs
- **C. Crippling Mark**: Marked target deals 10% less damage, +10% damage taken (from 20%)
  Best for: protecting the tank vs bosses

**Flame Volley** (Ranged)
- **A. Full Volley** (Suggested): +25% damage when hitting 4+ enemies, −15% vs fewer
  Best for: big packs
- **B. Burning Volley**: Enemies hit take 10% more fire damage for 4 s
  Best for: parties with a fire caster, fire-weak grounds
- **C. Spare Arrows**: Costs 1 ammo (from 3), −20% damage
  Best for: long hunts, cheaper supplies

**Precision Shot** (Ranged). Shoots a Shooter, Caster or Stalker in range first, else your target
- **A. Aimed Shot** (Suggested): +30% damage vs marked targets
  Best for: bosses, anything you Mark
  Note: Needs Hunter's Mark on the bar. Works now the Mark sits on the bow's own target.
- **B. Piercing Shot**: Hits 1 enemy behind the target for 50% damage
  Best for: packs in lines
- **C. Picked Shot**: +40% damage vs Shooters, Casters and Stalkers
  Best for: grounds with a back-row threat
  Note: Was Wind-up Shot, dead where nothing casts. Now keyed to the monsters Precision Shot picks first.

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

**Greater Mend** (Restoration). Numbers follow its Lab re-size (20% less healing, Circle 30% more)
- **A. Quick Mending**: −50% healing, 1 s cooldown
  Best for: steady damage
- **B. Deep Mending**: Only casts on allies below 40% health, +60% healing
  Best for: big single hits
- **C. Split Mending** (Suggested): 30% of the heal also lands on the next lowest-health ally
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

**Green Sickness** (Restoration). Deals double damage while you hunt alone (the alone rule, which replaces Undertow)
- **A. Lingering Sickness** (Suggested): Sickness lasts 10 s (from 6 s), −30% damage
  Best for: parties, long fights
- **B. Single Dose**: Hits the target only, Sickness 20% (from 10%)
  Best for: bosses
  Note: Replaces a weaker Sickness on the target. Doesn't add to it.
- **C. Draining Sickness**: Heals the lowest-health ally for 20% of damage dealt
  Best for: solo, small parties

**Protective Ward** (Restoration)
- **A. Tank Ward** (Suggested): +40% shield, only on the ally with the most enemies on them
  Best for: parties with a tank
- **B. Twin Ward**: Shields 2 allies, −40% shield each
  Best for: back-row casters vs area damage
- **C. Lasting Ward**: Unused shield returns as mana when recast, −20% shield
  Best for: long hunts, light damage

**Undertow**: cut. It cast only alone, and every hero has a company from Level 5. A lone healer gets its damage back through the alone rule on Green Sickness.

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
- After **Long Hold**: Taunted enemies deal 10% less damage to allies for 3 s / −2 s cooldown
- After **Hard Challenge**: Damage reduction 25% (from 15%) / Taunted enemy takes 10% more damage from you
- After **Guarding Challenge**: The ally it protected takes 15% less damage for 3 s / −3 s cooldown

**Rend at rank 15**
- After **Deep Cuts**: +20% damage vs targets with 5 or more Bleed stacks / Bleed ticks 20% faster
- After **Spread**: Bleed jumps to 2 nearby enemies / The jumped Bleed keeps all its stacks
- After **Quick Rend**: Each Rend hit refreshes all Bleed stacks / −2 mana

---

## Changes from the cross-check

Checked 2026-11-22 against `14-trait-candidates.md`, `15-signature-candidates.md`, `02-architecture.md` (1b and 2), `abilities.js` and `statuses.js`. Signatures that repeated a branch were changed in 15, not here.

- How Talents work: the "same size" line rewritten in plain words. Added a pointer to the stacking keys in 15.
- Frost Slam C: Numbing Frost renamed Slowing Frost (clashed with Trait #25 Numbed).
- Power Strike B: note now says it costs more mana per minute.
- Turning Cut C: note says it shares Rend's Bleed stacks, cap 5 on a target.
- Quarry Blow A: Breaking Blow now applies Sickness itself (6 s), so it can't stack with Green Sickness by rule. It was a second copy of the same effect.
- Hunter's Mark C: Hunter's Call renamed Crippling Mark (too close to Hunter's Mark).
- Greater Mend C: Shared Mending renamed Split Mending (too close to Mend's Shared Mend).
- Green Sickness B: note that a stronger Sickness replaces a weaker one.
- Rend rank 15: "5 Bleed stacks" now "5 or more", since #29 raises the cap to 6.

## Changes from the spell audit

2026-11-22, from `23-spell-audit.md` section 8, and Tyler's rulings the same day (Updraft cut, the tank falls back at 15% on Steady).

- Title: 22 moves. Updraft and Undertow cut. Parry and Gash noted for wave 3. Answering and Riposte come back as Parry's options.
- Challenge: suggested condition "my HP is at least 60%", and the holder's 15% line on Steady.
- Challenge A: Wide Challenge becomes Long Hold (taunt holds 12 s, +4 s cooldown). Its rank 15 pair follows.
- Frost Slam: re-measure after the holder line, Cold Challenge if it stays under +4 steps. Slowing Frost flagged dead where nothing casts.
- Shelter: suggested condition "2+ heroes under 80%".
- Turning Cut C: Bleeding Turn cut, Heavy Turn in its place.
- Quarry Blow becomes Stagger. Breaking Blow, Rockfall and Cold Stone cut. Long Stagger, Shaken and Wide Stagger in, keyed to wind-ups ended.
- Hunter's Mark: marks your own target first.
- Precision Shot: shoots a Shooter, Caster or Stalker first. Aimed Shot now works with the Mark. Wind-up Shot becomes Picked Shot.
- Greater Mend: numbers follow the Lab re-size.
- Green Sickness: gains the alone rule.
- Undertow: cut, with its three options.
