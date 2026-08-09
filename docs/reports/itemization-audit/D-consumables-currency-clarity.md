# Itemization Audit — Slice D: Consumables / Buffs · Reward Currencies · The UI/Clarity Layer · Reward Surfaces

**Auditor:** Art Director + Game Designer (player-clarity lens)
**Scope:** READ-ONLY. Build b228 · `main` @ `c15914a`. No game code changed.
**Brief anchor:** Principle 9 — *"the player always knows what / where / why."*

---

## HEADLINE

The game **tells the player a great deal about what an item IS and what to DO next**, and almost **nothing about where it came from, whether it's an upgrade (on the surface most players use), what to do to upgrade it, or what a boss/dungeon will actually pay before they commit.** Source-info, upgrade-preview, and locked-item preview effectively **do not exist** — the one place a reverse "where it drops" mapping lives (the Collection Log) is monster-only and shows nothing until *after* you already own the item, which is backwards for a "collect these" loop. Separately, the reward economy carries **one true dead-end currency (the Rally Seal — earned, capped, bind-on-pickup, and spendable on nothing)**, the consumable layer's buffs are now so small (1–5%) they barely register, and one buff (`defense`) is **promised in the UI but silently discarded by the engine.**

---

## PART 1 — THE 6-QUESTION CLARITY WALKTHROUGH

The player has two item-inspection surfaces: the **hover tooltip** (`src/item-ux.js`, desktop mouse only) and the **tap/click flyout** (`openInvDetail`, `src/legacy.js:4880`, the path phones and most tap users hit). They are NOT feature-equal, which is itself a finding.

### Q1 — What is it?  ✅ (strong)
**Exists:** Both surfaces name the food *kind* (Provision / Feast / Draught) via `foodUseInfo()` (`legacy.js:4780`), not the useless bare word "FOOD" (fixed b224 — `legacy.js:4883-4887`). The flyout shows stats, tier badge, value, and a one-sentence "what it's for" note (`legacy.js:4966-4986`). Gear shows atk/str/def, weapon type, required skill/level (`legacy.js:4905-4918`). Bind-on-Pickup is flagged (`item-ux.js:164`, `legacy.js` flyout).
**Gap:** minor. The Provision/Feast split is muddier than the labels imply — see Part 3.

### Q2 — Is it better than what I have?  ⚠️ (half-built: desktop only)
**Exists:** The **hover tooltip** computes real deltas vs the equipped item in the same slot — melee/ranged/magic × STR/ACC/DEF, colour-coded, with "vs equipped: <name>" (`item-ux.js:68-100`, rendered `126-134`). This is the single best clarity affordance in the game.
**Gap (P1):** The **tap/click flyout `openInvDetail` shows only the item's own raw stats — NO comparison to equipped** (`legacy.js:4905-4918`). So the entire comparison story is invisible to touch/mobile users and anyone who taps rather than hovers. The compare logic already exists in `item-ux.js:compareToEquipped()`; it simply isn't called from the flyout. Half the audience gets "+45 attack" with no idea their current weapon gives +50.

### Q3 — Where does it come from?  ❌ (essentially absent)
**Exists:** Exactly one surface — the **Collection Log** item detail has a "Where it drops" section (`collection-log.js:169`) built by `itemSources()` (`collection-log.js:145-152`), which reverse-scans `MONSTERS[].drops`.
**Gaps (P1, the biggest clarity hole):**
- The item flyout and tooltip — the surfaces a player actually looks at while holding an item — have **zero source info.**
- `itemSources()` only covers **monster drops.** For the entire non-combat half of the game (gathered / smelted / cooked / crafted / bought / boss / dungeon / rally items) it returns the vague fallback string *"Not a monster drop — gathered, crafted, or bought."* (`collection-log.js:169`) — it never names the skill, node, recipe, boss, or shop.
- **No locked-item preview.** The Collection Log item detail is reachable ONLY for already-discovered items (`collection-log.js:141` makes the cell clickable only when `found`; `196` gates the detail on `col[detailItem]`). Undiscovered items render as "???" (`collection-log.js:143`). So you cannot ask "what is this rare thing and where do I get it?" until you already have it — the opposite of what drives a collection chase.

### Q4 — What do I need to upgrade it?  ❌ (does not exist)
**Exists:** Nothing that answers this for gear. The gear ladder is ~70 generated items across 7 material tiers (`src/data/gear-tiers.js`), but each tier is an independent item with no link to the next.
**Gaps:**
- No "next tier is X, crafted from Y at Smithing Z" preview anywhere.
- `reqSkill`/`reqLv` is *displayed* in the flyout (`legacy.js:4918`) but **not enforced** — `equipItem()` (`legacy.js:3328`) equips anything regardless of level. So the one "requirement" the UI shows is a phantom gate (confirmed in memory: "gear wield/level requirements — seam exists, never built"). This actively misleads: the text implies a wall that isn't there.
- The only real "upgrade" affordance is the tool `upgradesTo`/Apply-Kit path (`legacy.js:4951`) — narrow, tools-only.

### Q5 — What does it unlock?  ⚠️ (partial, not on the item)
**Exists:** Recipe scrolls carry `recipe`/`unlocks` and are protected from being sold as junk (`inv-context-menu.js:304`). Renown ranks list their `unlock` prose (`renown.js:52-65`, shown in the b228 explainer). Collection-log milestones (`collection-log.js:21-26`) give completion goals.
**Gap:** The item flyout never says "this scroll unlocks the Kitchen Blueprint recipe" or "this material is used to craft Emberfang." The "why you'd keep this" reasoning lives in the player's head, not on the item.

### Q6 — What do I do next?  ✅ (strong)
**Exists:** The b227 quest-nav is genuinely good. `questDestination()` (`quest-nav.js:227-247`) derives a route from a goal's own data (never hand-tagged) and `goToQuest()` (`quest-nav.js:255-265`) performs the `showTab`/`openSkillDetail` jump. Wired into Home "Next up" (`home-dashboard.js:286-298`), the Quests modal "Go" buttons (`legacy.js:13598-13612`), and bounty targets (`legacy.js:2344-2347`). Item-level deep-links also exist: raw fish → Cook, ore → Smelt, logs → Saw, seed → Farm (`item-ux.js:328-379`).
**Gap:** minor — the dashboard objectives card strips rewards (below); and there is **no reverse of quest-nav** ("this item comes from activity X, go there") — the natural place item source-info would live.

**Clarity scorecard:** Q1 ✅ · Q2 ⚠️ (desktop-only) · Q3 ❌ · Q4 ❌ · Q5 ⚠️ · Q6 ✅. The player knows *what* and *what-next*; they are blind on *where-from*, *is-it-better (on mobile)*, and *how-to-upgrade*.

---

## PART 2 — CURRENCY LEDGER

Four true wallets, one item-currency dead-end, three server-side clan meters, one derived score. (No coins/shards/dust/points/honor fields exist beyond these — confirmed by exhaustive search.)

| Currency | Field | Earned by | Spent on | Dead-end? |
|---|---|---|---|---|
| **Gold** | `G.gold` | kills (`legacy.js:2415`), vendor sells (`3437`), bounty turn-in (`2070`), quests (`13491`), daily (`2272`), chests (muster/raids), IAP (`1215`), market | room/building upgrades (`3769`,`homestead.js:184`), themes (`3833`), shop (`4230`), dungeon entry (`dungeons.js:202`), market buys (`market.js:485`) | **No** — healthy |
| **Gems** (premium) | `G.gems` | IAP (`1214`, SKUs `579-582`), Hearth-Token redeem →150 (`3965`), quests (`13492`), daily (`daily-reward.js:77`), renown (`renown.js:309`), muster (`muster.js:941`), raids (`raids.js:881`) | themes (`3829`), cosmetics (`4231`), character slots (`multi-character.js:142`) | **No, but thin** — every sink is cosmetic/convenience; no gameplay use |
| **Hearth Token** (bond) | `G.inventory.hearth_token` | **IAP only**, mint-locked by guard test (`smoke-test.js:1971`) | →gems (`3964`), dungeon entry (`dungeons.js:204`), market sale (tradable) | **No** |
| **Bounty Marks** | `G.bountyHunter.marks` | bounty turn-ins (`2070`), bonus roll (`2075`) | Auto-Eat trait 100 (`4239`), **Bounty Shop** 5 items (`BOUNTY_SHOP` `legacy.js:5537-5543`: reroll 5, +free-reroll 50, Auto-Accept 80, +10%-gold pouch 200, Hunter Cloak cosmetic 300), reroll/abandon fees (`2046`,`2039`) | **No** — well supplied. (Auto-eat is one of several sinks, correcting the brief's implicit "what else?": four shop items + fees.) |
| **Rally / Muster Seal** | `G.inventory.muster_seal` ("Rally Seal") | Muster chest claim ONLY, ≤1/UTC-day (`muster.js:945`), mint-locked (`smoke-test.js:6079`), `bop:true`, `v:0` | **NOTHING — no `removeItem`, no shop, no redemption anywhere** | **YES — the clearest dead-end in the game** |
| Clan CP | server `cp` | deposits/board/tavern (`clan-seat-ui.js:582,2842`), decays (`clan-seat.js:80`) | feeds Standing (not player-spent) | meter, not wallet |
| Standing | server `standing` | via CP events | gates castle tier thresholds (`clan-seat.js:97-101`) | rank gate, not debited |
| Labour | server work-order | skill actions, daily-capped (`clan-seat-ui.js:506-534`) | consumed into Work Order completion (`2459-2471`) | daily meter |
| Renown | `G.renownHigh` | levels/kills/streak, ratchet (`renown.js:217`) | never spent — *pays out* rank rewards (`renown.js:308`) | score/rank, not a currency |

### Dead-ends & warnings
- **Rally Seal — TRUE DEAD-END (P1).** Deliberately mint-locked and bind-on-pickup so it can't become a second gold bridge (`data/items.js:352-359`), but no sink was ever built. It also has `v:0` (can't vendor) and `bop` (can't trade), so it simply piles up in the bag as a number the player can do nothing with. The design note even says "the headline value of a world event lives here" — but there's no payoff behind that headline. This is the flagship reward of the twice-daily world event and it's inert. **Fix direction:** a Rally Seal vendor/exchange (seasonal cosmetics, a seal-gated feast/blessing item, or convert-to-gems) — the sink itself is the whole design task.
- **Gems — thin, not dead (P3).** Earned from both IAP and gameplay chests, but the only three sinks are all cosmetic/slots. Acceptable for a premium currency; flagged so the itemization rework doesn't accidentally make gems feel pointless to free players.

---

## PART 3 — CONSUMABLE / BUFF LAYER ASSESSMENT

**The split (as designed):** `foodClassOf()` (`data/items.js:512`) tags every cooked food `healing` or `buff`. `foodUseInfo()` (`legacy.js:4780`) presents that as **Provision** (heal, auto-eatable), **Feast** (buff, manual), or **Draught** (buff whose name matches elixir/potion/brew/tea — `legacy.js:4777`). Auto-eat is heal-only and only ever spends Provisions (`auto-actions.js:131,157-195`).

**Buff engine:** `applyBuff()` (`legacy.js:12266`) → `BUFFS_DEF` registry of 9 keys (gather_speed, all_xp, drop_rate, farm_yield, damage, monster_respawn, combat_xp, gold_find, damage_crit — `legacy.js:12191-12209`), aggregated into `getBonus()` (`legacy.js:12408-12417`), ticked only during an active activity (`legacy.js:12389-12405`). Clean, well-instrumented, with the b222 Tavern/Cellar duration+magnitude scaler seam (`registerBuffScaler`, `legacy.js:12241-12260`).

### Problems

1. **The Provision/Feast distinction is fuzzy — every cooked food both heals AND buffs.** Cooked Shrimp is `foodClass:'healing'` (a Provision) but *also* carries a `gather_speed` buff (`items.js:105-106`); the code note confirms "EVERY cooked food carries a buff" (`auto-actions.js:179`). The only real difference the flags encode is *may auto-eat spend it*. So the player-facing three-way label (Provision/Feast/Draught) oversells a distinction that is really binary and mostly invisible.

2. **Auto-eat silently discards the Provision's buff (P2 legibility).** `maybeAutoEat()` heals and consumes but never calls `applyBuff` (`auto-actions.js:196-210`) — deliberately heal-only. But because Provisions carry buffs, a player who relies on auto-eat *never receives the gather/xp/drop buff their food advertises*, while a player who eats the same item by hand does (`eatFood` applies it, `legacy.js:12350`). Same item, two outcomes, unexplained.

3. **DEAD BUFF: `defense` (P1 correctness + clarity).** `cooked_frostfin` / "Frostfin Supper" declares `buff:{type:'defense', magnitude:4}` (`items.js:158-159`), but **`defense` is not a key in `BUFFS_DEF`** — so `applyBuff()` rejects it at `legacy.js:12268` (`!BUFFS_DEF[buff.type]` → returns false). Yet `foodUseInfo()` still builds display text from a name fallback, so the tooltip/flyout **promise "+4% Defense for 6 min" that the engine throws away.** The item lies. Either add a `defense` buff key or repoint Frostfin to a real one.

4. **Magnitudes are now barely perceptible (P2 design, post-b228 rebase).** Buff values are 1–5% (`items.js:105-279`): Cooked Shark = +4% damage, Ember Tart = +4% combat XP, the top Void Banquet = +5% crit. On a 56-day-to-99 curve a 4% buff for 6 minutes during a mostly-idle session is a rounding error the player can't feel. The consumable layer does *feed* combat and skilling mechanically, but at these magnitudes it does not meaningfully *change decisions* — there's little reason to cook a Feast over a Provision. The rebase was correct to kill the +50% rooms, but consumables may now be under the floor of noticeability. Worth a targeted "consumables should be a real choice" pass in the itemization design (e.g. shorter, punchier buffs; or stacking around a specific activity).

5. **"Draughts / drinks" is naming only.** There is no separate drinks system — a Draught is just a buff-food whose name matches a regex (`legacy.js:4777`). The planned "drinks category" (memory: auto-eat-and-drinks-design) is not built.

**What's legible & good:** the b224 honesty pass is real — the flyout/tooltip/context-menu/qty-slider all route through `foodUseInfo()` so one food can't be described three ways (`item-ux.js:142`, `inv-context-menu.js:137`, `legacy.js:4886`); eating at full HP on a Provision is refused instead of silently wasted (`legacy.js:12335`); the Active Effects buff queue with live countdowns is clear (`legacy.js:12466+`).

---

## PART 4 — REWARD-SURFACING GAPS

Do activities tell the player what they'll get and why they'd want it?

- **Raids / The Hunt — WORST gap (P1).** The boss card (`raids.js:1124-1254`) shows portrait, weakness, HP, your predicted *share band*… but **never the chest contents.** `chestFor()` (`raids.js:361-373`) fully computes gold/gems/materials/signature drop + `sigChance`, and every signature material already has a crafting recipe (`raids.js:70-77`), yet none of it is rendered — the player learns the loot only *after* claiming (`grantReward`, `raids.js:874-899`). A player commits to a **week-long, one-strike-per-day** boss with no idea what drops or why it matters. This directly violates the brief's "boss loot is unique & exciting" and "player knows why they want it."
- **Dungeons — good preview, one hole (P2).** `renderDungeons()` (`dungeons.js:260-330`) shows description, req level, cooldown, entry cost with owned-count, and a per-drop loot row with quantity ranges and BoP tags — but **hides the drop CHANCE** though it's right there in the data (`dungeons.js:38-41`). "1× Kitchen Blueprint" reads as guaranteed when it's a 12% roll. Also, nothing tells the player **where entry keys come from** (`dungeons.js:745-754`).
- **Bounties — good, one hole (P3).** The noticeboard (`legacy.js:2122-2180`) clearly shows gold + Marks + BH-XP per notice (`2145`,`2165`) and routes to the target. But it never says **what Marks buy**, so a new hunter earns "12 Marks" with no reason to care.
- **Dashboard objectives card — strips rewards (P3).** Unlike the Quests modal and Home "Next up" (both show rewards), the dashboard objectives card renders label + progress only (`legacy.js:3152-3156`). Inconsistent.
- **Reverse mapping — missing across the board (P1, ties to Q3).** The b227 quest-nav routes *to* activities; there is **no reverse** ("this item comes from activity X"). The Collection Log's `itemSources()` is the only reverse-lookup and it's monster-only + discovered-only.
- **Drop Log — possibly orphaned (P3).** `src/features/drop-log.js` records per-monster personal kill/drop history (`recordKill` `55-72`) but its intended consumer UI ("Batch F") may never have shipped; the Collection Log built its own drop-table view from `MONSTERS[].drops` instead. Confirm whether anything surfaces `getMonsterStats()` before the rework leans on it.

**Collection Log & Chronicle as itemization leverage:** The Collection Log is the right home for the "rare means rare / collect these" loop — it already tracks discovery %, shows per-drop chance on *monster* detail (`collection-log.js:119-137`), and feeds Renown. Its two limits (monster-only sources, no locked preview) are exactly what the rework must lift to make it the discovery engine the brief wants. The Chronicle (`chronicle.js`) is an *event log* (milestones happened), not a reward surface — by design it hands itemization discovery off to the Collection Log (`chronicle.js:549-557`). Leave that boundary; invest in the Collection Log.

---

## PART 5 — WHERE THE MISSING AFFORDANCES MUST HOOK (for the implementers)

- **Item-comparison in the flyout (Q2 fix):** `openInvDetail()` at `src/legacy.js:4905-4918` — call the existing `compareToEquipped()` from `src/item-ux.js:68` (promote it to a shared `window.*` helper) and render deltas the same way the tooltip does (`item-ux.js:126-134`). This closes the mobile/tap gap with code that already exists.
- **Source-info on the item (Q3 fix):** promote `itemSources()` (`collection-log.js:145`) into a shared, **multi-source** resolver — extend it to also scan `data/recipes.js` (crafted), `data/gathering.js` (gathered), `SEED_SHOP`/`EQUIP_SHOP` (`legacy.js:523-535`), `dungeons.js` loot, and `raids.js` sig drops — then render a "Source" line in both `openInvDetail` (`legacy.js:~4966` note block) and the tooltip (`item-ux.js:renderTooltip` `~190`). This is the single highest-leverage new data structure: a reverse item→source index the whole game can read.
- **Locked-item preview (Q3/Collection fix):** `collection-log.js:141` (cell click gate) and `196` (detail gate) — allow opening a *redacted* detail for undiscovered items (name/icon hidden, but "Where it drops" and "why you'd want it" shown) to power the chase.
- **Upgrade-preview (Q4 fix):** needs a new tier-link in `src/data/gear-tiers.js` (each item knows its `nextTier` id + craft requirement), surfaced in `openInvDetail`. Also **enforce or remove** the phantom `reqLv` gate at `equipItem()` (`legacy.js:3328`) so the displayed requirement (`4918`) stops lying.
- **Boss/dungeon loot preview (Part 4 fix):** render `chestFor()` output on the raid card (`raids.js:1124-1254`) and add drop-chance to the dungeon loot row (`dungeons.js:278-287`).
- **Rally Seal sink (dead-end fix):** new vendor/exchange consuming `muster_seal` (`data/items.js:360`) — the only currency needing a sink built from scratch.

---

## PART 6 — WHAT WORKS / WHAT'S CONFUSING

**Works (keep, use as models):**
- The b224 single-source-of-truth food description (`foodUseInfo` feeding every surface).
- The hover-tooltip stat comparison (`item-ux.js:68-134`) — the best clarity affordance; just needs to reach the flyout.
- Quest-nav "Go" routing (`quest-nav.js`) and item deep-links (`item-ux.js:328-379`).
- The Renown b228 explainer — "How renown is earned" is generated from the live weight table so it can't drift (`renown.js:497-505`).
- Collection Log monster drop-table with per-drop % (`collection-log.js:119-137`).
- Vendor price now flows through one `vendorPrice()` choke-point everywhere (`legacy.js:5032`, used by tooltip/flyout/context-menu/slider) — one item, one price.

**Confusing (player can't tell what/where/why):**
- An item's origin is invisible where the player holds it; only findable in the Collection Log, monster-only, and only after you own it.
- On tap/mobile, "is this an upgrade?" is unanswerable.
- A displayed gear level requirement that isn't enforced.
- A Frostfin Supper that promises a Defense buff and delivers none.
- Rally Seals accumulating with no use.
- Committing to a week-long boss blind to its loot.

---

## TOP 5 HIGHEST-LEVERAGE CLARITY + REWARD CHANGES

1. **Build a reverse item→source index and surface "Source: X" on every item.** (Q3, the #1 clarity hole.) Extend `itemSources()` beyond monsters to recipes/gathering/shops/dungeons/raids and render it in `openInvDetail` + tooltip + locked Collection-Log entries. One data structure fixes where-from *and* the locked-item chase *and* the missing reverse-nav.
2. **Show boss/dungeon loot BEFORE the player commits.** Render `chestFor()` on the Hunt card (`raids.js:1124`) and add drop-chance to the dungeon loot row (`dungeons.js:278`). Makes the marquee combat content answer "why do I want this?" — central to the itemization brief.
3. **Give the tap/click flyout the stat comparison the hover tooltip already has.** Call `compareToEquipped()` from `openInvDetail` (`legacy.js:4905`). Closes the "is it better?" gap for mobile/touch — the platforms the north star targets — using code that already exists.
4. **Give the Rally Seal a sink (or retire it).** Build a seal exchange/vendor consuming `muster_seal`; the flagship world-event reward is currently inert. Also add the missing upgrade-preview + fix the phantom `reqLv` enforcement so gear tiers read as a ladder, not a pile of unrelated items.
5. **Make consumables a real decision and stop lying about them.** Fix the dead `defense` buff (`items.js:159` vs `BUFFS_DEF`); decide whether Provisions should surface/apply their buff under auto-eat or drop the buff from healing foods entirely (kill the fuzzy split); and re-evaluate 1–5% buff magnitudes so a Feast is worth cooking on the new pacing curve.

---

*Cross-refs: Slice A/B/C (equipment tiers, boss/dungeon ecosystems, item DB architecture) own the tier-link data model and boss loot identity that changes #1, #2, #4 depend on. Coordinate the reverse item→source index as a shared data structure — it is read by this slice's UI but authored from the item-DB architecture slice's data.*
