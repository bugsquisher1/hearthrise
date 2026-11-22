# 12. Targets, rulings and the plan from here

2026-11-22, `lane/r3-targets`, game designer. Tyler asked for this file. It is Approval C (the targets), the open calls from the build audit (`11-build-audit.md` section 2), the answer to his 11-22 question about moving on, dates, and the content still to write.

**Evidence used.** V1 and V2 on the real engine (`tools/balance-program/redesign/v1-climb.mjs`, `v2-stance.mjs`; numbers in `src/data/danger.js` and `.claude/coordination/HANDOFFS.md` 2026-11-22). They ran on Muster Barrows only, with one mixed four (hammer, bow, mage, healer) at Levels 60 to 70, on 2 to 8 seeds. Everything else here is a design call, marked as one. Every number is a starting value for the Balance Lab. Measured, judged and unplayed are kept apart.

---

## 1. Approval C: the targets, as a player feels them

Each target says what the player feels, the range it must land in, and the reader that checks it. "Measured" means V1 or V2 already read it. "Owed" means a probe still has to.

| # | What the player feels | Range | Reader | Today |
|---|---|---|---|---|
| C-1 | **My party finds its depth and stays there.** Leave a four on a ground and it climbs, then settles. It doesn't bounce up and down all day | Held depth moves less than 1 depth (about 11 steps) over the last 8 hours of a day | V1 held step per seed | Measured: Steady held 589 to 635 across 48 seed-days, spread about ±14 |
| C-2 | **Better heroes go deeper, and I can see it.** A few Levels or one gear tier visibly moves the depth held | +3 Levels or one gear tier moves the hold 1 to 3 depths | V1 "levels" and "weapon" cells | Measured for Levels (Level 70 held 614 against 590). The gear half waits for the power step (R4, R9) |
| C-3 | **On Careful or Steady my heroes don't die.** They pull back before it goes wrong | 0 deaths a party-day; a lone slip is under 1 in 50 party-days | V2 deaths by stance | Measured: 0 in 48 seed-days on each, after the trigger fix |
| C-4 | **Bold pays if I watch, and costs me if I leave it.** It is a choice, not the obvious best | Bold beats Steady in a 2 h watched session; Steady beats Bold over a 10 h day; Bold dies 0.3 to 1.5 times a party-day; no wipes | V2 | Measured: Bold beats Steady in 2 h sessions in 4 of 4 cells, loses over a day in 3 of 4, 0.4 to 1.1 deaths, 0 wipes. The fourth cell (weapon one band back) is a V2 lever, see 2.1 |
| C-5 | **Careful is the safe choice, not a punishment.** It pays less, but not so little that nobody picks it | Careful earns 0.55x to 0.70x of Steady an hour | V2 pay by stance, from a held start | Not met: 0.28x against 0.72x. Fixed by the pay floor in 2.1 and re-measured by R4 |
| C-6 | **A party of four is worth it.** Each head earns more in a four than the same heroes alone | 1.2x to 1.6x a head, in XP and in gold | V6 | Owed. Pay by depth is the lever, so the four's deeper hold is the bonus |
| C-7 | **A lone hero is slower but fair** (RD-Q7 a) | A lone hero earns 0.5x to 0.8x of a four's head | V6 | Owed |
| C-8 | **The first hunt starts near where I left off.** No two hours of climbing from zero each time | A returning company is at its held depth within 15 minutes | V1 `--start-from` | Built: start = lowest held step minus 20. First ever hunt climbs about 2 h; see the ground band in section 3, which starts it at the band's floor instead |
| C-9 | **The report tells me why we fell back.** "Fell back: Ama at 23% to a Brute" | Every fall back in the sample has a cause the player can act on | V5 | Owed (R2, R5) |
| C-10 | **Every ground has a top, and reaching it means move on.** | A good four reaches a ground's top in 1 to 3 days of play at the ground's top Level | Band reader (new) | Owed. Defined in section 3 |
| C-11 | **The next ground pays more from its first depth.** Moving on is never a pay cut | Depth 1 of the next ground pays at least 1.1x depth 20 of the last, for a company that can hold it | Band reader | Owed |
| C-12 | **A Level is a Level forever.** Level 200 is a big deal, and Level 400 still moves | One Level or one gear tier is the same share of depth at Level 20, 400 and past it | V8 | Owed |

The five hard lines (HC-1 to HC-5) stand as they are. A target with no reader by the end of stage 4 is dropped, not carried.

---

## 2. Rulings

Every ruling below is the designer's and final. None is a money call.

### 2.1 The stance pay gap: yes, a pay floor

**How it plays:** Careful sits a few depths shallower than Steady and earns about two thirds as much an hour. It never feels like a penalty for playing safe.

- **Today:** pay a kill = 1.007^(step − refStep), capped 120 steps above. Below `refStep` it falls with no floor, so Careful's shallower hold costs it twice: fewer kills and less a kill. That is the 0.28x.
- **Ruling:** pay a kill is never below **0.85x** the hours table. Above that, depth pays as today, up to the band's top (section 3). The stance's cost is then fewer kills an hour, which is the honest cost of pulling back sooner.
- **Bold's edge stays as it is.** It is already a real choice (C-4). The fourth V2 cell, where Bold also wins a full day when gear is a band behind, is fixed by the ruling in 2.2 rather than by Bold's numbers: a company behind on gear runs out of mana and HP faster, and readiness then holds Bold back.
- **Why not equal pay?** If stances paid the same an hour, no one would pick Bold, and Careful would be free. A third of Steady (today) is too far; Steady at about 1.4x Careful is a gap you feel and still choose.
- **Check:** R4 re-measures from a held start on 4+ seeds. Careful must land at 0.55x to 0.70x of Steady (C-5). If it doesn't, the floor moves, not the stances.

### 2.2 Readiness reads mana: yes

**How it plays:** the party won't pull while the mage is nearly dry. You see "waiting for mana" instead of a mage dying with an empty bar.

- **Ruling:** a hero is ready when HP is over the stance's line AND, for a hero whose bar spends mana, mana is over the same line. A hero with no mana moves is read on HP only.
- **One line per stance for both.** Careful waits longest, Bold shortest. No second dial.
- **Why:** an empty healer or mage is the most common way a real party dies, and V1's last Steady deaths came from pulls that started too close to the edge. Reading HP only hides the cause from the report too. With mana read, "fell back: Ama out of mana" becomes a cause line a player can fix (more mana food, a cheaper move).

### 2.3 A broken-off pack's dead stay dead: keep

**How it plays:** the party pulls back mid-fight. The pack walks home thinner, and when the party comes back the monsters it already killed are still gone until they respawn as normal.

- **Ruling:** keep what wave 1 built. A monster killed and paid stays down until its normal respawn.
- **Why:** if a broken-off pack came back whole, a party could kill two, break off, and kill the same two again, paid each time. That is a loop to farm. It also looks wrong: you watched them die.
- **What the player sees** (art handoff): the pack turns, walks back short of the dead, and the gap shows on the map.

### 2.4 After a death the stance settles one notch safer: keep, for that hunt only

**How it plays:** one hero dies on Bold, so the rest finish the hunt on Steady. The next time you press Start, it's back to Bold, because that's what your plan says.

- **Ruling:** keep it. Bold goes to Steady, and Steady or Careful go to Careful. It lasts until the hunt ends and never changes the saved plan.
- **Why:** a company that keeps pushing after a death loses the rest of its heroes while you sleep. That breaks RD-Q3. Changing the saved plan would be the game deciding for you, so it doesn't.
- **The report says so:** "After Bram fell, the company played Steady." This uses the report line already planned in R5.

### 2.5 `refStep` by Level: no. It belongs to the ground

**How it plays:** a ground pays its standard rate at its middle depth, whatever your Level. You earn more by holding deeper, not because the game knows your Level.

- **Ruling:** `refStep` is the ground's band middle (section 3). It is not a curve by Level.
- **Why:** pay already grows with Level through the hours table. A `refStep` by Level would pay twice for the same thing. It would also mean a higher Level is paid less for the same depth, which feels like a punishment for levelling. The Level 70 four earning 1.18x at Muster is the right outcome: it holds deeper.
- Until bands are absolute, each scale ground carries its own `refStep`, set at the band's middle.

### 2.6 T-02 re-aimed, T-03 retired into V4

**How it plays:** no player sees this. It stops the build from living with two reds marked "known", which would make every red look normal.

- **T-02 "Level hours" (`tests/level-curve.mjs`)** waits on FB-8, which was replaced, so it can never go green. **Re-aim it:** the check becomes "a Steady four at its held depth gains Levels at the hours table's pace, ±20%" on every scale ground. Ground rows not on the scale are not judged. The old pace-table cells C2, C3 and C5 retire with the reason "FB-8 replaced".
- **T-03 "Party class XP" (`tests/party-class-xp-line.mjs`)** enforces the 10-31 rule that a party only beats solo with mixed classes. The redesign drops that rule: a four earns more because it holds deeper. **Retire it** with that reason, and V4 takes its place: "four of one style loses to a mixed four, and no lineup is best on every ground."
- R6 does both, each with a mutation proof that the new check still bites.

### 2.7 The 33 staged files missing from the apply order

**How it plays:** players never see these. Retiring old-design files now means the release ships no number the redesign throws away the next week.

The rule: keep a file if it holds under the redesign. Retire it if the redesign replaces what it sizes. Re-cut it if the idea stays but its shape changes. Retiring uses `node tools/chain-retire.mjs --retire` (end state proven identical). Some files carry an earlier file whole: R6 re-generates any kept forward file that carries a retired one.

| File | Fate | Why |
|---|---|---|
| 1009 approved-rows alpha catalogue | Retire | Sized for three tiers and the old gear curve (FB-8, replaced) |
| 1010 approved-rows gold ladders | Retire | Gold now scales with depth (package 5) |
| 1011 approved-rows unlock offers | Retire | Old unlock prices. Prices come from `wage(L)` |
| 1012 approved-rows hunt-sessions catalogue | Retire | Tier-era hunt rows. 1054 is the current catalogue; R6 checks it doesn't depend on 1012 |
| 1013 approved-rows town-works catalogue | Retire | Town work is re-cut as company trades (FB-10, `09-crafting.md`) |
| 1014 works-goal-sized | Retire | Same as 1013. Also drops one Security-list item |
| 1016 level-curve new player | **Re-cut** | Keep the goal (Level 5 inside the first hour, so recruits arrive on time). Re-derive it on the hours table. Drop its edge-first rule |
| 1017 tend the field | Keep | Farming in one press is the first principle at work. True under any design |
| 1020 to-hit ratio ground tiers | **Retire** | Wave 3 removes the roll to hit. Tiers leave too |
| 1021 to-hit ratio hunt-sessions catalogue | Retire | Same |
| 1022 to-hit ratio hearthfind catalogue | Retire | Same |
| 1023 to-hit ratio scaled-hunts catalogue | **Retire** | Same, and scaled hunts are replaced by the Danger scale |
| 1026 job counts | **Re-cut** in R12 | "A job takes a count and a then" stays: it saves repeated decisions. It moves to company-owned trades. 1040-rested-bank-cut restates `hr_apply` including 1026's changes, so R6 re-derives 1040 after the re-cut |
| 1027 spell-rule default bar | Retire | Wave 3 rewrites the move list (jobs, evolutions) |
| 1028 spell-rule hunt-sessions catalogue | Retire | Same |
| 1029 spell-rule rune spells | Retire | Same |
| 1030 spell-rule hearthfind catalogue | Retire | Boss rates re-measured under a rule that is going away |
| 1031 spell-rule scaled-hunts catalogue | **Retire** | Scaled hunts are dark and replaced by the scale. It waited on FB-8, which is gone |
| 1032 approved cuts | Keep | Cutting the old dungeons and the scrip holds under any design |
| 1033 approved-cuts items catalogue | Keep | Same cut |
| 1034 approved-cuts tally | Keep | Same cut |
| 1035 approved-cuts unlocks | Keep | Same cut |
| 1036 four starter slots | Keep | The slots must exist for the Level 5 recruits. The first screen still shows one hero (RD-Q6 a); that is the client's job |
| 1037 first-hour kit lines | Keep | The starting kit |
| 1038 start kits | Keep | Security list (a grant) |
| 1039 account coach | Keep | Lessons taught once an account |
| 1040 rested bank cut | Keep, re-derived after 1026 | Removes a small bonus nobody feels, as the redesign asks |
| 1040 social catalogue | Keep | FB-12, continue |
| 1041 social clans | Keep | Security list (100,000 gold founding) |
| 1042 live-events catalogue | Keep | The Coordinator sets the calendar anchor at apply |
| 1043 the Great Hearth | Keep | FB-12 |
| 1044 friend link | Keep | FB-12 |
| 1045 ground presence | Keep | FB-12. Will need R11's finder removal to land first or alongside |

Totals: 16 keep, 15 retire, 2 re-cut.

### 2.8 The naming pass

**How it plays:** the first new words a player meets are the risk choice on the hunt card. They read like any RPG: plain, short, no lore.

- **The setting is called "Risk."** Its three choices are **Careful, Steady and Bold**. These are plain words a player gets at once, and none is a filler word. Keep them.
- **"Danger scale" and "step" are never shown.** Players see **Depth**, always relative to the ground: "Depth 7 of 20". Raw steps stay internal.
- **The old fight stances collide.** The hero's old per-fight stance control is renamed **Tactic** wherever it survives into wave 3, so "stance" never means two things. In the redesign the bar decides how a hero fights, so Tactic may leave entirely in wave 3.
- **Other labels, genre-standard:** "Held depth", "Fell back", "Top of the ground", "Ready for a new ground", "Rare", "Trait", "Signature". No mood words (Shadow, Ancient, Eternal and the rest).
- **Owner of the text:** R1 writes these into `src/data/text/hunts.js`; the guard `text-home` keeps them there.

---

## 3. "If every hunt can get more difficult, what's the point in moving on?"

**How it plays:** every ground has a top. Your party climbs to it over a day or two, then the game says "Muster Barrows is outgrown. Go to the next one." The next ground pays more from its first depth and drops a better base tier.

### 3.1 Each ground has a band with a real top

- **Today** there is only a pay cap at `refStep` + 120 and a scale limit of 4000 steps, so in theory a party could climb forever on one ground.
- **Ruling:** each scale ground has a **band of 20 depths**:
  - **Floor (depth 1)** is where a fresh company at the ground's entry Level holds on Steady.
  - **Top (depth 20)** is where a strong four at the ground's top Level, in the ground's best base tier, holds on Steady.
  - **Middle** is `refStep`, where the ground pays its standard rate.
- **Muster Barrows, as a start:** floor 480, middle 590, top 710 (about 12 steps a depth). These are taken from V1's held steps and the existing 120-step pay cap, and the Lab tunes them.
- **The next ground's floor sits just under this ground's top,** so a company that tops one ground starts the next one at depth 1 to 3. That overlap is the hand-off.
- **A first-ever hunt starts at the band's floor,** not step 0, which removes most of the 2 h opening climb (C-8).

### 3.2 At the top

- **No deeper.** The climb stops at depth 20. Bold can't push past it either.
- **No more pay.** Pay a kill stops growing at the top (this replaces `gapMax`).
- **A Needs you row.** The existing row `needs_outgrown` ("{name} has outgrown {ground}." with the button "Go to {ground}", `src/data/text/away.js`) fires when a company has held depth 20 for a full hour. The button opens the next ground's card with the plan copied. It is one press, not a re-set-up (the first principle).
- **Staying is allowed.** A player farming a drop can stay. They just stop gaining depth pay.

### 3.3 Gear: fixed by the ground, never by depth

**How it plays:** Muster always drops Muster-tier gear. Holding deeper makes a Rare more likely and its Trait stronger, but a plain sword from depth 20 is the same sword as one from depth 1.

- **Confirmed:** the base tier (the item's base numbers) is fixed by the ground.
- **Depth raises two things only:**
  - **Rare odds:** ×1 at depth 1, rising to ×3 at depth 20 (a starting value).
  - **Trait rank:** depths 1 to 7 roll rank I, 8 to 14 rank II, 15 to 20 rank III (section 8: three ranks, not five).
- **Never the base numbers.** If depth raised them, one ground would hold the best gear forever, and moving on would be pointless. That was Tyler's worry, and this rule answers it.
- **Why move on, then?** The next ground's base tier is higher. A whole kit from there beats a whole kit from here, Traits and all (section 8: every Trait on a hero together is held to one tier). A single good Rare still outlives a few bases, and carry-over moves its Trait onto a new one. Both feel good: the old Rare had a life, then you outgrew it.

### 3.4 What the player sees

- The hunt card and the HUD show **"Depth 7 of 20"**, never a raw step.
- The report shows **"Held depth 14 of 20 on Steady"**, and the change from last time.
- At 20: **"Top of the ground"**, plus the Needs you row.

**Walk-through (the top-of-band flow), against real names:**

| Step | What the player holds or can reach (from steps before only) | Doable? |
|---|---|---|
| 1. Start a hunt on Muster Barrows | A company and a plan; Muster Barrows is the one scale ground (`src/data/danger.js DANGER_GROUNDS`) | Yes, once R1 ships the client half |
| 2. Climb and hold | The engine's climb (built, wave 1) | Yes |
| 3. Reach depth 20 and hold an hour | Needs the band top (new: this file, built in R9/R10) | Owed |
| 4. See "Needs you: outgrown" | `needs_outgrown` text exists in `src/data/text/away.js`; the trigger is new | Owed |
| 5. Press "Go to {ground}" | Needs a second scale ground (R10) | Owed. **The flow is not playable until R10 opens a second ground** |

---

## 4. Dated build estimate

These dates are a judgment: about 3 to 4 lanes at once, and big patches. Each wave ends in a played build. A failed probe moves every later date.

| Wave | What | Lanes | Start | Played build by |
|---|---|---|---|---|
| 1 finish | Danger client (R1), fall-back causes (R2), Lab power step (R4), report cause line (R5), release order and restore drill (R6), visual passes (R7), the 10 h day and bought blocks (R8), power step in the engine (R9), 3+ grounds on the scale with bands (R10), finder removed (R11) | R1 to R11 | 2026-11-23 | **2026-12-06** |
| 2 | Monster roles, rows, depth pay everywhere, personal loot, plan copying between players | 4 | 12-07 | **12-20** |
| 3 | Jobs, the wider move list, wind-ups, ratio defenses, move evolutions, the Inner Flame | 4 to 5 | 12-21 | **2027-01-10** (holidays included) |
| 4 | Traits, Signatures, carry-over, single listings on the market, the drop moment, Security review | 4 | 01-11 | **01-24** |
| 5 | Trades (`09-crafting.md`), store cut to the basics, prices from `wage(L)` | 4 (R12 starts it early) | 01-25 | **02-07** |
| 6 | Hire board, halls as bar checks, ladders, clans and the castle's first building | 4 | 02-08 | **02-28** |
| 7 | Arenas, then the castle building by building | 2 to 3 | 03-01 | Can ship after EA |

**EA-ready (waves 1 to 6, full Security review, wipe): about mid-March 2027.**

---

## 5. Content plan: what is still unwritten, in order

The rule for every batch (CLAUDE.md section 10): write a sample of about 5, play it and review it, then expand in batches of 20 or fewer, checked for repetition. Every row has a source and a use.

| Order | Content | Sample first | Full size | Needed by | Why this order |
|---|---|---|---|---|---|
| 1 | **Ground bands and drop tables** | Muster plus the next 4 grounds: floor, middle, top, base tier, Rare odds, a drop table each | Every hunting ground | Wave 1 finish (R10) | The band is the answer to "why move on". Everything else reads it |
| 2 | **Monster roles per ground** | 5 roles (Brute, Skirmisher, Caster, Shield, Swarm) on Muster's four monsters plus one more ground | Every monster | Wave 2 | Roles make every seat matter. V3 needs them |
| 3 | **Move evolution branches** | 5 moves × about 8 rows (rank points, 2 branch picks, a final form) | Every move | Wave 3 | A point every Level needs somewhere to go (RD-Q4) |
| 4 | **Traits** | 5 rule Traits, each with ranks I to III, on different slots (written: section 8) | About 40, in batches of 20 | Wave 4 (V7 on the sample in wave 3) | No Trait may be top on every seat and ground |
| 5 | **Signatures** | 5, each changing one sample move from row 3 | 1 or 2 per major move | Wave 4 | They depend on the evolutions |
| 6 | **Recipes and tool rows** | One trade's ladder: 5 recipes and its tool (breaks after 12 h of use) | Ten trades | Wave 5 (R12 earlier) | Trades make what hunting burns. Recipes need the drop tables first |
| 7 | **Premium and Crowns store items** | 5 Crown items: one mount look, one wardrobe set, one never-breaking tool, extra save slots, Premium time | The store | Wave 5. **Prices are Tyler's** | Cosmetic and time only. No power, no XP boosts |
| 8 | **Castle and arena specifics** | One castle building with its upkeep and buff, one arena's rules and rewards | The castle, two arenas | Wave 6 to 7 | They sit on top of everything. Their share of power and sinks is already set aside |

Each sample goes through the Lab before it grows: rows 1 and 2 through V1 and V3, row 3 through V11, row 4 through V7, row 6 through the economy phase.

---

## 6. What this file did not do

- It played no build. The Danger scale has no client yet (R1), so no player has seen a stance. A blind play of the first scale hunt is owed after R1.
- Every number in sections 2 and 3 is a starting value: the 0.85x floor, the 20-depth band, Muster's 480/590/710, the ×3 Rare odds, the Trait rank cuts and the dates. R4 and the Lab tune them.
- The only things for Tyler are money: Crown prices and the Premium contents.

---

## 7. The Tower and the Catacombs (2026-11-22, Tyler: "I feel like catacombs and tower are super similar")

**How it plays:** the Tower is the one climb with no top, run once a week for a ladder spot. The Catacombs stop being a second Tower. They become two hunting grounds deep under Havora, the Bone Wing and the Flooded Wing. You hunt them like any other ground, and they are where you find named armor.

**He is right.** Today both are run modes on the same engine, each with one pocket, its own start verb, a key or chest and a climb. The Catacombs add keys, wings and checkpoints, which are three more things to learn for the same decision. Once every ground has a band (section 3), two climbs with no top are one too many.

**Ruling: the Catacombs become a region of grounds on the Danger scale, and their armor becomes that region's drops.** They are not merged into halls and not cut.

| | The Tower | The Catacombs (new shape) | Halls |
|---|---|---|---|
| **Player problem** | "I've topped my grounds. Where do I prove how strong my company is?" | "My heroes' helmets and boots are plain. Where do I hunt for armor with a rule on it?" | "Is my bar actually good?" |
| **Decision it adds** | How far to push this week's run, and at which risk, for a ladder spot and the weekly chest | Which wing to hunt: the Bone Wing leans helmets, the Flooded Wing leans boots. Then the usual risk and depth | Which bar and lineup can answer a boss's wind-ups |
| **Plugs into** | The uncapped scale (the only place with no top), the best-ever floor ladder, Tower weapons, clan bragging rights | Bands (3.1), the gear rule (3.3: base tier by ground, depth raises Rare odds and Trait rank), Traits (wave 4), the market | Package 7 halls, the bar as the build |
| **Reward** | Weapons and the weekly chest | Armor. The 24 named helmets and boots in `src/data/catacomb-armor.js` become drop-table rows, with their names and story. Each one's special attribute becomes a Trait in wave 4 | Hall drops |

**What goes:** the key families, the Hearth Chest route for armor, checkpoints, the separate start verb (`hr_catacomb_start`) and the `catacomb` session mode. These are the parts that copy the Tower.

**What stays:** the map, the two wings' look and story, and the 24 names.

**Why not halls?** Halls are short party boss checks. The Catacombs are a place to farm, and a boss room would throw away the map and the armor's reason to exist. **Why not cut them?** Armor has no home of its own, and the Tower already holds weapons. This gives a clean split, weapons up top and armor down below, at almost no new build cost.

**When:** wave 2, alongside R10's next grounds on the scale. Their bands sit high (the old Level 165 to 185 range) and are measured like every other ground. The Tower stays in wave 7, unchanged.

---

## 8. Plain gear in steps and the first five Traits (2026-11-22, lane/g-gear-steps; Tyler: "we aren't using the old tier item levels")

**How it plays:** on a scale ground a piece of gear is one number, its item Level. A whole kit at item Level 60 makes a hero's gear count as Level 60. Muster Barrows drops item Level 60 at every depth, worn from Level 50. A Rare from Muster can also carry a Trait, a rule like "when your target is a boss, your hits land harder", and the deeper you hold, the higher its rank. A plain piece from the next ground still beats it, so you keep a good Rare for a while and then move on.

**The table** (`src/data/gear-steps.js`; levers `gear.step-tier`, `gear.slot-weights`, `gear.trait-budget`, `gear.traits`, `gear.ground-tier`):

- A tier is `tierSteps` = 20 item Levels. Tier 0 is the starting kit. Muster Barrows is tier 3 (`DANGER_GROUNDS.muster_barrows.gearLevel` 60).
- A worn piece adds its item Level times its slot's weight to the gear part. The 13 weights sum to one: weapon 20%, body 12%, pants 9%, shield 8%, helmet and necklace 7%, boots, gloves and cape 6%, belt and each ring 5%, earrings 4%. A two-handed weapon carries the shield's 8% too. The engine's `weightGear` (R9) then sets how much of the hero the gear part is.
- `wearAhead` = 10: a piece is worn from its item Level minus 10.
- **Ranks are three, not five** (this replaces section 3.3's I to V). 04 section 10 caps rank 1 to rank 3 at under a third of a tier, so five ranks would sit about 1.5 steps apart, too close to feel. Ranks are worth 4, 7 and 10 steps on the cell that suits them best, rolled at depths 1, 8 and 15 and up. A Trait's steps are steps of the gear part, the same unit as a whole kit's item Level, and are not weighted by slot, so a rank is worth the same on a ring as on a weapon.
- All conditional steps on one hero at once: at most 20, one tier. So a whole kit a tier up always beats a whole kit a tier down, Traits and all (60 + at most 20 against 80 + its own). One piece is different on purpose: a rank III Trait is worth more than its slot's next base (a weapon's tier is 20 x 20% = 4 gear steps), so a good Rare lives several tiers. A Trait's average over every ground: at most half its best case. No Trait in the best kit on more than 40% of cells. Pity on the Rare roll: on.

**The piece, as the market reads it** (`13-market.md` section 2.3; the server's table is wave 4). Plain gear is a stack. A piece with a Trait is one account-owned row with indexed criteria: slot (each Trait belongs to one slot), base (the item), tier (a whole number, the ground's `gearLevel` over `tierSteps`), its Traits and their ranks (I to III), rarity (`traitsByRarity`: a Rare carries one Trait, a Very Rare two, never two of one stacking key), the find line (ground and depth) and an escrow state. Carry-over, Temper and imbuing are refused while a piece is escrowed. Temper belongs to the hero's slot and never travels with a sold piece, so a piece's worth in steps is its base and its Traits only. Listing a piece removes its imbuement. With one Trait a slot in the sample, no Very Rare can roll yet: it needs two Traits on one slot, which the first batch of 20 must provide.

**The five sample Traits.** Hidden: nothing rolls, drops, plays or shows them until wave 4, and `tests/gear-steps.mjs` holds their shape and that they stay hidden. Each "when" is one of the bar's own conditions (`src/data/condition-metrics.js`), so a player who can read a slot can read a Trait.

| Trait | Slot | When | Raises | Rolls on | How it plays |
|---|---|---|---|---|---|
| File Breaker | Weapon | an area attack would hit 3 or more monsters | that attack | Muster Barrows | The area hero's weapon for packed pulls like the Barrow Pikemen's files. Dead weight on a boss or a thin ground |
| Captain's Due | Cape | your target is a boss | your hits | Muster Barrows | Built for Captain Hask and the halls. Off for almost every kill on a ground, which is why it may be strong there |
| Last File | Shield | your HP is at 40% or less | defense | Muster Barrows | The front hero's last stand. Barely fires on Steady, earns its place on Bold |
| Keeper's Carry | Helmet | the hero you heal is at half HP or less | your heal | Catacombs, Bone Wing | The healer's helmet for saves, not for topping up |
| Floodmark | Boots | a monster is casting at you | defense | Catacombs, Flooded Wing | For grounds with casters. Worth nothing where nobody casts |

**The five guards on the sample:**

1. **Equal budget at best case:** one step table for every Trait (`traitSteps`). Each row names the seat and ground it is sized on (`best`), so V7 measures it there.
2. **Conditional by construction:** no row may use the always-true condition (`in_fight`). Each "when" is false on most kills: a boss, a crowd of three, a low hero, a caster.
3. **No stacking:** each row has a stacking key, and two Traits with one key count the larger. Every sample key and slot is its own.
4. **Dominance check:** planned for V7 (wave 3). With one Trait a slot the sample can only ask whether each Trait is ever worth its slot, so the full check runs when the pool reaches 20.
5. **Pity:** `pity.rare` on. The roller (wave 4) owns its curve.

**Walk-through (Muster's gear, today's data only):**

| Step | What the player holds or can reach | Doable? |
|---|---|---|
| 1. A company of Level 55 enters Muster Barrows on the scale | Muster is the one scale ground (`DANGER_GROUNDS`), Levels 55 to 75 (its pack) | Yes, once R1's client half ships |
| 2. A drop of item Level 60 is worn at once | `wearAhead` 10: worn from Level 50 | Owed: no drop table reads `gearLevel` yet (R10) |
| 3. The piece moves the held step | The gear part, read by the power step | Owed: R9 |
| 4. A Rare drops with File Breaker, Captain's Due or Last File | `traitPool('muster_barrows')` | Owed: the roller, wave 4 |
| 5. A Catacomb Trait drops | Needs the Bone Wing and Flooded Wing as grounds (section 7) | Owed: wave 2 |
