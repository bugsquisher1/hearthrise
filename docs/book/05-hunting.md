# 5. Hunting

Grounds, the Danger scale, depth, the Risk setting, monster roles, bosses, the hunting day, the report, the bestiary and Tamsin's tally.

---

## 5.1 How a hunt works
**[Unchanged]**

- A hunt is an instance: your party and the monsters of one ground. Nobody else is in it.
- The server plays every swing in small 100 ms beats and settles the result every 10 seconds, whether you watch or not.
- A **pull** is one group of monsters the party fights at once. A hunt is pull after pull, all day.
- When you leave a hunt, the leave lands about 34 seconds after you press it. The screen's look-ahead plays out first, so nobody can dodge a death by leaving.
- No hunt ever starts by itself.

## 5.2 The grounds
**[Unchanged]** for the grounds, **[Changed]** for how they're played

The world has three regions. Havora, the town, sits in Greenhaven.

| Ground | Region | Levels | Notes |
|---|---|---|---|
| Mill Cellar | Greenhaven | 1 to 8 | The first hunt. Ends itself at Level 5 |
| Meadowbrook Thicket | Greenhaven | 5 to 15 | Gray wolves. Old Grayjaw |
| The Sewer | Greenhaven | 5 to 25 | The first party ground. The Rat King |
| Wickstead | Greenhaven | 8 to 18 | A burned farm. Turncoats |
| Mosslight Glade | Greenhaven | 16 to 31 | Rook the Poacher |
| Coppercap Warrens | Greenhaven | 32 to 50 | Party ground (alone from Level 45). Chief Coppercap |
| Hask's Ford | Barrow March | 45 to 60 | Undead. The march's first ground |
| The Slake | Barrow March | 50 to 65 | Undead in the copper mud |
| Muster Barrows | Barrow March | 55 to 75 | Party ground. Captain Hask. First Traits |
| Pyre Field | Barrow March | 70 to 90 | Burned undead |
| Krell's Hold | Barrow March | 85 to 110 | Lord Krell's castle. His hall |

**Three old grounds are in doubt.** Bramble Edge, Goblin Warren and Ridge Camp are listed as open but have no walkable map. The R10 lane keeps or cuts each one.

**[Later patch] Four staged grounds** open when their art lands. Their bands are designed now so they arrive with no rebalance.

| Ground | Region | Levels |
|---|---|---|
| Carter's Rest | Morrow Hills | 110 to 125 |
| The Ox Road | Morrow Hills | 112 to 128 |
| Wyvern Roost | Morrow Hills | 125 to 142 |
| Unmarked Catacombs (two wings) | Greenhaven, under Havora | 165 to 185 |

Every monster on every ground is in chapter 15.

## 5.3 The Danger scale
**[New in 0.3]**

The three hand-picked tiers (Normal, Dangerous, Deadly) are gone. Every ground now has **one scale of depth**.

- **Depth runs 1 to 20 on every ground.** The screen says "Depth 7 of 20". You never see the raw numbers underneath.
- **Deeper means harder and richer.** Each depth makes the monsters tougher and hit harder, and some of that comes as more monsters in each pull.
- **Under the hood,** depth is made of small Danger steps. One step is one Level's worth of strength. A depth on Muster Barrows is about 11 or 12 steps.
- **Every ground has a top.** When your party holds the top depth for an hour, the ground is outgrown and the return card says so. The next ground's floor sits just under this one's top, so there's always somewhere to go.
- **A ground's gear is fixed.** The plain gear a ground drops is always the same tier. Depth improves your Rare odds and Trait ranks, never the base numbers.

**How it plays:**
1. A hunt starts at a depth your party has held before. Your first hunt on a ground starts at its floor.
2. After **two clean pulls** in a row, the party goes one deeper. The next climb after that goes twice as far, up to a cap, so a strong party finds its edge in the first hours.
3. A pull that isn't clean puts the climb back to small steps.
4. When the plan is failing, the party **falls back** about a depth and a half and steadies. For ten pulls after that it doesn't climb.
5. Your party ends up hunting right at the edge of what it can hold, all day.

Tyler on this model (2026-11-22): "i genuinely love it".

Not final: only Muster Barrows is on the scale today. Every open ground moves onto it, and the old tier screens are deleted, in lane R10. Hask's Ford and the two Catacomb wings have scale rows already but aren't live.

## 5.4 The Risk setting
**[New in 0.3]**

You pick one Risk setting in your plan. That's the only difficulty choice in the game.

| Risk | Falls back when a hero drops under | Counts a pull as clean when everyone stays over | Can heroes die? | Pays |
|---|---|---|---|---|
| **Careful** | 45% health | 65% | No | 55 to 70% of what Steady pays |
| **Steady** (default) | 25% | 45% | No | The normal rate |
| **Bold** | 12% | 30% | Yes | More while you watch. Less over a whole day, because deaths cost time |

- The fall back happens inside the pull, the moment a hero crosses the line. No monster swings again and the party breaks off.
- The hero holding the Challenge reads a lower line: 15% on Steady, 27% on Careful (chapter 4).
- After a death on Bold, the party plays Steady for the rest of that hunt.
- Your first hunts run on Steady and don't show the choice. You meet it at the Sewer.

The screen word "stance" was a working name. "Careful, Steady, Bold" is what players see. It's a different thing from the fight stance (Offensive, Balanced, Defensive).

## 5.5 Pulls wait for the party
**[New in 0.3]**

- The next pull starts only when every standing hero is at 80% health or more.
- A hurt party takes longer to be ready. So damage costs time before it costs a life.
- Food is what makes recovery fast (chapter 8).

## 5.6 Depth pays
**[New in 0.3]**

| What | How depth changes it |
|---|---|
| Level XP | A bit more for every depth held |
| Coin | A bit more for every depth held (it grows slower than XP, so gold doesn't race away) |
| Rare odds | Up to three times as likely at the deepest depths |
| Trait rank | Rank I from depth 1, rank II from depth 8, rank III from depth 15, as far as the ground allows |

So a better plan, better gear and a better build all show up as a deeper hold, and a deeper hold pays in everything.

Not final: coin by depth is still being checked (lane L10). In one test, holding much deeper didn't move gold the way it should.

## 5.7 Monster roles
**[New in 0.3]**

Every monster gets one of six roles. A ground is a mix of roles, and the mix is the question it asks your plan.

| Role | Who it hits | What answers it |
|---|---|---|
| **Brute** | The front row | Shields, armor |
| **Shooter** | The back row, from range | Challenge, back-row armor |
| **Caster** | The back row, with a small area | Focus fire, healing |
| **Swarm** | The front row, spreading out | Area damage, armor |
| **Stalker** | The hero with the lowest max health | Challenge, healing |
| **Warder** | The front row. Shields or heals its own side | Focus fire |

- Roles are why every seat in a party matters. Monsters reach the back row now.
- The bestiary page shows a monster's role.

Not final: roles are on Muster Barrows and Hask's Lookout only (lane C2 adds the rest). Caster and Warder have no monster yet. Until they do, every "while an enemy is casting" node, vow and Trait does nothing on the early grounds.

## 5.8 Monster spells and wind-ups
**[Unchanged]**, with more in wave 3

- Some monsters cast. A spell has a shape (a ring, a blast, a cone, a line), and many have a short wind-up first.
- The bar can see a monster casting and answer it.
- Some monsters heal their own pack.
- **Wave 3** adds wind-ups to plain blows too, and moves that end them (chapter 4). That's meant to become the main way a good bar beats a lazy one.

## 5.9 Bosses
**[Unchanged]**

| Boss | Where | Level |
|---|---|---|
| Old Grayjaw | Meadowbrook Thicket | 15 |
| The Rat King | The Sewer | 25 |
| Rook the Poacher | Mosslight Glade | 29 |
| Chief Coppercap | Coppercap Warrens | 52 |
| Captain Hask | Muster Barrows | 75 |
| Lord Krell | Krell's Hold, in his hall | 110 |

- Bosses turn up as a rare spawn on their ground.
- Some have phases: helpers join, or the boss gets angry and hits harder as it weakens.
- Chapter 15 lists the bosses of the staged grounds.

**[Changed] direction:** the redesign wants every boss to be a test of the bar (phases, wind-ups, helpers) and never a health bar against a clock.

## 5.10 Lord Krell's hall
**[Unchanged]**

- A boss room in Krell's Hold, opened with a **Hall Key**. The Gatekeeper on Krell's Hold drops them.
- One fight, 10 minutes to win.
- The hall's card suggests a bar: everyone eats under 75%, the healer casts Circle of Renewal when two are under 80%, and Greater Mend under 85%. A tank, a healer and two more.
- Lord Krell drops Dawnsteel gear and the **Hall Fire Wand** Signature.

Not final: the redesign plans halls for four or for eight heroes, built as bar checks.

## 5.11 Calling out a boss
**[Unchanged]**

- Beat the Rat King or Chief Coppercap enough times and you can **call him out** to his own hall.
- A called fight costs a little stamina (2 or 2.5 minutes) and no gold. It pays no XP or coin.
- One win earns a title: **the Sewerlord** or **the Slagbreaker**.
- Two pieces drop only there: the Kingstooth and the Cauldron Lid.

**[Changed] direction:** the redesign folds called bosses and champions into halls and events. Not final when.

## 5.12 The hunting day
**[Changed]**

- Each hero hunts **10 hours a day**. Premium makes it 12 (outside 0.3).
- When the day runs out, or the hunt ends for another reason, the hero walks home and goes to town work by the plan.
- **New: Hunting blocks.** A hero can buy 2 more hours with gold, **at most 2 blocks a day**. So the most anyone hunts is 14 hours a day, 16 with Premium. Each block costs more than the one before. Chapter 10 has the price.
- The old stamina refill (4 hours, up to 6 a day) is gone.
- A low-stamina alert shows at 60 minutes left.
- Time in town, training or away never spends hunting time.

## 5.13 Hunt settings
**[Unchanged]**

| Setting | Options | Default |
|---|---|---|
| Time limit | 1 to 24 hours, or none | None |
| Gold floor | Stop buying supplies under this much gold, 0 to 100,000 | 300 |
| When a supply runs out | Switch to the store's version, or end the hunt | Switch |
| Where supplies come from first | Your own stock, or the store | Your own |
| Stop rules | Up to 3 | None |

## 5.14 Why a hunt ends
**[Unchanged]**

| Reason | What the screen says |
|---|---|
| A hero died | "{name} died in {ground} and returned to town." |
| Ground outgrown | "Ground outgrown" |
| Out of healing food | "Out of healing food" |
| Out of arrows | "Out of {item}" |
| Out of runes | "Out of runes" |
| Out of gold for supplies | "Out of gold for supplies" |
| A stop rule | "Stop rule met" |
| Out of stamina | "Out of stamina" |
| Time limit | "Time limit reached: {n} h" |
| No hits for 10 minutes | "No hits: 10 min. Check weapon, ammo and action bar" |
| Boss beaten | "{name} beat him in {ground}. New title" |
| Boss or floor timer | "Time up before the boss went down" |

## 5.15 The report
**[New in 0.3]** for the cause line and the new readers

Every hunt ends with a report.

- The deepest depth held, pace, and gold in and out.
- **Why it stopped,** in plain words.
- **Every fall back, explained:** "Fell back: {name} at {pct}% to a {monster}".
- The one change most likely to help.
- **Healing by source:** "Healing: Greater Mend 61% · Mend 22% · Borrowed 17%".
- **Damage taken by seat:** "Damage taken: Front 58% · Back 42%".
- **Supplies by depth:** "Supplies: 11,200 an hour at Depth 12".
- Why a bar line waited (no mana, on cooldown, no stock, no target, out of range, short on gold, Level too low).

Not final: the three new readers (healing by source, damage by seat, supplies by depth) are lane RP.

## 5.16 Away and the return card
**[Unchanged]**, new lines in 0.3

- Close the game and your company keeps hunting until its day runs out, then works in town.
- When you come back: **one return card for the company**. Totals first, then at most three things that need you, then **Carry on**.
- Things that can need you: a ground outgrown, a hunt that can't start, a death, a gear choice, a near death, a fall back, a new ground open, Roads points or a vow, something you can build, recruits ready.
- **New lines in 0.3:** remains burned and Rare chance, Hunting block offer, Temper re-seated, imbuements applied, Rares per hero.

## 5.17 The bestiary
**[Changed]**

- Every monster you kill fills its page in the bestiary.
- Pages show what a monster drops, then the chances, as the page fills.
- **In the redesign** the stages also reveal the monster's role and its Trait pool, and the last stage gives a trophy for your house. It gives no damage and no luck.

**What exists today:**
- **Trophies:** 2,500 / 5,000 / 10,000 / 20,000 kills of one monster, each a tiny bonus against that monster (at most +1% damage and +3% drops).
- **Charms:** 25 / 100 / 500 / 2,000 kills of a monster family, a small bonus against that family (at most +3% damage and +3% drops).

Not final: the redesign removes the damage and drop bonuses (luck has one source now, the flame). The 0.3 plan doesn't say when the charms and trophy bonuses go. See the contradictions list.

## 5.18 Tamsin's tally
**[Unchanged]**

Tamsin Reeve, the Common's tally-keeper, pays you to clear monsters.

- Take a task at her board in town: kill a number of one monster on one ground.
- Hold up to **3** tasks per hero. She pays **3** a day.
- The server counts the kills, watched or not.
- She pays gold, plus her pick: the next Scarce armor piece from that ground in your hero's armor weight that she hasn't given you yet. Once you've had them all, she pays in that ground's crafting material.
- She skips a slot your hero already wears at that tier or better.
- There are 11 tasks today, each one monster on one ground.

## 5.19 Gathering on grounds
**[Changed]**

Grounds have trees, rocks and fishing spots on their maps. The redesign says **hunters no longer gather**. Gathering is town work for the company (chapter 9).

## 5.20 Scaled early hunts
**[Changed]**

Today a party can pay gold to scale an early ground up to its leader's Level (up to Level 110). The redesign replaces this with the Danger scale, which already scales every ground. Not final when the old screens go.

## 5.21 Choices you never repeat
**[New in 0.3]**

| Choice | Remembered by |
|---|---|
| Risk | Your plan, for every ground |
| Which depth to start at | The server starts at a depth you've held |
| Re-picking difficulty as you grow | Gone. The party climbs by itself |
| Moving on from an outgrown ground | The return card offers the next ground |
| Buying more hunting | A standing "buy up to N" rule |
