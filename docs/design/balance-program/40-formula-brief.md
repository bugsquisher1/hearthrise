# Balance program 40: Tyler's formula-driven brief (2026-11-21, verbatim)

Tyler sent this on 2026-11-21 at about 05:30 UTC. It opened with: "A few things i want to make clear." It is the brief of record for the formula audit (41 to 44), and it ranks above the older dives where they disagree. Nothing below is paraphrased.

---

Hearthrise — Formula-Driven Systems Architecture & Global Balance Audit
I want to make a fundamental change in how we approach Hearthrise's architecture, game mechanics, and balancing.
My goal is to build a mathematically consistent, formula-driven MMORPG, not a collection of individually balanced hunting grounds, spells, monsters, weapons, and exceptions.
I'm concerned that we're currently addressing balance problems individually instead of treating Hearthrise as one interconnected system.
For example, if a hunting ground is too dangerous, I don't want us immediately modifying that hunting ground's damage output. If a weapon is underperforming, I don't want a special damage calculation added specifically for that weapon.
Instead, I want us to determine whether the underlying formulas, coefficients, progression curves, or content data are responsible.

1. Core Architectural Philosophy
Every major gameplay mechanic should derive from a small, clearly defined set of universal formulas.
These systems should be:

* Centralized: One authoritative implementation for each foundational mechanic.
* Deterministic: Identical inputs produce identical outputs, except where explicitly defined randomness is involved.
* Data-driven: Content differences are expressed through data, coefficients, and attributes rather than separate algorithms.
* Composable: More complex interactions are constructed from shared mechanics.
* Scalable: Formulas must remain valid across unlimited character levels, increasingly powerful equipment, and future content.
* Auditable: We should be able to trace any combat or economic outcome back through the formulas and modifiers that produced it.
* Globally tunable: Adjusting a foundational coefficient should predictably influence every system that depends on it.

The goal isn't necessarily to have one formula for literally everything. Different mechanics naturally require different calculations.
The goal is to have one consistent mathematical framework for each category of mechanic, with intentional, documented differences.

2. Eliminate Accidental Exceptions
Audit the existing codebase for examples of:

* Hunting grounds with custom combat, XP, loot, or survival calculations.
* Monsters that bypass standard damage or defense mechanics.
* Spells using completely different mathematical calculations despite serving the same underlying function.
* Weapons or equipment with special-case combat logic.
* Character-level thresholds that arbitrarily change calculations.
* Party calculations that differ depending on the hunting ground.
* Hardcoded multipliers introduced to compensate for earlier balance problems.
* Duplicated calculations implemented differently in separate files.
* Unexplained caps, floors, overrides, or conditional modifiers.

Do not assume every exception is wrong.
Some exceptions are legitimate gameplay mechanics. For example, a shield, a healing spell, and an area-damage spell can behave differently.
However, those differences should be deliberate, clearly specified, and preferably implemented using reusable mechanics.
I want every exception identified and classified as:

1. Foundational mechanic: A legitimate rule that belongs in the shared formula engine.
2. Content parameter: A difference that should be represented through data instead of custom code.
3. Intentional special mechanic: A genuine design exception that needs documentation and explicit approval.
4. Accidental complexity: An unnecessary workaround or inconsistency that should be eliminated.

Do not remove intentional gameplay differentiation simply to make everything mathematically identical.

3. Build a Unified Mathematical Model
I want to evaluate the formulas governing:

Combat

* Physical and magical damage
* Healing
* Armor mitigation
* Elemental resistances
* Critical hits
* Life and mana leech
* Attack speed
* Defensive mechanics
* Monster damage and survivability
* Area damage and target scaling
* Aggro and threat

Character Progression

* Experience requirements
* Skill advancement
* Health and mana growth
* Equipment progression
* Weapon damage scaling
* Spell scaling
* Party experience bonuses
* Risk versus reward

Hunting and Economy

* Monster XP rewards
* Monster spawn and kill rates
* Hunting efficiency
* Supply consumption
* Gold generation
* Loot probabilities
* Rare equipment distribution
* Imbuement costs and effects
* Gold sinks and economic inflation

All these systems should fit together mathematically.
For example, a weapon upgrade should not just increase an arbitrary damage number. We should understand how that upgrade affects actual hunting DPS, kill speed, XP/hour, supply usage, survivability, and long-term progression.
Similarly, increasing monster HP should have predictable consequences for hunting efficiency and player rewards.

4. Separate Formulas From Content
Hunting grounds should primarily define their content and encounter composition, not invent their own fundamental combat rules.
Monsters should have attributes that feed into universal formulas.
Weapons should have attributes that feed into universal damage calculations.
Spells should define their behavior and scaling coefficients while using shared damage, healing, resistance, and resource mechanics.
Equipment should use standardized attributes and modifier calculations.
A new hunting ground should generally be creatable by defining monsters, encounter composition, rewards, and environmental characteristics without writing new foundational balancing code.
Adding new content should mostly mean adding data, not adding formulas.

5. Balance the Entire Game Together
This is my biggest concern with our current approach.
I don't want to fix one hunting ground, then discover we've broken three others.
I don't want to buff melee weapons, then discover that we've accidentally invalidated ranged progression.
I don't want to adjust monster damage without understanding the impact on healing, supplies, deaths, and party efficiency.
I want us to develop a global balancing methodology that evaluates changes across the entire game.
This should include:

* Representative character levels across the progression curve.
* Multiple equipment tiers.
* All combat styles.
* Solo and four-character parties.
* Multiple hunting ground difficulty bands.
* Multiple monster archetypes.
* Early-, mid-, and late-game progression.
* Long-duration automated hunting.
* Economic outcomes and resource consumption.

When changing a formula or coefficient, we should be able to run simulations and observe the effects across all these scenarios.
Changes should be evaluated against defined balance targets, not just whether one specific hunting ground feels better.

6. Build a Balance Simulation and Regression Framework
I want an automated system that can evaluate the consequences of any balance change.
Ideally, we should have a representative test matrix that measures:

* Actual DPS
* Damage taken per hour
* Healing per hour
* XP/hour
* Gold profit/loss per hour
* Supply consumption
* Kill rates
* Death frequency
* Dangerous HP thresholds
* Solo versus party performance
* Equipment upgrade value
* Progression efficiency

Use the actual authoritative game formulas and combat engine wherever possible rather than inventing separate approximation formulas for simulations.
Every proposed balance change should produce a before-and-after comparison across the entire representative matrix.
Flag improvements, regressions, and unintended consequences.
I want balance decisions supported by measured results.

7. Long-Term Scalability
Hearthrise has unlimited character levels.
That means the mathematical foundation must remain stable over an extremely long progression curve.
Evaluate potential problems such as:

* Runaway damage scaling.
* Defense becoming disproportionately powerful.
* Healing scaling faster than incoming damage.
* Crit or leech mechanics becoming dominant.
* Equipment upgrades becoming meaningless.
* Monster HP growing faster than reasonable player power.
* XP progression becoming unsustainable.
* Economy inflation.
* Solo/party balance diverging at high levels.

Don't just test levels 1–100.
Evaluate substantially higher levels and identify where formulas begin to produce undesirable behavior.
Unlimited levels do not require unlimited linear power growth. Progression curves can have diminishing returns, but those relationships must be intentional.

8. What I Want You to Do First
Do not immediately refactor the game.
First, conduct a comprehensive audit of the existing architecture.
Deliver:

1. Formula Inventory: Every major gameplay formula, its implementation location, dependencies, parameters, and consumers.
2. Exception Inventory: All hardcoded overrides, special cases, duplicate formulas, and content-specific calculations.
3. Dependency Map: How formulas interact and influence each other.
4. Architecture Assessment: Where the current system violates the principles described here.
5. Proposed Unified Model: A concrete mathematical architecture using shared formulas and reusable mechanics.
6. Balance Validation Plan: How to test global balance using actual game simulations.
7. Migration Roadmap: A prioritized approach to improving the system without breaking existing functionality.

Distinguish confirmed findings from hypotheses.
Preserve existing approved game-design decisions unless a genuine conflict is identified. Flag those conflicts for my review rather than silently changing the design.
Do not introduce new formulas merely to make the system appear more sophisticated. Prefer fewer, better-understood mechanics.
Do not introduce new abstractions unless they meaningfully reduce complexity or improve correctness.
The end goal is that we balance Hearthrise by tuning a coherent mathematical system, not by continuously patching individual pieces of content.
I want Hearthrise built like a professionally engineered MMORPG simulation, with mathematically predictable interactions across the entire game.
