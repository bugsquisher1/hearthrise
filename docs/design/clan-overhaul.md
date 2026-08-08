# The Clan Seat — Hearthrise Castle Progression (v2)

**Backlog #10 · P1 (big) · Owner: Game Designer + Systems + Art · Wave 3+**
**Author: Game Designer · v1 2026-08-08 · v2 2026-08-08 · Status: SPEC (buildable blueprint, no code changed)**
**Supersedes v1 in full.** v1's castle-as-a-place fantasy, its modal discipline, and its finding that `clans.upgrades`/`castle_tier` are pre-built hooks all survive. Its *tuning* does not — see §2.3, where v1 gated the castle on a clan level that requires 655 million gold to reach.

**Source:** Tyler supplied "The Clan Seat — A Complete Castle Progression System", a Melvor/Idle-Clans-scale design doc, with the direction *"add a lot of these concepts that fit into our game, refine it so it fits Hearthrise."* This document is that refinement. Everything below is either (a) taken from that doc and mapped onto Hearthrise's real items, real XP rates and real Supabase schema, or (b) explicitly rejected with a reason in §14.

**Reads with:** `clan-boss-events.md` (#16 — one combat pillar, reconciled here in §11), `world-event-cadence.md` (#15/#14 — the Events panel and the `updateDaily` seam), `leaderboards.md` (#11 — clan boards), `crafting-cooking-taxonomy.md` (#12 — the derived-category rule the new castle goods must satisfy).

---

## 1. The five pillars, adopted

The source doc's pillars are good and they survive intact. Restated in Hearthrise's terms, with what each one *costs us to honour*:

1. **Every level matters.** A castle bundle spans multiple material tiers, so `normal_plank` never becomes worthless. Costs us: bundles must be authored as multi-tier, not "×N of the top thing".
2. **Two hands to make one thing — the castle refuses raw materials.** Logs become Beams, bars become Fittings. Costs us: three new intermediate goods (§4). This is the single most valuable idea in the source doc and it is nearly free here, because Hearthrise *already* refines logs→planks and ore→bars.
3. **Buffs flow back down.** Every building returns a measurable individual bonus. Costs us: a stated power budget (§8) so the perk stack does not run away.
4. **Forgiving, not punishing.** Missing upkeep dims a building; it never destroys it. Costs us: nothing. Adopted verbatim.
5. **Scheduling creates society.** Kept *selectively*. Feasts create a ritual; station-claim timers create a chore. See §14.5.

One pillar added, because Hearthrise is not Melvor:

6. **No faucet may create resources from nothing.** The source doc's Grounds district (Lumber Camp → 3,200 logs/hr, offline, forever) is the one idea that would break this game. See §14.10.

## 2. The fantasy, and the reality it has to fit inside

### 2.1 The fantasy (unchanged from v1)

You do not "join a clan". You **swear to a hold** that starts as a muddy **Wayside Camp** and, through the collective grind of its members, becomes a **Palisade → Timber Hold → Stone Bailey → Fortified Keep**. The panel *is* the castle — you watch wings get built and banners get raised. Detail and management live behind clean modals, so the panel is always a **place**, never a form.

### 2.2 What exists today (ground truth, re-verified for v2)

| Piece | Where | State |
|---|---|---|
| `clans(id, name, created_by, level, treasury, upgrades jsonb, castle_tier int)` | `supabase/schema.sql` L259-268 | `upgrades` and `castle_tier` **exist and are never read or written**. Still the hook. |
| `clan_members(clan_id, user_id, role, contributed, joined_at)` | schema L276-283 | `role` CHECK is `('leader','officer','member')`. `joined_at` exists — the 72h alt gate is free. |
| `clan_contribute(p_clan_id, p_amount)` | schema L302-321 | Banks gold, auto-levels. `SECURITY DEFINER`, membership-checked, ≤10M/call. Keep. |
| RLS | schema L270-293 | `clans`: select-all + insert-own. `clan_members`: select-all, insert-self, delete-self. **There is no UPDATE policy on either table** — so `treasury`/`level`/`upgrades` are already RPC-only. Good news: §12 needs no lockdown, only new RPCs. |
| Auto-level `PERKS` Lv2-Lv10 | `src/features/clans.js` L29-41 | +25% allXP, +8% gather, +5% artisan, +3h offline, cumulative. Re-scoped in §8.3. |
| `getBonus(key)` | `src/legacy.js` L931-946 | **No key whitelist** — an unknown key returns 0. Wrapped additively by companions (L9174), buffs (L10175), clans (`clans.js` L302-311) and the Muster (`muster.js` L642-649). |
| Clan raids | `raids.js` + schema §4b | Flat 250k pool. Being replaced by the Hunt (`clan-boss-events.md`). |
| `clan_leaderboard` view | schema §5 | `level, treasury, castle_tier, members`. |

### 2.3 The structural bug in v1 that v2 exists to fix

`clan_contribute` computes `v_next := 10000 * (4 ^ (v_level - 1))`. The thresholds are therefore:

| Level | Treasury required |
|---|---|
| 2 | 10,000 |
| 5 | 640,000 |
| 8 | 40,960,000 |
| **10** | **655,360,000** |

v1 gated Castle tier 5 on **clan level 10**. That is 655 million gold — roughly seven thousand Tier-V Hunt chests. The gate was unreachable, and worse, `clan_upgrade` was specced to *spend* treasury, so the same number does double duty as an accumulator and a wallet. (`clans.js` L17-19 also documents the thresholds as "10k, 50k, 200k, 800k, 3M", which is a fourth, different ladder — the comment has been wrong since b206.)

**v2 ruling: gold stops being the progression metric.** Castle tiers gate on a new pooled, never-decaying currency — **Standing** (§3). Gold treasury becomes what it is actually good at: an operating account that pays upkeep and part of each tier's cost. Clan `level` is demoted to a cosmetic "age of the hold" badge and its perk ladder is re-scoped to a membership baseline (§8.3). **New conflict, filed in §15.**

---

## 3. Currencies — the minimal honest set

The source doc runs four (CP, Renown, Labor Ticks, Clan Coin). Hearthrise already carries gold, gems, personal Renown ("Rise to the Throne", `renown.js`) and the Hearth Token (IAP-only, untouchable). Adding four more would be six currencies on one screen.

**Decision: two new stored currencies, one transient meter, and no Clan Coin.**

| Currency | Scope | Decays | Earned by | Spent on / drives |
|---|---|---|---|---|
| **Standing** | clan, pooled | **never** | every deposit, Work Order completion, Board task, Hunt kill | **Castle tiers** (§5), Archives research (Phase B) |
| **Contribution (CP)** | per member | **yes — 12%/week** | the same acts | roster ladder, Hunt band floor, Work Order assignment priority, leadership succession |
| **Labour** | transient | consumed instantly | every qualifying skill action while a Work Order is in its Labour phase | fuels the active Work Order (§6) |
| ~~Clan Coin~~ | — | — | — | **rejected — the gold treasury is Clan Coin** |

### 3.1 Why "Standing" and not "clan Renown"

The source doc calls it Renown. Hearthrise's meta-spine is *already* called Renown — `renown.js`, twelve ranks Peasant→High King, the flagship leaderboard. Two things called Renown on the same screen is a UX failure before a single pixel is drawn. **Standing** is the hold's accumulated worth; it reads correctly in the one sentence that matters: *"your Renown, our Standing."*

### 3.2 Why Clan Coin is not needed

Upkeep, tier costs and building costs all want a fungible number the server already governs. Gold is that number: `clan_contribute` is shipped, capped, membership-checked and `SECURITY DEFINER`. A second fungible clan currency would immediately raise an exchange-rate question ("how many Clan Coin per gold?") whose only honest answer is a fixed ratio — i.e. a rename. **v1's gold-only-treasury call stands; it just stops being the tier gate.**

### 3.3 Why CP decays and Standing does not

Straight from the source doc, and it is right: CP decay keeps the internal ladder honest — the roster shows who is helping *now*, not who no-lifed the clan eight months ago. Standing never decays, so the clan's actual progress is never lost.

**Decay is lazy, not cron'd.** Every RPC that reads `cp` first applies `cp := floor(cp * power(0.88, weeks_since(cp_at)))` and stamps `cp_at`. No scheduled job, no drift, and a clan that goes quiet for three months comes back with its castle intact and its ladder honestly reset.

### 3.4 The contribution formula

```
CP_per_unit  = ceil(item_gold_value / 10) × tier_multiplier × demand_multiplier
Standing     = floor(CP × 0.35)                       -- the source doc's ratio, kept

tier_multiplier   = 1.0, 1.4, 2.0, 2.9, 4.2, 6.0, 8.6   (material tiers 1→7,
                    the ladder in src/data/gear-tiers.js MATERIAL_TIERS)
demand_multiplier = 1.5  the item is on the active Work Order or the tier bundle
                  = 1.0  ordinary Storehouse deposit
                  = 0.4  the Storehouse is at cap for that item     ← keep verbatim
```

The `/10` exists purely so CP reads as a human number. The **0.4× at cap** rule is kept verbatim from the source doc and it is load-bearing: it stops one player dumping 40,000 Normal Planks and owning the ladder while the clan is starved of Fittings.

Worked, against real item values:

| Deposit | `v` | Tier | CP (normal) | CP (on demand) | Standing (on demand) |
|---|---|---|---|---|---|
| Timber Beam | 300 | 2 | 42 | **63** | 22 |
| Iron Fitting | 480 | 2 | 67 | **100** | 35 |
| Field Ration | 90 | 1 | 9 | **13** | 4 |
| Keystone | 3,000 | 5 | 1,260 | **1,890** | 661 |
| Normal Plank *(refused — raw)* | 18 | 1 | — | — | — |

---

## 4. Materials — the refinement ladder, mapped onto the real game

### 4.1 What Hearthrise already has

| Source-doc lane | Hearthrise Stage 1 | Hearthrise Stage 2 | Exists? |
|---|---|---|---|
| WOOD | 7 log species (`normal`→`duskwood`, `gathering.js` TREES) | 7 planks (`saw_*`, `recipes.js` L104-108, L131-132) | **yes, complete** |
| METAL | 7 ores (`gathering.js` ROCKS) | 9 bars (`smelt_*`, L58-67) | **yes, complete** |
| FOOD | fish / crops / raw meat | 27 cooked foods | **yes, complete** |
| FIBER | — | `silk_thread` is a *drop*, not a refined good | partial |
| STONE | **nothing.** Mining yields ore only. No rough stone, no quarry. | — | **no** |
| CLAY / GLASS | nothing | — | **no** |
| HIDE | 4 pelts (drops) | no leather item; tailoring uses pelts raw | partial |

**Consequence:** "the castle refuses raw materials" is *already true* of Hearthrise's own crafting spine. Adopting the rule costs three new items, not a new economy.

**Consequence 2:** the source doc's Stone/Masonry/Keystone chain and its Clay→Brick→Stained Glass chain cannot be honoured without inventing a whole gathering resource, a quarry node table, and three refinement rungs. Rejected for Phase A/B — see §14.2. Where the doc says "Masonry", Hearthrise says **Timber Beam and Iron Fitting**, and the castle is a timber-and-iron hold until stone becomes a real skill.

### 4.2 The rule, stated for Hearthrise

> **The castle refuses raw *gathered* materials.** Logs, ore, fish, crops and raw meat are never accepted by the Storehouse. They must be refined first — which means a gatherer needs a crafter, permanently.
>
> **The castle accepts combat spoils directly.** A kill is already a completed activity; a hold absolutely takes tribute of trophies. This is the rule that gives the game's 34 recipe-less drops a job (§4.4).

### 4.3 Three new goods (Phase A) — and one for the top of it

All four carry `tag:'castle'`, which is the single field the artisan taxonomy derives their category from (§15 conflict 1). None of them heal or buff, so `foodClassOf()` returns `null` and they never pollute Provisions / Feasts & Draughts.

| Item | id | `v` | Tier | Skill / req | Recipe | XP | ms |
|---|---|---|---|---|---|---|---|
| **Timber Beam** | `timber_beam` | 300 | 2 | crafting **25** | `{normal_plank:5, oak_plank:2, slime_gel:2}` | 200 | 4,200 |
| **Iron Fitting** | `iron_fitting` | 480 | 2 | smithing **25** | `{iron_bar:3, copper_bar:2, bone_chips:2}` | 210 | 4,200 |
| **Field Ration** ×4 | `field_ration` | 90 | 1 | cooking **22** | `{wheat:4, cooked_wolf_meat:2, carrot:2}` | 160 | 3,800 |
| **Keystone** | `keystone` | 3,000 | 5 | crafting **60** | `{timber_beam:3, iron_fitting:3, ancient_fragment:2, cracked_spellstone:1}` | 900 | 6,500 |

Margins, checked against real values:

- Beam: inputs `5×18 + 2×55 + 2×5 = 210` → output 300. **+43%.**
- Fitting: inputs `3×90 + 2×35 + 2×10 = 360` → output 480. **+33%.**
- Ration ×4: inputs `4×50 + 2×12 + 2×35 = 294` → output 360. **+22%.**
- Keystone: inputs `3×300 + 3×480 + 2×85 + 260 = 2,770` → output 3,000. **+8%.**

Refining is deliberately only *mildly* profitable in gold. The real payment is CP and Standing, which is what makes a beam worth making for the hold rather than for the market.

Two flavour notes that are true rather than decorative:
- **Slime Gel as the beam binder** — it is a resin. 80% drop from tier-1 Slimes, currently worth 5g and used by nothing. It is the most-available junk item in the game and it becomes the thing that holds the castle together, which is exactly the "every level matters" pillar: a level-3 player farming slimes is materially useful on build day.
- **Bone Chips as the fitting binder** — bone ash for case-hardening is real metallurgy, not invented flavour. 45-60% drop from Weak Skeleton / Skeleton, tier 1-2.

### 4.4 Routing the 34 recipe-less drops

My standing backlog logs "~25 tier-3-6 combat drops are recipe-less vendor trash". Recomputed against the live tables (`monsters.js` drop lists ∩ items with no recipe input, no `type`, no `heals`, no key/scroll tag): **the real number is 34.** Every one gets a job below. This closes the largest open item on my backlog and it is the strongest argument for the whole Storehouse layer.

| Drop | Tier(s) | Route |
|---|---|---|
| `slime_gel` .80 | 1 | **Timber Beam binder** (recipe input) |
| `bone_chips` .45-.60 | 1-2 | **Iron Fitting binder** (recipe input) |
| `rat_tail`, `goblin_ear`, `bat_wing` | 1-2 | **Tavern Board** bulk tributes — the Barkeep pays for vermin |
| `small_fang`, `night_fang`, `dire_fang` | 1-3 | Tavern Board; Phase-B Tannery |
| `sticky_core`, `goblin_totem`, `ancient_fragment` | 1-3 (rare) | **Keystone** input (`ancient_fragment`); Phase-B Archives research reagents |
| `rune_frag`, `dark_sigil` | 2 | Work Order **spoils line**, tiers 1-2 |
| `venom_sac`, `spider_eye`, `brute_plate`, `grave_dust` | 3-4 | Work Order spoils line, tiers 2-3 |
| `alpha_fang`, `cracked_spellstone` | 3 (rare) | **Keystone** input (`cracked_spellstone`); Phase-B Armory |
| `plague_ichor`, `swarm_heart`, `wraith_veil`, `demon_shard`, `hell_ember` | 4 | **Castle tier 3/4 bundles** — the "spoils tithe" line |
| `shadow_thread`, `void_chitin`, `shadow_pelt`, `razor_claw`, `death_steel`, `ruby`, `hollow_sigil` | 5 | **Castle tier 4/5 bundles**; Phase-B Banners (`shadow_thread`) |
| `war_crown`, `ancient_claw`, `dragon_gem` | 6 | **Castle tier 5 capstone** — three trophies, one each, hung in the Great Hall |

The "spoils line" is a Work Order line item like any other; it just accepts a raw drop instead of a refined good, per §4.2. `war_crown`/`ancient_claw`/`dragon_gem` at tier 5 are deliberately *one each* — they are trophies, not a grind, and they read on the panel as three objects on a wall.

### 4.5 Phase-B goods (specified now so nobody invents a fourth pattern later)

| Item | Skill | Recipe sketch | Used by |
|---|---|---|---|
| **Bolt of Cloth** | crafting 40 | `{silk_thread:6, shadow_thread:2}` | Banners, Tavern |
| **Clan Banner** | crafting 65 | `{bolt_of_cloth:4, keystone:1, war_crown:0/1}` | Great Hall cosmetic, Walls |
| **Woodsman's Bitter** / **Miner's Stout** / **Traveler's Cider** | cooking 30/35/55 | `{wheat:6, goldenroot:2, …}` → `foodClass:'buff'`, `tag:'castle'` | Cellar draws (§9.5) |

> **Designer ruling, 2026-08-08 — the three Phase-B reagents STAY catalogued.** `sticky_core` → Archives, `goblin_totem` → Archives, `alpha_fang` → Armory are declared in `clan-seat.js SPOILS_ROUTES` with `phase:'B'`, ahead of the buildings that consume them. **Keep them.** Three reasons, in order of weight:
> 1. `SPOILS_ROUTES` is the machine-readable form of the promise *"every drop has a job."* Its regression test counts 34 routed drops. Commenting three out drops the count to 31 and turns a clean invariant into a special case — which is exactly how "every drop has a job" quietly became false the first time.
> 2. A declared route is *honest*, and the `phase` field is what makes it honest. `spoilRoute('sticky_core')` answering `{route:'archives', phase:'B'}` lets a surface say "reserved for the Archives" instead of showing the player vendor trash.
> 3. Deleting and re-adding them later is how a fourth routing pattern gets invented, which is the exact failure §4.5 exists to prevent.
>
> **One binding condition on the panel builder:** no surface may present a `phase:'B'` route as actionable. A Phase-B route renders as a planned state or not at all — never as a deposit target, never as a Work Order line. A promise the player can click and not complete is worse than no promise.

---

## 5. Castle tiers — the master gate

`castle_tier` (the existing int column) is the Great Hall. **No building may exceed `castle_tier × 2` in level** (the source doc's ×5 rule, scaled to Phase A's 10-level buildings).

Gated on **Standing**, not gold. Phase A ships tiers 1-5; tiers 6-10 are Phase C and are deliberately not tuned here — tuning a tier-9 bundle before a single clan has reached tier 2 is fiction.

| T | Name | Standing | Materials | Gold | Members | Bldg cap | WO slots | Distinct contributors | Other gate |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Wayside Camp** | 0 | founding state | — | 10 | 2 | 1 | — | — |
| 2 | **Palisade** | 12,000 | 300 Beam · 120 Fitting | 40,000 | 15 | 4 | 1 | **3** | — |
| 3 | **Timber Hold** | 60,000 | 900 Beam · 500 Fitting · 400 Ration · 60 spoils (t2-3) | 200,000 | 25 | 6 | 2 | **5** | — |
| 4 | **Stone Bailey** | 240,000 | 2,400 Beam · 1,500 Fitting · 1,200 Ration · 40 Keystone · 150 spoils (t4) | 800,000 | 40 | 8 | 2 | **8** | Tier II Hunt cleared within 4 weeks |
| 5 | **Fortified Keep** | 900,000 | 6,000 Beam · 4,000 Fitting · 3,000 Ration · 200 Keystone · 400 spoils (t5) · 1× War Crown · 1× Ancient Claw · 1× Dragon Gem | 3,000,000 | 60 | 10 | 2 | **12** | Tier III Hunt cleared within 4 weeks |

### 5.1 How the Standing numbers were derived (so they can be re-tuned honestly)

Measured rate: a committed member of an active clan refines and deposits roughly **40 beam-equivalents per week** (a beam is 7 planks + 2 gel ≈ 9 gathered actions plus 7 saw actions plus 1 craft action — about 25 minutes of attended play at mid-level gather speeds). Ten such members ≈ 400 beams/week ≈ 8,800 Standing from beams, plus fittings, rations, Board tasks and the Hunt: **call it 20,000 Standing/week for an active 10-member clan.**

| Tier | Standing | Weeks for an active 10-clan |
|---|---|---|
| 2 | 12,000 | **< 1** |
| 3 | 60,000 | ~3-4 |
| 4 | 240,000 | ~3 months |
| 5 | 900,000 | ~9-12 months |

That is the OSRS-scale shape the north star asks for: the first milestone lands in the first session-week, and the last one is a year-long guild goal.

**The self-funding curve.** Supplying a tier's own bundle earns Standing along the way. How much of the gate that covers falls deliberately as the ladder climbs:

| Tier | Standing earned by supplying the bundle | Gate | Self-funded |
|---|---|---|---|
| 2 | 10,800 | 12,000 | **90%** |
| 3 | 38,900 | 60,000 | **65%** |
| 4 | 136,540 | 240,000 | **57%** |
| 5 | 416,200 | 900,000 | **46%** |

The first milestone is nearly self-funding — a young clan builds the Palisade essentially by *building the Palisade*, which is the right onboarding feel. By the Fortified Keep, more than half the gate must come from building Work Orders, the Tavern Board and the Hunt. **A clan cannot reach a late tier by doing exactly one thing**, and the gap is the mechanism that says so.

**This curve is the pacing lever.** If tiers arrive too fast or too slow, move the bundle, not the gate — the gate is what forces a rounded clan and it should be the last number touched.

### 5.2 Guardrails kept verbatim from the source doc

- **Distinct-contributor gate.** A tier requires N *distinct* members to have contributed to its bundle. Kills the one-whale-carries-a-dead-clan pattern. Scaled from the doc's 5→40 down to 3→12, because Hearthrise's member caps are 10→60, not 10→120.
- **CP counts toward tier gates only after 72h in the clan.** Alt-farming mitigation. Free to implement: `clan_members.joined_at` already exists.
- **Demand multiplier collapses to 0.4× at Storehouse cap.** §3.4.

---

## 6. Work Orders — the three-phase loop (this *is* the clan gameplay)

Building is not "click, pay, wait". It is a job with three phases, and the middle one is where the clan actually talks to each other.

### 6.1 The loop

| Phase | Who | What |
|---|---|---|
| **1 · Commission** | leader, or an officer holding the **Steward** charge | Posts a Work Order for `building → level N`. It shows the material bundle and a Labour target. |
| **2 · Supply** | everyone | Deposit materials. Anything on the order carries the **1.5× demand multiplier** on CP. The order sits here until materials hit 100%. |
| **3 · Labour** | everyone | The order enters Construction. **Every qualifying skill action any member performs generates Labour**, until the target is met *and* the time floor has elapsed. |

### 6.2 The Labour formula — the reason a dozen casuals out-build one whale

```
Labour per action = 1 × skill_level_factor
skill_level_factor = 0.5 + (skill_level / 99)          →  0.5 … 1.5
```

A level-20 player generates ~0.70 Labour per action; a level-99 player generates 1.5. **A 2× gap, not a 40× gap.** This is the same philosophy as the Hunt's median-contributor reward bands (`clan-boss-events.md` §5.2): the clan's value comes from attendance, not from gear. Kept from the source doc verbatim because it is the single best number in it.

`skill_level` is the level of the skill that produced the action; for `kill_any` it is the player's combat level.

### 6.3 Mapping onto Hearthrise's action stream

Hearthrise has exactly one seam that already sees every player action: `window.updateDaily(type, amt)`, which fires for `kill_any`, `gather`, `harvest`, `cooked`, `smithed`, `crafted`. The Muster wraps it (`muster.js` L1019-1030) with a retry-until-defined loop and a `window.__musterCountersHooked` idempotency flag. **Copy that pattern exactly**, with its own flag:

```js
function wireLabour() {
  var orig = window.updateDaily;
  if (typeof orig !== 'function') { setTimeout(wireLabour, 200); return; }
  if (window.__castleLabourHooked) return;
  window.__castleLabourHooked = true;
  window.updateDaily = function (type, amt) {
    var r = orig.apply(this, arguments);
    try { addLabour(labourFor(type, amt == null ? 1 : amt)); } catch (e) {}
    return r;
  };
}
```

Batching mirrors the Muster too: accumulate locally, flush every **30s** via `clan_work_labour`, `CALL_CLAMP = 200` per flush, and the server total wins on every response. An action legitimately feeds both the Muster bar and the Work Order — that is correct and intended, not double-dipping, because they are different rewards from the same hour of play.

### 6.4 No "On Site" toggle — and why

The source doc requires members to toggle **On Site** before their actions count. **Rejected.** An idle game's cardinal sin is a mode you forget to enable; a member who grinds all evening and gets zero credit because of an unclicked toggle is precisely the *"that reward doesn't matter"* bug this whole spec exists to fix.

The *choice* the toggle was protecting is preserved where it belongs: when the castle has **two** Work Order slots open (tier 3+), a member picks their assignment. Default is the oldest open order. Same social decision, no trap.

### 6.5 The curves

```
material_cost(level) = base_bundle × 1.58^(level − 1)
labour_target(level) = round(800 × 1.42^(level − 1))
time_floor(level)    = 2h × 1.15^(level − 1)          (capped at 48h)
```

| Building level | Labour target | Time floor | Days for a 10-member clan* |
|---|---|---|---|
| 1 | 800 | 2h 00m | < 1 |
| 3 | 1,613 | 2h 39m | < 1 |
| 5 | 3,253 | 3h 30m | < 1 |
| 7 | 6,559 | 4h 38m | ~1.6 |
| 10 | **18,780** | 7h 02m | ~4.7 |

\* at the per-member daily Labour cap of **400** (see §6.6), 10 members = 4,000 Labour/day.

> **Designer ruling, 2026-08-08 (ratified).** This table printed **18,776** at level 10; `round(800 × 1.42^9)` is **18,780**. **The formula wins and the table is corrected above.** The formula is the specification — the table is a rendering of it, and a rendering that disagrees with its source is a typo, never a second rule. Four Labour at level 10 is one one-hundredth of a single member's daily cap, so nothing downstream moves. `clan-seat.js labourTarget()` already implements the formula and the smoke suite pins `labourTarget(10) === 18780`; that test is now the authority, and this table is documentation of it.

### 6.6 The daily Labour cap, and why it exists

**400 Labour per member per UTC day.** At an average factor of 1.0 that is 400 actions — roughly 30-40 minutes of attended play. Past that, extra hours stop feeding the castle.

This is not an anti-cheat measure; it is the design. Without it, one insomniac with an auto-clicker completes every Work Order and the other nine members never see the bar move, which is the exact failure mode the Labour formula was built to prevent. The cap makes **attendance** the currency, and attendance is what a clan is for.

### 6.7 Build slots

`1 + floor(castle_tier / 3)` → 1 slot at tiers 1-2, 2 slots at tiers 3-5. Few enough to force priorities; enough, at tier 3, for a real division of labour.

---

## 7. Phase A buildings — six, and no more

The source doc lists ~30 buildings across six districts. Phase A ships **six**, because Phase A's job is to prove the Work Order loop, not to maximise perk surface. Each building does two things — a **castle function** and a **member-facing perk** — which is Pillar 3 made structural.

| Building | District | Castle function | Perk (`getBonus`) at L10 | L1 bundle |
|---|---|---|---|---|
| **Great Hall** *(= `castle_tier`, not a Work Order)* | Keep | member cap · Work Order slots · tier gate for every other building | `allXP` **+1% per tier → +5% at T5** | see §5 |
| **Treasury** | Keep | Storehouse cap `2,500 × level` per item · −1% upkeep/lvl · withdrawal rules | `goldFind` +0.5%/lvl → **+5%** | 30 Beam · 15 Fitting · 4,000g |
| **The Tavern** ★ | Village | Feasts · Rested XP · the Board (§9) | *none permanent — its power is bursty by design* | 40 Beam · 20 Fitting · 60 Ration · 6,000g |
| **Sawmill** | Outer Ward | −0.4% Timber Beam input/lvl (→ −4%) | `craftSpeed` +0.5%/lvl → **+5%** | 35 Beam · 15 Fitting · 5,000g |
| **Smeltery** | Outer Ward | −0.4% Iron Fitting input/lvl (→ −4%) | `smithSpeed` +0.5%/lvl → **+5%** | 25 Beam · 25 Fitting · 5,000g |
| **War Room** | Keep | hosts the Hunt: declaration, tier ceiling, rally lines (§11) | `raidPower` +1%/lvl → **+10%** | 40 Beam · 30 Fitting · 8,000g |

Note the Sawmill/Smeltery function is a **recursion the source doc gets exactly right**: the Sawmill is built out of Beams and it makes Beams cheaper. Upgrading it is a real economic decision, not a checkbox.

**Day one of a brand-new clan is deliberately not buildable.** Every L1 bundle needs Beams (crafting 25) and Fittings (smithing 25), which a fresh account does not have. That is the "two hands to make one thing" pillar biting on purpose: the first hours of a Wayside Camp are *gathering, refining and the Tavern Board*, and the first Work Order is posted when somebody in the hold reaches artisan 25 — a few hours of play, and a moment worth having. What must **not** happen is a tier-1 clan with an empty panel and no instruction: the Camp opens with the Board already posting tributes a level-1 player can serve (§9.2), so there is always a thing to do for the hold.

`raidPower` is the one **new** `getBonus` key (already flagged in v1 §4.3 and in `CONFLICTS.md`). Every other key — `allXP`, `goldFind`, `craftSpeed`, `smithSpeed` — either already exists in `ROOMS` or already flows through the wrapper chain. `goldFind` is currently declared-but-unread; Systems must wire it or the Treasury perk is a broken promise. **Filed in §15.**

### 7.1 What moved to Phase B, and why it is not in Phase A

Training Yard (`combatXP`), Gatherers' Lodge (`gatherSpeed`), Scholar's Tower, Armory, Archives, Walls, Market, Chapel, Stables. All are good; none of them teaches the player anything the first six do not. Six buildings × 10 levels × a three-phase Work Order each is already ~60 collective projects — a year of content before a seventh building is needed.

Deliberate consequence: **clans lose their gather-speed perk entirely** (the auto-level ladder's `gatherSpeed` is stripped in §8.3 and no Phase-A building replaces it). That is a net power *reduction*, which is exactly what the perk-stacking conflict demands. Gathering yield returns during Feasts, as a celebration rather than a baseline.

---

## 8. The power budget (this is a hard rule, not a guideline)

The source doc's own rule: *total castle bonuses at max should land near +60-75% effective throughput; no single building above 8% of that total; a clanless player is never locked out.* Adapted:

### 8.1 Hearthrise's stated budget

1. **Permanent castle-derived bonuses may not exceed +25% aggregate effective throughput at Phase-A max (tier 5, all buildings L10), or +60% at the eventual tier 10.**
2. **No single `getBonus` key may receive more than +10% from the castle.**
3. **No single building may contribute more than 8% of the castle's total.**
4. **No content is ever castle-gated.** Every castle perk is *throughput*, never *access*. A clanless player plays every skill, every dungeon, every boss and every recipe in the game. The only thing behind the castle is the castle.

### 8.2 Phase-A max, audited against the rule

| Key | From | Value |
|---|---|---|
| `allXP` | Great Hall T5 | +5% |
| `goldFind` | Treasury L10 | +5% |
| `craftSpeed` | Sawmill L10 | +5% |
| `smithSpeed` | Smeltery L10 | +5% |
| `raidPower` | War Room L10 | +10% |

Largest single key +10%, and it applies only to the Hunt, whose pool already scales with the roster. Aggregate throughput well inside +25%. **Passes.**

### 8.3 The auto-level `PERKS` re-scope (must land in the same wave)

`clans.js` L29-41 currently grants **+25% allXP, +8% gatherSpeed, +5% artisan, +3h offline** for free, purely from banked gold. With the castle on top, `allXP` alone would stack homestead (+20%) + renown (+22%) + auto-level (+25%) + Great Hall (+5%) = **+72%**.

**Re-scope the ladder to a membership baseline:**

| Level | v1/current | **v2** |
|---|---|---|
| 2 | +2% allXP | — |
| 3 | +3% gatherSpeed | — |
| 4 | +1h offline | **+1h offline** (keep) |
| 5 | +5% allXP | — |
| 6 | +5% artisan | — |
| 7 | +2h offline | **+2h offline** (keep) |
| 8 | +5% gatherSpeed | — |
| 9 | +8% allXP | — |
| 10 | banner +10% allXP | **banner, cosmetic only** |

Result: joining a clan grants +3h offline cap and a banner. Everything meaningful is now *earned* through the castle rather than *accrued* by banking gold. Post-re-scope `allXP` ceiling: homestead 20 + renown 22 + Great Hall 5 = **+47%**, down from +72%.

**Recommended guard-rail for Systems:** a hard clamp of `allXP ≤ 0.60` inside `getBonus`, plus the standing design rule that **no future system may add more than +5% `allXP`**. The clamp does not bind today (that is the point — it is a fuse, not a nerf).

### 8.4 Temporary power is budgeted separately

A Tavern Feast at L10 grants +18% allXP for 4h on a 20h cooldown, doubled for the final 30 minutes. Stacked on the permanent ceiling that is **~+65% allXP during a Feast**. That is intentional: it is a scheduled celebration a clan pays materials for, it is 4 hours in 24, and it is the single most-anticipated moment in the design. Flagged explicitly so nobody discovers it in a spreadsheet later (§15).

---

## 9. The Tavern

The source doc over-engineers the Tavern on purpose, because it is the building everyone actually talks about. That judgement is correct and Hearthrise adopts it — with brewing cut down to something we can ship honestly. **The Tavern is the strongest retention concept in the document and it is the reason Phase A is worth building.**

Four sub-wings, each capped by Tavern level (1-10 in Phase A).

### 9.1 The Hearth — food buffs

| Effect | Scaling | At L10 |
|---|---|---|
| Food buff **duration** | +4% per Tavern level | **+40%** |
| Food buff **strength** | +2% per Tavern level | **+20%** |
| **Leftovers** | 0.5%/lvl chance a consumed food is not used up | 5% |

So a Moonfish Fillet's +8% all-XP for 7 minutes becomes +9.6% for 9m 48s at a level-10 Tavern, and one bite in twenty is free.

**Engine seam required:** `applyBuff` has no duration/magnitude multiplier hook today. Small but real. **Filed in §15.**

### 9.2 The Board — daily and weekly clan tasks

The Barkeep posts **3 daily** (rolling at 00:00 UTC via `hr_utc_day_key`) and **1 weekly** (`hr_utc_week_key`), scaled to castle tier. This is where the low-value orphan drops finally have somewhere to go.

| Example | Reward |
|---|---|
| "Deliver 200 Timber Beams" | 900 CP · 315 Standing · 12 Feast Supplies |
| "The hold collectively cooks 800 provisions" | 1,400 CP · 490 Standing |
| "Forty Bat Wings for the pot" | 300 CP · 105 Standing |
| *(weekly)* "Break the Siege — deal `1.5 × declared Hunt pool_hp`" | 4,000 CP · 1,400 Standing · Feast Charter |

The weekly siege task is the **retuned** version of v1 §5.2's "500,000 raid damage", which was written against the old flat 250k pool and would have demanded fifteen bosses against a Tier-I Hunt. Retargeting to `1.5 × pool_hp` at declaration time **resolves the open CONFLICTS entry of 2026-08-08.**

Rewards are CP/Standing/consumables. **Gems only at the weekly, never Hearth Tokens** (Final Directive).

### 9.3 Feasts — the clan-wide payoff and the ritual

Members deposit **cooked food** into the Feast Meter (fill contribution = the food's `heals` value, so a Cooked Shark counts 42 and a Cooked Shrimp counts 8 — the meter is honest about effort). When full, a leader/officer with the **Steward** charge calls a Feast.

| Tavern lvl | Duration | Effect |
|---|---|---|
| 1-3 | 1h | +8% all XP |
| 4-6 | 2h | +12% all XP, +8% gathering yield |
| 7-9 | 3h | +15% all XP, +10% yield, +10% artisan speed |
| 10 | 4h | +18% all XP, +12% yield, +12% artisan speed |

- **Last Call** (Tavern 7+): during the final 30 minutes, all effects double.
- **Cooldown: 20 hours.** Deliberately *not* 24 — a 20h cooldown drifts around the clock, so the same timezone does not own Last Call every week. This is the same reasoning that killed fixed rally windows in `clan-boss-events.md` §4.1.
- Meter cap: `600 + 120 × Tavern level` heal-points.

Clans will schedule their big smithing pushes around Last Call. That is the ritual, and it is created by a cooldown rather than by a calendar.

### 9.4 The Common Room — Rested XP (the casual-retention jewel)

Offline members bank **Rested charges** at the Tavern: **1 charge per 6 minutes offline, capped at 80 charges (8 hours).** Each charge applies **+2% × Tavern level** bonus XP to one action after you log back in (→ **+20%** at Tavern 10).

This is the single most valuable building in the design for a casual member, and it is the reason the Tavern is in Phase A rather than Phase B: it pays a player *for the time they were not playing*, which is the defining promise of an idle game. It also makes the clan valuable to exactly the member who contributes least in raw output — which is what stops small clans from bleeding.

**Engine seam required:** a banked pool consumed by the next N actions. Touches `processOffline` (which already handles `offlineHours`), the XP grant path, and the fragile `snapshotG` save allowlist. **Filed in §15.**

### 9.5 The Cellar — Phase B, reduced to honest ales

The source doc makes brewing a mini-skill with real-time 2-12h brews, a tier reagent economy, per-member draw limits and a Tipsy stack system. **Rejected as specified** (§14.3). The reduced, honest version:

- Three **ales** as ordinary **cooking** recipes with `foodClass:'buff'` and `tag:'castle'` (§4.5) — Hearthrise already has a "Feasts & Draughts" cooking category built for exactly this.
- They are deposited into the Cellar and drawn by members: **2 + floor(Tavern level / 5) draws per member per UTC day**, so one person cannot drain it.
- **Tipsy stacks are rejected outright.** A −8%/−20% accuracy debuff in a game where combat runs unattended is a trap the player cannot observe. The doc's "readable decision" only reads if you are watching the fight.

---

## 10. Upkeep and dormancy — adopted almost verbatim

Every **Sunday 00:00 UTC**, upkeep is settled. The Treasury discount applies to **both** lines:

```
discount      = 1 − (Treasury_level × 0.01)          -- max −10% at Treasury 10
gold_due      = ceil( Σ(building_level) × 250 × discount )
ration_due    = ceil( Σ(building_level) ×   2 × discount )
```

Settled **lazily** — the first RPC touching the clan after the boundary computes the weeks elapsed and settles them. No cron, matching the Muster migration's "derive, never store the schedule" discipline.

| State | Trigger | Effect |
|---|---|---|
| **Active** | upkeep paid | full benefits |
| **Strained** | 50-99% paid | perks at 60%; Feast cooldown +50%; Work Orders continue |
| **Dormant** | < 50% paid | perks off; Work Orders frozen; **levels retained** |
| **Restored** | pay 1× weekly upkeep | instantly back to Active |

**Nothing is ever destroyed or de-levelled.** Kept verbatim, because it is a retention decision, not a balance one: a clan that goes quiet for three months comes back and is running again inside a day.

Scale check: a tier-3 hold running Treasury 6 / Tavern 6 / Sawmill 4 / Smeltery 4 / War Room 2 = 22 building levels = **5,500 gold + 44 Field Rations per week**, less the Treasury discount. That is roughly one member's afternoon. Upkeep is a **pulse check, not a tax** — it exists so a dead clan visibly dims, not to extract anything from a live one.

---

## 11. The Siege and the Hunt — ONE combat pillar

The source doc's weekly **Siege** (60-minute window, waves of attackers, four live roles, gates the blueprints that gate castle tiers) collides directly with my own `clan-boss-events.md` spec (the tiered **Hunt**). Shipping both would be two weekly clan-combat loops competing for one strike-shaped click per day. **They are reconciled into one system: the Hunt, with the Siege absorbed as a modifier and a gate.**

### 11.1 Why the Hunt wins the collision

1. **We have no live shared combat instance.** `raids.js simulateStrike` is a 120-tick *offline simulation* of one player's rolls. "Wall Crew / Tower Crew / Sally Force / Quartermaster" requires synchronous presence and a real-time server-side fight. Shipping it as anything less would be a fake, and the Final Directive forbids fakes.
2. **A 60-minute fixed window excludes part of every roster.** `clan-boss-events.md` §4.1 already settled this: world events can pair slots 12h apart and let you skip one; *a clan cannot skip its own clan*.
3. **One attention budget.** Two weekly clan-boss loops would both feel undersubscribed, which is how a small clan dies.

### 11.2 What survives from the Siege, translated

| Source-doc Siege element | Hearthrise translation | Phase |
|---|---|---|
| **Blueprints gate castle tiers** | **Castle tiers 4 and 5 require a Hunt clear** of the matching tier within the last 4 weeks. `clan_raids.downed_at` already exists — the gate is nearly free. Makes the Hunt **mandatory but never scheduled.** | **A** |
| Waves assault the Walls | The **Hold the Gate** modifier, attached at declaration: each UTC day the Hunt lives, the boss removes `siege_damage` from the castle's **Bulwark** pool. If the Bulwark falls before the boss does, the hold drops to **Strained** for one week — reusing the existing upkeep state, inventing no new punishment. Reward: **+35% chest**. | **B** (needs the Walls building) |
| Four live combat roles | **Rejected.** See §11.1. | — |
| Watchtowers, Barbican, Gatehouse | Walls-district buildings that raise the Bulwark pool and reduce `siege_damage`. | **B** |
| "Spoils of War" research | Archives branch. | **B** |

The word *Siege* survives as the name of the modifier, so the flavour is not lost: a Hunt with Hold the Gate attached **is** the Siege.

### 11.3 The two-way interlock, stated once

- The **War Room** building (§7) sets the Hunt tier ceiling: `max_hunt_tier = min(castle_tier, 1 + floor(war_room_level / 3))`. A clan that never builds its War Room is stuck on Tier I Hunts and therefore stuck at castle tier 3.
- `raidPower` from the War Room is consumed by `simulateStrike` — the key already flagged in v1 §4.3.
- Hunt kills pay **Standing** into the castle; castle tiers 4-5 require Hunt kills. The loop closes in both directions, which is what makes this one system rather than two features sharing a table.
- The Tavern's weekly Board task is the Hunt damage objective (§9.2).

`clan-boss-events.md` has been updated with the reciprocal sections.

---

## 12. Server work (hand-off to Systems)

All additive. Idempotent, client-first, feature-detected on `404 / PGRST202 / 42883 / 42P01` exactly as `muster.js` L348-350 does — **the client may ship before the migration is run.** House style is `2026-08-08-muster.sql`: numbered `-- ── N. Title ──` banners, `create or replace function`, `create table if not exists`, `add column if not exists`, `drop policy if exists` before every `create policy`, a per-function `grant … to authenticated`, and a closing `do $$ … end $$;` self-check that `raise exception`s on drift.

### 12.1 Schema

```sql
-- clans: Standing, upkeep state. `upgrades jsonb` (already present, unused)
-- becomes the building-level map {"sawmill":4,"tavern":6,...}. castle_tier stays.
alter table public.clans
  add column if not exists standing        bigint      not null default 0,
  add column if not exists upkeep_state    text        not null default 'active',
  add column if not exists upkeep_settled_at timestamptz;

-- castle_tier defaults to 0 today and every live clan sits there. Tier 1 is the
-- Wayside Camp — the founding state, not a locked state — so promote existing
-- rows and move the default. Idempotent by construction.
update public.clans set castle_tier = 1 where castle_tier < 1;
alter table public.clans alter column castle_tier set default 1;

-- clan_members: the decaying ladder + the org split.
alter table public.clan_members
  add column if not exists cp        bigint      not null default 0,
  add column if not exists cp_at     timestamptz not null default now(),
  add column if not exists charge    text,                      -- 'steward' | 'marshal' | null
                                                                 -- the LEADER always holds both
                                                                 -- implicitly, or a freshly founded
                                                                 -- clan could commission nothing.
  add column if not exists last_seen timestamptz;                -- leader-ghosting clock

-- The Storehouse. A table, not a jsonb blob on clans: per-item rows avoid a
-- hot-row contention point and make Treasury caps natural.
create table if not exists public.clan_stores (
  clan_id uuid   not null references public.clans(id) on delete cascade,
  item_id text   not null,
  qty     bigint not null default 0 check (qty >= 0),
  primary key (clan_id, item_id)
);

create table if not exists public.clan_work_orders (
  id            uuid primary key default gen_random_uuid(),
  clan_id       uuid not null references public.clans(id) on delete cascade,
  building      text not null,
  to_level      int  not null,
  phase         text not null default 'supply'
                check (phase in ('supply','labour','done','cancelled')),
  materials     jsonb not null,            -- {item_id: qty required}
  supplied      jsonb not null default '{}'::jsonb,
  labour_target int  not null,
  labour_done   int  not null default 0,
  posted_by     uuid not null,
  posted_at     timestamptz not null default now(),
  labour_from   timestamptz,               -- set when phase → 'labour'
  floor_until   timestamptz,               -- time floor; completion is refused before this
  completed_at  timestamptz
);

-- The daily Labour cap IS the primary key + the CHECK. Same trick as the
-- Muster's (day_key, user_id) join gate — the rule is enforced by the schema,
-- not by code. Note the key is (clan, user, day) and NOT (order, user, day):
-- the cap is per member per day across the WHOLE castle, or a clan with two
-- open Work Orders would silently double every member's ceiling to 800.
-- Per-order attribution for the contributor list lives in clan_ledger.
create table if not exists public.clan_work_labour (
  clan_id uuid not null references public.clans(id) on delete cascade,
  user_id uuid not null,
  day_key text not null,
  ticks   int  not null default 0 check (ticks between 0 and 400),
  primary key (clan_id, user_id, day_key)
);

create table if not exists public.clan_tavern (
  clan_id        uuid primary key references public.clans(id) on delete cascade,
  feast_meter    int not null default 0,
  feast_until    timestamptz,
  feast_cd_until timestamptz
);

create table if not exists public.clan_board (
  clan_id     uuid not null references public.clans(id) on delete cascade,
  period_key  text not null,               -- hr_utc_day_key or hr_utc_week_key
  task_id     text not null,
  target      bigint not null,
  progress    bigint not null default 0,
  claimed_by  uuid[] not null default '{}',
  primary key (clan_id, period_key, task_id)
);

-- Audit trail. Powers the "recent treasury events" list, the distinct-contributor
-- gate, and every anti-abuse investigation we will inevitably have to run.
create table if not exists public.clan_ledger (
  id       bigserial primary key,
  clan_id  uuid not null,
  user_id  uuid,
  kind     text not null,                  -- deposit|labour|tier|withdraw|upkeep|feast|board
  item_id  text,
  qty      bigint,
  cp       bigint,
  standing bigint,
  at       timestamptz not null default now()
);
create index if not exists clan_ledger_clan_idx on public.clan_ledger (clan_id, at desc);
```

No RLS lockdown is required on `clans`/`clan_members` — **there is already no UPDATE policy on either table** (schema L270-293), so every write is RPC-only today. New tables get select-all + no write policy, matching `clan_raids`.

### 12.2 RPCs

| RPC | Guards |
|---|---|
| `clan_deposit(p_clan_id, p_items jsonb)` | membership · items must be `tag:'castle'` or a routed spoil · per-call and per-day value clamp · applies tier/demand/cap multipliers server-side · writes `clan_stores`, `cp`, `standing`, `clan_ledger` |
| `clan_work_post(p_clan_id, p_building, p_to_level)` | leader/officer with `steward` charge · `to_level ≤ castle_tier × 2` · a free build slot · derives the bundle and labour target server-side (never from the client) |
| `clan_work_labour(p_clan_id, p_order, p_ticks)` | membership · `p_ticks ≤ 200` per call · the `(clan_id, user_id, day_key)` PK + the `ticks ≤ 400` CHECK enforce the daily cap in the schema, across every open order · credits `clan_work_orders.labour_done` and ledgers the attribution |
| `clan_work_complete(p_clan_id, p_order)` | materials 100% · labour 100% · `now() ≥ floor_until` · writes `upgrades[building]`, pays Standing, ledgers |
| `clan_tier_up(p_clan_id)` | leader only · `standing ≥ req` · bundle present in `clan_stores` · **N distinct `clan_ledger` contributors whose `joined_at < now() − 72h`** · for T4/T5, a `clan_raids` row with `downed_at > now() − 28d` at the required tier |
| `clan_feast_deposit` / `clan_feast_call` | deposit: any member, cooked food only · call: `steward` charge, meter full, off cooldown |
| `clan_board_progress` / `clan_board_claim` | delta-clamped · claim idempotent via `claimed_by` array |
| `clan_upkeep_settle(p_clan_id)` | lazy; computes weeks elapsed, draws gold + rations, sets `upkeep_state` |
| `clan_set_role(p_clan_id, p_user, p_role, p_charge)` | leader only; officers may kick members but not officers |
| `clan_withdraw(p_clan_id, p_amount)` | **> 10% of treasury requires a 24h delay + a clan-chat notification** (kept verbatim) |
| `clan_claim_leadership(p_clan_id)` | **leader inactive 21 days → the highest-CP officer may claim** (kept verbatim) |

`clan_leaderboard` view gains `standing` (feeds `leaderboards.md` §3.2's Clan Power board, which should sort on `castle_tier` then `standing`, not `treasury`).

### 12.3 The honest limitation: deposits are not item-authoritative

`clan_deposit` can validate identity, membership, the item id, its tier value, a per-call clamp and a per-day cap. **It cannot validate that the caller actually owned the item**, because Hearthrise has no server inventory — `game_saves.snapshot` is client-authored.

This is the same trust model the entire shipped game already runs on, and it is bounded here by four things: (1) per-call and per-day value clamps; (2) CP decays, so a cheater's ladder position fades on its own; (3) castle bonuses live inside the §8 power budget, so the prize for cheating is small; (4) `clan_ledger` makes every deposit auditable after the fact.

**Do not describe Phase A as fully server-authoritative for materials.** The honest statement is: *server-authoritative for currency, gates, rewards and rate; client-trusted for item possession, clamped and audited.* True item authority is the Wave-5 server-inventory project, and the cheap intermediate hardening — requiring the caller's most recent uploaded snapshot to contain the deposited quantity — is noted here for Phase B.

---

## 13. UI — the panel is a place, the modals do the work

Unchanged in principle from v1, extended for the new systems. Reuse the existing scrim/overlay pattern (`hr-rn-scrim` in `renown.js`, `hr-dl-scrim` in daily-login) — do not invent a new one.

**Main panel (`social-panel`, rebuilt `renderClanSection`):**
- **Castle header** — name, tier name (Wayside Camp … Fortified Keep), members / cap, Standing toward the next tier, and the upkeep state as a single word when it is not `Active`.
- **The castle view (Art)** — one illustrated hold where built buildings are *lit* and unbuilt ones are *ghosted*. Ghosted → built is the payoff. "Forge & Stone", no emoji.
- **The "This week" strip** — three bars, one glance: the **Hunt** boss HP, the active **Work Order** (supply % or labour %), and the **Feast meter**. This is "what does my hold need from me right now."
- **Buttons only:** `[Manage Castle]` `[Work Orders]` `[The Tavern]` `[Storehouse]` `[Roster]`.

**Modals:**

| Modal | Contents | Who acts |
|---|---|---|
| **Manage Castle** | building list — level, next-level perk, next-level bundle, `[Commission]`. Great Hall / tier-up at the top with its distinct-contributor counter. | Steward officers commission; everyone views |
| **Work Orders** | active orders: phase, material bars, labour bar, my Labour today vs the 400 cap, contributor list | all |
| **The Tavern** | Feast meter + `[Call the Feast]`, the Board's 3 daily + 1 weekly, Rested charges banked, (Phase B) the Cellar | all; Steward calls |
| **Storehouse** | pooled goods vs Treasury caps, deposit picker with a live CP preview *including the 0.4×-at-cap warning*, recent ledger | all |
| **Roster** | members, role + charge, CP (decaying) and lifetime gold, `[Promote]` `[Demote]` `[Kick]` | leader/officers |

The 0.4×-at-cap warning in the deposit picker is not decoration — a rule the player only discovers *after* being paid 40% is a rule that feels like a bug.

---

## 14. What was rejected, and why

1. **Clan Coin.** The gold treasury is Clan Coin. A second fungible clan currency raises an exchange-rate question whose only honest answer is a fixed ratio — i.e. a rename with extra UI. §3.2.
2. **The Stone / Clay / Glass / Hide refinement lanes.** Hearthrise has no stone or clay gathering at all; honouring Rough Stone → Cut Block → Masonry Block → Keystone means inventing a resource, a node table, a skill's worth of XP curve and four items. Phase C at the earliest. The castle is timber-and-iron until stone is a real skill. §4.1.
3. **Brewing as a mini-skill, and Tipsy stacks.** Brewing wants real-time 2-12h brews, a tier-reagent economy and a per-member draw ledger — a whole feature wearing a sub-wing's clothes, when Hearthrise's cooking skill already has a "Feasts & Draughts" category built for exactly this. Reduced to three Cellar ales as cooking recipes (§9.5, Phase B). **Tipsy stacks rejected outright:** a −8%/−20% accuracy debuff in a game whose combat runs unattended is a trap the player cannot observe, so it is not the "readable decision" the doc claims.
4. **The real-time Siege with combat roles.** No live shared combat instance exists; `simulateStrike` is an offline 120-tick simulation. §11.
5. **Station slots and the one-station rule.** This needs a presence layer Hearthrise does not have: who is online, 4h claim timers, renewal, queueing, Artisan bump rights. It is also the doc's own "scheduling creates society" pillar taken one step too far — a claim you must renew every four hours is a chore, not a society. Phase C, and only if presence ships for another reason.
6. **Clan Tools with durability + the Armory Loan Rack.** Requires bind-to-clan item ownership, i.e. the server inventory of §12.3.
7. **Prestige / Chartering a Second Seat.** There is nothing to prestige from until tier 10 exists and someone has reached it. Revisit when a live clan is at tier 8.
8. **Grand Projects, Caravans, Legendary Benches, castle skins, the Rival Ledger's cosmetic borders.** All depend on a cosmetics pipeline that does not exist beyond the gem shop. The Rival Ledger's *idea* — multiple seasonal axes so more than one clan can win — is already better served by `leaderboards.md` §6's Climbers season.
9. **NPC workers and hired mercenaries.** An idle game paying you to not play, and it collides head-on with the existing companion system.
10. **The Grounds district (passive resource generators).** ★ **The one idea that would break Hearthrise.** A Lumber Camp producing 40 → 3,200 logs/hour offline is a server-side faucet creating resources from nothing — precisely what the server-authoritative directive exists to prevent — and it devalues gathering, which is the game's core loop. If a Lumber Camp ever ships, it must be a **converter, not a creator**: deposit 500 logs, the Sawmill returns 100 Beams over 4 hours, using the Sawmill's own input-reduction. That version is idle-friendly, faucet-free, and is the Phase-B design.
11. **The seven-rank ladder as seven `role` values.** `clan_members.role` carries a live CHECK constraint of `('leader','officer','member')`; widening it is a migration on a live table for a cosmetic gain. The doc's genuinely valuable structural insight — that **Steward (economy) and Marshal (combat) must be separate people, so a clan needs at least two engaged leaders** — is preserved with one nullable `charge` column (§12.1), which delivers the whole benefit for one line of DDL.

---

## 15. Conflicts and dependencies (for `CONFLICTS.md`)

**New in v2:**

1. **SEMANTIC — clan `level` cannot gate the castle.** `clan_contribute`'s ×4 ladder puts level 10 at 655,360,000 gold; v1 gated castle tier 5 on it. v2 moves the gate to Standing and demotes `level` to cosmetic. The `clans.js` L17-19 comment documenting the thresholds as "10k, 50k, 200k, 800k, 3M" is also wrong and should be corrected. *(Designer → Systems)*
2. **SEMANTIC — the artisan taxonomy needs a "Castle Stores" lane.** `categorizeRecipes()` has a regression test asserting `uncategorized` is empty. Four new goods (`timber_beam`, `iron_fitting`, `field_ration`, `keystone`) match no existing category and would break it on the commit that adds them. Fix, in the taxonomy spec's own derived style: add a `castle` category to smithing/crafting/cooking, derived from `ITEMS[out].tag === 'castle'`. *(Designer → Systems; interacts with `crafting-cooking-taxonomy.md`)*
3. **DEPENDENCY — `goldFind` is declared but unread.** The Treasury perk is a broken promise until `getBonus('goldFind')` is consumed by the gold-drop path. *(Designer → Systems)*
4. **DEPENDENCY — buff duration/magnitude multiplier is a new engine seam.** The Tavern's Hearth (+40% duration / +20% strength at L10) needs a hook `applyBuff` does not have. *(Designer → Systems)*
5. **DEPENDENCY — Rested XP is a new engine seam.** A banked charge pool consumed by the next N actions; touches `processOffline`, the XP grant path, and the fragile 24-field `snapshotG` allowlist. *(Designer → Systems)*
6. **INTEGRATION — two systems now wrap `updateDaily`.** The Muster (`muster.js` L1019-1030) and castle Labour. Both must use the retry-until-defined + own-idempotency-flag pattern; wrapping order is irrelevant *provided* each guards with its own flag. One action feeding both meters is intended, not double-dipping. *(Designer → Systems)*
7. **DESIGN — temporary power ceiling.** A Tavern-10 Feast during Last Call reaches ~+65% `allXP` on top of the permanent stack, for 4h in every 24. Deliberate; recorded so it is not discovered in a spreadsheet. *(Designer, informational)*
8. **LIMITATION — material deposits are not item-authoritative.** §12.3. Must not be described as fully server-authoritative. *(Designer → Systems, accepted risk)*

**Carried from v1, still binding:**

9. **`raidPower` is a new `getBonus` key** that `raids.js simulateStrike` must consume, or the War Room buffs nothing.
10. **The perk-stacking re-scope (§8.3) must land in the same wave as the buildings**, or the power budget spikes.
11. **Sequencing:** the Events panel (#14/#15) and the Hunt (#16) must ship together; the castle's "This week" strip reads Hunt state.

**Resolved by v2:**

12. ~~*"Break the Siege — 500,000 raid damage" is mistuned against tiered pools"*~~ → retargeted to `1.5 × declared pool_hp` at declaration time, and relocated to the Tavern Board's weekly slot (§9.2).

---

## 16. Build order

### Phase A — Wave 3 (this is what gets built)

1. **The four castle goods** + the `castle` taxonomy category + their recipes. *Ships alone, testable alone, and immediately gives 34 orphan drops a use.*
2. **Migration 1:** `standing`, `cp`, `charge`, `clan_stores`, `clan_ledger`, `clan_deposit`. Storehouse modal. **The smallest thing that is already a castle.**
3. **Migration 2:** `clan_work_orders`, `clan_work_labour`, the three Work Order RPCs, the `updateDaily` Labour wrapper. Work Orders modal. **This is the clan gameplay; nothing after it is more important.**
4. **`upgrades` reads → the six buildings + `perksFromUpgrades()` → `getBonus`.** Land the §8.3 perk re-scope in the same commit.
5. **`clan_tier_up`** with the distinct-contributor and 72h gates; the Hunt-clear gate for T4/T5.
6. **The Tavern:** Feast meter + call + Board. Rested XP last, because it is the biggest engine seam.
7. **Upkeep and dormancy** (lazy settle), roles/charges, withdrawal delay, leadership succession.
8. **Panel rebuild** — the castle view, the "This week" strip, five modals. Art's castle asset may land as a styled placeholder first.

Each step is independently shippable and testable. Per `CLAUDE.md`, smoke coverage per step, minimum:
- found a clan → deposit 10 Timber Beams → assert CP, Standing and `clan_stores` all move by the formula in §3.4;
- deposit past the Treasury cap → assert the multiplier drops to 0.4×;
- post a Work Order, drive `updateDaily` 500 times → assert Labour stops at the 400 daily cap;
- complete an order before `floor_until` → refused; after → `upgrades` written and the perk reaches `getBonus`;
- tier-up with 2 distinct contributors at T2 → refused; with 3 → allowed; with a member who joined 1h ago counted → refused;
- miss upkeep → Strained → Dormant → pay → Active, with building levels unchanged throughout.

### Phase B — Wave 4+

Walls district + the **Hold the Gate** Siege modifier · Archives research tree · Armory + Tannery + Weaver's Hall (Bolt of Cloth, Banners) · Training Yard · Gatherers' Lodge · the Cellar's three ales · converter-style Grounds (§14.10) · Steward/Marshal as real roles · snapshot-backed deposit hardening.

### Phase C — later

Castle tiers 6-10 · stations and the one-station rule (only if presence ships) · Clan Tools + Loan Rack (needs server inventory) · Caravans · Grand Projects · Prestige · the stone lane.

---

## 17. Hand-offs

- **Systems:** §12 in full (schema, 12 RPCs, the two engine seams in §15.4-5, the `goldFind` wiring, `raidPower`), the §8.3 perk re-scope, and the taxonomy category in §15.2.
- **Art:** the castle view with lit/ghosted buildings across five tiers; the "This week" three-bar strip; icons for four new goods (Timber Beam, Iron Fitting, Field Ration, Keystone) in `assets/icons-bundle/`. "Forge & Stone", no emoji, reuse the existing scrim.
- **Game Designer (me):** owns every table in §3.4, §4.3, §5, §6.5, §7, §9 and §10. First re-tune after one live month. **If pacing is wrong, the lever is the tier bundle (§5.1's 60% invariant), not the Standing gate** — the gate is what makes a clan do more than one thing, and it should be the last number touched.
