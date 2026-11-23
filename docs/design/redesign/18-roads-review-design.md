# 18. The Roads, reviewed

2026-11-22, `lane/roads-review-design`, game designer, reviewing a design I did not write. Docs only. The subject is `17-talent-tree.md` and its sketch, read against 14, 15, 16, 02 (packages 1, 1b, 2, 2b, 3, 4, 5, 6, 9), 04, 12, 13 and the code in `src/data` and `src/core/hunt`.

**Tags.** Every claim carries one. **[impl]** is in the code today, with the file. **[doc]** is only in a design doc. **[assumed]** is something 17 relies on that nobody has written down. **[missing]** is needed and exists nowhere. **COMPUTED** is arithmetic on named inputs. Nothing here was played or simulated. Where a number needs the engine, section 7 says what to run.

---

## 1. Verdict in one screen

The Roads is the right **look** and the wrong **budget**. The map, the border towns, the vows and the per-ground builds are good ideas that suit an idle game. But as written:

1. **About 76% of the map is choice by appearance only.** 480 of 635 nodes are milestones that are sized equal on purpose, so where you spend them doesn't matter. They're the stat lines 02 measured as too small to feel (2.2% spread) and then cut. The real decisions number about 30 by Level 200.
2. **The numbers on the exciting nodes and the balance rule disagree by about ten times.** Either vows are felt and break the ledger, or they fit the ledger and nobody feels them.
3. **The auto bar and the risk stances quietly switch off a large set of nodes.** These are cooldown cuts on full lanes, low-health effects under the fall back line, "short hunt" options in a 10 hour day, and anything that reads a block, which the engine doesn't have.
4. **Border towns are mispriced.** A borrowed move fills a lane the hero wasn't using. Under the spell rule a borrowed heal grows with the borrower's weapon, so a club could become the best healer in the game.
5. **Per-ground saved builds break the "balanced across the mix" rule** that every crossroads and vow is sized on.
6. **The ring of seven fixes which hybrids exist, and it can't grow.** It shuts out the most natural pair (Destruction with Restoration, which share Magic), and adding an eighth country breaks an existing border.

None of this needs the map thrown out. Section 5 has eight changes that keep the map, the borders and the vows and fix the budget underneath.

---

## 2. Current state: what exists

| Piece | Status | Where |
|---|---|---|
| Talent points, ranks, crossroads, vows, borders, presets, resets | **[missing]** No `talents.js`, no table, no RPC. `the-path.js` points at a `src/data/talents.js` that doesn't exist | `src/data/the-path.js` lines 38, 67, 76 |
| Seven weapon disciplines | **[impl]** shield, sword, dual_axe, club, ranged, destruction, restoration | `src/data/abilities.js` `DISCIPLINES` |
| 23 live moves | **[impl]** Fist strikes (`FIST_LINE.live` false), Brand, Reave, Updraft and Blight (`NECROTIC_STORM.live` false) are switched off | `abilities.js`, `fists.js`, `necrotic-storm.js` |
| Weapon lock on the bar | **[impl]** A hero's bar may hold only its weapon's discipline rows | `src/core/hunt-spawn.js` line 44 |
| How the auto bar fights | **[impl]** Each sub-step, each hero fires the first slot in bar order whose conditions, lane, cooldown, mana, target and supplies all pass. Three lanes with lockouts: offense 2 s, support 2 s, heal 1 s. Casts run beside the weapon's swings | `src/core/hunt/abilities.js` `firstUsable`, `castAbilities`. `ABILITY_LANES` |
| What a slot can test | **[impl]** Own and ally HP and mana, allies below, enemies in the area, party HP, enemy casting, in fight, target weak or resists, target is boss, item count, a status on target, self or ally | `src/data/condition-metrics.js` |
| What a slot can't test | **[missing]** Target HP %, a Hunter's Mark (it's a field, not a status), Bleed stack count, the last move cast, a monster's role | same |
| The spell rule | **[impl]** Every cast is a share of the caster's own largest blow. Mend is the one exception, because Tyler saw the hardest hitter would become the best self-healer (call 32-4) | `abilities.js` header |
| Magic training | **[impl]** Paid per mana spent, at the row's `magicXpMult` (Greater Mend 1600) | `abilities.js`, `hunt-rewards.js` |
| Rune versions I to V | **[impl]** A second ladder on every rune spell's output, +10% a tier | `runes.js` `versionStep` |
| Block, stagger | **[missing]** Neither exists in the engine. "Block" in `src/core/hunt` only means a tile in the way | grep of `src/core/hunt` |
| Monster wind-ups | **[impl]** for monster spells only (`enemy_casting`). Wind-ups on blows **[doc]** | `monster-spells.js`, 02 package 1 |
| Danger scale, stances, readiness | **[impl]** on Muster Barrows. Fall back at 45% (Careful), 25% (Steady), 12% (Bold). Pulls wait for 80% HP | `src/data/danger.js` |
| Monster roles and two rows | **[impl]**, Danger scale only | `src/core/hunt/monster-roles.js` |
| Gear in steps, Trait budget | **[impl]** as data, hidden. `traitSteps` 4/7/10 shown as +1.5/2.5/3.5%. `conditionalStepsMax` 20 | `gear-steps.js`, `traits.js` |
| Wage | **[impl]** `wageBase` 3,800, `payStepCoin` 0.4% | `src/data/wage.js` |
| Imbuements | Drops **[impl]**. Imbuing **[missing]** ("IMBUING IS NOT BUILT") | `src/data/imbuements.js` |
| Prayer | **[missing]** on purpose. Inner Flame replaced it (2026-10-25) and is now Luck (02 2b). Blessings exist as a death-cost cut | `skills.js`, `hearth.js`, `blessings.js` |
| Crafting, company trades | **[doc]** `09-crafting.md`. Runes are the supply every rune move burns **[impl]** | |
| Power step in the engine (R9) | **[missing]**. Every node size in 17 is in steps the engine can't read yet | 11-build-audit R9 |
| Sustain counters, dominance reader, kit sampler | **[missing]** | 04 section 14 |

**The plain fact:** the Roads is 100% **[doc]**. Every number in it is a starting value, and nothing has been measured on it.

---

## 3. Strengths (keep these)

- **It looks like ours.** A road map out of Havora reads as Hearthrise from a screenshot. [doc]
- **Border towns are the right fix for the weapon lock.** No second weapon slot, no second gear budget, and it can be reset. [doc] The weapon lock it breaks is real and in the code [impl, `hunt-spawn.js`].
- **Vows are the best idea in the doc.** A rule with a cost is what a player remembers. They're the "trade-off nodes" 2c adopted. [doc]
- **Per-ground saved builds and "Spend as suggested" honor the first principle.** A choice is made once and replayed by the plan. [doc]
- **Resets are cheap and grow within the day** (0.5, 1, 2, 4 hours of wage). A player can experiment without ruining a hero. [doc] The wage it reads is built [impl].
- **The theorycraft tools (planner, share codes, the dummy) are the right retention hook**, and the server-side checks are scoped correctly. [doc]
- **Stacking keys are shared** across Traits, Signatures and branches (15). [doc]

---

## 4. Critical issues

Ranked by how much the player would feel each one.

### 4.1 The point economy is mostly an illusion of choice (evidence, COMPUTED)

- 480 milestones, each sized the same (`pointShare`, a third of a step), so "a point is worth the same wherever it goes" (1b part 3). That's the design, and it means the milestone choice has no outcome. [doc]
- 52 waystones are "budget-neutral flavor that can't be felt alone" (17 section 9). [doc]
- The rest are real decisions: 53 crossroads (but a hero only cares about the 10 to 12 on moves it slots), 3 vows, 2 borrowed moves and a final form. **About 30 real decisions by Level 200, wrapped in about 600 clicks.** With "Spend as suggested" on, the player sees only those 30.
- 02 1b rejected "a wheel or tree on its own screen", and 2c "cut the web" of small passive nodes, because stat lines measured at most 2.2% apart (`12-balance-pass.md`). 04 section 15 kept the tree a rejected candidate "unless that reads flat". Tyler's approval of 17 overrides the shape, but **the evidence behind the rejection was never answered**. The "+2% max health / +2% armor" milestones are those same stat lines.
- **The tooltips disagree with the size rule.** By the Traits' own convention (10 steps shown as +3.5%, `gear-steps.js` `shownPct`), "+2%" is about 6 steps. The rule says a third of a step. That's about 17 times over. Whichever wins changes the system: at a third of a step nobody feels a milestone, and at +2% the 480 of them break the ledger.

### 4.2 Vow and branch sizes break the ceiling (evidence, COMPUTED)

- Vow tooltips: Single Combat +20%, Heavy Casting +40%, Still Mind +100% mana regen. By the Traits' convention, +20% damage is about 52 steps at `powerStep` 0.35% (37 at 0.5%, 73 at 0.25%). The rule in 17 section 9 says +3 to +4 steps where a vow fits. **That's about ten times apart.** A whole kit of Traits is capped at 20.
- If the Lab cuts vows to 3 or 4 steps, a vow is about +1.4%, and that's a stat line again. **This is the system's central tension:** the parts meant to be felt are budgeted at a size that can't be felt.
- **The parts don't add up to the ceiling.** One ground allows up to 3 steps between the best and worst option at a crossroads. A Level 200 hero has about 10 to 12 crossroads on slotted moves, plus 3 vows at +3 to +4 each. Picked per ground, that can reach about 42 to 48 steps, or about 37% pace at `payStep` 0.7% (COMPUTED, upper bound). The ceiling in section 9 is 5 to 10%. Gaps don't always add, but nothing in 17 stops them.
- **Signatures are counted twice.** 15 sizes a Signature at "about one gear tier" (about 20 steps, about 15% pace). 17 section 9 puts "Traits and a Signature worn" inside a 5 to 10% ceiling. That only holds if both arms wear the same gear. 17 doesn't say so. [assumed]

### 4.3 Per-ground builds defeat "balanced across the mix" (evidence)

Every crossroads and vow is sized as "budget-neutral across the mix" or "mean across the mix between −1 and +1 step" [doc]. But the company plan applies a saved build per ground at the Start, for 0.5 hours of wage [doc, 1b and 04 section 11]. **A trade that's +4 here and −3 elsewhere is just +4 if you only wear it here.** The sizing assumes one build worn everywhere. The plan makes that false for anyone with two saved builds. The check has to read the best build per cell, presets included, not one build over the mix.

### 4.4 The auto bar switches off whole classes of nodes (evidence from code)

| Class | Why it's dead or weak | Nodes hit |
|---|---|---|
| **Cooldown cuts on a full lane** | The offense lane fires at most once every 2 s [impl]. A club's offense lane is 83% full (Power Strike 6 s, Turning Cut 8 s, Quarry Blow 8 s, noted in `abilities.js`). One −2 s cut fills it, and every further cut does nothing (COMPUTED). Ranged and Destruction offense run about 78% full. Axes run about 29% full, so their cuts stay live | On sword and club: Quick Strike, Fast Turn, Quarry Blow −1 s, Turning Cut −1 s, Iron Rhythm. Not hit: Fast Sickness (the healer's offense lane is mostly idle) and Quick Slam (Shield's support lane runs about 65% full) |
| **Low-health effects under the fall back line** | On Steady the party breaks off the moment any hero drops under 25%. On Careful it's 45% [impl, `danger.js`]. A rule that needs a hero under 25% almost never fires on Steady. One under 40% never fires on Careful | Lifeline, Thrifty Mending (<25%), Turning Tide (<30%), Deep Mending (<40%, dead on Careful), Ready Shelter (<30%), Unbroken (lethal hit), Second Wind (Mend, <25%), Trait Last File |
| **"Short hunt" options in a 10 hour day** | Every idle hunt is long [doc, package 9: 10 h, 12 with Premium]. So "best for long hunts" always wins and "short hunts / fast pulls" always loses | Wins: Still Mind, Light Circle, Small Fireball, Spare Arrows, Lasting Ward. Loses: Echo Cast, Quick Rend's "fast pulls", Twin Rend |
| **Needs a block** | No block exists [missing]. 17 section 13 doesn't list block as a new engine piece | Answering, Riposte, Shield Priest |
| **Needs a condition the bar lacks** | The bar can't hold a strike for a low target, a marked target, 5+ Bleed stacks, or "after Quarry Blow" [missing metrics]. These still work as passives, but the player can't build the bar around them | Finishing Strike, Opening Strike, Clean Sweep, Reaping Turn, Deep Pull, Aimed Shot, Marked Prey, Spell Mark, Deep Wounds, Tempered Strikes, Second Strike |
| **Needs rotation** | A priority bar fires its top ready slot again whenever it can. It doesn't alternate. With no "last cast" metric, the player can't make it | Flowing Cuts (resets on a repeat), Smith's Arm (shared cooldown, fine), Tempered Strikes |
| **Repeats a bar condition** | "Only casts on allies below 40%" is already a slot condition (`ally_hp_pct`) [impl]. The branch is really "a condition the player could write, plus +60%" | Deep Mending, Tight Circle's reach part |

### 4.5 Border towns are mispriced: lanes, mana and the spell rule (evidence plus hypothesis)

- **Idle lanes.** A Shield hero's heal lane holds only Mend (6 s), so it's about 83% idle. A healer's offense lane in a party holds only Green Sickness (10 s), so it's about 80% idle (COMPUTED from `abilities.js`). A borrowed move on an idle lane costs no lane time. **Mana is its only cost**, not the −30%. The rule "at least 3 steps behind the native" compares against the wrong thing. The real comparison is against what that lane did before, which was nothing. [evidence for the lanes. The size of the gain is a hypothesis]
- **The spell rule.** A cast is a share of the caster's own largest blow [impl]. 17 proposes that a borrowed move "scales with the skill of the weapon you hold". Greater Mend is 3170‰ of the blow, sized on a staff. On a two-handed club, at −30%, it could out-heal the native healer. Tyler already ruled Mend out of the spell rule for exactly this reason (32-4). [hypothesis. Measure it]
- **Magic training.** Magic XP is paid per mana at the row's `magicXpMult` [impl]. A melee hero casting a borrowed Greater Mend trains Magic fast. 17 hands this to Systems without noting it. [hidden dependency]
- **Likely result:** "Use Greater Mend with any weapon" becomes mandatory for every non-healer, and the second town pick becomes a free damage move for healers. [hypothesis]

### 4.6 Seven countries aren't seven peers, and the ring can't grow (evidence)

- **Size.** Restoration has 6 moves, Ranged and Destruction 4 each, Shield 3, Sword 2, Club 2 (one of them shared) and Dual Axe 1 [impl, `abilities.js`]. Shield's own strikes live in Sword country. Turning Cut, used by sword, axe and club, lives in Club country. **Sword, Axe and Club are three flavors of Melee damage** sharing one skill and two moves. They aren't three countries with the weight of Restoration.
- **The ring picks the hybrids.** It has 7 borders out of 21 possible pairs. Missing: **Destruction with Restoration** (both Magic, the classic battle-healer), Ranged with Restoration, Ranged with Shield, and Sword with Shield (the same weapon set). These go only through Havora at −40%.
- **Expansion breaks builds.** Adding an eighth country (fists, or any future weapon) into a ring means cutting an existing border. Every hero standing on that border loses its town, hybrid crossroads and hybrid vow. 17 section 14 says "the standing rule follows the suggested road into new countries" but doesn't deal with this.
- **The generalist has no home.** "Good at everything, great at nothing" today means Havora's crossing, and that's capped at 2 borrowed moves at −40%. The fist line, the natural generalist, is switched off [impl] and has no place on the ring. [missing]

### 4.7 Vows: slots come too late for the thing that's "the point" (COMPUTED on 04's worked curve)

17 section 12.3 says "Vows and borders are the point". On 04 section 5's worked example (16 h ceiling, half at Level 60, not ruled), the slots arrive at about 90 hunted hours (Level 30, about day 9), 470 (Level 80, about day 47) and 1,790 (Level 200, about day 179). **Most players hold one vow for six weeks.** Also, "Spend as suggested" takes Hold Fast at Level 30 by itself, a rule with a −25% damage cost. A vow should never be taken silently. It should be one of the three return-card decisions.

### 4.8 Other contradictions

- 1b limits a move's card to four lines (rank, one branch, two from gear). The Roads gives a move 2 crossroads, 2 waystones, a final form, vows that read it, Traits and a Signature. [doc vs doc]
- 1b's first sample has one rank mark on one move per weapon. 17 section 12 samples two whole countries, a border and the Hearth.
- Crossroads II was made independent of crossroads I to keep the map flat (17 section 5). That removes the build paths 16 had and makes each fork a lone choice.
- Two ladders on one number: rune versions (+10% a tier) [impl] and ranks [doc] both raise a move's output. 1b warned these "must be kept from doing one job".
- Solo tanks: Challenge only fires while a monster is off the tank [impl, `targeting.js`], so solo it never fires. Frost Slam and Shelter are party only [impl]. **A solo Shield hero's entire country is inert except its stat milestones.** The table's "Frost Warden, Solo OK" doesn't match the code.

---

## 5. Hidden dependencies

Things the Roads needs that 17 doesn't list or that sit in another lane:

| Dependency | Status | Blocks |
|---|---|---|
| Power step in the engine (R9) | [missing] | Every size in 17. Nothing can be measured until a step means something to the engine |
| Block and stagger | [missing], not in 17 section 13 | 4 nodes and the Shield fantasy |
| Bar metrics: target HP %, marked, Bleed stacks, last cast | [missing] | 11+ nodes the player can't build a bar around |
| Bar accepting off-weapon rows, server-checked | [missing], `hunt-spawn.js` refuses them | Every border town |
| A ruling on which blow a borrowed cast reads | [missing] | Border-town balance (4.5) |
| Talent rows, plan rows, share codes, dummy runs on the server | [missing] | Everything. These are new pre-EA Security surfaces |
| Readers: sustain counters, best build per cell with presets, dominance library | [missing] (04 section 14) | The "no single best build" target |
| Engine pieces from 15 and 17 together | [missing]. About 35 listed in 15, 7 in 17, plus block, hold target, redirect damage, auras, positions, charges, execute, overheal, heal over time, auto-cast triggers | Wave 3 size. It's an L-sized engine batch at least, not "rule rows" |
| What happens to a full map when content adds a country | [missing] | A Level 600 hero has every point spent. New nodes need a free move of open-road points, or the hero must pay a reset to try new content |
| Death takes the last spends first | [doc]. A Bold death at Level 80 could take the second vow mid-day | Vow stability |

---

## 6. The whole balance environment, traced

**How one defensive node moves everything.** Take Hard Challenge (the taunted enemy deals 15% less to the tank) on a Steady four. All links are [impl] in the engine unless marked.

1. The tank takes less damage, so the tail of its lowest HP in a pull rises.
2. Fewer pulls cross the 25% fall-back line and more stay over the 45% climb line, so the company **climbs** (`danger.js` `CLIMB`).
3. It climbs until the tail sits at the line again. **Death risk ends where it started** (zero on Steady, by design. On Bold, back near its old rate).
4. Each step deeper pays `payStep` more and costs about two steps more sustain per kill (04 section 3) [doc]. **The supply bill goes up, not down.** On today's scale supplies are about twice the wage at Level 60 [measured, 04 section 11], so the bill is the main cost.
5. Readiness waits for 80% HP before every pull, so healing demand between pulls is set by depth, not by the node.
6. Hunt length is the 10 hour day unless supplies or gold run out first. A higher bill can end a supply-limited hunt sooner.
7. XP pace rises by about `payStep` per step held.

**What that means for builds.** The climb turns every node, defensive or offensive, into one number: depth held. A tank node and a damage node of equal steps give the same result. They only differ in which limit they lift. That's good for balance and bad for identity: two very different builds show up in the report as "Depth 14" against "Depth 15". **The sustain counters are what make builds feel different**, and they don't exist yet.

**The levers that really decide each archetype:**

| Archetype | What decides it | Emerges? |
|---|---|---|
| Pure damage | Lane room, cooldowns, single-target vows | Yes, on every weapon [doc] |
| Sustain (self) | Mend's branches, Drowning Pull, Draining Sickness, a borrowed heal | Weakly. Mostly through borrowing, which is mispriced (4.5) |
| Healer and support | Restoration, Shield, mana | Yes, and it has the most choices (136 points) |
| AoE | Turning Cut, Fireball, Volley, Rockfall, Hail of Arrows | Yes, but thin, as 17 admits |
| Single target | Sword and Ranged vows | Yes. Single Combat and Pressing Attack stack ("hero deals more damage" adds), so they're the likely boss pick |
| Hybrid | Border towns | Yes, but the ring picks which ones, and lane gains distort them |
| Fist generalist | Nothing | **No.** No country, switched off |

**Mandatory and dominant candidates** (hypotheses until measured): a borrowed Greater Mend on every non-healer. Still Mind on every caster (mana gates readiness, so faster mana means faster pulls). Mended over Answering for every tank (always on while tanking, and Answering needs a block). Single Combat with Pressing Attack on bosses. Vows with no weapon requirement travel to every hero: Hold Fast, Bodyguard, Cold Iron, Unbroken, Front Line, Still Mind, Crushing Blows, Braced, Single Combat, Pressing Attack.

**Ineffective** (evidence): the dead classes in 4.4.

**Redundant:** Deep Mending's condition and the bar's own condition. Wide Circle (Circle's radius is already 8 tiles, and the whole party is usually inside it) [impl radius 8]. Range waystones, if heal range isn't binding [assumed].

---

## 7. Recommended changes

Each is ranked by player impact, with its cost, its risk, whether it rests on evidence or a hypothesis, and how to check it.

| # | Change | Impact | Cost | Risk | Basis | How to validate |
|---|---|---|---|---|---|---|
| R1 | **Cut milestones to travel only, about a quarter as many.** A point still comes every Level. Ranks are the rank stones on a move's road. Remove every "+2% stat" stone. Roads between moves shrink to 1 stone. The point's third of a step arrives through ranks on slotted moves only. Target: a crossroads, waystone, town or vow every 2 to 4 Levels | High: the map has a decision every few Levels instead of every 15 | S, data and sketch | Low | Evidence (02 1b, 2.2% spread) | Count decisions per 10 Levels on the Shield walk-through. Phone read at 922×423 |
| R2 | **Give vows a real budget and say so.** Size each vow at about half a tier (10 steps) where it fits and −10 where it doesn't, inside `conditionalStepsMax`. Write the tooltips from steps (the Traits' convention). One size rule, one convention, for milestones, crossroads, vows and Traits | High | S, docs and lever rows | Medium: more variance | COMPUTED (4.2) | The Lab: each vow on its best cell and worst cell, 8 seeds × 12 h, held depth |
| R3 | **Size every trade on the best build per cell, presets included.** Change 17 section 9 to read "best saved build per cell", and cap the gap a preset can find. If a vow is only ever worn where it fits, its downside must bite on that ground too (example: Single Combat's −40% on area hits matters on any ground with a pack) | High | S | Low | Evidence (4.3) | Library test per cell with a two-build plan |
| R4 | **Price borrowing by lane and blow, not by −30%.** A borrowed move reads a fixed reference blow (the native weapon's at the hero's Level), never the holder's. Then either (a) a borrowed move costs 50% more mana, or (b) only one borrowed move may sit on a lane the hero's weapon doesn't use. Decide whether borrowed casts train Magic | High: stops the mandatory heal | M, a Systems lane | Medium | Lanes: evidence. Size: hypothesis | Lab candidate: a hammer seat with Greater Mend on its bar, against base. `v1-climb.mjs --candidate <id> --styles hammer,bow,mage,healer --risks steady --seeds 8 --hours 12`. Read the held step and the healer's share of healing |
| R5 | **Replace the ring with a border list, and add Destruction with Restoration.** Borders are data rows (pairs). The map draws them however suits the art. Start with the 7 plus Destruction·Restoration and Sword·Shield. Adding a country adds rows and never cuts one | High for hybrids, high for expansion | S data, M art | Low | Evidence (4.6) | Walk-through: a Level 40 wand-and-staff hybrid using only real nodes |
| R6 | **Make the Hearth the fist line's country: the generalist.** Wraps hold no country of their own. They borrow at a lower penalty (−15%) and may hold 3 borrowed moves, with lower native power. That gives "good at everything, great at nothing" a home without an eighth wedge | Medium | M once `FIST_LINE` goes live | Medium | Hypothesis | Fist seat on 3 ground mixes. It should be top 3 nowhere and bottom 3 nowhere |
| R7 | **Kill the dead node classes before writing more.** Drop cooldown cuts on lanes over 75% full, or turn them into mana or effect. Re-key low-health effects to the stance line ("when a hero nears the fall back line"). Remove "short hunt" as a "best for". Hold Answering, Riposte and Shield Priest until a block exists, or rewrite them on taunt or wind-up. Add the four missing bar metrics | High | M (metrics are a Systems lane) | Low | Evidence (4.4) | Grep each node against `danger.js` stances and lane fill. The dummy analyzer shows how often each fires |
| R8 | **Bring the second vow to Level 50, keep the third at 200, and never auto-take a vow.** "Spend as suggested" stops at a vow and puts it on the return card | Medium | S | Low | COMPUTED (4.7) | Days to each slot on the final Level hours table |
| R9 | **Make sustain show.** The report shows healing by source, damage taken by seat and the supply bill per depth, so a tank build and a damage build don't both just read "Depth 14" | High for build identity | M (04 section 14's missing readers) | Low | Evidence (section 6) | A blind read of two reports by someone who didn't build them |
| R10 | **Let crossroads II read crossroads I on about a third of moves.** Only where it makes a build (Deep Cuts into Deep Wounds, for example). Keep the rest independent | Low | S | Low | Hypothesis | Library builds using a dependent pair, top 3 in some cell |
| R11 | **Free migration when content arrives.** When a release adds nodes, a hero may move open-road points onto them once, for free | Medium, long term | S | Low | Hypothesis | Walk-through at Level 600 when a new country lands |
| R12 | **Default the phone to a road card, with the map as the second view.** The card shows the next fork, its cost in points and the three options. The map is for planning | Medium | M art | Low | Hypothesis | Phone play of the sample at 922×423 |

**Merges and cuts inside the content:** merge Wide Circle into a waystone (radius already covers the party). Merge Quick Strike, Fast Turn and Quick Rend into one "faster" option per weapon, placed where the lane has room. Cut Flowing Cuts or rewrite it as "a different move than last: +x", which needs the last-cast metric. Move Unbroken and Lifeline to a Bold-only "Edge" key so they read as Bold tools.

---

## 8. The seven-region structure, compared

| | A. Seven equal primaries (17) | B. Four primaries (Guard, Melee with axe/club/sword provinces, Ranged, Magic with Destruction/Restoration provinces) | C. Seven countries on a border list, Hearth as generalist (R5 + R6) |
|---|---|---|---|
| Variety | High on paper, but Axe has 1 move | Lower per weapon, deeper per province | High, and hybrids aren't fixed by geometry |
| Balance complexity | 7 countries, 7 hybrids | 4 + provinces, fewer borders | 7 countries, about 9 to 12 hybrid rows, each one a test |
| Understanding | Clear: "my weapon is my country" | Harder: "melee, then which melee" | Clear, and it matches the weapon pick at creation |
| Role identity | Good for Shield and Restoration, blurred among the three melee | Clear: front, damage, ranged, magic | As A, plus a generalist |
| Weapon flexibility | Low: max 2 borrowed, ring pairs only | High inside a province | Medium-high |
| Solo | Shield inert solo, Restoration weak | Same problem | Same problem. Needs a solo fix in the Shield roads (R7) |
| Party of four | Good | Good | Good |
| Future expansion | Breaks a border every time | New provinces slot in | Add rows, nothing breaks |
| Matches the code | Yes, `DISCIPLINES` | No, it needs a data re-cut | Yes |

**Recommendation: C.** Keep seven countries because they match the weapon pick and the code. Stop treating them as peers in size, and admit that Sword, Axe and Club are provinces of one Melee heartland by putting Power Strike and Turning Cut on a shared Melee road next to Havora. Borders become data, and the Hearth becomes the generalist's home. All seven stay viable primaries through their crossroads and vows, which is where their identity lives. Their size differs and should, as long as each weapon gets a decision every few Levels.

---

## 9. Long-term progression

- **Does a player end up owning everything?** Yes. Every milestone and waystone by about Level 530 to 590 [doc, COMPUTED]. After that a hero is unique only through its picks, vows, borrowed moves and final form. That's fine. The open road keeps every point a choice of which move, as 1b admits.
- **Do early choices still matter?** Crossroads picks stay until a reset, so yes. A cheap reset makes them soft commitments, which suits theorycraft.
- **Milestones.** First crossroads at Level 9 [doc]. Vows at 30, 80 and 200 (R8 suggests 50). The final form at 200. Past 200 there's no hand-made beat at all. **This needs a design.** One option: a rank mark every 50 Levels on the open road that offers a new waystone from the current release.
- **Experimenting without ruining a hero.** Good: free drafts, the dummy, cheap first resets, and death takes the last spends first.
- **Power creep from releases.** Equal node sizes stop raw creep. New crossroads and vows can still out-specialize old ones. Each release must run the library test (17 section 9) with the new rows in, and a new row that tops more than 25% of cells is rewritten, never shipped.
- **Adding regions without breaking builds.** It's broken by the ring (4.6) and by fully spent maps (5). R5 and R11 fix both.
- **Reasons for more than one build.** Per-ground builds give that reason [doc]. It's also the hole in the balance (4.3).

---

## 10. Foundational goals and provisional rulings

| Foundational (don't bend) | Provisional (open to change) |
|---|---|
| The server decides everything, and the client sends intents. The plan, codes and dummy are server writes | The ring of seven and its order |
| Idle: the bar plays for 10 hours with nobody watching | 635 nodes, and 480 milestones |
| Build variety with no single best build (Tyler) | −30% and −40% borrowing, max 2 borrowed |
| A point every Level, and evolutions (Tyler, RD-Q4) | Vow slots at 30, 80 and 200 |
| Phone first: one component as a window or a sheet | "+2%" stat stones |
| Looks like ours | Crossroads II independent of I |
| The first principle | Battle Healer lifting Undertow's solo rule. It's a current-game rule, so it doesn't bind, but it's a choice to make on purpose |
| Level 200 is a big deal, and Level is uncapped | Every number in sections 4 to 9 of 17 |

**Named contradictions:** 02 1b, 2c and 04 section 15 reject a tree of small nodes, and 17 is one (4.1). The tooltips and the size rule (4.1, 4.2). The parts and the ceiling (4.2). Mix-balanced trades and per-ground builds (4.3). Border-town pricing and the spell rule (4.5). 1b's four-line card limit (4.8).

---

## 11. Open decisions for Tyler

Only the ones that change the approved shape. Everything else above is mine to decide.

1. **R1: cut milestones to about a quarter.** The map stays, and so does a point every Level. It changes the look he approved, so it's his call.
2. **R2: let vows be big (about half a tier).** More build variety and more risk of a best build. The alternative is vows at about +1.4%.
3. **R5 and R6: borders as a list, and the Hearth as the fist generalist.** It drops the strict ring.

---

## 12. Roadmap notes

- **Nothing from the Roads goes into data until R9 (power step) has a reading.** Node sizes are meaningless before it.
- **Before writing more nodes:** add the four bar metrics, rule on block, rule on which blow a borrowed cast reads (Systems). Those three decide which nodes are alive.
- **Sample, as 17 section 12 says, but smaller:** Shield, Restoration and their border, after R1, R2, R4 and R7. Run five Lab allocations (all banked, suggested, one move, spread, best found) plus a two-build plan, then play it on a phone with "Spend as suggested" on and off.
- **Lab runs owed, in order:** (1) a borrowed Greater Mend on the hammer seat (R4). (2) Each Shield and Restoration vow on its best and worst cell (R2). (3) The best build per cell with presets against the suggested build (R3). Use `tools/balance-program/redesign/v1-climb.mjs --candidate <id>` on a scratch tree, 8 seeds × 12 h, Steady, with the held step and the supply bill read from a held start. Report held step, pay and supplies, never a single score.
- **Wave 3 is bigger than 17 says.** About 40 engine pieces across 15, 16 and 17 together. Split it: the bar metrics and block first, then the statuses, then triggers and auras.
- **Walk-through owed:** 17's Shield walk-through checks out step by step against its own node table. But at Level 9 the suggestion skips Guarding Challenge for being party only, when the company joins at Level 5 (02 package 8). The suggested road should read the hero's plan, not assume solo.
