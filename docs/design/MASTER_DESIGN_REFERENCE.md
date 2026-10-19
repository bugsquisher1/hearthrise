# HEARTHRISE — MASTER DESIGN REFERENCE
**Version:** 1.1 | **Updated:** October 14, 2026 | **Status:** Rebuild reference — confirmed decisions, not blanket implementation authorization

**For Claude:** This is the product-design source of truth for planning the next rebuild phase. **Review and reconcile the current code against this reference, but do not treat this document as authorization to implement every system.** The owner authorizes each implementation phase; preserving or restoring a playable build remains the first priority. Sections tagged **CONFIRMED** are agreed design; **PROPOSED** means illustrative; **OPEN** needs a decision; **DEFERRED** means not part of the near-term release. This reference **supersedes contradictory earlier planning examples**, including fixed 5/10/20h enhancement packages and fixed rune-tier requirements for core spells.

## 1. Product direction — CONFIRMED
- Browser-first, persistent **MMORPG**; Steam later; mobile-friendly browser experience. One shared account, economy, and progression.
- Players see each other in **shared cities and guild halls**. Automated hunting happens in **private instances** by default. Cooperative party instances are a future direction, with scope/timing still open. Structured arena events are **DEFERRED**.
- No permanent vocations/classes. Equipment, trained skills, and automated configurations determine the player's role.
- Gameplay progression, resource accounting, inventory, trade, and offline hunting results must be authoritative server-side (implementation architecture to be audited, not rewritten unprompted).

## 2. Combat and progression — CONFIRMED
- **Uncapped combat skills:** Melee, Magic, Ranged, Defense, Prayer. **Only non-combat skills are capped.** There is no Health skill.
- Character levels raise base HP and mana. **Armor weight** influences percent-based health/mana specialization: heavy HP-oriented; medium balanced; light mana-oriented. Precise formulas **OPEN**.
- A single **Magic** skill covers both **Destruction** (Mage damage/AoE) and **Restoration** (healing/support). Players may train solo with a destruction weapon, then switch to a restorative weapon to heal friends using the same Magic level.
- Equipped **weapon category** determines the active ability pool. All four disciplines have **universal basic self-healing**. Restoration uniquely provides stronger self-healing, friend-targeted heals, group healing, and ally shielding. Destruction has self-heal/self-shield but **no ally healing**.
- **Magic XP** is earned from eligible *mana actually spent*. Dedicated magical abilities earn the full designated rate; melee/ranged mana-spending abilities earn a **lower ability-dependent Magic XP rate**, not equal XP/hour. Example multiplier values are **PROPOSED**, not fixed.
- Basic melee, ranged, and wand shots, from **players and monsters**, use **the same fixed interval**. There are **no attack-speed bonuses** from gear, buffs, levels, skills, or abilities. Exact interval **OPEN**. Basic attacks occur automatically between/simultaneously with configured ability use.
- No stuns, interrupts, or gameplay cast times for initial combat. Visual casting and swing animations are allowed without delaying effect resolution. Instant abilities use cooldowns; **offensive**, **healing**, and **food/drink consumable** cooldown lanes are independent. Food and drinks share the consumable lane. Exact seconds and individual ability cooldowns are **OPEN/PROPOSED**, not locked to Tibia values.
- Automation: prioritized abilities, trigger conditions, health/mana thresholds, rune affordability, and safe fallback behavior. Saved presets are **PROPOSED**.

## 3. Weapon identities and six candidate abilities each — PROPOSED ROSTER
**These are design examples, not instructions to implement 24 abilities immediately.** Identity mechanics should be available early, not gated behind late-game progress. Universal self-heal exists outside these six slots.

| Discipline | Intended identity | Six candidate weapon abilities |
|---|---|---|
| Destruction | Strongest magical AoE/single-target offense; self shielding only | Arcane Bolt; Fireball; Frost Lance; Chain Lightning; Arcane Barrier (self); Inferno |
| Restoration | Party healing, shielding, reduced-damage debuff offense, viable solo | Nature Bolt; Rejuvenation (self); Greater Mend (friend, including self); Protective Ward (friend); Nature's Wrath (lower-damage AoE with ~10% nonstacking vulnerability proposed); Circle of Renewal (party heal) |
| Melee | Frontline defense and group threat management | Power Strike; Cleave; Challenge (area threat/aggro, not stun); Iron Guard; Flame Strike; Earthshatter |
| Ranged | Priority-target precision, vulnerability exploitation | Precision Shot; Hunter's Mark; Piercing Arrow; Flame Volley; Predator's Strike; Storm Barrage |

- **PROPOSED:** Melee Challenge raises threat against surrounding mobs; ranged marks a priority target and gains targeted damage synergy. No stun or cast-time dependency.
- **OPEN:** Ability costs, cooldowns, unlocks, target selection, damage formulas, PvE aggro details, and whether every nonmagical special uses mana. Avoid class-locking any discipline.

## 4. Runes, ammunition, and supplies — CONFIRMED CORE / PROPOSED FAMILIES
- Universal elemental rune **families** can power compatible spells/abilities across any weapon discipline (e.g., a Fire Rune can support a fire attack from a bow, sword, or staff).
- **PROPOSED families:** Fire, Frost, Storm, Nature, Arcane, Life. Exact catalog and count **OPEN**.
- A core spell retains the **same identity and behavior** at all compatible rune tiers. Higher-tier runes increase **numerical strength only** (damage, healing, shield strength), **not** AoE radius, target count, duration, or debuff percentage.
- Core weapon-identity spells should unlock **early**. Later *advanced* spells may have **minimum rune-tier** requirements (**DEFERRED**). **Do not treat fixed high-tier costs from older examples as approved core spell gates.**
- Player-selected rune quality/tier; basic store runes can act as lower-power fallback. Specific tier strengths/costs **OPEN**. Ammo/runes/food/drinks are used **per applicable attack/cast/use**, not purchased as hourly-duration buffs.
- Two hunt supply sources: **Use My Supplies** (crafted or purchased stock **carried on character**, not remotely drawn from house/depot) and **Use Store Supplies** (unlimited **basic** runes, arrows, food for HP, and drinks for mana, automatically charged to the gold wallet on use while affordable).
- With personal supplies, on depletion choose **End my hunt** or **Switch to Store Supplies**. “Loaned” is **not player-facing vocabulary**; store basic supplies are not debt or credit. If gold cannot cover required store supplies, exact halt/failure policy **OPEN**.
- **Player-facing copy:** “Store Supplies: Basic supplies are always available. Pay gold automatically when they're used.” “Your Supplies: Use supplies you brought with you. When they run out, end the hunt or switch to basic Store Supplies.”

## 5. Prayer — CONFIRMED DIRECTION
- Prayer is an **uncapped combat skill**. Bury or sacrifice bones, preferably through an automatic end-of-hunt/reward-claim preference. Keep/sell bones is an alternative; bones are tradable.
- Prayer grants a **small passive HP and mana regeneration improvement**; armor weight determines resource specialization. Formula must show **diminishing returns** and not allow runaway regeneration at high levels. Example percentages from prior discussions are **not approved**.
- Prayer's mana regen may indirectly improve Magic training by enabling more eligible casts. Prayer is passive for the initial design; an active prayer spellbook is not planned now.

## 6. Gear acquisition, class, and item rules — CONFIRMED
- **No randomized stats:** identical named items always have identical base stats. **No level or skill requirements** to equip compatible gear. No durability, repair mechanic, or bind-on-equip.
- Starter items provided; a **smith NPC sells affordable low-tier equipment**. Meaningful progression equipment primarily originates from **normal/rare/extra-rare monster drops and endgame bosses**, not player-crafted swords/armor.
- Gear **Class 1** normal drop = **0** imbuement slots; **Class 2** rare = **1**; **Class 3** extra-rare = **2**; **Class 4** endgame boss = **3**. These are equipment classes, distinct from rune or imbuement power tiers.
- One-handed weapons and shields get the **same number of class-based slots**, but their imbuement **power and application cost are 50%** of full-strength counterparts. Thus a Class 4 one-hand + shield may carry **six half-power imbuements** versus three full-power on a two-handed weapon. This **flexibility is an intentional advantage**, not a bug to balance away.
- Items and cosmetics are **freely tradable**, including after equip. **Cosmetics grant no combat or progression benefits.** Active imbuements **must expire or be removed** before equipment can be traded. Removal/overwrite requires a **small gold fee** and forfeits remaining time; fee formula **OPEN**.
- **DEFERRED until at least Early Access:** Forging two copies of the **same item and tier** into a small permanent stat boost or prescribed special effect. Forging specifics not decided; do not implement now.

## 7. Imbuements and standardized hunt preparation — CONFIRMED CORE
- Imbuements are **equipment-slot restricted**; allowed effects vary by slot, and exact eligibility map remains **OPEN**. Potential eventual large library: critical chance/damage, health leech, mana leech, +Magic or other combat skills, elemental protection, physical defense, HP/mana regeneration, healing/shield effects. Exact values/tier schedules **OPEN**. No attack-speed boosts.
- **Smithing** creates metal arrowheads and tiered **Honing Stones** that temporarily increase weapon damage; **Woodcutting/Woodcrafting** provides shafts, furniture/housing improvements, and protective **Charms** (e.g., mitigation, elemental resistance, regeneration). Charm effects and slot limitations are **PROPOSED**. Smithing does not craft equipment progression items.
- **Unified preparation rule:** imbuements, honing stones, and protective charms all use a **target-duration slider, 1–50 hours in 1-hour steps**. Material/gold costs scale **linearly for hours added**, not by fixed 5/10/20h packages. If 8h remain and 20h is selected, charge **12h** to top up, not 20h to overwrite.
- Duration decreases **only during active hunting** and pauses during non-hunting activity, town time, or inactivity when no hunt is running; do not exceed **50h remaining**. Exact scope of a preparation (per gear piece, loadout, character) **OPEN**. One active charm at a time is **PROPOSED**, not confirmed.
- Consumables (runes, arrows, food, drinks) stay **per-use**, not 1–50h duration purchases.

## 8. Hunting rewards, stamina, and economy — CURRENT DESIGN
- Each ground is weighted for an **estimated gold-equivalent earning rate per hour**. Creature loot includes: common junk **auto-sold to NPC after a hunt**, gear (NPC sell or player trade), and imbuement materials. Locations contain a rare item intended to drop on average after roughly **10–20 hunting hours** and an extra-rare item after roughly **100–200 hours**. These are target averages, **not guaranteed timers**; exact rates **OPEN**.
- Track **gold generated by NPC payments** separately from **player-to-player trade volume**, which only transfers gold. Rare sale value is not identical to new currency issuance.
- Stamina cap: **8 h free, 12 h premium** (Tyler 10-17). Hunting drains 1:1; anything outside a hunt (including offline) refills 1:1; 0 ends the hunt. A refill purchase restores up to **4 h**, never above the cap, partial refills pro rata, price escalating with every purchase; gold, never Crowns (Tyler 10-18). **OPEN:** whether a per-day purchase cap remains (10-14 said 6/day).
- Gold sinks intended: basic Store Supplies, housing/workbench upgrades, imbuement application/removal, training weapons for AFK practice, bestiary upgrades, cosmetics offered for gold, and potentially additional services. Some amounts not yet specified.
- Crowns are a purchasable premium currency intended for premium membership; premium benefits and pricing **OPEN**. Crown purchases do not automatically equal game revenue when Crown balances circulate secondhand.
- **Marketplace direction:** one shared marketplace, with player-set listings of **all normally tradable items** in **either Gold or Crowns**, including equipment, runes, arrows, food/drinks, crafting and imbuement materials, and cosmetics. No official cash-out planned. Direct Crown↔gold exchange **PROPOSED/OPEN**, as are fees (3–5% previously illustrated, **not adopted**), escrow/trade limitations, and precise rules around third-party gold selling.
- **Policy direction:** user does not want to automatically punish legitimate outside gold sales; fraud, exploits, duplication and abusive multi-account behavior still require anti-abuse rules. Payment/Steam/legal implications require review before launch; no promise of permissibility is made.
- Long-term risks to analyze, **not implement now**: inflation from NPC gold sources; rare-item accumulation; pay-for-advantage with tradable Crowns; marketplace liquidity in a small population.

## 9. Housing, workstations, ownership and social access — CONFIRMED
- **Everyone starts in the same free starter cottage layout**, with baseline housing functionality. The starting cottage is not an exclusive public plot.
- Town contains **15 distinct, fixed-location residential properties**, positioned along commonly traveled routes near normal player activity. Each property has a particular layout, size, frontage, yard/courtyard possibilities, and **tiered gold purchase price**. Exact layouts and costs **OPEN**.
- All 15 property designs are **nonexclusive, instanced ownership options**: many players can permanently unlock the same property type, but each player owns their own private interior/decorations and cannot displace another player's ownership. Property unlocks are **permanent**; the owner may own several, but selects **one active property/home for showcase eligibility**. Switching, relocation fees, furniture transfer process, and property scoring tie rules **OPEN**.
- Property cost buys **visual space and presentation choice**, *not* higher damage, XP, skill training, crafting quality, regeneration, or other competitive statistical advantages. Bigger layouts must not automatically guarantee a higher showcase score.
- Homes function as **private headquarters**: storage/depot, equipment and supply preparation, crafting tables/workbenches (including advanced tables), training dummies, and expandable decorative spaces. Exact capacities and upgrades **OPEN**; do not invent passive gameplay multipliers for expensive properties.
- **Housing and furniture sources**: Woodcrafting makes ordinary furniture and housing components; NPC decoration vendors offer baseline decorations as voluntary gold sinks; monsters/bosses drop rare trophies and prestigious decorative collectibles. Decorations and cosmetics are tradeable under the normal Gold/Crown marketplace rules.
- **Equipment display**: indoor and outdoor racks, mannequins, pedestals, and trophy displays can show valuable equipped-looking gear and rare boss drops to passersby. Displayed real items remain owned, may be removed and traded; do not duplicate items or let an item be simultaneously equipped/listed and physically held in a display. A weekly visual snapshot is a separate non-tradeable representation, not another item.
- **Predefined furniture/display collections** earn housing-score bonuses when their required pieces are assembled and displayed. Example: a *Pirate Dummy* dressed with a **peg leg, eye patch, hook, and jacket**, collected through pirate content. Completed collections and rare boss/monster trophies are meaningful housing-score components. Collection contents and bonus numbers **PROPOSED/OPEN**.
- Collections may appear **inside or outside**. Housing score considers displayed decorations, rare furnishings, completed predefined collections, and monster/boss trophies; scoring formula, size normalization, anti-duplicate handling, and whether an item must be physically on display to count remain **OPEN**. Do not assume simply spamming inexpensive furniture wins.
- **Access control**: ordinary private homes are owner-permissioned; weekly featured homes are public for players to enter and inspect. Visitors have **no permission to take displayed equipment or stored items**.

## 10. City instances, weekly housing rankings and snapshots — CONFIRMED DIRECTION
- The shared city is horizontally instanced to avoid rendering huge populations at once; **about 40 simultaneous players per city instance** is the current *target*, subject to load testing. Players in the same party should be co-located where practical. All instances share the same account/economy/property leaderboards; there are not separate world economies per city instance.
- The **15 town properties are static map landmarks**, not movable showcase slots. **Each plot/property has its own live decoration-score leaderboard** among eligible owners of that property. A separate overall housing leaderboard may show wider rankings.
- Each player can **enter only one active property** in a given week's competition, even if they have permanently unlocked multiple properties. Therefore, one player cannot occupy multiple public showcase plots in the same week.
- **Friday night** is the intended weekly cutoff/reset, with exact time/time zone **OPEN**. At cutoff, select the highest-scoring eligible active home *for each property*, freeze its public visual state, and show that **snapshot for the following week** in the corresponding static town location across every city instance.
- **Live leaderboard standings** change as players decorate in the lead-up to Friday, and players can see their rank/score and distance to the next featured threshold. **Showcase buildings do not change during the week** because of live score changes.
- Snapshots should preserve **exterior and public interior presentations**, including collectible and equipment-display visuals, without granting public visitors access to inventory. Owners can continue editing their *live/private* home after Friday without changing the public frozen version. The showcase can be visited publicly throughout the week.
- Prestige recognition (owner name, score, previous wins) is directionally acceptable; **specific rewards are OPEN**. Never grant direct combat or resource-generation advantages for a housing leaderboard placement.
- **Implementation boundary:** public showcase visuals should be copied as safe immutable presentation state, not a duplicate live player house, item inventory, or active workstation simulation. Server verifies eligibility, scoring, snapshots, plot occupancy, and ownership. Decide storage/versioning with existing architecture before building.

## 11. What is specifically NOT finalized
- Damage/healing formulas, Magic-XP coefficients, cooldown seconds, universal basic attack interval, exact spells and skill unlocks.
- Precise rune families and tier bonuses; exact costs and baseline/default supply mapping.
- Armor-weight and Prayer formulas; effective Prayer progression at uncapped high levels.
- Group-hunt release scope, party size, aggro details, ranged mark AI, and target selection.
- Individual imbuement slots/effects by item slot, power tiers, costs and gold fees; charm slot count, material recipes, workbench/building details.
- Stamina purchase currency and economy tuning; Crown premium benefits, fees, direct exchange, legal/policy review.
- Forging specifications or any structured arena mechanics (**DEFERRED**).
- Housing score formula, decoration caps, collections/trophies scoring, rankings ties, cutoff time zone, pricing for 15 layouts, switching behavior, ownership storage, public visit safety, showcase snapshot format, and city-instance routing rules.

## 12. Claude rebuild and migration protocol
1. **Use this to guide the rebuild audit; it is not blanket permission to implement everything.** Preserve or restore a playable vertical slice at every approved phase. Obtain approval of any destructive removal, data migration, or irreversible change.
2. **Inventory first**: list implemented modules, persistence tables, APIs, items/skills, client screens, simulations, and legacy dependencies. Label each **KEEP / ADAPT / REPLACE / RETIRE / FUTURE** with why, dependencies, and likely player-data impact. Do not delete a module just because its current UI is legacy; sometimes its underlying concept is still confirmed here.
3. **Reconciliation report**: for each confirmed rule identify *already works*, *conflicts*, *missing*, *requires owner decision*. Separate functional gaps from cosmetic/art inconsistencies. Treat proposed spell names, percentages, rune families, housing formulas, and optional future features as **non-authorized**.
4. **Migration safety**: back up schemas and data, write reversible/idempotent migrations where practical, map legacy fields (especially Health skill, crafted equipment, old durations, currency/inventory records) to the agreed model, and establish how existing player accounts/items/progress survive. If no safe mapping exists, ask before reset/deletion.
5. **Minimum working slice**: login/character persistence → navigate town → start private hunt → simulate server-validated attacks/rewards/stamina/supply spending → stop/claim → inventory/currency persist → return to town. Smoke-test desktop and mobile layouts. Stabilize each slice before expanding systems.
6. **Economy and duplication invariants**: atomic item transfers, safe player marketplace accounting, no duplicated display items, server-authoritative loot/supplies, and correct gold issuance vs sinks. Record events/metrics where possible.
7. **No premature future construction**: housing showcase, arena, item forging, large imbuement libraries, Crown checkout, and complete 24-spell roster are design directions, not automatic requirements for the next rebuild milestone.
8. Provide a **phased, dependency-aware plan** with test/rollback criteria and explicit approval gates. No unapproved system inventions or permanent gameplay balance constants.

## 13. Supersession and change log
This master reference incorporates later economy, itemization, profession, preparation **and housing / city-showcase** decisions. **Revisions overriding prior examples:** rune tiers strengthen the *same* core spell rather than gating it; core identity spells unlock early; time-based buffs use a 1–50h top-up target rather than 5/10/20h packages; gear has no equip requirements or durability; active imbuements prevent trading until paid removal/expiry. Preserve older Combat Bible v1.4 as historical context, not as the higher-priority specification when it disagrees with this master reference.

## 14. Owner decisions requiring clarification before implementation
- Does a home count for score only when each relevant item is placed in the active house? Should duplicate display pieces score less/zero? Which ranking tie-breaker wins?
- Is one active home per **account** or per **character**, and how do simultaneous characters/guild membership relate to housing?
- Will a public visitor interact with a captured static interior, or enter a read-only version of the home scene?
- Exact storage/house upgrade mechanics, layout switching fees, and Friday snapshot time zone.
- Confirm whether the next authorized rebuild phase includes only stabilization or any specific new combat/system changes.
