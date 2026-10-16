# Hunt-sim balance rulings — 2026-10-15 (Game Designer)

Applies to `prototypes/hunt-sim/combat-data.js`. Prototype-only; nothing here is server data. Tyler's fixed rulings (2.0 s swing, mana-cost wand basics that train Magic, per-shot bolts, 3 abilities per discipline, elemental weaknesses) are untouched.

| Value | Old | New | Why |
|---|---|---|---|
| COMBAT.magicXpPerMana | 29 | 1.5 | K=29 assumed the review's XP scale; 1.5 puts caster Magic XP/h at about the same rate as combat XP/h (~10–15k), not 20x it |
| COMBAT.manaRegenPerMin | 0.12 | 0.25 | Casters should sustain a pocket on regen and dip into drinks between pockets, not run dry in about 3 minutes |
| COMBAT.resistMult | 0.75 ASSUMED | 0.75 RULED | Readable "resisted" hit that never makes an element pointless |
| COMBAT.immuneMult | 0 ASSUMED | 0 RULED | Immune means immune; keep the list short so it teaches without walling the player |
| COMBAT.heroAccuracy | 0.85 | 0.85 RULED | Misses are visible but rare |
| COMBAT.monsterAccuracy | 0.60 | 0.60 RULED | With the new atk values this produces the healing pressure |
| COMBAT.vulnSec | 6 | 6 RULED | Covers 3 swings; Nature's Wrath cd 10 gives about 60% uptime |
| SUPPLIES.fire_rune / frost_rune price | 12 | 1 | About 1,900 runes/h across the party; at 12 g runes alone came to about 22k g/h |
| SUPPLIES.bolt price | 2 | 0.5 | About 2,800 shots/h; still a real line item (~1.4k g/h) |
| SUPPLIES.mana price | 0.5 | 0.03 | 0.5 g was the main cause of the negative profit; a 50-mana drink now costs 1.5 g |
| sorcerer.basic.mana | 4 | 2 | Wand basics cost mana (ruling) but must not drain the pool faster than abilities do |
| druid.basic.mana | 3 | 2 | Same reason |
| knight hp / mana | 260 / 60 | 200 / 60 | Tank should drop below 70% during a pocket, so Mend has work to do |
| paladin hp / mana | 180 / 90 | 150 / 100 | Small mana raise covers Mark, Volley and Precision on cooldown |
| sorcerer hp / mana | 140 / 320 | 120 / 320 | Glass cannon; splash and King adds should threaten it |
| druid hp / mana | 160 / 300 | 135 / 300 | Healer that can be pressured |
| hero basic dmg (all) | as listed | keep, RULED | Party output is about 18 dps with abilities; scale is fixed by monster HP instead |
| all ability dmg / cd / mana | ASSUMED | keep, RULED | Fire/frost abilities are about 1.5–2x a basic swing on their cooldowns, which is the right feel |
| druid greater_mend whenBelow | 0.6 | 0.7 | Fires once every 1–2 pockets with the new damage |
| sorcerer arcane_barrier whenBelow | 0.75 | 0.85 | Reacts to the first splash hit |
| rat hp / atk / xp | 9 / 2 / 6 | 45 / 5 / 24 | Lives through the opening burst (formation forms); about 3 s of party focus |
| slime hp / atk / xp | 8 / 2 / 5 | 50 / 4 / 22 | Slow, tanky, immune to elements: rewards physical attacks |
| kobold hp / atk / xp | 12 / 3 / 10 | 55 / 7 / 30 | The hard hitter of a normal pocket |
| bat hp / atk / xp | 24 / 7 / 24 | 70 / 9 / 45 | Fast flanker; reaches the backline |
| spider hp / atk / xp | 52 / 15 / 82 | 120 / 16 / 110 | Elite-pocket anchor |
| rat resist fire | ['fire'] ASSUMED | [] | The first ground must not punish the starter Fire rune; frost stays the bonus |
| kobold resist fire | ['fire'] ASSUMED | [] | Same; the nature weakness is the lesson here |
| spider resist nature | ASSUMED | keep, RULED | Venomous, so it shrugs off Nature; it teaches resist (not immune) mid-sewer |
| monster gp (all normals) | live | x1.5 | Coin is the profit lever after the supply cuts; drops stay live |
| ratking hp / atk / def | 320 / 14 / 4 | 1100 / 20 / 4 | About 60 s at about 18 dps, and hits hard enough to need Mend and Circle |
| ratking xp / gp | 400 / [60,120] | 600 / [150,250] | About 10 pockets' worth of XP for one fight; the gold pays for the runes spent on it |
| ratking weak / resist / immune | frost / fire / nature | keep, RULED | The boss is the exam on the sewer's element lesson: bring frost |
| ratking drops | PLACEHOLDER | keep; crown_shard 0.25 to 0.15 | The shard is the chase item; at 1-in-4 it stops being one |

**Rationale.** The problems came from three mismatched scales, not from the design. The XP constant came from a different economy, supply prices were picked without counting how much is used per hour, and the live monster rows were tuned for a single-hero idle tick, not a four-hero formation. The ruling keeps hero damage fixed and scales the sewer around it. Normal pockets of 3–4 mobs at 45–70 HP against about 18 party dps clear in roughly 10–16 s. The ranged heroes reach position before the first kill. Monster attack is set so the knight falls below 70% every one or two pockets, and the Rat King (1,100 HP, about 60 s) needs both heals. Supplies drop to about 3.5–4k g/h against loot and coin of about 4.5–5k g/h, which is the modest profit. Magic XP is now in the same band as combat XP. Applier: if measured profit falls outside +10–30% of supply cost, tune the gp multiplier only, and report the measured clear times and XP/h back to me.
