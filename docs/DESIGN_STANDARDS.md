# Design Standards: identity, systems, content, writing

Read this before designing or changing a system, a creature or hunting ground, an item, or any player-facing text. Visual rules are in `ART_DIRECTION.md`. The gate for finished work is `QUALITY_CHECKLIST.md`. Where content lives in code is `SYSTEMS_MAP.md`. (Tyler, 2026-10-14.)

The aim: a thoughtfully authored indie MMORPG that players recognise from a screenshot without the logo. Quality over quantity. Intentional design over feature count.

**The first principle (Tyler, 2026-10-18): players should spend their time making interesting decisions, not repeating decisions they've already made.** Any choice a player has made once (a loadout, a rule, a loot filter, a restock amount, a route, a sell list) is remembered, reusable and copyable. Repetition is a design bug, not content. Before shipping a screen or system, ask: what does the player decide here, and will they ever have to make the same decision again by hand?

## 1. Identity
- Tibia and Huntera are **mechanical** inspirations (automated hunting, unlimited levels, bestiary, parties of four, a visible world). Their names, sprites, maps, UI layouts and text are never copied.
- Hearthrise's own pillars: the hearth and homestead you grow, a server-run shared world, skills that feed each other (gather → craft → hunt → trade), and the road to the throne (the renown spine).
- Creatures, places, items and lore are connected. A creature lives somewhere for a reason. Its drops make something. The thing it makes is worth hunting it for.

## 2. Naming
- **Banned as filler:** Shadow, Void, Ancient, Eternal, Dark, Forgotten, plus "of Doom", "of the Abyss" and the like. Use one only where it is literally true and nothing plainer works. Today's data still has 58 hits; they get renamed as each area is reworked (backlog), and copy-lint will enforce the ban for new rows.
- Names come from **biology, behaviour, place, culture or history**: *Marsh Gulper*, *Quarry Tick*, *Thornwick Ram*, never *Dark Beast*.
- Each region has a naming voice (its root words, its suffixes, its people). Write that voice down in the region's data file header before naming anything in it.
- Places read like real places someone named: a landmark, a founder, a trade, a feature (*Tanner's Ford*, *the Saltpans*).

## 3. Writing
- Short and concrete. One specific detail beats three adjectives. No "ancient evil stirs", no "legends speak of".
- Item text explains what the item is for, then at most one line of flavour tied to a place or creature.
- Lore is environmental first: a broken bridge, a drop note, a bestiary entry. Long scrolls of backstory come last, if at all.
- Plain English in all UI copy (`tests/copy-lint.mjs`). Text that sounds like a robot wrote it is a bug.

## 4. Every system earns its place
Before building or keeping a substantial feature, answer in the lane brief:
1. Which player problem does it solve?
2. What decision does it give the player?
3. How does it plug into the systems that already exist (source and consumer)?
4. What tradeoff does it create?
5. Is it still useful at hour 100 and hour 1,000?
6. Is it depth, or just more complexity?

It must serve at least one of these: progression, exploration, mastery, optimisation, collection, cooperation, economy, discovery. A feature that fails the test gets **merged, simplified or cut**, and old content may be cut freely (CLAUDE.md §3.3b). More systems is not a better game. (The 10-11 "too many systems, no direction" ruling is why the spine exists.)

## 5. Creatures and hunting grounds
- **Targets** (post-launch, subject to the approved data): 10 regions, 60 hunting grounds, 25 creature families, 300 creatures. **Early Access target:** one region done properly, with about 6 grounds and 3 families (about 30 creatures), played and approved. Today the data holds 113 monsters and 4 hunts. Don't grow those counts until the region template is proven.
- A creature exists for a reason. It has a readable silhouette, a combat role (bruiser / swarm / caster / tank / skirmisher), a damage type, one weakness and one resistance, a home habitat, and loot that feeds something. Not every creature needs a special ability. None may be a re-skin with bigger numbers.
- A family shares body plan, behaviour and loot theme. The tiers inside it change role and threat, not only stats.
- A hunting ground is more than a background. It has a landmark, a population mix chosen on purpose, and a risk/reward profile. Grounds compete on different axes: XP, profit, bestiary progress, rare gear, crafting materials, solo efficiency, party efficiency. **No ground is best on every axis.** Prove that with the hunt analyzer numbers, not by assertion.

## 6. Automated combat feel (design side)
Every effect carries game information: who is targeted, what hit, crit or not, what died, what dropped, HP/MP state. No effect exists just for spectacle. No overlapping damage text, no screen shake for routine hits, no constant flashing. Rare drops get the big moment (see the super-rare drop reveal). Audio, when it comes, is one cohesive set (impacts, ambience per region, a rare-loot cue), added deliberately, never as filler. Visual specs live in `ART_DIRECTION.md`.

## 7. Equipment and loot
- No walls of items that differ only by +N and border colour. An important item has a look of its own, a source in the world, and a tradeoff (speed vs damage, sustain vs output, solo vs party) or a property that changes how you hunt.
- Before adding an item, state how it moves hunting efficiency, builds, survivability and market value. Fixed stats; upgrades carry forward at stations and the workbench.

## 8. Progression and economy
- Unlimited levels must stay meaningful: each new level band opens content or choices, not only bigger numbers.
- Watch solo vs party rates, gear power curve, bestiary bonuses, gold faucets vs sinks, supply burn, and material demand. No permanent bonus may trivialise a whole content category by accident.
- **Never present a balance number as validated without evidence:** a simulation, the hunt analyzer, vitals, or a controlled comparison. "Unverified" is a fine word to write.
- The server owns every number (CLAUDE.md §1). Balance changes that move money or rankings go through Security.

## 9. Content at scale: sample, then expand
For any batch bigger than about 20 rows (creatures, items, quests, sprites, descriptions):
1. Write the principles for the batch.
2. Build a small representative sample (about 5).
3. Play it.
4. Review it visually (art-director).
5. Name its weaknesses.
6. The game-designer approves it.
7. Expand in batches of 20 or fewer.
8. Audit each batch for repetition: the same names, verbs, stat shapes, silhouettes.

Less content of high quality beats a lot of forgettable content.

## 10. Challenge, don't comply
If an idea (Tyler's included) is generic, redundant, over-complicated, or bad for retention, say so with the reason and a better alternative. Then follow the decision that's made. Design calls belong to the game-designer and art sign-off is delegated. There is no approval wait: decide, build, validate, then report (Tyler, 2026-10-14).
