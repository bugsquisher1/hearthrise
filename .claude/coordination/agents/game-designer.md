# Game Designer — running log

_Your private journal. Newest at top. Team-wide items also go to `DISCOVERIES.md` / `HANDOFFS.md`._

## 2026-11-28 lane/kit-bands-6-9 (bands 5 to 8, the supply-ladder flags)
- A ladder "a band late" is often a rung kept for a cut item (Copper's). Re-key the names onto the rungs before touching gates: stats and gates by rung never move, so no measured band moves.
- Gates derived from old careers past the measured range land past their own band. Cap a rung's gate at its band's gear item Level; rungs under the cap keep the measurement (BD-10 re-derives both).
- The job-goods vendor cap turns any bench recipe over a newly job-made bar into a faucet in recipe-yield-guard. When a batch adds a bar, read every bench recipe that eats it (the Dawnsteel stone's book was the outlier, 100).
- Bands past the supply ladders' end: build only the chains that close (rock, bar, Temper kit, fish, meal) and spec the rungs; a plank or crop with no arrow or drink to feed is a good with no use.
- The deeper grounds' restore burn falls (healer cover 86% on the Ox Road), so bands 5 and 6 read under 0.8 at 12 h. kitWork is global and would push bands 1 and 2 out; the ratio is the grounds', say so and move nothing.

## 2026-11-27 lane/designer-kit-band1 (the cut's four calls, the orphan list, band 1)
- Count an orphan by its DOORS, not by reachability: catalogue-coherence's labels collide ('made by cooking' is both the bench and a job), so read jobFaces() apart. The script (cut-orphans.mjs) reproduced the backend's 145 exactly on its first run; the band rule needed iL first (an item's `step` is a tier index, not 20 a band) and runes kept off the metal words ('rune' is a metal and a family).
- A shared face across bands needs a "one good, one recipe" rule, or a later band's job is the same good behind a gate. The rune's stone is bandless; the rune's band is its tier and binder.
- A hunted stream with a null face at a band silently drops every recipe that binds with it from jobRecipes (not sold). Walk every band's hunted faces before calling a batch whole.
- The K1 tool's pace table applies one burn to the whole career: a band-1 burn (the Glade's casters drink hard, 0.66 work-h a hunted hour) read career-long overstates the lag. Report the band's labor ratio from it, keep the pace on the reference burn.

## 2026-11-16 lane/d-supply-prices (Tyler: raise supply costs for the gold imbalance)
- Supplies scale with RISK, not with hours played. A lone hero on Normal in its range buys almost nothing (the career tank 0 g/h from 30 to 39 and 60 to 69, the Mage under 1k in Plain runes), so no store price reaches the audit's F12 hero; only coin and loot do. Read a career's bill by item before promising a sink.
- A store price never changes a fight, so play a cell once, keep its buys by row (cell.mjs `buysPerH`), and price them at any list. `tools/balance-sim/supply-prices-table.mjs` does it; its "was" column reproduced the separate old-price run to the gold.
- Food and deeper runes are coupled: a deeper rune pays back in food (faster kills, fewer blows). Raise food and re-measure the rune ladder in the same lane (Carved and Graven moved 28 -> 34, 44 -> 55 to stay a trade).
- One store food (Salted Lobster) is every guide's pick from 32 to 185, so "by tier" lands on that one row. The deeper rows have no measured buyer.
- Never run a test loop across a `git merge`: conflict markers in src/core crash every engine test mid-loop. Merge first, then run.
- REWORKED the same day (Tyler: "cut income instead"): a per-ground `gpFit` on coin (the formula) and on the SALE (loot-sale.js in vendorPriceOf), never on book `v`. 93 drops are shared across grounds, so a per-ground sale needs a rule (the highest dial of its grounds; gathered or made items exempt). Book `v` is the crafting measure, not the faucet.
- A per-ground dial can't split a ground's in-band Levels from its over-levelled ones: the lone career lives on the Glade from 16 to 44, so "cut from 30" and "leave 1-31 alone" can't both hold. Say which one you broke.
- Deadly's cut runs 2x Normal's under an income dial (its supply bill doesn't shrink); report both.

## 2026-11-15 lane/d-mage-110: the Mage at 110 and up was cloth, not spawns
- **Move one lever at a time before naming the limit.** "+Magic does nothing, so the Mage is spawn-bound" read right and was wrong: respawn 60 s to 1 s moved nothing (424 vs 419 kills). Splitting the Mage's damage by source (`dealtBy`) said it in one line: 85% is the basic wand blow, so the gear term in max hit decides.
- **A stat sized off another stat inherits that stat's curve.** Cloth's damage was 0.4 of plate's defence, and defence climbs about 16x over seven tiers while weapons climb 10-11x. So the lead grew with Level and hid under Level 30, where a lone hour is mostly walking.
- **Check the grader's kit before trusting a staged ground's spread.** `gear.mjs` reachWith dropped the open keyed halls, so the Morrow was graded with Melee and the bow a weapon tier short. Print the kit (`h.kit`) of every style once per ground.
- **A cut has a floor where it stops paying.** 0.1 a point took the Carter's Rest Mage from 1.82 to 1.46 of the pace, and 0.05 only to 1.42. Measure one step past the pick, so the board can say what's left isn't the row's.
## 2026-11-16 lane/d-turning-cut-melee (Tyler, from Andy: "Give it to all melee that doesn't have a shield on")
- **A before/after on a move needs no second tree.** The balance-sim cell's `slotsByRole` sets the bar's move list, so "the default bar without the move" on the new tree reproduced the old tree's numbers to the digit (same seeds). Use that for any move what-if.
- **Judge a move by who gains, not only by who leads.** Turning Cut gave the sword +31-62% alone on Dangerous and the club and axes +16-34% (they had Cleave). The share wasn't too big for the new weapons. The lead the hammer took at the Glade comes from the iron weapon rung (strength 16 vs the sword's 6).
- **A move's weapon words read its first discipline only.** `weaponsFor(r.disciplines[0])` made Power Strike say "Works with Shield" to every melee hero. Words now come from every discipline, with "Melee weapon" and "Melee weapon (no shield)" for the two melee groups.
- **A discipline change is a server row too.** hr_hunt_abilities.disciplines drives the bar view's default slots and `usable`, so data alone would show a club's Turning Cut struck while the engine cast it. Bump the hunt-sessions forward file, and list it away from the order's tail so lanes that append there merge clean.
- The local world equips through the paper doll: `[data-hs-open="inventory"]`, `.hw-slot[data-slot="shield"]` -> `.hw-worn [data-hs-act="unequip"]`, then `.hw-slot[data-slot="weapon"]` -> `[data-hs-act="wear"][data-item=...]`. Equipment lives in player_equipment (equip_slot, item_id), skills in player_skills (skill_id, xp).

## 2026-11-15 lane/d-special-attributes: the attribute catalogue, measured before it was written down
- **Measure the attribute before naming the item.** Two of my first five sample rows did nothing: 5% poison on the Glade (a four at the floor dies 0 times on Deadly, bare) and +1 Magic (+8 Magic is +0.5% for a wand at 90). Both were cut after one table each.
- **Element resistance is a boss attribute today.** It moved no death on any open ground and it moves win rates at the Chief and Krell. Place a resist piece on the ground whose boss uses that element.
- **A skill level is worth little and moves in steps.** +1 Defense is 4 to 6% less damage. +1 Melee is about 1%. +2 Ranged is 0%, 2.8% or 0.9% by Level. Read + skill at three Levels before quoting it, never one.
- **Lower weapon numbers are not a trade.** 85% of a staff's numbers cost 2%, x1.4 bane gave +15 to +26%. Size a multiplier on full numbers.
- A what-if resistance for every hero is a ring-slot row with only `resistPm`: no other stat moves. `gear.also` dresses a cell in a named row today.
- Physical resistance is three edits in `elements.js`, planted and measured (`special-table.mjs` `PHYSICAL_PLANT`). The board's `damage.js landHit` note was wrong.
## 2026-11-14 lane/d-labels-sweep (Tyler: "Recommended: 4+ players" for everything outside lore)
- A label has no period. "Label: lower-case clause." trips label-sentence, and a placeholder right after the colon counts as lower case: end a label without a period, or open its value on a number.
- Several labels on one line read as one sentence to colon-join and run together for the eye: break them per line (white-space: pre-line on the element). The lint now treats a line break as a boundary.
- "Heroes at once: 1." is a label with a value, not a verbless sentence: no-verb skips "1 to 4 words: value".
- label-long (copy-lint): a src/data/text row or a refusal-words line over 12 words is red. Lore and teaching say so: criers, coach and wiki by file, any other row by `@sentence: why` in the comment over its block (up to a blank line).
- Code literals in src/shell still carry sentence-style system lines (text-home counts 1,860 strings in code). The tables and refusals are clean, so code is the next sweep.
- local-world serve: an open page keeps its module map, and a hard reload in the pane did not refetch. Fetch the changed files with cache:'reload', then navigate.

## 2026-11-14 lane/b-barrow-numbers: the Barrow March's numbers, the hall fitted, tier 7 renamed
- **A monster that heals can stop a fight, not just slow it.** The Pyre Priest's first mend (a full hit every 8 s) put a lone tank at Level 110 on Dangerous into a pull he could never finish: 7.5k XP an hour, no death, nothing on the grade but one `feel-tier-less` row. Size a mend against the slowest way to fight in the biggest pull, and read the cell list for an hour with no XP and no death.
- **Grade a staged pack with the packs under it** (`pack.mjs check <g> --mode full --with <lower packs>`). Alone, its heroes have no gear from the grounds below and the grade reads deaths that won't ship.
- **A boss's own formula row is far too soft for a hall.** Krell on 2,256 HP and atk 94 lost to nobody, bad bar included. Fitted at the band's middle: 7,000 HP, atk 205. `boss-call-table.mjs --hall <ground>` now plays a keyed hall on the called rooms' rows and bars.
- **In a wave fight, Challenge can be the wrong answer.** With Hask and two Grave Guards up, pulling them onto the tank beside Krell is what kills the tank. The good bar with no Challenge won 100%. The Target setting (adds first) is the question that bites (95 down to 60). Worth a design pass before the hall opens.
- A node kind is a gathering row, so "an alder node" needs a tree the game has. The March's drawn tree works as a Willow. A new wood is a content batch, not a row.
- An id rename reaches every generated table that names items. `hr_tally_tiers` was missed on 11-14 (gen-tally-tasks --check was red on the set's tip). Run every gen --check after a rename, not the two you expect.

## 2026-11-11 — party cells without a party pull: the grader was judging against fresh heroes

Re-fit the mixed party cells after Tyler retired the Normal party pull (board "2026-11-11 Party XP cells").
Two lessons. **Check what the grader compares before tuning to it.** Its four-xp floor median mixed ladder-kit
solos with the practice-kit fresh heroes, so floors read 10-15 points higher than the middles and no single cell
fit Wickstead. Every sibling metric already filtered the kit; this one forgot. Fixing it was a one-liner with a
synthetic regression. **One cell per ground can't serve two pull shapes.** Normal (packs for one) needs the mixed
cells about doubled, and the big-pull tiers then pay a Glade party 1.5-2.4x. One-class cells can't rise at all
without crossing solo at 8 each. The clean answer is a cell keyed by tier. That's Systems' call and Tyler's question,
so the cells hold the ruled band where the grader binds it (Normal) and the board says what that costs.
## 2026-11-11 lane/d-plain-lore (Tyler: "Fix your voice. ASAP.")
- 521 player strings in src/data rewritten in plain words (item flavour, hunt themes, class lines, trophy, boss and end-of-hunt lines, title words). The item file's own header asked for a "medieval voice"; that was the root cause, not one bad line.
- The armor ladders were the worst: about 130 lines from one template ("an adept's sash, finer cloth cinched round..."). Plain names now: belt, chestplate, hood, vest, arm guards, leggings.
- tools/player-read.local.mjs read only src/data/text. It now lists every changed prose literal in src/data and auto-flags OLD_WORDS / OLD_PHRASES (exit 1). Over the old lines it catches 107 of 521; the rest needed a reader.
- A caption then a short sentence ("Dawnsteel boots. You won't find better") reads clipped when it repeats a hundred times. Join it into one sentence, or keep the caption only when it carries a real detail.
- Story text is a different job: the wiki's "The Road North" (d280ad46e) is the shape. Short game lines stay short.
## 2026-11-11 — the fun re-read: the safety rule that left a hero with a practice sword for 19 hours

Played a fresh sword-and-shield hero for 19 hunted hours on v0.2.118 (board section "2026-11-11 Designer re-read").
The first 20 minutes are the best thing in the game now. The worst thing came from a rule that looks careful: Equip
upgrades skips any piece with an effect it can't price, so it skipped the only weapon the solo path drops (Bramble
Blade, a bane). **Lesson: a "never decide for the player" rule needs a "never leave the player worse off" check
beside it.** A bane can only add, so leaving it out keeps the player on the worse weapon by default. The same
pattern showed in Tamsin paying armor the hero already wore. Second lesson: the second night is the real away test,
not the first, because stamina left over from night one caps it. Test returns in a row, not just one.
Harness note: in the pane, clicks with refs miss on a scaled screenshot; read state with `document.body.innerText`,
and close the page by going to another local URL before `wait --away`.

## 2026-09-07 — I played b518 as a new player and found the onboarding we already shipped

Wrote `docs/planning/FEATURE_SLATE.md` (6 ranked features + 5 existing-feature fixes). The thing I
want to remember is not on the slate: **I nearly designed a first-30-minutes hook that already
exists.** The brief asked for "a goal the new player can complete and feel", I started sketching a
starter chain, and then found `QUEST_DEFS` — Gather 15 → Cook 5 → Defeat 5 → Harvest 6 → 100 kills,
five rows, server-credited by `hr_claim_quest`, seeded into `G.quests` on every fresh boot, every
one open. The feature was built. It has no surface. Home's launchpad renders ONE milestone and the
skill candidate wins the 0%-vs-0% tie (`profile-launchpad.js`: skills evaluated first, strict `>`),
so a brand-new account is told to train Attack; the "All quests →" link opens a modal that only has
Daily and Weekly tabs. Designing a second chain would have shipped a duplicate on top of a bug.

**The lesson generalises: before authoring content for a gap, check whether the gap is a RENDERER.**
Two of my five fixes turned out to be this shape — the quest chain, and the away card telling players
cooking does not pay while away (`home-dashboard.js:695`) when `COOKING_SETTLEMENT_ARM_ENABLED` has
been true since b431. Both are prose standing where a live system already is.

**Measured, not argued** (the real client, running, not a read of the tables):
* `G.quests.filter(q=>!q.done).length === 5`; Home's Next-up rows = *Attack Lv 1 → 2* + the three
  dailies. Zero quest rows.
* `declarationFor('artisan','cook_shrimp')` → `{kind:'artisan'}`, `isPayableRecipe` true,
  `serverOwnedBonusKeys()` → `['noBurn']`. Cooking pays away. The card's copy is stale, not the arm.
* `START_CURRENCY.farmPlots = 4` vs `homestead TIERS[0].plots = 2`.
* 432 drop rows scanned: rarest chance in the whole game is **0.005** (hell_ember), and
  `DROP_BAND_MAX.rare = 0.05`. Tyler's "WOW I got something rare" moment has no substrate at all —
  a 1-in-20 drop is called "rare" and nothing is rarer than 1-in-200.
* Combat 25 = ~24,000 combat XP ≈ 260 goblin kills ≈ 1.5–2 h. **The gate is not the problem.** I came
  in expecting to argue for lowering it and the arithmetic said the opposite: the problem is that a
  new player's Combat rail is four grey cards (45 / 60 / 25 / locked) with no distance stated and no
  event inside the first two hours. Ruled: the gates stay, a Champion goes underneath them.

**RULINGS (delegated authority):**
- **The two welcome modals resolve to b341's.** `legacy.js:14583` documents that the v2 block's
  `window.maybeShowWelcome = function(){}` suppresses nothing (boot captured the lexical reference
  first), and calls the choice a design call. It is mine: **v2 retires, b341 survives** — it is the
  modal players actually see and the one that states deaths, recovery and dry-out honestly.
- **`START_CURRENCY.farmPlots` loses to the property tier.** The camp's 2 plots is the number every
  other system was tuned against (`farmhand` goal 6 = one 2-plot harvest round, b497). The kit
  constant becomes derived rather than authored, so the two cannot disagree again.
- **Auto-Eat I becomes the first-day chain's capstone, granted by `hr_claim_quest`.** The b495 ruling
  ("grant tier I at creation") never shipped and the FTUE still says *"nobody does it for you yet"*.
  Granting at creation teaches nothing; granting as the fifth rung of a chain the player completes
  teaches the whole loop and then switches the idle pillar on. The 15-Marks purchase stays — a player
  who buys it early simply completes the quest.
- **No dungeon level gate moves.** Reachability is bought with content (a scaled Champion that drops
  the Bone Key), never by deflating the ladder.

**HANDOFFS raised:** Systems owns the launchpad tie-break + the farm-plot constant + the away-card
copy; Art Director owns the Hearthfind reveal plate and the "Your heroes" gem block sitting above the
fold on a brand-new account (four locked purchases and a dead *"Checking…"* as the first impression,
on a product whose own premium shop says nothing is sold before it is built).

## 2026-08-31 — four rulings, and the one I got by pricing an item nobody asked me to price

Four questions queued off b497/b498. Three of them I answered roughly where I expected. The
fourth — "where do shields enter the economy" — turned into the most important thing I have
found in months, and only because I refused to pick a bar count without simulating what the
item would actually do.

**What I want to remember: the ask was "price it", and the answer was "it has nothing to sell."**
I nearly wrote a perfectly reasonable shield ladder — def curve between helm and platelegs,
3 bars, smithing at `mat.smith + 6`, a `strB/rangeStrB/magicStrB` tax so a two-hander pays for
the defence the engine can't stop it having. It would have passed every guard in the repo. Then
I ran it through `playerCombatRolls`/`monsterCombatRolls` and the incoming-damage column did not
move. Not "moved a little". **0.0%, from tier 5 up, against every monster in the game.** Monster
accuracy floors at 10% and a geared player is already there from Steel. Seven items of vendor
trash, shipped with a straight face, into the exact backlog category I have been complaining
about. A ladder that satisfies the *shape* of the request and none of its purpose is the most
expensive kind of wrong, because it looks finished.

**The methodology note I keep relearning: measure through the engine, not through the table.**
And the trap inside the trap: `levelOf(skills, id)` reads **XP**, not a level. My first run
passed `{defense: 70}` and silently simulated a level-1 character, which produced a plausible
but wrong table (it said the triangle was healthy). I only caught it because one row was
non-monotonic — leather took *more* damage at t6 than t7 with the same monster — and a number
that moves the wrong way is worth an hour. The corrected run inverted the conclusion.

**What playing taught me on the streak collision.** I could have ruled that one off the source.
Booting the real client and driving it took twenty minutes and produced the sentence that made
the ruling obvious: in ten seconds a returning player reads *"Daily streak 3 days"* (modal),
*"Daily reward · Day 1"* (Home card behind it), *"1-DAY STREAK"* (sheet). Three surfaces, two
numbers, one word. Nobody would have written that down from the code, because each surface is
correct in isolation — the defect only exists in the sequence. It also handed me two things I
was not looking for: the welcome-v2 modal is **dead on the return path** (the old one stamps
`lastWelcome` 300 ms first), and `stats.deaths` **does** increment now, so I can finally close
that backlog item.

**On merging the two streaks — I costed it and the cost was the wrong direction.** It is
tempting because "one number" reads as simpler. But the claim streak's whole retention function
is *come back AND press the button*; riding it on days-settled makes the 7-day jackpot
automatic, pays more for less engagement, and couples the login cycle to renown's counter so
neither can be tuned alone. A naming problem does not deserve an economy change. Rename.

**On the disable ruling.** I nearly reached for a constraint. Then I asked what the toggle is
actually FOR, and it is *"do not burn my 2,100 g Moonfish Fillets on a low-value grind"* — a
real strategy, self-only, and bounded because Hearthrise takes nothing from you on death. The
right answer was not a constraint but a sentence at the point of choice, plus a pointer at
Standing Orders B1 (withdraw instead of dying), which is the designed version of the same need.
**Freedom plus an honest warning beats a guardrail** when the consequence is opportunity cost.

**On the cloth lane — the discipline was in NOT changing it.** b497 shipped that stopgap
yesterday with an edge redeploy. It moved cloth from 140x to 5.6-9.7x against a 3.4-6.9x band,
and the repo's own faucet guard caps at 20x. The residual (four slots priced identically) is
real and I measured the one-line fix that lands it at 3.6-6.6x — and then filed it instead of
shipping it, because re-tuning a live economy twice in a week for a difference no player feels
is churn wearing a lab coat. I gave the fix a *condition* to expire on rather than a date.

**Standing backlog, updated:** Cellar +500 storage — still open, and board §10 #8 (Depot → Bank
UI) is its real home. Solo raid pool one-tap chest — still open. "Harvest 25 crops" for a 2-plot
starter — still open. `deaths` never increments — **CLOSED, it does.** ~25 recipe-less tier-3-6
drops — largely closed by library2/wave3; a fresh sweep finds **one** (`keystone`), and the ward
line I spec'd today would consume the class-signature drops properly.

## 2026-08-23 - b432 - Runecrafting: the ruling, and what playing it taught me

Tyler's whole brief was one sentence: *"it doesn't look like you ever fixed runecrafting to make more
sense."* No repro, no file, no list. So the first hour was not design at all — it was reading the
skill the way a player meets it, and the thing I want to remember is that **the diagnosis I was
handed was 75% right and the 25% mattered.**

**The brief said the skill's output "has no use". That is not true, and I nearly built the wrong fix
on top of it.** Runes are `type:'ammo'` with `magicStrB`, and `equipmentStats` sums `magicStrB` for a
magic loadout at legacy.js:16394. So an equipped Air Rune has ALWAYS paid +2 Magic strength. What is
unbuilt is E1 — the per-swing SPEND — so the honest statement is not "the ladder pays nothing", it is
**"the ladder is a permanent stat ladder that the design intends to become a consumable."** That is a
completely different copy problem, and if I had believed the brief I would have written apologetic
"this will matter later" text onto seven items that already work. What I wrote instead opens every
line with the mechanic. `src/core/ammo.js` had already written the rule I had to obey — *"no
player-facing copy anywhere may promise that it is [spent]"* — and I only found it because I went
looking for whether the burn was real before writing about it.

**Every real defect I found, I found by MEASURING the live page, not by reading source.** Three times:
  * I rewrote the seven rune descriptions in `STONECRAFT_DESC`, then asked the booted page for
    `itemDesc('air_rune')` and got the OLD line. The block has no importer. Twenty-four dead lines,
    shadowed since the day they were written.
  * I checked the "where do I get a Blank Rune" flyout expecting to confirm it was fine. It said
    **Stonemason Lv 22**. The real answer is Lv 4. `item-index.js` used a bare `=` in a loop over a
    req-ASCENDING list, so the hardest recipe always won — for every item with two recipes.
  * I clicked the ingredient chip a new player would click. **"No known sources · This item may be
    quest-locked or removed."** For a Stone Block. For a Normal Plank. For an Ember Rune. The
    acquisition overlay had never known about artisan recipes at all.

None of those three is in the brief. All three are the same defect the brief describes, one layer
down: *the game does not tell you where the thing comes from.* I would not have found any of them
from the diff.

**The ruling I am proudest of is the one I talked myself OUT of twice.** The tidy move was to merge
the enchanting runes into the ammo ladder — §11.2 asks for it, and the b357 guard even went red in a
way that pushed me there. I costed it: it forces `ember_rune`'s value from 180 to 9 to satisfy the
monotone-value guard, on a LIVE tradeable item, in a content change. So I read the guard again and
found it was asserting a proxy (row count) for a property it stated in words (same top end). Fixing
the guard to say what it means was the correct move and the merge was scope I would have paid for
later. **A red guard is a claim, not an order.**

**Three all-at-one-level is a choice, not a ladder.** I nearly gave the three enchanting runes reqs of
20/30/40 because three rungs at 25 "looks lazy". Then I pulled the drop table: ember, frost and poison
essences drop from tier 3/4/5 monsters at 0.08/0.09/0.10 apiece — perfectly parallel by construction.
A level ladder would have been a fiction, and worse, a fiction that tells the player ember is *better*
than frost when the entire point of the element axis is that the right one depends on what you are
fighting.

**What I would do differently:** I spent too long deciding where the Blank Rune shop row should live
(new tab? EQUIP_SHOP? SEED_SHOP?) before checking that `SEED_SHOP` rows already carry a `qty` and
render as bundles. Two minutes of reading the renderer would have settled twenty minutes of arguing
with myself. Read the surface before designing for it.

**The price took three passes and only the third was honest.** I set 50-for-400, then played it: a
fresh account has 500 gold, so the bundle was 80% of the purse. Then I did the arithmetic I should
have done first — one bind eats 6 blanks and pays 3 effective XP, so a fresh account's ENTIRE
1,000 gold buys 63 of the 83 XP that level 2 needs. That number is not a problem to fix, it is the
shape of the offer: the counter's job is "you are holding a rune thirty seconds after you opened the
skill", never "you can buy your way up this". A small repeatable 20-for-140 says that with its price
tag and needs no tutorial to explain it.

## 2026-08-17 - b373 - The death moment + the identity scoping ruling

Both rulings and their reasoning are in `DECISIONS.md`; the handoffs are in `CONFLICTS.md`. What I
want to remember is how the work went, not what I decided.

**I started by assuming the punishment was designed. It wasn't - it was a leak.**
"Respawn at 2/10" reads like somebody chose a harsh death penalty, and I was ready to argue against
it on genre grounds. Then I read `resolveDeath` and it full-heals, and always has. The 2 came from
`applyEnvelopeState` in a completely different module writing the server's mid-fight hp over the
respawn. **A design ruling that argues against a rule nobody wrote is a wasted ruling.** Find the
line that produces the number before you decide whether the number is right. The ruling I ended up
writing (full heal, always) was the easy half; the valuable half was locating the leak.

**Two of the three fixes were statements, not mechanics.**
Death already costs nothing but the run - the game had just never said so, so every new player
supplied the default RPG assumption ("I was robbed"). The player was already carrying the answer,
and the word "Eat" appeared nowhere at the moment it mattered. I built one sheet and changed no
combat maths, and the moment goes from punishing to teaching. **When something feels bad, check
whether the rules are already generous and merely mute.**

**The suite caught a design bug, not a code bug.**
My first tip-selection rule asked "bag empty AND owns Auto-Eat?" before "did you eat anything?", so a
veteran who had just burned five Trout was told their bag was empty. Technically true; useless
advice. That is a *design* error - wrong advice to a real player - and it was a table-driven test
over the four states that found it, not review. **When a feature's whole value is picking the right
one of N branches, enumerate all N in a test. The branch ordering IS the design.**

**I reverted a correct change because of what it cost to ship.**
Adding `monsterId` to the death info object was the clean shape. `src/core/combat-sim.js` is packed
into the hr-accrue Edge Function, so one byte - including a comment - turned the Edge payload guard
red and would have demanded a coordinated server redeploy for a field the client could already read.
Reverted, read `G.activeMonster` instead, added a test asserting the ordering contract that makes
that legal. **"Cleaner" loses to "shippable without a server deploy" when the cleaner version buys
nothing.**

**The identity bug was a scope leak on a timer.**
`refreshActiveMeta()` copied `G.playerName` into the active slot's record on every save tick, and
`identity.js` sets `G.playerName` to the account's server-claimed name - so every hero slowly
renamed itself to the account. Neither file is wrong on its own; the bug only exists in the
sentence that joins them, and no diff review of either would find it. I also refused per-hero
nicknames on the grounds that the store they'd live in (`hearthrise:profile`) is device-local: a
per-character name that vanishes on your phone is worse than no per-character name. **Check the
lifetime of the store before you promise the player anything that lives in it.**


## 2026-08-12 · The Hunt band — the mechanic where one player's good week deleted another's chest

Called it, implemented it, staged it. Migration `2026-08-12-raid-band-fairness.sql`, tests
`raid-band-denial.mjs` (+`--selftest`) and `raid-card-copy.mjs`. Decision in `DECISIONS.md`.

**The learning worth keeping.** The security pass handed me two remedies — "floor it at partisan, or
band against `max_hp`" — and my instinct (and the Coordinator's lean) was `max_hp`, because it looks
like it removes the primitive rather than pricing it. It doesn't, on its own. **Total damage is
bounded by the pool.** Σshare = max_hp by construction, so shares are a contended resource: a member
who takes 70% of the boss (7 days × the 10% clamp) leaves less HP for everyone else to earn a share
out of. Banding against the boss with the denial still in place just launders the same primitive
through a different pipe. It is the FLOOR that closes it — with no unpaid band there is no action any
player can take that moves any other player below being paid. Both, or neither works.

**Second learning: the failure was invisible at the size the design was reasoned about.** b223's
comment argues the median is size-independent, and it is, for the *bar*. But `percentile_cont`
interpolates, so in a clan of TWO the median is the mean and the stronger member's damage sets the
weaker one's bar one-for-one. Everyone reasons about mechanics at the size where they feel good (a
ten-person roster) and ships them at the size players actually meet them (two friends, week one).
**When a rule reads another player's number, test it at n=2 before n=10.**

**Third: I nearly shipped a double penalty.** Swapping median → boss silently made a failed week worse
— band 0.6 × factor 0.3 = 0.18 where the old rule paid 0.30 — because on a partial week everyone's
ratio is depressed by definition AND the payout was already scaled by the factor. Caught it by doing
the arithmetic on the consolation case rather than the happy case. **Check what your change does to
the week that went badly, not the week that went well.**

Open, mine, not done: banding is clan-size-neutral in shape but the share carries the whole `base` in
a duo (5,500/head at n=2 vs 3,125 at n=40). Intended and documented, worth revisiting if duo clans
start feeling the Hunt as a chore.

## 2026-08-09 · Itemization audit — Slice C (gathering/refine/craft/skills/tools/cross-system map)
READ-ONLY audit for the re-Master Itemization program, Phase 1. No game code touched. Report: `docs/reports/itemization-audit/C-gathering-crafting-progression.md`. Grounded in the actual data (gear-tiers.js, gathering.js, recipes.js, items.js, homestead.js, farm-progression.js, tools.js, workers.js, raids.js, monsters.js) + the artisan action path in legacy.js.

**Headline (matrix):** 4 true cross-system cores (Mining/Woodcutting/Smithing/Crafting) are tightly interlocked — the healthy heart. 3 soft-closers (Fishing→Cooking→buffs, Farming→Cooking) DO close the loop but only via manual eating and are near-invisible. **1 hard dead-end: PRAYER** — bury bones (output:null) → only a fractional combat-level bump; bones (100% drop) have no productive consumer.

**Worst dead-ends:** (1) Prayer — whole skill, zero capability payoff [P1]. (2) Armour is a mono-skill sink — ALL armour = bars only (no plank/thread), so 6 equip slots never leave mining+smithing, unlike weapons which force cross-system play [P1]. (3) Farming's ceiling is bought with COMBAT — high crops gate on plot level, plot level gates on combat-dropped farm_deeds (17 to max), with no on-screen path; the crop's "Farming 88" label is a lie about the real wall [P2]. (4) Recipe-scroll/raw-meat drops were dead ~80 builds (ESM merge overwrite), fixed b227 but the trap class is unswept [P2].

**Refinement spine:** the STRONGEST part — ore→bar→item and log→plank→item are enforced (no skipping), and castle goods extend it to Stage-3/4 (beam/fitting→keystone). But it never reaches gear: no weapon/armour needs a Stage-3 good, so the best chain only feeds buildings. Tools ladder is coherent (+5%/tier, self-made from each tier's bar) but never GATES gathering — pure speed nice-to-have. Coal is a flat-supply chokepoint under exponential late-smithing demand.

**Top 5:** (1) give Prayer a real payoff or fold it in; (2) add wood/leather/thread secondaries to armour (generator already has the shape); (3) bridge the refine spine into gear (require a beam/fitting in a mid-high recipe); (4) fix Farming's cross-gate legibility + add a farming-earned deed source; (5) add a coal rung above Mining 30 + surface/auto-apply buff food.

No level-req contradictions live in the player spine (the generator prevents drift). Committed with the report.

## Standing knowledge
- Play as a NEW player; hunt dead moments ("what now? / why does this matter?"). Smallest strong fix, then re-play to verify.
- North star: online-only social idle-RPG, all skills to 99 (`src/data/gear-tiers.js`), renown + daily login + collection log = retention pillars.
- No pay-to-win (Season Pass removed); Hearth Token is IAP-only, never PvE-minted. Coordinate economy changes with Systems.

## Standing backlog (open design questions)
- ~~Cellar +500 storage perk feeds nothing.~~ — **CLOSED 2026-08-08 by ruling.** Repurposed, not enforced: the Cellar becomes the room where things keep (food-buff duration +20/40/60/80/100%), via the existing `registerBuffScaler` seam. No inventory cap is ever built — shipping a *restriction* as a feature payoff, in the game whose promise is that it plays while you're away, is the wrong trade. Zero migration, zero players worse off (nobody ever received the thing being removed). `homestead-deepening.md` §3.4.
- Solo raid pool one-tap weekly chest (30k HP vs 50k strike clamp).
- "Harvest 25 crops" daily harsh for 2-plot camp starters.
- `deaths` stat never increments.
- Only 2 real bosses.
- ~~~25 tier-3–6 drops are recipe-less vendor trash~~ — **recounted 2026-08-08: it is 34, spanning tiers 1–6.** All 34 now have a route in `clan-overhaul.md` v2 §4.4 (castle goods, Work Order spoils lines, Tavern Board tributes, tier bundles). Still needs *building* — and the six new Hunt boss materials must not reopen it.

## Log

### 2026-08-09 · Itemization audit Slice D — consumables/currency/clarity (READ-ONLY, `docs/reports/itemization-audit/D-consumables-currency-clarity.md`)
Phase-1 domain audit for the re-Master Itemization program. Grounded in code (cited file:line throughout), no game changes.
**Headline clarity gap:** the game tells the player *what an item is* (Q1 ✅ via `foodUseInfo`/flyout) and *what to do next* (Q6 ✅ quest-nav), but is near-blind on *where it came from* (Q3 ❌), *is it an upgrade* on the tap/mobile surface (Q2 ⚠️ — comparison exists in the hover tooltip `item-ux.js:68` but `openInvDetail` `legacy.js:4905` never calls it), and *how to upgrade it* (Q4 ❌ — no tier link; `reqLv` shown at `4918` but NOT enforced by `equipItem` `3328`, a phantom gate). No source-info, no upgrade-preview, no locked-item preview exist. Collection-log `itemSources()` (`collection-log.js:145`) is the only reverse map — monster-only + discovered-only.
**Dead-end currency:** Rally Seal (`muster_seal`, `data/items.js:360`) — earned ≤1/day, `bop`, `v:0`, **zero sink anywhere**. The flagship world-event reward is inert. Gems are thin (cosmetic-only sinks) but not dead. Bounty Marks have 5+ sinks (auto-eat + Bounty Shop `legacy.js:5537`). Renown = score, not currency.
**Consumables:** post-b228 buffs are 1–5% (barely perceptible on the 56-day curve); Provision/Feast split is fuzzy (every cooked food carries a buff — `auto-actions.js:179`); auto-eat silently drops the Provision's buff; **DEAD BUFF `defense`** on Frostfin Supper (`items.js:159`) — not in `BUFFS_DEF`, so `applyBuff` rejects it while the UI still promises "+4% Defense". Item lies.
**Reward surfacing:** raid/Hunt bosses show NO chest preview before a week-long commit (`chestFor` computed `raids.js:361` but never rendered) — biggest reward-surface gap; dungeon loot hides drop-chance though it's in the data (`dungeons.js:38`).
**Top 5:** (1) reverse item→source index surfaced on every item; (2) boss/dungeon loot preview before commit; (3) give the flyout the hover tooltip's comparison; (4) Rally Seal sink + real upgrade-preview + fix phantom reqLv; (5) fix dead `defense` buff + de-fuzz the Provision/Feast split + revisit tiny buff magnitudes.
Handoff to Slices A/B/C: the reverse item→source index is a SHARED data structure — read by this slice's UI, authored from the item-DB-architecture slice's data. Commit: see below.

### 2026-08-09 · Bonus rebase spec — `docs/design/bonus-rebase.md` (DOCS ONLY)
Brief = Tyler's binding *"increments of 2%"* decision. Censused the real code first, not the specs.

**`getBonus` is not a function — it is a base function plus SIX additive monkey-patch wrappers**
(rooms/renown/capstone → companions → food buffs → clan → castle → muster → blessings). **42 live
bonus sources across those 7 layers**, plus 4 multipliers outside the chain and **6 ghost keys**.
The only fuse in the game sits at layer 4 and reduces *only layer 4's own contribution* — companions,
buffs, the muster aura and the whole blessing calendar are added afterwards and nothing clamps them.
That structural fact, not the individual numbers, is why `smithSpeed` reached +90% unnoticed.

**Three sources no spec had ever budgeted.** (1) **Companions**: base .05-.10 scaled by
`1 + 0.05×(lv−1)` over 30 levels = ×2.45, so a level-30 Forge Imp is `smithSpeed` **+24.5%** — bigger
than the entire castle Smeltery ladder, from a pet. (2) **Food/drink buffs** to **+50%** (Lich Soul
Soup `goldFind`), indefinitely renewable and therefore permanent power wearing a consumable's clothes.
(3) The **blessing calendar's own worst stack**: `forge_fires` + `guild_works` = **+50% smith AND
craft from the calendar alone.**

**The grammar:** whole percents only; **2% step, 1% half-step for wide keys** (`allXP`, `combatXP`,
`goldFind`) — a wide key pays on everything so it must cost more per point, which is exactly the
distinction whose absence produced +52% allXP next to +90% smithSpeed. **Permanent ceiling +15% per
key** (homestead ladder 10 + a castle wing 3 + a maxed companion 2), **fuse 0.20**, **temporary budget
+15%**, **absolute peak +30%**. `allXP` and the two artisan speeds land on +15% exactly — the ceiling
is derived, not picked.

**Argued the case for smallness properly rather than asserting it.** Today's Last Call is +36% on a
+52% stack = a 69% uplift that is *invisible* because everything else is enormous too; rebased it is
+8% on +15% = a 53% uplift and the largest thing on the screen. **You cannot have a peak without a
plain.** And the hierarchy survives because of arithmetic, not taste: a presence-gated +4% weekly
blessing is worth 0.69% of a week while a permanent +5% Library is worth 5.00% — **the Library beats
the bigger-looking blessing by 7.2×.** That is why blessings were cut ~4× and NOT to 2%: at 2% the
calendar's expected value is +0.3% on the day, and b227 shipped the calendar as the *entire*
online-pays mechanic.

**The exemption that does the real work.** The grammar governs **throughput multipliers only**.
**Duration, capacity, reliability and access are outside it, cost no power budget, and are the
preferred payload for any rung that costs a Keystone.** A 300,000g rung cannot be justified by +2% —
and the honest fix is not to inflate the 2%, it is to stop paying in percentages at the top of a
ladder. Seven surfaces convert: `restedXp` potency → a **flat XP quantum** (800/1,600 per charge; 8%
potency is single-digit XP, provably worth nothing); the three **Keystone L5 rungs** → **batch
capacity** (one action produces five — the Shrine's bulk-bury generalised); renown **Count → a market
slot** and **King → a daily-task slot** (both fields already declared in `getPerks` and granted by
nothing); blessings held at 3-6%; the five fractional-`farmYield` perks fixed by **not flooring**.

**Ratified the homestead provisional with three amendments.** (1) **P1: Workshop and Shrine are still
at +10/25/50/50/60** — six rooms retuned, two missed; a Sawpit at +50% beside a Double Bellows at +6%
reads as a bug. (2) **The Cellar goes back UP to +20/40/60/80/100%** — duration is exempt and was cut
by mistake; a maxed Deep Cellar at +20% turns a 6-minute buff into 7m12s, which is 320,000 gold for
something nobody can perceive. (3) Library L4/L5's `restedXp` 4/8% is dead on arrival.

**Pacing, stated not sold.** The whole boost economy now buys **7.5 days** off the 57.2-day floor
instead of 19.6. **Artisan is where it actually bites** — throughput is `1/(1−speed)`, so a maxed
Kitchen went from ×2.50 to ×1.14 and artisan 99s take ×2.19 longer; all-15-99s lands ≈18-19 months,
top of the 16-18 target. **And that is the deepest thing this achieves:** with boosts confined to
±15%, pacing is governed by `PACE` and nothing else. Today you cannot answer "how long is a 99?"
without knowing which of 42 sources a player holds.

**Ruled the tool ladder OUT of scope** (.05→.35 `gatherSpeed`): it is gear, not a perk — and decisively,
the 57.2-day floor was derived *with* it applied, so rebasing it re-opens the anchor Tyler approved.
A Rune Axe that saves 2% is not a Rune Axe.

**Fuse + guards for Systems:** the fuse must **move out of `clan-seat-ui.js` into a final
`power-budget.js` wrapper** — a fuse in the middle of a seven-layer chain cannot police it. Constants
0.60→**0.20**, key cap 0.10→**0.05**, `CASTLE_TOTAL_CAP` 0.25→**0.12 and actually enforced** (today it
is declared and never applied to anything). ~30 assertions retuned, listed line-by-line; **four new
tests**, of which the **grammar test** — every magnitude in every source table is a whole percent — is
the one that prevents re-drift forever. Flagged that `smoke-test.js:8746` breaks *structurally* under
a final clamp (it forces a synthetic 0.50 blessing and asserts 1.0) and that its offline-replay latch
must keep being guarded.

**Migrations: two, not none.** Castle building perks are client-side (`hr_castle_buildings` stores
costs only) — but the **feast ladder** (`clan-seat.sql:1104`) and **rested potency** (`:1151/:1170`)
are server-mirrored and must move in lockstep or client and server disagree about what a feast is worth.

**Also found in the census, filed:** `combatXP` skips ranged and magic entirely (`legacy.js:1508`) so
the Trophy Room pays nothing to two of seven styles — live P1; `hearthScale()` is inert
(`registerBuffScaler` has no caller); Frostfin Supper's `defense` buff is a silent no-op; five buff
keys have zero readers; companion `xpB`/`goldBonus`/`prayerXp` are misspellings of live keys, so five
pets pay nothing — and fixing those names is an unbudgeted *increase* that must land inside the rebase
commit, not after it.

No game files touched. **Commit `7cc89ab`** — note for the audit trail: a concurrent agent's
`git add -A`/`-a` on main swept these four files into its own commit (`feat(clans): tier names follow
the foundation scene`) a moment before mine ran, so the spec landed under a message that does not
describe it. Content verified intact (608 lines, 189 table rows). **Process note for the team: on a
shared `main`, stage explicit paths — a blanket add on a tree three agents are writing to will claim
another agent's work.**

### 2026-08-09 · Pacing overhaul spec — `docs/design/pacing-overhaul.md` (DOCS ONLY)
Modelled the real curve by simulating the shipped action loop (rung switching at the real level gates,
best-tool speed ladder applied) against `data/gathering.js`, `recipes.js`, `items.js` and `XP_TABLE`.
Brief = Tyler's binding Pacing directive (2026-08-09) + my own audit P0.

**The measurement that reframed the problem.** Woodcutting 99 costs **120.5h** of game-time — which is
not far off genre norms. The pathology is the *conversion rate*: the 12h offline cap is **per login
gap, not per day**, so an engaged player banks ~19h of full-rate progress daily and still has their
evening free. **21.5 effective game-hours per wall-clock day → first 99 in 4.5 days.** The XP table was
never the disease.

**Chosen retune:** `PACE.xp = 0.55` · `PACE.actionMs = 1.45` · offline cap → **12h daily budget** ·
presence **×1.12 XP, multiplicative, outside the allXP fuse**. Lands first 99 at **28 days**, all-15-99s
at **~10.3 months**, and the audit's 9h repro at WC 44 / 7,449 logs / 11,918g (was WC 59-62 / 16,200 /
129,600g). Rate-side only — stretching `XP_TABLE` would demote every living player, which is the literal
clawback the directive forbids.

**On the presence bonus:** at +10-15% it is a *feel* feature, not a pacing lever — for a 2.5h/day player
it moves ~1.4% of daily throughput. I implemented exactly Tyler's number and said so in the spec: the
online-vs-offline problem is solved by online-only **content**, not by rate. Zero offline dampening —
one dial, +12% exactly, no hidden second nerf.

**Five things found while modelling that are bugs, not tuning:**
1. **`G.skillMs` stores the RAW ms** (`startSkill` L1621; `actualMs` is a local, L1625) while
   `processOffline` divides by `G.skillMs` (L594). So a geared player already gathers **30-40% slower
   offline** — an invisible, gear-scaled offline dampener nobody designed. Same shape in the artisan path.
2. **Farming 99 is unreachable by ~40×.** 12 castle plots of Moonbloom = 3,120 XP/22h → **9.5 years**.
   Exempted farming from `PACE.xp` and specced crop XP **×14** instead. (Blocked on the already-filed
   crop-tier unlock conflict — Goldenroot/Emberfruit/Moonbloom are unplantable at every plot level.)
3. **Raw vendoring is the real economy hole.** Dawnstone Ore (v 1,400) at 300/h = **560,000 g/h**,
   6.7M per 12h offline — a maxed miner out-earns the *King* renown reward every 32 minutes, asleep.
   Specced `VENDOR_RAW_RATE = 0.20` on a single choke-point (`v` untouched, so market/recipe/collection
   math is safe). Puts gathering on materials, artisan on gold, and the player market on top.
4. **Mithril Rock is a rate regression** — 32,000 xp/h at req 60 vs Gold Rock's 33,429 at req 45. The
   ladder goes backwards on unlock. `ms` 9000→8000, plus a QA assertion that every rung beats the one below.
5. **`DAILY_GOAL_POOL` reads item-specific counters** (`collection.normal_log`, `collection.shrimp`), so
   "Gather 25 logs" and "Catch 15 fish" get *harder* the better you are — a level-90 woodcutter on
   Duskwood scores zero. Must move to aggregate counters before the goal retune.

**Fairness:** no level, item, gold, rank or unlock is touched; renown weights only ever RISE (raising
`totalLevel` 10→14 / `skill99` 600→900 rather than lowering `kill`, which would demote kill-heavy
veterans), plus a `renownHigh` ratchet so no future weight change can ever demote anyone. Founder's mark
(cosmetic, no power, `createdAt`-gated) for pre-retune saves. Mid-grind players are the sharpest edge and
the spec says so.

**Verified immune:** castle Labour (per-action, 400/day cap still fills in ~28 min) and farm growth
timers (real-time). **Verified broken independently:** Rested XP banks *grants*, not XP — 80 charges is
~6 minutes of play, and `PACE.xp` makes each charge worth less. Re-spec before any pillar grants potency.

No game files touched. Phase 1 = the constants + presence + the five bug fixes (one build, with the
regression list); Phase 2 = goal retunes and sinks.

### 2026-08-08 · b224 — "eating food is confusing" (beta feedback, branch `agent-food-ux`)
Played every path a player might use to eat. The confusion was not subtle and part of it was mine (b220).

**What was actually wrong**
1. **There was no Eat button.** Left-clicking food opens `openInvDetail`, whose `Eat 1` was gated on `typeof eatItem === 'function'` — and **`eatItem` has never existed in this codebase**. It has never rendered once.
2. **The one Eat affordance that was built is dead code.** `injectEatNowButtons()` required `.invc-tile[data-item-id]`, but `renderInvFancy` only sets `data-item-id` on *equippable* items and no food is equippable — empty intersection by construction. Confirmed live: 0 buttons with a bag of Provisions. Removed it and its orphaned CSS.
3. **The only working manual path was a right-click menu** — undiscoverable; a 500 ms long-press on touch.
4. **The prominent button was a lie three ways.** `Set Auto-eat` wrote `G.foodSlot`, dead since b134 (verified: `maybeAutoEat()` returns false after clicking it); it appeared on Feasts & Draughts, which b220 made permanently ineligible — **I mirrored that filter into the combat picker and missed this flyout**; and auto-eat is a 5,000g Store trait (b217) a new player does not own, unmentioned anywhere.
5. **So new players have no healing at all.** b217's own comment says "early game is manual eating (click food in combat)". That click target was never built. This single fact explains the report.
6. Bare `Auto-eat:` dropdown with no threshold/scope/empty state; Provisions and Feasts indistinguishable at point of use (both read `FOOD`, buff+duration never shown); `Ate X — buff applied` toast named neither the HP nor the buff; eating at full HP silently destroyed the item.

**Fix (clarity only — no new systems, no balance change)**
- `foodKindOf()` + `FOOD_KIND_META` in `data/items.js` — the presentation twin of `foodClassOf`, so provision/feast/draught can never drift from the auto-eat rule. Verbs: **Eat / Use / Drink**.
- `foodUseInfo()` in legacy.js is now the single source of food wording; the flyout, combat row, right-click menu, hover tooltip and qty slider all read it.
- Flyout: **Eat/Use/Drink is the primary button** with its effect on it; meta reads Provision/Feast/Draught; buff + duration shown; one honest sentence about auto-eat's real status; auto-eat offered only when true (Provision **and** trait owned).
- `eatFood()`: refuses a Provision at full HP and keeps it (`opts.force` escape hatch); a Feast is never blocked — it is spent for the buff. Toast now states `+8 HP (48/99) · +5% Gather Speed for 2 min`, mirrored into the combat log.
- Combat: **a real Eat button** (best Provision, same rule as auto-eat's fallback), plus honest states for full-HP / no-Provisions / trait-locked, and a picker that only renders when it can actually do something.

**Ruling:** `foodClass` decides what the *engine* may spend; `foodKind` decides what the *player* reads. Neither touches item stats — the b220 fish-line ruling stands untouched.

Smoke **278/278**, 0 runtime errors, `bump-version.sh --check` green, no bump. Verified in-browser on :8156 across fresh + mid-game saves, all 5 flyout states and all 5 combat states.

**Handoff / not mine:** mobile combat is `display:none` on its parent container — arena, calc and log all collapse identically, pre-existing and orthogonal to this work (mobile is deferred, landscape-only).
### 2026-08-08 · Wave 3c — the ratification batch (6 rulings) + `homestead-deepening.md`

**The six rulings.** Read the implementation before ruling on every one; none were surveys.
- **§8.6 vs §5.2.** §5.2 is normative and stands. Median of 100/500/1000/5000 is 750, so the 100-damage contributor is at 13% — *below* the 20% Partisan floor, i.e. **no chest**, not Partisan. §8.6's table was the arithmetic error; corrected in place, with the two edge rungs (150 = exactly 20%, 300 = 40%) added so the floor is pinned rather than inferred. `raids.js BANDS` and `raid_claim` both already match §5.2 exactly.
- **Hunt-forged kit.** Stats audited slot-by-slot against `ARMOUR_SLOTS`: every piece continues its own curve at 1.33-1.35×, the same step Dawnsteel takes over Emberforged. Ratified. Values ratified too — 2.5× is *below* the ladder's own 2.77× `tier.value` step, so the kit is priced conservatively. **But the level gates were inverted:** Dawnsteel needs `88 + lvOff` (helm 93, legs 96, body 98), and the Hunt pieces shipped at 92/93/95 — a player at Smithing 95 could forge the best platebody in the game but not the second-best. Re-ruled to 94/97/99 (+ girdle 91→92, which tied). **Band becomes Smithing 90-99, not 90-95**, and the best armour in the game now asks for a maxed skill *and* a clan — the two north-star pillars meeting on purpose. Missing boots ratified as deliberate (the sixth material bought the cape, a slot with two entries in the whole game; Dawnsteel Boots stay BiS forever). Tradeability kept — nothing enforces `bop`, and a soloist paying a clan is a good sink — so the positioning is corrected from "cannot reach" to **"cannot earn"**. Added a derived regression test (reads the Dawnsteel rung live from the recipe table, so a `lvOff` change moves both sides together).
- **`c_grace_days = 3`.** Ratified, and it is the right number: the largest window that still leaves 4 of 7 days, which is what the §3.3 pool tuning assumes. Verified the day index is week-aligned by construction (`% 7` and `/ 7` share one epoch) — do not "fix" it to an ISO weekday. Flagged the real issue: the Hunt week rolls **Thursday** UTC while castle upkeep rolls **Sunday**. Two reset clocks in one pillar; follow-up, not a reversal.
- **18,776 vs 18,780.** Formula wins; a table is a rendering of its formula, and a rendering that disagrees is a typo, never a second rule. Table corrected.
- **3 Phase-B reagents stay catalogued.** The `phase` field is precisely what lets a route be declared-but-not-live; deleting them drops the 34-route invariant to 31 and turns a clean regression into a special case — which is *how "every drop has a job" became false the first time*. One binding condition added: no surface may render a `phase:'B'` route as actionable.
- **Muster guest-solo-join ratified**, and I rewrote my own §4.5 Guests row to match. The sign-in gate was written to protect the *community* layer, and the implementation protects exactly that (no bar, no median, no Seal, floor band only, labelled). Hard-gating would have aimed #15's deliberately-visible topbar countdown at a locked door, for exactly the player it exists to convert — which contradicts my own "no *you missed it* state" rule.

**`docs/design/homestead-deepening.md` — the personal pillar.** Grounded in `homestead.js`, `workers.js`, `farm-progression.js`, `ROOMS`/`renderHouse`/`upgradeRoom`/`getBonus`/`harvestPlot`/`doArtisanAction` in `legacy.js`. Five-rung ladders on all 8 rooms + 3 new rooms; L4 gated at property tier 3 and L5 at tier 4/5, which is the fix for the property ladder's dead end (today tier 5 unlocks *nothing* — 150,000g and Dragon Scale for two plots and a stat line).

- **Cellar ruled: repurpose, don't enforce.** `getBonus('storage')` is read by nothing and no inventory cap exists anywhere. Enforcing it would mean inventing a limit every save is already over and shipping a *restriction* as a feature payoff. Repurposing is free because **no player can be worse off** — nobody ever received the thing being removed. It becomes the room where things keep: food-buff **duration**, via `registerBuffScaler` (b222 SEAM 2), which needs **zero new machinery** — that seam was built for a second consumer and this is it.
- **The Library's ladder deliberately stops raising `allXP` at L3**, and this is the spec's most important number. Recomputed the ceiling honestly: **+52%**, not the +47% in `clan-overhaul` §8.3 — that figure omits the homestead property capstone. Eight points of headroom against the 0.60 fuse is the fuse working, not room for two more rungs. So L4/L5 pay in **Rested XP** instead, consuming `G.restedXp` (b222 SEAM 3), which banks 80 charges of offline time and is **inert today because `getBonus('restedXp')` is 0**. Highest-value rung in the spec: costs one number, adds nothing to the XP ceiling, and turns eight hours of being away into a reason to come back. Raised the new cross-pillar conflict it creates — Library + castle Common Room both grant it and `getBonus` sums — and clamped it: **two roads, one 0.50 ceiling.**
- **The material-only yield law.** Extra-output perks may fire only when `!ITEMS[out].type`. The vendor pays full item `v`, so a 20% roll on a Slagheart Platebody prints 270,000 gold; on bars it just means a better forge. Applies to the castle too.
- **Speed rungs cap at +60%** because `actualMs = ms × (1 − speed)` breaks at 1.0 — homestead 0.60 + clan 0.05 + castle 0.05 = 0.70, with a 0.85 fuse. Top rungs pay in **yield**, which is the better reward anyway: an extra Cooked Shark is a thing you see, "+15% faster" is a thing you believe.
- **The Great Hall (Phase 3)** is the room the Castle tier never had, auto-granted free at Castle carrying the existing +5% so nobody re-buys a bonus they hold. Same name as the castle's first room, one built by a person and one by a clan — the twin-pillar directive made literal.
- **Found while grounding the Garden — P1, live, unrelated to any spec:** `farm-progression.js TIERS` never unlocks Goldenroot / Emberfruit / Moonbloom (b215 crops at farming 62/75/88), *including at MAX plot level*, and `canPlantCrop()` is a hard gate. **Three crops, three seeds and two cooking recipes are unreachable at every plot level; farming's last 37 levels have nothing to plant.** Five-line data fix. Also found: the Scarecrow's `farmYield: 0.1` floors to 0 (same class as the Cellar), and six ghost bonus keys are rendered in the House bonus display by nothing.

### 2026-08-08 · Wave 3 prep — clan-overhaul **v2**: the Clan Seat, refined onto Hearthrise
Tyler supplied "The Clan Seat — A Complete Castle Progression System" (Melvor/Idle-Clans scale) with the direction "add a lot of these concepts that fit, refine it so it fits Hearthrise". Rewrote `docs/design/clan-overhaul.md` as v2 (supersedes v1 in full) and amended `docs/design/clan-boss-events.md` (§3.3, §5.4, §9, new §10, §11). Docs only — no game code, no schema.

- **Found and killed a structural bug in my own v1.** `clan_contribute` computes `10000 × 4^(level−1)`, so clan level 10 = **655,360,000 gold**. v1 gated castle tier 5 on clan level 10 — an unreachable gate — and also had the same number acting as both accumulator and wallet. v2 moves progression to a new pooled currency (**Standing**, never decays) and demotes clan level to cosmetic. (`clans.js` L17-19's threshold comment is also wrong, a third different ladder.)
- **Currency call: two new stored + one transient, and no Clan Coin.** Standing (clan, permanent, gates tiers) + CP (per-member, **12%/week lazy decay** — no cron, computed on read) + Labour (transient, fuels the active Work Order). Gold treasury *is* Clan Coin; a second fungible clan currency only raises an exchange-rate question whose honest answer is a rename. The doc's "Renown" had to be renamed **Standing** — Hearthrise's meta-spine is already called Renown and two of them on one screen is a UX failure before a pixel is drawn.
- **"The castle refuses raw materials" is nearly free here** — Hearthrise already refines logs→planks and ore→bars. Four new goods carry the whole spine: `timber_beam` / `iron_fitting` / `field_ration` / `keystone`, all `tag:'castle'`, margins checked against real `v` values (+43/+33/+22/+8%). Refining is only mildly profitable in gold on purpose; the real payment is CP.
- **Recounted my own backlog note and it was low: 34 recipe-less drops, not ~25** (computed drop-set ∩ recipe-input-set over the live tables). All 34 routed in v2 §4.4. Two become the binders that hold the castle together — **Slime Gel** (a resin; 80% off tier-1 slimes, the most available junk in the game) for Beams and **Bone Chips** (bone ash for case-hardening — real metallurgy, not invented flavour) for Fittings. A level-3 player farming slimes is now materially useful on build day, which is the doc's first pillar made literal.
- **Labour maps onto `updateDaily`** — the same seam the Muster wraps (`muster.js` L1019-1030), same retry-until-defined + own idempotency flag, same 30s flush. `LT = 0.5 + skill_level/99` kept verbatim: a 2× gap between level 20 and 99, not 40×. **Rejected the doc's "On Site" toggle** — a mode you forget to enable, in an idle game, is the exact "that reward doesn't matter" bug; the choice moves to *which* Work Order instead. Added a **400 Labour/member/UTC-day cap**, enforced by the schema (PK `(order, user, day_key)` + a CHECK), so attendance is the currency and one insomniac can't complete every order.
- **Siege vs Hunt reconciled into one pillar.** Rejected the real-time Siege (no live shared combat instance — `simulateStrike` is an offline 120-tick sim for one player; roles would be a fake) and kept its two best parts: **Blueprints → castle tiers 4/5 require a Hunt clear in the last 28 days** (`clan_raids.downed_at` already exists, gate costs one `where`), and **Hold the Gate** as a Phase-B Hunt modifier whose failure state is the *existing* Strained upkeep state. The word "Siege" survives as the modifier's name. Also added Standing to the Hunt chest table (flat per kill, **not per claimer** — else a 40-member clan pays itself 40×).
- **Biggest rejection: the Grounds district.** Passive generators (40 → 3,200 logs/hr, offline, forever) are a server-side faucet creating resources from nothing, and they devalue gathering — the core loop. Phase-B counter-design: the Sawmill is a **converter, not a creator** (deposit 500 logs → 100 Beams over 4h).
- Also rejected: stone/clay/glass/hide lanes (no stone gathering exists), brewing-as-a-skill, **tipsy stacks** (an accuracy debuff in unattended combat is a trap the player cannot observe), stations/one-station rule (needs presence infra), Clan Tools + Loan Rack, prestige, grand projects, caravans, NPC workers, and seven `role` values (the doc's real insight — Steward/Marshal must be different people — is preserved with one nullable `charge` column).
- **Power budget stated as a hard rule.** ≤+25% aggregate at Phase-A max, ≤+60% at tier 10, ≤+10% per key, ≤8% per building, and **no content is ever castle-gated** — every castle perk is throughput, never access. Recomputed the unmanaged `allXP` ceiling as **+72%** (v1 said +57%; it omitted the Great Hall). The auto-level `PERKS` re-scope drops it to +47%, and I'm recommending a non-binding `allXP ≤ 0.60` fuse.
- **Honesty note I refused to fudge:** `clan_deposit` cannot verify item possession — there is no server inventory. v2 §12.3 states the real position (*server-authoritative for currency, gates, rewards and rate; client-trusted for possession, clamped and audited*) rather than claiming full authority.
- Phase A = tiers 1-5, six buildings (Great Hall / Treasury / **Tavern** / Sawmill / Smeltery / War Room), Work Orders, upkeep→dormancy, distinct-contributor + 72h gates. The **Tavern is why Phase A is worth building**: Feasts (20h cooldown, deliberately not 24h so Last Call drifts across timezones) and **Rested XP** — the one mechanic that pays a player for the time they weren't playing, which is what stops small clans bleeding their casual members.

### 2026-08-08 · Wave 2 — BUILT #12: artisan taxonomy + cooking split · branch `worktree-agent-a0097502fcbf068d2`
Implemented my own Wave-0 spec. Files: `src/data/items.js`, `src/data/recipes.js`, `src/main.js`, `src/features/auto-actions.js`, `src/features/activities-grid.js`, `src/legacy.js` (block 27 artisan render + two auto-eat surfaces), `src/features/smoke-test.js`, `docs/design/crafting-cooking-taxonomy.md`.

- **Derivation holds exactly as specced, zero authoring.** `recipeCategory()` / `categorizeRecipes()` in `recipes.js` classify from `output.type` + `_bar`/`_plank` suffix + `foodClass`. Live counts: smithing 9/16/42/14 = 81, crafting 7/14/4/2/7/1 = 35, cooking 13/14 = 27. **0 uncategorized, union == full list on every skill.** (Spec guessed crafting ~45; it's 35 — my estimate double-counted the generated bow/staff ladder against the hand-authored rungs it skips.)
- **§5.4 ruling: the fish line KEEPS its buffs.** `foodClass` governs what the ENGINE may spend, not what stats an item has. Stripping +12% damage off Cooked Shark is a combat-balance change wearing a taxonomy costume, and it isn't needed — `maybeAutoEat()` heals and decrements, it never calls `applyBuff()`, so an auto-eaten Provision grants no hidden power. Full reasoning + the edge cases (roasted_carrot → Feast despite 5 HP; baked_potato/wheat_bread → Provisions; moonbloom_elixir is the first *draught*) written into taxonomy §5.4. CONFLICTS entry moved to Resolved.
- **The real bug the split exposed.** Auto-eat's fallback preferred food with `!it.buff` — and since EVERY cooked food carries a buff, that meant raw ingredients: it ate Raw Shrimp (3 HP) over Cooked Shark (42 HP), then reached for a Void Banquet once raws ran out. `foodClass` fixes both ends. Also closed the two UI leaks that let a player *select* a feast for auto-eat (combat picker, inventory tap) and then watch it never fire — a promise the engine can't keep is worse than no option.
- **Found while building:** `renderArtisanActivities` (legacy ~6763), which the spec named as the render site, is dead code — `window.renderSkillDetail` is replaced by the activities tile-grid (legacy block 27, mirrored in `features/activities-grid.js`). Built there instead; both twins patched so they can't drift, with the shared strip published as `window.HearthriseArtisanCat`.
- **Latent staleness fixed in passing:** the panel's cheap `lightUpdate` path never repaints tiles, so a level-up left newly-unlocked recipes greyed out until an unrelated event forced a rebuild. Skill level is now part of the render key — which the category "unlocks at Lv N" hints made visible, and which was already wrong for tiles.
- Verified on :8143 — category switching, filtering, persistence across `addItem`/`updateTopbar`/12 ticks, cooking Provisions vs Feasts & Draughts, and auto-eat refusing a bag of only feasts at 8/100 HP. Smoke 192/192, 0 runtime errors, console clean. Did NOT bump build version / CHANGELOG (Coordinator does at integration).

### 2026-08-08 · Player-journey audit (READ-ONLY) — `docs/reports/AUDIT-2026-08-08-player-journey.md`
Played the full new-player journey against b224+wall on the main tree (local serve :8158, harness seam per `tests/run-smoke.mjs`): gate impression → FTUE → first 5 min → first 30 min → a simulated 9h offline gap → session 2 → mid-game surfaces → social/economy/retention. 16 findings, 1 P0 / 8 P1 / 5 P2 / 2 P3. No game files touched.

**The P0 is a product-thesis problem, not a tuning one.** `processOffline()` → `doSkillAction(true)` runs offline gathering at *exactly* the active rate (the code says so: "no dampening"), capped 12h. Verified: a fresh account left on Normal Trees for 9h returned at Woodcutting 62 / 301,383 XP / 16,110 logs / renown 310→1,138 — identical to 9h of playing. We shipped an account wall to make this an online realm while the core loop pays full rate for absence. Recommended fix is **additive** (an online-presence bonus on the gather path, generalising `muster.js`'s `LIVE_XP_AURA`), never an offline nerf — and it must be reviewed against the +52% `allXP` ceiling in CONFLICTS.

**Other findings I own:** two disjoint quest systems where Home's "View" CTA opens a modal that doesn't contain the quest it came from; the FTUE teaches navigation and ends with the player idle; the muster topbar pill is a pulsing gold countdown with no subject ("LIVE · 25:47 left"); renown never explains how it is earned and starts a fresh account 77% of the way to Serf; the bounty board's entry offer is three ~90-kill grinds; the collection log is 311 anonymous "?" tiles; Events is six locked doors with no key sources shown; activity/monster cards never name what they produce or drop; the farm's first action is a 4h no-op in untaught vocabulary (Deeds / watering); the session-2 return stacks three overlays over a toast pile that buries the player's first pet.

**Bug found while playing (→ Systems):** `ftue.js` `renderStep()` attaches a capture-phase `autoAdvanceOnClick` listener to the step's nav tab and only removes it when *that* listener fires. Advancing with the card's Next button leaves it armed, so completing the tour and then clicking **Skills** throws an uncaught `TypeError` at `ftue.js:352` (`rootEl` is null) — captured by Sentry with a real release tag. `advancing` is set true on the line before the throw and never reset, permanently disabling `next()`. Repro'd every run. Fix: remove the listener in `next()`/`endFTUE()` + guard `if (!rootEl) return;`, with a regression test that completes the tour, clicks Skills and asserts no pageerror.

**Verified as already-fixed, not filed:** artisan category lanes (#12) are live (Smelting/Weapons/Armour/Tools/Castle Stores); the harvest daily now scales with `farmPlotCap()` (b220); `glyphs.js` correctly swaps almost all emoji — the leaks are the rank-up modal's 🎉 hero art and the Quests modal's 📊.

### 2026-08-08 · Wave 1 — design specs (#13, #15+#14, #16)
Three more buildable specs in `docs/design/`, no game code touched. Grounded in `farm-progression.js`, `auto-actions.js`, `homestead.js`, `world-events.js`, `raids.js`, `clans.js`, `dungeons.js`, `nav-consolidation.js`, `home-dashboard.js`, `schema.sql`, and the farm/daily/combat/topbar code in `legacy.js`.

- **farming-watering.md** — watering becomes a **2h growth window at 2× rate**; the window mechanic self-caps the benefit at exactly −50% (`W ≤ hours/4`), so no extra cooldown or charge counter is needed. Key finding: watering is a **mandatory gate** today (`elapsed>=hours && p.watered`, no timeout) so **auto-replant is a trap** — it plants dry and the plot stalls forever; a dry plot also renders no % and no bar, so the stall is invisible. One derivation function `growthHours()` with a `min(bonus, elapsed)` clamp makes 2× a hard invariant. Migration: `watered:true → waterings:[plantedAt]` (strictly better), `watered:false → []` (un-sticks every stalled plot). Also fixes "Harvest 25 crops" — the daily pool entries are factories evaluated at generation time, so goal becomes `max(10, 3 × farmPlotCap())`.
- **world-event-cadence.md** — today's "world events" are a **passive `getBonus` wrapper**, not joinable, so #15 is a new activity layer. Two layers, one name: the ambient **Blessing** (all day, everyone — the fairness valve) + the **Muster** (45 min, 2 slots/day, join 1). Fixed UTC **01:00 / 13:00** — 12h apart means every inhabited offset gets ≥1 slot in 09:00-23:00 local, and since you can only join once, one convenient slot is *sufficient*. The two slots derive different events, so once/day becomes a **choice**, not a restriction. Join enforced by PK `(day_key, user_id)`; server re-derives liveness from `now()`. Topbar pill in 7 states (no "you missed it" state). Discoverability: the Dungeons nav button is **injected then CSS-hidden** (`theme-cozy.css:268-271`), absent from mobile entirely, and the clan raid card lives inside that hidden panel → restore one top-level **Events** destination.
- **clan-boss-events.md** — **extend the weekly raid, don't build a parallel loop.** Derived expected strike damage from the real combat formulas (~1,200 entry → ~8,000 max): the flat 250k clan pool is **unwinnable** for a normal 10-person mid clan even at perfect attendance (203k), and the 30k solo pool is unwinnable below CL61. Fix = `pool = TIER_BASE + TIER_PER_MEMBER × members_at_declaration` across a 5-tier ladder gated by `castle_tier`, so freeloaders/alts *raise the pool* and become a visible cost. Rewards banded against the **median contributor** (size-independent), min 2 strikes, partial credit up to 0.6×. No scheduled rally window (timezones) — social moment via The Faltering / Killing Blow / First Blood. Corrected my own backlog note: the solo "one-tap" is a tamper hole, not a balance one; the real bug is the opposite.

**Live exploits found in production while reading `raids.js`/`schema.sql`:**
- **P1** — the 1-strike-per-day limit is client-side only (`G.raids.lastStrikeDay`); `raid_strike` has no day check. Unlimited strikes from a tampered save.
- **P2** — chest-hopping: `claim()` pays the full chest to any contributor and join/leave is open, so you can join a near-dead clan pool, strike once, claim, leave, repeat.
- **P3** — solo claim flag `st.claimed[wk]` is local-only; a save edit re-grants.

### 2026-08-08 · Wave 0 — design specs (#10/#11/#12)
Wrote three buildable specs in `docs/design/` (no game code touched). Grounded in actual source: read `clans.js`, `renown.js`, `raids.js`, `schema.sql`, `recipes.js`, `items.js`, `gear-tiers.js`, `skills.js`, `renderSocial`/`renderArtisanActivities`/`ROOMS` in `legacy.js`.
- **clan-overhaul.md** — castle-progression fantasy. Key finding: `clans.upgrades jsonb` + `castle_tier int` columns already exist in schema, UNUSED → clean hook, no destructive migration. Castle = shared homestead (mirror `ROOMS`). Great Hall (`castle_tier` 0-5, member cap + gate) + 6 buyable wings (perks via existing getBonus keys, one NEW key `raidPower`). Weekly collective objectives (server-counted). Panel = a PLACE; management in modals (reuse `hr-rn-scrim` pattern). Gold-only treasury sink for v1.
- **leaderboards.md** — always-show-your-rank + nearby rivals (fixes #1 demotivator); Throne/Renown flagship board (needs `snapshot.renown` surfaced); per-skill ×15; boss/raid; Climbers monthly season; matview `leaderboard_ranked` for scale; cosmetic titles + gems (no tokens).
- **crafting-cooking-taxonomy.md** — categories DERIVED from existing fields (no hand-tagging 135 recipes). Smithing: Smelting/Weapons/Armour/Tools. Crafting: Sawmill/Weapons/Armour/Jewellery/Tools/Ammunition. Cooking split via new `foodClass` flag: Provisions (13 healing) vs Feasts & Draughts (14 buff/drink) — full item→class table delivered. Sub-tabs (reuse `data-lb`/`data-house` pattern).

**Semantic conflicts flagged for CONFLICTS.md (Systems):**
1. Perk stacking — homestead+renown+clan-level+clan-wings all funnel getBonus; allXP could hit ~+57%. Recommend re-scoping the clan auto-level PERKS to baseline-only + a per-key soft cap. (clan-overhaul §7)
2. `raidPower` is a new getBonus key raids.js must consume. (clan-overhaul §4.3)
3. Auto-eat must filter to `foodClass:'healing'`; fish-line incidental combat buffs blur heal/buff line — balance call I own. (taxonomy §5.4)
4. Leaderboards need `snapshot.renown` written client-side on save. (leaderboards §3.2)

### 2026-08-08 · bootstrap
Domain seeded. No active task.

### 2026-08-09 · Character/Skills screen rework — PLAN (docs/design/character-skills-rework.md)
Read-only plan per Tyler's directive + guardrail. No game code touched. Mapped every widget on the two live screens to file+region+function before writing.

**Key discoveries (from reading the actual code, not the memory):**
- The live **Character screen is `character-page.js`'s ESM `renderCharacter`**, not legacy's. `main.js` (deferred module) calls `setupCharacterPage()` AFTER `legacy.js` runs, so it **overwrites** legacy's `renderCharacter` (7173) + `applyCharExtensions` (9107) + `buildActivityCard` + the `.char-skill-card` patcher — **all of that legacy path is dead code.** Don't "preserve" it.
- The character-page **"Your Heroes" (`buildSlotsCard`) is a FAKE** — a static 3-slot paywall mockup that doesn't read `multi-character.js` and can't switch characters. The REAL switcher is the topbar-avatar drawer in `multi-character.js` (`openCharacterSelect`/`wireAvatar`). Plan CUTS the fake (Final Directive) and moves the real selector to Home.
- The **b218 equipment doll (`buildTibiaDoll`, `_tdPane` Equipment/Stats/Companion) lives in `#panel-inventory`**, not Character — Character only shows a summary card with "Manage gear →" jumping to inventory. Plan promotes the doll into a real Equipment sub-tab (reused whole).
- `switchSlot` does `location.reload()` by design (monolith has no hot save-swap) — preserved.

**Chosen sub-tab structure: Skills · Equipment · Hero** (Skills default). Reasoned in §2.1: Skills leads (it's what the game is about + what Tyler featured); Equipment stays first-class per directive #3 (reuse the doll seam whole, companion comes free); Hero absorbs identity + combat cards + rates + the OSRS Account stat grid; Companion stays the doll's 3rd internal pane, not a 4th top-level tab; Renown stays on Home (don't fork the meta-spine).

**Skill tiles = doors via the EXISTING seam** — `openSkillDetail(id)` (which already short-circuits combat→Combat, farming→Farm) + `HearthriseQuestNav`. Invented no routing. b220 lanes + b227 quest "Go" move with `#skill-detail` unchanged.

**Nav fold = re-point, don't delete.** `showTab('skills')` becomes an alias (via a chained wrapper) → Character + `_charPane='skills'` + `openSkillDetail`. Keep `#skills-list`/`#skill-detail`/`#skill-detail-title` in the DOM or activities-grid.js goes blank. Retarget the FTUE `[data-tab="skills"]` step (coordinate with the already-filed FTUE listener-leak P1 fix).

**Coordinator addendum handled** — Account stat grid, each mapped to a real source in §5: Combat Lv `getCombatLevel()`, Total Lv `getTotalLevel()`, Total XP ΣG.skills, Quests `(G.quests||[]).filter(q=>q.done)` (+flagged the stale `G.quests.list` read at legacy.js:9549 and that lifetime-incl-dailies would need a new counter), Achievements `ACHIEVEMENTS`×`G.achievements[id].unlocked` (real system at legacy.js:7698 — honest 1:1, not Chronicle/renown), Combat Tasks `G.bountyHunter.completed` (legacy.js:646, confirmed), Collections `HearthriseCollection.getStats`, **Time Played → NO counter exists** (only createdAt/lastSeen) → spec'd new tick-driven `G.stats.playMs` reusing b226 presence, OMITTED until built, never faked.

**Migration-safety table: 38 items** — ~26 preserved, ~9 moved/merged, 3 cut (fake paywall slots, standalone Skills nav button, dead legacy renderCharacter path), + 8 stat rows (7 real, 1 new-work).

**Top-3 breakage risks:** (1) the `skills`→`character` alias silently freezes the live XP bar because hot paths gate on `activeTab==='skills'` (legacy.js 2401/2823/8151) → broaden to `isSkillsVisible()` helper + a live-progress test; (2) sub-tab snap-back (the b218 bug reborn) → copy `_tdPane` persistence into `window._charPane`; (3) `showTab` wrapper-chain ordering + deep links → install the alias last as one fresh wrapper, keep the skill DOM ids, regression-test every deep link.

**Sequencing:** build AFTER `bonus-rebase` (b228) + `rally-v2` merge. The real collision is `home-dashboard.js` (rally-v2 edits "The realm"; we add "Your Heroes" — land it as a new self-contained function after they merge). character-page rates read `getBonus` (numeric-only impact from b228, no structural collision). Phase 1 = combined screen + Heroes-on-Home behind existing render seams; Phase 2 = OSRS-grid art + Time Played counter + doll/Hero stats de-dup. Full test list (baseline + new) in §7.3.

**For Tyler's reaction:** the sub-tab order (Skills default) and the CUT of the fake paywall "Your Heroes" are the two calls most worth confirming before build.

---

## 2026-08-16 · Review Book REVISION 2 — taxonomy from Tibia, roster rewrite, ember rework, vampire dungeon

**Files:** `docs/design/review-book-content.md` (rewritten Library 1, revised 2 + 4, new Library 5),
`docs/design/events-donations-and-voting.md` (REVISION header + §2.2/2.3/2.5/4.4/6/7/8),
`docs/design/monster-art-prompts.md` (new, 85 prompt lines), `tools/gen-review-book.mjs`,
`docs/design/review-book.html` (regenerated). **No `src/`, no `supabase/`.**

**What I learned / what future-me should not re-derive:**

* **`gen-review-book.mjs` was silently platform-dependent.** Every anchor/fence regex is written
  against `\n`, but git checks these docs out **CRLF** on Windows (`core.autocrlf`), so
  `/```\n/` never matched and §2.3's threshold block failed to parse the moment the events doc was
  touched by an editor that preserved CRLF. Fixed by normalising on read. The "output is
  deterministic" promise in that file's header was only true per-platform before this.
* **Section §1D would have poisoned the last monster group.** The monster parser slices `## 1C` →
  `# LIBRARY 2` and then collects *every* `|`-line in each `### ` chunk, so a table under a `##`
  heading inside that range gets absorbed into the preceding category's card list. The slice now
  ends at `## 1D`. Any new table between 1C and Library 2 must live under its own `##` **after**
  that boundary, or it becomes monsters.
* **Ids are load-bearing, category prefixes are not.** `MON-BEA-*` is now Mammal, `MON-ARC-*` is
  Human, `MON-VOI-*` is Extra Dimensional. Do not "tidy" the prefixes — the id is the approval key
  and (later) the save key; the letters in the middle are history.
* **Guards added to the generator** so this revision cannot silently rot: 11-class whitelist,
  no `MON-FEY` id reuse, no "Blight" in any live row (prose history is allowed), and exact counts
  (81 / 38 / 10 / 6 / 6).

**HANDOFFS raised:** Art Director + Asset Director own `monster-art-prompts.md` (Style B, 256×256,
identity + style fit are the two checks a prompt cannot enforce). Systems owns the ember-valuation
contract (`blessing_catalogue.embers = v`, `donatable = NOT super_rare`), the 2.5× threshold/cap
re-scale, and the seeded 50/50 tie flip.


---

## 2026-08-23 — b465 · THE VOICE PASS (the writing half of "does this read as AI slop?")

**Branch:** worktree `agent-a54fd6e995b15acd8`. **Not bumped, not pushed.**
**Suite:** baseline **1013/1014** → final **1019/1020** (+6 tests). The one failure,
`DAILY-HEAL-1 (b461)`, is **pre-existing** — it fails on the untouched base. 0 runtime errors.
**Mutation-verified:** re-planted all three headline defects at once; `VOICE-1`, `VOICE-2` and
`VOICE-3` each failed with the right message, and the existing `b371 (F20)` guard corroborated the
price one. Restored, re-ran green.

**THE VOICE CARD (derived from the away card, the death sheet, the b459 tour, the item descriptions
and the stonecraft headers — the best copy we already ship):**
1. **Second person, present tense, plain.** "Any tree, any tier." Not "The player may gather logs."
2. **Say what is TRUE of the engine, and only that.** Every line is checkable against the counter,
   the flag or the table behind it. A sentence we cannot verify is a bug we have not found yet.
3. **A line earns its space by telling you something the label does not.** If it restates the name,
   delete it. Filler is worse than blank — blank at least does not lie.
4. **Warm, dry, never exclamatory.** One wry beat is allowed ("the axe does not care which"). No
   "!", no ALL CAPS, no emoji standing in for a noun.
5. **Never our vocabulary.** No ids, no field names, no error codes, no "schema", "record",
   "envelope", "seam", "chars", "UI". Names come from `ITEMS` / `SKILLS_DEF` / `MONSTERS`; prices,
   levels and quantities are DERIVED from the data, never typed into a string.

**What I learned / what future-me should not re-derive:**

* **`window.itemName` and `window.skillName` DO NOT EXIST.** Both are block-scoped function
  declarations inside `legacy.js` IIFEs. Any renderer in another block (the quests modal is block
  40; `itemName` is in block ~16) must read `window.ITEMS` / `window.SKILLS_DEF` directly. A bare
  `typeof skillName === 'function'` guard there silently falls through to the raw id — which is the
  defect, reintroduced by its own fallback. That is exactly how "5x small_bones" survived.
* **The quests modal's Daily/Weekly tab is MODULE state that outlives the overlay.** A test that
  clicks Weekly and closes the modal leaves `currentTab='weekly'`, and the NEXT test (b227's
  Go-button guard) then reads a weekly row out of the daily pool. Any test that switches tabs must
  put it back — mine do, in `finally`.
* **`balanceOf(G,'gems')` is `known:false` while signed out**, because gems are server-of-record and
  the record has not arrived. So an affordability check must have THREE states, not two: yes / no /
  unknown, and **unknown abstains**. Telling a player "not enough gems" when we simply have not been
  told the number is the bug `balShortfall` already exists to prevent. `slotRows().afford` is
  `true|false|null` for exactly this reason.
* **`hr_claim_goal` does NOT derive today's offered goal set** — it verifies completion and
  catalogue membership only. That is what makes withdrawing a client pool row safe: a goal never
  offered is never claimed, and its catalogue row sits harmless. (`hr_daily_task_set` — the OTHER
  goal system — *does* derive the set, and is bound by `tests/goal-catalogue-drift.mjs`. Do not
  confuse the two.)
* **Burnt cooks genuinely do not count.** `artisan-sim.js` returns an empty `progress` on a burn, so
  "Burnt dishes do not count" is a true statement, not a guess. Runecrafting and Stonemason DO count
  as `crafted` (`BENCH_COUNTERS`), which is why the weekly craft goal says so.
* **A designer ruling can be a comment.** `gold_500`'s withdrawal is a commented-out pool row with
  the reasoning and the exact two-file restore recipe beside it. The next person to want it back
  does not have to rediscover why it left.

**RULINGS MADE (delegated design authority):**
- **`gold_500` is withdrawn from the daily slate** until its reward is authored on both sides. A
  quest that cannot pay must not be dealt. Restore recipe in HANDOFFS and in the code.
- **A surface may not advertise a countdown or a lit CTA for a feature behind `CLAN_LAUNCHED`.**
  Applied to the topbar rally pill (removed from the DOM, not hidden — a hidden countdown still
  ticks), the combat rail's Clan Raid card (`locked: 'Opens in Open Beta 1'`, the same field the
  dungeon and boss cards use), the Social signpost and the clan chat empty state.
- **An unaffordable or locked action is visibly disabled and names its reason.** Applied to the four
  companion shop rows (the only shop rows in the game that were not) and the hero-slot rail.

**HANDOFFS raised:** Systems + Coordinator own the `gold_500` payout (client row + the SQL seed, one
change) and the `xp:{combat:…}` phantom on three goals, plus the `spendMarks` charge-before-fail.
Art Director owns the surviving emoji — currency sigils in markup, the Homestead padlocks, the two
missing skill medallions (Runecrafting, Stonemason), and the inert `emoji:` data fields.

---

# 2026-08-30 — THE FULL BALANCE AUDIT (b495), ahead of the beta wave

Measured, not argued. Every number below came out of the shipped simulators run in Node
(`src/core/combat-sim.js`, `combat.js`, `progression.js`, `pacing.js`, the `src/data/*` catalogues)
against real fixtures, not out of reading the tables.

## What the first hour actually was

A fresh character is Attack/Strength/Defence 1, 10 maxHP (maxHp === the Hitpoints level, and the
kit's 1,154 XP is exactly level 10), a Bronze Sword, and 8 RAW shrimp (heals 3).

    foe               s/kill   dmg taken per kill   kills before death
    Slime               12.2          2.06                4.8
    Giant Rat           13.7          2.39                4.2
    Goblin              25.3          4.94                2.0
    Brittle Skeleton    27.6          5.37                1.9
    Scarecrow           31.5          6.14                1.6
    Wolf Cub            31.0          9.36                1.1   ← dies to the FIRST one

36 deaths in a measured first thirty minutes. But the P0 was AWAY, not attended: `simulateSpan`
BREAKS on the first death, so a brand-new player who left a fight running overnight was credited
**30 seconds of a twelve-hour night** — 0.1%, 23 XP, 0 gold. The idle pillar was off by default for
every new account, and no amount of "attended premium" explains it: `AWAY_RATE_MULT` is 1.00 and
gathering away is exactly 1:1 (verified — a 12h woodcutting span runs 9,000 actions at 4,800 ms,
the live interval). The 60–99% combat gap is ENTIRELY the death-stop.

## The three ruled causes, and why these three

1. **No food.** 24 HP of buffer against 4.94 HP per kill. → the food bridge (20 cooked shrimp).
2. **No auto-eat.** The trait gates ALL away healing. Auto-Eat I is 15 Marks, and Marks come from
   bounties you die in. b493's first-contract bracket (15–25 kills) softened the loop but did not
   close it. → grant tier I at creation (ruled, staged, needs a server start-unlock — (b)).
3. **The truncation tax.** `Math.floor(maxHit - defScore*0.03)` on an ALREADY-INTEGER maxHit is
   `maxHit - 1` for every monster with def ≥ 1. The authored 3%-per-point curve never ran; a flat
   −1 ran instead. At tier 1 that is 25–33% of the player's damage; at Dawnsteel it is 2%.
   Self-correcting by construction, which is why the fix is the expression and not a constant.

Post-fix, measured: Goblin 25.3s → 20.2s, 2.0 → 2.6 kills before death; with the ruled kit the first
away night goes 0.5 min → 13.5 min / 40 kills, and attended deaths in the first half hour go 36 → 19.

## Rulings recorded (full ranked list in the b495 report)

- **Food bridge**, not a food supply: 20 cooked shrimp = 160 HP ≈ 34 goblin kills. Enough for
  `first_blood` + a first-contract bounty + a first away night with no deaths; NOT enough to avoid
  learning fish→cook→fight. It runs out inside session one *on purpose*.
- **`foodSlot` starts filled.** `estimateSurvival` prices the away pool off it and `awayLineHtml`
  picks its whole sentence from it, so a null slot told a player carrying a bag of food that they
  would fall in five kills. Core's `chooseFood` already fell back to the best food in the bag — only
  the SCREEN was wrong, which is the worst kind of wrong.
- **`daily_harvest` floor 10 → 6.** Two plots of 4h turnips yielding 2–4 is ~6 a cycle, so a floor
  of 10 was TWO grow cycles (~8h) for a daily that resets at UTC midnight. 6 = one harvest round.
  Every tier above the camp is governed by `n*3` and does not move by a crop.
- **Bounty difficulty must move the COUNT, not only the reward.** `bountyCount` reads (type, tier)
  only, so `easy` was 15% less gold for an identically-distributed job — and `elite` was 75% more
  for the same job, i.e. free money for reading the board. Ruled multipliers
  `{easy .90, normal 1.00, hard 1.20, elite 1.50}` make gold/kill monotonic (3.00 / 3.20 / 3.50 /
  3.73 at T1) and turn difficulty into a commitment premium. Needs `hr_bounty_kill_range` to take
  the difficulty — a forward migration, so (b).
- **Workers: the "10% efficiency" is 16%.** `perTickMs = node.ms / eff` uses the UNPACED ms while
  the player runs at `ms × PACE.actionMs (1.60)`. A Lv10 crew of 6 is **1.65** active-equivalents
  against b389's own stated 1.03. Anchor to `pacedActionMs(node.ms)` on both sides. Break-even on
  worker #1 (500g) is 1–5 hours either way, so the correction does not make the first worker a bad
  buy — it makes the sixth one honest.
- **Defence is a DEAD STAT from Rune upward.** `monsterAccuracy = clamp(0.50 + (atk − D)*0.006,
  0.10, 0.85)` floors at D = atk + 66.7. A Rune plate set + Defence 60 is 213 against a T6 monster's
  86–105 attack, so it is already floored — Emberforged and Dawnsteel plate (two full material
  tiers) buy **zero** survivability. Watch-with-telemetry; the fix is a scale change to
  `monsterAccuracyPerPoint`, not a data row.

## The two structural findings the wave will not feel but the month will

- **Time-to-99 spans 26h to 1,098h.** Woodcutting 1,098 · Mining 1,068 · Fishing 1,050 · Prayer 417
  · Cooking 155 · Runecrafting 35 · Stonemason 35 · Crafting 26 · Smithing 27 (bench-only). Feeding
  the bench from gathering closes some of it (Smithing 444h true, Crafting 929h true) but the game's
  own xp/hr readout quotes the BENCH number — 521,089 xp/hr for Smithing 90 against 12,938 for
  Mining 90 — and that is a promise the ore faucet cannot keep.
- **The vendor is an unbounded gold faucet.** `vendorPrice` = `raw ? 0.2×v : v`, and NOTHING a bench
  produces is marked `raw`. `smelt_copper` is +33 gold per action at level 1 (14,583 g/hr full
  cycle); `smelt_mithril` is 112,500 g/hr; `craft_voidweave_body` turns 108 gold of silk and essence
  into a 75,600-gold item. Against ~4.22M of lifetime one-off sinks (property 202,900 + rooms
  2,872,500 + workers 1,093,500 + plots + companions) the whole economy is ~37 hours of smelting.
  Only the 25M/day server ceiling bounds it. The cloth line is the acute case and is a DATA bug:
  `GEAR_RECIPES` gives cloth `silk_thread: 2+i, magic_essence: 1..2` at EVERY tier while its value
  climbs 600×.

## Closed from the standing backlog (verified, not assumed)

- Cellar "+500 storage" — already repurposed to food-buff duration (`legacy.js` ROOMS.cellar).
- Solo raid pool — already `clamp(5 × your first strike, 20k, 200k)` frozen weekly, with a
  self-scaling `max(5000, pool × 10%)` strike clamp. The one-tap chest is gone.
- `deaths` — increments in `resolveDeath` since b325 (both paths, one loop).
- "~25 tier-3–6 vendor-trash drops" — down to FOUR ids with no job (`goblin_ear`, `goblin_totem`,
  `sticky_core`, `keystone`), and three of those are bounty-proof or a shop cost. The b356 wave
  closed it.
- "Harvest 25 crops" — b220 already made it scale; the residue was the FLOOR, fixed here.

---

# 2026-10-14 — GEM CONVERSION RULING (design/gem-conversion)

Full ruling and build split: `docs/planning/PRIORITY_BOARD.md`, section "2026-10-14 — GEM CONVERSION".

**Learnings.**
- Start any currency question from two lists: the wallet migration's own census
  (`2026-10-19-account-wallet.sql` §4) and the client census `src/net/gem-sites.js`. There is
  also a third path: `hr_apply`'s generic delta arm, which neither list names as a source.
- Four gem cosmetics (Golden Name, Emote Pack, Dragon Avatar, Phoenix Pet) are SOLD and have no
  renderer anywhere. A real-money shop cannot carry a row that changes nothing. They are off sale
  until each one renders.
- The Legend Pack (5,800 gems) is larger than the account gem day cap (5,000), so a real purchase
  would be refused. Caps built for earned drips must not meter purchases.
- Never replace an earned premium at a gold-per-gem rate. A server-set rate is a published gem
  price the player market then has to fight. Replace the moment, not the value.

**Handoffs raised (in the board's build split):** Security and Systems own lanes 1 and 4 (lane C).
The Art Director owns lane 2 (banner art and the Trophy Room render). Lane 3 is data cuts. Tyler
owns two finance items: the gem price of Premium, and dropping the Hearth Token SKU.

---

# 2026-10-24 — MARKETPLACE DESIGN (lane/d-market-design)

Full design: `docs/planning/PRIORITY_BOARD.md`, Decisions, "Marketplace design (2026-10-24)".

**Learnings.**
- Answer "is every copy identical?" from the table keys, not the item data: bag, worn, Storage,
  hunt bag and listing are all keyed by item_id with a qty. The one upgrade state (enchant) sits on
  the worn SLOT. Keep future per-piece state there and stacks stay fungible.
- Running-hunt reservation is structural: Enter moves whole supply stacks into hunt_bag, so any verb
  that reads only player_inventory / account_bank cannot reach them. Check the table before
  inventing a lock.
- A return path that is "never refused" plus a capacity that a sink sells is an exploit (list 1 unit,
  let it return, gain a stack past the cap). Fix: count pending returns as used room, in ONE
  capacity function that every writer reads.
- A price floor at the shop's bid is the cheap rule that stops buy-then-vend minting and caps
  gift-listing laundering at once; check bid coverage (508/508) before relying on it.

**Handoffs raised (in the section):** backend-architect lanes 1-2 (server + edge), Security the one
review before players, systems-engineer + art-director lane 4 (window/sheet), asset-director lane 5
(Weighhouse, Aldous Pell, icon). Systems + Art Director: the Storage window's client-only
"Leave the hunt to use it" line conflicts with remote market reach and Quick stash.

## 2026-11-03 lane/c-klappa-club (Klappa's Club, Tyler's tribute to Andy)
- A weapon's stats barely move XP/h early: Cleave and Power Strike deal flat damage and carry 60-70% of it (`dealtBy`), so Practice Club to Iron Warhammer is +2-5% XP/h, under the ruling's +5-8%. A big `strB` is a feel number here, not a band-breaker. Measure before fearing "busted".
- Sell all loot keeps a drop only if a recipe the hero can make NOW spends it (bag-model `madeInto`). A recipe above level 1 that names a Cellar drop loses the drop on the first trip home.
- `Equip upgrades` never touches the hands (`STYLE_SLOTS`), and the bench spends the bag, not the worn set: a reforge of a worn weapon leaves the hero empty-handed unless the words say so.
- Balance sim: two instances of `ITEMS` (bare and `?v=`); a what-if on one alone changes nothing. Patch both, or edit the row.
- Tiers (2026-11-05): a low ground's room is the gap between two Normals. Where it's under 20%, a bigger pull breaks the ladder at any XP, so the row moves stats only (Thicket). Read the rule per way to fight: AoE fails first, a fixed count hides it.
- `tools/balance-sim` holds its workers above 85% CPU (`--cpu`), so a 648-cell plan runs 3 to 80 cells a minute with other lanes up. Cell `ms` against wall time says which. It also resumes by id: a re-measure needs a new out dir.
- A mutant that makes every word play Deadly leaves base and word equal, so a digits-only compare can't catch it. Assert the pure lookup too (`tierRowOf`).

## 2026-11-06 lane/b-pace-final (the final pace re-measure before the wipe)
- `level-curve` C1's fingerprint covers grounds, monsters and the advice, never gear, bars or the engine: a set that moves combat stays green on a stale snapshot. Re-measure on the set, then judge.
- `pace.mjs --fit` pins the first Levels at exactly 2.00x, the C6 limit, so the next re-measure's noise reads 2.03x. Fit with `--bands 4:9:0:1.95` for room. `--fit-past` is infeasible while the held part breaks C6, and needs `--first-minutes 1.05` (the held first step rounds past one minute).
- A new curve file is rows only: 02-11 holds `hr_char_xp_for_level` as plpgsql, and a restated SQL body turns `settle-budget` SB-3 red.
- The careers' reference from 32 to 50 is the over-leveled Glade on Normal (86k), while Dangerous and Deadly there pay 1.4-2x with no death in 4 h. The pace is the default path's; the fastest honest hour is its own read, and it is far ahead.
- Under load, split a plan: a second pool on `--only "x=(R|M)"` into its own folder, and a reader that takes both (`pacefinal-table.mjs --in a,b`).

## 2026-11-08 lane/b-one-difficulty (Tyler: one difficulty for every group size, a small solo XP boost)
- A tier pull of 0 is not "the same for everyone": `densityFor` falls back to Normal's `partyPull`, so a four still pulls 4-6 where a lone hero pulls 2-3. Normal's party pull and the party HP scale (55% alone to 100% at four) are the two group-size differences left. Both are Normal's, named on the board for Tyler.
- The ladder breaks on pull, never on XP: at Wickstead a lone hammer at 16 read 79.8k on a pull of 6 and 98.1k on 8 against the Glade's 78.6k, and the XP dial would need x1.00 a kill to hold it. On the first three grounds any extra pull out-earns the next ground for an area hero. The rule that holds is by floor (`TIER_PULL_FROM_FLOOR`), not per ground.
- A solo boost in the party factor (`partyClassXp` for one living hero) reaches both paths with no engine change and stays out of `ev` (the live-event part), so a personal best keeps it. In `xpMultOf` it would read as an event.
- Lifting every mixed cell by the boost keeps every measured "vs alone" answer true at once. Only the one-class answers move (over 1.05, to the nearest 5). The cost is +5% absolute XP for mixed parties, and the Sewer's and the Warrens' fours were already over the pace contract.
- `tests/hunt-core/hunt-tiers.mjs` mutants on `src/data/hunt-grounds.js` never reached the rows case, which read the real module: pass the planted `G` in. A mutant that doesn't reach the module under test passes for the wrong reason.
- The party scale was a pace dial, not only a party one: at full HP and full yield a lone hero on the first grounds earns 28-73% more an hour (one-blow kills and the walk don't stretch with HP), every solo ground leaves the pace band, and a mixed four falls to 0.74-0.96x of him. Any "same pack for everyone" change re-tunes monster XP or party cells with it.
- `tests/hunt-live.mjs` LV-PULL viewed diverges from the server past about 600 s (23-43 of 93 commits off at 1,500 s) on the tree WITH the party scale too: a pre-existing prediction drift in long viewed runs, not this lane's. Raised to the Coordinator.
- Probe cells can take 5 minutes on a caster or a four while other lanes run, and the same cell's second seed is often 100x its first. Run probes resumable (one JSON line a cell, skip what's done), split long lists across two processes from both ends, and never load the edited tree for a "before" probe: `git archive origin/main` into the scratchpad.
- The re-tune (commits 3 and 4): a party's XP cell moves no blow, so one played run of `tests/party-class-xp-line.mjs --table --mixed` gives every cell's answer at any cell value by scaling. Except where a kill's share floors: a Cellar rat pays 15, a four's share at cell 1000 is 3.75 and floors to 3 (-20%). Re-measure the words after a cell move on the first grounds; never scale them.
- Two readings of "against solo": the sheet's (a head against the median lone way, 10-25 §5) and the Party window's (against the same heroes alone). A tank and a healer are the slowest heroes alone, so a tank + healer pair at the sheet's 1.10 reads +40-45% in the window. Tune to the sheet, measure the window's words, and say both.
- A data proxy for a ruling can go false when the world under it changes. `validate()`'s "one class never above the even share" meant "never above solo" only while a party fought a pack scaled to its size. Retire the proxy for the measured guard, with the mutation proof, in its own commit.
- Over-levelled farming is walk-bound and full-kill pay scales it: a lone 45 on the Glade kills 406 an hour for 9.3k gold against the Warrens' 119 kills and 5.7k (the Warrens pays 2.1x the XP). No coin dial separates it from the Glade's floor; a longer respawn bites the floor's 173 s lap too. Report it as a ruled trade-off, not a dial.
- Data rows carry mutant anchors in many guards: after a formula write, `tests/mutant-anchors.mjs` lists every stale one. Re-point them by script (old row -> new row, the mutant's own factor kept on the new number), then hand-check any absolute mutant ("a whelp pays like a Chief").
- Shell quoting eats backticks and `\d` in `node -e`. Write edit scripts to a file, or use Edit.
- When a ruling turns an AND bar into an OR bar (more gold OR more XP), every mutant that moved one side escapes. Re-aim each to move both, or it proves nothing.
- A guard that judges the same per-kill chance at two group sizes is judging kill speed. Judge one sample point and print the other.
## 2026-11-07 lane/d-live-events (timed world events from data, design only)
- The engine already has the per-hero XP seam: `xp-share.js` `sc.xpMultOf`, handed in as `combat-sim.js` `ctx.xpMultOf`, and nothing sets it. An event plugs in there with the kill's `atMs`, never as a tier row. Forcing a tier row onto the Normal-only Cellar changed its fights in the check.
- A career's chunk fixes the hero's Level (`cell.mjs` builds vitals from the start Level), so a Level XP dial is measured on careers by multiplying each chunk's settled Level XP. It is exact and cheap, and a hammer re-run matched `level-pace.json` to the hundredth. When C1's fingerprint matches, `level-pace.json`'s per-style careers are a free baseline.
- An XP bonus's pace cost is its share of hunting hours x its percent. +25% on every hour reads x0.805 at Level 50 and x0.81-0.82 at 10-25 (skills lag a little).
- +10% is below what a player feels. At the Glade at 24 the gap between a hammer (83k) and a mage (91k) is wider than +10% on either.
- Lane branches that insert at the top of the Decisions list collide. Insert a same-day section lower down (before the next dated heading) when another lane is writing the top.
## 2026-11-08 lane/d-area-spells (area spells, the party heal, effect settings: design and measure)
- A fair telegraph is one a free hero can step off, and a kiter is always free. So monster area spells are a melee and tank threat by construction: they can't make a lone kiter pay, and no dial I tried (2-3x spells, monsters 25% faster, a thrown basic) did. Ask what reaches each way to fight before promising risk for all eight.
- A windup costs the caster its swings. A spell under about 2x its blow makes a monster weaker (Squeal at 1.5x lifted a good bar 88% to 93%). Size spells against the swings they replace.
- Kill-the-caster-first is a fake decision when a caster outlives its windup (25-30 HP vs 1.6 s): measured no change, cut. Defensive stance is the strongest setup answer (16.3 to 1.25 deaths an hour), eat-on-cast adds to it (0.31).
- With melee hold, ranged step off, a party heal on 2+ hurt allies only wakes when two melee stand in the ring. Measure a party heal on a four with two melee, never on tank, healer, bow, mage (it never fires there).
- Slot conditions join with AND only (OR is for stop rules): an or-rule is two slots. A true/false metric negates by swapping " is " in its label, so every bool label must hold " is ".
- Bash guard blocks rm -rf inside a worktree (even tools/balance-sim/out): give a re-run a new out tag instead.
- (update, the same day) Whole-group spells are what reach a kiter: nobody steps out of one. On the table's lone pulls (lane/b-one-difficulty) a lone mage at Wickstead Deadly goes from holding to dying. Normal stayed at zero alone and in a four on every ground.
- Tyler's "waste a ton of supplies" is measurable: a Deadly four at the Glade lost 72% of its profit to a 1.5x group spell, and 30% element resistance took it back to -33%. Size group spells against the resistance a gear tier will give, and play the resistance point before the spell ships.
- Spring Tide can cost a fight: at the Chief (his damage lands on the tank) 160 mana on the party starved Greater Mend (75% to 65% wins). A big party heal is a decision, not a free win.
- A boss group pulse is a hard check on a bad bar (0.8x: 95% good, 0-5% bad). 0.4x kept the bad bar near Tyler's 30%.
- This PC slowed any process about 60x after 3 s of steady load tonight (a JS loop: 2,259 to 35 M adds a second), so balance-sim pools crawled. One cell per fresh process, with rests, ran at full speed. Check with a 8-second loop before a long plan.
## 2026-11-10 lane/d-spell-tuning (the tuning pass that turned the monsters' spells on)
- A cooldown is two things once the first cast is staggered over it: how often a caster repeats, and how likely it casts at all in a short fight (about fight length over cooldown). That one number is the density knob: 32 s is rare on Normal and common in a full box.
- A new spell belongs on a monster that dies fast. The same volley cost a lone tank 57 hits an hour on Rook (81 HP) and almost nothing on the glass poacher.
- A gentle spell can raise profit: a windup costs the caster its swings. The Glade's lone tank earned more with a 1.0x, 32 s Spore Cloud than with none.
- One row cannot be safe on Normal and a wall on Deadly for a four. Measure the wall with a multiplier on the tier before proposing it (3x here), and ship the wall with its counter.
- Three guards sat on their bar with no room (a rung at +5.3% on +5%, a drop at 9.8 h on 10 h, a min-of-six margin). Any change to the fight's dice turns those red. Give the row room, or the guard reads a mean.
- A rung mutant must sit outside the dice: two seeds by one hour read a rung to about a point and a half.
- The sim's slotsByRole replaces EVERY role's default lane, not only the role named. Give every role its slots or the bills are fiction.


## 2026-11-16 lane/d-flat-party-xp (ONE party table for every ground; Tyler: "just balance the hunting grounds xp vs having a unique formula everywhere")
- A party's cell moves no blow, so a measured mix's "vs its heroes alone" divided by its cell (rho) is the ground's own party throughput. Read rho per ground x tier before picking a table: on 2026-11-16 a four's rho ran 0.35 (Thicket, Wickstead) to 0.83 (the Muster's Deadly), and that spread, not the cells, is what a flat table has to live with.
- The two bars bind at different corners of a ground: "a mix at or over its heroes alone" binds at Dangerous and the band middle (smaller pull, stronger heroes alone), the 2.5x cap at Deadly and the floor (the contract is lowest there and the full box pays a party most). Per ground, max Deadly-floor xC over min Dangerous rho must sit under the cap with room, or no table fits it.
- Deadly HP is the clean dial for the floor heat: on the full box a four is kill-bound like the heroes alone, so +18% HP took Andy's four from 2.46x to 2.20x at the Glade's floor and left Dangerous untouched. Deadly XP can't do it (it must stay over Dangerous's and at most 1250).
- On the first grounds a four is WALK-bound (revisit ~60 s, kill time 0.1 s): a faster respawn bought it nothing (respawn 30 s: 0.37 -> 0.39), and bigger pulls feed lone area heroes as much as the four there. Measure a party's revisit time against respawnMs before reaching for density.
- A pool cache is keyed by cell id only: a config change under the same cache silently reuses old cells. New config, new cache name, always.
- Python's text-mode write on Windows turns LF into CRLF: write with newline='' (or bytes), then `git ls-files --eol` before committing.
- A bigger Dangerous pull can starve a lone hero of a fill-row monster: on the Glade at 8 a lone tank at the floor never met the Brook Bear in an hour, at 7 the Keep's pelts took 2.7 h. Run drop-tables big-pull on any tier pull change, and pick the largest pull that still feeds the pelt (6 here: 1.63 h, a four 1.04 of alone).
- "Make it a solo ground" can be the wrong fix for a party number: Tyler 11-16 wants every hunt the same for everyone, the solo boost the only difference. A number that can't move without breaking the ladder STANDS and is printed by its guard, never hidden by a tag.
- A String.replace replacement and shell heredocs both eat an apostrophe escape. Player names with apostrophes (Hask's Ford) in a test pin go in through the Edit tool, then `node --check` before a long run.
## 2026-11-16 lane/d-tower-weapons (the 28 tower weapons, +skill on worn gear)
- A +skill is worth whole max-hit steps (0.35 a level), so +1 to +4 reads flat at some Levels and jumps at others. Prove the rule as an identity (tower weapon at skill S == twin at S+N, every foe), and read the XP effect in bands on six seeds.
- +4 at Levels 45-90 is 0.4-4.3% Level XP an hour, casters least. A design line that says "+4 is about a tier" was read at one Level on one ground: measure the claim where the item is worn before repeating it.
- A staged migration's own probe can depend on a catalogue being EMPTY (the chest's §9 "no weapon is built"). When data fills a table, grep the staged files' probes for that assumption first.
- Name a batch with the lore's own split (each lock a part of town history) and cap a pattern (at most four "X's Weapon" a key). The audit still found two place words repeated in seven lines.
## 2026-11-15 lane/d-audit-balance-1 (the playthrough audit's F2, F5, F8, F12)
- "Nothing to spend gold on" is usually a reading finding. Sum the one-time sinks from the data rows before proposing one (3.9M open before Level 50 against 1.57M earned); then look for where the ladder that scales with Level stops (Tempering had no rows for the tiers the March wears).
- A lesson card gated on a count fires on any long hunt. Gate it on a rate measured on the settle, with the line between the heroes it should miss (0 to 6.5 meals an hour) and the ones it is for (20 and up).
- A card whose advice creates the next card's trigger is one card. Check each lesson's fix against the next lesson's `when`.
- A new shield is a world move: hr_hunt_shields (gen-hunt-sessions) decides what the server treats as a shield, and tests/ground-pack.mjs reds on it as "not additive". Items + recipes + hunt-sessions + every pack whose drops changed all regenerate together.
- The sim's tank picks the best reachable shield by itself (gear.mjs), so new shields re-dress every March measurement. Hold the old piece with `gear: { also: { shield } }` for the before row, and re-run the boss table from a scratch `git worktree` of the commit before.
- This shell's heredocs eat one backslash level even when quoted: a script that writes `\'` must be made with the Write tool, or use sed with `.` for the quote.
- `cd X && (A) & (B)` backgrounds the cd with A: B runs in the session's folder. Run two background jobs as two commands.
## 2026-11-15 lane/d-audit-balance-2 (the playthrough audit's F14, F17/F20, F28 and Crafting)
- A food warning is only true where it was measured: 400 store-food cells found one ground (the Barrows) where a store food kills in range. A line on every card would have been false on nine.
- A "next tier wins" check must be read where the next tier is worn. At the Pyre Field a plate hero in Emberforged already sits at the armor cap, so a maxed ladder there out-guards bare Dawnsteel by 1.2%; at the Hold, where Dawnsteel is worn, it wins by 3.3%.
- A per-hero cap on a shared purse is the same gift pressed four times. Ask what a cap limits (who finishes a one-time project, how fast) before raising it as a sink: the Works' capacity is its goal, not its cap.
- Un-holding rows leaves their unreachable items with no use (C2). Check what else a held row was the only use of before re-costing it.
- Two recipes for one output is the cheapest real decision a bench can get: same xp and time, different skills and stock, a little more book on the new route so neither is free money.
- A paused lane's measurements live in its scratchpad (career-tank.txt): re-derive the board's numbers from them before re-running a 590-hour career.
## 2026-11-15 lane/d-coherence-133 (coherence pass: v0.2.133 + the day's lanes, CLAUDE.md §3.5)
- `cell.mjs` takes `skillsBySeat: [{ melee, ranged, magic, defense }]` and `options: { tier }`, so a +skill or "trains every spare hour" question is one scratch script and a few seconds a cell. Use the career's skill at a Level (the training lane's table: 22 at Level 10, 37 at 25), never skill = Level, or a training gain reads 2 to 3 times too big.
- "+Magic does nothing" at the Hold is the Mage being spawn-bound (lowest typical HP 98.8%, 1.47x a hammer), not a flat formula (`abilities.js` lvPm is +2% of base a level). Before calling a stat worthless, check whether the hero measured is already capped by monster supply.
- "Less damage from every blow" already exists as `steadyPm` (capes, food, joined with Tempering in `mitigation.js`). Grep the engine for an effect before a lane proposes a new hook for it.
- A walk-through written yesterday can be stale today: the Ox Road's "can't target the Drover" was false (`widgets/first-target.js`, `targeting.js` tkind). Re-grep every "missing control" claim before ruling on it.
- Driving the pane: coordinates from `getBoundingClientRect` scaled by 800 / innerWidth beat refs, which go stale on every repaint. A `skip` that answers `moved: 0` means the Enter never landed.
- Two lanes on one day placed the same idea twice (Kingstooth and Widow's Fang, an Iron Sword with crit on the Sewer). A catalogue's placement map must list call-only and daily-prize rows too, or the next lane duplicates them.

## 2026-11-15 lane/d-catacombs: the Pauper Vaults (Tyler's catacombs hunt)
- Past Dawnsteel the hero stops getting armor, so the one formula grows harder with Level: the same tree read a lone tank's Normal low 73% at Carter's Rest (110) and 59% at the Vaults (165), a four's Deadly 2 deaths against 38. Grade every post-Morrow ground beside Carter's Rest before blaming its own rows.
- drop-tables plays its own reference group on its own bar: a lone tank that lives the grade on Salted Lobster can die there. A high-Level pack names a pair in checks.dropRef.
- A Rare row needs its pixel icon before it can exist (loot-structure). A named fuel is a Rare, so it waits on art; write the row into the pack header instead of a stand-in.
- spell-rows: a non-boss carries exactly one spell. Design the elite's one spell first.
- Staged maps are lint-checked (world-core, forest-cave one-choke) but not kit-checked; a pillar next to a 1-wide water edge breaks the 3x3 rule on the row above it.
- Python's text mode on Windows writes CRLF; read and write bytes when editing repo files.
## 2026-11-16 lane/d-audit-f22 (Krell's card must win as written)
- A boss's own prize is on the gear ladder once his hall opens: boss-call-table dressed a pair at 88 in Krell's tier 7, so "two heroes from 88" read 78% and was 0% for anyone reading the card. Fit a hall's advice with `--first` (his prize held out).
- At a boss the lever that moved was food, not the hints: eat at 85% or Greater Mend at 90% left the weak trios at 58-70%; Salted Swordfish took every third to 90-100% (the tank dies under his enrage on Lobster). A pair fails on the clock, so food doesn't help it, only Levels do.
- Test advice by reading the words the player reads (a small label grammar, an unreadable line is red) and playing them; then the card and the measurement can't drift apart.
- Backticks inside `node -e "..."` ran the guard twice by command substitution. Use a script file for any text with backticks.

## 2026-11-17 lane/d-flat-party-xp re-landed on set/v0.2.135
- A re-land is a re-measure: a combat change merged beside a party table (Turning Cut for every shieldless melee) moved Andy's four +10-18% on the Deadly floor. Run the tier tool on every ground, staged ones too, before re-pinning anything.
- Retiring per-ground cells retires them on STAGED packs too; their guard rows were fitted to those cells. The flat-table fix for a staged pack is its own pull (the Morrow packs 6/6), never a cell.
- A tier HP dial slows a hero alone more than a four (the Glade +12% HP: lone -16%, four -8.5%), so it is the cap's dial, but it also widens the gap between the two harder tiers. Equal pulls plus more HP make Deadly the worse pick; the pull is what must differ.
- Prove a pin's cause on an archive of the SET first: the set was already red on engine-parity (the income dial's coin, then Turning Cut's kills), and only what was left over belonged to this lane.
- Apostrophes in pins (Hask's Ford) through Python or sed break the file again: Edit tool, then `node --check`.
## 2026-11-16 lane/d-catacomb-mode (the Unmarked Catacombs descent, design only)
- A second mode on a built one is mostly a list of where the first hard-codes its name: `TOWER_RULES` in the room engine, the `tower_*` tables, the chest's weapon-only table, "Tower Cinders" paid by every key. Read the built stack for those first, and rename while the migrations are still unapplied.
- A ruling that moves a cap (earned to opened) changes the first mode too. Put the shared change in ONE lane on the first mode's stack, not in the new mode's.
- Two slots a key make a wanted piece about 1.4x the wait of a one-slot key at the same odds. Say that number when copying odds across.
- A held limit counted per bag makes players shuffle items into Storage to make room (a repeated decision). Count it across the account.
- The odds arithmetic reproduced the Tower board's own 4.7 / 9.3 weeks before I used it for armor. Check a new calculator against a published number first.
## 2026-11-16 lane/d-catacomb-armor (the 24 helmets and boots, hidden, measured)
- The sim's worker `whatIf` can put an attribute on a twin's own item row for one cell (both engine instances, restored after). That measures a hidden "twin plus one attribute" piece on the real settle with nothing in ITEMS. A +skill piece is the hero N skill levels up (the Tower lane's proven rule), so main's engine needs no field to measure it.
- Damage taken an hour moves with kill speed. Read safety as damage per monster swing. Its noise at 6 seeds x 1 h was about 4% (a +Melee piece, which can't change a swing, read 0.959), so a 1% read needs 20 seeds or more.
- One armor slot's tier step is worth about 1% of safety. Any attribute worth having beats the next tier's piece of that ONE slot, so "under the next tier" is the wrong bar for a single armor slot. +1 Defense was 5-8% (more than a tier), which is why the plate helm moved to +Melee.
- A kiting bow and a back-row Mage are seldom hit by ring or single-target element spells. Element boots for them only win against GROUP spells (Lime Sack, Snuff the Candles). Check the spell's shape before saying where a resist piece wins.
- Merging a big unapplied stack (lane/d-tower-weapons, 18 conflicting files at a version bump) into a design lane is the wrong move. Build hidden data on main, name the built field, and let the build lane wire it.
## 2026-11-18 lane/d-designer-rulings-1118 (six queued questions, ruled; board "2026-11-18 Designer rulings")
- A "loses gold" report is usually a kit question. The Sewer's lone Level 5 lost ~1.5k g/h only with no armor (every way clears its bill in the tier-1 set), and the Hold's lone tank went from +2.8k (Level kit) to -27k (arriving kit). Run `cell.mjs` with `gear: { starter: true }` and `{ tierOffset: -1, only: 'all' }` plus `skillsBySeat` before ruling on any gold line. A 20-cell read takes under 30 s.
- Before ruling on a weapon promise, read the column's other single-target ways: at the Sewer the bow, mage and sword all sit 27-33% under the hammer, so the fist's -27% was the ground, not the fist.
- A gold promise below the Level where bills bite is a kill-speed promise in disguise. If it can only be met by out-killing the specialists, it contradicts "great at nothing": scope it rather than tune it.
- Call the real `upgradePlan` from node with a hand-made bag (`src/shell/upgrade-plan.js` imports cleanly with `?v=`): one call settled whether the Leather Gloves beat bare for a Mage (they do, the heavy belt doesn't).
- Check a hidden-row system against the drop homes before moving it: 11 of 24 lucky items and all 45 salvage items already dropped on a walked ground, so the rows were pure duplicates.
## 2026-11-19 lane/d-level-pace-141 (the post-140 audit's Level 22 at 36 h; board "2026-11-19 Level pace")
- A blind audit is one WAY, not one sample of the pace. Match its style and kit to a career before calling it noise: the arriving-kit sword-and-shield career read Level 22 at 36.3 h, the audit's number to the tenth. The median (the pace of record) was on target.
- The pace plan to Level 31 takes 2 minutes on 3 workers (each career 20-45 s), not hours: run careers, not cells, for any "behind pace" report. Careers carry real skills (Melee 30 at 16), so cells with skills at the Level read lower but rank the ways the same.
- XP rows can't fix one way's gap: the curve is fitted to the median, so XP x1.12 that lifts the tank inside 10% pushes the median to -9.8% and the next re-fit takes it back. Look at the slow way's default bar first (the sword ways hold no rune spell; Flame Strike closed 80% of the gap at flat gold).
- Re-check an old reason before keeping a ruling built on it: the 10-29 "Flame Strike off, net -20%" reads -121 to +17 g/h today, and its struck-slot cause is gone.
- Read the set's log before reporting a sequence ("waits for lane X"): the lane I was told to wait for landed while I measured.
## 2026-11-19 lane/d-tank-runes (Tyler: "tanks should have rune spells that are tank spells"; board "2026-11-19 Tank rune spells")
- Measure what the role is missing before designing its tools. In every tank-led party cell the others took only monster spells (99-101%) and the Challenge fired 0-4 times an hour, which cut "guard an ally" and "a stronger taunt" before any prototype.
- A cell's `levelXpPerH` is the GAIN. Deaths sit in `raw.xpLostLevel`, so a lone Deadly cell reading "+12% XP" was −53k an hour net. Judge lone pace as the best deathless tier per ground, net.
- A damage cut that adds no kills can still raise lone pace by a whole tier: Frost Slam took the lone tank at the Slake 55 from 8 deaths to 0 on Dangerous, +27% to its best hour. Look for the tier flip, not the cell's delta. "Party only" (the mirror of `alone`) is the clean guarantee.
- The tank deals 1.7-6.6 damage a second, so any hit on a tank's area spell is a big kill bump (1 damage a monster was +2 to +9% alone). A holding spell must land no damage.
- Prototype engine pieces on a scratch copy of the tree (src, supabase/functions/hr-accrue, tests/hunt-core/fixtures) and pass `--root` to the pool. Prove the copy is a no-op first: its as-built arm matched the clean tree byte for byte on 36 cells.
- Three pools on this PC ran about 7 jobs a minute, and lone Deadly cells with 100+ deaths dominate (every death is a new segment). Split arms across pools by output file, never two pools on one file, and stop a pool with `taskkill /T` by its command line: it resumes by job id.

## 2026-11-19 lane/d-balance-audit (real hunts against the sim)
- The engine is not where the sim and the game disagree: fed a recorded party (its own XP, kit, bar, options, stock) the sim lands within 5% on kills, XP and coin. The gap is the HERO the audits play: `node tools/balance-sim/calibrate.mjs --run --as harness` then `--swap kit|bar|skills` names which assumption moves a number.
- The plain audit hero is 0.55-0.83x a real one (no rune spells on melee or bow, no accessories or spent ammo, skills pinned to Level). Before quoting a party, tier or death number, play it with `profile: "played"` and say which hero it was.
- "Skill = Level" is wrong both ways past 25: a lone yard-trained hero is 6-15 above, a Deadly-party hero 15 below on its main skill. Take skills from a career or a record.
- Under Level 50 the level curve is fitted to the measured ladder, so "x the pace contract" only means something past 50. Under it, compare to the same-profile lone Normal hero.
- A session row s tier can be null on a continued hunt. Read the tier from the row, then the instance (same ground), never assume Normal.
- A sample is only judged if the hero s setup (presets AND action sets) was last changed before the hunt began. One recorded hunt had its store rune changed mid-hunt and read store gold x1.5 for that reason alone.

## 2026-11-19 lane/d-tower-curve (Andy: "Everything between floor 100 > 170 felt the same"; board "2026-11-19 The Tower's curve")
- A straight-line formula reads flatter the higher you go: a Tower band adds 16% at floor 70 and 4-8% at 150. For any "felt the same past X" on a Level-keyed curve, read the RELATIVE step per band, not the absolute numbers.
- A healer turns smooth damage into a cliff: reactive heals soak each small step, so the low drifts while the healer has room, then one long fight (a Keeper landing) ends the run. Fix the step size, not the wall.
- Compounding difficulty compresses Levels: at 2% a floor a Level 90 four topped out a floor above a Level 74 one. Size it by the spread you want between Levels as well as the slope (1% a floor kept Level 74 / 90 / 110 fours near 130 / 145 / 155).
- Heat the blows only. HP heat gave the same curve but slowed the floors and moved the server's per-floor XP bound (a catalogue to stage). Blows alone left the server untouched.
- Recorded seats replay a Tower climb to the floor (159-184 against his 182, 274-284k XP an hour against 275k). Rebuild a seat's worn set from the ledger's equip rows: his front seat held a sword at the climb, not today's hammer.
- Tuning on top of another lane's formula change: `git archive <branch> src tools/balance-sim tests/hunt-core tests/_is-main.mjs supabase/functions/hr-accrue` into .scratch, overlay your files, measure both trees and say which one each number is from.

## 2026-11-19 lane/d-142-rulings (level-curve and party-class-xp-line red on the assembled v0.2.142; board "2026-11-19 Two rulings for v0.2.142")
- Diff the careers, not the median: `level-pace.json` careers' hoursTo, old snapshot against new, named the bows (Flame Volley on their default bar) as the other 13% once the advice was reverted. The median moves when its middle two ways move.
- A shrunk band breaks every plan that reads it: the Cellar ending at 5 left the ladder playing Levels where the hunt ends at once (3,411 XP an hour), which bent the contract fit. `plans.mjs` loadAxes now plays a ground's playable band.
- An early-curve step can't be moved alone: brackets chain (a bracket's first step is the one before plus its rise), so a rise change shifts every later step. Pair it (-d, +2d, -d) to hold every total past it, or accept a constant shift.
- A Healer's tier is data (HEALER_TIERS): a guard judging parties there should read it rather than hand-list grounds. A plain hero at 165 dies in every lone way, so a staged ground past the gear ladder measures deaths, not pay.
- The pace plan is about 45 min and the ladder 13 min on one worker. A played life to 70 is 1-2 min. Reuse ladder cells by id: copy cells.jsonl and drop the changed ground's rows.
- Before a curve re-fit, count the live Levels it moves (read player_state, compare both curves). The Coordinator chose XP a kill over a 1-2 Level drop for every hero: the table can be held from either side, and only one side touches what players already hold.
- A change below the ceiling re-measures the whole pace (C1). Early-Level rates from 15-minute chunks swing 9.5-13k at the Cellar's end, so leave C6 slack there (1.6-1.9x), not 1.95x.
- `pace.mjs --fit --fit-past` went infeasible (the held first step breaks its one-minute Level 2 bound when XP drops) and then returned garbage. A hand grid over the two brackets past 110 against the same reference was quicker and honest.
- A re-split that holds the total to Level 9 still moves every Level inside the band (a Level 4 hero with 1,200 XP reads 3). A read-only count proves today only; the curve file now refuses itself at apply if any hero's Level moves (gen-level-curve, core-curves CURVE-HOLD).
- A balance-blind test arm pins the rows it plays: when XP a kill moves, add `xp` to its pinned rows (hunt-live LV-PULL), or the Level-ups shift its laps.
- Luck v3 (11-20): a life records kills by creature only, and every Luck number is re-read off the same file (luck-measure table), so a curve re-tune costs seconds, not a re-run. A lone 5,000 h life is about 25 minutes, a four on Deadly about 2 hours: start the four first.
- Past the built content a life parks on the last ground. Say so in the table, and project the planned game apart from it, labeled assumed.
- A four on Deadly at Krell's Hold pays the store about what it earns (20k an hour a hero against 20k). Any sink priced as a share of income has to be read against net, not gross.
