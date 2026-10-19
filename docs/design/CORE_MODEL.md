# CORE_MODEL: Level, skills, Prayer, death (core rebuild, 2026-10-19)

Maps the Tyler-confirmed core model (`.claude/coordination/core-rebuild-2026-10-19.md`, rulings-of-record) onto code.
Every number is the designer's (`docs/design/reviews/CORE_NUMBERS_2026-10-19.md`) or Tyler's ruling of 2026-10-19, and
lives as ONE data constant in `src/data/core-model.js` (generated into `hr_hunt_limits` / `hr_skill_curve` for the SQL twin).

## 1. Ids
| id | kind | cap | trains by | file of record |
|---|---|---|---|---|
| (Level) | not a skill: `player_state.level_xp` | none | kill XP only | `src/core/xp.js` charXpForLevel / charLevelFromXp |
| `melee` | combat | none | 1.5 XP per HP dealt with a melee weapon | `src/data/skills.js` |
| `ranged` | combat | none | 1.5 XP per HP dealt with bow / crossbow | same |
| `magic` | combat | none | mana spent x 1.5 x the ability's multiplier (~1,600 permille); never damage | same |
| `defense` | combat | none | 0.2 x attacker `level` per blow aimed at an armoured hero (misses count); shield block x2 | same |
| `prayer` | combat | none | burying (`recipes.js` prayer rites, XP from `PRAYER_BURY`) | same |
| woodcutting, mining, fishing, farming / cooking, crafting, smithing, runecrafting, stonemason | gather / artisan | 99 | unchanged | same |

Deleted ids: `attack`, `strength`, `hitpoints`. Level is a column, never a `player_skills` row. Combat skills are exempt
from the pacing dial (`pacing.js PACE_EXEMPT_SKILLS`): the curves were fitted to the XP as paid.

## 2. Curves (`src/core/xp.js`; SQL `hr_char_xp_for_level`, `hr_char_level`, `hr_skill_xp_for_level`, `hr_skill_level`)
- **Level**: total XP to reach L = `(L-1)^4 + 20 (L-1)^3 + 50 (L-1)` (`LEVEL_CURVE`), endless. L5 1,736; L10 21,591; L200 1,725,861,131.
  Guard (`tests/level-curve.mjs`): at `2,900 x L` Level XP an hour, L10 in 0.75-2 h (1.12) and L200 in 3,800-4,200 h (4,017).
- **Combat skills**: XP to advance s -> s+1 = `15 x s^2 x 1.04^(s-1)` (`SKILL_CURVE`), exact integers (BigInt walk), no cap;
  SQL reads the generated `hr_skill_curve` table. Gather/artisan keep the capped 99 table (`isCapped`, `skillCapOf`).
- Parity: `tests/core-curves.mjs` compares JS and SQL on 5,300 boundary values (curves, vitals, regen, monster levels).

## 3. HP, mana, armour weight (`src/core/vitals.js`; SQL `hr_max_hp`, `hr_max_mana`, `hr_vitals_of`)
- `maxHp = floor((150 + 10 x (L-1)) x (1000 + 280 x heavy/6) / 1000)`; `maxMana = floor((100 + 10 x (L-1)) x (1000 + 350 x light/6) / 1000)`.
- heavy / light = worn pieces of that weight (`armourClass`: plate heavy, leather medium, cloth light; `hr_items.armour_weight`).
- Derived, never stored (`player_state.max_hp` and `hr_start_kit.max_hp` dropped); current HP is clamped on read. Raise-only in a window.
- In-fight HP regen 0.3% of max a second; out-of-fight regen unchanged; both x Prayer's rate (§5).

## 4. Where XP is earned: ONE place, `src/core/hunt-rewards.js` (the one engine, AWAY-1)
| world event | pays |
|---|---|
| `xp` (kill share, xp-share.js) | `fx.addLevelXp` -> `delta.level_xp` (Level only) |
| `dmg` by a hero on a monster | `FAMILY_SKILL[family]` (melee / ranged) x 1.5 per HP; magic weapons pay through mana spent |
| `cast` (mana spent) | magic (`magicXpFor`) |
| `dmg`/`miss` by a monster on an armoured hero | defense = `monsterLevelOf x 200/1000 x (shield block ? 2 : 1)` |
Monster `level` is data (`src/data/monsters.js`; unplaced by tier T1 5 ... T6 130); placed monsters' kill XP is the
designer's per-ground factor (x4.5 cellar, x4.7 thicket, x6.4 sewer, x6.6 warrens). `hr_hunt_apply_member` bounds Level XP by
the journalled kills x the catalogue's kill XP, magic by the hero's own max mana, Defense by blows x level.

## 5. Prayer (`PRAYER_REGEN`, `vitals.js regenPermille`; SQL `hr_regen_permille`)
`rate = 1000 + floor(1000 x P / (P + 50))` permille of the base, applied to HP and mana regen, resting and in fight; never
double, no cap on Prayer. Wards are deleted (`PRAYER_WARDS`, `prayerWardPct`, the unit's `ward`).
Burying: `PRAYER_BURY.xpPerBone` 15.5 (Prayer 15 by Level 25 burying every cellar bone, 121 bones/h; `tests/bury-rate.mjs`
re-derives it and proves N bones pay exactly N x 15.5 with the fraction carried). The rite ladder keeps its 2026-09-12 ratios
(`riteXp`); its own retune is the designer's Prayer pass. Root cause of the live 5-for-13.5: the pacing dial (x0.39).

## 6. Death (engine + settle + SQL + copy)
1. A hero killed -> combat-sim `die(m)`: one death, priced at once, a `death` event; the hunt ends `died` at that member's
   next boundary; the hero is home at FULL HP and mana (Q8). One hero dies only once a hunt.
2. Party (Tyler): every other member ends `party_member_died` at its own boundary and pays nothing for it.
3. Price (Q7): Level loses `DEATH_XP_LOSS` (2%) of `DEATH_XP_BASE` (`total` Level XP; `level` = the current Level's span),
   never below the current Level's floor; each combat skill loses 2% of its progress toward the next level. Blessings
   (320/630/950 permille) reduce both. SQL re-bounds the price and debits it (`death_xp_over` refuses an over-charge).
4. `END_ORDER` starts `died`, `party_member_died`; both resume the last non-hunt activity (`RESUME_AFTER_END`).
5. Copy: `"{name} died in {ground} and returned to town."` / `"{member} died in {ground}, so the party returned to town."`
   (`END_REASON_COPY`); alerts kind `death`; the Deaths tab (`death_log`) shows killer, ground, Level and skill XP lost.
6. Deleted: recovery/knockout (`recovery.js`, `KNOCKOUT_MS`, `recovering_until`, `consec_falls`, falls limits, `down`, `down_ms`).

## 7. combatLevel -> Level, everywhere it is read
SQL `hr_level_of(uuid,int)` feeds the hunt floor/start gate, blessing and stamina-refill prices, hunt/party hero `level`,
chat/social/town `from_level`, the character sheet and the leaderboard (`level` board replaces `combat_level`). Hunt bands are
Level bands (Q9: cellar 1-8, thicket 5-15, sewer 8-25, warrens 32-50). `hr_bounty_combat_level` / `hr_lb_combat_level` stay
only for dormant callers (handed to the dormant-surface lane). JS `combatLevel` is deleted; the client reads the Level off
`state.level_xp` on the shared curve (`src/session/character-sections.js levelOf`).

## 8. Envelope / projection
`state.level_xp` and `state.max_hp` (derived); `level {xp, level, into, need}`; `vitals {level, max_hp, max_mana, regen_pm}`;
`skills` has melee, no attack/strength/hitpoints. Hunt hero: `level`, derived `hp_max`/`mana_max`, `regen_pm`, `xp_pct` (Level);
no `falls`. Character sheet combat: `level, max_hp, max_mana, regen_pct`, no `ward_pct`, no gear XP. Removed:
`recovering_until`, `consec_falls`, hunt `falls`/`falls_limit`/`down`, tally `down_ms`, death `recovery_ms`/`resume_hp`.
`hr_hunt_enter` loses `p_falls` (6 args).

## 9. Wipe (`2026-10-27-core-wipe.sql`, LAST; after `2026-10-26-hero-slots-start-two.sql`)
One-shot (`hr_wipe_log` key `core-rebuild-2026-10-19`); every player-owned table is emptied, cosmetics included (Q10); an
unclassified player table refuses the file. Kept: auth, profiles (reset), the closed allowlist (untouched), chat blocks,
the friend graph, bug reports, catalogues, config. Every account owns hero slots [0,1] afterwards (starter slot, no rows).

## 10. Applies in order (`tests/schema-apply-order.json`)
`2026-10-26-hero-slots-start-two.sql`, `2026-10-27-core-schema.sql`, `2026-10-27-core-catalogue.generated.sql`,
`2026-10-27-hunts-catalogue.generated.sql`, `2026-10-27-hunt-sessions-catalogue.generated.sql`, `2026-10-27-core-bodies.sql`,
`2026-10-27-core-wipe.sql`; then the hr-accrue edge deploy; then the client.

## 11. Open (not ruled; not built)
- Roles from weapons (Tyler: Mage = wand + spellbook, Healer = staff): no wand or spellbook item exists (magic weapons are
  staves, `weaponType: 'magic'`). Needs from the designer: wand and spellbook rows (names, tiers, stats, sources), the rule
  for a wand without a spellbook, then a `magicKind` field + off-hand read in `roleForWeapon` and `hr_hunt_weapon_of`.
- Ability heals and shields are flat against x12 monster damage (CORE_NUMBERS line 99): a party of four loses a hero to the
  Rat King at Level 16-25 (clears at 30+); the abilities pass owns it. Culvert bats end a Level-10-12 solo hero gold_out.
