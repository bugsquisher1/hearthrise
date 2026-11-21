# Balance program 45: Tyler's game design and systems brief (2026-11-21, verbatim)

Tyler sent this on 2026-11-21 at about 06:00 UTC, right after the formula brief (40). It is the brief of record for the eight design reviews (52 to 59) and the game review (60). Nothing below is paraphrased.

---

Hearthrise — Comprehensive Game Design & Systems Evaluation
In addition to the formula-driven architecture and global balancing audit, I want you to take a much more proactive role in evaluating Hearthrise as a complete game.
Do not treat the current design as final, and do not assume existing systems are automatically worth keeping.
I want you to act as a senior MMORPG systems designer, combat designer, economy designer, and technical architect reviewing Hearthrise from the perspective of building a commercially successful, deeply engaging, long-lasting game.
Your responsibility is not simply to make the existing systems work correctly.
Your responsibility is to help determine whether we have the right systems in the first place.

1. Evaluate Everything, Not Just the Mathematics
I want a comprehensive evaluation of:

* Spells: Should we add, remove, combine, redesign, or rebalance any spells? Are there redundant spells? Missing combat mechanics? Interesting opportunities for role differentiation?
* Weapons: Do all weapon categories have a meaningful identity? Are some unnecessarily complicated? Are there missing weapon archetypes?
* Equipment: Are there too many or too few equipment upgrades? Do items provide meaningful progression? Are certain equipment slots or tiers underutilized?
* Monsters: Do we have sufficient enemy variety? Do monster abilities and attributes create interesting gameplay differences?
* Hunting grounds: Are our hunting grounds mechanically distinct? Is their difficulty and reward progression logical? Are there unnecessary gaps or overlaps?
* Skills: Are all skills meaningful? Do we need additional skills? Should any skills be merged or removed?
* Crafting: Does each profession contribute meaningfully to the economy? Are recipes valuable, or have we introduced crafting simply for the sake of having crafting?
* Economy: Are our currencies, resource sources, sinks, consumables, and trading systems coherent and sustainable?
* Progression: Does the game offer enough meaningful decisions and accomplishments between major level milestones?
* Party gameplay: Does each combat style contribute something valuable to group hunting? Are certain party compositions too dominant?
* Features: Are there systems we should remove, simplify, combine, expand, or introduce?

Evaluate the entire gameplay ecosystem, not merely individual components.

2. Challenge Existing Design Decisions
I specifically want you to question decisions we've already made.
For example:

* Do we really need every spell currently implemented?
* Would combining two spells produce a cleaner and more interesting system?
* Are some weapons functionally identical despite having different names?
* Does a particular equipment tier provide enough improvement to justify its existence?
* Is a crafting profession actually creating meaningful gameplay, or simply another resource grind?
* Are we missing an important mechanic that could significantly improve long-term engagement?
* Are some features introducing far more maintenance and balance complexity than gameplay value?
* Are any current systems undermining another system's intended purpose?

Do not recommend keeping something simply because it already exists.
Likewise, don't recommend adding something merely because other MMORPGs have it.
Evaluate everything against Hearthrise's actual gameplay identity.

3. Preserve Hearthrise's Core Identity
Hearthrise is a persistent, multiplayer, idle MMORPG inspired by the long-term progression, equipment hunting, character development, and social systems of games like Tibia and Huntera.
Its defining characteristics include:

* Automated hunting with meaningful character preparation.
* Unlimited character progression.
* Distinct combat styles without rigid vocations.
* Deep equipment progression and rare drops.
* Solo viability alongside rewarding four-character parties.
* A persistent, player-driven economy.
* Crafting, housing, collections, and long-term goals.
* A server-authoritative simulation.
* Systems that remain meaningful over thousands of hours.

Every recommendation should be evaluated against these principles.
Remember that idle does not mean shallow.
The interesting decisions should primarily happen through character builds, equipment, hunting ground selection, conditional rules, resource management, economic decisions, and progression planning.
Do not recommend active-combat mechanics that conflict with automated hunting unless you can explain how they would work within Hearthrise's actual design.

4. Evaluate Additions and Removals Systematically
For every significant proposed addition, removal, or redesign, assess:

1. Player value: What meaningful experience does this create or improve?
2. Strategic depth: Does it introduce an interesting decision, build choice, or progression goal?
3. Uniqueness: Does it serve a distinct purpose, or duplicate something we already have?
4. System interaction: How does it affect combat, progression, economy, crafting, equipment, and party gameplay?
5. Balance impact: Can it be incorporated into our universal mathematical framework without introducing unnecessary exceptions?
6. Complexity cost: What are its implementation, testing, UI, maintenance, and future balancing costs?
7. Long-term value: Will the system remain relevant hundreds or thousands of hours into progression?
8. Recommendation: Keep, remove, merge, redesign, add, or defer.

Be willing to recommend removing existing content when it improves the overall game.
Be equally willing to recommend entirely new systems when they would meaningfully improve Hearthrise.
However, prefer depth and meaningful interaction over feature count.

5. Identify Missing Design Opportunities
Do not restrict your analysis to what currently exists in the codebase.
Think critically about what Hearthrise might be missing.
Examine opportunities involving:

* Combat style identity and specialization.
* Interesting equipment decisions.
* Spell and ability variety.
* Rare and aspirational items.
* Boss encounters and rewards.
* Monster mechanics that work with automated combat.
* Long-term character customization.
* Meaningful milestones between major upgrades.
* Crafting and economic interdependencies.
* Player cooperation and social progression.
* Endgame goals beyond gaining levels.
* Features that make hunting more engaging without requiring constant attention.

I want you to identify potential improvements that we haven't considered yet.
For every new idea, explain why Hearthrise specifically would benefit from it.

6. Evaluate the Game as a Connected Ecosystem
Do not review spells, equipment, hunting grounds, and progression independently.
For example:
Adding a stronger area-damage spell may increase XP/hour, reduce supply consumption, change which hunting grounds are optimal, affect the relative value of certain weapons, and alter party composition.
Adding an equipment tier may change rare-drop demand, market prices, crafting demand, and progression pacing.
Removing a consumable might simplify the game while accidentally eliminating an important gold sink.
I want you to trace these consequences before recommending changes.
A locally beneficial change is not necessarily globally beneficial.
Use our formula inventory, dependency map, and simulation framework to evaluate changes together.

7. Prioritize Ruthlessly
I don't want a list of 100 speculative ideas with no actionable conclusion.
I want you to identify the highest-impact opportunities and explain which ones deserve development time.
Organize findings into:

* Critical: Fundamental design or architectural problems that threaten the game's quality.
* High impact: Changes likely to substantially improve gameplay, progression, balance, or retention.
* Medium impact: Worthwhile improvements that are not urgent.
* Low impact: Polish or optional enhancements.
* Remove or simplify: Existing systems that are redundant, ineffective, or excessively complicated.
* Defer: Ideas that may be valuable later but do not justify current development effort.

For each significant recommendation, estimate implementation complexity, risk, expected benefit, and dependencies.
Distinguish evidence-backed findings from design hypotheses.
Do not pretend that simulated metrics alone establish whether something is fun. Identify where real player testing is required.

8. Make Decisions With Me
I want you to make specific, opinionated, evidence-based recommendations.
Don't simply present five options and ask me which one I prefer.
Tell me which option you recommend and why.
Challenge my assumptions when you believe an alternative is better.
If you identify an existing system that is actively harming the game, say so clearly.
If you believe we're missing a mechanic that could significantly improve Hearthrise, propose it.
If you believe a feature I've requested is unnecessary or counterproductive, explain why.
However, do not implement design changes without my approval.
Your role is to research, analyze, simulate, challenge, and recommend. My role is to make the final creative and product decisions.

9. Final Deliverables
Alongside the formula and architecture audit, produce:

1. Complete Game Systems Review: Assessment of all existing gameplay systems and their interactions.
2. Content Rationalization Report: Specific spells, items, monsters, skills, and mechanics to keep, remove, combine, or redesign.
3. Missing Features Analysis: High-value opportunities that are currently absent.
4. Progression and Balance Assessment: Whether the systems support meaningful long-term progression.
5. Systems Interaction Analysis: How proposed changes affect the broader game.
6. Prioritized Recommendations: Your 10 most important proposed changes, ranked by expected overall benefit, confidence, and implementation cost.
7. Validation Plan: How we can prove or disprove your most important recommendations using simulations and actual playtesting.

Begin with an audit and design proposal, not implementation.
The ultimate goal is not to preserve every idea we've had for Hearthrise. It's to build the best possible version of Hearthrise, even when that means removing or fundamentally redesigning things we've already created.
