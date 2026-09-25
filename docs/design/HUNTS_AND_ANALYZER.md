# Hunts and the Hunt Analyzer

**Game Designer ruling, 2026-09-22.** Design authority per `CLAUDE.md` §3.1 — the
decisions below are made, not queued, with one exception marked **TYLER** (price
policy, §5.6). Sibling documents: `docs/design/BESTIARY_LADDER.md` (the long
chase), `docs/design/HUNT_ANALYZER_UI.md` (the panel).

Frame: `CLAUDE.md` §1 wins over anything here. Nothing below has a client author
a number, and nothing below adds a second combat path. The programme this rides
on is `docs/planning/LIVE_WORLD_BRIEF.md`; the hunt is the **session object**
that brief's step 4 names, brought forward far enough to be playable on the
accrual path we already ship.

---

## 0. The one-sentence design

**A hunt is the activity pointer we already have, plus a stance and a set of
stop rules — and the Analyzer is a read over the ledger rows the hunt already
wrote.** Everything else in this document follows from that sentence. If a
decision here would have created a second place where "what the character is
doing" lives, or a counter the ledger does not already imply, the decision is
wrong.

The loop we are buying, in the player's words: *pick a spawn, pick a stance, set
what should stop it, walk away; come back to a panel that tells you whether that
was a good night.* We adopt the loop. We adopt none of the content: our
monsters, our numbers, our names, our art.

---

## 1. Why this is an extension and not a rewrite

Four columns on `player_state` already are a hunt:

```
active_kind   'combat'        -- the loop that is running
active_id     '<monster_id>'  -- what it is running against
active_since  timestamptz     -- SERVER clock, when it started
accrued_to    timestamptz     -- SERVER clock, paid up to here
```

`set-activity.js` already starts and stops it as an intent. `computeAccrual`
already turns (that pointer, the server clock) into a delta. `simulateSpan` in
`src/core/combat-sim.js` is already the ONE engine for the live tick and the
away replay (`AWAY-1`). `player_ledger` already journals every settled window
with its geometry and result. `hr_bestiary_of` already projects per-monster kill
counts.

So the honest size of this feature is: **two nullable columns, no new intent
verb, one new read-only RPC.** That is the whole of slice 1.

| What a hunt needs | Where it already lives | What is new |
|---|---|---|
| which monster | `player_state.active_id` | — |
| when it started | `player_state.active_since` | — |
| what it has paid | `player_state.accrued_to` | — |
| start / stop | `set_activity` intent | two optional fields on the same verb |
| the simulation | `computeAccrual` → `simulateSpan` | — |
| kills, gold, XP, loot | `player_ledger` accrue rows | — |
| per-monster kill totals | `player_progress` `ev:kill_monster:<id>` | — |
| **how to fight** | — | `player_state.hunt_stance` |
| **when to stop** | — | `player_state.hunt_stop` |
| **the readout** | — | `hr_hunt_analyzer()` |

---

## 2. The hunt object

### 2.1 Spawn — slice 1 is a monster id

`active_id` is a monster id today and stays one. A *named spawn* (a place with a
weighted monster mix — "the Goblin Camp", three ids and their weights) is a data
row in a later `src/data/spawns.js` addressed as `active_id='spawn:<id>'`, and
it needs nothing in this document to change: `hr_activities` already validates
`active_id` against a catalogue, and the engine already resolves an id to a
monster row.

**Decided:** slice 1 ships monster ids. Named spawns are slice 3, after the
Analyzer has produced a week of real XP/h numbers to balance a mix against.
Designing the mix first would be balancing a spawn table with no measurements,
which is how the raid pool got its one-tap weekly chest.

### 2.2 Stance — a policy over knobs that already exist, never a multiplier

**The rule, and it is the important one: a stance may never introduce a
multiplier, a rate, or a bonus.** The moment a stance pays more damage it is a
balance surface, a thing to sell, and a second combat path to keep at `AWAY-1`
parity. A stance is a *standing order* over three decisions the engine already
makes, and nothing else.

| stance | auto-eat threshold | when ammo runs dry | consecutive falls before stopping |
|---|---|---|---|
| `careful` | 0.75 | stop the hunt | 2 |
| `steady` (default) | 0.50 (`DEFAULT_THRESHOLD`) | keep swinging at `AMMO_DRY_MULT` | never (Recovery Rule resumes) |
| `reckless` | 0.25 | keep swinging at `AMMO_DRY_MULT` | never |

All three knobs are shipped: `src/core/auto-eat.js` `DEFAULT_THRESHOLD`,
`src/core/ammo.js` `AMMO_DRY_MULT`, and `player_state.consec_falls`. The engine
reads them where it reads them today; the stance only supplies the values.

Why exactly three, and why these: the three questions an idle player cannot
answer once the tab is closed are *"how brave should I be with food?"*, *"is
this run still worth it after the arrows?"* and *"how many deaths before this
is a bad night?"*. `careful` is the answer for an expensive, thin supply line;
`reckless` is the answer for a player farming a monster that cannot realistically
kill them and who would rather not waste food. `steady` is what the game does
today, which is why it is the default and why nobody is opted into a change.

A fourth stance is a data row (`src/data/stances.js`) the day a fourth question
exists. It is not one today.

### 2.3 Supply budget — expressed as a stop rule, never as an escrow

A "supply budget" could be a reservation: set aside 400 arrows and 80 fish for
this hunt. **Rejected.** A reservation is a second copy of an inventory count,
it needs a release path for every way a hunt can end, and a second copy of a
quantity is the exact shape of a dupe. The server owns anything tradeable
(`CLAUDE.md` §1) and a reserved stack is a tradeable quantity in a place that is
not the bag.

So the budget is a **floor**, not a pool:

```
hunt_stop = {
  hours:      1..24     stop after N hours of PAID time
  food_floor: 0..10000  stop when the eaten food stack falls below N
  ammo_floor: 0..100000 stop when the equipped ammo falls below N
  falls:      1..10     stop after N consecutive deaths
  bag_full:   bool      stop when the bag has no free stack   (DEFAULT TRUE)
}
```

Every field optional; an absent field is no rule. The whole object is validated
at the request layer against the bounds above and re-validated by the RPC; a
value outside them is a refusal, never a clamp, so a client cannot discover a
hidden maximum by pushing at one.

`bag_full: true` is the default because the silent loss it prevents is the one
thing that makes a player feel the game cheated them: eight hours of a hunt
whose loot stopped fitting after ninety minutes. That is not a stop rule so much
as a bug we have been shipping as a feature.

### 2.4 Auto-stop is not a new write path

A stop is `delta.activity = { kind: 'idle' }` — the same thing the engine
already proposes when a run retreats or its monster is gone, re-clamped by
`hr_apply` like every other delta key. The stop rules are evaluated **inside the
settle**, against the state the settle is already holding, by the engine. There
is no scheduler, no timer row, no second writer. That is the property that makes
this cheap: the whole feature is a predicate the simulation already had the
inputs for.

Ordering, decided so two lanes cannot answer it differently: `falls` →
`bag_full` → `food_floor` → `ammo_floor` → `hours`. Deaths first because a
character who is dying should stop before we ask whether their bag is tidy; the
time cap last because it is the only rule that is not about something going
wrong. The journal records which rule fired (`meta.stopped`), which the ledger
row already carries a slot for.

---

## 3. The Analyzer: every field, and the column behind it

The Analyzer is a **read**, `hr_hunt_analyzer(p_user, p_slot)`, `SECURITY
DEFINER`, executable by `hr_engine` only, mirroring `hr_bestiary_of`'s posture
exactly. It sums `player_ledger` rows for this character with `kind='accrue'`
and `at >= player_state.active_since`. The index it needs —
`player_ledger_user_idx (user_id, slot, at desc)` — already exists, and a hunt
is bounded by `ACCRUE_MAX_SPAN_MS` (24 h), so the scan is bounded by design.

**There is no per-hunt counter table, and there will not be one.** A counter
table is a second copy of what the ledger already says, it needs a reset on
every way a hunt can start, and it can disagree with the journal — which is the
"browser says one thing, the server says another" class in a new costume
(`CLAUDE.md` §6). The ledger is the record of truth; the Analyzer is arithmetic
over it.

| Analyzer field | How it is computed | Source |
|---|---|---|
| Spawn | the monster's display name | `player_state.active_id` → `MONSTERS` |
| Stance | display name | `player_state.hunt_stance` |
| Elapsed | `now() - active_since` | `player_state` |
| **Paid time** | `Σ (meta->>'ms')::bigint` | accrue rows |
| Downtime | elapsed − paid time | derived (recovery, refusals, dry windows) |
| Kills | `Σ (meta->>'kills')::bigint` | accrue rows |
| Kills/h | kills ÷ elapsed hours | derived |
| **Raw XP/h** | combat XP ÷ **paid** hours | `player_ledger.xp` where `skill_id` ∈ combat skills |
| **XP/h** | combat XP ÷ **elapsed** hours | the honest one — includes every minute you were dead |
| Gold | `Σ gold` | accrue rows |
| Loot value | `Σ qty × ITEMS[id].v` over `meta->'i'` | server-side, from the sealed catalogue |
| Supplies | food eaten × `v` + ammo spent × `v` | `meta->>'ate'`, `meta->>'ammo'` |
| **Profit/h** | (gold + loot value − supplies) ÷ elapsed hours | derived |
| Deaths | `Σ (meta->>'fell')::bigint` | accrue rows |
| Stopped by | the rule that ended the last window, if any | `meta->>'stopped'` |
| Vigour spent | paid minutes charged today | `player_progress` daily, §5 |

Three notes that are design decisions rather than plumbing:

1. **Raw XP/h and XP/h are both shown, and the difference is the point.** Raw is
   what the spawn pays while you are swinging; effective is what it paid you.
   The gap is recovery time, dry ammo and refusals — i.e. it is exactly the
   number that tells a player their stance or their supplies are wrong. One
   number without the other is either a lie or a mystery.
2. **Loot value is vendor value, computed server-side, and is never a market
   price.** A market price is a player-influenced number, and putting one inside
   a rate a player optimises against invites wash trading to inflate a
   leaderboard-adjacent readout. `ITEMS[id].v` is a catalogue constant. The
   panel says "vendor value" in so many words so nobody reads it as a market
   quote.
3. **Profit/h divides by elapsed, not paid.** A hunt that pays well while
   swinging and spends half its night knocked out is not profitable, and the
   number a player uses to choose a spawn must not hide that.

### 3.1 What the client does with it

Renders it. The Analyzer arrives in the envelope as a projected block and is
**replaced** on every envelope, never merged upward, never extrapolated between
settles (`CLAUDE.md` §6). There is no client-side "kills so far" ticking up
between windows: a kill counter that runs ahead of the server is the phantom-seed
bug with a different noun. The panel shows the last settled numbers and the time
they were settled, and that is honest.

---

## 4. Vigour: the daily limiter

### 4.1 What it is

**Vigour is a daily budget of PAID hunting minutes.** It is not a bar that
blocks play, it is the line past which a hunt stops paying full rate.

- **The unit is minutes of paid combat time** — the same `ms` the ledger already
  records. Gather and artisan do not charge Vigour: they are not hunts, they are
  already rate-limited by nodes and benches, and charging them would turn one
  budget into three arguments.
- **The free daily grant is the character's own offline cap, in minutes, floored
  at 720.** `offlineCapHours()` is 12 for everybody, plus renown perks, plus
  property tier (up to +4 at castle). Deriving the grant from it has three
  properties I want and could not get any other way: **nobody loses anything
  they can earn today** (the grant is by construction at least the cap they
  already play to), the renown and property perks that extend offline time now
  extend the hunt budget too rather than becoming obsolete the day this ships,
  and there is **no new balance number** — one derivation, not a second ladder.
- **It refreshes at the UTC day rollover**, on `hr_utc_day_key(now())`, the same
  boundary every daily in the game already uses.

### 4.2 Where it is stored — nowhere new

```
player_progress(kind='daily', key='ev:vigour_min', period_key=<utc day key>, value=<minutes spent today>)
```

That is the existing daily-counter machinery, the existing clamp
(`c_max_progress_add`), the existing per-period retention, and the existing
projection. **No new table and no new column.** The grant is not stored at all —
it is derived from the character's perks on every read, so it cannot drift from
the perks it is derived from and it rises the instant a player earns a rung.

### 4.3 Running out does not stop you

Past the budget, the hunt keeps running and keeps killing, and pays
`VIGOUR_DRY_MULT = 0.25` on gold, loot and XP.

That number is not chosen freshly: it is `AMMO_DRY_MULT`, which this game already
ships and already teaches, for the same situation — *you ran out of the thing
that makes this efficient, and the game degrades instead of slamming a door.* A
player who learns "dry means a quarter" learns it once and it is true twice.

A hard stop was considered and rejected. A hard stop means a player who set an
eight-hour hunt before bed gets six paid hours and two hours of a character
standing still, which reads as a punishment for sleeping — and the away-time
ruling exists precisely because this game has already charged a player for
sleeping once.

### 4.4 Refills

Gold, and only gold. **Gems and Hearth Tokens may never buy hunting time.** An
away-accrual boost sold for cash is pay-to-win on a ranked economy — that is the
settled ruling that removed the Offline+ product and the Hearth Hall bonus, and
selling the same hours under a new noun would be the same product. This is not a
price question and it does not go to Tyler: it is decided.

- **+120 minutes per refill.**
- **Price scales with the character's combat level and rises within the UTC
  day** (Tyler, 2026-09-25 — §4.6 has the formula and the table), resetting
  with the day key. (Replaces the ×3 ladder 2,000 → 162,000 first proposed here.)
- **At most 5 refills per day** = +600 minutes bought, and never more than a
  **22-hour** total paid ceiling however large the grant grows. Two hours a day
  that gold cannot buy is what keeps "richest player hunts most" from becoming
  "richest player hunts always".

Why the price climbs within the day at all: the bank ladder is a permanent
capability bought once, but Vigour is bought *again every day*, so a flat price
becomes a fixed daily tax the wealthy stop noticing by week two. Refill 1 is an
easy yes, refill 5 is something a player does on purpose. (The first proposal
was ×3 per rung; Tyler's 2026-09-25 ruling scales the price with level instead,
which is what keeps it meaningful at every stage — §4.6.)

The sink is the point: gold leaving the economy through a faucet nobody can
resell — at full refill, 37,500 a day at combat level 5 and 420,000 at 90.

### 4.5 What Vigour is NOT

It is not a stamina bar that empties while you play attended and refills while
you idle. Under the world tick, attended and away are the same simulation
(`AWAY-1`), so a limiter that distinguished them would be inventing a difference
the engine deliberately does not have.

### 4.6 TYLER — the one thing I am not deciding

Four numbers are **money and price policy**, flagged per `CLAUDE.md` §8 rather
than assumed: the **2,000-gold opening price**, the **×3 escalation**, the
**5-refill daily cap**, and whether `VIGOUR_DRY_MULT` is **0.25 or 0.00**. The
shape is mine and is decided; those four figures want his eye before the lane-C
migration, and the Security review is a hard gate regardless (`CLAUDE.md` §2 —
this moves gold).

Slice 1 ships Vigour **read-only**: the meter displays, the charge accrues, and
the refill button does not exist. That keeps the first playable slice out of the
money lane entirely.

**TYLER — 2026-09-25, RULED:** *(1) the Vigour refill price SCALES WITH THE
CHARACTER'S LEVEL, Huntera-style; (2) when Vigour runs out the hunt pays 25%
(`VIGOUR_DRY_MULT` stays 0.25).* Not reopened: gold only, +120 minutes per
refill, at most 5 refills per UTC day, the 22-hour paid ceiling, reset on
`hr_utc_day_key`. (Replaces the 2026-09-23 "still unanswered" note; the ×3
placeholder ladder and the empty `hr_vigour_prices` are retired.)

**The shape (Huntera's, measured 2026-09-18; our coefficients, not theirs):**
refill *n* of the day costs `floor((BASE + PER_LEVEL × L) × (1 + (n−1) × STEP))`
with **BASE 1,500 · PER_LEVEL 450 · STEP 0.5**, *L* = the server's combat level
(`hr_party_level` over `player_skills`, read inside the price function, never a
parameter). One row, `hr_vigour_price_rule`, holds the three coefficients and
`refills_max = 5`; a future adjustment is a reviewed `UPDATE`.
`hr_vigour_refill_price` is the only formula — the meter's `next_refill_gold`
and the verb's charge both call it. Migration:
`2026-09-25-vigour-price-by-level.sql` (STAGED, SECURITY GO REQUIRED).

| Combat level | gold/h hunting (engine) | refill 1 | 2 | 3 | 4 | 5 | day total |
|---|---|---|---|---|---|---|---|
| 5  | ~1,900  | 3,750  | 5,625  | 7,500  | 9,375   | 11,250  | 37,500  |
| 15 | ~2,530  | 8,250  | 12,375 | 16,500 | 20,625  | 24,750  | 82,500  |
| 30 | ~5,670  | 15,000 | 22,500 | 30,000 | 37,500  | 45,000  | 150,000 |
| 60 | ~13,600 | 28,500 | 42,750 | 57,000 | 71,250  | 85,500  | 285,000 |
| 90 | ~30,000 | 42,000 | 63,000 | 84,000 | 105,000 | 126,000 | 420,000 |

Why these numbers (2026-09-25, backend lane):
1. Gold/h is coin credited by `computeAccrual` → `simulateSpan`, 2 h runs, best 0-death monster with tier gear and auto-eat; loot is not auto-sold and is excluded.
2. Income is convex in level (~×2 per 15–30 levels) and a price linear in L cannot track it, so the line is fit to the whole range: refill 1 costs 0.7–1.6× the two hours it buys (1.0× at L5 and L60).
3. The top is priced soft on purpose: food-unlimited L90 hunting measures ~46k/h, so 42,000 is well under two hours for the players most able to pay.
4. STEP 0.5 makes refill 5 cost 3× refill 1 — about six hours of income for two hours of hunting — a deliberate choice, not a habit; a day of five costs 10× refill 1.
5. Combat level, not total level: a hunt's gold comes from the monster combat lets you kill; total level adds 14 skills that pay a hunt nothing.

---

## 5. Anti-abuse

- **Every counter the Analyzer reads was written by `hr_apply` out of a settled
  window.** There is no client kill count, no client timer, no client loot
  value. A hunt that is never settled contributes nothing to anything.
- **The Analyzer is a read.** It writes no row, so it cannot be replayed into a
  gain, and a forged call to it returns another shape of the caller's own data.
- **Stance and stop rules carry no power**, so forging one buys a player a
  different auto-eat threshold and a different bedtime. This is deliberate: the
  cheapest defence against a forged field is a field that is not worth forging.
- **Vigour is charged from the same `ms` the payout is computed from**, in the
  same transaction. A window cannot pay and not charge, because there is one
  number.
- **Nothing in this document crosses to another player.** No hunt value is
  tradeable, rankable or contributable, so the Target Property in `CLAUDE.md` §1
  is satisfied by construction rather than by a clamp. That changes the day a
  "top XP/h this week" board exists, and that board is out of scope here.

---

## 6. The first playable slice — and what it is not

**One screen. One intent. One read RPC.**

**IN:**
- `set_activity` grows two optional fields, `stance` and `stop`. **No new intent
  verb.** The existing refusal path, the existing journal and the existing
  `SETTABLE_KINDS` check all apply unchanged.
- `player_state.hunt_stance text` and `player_state.hunt_stop jsonb`, both
  nullable, both defaulting to today's behaviour.
- The stop rules evaluated inside the settle; `meta.stopped` names the rule.
- `hr_hunt_analyzer()` and the Hunt panel that renders it
  (`docs/design/HUNT_ANALYZER_UI.md`).
- The Vigour meter, **read-only**.
- Tests: an ATTENDED and an AWAY arm for every stop rule (`CLAUDE.md` §4 —
  both-path); a regression that a hunt with `bag_full` set stops instead of
  silently discarding loot; a guard that no stance carries a multiplier.

**NOT IN, and each for a reason:**
- **Named spawns / monster mixes.** Balance them against a week of real Analyzer
  numbers, not against a guess.
- **Party hunts.** They need the push channel; `LIVE_WORLD_BRIEF.md` step 4.
- **Vigour refills for gold.** Lane C, Security GO, and Tyler's four numbers.
- **The Bestiary damage bonus.** Its own document, its own review.
- **Supply reservation / escrow.** Rejected outright, §2.3.
- **A live-ticking client counter.** Rejected outright, §3.1.
- **A hunt history list.** The ledger has it and a "past hunts" screen is a
  second read to design; it wants the Analyzer to exist first so the columns are
  already decided.

---

## 7. Player-facing pitch

Pick a spawn, pick how careful you want to be, tell it what should make it stop
— then close the tab and let your character hunt. When you come back, the Hunt
Analyzer shows you exactly what that night was worth: kills, XP an hour, what
the loot sold for, what the food and arrows cost, and whether you actually made
money. Every number comes from the server, so what the panel says is what
happened.

---

## 8. What the backend will need (names only)

**Migrations**
- `2026-XX-XX-hunt-stance-stop.sql` — the two `player_state` columns, their
  CHECKs, and the `hunt_stop` shape validation.
- `2026-XX-XX-hunt-analyzer.sql` — `hr_hunt_analyzer`, read-only.
- `2026-XX-XX-vigour-daily.sql` — the `ev:vigour_min` daily counter, its clamp,
  and the derived-grant function. **Lane C, Security GO.**
- `2026-XX-XX-vigour-refill.sql` — the gold spend. **Lane C, Security GO, and
  Tyler's price approval first.**
- `2026-XX-XX-state-of-prefix-exclusion.sql` — see `BESTIARY_LADDER.md` §6; the
  `hr_state_of` envelope cap is a shared prerequisite of both documents.

**RPCs**
- `hr_hunt_analyzer(p_user, p_slot)` — read-only projection.
- `hr_vigour_of(p_user, p_slot)` — derived grant, spent, remaining.
- `hr_vigour_refill(p_user, p_slot, p_idem)` — the gold spend, idempotent.
- `hr_apply` — unchanged. `hr_activities` — one catalogue row per stance.

**Engine**
- `supabase/functions/hr-accrue/set-activity.js` — accept and validate the two
  new fields.
- `supabase/functions/hr-accrue/accrual.js` — charge Vigour, apply
  `VIGOUR_DRY_MULT`, evaluate the stop predicate.
- `src/core/hunt.js` — NEW, pure: the stance table, the stop predicate, the
  Vigour arithmetic. Dual-runtime, imported by the edge, no second path.

---

## 9. Open questions I decided

| Question | Decision | Why |
|---|---|---|
| New `hunt_sessions` table, or columns on `player_state`? | **Columns.** | A second object is a second place the answer to "what is this character doing" lives, and two places can disagree. |
| New intent verb `start_hunt`? | **No** — two optional fields on `set_activity`. | A new verb duplicates the whole refusal, journal and catalogue path for no new capability. |
| Is a spawn a place or a monster? | **A monster in slice 1**, a place later as a data row. | Balancing a mix before the Analyzer exists is guessing. |
| Does a stance change damage? | **Never.** A stance is a policy over three shipped knobs. | The moment it pays power it is a balance surface and a thing to sell. |
| Supply budget: reservation or floor? | **Floor (a stop rule).** | A reservation is a second copy of a quantity, which is the shape of a dupe. |
| Per-hunt counter table? | **No** — sum the ledger. | A counter that can disagree with the journal is the browser-vs-server class in a new costume. |
| Loot value: market or vendor? | **Vendor, server-side.** | A market price inside an optimised rate invites wash trading. |
| Profit/h over paid or elapsed time? | **Elapsed.** | A number used to choose a spawn must not hide the hours you spent knocked out. |
| Does Vigour hard-stop a hunt? | **No** — `VIGOUR_DRY_MULT = 0.25`. | A hard stop charges a player for sleeping, which this game has already done once. |
| Can gems buy Vigour? | **Never.** Gold only. | Selling away-accrual hours for cash is pay-to-win on a ranked economy; the ruling that removed Offline+ is the same ruling. |
| Free daily grant: a new constant? | **No** — derived from `offlineCapHours()`, floored at 720. | Nobody loses what they can earn today, earned perks keep mattering, and there is no second ladder to balance. |
| Does gathering charge Vigour? | **No.** | One budget, one argument. Nodes and benches already rate-limit themselves. |
