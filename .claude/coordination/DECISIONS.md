# DECISIONS

_Team-wide decisions and their rationale. Append newest at top. Every entry: DECISION · WHY · AFFECTED AGENTS · DATE. A decision here is binding until explicitly superseded by a later entry._

---

### 2026-08-31 — DESIGN RULINGS BATCH (four queued from the b497/b498 reviews)
**Game Designer, acting under design authority. Binding until superseded.**

**1 · THE STREAK LABEL COLLISION → RENAME BOTH. DO NOT MERGE THE STREAKS. (authored)**
Hearthrise has two true streaks and they may not share a word. The **PLAY streak**
(`G.streak.count`, days settled) pays renown (`streakBest x5`) and the Week Warrior /
Devoted achievements; the **CLAIM streak** (server-derived by `deriveLoginStreak`) pays the
7-day gold/gem cycle. *Measured on b498, headless boot of the real client, play streak 3 with
a missed claim day:* the welcome-back modal read **"Daily streak 3 days"**, the Home card
behind it read **"Daily reward · Day 1"**, and the sheet read **"1-DAY STREAK"** — three
surfaces, two numbers, one word, inside ten seconds. Every number was correct; b498 fixed the
arithmetic and left the naming, which is the same trust failure at a fraction of the cause.
*Ruling:* the reward sheet drops the word "streak" entirely and states its **cycle position**
("Daily reward · Day 1 of 7"), which is also strictly more informative — it names the D1..D7
ladder directly below it. Every play-streak surface says **played / running / in a row** and
never "daily". **MERGING WAS COSTED AND REJECTED:** making the reward ride the play streak is
a server change (`deriveLoginStreak` + `hr_claim_daily` + edge redeploy + security review)
whose *effect* is to pay MORE for LESS engagement — the cycle would escalate on any visit
instead of on the daily act of claiming, and a player who claimed once then merely logged in
for six days would collect the Day-7 jackpot. It would also couple two reward spines
(renown and the login cycle) to one counter, so neither could be tuned alone.

**2 · AUTO-EAT WITH `auto_eat_food` NULL → CHEAPEST-SUFFICIENT, PROCESSED FIRST. (spec, routed)**
Today a NULL nomination makes the server eat `bestHealingFood` — the biggest healer in the
bag. *Measured:* **17 of the 31 auto-eatable provisions are `raw:true` crafting stock**
(every raw fish, plus wheat / goldenroot / emberfruit / moonbloom), so the rule eats the
Cooking skill's own supply chain: one Moonbloom auto-eaten is 1,750 g and 780 Cooking XP of
Moonbloom Elixir destroyed. It also **overheals** — `resolveAutoEat` caps at maxHp, so a 42 HP
Cooked Shark spent on a 20 HP deficit throws away 22 HP. Costed over a 12 h night at one meal
per 45 s: a late-game fisher/cook burns **864,000 g of food where 230,400 g does the identical
job** (45.0 vs 12.0 gold per HP restored). *Ruling — the order is:* (a) the nominated food if
owned and legal; (b) among owned provisions that **cover the deficit** (`maxHp - hp`), prefer
**non-`raw`**, then **lowest book value**, then item id; (c) if nothing covers the deficit,
today's `bestHealingFood` — largest heal — because survival beats thrift exactly there.
"Covers the deficit" means "heals to full", so **(b) is HP-identical to today's rule and
strictly cheaper: a Pareto improvement, never a nerf.** *"refuse-until-set" is REJECTED* — it
punishes non-engagement with a whole night's lost accrual for a setting the client has never
once sent when this was ruled) and it would undo b497's free Auto-Eat I.
**STILL REQUIRED AFTER b499's SETTINGS SYNC**, which landed while this was being written: the
sync makes `auto_eat_food` the player's pick, but the NULL fallback still answers for (a) every
character until its owner opens Settings and touches the picker, and (b) any character whose
nominated food runs out mid-night — `chooseFood` falls through to `bestHealingFood` on an empty
stack, which is precisely when a bag full of raw fish is standing there.

**2b · MAY A PLAYER DISABLE AUTO-EAT WHEN AWAY SURVIVAL DEPENDS ON IT? → YES. ARM THE TOGGLE.**
*(Answering the b499 `SYNC_ENABLED_TOGGLE = false` hold in CONFLICTS 2026-08-31, and covering
the DIAL as that entry correctly demands.)*

**The switch and the 0% end of the threshold dial are one decision and get one answer: both are
the player's, and the server must honour both.** It is a self-only choice over the player's own
resources — it mints nothing, it crosses to no other player, and Hearthrise has **no item loss
on death** (a standing rejection: "death-protection blessings → fake stakes"), so `simulateSpan`
keeps everything earned up to the death and forfeits only the remainder of the span. Opportunity
cost is the right-sized consequence for a deliberate choice, and *"do not burn my 2,100 g
Moonfish Fillets on a low-value grind"* is the reason the control exists at all.

**DORMANT IS NOT THE SAFE POSITION — IT IS THE DISHONEST ONE, AND THAT IS WHY THIS IS A YES.**
Two facts settle it. First, the dial's 0% minimum is **already synced today**, so the 0-kill
night is already reachable through a live key; withholding the switch protects nobody and only
makes two equivalent controls behave differently. Second, and worse: with the toggle dormant a
player who switches Auto-Eat OFF still has the server eating their food all night. **The UI says
off and the engine eats** — the exact "a UI that says one thing while the engine does another"
failure class this codebase names in `gen-catalogues.mjs` and spent b498 paying down on the
streak sheet. A player finding their Cooked Sharks gone in the morning after switching the
feature off is a trust bug, not a protection.

**THREE BINDING CONDITIONS — arm it with all three, or not at all.** The answer to "they might
not have understood" is never a guardrail; it is making the consequence legible.
1. **AT THE CONTROL.** Both the toggle's off state and the dial's 0% end read:
   *"You will not heal while away. A fight that outlasts your health ends the night early."*
2. **ON THE RETURN RECEIPT, NAMED.** The death row already renders (`src/legacy.js`, b341:
   *"You died to X — nothing was earned after"*). When the span died with auto-eat disabled or
   the threshold at 0, it must say **why**: *"You died to Ancient Bear — auto-eat was off, so
   nothing healed you."* This is the condition that turns a silent loss into a rule the player
   learns once. ⚠ It must be **STATED, NOT INFERRED** (b341's own standard): the away receipt
   needs to carry the auto-eat state for that span. If the field does not exist yet, add it —
   do NOT reconstruct the sentence from the client's *current* toggle, which is a different
   instant than the one that killed them.
3. **THE DEATH SHEET STOPS SELLING WHAT THEY ALREADY OWN.** `src/features/death-sheet.js` reads
   ownership to nag "unlock Auto-Eat". For a player who owns a tier and has it switched off it
   must say *"Auto-Eat is switched off"* with a one-tap re-enable, not quote a Store price.

**The dial keeps its 0%.** `clampThreshold`'s b326 note exists to preserve a deliberate zero
("manual healing only"); removing it would be the paternalism this ruling rejects. The designed
answer to the same need is Standing Orders B1 *Withdraw when… food out / HP danger* (board §10
#4) — retreat instead of dying. The disable toggle is the crude version of it and stays free.

**3 · THE OFFHAND IS NOT A DEFENCE SLOT. SHIELDS PROPER ARE BLOCKED, AND THE BLOCKER IS NAMED.**
First, the record: **zero shield items exist** (`slot:'shield'` count = 0). The report is an
empty *socket*, not orphaned items. Second, and this is the ruling: **defence saturates at
tier 3-4 and a shield has nothing to sell.** `monsterCombatRolls` floors monster accuracy at
`monsterMinAccuracy = 0.10`, and `monsterAccuracyPerPoint = 0.006` spans the whole 0.50→0.10
range in **67 points of defence** while the plate ladder delivers **281**. Measured against
the toughest monster of each tier: a plate wearer is at the floor from **Steel**, leather from
**Mithril**, and by **Dawnsteel even cloth is floored** — and an offhand carrying up to +58
defence changes the incoming number by **0.0%** from tier 5 up, against every monster in the
game (highest `atk` is 105). Shipping a defence offhand ships seven pieces of vendor trash.
*Ruling:* (3a) the offhand becomes the **WARD line** — crafted charms/totems carrying a small
`critB` and a **class `bane` at 1.15** (weapons keep 1.40; `baneIndex` takes the max so they
never stack), fed by the signature drop of each monster class. It needs no handedness seam
because it grants no defence, it makes the offhand the one slot you swap *per hunt*, and
`bane` is read from any slot by an expression both engines already share. **SPEC'D, NOT
AUTHORED** — 8 new items need icons under the art freeze, and a generic-chest fallback is the
"generated" tell the emoji sweep exists to kill. (3b) **Real shields stay blocked** on the
combat fix, which is *already precedented in the same file*: Wave 5b added `ACC_DEF_MUL` to
scale monster DEFENCE against player accuracy "so weapon atkB still matters at the top of the
ladder", and the mirror on the ATTACK side was never written. Once it is, shields are **one
row in `ARMOUR_SLOTS`** and the generator lays down all 21 offhands, priced and gated.

**4 · CLOTH: KEEP THE b497 TIER-PLANK STOPGAP. DO NOT COMMISSION THE BOLT LADDER.**
*Measured:* the stopgap did its job — cloth's out/in ratio at tier 7 went from **140x to
5.6-9.7x**, against a plate ∪ leather band of 3.4-6.9x. Two residuals remain and neither is a
player-felt moment: cloth is still the hottest crafting faucet at the top, and `ceil(bars/2)`
collapses **four of six slots to an identical cost** (helmet/boots/gloves/belt all = 1 plank).
A bolt ladder is 7 items + 7 sources + 7 icons + a catalogue migration + an edge redeploy to
refine a curve that is already inside tolerance, and it would strand every current cloth
crafter behind a new input. *Ruling: keep, and the expiry is a CONDITION rather than a date* —
the bolt ladder becomes correct only if a tiered cloth material acquires a source for another
reason (a Weaving skill, or the Chitin-Weave "second supply chain" pattern extended to cloth).
Until then one tiered plank + one untiered arcane reagent is the right shape. The residual is
a **one-line tightening**, spec'd and measured, to ride the next change that already needs an
edge redeploy: plank at FULL slot weight, `silk_thread: 1 + i`, `magic_essence: 1` — cloth
becomes "leather's recipe plus one essence", lands at **3.6-6.6x** (dead centre of the band)
and restores slot shape (body/belt 4.31x vs plate 5.00x / leather 4.48x).

**Affected agents:** Systems Engineer (2 = the auto-eat ordering + the disable copy; 3b = the
monster-attack tier scale), Asset Director (3a = 8 ward icons), Art Director (2b toggle copy),
Coordinator (edge redeploy + catalogue migration ride along with any new item).

---

### 2026-08-23 - DESIGN RULING (b432) - Runecrafting owns every rune in the game
**Game Designer, acting under design authority. Binding until superseded.**

Tyler: *"it doesn't look like you ever fixed runecrafting to make more sense."* Five rulings, in the
order a player meets them.

**1 · RUNECRAFTING OWNS EVERY RUNE.** `bind_ember_rune` / `bind_frost_rune` / `bind_poison_rune` move
from Crafting 25 to **Runecrafting 25** — the gate is moved, never raised, so no live player is
pushed further from a feature they already had, and the essence costs are unchanged so no supply
chain moves. Crafting's "Runes" category leaves with them. *Why:* Elements v1 shipped the runes the
game ACTUALLY uses (spend one, brand a weapon, +15% against a monster weak to that element) as
CRAFTING recipes, in a Crafting lane literally labelled "Runes", while a skill named Runecrafting
made a different set of runes entirely. The word "rune" pointed at two skills. No amount of tuning
fixes that; only ownership does.

**2 · EVERY RUNE IS BOUND ONTO A BLANK RUNE.** The three adopted recipes gain `rune_blank: 4`. *Why:*
it gives the bench one grammar a player can state in a sentence — *a blank, plus something to write
on it, makes a rune* — instead of two unrelated recipe shapes filed under one name, and it means the
level-1 on-ramp feeds the ENTIRE skill rather than half of it.

**3 · RUNECRAFTING IS PLAYABLE AT LEVEL 1 WITH NOTHING ELSE TRAINED.** Two routes, deliberately:
`cut_rune_blanks` drops from Stonemason 8 to **Stonemason 4** (the free route, for a player heading
that way anyway), and the Local Shop counter — the tab is relabelled **Supplies** — stocks **Blank
Rune x20 for 140 g** (the gold route, for a player who never wants to be a mason). *Why:* every one
of the skill's eleven rungs wanted a blank and the only blank in the game came from level 8 of a
different skill, so a player who opened Runecrafting first found eleven actions and could perform
none of them, forever. **The price is a constraint, not a preference:** `rune_blank` is not `raw`, so
the vendor buys it back at its full 5 g book value — any shop price at or under 5 is an infinite gold
loop. **The bundle is small on purpose:** one bind eats 6 blanks for 3 effective XP, so a fresh
account's whole 1,000 g buys 63 of the 83 XP level 2 needs. The counter is a START, not a training
method, and a small repeatable bundle says so without a tutorial.

**4 · THE THREE ENCHANTING RUNES ALL SIT AT 25 — A CHOICE, NOT A LADDER.** *Why:* their essences drop
from perfectly parallel sources (tier 3/4/5 monsters at 0.08/0.09/0.10 each). A level ladder between
them would be a fiction, and a fiction that tells the player ember is "better" than frost when the
whole point of the element axis is that the right one depends on what you are fighting.

**5 · ONE RUNE IDEA, AND THE COPY TELLS THE TRUTH ABOUT E1.** The dormant `rune_of_ember` /
`rune_of_frost` / `rune_of_poison` trio is **retired** — a second authoring of the three live
Elements v1 runes — and its painted art is renamed onto the live ids. The Runecrafting screen gains
two named lanes, **Staff Runes** and **Weapon Enchants**, and the seven staff-rune descriptions now
open with the mechanic (socketed for Magic strength). **None of them promises a burn.** `ammoPerShot`
is authored but nothing spends it: E1 is unbuilt because `combat-sim.js` is SHA-pinned into the Edge
function. `src/core/ammo.js` already states the rule this copy obeys — *"no player-facing copy
anywhere may promise that it is [spent]"*. When E1 lands, those seven lines are the one place the
wording changes.

**AFFECTED AGENTS:** Systems (hr-accrue redeploy + catalogue migration; the `seed.rune_blank` offer
id and the `SUPPLY_SHOP` rename that should follow it) · Art Director (`poison_rune` has no art and
falls back to a treasure chest; the landscape skill strip omits both new artisan skills) · QA (three
new/rewritten guards: ELEM-1/b432 ownership, the b432 pure-Runecrafter E2E, the b432 acquisition
test). **DATE: 2026-08-23.**

### 2026-08-17 - DESIGN RULING (b373) - Two rulings from the b372 FTUE run: the death moment, and identity scoping
**Game Designer, acting under design authority. Both are binding until superseded.**

**RULING 1 - DEATH COSTS THE RUN, NEVER THE HEALTH. Every live death opens a receipt.**
A death fully heals the player, at every level, always - no "first N deaths" carve-out, no
partial respawn, no recovering debuff. *Why:* the penalty that already exists is the right one and
is enough - the run STOPS, away accrual stops paying, the bounty streak resets, and the time is
gone. An HP penalty on top is a second punishment that lands **only** on the player who cannot pay
it (a fresh character has 10 max HP, no auto-eat and no regen, so a partial respawn is a
deterministic death spiral) and on nobody else (a veteran eats or regens it back for free). It is
also actively wrong for an idle game, where the player is frequently not watching: "respawn wounded
and resume" is a loop that kills an unattended player forever. `resolveDeath` in
`src/core/combat-sim.js` already intended exactly this; the ruling makes it TRUE ON SCREEN.
Item/gold loss on death stays at zero, and the death sheet now states that out loud - if a loss
penalty is ever proposed, the "You kept everything you were carrying" row is the contract it has to
renegotiate.
Every LIVE death opens a one-screen sheet: what killed you, what it cost, ONE tip chosen from what
you were actually carrying, and the two doors (fight again / war table). Not "first N deaths" - a
live death always ends with the game idle, so the sheet is not an interruption, it IS the choice
the player already owed. AWAY deaths never open it; the welcome-back receipt owns those.

**RULING 2 - NAME, PORTRAIT AND CLAN ARE ACCOUNT-SCOPED. HEROES ARE SLOTS, NOT PEOPLE.**
Per-character identity is REFUSED. The name is an ADDRESS (chat, market, leaderboard) held as a
server-side UNIQUE INDEX on `auth.uid()`; the portrait lives at a derived path `avatars/<uid>/`
precisely so it cannot disagree with its owner; clan membership, seat and ledger are account-keyed
server-side. Per-character versions of any of the three mean a namespace multiplied by five, a
cheaper impersonation surface, a storage migration and a second sync surface - for a cosmetic gain.
What IS per-character is everything you PLAY: skills, inventory, gold, equipment, bound items,
quests, farm. **So the UI stops implying otherwise**: heroes are addressed as "Hero N"
(`HearthriseProfile.heroLabel`, derived and never stored), the Characters modal renders the account
portrait deliberately on every row and its copy states the split in both directions, and Home's
hearth carries a quiet "Hero N" chip so the account name reads as the account's.
**Named server follow-up, deliberately NOT built:** per-hero nicknames need a server-side label
column on the character row so they sync - `hearthrise:profile` is device-local, so a stored
nickname would vanish on the player's second device. Better no nickname than a lying one.

**Affected agents:** Systems Engineer (the two handoffs in CONFLICTS.md), Art Director (the death
sheet is a new surface), QA (b373 suite).


### 2026-08-17 · STABILIZATION GATE + a second session in flight (Tyler, direct)
**Decision.** (1) A SECOND Claude session is working logo/avatar reworks and will coordinate with
this session when ready — integrate through the standard pipeline (merge → suite → visual gate);
watch coordination files and incoming session messages. (2) After the current two builds land
(item wave wiring + combat rework Phase 1): **FULL STOP for a QA/audit/playthrough** — the game
played end-to-end as a player, every screen and system, desktop + mobile-landscape, ranked
broken-list, fixes shipped — BEFORE any further feature work. Tyler: 'lets do a full
QA/Audit/Playthrough of the game and fix whatever is broken before we keep moving forward.'
**Date:** 2026-08-17.

---

### 2026-08-17 · COMBAT REWORK SPEC — APPROVED by Tyler ('i like the combat spec')
**Decision (Tyler, direct).** docs/design/combat-screen-rework.md is approved: the two-screen
architecture (THE WAR TABLE menu + THE FIGHT stage), Melvor-density-with-order as the bar, the
preview state replacing the 'Awaiting a foe' void, nav-opens-live-fight, and the fold audit
(27 KEEP / 3 MERGE incl. barn_rat→rat / 3 RENAME / 1 differentiate — aliases make progress-safe).
Build order per the spec's own recommendation: cards 01-16 as the Phase-1 block (pure
render/routing/CSS, no engine), folds ride along (one-line aliases, reversible), backdrops (17)
DEFERRED until backdrop art exists (Tyler's web-UI session or later — no spend). The hidden-Flee
P1 is absorbed by the fight screen's action bar. Ships through the RELEASE VISUAL GATE.
**Date:** 2026-08-17.

---

### 2026-08-17 · LIVE-PLAY SETTLEMENT is the next program — SUPERSEDES the feature order (Tyler, direct)
**Decision (Tyler, after the b359 P0):** live play must be recorded server-side — "kill monster,
kill is recorded on the server, exp is recorded on the server, and all loot gained is recorded on
the server." The working architecture: **live play is away accrual that happens while you're
watching** — the client tick becomes display prediction, and the client SETTLES every ~30-60s (and
on switch/hide/close) through the SAME accrual engine, watermark, and idempotent apply that already
pay away time. No per-swing round trips. Spec first (backend-architect, in flight →
docs/design/live-settlement.md), phased strangler-fig build after, Security gate before each deploy.
**This outranks the remaining feature list** until live play is server-recorded, because it retires
the b359 emergency merge (a deliberate, temporary authority weakening) and closes the last
client-authored progression surface. The b359 merge and its test forms (B359-1, the rewritten b337
and B339-5) retire ONLY when settlement makes the envelope complete — record.js:119-144 is the
ordering rule. **Date:** 2026-08-17.

---

### 2026-08-16 · HUNT BAND FAIRNESS — APPLIED to production (Coordinator)
`2026-08-12-raid-band-fairness.sql` is **APPLIED** (was staged since 2026-08-12; item #1 in Tyler's
locked build order). Replaced 4 functions: `hr_hunt_share`, `hr_hunt_band`, `hr_hunt_band_mul`,
`raid_claim__ungated`. Its self-checks include LIVE controls (an ordinary current-week solo claim
must still work and write a ledger row; an eligibility refusal must survive the rewrite) — all
passed at apply time, which is the verification. **Effect for players: `below_band` is deleted as
an outcome — no action by any clanmate can move another member below being paid; the band is now
measured against your share of the boss (`max_hp / members_at_declare`), not against other players'
damage.** Still open, unchanged: when `2026-08-12-clan-members-rls-drop.sql` lands it MUST ship a
companion revoke of clan_members/clans i/u/d grants or the nightly detector raises. **Date:** 2026-08-16.
### 2026-08-17 · §8.4 RULED — STONE COMES FROM A QUARRY LANE (P2), NOT A MINING BY-PRODUCT (P1)
**Decision (Game Designer, under delegated design authority; `consumable-economy.md` §8.4 left this
OPEN and recommended P1).** Stonemason gains three **input-free** recipes — Quarry Rubble (1),
Quarry Granite (30), Quarry Basalt (70) — and that is where stone enters the game. The `byprod:`
field on `ROCKS` proposed by P1 is **not** built.

**Why, in the order the reasons mattered.** (1) **Server authority decides it.** P1 edits
`resolveGatherAction`, which is vendored into `hr-accrue` under a pinned payload hash; P2 is legal
server-side today (`artisan` is a PAYABLE_KIND, `recipeInputs({})` already works, and Prayer's bury
actions ship the mirror case). A content skill must not be the change that re-pins the combat
engine. (2) **The new-player wall.** Round 2 is a wipe, so *every* player meets this skill at level
1; under P1 a player with no mining history opens an empty skill, under P2 they press one button and
are a mason. (3) **Time is the honest price of a castle** — P1 makes stone a free rider on an
activity already being done, so castle goods would cost no time that was not already spent.
(4) **It does not duplicate the mining fantasy** (the doc's stated objection): mining pulls metal for
the forge, quarrying cuts building stone for the wall, and a quarry rung is not in `ROCKS` so it
cannot disturb the b226 "every gathering rung is strictly better" invariant.

**The cost, stated:** the lane mints from nothing, so all three stones are `raw: true` (vendor bids
20%) and a smoke guard asserts every input-free artisan output carries the flag. **P1 remains
available later as a pure convenience** that tops up the same items; it composes with this lane
rather than replacing it, and is a better second change than it would have been a first.

**AFFECTED:** Systems (no engine change requested), Security (one priced faucet), Fletching (the
precedent for lane shape), Art/Asset (three new material icons).

---

### 2026-08-16 · BESTIARY CHARMS (PROG-01, Tibia-style) — direction APPROVED by Tyler
**Decision (Tyler, direct: "The bestiary system that tibia has would be SOOOOOO SICK").** The
Tibia-style bestiary is approved as a direction: kill-count progress per monster unlocks bestiary
entries; completing entries earns charm points spent on category-scoped perks. It composes with
the monster-rework taxonomy (its value scales with the approved category system) and its power
lives inside `weaknessInfo` with a `MAX_BANE_MULT` invariant — NEVER as a `getBonus` key, or the
server engine reads it as zero (designer's routed flag). Kill-thresholds, charm list, and point
economy flow through the review book; sequencing stays behind the monster rework it depends on.
**Date:** 2026-08-16.

---

### 2026-08-16 · REVIEW BOOK ROUND 2 — Tyler's full approval sweep (review-decisions.json, generatedAt 1786860824128)
**Decision (Tyler, via the review book export — BINDING).**
- **All 81 monsters APPROVED** (every MON-* card), including the Tibia-derived 11-class taxonomy, renames, and tier fill. DEC-NEUT-01/DEC-ALIAS-01/DEC-ELEM-04 (Poison) approved.
- **All items APPROVED**: every ITEM-PLAN-* (1-10) and every surviving ITEM-NEW-* card. Rejected six stay rejected.
- **Progression: PROG-01 (Bestiary Charms), PROG-02 (Diaries), PROG-03, PROG-08 APPROVED.** PROG-04/05/06/07/09/10 = maybe (parked, not rejected).
- **Events: ALL FIVE EVT-* cards APPROVED** — the Kindling/Beacon ships as spec'd (rev 2, ember-over-vendor valuation, 50/50 seeded tie-break).
- **DNG-VAMP-01**: Tyler requested the actual WWDITS cast names (Lazlo, Nadja, Nandor the Relentless, Gizmo, Colin Robinson) with named drops. **UNRESOLVED — Coordinator advised verbatim protected names/characters are an IP risk for a commercial launch; parody-distance alternates proposed to Tyler.** Do not wire real-cast names into src/data without a later explicit entry here.
The exported file is committed at repo root (`review-decisions.json`). **Date:** 2026-08-16.

---

### 2026-08-16 · THE KINDLING / THE BEACON — APPROVED by Tyler, enthusiastically
**Decision (Tyler, direct: "I LOVE THE KINDLING AND BEACON IDEA").** The events rework's headline
is approved: The Muster is replaced by **The Kindling** (daily donation pool) and **The Beacon**
(weekly pool + blessing vote), per `docs/design/events-donations-and-voting.md`. The rename, the
embers donation concept, and the vote-then-boost shape are locked. Fine-grained parameters
(tier thresholds, blessing-roll list, caps) still flow through the review book, but implementers
may treat the system's existence and shape as settled. The three routed flags in CONFLICTS.md
(fuse re-split, `beaconWeekKey`, away-channel rule) bind the implementation. **Date:** 2026-08-16.

---

### 2026-08-16 · Post-cutover feature ORDER locked (Tyler, batch 2)
**Decision (Tyler, direct).** The Coordinator's recommended order is adopted as the build sequence,
with Coordinator discretion to run overlapping items simultaneously: **Hunt band fairness (staged,
apply it) → Completion Log → Quest Board rework → Supply projection + Fletching (one arc: the
depletion economy) → World-boss blessing → then the remaining list as previously numbered.**
Back burner: Practice tiers, buy-offers return. Elements/enchanting stays sequenced after the
monster rework (batch-1 ruling).

**The governing priority right now is THEORIZING THE SYSTEMS** — making them "fun / understandable
but deep, familiar but unique" (Tyler's words). Design/spec work leads; implementation follows
Tyler's approvals through the review book. Every new system spec is held to that bar: a player
should recognize the shape from games they love (OSRS/Melvor/Tibia/Idle Clans lineage) and still
find something Hearthrise-only in it.

**Affected:** all agents. Design-first dispatches take precedence over feature implementation
except where implementation is nearly free (staged migrations, small QoL). **Date:** 2026-08-16.

---

### 2026-08-16 · Tyler's post-cutover feature rulings (batch 1)
**Decision (Tyler, direct).** Against the numbered post-cutover feature list:
- **Back burner:** "Practice" familiarity tiers (#6) and buy-offers return (#11). Not cancelled — deprioritized.
- **Elements/enchanting (#12):** sequence AFTER the monster rework (#7), because the monster rework redoes all weaknesses and elements hang off them. Steal liberally from RuneScape/Melvor — the original spec is a starting point, not a contract ("It doesn't have to be exactly how I laid it out. Just make it make sense.").
- **Monster rework (#7):** the Game Designer produces a LIBRARY of monster categories/types/enemies as candidates; Tyler picks from it. Nothing ships un-picked.
- **Auto-eat** must ALSO be purchasable in the bounty shop (100-mark auto-eat already decided 2026-08-09) so it can't be missed.
- **UI:** on every building-upgrade panel, the "Build (hearthstone)" button moves to the TOP — no scrolling to find it.
- **Events rework:** rename "The Muster" (name TBD by Designer). Replace the pick-one-rally shape with **daily + weekly donation pools** that boost the daily/weekly blessing: e.g. daily blessing is combat XP → a shared donation pool (food/gold) fills tiers granting +1–5% to that blessing; weekly is the same at much larger donation totals, also +1–5%. Add a **voting system for the weekly blessing** — needs a wider blessing-roll library; voting closes 1 day before the weekly reset, and the weekly reset is **Sunday night**.
- **The Review Book:** Tyler wants an interactive HTML review page where he browses designer-proposed content (monster library, current + upcoming items, progression-advancement options) and approves/rejects each with notes. Designer content is custom but steals from Tibia, OSRS, RS3, EverQuest, Melvor, Idle Clans — use their wikis/online libraries. Tyler's exported decisions become binding design input.

**Affected:** game-designer (monster library, events/blessing design, item + progression option catalogues), systems-engineer (bounty-shop auto-eat, build-button placement), Coordinator (review book build + decision import). **Date:** 2026-08-16.

---

### 2026-08-12 · The Hunt band is measured against the boss, and there is no unpaid band
**Decision (Game Designer, own authority).** `raid_claim`'s contribution band stops ranking players
against each other. The bar is now `hr_hunt_share(max_hp, members_at_declare)` — the pool split over
the roster it was sized for — and the ladder is floored: champion ×1.3 at 1.5× your share, full ×1.0
at 0.5×, partisan ×0.6 below that. `below_band` is deleted as an outcome; the RPC can no longer
refuse a chest for being small, only for being absent. On a week the boss survived the band floors
at `full`, because the payout is already multiplied by the partial factor and a clan that fell short
must not be cut twice. Staged as `supabase/migrations/2026-08-12-raid-band-fairness.sql`; NOT applied.

**Why.** The median was chosen (b223) to be clan-size-independent, and it is — but it made every
member's chest a function of every other member's damage, and `percentile_cont` interpolates, so in
a clan of two the bar simply IS the other player's number. Executed proof
(`tests/raid-band-denial.mjs`): hold a member's week completely fixed at 1,800 damage over 3 strikes
in a Tier I Hunt for two, and sweep her clanmate's week across its legal range (3,000 → 25,000, the
per-day clamp × 5). Her verdict walks full ×1.0 → partisan ×0.6 → **below_band, nothing** — three of
seven legal clanmate weeks pay her nothing, with no forgery and nobody doing anything wrong. A
co-operative weekly event in which the selfish play is to hope your friends underperform is the
inverse of the point.

**Both named remedies, not one.** Banding against `max_hp` alone is insufficient: total damage is
bounded by the pool, so shares are a contended resource and a heavy hitter still eats HP others would
have earned out of. The floor is what actually removes the primitive — with no unpaid band, no action
by any player can move any other player below being paid.

**What still stops a free-rider.** Nothing about that changed: `no_contribution` (zero damage) and
`too_few_strikes` (fewer than 2 strikes, which are 2 separate UTC days), plus joined-after-declare and
joined-after-kill. Those gates are absolute and unmovable by anyone else. The bands rank how well you
did; they were never what decided whether you were allowed to eat.

**Balance.** The chest pays gold/gems/materials, never XP, so this is outside the +52% permanent-power
fuse and cannot move the 8-week first-99 anchor (pacing-overhaul A.4). The ceiling is unchanged
(champion ×1.3, once per week, PK-guarded). The floor rises 0 → 0.6 only for members who were being
denied by other people's arithmetic. Champion inflation is bounded by the boss: Σdamage ≈ max_hp and
Σshare = max_hp, so at most two thirds of a roster can be at 1.5×.

**Affected agents:** Systems (owns applying the migration and the `median`→`share` envelope key),
Art Director (the Hunt card gained three lines of rule copy — the density call is theirs).

### 2026-08-09 · re-Master Itemization & Progression Rework — PROGRAM START, AUDIT FIRST (Tyler)
**Decision:** The largest program yet — full audit + rework of itemization/progression/equipment/bosses/dungeons/crafting/gathering/combat/rewards into one cohesive loop ("simple to understand, deep to master"). 20-phase brief; details in memory [[itemization-program]]. Coordinator plan: Phase 1 = 4 parallel READ-ONLY domain audits → synthesize master audit + new-itemization DESIGN → **bring to Tyler for approval before ANY implementation**. Implementation waits on that approval AND on b229 (character rework) shipping (clean base). NO code changes in the audit phase.
**Affected agents:** all (multi-wave). Read-only auditors now; specialists implement per approved design later.

### 2026-08-09 · Character/Skills rework — DESIGN APPROVED (Tyler: "i fuckin love it")
**Decision:** Tyler approved the visual mockup of the new Character screen. LOCKED: three sub-tabs **Skills · Equipment · Hero**, **Skills is the default tab**; Skills = the OSRS-our-own grid (icon + name + moss XP-to-next bar + gilt level, tile routes to the activity via the existing openSkillDetail/quest-nav seam); Equipment reuses buildTibiaDoll wholesale; Hero holds identity + combat cards + the OSRS-style account stat panel (Combat lvl, Total XP, Quests, Bounties=combat tasks, Collections, Renown rank, Time played "click to reveal"; Achievements→Chronicle/renown or flagged; Time played = new `G.stats.playMs` counter). The fake paywall "Your Heroes" is CUT; the real multi-character selector moves to Home. Spec: `docs/design/character-skills-rework.md`. Build AFTER b228 ships (bonus-rebase in flight; both touch Home). Phase 1 = combined screen + Heroes-on-Home behind existing seams; Phase 2 = grid art + playMs + de-dup.
**Affected agents:** Systems (build, next wave after b228).

### 2026-08-09 · Character/Skills screen rework — PLAN FIRST (Tyler, directive + guardrail)
**Decision:** Tyler wants: (1) "Your Heroes" character-select MOVED from the Character screen to the HOME screen; (2) a NEW Character screen COMBINING Skills + Character, OSRS-style-but-our-own (the classic skills grid with levels, ref screenshot); (3) KEEP the Equipment tab (→ sub-tabs within the combined screen); (4) each skill tile routes the player to WHERE to do that activity (reuse the b227 quest-nav `questDestination`/`openSkillDetail` seams). **Guardrail (his words): "do it smart, don't break any functionality or ruin anything that sets us back."** → Produce a design + migration-safety plan BEFORE any code; sequence the build AFTER the in-flight bonus-rebase + rally-v2 agents land (they touch overlapping surfaces); present the plan to Tyler for reaction before building.
**Affected agents:** Game Designer + Art (plan), Systems (build, next wave).

### 2026-08-09 · Rally pledges v2: auto-join when online, themed loot, no plumbing copy (Tyler, binding)
**Decision:** (1) Pledge rule simplifies — pledged + ONLINE during the window = full participation automatically (no separate live-join click); pledged + offline = half honors on return. (2) A visible "Switch to <the other rally>" affordance on the pledged card until the window opens. (3) Chest contents are THEMED to the event: Forge Levy pays smithing/crafting XP + forge-domain items; each rally's reward table derives from its blessing domain. (4) NO implementation-state copy ever — "provisional / recorded on this device" class of strings is banned; if the server can't hold a pledge, the UI degrades silently or hides the affordance.
**Affected agents:** Systems (rally v2), Designer (themed reward tables ratification).

### 2026-08-09 · Bonus magnitudes rebase: "increments of 2%" (Tyler, binding, global)
**Decision:** All percentage boosts across the game are far too large (rooms at +50% smithing etc.). Rebase to a small-increment grammar (~2% steps). Provisional applied to homestead ladders mid-build (speed rooms +2..10%, Library/Trophy +1..5%); the Designer re-derives the FULL bonus table (castle buildings, blessings, feasts, ales, renown perks, workers?) as one coherent budget with a much lower total ceiling, then Systems applies (b228). Levels/costs owned by players never change — only the magnitude a level grants (owner-stated global rebalance, announced in the changelog, never silent). NOTE (flagged to Tyler): this shrinks the boost headroom — typical engaged pace moves toward the 57-day floor.
**Affected agents:** Designer (retune spec NOW), Systems (apply), homestead agent (provisional relayed mid-build).

### 2026-08-09 · Auto-eat: 5,000g → 100 Bounty Marks; LAUNCH NOTE: raise mark prices at release (Tyler)
**Decision:** The auto-eat trait is purchased with 100 Bounty Marks, not gold. STANDING LAUNCH-CHECKLIST ITEM: all Bounty Mark prices get a raising pass before release — record, do not act yet.
**Affected agents:** Systems (this change), Designer (the release-time mark-price pass).

### 2026-08-09 · Work-order visibility + posting permissions + opt-in voting (Tyler, binding)
**Decision:** (1) An active Work Order is OBVIOUS to every member: what the clan is building, every material needed, live fulfillment per material (e.g. Hall upgrade → the whole clan sees "Timber Beams 340/600 · Iron Fittings 80/200 · Labour 1,200/4,800") — prominent on the clan panel, not buried in a modal. (2) ONLY the Clan Leader and Vice Leaders may post work orders. (3) OPT-IN VOTING: leadership may open the next work order to a member vote (leadership chooses candidates or opens nominations; one vote per member; server-authoritative; result posts the order). Voting is leadership's choice per order — not mandatory governance.
**Why:** Tyler 2026-08-09. Maps onto the clan-overhaul rank model — reconcile "Vice Leader" with the existing role/charge columns (likely: leader + a 'vice' charge; Designer aligns naming).
**Affected agents:** Systems (clan panel WO display + gating + vote RPCs/migration — QUEUED behind the clan-scene agent, same surfaces), Designer (vote flow spec details), QA.

### 2026-08-09 · Presence rework: blessings are presence-gated; flat +12% removed (Tyler, binding)
**Decision:** Tyler: "if you're offline the event doesn't apply to you... you only get that stuff WHILE online. One week it may be 12% exp, another week it may be +10% gold find." The daily/weekly rotating blessings apply ONLY while present (b226's presence definition: tab visible + input ≤10min + activity running). Offline = base rate, no blessing. The b226 flat presence ×1.12 is REMOVED — the rotating calendar replaces it as the entire online-pays mechanic. Blessing pool rotates varied boost TYPES (xp, gold find, gather/smith speed...; goldFind is wired since b222). Rally (join-gated live events) unchanged.
**Why:** Product-owner economy direction 2026-08-09, superseding the b226 flat bonus.
**Affected agents:** Systems (implementation b227), Designer (pool variety + pacing appendix update), QA (offline-excludes-blessings regression).

### 2026-08-09 · Pacing APPROVED with re-anchor: first 99 ≈ 8 WEEKS (Tyler)
**Decision:** The pacing-overhaul package ships, re-anchored from the spec's 28-day first-99 to **~56 days (8 weeks)** — all-99 lands ≈16-18 months. Offline cap becomes the **12h DAILY budget** (approved explicitly). Presence bonus ×1.12 XP-only stands. All five modeling bug fixes ship with it (skillMs offline dampener, farming ×14, VENDOR_RAW_RATE 0.20, Mithril Rock regression, per-item daily counters). Renown weights only rise + renownHigh ratchet + Founder's mark. Constants re-derived from the spec's own model; Designer ratifies the derived table at integration.
**Why:** Tyler's choices via decision gate 2026-08-09.
**Affected agents:** Systems (implementation), Designer (ratify derived constants), QA (rate regression tests).

### 2026-08-09 · Pacing directive — endgame is MONTHS away, presence bonus 10-15% (Tyler, binding)
**Decision:** Tyler on the audit's P0 evidence (9h offline = WC 62 + 16,110 logs): "way too many logs for only 9 hours... the exp seems a bit fast too. I like the idea of an online boost, however I think it should be more like 10-15%. I don't want people hitting end game for at least a few months." Binding parameters: (1) online-presence bonus exists but is +10-15%, NOT the 25-50% the audit suggested; (2) overall XP/yield pacing must be retuned so endgame (99s / top gear) takes MONTHS of normal play — rate reductions are authorized, which supersedes the earlier additive-only framing; (3) earned progress is never clawed back — only rates going forward change.
**Why:** Product-owner pacing call 2026-08-09.
**Affected agents:** Game Designer (pacing model + retune spec — the whole curve, offline AND active, vs a months-to-99 target), Systems (implementation + presence bonus), QA (rate regression tests).

### 2026-08-08 · Accounts are REQUIRED — no account-less play (Tyler, binding rework)
**Decision:** "I do not want any local saves to be available. The users should all be prompted to create an account when they access the game. Whether that be browser or when we migrate to an app for iOS or Steam." Enforced: account creation prompt at game access on every platform; no anonymous/local-only play path. NUANCE (Coordinator, to prevent over-rotation): signed-in accounts KEEP local persistence as the offline cache + offline-progression bank — what is removed is playing without an account, not local caching for account holders. Existing beta players' local saves must be ADOPTED into their new account on first sign-in (sync seam exists), never discarded.
**Why:** Product-owner directive 2026-08-08; realizes the recorded online-only north star.
**Affected agents:** Systems (the rework), QA (the smoke suite currently runs account-less — needs a harness seam), Designer (FTUE re-sequencing), all future work (anon degraded paths become network-resilience paths, not product surfaces).

### 2026-08-08 · Cooking never gated on the Kitchen — open fire + burn chance (Tyler, binding)
**Decision:** Cooking works from the tier-1 camp on the open fire, with a burn chance (burnt food = lost input, vendor-trash output). The Kitchen ladder buys RELIABILITY via the `noBurn` key (formerly a ghost key — now has its designated producer), plus its existing speed/yield rungs. Burn also falls with cooking skill per recipe. Forge/Workshop/Shrine workbench gates unchanged. Amendment recorded in `homestead-deepening.md` §2; Designer owns the burn curve at Phase-1 build.
**Why:** Product-owner rule 2026-08-08. Also note: the LIVE game currently hard-gates cooking on the Kitchen (`homestead.js WORKBENCH` + `startArtisan`) — Wave 4's homestead Phase 1 must remove that gate for cooking and add the burn mechanic together.
**Affected agents:** Game Designer (burn curve), Systems (gate removal + burn implementation + noBurn wiring), QA (burn-rate regression tests).

### 2026-08-08 · Castle + Homestead are the twin ultimate progression pillars (Tyler, vision-level)
**Decision:** "The clan castle and the personal homestead [are] the ultimate points of progression in this game, outside of the obvious maxing skills." Both pillars get the same depth arc and the SAME interaction language (clickable rooms → per-room themed modals with upgrade ladders). The room-modal machinery being built for the castle must be a reusable seam; the homestead adopts it next wave. Future content investment prioritizes deepening these two pillars.
**Why:** Product-owner vision directive 2026-08-08.
**Affected agents:** all — Game Designer (homestead deepening program next), castle-panel builder (reusable seam, relayed), Art Director (one visual language across both).

### 2026-08-08 · Castle page: block-built visuals + clickable rooms with per-room themed modals (Tyler, binding)
**Decision:** The clan/castle page incorporates castle-block (stone/masonry) visual language, and EVERY room/building/section is clickable, expanding a modal themed to that specific room carrying its corresponding information and upgrade ladder (Tyler's example: kitchen modal → stove upgrades). Not six generic modals with different titles — each modal reads as ITS room. Tyler: big detailed ask, quality over speed, "okay if it takes some time."
**Why:** Product-owner direction 2026-08-08; strengthens the spec's existing modals-keep-the-page-clean rule into the page's core interaction model.
**Affected agents:** castle-panel builder (relayed mid-build), Art Director (beauty pass must deepen per-room theming), Game Designer (room info architecture).

### 2026-08-08 · Autonomous wave progression authorized
**Decision:** Tyler: "Keep pushing through the waves automatically, you're the coordinator." The Coordinator runs waves end-to-end — dispatch, integrate, verify (full gate: smoke green + browser verification), bump build, ship to production — without per-wave sign-off. Any wave that fails the gate, opens a P0/P1 regression risk, or requires a product-owner judgment call (economy, monetization, destructive changes) STOPS and asks.
**Why:** Product-owner directive; the gate (177/177 + visual verification + regression tripwires) is the safety net.
**Affected agents:** all.

### 2026-08-08 · New backlog items #13-#16 (farming/watering, event discoverability, world-event cadence + topbar timer, clan boss events)
**Decision:** Added per Tyler. #13 direction: watering becomes OPTIONAL (speeds growth) so auto-replant works unattended and active play is rewarded — Designer specs the numbers. #15 direction: world events 2x/day, joinable once/day per player, visible countdown in the topbar. #16: clan-tier group-boss events, designed alongside the clan castle (#10).
**Affected agents:** Game Designer (specs), Systems, Art.

### 2026-08-08 · Team system realized as Coordinator-dispatched subagents
**Decision:** The five specialists are Claude Code subagent definitions (`.claude/agents/*.md`) dispatched by a Coordinator session, not five persistent overnight processes. Worktree isolation is applied per-dispatch when a specialist writes files, to avoid parallel-write collisions.
**Why:** Matches Claude Code's actual primitives (no persistent daemons); keeps integration under one coordinating owner; still gives true isolation for concurrent writes. (Product owner chose this over separate-session-per-worktree.)
**Affected agents:** all.

### 2026-08-08 · Push cleanup + audit to production
**Decision:** Committed the verified-safe asset/doc cleanup as its own commit (`119a698`) and pushed it plus the audit commit `5ac5ab9` to `origin/main` (auto-deploys).
**Why:** Product owner directed "commit AND push everything"; cleanup was verified move-not-delete, smoke 175/175. Gives the team a clean, green, in-sync base.
**Affected agents:** all.

---

### 2026-08-08 · Backlog sequenced into 4 waves; implementation serialized on the monolith
**Decision:** Tyler's 12-item list is triaged in `BACKLOG.md` and sequenced Wave 0→3. Because most items touch `src/legacy.js`, implementation is serialized per wave; only disjoint-footprint work runs in parallel (via worktree isolation), and design/spec work runs read-only in parallel up front. Wave 0 = the tab-snap-back unblocker (#3) + foundational type/logo (#1,#2) + design specs for later waves.
**Why:** Reckless parallel edits to the entangled monolith would produce merge/semantic conflicts; readable type (#1) must land before other visual work rebases onto it; the snap-back bug (#3) sabotages all UI verification until fixed.
**Affected agents:** all.

_(New decisions below, newest first.)_

## 2026-08-17 — b364 + b365 shipped; stabilization begins with device handoff
- b364 (settlement Phase 1 + rebrand + avatar picker) and b365 (War Table + Fight screen, fold 111->108) both passed the release visual gate (screenshots read at desktop + 922x423) and are live. Catalogue re-applied and hr-accrue redeployed BEFORE the b365 client push.
- Tyler (2026-08-17, verbatim): "We desperately need to fix this server / local back and forth bullshit... all I tried to do was move from my computer to my phone. Wildly terrible experience." Device-handoff sync UX is the TOP stabilization item — QA audit dispatched; findings gate the fix wave before the full playthrough.

## 2026-08-17 — Fresh-eyes audit (b370) outcomes
- Verified by Coordinator against prod (the audit lacked SQL access): equip-release-codes, clan-deposit-ownership, and skill-row-upsert ARE all applied and verified by discriminating anchors. The audit's "Server" scorecard ratings stand.
- P1 dispatched: Fight button unreachable at 1366x768/1280x800 (max-height:560px scoping) + 3 more Y-axis reachability defects + the CTA hit-test guard (2nd occurrence of the unreachable-control class).
- Leaderboard rebuild over player_state/player_skills dispatched (S2) — URGENT since the audit surfaced that the WIPE WAS DEFERRED WITH AMNESTY (2026-08-17-cutover-import.sql), contradicting CLAUDE.md's "beta WILL BE WIPED". OPEN QUESTION FOR TYLER: wipe at cutover, or amnesty stands? Until answered, act as if amnesty stands (forgery laundering risk is live).
- Record flip (gold/gems/skills/inventory onto SERVER_OF_RECORD + load strip) is plumbed, tested, fail-closed, and armed for ONE field — the audit calls the gap "a decision, not engineering". Sequence AFTER leaderboards land, with acknowledged-arming discipline.
