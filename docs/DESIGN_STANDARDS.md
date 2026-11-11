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

### Tyler's voice (Tyler, 2026-11-09)
Every line a player reads should sound like Tyler talking to a friend across the table. He said it after a Configure action line read "Numbers for the Plain Fire Rune at Melee 1.": "Most things would be better if it sounded like it came from my voice", and "I'm sick of reading shit that sounds like a AI developer or a god damn broken english mess".

How he talks, in his own words (his chat typos are not the voice; game text keeps correct spelling, capitals and American spelling):
- "Either they are strong enough to do the harder content or they aren't simple as that" (11-08)
- "if you are fighting outside your weight class even in a party, you're gonna waste money but get more exp and possibly die a few times" (11-06)
- "They are just simply harder. That is the risk" (11-04)
- "Nah no bound gear in this game." (10-23)
- "We should just make it easy" (11-08)
- "Just leaderboards is fine" (11-01)
- "Randomization makes it fun to experiment." (11-09)

So: the point first, in short sentences and everyday words (harder, waste money, die). "You" and contractions. Say what happens to the player, never what the system does. One idea per sentence. Cut any line the player wouldn't miss.

**Do**
- Lead with what happens to the player or what they can do: "You're out of Bread. Your next food or drink slot takes over."
- Say "you" and "your", and use contractions where a person would (you're, can't, doesn't, there's).
- Use everyday verbs: hits, heals, blocks, works with, uses, leaves, goes first.
- Say "each cast", "a shot", "an hour".
- Name the thing: "your bag", "Mira's bag", never "this hero's bag".
- On a card or a hover, a few plain words. Exact numbers live in the wiki and the analyzer (TIER NOTES, 11-08).

**Don't**
- Label a field inside a sentence: "Requires: any weapon.", "Drink: restores mana.", "Done: this hero is now Mira."
- Narrate the machinery: "The server says…", "loads from the server", "Numbers for…", "reads as", "the version the slot casts", "this slot's".
- Reach for stiff connectors: "as used", "upon", "via", "thus", "therefore", "in order to", "is set to".
- Use designer jargon: "a pull", "a four", "holds Deadly", "floor", "out of your league", "stays struck".
- Write a sentence with no verb: "After the one before.", "The next home."
- Use semicolons, em dashes, clauses glued with a colon, "pays" for XP, or "fits you" (copy-lint already holds these).

**Before and after** (12 real lines from `src/data/text/`, rewritten in lane/a-player-read-gate):

| Key | Before | After |
|---|---|---|
| `bar.target_enemy` | Attack spell: casts on your current target. | Hits your target. |
| `bar.requires_any` | Requires: any weapon. | Works with any weapon. |
| `bar.effect_shield` | A {points}-point shield. | Blocks the next {points} damage. |
| `bar.rune_needs_a` | Needs a {rune} for each cast: you carry none. Pick the store's rune for this slot to buy one as used. | Each cast uses a {rune}, and you have none. Pick the store's rune for this slot to buy them as you go. |
| `bar.none_left` | None left: you carry no {item}. The next food or drink slot fires instead. | You're out of {item}. Your next food or drink slot takes over. |
| `bar.store_off` | This hero is set to end the hunt rather than buy from the store. | You chose to leave the hunt instead of buying from the store. |
| `bar.holding` | Holding the pack: nothing to Challenge. | You're holding the pack, so there's nothing to Challenge. |
| `bar.blocked_by` | Blocked by {action} (slot {slot}): the same action, and it fires first whenever this one could. | {action} in slot {slot} does the same thing and always goes first, so this one never fires. |
| `bar.no_weapon` | No weapon worn: abilities come from the weapon you wield. Needs {weapons}. | You have no weapon on, and your spells come from your weapon. This one needs {weapons}. |
| `bar.server_refused` | The server says this cannot fire now. | This can't fire right now. |
| `hunts.above_level` | Its monsters are stronger than you. Expect to spend more on supplies, or to die. More XP and better loot. | Its monsters are stronger than you. You'll spend more on supplies and you might die, but you get more XP and better loot. |
| `item.keep_only` | Nothing but keeping: the shop won't buy it | The shop won't buy it, so it's yours to keep |

### Controls say one word (Tyler, 2026-11-11)
A control (a button, a tab, a column head, a menu item, a toggle, a select option) says the genre's one standard word for its action, the same word in every window: Equip / Unequip, Use, Use equipped, New, Save, Cancel, Close, Back, Take, Enter, Leave, Buy, Sell, Deposit, Withdraw, Keep, Lock / Unlock, Sort, Filter, Search, Clear, Select / Deselect, Delete, Accept / Decline, Join, Play, Show / Hide. Tyler said it after "Start from what you wear" became "Use equipped": "Try to standardize language like that a bit more please." His voice (above) is for the explanation beside the control, the coach card, the crier and lore, never for the control itself. A feature keeps its name as the word plus its noun (Dispatch loot, Sell all junk, Equip upgrades, Hunt again). The glossary is data, `src/data/text/controls.js`, read with `t('controls.…')`; a label that cannot read it (a file whose event handlers bind `t`) matches a glossary word exactly. `tests/copy-lint.mjs` holds it: a control of four or more words, one that ends in a period, or a near-synonym of a glossary word (Put away for Deposit, Wear for Equip, Forget it for Cancel) is a slip. The sweep that set the words: `.claude/coordination/control-glossary-2026-11-11.md`.

**How it is held.** `tests/copy-lint.mjs` names the robotic shapes it can catch exactly (its PERSON rules: numbers-for, reads-as, the-version, this-slots, per-unit, server-talk, stiff-word, set-to, jargon, label-sentence, and in the text table no-verb and noun-stack); today's older hits are pinned in `tests/copy-lint-voice.baseline.json`, which only shrinks. The rest needs a reader. Before every release, `node tools/player-read.local.mjs <base-ref>` lists every new or changed player line, a fresh reader judges each one against `--rubric` (this section as yes/no questions), and a flagged line blocks the release until it is rewritten. Never approve copy you wrote yourself.

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
