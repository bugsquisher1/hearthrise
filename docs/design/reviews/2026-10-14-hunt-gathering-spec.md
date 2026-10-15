# Hunt Gathering: Mining and Woodcutting trained inside hunts (game-designer spec, 2026-10-14, grep-verified on 6ee379c8)
Sequenced after C2 hunt sessions. Every ratio and hour below is UNVERIFIED until the forecast sim (W1) and a play gate.
## 1. The rule
- Between pulls, while no monster is engaged, your hero works one ore or wood node in that hunting ground. It's the same hunt and the same Stamina clock; the hero just isn't standing idle.
- Ground nodes need the matching skill level, a pickaxe or axe in inventory, and the ground's own combat floor (`hunts.js` `band[0]`). So Dawnstone and Duskwood need a hero who can survive a tier-6 ground.
- **Town Edge**: 6 starter nodes stay on today's standalone path, open at any combat level, tool optional. Fishing and Farming are unchanged.
- **Density (Low/Med/High) is the only lever.** There is no separate gathering slider.
## 2. Density → time split (reference hero: kill time = the ground's `refKillMs`; all UNVERIFIED)
The standing gap between pulls is `gapMs = gapMul × refKillMs`, where `refKillMs` is a per-ground data number, not the hero's kill time. A hero who out-levels the ground kills faster, so a larger share of the hour goes to gathering. That is the mastery reward.
| Density | gapMul | Gathering share | Fighting share | Combat XP/hr vs High | Ore/logs per hr vs standalone at the same node | Supplies/hr vs High |
|---|---|---|---|---|---|---|
| High | 0.1 | ~9% | ~91% | 1.00 | ~0.09 | 1.00 |
| Med | 0.5 | ~33% | ~67% | ~0.73 | ~0.33 | ~0.73 |
| Low | 1.5 | ~60% | ~40% | ~0.44 | ~0.60 | ~0.44 |
- Stamina drains 1:1 at every density. High gives XP and burns the most food; Low gives materials and is a cheap hunt per hour; gathering XP/hr scales like the ore column. W1 replaces every cell with `forecastFight` output per ground before tuning.
## 3. Tier map (keyed to MONSTER TIER, so it survives M5's level rebase; today's floors come from `hunts.js` bands / `bounty.unlockedTier`)
| Where | Mining (`ROCKS`) | Woodcutting (`TREES`) | Combat gate today |
|---|---|---|---|
| Town Edge, standalone | copper_rock 1, essence_rock 1, iron_rock 15, coal_rock 30 (Tyler 2026-10-14: coal open to everyone — a gold farm and a supply/demand staple) | normal_tree 1, oak_tree 15, hollow_oak_tree 22 | none |
| T2 ground (Ridge Camp today) | verdite_seam 36, fluxsalt_pocket 40 | willow_tree 30, weeping_willow_tree 38 | 15 (Ridge Camp band) |
| T3 grounds (U0 rows) | gold_rock 45, deep_verdite_seam 48, rich_coal_rock 52, heartgarnet_geode 56 | maple_tree 45, maple_grove 52 | 25 |
| T4 | mithril_rock 60, deep_mithril_vein 67 | yew_tree 60, elder_yew_tree 68 | 40 |
| T5 | emberstone_rock 75, deep_ember_vein 82 | runewood_tree 75, ancient_runewood_tree 82 | 55 |
| T6 | dawnstone_rock 90 | duskwood_tree 90 | 70 |
- The combat floor always sits 15–20 levels below the gathering req, so at each new rung the binding gate is combat.
- Placement rule for U0 (3 grounds per tier): ores go in one ground (tunnel or ridge), woods in a second (forest), and the third holds no nodes; it's the XP and profit ground. That way no ground is best on every axis (§5).
- Until U0 lands, Ridge Camp carries both T2 lists. Mining and Woodcutting keep training past 44 on T2 nodes but unlock nothing new. Accepted: testers reset in M5.
## 4. Edge cases
- **Bag full** (`bankCap` counts stacks): before each action, if the product has no stack and the bank is at cap, the hero idles the gap (HP regen only).
  - No XP is paid; one `bag_full` timeline event is written; the hunt continues. The deleted `bag_full` stop rule stays deleted.
  - An existing ore stack always fits.
- **No tool** (`tools.bestTool` returns null for the node's skill): ground nodes don't run. The enter card says "No pickaxe: you'll only fight here", and one `no_tool` event is written.
  - The first tool needs only Town Edge: Bronze Pickaxe = Smithing 3 (`forge_bronze_pickaxe`: bronze_bar + normal_plank). The tool tier keeps today's speed/XP/double bonuses.
- **Death mid-gather** (master plan #16): flat 60 s knockout, resume at 40% HP. 3 falls end the hunt.
  - The gather carry is frozen during knockout: not lost, not advanced. Gathered items are kept.
  - The 2% death XP is combat only (C2 owns it); gathering XP is never lost.
  - A connected client and no client write identical rows (both-path test).
## 5. Accrual: one engine, no second path (CLAUDE.md §6)
- The world tick settles the session through `combat-sim.js` `simulateSpan` only. Each pull's timeline is: travel (pays nothing) → gap → fight. The gap time is added to a persisted `gather_carry_ms`. Whenever the carry reaches `gatherIntervalMs(node)`, ONE action runs.
- That action is skill-sim's pure step `resolveGatherTick`, called from inside simulateSpan exactly the way `resolveKill` is. `simulateSkillSpan`/`sliceSpan` are never called by a hunt settle.
- Seed is per action: `hunt:<session>:g:<index>`. With the carried remainder, N 10 s ticks equal one span (TICK-1 extended to the gather tally).
- Hearthfind rolls stay inside `resolveGatherTick`, so they keep paying in hunts.
## 6. The old standalone gather activity
- **It becomes Town Edge:** Fishing plus the 6 nodes above, on today's `tick-gather.js` / skill-sim path. That path still moves to sessions in lane G.
- **Delete:**
  - standalone eligibility for the 21 ground nodes (`hr_activities` gains `standalone=false`; `hr_apply` refuses `node_in_ground`)
  - those nodes as tappable cards (they become locked cards: "Found in Ridge Camp · Combat 15", linked to the hunt picker)
  - worker assignment to ground nodes (hired hands would bypass the combat gate)
- **Keep:** the `ROCKS`/`TREES` rows, their xp/ms/qty, the ladder guards and the hearthfind rows.
## 7. Work list (after C2 lands; at most 4 lanes at once)
| # | Lane | Who | Scope | h |
|---|---|---|---|---|
| D-G | data | designer | `edge:true` on 6 nodes; `nodes:[]` + `refKillMs` per `HUNTS` row; `DENSITY` table (gapMul); gen-hunts emits `hr_hunt_nodes` | 4 |
| E-G | engine | systems | gap/carry/action step in simulateSpan; bag/tool/knockout rules; TICK-1 gather tally, ONE-ENGINE guard (no skill span under hunt), both-path death test, each with `--mutate` | 12 |
| C-G | DB, **Security GO** | backend | `hunt_sessions.density`, `gather_node`, `gather_carry_ms`; enter/set-gather RPC (node id ∈ ground ∧ level ∧ tool; next-swing apply); `node_in_ground` refusal; worker refusal; tally `gather{}`; §4 self-check | 8 |
| C2-G | edge | backend | settle passes node/tool/carry; events `bag_full`, `no_tool`; deploy + hash | 5 |
| B-G | client | systems + art | density picker with server-forecast ratio preview; node picker; Analyzer gather line; locked ground cards on skill screens; visual gate 922×423 | 8 |
| W1 | evidence | designer | forecast sim per ground × density; replace §2 cells; tune `refKillMs` | 3 |
| QA | play gate | qa | fresh hero: walk-through below; L15 hero: Ridge Camp Low vs High for 1 h each; tab closed vs open; bag full; no pickaxe; 3 falls | 4 |
New-hero walk-through (each step uses only the earlier steps plus the kit: 500 gold, bronze_sword, 20 cooked_shrimp):
| Step | Holds / can reach | Proof it's doable |
|---|---|---|
| 1 Mine copper at Town Edge | kit only | copper_rock req 1, standalone, tool optional |
| 2 Smelt bronze, reach Smithing 3 | copper_ore | smelt_bronze `{copper_ore:2}` req 1 |
| 3 Chop, saw a plank | kit | normal_tree req 1 → saw_normal (Crafting 1) |
| 4 Forge a Bronze Pickaxe | bronze_bar, normal_plank, Smithing 3 | forge_bronze_pickaxe req 3 |
| 5 Mining 30 at iron_rock, Combat 15 in T1 grounds | pickaxe | iron_rock req 15 (Mining 15 from step 1); mill_cellar/bramble_edge floor 0 |
| 6 Mine Coal Rock at Town Edge (Mining 30), then enter Ridge Camp on Low for Verdite at Mining 36 | Combat 15, pickaxe, shrimp | coal_rock req 30 (Town Edge); Ridge Camp band[0]=15; verdite_seam req 36 |
## 8. Purpose test (§4) and risks
1. **Problem:** standing time is dead, and Mining/WC 99 needed no world access.
2. **Decision:** density, i.e. XP vs materials vs food burn, and which ground to hunt in.
3. **Plugs in:** the ores feed Smithing bars/whetstones/tools and the woods feed planks; the pickaxe is a Smithing sink; the market carries ore to non-fighters.
4. **Tradeoff:** materials cost combat XP/hr; Town Edge is safe but stops at ~30.
5. **Hour 100 and 1,000:** every new tier opens new nodes; Low density stays the material farm at any level.
6. **Depth or complexity?** Depth: it deletes a parallel activity's role and adds no new screen or currency.
**Risks**
1. RESOLVED (Tyler 2026-10-14): coal_rock is Town Edge, any combat level. Watch it as a gold faucet: coal's NPC sell price vs time must stay below a fighter's gold/hr at the same level (forecast check before the data lands).
2. The parity break: a gather carry that isn't persisted, or seeded per tick, makes a split settle differ. The TICK-1 gather mutant must go red first.
3. Content gap: T3–T6 nodes are unreachable until U0's 18 grounds exist, and `refKillMs` is unmeasured. W1 is a prerequisite for B-G showing any ratio.

## Amendments (Tyler, 2026-10-14)
- **Coal is Town Edge, any level** (see the tier map and risk 1).
- **Gathering is opt-in per hunt: the hunt setup has a "Gather: None / <node>" pick, and None is the DEFAULT.** With None, the hero fights straight through: no standing gap is added and density sets only the pull rate. Typical reasons to choose None: a full bag, a capped skill, or just not wanting to gather. The pick lives on the server-side hunt session row (no client-held flag) and is changeable mid-hunt as an intent.
- **Scope:** this ships as one slice of C2's follow-on (density + gather pick + one engine change + one attended/away parity test), about 10–12 agent-hours, sharing C2's Security review. It is not a standalone 44 h lane.
