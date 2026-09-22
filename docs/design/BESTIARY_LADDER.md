# The Bestiary trophy ladder

**Game Designer ruling, 2026-09-22.** Design authority per `CLAUDE.md` §3.1;
every open question below is decided, none is queued on Tyler — this ladder
mints no currency and moves no price, so there is nothing here for him to
approve. Data shipped with this document: `src/data/bestiary.js`. Guard:
`node tests/bestiary-ladder.mjs` (plain + `--selftest`, registered in
`client-guards`). Siblings: `docs/design/HUNTS_AND_ANALYZER.md`,
`docs/design/HUNT_ANALYZER_UI.md`.

---

## 0. The one-sentence design

**Kill one monster enough times and the game remembers, permanently, in a way
you can see and a tiny way you can feel — and the remembering is DERIVED from
counters the server already keeps, so there is nothing to migrate, nothing to
back-fill and nothing a client can hold ahead of the server.**

This is the hundreds-of-hours layer. It is the reason a player who has finished
every quest still has somewhere to be at 2 a.m., and it is the cheapest such
layer this codebase could possibly build, because the counters have been running
since the bestiary projection shipped.

---

## 1. Two ladders, and why both

This repository already ships `src/data/bestiary-charms.js`: a **class** ladder,
25 / 100 / 500 / 2,000 kills summed across a whole monster class, paying against
that class. It is the *short* ladder — the one a player meets in their first
week, whose rank 1 lifts the hidden-element curtain.

This document adds the **monster** ladder: 2,500 / 5,000 / 10,000 / 20,000 kills
against ONE monster, paying against that monster.

|  | Charms (shipped) | Trophies (this document) |
|---|---|---|
| Counts | a class, summed | one monster |
| Rungs | 25 / 100 / 500 / 2,000 | 2,500 / 5,000 / 10,000 / 20,000 |
| Rank ids | `studied` `marked` `hunter` `banesworn` | `quarry` `stalker` `slayer` `nemesis` |
| Peak drop | ×1.03 vs the class | ×1.03 vs the monster |
| Peak damage | ×1.03 vs the class | ×1.01 vs the monster |
| Claimed? | no — purely derived | the **trophy row** is claimed; the power is not |
| Horizon | first week | first thousand hours |

They are not redundant. The charm answers *"do I know goblinoids?"* and is
reachable by playing the game at all; the trophy answers *"do I know **this**
goblin?"* and is reachable only by choosing to stay. A player with a full charm
set has a reason to pick a spawn; a player chasing a trophy has a reason to pick
the *same* spawn tomorrow. That second reason is the one the game is missing.

The two ladders share no word — `tests/bestiary-ladder.mjs` B7 asserts the id
sets are disjoint — because both badges appear on the same monster card, and a
badge that reads as one thing and keys as another is a bug waiting for a patch
note nobody can write.

---

## 2. The ladder

| stage | id | kills (that monster) | drop | damage | trophy |
|---|---|---|---|---|---|
| 1 | `quarry` | 2,500 | ×1.00 | ×1.00 | yes |
| 2 | `stalker` | 5,000 | ×1.01 | ×1.00 | yes |
| 3 | `slayer` | 10,000 | ×1.02 | ×1.00 | yes |
| 4 | `nemesis` | 20,000 | ×1.03 | **×1.01** | yes |

Thresholds are **absolute and cumulative**, not increments: 20,000 kills holds
all four rungs. Identical for all 108 monsters.

**Stage 1 pays no power, on purpose.** Its reward is the trophy and the
monster's full drop table revealed in the Bestiary — the same ruling the charm
ladder's rank 1 made, for the same reason: a first rung that pays a multiplier
makes the first 2,500 kills of all 108 monsters compulsory rather than chosen,
and "I have to grind everything a bit" is the opposite of the feeling this
ladder is for. Guard B4.

### 2.1 Why the thresholds are uniform across the roster

A tier-6 dragon at 2,500 kills is far more work than a tier-1 slime at 2,500
kills. That asymmetry is the design, not a defect to be scaled away: the dragon
pays far more per kill, so the ladder prices itself in *time at that spawn*
wherever a player stands. Per-tier thresholds would be 108 numbers an author can
get wrong, a second balance surface to re-price every time the tier bands move,
and six sentences for a player to learn instead of one. `bestiary-charms.js` won
this argument for the class ladder; nothing about the monster ladder changes it.

### 2.2 Why the magnitudes are this small

Bane gear is ×1.40 against one class and costs an entire weapon slot. A ladder
that grew past a couple of percent would be a second, free bane — and then the
correct play would be to grind 20,000 of something before engaging with the
gear the game is actually about. A trophy is a **memory of work done**, not a
build.

So the ceilings are stated as invariants of the **formula** — a future
`src/core/trophies.js` clamps against `MAX_TROPHY_DROP_MULT` and
`MAX_TROPHY_DAMAGE_MULT`, exactly as `src/core/bane.js` clamps against
`MAX_BANE_MULT` — and not as a promise the data table keeps. A magnitude that
lives in a data table is a magnitude an author can get wrong; a magnitude that
lives in the formula is not.

### 2.3 The stack, which is the number nobody owns unless someone names it

Both remembered-kills ladders apply to the same monster at the same time, so
what a reviewer has to approve is their **product**, not each ceiling alone:

```
charm drop (≤1.03) × trophy drop (≤1.03) = 1.0609   →  MAX_MEMORY_DROP_MULT = 1.07
charm dmg  (≤1.03) × trophy dmg  (≤1.01) = 1.0403   →  well under MAX_TOTAL_DAMAGE_MULT (1.90)
```

`MAX_MEMORY_DROP_MULT` exists in `src/data/bestiary.js` so that a **third**
ladder cannot be added without moving one visible constant a reviewer will ask
about. Two ladders that each clamp only themselves are two ladders whose product
is nobody's job. Guard B6 owns both halves, including the requirement that
remembered kills stay clear of `MAX_TOTAL_DAMAGE_MULT` — if memory alone ever
approached that clamp, the clamp would start eating a player's weapon triangle
instead of their charms, which is a balance change disguised as a ceiling.

---

## 3. How it reaches the one combat engine

`src/core/combat.js` computes, in one expression:

```js
const damageMult = Math.min(weaponMult * baneMult * elementMult, MAX_TOTAL_DAMAGE_MULT);
```

That expression has exactly two callers — the live tick and the Edge replay —
which is what makes `AWAY-1` parity structural rather than maintained. The
trophy multipliers go **into that one expression and nowhere else**, the same
way `charmDropMultFor` was armed inside `weaknessInfo`:

- **drop** — a factor in `weaknessInfo`'s drop multiplier, beside the charm's.
- **damage** — a factor in `damageMult` above, under the same `Math.min`.

**They are never `getBonus` keys.** The Edge engine does not run the client's
monkey-patched bonus chain, so a trophy expressed as a bonus key would work
awake and read zero while the player slept — which is the precise failure
`bane.js` and `charms.js` both document and both refuse. This is not a style
preference; it is the difference between a bonus that pays an away night and one
that quietly does not.

**The rank is an input to that expression, never a wire field.** The Edge folds
`hr_bestiary_of`'s own rows inside the engine and is the only authority; the
client folds the kill block the server projected, purely so the loot preview and
the live tick predict the same numbers, and every kill it predicts is re-resolved
server-side. There is no request field carrying a stage, so there is none to
forge.

### 3.1 Phasing

`charmDamageMultFor` is still callerless because `maxHit` is an integer and
`Math.floor` rounds ×1.01 away on most loadouts. The trophy ladder has the same
problem and takes the same answer: **arm `drop` first, arm `damage` in the same
change that arms the charm's damage half**, so one review covers one expression
once and the rounding question is answered for both ladders together rather
than twice with different conclusions.

Until then the ×1.01 at `nemesis` is **documented as pending**, not shown to
players as live. A stated effect that does nothing is how `arm-flag-honesty.mjs`
came to exist in this repository.

---

## 4. The claim

### 4.1 The power is derived; the trophy is claimed

This is the split that makes the whole feature cheap and safe:

- **The multiplier is DERIVED on every read** from the kill counters. It is
  never stored. There is no `trophy_stage` column, no residue field, nothing to
  back-fill for existing characters, and nothing a client can hold ahead of the
  server. A player who never opens the Bestiary is never behind.
- **The trophy ROW is claimed** by an explicit act, and that row is what the
  collection, the profile and any future ranking read.

A stored stage would be a second copy of a derivable fact — a thing that can
disagree with the counters — which is the residue-ahead class `CLAUDE.md` §6
names and this codebase has already paid for.

### 4.2 The flow

```
hr_trophy_claim(p_user uuid, p_slot int, p_monster text, p_stage int, p_idem text)
```

1. `SECURITY DEFINER`, `search_path = public, pg_temp`, executable by
   `hr_engine` ONLY — revoked from `public` / `anon` / `authenticated` /
   `service_role`, mirroring `hr_bestiary_of`. There is no direct-client RPC in
   this architecture; a grant to `authenticated` would only open a second,
   unfiltered write path.
2. Validates `p_monster` against the **server's own** monster catalogue and
   `p_stage` against `1..MAX_TROPHY_STAGE`. An unknown id is a refusal, never an
   insert — inventing a monster from a client string is how a capability becomes
   forgeable from a stale save.
3. Reads the kill total **from `player_progress` inside its own transaction**,
   under the advisory lock the spend RPCs already use. **It never reads a kill
   count from the request.** There is no client number anywhere in this path.
4. Refuses below the threshold (`not_yet`), and refuses an already-held trophy
   (`already_owned`) — the `hr_unlock_buy` vocabulary, so the client's refusal
   rendering needs no new case.
5. Writes `player_progress(kind='collection', key='trophy:<id>:<stage>',
   period_key='', value=1, state='claimed')` as a **MAX-merge**, so a replay, a
   double-click and a retried request all converge on the same single row.
6. Journals `player_ledger(kind='quest', intent='trophy_claim', meta={monster,
   stage, kills_at_claim})`. Append-only, per `CLAUDE.md` §1.

### 4.3 A claim mints nothing

No gold, no gems, no items, no XP. This is deliberate and it is what makes the
claim **ranked-safe**: a forged or replayed claim cannot move a value that
crosses into another player's economy, because the claim moves no value at all.
The `CLAUDE.md` §1 Target Property is satisfied by construction rather than by a
clamp, which is a much stronger position than a clamp.

What a claim *is* worth: the trophy on the monster card, the count on the
profile, and a place on a future "trophies claimed" board where the ranked
quantity is **a count of rows the server itself wrote**.

Claiming is also the only *gesture* in the feature, and that matters for feel: a
milestone that lands silently in a projection is a milestone nobody remembers.
The 2,500th kill should be something a player presses a button about.

---

## 5. Anti-abuse

- **Kill counts come only from settled windows.** `ev:kill_monster:<id>` is
  written by `hr_apply` out of the combat delta of a settled window, and by
  nothing else: no other RPC writes that prefix, there is no client counter, and
  `c_max_progress_add` clamps the per-call add. A hunt that is never settled
  contributes zero kills to any ladder.
- **The claim re-reads the counter itself**, in its own transaction, under the
  existing advisory lock. A client-supplied kill count does not exist in the
  signature, so there is nothing to inflate.
- **Idempotent by shape.** MAX-merge on a `(user, slot, kind, key, period_key)`
  primary key means a replay is a no-op, not a second trophy.
- **The derived multiplier cannot be forged** because there is no field carrying
  it — not in the request, not in the residue, not in a column.
- **The key namespace is separate.** `trophy:` is not `ev:`, so a trophy row can
  never be swept up by `hr_bestiary_of`'s `ev:kill_monster:%` LIKE, and a future
  loosening of that LIKE cannot turn a claimable row into an engine counter.
  Guard B8.
- **Key length is proven for every monster at every stage** (B8): the longest
  roster id keeps `trophy:<id>:<stage>` well inside `player_progress`'s 1..64
  CHECK. A key that overflows is a claim that throws in production and nowhere
  else.

---

## 6. The exact table shape — and the prerequisite nobody has noticed yet

**There is no new table.** Two populations in `player_progress`:

```sql
-- EXISTS, written by hr_apply, read by hr_bestiary_of. Unchanged.
player_progress(user_id, slot, kind='stat',       key='ev:kill_monster:<id>', period_key='', value=<kills>)

-- NEW ROWS, same table, written only by hr_trophy_claim.
player_progress(user_id, slot, kind='collection', key='trophy:<id>:<stage>',  period_key='', value=1, state='claimed')
```

Both are `period_key=''` — the permanent, content-bounded population the table's
own reliability notes describe as safe to keep forever and read in full.

### The prerequisite: the envelope cap

`2026-08-20-bestiary.sql` says, in its own header, that `hr_state_of` still
returns bestiary rows through a shared `LIMIT 1000` envelope, that 108 rows do
not breach it, and that the exclusion of both the `ev:kill_monster:%` and the
collection prefixes is a follow-up *gated on the collection log landing, at
which point the two populations together approach the cap*.

**This ladder is what makes that follow-up due.** A long-term character can hold
108 kill rows + up to 432 trophy rows + the collection log's own per-item rows.
That is past 1,000, and the failure mode is not an error: it is
`progress_truncated`, silently, with the rows that fall off the end chosen by an
incidental ORDER BY. A player's quest state or a daily could be the thing that
vanishes.

So: **`hr_state_of` must drop the `ev:kill_monster:%`, `ev:loot:%` and `trophy:%`
prefixes from its generic envelope, in one reviewed change, BEFORE the claim RPC
ships.** Each population already has (or gets) its own projection door —
`hr_bestiary_of` for kills, `hr_trophy_of` for trophies — which is the pattern
`hr_perks_of` established. It is a lane-C change against the highest-risk
`create or replace` in the repository, so it is named here as a hard prerequisite
and not as a follow-up, and `HUNTS_AND_ANALYZER.md` §8 lists the same migration.

---

## 7. The data, as shipped

`src/data/bestiary.js`:

- `TROPHY_STAGES` — the four frozen rungs, one shared array every monster points
  at, so "the ladder" is one identity and a consumer cannot re-price the roster
  it came from.
- `BESTIARY` — **generated**: `buildBestiary(MONSTERS)` runs at module load, so
  a monster added to the roster gets a ladder for free and a monster removed
  loses one. Nothing is hand-typed twice, and the derived table cannot fall
  behind the table it derives from because there is no second list to disagree
  with. Guard B9 rebuilds from a synthetic roster and is the only assertion a
  hand-typed table fails.
- `MAX_TROPHY_DROP_MULT`, `MAX_TROPHY_DAMAGE_MULT`, `MAX_MEMORY_DROP_MULT`,
  `MAX_TROPHY_STAGE`, `TROPHY_LADDER_KILLS`, `TROPHY_STAGE_NAMES`.
- `trophyKey(id, stage)`, `trophyStageAt(kills)`, `nextTrophyAt(kills)` — the
  last of which is what renders "8,120 more to Slayer", the number a player can
  actually act on.

`tests/bestiary-ladder.mjs` — 12 assertions, 12 planted mutations each required
to be caught **by its named assertion**, 2 negative controls (a display rename, a
twelfth monster class) required to stay silent, and a clean-arm floor so a
broken guard cannot pass itself off as a caught defect.

Measured on this branch: **108 monsters × 4 stages**, every bonus inside the
band, both arms green.

---

## 8. Player-facing pitch

Every monster you kill is counted, forever, and at 2,500 kills that monster
becomes your Quarry — then your Stalker, your Slayer, and finally your Nemesis
at 20,000. Each stage is a trophy you claim and a permanent edge against that
one creature: slightly better drops, and at Nemesis, slightly harder hits. It is
the long game — pick the monster you want your name attached to.

---

## 9. What the backend will need (names only)

**Migrations**
- `2026-XX-XX-state-of-prefix-exclusion.sql` — **PREREQUISITE**, §6. Drops
  `ev:kill_monster:%`, `ev:loot:%` and `trophy:%` from the `hr_state_of`
  envelope. Lane C, Security GO, highest-risk `create or replace` in the repo.
- `2026-XX-XX-trophy-claim.sql` — `hr_trophy_claim` + `hr_trophy_of`. Lane C,
  Security GO (it writes a `collection` row and journals).

**RPCs**
- `hr_trophy_claim(p_user, p_slot, p_monster, p_stage, p_idem)` — the claim.
- `hr_trophy_of(p_user, p_slot)` — the projection of claimed trophies, its own
  door beside `hr_bestiary_of`.
- `hr_bestiary_of` — unchanged. `hr_apply` — unchanged.

**Engine**
- `src/core/trophies.js` — NEW, pure, a mirror of `src/core/charms.js`:
  `trophyIndex`, `trophyDropMultFor`, `trophyDamageMultFor`, clamping against
  the ceilings. Dual-runtime, vendored into the edge.
- `src/core/combat.js` — the drop factor inside `weaknessInfo`; the damage
  factor inside the one `damageMult` expression, armed in the same change that
  arms the charm's damage half (§3.1).

**No migration at all** is needed for the counters, the stages or the
multipliers. That half ships the day the engine payload deploys.

---

## 10. Open questions I decided

| Question | Decision | Why |
|---|---|---|
| Replace the class charm ladder, or add to it? | **Add.** Two ladders, disjoint ids. | They answer different questions on different horizons; the short one is the first week, the long one is the first thousand hours. |
| Thresholds scaled by monster tier? | **No — uniform.** | 108 numbers an author can get wrong, a second balance surface, and six sentences instead of one. |
| Is the stage stored? | **Never.** Derived from the counters on every read. | A second copy of a derivable fact is a thing that can disagree, needs a back-fill, and can be held ahead of the server. |
| Then what does the claim do? | Writes the **trophy row** — the collection/ranking half. Power is already on. | A player who never opens the panel is never behind, and the milestone still gets a gesture. |
| Does a claim pay gold or items? | **Nothing.** | A claim that mints nothing cannot cross into another player's economy, whatever a forger does to it. |
| Does stage 1 pay power? | **No** — trophy + revealed drop table. | A paying first rung makes 2,500 kills of everything compulsory. |
| Damage at stage 4: arm now? | **No** — arm with the charm's damage half, one review, one expression. | `Math.floor` rounds ×1.01 away today; a stated effect that does nothing is what `arm-flag-honesty.mjs` exists for. |
| New table for trophies? | **No** — `player_progress` `collection` rows. | Same permanent population, same clamps, same retention, same projection pattern. |
| Key namespace? | **`trophy:`, never `ev:`.** | `ev:` is the engine-counter namespace; a shared prefix puts a claimable row inside a counter sweep. |
| Is the envelope cap a follow-up? | **No — a hard prerequisite.** | 108 + 432 + the collection log breaches `LIMIT 1000`, and the failure is silent truncation of whatever sorts last. |
| Who owns charm × trophy? | **`MAX_MEMORY_DROP_MULT`**, one visible constant. | Two ladders that each clamp only themselves have a product nobody reviews. |
