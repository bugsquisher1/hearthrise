# 02. Fresh system architecture

Written 2026-11-21 on `lane/rd-vision`. Docs only. This is deliverable 3 of the reset request of 2026-11-21: how the major systems would be designed if we started today. Read `01-identity.md` first. Every package is a proposal for review. Nothing here is final, and every number is a hypothesis for the math lane to test.

**Labels.** EVIDENCE (seen in play or code, with its source). MEASURED (an engine run, with its run). JUDGMENT (a design opinion). SPECULATIVE (a guess worth testing). HISTORICAL (an older decision, a record and not a rule). Unless a line says otherwise, a recommended design is JUDGMENT.

**Names.** Danger, stance, Careful, Steady, Bold, Trait, Signature, carry-over, company and hall are working names. They go through the naming and voice pass before any player sees them.

**Cost sizes.** S is a data or screen change. M is one lane. L is several lanes or an engine batch. XL is a new server surface with its own review. All are JUDGMENT.

## 0. The shape in one screen

Nine packages, and three shared parts that hold them together.

| Shared part | What it is | Who uses it |
|---|---|---|
| **The power step** | One unit of power on one scale. A Level, a gear tier, a Danger step and a price all count in steps | Every package. The math lane defines it |
| **The rule table** | One table of rows that say what changes, by how much, and when. The "when" uses the action bar's own conditions | Moves, Traits, Signatures, imbuements, monster rules, ground rules, events |
| **The company plan** | One server object for the account: heroes, rows, bars, ground, stance, supply rules, loot rules, town work. One Start runs it | The first hour, every hunt, the return card, hiring, copying a build |

| # | Package | The one-line design |
|---|---|---|
| 1 | Combat and skills | Styles differ by job. The bar is the build. Two defenses, no immunities, healing and mana are counted |
| 2 | Equipment and progression | Plain gear is the floor. Rare gear rolls a Trait, a rule and not a number. The rarest has a Signature |
| 3 | Hunting and monsters | One Danger scale. The party climbs it by itself inside a stance, and falls back before it dies |
| 4 | Party | Monsters reach the whole party. Loot is personal. A good four beats its heroes apart in XP and gold |
| 5 | Economy and crafting | Eight trades owned by the company, each with a hunting buyer. Drops give the item, trades improve it and keep it running |
| 6 | Long-term progression | A Level is one step forever. Depth has no top. Records, bestiary, trades, hall |
| 7 | Social and endgame | A town worth standing in, a hire board, clans with one shared project, halls, world boss, the Tower |
| 8 | The first hour | One hero, hunting inside two minutes, the company arrives as one step at Level 5 |
| 9 | Away and return | The plan runs the day. The return card asks at most three things. One press carries on |

## 1. Combat and skills

**1. Recommended design.**

- **Four combat skills trained by use, plus Level.** Melee, Ranged, Magic and Defense. A hero is what they use. Level gives health, mana and carrying room. A skill gives accuracy and damage with that style. (HISTORICAL shape, kept as core)
- **Six jobs, one for each weapon family.** A weapon family is best at one problem. Hold the front (sword and shield). Break a wind-up or a shield (hammer). Cut a crowd (axe or two-hander). Pick a target in the back row (bow). Burst an area (wand). Mend and shield (staff). The exact families are a sample to play, not a list to lock.
- **The bar is the build.** Moves are learned from skill Levels. A hero knows more moves than the bar holds. Bar slots open with Level. The choice of which moves to slot, in which order and on which condition is the hero's build. There is no separate talent tree.
- **Two defenses.** Armor against physical blows and ward against magic, on heroes and on monsters alike. Both work on a ratio, so a point of defense is worth something at every Level and never reaches a wall. A small set of damage types with resistances as percents. No immunity.
- **Healing and mana are counted.** Every hunt records healing by source, damage taken by hero, mana spent and supplies used. Sustain is a budget the player can read.
- **Monsters wind up.** A dangerous blow has a short wind-up state that a bar condition can see. A hero can answer with a guard, a stagger or a heal held for it. This is the main way a good bar beats a lazy one.
- **Death costs Level XP and skill progress, and Blessings cut the cost.** But a fall back comes first (package 3), so a death is the price of a risk the player took.

**2. Why it is better.** The target is a game where each style has a reason to be in the party and each stat can be felt. EVIDENCE that the pieces it replaces fail that target: armor past Level 30 was worth nothing at any band size (`12-balance-pass.md` section 0). A shield front and a hammer front held alike once both hit the armor cap (section 4.1). The fastest Talent build was at most 2.2% faster than the suggested one (section 0). One playtester reported one style ahead on damage on every ground, and best supplies as the only sane pick (2026-11-16). Nothing reads healing or mana today (`03-targets.md` section 0).

**3. What it replaces.** TAL-1 and chapter 10 (a build choice every five Levels as stat tracks). D-9's four losing-party unlocks, which become ordinary moves and Traits. Inner Flame as a fifth combat skill (2026-10-25). CORE-4's protection rating row. The armor cap behind tension K-4. Kept: classless heroes (2026-10-15), skills by use, no immunity (2026-11-06), death costs and Blessings as a shape.

**4. How it interacts.** Jobs only matter because monsters have roles (package 3). Traits and Signatures are written in the bar's conditions (package 2). The party package needs damage to reach the back row or two of four skills are dead. The report (package 9) reads the sustain counters.

**5. Alternatives considered.** (a) Fixed classes. Clearer roles, but it throws away "you are what you use" and makes four heroes four locked picks. (b) Keep stat-line Talents. Measured as too small to feel away from the edge. (c) One Level and no skills. Simpler, but it removes the long commitment that makes a hero yours. (d) Many elements with strong and weak pairs. More to learn for one decision made once per ground. A small set of types is enough.

**6. Balance implications.** Damage, defense and sustain must each move depth held by a readable amount. The math lane needs targets for: the share of pace each job adds on a ground built for it and on one that is not, no lineup that wins every ground (STYLE-3 has no reader today), and a front hero's share of damage taken. A move's cost in mana or charges is a lever beside its size and cooldown.

**7. Cost.** L. The bar, conditions and moves exist. New: the wind-up state in the engine and in conditions, the ratio defenses, the sustain counters, a wider move list. Removing Talents and Inner Flame is S.

**8. Open questions.** Is six jobs right, or five? Can a wind-up be read at the engine's 100 ms step without raising server cost? How many bar slots at Level 1, 50 and 200? Does skill loss on death still earn its place once fall back exists? All four need a played sample before anything is locked.

## 2. Equipment and progression

This package carries the owner's confirmed requirement of 2026-11-21: gear may use randomness where it creates decisions, "+x percent" alone is dull, and a rare drop must be a moment. Older rulings for fixed stats on every item are superseded.

**1. Recommended design.** A piece of gear has up to five parts, and each part has one job.

| Part | Where it comes from | Random? | Its job |
|---|---|---|---|
| **Base** | Drops, with a home the player can learn | No. Fixed by type and tier | The floor. A plain upgrade is better in every way and is worn without asking |
| **Trait** | Rolled by the server when a Rare piece drops, or when a crafter makes jewelry or a cloak | Yes. Which Trait, and a rank of 1 to 3 | A rule that suits some heroes and grounds and not others. This is the decision |
| **Signature** | Hand-made, on a small set of named pieces, each with one home | No | Changes how one move works. This is the story |
| **Temper** | A smith, for materials and gold | No | The steady upgrade. It carries up when the piece is replaced |
| **Imbuement** | Made from monster parts, lasts a set number of hunted hours | No | The piece of the kit you change for the ground |

- **A Trait is a rule, not a number.** It is one row of the rule table, in words the bar already uses. Examples of the kind, not a final list: your first hit on a full-health target hits harder. After you block, your next strike staggers. Your heals leave a small shield. Your area spells reach one more target but cost more. While nobody in the party is under half health, you gain mana faster.
- **Why there is no one best roll.** Six rules hold it. (1) Every Trait of a rank has the same power budget, measured on the ground and seat that suit it best. (2) Traits answer monster roles, so the best Trait changes with the ground. (3) Traits are tied to a job, so a front hero's best roll is nothing to a healer. (4) Party-wide Traits do not stack, so a four wants four different ones. (5) Some Traits are trades, with a gain and a cost. (6) Rank is a small range, so which Trait matters more than how high. The math lane holds a target for it: no Trait is the top pick in more than a set share of ground and seat cells.
- **Where a Trait can roll is knowledge.** A monster family has its own Trait pool, and the bestiary shows it once the page is far enough along. Chasing a Trait means choosing a ground.
- **Carry-over.** A smith can move one Trait from an old piece to a new base of the same slot. The old piece is destroyed. A great roll can stay with a hero for life, old gear always has a buyer, and Smithing always has work.
- **No reroll for gold.** A reroll button turns every Trait into a slot machine with one right answer. Trading and carry-over are the ways to fix a bad roll.
- **Gear trades.** Every piece can be sold to another player. A piece with a Trait is listed as itself, not as a stack.
- **The moment.** A Trait drop gets its own line on the return card. A Signature drop gets a reveal, a line in the town, a mark on the hall, and a card the player can share.

**2. Why it is better.** The target is gear that asks "is this better for this hero, on this ground?" and rare drops that are stories. A fixed line of bigger numbers can only ask "is the number higher?", and the server can answer that without the player. EVIDENCE that players feel the gap: a playtester called two neighboring grounds "essentially the same" because their drops were the same kind of step (2026-11-16). EVIDENCE that the layers under it cannot be felt: best gear is 2% faster for a four on the easy tier (tension K-10), and jewelry reads 2% of a kit at Level 400 (tension K-5).

**3. What it replaces.** "Gear has fixed stats and gets better only through upgrades" (2026-10-14), superseded by the owner on 2026-11-21. GR-4's +17% band as the main reason to want a piece. Special attributes (2026-11-14), jewelry perks (23-5), glyphs and the Luck bar as separate systems, all folded into Traits and the bestiary. GR-38's fixed jewelry share. Kept: gear drops and a bench makes none (2026-11-18), every piece trades (2026-10-23), Tempering carries up (23-2), a unique keeps its property up a band (31-4), Rare and Very Rare as truly rare (2026-10-14), gear gated by hero Level only (2026-10-24).

**4. How it interacts.** Traits use the bar's conditions, so combat needs no new math (package 1). Trait pools belong to monster families (package 3) and show in the bestiary (package 6). Carry-over and Tempering are Smithing's standing work, and crafted jewelry and cloaks roll Traits, so crafters share the excitement (package 5). Loot rules keep every Trait piece and the return card shows them (package 9). On the server a Trait piece is one row: its base, its Trait and rank, and the kill that made it. The server rolls it inside the hunt's settle, owns it and journals it. The client never sends or changes a roll. Plain gear stays a stack, so storage grows only with rare drops.

**5. Alternatives considered.**

| Shape | For | Against | Verdict |
|---|---|---|---|
| Number ranges on every stat | Cheap. Every drop differs | It is "+x percent" with extra steps. One best roll, the top of every range | Rejected |
| A pool of flat stat affixes | Familiar from loot games | Players solve the best set once, then every drop is junk or the same chase | Rejected as the main shape |
| Fixed named uniques only | Hand-made, exciting, no bad rolls | Few of them, so most drops stay dull. No surprise | Kept as Signatures, not alone |
| Rolled sockets | Adds choice without new stats | The best roll is always "most sockets" | Rejected |
| **Rule Traits from a source pool, plus Signatures** | Decisions on most rare drops. No single best. Uses the table we already need | More text to write well. Needs a dominance check in the simulator | **Recommended** |

**6. Balance implications.** Base power moves on the power step, so one tier is worth the same share of depth at Level 20 and at Level 400, which removes tension K-9. A Trait's budget is a fixed fraction of a tier. Carry-over's price and the Temper ladder are the two largest gear sinks. Drop rates decide how many Trait pieces exist, which decides market prices. The math lane needs a reader for Trait dominance and one for rare drop timing (DROP-2 and DROP-4 have none today).

**7. Cost.** XL. New: item rows for Trait pieces, the roll inside the settle, market listings for single pieces, the carry-over bench, loot rules that read Traits, and about 30 well-written Traits to start. It is a money and trade surface and needs its security review. Folding four old layers into it removes screens and text.

**8. Open questions.** How many Traits can a player hold in their head: one a piece, or two on the rarest? Does carry-over make later drops dull, or does each new region's pool keep them fresh? Should a crafter be able to aim a jewelry roll at a cost? What share of rare drops should carry a Trait? Start with a sample of five Traits on one ground, played and read, before any pool is written.

## 3. Hunting and monsters

**1. Recommended design.**

- **One Danger scale.** A Danger step is one power step of monster strength and pay. Step 40 means the same strength on any ground. A ground covers a band of steps, and bands overlap so a company always has at least three grounds that fit.
- **The party climbs by itself.** A hunt starts at a step the company has held before. After a run of clean pulls it goes one deeper. When the plan is failing it falls back one step and steadies. The player does not pick a difficulty by hand and does not re-pick it every few Levels.
- **The stance is the risk choice.** Careful falls back early and should never die. Steady is the default. Bold holds on until a hero is nearly down, earns the most, and deaths happen. The stance is set once in the plan.
- **Depth pays, in everything.** Level XP, coin and loot quality all rise with the step, and they rise faster than monster health does. So pushing deeper is worth it, and damage, defense and sustain each move the result.
- **Kills are not capped by the room.** The next pull comes when the party is ready. Pace is set by the company, not by a respawn timer.
- **Six monster roles.** Brute hits the front. Shooter picks the back row. Caster hits an area. Swarm comes in numbers. Stalker dives the weakest hero. Warder shields or heals its side. A ground is a mix of roles, and the mix is the question the ground asks.
- **A ground has one cast, one mix, one rule at most, and its own drops.** A ground rule is a row in the rule table from a short shared list. No ground has its own math.
- **A boss is a bar check.** It has phases, wind-ups and helpers, and it is beaten by answering them. It is never a health bar against a clock.

**2. Why it is better.** The target is a hunt that can tell a good plan from a bad one on a slope, and shows every bit of power. MEASURED on the design it replaces: a four on the easy tier is held by the respawn, and a planted +100% damage moved its pace only 0.8 to 8.7% (`review/10-designer-d9-halls.md`, row FB-3). The harder tiers are a cliff, safe or wiped, and one table of blow and pull cannot hold a death count on every ground (tensions K-1 and K-2). When the front falls the rest die in the same hunt in 121 of 129 cases (tension K-13). A health-only hall sorts parties by damage alone and rewards four damage dealers (GR-30's verdict in the same file). EVIDENCE from play: a party far under a ground's Level on the top tier was the best choice, and the lower tiers were "too easy" (playtest, 2026-11-06).

**3. What it replaces.** Normal, Dangerous and Deadly as three hand-picked tiers (CORE-1, GR-27, LR-3). The death counts by tier and what they mean (S-6, S-12 a). The fixed respawn as the pace cap. The Blessing ladder's threshold as a way to price tier risk (S-5, D-4). Scaled early hunts as a separate system (2026-11-07). GR-30's hall number on health and clock. "One pack on Normal for every party size" (2026-11-11). Kept: instanced hunts, no hunt starts by itself (27-1), a hunt works the same for one hero or four (2026-11-13), balance at the formula layer with no per-ground dial (LR-1), drops with a home.

**4. How it interacts.** The step is the shared unit for Level, gear and prices (package 6). Roles are why jobs and rows matter (packages 1 and 4). Coin scaling with depth is what makes the economy's faucet follow effort (package 5). The report shows the deepest step held and each fall back's cause (package 9). The Tower is a ground whose band has no top (package 7). In the engine the step is read for each pull inside the existing settle, so a hunt costs the server the same whether it climbs or not.

**5. Alternatives considered.** (a) Keep three tiers and add a party-wide damage pulse. It softens the cliff but leaves the hand-picked dial and the respawn cap. (b) Many tiers picked by hand. A slope, but the player re-picks it every few Levels, which is a repeated decision. (c) Auto-climb with no stance. Removes the risk choice, which is one of the few real ones. (d) No death at all. Simpler, but death as a price for greed is part of the tone.

**6. Balance implications.** This package changes what balance means. The main output of a hunt is the step held and the pace at that step, not a kill count against a respawn. The math lane needs: how much pay grows per step against how much health and threat grow, the fall back triggers for each stance, a target front-hero share of damage, a death rate for each stance, and a check that Bold is not always best when left alone. Gold targets can be set on the same curve as XP.

**7. Cost.** L, in one engine batch. The tier table already scales pull, blow, health and pay. New: steps in place of three rows, the climb and fall back inside the sim, pulls on readiness, role targeting, wind-ups. Monster data gains a role and loses most hand-set stats, which the step supplies. Grounds are re-cut as bands.

**8. Open questions.** How big is one step so that a climb feels steady and not jumpy? How fast should a hunt climb back after a fall? Does a company park at its best step, or re-find it each hunt? Does pulling on readiness raise server load for strong parties? Is "Danger 40" clearer to a new player than a named tier? Each needs the simulator and then a played ground.

## 4. Party

**1. Recommended design.**

- **Up to four heroes in a hunt, in two rows.** Front and back are set in the plan. Brutes go for the front. Shooters, Casters and Stalkers reach the back.
- **Own heroes party with no invite.** One plan and one Start for the company.
- **Loot is personal.** Each hero rolls their own drops from the kills they took part in. Nothing is split by a roll and nobody waits a turn for a Rare.
- **XP and coin use one rule.** A kill pays by its step. The party shares it evenly. Because a good four holds a much deeper step than its heroes apart, each hero earns more in the four, in XP and in gold.
- **A lower hero catches up.** A hero below the party's top Level earns faster until close. A new recruit or a retrained hero is not a second grind.
- **Mixed parties.** Heroes from different accounts fill one four on the same rules. A shared supply bill is agreed once and remembered.
- **Hired heroes.** A player can put a resting hero out for hire. Another player adds them to a hunt. The hero's owner gets a cut and risks nothing.
- **Party-wide Traits and moves do not stack.** Four different heroes beat four of the same.

**2. Why it is better.** The target is a party where every seat matters and joining up is plainly better. MEASURED on what it replaces: one front hero takes 92 to 100% of a four's damage on nine of fourteen grounds, so three heroes' armor and Defense do nothing (`12-balance-pass.md` section 4.1). A four earns each hero 1.4 to 2.6 times the XP but only 0.53 to 0.77 of the gold (tension K-8). EVIDENCE from play: forming a party of your own heroes took a typed name or a hidden right-click, and the leader was whoever was on screen (`02-four-hero-hour.md`).

**3. What it replaces.** Party pay as XP only by a size table (LR-5, GR-3, S-10). Coin that never scales with a tier (LR-3). Party loot split by gold value and a Rare by turn (2026-10-14). D-10's ruling against party-wide damage. "The rest hunt on" as the answer to a wipe (S-14 a), because a fall back comes first. Kept: four at most (2026-10-15), own heroes join at once (2026-10-19), any mix of roles is allowed, on-call heroes (S-1, CH11-1), the shared supply bill (25-8), eight heroes in a hall (25-11).

**4. How it interacts.** Rows only work with monster roles (package 3). Personal loot is what lets Trait pieces drop without arguments (package 2). The hire board is the social entry to parties (package 7). Catch-up makes a late recruit painless in the first hour (package 8).

**5. Alternatives considered.** (a) A party bonus as a flat percent by size. Simple, but it is a number that says "group up" in place of a reason to. (b) Bigger monsters for bigger parties. The Danger scale already does this without a special rule. (c) A bonus only for players from different accounts. It pays people to make second accounts. (d) Shared loot with need or greed. Slow and sour for an idle game.

**6. Balance implications.** Targets for the math lane: a well-built four holds a set number of steps deeper than its best lone hero, each hero in it earns more than alone in both XP and gold, no lineup wins every ground, and four of one style clearly loses to a mixed four at the same Level. Personal loot multiplies drops by seats, so drop rates are set per hero. The catch-up rate must not let a high hero carry a new one faster than the fastest fair path.

**7. Cost.** M to L. Rows and personal loot touch the engine and the loot write. Hired heroes are a new shared surface with a ledger. Own-hero partying is mostly built.

**8. Open questions.** Is two rows enough, or does position need more? Does personal loot flood the market with plain gear? What cut makes hiring worth it for both sides? Should heroes of very different Levels be allowed in one hunt at all?

## 5. Economy and crafting

**1. Recommended design.**

- **One law.** Drops give the item. Trades improve it and keep it running.
- **Eight trades, owned by the company, capped at 99.** Any resting hero works a trade, and the XP goes to the company's one Level in it. Four gather: Mining, Woodcutting, Fishing, Farming. Four make: Cooking (food and drinks), Runecrafting (runes and imbuements), Smithing (ammunition, Tempering, carry-over), Crafting (jewelry and cloaks, which roll Traits).
- **Every trade has a hunting buyer that keeps needing it.** Food and drinks are eaten. Runes and arrows are spent. Imbuements run out. Tempering and carry-over burn materials and old gear.
- **Supplies are a real choice.** Better supplies let a company hold deeper and cost more. Prices sit so that the best gold per hour and the best XP per hour are at different depths. "Levels or gold tonight?" is a standing choice.
- **The store sells the basics only, at a ceiling price.** Anything better is made by players. The store is the price anchor, not the supplier.
- **Monster parts cross grounds.** Parts from one ground make imbuements wanted on another.
- **A market for everything that trades.** Stacks sell as stacks, Trait pieces sell as single listings, with a tax as a sink.
- **Sinks scale with wealth.** Tempering, carry-over, the hall, Blessings, the market tax.
- **Crowns and anything about real money are the owner's calls.** This design assumes nothing about them and marks them open.

**2. Why it is better.** The target is an economy where gold and goods leave as fast as they arrive, and making things is a path of its own. EVIDENCE: real heroes spent 1.57 town hours per hunted hour, 1,649 gathering and 526 crafting against 1,382 hunting, so half of play is here already (`calibration/c4.json`). The same file shows Runecrafting at 37 hero-hours and Inner Flame at 16 while the runes it would make were the strongest supply in the game, which says the store, not players, was the supplier. A new mage lost 105 gold in the first 16 minutes while the others gained (`02-four-hero-hour.md`). Best runes paid for themselves, so they were never a choice (playtest, 2026-11-16). Gold in the tool is still only an upper bound until a wage formula exists (HC-5).

**3. What it replaces.** Trade skills on each hero. Inner Flame and the fuel recipes as a skill. Store-sold higher supplies. Typed upgrade prices that read 0.18 of a band's gold against a wish for 1.2 to 1.4 (tension K-6, S-19). The Luck rivets. Linings and salts curing in House slots as their own loop (2026-11-18), folded into imbuements. Kept: the self-supply rule, every item has a source and a use, loot rules per item (2026-10-14), a wage formula as the source of prices (GR-51), the market open on day one.

**4. How it interacts.** Depth-scaled coin is the faucet (package 3). Traits and carry-over are the top-end demand (package 2). The hall is where trades are worked and stored (package 6). The plan holds the supply and loot rules so nothing is re-chosen (package 9). On the server every faucet and sink is an RPC with a server catalogue and a ledger row, as today.

**5. Alternatives considered.** (a) Trades on each hero. Four times the grind for the same decision, and the first principle forbids it. (b) Crafted gear as the main source. It makes crafters central but takes the drop out of the hunt. (c) Fewer trades. Tempting, but each of the eight has a clear buyer once Inner Flame is gone, and trades to 99 are a long chase players know. (d) No store. Purer, but a new player with no market needs a floor.

**6. Balance implications.** The wage formula becomes the anchor: what an hour of a hero's time is worth at a step, hunting or working. Every price reads from it. Targets for the math lane: supply cost as a share of income at each stance, gold per hour for a trade hour against a hunt hour, upgrade prices as a share of what a band earns, and total sinks against total faucets at the account level. All are hypotheses until the wage exists.

**7. Cost.** L. Company-owned trades change where skill XP is stored and how the town screens read. Cutting store tiers and Inner Flame is S. Market listings for single pieces come with package 2. Prices are regenerated from the wage, not typed.

**8. Open questions.** Is eight trades too many for a new player to meet in the first week? Should a hero have a best trade, or is a worker a worker? How long should an imbuement last? What tax keeps the market healthy? What should bones become once the hearth skill is gone?

## 6. Long-term progression

**1. Recommended design.**

- **A Level is one power step, forever.** Hero power, monster power, gear tiers and prices all grow by a fixed ratio per step. Nothing drifts apart at Level 150 or 1,500.
- **Level has no cap, and depth has no top.** The last region and the Tower extend by formula.
- **A steady beat of unlocks.** Every few Levels opens something to choose: a ground, a bar slot, a move. Past the last hand-made unlock, a new step of depth is the reward.
- **Company records.** The deepest step held on each ground, by stance. They are kept, shown in the hall and ranked.
- **The bestiary, for the account.** Kills fill a page. Stages reveal the monster's role, its drops with rates, and its Trait pool. The last stage gives a small boost to its rare chance and a trophy for the hall. It gives no damage.
- **The hall.** The company's home: storage, benches for the trades, farm plots, a trophy wall, and a door other players can walk through. It gives no combat power.
- **Blessings.** One simple price that grows with Level. Safety is a gold sink, not a puzzle.
- **Game modes later.** Ironman and Hardcore rules as server flags, after launch.

**2. Why it is better.** The target is a Level 900 that feels as earned as Level 90 and a reason to hunt somewhere new. EVIDENCE: on a straight-line gear curve a +17% step and a 15 to 25 Level gap cannot both hold past about Level 150 (tension K-9). Nothing reads past Level 400 today (LONG-1, LONG-2). A playtester climbed 182 Tower floors in 52 minutes and said floors 100 to 170 "felt the same" (2026-11-18), which is what a curve does when its steps are not one unit.

**3. What it replaces.** GR-6's Level law as a table fitted at two points, and the seat multiples under it (S-11 c, tension K-7). Bestiary trophies and charms as damage multipliers. The Luck bar's hours. Room perks. The Blessing ladder (S-5, GR-7). Titles, the chronicle and the honor roll as three separate records. Factions and their skills (2026-11-14), paused because they fail the purpose test today. Kept: uncapped Level, Level 200 as a big deal, trades at 99, the home as a showcase others can visit (2026-10-14), modes after launch (2026-08-18).

**4. How it interacts.** The step is defined by the math lane and used by packages 2, 3 and 5. Records feed the social ladders (package 7). The bestiary is where Trait pools are learned (package 2). The hall is where the trades live (package 5).

**5. Alternatives considered.** (a) A Level cap with resets or prestige. It gives a clean endgame but breaks "a hero is yours forever". (b) A talent tree for long-term choice. Measured as too small to feel, and the bar already holds that choice. (c) Bestiary damage bonuses. They make a known ground stronger than a new one, which punishes moving on.

**6. Balance implications.** The math lane picks the step ratio and the hours per Level at each point. With one unit, a target can be stated once: for example, a hunted hour at the right step is worth a fixed number of steps of progress at every Level. The pace of hand-made unlocks against formula depth decides when the game starts to feel thin, so it needs a target of its own.

**7. Cost.** M. Most of it is curves and data. Records are a new ranked surface with a server write. Merging the three record systems and removing damage from the bestiary are S each.

**8. Open questions.** How many hours should a Level take at 50, 200 and 1,000? Is formula depth enough between regions, or does each band need a hand-made beat? Does the hall need upkeep or only build costs? Do factions come back once there is a reason for two sides?

## 7. Social and endgame

**1. Recommended design.**

- **Towns in shards.** A bounded number of players per town, visible and busy. Working heroes are seen at their benches.
- **Chat.** Global, clan, party and whispers.
- **The hire board is the party finder.** In an idle game few people are free at the same minute. Hiring a resting hero lets players help each other across time zones.
- **Clans with one shared project.** A roster, a chat tab, and one clan hall that grows from members' work. It pays in things to make and show, not in combat power.
- **Halls.** Boss rooms for four or for eight, built as bar checks, with Signature drops.
- **The world boss.** One shard-wide fight a week. Every company adds to it and is paid by what it added.
- **The Tower.** The uncapped Danger scale as a weekly climb with its own chest.
- **Ladders.** Deepest step by ground, Tower floor, first kills. A ranked entry shows the company's bars so others can copy them.
- **Events are rules.** A week's event is a row in the rule table on a ground or a region. It makes an old ground new for a week.
- **Heroes do not fight heroes at launch.**

**2. Why it is better.** The target is a world that feels shared by players who are rarely online together. EVIDENCE: the hook named from the start was a living town with other players on screen (owner note, 2026-08-23). A playtester's best moments were a hall boss and a Tower run (2026-11-18). Heroes cannot fight heroes in the engine, where sides are fixed in 93 places (FB-3's engine test), so arenas are a large build with nothing proven. A health-only world boss or hall is decided by the clock (GR-30's verdict).

**3. What it replaces.** Two PvP arenas with seasons and a gear line (2026-11-21, MM-41), moved to `03-opportunities.md` as a later bet. The full castle of five buildings and ten levels over a year (S-7), shrunk to one project until clans are seen to use it. The clan Library's standing Level XP bonus (S-4). Champions and called bosses as separate systems, folded into halls and events. Kept: shards (2026-10-14), no Local tab and no live party finder (S-2), one clan per account (25-7), eight in a hall (25-11), events capped and never two at once (27-5), the world boss as a sample of one (D-6).

**4. How it interacts.** Hiring is package 4's rule with a board. Halls and the Tower use package 3's bosses and scale. Ladders read package 6's records and show package 9's plans. Events use the rule table. Every shared surface is a server write with a ledger.

**5. Alternatives considered.** (a) Build PvP first as the endgame. It is what the genre's fans expect, but the engine cannot do it and an automated duel needs its own design. (b) The big castle now. It is a year of sinks before we know clans form. (c) A live party finder. Few players are online together in an idle game, and it was already turned down.

**6. Balance implications.** Clan and event rewards must not be combat power a lone company cannot get, or they become a tax. Hall and Tower drops set the top of the gear chase. World boss pay by share added must not reward only the strongest. Halls have no reader today (SURV-15 to SURV-17).

**7. Cost.** The cheap layer (chat, roster, presence, calendar) is M and partly built. The hire board is L. Halls as bar checks ride on package 1's wind-ups. Ladders are M.

**8. Open questions.** How many players make a town feel alive without costing too much to serve? What does a clan do together in the first week? Is a weekly world boss enough of a shared beat? Is there a form of player-against-player play that fits automated combat?

## 8. The first hour

**1. Recommended design.** One hero first, then the company as one step.

| Beat | What happens | What it teaches |
|---|---|---|
| Minute 0 | Make one hero. Pick how they fight from a few cards. The pick wears the whole starter set | Your first decision is your style |
| Minute 1 to 2 | Land in town. The first task is already taken. One press goes to the first hunt | Hunting is one press away |
| Minute 2 to 15 | The first ground. The first plain upgrade drops and is worn by itself. The first Level opens a second move for the bar | Loot, the bar, Levels |
| About Level 5 | The first ground ends itself. "Build your party." Three recruits arrive pre-filled as front, healer and bow, in one press. They join near the first hero's Level | The company. Roles |
| Minute 20 to 50 | The first party ground on the Steady stance. The party climbs a step or two. The first fall back is explained by the report | Depth, stance, the report |
| First leave | "Safe to close. Come back in about 8 hours." | The idle promise, said out loud |
| First return | One card for the company. Totals, then at most three decisions, then Carry on | The daily rhythm |
| First town shift | The company works its first trades by itself and the card shows what was made | The other half of the day |

The tutorial runs once for the account. No tip ever points at something hidden. The first objective is never under another window.

**2. Why it is better.** EVIDENCE, all from the played hour (`02-four-hero-hour.md`): hunting inside two minutes worked and should be kept. Making heroes two to four by hand took about 12 presses each and restarted the tutorial each time. A new player could not pick a style without finding unnamed icons in the bag. The first tip pointed at a board hidden under Chat. The tank fought nine hours in no armor because nothing wore the drops. Nothing said it was safe to close. The party's first 20 minutes together was the best part of the hour.

**3. What it replaces.** "All four heroes from the start" as four slots on the first screen (GR-2), changed to four inside the first half hour by one press. GR-24, GR-79 and GR-80 are kept in spirit and re-timed. Every new hero starting with all six starter sets (2026-10-20), replaced by the style pick. Kept: the weapon pick wears the whole starter row and recruits come pre-filled (D-1), "Build your party", gear that gets worn (D-2).

**4. How it interacts.** It is the first use of the company plan (package 9), catch-up (package 4), auto-worn plain gear (package 2) and the climb (package 3). Each is introduced once, in the order a player needs it.

**5. Alternatives considered.** (a) Four heroes on the first screen. It shows the promise at once, but the played hour shows it turns a gift into work before the player knows what a hero is. (b) One hero for hours, with recruits as later rewards. Clean, but it hides the game's best part, the party, behind the first sitting. (c) No pick at creation. Played, and it cost three minutes in the bag.

**6. Balance implications.** The first ground must be safe on any style, and a caster's first hunt must not lose gold. Recruits joining near the first hero's Level is a grant the math lane and security must size. The first party ground needs a fall back in the first half hour that teaches without a death.

**7. Cost.** M. Much of it is the first-build fixes already planned. New: the recruit step, the style cards, the account-wide tutorial state.

**8. Open questions.** Is Level 5 the right moment for the company, or is it sooner? Does a new player want to name and style three recruits, or take them and change them later? A blind first-hour play by a stranger answers both. The walk-through of every step against real data is owed when the content for it exists, since this package names no item or monster.

## 9. Away and return

**1. Recommended design.**

- **The company plan.** One saved object on the server: who hunts, in which row, on which ground and stance, with which bars, supplies and loot rules, and what each hero works at in town after. Plans are free, named, and can be copied from another hero, another company or a ladder entry.
- **One Start.** It runs the plan for the whole company. No hunt starts without the player's press.
- **The hunting day.** Each hero has a day's hunting in them. When it is spent, or the hunt ends for another reason, the hero walks to their town work by the plan.
- **Rules do the chores.** Sell junk, bank the rest, restock from storage and then the store, wear plain upgrades, fall back before dying.
- **The report.** Every hunt ends with: the deepest step held, pace, gold in and out, and the reason it stopped. If the party fell back, it names the cause in plain words and the one change most likely to help.
- **One return card for the account.** Totals first. Then at most three things that need a decision, such as a Trait piece to look at, a hero ready for a new ground, or supplies that ran dry. Then Carry on, which starts the next day with one press.
- **Said out loud.** Before the first leave and on every Start: it is safe to close, and when to come back.

**2. Why it is better.** The target is a return that takes one press when nothing changed and offers a real choice when something did. EVIDENCE from the played hour: the return showed four hero cards in a column with no totals and nothing marked as needing the player. A pile of gear waited unseen. "Start again" was offered on a ground the hero had outgrown. Gear could only be worn in town, so an away company never improved. From the targets inventory: nothing says why a hunt ended (`03-targets.md` section 0).

**3. What it replaces.** Setup slots priced at 15,000 and 40,000 gold (S-3). A price on remembering a choice works against the first principle. The rested bank stays cut (S-9). Per-hero return cards. Kept: one plan, one Start and one return card (GR-80, GR-81, GR-84), the hunt report (GR-66), "equip upgrades for all four" (D-2), the rest plan and how it ends (D-11), no hunt starts by itself (27-1).

**4. How it interacts.** Every other package writes into the plan and reads from the report. The sustain counters come from package 1, the step and fall back from package 3, Trait drops from package 2, town work from package 5. On the server the plan is one row the Start intent reads, and the report is counters the settle already keeps or can keep at no extra statement.

**5. Alternatives considered.** (a) Hunts that restart by themselves forever. It is the purest idle game and it removes the reason to come back. It also breaks the mission line that a hunt needs a server-authorized start. (b) No hunting day, hunt until supplies or the bag run out. It turns the day into pure logistics and leaves no time for trades, and half of real play is trades. (c) A return screen per hero. Played, and it was four copies of one card.

**6. Balance implications.** The length of the hunting day sets every time number in the game, so it is the first thing the math lane fixes. The "12 hours a day" behind today's time numbers is HISTORICAL and should be re-argued, not assumed. The report's advice must be true, so it reads the same counters the simulator reads.

**7. Cost.** M. The plan, one Start and the return card are already in the first build. New: free plans and copying, the cause line in the report, wearing plain upgrades mid-hunt at a safe moment.

**8. Open questions.** How long is a hunting day, and is it the same for every hero? Should a company be able to bank an unused day? How much advice can the report give before it plays the game for the player? Does copying a top company's plan make everyone the same, or does gear keep them apart?

## 10. Every system in the review list

One verdict each. The reason is in the package named.

| System | Verdict | The short reason | Package |
|---|---|---|---|
| Combat styles | Redesign | Styles differ by job, one job a weapon family | 1 |
| Spells and moves | Redesign | Known moves outnumber bar slots, so the bar is the build | 1 |
| Skills | Keep four combat skills. Remove Inner Flame | By-use skills are identity. A hearth skill nobody trained is not | 1 |
| Equipment classes | Keep the slots. Redesign what a piece is | Base, Trait, Signature, Temper, Imbuement | 2 |
| Item progression | Redesign | One tier is one share of depth at every Level | 2, 6 |
| Imbuements | Keep, slim, and merge linings and salts into it | The part of the kit you change for the ground | 2, 5 |
| Crafting professions | Redesign | Eight trades, owned by the company, each with a hunting buyer | 5 |
| Consumables | Redesign | Three jobs: food, drinks, charges. Better ones are player-made | 5 |
| Hunting ground mechanics | Redesign | One Danger scale, climbed inside a stance | 3 |
| Monster mechanics | Redesign | Six roles, wind-ups, bosses as bar checks | 3 |
| Party systems | Redesign | Rows, personal loot, one pay rule, catch-up, hiring | 4 |
| Progression systems | Redesign. Remove Talents | A Level is one step. The bar holds the build | 1, 6 |
| Bestiary | Keep and merge charms into it | Knowledge and a rare-chance boost, no damage | 6 |
| Housing | Redesign | The company's hall: storage, benches, trophies. No combat power | 6 |
| Economy systems | Redesign | Depth-scaled faucet, a wage anchor, sinks that scale with wealth | 5 |
| Social systems | Keep the cheap layer. Introduce the hire board | A shared world for people rarely online together | 7 |
| Endgame features | Merge and re-order | Tower, halls, world boss and ladders on one scale. Arenas and the castle wait | 7 |
| Special attributes, jewelry perks, glyphs, Luck | Merge into Traits and the bestiary | Four layers doing one job | 2 |
| Companions | Remove from combat. Open whether they stay as looks | A fifth body in a four adds numbers and no decision | 2 |
| Stamina | Keep, as the hunting day | It gives the day its shape and gives trades their time | 9 |
| Blessings | Keep, simplify | One price that grows with Level | 6 |
| Training yard | Merge into town work | One more thing a resting hero can do | 5 |
| Factions | Pause | No decision and no plug today | 6 |
| Titles, chronicle, honor roll | Merge into records | One place for what a company has done | 6 |

Every cut and pause in this table is a proposal. Cuts are the owner's to approve.

## 11. The server and engine shape

The client never authors anything, so each package says what the server must hold. (JUDGMENT on shape. EVIDENCE that the base exists: one engine in `src/core/combat-sim.js`, the tier table in `src/data/hunt-tiers.js`, conditions in `src/data/condition-metrics.js`.)

| Need | Shape | New or changed |
|---|---|---|
| Danger steps | The step is read for each pull inside the one settle. Climb and fall back are engine states, viewed or not | Changed. Steps replace three tier rows |
| Monster roles and wind-ups | A role is a targeting rule in monster data. A wind-up is a unit state that conditions can read | New engine batch |
| The rule table | One table of rows: key, size, when. Loaded by the engine for moves, Traits, Signatures, imbuements, monster rules, ground rules, events | Extends the modifier table already planned |
| Sustain and cause counters | Healing by source, damage taken by hero, mana, supplies, end reason, deepest step, fall back causes, kept in the session row | New counters, no new statement if they fit the row |
| Trait pieces | One row for each piece: base, Trait, rank, the kill that made it. Rolled in the settle with the server's dice, journalled | New table, a money surface |
| Company trades | Trade Levels on the account, not the hero. Town work stays in closed form | Changed storage |
| The company plan | One row for each plan. The Start intent names a plan | Mostly planned already |
| Hire board, ladders, records | Shared surfaces, each written only by an RPC with a ledger row | New |
| Cost | A climbing hunt costs what a hunt costs now. Trait rows grow with rare drops only. Town work in closed form stays the main saving | To be measured |

Hunts must read the same viewed or closed, and every reading must come from the one engine (HC-2, HC-3).
