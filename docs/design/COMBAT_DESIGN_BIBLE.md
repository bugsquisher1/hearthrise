# HEARTHRISE — COMBAT DESIGN BIBLE
**Version:** 1.4 — Combat identity, universal healing, and scalable elemental runes / pre-implementation  
**Date:** October 14, 2026 (combat design update)  
**Status:** Working specification; not authorization to implement  
**Audience:** Game director, Claude development agents, art director, gameplay/balance, QA

> **Design intent:** A classless, persistent idle MMORPG where a character's trained skills, weapon, equipment weight, and automated ability configuration define their combat role. Players can solo as offensive spellcasters and switch to healers when their group comes online, without creating an alternate character or leveling a separate restorative skill.

## 1. Decision labels and change control

- **CONFIRMED:** Explicitly selected direction. Preserve unless the game director revises it.
- **PROPOSED:** Recommended working rule or sample mechanic; requires approval and testing.
- **OPEN:** Unresolved design decision. Do not silently treat an example as a final rule.
- **DEFERRED:** Future possibility; do not implement in the current phase.

The values, ability names, unlock levels, multipliers, and formulas in this document are **illustrative unless marked CONFIRMED**. Claude must compare this document with the live game before coding, flag conflicts, and propose discrete implementation stages.

## 2. Product and combat context

**CONFIRMED** — Hearthrise is a browser-first persistent MMORPG, with Steam planned later and mobile-compatible browser play. Players see each other in cities and guild halls. Hunting is private/instanced by default, while characters participate in a shared economy and community. Structured arenas are long-term **DEFERRED**. Future cooperative hunting is desirable, but its launch timing and party rules are **OPEN**.

**CONFIRMED** — There are **no permanent vocations/classes**. Any character may train **Melee, Magic, Ranged, Defense, and Prayer**. Combat skills are **uncapped**; non-combat skills have caps (their cap values are outside this specification). Character roles are loadout-driven rather than character-creation choices.

**CONFIRMED** — The game no longer has a Health skill. Maximum health and mana increase as the character gains character levels. Equipment weight influences percentage modifiers to HP and mana. Exact base growth and item-set calculations remain **OPEN**.

### Design pillars

1. **One character, multiple roles.** Reward long-term investment without imposing permanent class restrictions.
2. **Automation with meaningful decisions.** Players configure weapons, abilities, resource thresholds, and priorities; the simulation executes reliably.
3. **Clear economic tradeoffs.** Runes, bones, food, drinks, and gear create choices in efficiency and cost, not unavoidable punishment.
4. **Long-term progression without runaway power.** Combat skills are uncapped; benefits and XP curves must remain sustainable.
5. **Server authority.** Shared-economy gains, XP, consumable use, inventory, and offline progression must not be trusted to the browser.

## 3. Combat skill taxonomy

| Combat skill | Identity | Progression rule | Cap |
|---|---|---|---|
| Melee | Physical close-range offense and melee weapon proficiency | **OPEN:** exact training event/formula | None (CONFIRMED) |
| Magic | Shared offensive and restorative spell proficiency | **CONFIRMED:** based on eligible mana spent, with ability-dependent Magic XP weighting | None |
| Ranged | Bow/crossbow and other ranged offense | **OPEN:** exact training event/formula | None |
| Defense | Defensive effectiveness for any build | **OPEN:** exact training event/formula and effects | None |
| Prayer | Passive HP/mana regeneration support | **CONFIRMED:** burying or sacrificing bones | None |

**Important:** The skill being trained and the resource consumed are separate data concepts. Mana cost does not imply full-rate Magic XP.

## 4. Weapon-defined ability system

**CONFIRMED** — Equipped **weapon type/category** determines which active combat abilities or spells a character can use. Any player can change roles by changing weapon and build; there are no vocation restrictions. Exact rules for in-hunt weapon swapping are **OPEN**.

**PROPOSED** — Define ability families, rather than unique ability lists for every individual weapon item:

| Family | Example weapons | Intended identity |
|---|---|---|
| Melee | Swords, axes, maces | Strikes, cleaves, heavy blows, counters |
| Ranged | Bows, crossbows | Precision, piercing, volleys, sustained damage |
| Destruction Magic | Offensive staffs, wands, focuses | Elemental/arcane single-target and area damage |
| Restoration Magic | Healing rods, nature/sacred focuses | Healing, regeneration, protection, plus viable solo offense |

### 4.1 One Magic skill, two disciplines — CONFIRMED

- Destruction and Restoration both use and advance the **same Magic skill**.
- The *equipped magical weapon* determines whether the active spell set emphasizes damage or healing.
- A solo Destruction user can equip Restoration equipment when their group logs in and function as a healer using their existing Magic level.
- No independent Destruction Magic or Restoration Magic leveling track.
- **PROPOSED:** Restoration weapons must have sufficient damage spells to solo hunt, but typically sacrifice raw DPS for sustain/team utility.
- **CONFIRMED:** All weapon disciplines can use a universal basic self-heal; Restoration has stronger self-healing and exclusive friend/party healing and ally shields. Details of scaling and Magic XP weighting are OPEN.

### 4.2 Unlocks — PROPOSED

Weapon family determines availability; Magic/Melee/Ranged skill thresholds unlock or improve abilities, while character level and item requirements may provide secondary gates. Specific unlock tables are **OPEN**. Avoid binding foundational abilities to specific individual item IDs.

### 4.3 Example abilities — EXAMPLES ONLY

| Family | Early | Intermediate | Advanced / specialized |
|---|---|---|---|
| Melee | Heavy Strike | Cleave | Whirlwind / Flame Strike |
| Ranged | Precise Shot | Piercing Shot | Arrow Rain / Arcane Arrow |
| Destruction | Arcane Bolt | Fireball / Frost Lance | Chain Lightning / Meteor |
| Restoration | Nature Bolt | Regeneration / Minor Heal | Greater Heal / Sanctuary |

These are naming/role illustrations, **not** an approved spell roster or mana-cost schedule.

## 5. Magic XP from mana expenditure

**CONFIRMED** — Magic advances through **mana spent by eligible casts**. Both magical disciplines use the same Magic skill. Melee and Ranged mana-using abilities should **not** grant Magic XP at the same effective rate as dedicated magical builds.

**PROPOSED initial formula:**

`MagicXP_cast = eligibleManaActuallySpent × baseMagicXPPerMana × ability.magicXpMultiplier`

Compute experience from **server-validated successful casts** and net mana actually consumed. Restoring mana gives no Magic XP. The multiplier is metadata on the ability, not a blanket weapon multiplier.

### 5.1 Suggested starting coefficients — PROPOSED / NOT FINAL

| Ability class | Candidate Magic XP multiplier | Illustrative example |
|---|---:|---|
| Destruction magical spell | 1.00 | Fireball |
| Restoration magical spell | 1.00 | Greater Heal |
| Magically empowered melee | 0.25 | Flame Strike |
| Magically empowered ranged | 0.25 | Arcane Arrow |
| Ordinary mana-powered melee/ranged | 0.10 | Whirlwind / Rapid Fire |
| Non-mana physical attack | 0.00 | Basic swing |

These factors require empirical XP/hour testing; they are **not approved balance parameters**. In particular, ordinary physical abilities might ultimately provide **zero** Magic XP. The game's stated goal is slower incidental Magic training on melee/ranged builds, not a mandatory percentage from every action.

### 5.2 Balance targets — PROPOSED

Start by evaluating whether typical melee/ranged hunting earns roughly **10–25%** of a comparably progressed dedicated caster's Magic XP/hour, with clear exceptions for deliberately magical hybrid builds. Compare observed casts, mana use, uptime, and food/drink costs—not just the per-cast multiplier. This is a **candidate range**, not a guarantee or confirmed target.

### 5.3 Anti-abuse and fairness

- Cast validation and XP occur on the authoritative simulation, including offline processing.
- Mana must actually be deducted. No XP from attempted, invalid, duplicated, or free casts.
- Healing and buffs must satisfy meaningful eligibility rules (e.g., avoid endlessly healing full-HP targets solely for XP).
- Avoid allowing expensive-cast spam to bypass mana/cooldown constraints.
- Rune-consuming abilities still receive mana-based Magic XP only for qualifying mana spent; rune cost by itself does not train Magic.
- Mana regeneration, potions, and Prayer can indirectly increase casting uptime; model their economic and balance effects.
- Define a deterministic rounding/accumulation rule for fractional XP to prevent losses or rounding exploits (**OPEN**).

## 6. Health, mana, and armor weight

**CONFIRMED** — Character level grants base health and mana. Armor weight shifts their percentage bonuses: **heavy favors health, light favors mana, medium balances them**. All players may use any armor weight unless separate requirements are approved.

**PROPOSED:** Keep maximum-resource multipliers and regeneration multipliers **separate**. Heavy gear need not provide the same HP-max percentage as HP-regeneration percentage.

`MaxHP = BaseHP(characterLevel) × ArmorHPModifier(loadout) × OtherApprovedModifiers`

`MaxMana = BaseMana(characterLevel) × ArmorManaModifier(loadout) × OtherApprovedModifiers`

**OPEN:** Exact level growth, which slots count toward weight, mixed-weight resolution (dominant weight, weighted average, or per-slot contributions), armor eligibility, defensive stats, mana regeneration baseline, interaction with active buffs, and rounding. **Do not assume** any previous example percentages are final.

### Build tradeoffs

- Heavy: higher health headroom; likely favors physical sustain.
- Medium: balanced resource profile; plausible hybrid or healing configuration.
- Light: higher mana headroom; greater flexibility for sustained spell rotations.

A bigger mana pool does not automatically mean faster Magic training: rates also depend on mana recovery, cooldowns, and ability usage.

## 7. Prayer: uncapped combat support skill

**CONFIRMED** — Prayer is a **combat skill**, is **uncapped**, and gains XP by **burying or sacrificing bones**, envisioned as an end-of-hunt workflow. Prayer gives a **small passive improvement to natural HP and mana regeneration**, interacting with armor-weight specialization. No active prayer ability system is required at this stage.

### 7.1 Bone processing loop

1. Enemies drop bones into the normal loot pipeline.
2. Player chooses to keep/trade bones or consume them for Prayer XP.
3. **PROPOSED:** Allow per-hunt automation: Keep All, Offer All, or Offer Selected Types.
4. Server commits bone removal and XP award atomically; retries must not duplicate either side.
5. Hunt completion or reward claim may trigger batch processing; the exact trigger/timing is **OPEN**.

**PROPOSED:** Different bone types give different Prayer XP, and bones can be tradable to support the shared economy. Bone-tier list and XP values remain **OPEN**.

### 7.2 Regeneration model

**PROPOSED:** Prayer applies the **same multiplicative percentage improvement to each resource's baseline natural regeneration**, while armor-weight modifiers independently favor HP or mana. This maintains a consistent Prayer identity across builds:

`HPRegen = BaseHPRegen × ArmorHPRegenModifier × (1 + PrayerBonus(prayerLevel))`

`ManaRegen = BaseManaRegen × ArmorManaRegenModifier × (1 + PrayerBonus(prayerLevel))`

**PROPOSED:** Use diminishing returns and a sustainable bounded-or-slow-growing power curve despite infinite Prayer levels. Illustrative prior suggestions of 10–15% at level 100, or any particular curve, are **not approved**. A hard soft-cap versus asymptotic function remains **OPEN**.

**Critical balance interaction:** Prayer -> mana regeneration -> eligible mana spent -> Magic XP/hour. Test this coupled system, including rune/food/drink economics and high-level edge cases.

## 8. Runes and rune crafting

**CONFIRMED:** Rune crafting currently exists but runes do **not yet have an established gameplay identity**. A weapon-based spell system is not implemented yet.

**CONFIRMED:** Rune families are elemental and usable by all compatible weapon disciplines. Core rune-consuming spells may use any compatible rune tier; higher tiers improve **numerical strength only**, not range, target count, radius, duration, cooldown, or extra effects. Initial core identity spells should unlock early. Future advanced spells may specify minimum rune tiers. An illustrative ability categorization (not rune-tier gating) is:

1. Basic abilities: no rune requirement.
2. Advanced abilities: mana/cooldown gating, not necessarily runes.
3. Specialized rune abilities: mana plus a defined rune type/quantity.

Rune-family candidates are Fire, Frost, Storm, Nature, Arcane, and Life (**PROPOSED**, not approved final count). Rune tier count, recipes, rarity, prices, consumption rates, exact numerical coefficients, and unlocks remain **OPEN**. Higher-tier runes are not universally mandatory for basic identity abilities.

**PROPOSED:** Allow automation rules to avoid spending expensive runes on trivial encounters or when supplies fall below reserves. Consumption must be authoritative and atomic with effect resolution.

## 9. Automated ability system

**DESIGN DIRECTION CONFIRMED:** The game uses automated combat; the ability/spell framework must support configured casting rather than requiring manual actions.

**PROPOSED minimal configuration:** Priority ordered list + on/off toggle + conditions for HP%, mana%, ally HP%, enemy count, target validity, rune stock, cooldown, and desired resource reserves. Provide useful default rotations; do not require complex configuration for new players.

**PROPOSED resolution order:** validate weapon/loadout -> select highest-priority eligible ability -> validate target/conditions -> validate mana/runes/cooldown -> apply effect and consume resources -> grant eligible XP -> record audit/log. Exact scheduling/tick rules are **OPEN**.

### 9.1 Attack cadence and cooldown lanes — CONFIRMED DIRECTION

- **One universal basic-attack interval** applies equally to all player and monster basic attacks, whether melee, ranged, or wand shots. Exact interval in seconds is **OPEN**; do not hardcode a guessed value.
- **No attack-speed stat or modifiers.** Skills, weapon tiers, equipment weight, haste buffs, consumables, runes, and enemy types must not increase basic-attack frequency. Progression may increase damage or other effects, not basic-attack speed.
- **Basic attacks happen automatically** between activated abilities and do not depend on an ability being ready; ability animations do not create additional gameplay cast time. Their fixed cadence is independent of the three action cooldown lanes below.
- **Separate cooldown lanes, Tibia-inspired:** (1) offensive spells/activated combat abilities; (2) healing spells; (3) consumables. **Food restores HP** and **drinks restore mana**; food and drinks share the *same consumable lane*, not separate lanes. The lanes are mutually independent, so triggering one does not start a global lockout on the others.
- **Individual ability cooldowns** may also apply on top of the appropriate lane cooldown. No cast times, interrupt mechanics, or stuns in the initial combat design. Visual attack/casting animations are permitted but must not add hidden delays to gameplay resolution.
- **PROPOSED test values only:** offensive lane 2 seconds; healing lane 1 second; shared food/drink lane 1 second. These are **not approved fixed values** and must be checked against actual game pacing. The basic-attack interval is deliberately left unset.
- **Important simulation rule:** separate lanes must not allow duplicate actions, multiple basic attacks per tick, or excess actions after reconnect/offline catch-up. Server simulation owns the authoritative timestamps.

### Presets — PROPOSED

Saved loadouts would allow solo destruction and group restoration roles, including equipment, ability priorities, supply policies, and rune thresholds. Presets should not imply in-combat instant gear swapping. **OPEN:** restrictions on swapping, cost, location, and how presets interact with an active hunt.

## 10. Cooperative play and healing targets

**CONFIRMED:** The player values the ability to solo as Destruction and switch to Restoration when friends come online. **DEFERRED / OPEN:** Actual group-hunt rollout, party size, ally AI, healer targeting, shared XP and rewards, threat/tank roles, range, line-of-sight, healing priority, and group death rules.

**PROPOSED architectural precaution:** Model ability target categories (`self`, `enemy`, `ally`, `area`) even if launch initially supports only self/enemy. Do **not** implement full party combat before its gameplay rules are approved.

## 11. Data model sketch — DESIGN CONTRACT, NOT PRODUCTION CODE

```json
{
  "abilityId": "flame_strike",
  "weaponFamilies": ["sword"],
  "discipline": "enchanted_melee",
  "primarySkill": "melee",
  "manaCost": 40,
  "magicXpMultiplier": 0.25,
  "runeCost": null,
  "targetType": "enemy",
  "cooldownMs": "TBD",
  "unlockRequirement": "TBD",
  "automationConditions": ["target_valid", "mana_available"]
}
```

The game should maintain explicit, inspectable data for ability availability, mana spent, combat skill attribution, Magic XP multiplier, rune costs, targeting, cooldown, and auto-use conditions. Do not adopt this schema verbatim without examining existing code.

## 12. Balance and QA test plan

**Core scenarios**

1. Same Magic level, Destruction staff -> Restoration rod: shared level persists; spell pool changes correctly.
2. Solo Restoration damage viability versus Destruction clear speed and sustain.
3. Melee/ranged incidental Magic XP/hour versus dedicated caster at equivalent overall progression.
4. Different mana costs and cast rates; verify that metadata multipliers alone do not create inverted leveling outcomes.
5. Heavy/medium/light gear at low, mid, and high character levels; compare survival, mana uptime, and food/drink spend.
6. Prayer at low, high, and extreme uncapped levels; test healing, mana regeneration, and spell throughput.
7. Bone offerings, player trade, concurrent sessions, disconnects/retries, and no duplicate Prayer XP.
8. Rune expenditures during automated hunts and offline simulation; no negative inventories or double spending.
9. Invalid casts (full-health heal, no rune, cooldown active) grant no unintended XP.
10. Server and client results remain consistent across browser, background tab, logout, and later Steam wrapper.

**Track per hunt:** total damage/healing, kills/hour, combat XP/hour, Magic XP/hour, mana used/hour by ability class, food, drink, and rune consumption, HP/MP downtime, deaths, loot cost/profit, and Prayer-induced deltas. Evaluate across at least several distinct hunt archetypes.

## 13. Decision register

### Confirmed decisions

- No vocations/classes; everyone may train all combat skills.
- Combat skills (Melee, Magic, Ranged, Defense, Prayer) are uncapped; non-combat skills capped.
- No Health skill; character levels increase base HP and mana.
- Heavy armor favors HP; medium is balanced; light favors mana.
- Equipped weapon type determines combat ability access.
- One Magic skill, with Destruction and Restoration weapon disciplines.
- Magic trains from mana usage; melee/ranged mana abilities should train Magic more slowly than dedicated spellcasting.
- Prayer gains XP from bones, improves passive HP/mana regeneration, and is uncapped.
- Instanced hunting with shared social cities/guild halls and a persistent shared MMORPG economy.

### Proposals awaiting validation

- Exact six-ability rosters, names, relative damage/heal values, target rules, and unlock levels (universal self-healing itself is CONFIRMED).
- Magic XP multipliers (1.00 / 0.25 / 0.10 examples) and 10–25% incidental XP/hour testing target.
- Diminishing Prayer regeneration curve, bone tiers, auto-offer behavior.
- Rune family count, tiers/strength coefficients, pricing and automation reserve settings. Core cross-tier numerical-only scaling is CONFIRMED.
- Separate max-resource and regeneration modifiers; exact mixed-armor behavior.
- Ability priority rules, presets, and solo-healer default rotations.

### Highest-priority unresolved questions

1. What is the actual group-hunting roadmap, and will solo hunting instances evolve into party instances?
2. How should universal self-heal scale with character level and Magic, and how much Magic XP does it grant for physical builds?
3. Is Magic XP earned from *all* mana-using physical abilities at reduced rates, or only expressly magical ones?
4. How are Melee, Ranged, and Defense trained and balanced against auto-combat?
5. How are spells unlocked: skill levels, weapon categories, character levels, or combinations?
6. Can equipment/ability presets change during hunts, between fights, or only outside instances?
7. What exactly determines armor weight for mixed equipment?
8. Which of the proposed elemental rune families ship first, and which core spells consume them?
9. When and how does post-hunt bone sacrifice occur; are bones tradable?
10. What are Prayer's regeneration curve and acceptable impact on potion use and Magic XP?
11. What are offline hunt limits, server simulation semantics, and safe inventory/XP transaction boundaries?

## 14. Recommended phased workflow for Claude

**Phase 0: Inspect only.** Read the live code and existing rune crafting, skills, combat, inventory, and hunting systems. Report the actual implementation state and incompatibilities with this spec. Do not change the game.

**Phase 1: Design contracts.** Propose ability/weapon metadata, authoritative cast event, XP attribution, armor modifier interface, Prayer reward transaction, and automation integration. Identify migration risks. Seek approval.

**Phase 2: Thin playable slice.** Implement only a tiny set of representative abilities (one melee, ranged, Destruction, Restoration), one optional rune ability, three armor-weight profiles, and the minimal priority-based casting behavior after approval.

**Phase 3: Simulate and balance.** Produce comparative XP/hour, Magic XP/hour, resource usage, survivability, cost, and Prayer interaction reports. Tune before multiplying content.

**Phase 4: Expand deliberately.** Additional abilities, rune types, polish, presets, and eventual group-healing work only once rules are validated.

**Do not treat this document as a request to implement everything.** Creative examples are not approved feature lists. Preserve working systems, avoid broad rewrites, and return questions where decisions remain open.

---

**Version note:** v1.0 captures the design agreements and ideas reached in the October 2026 discussions; it deliberately distinguishes decisions from proposals. Update the decision register whenever the game director resolves an open item.

---

## 15. Hunt supplies, General Store provisioning, and depletion policies — NEW IN v1.2

### 15.1 Two player supply sources — CONFIRMED

Hearthrise hunting supports two complementary ways to obtain consumable supplies:

1. **General Store basic supplies (wallet-funded):** Basic-tier runes, arrows/ammunition, HP-restoring **food**, and mana-restoring **drinks** are automatically provisioned and consumed as needed during the hunt. Players do not need to pre-purchase, carry, or manually restock basic items. Basic supply availability is effectively unlimited **only while the character's gold wallet can pay each use**. The game charges gold per unit actually consumed; it does not mint an inventory stack for free.
2. **Player-owned improved supplies (inventory-funded):** Players may purchase or craft higher-tier runes, arrows/ammunition, food, and drinks. They can store these in their house or depot, but **only qualifying quantities explicitly carried by the character into the hunt are usable in that hunt**. Each use consumes the actual carried inventory. Depot/house reserves are storage, **not remote infinite supply sources**.

**CONFIRMED PLAYER CHOICE:** When the relevant improved supply runs out, the player can configure either **Leave hunt when X supply is depleted** or **Continue with General Store basic supplies**. The latter automatically falls back to wallet-funded basic supplies as long as the wallet can afford each use. This does **not** imply borrowing, debt, or negative gold. The approved player-facing term is **Store Supplies**, never 'loaned supplies'.

### 15.2 Automated hunt-loop behavior — DESIGN DIRECTION

- During hunt setup, the character selects the intended carried improved supplies and configures a depletion policy. Auto-consumption follows existing food/drink shared cooldowns and the appropriate offensive/healing ability lanes; supply sourcing **does not change attack frequency, spell cooldowns, or animation rules**.
- At each eligible use, select the configured carried item if available; verify and atomically consume it. If unavailable, evaluate the policy *before the next use*.
- **Leave policy:** finish/stop the hunt safely when the specified supply condition is met. Do not silently swap to a different paid product.
- **Fallback policy:** use a compatible General Store basic equivalent and atomically debit the wallet for each consumed unit. If the wallet cannot cover a required purchase, do not provide free or negative-balance supplies. What the character does next (end hunt, omit that action, or continue where survivable) is **OPEN** and requires an explicit safe default.
- **Important compatibility rule:** Higher-tier rune-driven abilities may not have a one-to-one basic rune equivalent. Do not silently cast an ability without its required rune. **CONFIRMED design direction:** when advanced runes are depleted, a compatible core spell can continue with basic Store Runes at basic strength if fallback is enabled. Future spells that require a minimum tier cannot silently downgrade below their requirement; the rotation must skip those casts or end the hunt per the player policy. Exact behavior for mixed supplies is OPEN.
- **Gold and supply tracking:** The Hunt Analyzer should separately show General Store gold expenditures, player-owned consumable units spent (and an optional estimated value), total supplies cost, and resulting profit/hour. Avoid treating crafted supplies as free merely because no gold was paid during the current hunt.

### 15.3 Setup behavior and player-facing labels

| Setting | Meaning | Status |
|---|---|---|
| Source preference | Use carried higher-tier supplies first, then consult depletion policy | PROPOSED default |
| Leave when X supply is gone | Stop hunt when a specified carried supply/threshold depletes | CONFIRMED capability; threshold semantics OPEN |
| Continue with General Store basics | Fall back to gold-funded basic equivalents where compatible | CONFIRMED |
| Minimum gold reserve | Optionally stop store purchases when wallet reaches a reserved amount | PROPOSED |
| Store-only run | Hunt on basic wallet-funded runes, arrows, food, and drinks without carried stocks | CONFIRMED capability |

### 15.4 Economy, data integrity, and outstanding questions

**CONFIRMED boundary:** The server owns the wallet, carried inventory, store prices, consumption events, hunt continuation, and persistent results. Inventory debits and wallet charges must be atomic, idempotent across reconnect/retries, and auditable. Offline hunts obey the same affordability and consumption rules as online hunts.

**OPEN FOR DESIGN/TESTING:**

1. Whether 'X supply' means a named item reaches zero, any enabled item reaches zero, or a configurable count/percentage reserve; whether multiple triggers can be selected.
2. Whether the player selects fallback per item category or once for the whole hunt; preferred UX at hunt setup.
3. Basic supply item definitions, prices, equivalent tiers, healing/mana values, rune compatibility, and ammunition rules for each ranged weapon.
4. Exact behavior when gold is insufficient, when equipment needs a rune unavailable in the store tier, or when an unanticipated stock runs out.
5. Whether the hunt has an explicit end event, duration, or persistent interval for applying the depletion rule.
6. Accounting conventions for purchased versus self-crafted supplies in supply cost and profit/hour.
7. Whether stored items must be manually transferred to the character (current assumption), and any carrying weight/capacity restrictions.

### 15.5 QA acceptance scenarios

- Basic-only hunter runs until manually stopped or unable to afford mandatory supplies; every unit consumed corresponds to a wallet debit, and no negative balance is possible.
- Hunter carrying improved food, drinks, arrows, and runes consumes only carried stock; house/depot stock remains unchanged.
- Under **Leave**, the selected threshold ends the hunt without fallback purchases.
- Under **Continue**, depletion transitions into compatible General Store basics and wallet costs appear in the analyzer.
- Unsupported rune substitution never produces a free cast or invalid effect; ability selection remains deterministic.
- Simultaneous/offline/after-reconnect events do not double-charge, double-consume, or generate supplies or rewards.
- Switching between carried and store consumables preserves the food/drink shared cooldown and independent offensive/healing lanes.

**Implementation guidance:** Audit the current hunt loop, wallet, inventory/depot, food/drink, rune/ammunition, and analyzer before coding. Present discrepancies and clarify OPEN items first. This chapter is a design update, **not approval for a broad implementation or economy migration**.



---

## 16. Hunt Supplies: approved player-facing language and UI — NEW IN v1.3

**CONFIRMED PRODUCT LANGUAGE:** Refer to the two choices as **Use My Supplies** and **Use Store Supplies**. Do not describe the latter as 'loaned', 'borrowed', 'credit', or 'free' supplies: the General Store automatically charges gold for each basic item used and does not create debt.

### 16.1 Hunt setup — recommended minimal layout

**Title:** Hunt Supplies  
**Helper text:** Choose how your character uses supplies while hunting.

**Option: Use My Supplies**  
*Use runes, arrows, food, and drinks carried in your inventory.*

When this option is selected, show a second choice:
- **End my hunt** — End the hunt when the configured required supply runs out.
- **Switch to Store Supplies** — Use carried supplies first, then automatically switch to compatible basic store supplies when they run out, provided there is enough gold.

**Option: Use Store Supplies**  
*Basic supplies are provided automatically. Gold is deducted as you use them.*

**Contextual explanation for Use My Supplies + End my hunt:**  
*Your character uses carried supplies and ends the hunt when a required supply runs out.*

**Contextual explanation for Use My Supplies + Switch to Store Supplies:**  
*Your character uses carried supplies first, then automatically switches to basic store supplies when a required item runs out.*

**Contextual explanation for Use Store Supplies:**  
*Your character automatically purchases basic supplies as needed. There's no need to stock up, as long as you have enough gold.*

### 16.2 UX principles and scope

- Keep the initial interface to **two supply-source options**, with the depletion choice shown only for **Use My Supplies**.
- Explain the system in the interface using short, direct sentences; avoid terms such as wallet-funded, atomic, provenance, fallback policy, and instance simulation in player-facing copy.
- Basic Store Supplies require no depot withdrawal, stocking, or inventory space. Higher-tier player-owned supplies must be carried into the hunt; house/depot storage is not consumed remotely.
- Show Store Supplies costs clearly in the Hunt Analyzer. Do not imply store items are free or loaned.
- Preserve compatibility rules: store basics may not substitute for a specific premium rune or unsupported ability. Do not silently grant the effect for free.
- **OPEN:** exact semantics of 'a required supply runs out', multiple category depletion triggers, when the hunt ends if the gold wallet cannot afford Store Supplies, and whether fallback is global or per category. Do not silently fix these in UI copy.
- **IMPLEMENTATION STATUS:** This approves player-facing wording and UX direction only; it does not authorize implementing or changing the hunt loop without a separate review.


## 17. Weapon identities, self-healing, and ability rosters — NEW IN v1.4

### Core identities and classless principle

**CONFIRMED:** There are no vocations. The equipped weapon determines available discipline abilities. The four primary loadout identities are **Destruction Magic** (Sorcerer-style high damage and AoE), **Restoration Magic** (healing/support with weaker offensive spells), **Melee** (frontline damage and enemy threat control), and **Ranged** (precision / priority-target damage). These are weapon roles, not locked character classes. A character with trained Magic can switch from solo Destruction to group Restoration without relearning a second Magic skill.

**CONFIRMED:** Every loadout has access to a **universal self-heal** using mana and the independent healing cooldown lane. This ability is not counted against the six candidate discipline abilities. Restoration has stronger self-healing and is the only initial discipline proposed to heal/shield allies. Actual self-heal floor, Magic scaling, mana cost, and Magic XP weighting remain **OPEN**. Self-heal must require missing HP and never award XP on invalid/full-health casts.

**CONFIRMED:** Destruction has no ally-targeted healing or shielding; its defense is limited to self-heal and self-only shields. Its identity is superior offensive and AoE output. **CONFIRMED:** Restoration provides group heal, stronger single-friend heal, friend shield, self-heal, and lower-damage offensive spells with group debuff utility. The specifics of the following ability lists are **PROPOSED** and not an instruction to implement.

### Six-ability candidate rosters (PROPOSED, one per discipline)

| Discipline | Ability | Role / effect | Rune candidate |
|---|---|---|---|
| Destruction | Arcane Bolt | Efficient single-target magical damage | None |
| Destruction | Fireball | Signature early AoE damage | Fire |
| Destruction | Frost Lance | Strong single-target cold damage | Frost |
| Destruction | Chain Lightning | Damage chains between nearby targets | Storm |
| Destruction | Arcane Barrier | Self-only damage shield | Arcane |
| Destruction | Inferno | Stronger AoE damage (higher cooldown/cost) | Fire |
| Restoration | Nature Bolt | Viable basic solo damage | None |
| Restoration | Rejuvenation | Enhanced self-healing/regeneration | Life |
| Restoration | Greater Mend | Strong heal targeting self or one ally | Life |
| Restoration | Protective Ward | Shield one friendly character | Arcane |
| Restoration | Nature's Wrath | Lower-power AoE plus fixed enemy vulnerability | Nature |
| Restoration | Circle of Renewal | Group healing | Life |
| Melee | Power Strike | Enhanced single-target physical damage | None |
| Melee | Cleave | Multi-target melee damage | None |
| Melee | Challenge | Raise threat against nearby enemies; no stun | None |
| Melee | Iron Guard | Temporary incoming-damage mitigation | None |
| Melee | Flame Strike | Fire-augmented melee hit | Fire |
| Melee | Earthshatter | Strong close-range AoE damage | Nature |
| Ranged | Precision Shot | Single-target physical attack | None |
| Ranged | Hunter's Mark | Select priority enemy; supports focus-fire abilities | None |
| Ranged | Piercing Arrow | Ignore some physical mitigation | None |
| Ranged | Flame Volley | Limited elemental AoE | Fire |
| Ranged | Predator's Strike | Stronger attack against marked target | None |
| Ranged | Storm Barrage | Multi-target lightning projectiles | Storm |

**PROPOSED differentiators:** Challenge modifies threat/aggro, not stun or guaranteed indefinite taunt; its duration and threat logic are OPEN. Hunter's Mark should be automatically targetable (e.g., current target or strongest enemy), initially one target per Marksman. Restoration's Nature's Wrath can deal roughly half a comparable Destruction AoE's damage and grant a **non-stacking ~10% damage-taken vulnerability** for a short duration; the percentages and duration are examples only. The debuff magnitude and duration do not increase with rune tier. No weapon discipline requires fixed group composition; solo viability remains a requirement.

**CONFIRMED design priority:** Core identity abilities must be accessible early: Destruction AoE, Restoration ally healing, Melee Challenge, Ranged target mark. Skill thresholds may unlock abilities, but do not spread these defining features across most of the progression curve. Advanced/new spells can be introduced much later; no exact unlock levels are approved.

## 18. Revised universal rune families and tier scaling — NEW IN v1.4

**CONFIRMED:** Rune *types* stay consistent across compatible disciplines. A Fire Rune can empower a Sorcerer's Fireball, Melee Flame Strike, or Ranged Flame Volley. An elemental rune's tier is an **input-quality choice**, not a separate spell unlock for the core set.

**CONFIRMED:** Existing core rune-consuming abilities remain the same ability at all compatible tiers. Higher rune tiers increase **numerical damage, healing, or shield strength only**. They do **not** increase AoE radius, number of targets, duration, debuff percentage, status effect count, range, cooldown speed, or basic-attack speed. They do not introduce stuns, interrupts, or cast times. Rune tier improvements should not bypass existing ability targeting or cooldown lanes.

**CONFIRMED:** Future *advanced* spells may require a minimum rune tier, but those minimums are not part of the early six-ability identity commitment. Until individual spells and tiers are approved, **do not lock core spells to specific rune tiers**. Tier count and numeric multipliers remain OPEN.

**PROPOSED rune families:** Fire, Frost, Storm, Nature, Arcane, Life. Exact family list, tier names/count, recipes, balancing coefficients, and vendor pricing await approval. As an example only, Fireball with Tier I Fire may deal baseline damage while a higher-tier Fire rune increases that same Fireball's damage, without changing target count or AoE radius.

**Supply system compatibility (CONFIRMED):** Basic Store Runes are wallet-funded and available as used while gold lasts. Better player-owned runes must be carried in inventory. Players choose **Use My Supplies** or **Use Store Supplies**, and when carried rune stock ends choose **End my hunt** or **Switch to Store Supplies**. With fallback enabled, an ordinary core spell can use the basic corresponding rune at basic power rather than changing to a different named spell; future spells with minimum-tier rules must not cast if only an incompatible basic rune is available. The game must never silently consume an expensive tier to meet a cheaper-tier configuration. Per-spell rune-quality configuration or global tier preference is PROPOSED; precise UX is OPEN.

**Important systemic constraints:** All melee, ranged, wand, and monster basic attacks share one fixed, unmodifiable interval. Activated spells/abilities use the independent offensive lane, healing spells the healing lane, and food + drinks the shared consumable lane. Magic XP remains based on eligible mana actually spent, with reduced multipliers for physical-specialty abilities. All supply and XP deductions are server-authoritative and reliable during offline simulation.

### v1.4 update priority and change control

This chapter **supersedes older illustrative rune requirements**, old notes suggesting the universal self-heal is unresolved, and any older proposed spell tables conflicting with these confirmed principles. Do **not** treat names, proposed debuff values, rune families, tiers, or the six-ability rosters as final implementation approval. First audit the current game and propose a thin vertical slice for review.
