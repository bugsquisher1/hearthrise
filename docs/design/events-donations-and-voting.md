# Events rework — The Kindling & The Beacon

**Donation pools that raise the blessing, and a weekly vote that chooses it.**

**Author:** Game Designer · **Date:** 2026-08-16 · **Status:** SPEC (buildable; no code changed)
**Authority:** Tyler's ruling, `DECISIONS.md` 2026-08-16 ("Events rework"). Shape is binding; balance
detail is delegated to this role and is final unless superseded here.

**Replaces:** the live "Muster" layer specced in `world-event-cadence.md` §2–§6 (join-once-per-day,
45-minute windows, pick-one rally, pledges, community bar, Muster Seals). `world-event-cadence.md`
remains the reference for the Events *destination* and discoverability (§7), which this spec keeps.

**Reads it depends on:** `docs/design/pacing-overhaul.md` A.8 (blessings presence-gated, flat ×1.12
removed), `src/core/away.js` (`AWAY_SCOPE.blessing = false`), `src/features/world-events.js` (the
wired-key audit), `CLAUDE.md` server-authority rules, `supabase/migrations/2026-08-08-clan-seat.sql`
(`clan_deposit` — the pattern every verb here copies).

---

## 0 · The problem being solved

The Muster asked the player to **attend** and to **pick one of two rallies**. Both failed for the
same reason: neither choice had a consequence the player could see. The rallies differed in flavour
text and in which chest table paid out, and the chest paid roughly the same either way — so the
"decision" was a coin-flip with a countdown attached, and the countdown punished anyone whose
evening was busy.

The replacement inverts it. The player is not asked to be present at a minute; they are asked to
**pay into something visible**, and the thing they pay into is the one number on the screen that
everybody in the game shares. The choice is no longer *which rally do I attend* — it is *do I feed
today's fire, and which fire do we light next week*. Both of those have an answer that is different
tomorrow, which is the property the old shape never had.

---

## 1 · The rename

| # | Candidate | Read |
|---|---|---|
| 1 | **The Kindling** (daily) / **The Beacon** (weekly) | You feed the fire; the fire is the blessing. Lands directly on the game's own name. |
| 2 | The Hearthtithe | Accurate, but "tithe" reads as a tax — an obligation you owe, not a gift you choose. |
| 3 | The Wellspring / The Well | Honest homage to RS3's Well of Goodwill (the direct ancestor of this mechanic). Water imagery fights the hearth. |
| 4 | The Long Table | Warm, communal, very Hearthrise — but it says *feast*, and there is no feast here. |
| 5 | The Common Fire | Says the mechanic plainly. Slightly civic/municipal in tone. |

### Recommendation: **The Kindling** (daily pool) and **The Beacon** (weekly pool + vote).

Why this one wins:

- **It names the mechanic, not the ceremony.** "Muster" described people gathering — which is exactly
  the thing we are deleting. "Kindling" describes *what you give and what it does to the fire*, which
  is exactly the thing we are building.
- **Two words, one fiction, two cadences.** Kindling is small, daily, spends fast. A Beacon is lit
  once and burns for the week and is seen from far away — which is literally what a week-long
  server-wide blessing chosen by a public vote is.
- **It is native.** Hearthrise → hearth → kindling → the pool unit is **embers**. Nothing here has to
  be explained twice.

**Naming, locked:**

| Thing | Name |
|---|---|
| The destination (unchanged) | **Events** |
| Daily donation pool | **The Kindling** |
| Weekly donation pool | **The Beacon** |
| The pool unit | **embers** (an ember is a unit of donated value, never an item, never tradeable) |
| The weekly vote | **the Beacon Vote** |
| Lifetime-donation title track | Kindler → Firekeeper → **Beaconwarden** |

`HearthriseMuster` / `muster.js` become `HearthriseKindling` / `kindling.js`. `HearthriseWorldEvents`
**keeps its name** — `raids.js` reads `_hash` / `utcDayKey` / `utcWeekKey` off it as a shared clock
utility, and renaming it breaks raids (the standing conflict from `world-event-cadence.md` §10).

---

## 2 · The donation pool

### 2.1 The shape, in one paragraph

Every UTC day the calendar rolls a daily blessing as it does today. Alongside it, **The Kindling**
opens with an empty pool and five thresholds. Players donate food or gold; the server converts what
they gave into **embers** and adds it to the pool. Each threshold crossed adds **+1 percentage point**
to every percentage key of *that day's* blessing, up to +5. The boost is a **ratchet**: it applies the
instant the tier is crossed, for the rest of the period, and never falls back. **The Beacon** is the
same machine on a weekly period at much larger totals, applied to the weekly blessing, also +1…+5.

### 2.2 What is donatable, and what it is worth

Valuation is a **server-side catalogue**. The client sends `{item_id, qty}` and a gold amount; it
never sends a value. Nothing outside the catalogue is accepted — the RPC rejects the id rather than
valuing it at zero, so a "junk dump" is a rejected call, not a silent no-op.

| Donatable | Ember value | Why |
|---|---|---|
| **Gold** | `floor(gold / 5)` | A real sink, and the fallback route for a player with no larder. |
| **Cooked food** (`foodClass` ∈ healing/utility, any tier) | `v` (full book value) | The intended fuel. Cooked Trout 55, Cooked Lobster 240, Cooked Shark 900. |
| **Crops & raw food** (raw fish/meat, crop produce) | `floor(v × 0.20)` | Exactly the vendor bid (`VENDOR_RAW_RATE`, `shops.js:1088`). Donating a raw is never better than selling it, so raws cannot be arbitraged into the pool. |
| **Everything else** | **not donatable** | Equipment, materials, seeds, Keystones, gems, Bounty Marks, Hearth Tokens, bonds. |

**Food is ~5× more ember-efficient per gold of value than gold itself, and that is deliberate.** It
gives cooking and farming a permanent, non-vendor destination (a standing complaint: the artisan tail
has nowhere to go), and it stops the pool from being something a player with a large bank simply buys.
The tuning knob is the gold divisor; do not "fix" a participation problem by widening the catalogue.

**Hearth Tokens and gems are not donatable, and no donation ever mints anything.** A bond-funded
player can convert gold to embers like anyone else, bounded by the same per-player cap, and what they
buy is a **server-wide** bonus shared equally by every player including the ones who paid nothing.
There is no personal edge, so this is not pay-to-win — and it is worth noting the direction: the only
thing money can do here is *give the whole server a small bonus.*

### 2.3 Thresholds — the scaling rule, not the constants

The pool is sized **per active player**, so the same content works at 8 players and at 8,000 without
a rebalance. This is the goal-freeze idea from `world-event-cadence.md` §4.3, generalised.

```
A = max(MIN_ROSTER, active_7d)          MIN_ROSTER = 8
    active_7d = distinct accounts with ≥1 server-applied intent in the last 7 days,
                excluding accounts <24h old (see §2.5)
A is SNAPSHOTTED when the pool opens and FROZEN for the period.

daily  thresholds (embers) = A × [ 100,  220,  380,  620, 1000 ]   → +1..+5
weekly thresholds (embers) = A × [ 500, 1100, 1900, 3100, 5000 ]   → +1..+5
```

Per-player caps (enforced from the append-only journal, `clan_deposit`-style):

| Cap | Value | In plain terms |
|---|---|---|
| Daily, per player | **1,200 embers** | 6,000 gold, or 5 Cooked Lobsters, or ~1⅓ Cooked Shark |
| Weekly, per player | **6,000 embers** | separate budget from the daily pool |
| Per call | **600 embers**, ≤10 item ids, ≤10,000 qty per id | bounds a single forged call |

**Why these numbers.** Assume ~35% of the active roster donates on a given day at ~60% of cap →
expected inflow ≈ 0.21 × 1,200 ≈ **250 embers per active player per day**. That lands a normal day
between **tier 2 and tier 3**, a good day at tier 4, and makes **tier 5 a genuine push** (≈4× a normal
day; it needs ~83% of the roster at full cap). At beta size that is reachable on a coordinated night,
which is the best thing this feature can produce: a day the server decided to do something together
and could see that it worked. At launch scale participation regresses to the mean and tier 3 becomes
the typical ceiling — correct, because +3 should be normal and +5 should be a story.

The weekly ladder is the daily ladder × 5, so a player who caps every day and every week contributes
the same *share* of both — the two pools never compete for attention on different terms.

**The freeze cuts both ways and that is the point.** Alts inflate `A`, which *raises* every threshold,
so alt-stuffing the pool makes the pool harder for the stuffer's own main. Same self-defeating
geometry as the muster goal.

### 2.4 How the boost applies to the blessing

One rule, applied server-side inside the blessing's own bonus map:

- Every **percentage key** in the blessing gains `+tier` percentage points (`0.01 × tier`).
  Scholar's Day `allXP 0.03` at tier 4 → `allXP 0.07`.
- Multi-key blessings gain it on **every** percentage key (Guild Works at tier 3 → cook/smith/craft
  0.06 → 0.09 each). This is not extra value per player — a player trains one skill at a time — and
  it keeps the rule to one sentence.
- **Flat keys** (`farmYield`) are outside the percent grammar: **+1 at tier 3, +2 at tier 5**.
- `noBurn` is a reliability key on a 0–1 scale: it takes the percentage points and clamps at 1.0.

**The calendar key cap.** The daily and weekly blessings can land on the same key, and with donations
that stacks higher than the power budget was written for. So:

```
BLESSING_KEY_CAP = 0.12          // per bonus key, base + donation, daily + weekly combined
```

Scholar's Day at +5 (0.08) plus Grand Fair at +5 (0.09) = 0.17 → **paid as 0.12**. The cap is shown
in the UI, never applied silently — "the realm's blessing is capped at +12%" is a rule players should
know before they donate into a wall. When a pool's next tier would be entirely eaten by the cap, the
Kindling card says so and the donate button reads *"Already at the realm's cap"*.

### 2.5 Anti-abuse

| Rule | Where it lives |
|---|---|
| Value is computed from a **server catalogue**, never from a client number | `blessing_catalogue` table, generated from `ITEMS` at migration time |
| Items/gold are **debited atomically with the pool credit**, by the existing apply engine | one transaction in `hr_blessing_donate` |
| Per-player per-period ember cap, read from an **append-only journal** | `blessing_donations`, exactly `clan_deposit`'s day-clamp shape |
| Per-call clamp (600 embers / 10 ids / 10,000 qty) | RPC constants |
| Eligibility floor: account **≥24h old** and **total level ≥10** | throwaway alts can neither pad the pool nor inflate `A` |
| Roster `A` frozen at open | late arrivals only ever help |
| **No personal material reward for donating** | there is nothing to farm; see §2.6 |
| No refunds, no un-donating | removes the "donate to snipe the tier, withdraw" pattern before it exists |
| Every donation journalled with actor, period, payload, server `now()` | abuse detectable and reversible, per CLAUDE.md |

**Gold-dupe review.** Donations are strictly value-destroying: gold and items leave the player and
become an integer on a pool row. Nothing here mints gold, items, gems, renown or Hearth Tokens, and
the only output is a percentage on a presence-gated buff. There is no reverse path, so there is no
dupe surface — the entire risk is *tier trivialisation*, which the per-player cap and the per-capita
thresholds bound.

**Economy note (flag to Systems).** Retiring the muster chest removes roughly **7,500 gold and 10 gems
per player per day** of faucet, and the Kindling adds a sink on top. That is a large one-directional
swing. Recommendation: ship it as written and **measure for one week** before compensating; if the
casual daily gold curve reads thin, the lever is the **daily-task payout**, not a reinstated chest.
The gem side matters more than the gold side — 10 gems/day was a real cosmetic-access rate; Systems
should re-check the daily-login gem cadence against `legacy.js` cosmetic prices before launch.

### 2.6 What a donor gets (and deliberately does not)

**No gold, no gems, no XP, no renown, no currency.** Renown especially: renown is the progression
spine, and gold→renown through a donation box is a bond-funded progression path. Not happening.

What a donor gets:

1. **The blessing itself**, which is the honest reward and the only one that scales cleanly.
2. **The Kindling Roll** — the day's top 10 donors, by name, on the Events card. At 6–20 players this
   is the entire motivation engine and it costs nothing to build.
3. **Your share, stated plainly.** Because thresholds are per-capita, every player has a *share*
   (`threshold / A`), and the UI can always say something true and personal: *"You covered your share
   and 0.8 of someone else's."* This is the line that keeps individual impact legible at 8 players
   **and** at 8,000 — the classic failure mode of public-good mechanics is that at scale your
   contribution becomes invisible, and a per-capita frame is the fix.
4. **A lifetime title track** (Kindler / Firekeeper / Beaconwarden) and a Collection-Log entry. Pure
   prestige, zero power.

### 2.7 Away-time interaction (required ruling)

**Donation-boosted blessings ride the `blessing` channel, unchanged, and therefore do not pay away.**
`AWAY_SCOPE.blessing = false` (`src/core/away.js`) — a blessing is something *the world* is doing, and
the world does it for people who are in it. A donation changes the blessing's *magnitude*; it does not
change *whose* bonus it is.

Implementation consequence, stated so nobody invents a shortcut: **the boost is applied by mutating
the blessing's own bonus map before it reaches `getBonus`. It must NOT be given a channel of its
own,** and no new key is introduced. Then every existing consumer inherits it with zero wiring, the
away replay excludes it for free, and there is no timeline problem to solve — a ratcheting mid-day
magnitude change is invisible to away accrual because away accrual never sees this channel at all.

Player-facing corollary, and it is a feature: **donating raises the value of being online.** It cannot
be farmed by shutting the tab, which is the same rule b227/b229 already shipped.

**Dependency:** the hardcoded `blessed:false` at `combat-sim.js:415` must be deleted before any
blessing magnitude becomes server-computed (already flagged in `HANDOFF-server-authority.md` §rulings).

### 2.8 Power-budget review (the fuse)

The `getBonus('allXP') ≤ 0.60` assertion was written against **permanent** power (+52% ceiling,
`CONFLICTS` 2026-08-08 §3). A capped, presence-gated, community-funded calendar term is a different
budget and must be measured separately. **Designer ruling:**

```
permanent stack     ≤ 0.60      (unchanged — the fuse keeps its meaning)
calendar term       ≤ 0.12      (BLESSING_KEY_CAP, base + donation, daily + weekly)
observed max        ≤ 0.72      allXP while present, at the absolute ceiling of both
```

The smoke assertion splits into two assertions. Pacing impact, computed on the A.2 day model
(12h banked + 2.5h active = 14.5 effective h/day; requirement 824 effective h to the first 99):

| Scenario | effective h/day | days to first 99 |
|---|---|---|
| Calendar misses your skill (the floor) | 14.5 | **57.2** |
| Today, expected across the pool | 14.75 | 55.9 |
| With donations, expected (typical +2 daily / +2 weekly on a matching key) | ~15.0 | ~54.9 |
| **Absolute ceiling** (both blessings your key, both pools at tier 5, capped at 12%) | 14.8 | **55.7** |

The presence gate is what makes this safe: even the ceiling only rides 2.5 of 14.5 hours, so the
absolute best case moves the eight-week anchor by ~1.5 days. **Acceptance gate:** re-measure after
build; the first-99 floor must stay ≥ 54 days. If it does not, the lever is `BLESSING_KEY_CAP`, not
the thresholds — the thresholds are what make the feature social.

---

## 3 · The blessing library

### 3.1 The rule that governs additions

`world-events.js`'s **wired-key audit** stands: a pool entry may only use a key some system actually
reads (`allXP`, `combatXP`, `gatherSpeed`, `cookSpeed`, `smithSpeed`, `craftSpeed`, `prayerSpeed`,
`farmYield`, `goldFind`, `noBurn`). An entry using an unwired key is a promise the engine cannot pay.
Everything in §3.2 and §3.3 uses wired keys only. §3.4 lists what needs a seam first.

Magnitudes stay on the b228 rebase grammar (blessings run 2–6% and are discounted twice already —
temporary *and* presence-gated). Donations, not bigger base numbers, are where the headroom went.

### 3.2 Existing rolls (unchanged, restated with eligibility)

| id | Name | Bonus | Daily roll | Vote-eligible weekly |
|---|---|---|---|---|
| `gather_surge` | Gathering Surge | gatherSpeed 0.04 | ✔ | — |
| `forge_fires` | Forge Fires | smith 0.04, craft 0.04 | ✔ | — |
| `harvest_fest` | Harvest Festival | farmYield +2 | ✔ | — |
| `scholars_day` | Scholar's Day | allXP 0.03 | ✔ | — |
| `hunters_moon` | Hunter's Moon | combatXP 0.03 | ✔ | — |
| `feast_day` | Feast Day | cookSpeed 0.04 | ✔ | — |
| `quiet_vigil` | Quiet Vigil | prayerSpeed 0.04 | ✔ | — |
| `open_coffers` | The Open Coffers | goldFind 0.03 | ✔ | — |
| `steady_fire` | The Steady Fire | noBurn 0.25, cookSpeed 0.02 | ✔ | — |
| `grand_fair` | The Grand Fair | allXP 0.04 | — | ✔ |
| `kings_bounty` | The King's Bounty | goldFind 0.04 | — | ✔ |
| `deep_veins` | Deep Veins | gatherSpeed 0.06 | — | ✔ |
| `war_drums` | War Drums | combatXP 0.04 | — | ✔ |
| `guild_works` | Guild Works | cook/smith/craft 0.06 | — | ✔ |
| `long_harvest` | The Long Harvest | farmYield +1, gatherSpeed 0.04 | — | ✔ |

### 3.3 New rolls (12) — the vote needs a library to choose from

Patterns lifted from OSRS's themed bonus days, Melvor's bonus-XP modifiers, Idle Clans' daily boosts,
and RS3's Distractions & Diversions. Names and combinations are ours.

| id | Name | Bonus | Daily | Weekly (vote-eligible) | Note |
|---|---|---|---|---|---|
| `travellers_tales` | Traveller's Tales | allXP 0.02, goldFind 0.02 | ✔ | ✔ | the "everyone gets something" roll — never dead |
| `the_whetstone` | The Whetstone | combatXP 0.02, smithSpeed 0.04 | ✔ | — | the fighter-who-smiths day |
| `low_tide` | Low Tide | gatherSpeed 0.03, farmYield +1 | ✔ | — | gatherer/farmer overlap |
| `lamplight_study` | Lamplight Study | allXP 0.02, prayerSpeed 0.04 | ✔ | — | gives prayer a second slot without a prayer-only week |
| `fair_winds` | Fair Winds | gatherSpeed 0.03, cookSpeed 0.03 | ✔ | — | catch-and-cook |
| `the_cold_kitchen` | The Cold Kitchen | noBurn 0.50, cookSpeed 0.03 | ✔ | ✔ | reliability roll; noBurn clamps at 1.0 |
| `market_day` | Market Day | goldFind 0.04 | ✔ | — | the pure gold daily |
| `the_long_shift` | The Long Shift | cook/smith/craft/prayer 0.03 | ✔ | ✔ | the only roll touching all four artisan speeds |
| `the_blooded_field` | The Blooded Field | combatXP 0.05 | — | ✔ | biggest single-channel weekly — the combat bloc's rallying candidate |
| `the_toll_roads` | The Toll Roads | goldFind 0.05 | — | ✔ | biggest gold weekly; the "we're saving for something" vote |
| `rains_of_plenty` | Rains of Plenty | farmYield +2, gatherSpeed 0.02 | — | ✔ | the farm week; flat key means donations add +1/+2, not +5 |
| `the_wide_road` | The Wide Road | allXP 0.03, gatherSpeed 0.03 | — | ✔ | the generalist weekly — the compromise candidate a split server lands on |

**Totals: 17 daily rolls, 13 weekly vote-eligible rolls.** Thirteen is the number that matters: a
4-candidate ballot drawn from 13 with channel-diversity constraints (§4.2) will not repeat a slate for
months, which is what stops the vote from becoming a rubber stamp.

**Design intent behind the weekly set:** every weekly candidate is legible as *a faction's pick* —
combat, gold, gathering, artisan, farming, generalist. A vote whose options are all mild variations of
each other is a survey, not a decision.

### 3.4 Blocked until a seam exists (do not add to any pool yet)

| Proposed | Needs | Owner |
|---|---|---|
| `the_long_odds` — rare-drop chance | nothing reads `getBonus('rareDrop')`; the drop roll must consult it | Systems |
| `the_tithe_barn` — +bank/storage | no storage system enforces capacity (standing backlog item) | Systems |
| `restless_nights` — +offline cap hours | offline cap is a server clamp; a blessing that pays away contradicts §2.7 | **rejected**, not blocked |

---

## 4 · The Beacon Vote

### 4.1 The weekly anchor (US assumption stated)

**Assumption:** the playerbase is US-centred (Tyler is US; the beta roster is US). This is the stated
premise; if the roster becomes materially non-US, the anchor is the thing to revisit.

### **Weekly reset: Monday 03:00 UTC. Vote closes Sunday 03:00 UTC (24h earlier).**

| | Reset (Mon 03:00 UTC) | Vote close (Sun 03:00 UTC) |
|---|---|---|
| US Eastern, summer (EDT) | Sun **11:00 pm** | Sat 11:00 pm |
| US Eastern, winter (EST) | Sun **10:00 pm** | Sat 10:00 pm |
| US Central | Sun 10 / 9 pm | Sat 10 / 9 pm |
| US Mountain | Sun 9 / 8 pm | Sat 9 / 8 pm |
| US Pacific | Sun **8:00 / 7:00 pm** | Sat 8 / 7 pm |

**Why 03:00 UTC specifically.** It is the only band that is *Sunday night* in all four US zones at
once. Later (04:00–05:00 UTC) pushes Eastern past midnight into Monday — no longer "Sunday night", and
worse, a player who logs in Sunday evening finds the week already gone. Earlier (00:00–01:00 UTC) puts
Pacific at 4–5 pm, which is Sunday *afternoon* and lands mid-session. 03:00 UTC also has the property
that **DST cannot break it**: the anchor is a fixed UTC constant, the seasonal drift is exactly one
hour, and one hour of drift never leaves Sunday evening in any US zone. No timezone library, no DST
branch, no server-local time — one integer.

**Conflict, must be handled (flag to Systems).** `utcWeekKey()` is
`floor(daysSinceEpoch / 7)` — an epoch-aligned **Thursday 00:00 UTC** boundary, consumed by
`raids.js` and the weekly-quest system. **Do not change it.** Introduce a separate
`beaconWeekKey(ms) = floor((ms - 3h) / 7d)` anchored to Monday 03:00 UTC, used only by the weekly
blessing, the Beacon pool and the vote. Phase 6 (optional, coordinated, post-launch) may migrate
raids and weekly quests onto the same anchor so the game has **one** weekly reset — that is a better
end state but it is not this feature's job, and doing it mid-Hunt-week is a live-data hazard.

**The daily boundary stays at 00:00 UTC**, unchanged — `utcDayKey`, daily tasks, the offline budget
watermark and the daily blessing rotation all key off it, and moving it has a blast radius nothing in
this feature justifies.

### 4.2 The ballot

- **Slate: 4 candidates**, derived server-side from `beaconWeekKey` by the same FNV-1a walk the
  calendar already uses (deterministic, reproducible, auditable — no server RNG to trust).
- **Diversity constraint:** at most one candidate per primary channel (combat / gather / artisan /
  gold / farm / generalist), and **no candidate that was the active weekly in either of the last two
  weeks**. Walk the hash order and skip conflicts. This is what stops three-quarters of a ballot
  being "+XP, slightly different".
- **Single choice, changeable until close.** One ballot per account; recasting overwrites.
- **Live tallies are shown.** At beta scale hiding them would just move the coordination into Discord;
  showing them makes the Events screen a place where something social is visibly happening. Revisit
  only if bandwagoning ever flattens the vote at scale.

### 4.3 Eligibility

A player may vote if, at the moment the ballot is cast:

1. signed in (server identity — the whole feature is server-side, there is no guest path here), **and**
2. the account has **≥1 server-applied intent in the current vote window** (i.e. they actually played
   this week), **and**
3. the account is **≥48h old** and **total level ≥10**.

Donations grant **no vote weight of any kind**, and clan membership grants none either. The vote is
one player, one voice; the pool is where money and effort speak. Keeping those two levers separate is
the single most important rule in this spec — merge them and the weekly blessing becomes purchasable.

### 4.4 Close, tie-breaks, and turnout

- **Close:** Sunday 03:00 UTC. From close to reset the winner is displayed as **"The realm has
  chosen: War Drums — lit Sunday night"**, with the final tally. That 24-hour gap is not
  administrative slack; it is the anticipation window, and it lets players plan the week (bank the
  logs, stock the food, book the evening).
- **Tie-break 1 — the longest unseen wins.** Among tied candidates, the one whose blessing has gone
  the most weeks without being active. Favours variety, is trivially explainable, and is deterministic.
- **Tie-break 2 — hash order.** Still tied → the candidate earliest in the slate's derived order.
  Public, reproducible, no coin flips on the server.
- **Turnout floor.** If total ballots < `max(3, ceil(0.10 × eligible))`, the vote is void and the week
  falls back to the **existing deterministic hash roll** over the full weekly pool. The card says
  *"Too few voices — the calendar chose this week."* No guilt copy, no shaming. At 6–20 players a
  quiet week is a real possibility and the game must have a correct answer for it.

### 4.5 How vote and donations compose

> **The vote picks WHICH. The pool decides HOW MUCH.**

They are orthogonal by construction and that is the whole design:

| | Daily | Weekly |
|---|---|---|
| **Which blessing** | deterministic hash roll (no daily vote — there is no time to campaign, and a daily ballot is decision fatigue) | **the Beacon Vote** (hash-roll fallback on low turnout) |
| **How strong** | The Kindling pool, +0…+5 | The Beacon pool, +0…+5 |
| Ratchets | yes, live, never falls back | yes, live, never falls back |
| Capped | `BLESSING_KEY_CAP = 0.12` per key, base + both pools | same |

A player who votes but never donates still shaped the week. A player who donates but never votes still
made the week stronger. Neither is a second-class participant, and neither can substitute for the
other — which is why both surfaces stay busy.

---

## 5 · What happens to the Muster

Retired: the 45-minute live windows, join-once-per-day, the pick-one rally, pledges, the community
progress bar, the +10% mustered aura, the Rally button, and the muster chest.

Kept, because they were never the problem: the **Events destination** and its discoverability work
(`world-event-cadence.md` §7 — the nav entry, the mobile More-modal route, the Home "Next up" rows),
the **topbar pill** (retargeted: it now shows the Kindling tier and the vote-closing countdown, and it
keeps its rule that state precedence never lets it nag), and the **server-skew clock**.

**Muster Seals.** Outstanding balances convert at first login after the change: **1 Seal → 1,500
gold**, one-shot, server verb, journalled. Anything the Quartermaster sold exclusively — the Farmer's
Deed above all — moves to the **Bounty Mark shop** at an equivalent price, so no item becomes
unobtainable. Nothing is deleted without a destination.

---

## 6 · Player comms — changelog paragraph

> **The Muster is out. The Kindling is in.**
> The old twice-a-day muster asked you to be at your screen at a particular minute and then to pick
> between two rallies that never really felt different. Both are gone. In their place: **The
> Kindling** — a shared fire the whole realm feeds. Donate food or gold at the Events screen and the
> pool fills; every tier it crosses adds **+1% to today's blessing**, up to +5%, live, for everyone,
> for the rest of the day. **The Beacon** is the same thing on a weekly scale, and it comes with a
> vote: every week you choose from four candidate blessings, voting closes Saturday night, and the
> winner is lit **Sunday night**. So the week's bonus is now something the realm picks, and how strong
> it is, is something the realm pays for. Muster Seals convert to gold automatically, and everything
> the Quartermaster sold has moved to the Bounty shop — nothing is lost. Donations are a gift, not a
> purchase: they buy no personal reward, no gear, no renown and no votes. They buy a better week for
> everybody, and your name on the day's roll.

---

## 7 · Implementation phases

Everything is server-authoritative: **the client renders and sends intents; it never computes a tier,
a magnitude, an ember value or a tally.** The Backend Architect owns the SQL; the shapes below are
the contract.

| # | Phase | Layer | Size | Owner | Contents |
|---|---|---|---|---|---|
| 1 | **Pool foundation** | server verb | **M** | Backend | Tables `blessing_pools`, `blessing_donations` (append-only), `blessing_catalogue` (generated from `ITEMS`). `hr_blessing_state()` → `{dayKey, beaconWeekKey, daily:{id,bonus,tier,pool,thresholds,roster}, weekly:{…}, me:{donated_today, donated_week, caps}}`. `hr_blessing_donate(p_scope,p_gold,p_items)` → `{accepted_embers, spent, my_period_total, pool_total, tier_before, tier_after, capped_reason}` — atomic debit + credit, per-call/per-period clamps, catalogue-only valuation, journalled. |
| 2 | **Blessing library + key cap** | data + engine | **M** | Systems + Designer | The 12 new rolls; the daily/weekly eligibility flags; the shared blessing module read by BOTH the client render and the accrual/apply engine; `BLESSING_KEY_CAP`; the fuse assertion split (§2.8); delete `blessed:false` at `combat-sim.js:415`. |
| 3 | **Kindling & Beacon cards** | client render | **M** | Systems + Art | Events-screen cards: tier ladder with the live pool bar, "your share" line, donate sheet (larder picker + gold field, ember preview from server values only), Kindling Roll top-10, cap notice. Topbar pill retarget. |
| 4 | **The Beacon Vote** | server verb + client | **M** | Backend + Systems | `blessing_votes(week_key,user_id)` PK, `blessing_weeks(week_key, slate, winner, decided_at, turnout)`. `hr_blessing_vote(p_week_key,p_choice)` → `{recorded, tallies}`. Slate derivation with the diversity constraint; eligibility gate; close-time enforcement from `now()`; tie-breaks; turnout floor + hash fallback; results card. |
| 5 | **Muster retirement** | client + server | **S** | Systems | Delete the live-window/pledge/chest path; `muster.js` → `kindling.js`; one-shot journalled Seal→gold conversion; Quartermaster exclusives to the Bounty shop; changelog copy. |
| 6 | **Boundary jobs** | cron | **S** | Backend | Lazy-resolve on first call after a boundary (open pool, snapshot roster, resolve vote) **plus** a pg_cron safety net at 00:05 UTC daily and Mon 03:05 UTC weekly. Lazy is authoritative; cron only guarantees a quiet server still rolls over. |
| 7 | **One weekly reset** (optional) | server | **M** | Backend | Migrate raids + weekly quests onto the Monday 03:00 UTC anchor. Post-launch, between Hunt weeks, never mid-week. |
| 8 | **Seam-blocked rolls** | engine | **S each** | Systems | `getBonus('rareDrop')` in the drop roll → unlocks `the_long_odds`. Storage enforcement → unlocks `the_tithe_barn`. |

### Test coverage required (per `CLAUDE.md`)

1. **Valuation.** A raw donated at `0.20 × v`, a cooked at `v`, gold at `/5`; an uncatalogued id is
   **rejected**, not zero-valued.
2. **Caps.** Donate past the per-call clamp → clamped; past the daily cap → `capped`, no debit taken
   for the rejected excess (nothing is ever consumed without crediting).
3. **Atomicity.** A donate that fails after debit leaves gold/inventory untouched (forced-failure test).
4. **Threshold scaling.** `A = max(8, active_7d)`; roster frozen at open; a new signup mid-day does
   not move today's thresholds.
5. **Ratchet.** Tier crossed → bonus applies immediately and does not fall back if the pool total is
   later recomputed.
6. **Key cap.** Daily+weekly on the same key at tier 5 each → `getBonus(key)` returns exactly 0.12.
7. **Away regression.** A tier-5 pool changes **nothing** about an away replay's output
   (`AWAY_SCOPE.blessing = false` still holds with donations live) — this is the tripwire that stops
   someone giving donations their own channel.
8. **Fuse.** `permanent ≤ 0.60` and `calendar ≤ 0.12`, asserted separately.
9. **Vote.** Ineligible account rejected; recast overwrites; a ballot at close+1s rejected from server
   time regardless of client clock; tie-break 1 then 2; turnout floor falls back to the hash roll.
10. **Anchor.** `beaconWeekKey` rolls at Monday 03:00 UTC across a DST boundary in both directions, and
    `utcWeekKey` is **unchanged** (raids regression).

---

## 8 · Hand-offs

- **Backend Architect:** phases 1, 4, 6 — the SQL, the clamps, the journal, the lazy-resolve pattern.
  Copy `clan_deposit` (`2026-08-08-clan-seat.sql` §7) for the catalogue + day-clamp shape.
- **Systems:** phases 2, 3, 5 — the shared blessing module (one source of truth read by both the
  client render and the accrual engine), the fuse-assertion split, `blessed:false` deletion, the
  `beaconWeekKey` **separate** from `utcWeekKey`, the muster teardown.
- **Art Director:** the Kindling card must make three things readable at a glance — *how full*, *what
  the next tier gives*, and *what my share was*. The old muster card taught players that a progress
  bar on this screen is decoration; this one has to earn the opposite reflex. Also: the vote card in
  its four states (open / voted / closed-awaiting / lit), and the topbar pill retarget.
- **QA:** §7's ten tests; #7 and #10 are the two that guard against silent, expensive regressions.
- **Economy watch (Systems + Designer):** the −7,500 g / −10 gems per player per day faucet change in
  §2.5. One week of measurement before any compensating change.
- **Designer (me) owns:** the ember rates, the threshold multipliers, the caps, `BLESSING_KEY_CAP`,
  the library and its eligibility flags, the slate size and diversity constraint, and the turnout
  floor. First retune after **two full weeks** of live pools; the lever for low participation is the
  **gold divisor and the daily cap**, not the tier magnitudes.
