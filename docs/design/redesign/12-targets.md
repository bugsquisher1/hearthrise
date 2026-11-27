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
| C-5 | **Careful is the safe choice, not a punishment.** It pays less, but not so little that nobody picks it | Careful earns 0.55x to 0.70x of Steady an hour | V2 pay by stance, from a held start | Met with the floor 0.5 (lane/econ-levers on R9's tree, 6 seeds x 8 h from a held start): Careful over Steady 0.65 / 0.60 / 0.57 at Levels 60 / 63 / 70 |
| C-6 | **A party of four is worth it.** Each head earns more in a four than the same heroes alone | 1.2x to 1.6x a head, in XP and in gold | V6 | Owed. Pay by depth is the lever, so the four's deeper hold is the bonus |
| C-7 | **A lone hero is slower but fair** (RD-Q7 a) | A lone hero earns 0.5x to 0.8x of a four's head | V6 | Owed |
| C-8 | **The first hunt starts near where I left off.** No two hours of climbing from zero each time | A returning company is at its held depth within 15 minutes | V1 `--start-from` | Built: start = lowest held step minus 20. First ever hunt climbs about 2 h; see the ground band in section 3, which starts it at the band's floor instead |
| C-9 | **The report tells me why we fell back.** "Fell back: Ama at 23% to a Brute" | Every fall back in the sample has a cause the player can act on | V5 | Owed (R2, R5) |
| C-10 | **Every ground has a top, and reaching it means move on.** | A good four reaches a ground's top in 1 to 3 days of play at the ground's top Level | Band reader (new) | Owed. Defined in section 3 |
| C-11 | **The next ground pays more from its first depth.** Moving on is never a pay cut | Depth 1 of the next ground pays at least 1.1x depth 20 of the last, for a company that can hold it | Band reader | Owed |
| C-12 | **A Level is a Level forever.** Level 200 is a big deal, and Level 400 still moves | One Level or one gear tier is the same share of depth at Level 20, 400 and past it | V8 | Owed |
| C-13 | **Early power comes from Levels and gear** (Tyler 2026-11-22: "the buffs are way too strong too early"). Talents, vows, Traits, Signatures, borrows, Temper and consumables grow in, full at Level 200 | Level and gear are 85% or more of a hero through the first week (to about Level 28), 80% or more at Level 60 | `19-power-ledger.md` V8 | Owed. COMPUTED 90% / 90% / 80 to 86% at Levels 10 / 30 / 60 |

The five hard lines (HC-1 to HC-5) stand as they are. A target with no reader by the end of stage 4 is dropped, not carried.

---

## 2. Rulings

Every ruling below is the designer's and final. None is a money call.

### 2.1 The stance pay gap: yes, a pay floor

**How it plays:** Careful sits a few depths shallower than Steady and earns about two thirds as much an hour. It never feels like a penalty for playing safe.

- **Today:** pay a kill = 1.007^(step − refStep), capped 120 steps above. Below `refStep` it falls with no floor, so Careful's shallower hold costs it twice: fewer kills and less a kill. That is the 0.28x.
- **Ruling:** pay a kill is never below a floor of the hours table, XP and coin alike. Above that, depth pays as today, up to the band's top (section 3). The stance's cost is then fewer kills an hour, which is the honest cost of pulling back sooner.
- **The floor is 0.5x, not the 0.85x first written** (lane/econ-levers, 2026-11-22, the check below run on 6 seeds x 8 h): Careful's shallow pulls die fast, so at 0.85 it would earn about 1.07x of Steady (COMPUTED from its measured pay with no floor); at 0.5 it earns 0.62x (MEASURED) (0.55x the table against Steady's 0.89x). `src/data/danger.js` PAY.floor, `src/core/hunt/danger.js` depthRatio, built by lane/r9 the same day (R9 read Careful over Steady 0.68 / 0.63 / 0.58 at Levels 60 / 63 / 70).
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

**How it plays:** players never see these. They all ship in this release. Old-design numbers are then replaced by new files as each redesign wave lands, not pulled out now.

**Re-fated 2026-11-22 (lane/r3c-fates), after `tools/release-plan.mjs`.** The first table (15 retire, 2 re-cut) could not ship. Today's `src/data` and `src/core` already hold the engine half of nearly every one of these files (`gen-hunt-sessions --check` matches 1012, 1021 and 1028), and the release's one hr-accrue deploy is packed from today's `src/`. Retiring a staged file would leave the database and the engine on two designs, or mean reverting `src` first. That is a lane of churn for numbers the redesign replaces within weeks anyway. A staged file also can't leave by `chain-retire` (it takes applied catalogues only). And the whole Danger scale (1054-1058) is built on these files: 1054 carries 1028 whole, 1055 reads 1016's curve, and 1048 and 1051 need 1032.

**So the rule is now:** ship what `src` already plays, and let the redesign replace numbers through new forward files in its own wave. The "Replaced in" column below is that plan. The edge collision is cut out of the notes, not the SQL:
- **1016 is re-cut to "either order"**, so it no longer needs the edge first. Between its apply and the one deploy, a Level 8-20 death can be refused once and then settles on the next tick, with nothing lost. Once 1054 is in, every settle waits for the world shape anyway.
- **1020, 1023 and 1031 are withdrawn (lane/retire-tier-chain, 2026-11-26).** The tier rows and scaled hunts they carried are retired, and `1072-retire-tier-chain.sql` drops their tables.
- **1028 goes "before" the edge**, by the Coordinator's ruling: 1054 carries it whole, the two apply back to back, and the single deploy follows 1054.

| File | Fate | Replaced in | Why it ships now |
|---|---|---|---|
| 1009 approved-rows alpha catalogue | Keep | Wave 2 (depth pay, bands) | The engine's rows already match it |
| 1010 approved-rows gold ladders | Keep | Wave 5 (prices from `wage(L)`) | Same |
| 1011 approved-rows unlock offers | Keep | Wave 5 | Same |
| 1012 approved-rows hunt-sessions catalogue | Keep | Wave 2 | Carried by 1021 and 1032; `src/data` matches it |
| 1013 approved-rows town-works catalogue | Keep | Wave 5 (company trades) | The engine's rows already match it |
| 1014 works-goal-sized | Keep | Wave 5 | 1043 (the Great Hearth) needs it. Stays on the Security list |
| 1016 level-curve new player | Keep, edge re-cut to either order | Wave 1 finish (the hours table) | 1055 reads this curve (Level 9: 625 in the engine) |
| 1017 tend the field | Keep | Not replaced | Farming in one press is the first principle at work |
| 1021 to-hit ratio hunt-sessions catalogue | Keep | Wave 3 | Carried by 1028, so by 1054 |
| 1022 to-hit ratio hearthfind catalogue | Keep | Wave 3 | Carried by 1030 |
| 1026 job counts | Keep, re-cut in R12 (2026-11-22) | Wave 5 (company trades: 1059-company-trades) | Its engine half is in `src`, and 1040 restates `hr_apply` with it. "A job takes a count" saves repeated decisions, so it stays. R12 withdrew the THEN of hunt, its sweep and cron job (D-11) and re-derived 1040 |
| 1027 spell-rule default bar | Keep | Wave 3 (move list) | The engine's bar already plays it |
| 1028 spell-rule hunt-sessions catalogue | Keep, edge before, with 1054 | Wave 3 | 1054 carries it whole |
| 1029 spell-rule rune spells | Keep | Wave 3 | Same deploy as 1028 |
| 1030 spell-rule hearthfind catalogue | Keep | Wave 3 | Same deploy as 1028 |
| 1032 approved cuts | Keep | Not replaced | Cutting the old dungeons and the scrip holds under any design. 1048 and 1051 need it |
| 1033 approved-cuts items catalogue | Keep | Not replaced | Same cut |
| 1034 approved-cuts tally | Keep | Not replaced | Same cut |
| 1035 approved-cuts unlocks | Keep | Not replaced | Same cut |
| 1036 four starter slots | Keep | Not replaced | The Level 5 recruits need the slots. The first screen still shows one hero (RD-Q6 a) |
| 1037 first-hour kit lines | Keep | Not replaced | The starting kit |
| 1038 start kits | Keep | Not replaced | Security list (a grant) |
| 1039 account coach | Keep | Not replaced | Lessons taught once an account |
| 1040 rested bank cut | Keep, re-derived in R12 after 1026 | Not replaced | Removes a small bonus nobody feels |
| 1040 social catalogue | Keep | Not replaced | FB-12 |
| 1041 social clans | Keep | Not replaced | Security list (100,000 gold founding) |
| 1042 live-events catalogue | Keep | Not replaced | The Coordinator sets the calendar anchor at apply |
| 1043 the Great Hearth | Keep | Not replaced | FB-12 |
| 1044 friend link | Keep | Not replaced | FB-12 |
| 1045 ground presence | Keep | Not replaced | FB-12 |

Totals: 33 keep (3 with an edge re-cut in their notes), 0 retire. `node tools/release-plan.mjs --strict` reads this table.

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
- **The floor is measured, not mirrored (designer, 2026-11-22, lane/band-floor; `src/data/danger.js BAND_RULE`):** a fresh four at the entry Level held 320.9 on Muster, 160 steps under the 480 floor, so it could not hold depth 1. Every band's floor is now the fresh four's lowest seed less 10. Muster reads floor 320, middle 590, top 710 (about 20 steps a depth, the middle near depth 14). The depths are even from floor to top, so a company entering at Level 55 climbs most of the band as it Levels.
- **The next ground's floor sits just under this ground's top,** so a company that tops one ground starts the next one at depth 1 to 3. That overlap is the hand-off.
- **A first-ever hunt starts at the band's floor,** not step 0, which removes most of the 2 h opening climb (C-8).

#### 3.1a Can a company climb a ground with what that ground gives it? (designer, 2026-11-23, lane/depth-budget-audit)

**How it plays:** a company arrives wearing the last ground's gear, finishes its kit from this ground's drops, Levels to the ground's top Level, and then holds near depth 20. Luck (a good Rare, a strong build) gets there sooner, and that is intended (Tyler, 2026-11-23: "if someone gets lucky and their gear + build allows them to push deeper, we shouldn't be limiting them").

MEASURED on the set (`v1-climb.mjs`, the Steady mixed four, 6 seeds x 10 h, held from hour 4; evidence `tools/balance-program/redesign/depth-budget/`, the rest `tuning/final/`). "Depth" is what the player sees (`src/core/bands.js depthAt`); the own-step cut is in brackets.

| Ground (band) | Fresh four, one tier back, entry Level | Reference four | Grown four, plain (top Level, the ground's kit) | Strong four (top Level, the ground's kit, best jewelry, Temper, skills over the line) |
|---|---|---|---|---|
| Muster Barrows (525 / 590 / 700) | 587, depth 9 (8): the Ford's mithril kit at Level 55 | 609, depth 11 | 616, depth 12 | Steady 683.5, depth 18. Bold 699, depth 20 (the top) |
| Hask's Ford (565 / 590 / 675) | 576.5, depth 6 (3): steel at Level 45 | 592, depth 11 | 596.5, depth 11 | 654, depth 18 |
| Catacomb wings (staged) | depth 3 | depth 11 | Not measurable: no Lab kit wears the wings' base (item Level 160) | |

- **The top is reachable on the ground's own drops.** A strong four in Muster's own tier holds depth 18 on Steady and pins depth 20 on Bold, and the Ford's holds 18. Most of that climb is not the gear tier (one tier moved the hold about 16 steps, fifteen Levels at the same kit 7): it is the rest of the kit, best jewelry and trained skills, worth 67 steps between the plain and the strong four. Traits, still hidden, add up to about 28 more (COMPUTED: the gear slice's 20 power steps at the measured 1.42 own steps a power step), so a lucky company reaches the top early. Nothing in this pass caps that. MEASURED since (section 8.2, lane/traits-in-engine): Traits picked for the ground add 14 steps on Muster (pinned at its top) and 12 on the Ford, not 28, because their conditions hold part of the time.
- **The floor is cut on the wrong company on Muster.** Its floor cell (the Lab's LOW kit at Level 55) wears steel (item Level 30) and no jewelry, because the ladder has no tier between mithril (40) and rune (60): two tiers back, not one. A company that finished the Ford arrives at depth 9, where section 3.1 wants depth 1 to 3. The Ford's LOW kit is one tier back, so its floor stands.
- **The fix is two halves that ship together.** (1) Muster's floor from the one-tier-back four: its lowest seed 582, so `floorStep` 575 by the band rule. (2) The depth reading's middle point. The player's depth runs through the bridge (`src/core/bands.js`), whose middle point is `refStep`, and Muster's `refStep` (590) is held by hand as the monster formula's anchor while the reference four holds 609. With the floor alone at 575, steps 575 to 590 carry 8.5 depths (under 2 steps a depth): the arriving company would still read depth 8 and jump several depths with every pull. With the bridge's middle at the reference four's hold (610), the same company reads 4, the reference 9, the plain grown four 10, the strong four 18 and Bold 20: a climb of 14 to 16 depths. Half (2) is a `src/core` change, handed to Systems (`.claude/coordination/HANDOFFS.md` 2026-11-23); both landed together in lane/depth-reading-fix (`DANGER_GROUNDS refHeld`, `src/core/bands.js refHeldOf`). The Ford and the wings are re-cut by `lane/monster-roles-ford-wings`, with the same rule for the floor company.

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
  - **Trait rank:** depths 1 to 7 roll rank I, 8 to 14 rank II, 15 to 20 rank III (section 8: three ranks, not five), up to the ground's highest rank: rank II only on grounds entered at Level 70 or more, rank III at 100 or more (`19-power-ledger.md` section 2, 2026-11-22). Muster Barrows rolls rank I.
- **Never the base numbers.** If depth raised them, one ground would hold the best gear forever, and moving on would be pointless. That was Tyler's worry, and this rule answers it.
- **Which tier a ground drops:** the highest tier at or under its reference Level, one metal a tier (section 8.3).
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

### 8.1 The 40 Traits (2026-11-22, lane/traits-20; Tyler picked every one in `14-trait-candidates.md`: "Sadly I like them all")

**How it plays:** every slot has three or more Traits, every seat has four or more sized on it (and more it can use), and each ground drops four to six of them. A Rare rolls one from the ground you hunt. A Very Rare rolls two, and they never do the same job twice.

- **Home:** `src/data/traits.js` (40 rows, numbered as in the doc), re-exported through `src/data/gear-steps.js` so a scale ground still reads its pool from `traitPool(id)`. Still hidden: nothing rolls, drops, plays or shows them, and `tests/gear-steps.mjs` GS-6 holds it.
- **Sizes:** the steps stay the source (`traitSteps` 4 / 7 / 10). Cards show clean numbers, +1.5 / 2.5 / 3.5% (`GEAR_STEPS.shownPct`), each within a quarter of a point of its steps at `powerStep` 0.35%. In band, as ruled.
- **Similar Traits share a stacking key**, so they never stack: Soft Scale and Ram's Head, Barred Door and Banded Oath, Tarred Through and Floodmark, First Rank and Early Start, Pyre Tender and Long Rite, Slack Water and Ledge Footing, Goaded and Bolting Team, Keeper's Carry and Stair Bearer, Full Wick with Banked Coals and Full Cellar, Numbed and Sour Vault, Captain's Due and Raised Colors. GS-5 reads the groups from the doc, so a new group there is red until its key is shared.
- **Party-wide Traits** (Snuffed, Raised Colors, Banded Oath) give every hero the rule, and only one copy in a party counts.
- **Hask's Bargain is the first trade Trait.** While above 90% health its offense rises by `tradeSteps` (7 / 13 / 18, shown +2.5 / 4.5 / 6.5%) and its defense falls by the rank's `traitSteps` (shown +1.5 / 2.5 / 3.5% damage taken). Net it is 3 / 6 / 8 steps, never over one rank's budget, and its gain stays under `conditionalStepsMax`. The engine reads `trade: true` as two rule rows on one `when` (wave 4).
- **Bottom of the Quiver's exploit is closed by a start floor.** A Trait that pays for running low counts only on a hunt that started with at least twice its threshold (`startMin`, 100 arrows against 50), so carrying 50 arrows never keeps it on. GS-4 makes every future running-low Trait carry the same floor.

**The Very Rare pair rule** (the roller plays it in wave 4. Its data is the keys, `GEAR_STEPS.traitSlots` and `GEAR_STEPS.veryRareBanned`, and `tests/gear-steps.mjs` GS-5 plays it to prove every slot can roll a pair):

1. The first Trait comes from the ground's pool for that slot, so chasing a Trait still means choosing a ground. The second is any other Trait of the slot, from any ground.
2. Never two of one stacking key. A pair of one key would count once, a Rare with a dead line.
3. **No best pair.** The risk is a pair whose conditions cover each other's off time, two halves of one rule that make an always-on number. The key rule already bans the clearest cases (Full Wick with Banked Coals is "strong at any mana", First Rank with Early Start is "fresh" twice). Any other pair the dominance check finds in the best kit on more than `dominanceMaxPm` (40%) of cells goes on `veryRareBanned` and never rolls. The fix is the list, not a smaller number (04 section 10: a dominant rule is a design problem).
4. Two is the cap (`traitsByRarity`).

**The dominance-check plan** (04 guard 4, run as V7 before anything rolls):

| Step | What runs | Passes when |
|---|---|---|
| 1. Size each Trait | Each Trait at rank 3 on its `best` cell (seat and ground) against the same kit without it, 12 seeds x 12 h, held depth read | Every Trait moves the held step by 10 +- 3. Outside that, its steps are wrong (guard 1) |
| 2. Average share | The same Trait on every scale ground for its seat | Its average gain is at most half its best case (`traitAverageSharePm` 500, guard 2). A Trait over it gets a narrower `when`, not a smaller number |
| 3. Best kit by cell | For each seat x ground, the kit sampler (04 section 10, wave 4) builds the best one-Trait-a-slot kit from the 40 at rank 3 | No Trait in the best kit on more than 40% of cells, and every Trait best on at least one cell |
| 4. Pairs | The same search with Very Rares, every allowed pair a slot can hold | No pair in the best kit on more than 40% of cells. A pair over it is banned (`veryRareBanned`) |
| 5. Stacking cap | The best whole kit per cell against `conditionalStepsMax` | No hero's conditional steps at once over 20, so a whole kit a tier up still beats a kit a tier down |

The first readings to watch, from the doc's own notes: Worrier and Lime Pit (a status the hero keeps up), Full Wick, Full Cellar, First Rank and Early Start (a "fresh" or "full" state a strong party may hold all hunt), Soft Scale on Wyvern Roost (a ground built on one weakness), and Bailey Stand for hall tanks.

**Walk-through (a Very Rare cape from Krell's Hold, today's data only):**

| Step | What the player holds or can reach | Doable? |
|---|---|---|
| 1. Hunt Krell's Hold on the scale | Krell's Hold is a ground pack (`src/data/grounds/krells_hold`) | Owed: R10 opens it on the scale |
| 2. A Very Rare cape drops | Raised Colors is the Hold's cape Trait (`traitPool('krells_hold')`) | Owed: the roller, wave 4 |
| 3. Its second Trait | The pair rule allows Crag Shelter only, since Captain's Due shares Raised Colors' key | Data yes, roller wave 4 |

### 8.2 Traits in the fight, measured (2026-11-23, lane/traits-in-engine, Systems)

**How it plays:** every one of the 40 Traits now works in the fight engine when a hero wears it. Each is a rule on the bar's own condition: while it holds, its rank's steps join the hero's gear slice (capped at 20 a channel, with crits and weapon answers). Players still see none of it: nothing hands a hero a Trait until wave 4 (`GEAR_STEPS.traitsLive` false). The Lab and the tests hand them (`src/core/hunt/trait-rules.js`, `tools/balance-program/trait-kits.mjs`).

MEASURED on the set as merged at 1f3fa9fe6 (the Ford and the wings on the formula) (`tools/balance-program/redesign/trait-depth/run.sh`: the strong four of 3.1a, Steady, 6 seeds x 10 h, held from hour 4; every Trait rank III; the plain Muster four reproduces `depth-budget/muster-cplus` to the step; deltas paired on the same dice, with their standard error):

| Ground (top step) | Plain strong four | Lucky: every Trait made for the hero's seat | Theorycrafted: picked for the ground from all 40 |
|---|---|---|---|
| Muster Barrows (700) | 683.5, depth 18 | 688.8, depth 19 (+5.7, se 3.2) | 697.6, depth 20, pinned at the top (+14.2, se 2.4) |
| Hask's Ford (660) | 642.4, depth 18 | 645.4, depth 18 (+2.8, se 2.6: within noise) | 654.0, depth 19 (+11.7, se 3.6) |

- **Depth is the front hero's survival.** The hammer takes 77% of the damage on Muster and 67% on the Ford. A melee seat's own Traits are offense, and Hask's Bargain costs that front hero 10 defense steps whenever it sits over 90% health, so luck alone buys little. The theorycrafted kit puts First Rank, Sour Vault and Pauper's Share on the front (and on the Ford, where every seat is struck, on the back row too) and offense where it is free. Pay follows depth: Level XP 1.55x to 1.67x of the hours table on Muster, 1.28x to 1.35x on the Ford.
- **Under a tier, as ruled.** One tier moves the hold about 16 steps (3.1a). The best Traits moved it 12 to 14, so a whole kit a tier up still beats a kit a tier down. Nothing was capped or squeezed.
- **Dominance (14-trait-candidates step 3, 40% of cells; only 8 cells here, 2 grounds x 4 seats, counting a Trait worth 1 expected step or more in its slot):** six Traits are over 40%. First Rank, Pauper's Share, Ledge Footing and Sour Vault are in 6 of 8 best kits, File Breaker and Hask's Bargain in 5. The causes: a strong four on Steady sits "fresh" (over 90% health) and "unhurt" (nobody under 70%) most of the hunt; the Lab healer runs under 30% mana most of the hunt, so every "dry healer" Trait is nearly always on; the healer's Green Sickness keeps the pull poisoned; every seat casts an area move into packed formula pulls; and Hask's Bargain's cost only reads damage taken, so it is near free on a back-row hero. Reported to the designer, not nerfed (the full check, V7, wants every scale ground).
- **Always-on readings to watch:** Empty Wagon holds on 85 to 91% of the healer's heals, Ledge Footing on 80 to 90% of blows, First Rank on 42 to 97% (the front least). Every "casting" Trait holds a little on both grounds (the formula roles' wind-ups), not zero as 19 row 13 expected.

### 8.3 One material a tier, and a ground's base tier (2026-11-23, designer, lane/base-tier-ruling)

**How it plays:** every 20 item Levels is one tier and one metal. Steel is always better than iron and always worse than mithril, so a new word in the bag is an upgrade you can read without opening the card. A ground drops the tier its reference company can already wear, so a company at the reference Level sits mid-band, not pinned at the top.

**(a) The ladder.** A tier is `tierSteps` = 20 item Levels (section 8). Each tier is one material, and a material's item Level is `20 x (its MATERIAL_TIERS tier - 1)`. A piece is worn from its item Level less `wearAhead` (10) everywhere, so the old ladder's `level` (15 / 30 / 45 / 60 / 75 / 88) stops being a wear gate, on the plain rows and on every named twin stamped to a tier. Smithing and crafting levels stay as they are: they gate making, not wearing.

| Grid tier | Item Level, worn from | Material | Home grounds (by rule b) |
|---|---|---|---|
| 0 | 0, Level 1 | Bronze | Mill Cellar, Meadowbrook Thicket, Wickstead, Millrace Sewer |
| 1 | 20, 10 | Iron | Mosslight Glade |
| 2 | 40, 30 | Steel | Coppercap Warrens, Hask's Ford, the Slake |
| 3 | 60, 50 | Mithril | Muster Barrows |
| 4 | 80, 70 | Rune | Pyre Field, Krell's Hold |
| 5 | 100, 90 | Emberforged | Carter's Rest |
| 6 | 120, 110 | Dawnsteel | the Ox Road |
| 7 | 140, 130 | Cobalt | Wyvern Roost |
| 8 | 160, 150 | Wolfram | the Catacomb wings |

- The step tiers gear-phase-b named Damask (100) and Electrum (120) take the shipped words, art and craft chains of Emberforged and Dawnsteel instead. Two metals on one tier is the bug this fixes (steel and mithril at 40 read as an upgrade that was not one), and nine tiers have room for nine metals. Keeping the seven shipped ones whole keeps their icons, bars, woods and recipes in use. One row set a tier: Systems keeps the shipped ids where a slot has one, and the step rows fill the slots the old ladder lacks (jewels, the step cloak) with the `parts` gear-phase-b built.
- A tier past 160 gets the next new metal, named when a ground homes it.

**(b) A ground's base tier** is the highest tier at or under its reference Level: `floor(refLevel / 20) x 20`, never above it (a base over the reference puts the reference company at depth 19 or 20, CONFLICTS 2026-11-23). The Level band is the dial, never the base: where the rule would leave a tier with no home, or a ground's Levels straddle a tier with its reference on the boundary, the ground's Levels move (staged or re-cut grounds), not its base. Every tier from 0 to the highest has at least one home, so the fresh company one tier back always exists.

**(c) Each ground.** Levels from `src/data/hunts.js` `band`, reference from `DANGER_GROUNDS refLevel` where set (the scale-grounds-2 branches for the Glade to Krell's Hold). Bold marks a number that moves. Everything else is a word change at the item Level the bands were already cut on.

| Ground | Levels, reference | Base | What moves |
|---|---|---|---|
| Mill Cellar | 1-8, 3 | Bronze 0 | nothing |
| Meadowbrook Thicket | 5-15, 10 | Bronze 0 | nothing |
| Wickstead | 8-18, about 13 | Bronze 0 | its iron pieces drop as bronze (one base a ground). Iron's first door is the Glade |
| Millrace Sewer | **5-19**, about 12 | Bronze 0 | its top drops from 25 to 19, so it sits inside tier 0 (29 7.5) and stays the Level 5 party ground. The tutorial's "below" reads the band |
| Mosslight Glade | 16-31, 23 | Iron 20 | nothing |
| Coppercap Warrens | 32-50, 41 | Steel 40 | nothing |
| Hask's Ford | 45-60, 52 | Steel 40 | word only (was mithril at 40) |
| the Slake | 50-65, 57 | Steel 40 | word only (was mithril at 40) |
| Muster Barrows | 55-75, 60 | Mithril 60 | word only (was rune at 60) |
| Pyre Field | 70-90, 80 | Rune 80 | **item Level 60 to 80**, re-cut (step 3 measured it at 60) |
| Krell's Hold | 85-110, 97 | Rune 80 | word only (was ember at 80) |
| Carter's Rest (staged) | 110-125, about 117 | Emberforged 100 | word only (was Damask 100) |
| the Ox Road (staged) | 112-128, **120** | Dawnsteel 120 | its reference is its middle, 120. If the cutter measures it lower, its Levels move up by the shortfall |
| Wyvern Roost (staged) | **128-150, 140** | Cobalt 140 | Levels up from 125-142 so tier 140 has a home. It opens at the Ox Road's top |
| the Catacomb wings (staged) | 165-185, 175 | Wolfram 160 | nothing |

- **Holds:** a whole kit a tier up beats a kit a tier down (every tier is its own item Level again, so temper-play's next tier and C-2's tier back read cleanly). Found items are never scaled or capped by Level: the base is the ground's and the only gate is wear. C-2, V4 and K-6 are judged only on base tier 1 or more, and the four bronze grounds all sit inside tier 0. Confirmed: BD-7 and `new-ground.mjs` judge the K-6 hand-over only from a lower ground of base tier 1 or more.
- **The armor rung band** is one grid tier: 5 to 8% a rung (04 section 1 puts a tier at +7.2% of power; bronze to iron reads 6.7%). The 3 to 5.5% band was the 15-Level rung. Re-ruled in 8.4: each rung is read on its upper tier's grounds, and leather's bar is 3 to 8%.
- **Known gap:** no ground covers Levels 151 to 164 (content plan, section 5). Ruled in 8.4: the Flooded Wing opens at 150.
- **Economy:** an Emberforged or Dawnsteel piece is made at the same Smithing Level as before but is now item Level 100 or 120. Its book and sale rate follow its item Level (`loot-bands.js gearSaleRate` by tier), never the Smithing Level. Systems confirms it on the prices guard.

### 8.4 The reds 8.3 left, ruled (2026-11-26, designer, lane/designer-reds-1126)

**How it plays:** a new tier of armor is worth finding on the ground that drops it, the lines past Dawnsteel read the new Dawnsteel, every Level from 1 to 185 has a ground, and no Trait is a number that is simply always on.

| # | Red | Ruling | Why | Built |
|---|---|---|---|---|
| 1 | `first-week-bands` armor-rungs: iron to steel reads 2.6% a plate piece on the Glade (band 5 to 8) | **Each rung is read on its upper tier's own grounds**: bronze to iron on Wickstead, the Sewer (made iron is worn from Level 10) and the Glade (where iron drops); iron to steel on the Warrens, the Ford and the Slake (where steel drops). Plate keeps 5 to 8% a piece. **Leather's bar is 3 to 8%** | The Glade drops no steel. A steel piece there meets monsters iron already answers, and the chain is P / (P + k x the attacker's Level), so armor a tier over its ground saturates by design. On its own grounds plate reads 5.0 to 5.1% and leather 3.3 to 3.4% a piece (14.5 to 14.9% the set). Leather's tier is half armor and half aim (`gear-profiles.js` defB 550, rangeAtkB 500) and its dodge tops out sooner than plate's absorb (650 against 750), so its armor rung is the smaller half of its tier by design. Its first rung still reads 6.3 to 6.4% | `tools/balance-sim/cell.mjs armorRungs`, `tests/hunt-core/first-week-bands.mjs` (18 rows; a Boarhide mutant for the steel rung; the boots mutant re-aimed to the defect its name says) |
| 2 | `armor-line` AL1, AL4, AL10, `weapon-line` WL1, WL4, WL10, `temper-uniques` TU6: the staged lines restate Dawnsteel at item Level 88 | **Restated on the ladder.** The base is Dawnsteel at item Level 120, worn from 110, and every number of the base and the samples grows by 120 / 88 (the formula's own growth past 88), so each sample keeps its spend as a share of the line. The anchor stays 110, now by rule: it is Dawnsteel's wear Level. First Levels re-measured (weapons 115 to 117; armor plate 165, leather 122, cloth 113). The Burnt Crag Leg Plates follow the Roost to 128. The Wagon Guard's Sword is worn from the sword's first Level, 116, at 62 / 45 (keen) | A ceiling that names a number the ladder no longer has measures nothing. Scaling every number by one factor is a restatement, not a refit | `tools/balance-sim/staged/weapon-line.js`, `armor-line.js`. weapon-line green |
| 2b | Still red after the restatement: AL3 (three resistant pieces 0.2 to 0.3% over the line at the Catacombs), AL4 (the Breastplate, the Leg Plates, the Visor win nowhere), TU2 and TU6 (plate bands) | **One cause, read again after the late grounds' re-cut.** Dawnsteel plate now sits at the absorb cap on every late ground short of the Catacombs, so plate's line clears tempered Dawnsteel only at 165 and a resistance is pure extra on top of a capped armor. Those grounds' monsters were cut against Dawnsteel at 88. lane/scale-grounds-sweep re-cuts Carter's Rest, the Ox Road, the Roost and the wings on 8.3 now, so sizing a sample against rows about to move is refitting to a moving point. If the cap still binds after the re-cut, plate's late answer is a rule (a resistance, a Trait), not more armor, and the samples go through 28's sort | Named for the gate table. Owner after the re-cut: the designer |
| 3 | Levels 151 to 164 have no ground | **The Flooded Wing opens first: Levels 150-170, reference 160.** The Bone Wing stays 165-185, reference 175 | 150 is Wolfram's wear Level and the Roost's top, so the ground that drops Wolfram opens the Level it can be worn and the Roost hands over at once (K-6). The Flooded Wing is already the softer wing (its top step 515 against the Bone Wing's 580), and two wings on one band were twins: staggered, they are a step, and they overlap 165-170 as the Ford, the Slake and Muster do. Its base holds (floor(160 / 20) x 20 = Wolfram 160). If the cutter reads the reference under 160, the wing's Levels move up by the shortfall (8.3 b) | Handed: lane/scale-grounds-sweep (`new-ground.mjs` on the Flooded Wing, its `hunts.js` band and `DANGER_GROUNDS` entry and reference Levels) |
| 4 | `scaled-hunts` fee-guard (14 to 15% against its 15 bar), `hunt-screen` HS-8 and HS-14 (the tier picker's arms) | **They retire with their systems**: scaled hunts leave for the scale and the tier picker for the stance picker (section 2.7, wave 2). No fix is built for a system that is leaving | The lane that removes each system takes its cases out in the same commit and re-aims what HS-8 and HS-14 hold beyond the arms (the bar in town, the leader's pick) onto the stance picker |

**5. The Traits over the 40% line (8.2).** MEASURED: the census of 8.2 (`tools/balance-program/redesign/trait-depth/run.sh` census sets 0 and 1: the strong four at rank III, Steady, 2 seeds x 6 h, Muster at 75 and the Ford at 60), each Trait's hold share of its own channel's events, by seat, before and after.

The 8-cell dominance count can't tell a strong Trait from the only live Trait in its slot for a seat: a defense Trait that holds on 97% of a back-row healer's 92 blows in six hours counts as worth 9.7 steps and does nothing. So the ruling reads what each Trait's `when` does. **A `when` that is the strong four's resting state is an always-on number** (section 8 guard 2: false on most kills) **and is narrowed. A `when` that holds on a fifth to a half of events is a real condition, and its best-kit count is its slot's, kept for V7.** Narrowed, never shrunk (8.1 step 2). The class is ruled whole (CLAUDE.md 3.2): Early Start shares First Rank's key and condition, Slack Water shares Ledge Footing's, and Empty Wagon is the always-on healer reading 8.2 named.

| Trait | Ruling | `when` before -> after | Hold share % before -> after (hammer / bow / mage / healer; Muster, then the Ford) |
|---|---|---|---|
| File Breaker | **Keep** | an area hit on 3+ | 35 / 23 / 37 / 27; Ford 41 / 33 / 37 / 35. Its own ground's question (packed pulls), sized on Muster, and both measured grounds are packed. V7 reads it on thin grounds and bosses |
| Pauper's Share | **Keep** | your healer under 30% mana | 42 / 36 / 21 / 17; Ford 48 / 44 / 54 / 49. It wins the helmet because Full Wick never holds here, not because it holds always |
| Sour Vault | **Keep** | struck by a poisoned enemy | 26 / 25 / 10 / 56; Ford 32 / 26 / 26 / 25. It pays for bringing a poisoner, a real party pick |
| First Rank | **Reshape** | your health over 90% -> **your target's over 70%** | 41 / 68 / 69 / 97; Ford 38 / 80 / 45 / 76 -> 24 / 18 / 2 / 46; Ford 13 / 15 / 16 / 15 |
| Early Start | **Reshape** (key 'fresh', with First Rank) | your health over 90% -> **targets over 70%** | 40 / 69 / 95 / 100; Ford 33 / 74 / 61 / 72 -> 23 / 24 / 22 / 19; Ford 16 / 21 / 21 / 18 |
| Ledge Footing | **Reshape** | nobody under 70% -> **nobody under 90%** | 84 / 87 / 84 / 88; Ford 74 / 75 / 74 / 75 -> 29 / 33 / 33 / 35; Ford 19 / 22 / 23 / 23 |
| Slack Water | **Reshape** (key 'unhurt', with Ledge Footing) | the party over 90% -> **over 95%** | 80 / 83 / 81 / 85; Ford 58 / 61 / 61 / 61 -> 42 / 47 / 46 / 50; Ford 28 / 33 / 34 / 34 |
| Hask's Bargain | **Reshape** | your health over 90% -> **under 90%** (more damage dealt and taken) | 42 / 69 / 96 / 100; Ford 35 / 75 / 63 / 74 -> 55 / 32 / 5 / 0; Ford 67 / 26 / 38 / 28 |
| Empty Wagon | **Reshape** | your mana under 30% -> **under 15%** | healer 86; Ford 92 -> healer 18; Ford 14 |

- **Hask's Bargain** paid its cost in damage taken, so on a back-row hero who is rarely struck it was free offense. Below 90% health the trade lives where the blows land: the front pays it and gains on the same blows, and a hero who is never hit gets nothing from it. Its numbers are unchanged (net 3 / 6 / 8 steps).
- **First Rank and Early Start** read the hero's own health, which a strong four keeps over 90% most of the hunt. Reading the target's health makes them the opening of each kill, alike for every seat. Over 90% was too narrow in packed pulls (2 to 6%: the area casts wear a target down before it is picked), so the line is 70%.
- **Nothing was shrunk.** Every rank keeps its steps (4 / 7 / 10, shown +1.5 / 2.5 / 3.5%).
- **V7 still owes the full check** on every scale ground and seat. Watch next: a slot with no live Trait for a seat (the body for a mage, the boots for a tank) makes its least-dead Trait "dominant". The fix there is the pool's next batch, a live Trait for that seat, not a smaller number.
- **Tests:** `tests/hunt-core/trait-rules.mjs` (a scene for the target's health; the real settle wears Hask's Bargain on the tank, where it holds), `tests/gear-steps.mjs` (tooltips).

**Walk-through (a steel set on the Warrens, today's data only):**

| Step | What the player holds or can reach | Doable? |
|---|---|---|
| 1. A Level 32 company in iron reaches the Coppercap Warrens | Iron is worn from 10 and drops on the Glade (16-31); the Warrens open at 32 (`hunts.js`) | Yes |
| 2. A steel piece drops | The Warrens' base is steel 40 (`DANGER_GROUNDS gearLevel`), worn from 30 | Yes |
| 3. The plate body takes about 9% off what reaches HP, the set about 20% | `armorRungs`: plate iron to steel on the Warrens, body 9.4%, set 19.6% | Yes, measured |
| 4. Leather's set takes about 15% off, and its aim rises with it | Boarhide over Studded: defB 16 over 8, rangeAtkB 15 over 7 (`gear-stats.generated.js`) | Yes |

### 8.5 Three reads from lane/ci-reds-1126, ruled (2026-11-26, designer, lane/designer-sig-1126)

**How it plays:** a hero who has outgrown a ground can sit on its hardest Danger safely and is paid only the band's top for it, the monsters' aim is written for the hero the Level clock actually makes, and a lone new hero is judged by how fast it levels, not by how many kills it sees.

| # | Read | Ruling | Why |
|---|---|---|---|
| 1 | No kitted hero past content dies on Deadly alone in 0.25 h (145 on the Roost in Cobalt, 185 / 300 / 400 on the Unmarked Catacombs, MEASURED, `baseline.mjs` 5b) | **Correct, kept.** Deadly is cut for its own ground's band. A hero past the band has outgrown it and may sit there unharmed. The death checks play a hero at or under the ground's top Level (the Blessings check's 145 on the Catacombs, as re-pointed). No Danger grows with the hero's Level | Level 200 is a big deal. A scale that rises with the hero makes every Level a tax (section 2, "a higher Level is paid less for the same depth"). It is not a farm: depth pays only up to the band's top (sections 2 and 3), so the outgrown ground pays less than the hero's own. The answer past the last ground is the next ground, a data row |
| 2 | REF_HERO (2026-11-23 skills-time-parity): the harness hero on the clock reads Melee 139 at Level 110 against REF_HERO's 82 | **The measured career wins. REF_HERO is whatever `gen-ref-hero` writes from careers played on the Level clock, never a typed table.** The monster lanes re-derive every `aim` and `evasion` from it in the same pass as lane/scale-grounds-sweep's re-cut, so the ground rows move once. The roll to hit stays | A monster written for a hero the game no longer makes misses or lands by accident. The check already follows the generator (ci-reds-1126), so the re-measure needs no edit. Retiring the roll to hit is a combat-engine change with no player problem named |
| 3 | The lone Level 10 at the Thicket kills about 66 an hour (2 a settle, MEASURED in `per-player-cost`) | **Kept. Kills an hour is not a first-hour target. Level XP a hunted hour against the hours table is** (section 2, T-02's re-aim). The guard's excuse for that fixture stands | Pay a kill is floored by the hours table, so a lone hero's pace is held by XP, not by kill count. The scale is cut for a four, so a lone hero on its ground's reference sees fewer, longer kills by design. The blind first-hour pass after the big release (CLAUDE.md 3.3b) reads how a kill near a minute looks on the hunt screen |

### 8.6 The Trait piece on the server (2026-11-26, lane/t1-traits-drop, backend; STAGED and dark)

**How it plays:** a Rare that drops on a Muster hunt is one piece the account owns: a Muster base of its slot in the kind its finder wears (a Mithril Sword, a Warlock Sash), its Trait at rank I, where and when it was found. The hunt that found it says so the moment it lands, the return card names it, and it plays in the fight once the hero wears it. A closed hunt and a watched one find the same pieces.

- **The row** (`supabase/migrations/1071-trait-pieces.sql`, `trait_pieces`): owner account, the hero that found it, base, Trait slot, item Level (the ground's `gearLevel`), rarity, Traits `[{ id, rank }]` (a Signature piece: none, and its `signature`), ground, step, depth, and the kill that made it (instance, the monster's unit, the instant; unique, so a kill lands once). Escrow and worn columns wait for the market and the wear verb.
- **The base is drawn** after the slot, the Traits and the ranks (`src/core/trait-roll.js` step 5, so no earlier draw moved), over the pieces the ground drops in that slot at its base item Level (`src/core/drop-rate.js traitBasesOf`) that are the kind its finder wears there. Ruled below.
- **The server re-proves every piece** the engine proposes (`hr_trait_pieces_land`): its ground's cell, base and item Level, the rarity's Trait count, the pair rule, the rank at the depth the server reads from the step (`hr_piece_depth_of`, `hr_piece_top_rank`, generated by `tools/gen-trait-pieces.mjs`), the step under the window's proven ceiling, the instant inside the window, at most one piece a journalled kill. Pity is the one pity ruled below (`hero_pity.misses`, the finds owed), carried by the read and bounded by the kills times the ground's pity step.

#### 8.6.1 The pity and the base, ruled (2026-11-26, designer, lane/designer-pity)

**How it plays:** every kill you are at gives you your own roll for a Rare. Each miss makes the next roll a little likelier, by what that kill was worth, so a long dry spell always ends and an early lucky find can still happen. Partying, going deep or switching grounds never stores up luck to spend somewhere else. When a Rare lands, it is a piece you can put on: a wand if you fight with a wand, cloth if you wear cloth. What you still choose is the Trait, by choosing the ground.

| Call | Ruling | Why |
|---|---|---|
| Which pity | **Personal loot's, the finds-owed model** (`src/core/personal-loot.js`, `PERSONAL_LOOT` grow 4000, base 438). The roller's missed-rolls model is retired from `trait-roll.js` | The missed-rolls model reads a count of kills at whatever the next kill's chance is, so misses banked where a kill's chance is small (a party of four, depth 1) are spent where it is big (alone, depth 20). MEASURED: that hero found 1.54x the Rares its hours state. Counting each miss as the find it was owed makes the same run 0.97x. A tradeable piece's supply must be its stated hours |
| Pity or none | **Pity, on** (`GEAR_STEPS.pity`) | With none, 17% of heroes go a whole 70-hour week with no Rare and the unlucky 1% wait 4.6x the mean. Grow 4000 cuts the 1% to 2.9x (p90 1.94x, inside 21 L2's "under 2x") and keeps early luck (p10 0.20x the mean). A steeper curve buys little: at grow 20000 the p90 is still 1.83x and early finds drop to 9% of heroes in the first quarter. In band, kept |
| Its unit | **A billionth of a find** (`PITY_UNIT` 1e9) | A Very Rare miss in a party of four at depth 1 is worth about a millionth of a find, so millionths rounded it by up to half and could round it to nothing on a fast ground. `gen-flame-temper` refuses a unit under 1e9 |
| The base | **The kind the finder wears in that slot** (`GEAR_STEPS.traitRoll.baseFit` 'worn', `drop-rate.js kindOf`: armor class, weapon type with a caster's discipline, off-hand kind), among the ground's own bases at its item Level. Nothing worn there, or no base of that kind on the ground: any of them, uniformly | Uniform made two of three Rares a piece its finder cannot wear (a sword File Breaker for a mage), so each one forced the same sell-or-carry choice the player had already made by picking a wand. That is a repeated decision. Weighting by the drop rows is worse: Muster's rows drop a Maple Staff 50x as often as a Maple Bow, so about 1.4% of a bow hero's weapon Rares would be a bow or a crossbow (each row read at its own hours). The Trait stays the market's question: Muster rolls five Traits over four slots, so most heroes still find Traits they will sell |

**MEASURED** (`node tools/balance-program/redesign/drops/hero-week.mjs`, the real roller, the reference company's held step at depth 10, Muster and the Ford; 2000 heroes a week cell, 200 a wanted or kit cell; "before" is the roller as merged at c37ea13dc, rolls-pity and a uniform base):

| Read | Before (rolls pity, uniform) | No pity | Ruled (finds owed, worn kind) |
|---|---|---|---|
| Rares in a fresh hero's first 70-hour week, Muster (p10 / p50 / p90, mean) | 1 / 1 / 2, 1.39 to 1.47 | 0 / 2 / 4, 1.90 to 1.97 | 0 / 1 / 3, 1.54 to 1.59 |
| ...of them a piece the hero can wear, Muster | 0.28 to 0.52 | 0.39 to 0.63 | 1.16 to 1.59 (bow and healer 1.16 to 1.20: they hold no off-hand, so a shield-cell Rare is either kind) |
| Rares a week, the Ford (all wearable once ruled) | 1.38 to 1.48, wearable 0.44 to 0.52 | | 1.52 to 1.64 |
| Hours to one named Trait on a base the hero can wear, Muster, mean (weapon Trait / armor Trait) | 1,073 to 1,911 / 371 to 482 | | 266 to 325 / 141 to 160 (uniform base with this pity: 1,008 to 2,041 / 414 to 481) |
| The same on the Ford (boots and pants) | 199 to 246 | | 77 to 81 |
| Bank and spend: 10 h in a four at depth 1, 10 h alone at depth 20, x20, finds against stated (and reversed) | **1.54 (1.48)** | 0.99 (1.02) | 0.97 (0.95) |
| Kit spread (V10's proxy): Muster Trait slots holding a wearable piece after 200 h alone, p10 / p50 / p90 | | | 2 / 3 / 4 of 4 (hammer, mage), 1 / 2 / 3 of 3 (bow, healer). Uniform: 0 / 1 / 2 |

- **V10, the luck ceiling, holds on both grounds by construction.** The whole best kit against none is +14.2 steps on Muster and +11.7 on the Ford (8.2, MEASURED), under `kitSpreadMax` 20. Muster rolls rank I only (4 steps a Trait), so its p90 kit against its p10 kit at 200 h is two Traits, 8 best-case steps. The ruled base fills kits sooner, so the unlucky hero is nearer the lucky one at any hour count.
- **A first week runs a little short of the stated rate.** A fresh pity starts at 44% of the stated chance and rises, so a hero's first 70 hours hold 1.57 Rares, against 1.95 with no pity. The long-run rate is the stated one (the exact mean, computed: 1.0005 to 1.0011 of 1 / p). Accepted for the shorter tail.

**Exploit review.** Pity: a window's pity may grow by at most its kills times the ground's pity step, the most one honest miss adds there (alone, at the ground's top depth, on a flame at its ceiling: `tools/gen-trait-pieces.mjs pityStep`, `hr_piece_grounds` 224,919 Rare and 22,492 Very Rare parts a kill on Muster). A forged pity past it refuses the settle (`pity_over`). No mode can bank pity, so no hunt plan beats the stated hours. The base: it changes which piece of the ground's own list, never how many pieces, their item Level or any gold, and the server still proves the base is the ground's. A hero who wears a kind to farm that kind's pieces fights in it. Market supply by kind now follows who hunts each ground, which is where its demand is.

**Walk-through (a caster's first Muster Rare, today's data only):**

| Step | What the hero holds or can reach (steps before it, plus its kit) | Doable? |
|---|---|---|
| 1. A Level 55 caster wears a Willow Wand and a Scholar Robe Top | The Willow Wand drops on the Slake (Levels 50 to 65), the Scholar Robe Top on Hask's Ford (45 to 60), both worn from 30 (`items.js`) | Yes |
| 2. Its four enters Muster Barrows on the scale | Muster's band is 55 to 75 (its pack) | Yes |
| 3. Every kill it is at rolls its own Rare chance, a miss adds the find it was owed to its pity | `rollKillFor` with `personal-loot.js` pity, carried in `hero_pity` | Dark: `trait_drops` is off until wave 4 |
| 4. A weapon Rare lands: File Breaker or Snuffed, on a Maple Wand | Muster's weapon cell holds both, and its weapon bases include the Maple Wand, the kind of a Willow Wand (magic, destruction) | Yes, once lit |
| 5. A body Rare: First Rank on a Warlock Robe Top (cloth, the Scholar Robe Top's kind). A shield Rare: Last File on the Maplebound Spellbook or the Mithril-Faced Shield, since it holds no off-hand | Muster's body and shield cells and bases | Yes, once lit |
| 6. It hunts alone at depth 20 the next day | Its pity carries as finds owed, worth the same there | Yes |
| 7. It puts the Maple Wand on and File Breaker plays | Worn from 50. The engine plays a worn Trait (8.2) | Owed: the wear verb (lane/t1b-piece-verbs) |

- **Tests:** `tests/drop-formula.mjs` DF-4 (the bank-and-spend run on one carried pity, the retired model planted as a mutant and caught; a caster in a wand and cloth finds only its kinds; a staff is not a wand), `tests/trait-pieces-db.mjs` TP-2 (both doors find each slot's piece of the four's worn kind, the planted pity step) and TP-4 (a pity past the kills' worth is refused), `tests/personal-loot.mjs` PL-5 (the unit), `tools/gen-trait-pieces.mjs --selftest` (the pity step is the top honest miss), `tools/gen-flame-temper.mjs --selftest` (a unit a Very Rare miss rounds away in is refused).
- **Found, for the wings' re-cut** (lane/scale-grounds-sweep, staged): the Catacomb wings' helmet and boot bases are 15 pieces stamped item Level 160 whose stats run from a Midwife's Hat (defense 2) to a Wolfram Helm (80). The ruled draw keeps the kind, but inside one kind a wing Rare can still land on a bronze-tier body. One base a kind a slot at the wing's tier, as the open grounds have, settles it.
  - **Built (lane/refhero-recut, 2026-11-27):** the wings drop their tier's base alone (`src/data/base-drops.js`, Wolfram 160): every slot reads one base a kind. The 24 Hearth Chest pieces leave the wings' drop rows and keep their key tier's step and item Level (the Midwife's Hat iL 20, Dunn's Slippers 120); the Hearth Chest is their one door until section 7 retires the descent. Guard: `tests/drop-formula.mjs` DF-7, no Trait base under its ground's tier (a wing hat planted back is caught).
- **Worn:** `hr_hunt_instance_read` hands each member `worn_traits` (every piece whose base its equip slot holds, plus a named piece's `fixedOn` Trait) and `worn_signature` (the first Signature put on); both doors and the viewer's live start point play the same list.
- **Dark:** three switches (`trait_pieces`, `signatures`, `trait_drops`) off at apply; `GEAR_STEPS.traitsLive` and `SIGNATURE_RULES.live` stay false.
- **Worn and sold (lane/t1b-piece-verbs, 2026-11-26; `1072-piece-verbs.sql`, STAGED behind `trait_pieces`):** a free piece goes on a hero in town with Equip on its slot's line (`hr_piece_wear`), and comes off with Unequip, back to the account's pieces. Its base never reaches the bag as a plain item, on every door that changes a slot (the equip verb, a setup switch, Wear upgrades). The store buys a free piece at its floor share of V (`src/core/piece-value.js`: a Muster Rare at item Level 60 sells for 16,365, a Very Rare at 80 for 221,575, at the piece's own floor share, 8.7), at most 20 an account a day, after a second press says the price; the piece is gone and the ledger keeps it. Salvage ships after v0.3.0 (20 section 1.3: no scrap yet). The browser shows a piece through the standout frame on the doll, a Rares strip under the bag, the drop alert (`hunt_settle.found` and the section's fresh finds) and the return card's line. Open for the designer: CONFLICTS 2026-11-26 piece verbs.

### 8.7 What the store pays for a piece, ruled (2026-11-27, designer, lane/designer-calls-1127)

**How it plays:** a Rare you won't wear sells to the store for about an hour of pay at that piece's Level, any day you like. Once the market ships, selling it there always pays at least as much.

| Call (CONFLICTS 2026-11-26, piece verbs) | Ruling | Why |
|---|---|---|
| The price against `storeBudget` | **Pieces sell outside the stack budget at their own floor share, `PIECE_VALUE.floorSharePm` 250** (search 200 to 400; `src/data/piece-price.js`). No hours budget for pieces. The 20 a day count stays a security fuse, not a balance number | `storeBudget` bounds idle labor, and an account can always add more of that. A piece's supply is the drop table's hours, proven kill by kill (8.6, 8.6.1), so the supply is the bound. 0.25 V is the lowest price the book takes for a piece (13-market 2.7), so the store pays exactly the floor the market would have, and a market sale always beats it. At the stack floor's 0.4 each rarity mints about 2.6% of the reference's coin, and the full ladder 6.9% |
| A Very Rare's rank term | **Kept: the best Trait's rank** | A wanted order matches a piece on any one of its Traits at a lowest rank (13-market 2.3), so the market reads a Very Rare by its best Trait. Its second Trait is priced by the rarity's 400 hours against a Rare's 40. A mean or a sum would price a piece by something no buyer's order asks for |

**MEASURED** on the gold ledger (`node tools/balance-program/redesign/sinks/ledger.mjs`, now with a `pieces` line in minted; `--all-rarities` adds the Very Rare and the Signature). The reference four at day 180. ASSUMED: every Rare not carried (four in five) is sold at rank II, the reference's depth 10. That's the line's upper bound, since a hero also keeps the pieces it wears.

| Reading | Pieces, share of minted | Sinks over minted | With the hall |
|---|---|---|---|
| Pieces not counted (the ledger before this lane) | 0 | 87.7% | 89.2% |
| v0.3.0, Rares, at 0.4 | 2.6% | 85.4% | 87.0% |
| **v0.3.0, Rares, at 0.25 (ruled)** | **1.6%** | **86.3%** | **87.8%** |
| Rare, Very Rare and Signature, at 0.4 | 6.9% | 81.6% | 83.3% |
| Rare, Very Rare and Signature, at 0.25 | 4.4% | 83.8% | 85.5% |

- **In band for v0.3.0** (gate 7: 85 to 90%), with room. A Muster Rare at item Level 60 sells for 16,365, one hour of wage(60). A Very Rare at item Level 80 with ranks I and II sells for 221,575.
- **Named for the next patch.** When the Very Rare and the Signatures roll, gate 7 reads 83.8% at this floor. That patch re-reads the ledger with the market's cut and sets its own dial in the same pass (the Very Rare's floor share, or its carry share).
- **Exploit review.** The bid only fell. The fuse, the quote check and the per-call clamp are unchanged. The twin (`hr_piece_store_bid`) now reads the piece's own `floor_share_pm`, pinned at every rarity, rank and 13 item Levels against the core.
- **Tests:** `tools/gen-piece-value.mjs --selftest` (9 refusals: a floor share past 1000, and the twin or the core pricing with the stack floor), `--check`; `tests/econ-levers.mjs` EL-SINK reads the ledger with piece sales; `tests/piece-verbs-db.mjs` PV-3 (the section's price is the twin's) on the replay.
- **First principle, flagged.** A company that comes back to 25 Rares sells 20 today and the rest tomorrow. The plan's loot rule ("sell pieces no hero would wear", 13-market 2.5) is the fix, and it ships with the market.

### 8.8 What the Dawnsteel uniques are for on the ladder, ruled (2026-11-27, designer, lane/designer-calls-1127)

**How it plays:** past Dawnsteel the ladder keeps going, Cobalt then Wolfram, and every ground drops its own tier. What makes a late drop special is its Traits, a Signature, or a named piece's rule (fire does less to you, a hammer hits Bone Walls harder). There is no second line of "better Dawnsteel".

**The read (CONFLICTS 2026-11-27, ci-reds-1126c).** `grade.mjs --selftest` U1 and U2 dress a tank at the Catacombs' floor (165) and want the staged plate sample worn (the Watchman's Helm, the Limewashed Plate, the Keeper's Leg Plates). The kit wears Cobalt in all three slots instead. Same cause as `armor-line` AL3 and AL4 and `temper-uniques` TU2 and TU6: the staged lines (`tools/balance-sim/staged/armor-line.js`, `weapon-line.js`) are a ceiling of Dawnsteel x Level / 110, drawn when Dawnsteel was the last standard tier. On 8.3 it isn't. Cobalt (140) and Wolfram (160) are standard tiers past it, and a new metal comes with every 20 Levels after.

**The ruling.**

1. **The lines past Dawnsteel retire.** A ground's gear ceiling is its base tier's formula piece (8.3 b), the same rule on every ground. The staged line files leave with the guards that test them (U1, U2, AL1 to AL10, the weapon line's, TU2 and TU6). They retire with the system they test, not to get green. Systems, HANDOFFS 2026-11-27.
2. **Each staged unique goes through 28's sort, onto its home's base tier.** A piece with a real rule (a resistance, a bane) becomes a named piece of its home ground's tier: the formula's numbers for its slot and weight, plus its rule (28 (c)). A piece whose only mark is a flat number or a stat trade (crit, heavy or light armor) is cut. Its ground's Rares are the unique drops there. A piece with no home in the plan is cut (28 (d)). The table is `28-named-pieces.md` section 2.7: 6 kept, 7 cut.
3. **Tempering a unique is Temper on steps** (21 section 2), by item Level like every piece. The separate uniques ladder past tier 7 leaves with the line.

**Why.** A unique sized against a tier that is no longer the top is outranked by the next plain tier, which is what U1 and U2 show. Re-sizing it against Cobalt would last until the next metal. On 8.3 the variety past Dawnsteel comes from systems that scale with the ladder by themselves: 40 Traits on every base, Very Rares, 46 Signatures, and named pieces whose rule answers their own ground. That's the mix-and-match, farm-your-own-set chase, and none of it is a stat offset that the next tier erases.

**Walk-through (a Level 150 tank on the Catacomb wings, today's data only):**

| Step | What the hero holds or can reach | Doable? |
|---|---|---|
| 1. Wears Cobalt plate from the Roost | `cobalt_helm`, `cobalt_platebody`, `cobalt_platelegs`, item Level 140, worn from 130 (`gear-stats.generated.js`); the Roost's base is Cobalt 140 (8.3) | Yes, staged ground |
| 2. Enters the Flooded Wing at 150 | Its band is 150-170, base Wolfram 160, worn from 150 (8.4) | Yes, staged ground |
| 3. A Wolfram plate piece drops and replaces the Cobalt one | `wolfram_platebody` defense 164 against Cobalt's 143 | Yes |
| 4. Keeper Dunn drops the Keeper's Leg Plates | A Wolfram leg plate (defense 116) that takes 10% off ice, the answer to his Snuff the Candles | The row is built (`keepers_leg_plates`, lane/retire-dawnsteel-lines). It drops once its Rare row on Dunn lands with the wings' art |
| 5. A Rare drops on a Wolfram base with one of the wings' Traits | `danger.js` the wings' `traits: traitPool(...)` | Dark until `trait_drops` lights |

## 9. Sinks priced in wage hours, and the gold ledger (2026-11-26, designer, lane/sn-sinks; 20 lane SN and gate 7)

**How it plays.** Your heroes earn gold every hunt. Gold buys extra hunting time, your kit, Temper, imbuements, carry-over, a Blessing before a risky Bold hunt, a Talent reset, and your hall. Each price is a number of hours of pay at your hero's Level, so a reset or a Blessing feels the same at Level 30 and at Level 300.

### 9.1 The three per-hero sinks: kept as built

Each is already a row priced in milli-hours of the wage at the hero's Level (lane/level-costs; `src/core/wage.js`, `src/core/action-rules.js`), with its SQL twin in `hr_level_costs`. No price moved in this lane, so no catalogue was regenerated.

| Sink | Rule | Level 30 | Level 60 | Level 100 | Level 200 | Why this size |
|---|---|---|---|---|---|---|
| Talent reset | 0.5 h of wage, x2 for each paid reset that hero made that day, at most 16 a day (`talent-reset.js`) | 7,259 | 8,183 | 9,600 | 14,310 | A first reset is 5% of a 10 h day's pay: cheap enough to try a build, dear enough that thrashing costs (the fourth that day is 4 h of wage). Saved builds and Premium's free daily reset carry the repeat case, so the price never taxes a remembered choice |
| Blessing | 1.0 h of wage, free under Level 30, cuts 50% of one death and is used by it (`blessings.js`) | 14,518 | 16,365 | 19,199 | 28,619 | It saves 3.75 hours of progress for one hour of pay, so a Bold player always wants one. Only Bold dies, so it is a choice and never a tax |
| Death | the lesser of 6% of total Level XP and 7.5 hours of progress at the hero's Level (`levelDeathLoss`); skills lose 6% of their progress | 6% (2.3 h) | 6% (6.8 h) | 7.5 h | 7.5 h | XP, not gold. A gold death would double the price of Bold when the Blessing already prices safety. The Level step is in the hours: past about Level 100 a death costs the same share of a Level's time at every Level |

### 9.2 The gold ledger

`node tools/balance-program/redesign/sinks/ledger.mjs` (output kept in `sinks/ledger.txt` and `ledger.json`) walks an account of four heroes day by day for 180 days. Pay, coin, the store kit and Bold's deaths are MEASURED on the kept reading (`tests/econ-levers.mjs` REPORT, the tuning pass's Muster four). Every price is the server's own twin on the shipped rows. Behavior is ASSUMED and printed. Minted is coin, loot at the store's price and the store floor. The castle is 0.

**The reference company.** Four heroes on the full 10 h day, Steady, working the whole 8 h work day, making their own kit (the store fills the rest), three imbuements from their band, Temper as ranks open, one Rare in five carried, a reset every five days, and the plan's hunting block rule at 2 a day while the purse keeps 20 hours of wage.

| Company | Day 30 | Day 180 | Purse at day 180 |
|---|---|---|---|
| **Reference** | 82.4% | **87.7%** | 17.6 days of minting |
| **Reference, buying its hall as the purse allows** | 92.1% (34 of 35 rungs bought) | **89.2%** | 15.1 days |
| Reference working 0.8 of its day (09 5.1) | 86.0% | 91.2% | 12.6 days |
| Reference, block rule at 1 | 43.6% | 46.6% | 73.2 days |
| Reference, no block rule | 8.7% | 11.2% | 118.8 days |
| Full day, every use bought at the store | 96.1% | 99.2% | 1.1 days |
| 09's mix (20% reference, 50% at 6 h, 30% at 2 h; SPECULATIVE) | 80.2% | 58.8% | |

At day 180 the reference burns, as shares of what it mints: bought blocks 70.6%, store kit 7.6%, job fees 3.5%, imbuements 3.4%, carry-over 1.2%, resets 0.7%, Temper 0.6%, Blessings 0 (Steady never dies).

**Reading: in band.** The reference burns 87.7 to 89.2% by day 180, with or without its hall. Day 30 sits at 82 to 92% depending on how fast the hall is bought, which brackets the band.

### 9.3 Calls

- **Bought hunting time is the sink that closes the ledger.** A company with no block rule burns 11%, and one block a day takes it to 47%. Kit, fees and the gear sinks are about a sixth of what a hero mints once the company makes its own kit. The second block is the dial that owns gate 7, and nothing else in v0.3.0 can carry it. Resets, Blessings and death are decisions, so they stay small.
- **The block rule is offered once, at the moment gold piles up** (first principle). When a company's purse first holds 3 days of its pay, the coach shows one card: "Your purse is filling up. Gold can buy extra hunting time every day." Buttons: [Up to 1 a day] [Up to 2 a day] [Not now]. The pick becomes the plan's standing rule, and the return card shows what it bought ("Bought 2 hunting blocks"). It is never on by default, so a new player's first gold is never spent for them. B1 builds the rule and H1 the card.
- **Guard.** `tests/econ-levers.mjs` EL-SINK holds both reference readings at day 180 inside 0.85 to 0.90. A lane that moves a block price, the wage or a sink re-reads the ledger in the same pass. Its proof plants half-price blocks and a different kept reading.

### 9.4 Found, for other owners

- **Light companies pile gold.** At 6 h a hero a company holds 106 days of minting by day 180, and at 2 h it holds 77. After the hall they have nothing to buy. The castle and the market are their sink, and the ledger is read again when either ships (09's mix reads 59% at day 180).
- **The hall is bought out in month one.** A full-day company buys 34 of its 35 deeds and rungs by day 30, 32% of that month's minting. Its rows are list prices at fixed property steps. The hall's redesign (02 package 6) should price it as a long goal.
- **Level-priced costs outgrow pay past the last open ground.** v0.3.0 opens through Krell's Hold (reference Level 97). A reference company passes it about day 37, and its pay stops growing at Level 217 (about day 136). Blocks, resets and Blessings keep reading the hero's Level, so by day 180 a block costs 1.19x what the pay's step would charge. The staged grounds move the stop and are the answer.

**Not done.** No engine cell was run here: the ledger reads the kept reading and prices on the server's twins. Behavior (who buys blocks, crafts, resets, carries) is assumed and printed. Market fees, looks, town shows, renames, faction pieces and bought work blocks are left out (each under 1% of minted, or never bought by a rational company).
