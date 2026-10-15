# Hearthrise: Architecture Contracts (extension seams for the MDR systems)
Systems Engineer, 2026-10-15. Design only; no code changed. Read at `origin/main` b6db45be and C2 `origin/lane/c2-hunt-sessions-edge` 67d686dd, plus `origin/design/world-shell` and `origin/lane/demo-shell` 4f9bebdf. Precedence: Tyler's dated answers (steam-launch-decisions), then MDR v1.1, then Bible v1.4. UNV = a number nobody has measured yet. Every system plugs into the ONE PLUG below. A lane that needs a second loop, a second clock or a hand-typed SQL list is out of contract.

**Path keys** (C2 branch unless marked main): C1 = `supabase/migrations/2026-10-21-hunt-sessions.sql` · ST = `…/2026-10-22-hunt-sessions-settle.sql` · CAT = `…/2026-10-22-hunt-sessions-catalogue.generated.sql` · CS = `src/core/combat-sim.js` · AR = `src/core/action-rules.js` · RS = `src/data/rule-subjects.js` · HSD = `src/data/hunt-sessions.js` · SB = `src/data/supply-basics.js` · EA = `supabase/functions/hr-accrue/accrual.js` · ACC = `src/net/accrue.js` · main: PS = `2026-08-11-player-state.sql`, AW = `2026-10-19-account-wallet.sql`.

## 0. The one plug (every system below is this shape; deviations are named)
- **P1 Data.** Rows are authored once, in frozen form, in `src/data/<system>.js`, with a `validate()` export. `tools/gen-<system>.mjs` emits `supabase/migrations/<date>-<system>-catalogue.generated.sql`. Those are server-only `hr_<system>_*` tables: RLS on, no policy, no client grant, delete+insert, a self-checked row count and a digest header (CAT:1-21, :1012-1027). The generator also emits the data-derived CHECKs (CAT:471-505 derives the bar size, target modes and pull limits from `RS`). A change supersedes the old file with a new dated file and never rewrites it (CAT:15-16). `--check` runs in CI.
- **P2 Server.** Player rows are keyed `(user_id, slot)` with an FK to `player_state` on delete cascade (C1:210). Account-scoped rows (wallet, homes) key on `user_id` (AW:222). RLS is own-read only, with no write policy (C1:215-224). Every write is a SECURITY DEFINER verb in C2's verb shape: identity → slot → idem replay → `hr_rpc_gate` → input refused, never clamped → `hr_hunt_lock` → state → write → stored result (ST:738-739). Each verb also gets a row in `hr_client_rpc_baseline` (ST:791-794).
- **P3 Engine.** Anything that happens during a hunt is a PURE `src/core` function called from the boundary loop of `simulateHuntSpan` (CS:664-805). It draws only from injected keyed seeds (CS:602-613) and writes only to `hs` and its tally (CS:623-660). In the same subtransaction, `hr_hunt_apply` re-bounds it: "Edge decides WHAT, Postgres decides WHETHER" (ST:23-52). There is no second loop and no `ctx.away` (AWAY-12).
- **P4 Ledger.** Every movement of value is one `player_ledger` row with `kind` + `intent`, plus `session_id` inside a hunt (C1:230-231). The intent is registered (§X2).
- **P5 Envelope.** Each system has one top-level key, produced by `hr_<system>_view(user, slot)` and projected by `hr_state_of`. The client has one `reconcile<System>(G,res)` that REPLACES `G._<system>`, never merges it, and keeps nothing absent when the server says null (the template is `reconcileStamina`, ACC on C2 @3651-3672). A peer's data never travels in another player's envelope (main `2026-09-13-town-presence.sql` header, decision 2).
- **P6 Client.** A screen renders only from `G._<system>` and lives in a shell **window** or a **HUD widget** row (WORLD_SHELL §2/§4). Layout and opacity are the only residue: `hud.desktop`/`hud.phone` in `RESIDUE_FIELDS` (main `src/net/client-state.js:116`).
- **P7 Test.** Six standing proofs. (1) `gen --check`. (2) A §4 SQL self-check block that executes the property. (3) TICK-1 split parity (N windows = 1 span) for anything in the engine. (4) Attended = away. (5) Every guard has a `--mutate`. (6) A retired name joins `tests/demolition-absence.mjs` NAMES (demo-shell:52-60), and the lane that revives a concept edits the guard deliberately.

## 1. Per-system contracts — (a) data · (b) server · (c) envelope · (d) client · (e) test
**1. Abilities + cooldown lanes**
- (a) `src/data/abilities.js` uses combat-review §4.1's row shape: `{id, n, discipline, skill, lane, cdMs, manaPct, magicXpMult, rune:{family,qty}|null, target, effect, unlock}`. Weapons gain `discipline`. `src/data/lanes.js` = `{consumable, heal_spell, offense}`, which replaces `COOLDOWN_GROUPS` heal/mana/buff (RS:68-72). Generated: `hr_abilities`, `hr_hunt_lanes(lane, cd_ms)`.
- (b) No new table. A bar slot `{kind:'spell', ability}` rides in `player_action_sets.slots`; `spell` is reserved inactive in RS:38-41 and CAT:294-297, and flipping `active` is the switch. `hunt_sessions.cooldowns` keys ⊆ `hr_hunt_lanes`. **Today SQL hard-codes `heal`/`buff` (C1:1210-1216) while JS has `mana`.** Engine: a cast step per lane inside the boundary loop, in the order consumable → heal_spell → offense → basic → monster. Its fuse: casts per lane ≤ ⌈window/lane_ms⌉ from the stored next-ready. Tally: `casts{}`, `mana_spent`. XP rides the existing accrue row (kind `hunt`).
- (c) The session view adds `mana`/`max_mana` beside HP. Ability rows are client data.
- (d) `actionbar` widget spell cells; the Skills window shows unlocks.
- (e) TICK-LANES (no lane fires twice inside its ms; the swing count is exact), MAGIC-XP-0 (overheal, no rune, lane busy), cast parity attended = away. Mutant: a second cast inside a lane must turn it red.

**2. Supplies: Use My / Use Store + on-empty**
- (a) Action-set options `supply_mode: mine|store` and `on_dry: end|store` (combat-review Q-b; default mine + end). A bar slot names a LINE (`heal`, `mana`, `arrow`, `rune:<family>`). The store lines stay as SB rows. Delete the six `plain_*_rune` rows (SB:63-68).
- (b) Columns on `player_action_sets` with generated CHECKs (the pattern at CAT:484-505). ONE resolver, `resolveLine(hs, line)`, in AR, called by the bar AND the quiver. **Today the quiver auto-buys whatever the mode** (`spendFromQuiver` CS:414-436). The end reasons `heals_out`/`ammo_out`/`gold_out` exist (HSD:96). Gold: `supply_buy` and `vendor_cover` rows, kind `hunt`, priced server-side in (5b) (ST:81-102).
- (c) `tally.supply_gold` (Store gold) vs `tally.supplies` (My units) (ST:259-263; C1:183).
- (d) The supply choice on the hunt-ground card, with copy verbatim from MDR §4; two analyzer lines; the end card.
- (e) `on_dry=end` buys 0 shop shots (mutant: remove the gate → red); `gold_out` is tested both ways, attended and away.

**3. Stamina**
- (a) `STAMINA_MAX_MS` and `STAMINA_LOW_MIN` (HSD:30,88). Refill row: `{addMs, perDay, priceBase, priceLv, stepPct}`, with the constants rescaled from Huntera's (UNV). Generated into `hr_hunt_limits` (CAT:421-444).
- (b) `player_state.stamina_ms/at` (ST:238-247) and `hr_stamina_of/view` (ST:298-336). `staminaStep` runs per swing (AR:421-427, CS:713/716). Refill verb `hr_stamina_refill(slot, idem)` (lane C, gold, never Crowns) uses the hook at ST:73-77: add at `coalesce(settled_to, now())` under `hr_hunt_lock`; refuse `stamina_ahead`. The per-day count comes from ledger intent `stamina_refill`.
- (c) Envelope key `stamina` (ST:698-706) → `G._stamina`. (d) The `vitals` widget, with a refill button.
- (e) A replayed refill grants once. A refill never moves `stamina_at` past `settled_to`. The drain passes TICK-1.

**4. Gathering inside hunts** (gather-review §6-7 and Security items 1-13 are the spec; this is where it plugs in)
- (a) `hunts.js` gains `pull_size`, `break_actions`, `respawn_ms` and `nodes[]`. Nodes gain `standalone`. Generated: `hr_hunts` columns and `hr_hunt_nodes(hunt_id, node_id)`.
- (b) Gather state (`gather_node`, `gather_carry_ms`, `gather_tool_carry`, `gather_index`, `gather_change_at/to`) goes on the session. **The cycle state `pull_left`/`respawn_at` goes on the INSTANCE (§1.10), not on `hunt_sessions`.** The break phase calls `resolveGatherTick` only, with seed domain `g`. The verb `hr_hunt_set_gather` is deferred-apply. The ledger unique index is `(session_id, gather_index_from)`, partial. The caps are stateful (Security 1-4).
- (c) The session view carries the node and the break state; `tally.gather`. (d) A Gather toggle on the hunt-ground card; `log` lines.
- (e) TICK-1 including gather (mutant: carry not persisted → red); the time-budget identity; attended = away.

**5. Runes + elemental weakness**
- (a) ONE `src/data/elements.js` (families fire/frost/storm/nature/arcane/life, PROPOSED) replaces both copies (main `src/core/elements.js:45`, `src/data/monster-classes.js:38`). Monster rows get `resist:{family: mult}` (weak > 1, resist < 1, immune 0), replacing `elementWeak`/`elementImmune` (main `monsters.js:26`). Runes are items `{tag:'rune', family, tier, strength}`; tier scales the number only (MDR §4). Generated: `hr_elements`, `hr_monster_resist`.
- (b) No player table. The multiplier is applied in the cast event only and clamped by one total ceiling (pattern: `MAX_TOTAL_DAMAGE_MULT`, main `elements.js:57`). The default rotation auto-picks a carried matching rune (a pure function in AR). Consumption goes through `resolveLine` (§1.2).
- (c) Nothing new. (d) The `target` widget shows the weakness; the Bestiary window shows resists.
- (e) RUNE-NO-DOWNGRADE. Catalogue check: every resist key ∈ families. Clamp guard with `--mutate`.

**6. Armour weight**
- (a) Armour rows get `weight: heavy|medium|light`, replacing the `armourClass` accuracy/damage triangle (main `gear-tiers.js:173-182`). `src/data/armour-weight.js` = `{hpPct, manaPct, hpRegenPct, manaRegenPct}` (UNV). Generated as the `hr_items.weight` column.
- (b) `armourMods(equipment, items)` in `src/core` is the ONLY reader of `weight` (combat-review §4.4). Max HP and max mana are DERIVED server-side from Level + mods, which replaces the raise-only `max_hp` column (projected in AW `hr_state_of`, AW:1891ff `'max_hp'`). Gear is locked while a hunt is open.
- (c) `state.max_hp`/`max_mana`, derived on every envelope. (d) The Gear window's HP%/mana% line; `vitals`.
- (e) A grep guard: `weight` is read only in `armourMods`. Heavy and light parity sims.

**7. Prayer + bones**
- (a) `skills.js` Prayer becomes `cat:'combat'` and uncapped. `src/data/prayer.js` = `{regenMax, k}` with `bonus = MAX·P/(P+k)` (Tyler 10-14; UNV). Bones carry `buryXp`.
- (b) The action-set option `bones: keep|offer_all`. `hr_offer_bones` runs INSIDE the close transaction (`hr_hunt_close` C1:541) under key `offer:<session>`; the town press uses key `offer:<user>:<seq>`. Ledger: intent `offer_bones` (item sink + XP). Regen reads Prayer at window start, so nothing loops within a hunt.
- (c) Skills; the end card shows the offer line. (d) The Skills window; the end card.
- (e) A retried offer grants once. A regen-rate ceiling guard (P-max keeps supplies necessary). Attended = away.

**8. Imbuements, honing stones, charms: 1–50 h HUNTING-time clocks**
- (a) `src/data/preparations.js` = `{id, kind:'imbue'|'hone'|'charm', slots[], effect, matPerHour, goldPerHour, maxH:50}`, where a one-hand weapon or shield pays half power and half cost (MDR §6). Generated: `hr_preparations`.
- (b) **The item-identity seam.** `player_inventory` is a fungible stack (PS:247-254), but an imbued piece needs identity (it is trade-locked and carries its own clock). Add `player_gear_pieces(piece_id, user_id, slot, item_id, location bag|equipped|bank|display)`. A row is minted only when a unit gains state, and merged back into the stack when its last prep expires or is removed, so plain items stay stacks. Add `player_preparations(user_id, slot, target piece_id|'char', prep_id, remaining_ms ≤ 180000000)`. Clocks drain ONLY inside `hr_hunt_apply` by the window's exact hunting ms (§X1). Verbs: `hr_prepare(slot, target, prep, target_h, idem)` charges `(target − remaining)` linearly, and `hr_prep_remove` charges a gold fee. A kind stacks at most once per character (decision 3). Ledger: `prepare` and `prep_remove`, both gold sinks.
- (c) `preparations[]` plus the `pieces[]` of the character. (d) The Gear window's imbuement panel; a lock badge in the Bag.
- (e) An hour in town drains 0. TICK-1 split. Top-up 8 h → 20 h charges 12 h. Mutant: list an imbued piece on the market → it must be refused.

**9. Gear classes, drops, trade lock**
- (a) Items get `class:1..4` and `hands:1|2|shield`, and their slot count is derived (MDR §6). Strip `reqLv`/`reqSkill` (main `gear-tiers.js:178-179`) and remove the generator's equip-requirement fact (main `tools/gen-catalogues.mjs` header). Monsters get `drops:{gold, junk, imbueMat, equip}`; hunts get `rareCarrier` and `rare[]/relic[]` with target hours. Generated: `hr_drop_tables`, plus class and hands on `hr_items`.
- (b) Drops already flow through `tallyFx.addItem` (CS:623-660) and the `rare_drop` event. Loot rules come later as `player_loot_rules(user, slot, key, rule keep|depot|sell|supply)`, applied in the close transaction, with Sell opt-in. The trade lock is a piece with an active prep (§1.8). Delete `bop`.
- (c) Loot in the tally. (d) The end card's loot list; Bag.
- (e) A rare and relic rate sim inside the 10–20 h / 100–150 h band. Absence guard: `reqLv`.

**10. Party instances**
- (a) `src/data/party.js` = `{maxSize, densities: low/med/high, lootDefault:'even_gold'}`.
- (b) **The instance seam.** Add `hunt_instances(id, hunt_id, kind solo|party, density, pull_left, respawn_at, roll_state, version)`, with `hunt_sessions.instance_id` (solo = 1 member). A settle is per INSTANCE: member sessions lock in a deterministic order, and seeds are labelled `hunt:<instance>:…`. The rare roll is server-seeded with rotation on the instance, under intent `party_roll`. The m8 tables (main `2026-09-23-m8-parties-s1-1-tables.sql:127,163`) are retired, not reused.
- (c) An own `party` block. Peers' HP comes from the instance-scoped hunt view, never from another envelope. (d) A `party` widget; the density picker on the hunt-ground card.
- (e) One pull state per instance (Security 13); roll replay = the same winner; split parity.

**11. Housing, properties, displays**
- (a) `src/data/properties.js` (15 rows: map id, price, frontage), `furniture.js` (footprint, score, collection) and `collections.js`. Generated: `hr_properties`, `hr_furniture`.
- (b) ACCOUNT scope (one home per account, decision 2): `account_properties(user_id, property_id)` and `account_active_home(user_id, property_id)`. `home_placements(user_id, property_id, placement_id, item_id|piece_id, x, y, rot)`: placing debits the bag, as equip does (PS:257-268 conservation). A displayed piece's `location='display'`, so it cannot also be equipped or listed. Verbs `hr_property_buy` (gold) and `hr_home_place/remove`. The score is a server view. Post-EA: an immutable `home_showcase_snapshots(week, property_id, user_id, presentation jsonb)`.
- (c) An own `home` block. Visitors read through a rate-gated `hr_home_of(user)`, following the town-presence pattern.
- (d) The Homestead window and `src/world/home-scene.js`.
- (e) Conservation: bag + equipped + placed + listed is constant. A `no-property-advantage` guard, which retires the `allXP` rungs (main `src/data/perks.js:69-72`).

**12. Bestiary stages**
- (a) `TROPHY_STAGES` (main `bestiary.js:83-88`) becomes `{at, relicBoost, fee}` with per-creature overrides. Generated: `hr_bestiary_stages`.
- (b) Kills stay in `player_progress` `stat ev:kill_monster:*` (main `2026-08-20-bestiary.sql:63-80`). Add `player_bestiary_active(user, slot, monster_id, stage)`, written by `hr_bestiary_activate` (gold fee, intent `bestiary_fee`; the fee never skips kills). The engine reads the active stage as a clamped relic multiplier (the `MAX_*` pattern, main `bestiary.js:91-105`).
- (c) `bestiary[]` with `{monster, kills, stage, active}`. (d) The Bestiary window and the pinned tracker widget.
- (e) Boost clamp `--mutate`; the relic rate under full boost stays inside the hunt-balance band.

**13. Market Gold/Crowns**
- (a) `src/data/market.js` = `{currencies:['gold','crowns'], feePct, weeklyCrownCap}` (UNV).
- (b) `market_listings` gains `currency` CHECK (main `2026-08-17-market-v2.sql:391`). Crowns are `account_wallet` (AW:222-228; gems → crowns in the conversion lane). `market_sales` keeps `gross = net + tax` (market-v2:413-430) and adds `currency`. The ledger kind is `trade` for gold and `wallet` for crowns (AW:255-270). An imbued piece is refused. Price history reads `market_sales` only.
- (c) The wallet balance and own listings. (d) The Market window.
- (e) The conservation constraint; the weekly Crown cap; a replayed buy pays once.

**14. Town presence + chat**
- (a) `src/data/channels.js` = `{id, scope global|trade|guild|party|whisper, max 240, perMin}`; a city instance cap of 40 (MDR §10) as a limit row.
- (b) Presence stays server-stamped through `hr_heartbeat` → one `town_snapshot` row per zone from cron (main `2026-09-13-town-presence.sql:17-45`). Sharding adds `instance_no`, but a single instance runs until load says otherwise. Chat moves from a client INSERT under RLS (main `schema.sql:134-147`) to `hr_chat_post(channel, body)`, which checks the channel catalogue, membership from server tables and closed-mode admission.
- (c) `place` only (AW `hr_state_of` `'place'`). (d) The `chat` widget; world peers.
- (e) Per-channel RLS read; rate gate; name authority; mutant: post to a guild channel you are not in → refused.

## X. Cross-cutting
- **X1 Clocks: exactly two.** (1) **Hunting time** is the Σ of standing swing intervals inside an open session. It drives the stamina drain and every preparation clock, and it is debited only inside `hr_hunt_apply`, never by cron. **It must become exact.** `paid_ms` is a "display figure" bounded only by ≤ window (C1:22, :1248-1249). Contract: `paid_ms + down_ms = (swing_to − swing_from) × swing_interval_ms`, asserted in SQL from a catalogue interval. (2) **Server wall clock** (`now()`) drives stamina rest, farm growth, listing expiry and the Friday cut. The client clock is never authority. A new timer declares `clock:'hunt'|'wall'` in its data row.
- **X2 Ledger registry.** `kind` is a CHECK widened by text-anchor patches (C1:233-246, AW:255-270), and `intent` is free text (PS:375-381). Contract: `src/data/ledger.js` maps `intent → {kind, flow: npc_mint|npc_sink|p2p|xp|item_mint|item_sink}` and generates `hr_ledger_intents`. A BEFORE INSERT check refuses an unregistered intent. Vitals then split NPC issuance from P2P volume (MDR §8, master-review §6).
- **X3 Catalogue generators.** About 19 `tools/gen-*.mjs` on main each re-implement the frame (digest, delete+insert, counts, revokes). The shared derivation precedent is `tools/catalogue-rows.mjs`. Contract: one `tools/gen-lib.mjs` frame; each system supplies only `rows()` and `ddl()`.
- **X4 Versioning / CAS / idempotency.** `player_state.version` gates envelopes. A session settles under `hr_hunt_lock`, the swing CAS and the version CAS. A loser re-reads (ST:134-147). Player verbs use the intent key plus `settle_first` when the gap is over 20 s, never a version CAS that could starve the tick (Security gather 8). Every new verb that reads hunt state follows the same rule.
- **X5 Rate gates.** `hr_rpc_gate` hard-codes its buckets in a CASE body (main `2026-09-13-world-finds-projection.sql:330-375`), so every system edits that body. Contract: generate `hr_rpc_buckets(bucket, per_min)` from `src/data/rate-buckets.js`.
- **X6 Closed mode.** `hr_admitted` plus a restrictive policy over a hand-listed array of client-writable tables (main `2026-10-21-closed-mode.sql:331-332`). Contract: **no new client-writable table, ever.** Every write is an RPC behind `hr_rpc_gate`, which already refuses `hr_closed`. Chat leaves the list (§1.14).
- **X7 Envelope composition.** `hr_state_of` is one `jsonb_build_object` (AW:1891ff) patched by text anchors. C2 anchors stamina on `'dungeon_cooldowns'` (ST:698-711), a key the demolition retires, so the next anchor breaks. Contract: a generated `hr_state_sections(key, fn)` that `hr_state_of` loops over. On the client, one `ENVELOPE_SECTIONS` map drives `applyEnvelopeState` (main ACC:4169) AND record.js hydration. Today each key is three hand edits (C2 diff: ACC @4511, `record.js` @1961, the export list).

## S. Seams C2 must leave NOW (cheap now, expensive later). Top 3 first
1. **Pull/cycle state lives on an instance row.** Create `hunt_instances` 1:1 with each session now, plus `hunt_sessions.instance_id`. Never add `pull_left`/`respawn_at`/the roll state to `hunt_sessions`: its one-open-per-character index (C1:158) cannot hold a party's shared pull (Security gather 13).
2. **Seeds take a domain.** `swingSeedLabel(session, i)` (AR:30-32) and `ctx.swingSeed(i)` (CS:602-613) become `seed(domain, i)`, labelled `hunt:<instance>:<domain>:<i>` (s swing, g gather, c:<lane> cast, r roll). Changing the label after C2 re-keys every replay fixture and dispute.
3. **Lanes and the interval are generated rows, not literals.** Rename `COOLDOWN_GROUPS` to `consumable`/`heal_spell`/`offense` (RS:68-72). Validate cooldown keys against `hr_hunt_lanes`, not `('heal','buff')` (C1:1213). Add `swing_interval_ms` to `hr_hunt_limits`, read by the engine in place of `deriveTickMs` (EA:787). SQL then asserts the exact swing count, replacing the 500 ms fuse (C1:1129, :1185), and X1's hunting-ms identity.
4. `hr_action_set_options(p_target, p_pull, p_floor)` is positional (ST:740-741). Make it `p_options jsonb`, validated against a generated `hr_hunt_set_options(key, domain)`, so `supply_mode`, `on_dry`, `bones` and `gather` never change the signature or the RPC baseline again.
5. Supplies: one `resolveLine` under `supply_mode`/`on_dry`, gating the quiver auto-buy (CS:414-436); delete `plain_*_rune` (SB:63-68); `coverSellable` sells junk only (HSD:57-63).
6. Reserve step **(5c) hunting clocks** in `hr_hunt_apply` between (5a) stamina and (5b) the shop (ST:29-37) as the one place a hunting-time debit runs. It is empty until preparations ship.
7. Re-anchor the `stamina` splice off `dungeon_cooldowns` (ST:698), or land X7 first.

## B. Build plan (dependency order; ✱ = lane C, Security GO before apply)
| # | Lane | Needs | Unblocks |
|---|---|---|---|
| 0 | Demolition M1/M2 + absence guard (in flight) | — | a clean slate for every later lane |
| 1 | ✱ C2 + seams S1-S7 | 0 | everything in a hunt |
| 2 | ✱ Infra: X2 ledger registry, X3 gen-lib, X5 buckets, X7 state sections (server + client) | 1 | every new system plugs in without body patches |
| 3 | Shell cutover (window/widget registry from data) → B1 hunt screen inside it | 1 (parallel with 2) | first playable; Tyler plays |
| 4 | ✱ Combat U2: lanes quantum, abilities, mana, armour weight, Prayer regen, 2.0 s, runes + resist | 1, 2 | §1.1, 1.5, 1.6, 1.7 |
| 5 | ✱ Gathering in hunts | 1 (instance seam) | the hunt identity triangle |
| 6 | ✱ Gear classes + drop tables + loot rules (roster data) | 4 | 7, 8 |
| 7 | ✱ Item pieces → honing stones first, then imbuements, then charms (post-EA) | 2, 6, S6 | the trade lock and displays |
| 8 | ✱ Stamina refill · bestiary fee (small, independent) | 2 | gold sinks |
| 9 | ✱ Crowns conversion → market currency (needs a Steam/legal review) | 2, 7 | monetization |
| 10 | ✱ Party instances (multi-foe engine) | 1, 4 | the EA party pillar |
| 11 | ✱ Housing EA cut: cottage, benches, depot, trophy shelf, 3 properties | 7 | displays and showcase post-EA |
| 12 | ✱ Chat RPC + guild channel; city instance routing only when load demands it | 2 | social |

## D. Debt to pay before scaling (measured on origin/main)
- `src/legacy.js` is 16,396 lines with 185 `window.X =` assignments; 1,892 such assignments across `src/**`; 73 `showTab` mentions. `tests/monolith-ratchet.mjs` holds it shrink-only. The shell cutover deletes the panel controllers (WORLD_SHELL §6.2), and kept systems move to `src/<system>/` modules behind P5/P6.
- Three fighting stylesheets: `legacy.css` 3,917, `audit-overrides.css` 2,865 and `theme-cozy.css` 3,097 lines, among 23 files in `src/styles`. The cutover deletes the panel CSS; tokens stay single-source (`token-single-source`).
- `src/net/accrue.js` is 7,172 lines on main and 7,199 on C2, and every envelope key is hand-wired (X7). `hr_state_of` is anchor-patched (X7). `hr_rpc_gate` is a CASE body (X5). The ledger CHECK is anchor-widened (X2). About 19 generator frames (X3). There are two `ELEMENTS` lists (§1.5).
- The engine still carries demolished-world hooks: `botdFor` (CS:687, :1001), the client wrapper comment for `fx.killMonster` (CS:497-501), and the old `simulateSpan` (CS:809ff), which C2 is to delete with away. Death XP is keyed to `style.xp` (AR:447-451) and is rewritten by the 4-skill U lane.
- 39 `src` files touch `localStorage` directly; the HUD layout must go through the storage seam, not a 40th.
