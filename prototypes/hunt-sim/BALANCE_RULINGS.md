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

## Round 2 — 2026-10-15 (after the measured 17.7 sim-minute run)

| Value | Round 1 | New | Why |
|---|---|---|---|
| SUPPLIES.fire_rune / frost_rune price | 1 | 6 | Measured use is about 180 runes/h, not 1,900; at 6 g runes cost about 1.1k g/h and casting them is a real choice |
| SUPPLIES.bolt price | 0.5 | 1 | About 1.6k bolts/h, so bolts cost about 1.6k g/h: the paladin's upkeep is visible |
| SUPPLIES.mana price | 0.03 | 0.06 | Doubles the mana line to about 0.8k g/h; drinks still cost little |
| monster gp multiplier (normals) | x1.5 | x0.85 | Gold drops from 3.9k to about 2.2k g/h; income about 4.2k g/h against supply about 3.5k g/h is roughly +20% |
| spider hp / atk | 120 / 16 | 90 / 13 | Spider-heavy pack was a 40–57 s grind with a knight wipe; this keeps it the toughest pocket without a wipe |
| NE pocket composition | 3 spiders + 2 bats | 2 spiders + 2 bats | About 320 HP total, so roughly 18–22 s: the elite pocket of the loop |
| ratking hp | 1100 | 600 | Measured effective party output against him is about 7 dps (fire resisted, nature immune); 600 HP is about 80 s. The resistances stay because they teach "bring frost" |

**Rationale.** My round-1 supply estimate was wrong by about 10x on runes, so the economy is now re-fit to the measured usage. Supply prices rise until supplies matter, and coin is trimmed to land at about +20%. The Rat King keeps his element lesson; his HP comes down instead. Applier: if measured profit lands outside +10–30%, change only the gp multiplier.

## Party-size test 2026-10-16

Headless run at the current numbers: 2 loops per composition, capped at 40 sim-minutes. Clear times are in seconds per loop; W means a wipe. The front-most hero pulls and holds aggro. Profit includes potions and food.

| Party | NW | SW | Channel | NE | SE | Rat King | Deaths / wipes | Potions / food | XP/h | Profit/h |
|---|---|---|---|---|---|---|---|---|---|---|
| Full (K+P+D+S) | 10 / 9 | 14 / 16 | 9 / 8 | 26 / 29 | 6 / 6 | 53 / 59 | 0 / 0 | 19 / 0 | 24.1k | −2.9k |
| Knight + sorcerer | 14 / 16 | 20 / 28 | 10 / 15 | 52 / 66 | 14 / 16 | 81 / 89 | 0 / 0 | 19 / 8 | 16.6k | −1.0k |
| Knight + druid | 36 / 58 | 31 / 40 | 28 / 40 | 57 / 77 | 20 / 26 | 238 / 250 | 0 / 0 | 22 / 0 | 9.0k | +1.7k |
| Paladin + druid (no tank) | 29 / 33 | 33 / 35 | 27 / 29 | 51 / 72 | 19 / 29 | 185 / 256 | 0 / 0 | 28 / 0 | 10.0k | −1.7k |
| Solo knight | 34 / 54 | 31 / 50 | 24 / 44 | 67 / 134 | 34 / 48 | 228, then 15 W | 15 / 15 | 6 / 25 | 3.0k | +0.4k |
| Solo paladin | 33 / 33 | 39 / 43 | 29 / 25 | 77, 15 W, 35 | 35 / 61 | 173, then 12 W | 27 / 27 | 12 / 15 | 3.0k | −1.1k |
| Solo sorcerer | 19 / 25 | 77 / 75 | 23 / 23 | 57 / 61 | 27 / 23 | 155, then 24 W | 24 / 24 | 40 / 12 | 3.0k | −1.1k |
| Solo druid | 12 W | — | — | — | — | — | 12 / 12 | 40 / 12 | 0 | −0.8k |

**Verdict.**
- Every 2-hero party clears the Sewer without a death. Solos clear the normal pockets (the druid wipes in the first room), but none beats the Rat King again once the first kill has spent their supplies.
- Monster density should scale with party size. The full party clears normal pockets about 3x faster than a solo and about 2x faster than a pair. A fixed pack is trivial for 4 heroes and lethal at the boss for 1.
- Recommended scale: pack HP or count ≈ 0.4 + 0.15 × party size, so about 0.55x solo, 0.7x pair and 1.0x full. Scale the Rat King's HP the same way, and give a solo druid a damage floor.
