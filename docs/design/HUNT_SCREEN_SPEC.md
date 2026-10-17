# Hunt screen spec: the hunt game from the sim, rebuilt in the real client

Game Designer, 2026-10-17. Week plan step 1 (`docs/planning/WEEK_PLAN_2026-10-17.md`). Design only; no code.
Sibling: `docs/design/HUNT_PARITY_CHECKLIST.md` (every sim behaviour, ruling and HUD element, row by row).
Contracts followed: `docs/design/ARCHITECTURE_CONTRACTS.md` (P1-P7, X1-X7, S1-S7). The architecture section (§1) needs a systems-engineer review before any code.

**How to read the labels.**
- **DECIDED** = a dated Tyler ruling (memory `steam-launch-decisions`, cited by date), the week plan, or a server row already live.
- **ASSUMED** = a pick made here or in the sim, with no ruling. Each one is listed in §5.

**The source rule.** The sim (`prototypes/hunt-sim/*.js`) is a SPEC, never source. Nothing is copied from it or from `src/legacy.js`. Each behaviour is rebuilt in its own module, against the contract in §2, with its test.

---

## 0. What changes, in one paragraph

The sim runs everything in the browser at 30 steps a second. The real game runs the same hunt on the SERVER. A pure `src/core/hunt/*` step function moves every unit, picks targets, rolls hits, applies bleed, eats and drinks, and splits XP. The edge engine (`hr-accrue`) runs it for each settle window. Postgres re-bounds the result and writes it. The client never decides anything. It receives a compact TRACK (unit tile steps with times) and an EVENT list for the window, and plays them back on the world pane. The player configures each hero (action set, target, stance, distance, chase, thresholds, supply source). The automation does the rest. Hunts are idle (Tyler 10-16).

---

## 1. Module map

One module per responsibility. Each file stays under about 600 lines. No module reads a global current player.

### 1.1 Pure core: `src/core/hunt/` (dual-runtime, run by the server, no DOM, no `Math.random`)

| Module | Owns | Est. lines |
|---|---|---|
| `grid.js` | walkable / opaque tests, Chebyshev + Euclid distance, line of sight, A* with no corner cutting | 150 |
| `leash.js` | the ONE leash choke point: `leashAllows(inst, unit, x, y)`; pack-area rect + per-hunt margin; "holder left the area" test | 80 |
| `movement.js` | continuous tile-to-tile movement, collision rule, path planning (calls `leash.js` for every monster step and every plan), follow-the-leader trail | 300 |
| `targeting.js` | target modes, in-range test, element-aware basic target pick, monster target choice and switching, the tank's auto-Challenge trigger | 250 |
| `roles.js` | per-role positioning: anchor (tank), Melee DPS slot, ranged spot claim + hysteresis, kiting (`keepDistance`) | 450 |
| `pull-cycle.js` | phases (travel, fight, regroup, down), pocket route, pull trigger, pack reset/heal, respawn timers, wipe rule | 300 |
| `damage.js` | one `hurt()`: accuracy, element multiplier, defence, vulnerability, mark, stance, shield, min 1, kill hand-off | 200 |
| `abilities.js` | ability gates (cooldown, lane, mana, rune, ammo), target types, effects; first usable ability in bar order fires | 450 |
| `status.js` | generic status stacks; bleed is the first row | 120 |
| `consumables.js` | food (HP) and drink (mana) on one lane; 50% instant + 50% over time; own stack first, then store; never stops | 150 |
| `xp.js` | per-hero kill XP = base share x that hero's multipliers; level-up events; "+XP" grouping events (1 s); Magic XP from mana | 150 |
| `tally.js` | the analyzer tallies for one session, per hero and party (dealt by ability/element, taken by monster/element, healed, supplies own/store, loot, gold, kills, XP) | 200 |
| `events.js` | the event and track schema the step emits (one place, versioned) | 120 |
| `world-step.js` | the ordered step: trail, respawn, phase AI, movement, attacks, status ticks, corpses. Calls the modules above only | 300 |

`world-step.js` becomes the body of the ONE engine loop (`simulateHuntSpan` in `src/core/combat-sim.js`). There is no second loop (AWAY-12). Swing boundaries (2.0 s) are still the outcome quantum the server re-bounds. ASSUMED (needs systems-engineer review): the step is a fixed 100 ms, integer milliseconds, and every roll draws from `seed(domain, i)` (`src/core/action-rules.js` `seedLabel`, contract S2).

### 1.2 Data rows: `src/data/` (frozen rows, each with `validate()`, generated to server tables per P1)

| File | Rows | New or existing |
|---|---|---|
| `hunt-grounds.js` | per ground: map id, start tiles, pockets `{room rect, spawns[], leashMargin}`, route order, `respawnSec`, `pullDist` | NEW (extends the `hunts.js` row by id) |
| `monsters.js` | add `speed`, `footprint:1`, `atk`, `def`, `xp`, `resist{}` (contract §1.5), `drops[]` | EXISTS; Rat King row missing |
| `hunt-roles.js` | weapon type to role (`shield` = tank Melee, `dual_axe`/`club` = Melee DPS, `bow`/`crossbow` = Ranger, `staff` = Mage or Healer), base HP, mana, range, speed 3.2 | NEW |
| `abilities.js` | contract §1.1 row shape; 3 per discipline | NEW |
| `statuses.js` | `bleed`: tick range, every, duration, max stacks, skill factor, rune-tier multipliers, damage type physical | NEW |
| `consumables.js` | own food and drink rows (HP or mana, default threshold), `INSTANT_SHARE`, `OVER_TIME_S`, lane seconds | NEW; store rows stay in `supply-basics.js` |
| `rule-subjects.js` | target modes, stances, action-set presets, distance range, setting defaults per role | EXISTS (extend) |
| `hunt-tuning.js` | swing 2.0, lane seconds, accuracies, out-of-combat regen, corpse seconds, regroup seconds, peel chance per role, hysteresis, XP group window, Challenge radius | NEW |
| `party.js` | `maxSize: 4`, `lootSplit: 'even_value'`, finder filters | NEW (contract §1.10) |
| `premium.js` | stamina cap free 8 h, premium 12 h; analyzer access; outfit flag | NEW |
| `combat-text.js` | floating-number and combat-text types (each a Settings toggle), combat-log line types | NEW |

Missing item rows today (grepped `src/data/*` 10-17): `life_rune`, `crown_shard`, a crossbow bolt, a ham, the sim's "Moonbloom tea" drink. `fire_rune` lives in `library2-items.js`; `wheat_bread`, `rat_tail`, `bones`, `slime_gel`, `bat_wing`, `venom_sac`, `silk_thread`, `spider_eye`, `bone_chips`, `copper_ore`, `night_fang`, `sticky_core` exist in `items.js`. The sewer content lane (week plan item 17) adds the missing rows; no ability may name a missing item.

### 1.3 Server (the only authority)

- **Edge:** `supabase/functions/hr-accrue/hunt-settle.js` is the one settle (tick, settle and use doors). It calls `world-step` through `simulateHuntSpan`, then builds the window's track and events (NEW `hunt-track.js`, ≤ 300 lines).
- **Postgres (C2, live):** `2026-10-21-hunt-sessions.sql` (`hunt_sessions`, `hunt_bag`, `hunt_session_tally`, `hunt_session_events`, `player_action_sets`, `hr_hunt_enter/leave/change/close`, `hr_hunt_analyzer`, `hr_hunt_lock`), `2026-10-22-hunt-sessions-settle.sql` (`hr_hunt_apply` re-bounds the edge result; `hr_hunt_instance_solo`; `hr_action_set_options(p_opts jsonb)`; `hr_stamina_of/view`; `hr_credit_combat_xp`; `hr_credit_kills`), `-arm`, `-value-bound`, `-delete-away`, and the catalogues.
- **New lane-C files (this week, §4 self-check, Security at the reopen gate):** per-hero hunt settings keys in the options jsonb; the own/store supply ledger; analyzer session stats v2; party instances; `premium_until` per character.

### 1.4 Client

```
boot
 └─ account-session   (one login per browser: auth tokens, account-scoped reads)
     └─ character-session x up to 4   (each: its own server connection, envelope state, reconcile, view)
         └─ shell (src/shell/*: window-manager, hud, renderers; built once, patched via src/render/paint.js)
             ├─ world pane: hunt scene for the VIEWED character
             ├─ HUD widgets: hunt top bar, hearth-emblem bottom bar, party panel, analyzer, chat (Combat tab)
             └─ windows: hunt settings editor, Settings (combat-text toggles), party finder
```

| Module | Owns |
|---|---|
| `src/session/account-session.js` | sign-in, sign-out (clears everything), the list of characters and slots, the character strip data |
| `src/session/character-session.js` | one character: its connection, its envelope state, `reconcile<Section>()` per P5 (replace, never merge), intent calls that carry its slot |
| `src/session/character-strip.js` | the top strip: up to 4 tabs, name + status badge (hunting, idle, low supplies, death); click switches the whole view |
| `src/hunt-view/playback.js` | plays a window's track and events on a clock, interpolating between tile steps; never invents a step |
| `src/hunt-view/scene.js` | draws the hunt instance in the world pane (sprites, y-sort, corpses, over-head bars, bleed badge, mark) via the world engine |
| `src/hunt-view/fx-layer.js` | floating numbers and effect sprites from events, each type behind its Settings toggle |
| `src/hunt-view/ambient.js` | per-map ambient life (light, water, drips, roaches, motes); display only, own seeded RNG |
| `src/hunt-view/camera.js` | follow the viewed hero, or the party centre; snap on respawn |
| `src/shell/widgets/hunt-topbar.js` | Hunt details, Leave hunt, session timer |
| `src/shell/widgets/action-bar.js` | the hearth-emblem bottom bar: 2x10 slots, HP/MP/XP/stamina, sockets, control plaque |
| `src/shell/widgets/party-panel.js` | party board |
| `src/shell/widgets/analyzer.js` | hunt analyzer (premium characters only) |
| `src/shell/widgets/chat-combat-tab.js` | the Combat tab inside the chat window |
| `src/shell/windows/hunt-settings.js` | the per-hero settings editor (desktop window or mobile full-screen editor) |
| `src/shell/windows/party-finder.js` | create, join, leave; filter by weapon type |

Every widget and window is ONE component. The shell picks the desktop window or the mobile slide-out sheet by size class (Tyler 10-16). Layout and opacity are the only client residue (P6).

---

## 2. Per-module contracts

Inputs, outputs, envelope section, tests. "inst" = one hunt instance (solo or party). Every core function is pure and takes the instance it works on.

### Core

| Module | Inputs | Outputs | Envelope section | Tests (`tests/hunt-core/<module>.mjs`) |
|---|---|---|---|---|
| grid | map grid row, two tiles, a blocked predicate | bool, distance, path or null | none | `astar-no-corner-cut`, `los-blocked-by-wall`, `path-null-when-sealed` |
| leash | inst, unit, tile | `leashAllows` bool; `holderOutside(inst, pocket)` bool | none | `monster-never-steps-outside-area`, `margin-is-per-hunt`, `every-monster-move-calls-leash` (mutant: bypass in step → red) |
| movement | inst, unit, dt | unit position, facing, `moved` | track steps | `heroes-pass-through`, `monsters-block`, `no-hero-swap`, `continuous-roll-between-tiles`, `follow-trail-until-target` |
| targeting | inst, unit, monster list, settings | ordered targets; monster target changes; Challenge request | events `target`, `challenge` | `mode-order-each`, `immune-target-still-hit-when-only-one`, `challenge-when-monster-off-tank`, `monster-retargets-on-death` |
| roles | inst, hero, leader, monsters, settings | hero goal tile; spot claims | track steps | `ranged-distance-from-own-target`, `spot-claimed-once`, `hysteresis-holds-spot`, `kite-never-adjacent`, `kite-stays-in-area`, `kite-retreats-away-from-pack`, `kiter-closes-in-when-out-of-range` |
| pull-cycle | inst, dt | phase, pocket index, pack states | events `pull`, `pack_reset`, `respawn`, `wipe` | `pull-on-approach`, `kiter-pulls-from-range`, `holder-leaves-area-pack-resets-and-heals`, `pack-not-respawn-mid-fight`, `regroup-waits-for-all` |
| damage | inst, target, amount, source, element, ability | hp change, kill | events `dmg`, `miss`, `immune`, `kill` | `weak-resist-immune`, `def-reduction`, `stance-dealt-and-taken`, `shield-absorbs-first`, `min-1` |
| abilities | inst, hero, monsters, bar config | fired ability or none; costs | events `cast`, `heal`, `shield`, `mark`; supply debits | `first-usable-in-order`, `lane-blocks-second-cast`, `no-mana-no-cast`, `rune-own-then-store`, `action-set-skips` |
| status | inst, unit, status row, source | stacks; ticks | events `status_on`, `status_tick`, `status_off` | `bleed-max-5`, `bleed-6s`, `reapply-refreshes-all`, `scales-with-melee-and-tier`, `bleed-is-physical` |
| consumables | inst, hero, settings, own stock, store row | HP/mana now + over-time effect; ledger line own or store | events `eat`, `drink`; supply debits | `food-hp-drink-mana`, `half-now-half-over-6s`, `own-first-then-store`, `never-stops-when-out`, `one-shared-lane` |
| xp | inst, kill, party, per-hero multipliers | per-hero XP; level-ups; grouped "+XP" | events `xp`, `xp_group`, `level` | `each-hero-own-multiplier`, `share-split-by-living`, `group-window-1s`, `group-shows-viewed-hero-share` |
| tally | events of one window | tally delta per hero and party | `hunt_tally` | `tally-sums-match-events`, `party-equals-sum-of-heroes`, `own-supply-costs-zero` |
| events | n/a | the schema; `EVENT_VERSION` | `hunt.events` | `schema-round-trip` |
| world-step | inst, window ms, seed fn | mutated inst, track, events | `hunt.track` | `split-parity` (N windows = 1 span, TICK-1), `attended-equals-away`, `deterministic-same-seed` |

### Server

| Piece | Inputs | Outputs | Section | Tests |
|---|---|---|---|---|
| edge settle + `hunt-track.js` | session, instance, bag, bar, keyed seed secret, server clock | track + events + tally delta + XP, loot, supply and gold deltas | `hunt` | `deno: settle-emits-track`, `track-size-bounded`, payload hash |
| `hr_hunt_apply` | edge result | writes, or refuses out of bound; ledger rows with `session_id` | all hunt sections | §4 self-check: `value-bound`, `swing-count-exact`, `supply-gold-equals-store-price-x-count` |
| per-hero settings (`hr_action_set_options` keys) | slot, preset, `p_opts` | stored options; refused never clamped | `hunt_settings` | §4: `distance-out-of-range-refused`, `unknown-key-refused` |
| supply ledger | settle | `player_ledger` intent `supply_own` (no gold) and `supply_buy` (gold, store price) | `hunt_tally.supplies` | §4: `own-line-moves-no-gold`, `store-line-price-from-catalogue` |
| analyzer v2 (`hr_hunt_analyzer`) | slot, session | session stats per hero and party | `hunt_tally` | §4: `analyzer-equals-ledger`, `free-character-gets-no-analyzer-read` |
| party instances | create, join, leave, kick | `hunt_instances.kind='party'`, members | `party` | §4: `max-size-from-config`, `loot-split-even-by-value`, `one-pull-state-per-instance` |
| premium column | server only | `premium_until` per (user_id, slot) | `premium` | §4: `client-cannot-write-premium`, `stamina-cap-follows-premium` |

### Client

| Module | Inputs | Outputs | Tests |
|---|---|---|---|
| account-session | auth | characters list; sign-out clears all sessions | `signout-clears-every-character` |
| character-session | its slot, its envelope | `G._hunt`, `G._hunt_tally`, `G._party`, `G._stamina`, `G._premium`, `G._hunt_settings`; intents with its slot | `reconcile-replaces-not-merges` per section, `no-global-current-player` (grep guard) |
| character-strip | each session's badge | the strip | `badge-from-server-state` |
| playback | `hunt.track`, `hunt.events`, now | unit positions and event times for the frame | `never-ahead-of-track`, `window-gap-holds-last-pose` |
| scene / fx-layer / camera / ambient | playback output, settings toggles | pixels only | one visual check per changed screen (922x423 + desktop) |
| widgets and windows | the character's sections | DOM built once, patched via `paint.js` | `builds-once-patches-in-place`, `buttons-off-until-server-confirms` |

---

## 3. The rules, spelled out

### 3.1 Movement (`movement.js`, `leash.js`)

1. **Heroes pass through each other.** Party members overlap freely. No swapping, no queueing, no waiting on a hero. DECIDED (Tyler 10-16, collision). The sim still swaps heroes (`sim.js:223-226`, `:245-252`); that code is NOT rebuilt.
2. **Monsters collide.** A monster blocks heroes and monsters. A hero blocks monsters. Monsters surround a target and take slots; extras queue on the ring at distance 2. DECIDED (Tyler 10-16).
3. **Footprint is 1 tile**, whatever the sprite size. DECIDED (Tyler 10-15 lineup review).
4. **Speed.** Hero base speed 3.2 tiles/s. Monster speed is a data row. Speed items and spells come later. DECIDED (Tyler 10-16).
5. **Leash = pack area + a per-hunt margin.** The pack area is the pocket's room rect. `leashMargin` is a per-hunt data value (default 1 tile, ASSUMED). Monsters never chase outside it. DECIDED (Tyler 10-17).
6. **One choke point.** `leashAllows()` is called for every monster path plan AND every monster step. No other code tests the leash. DECIDED (week plan 10-17, item 3). The sim tests it only while planning (`sim.js:188`, `:192`, `:229`).
7. **Leash resets on exit.** If the aggro holder leaves the pack area (+ margin), the pack drops its targets, walks home and heals to full. DECIDED (Tyler 10-17).
8. **Follow the leader until a new target.** Followers walk the leader's trail (one slot every 2 trail tiles). In a fight, a hero with nothing in range follows the leader while the leader moves. DECIDED (week plan item 4); trail spacing ASSUMED.
9. **Kite tiles stay inside the pack area.** A kiter never picks a tile outside the area (+ margin). This is a hard filter, not the sim's soft penalty (`sim.js:572`). DECIDED (Tyler 10-17). Nothing deals free damage from outside the leash. DECIDED (Tyler 10-17).
10. **Ranged spot reservation + hysteresis.** A ranged hero claims one tile. No other hero may claim it. It keeps the tile while the tile stays valid (inside the distance band, line of sight, no adjacent monster, inside the area). It moves only when a new tile scores better by at least the hysteresis value (0.5, ASSUMED). DECIDED rule (week plan item 3, "ranged heroes hold their claimed spot"); numbers ASSUMED.
11. **Movement is continuous.** A unit rolls from tile to tile without stopping at the centre. ASSUMED (sim behaviour).

### 3.2 Targeting and role AI (`targeting.js`, `roles.js`, `pull-cycle.js`)

1. **Role comes from the weapon**, never the outfit. Shield = tank Melee; dual axes or two-handed club = Melee DPS; bow or crossbow = Ranger; staff = Mage or Healer. DECIDED (Tyler 10-16). No vocation names anywhere. DECIDED (Tyler 10-16).
2. **The tank holds.** With monsters adjacent, the tank stands still. With none adjacent and chase on, it steps toward the nearest. DECIDED (Tyler 10-15 formation; week plan item 5).
3. **Who leads the pull.** The leader is the first hero by role order: tank Melee, Melee DPS, Ranger, Mage, Healer. ASSUMED (sim party builder `sim.js:1014`).
4. **Ranged are staggered by their distance setting**, measured from the hero's OWN target (picked by its Target setting), not from the leader. DECIDED (Tyler 10-16).
5. **Kiting = chase off AND distance > 1.** Distance 1 + chase off = hold position. Applies to every hero. DECIDED (Tyler 10-16).
6. **No Melee in the party → ranged heroes kite by default** (chase off). DECIDED (Tyler 10-16).
7. **A kiting leader pulls from its distance**, never walks into the pack. DECIDED (Tyler 10-16).
8. **A kiter retreats away from the pack**, never through it, never onto a tile next to a monster. DECIDED (Tyler 10-16).
9. **A kiter closes in** when nothing is in range (leashed monsters cannot reach it), stopping its distance short. DECIDED (week plan item 5).
10. **Ranged heroes shoot while moving.** Melee attack only when standing on a tile. DECIDED (Tyler 10-16, kiting).
11. **Target modes:** follow the leader's target, nearest, lowest HP, highest % life, strongest. ASSUMED list (sim `combat-data.js:54`; Tyler's refs show "Highest % life" and "Follow <name>").
12. **Element-aware basic target.** Prefer a target the element can hurt. An immune target is still attacked when nothing else is in range; it takes 0. DECIDED (Tyler 10-16).
13. **Monsters can switch targets.** DECIDED (Tyler 10-16). The cause is a peel roll: a hero's attack can draw a queued monster onto that hero. Chance per role is a data row (Healer 0.18, others 0). ASSUMED (sim `sim.js:773-776`).
14. **The tank auto-casts Challenge** whenever any engaged monster on screen is not targeting him. It pulls every such monster back. No player input. DECIDED (Tyler 10-16). "On screen" = engaged and within 6 tiles. ASSUMED (sim tooltip `ui.js:48`). Challenge cooldown 8 s. ASSUMED (sim data).
15. **A monster whose target died** retargets the leader. ASSUMED (sim `sim.js:748`).
16. **Deaths.** A hero at 0 HP is knocked out for `KNOCKOUT_MS` (60 s, `src/data/hunt-sessions.js:36`, DECIDED by C2 data), not the sim's 8 s. If the leader falls, the party wipes: the pack resets and heals, everyone returns to the entrance. ASSUMED (sim `sim.js:377-383`). A death is never a free heal (CLAUDE.md §6).
17. **Pack respawn** is a per-hunt value (sim 90 s, ASSUMED). A pack never respawns while its pocket is mid-fight. ASSUMED (sim).
18. **Regroup.** After a pull, the party waits until every hero is up and within 7 tiles of the leader. ASSUMED (sim).

### 3.3 Status effects (`status.js`)

1. **Bleed is generic.** Any unit can carry it, hero or monster. DECIDED (Tyler 10-16).
2. **Max 5 stacks, 6 s each, one tick per second.** Reapplying refreshes every stack. DECIDED (week plan item 6) for stacks and duration; tick 1-3 and refresh rule ASSUMED (sim data).
3. **Scaling is slow:** tick = base x (1 + Melee skill x 0.004) x rune-tier multiplier (tier 1: 1.00, 2: 1.10, 3: 1.20). The form is DECIDED (Tyler 10-16); the numbers are ASSUMED.
4. **Bleed damage is physical.** DECIDED (Tyler 10-16).
5. **Rend consumes a Life rune** (an existing rune family). No new rune types. DECIDED (Tyler 10-16).
6. **The tick value is fixed when the stack lands.** ASSUMED (sim).

### 3.4 Consumables (`consumables.js`)

1. **Food restores HP. Drink restores mana. No potions.** DECIDED (Tyler 10-16).
2. **50% instantly, 50% over 6 s.** DECIDED (Tyler 10-16 for the split; week plan item 7 for 6 s).
3. **One shared consumable lane** (1 s). ASSUMED (Bible §9.1 PROPOSED).
4. **When.** Drink under the drink threshold first. Eat under the food threshold when no heal landed in the last 2 s. One over-time effect of each kind at a time. Thresholds are per-hero settings; defaults 30% mana, 50% HP. ASSUMED.
5. **Own stock first, free.** A hero's own carried stack is already owned, so using it costs no gold. DECIDED (Tyler 10-16).
6. **Then store-bought, at store price**, from the `supply-basics.js` row for the hunt tier. DECIDED (Tyler 10-16).
7. **A hunt never stops for lack of stock.** DECIDED (Tyler 10-16). This overrides C2's `ON_EMPTY` default `end` (`src/data/hunt-sessions.js:57`): the default becomes `switch`, and `heals_out`/`ammo_out` end no hunt. When gold cannot pay the store price, the C2 gold floor and `gold_out` still apply. ASSUMED (needs systems-engineer + Tyler sign-off; logged as a conflict).
8. Runes and ammo follow the same rule: carried first, then store. DECIDED (sim + Tyler 10-15 arrows keep a per-shot cost).

### 3.5 XP (`xp.js`)

1. **XP is per hero.** Each hero's kill XP = base share x that hero's own multipliers (bestiary mastery, boosts, later modifiers). Credited server-side per character. DECIDED (Tyler 10-16).
2. **Base share** = monster XP / heroes alive at the kill. ASSUMED (sim even split).
3. **Bestiary-ready.** `xp.js` takes a per-hero multiplier function. Today it returns 1. Account-wide bestiary (Tyler 10-15) plugs in later. DECIDED shape.
4. **Grouped "+XP" events.** Kills within 1 s of the first are one number, shown at the centre of the kills. It shows the VIEWED hero's own amount. DECIDED (Tyler 10-16).
5. **Magic XP** = mana spent x 1.5 x the ability's multiplier. Wand and staff basics cost mana and train Magic. DECIDED (Tyler 10-15 wand rule; designer ruling 10-15 for 1.5).
6. **Death XP loss** = `DEATH_XP_LOSS` (2%) in `src/data/hunt-sessions.js`. DECIDED (C2 data).
7. The sim's level curve (`HERO_XP_PER_LEVEL`) is a placeholder. Levels come from `src/core/progression.js`. DECIDED (no client level).

### 3.6 Analyzer: server-side session stats

1. The server records every session stat, for every character. DECIDED (week plan item 9; Tyler 10-17).
2. Fields: session time, next-level ETA, kills, XP, raw XP, gold, waste, balance, each per hour; supplies used (own vs store); loot; damage taken by monster and by element; damage dealt by ability and by element. Per hero and for the party (party = sum). DECIDED (Tyler 10-15 ref, 10-16 own/store, 10-16 per-hero XP).
3. "Raw XP/h" = XP before multipliers. ASSUMED (the sim shows the same number twice).
4. Income is split evenly; costs are personal. Waste = supplies x store price (own = 0). DECIDED (Tyler 10-16 own/store; ref 17 "Costs are personal").
5. **Only premium characters see the analyzer.** The server still records everything. DECIDED (Tyler 10-17).
6. The client never computes a tally. It renders `hunt_tally`. DECIDED (CLAUDE.md §6).

### 3.7 Per-hero hunt settings

Each hero has: action set, target mode, stance, distance (1-8), chase on/off, food threshold, drink threshold, supply source. Stored server-side in `player_action_sets` options (`hr_action_set_options`, `p_opts jsonb`). Refused, never clamped. DECIDED (week plan item 9); the 1-8 range and thresholds ASSUMED. Stances: Offensive (+10% dealt, +10% taken), Balanced, Defensive (-10% dealt, -15% taken). ASSUMED numbers. Action sets: Hunt, Mana train (skip rune abilities), Boss (skip area abilities). ASSUMED presets.

### 3.8 Own/store supply ledger

Every consumable, rune and ammo use is a ledger line: `supply_own` (moves a unit, no gold) or `supply_buy` (gold at the catalogue store price). Both carry `session_id`. The analyzer reads only these. DECIDED (Tyler 10-16; contract P4, §1.2).

### 3.9 Party

1. Up to 4 heroes; the limit is a config value (`party.js`), maybe 5 later. DECIDED (Tyler 10-16).
2. Any role mix (4 tanks is allowed). DECIDED (Tyler 10-16).
3. Loot is split evenly by value. DECIDED (week plan item 9). Mechanism ASSUMED: gold and the vendor value of loot are pooled per instance and split evenly; items go round-robin by a server-seeded roll (contract §1.10 `party_roll`).
4. The party finder filters by weapon type. DECIDED (Tyler 10-16).
5. Each player controls one hero. DECIDED (Tyler 10-15). One player may run up to 4 of their own characters at once (§3.10).
6. Heroes are tracked by unit id, never by kind, so duplicates work. DECIDED (Tyler 10-16).

### 3.10 Characters and premium

1. One account per player. Up to 4 characters play at once, free. A mandatory 4-per-hashed-IP concurrent cap. DECIDED (Tyler 10-17).
2. Each active character has its own server connection, state and view. No global current player. DECIDED (Tyler 10-17).
3. Only the viewed character streams live. The others keep playing on the server and show badges. DECIDED (Tyler 10-17, strip UI).
4. Slots: 2 at start, up to 5, extra slots cost escalating gold. DECIDED (Tyler 10-17); prices ASSUMED (not set here).
5. **Premium is per character, a server column** (`premium_until` on the character row). Grants: stamina cap 12 h (free 8 h), analyzer access, premium outfits, a daily 1 h training weapon. DECIDED (Tyler 10-17). Never client-held. DECIDED (CLAUDE.md §6).

### 3.11 Screen rules

1. Hunts are idle. The bar is configuration. No keybinds, no manual casts, no key labels. DECIDED (Tyler 10-16).
2. Charcoal & Gold tokens only; no brown panelling. DECIDED (Tyler 10-16).
3. Text ≥ 12 px; larger on phones. DECIDED (week plan item 12; Tyler 10-16 mobile).
4. Every floating number and combat text type has its own Settings toggle (display only). DECIDED (Tyler 10-16).
5. The combat log is a tab in the chat window, from server events, filterable by type and by hero vs party. DECIDED (Tyler 10-16).
6. Mobile: world fills the screen, slim top strip, compact bottom bar with one swipeable slot row, panels as one-at-a-time slide-out sheets, a full-screen settings editor. Desktop ships first; mobile must not break. DECIDED (Tyler 10-16).
7. "Ready in" (Huntera ref 20) is NOT built until Tyler says what it does. DECIDED (Tyler 10-16: never build a ref element without knowing its purpose). The sim's guess (next pack respawn, `ui.js:297-298`) is ASSUMED.

---

## 4. Walk-through: one hunt cycle, each step provable from the one before

Starting kit = what C2 grants on `hr_hunt_enter` (a session row, a bag, the default preset `DEFAULT_PRESET` in `rule-subjects.js`). Grounds named here are the sim's sewer pockets; the sewer data row does not exist yet (week plan item 17).

| Step | The party holds / can reach | Why the step is doable | Data it needs (exists?) |
|---|---|---|---|
| 1 Enter | a session, bag, default preset | `hr_hunt_enter` is live (C2) | `hunts.js` row (sewer: NO, item 17) |
| 2 Travel | leader position, pocket 0 | `pull-cycle` walks the leader to the pack centre; followers walk the trail | `hunt-grounds.js` pockets (NEW) |
| 3 Pull | leader inside the room within `pullDist`, or a kiter within distance + 1 | step 2 placed it there | `pullDist` (NEW tuning row) |
| 4 Fight | every pack monster targets the leader | step 3 set the aggro | monster rows (rat, slime, kobold, giant_bat, venom_spider: YES; Rat King: NO) |
| 5 Supplies | own stack from the bag; store row for the tier | the bag came in at step 1; store rows exist | `supply-basics.js` (YES); own food/drink rows (ham, tea: NO) |
| 6 Kill | XP, gold, loot events | `damage` + `xp` from step 4 hits | drops (`items.js` mostly YES; `crown_shard`, `life_rune`: NO) |
| 7 End pull | no engaged monsters | step 6 killed the last | respawn value (NEW) |
| 8 Regroup | all heroes up, within 7 tiles | knockouts end after `KNOCKOUT_MS` (YES) | none new |
| 9 Next pocket | pocket index + 1, loop at the end | route order in data | route (NEW) |
| 10 Settle | track, events, tally | the edge settle runs every window | C2 settle (YES) |

Gaps the walk-through found: the sewer ground row, the Rat King, `life_rune`, `crown_shard`, a crossbow bolt, a ham and a drink row. Rend (needs `life_rune`) and the Ranger crossbow abilities (need bolts) cannot ship until those rows exist.

---

## 5. ASSUMED items (need a number, a review or a Tyler call)

1. The server step: 100 ms fixed step inside `simulateHuntSpan`; the client gets a track, not the seed (systems-engineer review).
2. Live playback lag: the viewed character settles about every 2 s; others ride the 10 s world tick.
3. Leash margin default 1 tile.
4. Hysteresis 0.5; distance band [want - 1, want + 1.2].
5. Leader order tank, Melee DPS, Ranger, Mage, Healer.
6. Peel chance per role (Healer 0.18, others 0).
7. Challenge radius 6 tiles; cooldown 8 s.
8. Leader death = wipe; regroup within 7 tiles; pack respawn 90 s.
9. Bleed tick 1-3 every 1 s; skill factor 0.004; tiers 1.00/1.10/1.20.
10. Consumable lane 1 s; thresholds 30% mana / 50% HP; 2 s no-heal window.
11. `ON_EMPTY` default to `switch`; `gold_out` still ends a hunt (conflict with C2 data).
12. Base XP share split among living heroes; "Raw XP/h" = before multipliers.
13. Distance 1-8; stance numbers; the three action-set presets; the five target modes.
14. Party loot: pooled value split evenly, items by seeded roll.
15. "Ready in" meaning (ask Tyler); trail spacing 2; out-of-combat regen 6%/s; corpse 10 s.
