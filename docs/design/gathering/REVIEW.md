# Hunt gathering: design review and forecast (game-designer, 2026-10-14, origin/main 6ee379c8)
Script: `gather-review/forecast.mjs` (output `forecast.out.txt`); consumers: `gather-review/consumers.mjs`. Run: `node forecast.mjs "R:/the game/the game"`.

## 0. What is measured and what is modelled
- **Measured (real code):** every swing is `simulateTick` with the real `hunts.js` spawns, `monsters.js` rows, `combat.js` rolls and `resolveAutoEat`. Every gather action is `resolveGatherTick` at the server-derived `gatherIntervalMs`, with the real tool bonuses. Gold is coin plus `vendorPriceOf` (the edge's NPC bid) on drops and resources. XP is paced (×PACE.xp 0.39) and summed over the combat skills. Each number is the mean of 5 seeds over 1 h. **Driver parity:** with no cycle the driver equals `simulateSpan` exactly on all 4 hunts (kills, gold and food: `PARITY … MATCH`).
- **Modelled (not in the engine yet):** the pull/break cycle and the spawn cap. Neither exists before C2 (b584 respawns instantly). The constants are mine: pull size P (High 5, Med 3, Low 1); break B in node actions (High 10, Med 5, Low 2); `respawnMs = P × refKillMs × 1.10`; `refKillMs` = the measured mean ms per kill of the reference hero (mill 8987, bramble 12667, warren 10798, ridge 9672). HP regen during breaks is not modelled. Travel (`hr_hunt_travel`) is not modelled. C2's 3-falls end is not modelled.
- **Heroes:** H1 = Atk/Str/Def 12, HP 15, bronze sword, bronze tools, Mining/WC 15. H2 = 30s, HP 30, iron sword/helm/platebody, iron tools, Mining 36, WC 30. H2X = H2 at 45s in steel. FRESH = the real `START_KIT`.

## 1. Primary model: Tyler's cycle ("a big pull, then a big break")
One cycle is a PULL of P monsters fought back to back, then a BREAK. **Spawn cap:** the pull's monsters return `respawnMs` after the pull started, and nothing starts the next pull sooner.
- **Gather Off:** break = the remaining spawn wait, spent idle.
- **Gather On:** break = max(spawn wait, B × node interval), spent gathering throughout.

Off therefore never bypasses the cap, and On turns the cap's dead time into gathering.

**No double count (asserted per run; the script throws otherwise):** fight + knockout + break + idle + sub-tick tail = 3,600,000 ms, and gather actions × interval ≤ break ms. Combat XP ÷ today's combat XP equals the fight-time share in all 66 grid rows (max |Δ| 0.007; e.g. ridge P5/B5 verdite: 0.523 vs 0.521).

Selected rows (full grid in `forecast.out.txt`). Gold = coin + drops + resources.

| Hunt (hero) | Setting | Combat XP/h | Gather XP/h | Res/h | Gold/h | Food/h | Fight / break / idle % |
|---|---|---|---|---|---|---|---|
| Mill Cellar (H1) | today, no cap | 13,388 | 0 | 0 | 2,658 | 42 | 100/0/0 |
| | Off, P High / Med / Low | 11,726 / 11,538 / 10,876 | 0 | 0 | 2,351 / 2,307 / 2,168 | 38 / 37 / 35 | 88/0/12 · 86/0/14 · 81/0/19 |
| | iron P High, B High / Med / Low | 5,362 / 7,653 / 10,209 | 5,054 / 3,615 / 1,986 | 324 / 231 / 127 | 2,731 / 2,721 / 2,678 | 17 / 24 / 33 | 40/60 · 57/43 · 76/24 |
| | iron P Low, B High | 1,575 | 7,412 | 475 | 2,734 | 5 | 11/89/0 |
| Bramble Edge (H1) | today | 15,424 | 0 | 0 | 4,694 | 68 | 100/0/0 |
| | Off P Med | 13,263 | 0 | 0 | 4,049 | 58 | 86/0/14 |
| | oak P Med, B High / Med / Low | 5,943 / 8,553 / 11,455 | 3,307 / 2,386 / 1,349 | 368 / 266 / 150 | 3,335 / 3,561 / 4,020 | 26 / 38 / 51 | 39/61 · 56/44 · 75/25 |
| Goblin Warren (H1) | today | 18,362 | 0 | 0 | 3,879 | 48 | 100/0/0 |
| | Off P High | 16,166 | 0 | 0 | 3,472 | 42 | 88/0/12 |
| | iron P High, B High / Med / Low | 8,209 / 11,256 / 14,466 | 4,646 / 3,211 / 1,750 | 297 / 206 / 112 | 3,423 / 3,454 / 3,653 | 21 / 30 / 38 | 45/55 · 62/38 · 79/21 |
| Ridge Camp (H2) | today | 47,627 | 0 | 0 | 6,599 | 9 | 100/0/0 |
| | Off P High | 42,254 | 0 | 0 | 5,943 | 8 | 89/0/11 |
| | verdite P High, B High / Med / Low | 17,069 / 24,912 / 34,820 | 6,823 / 5,088 / 2,853 | 269 / 200 / 112 | 5,361 / 5,619 / 6,161 | 3 / 5 / 6 | 36/64 · 52/48 · 73/27 |
| | willow P High, B Low | 35,875 | 1,856 | 116 | 5,987 | 6 | 75/25 |

**Findings** (each from the rows above or the MASTERY/STANDALONE/FRESH lines in the output)
1. **The spawn cap applies to every fighter, gather or not.** It costs the reference hero 11–19% of today's combat XP. It costs an over-levelled hero 30%: H2X at Ridge drops from 487 to 339 kills/h. This is the intended anti-farm property. It is also a nerf to b584 that ships with C2 whether or not gathering ships. Tune SLACK in W1; my target is ≤10% idle for the reference hero.
2. **"Sparse" (B = 0) gathers only inside the spawn wait, so it costs zero combat XP.** Ridge P5/B0 verdite gives combat ratio 0.887 (identical to Off) plus 1,171 Mining XP/h and 46 ore/h. A mastered hero's 30% dead time becomes free gathering. That is the mastery reward, and it can't be a tax.
3. **Gathering is gold-neutral to slightly negative.** At Ridge, On pays 5,361–6,161 against Off's 5,943. It never turns a ground into a gold farm, and it cuts food burn (Ridge: 8 down to 3 per hour).
4. **Coal faucet passes.** Town Edge coal at Mining 30 with an iron pickaxe pays 3,777 g/h. A Combat-30 fighter at Ridge pays 5,943 (Off) to 6,599 (today), so coal is 0.57–0.64 of the fighter. Town Edge iron at Mining 15 pays 2,683, about the same as the weakest T1 fight (Mill Cellar today, 2,658).
5. **FRESH hero, measured. This is a pre-existing balance problem and I'm flagging it to C2.** In Mill Cellar with P1, Off: 36.6 falls/h, 60% of the hour knocked out, and the 20 shrimp are gone inside an hour. With copper On and B10: 7.2 falls/h, 508 ore/h, 4,162 Mining XP/h. The break protects a new hero, but C2's 3-falls end will still close the hunt early. W1 must price Mill Cellar for the real kit.

## 2. Player control: ground data, not a player dial
**Rule.** P, B, the respawn and the node list are DATA on the ground. The player's only control is **Gather: None / <node>** (default None). Your lean holds: Balanced and Gathering-focused presets are dropped. The numbers say the choice of ground already is the preset (see §5), and a second dial adds 9 combinations per ground to the "why would I choose this" problem.

**Why ground data beats a player-chosen density.** *Clarity:* one toggle, plus a ground card that reads "Big pulls · short breaks". *Identity:* it gives §5 its shape; a player dial would let every ground be every mode. *Abuse resistance:* the server reads P, B and respawn from its own catalogue, the only client inputs are a node id and on/off, and the spawn cap is per ground and independent of gather.
**Party.** The workbook's player-chosen mob density keeps exactly one job, party scaling: P × party size, same respawn, kills split by `party-split.js`. That is automatic, not a dial. **B is counted in actions, not ms**, so a better tool shortens the break and returns the hero to the fight sooner; a tool upgrade helps a fighter too.

## 3. Tools
- **The ladder.** On main and on `set/b585-demo`, `recipes.js` rows 248–257 (bronze→rune pick/axe, Smithing 3/18/38/58/78) and 184–187 (ember 80, dawn 92) exist. **`lane/demo-data` (2af67b6d) deleted every tool recipe and kept the 31 tool items, so they have no source.** The road quests that granted tools are re-rewarded by ruling §6.
- **Ruling: tools are OPTIONAL everywhere and a pure boost.** This amends spec §4: the `no_tool` rule and its event are deleted, and so is one server check. Requiring a tool would make the first hunt-gather wait on Smithing 3 and a plank. That is a tax, which is what Tyler ruled out.
- **Restore the 10 pick/axe smithing rows plus the 4 ember/dawn rows on `lane/demo-data` before it merges.** Rods, hammers, needles and knives stay sourceless; I'll rule on them in demolition.
- **Every tier earns its place.** Each tier is +5% speed, +2% XP and +2% yield (`tools.js`), about +9–10% throughput, and Rune is ×1.5 over no tool. The exception is Ember (Smithing 80), only 2 levels after Rune (78). Move `forge_ember_*` req to 85.
- **A higher tool works on lower nodes.** `bestTool` has no node-tier check, and nodes have no tool requirement. **One tool per skill, auto-applied.** The best owned tool for each skill applies from the bag or equipment; there is nothing to equip. Each owned tool costs one bank stack, and outgrown tools vendor. That is accepted.

## 4. Economy: ore and log demand (recipes counted from `ARTISAN_RECIPES`; shop/room costs from `shops.js`)
| Raw | NPC bid | Consumers | Demand |
|---|---|---|---|
| copper_ore / rune_essence | 2 / 3 | smelt copper and bronze, stone maul, 3 room costs / 2 rune-blank rows | ok |
| iron_ore | 5 | smelt_iron (iron_bar feeds 17 recipes), 3 room costs (50, 100, 40) | ok |
| coal | 8 | 9 smelt/rune rows, 4 whetstones (ruling §1), 1 room cost | highest; the market staple |
| verdite_ore + flux_salt | 11 / 9 | smelt_verdite (verdite_bar feeds only 5 recipes), verdite platebody | **THIN**: one 5-piece set |
| gold_ore | 20 | smelt_gold (gold_bar feeds 10 jewellery recipes) | ok |
| heartgarnet | 40 | 1 recipe (Heartgarnet Maul) | **THIN**: one item, then vendor-only |
| mithril / emberstone / dawnstone | 40 / 104 / 280 | 1 smelt each (bars feed 18 / 12 / 25 recipes) | ok |
| every log | 1–230 | 1 saw each (planks feed 20–25 recipes), 8/5/2 room costs (normal/oak/willow) | ok |

**Asks:** give verdite_bar 2 more sinks (a verdite pickaxe/axe rung, or the Stonecross fittings), and make heartgarnet a gem input for Crafting jewellery. Both are content data for the T3 tier and don't block this slice.

## 5. Hunt identity (proposed ground data, solo reference hero, forecast PROPOSAL rows)
| Ground | Proposed P / B / nodes | Best at | Combat XP/h | Gather XP/h | Gold/h | Food/h |
|---|---|---|---|---|---|---|
| Mill Cellar | 1 / 10 / copper_rock, normal_tree | **gathering** and cheapest (Mining/WC 1–15 while still levelling combat) | 2,225 | 5,527 (copper) | 1,838 | 7 |
| Bramble Edge | 3 / 5 / oak_tree | **profit** (best T1 gold, Off: 4,049) | 13,263 Off / 8,553 On | 2,386 | 4,049 Off / 3,561 On | 58 / 38 |
| Goblin Warren | 5 / 0 (Sparse) / iron_rock | **XP** (best T1 combat; ore only in the dead time) | 16,166 | 987 | 3,787 | 42 |
| Ridge Camp (T2, until U0) | 5 / 2 / verdite_seam, willow_tree | T2 XP and profit; ore tier-locked here | 34,820 | 2,853 | 6,161 | 6 |

**No T1 ground leads on every axis:** Warren leads XP (16.2k vs 13.3k and 2.2k), Bramble leads gold (4.0k vs 3.8k and 1.8k), and Mill Cellar leads gathering and food. **This amends spec §3:** T1 grounds also carry the Town Edge T1 node ids (`hr_hunt_nodes` is a join table, so one node can be listed in both places), and Town Edge stays the no-combat path. Ridge Camp dominates only because it is the only T2 ground; U0's 3-per-tier rule (ore / wood / none) fixes that.

## 6. Edge cases (the rules stand; changes in **bold**)
- **Full bag:** gathered items take the exact kill-loot path into the session tally and bank. If the product has no stack and the bank is at cap, the break idles and no XP is paid. One `bag_full` event is written and the hunt goes on. An existing stack always fits.
- **Level gate:** if `resolveGatherAction` returns `level` (for example, a node's req rises in a rebase), **the gather pick clears to None and a `gather_stopped` event is written. The hunt does NOT stop.** This differs from `simulateSkillSpan`, where a level stop ends the span.
- **Death:** C2's knockout. The carry is frozen (the driver does the same), gathered items are kept, and gathering XP is never part of the death XP loss. **No tool:** **deleted** (§3).
- **Hired hands:** `hr_apply` refuses a worker on any node with `standalone=false`. Workers keep the Town Edge nodes. **Offline:** the same engine. Gathering ends when the session ends (hours, falls, vigour, supplies).
- **Exactly-once award.** The key is `(session_id, gather_index)`: `gather_index` is a monotone bigint on `hunt_sessions`, and the action's seed is `hunt:<session>:g:<gather_index>`. Each settle covers `[settled_to, now)` under `SELECT … FOR UPDATE` on the session row and advances `settled_to`, `gather_index`, `gather_carry_ms`, `pull_left` and `respawn_at` in the SAME update, guarded by `version = $read`. The ledger row carries `(session_id, gather_index_from, gather_index_to)` with a unique index.
- **Attended and away cannot both pay, because there is ONE payer.** The client never settles; its view is a display prediction replaced by the envelope. A world tick and an on-demand settle that race both read the same `version`; the loser's CAS updates 0 rows and pays nothing, and a retried request finds an empty window. **TICK-1 extended:** N 10 s settles must equal one span for kills, gather actions, items and XP, which needs `pull_left`, `respawn_at` and the carry persisted. Its mutant (carry not persisted) must go red first.

## 7. Security inputs (one review, shared with C2's follow-on)
- **Catalogue (generated from `hunts.js`).** `hr_hunts` gains `pull_size smallint 1..10`, `break_actions smallint 0..20` and `respawn_ms int` (generated as P × refKillMs × slack). New `hr_hunt_nodes(hunt_id, node_id)` with FKs to `hr_hunts` / `hr_activities`. `hr_activities` gains `standalone boolean`.
- **`hunt_sessions` gains** `gather_node text null` (regex; null = None), `gather_carry_ms int ≥0` (below the node interval), `gather_index bigint ≥0`, `pull_left smallint ≥0` and `respawn_at timestamptz`. `hunt_session_tally` gains `gather jsonb` (xp, items, actions). `hunt_session_events.type` gains `bag_full`, `gather_set` and `gather_stopped`.
- **Intents/RPCs.** `hr_hunt_enter` gains `gather_node` (default null). New `hr_hunt_set_gather(session, node|null)`: it applies at the next break, never mid-break, and is rate-limited per session per minute. `hr_apply` refuses `set_activity` on a non-standalone node (`node_in_ground`) and refuses worker assignment to one.
- **Server validations.** The session is open and owned (RLS plus `user_id`/`slot`); the node is in `hr_hunt_nodes` for `hunt_id`; skill level ≥ node req, from server XP; the tool is read from server inventory (a boost only); the interval is derived server-side (`gatherIntervalMs`, 0.70 fuse, `MIN_ACTION_MS`), and no request field reaches it.
- **Award caps per settle.** Kills ≤ (⌈window ÷ respawn_ms⌉ + 1) × P. Gather actions ≤ ⌊(window + carry) ÷ min_interval⌋. Qty ≤ actions × node.qty[1] × (1 + toolDouble) + 1. XP ≤ actions × node.xp × (1 + toolXpB) × PACE. Every grant is journalled in the ledger with its session id.

## 8. Plan (re-estimated; C2 owns the session row, settle and tally)
| M | Scope | Test that proves it | h |
|---|---|---|---|
| M-G0 data | `hunts.js` + pull/break/respawn/nodes; gen-hunts emits `hr_hunt_nodes`; `standalone` flag | gen `--check`; every hunt node exists and its req ≤ band ceiling + 20 | 2 |
| M-G1 engine | cycle (pull_left, respawn wait, break) + gather carry in the session settle, using `resolveGatherTick` only | time-bucket sum; Off = spawn-capped; TICK-1 split parity incl. gather; ONE-ENGINE guard; attended/away both-path; `--mutate` on each | 7 |
| M-G2 DB (Security GO) | §7 columns, RPCs, refusals, caps, §4 self-check | schema-drift replay; self-check executes the caps | 5 |
| M-G3 edge | settle reads and writes gather state; events; deploy + hash | accrual-engine fixture: settle vs span byte-equal | 2 |
| M-G4 client | "Gather: None / <node>" on the hunt card; break line in the receipt; ground card "pulls · breaks" | visual gate desktop + 922×423 | 3 |
| W1 tune | SLACK, P, B per ground against real heroes, incl. FRESH | this script, extended to C2's real knockout and regen | 2 |
| QA | play gate (walk-through below) on live | — | 2 |
**Total ≈ 23 h, against the earlier 10–12.** The earlier figure missed that the spawn cap changes every hunt, not just gatherers, and that the cycle state must be persisted for TICK-1.
**MINIMAL VERTICAL SLICE (≈11 h):** Mill Cellar + copper_rock only (P1, B10). The scope is: the On/Off toggle; M-G1 with one attended-vs-away parity test plus TICK-1; the M-G2 subset (gather_node, carry, index, set_gather, node-in-ground check); M-G3; played.

Walk-through (FRESH kit, verified in `start-kit.js`: 500 gold, bronze_sword, 20 cooked_shrimp, HP 10):

| Step | Holds / can reach (steps 1..N-1 + kit) | Proof it's doable |
|---|---|---|
| 1 Enter Mill Cellar | kit | `hunts.js` band[0] = 0 |
| 2 Set Gather: Copper Rock | kit; Mining 1 | copper_rock req 1; in Mill Cellar's node list after M-G0; no tool needed (§3) |
| 3 Fight 1, mine ~10, repeat | food 20 | FRESH forecast: 508 copper/h, 4,162 Mining XP/h, 7.2 falls/h, so C2's 3-falls end can close it within ~25 min (finding 5) |
| 4 Close tab 30 min, return | — | the away settle uses the same span; the parity test asserts equal ore, XP and kills |
| 5 Set Gather: None | — | the next break is the spawn wait only; combat share returns to the Off row |

**Blocker for the slice:** a fresh hero falls too often in Mill Cellar (finding 5). Pricing W1 for the real start kit is a prerequisite of the play gate.
