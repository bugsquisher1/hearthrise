# CORE_MODEL: Level, skills, Prayer, death (core rebuild, 2026-10-19)

Maps the Tyler-confirmed core model (`.claude/coordination/core-rebuild-2026-10-19.md`, rulings-of-record) onto
code. **PROPOSED** marks a number or shape that is not ruled; each one is a question at the end, and none ships until answered.

## 1. Ids
| id | kind | cap | trains by | file of record |
|---|---|---|---|---|
| (Level) | not a skill: `player_state.level_xp` + `level_xp_frac` | none | kill XP only | `src/core/level.js` (new) |
| `melee` | combat | none | damage dealt with a melee weapon (sword+shield, dual axes, 2h club) | `src/data/skills.js` |
| `ranged` | combat | none | damage dealt with bow / crossbow | same |
| `magic` | combat | none | mana spent x 1.5 x ability multiplier (staff/wand basics cost a little mana); never damage | same |
| `defense` | combat | none | blows taken while wearing armour, scaled by attacker level; shield blocks pay extra | same |
| `prayer` | combat | none | burying bones (the artisan recipe; bury UI is lane/a-bury-bones) | same |
| woodcutting, mining, fishing, farming / cooking, crafting, smithing, runecrafting | gather / artisan | 99 | unchanged | same |

Deleted ids: `attack`, `strength`, `hitpoints`. Level is a column, not a `player_skills` row: no skill list can render it as a skill.

## 2. Curves (`src/core/xp.js` keeps the capped 99-table for gather/artisan; `src/core/level.js` owns the rest)
- **Level** (PROPOSED shape, Q1): total XP to reach L = `K x (L^3 - 6L^2 + 17L - 12) / 3`, K = 50, endless.
  Samples: L2 = 100, L10 = 9,300, L50 = 1,847,300, L100 = 15,694,800, L200 = 129,389,800.
  The 920 h target is a GUARD, not a hope: `tests/level-curve.mjs` sums (XP(L+1)-XP(L)) / inRangeXpPerHour(L) over 1..199
  from the hunts' in-range XP/h table and must land in 920 h +/- 5%. K (or monster `xp`) is tuned until it does (Q1).
- **Uncapped combat skills** (PROPOSED, Q2): XP to advance s -> s+1 = `A x b^(s-1)`, A = 60, b = 1.08; no table, no cap.
  `MAX_LEVEL = 99` stays only on `cat: gather|artisan` and is read per skill (`capOf(skillId)`), never as a global.

## 3. HP, mana, armour weight (`src/core/vitals.js`, new; SQL twin `hr_vitals_of(user, slot)`, parity-guarded)
- `maxHp = floor(hpBase + hpPerLevel x (L-1)) x (1 + 0.28 x heavyShare)`; `maxMana = floor(manaBase + manaPerLevel x (L-1)) x (1 + 0.35 x lightShare)`.
- heavyShare / lightShare = worn armour slots of that weight / armour slots (ruling: blend by slot share). Weight comes from
  each armour row's `armourClass` (plate = heavy, leather = medium, cloth = light) in `src/data/gear-tiers.js` / `items.js`.
- PROPOSED (Q3): hpBase 150, hpPerLevel 5, manaBase 100, manaPerLevel 5. `HUNT_ROLES[*].hp/.mana` deleted (role = weapon only).
- Derived, never stored: `player_state.max_hp` is dropped, readers call `hr_vitals_of`; current HP is clamped to it on read.

## 4. Where XP is earned: ONE place, `src/core/hunt-rewards.js rewardSwing` (the one engine, AWAY-1)
| world event | today | after |
|---|---|---|
| `xp` (kill share, xp-share.js) | `killXpRoute(style)` into attack/strength/... | `fx.addLevelXp(amount)` only |
| `dmg` by a hero on a monster | `hitXpRoute` (style split + hitpoints) | weapon family's skill: melee or ranged, `dmg x HIT_XP_PER_DAMAGE` (Q4); magic weapons pay nothing here |
| `cast` (mana spent) | magic | magic, unchanged formula (`magicXpFor`) |
| `dmg`/`miss` by a monster on a hero | nothing | `defense` if any armour is worn: `defXp(attackerLevel) x (shield block ? blockMult : 1)` (Q5) |
`styles.js` loses its OSRS style table, `killXpRoute`, `hitXpRoute` and `speedMod`; what remains is the melee style per weapon
family (anchor / bleed / crush, ruled) as data in `src/data/hunt-roles.js`. `progression.js COMBAT_XP_SKILLS` becomes
`['melee','ranged','magic','defense']`. Accuracy and max hit read the weapon family's skill (melee / ranged / magic) for BOTH;
`def` reads `defense`. Edge `fx.addLevelXp` journals into `delta.level_xp`; `hr_apply` clamps it per call by the window's
kills x the catalogue's monster xp (the same shape as today's combat-XP credit clamp) and credits `player_state.level_xp`.

## 5. Prayer (`src/data/skills.js PRAYER_REGEN`, read by `src/core/vitals.js regenMult(prayerLv)`)
`mult = 1 + MAX x P / (P + k)`, applied to BOTH existing regen rates in the engine: out-of-fight HP regen
(`HUNT_TUNING.oocRegenPermillePerS`, pull-cycle.js) and mana regen (`ABILITY_RULES.manaRegenPctPerMin`, abilities.js).
PROPOSED (Q6): MAX = 1.0, k = 60 -> P10 +14%, P30 +33%, P60 +50%, P120 +67%, P200 +77%; never reaches double.
No in-fight HP regen exists today, so Prayer does not heal mid-fight; food/drink stay the in-fight sustain (Q6).
Deleted: `PRAYER_WARDS`, `PRAYER_WARD_MAX_PCT`, `prayerWardPct`, the unit's `ward` field (damage.js PERSISTED, hunt-spawn).

## 6. Death (engine + settle + SQL + copy)
1. A hero unit killed -> `rewardSwing` reports it (renamed `deaths`); combat-sim `die(m)` replaces `fall()`: stamps
   `hs.endedReason = 'died'` at that swing's boundary, the hero leaves the world (party hunt goes on for the others).
2. Price: `deathXpLoss` debits Level XP by 2% (Q7: of what base) and never below the current level's floor; combat skills (Q7).
   Blessings: SQL `hr_blessing_take` already applies the held tier's permille (320/630/950) and deletes the tiers used; it is
   re-pointed from per-skill falls to the one death.
3. End: `END_ORDER` = `['died','heals_out','ammo_out','gold_out','rule','stamina','hours','left','changed','server']`;
   `RESUME_AFTER_END` includes `died` (automatic end -> town, resume the last non-hunt activity, ruled 10-14).
4. HP on return: Q8 (proposed: full HP, there being no recovery state). Copy: `"<Name> died in <ground> and returned to town."` (`src/data/alerts.js`); end card reason `died`.
5. Deaths tab (`hr_death_log_view`): `{at, ground, monster, level_xp_lost, skill_xp_lost, blessing_used}`; no `recovery_ms`,
   `resume_hp`, falls or counts-per-hunt.

## 7. combatLevel -> Level, everywhere it is read
SQL: new `hr_level_of(uuid,int)` (from `player_state.level_xp`, curve twin of level.js, parity-guarded). Re-pointed:
hunt floor warning + start gate (`2026-10-25-hunt-floor-warning.sql`), blessing price (`blessings.sql`), stamina refill price
(`stamina-refill.sql`), hunt hero `level` (hunt-world-state / settle-hooks / hunt-party), chat/whisper/town-walk/social
`from_level`, character sheet `level`, leaderboards (`combat_level` board -> `level`). Dropped once nothing calls them (self-check
scans `pg_proc.prosrc`): `hr_bounty_combat_level`, `hr_lb_combat_level`. JS: `combatLevel` deleted; `levelOf(state)` from
`src/core/level.js` in `shell/windows/hunts.js`, `data/blessings.js`, `data/stamina-refill.js`. Hunt `band` values are read
as Level (Q9: designer re-bands for the new curve).

## 8. Envelope / projection changes (`hr_state_of`, character sheet, hunt section)
+ `level: {xp, lv, into, need}`; + `vitals: {hp, hp_max, mana_max, regen_mult}`; `skills` loses attack/strength/hitpoints,
gains melee. - `recovering_until`, `consec_falls`, hunt `falls`/`falls_limit`/`down`, tally `down_ms`, death `recovery_ms`/`resume_hp`,
sheet `ward`. Hunt `ended.reason` gains `died`, loses `falls`. Party/roster rows: `recovering_until` -> gone, `combat_level` -> `level`.

## 9. Wipe migration (`2026-10-27-core-wipe.sql`, ordered LAST; after lane/a-bury-bones `2026-10-26-hero-slots-start-two.sql`)
TRUNCATE (every row of character progression or value): player_state, player_skills, player_inventory, player_bank,
player_equipment, player_progress, player_ledger, player_ledger_rollup, player_intents, player_blessings, player_action_sets,
player_hunt_presets, player_hunt_active, player_item_rules, player_outfits, player_workers, player_farm, account_wallet,
account_items, hunt_sessions, hunt_bag, hunt_session_events, hunt_session_tally, hunt_instances, hunt_parties,
hunt_party_members, hunt_party_invites, hunt_tick_lease, party, party_member, party_invite, party_hunt, party_hunt_tally,
party_hunt_roster_log, party_settle_boundary, party_tick_lease, character_names, hr_character_sheets, hr_kill_credit_log,
hr_combat_xp_credit_log, hearthfind_log, hearthfind_ordinal, world_finds, active_bounty, hr_return_anchor, hr_import_marker,
hr_tick_enrolment/horizon_log/ownership/probe/shadow, town_positions, social_presence, game_saves, chat_messages, chat_whispers,
market_listings/buy_offers/sales, world_event_joins/pledges/totals.
KEEP: auth.users, profiles, display_names, hr_name_holds, hr_access_allowlist (closed allowlist untouched), beta_invites,
beta_signup_log, bug_reports, friend_links/requests, chat_blocks, player_cosmetics + hr_discord_gift_claims (Q10), every catalogue.
Clan/raid tables are dormant (other lane): truncated here too, `profiles.clan_id` nulled, so no value survives anywhere.
SLOTS: ownership is `hr_hero_slots_of` = slot 0 + `hr_hero_slots.starter` (slot 1) - so every account owns **2** after the
wipe with no per-user rows. §4 self-check: every `auth.users` row owns `[0,1]`; every truncated table is empty; allowlist row
count unchanged; `hr_create_character(0)` and `(1)` succeed in a rolled-back probe; no function body names `max_hp`,
`recovering_until`, `consec_falls`, `falls_limit`, `hr_bounty_combat_level`.

## 10. Deletion list (by file)
- core: `recovery.js` (whole); `combat-sim.js` fall/recoveringUntilMs/downMs/hs.down/KNOCKOUT; `hunt/pull-cycle.js` knockout+downMs;
  `hunt-rewards.js` falls; `action-rules.js` falls check, SESSION_LIMITS.falls; `xp.js` combatLevel, global MAX_LEVEL;
  `combat.js` WEAPON_SPEED_MOD, STYLE_SPEED_*, swingIntervalMs speed terms, spdB, prayerWardPct, attack/strength profile;
  `styles.js` OSRS styles; `progression.js` attack/strength/hitpoints; `combat-xp-cap.js` keyed on strength (re-key to family skill);
  `away.js` CHANNEL.BLESSING + Recovery header; `auto-eat.js` (whole, #32).
- data: `skills.js` attack/strength/hitpoints + PRAYER_WARDS; `skill-guide.js` 17-21; `skill-authority.js` 63; `hunt-sessions.js`
  SESSION_LIMITS.falls, KNOCKOUT_MS, END_ORDER 'falls', falls copy; `alerts.js` knockout line; `recipes.js offer_crown_shard`
  (+ `item-descriptions.js` "or offered at Prayer"); items `reqSkill:'attack'|'strength'` -> `melee`, `spdB`, `xpB`; start-kit hitpoints XP.
- edge: `accrual.js` hitpoints maxHp raise, recovering 1150-1182/1576-1586/1635, ward snapshot; `set-activity.js` 371-380;
  `intents.js` `recovering` 409; `tick-contract.js` 292/372; `character-sheet.js` ward; `eat.js` (whole, #32).
- client: alerts.js 76-77; hunt-view summary-model/combat-log/death-explain/summary-recorder; windows hunt-summary, character
  deaths/sheet, skills.js 85; party-panel 48 + hunt-sections 125 + hunt.css 87 "Down"; bag-model 153-156 + inventory/advanced 26.
- SQL (restated whole, never patched): falls_limit/falls/down/tally.down_ms/bad_knockout/down_unbacked/per-fall pricing in
  hunt-sessions, hunt-world-state, hunt-supply-ledger, action-conditions, settle-hooks; `hr_set_auto_eat`; `trait:auto_eat`.
- NOT deleted (audit correction, Q11): `MONSTERS[*].speed` is WALK speed (milli-tiles/s, `monsterSpeedOf`), not swing speed.

## QUESTIONS for Tyler (none is ruled; each blocks only its own numbers)
Q1 Level: cubic curve + 920 h guard OK; which in-range XP/h per level does the guard assume? Q2 Uncapped skills: `60 x 1.08^(s-1)` per level?
Q3 Vitals: 150 HP / 100 mana at L1, +5 each per Level, same for every hero (mages lose today's 320-mana start)? Q4 Melee/Ranged: keep 4 XP per HP dealt?
Q5 Defense: monsters have no level (tier/xp only): add a `level` per monster? XP per blow, shield-block multiplier?
Q6 Prayer: MAX +100%, k 60; any in-fight HP regen (none today)? Q7 Death 2%: of the level gap (today) or of total XP; do combat skills lose too (all, or those trained this hunt)?
Q8 HP on return after dying: full or a fraction? Q9 Designer re-bands hunts as Level bands after Q1? Q10 Discord-gift cosmetic survives the wipe? Q11 Monster walk-speed rows stay?
