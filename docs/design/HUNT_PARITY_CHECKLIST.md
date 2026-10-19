# Hunt parity checklist

Game Designer, 2026-10-17. Built from evidence, read 10-17 at `origin/main` 7bece5f7:
- the sim code, `prototypes/hunt-sim/{sim,ui,ambient,vfx,combat-data}.js` (read line by line; `grid.js` is the map grid only);
- every Tyler ruling dated 10-15 to 10-17 in memory `steam-launch-decisions.md` (cited `T<date> L<line>`);
- the HUD refs `docs/design/refs/hud/17.png` (party), `18.png` (analyzer), `19.png` and `20.png` (bottom bar and top buttons).

Spec: `docs/design/HUNT_SCREEN_SPEC.md`. Week plan step 19: a QA agent plays the real game beside the sim, row by row. A missing row is a P1.

**2026-10-19:** the game is the source of truth; the sim is frozen and only a quality floor (live must not look or play worse). Where a row and a Tyler ruling differ, the ruling wins and the row is SUPERSEDED (memory `rulings-of-record.md`).

**ROW TOTALS: 351 rows.** Rows citing the sim code 239 · citing a 10-15..10-17 ruling 120 · citing a HUD ref 40 (a row can cite more than one). Status: TODO 285 · LIVE-SERVER 10 · DEV-ONLY 12 · DO-NOT-PORT 4 · SUPERSEDED 8 · NOT-HUNT 29 · NOT-BUILT 3.

**Keys.**
- Paths: `core/` = `src/core/hunt/`; `view/` = `src/hunt-view/`; `wdg/` = `src/shell/widgets/`; `win/` = `src/shell/windows/`; `ses/` = `src/session/`; `data/` = `src/data/`; `edge/` = `supabase/functions/hr-accrue/`.
- Tests: `hc/<module>#<case>` = `tests/hunt-core/<module>.mjs`; `hv/<module>#<case>` = `tests/hunt-view/<module>.mjs`; `sql§4 <topic>` = the §4 self-check block of that lane-C migration; `visual <screen>` = the visual gate at 922x423 + desktop.
- Owner: **S-edge** = server, pure core run by the edge settle; **S-pg** = server, Postgres RPC/table; **C** = client display only; **D** = data rows (server catalogue via P1).
- Status: **TODO** = to build; **LIVE-SERVER** = exists on the C2 server, extend or verify; **DEV-ONLY** = sim tool, not rebuilt; **DO-NOT-PORT** = sim behaviour a ruling forbids; **SUPERSEDED** = a later ruling replaced it; **NOT-HUNT** = a real ruling owned by another lane, listed so nothing is lost; **ASK-TYLER** = purpose unknown, do not build yet. **NOT-BUILT** = in a reference screenshot but its purpose is unknown, so it is left out (Tyler 10-17: unknown reference elements are not built and are not open questions).
- Sim role ids map to roles: `knight` = Melee tank, `berserker` = Melee DPS, `ranger` = Ranger, `sorcerer` = Mage, `druid` = Healer (Tyler 10-16, no vocations).

---

## 1. Grid and pathfinding — `core/grid.js`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| GR-01 | Walkable and opaque tile tests from the map grid | sim.js:31-32 | core/grid.js | S-edge | data/hunt-grounds.js map grid | hc/grid#walk-opaque | TODO |
| GR-02 | Chebyshev and Euclid distances | sim.js:35-36 | core/grid.js | S-edge | none (pure math) | hc/grid#distances | TODO |
| GR-03 | A* with 8 directions, no corner cutting, blocked predicate, node cap | sim.js:88-113 | core/grid.js | S-edge | hunt-tuning `pathNodeCap` 4000 | hc/grid#astar-no-corner-cut | TODO |
| GR-04 | Line of sight (Bresenham, end tiles ignored) | sim.js:114-123 | core/grid.js | S-edge | map grid opaque chars | hc/grid#los-blocked-by-wall | TODO |
| GR-05 | Free tile near a point (ring search) | sim.js:163-167 | core/grid.js | S-edge | none | hc/grid#free-near | TODO |
| GR-06 | Free tile on ring r around a target, nearest to the unit | sim.js:478-487 | core/grid.js | S-edge | none | hc/grid#ring-free | TODO |

## 2. Leash — `core/leash.js`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| LE-01 | Monster path planning may not leave its pocket room | sim.js:188, :192 | core/leash.js | S-edge | hunt-grounds pocket `room` | hc/leash#plan-stays-in-area | TODO |
| LE-02 | Re-route around a blocker also respects the leash | sim.js:227-232 | core/leash.js | S-edge | pocket `room` | hc/leash#reroute-stays-in-area | TODO |
| LE-03 | Point-in-room test | sim.js:37 | core/leash.js | S-edge | pocket `room` | hc/leash#in-room | TODO |
| LE-04 | ONE choke point: every monster step AND plan calls `leashAllows` | week plan item 3; T10-17 L164 | core/leash.js | S-edge | none | hc/leash#every-monster-move-calls-leash (mutant: bypass → red) | TODO |
| LE-05 | Leash = pack area + per-hunt margin; never chase outside | T10-17 L164-165 | core/leash.js | S-edge, D | hunt-grounds `leashMargin` (default 1, ASSUMED) | hc/leash#margin-is-per-hunt | TODO |
| LE-06 | Aggro holder leaves the area → pack resets, walks home, heals full | T10-17 L164 | core/pull-cycle.js + core/leash.js | S-edge | pocket `room`, `leashMargin` | hc/pull-cycle#holder-leaves-area-pack-resets-and-heals | TODO |
| LE-07 | Nothing deals free damage from outside the leash | T10-17 L164 | core/leash.js + core/roles.js | S-edge | none | hc/roles#no-damage-from-outside-area | TODO |
| LE-08 | Later hunts may allow longer leashes to chain packs | T10-17 L165 | data/hunt-grounds.js | D | `leashMargin` per hunt | hc/leash#margin-is-per-hunt | TODO |

## 3. Movement — `core/movement.js`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| MV-01 | Set a goal; keep the path when the goal is unchanged | sim.js:189-193 | core/movement.js | S-edge | none | hc/movement#same-goal-keeps-path | TODO |
| MV-02 | Continuous movement: spend the whole step budget, roll tile to tile, diagonal cost 1.414 | sim.js:196-212 | core/movement.js | S-edge | unit `speed` | hc/movement#continuous-roll-between-tiles | TODO |
| MV-03 | Heroes pass through heroes; monsters block heroes and monsters; heroes block monsters | sim.js:216-219; T10-16 L156 | core/movement.js | S-edge | none | hc/movement#heroes-pass-through, #monsters-block | TODO |
| MV-04 | Hero-hero swap in corridors | sim.js:223-226, :245-252 | none | S-edge | none | hc/movement#no-hero-swap | DO-NOT-PORT |
| MV-05 | Wait counter and re-route after 0.5 s blocked | sim.js:220-232 | core/movement.js | S-edge | hunt-tuning `blockedRepathS` 0.5 | hc/movement#reroute-after-block | TODO |
| MV-06 | Tile occupancy hand-off between stacked heroes | sim.js:237-241 | core/movement.js (monster occupancy only) | S-edge | none | hc/movement#hero-not-in-occupancy | DO-NOT-PORT |
| MV-07 | 8-way facing from the move or the target | sim.js:29, :253-259 | core/movement.js | S-edge | none | hc/movement#facing-8-way | TODO |
| MV-08 | Leader trail (last 40 tiles) | sim.js:790-791 | core/movement.js | S-edge | hunt-tuning `trailLen` 40 | hc/movement#trail-records | TODO |
| MV-09 | Follow the leader: follower i aims at trail slot i x 2 back | sim.js:417-427 | core/movement.js | S-edge | hunt-tuning `trailSpacing` 2 | hc/movement#follow-trail-until-target | TODO |
| MV-10 | Repath timers per unit | sim.js:788 and callers | core/movement.js | S-edge | hunt-tuning repath seconds | hc/movement#repath-timer | TODO |
| MV-11 | Footprint is 1 tile whatever the sprite size | T10-15 L116 | core/movement.js | S-edge, D | monsters `footprint:1` | hc/movement#footprint-one-tile | TODO |
| MV-12 | Base hero speed 3.2; speed items/spells later; speed is a stat | T10-16 L130; combat-data.js:83-92 | core/movement.js | S-edge, D | hunt-roles `speed` | hc/movement#speed-from-row | TODO |
| MV-13 | Monster speed sets kite-ability (slime 2.4, Rat King 2.8 kiteable; bat 4.4 not) | T10-16 L129; combat-data.js:134-149 | data/monsters.js | D | monsters `speed` | hc/roles#kite-slow-pack-no-hits | TODO |
| MV-14 | Hunts feel dynamic: heroes walk to monsters, monsters walk to heroes, along an authored route | T10-15 L77 | core/pull-cycle.js + core/movement.js | S-edge, D | hunt-grounds `route` | hc/pull-cycle#route-order | TODO |

## 4. Targeting — `core/targeting.js`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| TG-01 | Target modes: follow leader's target, nearest, lowest HP, highest % life, strongest | sim.js:610-619; combat-data.js:54 | core/targeting.js | S-edge, D | rule-subjects `TARGET_MODES` (extend) | hc/targeting#mode-order-each | TODO |
| TG-02 | In range: Melee = adjacent; ranged = range + line of sight | sim.js:620-621 | core/targeting.js | S-edge | hunt-roles `range` | hc/targeting#in-range | TODO |
| TG-03 | Basic attack prefers a target its element can hurt; immune still attacked, takes 0 | sim.js:759-761; T10-16 (sim comment) | core/targeting.js | S-edge | monsters `resist{}` | hc/targeting#immune-target-still-hit-when-only-one | TODO |
| TG-04 | Leader's last target is remembered (for "follow") | sim.js:765 | core/targeting.js | S-edge | none | hc/targeting#follow-uses-leader-last | TODO |
| TG-05 | Monster with a dead target retargets the leader | sim.js:748 | core/targeting.js | S-edge | none | hc/targeting#monster-retargets-on-death | TODO |
| TG-06 | Non-leader hero death: its monsters retarget the leader | sim.js:384 | core/targeting.js | S-edge | none | hc/targeting#retarget-on-hero-down | TODO |
| TG-07 | Peel: a hero attack can draw a queued monster onto that hero | sim.js:773-776 | core/targeting.js | S-edge, D | hunt-tuning `peelChance` per role (Healer 0.18, ASSUMED) | hc/targeting#peel-seeded | TODO |
| TG-08 | Monsters can switch targets; the tank auto-Challenges any on-screen monster not on him | T10-16 L131; sim.js:632, :654 | core/targeting.js + core/abilities.js | S-edge, D | abilities `challenge`; hunt-tuning `challengeRadius` 6 (ASSUMED) | hc/targeting#challenge-when-monster-off-tank | TODO |
| TG-09 | Area target = the in-range monster with most neighbours | sim.js:622-624 | core/targeting.js | S-edge | none | hc/targeting#area-centre | TODO |

## 5. Role AI — `core/roles.js`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| RO-01 | Tank: hold when adjacent; chase off = hold; else step toward nearest | sim.js:442-450 | core/roles.js | S-edge | settings `chase`, `dist` | hc/roles#tank-holds | TODO |
| RO-02 | Monsters take surround slots by the target, nearest first; extras queue at ring 2 | sim.js:452-474 | core/roles.js | S-edge | none | hc/roles#surround-then-queue | TODO |
| RO-03 | Melee DPS stands in a free slot by the tank's target; never pulls or holds | sim.js:489-504; combat-data.js:98 | core/roles.js | S-edge | hunt-roles Melee DPS row | hc/roles#melee-dps-slot | TODO |
| RO-04 | Ranged distance measured from the hero's OWN target | sim.js:511-513; T10-16 (sim comment) | core/roles.js | S-edge | settings `dist` | hc/roles#ranged-distance-from-own-target | TODO |
| RO-05 | Ranged follows the moving leader when nothing is in range | sim.js:514-517 | core/roles.js | S-edge | none | hc/roles#ranged-follows-moving-leader | TODO |
| RO-06 | Ranged spot: band [want-1, want+1.2], LOS, not next to a monster, inside the room, scored | sim.js:522-538 | core/roles.js | S-edge | hunt-tuning band, weights | hc/roles#spot-valid | TODO |
| RO-07 | Spot reservation: no two heroes claim one tile | sim.js:534; week plan item 3 | core/roles.js | S-edge | none | hc/roles#spot-claimed-once | TODO |
| RO-08 | Hysteresis: keep the spot unless a new one scores 0.5 better | sim.js:528-529, :540 | core/roles.js | S-edge | hunt-tuning `spotHysteresis` 0.5 (ASSUMED) | hc/roles#hysteresis-holds-spot | TODO |
| RO-09 | Kiting = chase off AND distance > 1 (distance 1 + chase off = hold) | sim.js:545; T10-16 L129 | core/roles.js | S-edge | settings | hc/roles#kite-predicate | TODO |
| RO-10 | Kiter closes in when nothing is in range, stopping `dist` short | sim.js:550-556; week plan item 5 | core/roles.js | S-edge | none | hc/roles#kiter-closes-in-when-out-of-range | TODO |
| RO-11 | Kiter holds when the gap is safe; keeps going to a good step | sim.js:557-559 | core/roles.js | S-edge | none | hc/roles#kite-holds-when-safe | TODO |
| RO-12 | Kiter retreats AWAY from the pack, never adjacent, prefers LOS | sim.js:560-575; T10-16 L129 | core/roles.js | S-edge | none | hc/roles#kite-retreats-away-from-pack, #kite-never-adjacent | TODO |
| RO-13 | Kite tiles restricted to the pack area (hard filter, sim had a soft +3) | sim.js:572; T10-17 L164 | core/roles.js + core/leash.js | S-edge | `leashMargin` | hc/roles#kite-stays-in-area | TODO |
| RO-14 | No Melee in the party → ranged heroes kite by default | sim.js:145-146; T10-16 L129 | core/roles.js | S-edge, D | rule-subjects role defaults | hc/roles#no-melee-defaults-to-kite | TODO |
| RO-15 | Per-role default settings (dist, target, stance, chase, action set) | combat-data.js:39-45 | data/rule-subjects.js | D | role defaults (dist 1/3/5/6, ASSUMED) | hc/roles#defaults-per-role | TODO |
| RO-16 | Formation: tank pulls and holds a tight pack; ranged staggered behind; monsters group on the tank | T10-15 L113 | core/roles.js | S-edge | none | hc/roles#formation-sample-sewer (sim stats parity) | TODO |
| RO-17 | Tank is a function (Melee + defensive + taunt), not a spec; Melee tank and Melee DPS in one hunt | T10-16 L123 | core/roles.js + data/hunt-roles.js | S-edge, D | hunt-roles | hc/roles#two-melee-one-tanks | TODO |
| RO-18 | Role comes from the equipped weapon type | T10-16 L134-137 | data/hunt-roles.js | D | weapon type → role map | hc/roles#role-from-weapon | TODO |
| RO-19 | Ranged cast and shoot while moving; Melee only when on a tile | sim.js:740, :756; T10-16 L129 | core/roles.js + core/abilities.js | S-edge | hunt-roles `range` | hc/roles#ranged-fires-on-move | TODO |

## 6. Pull cycle — `core/pull-cycle.js`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| PC-01 | Ground config: pockets (room, spawns), start tiles, route | sim.js:17-26 | data/hunt-grounds.js | D | NEW sewer row (6 pockets) | hc/pull-cycle#ground-validate | TODO |
| PC-02 | Spawn a pack; shift to a free tile within 3 if taken; remember home | sim.js:155-162 | core/pull-cycle.js | S-edge | pocket `spawns` | hc/pull-cycle#spawn-free-tile | TODO |
| PC-03 | Travel: leader walks to the pack centre (repath 1.5 s) | sim.js:400-409 | core/pull-cycle.js | S-edge | none | hc/pull-cycle#travel-to-pack | TODO |
| PC-04 | Pull when the leader is inside the room within `pullDist` 1.5 | sim.js:412; sim.js:9 | core/pull-cycle.js | S-edge, D | hunt-grounds `pullDist` | hc/pull-cycle#pull-on-approach | TODO |
| PC-05 | A kiting leader pulls from its distance + 1 | sim.js:414; T10-16 L129 | core/pull-cycle.js | S-edge | none | hc/pull-cycle#kiter-pulls-from-range | TODO |
| PC-06 | Start pull: the whole pocket targets the leader | sim.js:428-435 | core/pull-cycle.js | S-edge | none | hc/pull-cycle#whole-pocket-aggros | TODO |
| PC-07 | End pull: pack dead, respawn timer, regroup | sim.js:577-587 | core/pull-cycle.js | S-edge | hunt-grounds `respawnSec` 90 (ASSUMED) | hc/pull-cycle#end-pull | TODO |
| PC-08 | Next pocket; loop the route; count runs | sim.js:588-593 | core/pull-cycle.js | S-edge | route | hc/pull-cycle#route-loops | TODO |
| PC-09 | Pack respawns only when its pocket is not mid-fight | sim.js:794-797 | core/pull-cycle.js | S-edge | `respawnSec` | hc/pull-cycle#pack-not-respawn-mid-fight | TODO |
| PC-10 | Phases travel / fight / down / regroup | sim.js:798-807 | core/pull-cycle.js | S-edge | none | hc/pull-cycle#phase-machine | TODO |
| PC-11 | Regroup waits for all heroes up and within 7 tiles, min 1.5 s | sim.js:803-806; sim.js:12 | core/pull-cycle.js | S-edge | hunt-tuning `regroupSec`, `regroupRadius` | hc/pull-cycle#regroup-waits-for-all | TODO |
| PC-12 | Out-of-combat HP regen 6%/s | sim.js:808; sim.js:13 | core/pull-cycle.js | S-edge, D | hunt-tuning `oocRegenPct` (ASSUMED; Prayer regen open) | hc/pull-cycle#ooc-regen | TODO |
| PC-13 | ~~Leader death = wipe, all return to the entrance~~ A dead hero's hunt ends and they go to town (Tyler 10-19); the party case is not ruled | sim.js:377-383 | core/pull-cycle.js | S-edge | none | none | SUPERSEDED |
| PC-14 | ~~Hero respawn / `KNOCKOUT_MS`~~ No knockouts, no falls, no respawn: death ends the hunt, back to town (Tyler 10-19) | sim.js:8, :387-394 | core/pull-cycle.js | S-edge | none | none | SUPERSEDED |
| PC-15 | A death is never a free heal | CLAUDE.md §6 | core/pull-cycle.js | S-edge | `DEATH_XP_LOSS` | hc/pull-cycle#death-costs | LIVE-SERVER |
| PC-16 | Corpses linger 10 s, then are removed | sim.js:813-814; sim.js:11 | core/pull-cycle.js (removal) + view/scene.js (fade) | S-edge, C | hunt-tuning `corpseSec` | hc/pull-cycle#corpse-removed | TODO |
| PC-17 | Hunting is instanced: solo or party instance | T10-15 L82 | S-pg `hunt_instances` | S-pg | none | sql§4 one-instance-per-session | LIVE-SERVER |

## 7. Damage — `core/damage.js`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| DM-01 | Element multiplier: weak 1.15, resist 0.75, immune 0 | sim.js:262-268; combat-data.js:61-63 | core/damage.js | S-edge, D | monsters `resist{}` (contract §1.5) | hc/damage#weak-resist-immune | TODO |
| DM-02 | Defence reduction 3% per point | sim.js:284; combat-data.js:64 | core/damage.js | S-edge, D | monsters `def` | hc/damage#def-reduction | TODO |
| DM-03 | Vulnerability +10% for 6 s (non-stacking) | sim.js:285, :672; combat-data.js:67-68 | core/damage.js | S-edge, D | hunt-tuning `vulnMult`, `vulnSec` | hc/damage#vuln-non-stacking | TODO |
| DM-04 | Mark: +20% from the marking hero for 8 s | sim.js:286, :655 | core/damage.js | S-edge, D | abilities `hunters_mark` | hc/damage#mark-only-its-caster | TODO |
| DM-05 | "immune" text instead of a number | sim.js:287 | core/damage.js (event) + view/fx-layer.js | S-edge, C | none | hc/damage#immune-event | TODO |
| DM-06 | Min 1 damage after multipliers | sim.js:288 | core/damage.js | S-edge | none | hc/damage#min-1 | TODO |
| DM-07 | Stance: damage taken and dealt multipliers | sim.js:290, :293; combat-data.js:46-48 | core/damage.js | S-edge, D | rule-subjects `STANCES` (ASSUMED numbers) | hc/damage#stance-dealt-and-taken | TODO |
| DM-08 | Shield absorbs first | sim.js:291 | core/damage.js | S-edge | abilities `arcane_barrier` | hc/damage#shield-absorbs-first | TODO |
| DM-09 | Kill: unit dies, frees its tile, hands off to hero/monster death | sim.js:307-310 | core/damage.js | S-edge | none | hc/damage#kill-frees-tile | TODO |
| DM-10 | Monster swing: adjacent and on tile, accuracy 0.6, hit 1..atk, "miss" | sim.js:747-754; combat-data.js:66 | core/damage.js | S-edge, D | monsters `atk`; tuning `monsterAccuracy` | hc/damage#monster-swing | TODO |
| DM-11 | Hero accuracy 0.85; "miss" | sim.js:767-771; combat-data.js:65 | core/damage.js | S-edge, D | tuning `heroAccuracy` | hc/damage#hero-accuracy | TODO |
| DM-12 | Multi-hit basics (dual axes: 2 half-hits per swing) | sim.js:769; combat-data.js:83-84; T10-16 L133 | core/damage.js | S-edge, D | hunt-roles `basic.hits` | hc/damage#dual-axe-two-hits | TODO |
| DM-13 | Universal 2.0 s swing for every player and monster basic | combat-data.js:57; T10-15 L83 | core/world-step.js | S-edge, D | hunt-tuning `swing` 2.0 | hc/world-step#swing-2s | TODO |
| DM-14 | Random swing phase per unit at spawn | sim.js:137 | core/world-step.js | S-edge | none (seeded) | hc/world-step#swing-phase-seeded | TODO |
| DM-15 | Projectile hit lands after 0.22-0.25 s flight | sim.js:603-608, :667 | core/damage.js (timed event) + view/fx-layer.js | S-edge, C | hunt-tuning `projectileS` | hc/damage#projectile-delay | TODO |
| DM-16 | Coin drop x 1.3 on normal monsters | sim.js:340; combat-data.js:69 | core/damage.js kill → edge loot | S-edge, D | monsters `gp`; tuning `gpMult` | hc/xp-share#gold-roll-seeded | TODO |
| DM-17 | Loot drop rolls per drop row | sim.js:341-347 | edge loot (existing drop path) | S-edge | monsters `drops[]` | hc/world-step#drops-seeded | LIVE-SERVER |

## 8. Abilities — `core/abilities.js`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| AB-01 | Gates: cooldown, lane, mana | sim.js:627-628 | core/abilities.js | S-edge | abilities `cd`, `lane`, `mana` | hc/abilities#lane-blocks-second-cast | TODO |
| AB-02 | Two lanes: offense 2 s, heal 1 s | combat-data.js:58 | data/abilities.js lanes | D | contract §1.1 lanes | hc/abilities#lane-times | TODO |
| AB-03 | Target types: taunt, mark, enemy, area (≥2), cleave, self, ally, party | sim.js:630-643 | core/abilities.js | S-edge | abilities `target` | hc/abilities#target-types | TODO |
| AB-04 | Mana spend + Magic XP = mana x 1.5 x mult | sim.js:599-602; combat-data.js:59 | core/abilities.js + core/xp-share.js | S-edge, D | tuning `magicXpPerMana` | hc/xp-share#magic-xp-from-mana | TODO |
| AB-05 | Rune use: carried first, then store | sim.js:645 | core/abilities.js + core/consumables.js | S-edge | rune items; supply-basics store rows | hc/abilities#rune-own-then-store | TODO |
| AB-06 | Ammo use per shot | sim.js:646; combat-data.js:78 | core/abilities.js | S-edge, D | bolt row (missing) | hc/abilities#ammo-per-shot | TODO |
| AB-07 | Set cooldown and lane on fire | sim.js:648 | core/abilities.js | S-edge | none | hc/abilities#cd-set | TODO |
| AB-08 | Effects: taunt, mark, Rend bleed hits, single hit, area + vuln, cleave (max 3), shield, ally heal, party heal (8 tiles) | sim.js:653-686 | core/abilities.js | S-edge, D | abilities rows | hc/abilities#effects-each | TODO |
| AB-09 | Heal: capped at missing HP; healed-at stamp | sim.js:689-693 | core/abilities.js | S-edge | none | hc/abilities#heal-capped | TODO |
| AB-10 | First usable ability in bar order fires | sim.js:742 | core/abilities.js | S-edge | player_action_sets slots | hc/abilities#first-usable-in-order | TODO |
| AB-11 | Action set enables/disables abilities (Hunt, Mana train, Boss) | sim.js:625; combat-data.js:49-53 | core/abilities.js | S-edge, D | rule-subjects presets (ASSUMED) | hc/abilities#action-set-skips | TODO |
| AB-12 | Basic attack costs: wand/staff mana (no mana, no shot), crossbow bolt | sim.js:763-764; combat-data.js:87-92; T10-15 L83 | core/abilities.js | S-edge, D | hunt-roles `basic` | hc/abilities#no-mana-no-cast | TODO |
| AB-13 | Mana regen 25% of max per minute | sim.js:738; combat-data.js:60 | core/abilities.js | S-edge, D | tuning `manaRegenPerMin` | hc/abilities#mana-regen | TODO |
| AB-14 | 3 abilities per discipline, 15 sim rows | combat-data.js:97-129; T10-15 L83 | data/abilities.js | D | abilities rows | hc/abilities#rows-validate | TODO |
| AB-15 | Melee weapon styles: shield anchor, dual axes bleed, club crush | T10-16 L133 | data/abilities.js + data/hunt-roles.js | D | style rows (club crush NOT in sim) | hc/abilities#club-crush | TODO |
| AB-16 | Elemental weakness from day one; rotation auto-picks a carried matching rune | T10-15 L83 | core/abilities.js | S-edge, D | monsters `resist{}`; rune rows | hc/abilities#auto-pick-matching-rune | TODO |
| AB-17 | Hunts are idle: no manual casts, no keybinds, no key labels | T10-16 L132 | core/abilities.js (no press path) + wdg/action-bar.js | S-edge, C | none | guard: no hunt_use press from the bar | TODO |

## 9. Status effects — `core/status.js`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| ST-01 | Apply bleed: refresh all stacks; add one up to max | sim.js:350-359 | core/status.js | S-edge, D | statuses `bleed` | hc/status#reapply-refreshes-all | TODO |
| ST-02 | Max 5 stacks, 6 s, tick 1-3 every 1 s | combat-data.js:33; week plan item 6 | data/statuses.js | D | `bleed` row | hc/status#bleed-max-5, #bleed-6s | TODO |
| ST-03 | Scaling: x (1 + Melee x 0.004) x rune tier (1.00/1.10/1.20), fixed at landing | sim.js:354-356; combat-data.js:36-38; T10-16 L145 | core/status.js | S-edge, D | `bleed` skill factor, tier mults (ASSUMED numbers) | hc/status#scales-with-melee-and-tier | TODO |
| ST-04 | Ticks, removal at expiry, kill from a tick | sim.js:360-367 | core/status.js | S-edge | none | hc/status#tick-and-expire | TODO |
| ST-05 | Bleed damage counts as physical | sim.js:296; T10-16 L146 | core/status.js + core/tally.js | S-edge | `bleed.damageType` | hc/status#bleed-is-physical | TODO |
| ST-06 | Bleed is generic: heroes and monsters can carry it | combat-data.js:31-32; T10-16 L145 | core/status.js | S-edge | none | hc/status#monster-can-bleed-hero | TODO |
| ST-07 | Rend uses a Life rune; tier scales numbers only; no new rune types | combat-data.js:74; T10-16 L146 | data/abilities.js | D | `life_rune` (missing row) | hc/abilities#rend-needs-life-rune | TODO |
| ST-08 | Blood trickle; faster with more stacks | sim.js:369-371 | view/fx-layer.js | C | none | hv/fx-layer#drip-rate | TODO |

## 10. Consumables — `core/consumables.js`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| CO-01 | Over-time effect ticks (HP and mana) | sim.js:698-706 | core/consumables.js | S-edge | none | hc/consumables#over-time-ticks | TODO |
| CO-02 | Drink when its action-bar slot's conditions match (default mana < 30%): own then store, 50/50 | sim.js:713-721; T10-18 | core/consumables.js | S-edge, D | consumables drink row | hc/consumables#drink-on-condition | TODO |
| CO-03 | Eat when its action-bar slot's conditions match (default HP < 50%), whenever the 1 s lane is free (2026-10-19: no heal window, no wait for a running over-time half; the new half replaces it) | sim.js:723-731; T10-18 | core/consumables.js | S-edge, D | consumables food row | hc/consumables#eat-on-condition | TODO |
| CO-04 | Food = HP, drink = mana, no potions | T10-16 L124 | data/consumables.js | D | rows with `hp` or `mana`, never both | hc/consumables#food-hp-drink-mana | TODO |
| CO-05 | 50% instantly, 50% over 6 s | sim.js:697; T10-16 L125; week plan item 7 | core/consumables.js | S-edge, D | `INSTANT_SHARE` 0.5, `OVER_TIME_S` 6 | hc/consumables#half-now-half-over-6s | TODO |
| CO-06 | One shared consumable lane, 1 s | combat-data.js:21 | core/consumables.js | S-edge, D | lane row | hc/consumables#one-shared-lane | TODO |
| CO-07 | Own stock is free; store-bought at store price; never stop for lack of stock | sim.js:711-712; T10-16 L144 | core/consumables.js + S-pg ledger | S-edge, S-pg | supply-basics; `ON_EMPTY` default → `switch` | hc/consumables#own-first-then-store, #never-stops-when-out | TODO |
| CO-08 | Consumable rows (sim: Moonbloom tea 60 mana, Ham 70 HP, Bread 45 HP) | combat-data.js:16-20 | data/consumables.js | D | ham + tea rows missing; `wheat_bread` exists | hc/consumables#rows-validate | TODO |
| CO-09 | Carried stack sizes per role | combat-data.js:22-28 | S-pg `hunt_bag` (player-packed) | S-pg | none (the player packs) | sql§4 bag-from-inventory | LIVE-SERVER |
| CO-10 | ~~Per-hero food/drink thresholds~~ folded into action-bar slot conditions (Tyler 10-18) | sim.js:710, :723 | none | none | none | none | SUPERSEDED |

## 11. XP — `core/xp-share.js`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| XP-01 | Kill counts XP; party share = XP / living heroes | sim.js:328-336 | core/xp-share.js | S-edge | monsters `xp` | hc/xp-share#share-split-by-living | TODO |
| XP-02 | Per-hero XP = base share x that hero's multipliers, credited server-side | T10-16 L148 | core/xp-share.js + S-pg `hr_credit_combat_xp` | S-edge, S-pg | multiplier hook (1 today) | hc/xp-share#each-hero-own-multiplier | TODO |
| XP-03 | "+XP" grouping: kills within 1 s → one number at the kills' centre | sim.js:330-334, :784-787; T10-16 L147 | core/xp-share.js (event) + view/fx-layer.js | S-edge, C | tuning `xpGroupS` 1 | hc/xp-share#group-window-1s | TODO |
| XP-04 | The popup shows the VIEWED hero's own share | T10-16 L147-148 | view/fx-layer.js | C | none | hv/fx-layer#group-shows-viewed-hero-share | TODO |
| XP-05 | Level-up event + effect | sim.js:337-338 | core/xp-share.js + view/fx-layer.js | S-edge, C | progression curve (src/core/progression.js) | hc/xp-share#level-event | TODO |
| XP-06 | Sim level curve (start 20, 12,000 per level) is a placeholder | combat-data.js:29 | src/core/progression.js | S-edge | real curve | hc/xp-share#no-sim-curve | DO-NOT-PORT |
| XP-07 | Bestiary multiplier plugs in; bestiary is account-wide | T10-15 L86; T10-16 L148 | core/xp-share.js | S-edge | bestiary stage rows (later) | hc/xp-share#multiplier-hook | TODO |
| XP-08 | Death XP loss 2% | data/hunt-sessions.js `DEATH_XP_LOSS` | S-pg + core/xp-share.js | S-pg | `DEATH_XP_LOSS` | sql§4 death-xp-loss | LIVE-SERVER |

## 12. Analyzer and tallies — `core/tally.js`, S-pg `hr_hunt_analyzer`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| AN-01 | Session tally fields (xp, kills, gold, loot, magic XP, dealt, taken, healed, mana, supplies, loot items) | sim.js:271-274 | core/tally.js | S-edge | none | hc/tally#fields | TODO |
| AN-02 | Per-hero tallies | sim.js:275-277 | core/tally.js | S-edge | none | hc/tally#party-equals-sum-of-heroes | TODO |
| AN-03 | Supply use counted per hero and party, own vs store | sim.js:279, :720, :729 | core/tally.js + S-pg ledger | S-edge, S-pg | ledger intents `supply_own`, `supply_buy` | hc/tally#own-supply-costs-zero | TODO |
| AN-04 | Dealt by ability and element; taken by monster and element | sim.js:295-304 | core/tally.js | S-edge | none | hc/tally#by-ability-element | TODO |
| AN-05 | Healed per source | sim.js:691 | core/tally.js | S-edge | none | hc/tally#healed | TODO |
| AN-06 | Loot value for the analyzer (sim placeholder values) | combat-data.js:155-156 | S-pg analyzer (vendor value) | S-pg | item `v` in items.js | sql§4 analyzer-gold-at-vendor | LIVE-SERVER |
| AN-07 | Analyzer read is server-side session stats | week plan item 9; migration 2026-10-21 `hr_hunt_analyzer` | S-pg | S-pg | none | sql§4 analyzer-equals-ledger | LIVE-SERVER |
| AN-08 | Income split evenly; costs personal; waste = supplies x price (own 0); balance | ui.js:270-276; ref 17 "Costs are personal" | S-pg analyzer v2 | S-pg | supply-basics prices | sql§4 balance-identity | TODO |
| AN-09 | Next-level ETA from XP/h | ui.js:276 | S-pg analyzer v2 (rate) + wdg/analyzer.js | S-pg, C | progression curve | hv/analyzer#eta | TODO |
| AN-10 | Free characters get no analyzer; server records everything | T10-17 L187 | S-pg read gate + wdg/analyzer.js | S-pg | premium column | sql§4 free-character-gets-no-analyzer-read | TODO |
| AN-11 | Reset the analyzer session | ui.js:217, :227 | S-pg (new `hr_hunt_analyzer_reset` or a session mark) | S-pg | none | sql§4 analyzer-reset-own-only | TODO |
| AN-12 | Raw XP/h vs XP/h | ui.js:235, :284; ref 18 | S-pg analyzer v2 | S-pg | multiplier hook | sql§4 raw-xp-before-multipliers | TODO |

## 13. World step and engine — `core/world-step.js`, `edge/hunt-settle.js`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| WS-01 | Unit fields (hp, mana, cooldowns, lanes, over-time, food/drink/runes, settings, shield, marks, swing, target) | sim.js:130-139 | core/world-step.js + core/events.js | S-edge | none | hc/world-step#unit-shape | TODO |
| WS-02 | Ordered step: respawn, phase AI, regen, movement, attacks, status, corpses, fx timers | sim.js:781-823 | core/world-step.js | S-edge | none | hc/world-step#step-order | TODO |
| WS-03 | Fixed time step (sim 1/30 s; real 100 ms, ASSUMED) | sim.js:6, :1056 | core/world-step.js | S-edge | tuning `stepMs` | hc/world-step#split-parity | TODO |
| WS-04 | One engine loop inside `simulateHuntSpan`; no second loop | ARCHITECTURE_CONTRACTS P3; AWAY-12 | src/core/combat-sim.js | S-edge | none | guard AWAY-12 | LIVE-SERVER |
| WS-05 | All rolls from seeded domains, never `Math.random` | sim.js (Math.random throughout); contract S2 | core/* | S-edge | none | hc/world-step#deterministic-same-seed | TODO |
| WS-06 | Attended = away: one path whether the player watches or not | CLAUDE.md §4 | core/world-step.js | S-edge | none | hc/world-step#attended-equals-away | TODO |
| WS-07 | Track + events built per window for the client | spec §0 | edge/hunt-track.js | S-edge | `EVENT_VERSION` | deno: settle-emits-track, track-size-bounded | TODO |
| WS-08 | Headless fast-forward for measurement | sim.js:1068 | tests harness | S-edge | none | hc/world-step#fast-forward-sewer | TODO |
| WS-09 | Tyler: dynamic hunt along an authored path; travel time is real cost | T10-15 L77 | core/pull-cycle.js + edge | S-edge | route | hc/pull-cycle#travel-time-counted | TODO |
| WS-10 | Loot, XP and combat complete for beta, not slices | T10-15 L120 | all core modules | S-edge | all | parity pass (week plan step 19) | TODO |

## 14. Settings, supply ledger, premium (server) — S-pg

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| SV-01 | Per-hero settings: action set, target, stance, distance, chase | week plan item 9; ui.js:503-524 | S-pg `hr_action_set_options` p_opts | S-pg | rule-subjects keys | sql§4 unknown-key-refused | LIVE-SERVER |
| SV-02 | Distance 1-8 | ui.js:523-524 | S-pg options CHECK | S-pg, D | `DIST_RANGE` (ASSUMED) | sql§4 distance-out-of-range-refused | TODO |
| SV-03 | Own/store supply ledger lines with `session_id` | T10-16 L144; contract P4 | S-pg `player_ledger` | S-pg | ledger intents | sql§4 store-line-price-from-catalogue | TODO |
| SV-04 | `ON_EMPTY` default `end` contradicts "never stop" | data/hunt-sessions.js:57; T10-16 L144 | data/hunt-sessions.js | D | `ON_EMPTY.default='switch'` | sql§4 never-ends-heals-out | TODO |
| SV-05 | Premium is a server column per character | T10-17 L190 | S-pg `premium_until` on (user_id, slot) | S-pg | data/premium.js | sql§4 client-cannot-write-premium | TODO |
| SV-06 | Stamina cap 8 h free, 12 h premium (C2 is 12 h for all today) | T10-17 L186; data/hunt-sessions.js:130 | S-pg `hr_stamina_of` | S-pg, D | `STAMINA_MAX_MS` per premium | sql§4 stamina-cap-follows-premium | TODO |
| SV-07 | Daily 1 h training weapon per premium character; player picks the skill | T10-17 L191-198 | not hunt screen (training lane) | S-pg | training weapon rows | sql§4 daily-claim-once | NOT-HUNT |
| SV-08 | Premium outfits | T10-17 L188 | outfit lane | S-pg | outfit rows | sql§4 premium-outfit-gate | NOT-HUNT |

## 15. Party — S-pg + `win/party-finder.js`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| PA-01 | Up to 4; limit is a config value | T10-16 L142 | S-pg party instances | S-pg, D | party.js `maxSize` | sql§4 max-size-from-config | TODO |
| PA-02 | Any role mix | T10-16 L142 | S-pg + core/roles.js | S-pg | none | hc/roles#four-tanks-party | TODO |
| PA-03 | Heroes tracked by unit id, never kind | T10-16 L142 | core/* | S-edge | none | hc/world-step#duplicate-roles | TODO |
| PA-04 | Party finder filters/forces by weapon type | T10-16 L138 | win/party-finder.js + S-pg | S-pg, C | hunt-roles weapon types | sql§4 finder-filter | TODO |
| PA-05 | Loot split evenly by value | week plan item 9 | S-pg settle per instance | S-pg | party.js `lootSplit` | sql§4 loot-split-even-by-value | TODO |
| PA-06 | One account plays up to 4 of its own characters at once (Tyler 10-17, replaces "one hero per player"); party hunting with real players ready for beta | T10-17 | S-pg + ses/character-session.js | S-pg | none | sql§4 one-hero-per-session | TODO |
| PA-07 | One pull state per instance | contract §1.10 | S-pg `hunt_instances` | S-pg | none | sql§4 one-pull-state-per-instance | TODO |
| PA-08 | Party composition presets | sim.js:170-175 | none | C | none | none (dev tool) | DEV-ONLY |
| PA-09 | Party builder: any 1-4 of the roles | sim.js:1012-1024 | none | C | none | none (dev tool) | DEV-ONLY |
| PA-10 | Party create / join / leave / kick | ref 17 (kick ×, Leave party); week plan item 16 | S-pg verbs + win/party-finder.js | S-pg, C | party.js | sql§4 leave-settles-first | TODO |
| PA-11 | "Stop accepting all" (stop new join requests) | ref 17 | S-pg party option + wdg/party-panel.js | S-pg, C | party option key | sql§4 closed-party-refuses-join | TODO |

## 16. Character sessions — `src/session/*`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| CS-01 | One account; character-session architecture; no global current player | T10-17 L173-178 | ses/account-session.js, ses/character-session.js | C | none | guard no-global-current-player | TODO |
| CS-02 | Up to 4 characters play at once, free; 4-per-hashed-IP cap | T10-17 L183; L172 | S-pg session admission + ses/account-session.js | S-pg, C | config `maxConcurrent` 4 | sql§4 fifth-session-refused | TODO |
| CS-03 | Character strip: up to 4 tabs, name + status badge; click switches the view | T10-17 L168, L179 | ses/character-strip.js | C | none | hv/strip#badge-from-server-state | TODO |
| CS-04 | Only the viewed character streams live; others badge and refresh on switch | T10-17 L168 | ses/character-session.js | C | none | hv/session#only-viewed-streams | TODO |
| CS-05 | Slots: 2 at start, up to 5, extra slots cost escalating gold | T10-17 L180, L184 | S-pg slot verb | S-pg, D | slot price rows (designer to set) | sql§4 slot-price-escalates | NOT-HUNT |
| CS-06 | View switch: select a hero (camera, bar and analyzer follow it); party camera | sim.js:178-183; ui.js:127-132 | ses/character-strip.js + view/camera.js | C | none | hv/camera#follow-viewed | TODO |
| CS-07 | Per-character reconcile: replace, never merge | CLAUDE.md §6; contract P5 | ses/character-session.js | C | none | hv/session#reconcile-replaces-not-merges | TODO |
| CS-08 | Multi-character via separate accounts (4 per IP) | T10-17 L166 | none | none | none | none | SUPERSEDED (L173) |
| CS-09 | Multi-login per-tab account sessions + account strip | T10-17 L167-168 | none (strip becomes the character strip) | none | none | none | SUPERSEDED (L173) |
| CS-10 | Premium per extra concurrent character | T10-17 L171, L173-181 | none | none | none | none | SUPERSEDED (L182) |

## 17. Hunt scene and playback — `view/playback.js`, `view/scene.js`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| VW-01 | Interpolate units between states so motion is smooth at any frame rate | sim.js:849-852 | view/playback.js | C | none | hv/playback#never-ahead-of-track | TODO |
| VW-02 | Integer scale x2, no smoothing | sim.js:6, :845-846 | view/scene.js | C | art-budget | visual hunt | TODO |
| VW-03 | Y-sorted units, corpses first | sim.js:883 | view/scene.js | C | none | visual hunt | TODO |
| VW-04 | Feet on tile centre from the manifest foot anchor; hover units float | sim.js:885-890 | view/scene.js | C | walk manifest `foot_anchor`, `hover` | hv/scene#foot-anchor | TODO |
| VW-05 | Death: 0.4 s fade to grey corpse, fade out over the last 2 s | sim.js:891-896 | view/scene.js | C | `corpseSec` | visual hunt | TODO |
| VW-06 | Shield bubble on a shielded unit | sim.js:899-902 | view/scene.js | C | vfx `arcane_barrier` | visual hunt | TODO |
| VW-07 | Over-head HP bar (colour by %) + mana line for heroes, shown when not full | sim.js:903-908 | view/scene.js | C | none | visual hunt | TODO |
| VW-08 | Bleed stack badge "xN" by the HP bar | sim.js:909-914 | view/scene.js | C | none | visual hunt | TODO |
| VW-09 | Mark crosshair over the target | sim.js:915-923 | view/scene.js | C | none | visual hunt | TODO |
| VW-10 | Versioned asset URLs (fresh art every build) | sim.js:41-45 | world asset pipeline | C | manifests | guard world-assets | TODO |
| VW-11 | Walk manifest: frames by distance walked, idle frames, fallbacks | sim.js:54-68, :834-843 | world engine sprite loader | C | walk manifests | hv/scene#frames-by-distance | TODO |
| VW-12 | Foot anchor from the lowest opaque row (fallback) | sim.js:71-85 | world asset pipeline (sidecar) | C | sprite sidecars | guard world-assets | TODO |
| VW-13 | Melee DPS borrows the tank's art when its own is missing | sim.js:50-52, :835 | none (every outfit ships its own walk) | C | outfits | none | DO-NOT-PORT |
| VW-14 | Window gap: hold the last pose, never invent a step | spec §2 | view/playback.js | C | none | hv/playback#window-gap-holds-last-pose | TODO |
| VW-15 | Creature animation: walk + corpse only; shared effect sprites | T10-15 L105 | view/scene.js | C | walk + corpse sprites | visual hunt | TODO |
| VW-16 | Boss-only attack animations (Rat King) | T10-15 L106 | view/scene.js | C | boss anim rows | visual hunt | TODO |
| VW-17 | One angle for the whole scene | T10-15 L108 | art pipeline | C | art-budget | guard world-assets | TODO |
| VW-18 | Outfits cosmetic; region recolour; any hero any outfit | T10-15 L107; T10-16 L134-140 | view/scene.js (palette swap) | C, S-pg | outfit rows + region masks | hv/scene#region-recolour | TODO |
| VW-19 | No walk ships without the knight v3 south-walk side-by-side | T10-16 L143; T10-15 L121 | art pipeline | C | walk sidecars | art gate side-by-side | TODO |

## 18. Effects and floating text — `view/fx-layer.js`, vfx library

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| FX-01 | Floating numbers, colour by type, 4-step offset cycle | sim.js:305, :312-315 | view/fx-layer.js | C | combat-text types | hv/fx-layer#offset-cycle | TODO |
| FX-02 | Big "+N XP" text | sim.js:786, :997-1000 | view/fx-layer.js | C | none | hv/fx-layer#xp-big | TODO |
| FX-03 | Ability name text on cast | sim.js:651 | view/fx-layer.js | C | abilities `name` | hv/fx-layer#cast-name | TODO |
| FX-04 | Hit spark per hit | sim.js:306 | view/fx-layer.js | C | none | visual hunt | TODO |
| FX-05 | Effect map: event → sprite (slash, heal, loot, mark, shield, element bursts, per-role cast) | sim.js:317-324, :650 | data/vfx-map.js + view/fx-layer.js | C, D | vfx manifest | hv/fx-layer#every-event-has-effect | TODO |
| FX-06 | Monster death poof; loot twinkle on the corpse | sim.js:326, :345 | view/fx-layer.js | C | vfx rows | visual hunt | TODO |
| FX-07 | Projectile drawing per kind (bolt, fireball, frost, nature, arcane) with fallbacks | sim.js:936-956 | view/fx-layer.js | C | vfx rows | visual hunt | TODO |
| FX-08 | Fallback drawn effects (slash, drop, spot, X-slash, spark, burst, heal, shield, mark, loot) | sim.js:957-996 | view/fx-layer.js | C | none | visual hunt | TODO |
| FX-09 | Effect lifetimes | sim.js:815-822 | view/fx-layer.js | C | vfx `dur` | hv/fx-layer#lifetimes | TODO |
| FX-10 | VFX manifest loader (frames, fps, anchor, loop, additive) | vfx.js:5-12 | world asset pipeline | C | vfx manifest | guard world-assets | TODO |
| FX-11 | Ready + duration helpers | vfx.js:13-14 | view/fx-layer.js | C | vfx manifest | hv/fx-layer#ready-dur | TODO |
| FX-12 | Draw with anchor, loop or one-shot, additive, rotation for projectiles | vfx.js:16-29 | view/fx-layer.js | C | vfx manifest | hv/fx-layer#draw-modes | TODO |
| FX-13 | A toggle per floating-number type (dealt, taken, heals, +XP, misses/immune, mana/food/drink, loot, ability names) | T10-16 L149 | view/fx-layer.js + win/settings | C | data/combat-text.js | hv/fx-layer#toggle-hides-type | TODO |
| FX-14 | A cast effect per role | T10-15 L121 | data/vfx-map.js | D | cast sprites | hv/fx-layer#every-event-has-effect | TODO |

## 19. Camera — `view/camera.js`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| CA-01 | Smooth follow of the viewed hero or the party centre | sim.js:853-858 | view/camera.js | C | none | hv/camera#follow-viewed | TODO |
| CA-02 | Snap on respawn or when far; quick pan on view switch | sim.js:859-861, :392 | view/camera.js | C | none | hv/camera#snap-far | TODO |
| CA-03 | Camera centres in the area the shell's dock leaves visible | src/shell/window-manager.js (inset) | view/camera.js | C | none | hv/camera#respects-inset | TODO |

## 20. Ambient life — `view/ambient.js`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| AM-01 | Light sources: wall torches and braziers | ambient.js:14-15 | view/ambient.js | C | hunt-grounds `lights[]` | visual hunt | TODO |
| AM-02 | Water shimmer and flow | ambient.js:16, :62-73 | view/ambient.js | C | map water tiles | visual hunt | TODO |
| AM-03 | Drips onto water near the camera, ripples | ambient.js:30-34, :74-81 | view/ambient.js | C | vfx `water_drop_splash` | visual hunt | TODO |
| AM-04 | Roaches on wall rims, scared by heroes | ambient.js:36-58, :82-87 | view/ambient.js | C | none | visual hunt | TODO |
| AM-05 | Cool shade with holes round torches and the party | ambient.js:92-107 | view/ambient.js | C | tokens | visual hunt | TODO |
| AM-06 | Warm additive glow, flicker, torch flame sprite, dust motes | ambient.js:109-126 | view/ambient.js | C | vfx `torch_flame_loop` | visual hunt | TODO |
| AM-07 | Own seeded RNG (display only, never game state) | ambient.js:11 | view/ambient.js | C | none | hv/ambient#no-game-rng | TODO |
| AM-08 | Layer order: map, under, shade, units, glow, effects | sim.js:862-865, :925 | view/scene.js | C | none | visual hunt | TODO |
| AM-09 | Zero-size view guard (never kill the frame loop) | ambient.js:93 | view/ambient.js | C | none | hv/ambient#zero-size-safe | TODO |

## 21. Bottom bar — `wdg/action-bar.js`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| BB-01 | Layout scales with the window: 34 px tablets, 44 px at ≥ 1200 | ui.js:323-327 | wdg/action-bar.js | C | none | visual hunt | TODO |
| BB-02 | 2x10 slot tablets either side of the emblem | ui.js:338-344, :451-455; ref 19, 20 | wdg/action-bar.js | C | rule-subjects `ACTION_SET_LIMITS.slots` 20 | visual hunt | TODO |
| BB-03 | Unusable slot: disabled or out = a diagonal strike (Tyler 10-19) | ui.js:345-349, :359; ref 19 | wdg/action-bar.js | C | none | hv/action-bar#unusable-from-server | TODO |
| BB-04 | Canvas text ≥ 12 px with outline | ui.js:351-354; week plan item 12 | wdg/action-bar.js | C | tokens | visual hunt | TODO |
| BB-05 | Slot: icon or glyph fallback | ui.js:358-364, :33-64 | wdg/action-bar.js | C | icon manifest | hv/action-bar#icon-fallback | TODO |
| BB-06 | Cooldown: ember rising with seconds left (ref: "2.0", "0.4" labels) | ui.js:366-373; ref 19, 20 | wdg/action-bar.js | C | none | hv/action-bar#cd-from-server-clock | TODO |
| BB-07 | ~~Mana cost top-left, count top-right, threshold badge~~ A filled slot shows its icon and ONE corner count (Tyler 10-19) | ui.js:377-379; ref 19 | wdg/action-bar.js | C | none | visual hunt | SUPERSEDED |
| BB-08 | Flash on use | ui.js:380-381 | wdg/action-bar.js | C | none | hv/action-bar#flash-from-event | TODO |
| BB-09 | Emblem: HP arc, mana arc, XP ring, stamina arc, level, XP % | ui.js:396-415; ref 19 (HP, MP, Lv, stamina bars) | wdg/action-bar.js | C | none | visual hunt | TODO |
| BB-10 | HP and MP readouts with regen per second; shield value | ui.js:417-425; ref 19 ("+8", "+60") | wdg/action-bar.js | C | none | visual hunt | TODO |
| BB-11 | Stamina time left (sim: fake 8 h) → server `stamina` section | ui.js:17, :426-427; ref 19 "7:43h" | wdg/action-bar.js | C | `stamina` section | hv/action-bar#stamina-from-server | TODO |
| BB-12 | Stamina "+" button (refill) | ref 19, 20 | wdg/action-bar.js → stamina refill verb (contract §1.3) | S-pg, C | refill row | sql§4 refill-once | TODO |
| BB-13 | Hover tips on every emblem part | ui.js:428-431, :490-500 | wdg/action-bar.js | C | none | hv/action-bar#tips | TODO |
| BB-14 | Sockets: food and charm | ui.js:433-439, :457-462; ref 19 (two round sockets) | wdg/action-bar.js | C | charm rows (later) | visual hunt | TODO |
| BB-15 | Minimised bar (emblem only) | ui.js:444-445 | wdg/action-bar.js | C | none | hv/action-bar#minimised | TODO |
| BB-16 | Bleed tooltip with the scaling shown | ui.js:464-468 | wdg/action-bar.js | C | statuses `bleed` | hv/action-bar#bleed-tip | TODO |
| BB-17 | Slot list: basic, enabled abilities, carried runes, food, drink | ui.js:469-488 | wdg/action-bar.js | C | player_action_sets slots | hv/action-bar#slots-from-preset | TODO |
| BB-18 | Empty "+" slots to fill | ref 20 | wdg/action-bar.js + win/hunt-settings.js | C | slots | hv/action-bar#empty-slot-opens-editor | TODO |
| BB-19 | Icons per item and per role basic | ui.js:20-30 | wdg/action-bar.js | C | icon manifest | guard world-assets | TODO |
| BB-20 | Charcoal & Gold tokens; no brown | T10-16 L127 | wdg/action-bar.js | C | src/styles/tokens.css | guard token-single-source | TODO |
| BB-21 | Function from refs, look is ours | T10-16 L126 | all widgets | C | none | art review | TODO |

## 22. Control plaque and settings editor — `win/hunt-settings.js`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| HS-01 | Action set dropdown | ui.js:503; ref 19 "Mana train", ref 20 "Updated Hunt 1" | win/hunt-settings.js | C, S-pg | presets (`ACTION_SET_LIMITS.presets` 5) | hv/hunt-settings#set-sends-intent | TODO |
| HS-02 | Target dropdown; "Follow <leader name>" | ui.js:504, :513; ref 19 "Follow Tyler", ref 20 "Highest % life" | win/hunt-settings.js | C, S-pg | TARGET_MODES | hv/hunt-settings#follow-label | TODO |
| HS-03 | Stance buttons Off / Bal / Def | ui.js:505, :521; ref 19, 20 (shield icons) | win/hunt-settings.js | C, S-pg | STANCES | hv/hunt-settings#stance | TODO |
| HS-04 | Chase toggle | ui.js:505, :522; ref 19, 20 | win/hunt-settings.js | C, S-pg | option `chase` | hv/hunt-settings#chase | TODO |
| HS-05 | Distance − n + | ui.js:506, :523-524; ref 19 "2", ref 20 "1" | win/hunt-settings.js | C, S-pg | `DIST_RANGE` | hv/hunt-settings#distance-clamped-by-server | TODO |
| HS-06 | Controls show the selected hero's settings | ui.js:508-518 | win/hunt-settings.js | C | `hunt_settings` section | hv/hunt-settings#shows-viewed-hero | TODO |
| HS-07 | Buttons stay off until the server confirms | CLAUDE.md §3.3 B | win/hunt-settings.js | C | none | hv/hunt-settings#buttons-off-until-confirmed | TODO |
| HS-08 | Mobile: full-screen editor, big touch targets | T10-16 L160 | win/hunt-settings.js (sheet form) | C | none | visual 922x423 hunt-settings | TODO |
| HS-09 | Supply source per hero (own → store) | T10-16 L144 | win/hunt-settings.js + S-pg options | C, S-pg | `SUPPLY_SOURCE` | sql§4 supply-source-key | TODO |

## 23. Party panel — `wdg/party-panel.js`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| PP-01 | Portrait: the hero's own idle frame, head crop x2 | ui.js:151-161 | wdg/party-panel.js | C | walk idle frames | visual party | TODO |
| PP-02 | Role ring and role icon from the WEAPON, never the outfit | ui.js:149-150; T10-16 L137 | wdg/party-panel.js | C | hunt-roles | hv/party-panel#role-from-weapon | TODO |
| PP-03 | Role label (Melee, Ranger, Mage, Healer), no vocations | ui.js:8-10; T10-16 L123; ref 17 shows EK/RP/ED (rejected) | wdg/party-panel.js | C | hunt-roles names | guard no-vocation-names | TODO |
| PP-04 | Leader crown; follow link on others | ui.js:170; ref 17 (star, arrow) | wdg/party-panel.js | C | `party` section | visual party | TODO |
| PP-05 | Name and level | ui.js:172, :203; ref 17 | wdg/party-panel.js | C | `party` section | visual party | TODO |
| PP-06 | HP, mana and stamina gauges with numbers / time | ui.js:173-175, :199-202; ref 17 | wdg/party-panel.js | C | instance hunt view (peers never from another envelope) | hv/party-panel#peer-hp-from-instance-view | TODO |
| PP-07 | Aggro icon when a monster targets the hero | ui.js:204 | wdg/party-panel.js | C | events `target` | hv/party-panel#aggro-icon | TODO |
| PP-08 | Status icon: down, eating, drinking | ui.js:205 | wdg/party-panel.js | C | events | hv/party-panel#status-icon | TODO |
| PP-09 | DPS / total and HPS / total, on expand | ui.js:176, :206-207; ref 17; week plan item 10 | wdg/party-panel.js | C | `party` (per-member dealt/healed, not premium-gated) | hv/party-panel#dps-from-tally | TODO |
| PP-10 | Click a member to view it | ui.js:189-193 | wdg/party-panel.js → ses/character-strip.js | C | none | hv/party-panel#click-views | TODO |
| PP-11 | Footer: "Costs are personal", Stop accepting all, Leave party | ui.js:184; ref 17 | wdg/party-panel.js | C, S-pg | party verbs | hv/party-panel#footer-actions | TODO |
| PP-12 | Kick × on non-leaders | ui.js:172; ref 17 | wdg/party-panel.js | C, S-pg | party verbs | sql§4 only-leader-kicks | TODO |
| PP-13 | Close and minimise | ui.js:167; ref 17 | wdg/party-panel.js | C | none | hv/shell#close-minimise | TODO |
| PP-14 | Build when the composition changes; patch otherwise | ui.js:162-210 | wdg/party-panel.js | C | none | hv/party-panel#builds-once-patches-in-place | TODO |

## 24. Analyzer widget — `wdg/analyzer.js`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| AW-01 | Frame: title, reset, minimise | ui.js:216-217; ref 18 | wdg/analyzer.js | C | none | visual analyzer | TODO |
| AW-02 | "Hunt ended — session summary" banner | ui.js:218, :277 | wdg/analyzer.js | C | end card copy (`END_CARD_COPY`) | hv/analyzer#ended-banner | TODO |
| AW-03 | Session timer and Next-level timer | ui.js:219, :278; ref 18 | wdg/analyzer.js | C | `hunt_analyzer` | hv/analyzer#timers-from-server | TODO |
| AW-04 | This hero / Party toggle | ui.js:220; T10-16 L148 | wdg/analyzer.js | C | none | hv/analyzer#hero-party | TODO |
| AW-05 | Tabs: Session / Taken / Dealt | ui.js:221; ref 18 (Session, Damage input, Damage output) | wdg/analyzer.js | C | none | hv/analyzer#tabs | TODO |
| AW-06 | Session section: kills, XP gain, gold, waste, balance | ui.js:235; ref 18 | wdg/analyzer.js | C | `hunt_analyzer` | hv/analyzer#session-rows | TODO |
| AW-07 | Per hour: XP/h, raw XP/h, gold/h, waste/h, balance/h | ui.js:235; ref 18 | wdg/analyzer.js | C | `hunt_analyzer` | hv/analyzer#per-hour-rows | TODO |
| AW-08 | Supplies used: icon, name (own / store), count, gold | ui.js:285-286; ref 18 | wdg/analyzer.js | C | `hunt_analyzer.supplies` | hv/analyzer#own-store-lines | TODO |
| AW-09 | Loot collected: icon, name, count, value ("split evenly" in hero view) | ui.js:287-289; ref 18 | wdg/analyzer.js | C | `hunt_analyzer.loot` | hv/analyzer#loot-rows | TODO |
| AW-10 | Taken by monster and element; dealt by ability and element | ui.js:237-238, :290-295 | wdg/analyzer.js | C | `hunt_analyzer` | hv/analyzer#damage-tabs | TODO |
| AW-11 | Fold sections, keep the scroll | ui.js:240-253; ref 18 (chevrons) | wdg/analyzer.js | C | none | hv/analyzer#fold-keeps-scroll | TODO |
| AW-12 | Keyed rows: add once, update, drop | ui.js:254-264 | wdg/analyzer.js via paint.js `rows` | C | none | hv/analyzer#keyed-rows | TODO |
| AW-13 | Number formats (1,234 / 1.2k / kk / hh:mm:ss / gp) | ui.js:11-13, :281 | src/render/format (shared) | C | none | hv/format#each | TODO |
| AW-14 | Expand ">" button | ref 18 | wdg/analyzer.js | C | none | none | NOT-BUILT (ref element, purpose unknown; Tyler 10-17) |
| AW-15 | Hidden for free characters (premium only) | T10-17 L187 | wdg/analyzer.js | C | `premium` section | hv/analyzer#hidden-when-free | TODO |

## 25. Top bar — `wdg/hunt-topbar.js`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| TB-01 | Hunt details button (opens the analyzer) | ui.js:116; ref 20 | wdg/hunt-topbar.js | C | none | hv/topbar#details-opens-analyzer | TODO |
| TB-02 | Leave hunt → paused end, summary shown | ui.js:118-121; ref 20 | wdg/hunt-topbar.js → `hr_hunt_leave` | S-pg, C | END_CARD_COPY | sql§4 leave-settles | LIVE-SERVER |
| TB-03 | "Ready in" timer (sim guess: next pack respawn) | ui.js:297-298; ref 20; T10-16 L128 | wdg/hunt-topbar.js | C | none | none | NOT-BUILT (ref element, purpose unknown; Tyler 10-17) |
| TB-04 | "»" buttons beside Ready in and Leave hunt | ref 20 | wdg/hunt-topbar.js | C | none | none | NOT-BUILT (ref element, purpose unknown; Tyler 10-17) |
| TB-05 | Viewing label + switch hint | ui.js:299 | ses/character-strip.js | C | none | hv/strip#viewing-label | TODO |
| TB-06 | Sim status line (run, phase, pocket, time, speed) | sim.js:1041-1045 | none | C | none | none (dev) | DEV-ONLY |

## 26. Shell behaviour — `src/shell/*`, `src/render/paint.js`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| SH-01 | Drag panels by the header; keep the header on screen | ui.js:69-89 | src/shell/window-manager.js + hud.js | C | none | tests/shell-core.mjs drag-clamp | TODO |
| SH-02 | Minimise, hide, H toggles all; remembered | ui.js:94-115 | src/shell/hud.js (residue `hud.desktop`/`hud.phone`) | C | widget rows | tests/shell-core.mjs hide-minimise | TODO |
| SH-03 | Panels menu (choose visible panels) | ui.js:101-107, :112 | src/shell/hud.js `renderHudSettings` | C | widget rows | tests/shell-core.mjs hud-settings | TODO |
| SH-04 | Build once, patch in place (text, width, class, attribute memos) | ui.js:137-145 | src/render/paint.js | C | none | paint tests (existing) | TODO |
| SH-05 | Cadence: bar per frame, party 10 Hz, DOM 4 Hz | ui.js:526-531; sim.js:1062 | each widget | C | none | hv/perf#dom-writes-bounded | TODO |
| SH-06 | Every static element is a HUD widget: movable, semi-transparent, hideable, reset | T10-15 L78 | src/shell/hud.js | C | widget rows | tests/shell-core.mjs | TODO |
| SH-07 | Mobile: world fills screen, slim top strip, compact bar with one swipeable row, sheets one at a time | T10-16 L157-162 | src/shell/window-manager.js (phone sheet) | C | none | visual 922x423 hunt | TODO |
| SH-08 | Architect for both now; ship desktop first; mobile must not break | T10-16 L163 | every widget/window = one component | C | none | visual 922x423 hunt | TODO |
| SH-09 | Shell prototype v2 look approved | T10-15 L80 | src/shell/* | C | none | visual shell | TODO |
| SH-10 | Hotkeys list in Settings (view switch 1-4, P party cam, H hide) | ui.js:127-132; week plan item 14 | win/settings | C | hotkey rows | hv/settings#hotkeys-listed | TODO |

## 27. Combat log — `wdg/chat-combat-tab.js`

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| CL-01 | Combat tab in the chat window (movable, minimisable, semi-transparent) | T10-16 L150 | wdg/chat-combat-tab.js | C | data/combat-text.js log types | visual chat | TODO |
| CL-02 | Lines: dealt, taken, heals, XP, loot, supplies (own/store), level-ups, deaths, status effects | T10-16 L151 | wdg/chat-combat-tab.js | C | log types | hv/combat-log#line-per-event-type | TODO |
| CL-03 | Filters per type; hero vs whole party | T10-16 L152 | wdg/chat-combat-tab.js | C | none | hv/combat-log#filters | TODO |
| CL-04 | Lines come from server events, so the log matches the analyzer | T10-16 L153 | wdg/chat-combat-tab.js | C | `hunt_events` | hv/combat-log#matches-tally | TODO |
| CL-05 | Filter choices are a display-only preference | T10-16 L154 | residue allowlist | C | none | guard residue allowlist | TODO |
| CL-06 | Sim loot log (last 8 drops) | sim.js:346; ui.js:301 | wdg/chat-combat-tab.js (loot lines) | C | none | hv/combat-log#loot-lines | TODO |
| CL-07 | Sim pulls log (time to clear per pull) | sim.js:1027-1037 | none | C | none | none (dev) | DEV-ONLY |

## 28. Sim dev tools (not rebuilt)

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| DV-01 | STATS metrics (waits, no-spot, queued, min-back, pulls) | sim.js:127-128, :431, :509-510, :579-581 | none (tests measure instead) | C | none | none | DEV-ONLY |
| DV-02 | Pause, speed, restart | sim.js:1005-1011 | none | C | none | none | DEV-ONLY |
| DV-03 | Grid, congestion and path overlays | sim.js:866-881, :1025-1026, :1069 | none | C | none | none | DEV-ONLY |
| DV-04 | Frame and CPU perf probe | sim.js:1046-1051, :1063-1064 | none | C | none | none | DEV-ONLY |
| DV-05 | Window test hooks (`__S`, `__AN`, `__hurt`, `__setComp`, `__WALK`) | sim.js:1070-1074, :1020-1024 | none | C | none | none | DEV-ONLY |
| DV-06 | Expand (dev bar) and keys menu | ui.js:117, :123-126 | none | C | none | none | DEV-ONLY |
| DV-07 | Hero swing/attack counters (casts, cleaves, challenges, bleed stats, swaps) | sim.js:251, :357-358, :365, :654, :679 | none | C | none | none | DEV-ONLY |
| DV-08 | Frame loop: fixed-step accumulator, max 40 steps a frame | sim.js:1053-1066 | none (the server steps; the client plays back) | C | none | none | DEV-ONLY |

## 29. Rulings 10-15 to 10-17 owned by other lanes

Listed so the parity pass can see nothing was dropped. None blocks the hunt screen.

| id | feature | source | real module | owner | data rows | test name | status |
|---|---|---|---|---|---|---|---|
| OR-01 | Clean slate: get rid of old stuff; absence guards | T10-15 L72 | demolition lanes | C, S-pg | none | tests/demolition-absence.mjs | NOT-HUNT |
| OR-02 | Shrink legacy.js; build scalably | T10-15 L73 | client reset (week plan item 3) | C | none | monolith ratchet | NOT-HUNT |
| OR-03 | Scope deal: first playable before anything else | T10-15 L79 | planning | none | none | none | NOT-HUNT |
| OR-04 | Town feels bland: art pass later | T10-15 L81 | town art lane | C | world art | art gate | NOT-HUNT |
| OR-05 | MDR v1.1 decisions (housing, imbuements, bestiary fee, party at EA, Crowns) | T10-15 L84 | ARCHITECTURE_CONTRACTS §1 | S-pg | per contract | per contract | NOT-HUNT |
| OR-06 | North star: stable foundation, clean seams | T10-15 L85 | every lane | none | none | lane-done | NOT-HUNT |
| OR-07 | Home and bestiary shared per account | T10-15 L86 | bestiary + housing lanes | S-pg | account rows | per contract | NOT-HUNT |
| OR-08 | Fake 3/4 projection target | T10-15 L87 | none | none | none | none | SUPERSEDED (L93) |
| OR-09 | Huntera hunt ref (look + HUD function) | T10-15 L88 | this checklist (HUD rows) | C | none | visual hunt | NOT-HUNT |
| OR-10 | Anti-reference: Huntera's town | T10-15 L89 | town art lane | C | none | art gate | NOT-HUNT |
| OR-11 | Monster look ref; hunt-ground card pattern | T10-15 L90 | hunt-ground card (shell) | C | hunts rows | visual hunt-card | NOT-HUNT |
| OR-12 | Art pipeline: hand style kit | T10-15 L91 | none | none | none | none | SUPERSEDED (L92) |
| OR-13 | Revised: code-built 45° geometry | T10-15 L92 | none | none | none | none | SUPERSEDED (L93) |
| OR-14 | Final: fake 3/4 dropped; keep projection; raise art within it | T10-15 L93 | art pipeline | C | none | art gate | NOT-HUNT |
| OR-15 | Target top-down town ref | T10-15 L94 | town art lane | C | none | art gate | NOT-HUNT |
| OR-16 | No uniform straight lines | T10-15 L96 | art pipeline | C | none | art gate review question | NOT-HUNT |
| OR-17 | World art only through tools/world-art; live atlases are the bar | T10-15 L97 | art pipeline | C | sidecars | tests/world-assets.mjs | NOT-HUNT |
| OR-18 | Town blueprint v0.5 | T10-15 L98 | town map lane | C | map data | none | NOT-HUNT |
| OR-19 | 5 high-end homes, unique sites | T10-15 L99 | housing lane | C, D | properties.js | none | NOT-HUNT |
| OR-20 | Next map = the Sewer, big, with paths | T10-15 L100 | content lane (week plan item 17) | D | hunt-grounds sewer row | hc/pull-cycle#ground-validate | TODO |
| OR-21 | First region Greenhaven Frontier, 6 grounds | T10-15 L101 | content lane | D | hunts rows | none | NOT-HUNT |
| OR-22 | Sewer as the tutorial's first ground | T10-15 L102 | none | none | none | none | SUPERSEDED (L103) |
| OR-23 | Start flow: Mill Cellar → Sewer → Greenhaven | T10-15 L103 | tutorial (week plan item 17) | D | coach rows | walk-through in the tutorial spec | NOT-HUNT |
| OR-24 | Cellar breakthrough as a later first quest | T10-15 L104 | quests (later) | D | none | none | NOT-HUNT |
| OR-25 | Art style 1 chosen | T10-15 L111 | art pipeline | C | none | art gate | NOT-HUNT |
| OR-26 | Sewer map review: corridors 3-5 wide, rooms fit the party, floor variation, room stories | T10-15 L117 | sewer map lane | D | map data | visual hunt | NOT-HUNT |
| OR-27 | Heroes need stronger silhouettes; the Ranger needs an obvious ranged weapon | T10-15 L115 | art lane | C | none | art gate | NOT-HUNT |
| OR-28 | Cut-corner walls are the standard | T10-16 L122 | art pipeline | C | tilesets | art gate | NOT-HUNT |
| OR-29 | Discord cleanup closer to beta | T10-17 L169 | coordinator | none | none | none | NOT-HUNT |
| OR-30 | Checks cadence: one Security review before reopening | T10-17 L170 | coordinator | S-pg | none | reopen gate | NOT-HUNT |
| OR-31 | Concurrent unlock options (premium, gold upkeep, hybrid) | T10-17 L181 | none | none | none | none | SUPERSEDED (L182) |
| OR-32 | Crypto payments: recommendation no | T10-17 L199 | monetization (Tyler) | none | none | none | NOT-HUNT |
