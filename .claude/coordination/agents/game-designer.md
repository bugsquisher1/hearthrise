# Game Designer — running log

_Your private journal. Newest at top. Team-wide items also go to `DISCOVERIES.md` / `HANDOFFS.md`._

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

No game files touched.

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
