# Game Designer — running log

_Your private journal. Newest at top. Team-wide items also go to `DISCOVERIES.md` / `HANDOFFS.md`._

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
