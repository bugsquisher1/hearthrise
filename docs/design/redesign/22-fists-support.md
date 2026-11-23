# 22. The wraps: the party's support

2026-11-22, `lane/fists-support`, game designer. Docs only.

**Tyler, 2026-11-22:** "Does it need re-designed as just a hybrid support class? Or should we consider another weapon type for support", then "We don't need a solo all rounder though if everyone has a party at the start dude."

Every hero has a company of four from Level 5 (`src/data/recruits.js`, RD-Q6 a). So the 11-18 promise in `src/data/fists.js` (a self-sufficient all-rounder, best lone gold of any lone melee) is **replaced**. Today the party has a tank (Shield), a healer (Restoration) and damage (melee, ranged, magic). Nobody's main job is making the other three better. The wraps take that job.

**Why the wraps, and not a new weapon or a hybrid.** The fist line is hidden (`FIST_LINE.live` false): no player owns it, no art is final and no number has shipped, so turning it into the support costs nothing. A ninth weapon would need its own art, rows and Roads country and would leave the wraps with no reason to exist. A Shield and Restoration hybrid already exists through their border (17 section 6). It's a tank that heals, not a support.

**Tags.** CODE (read from `src/`), JUDGMENT (a design call the Lab still tests). Every number is a starting value for the Lab, shown at full size (Level 200), and ramps in by `ramp(L)` like every talent number (`19-power-ledger.md` section 2). Base moves don't ramp (they're the role, as Greater Mend and Shelter are).

---

## 1. How it plays

- You stand in the front row next to your tank and hit what it's holding. Your hits are weak on purpose. Each one leaves something on the monster that helps the whole party kill it or live through it.
- Coal cracks a monster's armor so every hit on it lands harder. Cold slows its swings and its spells. Lye makes it take more damage or hit softer. Cold Palm knocks a spell out of a caster's hands.
- You keep one fire going for the party: **Open Fire** (everyone hits harder) or **Banked Fire** (everyone gets mana back faster, so the company drinks less).
- **Warm Stone** puts a small shield on whoever is lowest. It doesn't replace the healer. It buys the healer time.
- Your bar fits about three strikes, so the real choice is which three for this ground. Casters want Cold Palm, bosses want Coal and Lye, swarms want Coal Palm. You set it once for the ground and the plan keeps it.
- A party with you holds deeper on hard grounds and bosses than the same party with a fourth damage dealer, and kills slower on easy farms and swarms. Both are good picks. Which one is better depends on the ground.

## 2. The kit

### 2.1 The seat

| Row | Ruling |
|---|---|
| Role | **Support**, a new `HUNT_ROLES` row: melee, range 1, front row, not a tank, no peel (CODE shape: `src/data/hunt-roles.js`) |
| Weapon | Wraps, two-handed (no shield). Blows train Melee. About 70% of the tier's sword blow (JUDGMENT, a Lab dial) |
| Armor | Medium suits it (`WEIGHT_FOR_ROLE`). Any weight can be worn |
| Moves level on | Melee, the wraps' skill, as the tank's spells do. Unlocks are Melee levels. Casts pay Magic at 250 (`magicXpMult`, the tank's rate) |
| Own heal | **Cut.** `selfHealPm` goes, with its reader in `pull-cycle.js` once no row names it. Sustain is now the party's: Banked Fire and Warm Stone |
| Borrowing | 2 borrowed moves and the standard value bands, like every weapon. The generalist's softer bands and third slot are cut |
| Alone | **Your strikes deal double damage while you hunt alone** (the base rule, as Undertow is the lone healer's). A lone support is the slowest way to hunt and still fair (RD-Q7 a). A party never sees it |
| Party XP | By size alone (S-10 c). The support costs the party no XP share |

### 2.2 The moves

Six strikes on the offense lane (2 s lockout, CODE `ABILITY_LANES`), two fires, one shield, and Mend. Strikes are a small share of your own blow (the spell rule), so your own damage stays low. A Palm is its element's rune cast. It uses the store's Chalked rune when you carry none, as every rune spell does.

| Move | Lane · cooldown · cost | Unlock | Tooltip | What auto-combat needs |
|---|---|---|---|---|
| **Coal Hands** | Offense · 6 s · 8 mana | Known | Hits your target. Armor Break: −25% armor for 6 s | Suggested conditions: target lacks Armor Break, target health 30% or more (`target_hp_pct`, lane E1) so it isn't spent on a dying monster |
| **Coal Palm** | Offense · 10 s · 12 mana · Fire rune | Melee 20 | Hits your target and every enemy next to it. Armor Break on each for 6 s | "It would hit at least 2 monsters" (`enemies_in_aoe`, built) |
| **Cold Hands** | Offense · 6 s · 8 mana | Melee 5 | Hits your target. Chill for 4 s | Target lacks Chill (`effect_missing`, built). Skips a target the tank's Frost Slam already holds |
| **Cold Palm** | Offense · 12 s · 12 mana · Ice rune | Melee 12 | Range 5. Stops an enemy's spell. Silenced: can't start a spell for 3 s. Chill for 4 s | "The pack has at least 1 monster casting at anyone" (`enemy_casting`, built). Aims at the caster, not your target (a new target rule, section 6) |
| **Lye Hands** | Offense · 8 s · 8 mana | Melee 10 | Hits your target. Sickness: +10% damage taken for 6 s | Target lacks Sickness. With a healer's Green Sickness up it waits by itself (one Sickness a monster, CODE `statuses.js` maxStacks 1) |
| **Lye Palm** | Offense · 10 s · 12 mana · Poison rune | Melee 25 | Hits your target. Weakened: −8% damage dealt for 8 s | "My target is a boss" (built), or 2+ allies under 70% (`allies_below`, built) |
| **Open Fire** | Aura · no cooldown · no mana | Known | Party aura: +4% damage within 8 tiles | On while slotted. One fire at a time |
| **Banked Fire** | Aura · no cooldown · no mana | Melee 15 | Party aura: +25% mana regeneration within 8 tiles | On while slotted. One fire at a time |
| **Warm Stone** | Support · 10 s · 15 mana | Melee 8 | Shields the lowest-health ally, you included, for 120% of your largest blow | Ally under 70% (`ally_hp_pct`, built), later near fall-back (`hp_near_fall`, lane E1). Skips an ally already shielded (the Ward's rule) |
| **Mend** | Heal · 6 s · 15 mana | Known | Heals you for 11% of max health | Unchanged (every weapon's) |

**Lane fill (COMPUTED).** Offense lockout 2 s. Three strikes at 6, 6 and 8 s fill 0.92 of the lane, four strikes 1.08. So three is the useful bar and the choice is real. By 17's rule (no cooldown cut on a lane over 75% full) the Hearth has no cooldown-cut nodes on strikes.

**Where each move wins (JUDGMENT, the Lab tests it):**

| Move | Best on | Weak on |
|---|---|---|
| Coal Hands, Coal Palm | Bosses, Brutes, parties of many small hits (axes, bows). Monster defense comes off every blow (CODE `damage.js` `defenceReduction`), so breaking it helps small blows most | Swarms die before it matters (Coal Palm is the answer there) |
| Cold Hands | Brutes, Stalkers, anything big that hits the front | Swarms |
| Cold Palm | Casters, Warders, the Sewer Kobold's Muck Fling, the Rat King's Squeal (CODE `monster-spells.js`) | Grounds with no spells |
| Lye Hands | Long fights. Parties with no Restoration healer | A party whose healer already keeps Green Sickness up |
| Lye Palm | Bosses, Bold | Short pulls |
| Open Fire | Damage-heavy parties, easy depths | Parties that run dry on mana |
| Banked Fire | Mage and healer parties, long hunts (fewer drinks bought) | Melee-heavy parties |

## 3. The country: the Hearth

**The call.** The support's country is **the Hearth**, the tenders' quarter of Havora right beside the Great Hearth. The Great Hearth itself (Mend's road and the Havora crossing) stays the free start for every hero. Like every country, the Hearth's first road touches the Great Hearth (17 section 13). The Hearth sits between Shield and Restoration on the map and borders both (2 new rows in 17's border list, 11 in all). Every other country reaches its moves through the Havora crossing.

**Shape.** A Palm shares its Hands' road (the rank stones rank both), and the two fires share one road. So 5 roads, not 9:

| Road | Moves | Rank stones | Crossroads | Waystones |
|---|---|---|---|---|
| Coal | Coal Hands, Coal Palm | 5 | 2 | 2 |
| Fire | Open Fire, Banked Fire | 5 | 2 | 2 |
| Cold | Cold Hands, Cold Palm | 5 | 2 | 2 |
| Warm Stone | Warm Stone | 5 | 2 | 2 |
| Lye | Lye Hands, Lye Palm | 5 | 2 | 2 |
| **Total** | 9 moves | 25 | 10 | 10, plus 5 vows = **50 points** |

Between Ranged (40) and Restoration (58). "Spend as suggested" walks Coal, Fire, Cold, Warm Stone, Lye.

### 3.1 Two roads laid out

Tooltip labels. Numbers at full size. Options inside a crossroads sit within 3 steps of each other on any ground (17 section 9).

| Road | Node | Tooltip |
|---|---|---|
| **Coal** (Coal Hands known) | Rank stone x3 | +1 Coal Hands and Coal Palm rank |
| | Crossroads I | **Hard Coal** (Suggested, bosses): Armor Break −35% (from −25%) · −2 s duration · **Spreading Crack**: Armor Break also on 1 enemy next to the target · −30% Armor Break · **Hot Coals**: Coal Hands +60% damage on targets with Armor Break |
| | Waystone | **Coal Hands −2 mana** |
| | Rank stone x2 | +1 Coal Hands and Coal Palm rank |
| | Crossroads II | **Long Crack** (Suggested): Armor Break 9 s (from 6 s) · **Passed Coal**: A target with Armor Break dies: it moves to the nearest enemy with its time left · **Open Cracks**: Targets with Armor Break: +20% Bleed damage |
| | Waystone | **Coal Palm radius +1 tile** |
| **Fire** (Open Fire known, Banked Fire at Melee 15) | Rank stone x3 | +1 Open Fire and Banked Fire rank |
| | Crossroads I | **Front Fire** (Suggested, party): Front row +50% aura · Back row −50% · **Rear Fire**: Back row +50% aura · Front row −50% · **Fed Fire**: Each kill: aura +10% for 6 s · max +30% · −20% aura |
| | Waystone | **Banked Fire: +1% mana to allies on each kill** |
| | Rank stone x2 | +1 Open Fire and Banked Fire rank |
| | Crossroads II | **Fire Watch** (Suggested): Enemy winding up: aura +50% for 3 s · **Low Fire**: Allies near fall-back: aura x2 on them · **Bonfire**: Vs bosses: aura +40% · Vs others: −10% |
| | Waystone | **Open Fire: +1% damage for allies within 3 tiles of you** |

The other three roads follow the same pattern and are laid out in lane R-X3 (section 6): **Cold** (a longer or stronger Chill, Silenced length, a reward for each spell stopped), **Warm Stone** (one big shield on the tank or two small ones, mana back when a shield breaks), **Lye** (Sickness against Weakened, spreading on a kill). Their themes are fixed here so the vows below have a road to sit beside.

### 3.2 Five vows

**Shape** (17 section 7): a gain on a condition, a cost that always bites, +18 steps on its condition and −8 always at full size. Each reads "Requires Level 30" and "Wraps".

| Vow | Tooltip | Best on | Weak on |
|---|---|---|---|
| **Stand Close** | Aura reaches 3 tiles (from 8) · Aura +60% | Two in the front row, Brutes, Swarms | Back-row-heavy parties |
| **Hush** | Silenced 6 s (from 3 s) · A stopped spell: Cold Palm −4 s cooldown · −20% Chill | Casters, Warders | Brutes, Swarms (no spells) |
| **Deep Cracks** | Armor Break stacks to 3 on one enemy · +30% strike mana cost | Bosses, Brutes | Swarms |
| **Lye Spill** | A Sick or Weakened enemy dies: it spreads to the nearest enemy with its time left · −20% Sickness and Weakened | Swarms | Bosses |
| **Rear Guard** | Warm Stone shields the back row only · +60% shield | Shooters, Casters, Stalkers | Brutes |

Five, not four: the support has no damage vow to give up, so its fifth covers the back row, which Stalkers and Shooters reach (`monster-roles.js`).

### 3.3 Borders: hybrids with Shield and Restoration

| Border | Town (pick 1) | Hybrid crossroads (pick 1 of 3) | Hybrid vow |
|---|---|---|---|
| **Hearth · Shield** | Use Challenge with any weapon / Use Coal Hands with any weapon | **Held and Broken**: Challenge: taunted enemies get Armor Break 4 s · **Stone at Hand**: Warm Stone on your taunting ally: +40% shield · **Two Walls**: Open Fire also: −3% damage taken for the front row | **Hearth Guard**: Wraps: borrowed Challenge at full hold · −20% aura |
| **Hearth · Restoration** | Use Protective Ward with any weapon / Use Warm Stone with any weapon | **Warm Mending**: Greater Mend +15% on allies with your Warm Stone · **Sick Twice**: Lye Hands on a target with Green Sickness: Sickness +4 s · **Spring Fire**: Banked Fire also: +4% healing received | **Wound Dresser**: Wraps: borrowed Greater Mend at full power · −20% aura |

Every hybrid vow also reads: Requires a crossroads in both countries.

**How the hybrids play.**
- **A support that holds.** Wraps, Hearth Guard. The support takes the Challenge and becomes a second tank, a front row of two that shares Swarms (`spread` reach). Its fires are weaker.
- **A tank that cracks.** Shield, town "Use Coal Hands". The tank puts Armor Break on what it holds, and the party's fourth seat can go back to damage. A smaller version of the support's job, priced by value like any borrow.
- **A support that mends.** Wraps, Wound Dresser. A second healer for Deadly grounds. Greater Mend borrows only under the heal rule (one clock with Mend), so it waits on V4 exactly as Hedge Healer does (`19` section 1, condition 3).
- **A healer that shields.** Staff, town "Use Warm Stone". Cheap, small shields between Greater Mends.

## 4. The balance rule

**A support is judged by what the party gains, never by its own numbers.** Its own damage is low on purpose and is never a target.

### 4.1 The comparison

For each cell (a ground's monster mix, party, stance), play **P + S** (three seats and a support) against **P + D** (the same three seats and the best damage dealer the library has for that cell). Same Level, MID kits, same stance, same hours. Read held depth in steps, deaths, XP an hour a head, gold an hour a head and the supply bill a head.

| Test | Pass |
|---|---|
| **Both viable** | On every cell, held depth within 14 steps either way (10% pace), and no deaths on Careful or Steady |
| **Really different** | Support ahead by 7 steps or more on at least 25% of cells, and behind by 7 or more on at least 25%. A support that sits within 3 steps everywhere is a reskin and gets rewritten |
| **Never best everywhere** | Ahead on at most 50% of cells |
| **Even on the mix** | Across the library's cells, the average within 4 steps either way |
| **Two supports** | P + S + S ahead of P + S + D on at most 10% of cells (a boss pick, never the default) |
| **The mana bill** | With Banked Fire, the party's drinks a head at least 10% under P + D on mage and healer parties |
| **Lone** | A lone support alive on Careful and Steady at its ground's floor, Level XP an hour at least half the lone hammer's (RD-Q7 a, JUDGMENT) |

**Where it should win and lose (JUDGMENT).** Ahead: Casters and Warders (Cold Palm), bosses (debuffs last the whole fight), Brutes (Chill, Weakened), Bold. Behind: Swarms (single-target effects on monsters that die fast), easy Careful farming (kill speed is everything), parties whose healer already runs Green Sickness. Party mix matters too: Armor Break helps axes and bows most, Banked Fire helps mages and healers most.

### 4.2 Fitting the power ledger

| Piece | Where it sits | Rule |
|---|---|---|
| Base kit (the moves above) | The role, not a slice | Sized by the comparison in 4.1, as Greater Mend and Shelter are sized by their jobs |
| Hearth talent nodes, vows | The support's build slice (14) | **A node that reaches allies counts at its party sum.** An aura node worth 1 step on each of four heroes costs 4 steps of the slice. So a support's choices move the party about as much as a damage dealer's choices move the party through its own kills |
| Signatures and Traits on the support | The gear slice (20) | Same party-sum rule (ledger row 14: party-scope rows count once a party, in the wearer's slice) |
| A second support | Stacking keys below | Different keys add, the same key counts once |

**Stacking keys** (added to `15-signature-candidates.md`'s table):

| Key | What's in it | Rule |
|---|---|---|
| **Armor Break** (new) | Coal Hands, Coal Palm, Held and Broken, Club's "−5% enemy armor" waystone, Torn Armor | One per monster. The largest counts |
| **Party aura: damage** (new) | Open Fire | One a party. The largest counts. Also inside "Hero deals more damage" and its Lab cap |
| **Party aura: mana** (new) | Banked Fire, #34 Sergeant's Sash | One a party. The largest counts (so the Sash adds nothing beside a support with Banked Fire) |
| Monster takes more damage | Lye Hands joins Green Sickness, Single Dose, Breaking Blow | One Sickness a monster (built) |
| Monster deals less damage | Lye Palm joins Hard Challenge, #35 and the rest | The largest counts |
| Can't cast | Cold Palm joins #15 | One at a time. Restarts the time |
| Chill | Cold Hands, Cold Palm join Frost Slam and the rest | One Chill a monster |
| Shields | Warm Stone joins Shelter, Ward, Barrier | One a hero. A bigger one replaces |

**One fire per support, keys per party.** A hero runs one fire at a time. Two supports can run two different fires, and each key still counts once. That keeps a double support a real (rare) choice and stops two copies of one aura doubling.

### 4.3 Lab runs

Muster Barrows unless named, held start, 8 seeds, 12 hours, every stance. Report held depth, deaths, XP an hour, gold an hour and the supply bill, never one score.

| # | Proves | Command | Today |
|---|---|---|---|
| F1 | The fourth damage dealer, the baseline | `node tools/balance-program/redesign/v1-climb.mjs --styles tank,healer,bow,axes --risks careful,steady,bold --seeds 8 --hours 12 --json f1-axes.json`, then the same with `--styles tank,healer,bow,mage` and `--styles tank,healer,bow,hammer` | Runs today |
| F2 | The support seat | `node tools/balance-program/redesign/v1-climb.mjs --candidate support-kit --styles tank,healer,bow,support --risks careful,steady,bold --seeds 8 --hours 12 --json f2.json` | Owed: `support` in `MAIN` (`progression-grid.mjs`) and `kitFor` (`grid-kit.mjs`), and candidate `support-kit` planting the rows with the switch on |
| F3 | Role mixes (4.1) | F1 and F2 with `--ground <ground>` on a Caster ground, a Swarm ground and a boss | Owed: R10 and C2 (Caster and Warder bodies) |
| F4 | Two supports and the aura keys | F2 with `--styles tank,healer,support,support` against `--styles tank,healer,support,axes` | Owed: F2 and E3 |
| F5 | Each fire and each strike alone | F2 with the candidate's bar set to one fire or one strike (`support-kit-open`, `support-kit-banked`, `support-kit-coal` and so on) | Owed: F2 |
| F6 | The lone support | `node tools/balance-sim/fist-table.mjs solo --hours 3 --seeds 3 --grounds thicket,wickstead,sewer` after its bar is rewritten to Coal Hands, Cold Hands, Open Fire, Mend and the alone rule | Owed: the tool's bar and plant |
| F7 | The library (this is V12, rewritten) | `node tools/balance-program/redesign/roads/library.mjs --grounds <three scale grounds> --plans suggested,best --parties 4 --risks careful,steady,bold --seeds 8 --hours 12 --builds support` | Owed with V6 |
| F8 | Every Hearth node fires | The dummy analyzer on each node, all three stances | Owed: R-S's dummy |

**Order:** F1 now. F2, F4, F5 once the candidate exists. F3 and F7 after R10 and C2. F6 any time after the plant.

## 5. Name and identity

**The call: keep the wraps.** The weapon stays **Wraps** on the item and the bar, the seat's label is **Support** (the genre word, as Tank and Healer are), and its country is **the Hearth**. The code id `fists` becomes `wraps` before it ships (hidden today, no save to move). "Sluicer's Knuckles" becomes **Sluicer's Wraps**, so the family reads as one thing.

**The people.** Fire-tenders keep the Great Hearth. The game already knows them: the Fire-Tender's Cap ("She tended the Great Hearth for thirty years...", `catacomb-armor.js`) and the Soapboiler's Boots (lye boiled from the Hearth's own ash, same file). Every move comes from their work:

| Move | From the work |
|---|---|
| Coal Hands, Coal Palm | They rake hot coal bare-handed through wet linen. A hot coal cracks what it's pressed into |
| Cold Hands, Cold Palm | The wet linen itself. A slap of cold water puts out a spark, or a spell |
| Lye Hands, Lye Palm | Lye from the Hearth's ash. It burns, and a burned thing is weaker |
| Open Fire, Banked Fire | The two ways to keep a fire: open and hot, or banked low to last the night |
| Warm Stone | Tenders hand out hot stones on cold nights |

**Lore line** (story voice, for the wiki and the Wraps' item text): "The fire-tenders keep the Great Hearth lit. They wrap their hands in wet linen to rake out coals and move hot stones, and they boil the ash down for lye. When a company heads out, a tender goes with it."

No mood words, no borrowed names. Every move name was checked against `src/data` and the redesign docs (section 9).

## 6. Engine pieces and the v0.3.0 call

| Piece | What | Lane that carries it | Status |
|---|---|---|---|
| Support role | `HUNT_ROLES.support`, `ROLE_KEYS.wraps`, `ROLE_ORDER` after `melee_dps`, `WEIGHT_FOR_ROLE` medium, the server's weapon-role map (`hr_hunt_weapon_roles`, generated) | L13 (rewritten, below) | New, data |
| Start set | `STARTER_SETS.support = ['practice_wraps']`, so every hero owns Practice Wraps (`start-kit.js`, every set to every hero) and the server's `hr_create_hero` accepts it. Recruits need nothing: they already skip the first hero's role | L13 | New, data + server catalogue |
| Statuses | **Armor Break** (a new kind: monster defense −N%, read where `defenceReduction` comes off a blow), **Silenced** (E2's "can't cast"), **Weakened** (E2's "monster deals less"). Chill and Sickness are built | E2, plus Armor Break added to E2's list | E2 is band 1 |
| Interrupt | Cold Palm ends a wind-up (`spell_end` with why `interrupted`, beside the death and leave paths already in `monster-spells.js`) and aims at a caster (a new target `caster`: the nearest monster winding up, in range) | L13 | New, small |
| Auras | Party scope, counted once a key, one fire a hero | E3 | E3 is band 2 |
| Ally shields | Warm Stone uses the ally-shield path Protective Ward already plays, under E3's one-shield rule | E3 | Built path, E3 formalizes |
| Alone rule | A strike row field for double damage while alone (beside the built `alone` field) | L13 | New, small |
| Retire the own heal | `selfHealPm` off the wraps and the `FIST_LINE` row. Its reader in `pull-cycle.js` and its mention in `statuses.js` go when nothing names them | L13 | Removal |
| Bar metrics | `target_hp_pct`, `hp_near_fall` | E1 | E1 is band 1 |
| The Hearth on the Roads | Rows in `src/data/talents.js`: 5 roads, 5 vows, 2 borders | R-X3 (new, band 4) | Designer |
| Lab | `support` style, `support-kit` candidates, the solo bar (4.3) | LAB | Owed |

**Rewritten ledger rows** (`19-power-ledger.md`, edited in this lane): **L13** is now "the support" (the rows above), and **V12** is now F7, the support against a fourth damage dealer by 4.1's tests.

**Recommendation: ship it in v0.3.0, after band 2.** Nearly everything it stands on is already in v0.3.0: E1 and E2 in band 1, E3 in band 2. Only Armor Break, the interrupt and the alone rule are new, and each is small. Build L13 alongside E3, then the Hearth country as **R-X3** in band 4 with the other countries. `FIST_LINE.live` (then `WRAPS_LINE`) flips only when F2, F4 and F7 pass. If they haven't passed at the release gate, the support moves to v0.3.1 without holding the release. Nothing else has to move for it: its effects sit inside the slices and keys above, so its arrival changes no other number.

Why not wait: a party-first game that opens with three roles and no support leaves the fourth seat as "another damage dealer" on every ground, which is the one decision that should change with the ground. The support makes that seat a choice.

## 7. Signatures and Traits

### 7.1 Three sample Signatures

Same rules as `15`: one fixed rule, half a tier (10 steps) on its best cell, inside the gear slice, counted at its party sum (4.2). Homes are v0.3.0 grounds.

**Pyre-Cloth Wraps** · Weapon (wraps) · Drops from: Pyre Field, Pyre Wraith
Run both fires. The second at 50% strength
Best for: Support
Note: Fed Fire and Bonfire work on both. Can't add a third fire.

**Farmhand's Gloves** · Gloves · Drops from: Krell's Hold, Farmhand
Cold Palm: stopping a spell shields every ally for 4% of max health
Best for: Support
Note: Works with every Cold road branch. Does nothing where enemies don't cast.

**Lye Pouch** · Belt · Drops from: Hask's Ford, Fordsunk
Lye Hands: a Sick enemy dies: every ally gets 3% mana back
Best for: Support
Note: Fewer drinks on big pulls. Lye Spill keeps it busy on swarms.

All three pass `15`'s rules: none repeats a branch (Front Fire, Hush and Lye Spill are different rules), each works with every branch of its move, and none can chain.

### 7.2 How the 40 Traits serve it

The support's own damage is low, so its own-damage Traits are weak on it. It serves Traits in three other ways:

| Way | Traits (numbers from `14`) |
|---|---|
| **Turns on the party's Traits.** Its strikes keep the conditions up for everyone | #5 Snuffed and #25 Numbed (Chill from Cold Hands), #30 Lime Pit and #40 Sour Vault (Sickness from Lye Hands), #13 Slack Water and #19 Ledge Footing (Warm Stone keeps the party high) |
| **Wears the party Traits.** Party-scope rows count once, so the seat with no damage Trait to want is the natural one to wear them | #28 Raised Colors, #33 Banded Oath |
| **Wears front-row defense.** It stands in the front row and takes Swarm and Brute hits | #10 First Rank, #25 Numbed, #40 Sour Vault, #8 Barred Door |

**Turns off:** Cold Palm silences casters, so #18 Floodmark, #22 Slate Hand and #31 Dunn's Warning fire less with a support in the party. That's the same trade #15 Catacomb Shroud already makes, and the key "Can't cast" covers it.

**One swap, decided here:** #36 Bottom of the Quiver (`14` already recommends cutting it) becomes **Nest Heat** · Wyvern Roost · Party: +1.5 / 2.5 / 3.5% damage vs enemies with Armor Break · Best for: Support · Doesn't stack with another copy in the party. That gives the support one Trait of its own and keeps the count at 40.

## 8. Walk-through: a new support hero

Every name below was looked up in `src/data` (section 9). The rows marked "owed" are the L13 data this doc asks for. Melee keeps pace with Level (17 section 13's assumption). A locked move waits otherwise.

| Step | Level | Holds before this step (steps 1 to N−1 plus the start kit) | Does | Doable because |
|---|---|---|---|---|
| 1 | 1 | The start kit: 20 Cooked Shrimp (`HERO_KIT`), every practice set (`STARTER_SETS`) | Makes a hero and picks the Wraps set | Owed: `STARTER_SETS.support`. Practice Wraps exists (`fists.js`, reqLv 1) |
| 2 | 1 | Practice Wraps worn. Coal Hands, Open Fire, Mend known | Hunts the Mill Cellar alone: Giant Rat, Slime, Hive Wasp (`hunts.js`, band 1 to 8) | The alone rule doubles Coal Hands. Mend and the shrimp cover the bites. Monsters are Level 2 to 4 (`monsters.js`) |
| 3 | 2 | Step 2 | First point: Coal road, rank stone 1 | The Coal road's first stone touches the Great Hearth, which every hero owns (as Challenge's does in 17 section 13) |
| 4 | 5 | Coal road ranks 1 to 3 | Cold Hands unlocks (Melee 5). Point 4: Coal crossroads I, Hard Coal suggested | Next to rank 3 |
| 5 | 5 | Step 4 | The recruit press: one press, three heroes at Level 5 (`recruits.js`) | Jobs in order tank, healer, ranger, club, skipping the first hero's role. Support is none of those, so it gets a tank, a healer and a ranger |
| 6 | 5 to 6 | A company: support, tank, healer, ranger | The Sewer (band 5 to 25, `the-path.js` row `sewer`). The support stands front beside the tank, Coal Hands and Cold Hands on the tank's target, Open Fire on | Built ground. Front row by `rowOf` (melee) |
| 7 | 8 | Step 6 | Warm Stone unlocks (Melee 8) | On the support lane, beside the strikes |
| 8 | 12 | Steps 6 and 7 | Cold Palm unlocks (Melee 12). It stops the Sewer Kobold's Muck Fling (1.6 s wind-up) | `kobold_tosher` casts `muck_fling` (CODE). The store's Chalked Ice Rune is bought per cast when none is carried |
| 9 | 15 | Steps 6 to 8 | Banked Fire unlocks. The plan picks the fire per ground and keeps it | One fire at a time. Saved per ground (section 10) |

## 9. Checked against the data

Looked up on `origin/set/v0.2.144` on 2026-11-22: `fists.js` (Practice Wraps, Sluicer's Knuckles, `selfHealPm` 8), `abilities.js` (lanes, Undertow's `alone`, Protective Ward's ally shield, the six fist strikes), `statuses.js` (Bleed, Sickness maxStacks 1, Chill), `condition-metrics.js` (`enemy_casting`, `effect_missing`, `allies_below`, `ally_hp_pct`, `target_is_boss`, `enemies_in_aoe`), `monster-roles.js` (reaches, `spread` over the front row), `hunt-roles.js`, `recruits.js` (jobs and the role skip), `start-kit.js`, `hunts.js` (Mill Cellar, the Sewer), `monsters.js` and `monster-spells.js` (Sewer Kobold, Muck Fling, Rat King, Squeal), `runes.js` (Chalked, Fire, Ice, Poison), `catacomb-armor.js` (Fire-Tender's Cap, Soapboiler's Boots), the ground packs (Pyre Wraith, Farmhand, Fordsunk).

Every new name (moves, statuses, nodes, vows, Signatures, Nest Heat) was searched in `src/data` and `docs/design/redesign`. Changed after the search: "Bellows" (a forge upgrade in `shops.js`), "Brittle" (Brittle Skeleton), "Bonesetter" (Bonesetter's Staff), "Mudlark's" (Mudlark's Mitts), and anything with "Tender" in a node name (Trait #11 Pyre Tender).

## 10. Repeated decisions (the first principle)

| Where a player could repeat a choice | How it's removed |
|---|---|
| Which three strikes on this ground | Saved per ground in the plan, applied at the start. The suggested bar reads the ground's roles (Casters: Cold Palm) |
| Which fire | Saved per ground with the bar |
| Keeping a debuff up | Auto-combat with the suggested conditions. Nobody presses a strike |
| A second support hero | Copy build, or a share code |
| Overlap with the healer's Green Sickness | Lye Hands waits by itself while Sickness is up. Nothing to set |

## 11. Docs changed in this lane

| File | Change |
|---|---|
| `17-talent-tree.md` | Section 1 and 3: the Hearth is the support's country (this doc). The generalist's softer bands and third borrow slot are cut |
| `19-power-ledger.md` | Row 9: 2 borrowed moves for everyone. L13 and V12 rewritten to the support |
| `20-v030-the-roads.md` | The fist generalist rows now point here, and R-X3 is named |

## 12. Open

- Open Fire at +4% and Banked Fire at +25% are guesses until F5 reads them against Hunter's Mark (+20% on one target) and Sickness (+10%).
- Armor Break's worth depends on how much of a blow monster defense takes at each depth. F5 reads it, and the −25% moves to fit 4.1.
- Whether the wraps should be two-handed once a support off-hand (a charm, a lantern) exists. Not now.
