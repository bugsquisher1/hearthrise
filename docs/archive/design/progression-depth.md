# Progression Depth — what to take from Melvor Idle, and what not to

**Author:** Game Designer. **Date:** 2026-08-14. **Status: PROPOSAL.** Tyler makes
the taste calls; nothing here is decided.

**Scope:** the progression-depth layer only — mastery, the mastery pool, the
completion log. **Quests are owned by another designer and are not touched here**
(`docs/design/quests.md` is theirs). No engine code was written, no balance value
was changed, `src/legacy.js` was not touched.

Everything numeric below was produced by running real code against the real repo
or by playing the real build. Where I quote a number I say how I got it.

---

## 0 · TL;DR — the three verdicts

| Melvor system | Verdict for Hearthrise | Why, in one line |
|---|---|---|
| **Mastery** (per-item level 1–99 on the XP curve) | **REJECT the port. TAKE a reduced form** ("Practice", 3 tiers) | Our action catalogue is 7 trees vs 159 crafting recipes; Melvor's own MXP formula pays crafting **8× per action** at the start and reaches mastery 99 in **7.1 h vs 75.5 h** for the identical achievement. Measured, §2.2. |
| **Mastery Pool** (a meter that is a currency *and* a stat) | **DEFER — best idea of the three, and we have nothing to hang it on** | The tension needs a resource players genuinely want to hoard *and* spend. We have no such resource today. Two candidate carriers named in §3; neither is a 7-day build. |
| **Completion Log** | **TAKE IT. Highest value, lowest cost, and we already own 40% of it** | `src/features/collection-log.js` already tracks 2 of the 5 categories. The other 3 are derivable from state we already keep. First checkpoint lands in minute 4. §4. |

**Round 2 (7 days, everyone at zero) ships exactly one of these: the Completion
Log, plus the single counter that makes its fifth category possible.** Practice
tiers are Phase 2. The Pool is Phase 3 and needs a decision from Tyler first.

---

## 1 · I played it first. Here is what the progression actually feels like.

Booted `index.html` on a local static server as a brand-new account (harness flag
injected into a scratch copy so the account wall would open on localhost; the copy
was deleted afterwards). Build b342-era `main`, clean `localStorage`.

**Minute 0–1.** The daily-reward modal (`.hr-dl-scrim`) is up over the entire
screen on first boot, on top of the 6-step FTUE. My first two clicks on a
gathering tile did nothing at all — the scrim was eating them and `G.activeSkill`
stayed `null`. A brand-new player's first interaction with the game is a click
that silently fails. *(Not mine to fix — flagged to Art Director / QA in §9.)*

**Minute 1–5.** Skills → Woodcutting → Normal Tree. Measured, live: **4 logs and
24 XP in 20.0 s**, i.e. 4,320 XP/hr; the header card read `4,687 xp/hr` (Scholar's
Day +3% was active). Level 2 arrives at ~69 seconds. Level 15 — the first tier
unlock, Oak — is **33 minutes** of unbroken chopping. That is a long time for the
first "something new happened."

Combat: 2 slimes in 25 s at level 1, ~37 Attack XP. The Field Licence gate reads
`0 / 100 kills`, so away combat pays nothing until ~21 minutes of hand-landed
kills. That is Tyler's ruling working as designed, and it means a new player's
first half hour has **exactly two things to look at**: an XP bar and a bag.

**The dead moment, precisely.** Between minute 5 and minute 33 of woodcutting
there is no event of any kind. No drop, no discovery, no unlock, no counter that
moves visibly. `G.stats.chopped` ticks up but nothing surfaces it except a daily
goal. **The problem is not that we have too few numbers. It is that we have too
few *events*.** That framing is what decides all three verdicts below: a system
that adds a second number going up is worthless here; a system that adds events
is exactly what is missing.

**The deeper loop, measured** (`actionRate()` driven over the real
`src/data/gathering.js` + `src/data/recipes.js`, hours to reach each level always
using the best node unlocked at that moment):

```
                L20      L40      L60      L80      L99
woodcutting     1.1 h    7.0 h   39.6 h  214.5 h  1098.1 h
mining          0.7 h    4.5 h   29.7 h  198.7 h  1113.0 h
fishing         1.2 h    7.3 h   32.2 h  196.8 h  1058.7 h
```

That is the OSRS scale the north star asks for, and it is healthy. With
`offlineCapHours = 12`, a 7-day beta budgets at most 84 h of away accrual plus
active time, all of it spent on **one** activity at a time. **A dedicated round-2
player finishes the week around level 50–70 in one or two skills, total level
~250–350, Renown around Squire/Knight** (renown.js's own pacing model predicts
Squire on day 5–7; that agrees).

**That horizon is the single hardest constraint on this whole document.** Any
system whose first meaningful checkpoint lands past ~10 hours of play is invisible
in round 2.

**One aside worth logging while I was in there:** the activity tile prints
`5 XP · 4.6s` while the engine paid **6** XP — `legacy.js:12590` renders
`floor(pacedXp(...))` with no `allXP` term, but `fmtSec(ms)` with the gather-speed
blessing already applied. So the tile shows the duration *with* the blessing and
the XP *without* it. The header (`actionRate()`) gets both right. Handoff in §9.

---

## 2 · Mastery

### 2.1 The XP-curve finding is TRUE. I diffed it rather than trusting it.

`src/core/xp.js` `XP_TABLE` vs Melvor's published closed form
(`xp(L) = ⌊¼ · Σ_{l=1}^{L-1} ⌊l + 300·2^(l/7)⌋⌋`), all 99 levels:

```
levels compared: 99
mismatches:     0
ours   L1..L12 : 0, 83, 174, 276, 388, 512, 650, 801, 969, 1154, 1358, 1584
melvor L1..L12 : 0, 83, 174, 276, 388, 512, 650, 801, 969, 1154, 1358, 1584
ours L99 = 13,034,431   melvor L99 = 13,034,431
```

Two honest footnotes the brief's framing invites:

1. This is the **RuneScape** curve. Melvor uses it because OSRS does; we use it
   for the same reason. "We already match Melvor" and "we already match OSRS" are
   the same statement. That makes the finding *more* robust, not less.
2. The "1→92 equals 92→99" folk fact is very slightly off in the real table:
   **1→92 = 6,517,253** and **92→99 = 6,517,178**, a difference of 75 XP
   (0.001%). Equal for design purposes, not equal for a test assertion.

**So the curve costs nothing.** `levelFromXp` is pure, DOM-free, and already runs
in Node and Deno. That much of the brief holds.

### 2.2 …and the curve was never the expensive part. The catalogue is.

Melvor's MXP formula is driven by **item counts per skill**. Our catalogue,
counted directly (`TREES/ROCKS/FISH_SPOTS/CROPS` + `ARTISAN_RECIPES`):

```
woodcutting   7      cooking    29
mining        8      smithing   99
fishing       8      crafting  159
farming       9      prayer      3     TOTAL 322 non-combat actions
```

I ran Melvor's stated MXP formula over those counts. At the moment a new player
performs their first action of a skill:

```
skill        actions  mxp/action   mxp/hr (our real pace)
woodcutting     7        2.55           1,913
mining          8        2.70           2,025
fishing         8        3.15           2,025
cooking        29        4.68           4,388
smithing       99       13.08          12,263
crafting      159       20.28          19,012
                          ratio crafting : woodcutting = 8.0×
```

Fully simulated to mastery 99 on **one** action, with the acceleration term
included, converted to real hours at our `PACE`:

```
woodcutting / normal_tree   M10 = 4 min   M50 = 1.3 h   M80 = 14.7 h   M99 = 75.5 h
woodcutting / duskwood      M10 = 5 min   M50 = 1.4 h   M80 = 14.7 h   M99 = 75.5 h
cooking     / cook_shrimp   M10 = 1 min   M50 = 32 min  M80 =  6.1 h   M99 = 31.6 h
crafting    / saw_normal    M20 = 1 min   M50 =  7 min  M80 =  1.4 h   M99 =  7.1 h
```

**A "Mastery 99" badge that costs 7.1 hours in Crafting and 75.5 hours in
Woodcutting is not a progression system. It is a leaderboard for whoever read the
formula.** Melvor gets away with this because their skills are far more evenly
sized; our 7-vs-159 spread is 22.7× and it is structural — `gear-tiers.js`
*generates* 154 gear items and their recipes from curves, so the crafting and
smithing lists grow every time we add a material tier while woodcutting does not.
Any per-item mastery formula keyed on list length gets worse as we add content.

### 2.3 Three more reasons the port is wrong for us specifically

- **It rewards standing still.** Mastery pays for repeating one action. Our tier
  ladder (`req` gates at 1/15/30/45/60/75/90) is the progression, and mastery
  would give a player a real reason not to climb it. Melvor solves this with
  per-item mastery bonuses that make low tiers worth revisiting; **we do not have
  that content and writing it is a bigger job than mastery itself.**
- **239 of our 322 actions are gear recipes nobody repeats.** You forge one
  bronze helmet. A 99-level ladder attached to an action performed once is dead
  weight in the data and dead space in the UI.
- **Round 2 cannot see it.** First *meaningful* mastery checkpoint in Melvor is
  the pool's 10% line. On our catalogue that is hours of single-action grinding
  for a bonus a beta player will never notice against a 7-day horizon.

### 2.4 PROPOSAL — take the reduced form instead: **Practice**

Keep what mastery is actually *for* — "the thing I have been doing has become
mine" — and throw away the 99-level ladder.

**Every action gets 3 tiers, not 99.** Progress is measured in **base
action-seconds**: `practice[actionId] += (action.ms / 1000)` on each completion.
`action.ms` is the *data* value, before `PACE.actionMs`, before tools, before any
speed bonus. Thresholds:

| tier | base-seconds | real time on **any** action | name |
|---|---|---|---|
| 1 | 600 | **16 minutes** | Practised |
| 2 | 3,600 | 1.6 hours | Seasoned |
| 3 | 18,000 | 8 hours | Mastered |

Verified by execution — this normalises perfectly across wildly different action
lengths, which is the whole point:

```
normal_tree    (3.0 s base)  →  200 / 1,200 / 6,000 actions  =  0.27 h / 1.60 h / 8.00 h
duskwood_tree (13.0 s base)  →   47 /   277 / 1,385 actions  =  0.27 h / 1.60 h / 8.00 h
shrimp_s       (3.5 s base)  →  172 / 1,029 / 5,143 actions  =  0.27 h / 1.60 h / 8.00 h
cook_shrimp    (2.4 s base)  →  250 / 1,500 / 7,500 actions  =  0.27 h / 1.60 h / 8.00 h
saw_normal     (2.4 s base)  →  250 / 1,500 / 7,500 actions  =  0.27 h / 1.60 h / 8.00 h
```

**Why base-seconds and not elapsed time or raw counts.** Raw counts make a 1.6 s
cook worth 8× a 13 s duskwood chop. Elapsed time makes speed bonuses *slow your
mastery down*, which is perverse. Base-seconds is fair by construction **and it is
the only one of the three that no bonus, tool, blessing or exploit can move**,
because `action.ms` is a constant in `src/data/*`. That is a deliberate
exploit-safety property, not a convenience — see §7.

**First meaningful checkpoint: 16 minutes, on whatever you happened to start
doing.** That is the number that matters for round 2 and it is why this form is
worth taking while the 99-level one is not.

#### The rewards, and why they must not be speed

`src/features/power-budget.js` caps every *throughput* key at 0.20 permanent /
0.30 total, and `getBonus` is a seven-deep wrapper chain whose fuse installs last.
**A per-action bonus that shaved `act.ms` directly would bypass that fuse
entirely** — it never passes through `getBonus`, so nothing clamps it. That is
precisely the "a fuse a later wrapper escapes is worse than no fuse" failure this
repo already learned once. **So: no Practice reward may be a speed or XP
multiplier.** Instead, use the classes the budget deliberately exempts (output
procs, already living in the existing 4%/8% grammar):

| output class | count | T1 Practised | T2 Seasoned | T3 Mastered |
|---|---|---|---|---|
| material output (bars, planks, dishes, ores, logs, fish) | 83 | +4% chance of one extra unit | +8% (replaces T1) | signature drop unlocked |
| gear output (`ITEMS[out].type` set) | 239 | +4% input refund | +8% (replaces T1) | signature drop unlocked |

The material/gear split is not arbitrary — it is `isMaterialOutput()`, the
existing **material-only yield law** (`legacy.js:10811`), which exists precisely
because a yield proc on a Slagheart Platebody prints six figures a session. The
gear half therefore refunds *inputs* (`craftSave` grammar) rather than minting
outputs. Same magnitudes as the Twin Range / Great Bellows / The Lathe already
pay, so the numbers are already play-tested.

**T3 is where the content leverage is.** `signature` is one optional field on an
action row:

```js
// src/data/gathering.js
{ id:'yew_tree', req:60, xp:105, ms:10000, prod:'yew_log', qty:[1,1],
  signature:{ id:'heartwood_shard', ch:0.02 } }
```

That single field is the home the itemization audit has been asking for: the ~25
tier-3–6 combat drops with no recipe, the missing ammo ladder (one `iron_arrows`
for a seven-tier bow), the **zero** items in the `earrings` slot — a doll slot
that currently renders empty with nothing in the game that could ever fill it (I
confirmed it is still rendered on the Combat screen). Signature drops give those
gaps a faucet without inventing a new system, following the `wave3-uniques.js`
precedent exactly: pure data, merged into `ITEMS` / `ARTISAN_RECIPES`, checked by
the existing reachability guard.

**Round-2 fit.** In ~90 h a dedicated beta player reaches T1 on perhaps 15–25
actions, T2 on 5–10, T3 on 3–5. That is 25–40 discrete reward events over the
week, in the exact stretch of play that is currently silent. **This is the fix for
the dead moment in §1.**

---

## 3 · The Mastery Pool

**Verdict: this is the best design of the three, and I am recommending we do not
build it yet.** I want to be explicit about why, because "defer" is easy to read
as "didn't understand it."

The mechanic is genuinely elegant and it is not really about mastery at all: **a
meter that is simultaneously a currency and a stat**, so every spend has a real,
felt cost that is not just opportunity cost. Checkpoints at 10/25/50/95% grant
passives that switch **off** the moment you drop below the line. That converts a
resource from a number into a *decision*, repeatedly, forever. Very few idle games
have anything like it.

**Why it does not ship now:**

1. **It needs a resource players want to hoard *and* spend.** Hearthrise has
   none. Gold is spend-only (a hoard buys you nothing passive). Renown is a
   deliberate one-way high-water ratchet — `renownHigh` exists specifically so a
   player can never be demoted, and making it spendable would break that
   guarantee. Gems are an IAP-adjacent slot currency. There is no third thing.
2. **Attached to Practice it works beautifully — and only after Practice
   exists.** The natural pairing: 25% of practice progress also fills a per-skill
   pool; spend it 1:1 to advance an action you will never grind by hand. Our 159
   crafting recipes make this *more* compelling here than in Melvor, because "I
   will never perform this action 500 times" is literally true for 239 of our 322
   actions. But it is meaningless before there is something to spend it on.
3. **The checkpoint half without the spend half is just a milestone bar**, and we
   are already building one of those (§4). Shipping the weak half first spends the
   idea's novelty for nothing.

### PROPOSAL — the two candidate carriers, for Tyler to choose between later

**(a) Skill Lore (the direct port, Phase 3).** Per-skill pool fed by 25% of
practice base-seconds. Cap = 10% of the skill's total practice-to-full-mastery, so
the 10% checkpoint lands at ~1% of full mastery — a couple of hours, not two
hundred. Spend 1:1 to advance any action in that skill. Checkpoints give
*skill-wide* passives that are explicitly outside the throughput budget (extra
market listing slot for that skill's goods; the skill's signature drops apply to
every action, not just T3 ones; +1 auto-action queue slot).

**(b) The Larder (the one that also fixes a dead perk).** The Cellar's
"+500 storage" perk currently feeds nothing — `storage` is on the power budget's
own list of *"ghost keys with no reader"*. Make the homestead larder a real meter:
above 25% / 50% / 95% full you get gathering-side passives; crafting spends it
down. That produces exactly Melvor's oscillation (fill → spend on a gear tier →
refill) and it retires a perk that has been lying to players since it shipped.
**Risk, stated plainly: it can be read as "crafting is punished", which starves
the artisan skills.** The mitigation — checkpoints pay *gathering* bonuses only,
so hoarding helps you gather and spending buys gear — is a real design, but it
needs storage *enforcement*, which does not exist and which makes players angry
the first time it eats an item. Not a 7-day build, and arguably not a 30-day one.

**Recommendation: build neither for round 2. Revisit (a) once Practice has shipped
and we can watch real players hit T2.**

---

## 4 · The Completion Log — TAKE IT, and build it on what exists

This is the one. It is cheap, it is retention, and **most of it is already
written**.

### 4.1 What `src/features/collection-log.js` already does — read, not assumed

- Tracks **2** categories, with **zero new bookkeeping**: monsters via
  `G.bestiary{id:{kills,firstKill}}`, items via `G.collection{id:count}`.
- Renders a `???` grid, a completion %, a per-monster drop-table drill-down, a
  per-item "where it drops" panel, and a first-discovery toast wired by wrapping
  `addItem` and `killMonster`.
- Counts live: **426 items, 31 monsters.** A fresh account reads 0% and shows a
  wall of 30 grey `???` monsters — which is genuinely good pull.
- Feeds Renown already: `W.collection = 3` per entry.

### 4.2 The four things wrong with it today

1. **Its reward curve ends at 23% completion.** The milestones are
   `hunter10` (10 monsters), `collect50`, `collect100`, `hunterAll` (all 31
   monsters). After item #100 of 426 there is **nothing left to claim** until you
   have killed all 31 monster types. For a completionist system, the rewards stop
   before a quarter of the way in.
2. **Renown counts items but not monsters.** `computeRenown` reads `G.collection`
   for the `collection` term; the bestiary contributes only through `kill` /
   `bossKill`. Discovering your 31st monster type is worth the same 0.05 renown as
   your 4,000th slime.
3. **Three of Melvor's five categories are missing**, and all three are already in
   `G`: pets (`G.companions.ownedIds`, 22 defined), skills at 99 (derivable from
   `G.skills`, 15 skills), and per-action completion (nothing tracks it — this is
   the one new counter).
4. **178 untyped materials all land in one "Materials" block** (`catOf()` falls
   back to `it.slot || … 'Materials'`), so a third of the log is an
   undifferentiated wall. *(Presentation — Art Director's call, §9.)*

### 4.3 PROPOSAL — five categories, and the fifth is where mastery goes

| # | Category | Total | Source | New work |
|---|---|---|---|---|
| 1 | Items found | 426 | `G.collection` | none |
| 2 | Beasts slain | 31 | `G.bestiary` | none |
| 3 | **Companions** | 22 | `G.companions.ownedIds` | ~15 lines in collection-log.js |
| 4 | **Skills mastered (99)** | 15 | derived from `G.skills` | ~10 lines, pure derivation |
| 5 | **Crafts practised** | 322 | **`G.practice` (new)** | one counter, two call sites |

**Category 5 is the reduced form of mastery, reduced all the way to one bit.**
Not "what is this action's mastery level" but **"have you ever performed this
action?"** That single bit turns 159 crafting recipes and 99 smithing recipes from
a scroll-blur into a checklist, costs no curve, no balance pass and no second XP
table — and when Practice tiers land in Phase 2, the same `G.practice[actionId]`
number that answers "ever?" also answers "how much?" with no migration.

**Total surface: 816 entries across five categories.**

### 4.4 The milestone ladder — PROPOSAL, and where it lands in week one

Replace the four-milestone list with a per-category ladder at 10 / 25 / 50 / 75 /
100 %, plus an overall ladder. Rewards escalate from gold → gems → a title →
cosmetic → the capstone.

Projected against the round-2 horizon measured in §1:

| Milestone | When a real round-2 player hits it |
|---|---|
| Crafts 10% (32 actions) | **~minute 4** — a new player performs ~8 distinct actions in their first ten minutes just by exploring the Skills tab |
| Beasts 10% (4 monsters) | ~minute 15 (tier 1 has 5 monsters) |
| Items 10% (43) | day 1 |
| Companions 10% (3) | day 2–4 — skill pets roll 1-in-2,500 XP events, ≈3.2 h per attempt-block, so a focused player expects 1–2 across the week |
| Crafts 25% (81) | day 2–3 |
| Items 25% (107) | day 3–5 |
| Beasts 50% (16) | day 4–6 |
| Overall 25% | end of week for the top players — **the natural round-2 finish line** |
| Skills 10% (2 at 99) | not in round 2, and correctly so |

**That is the property round 2 needs: a checkpoint in minute 4, one every day
after, and a visible ceiling nobody reaches in a week.**

Also proposed: give the bestiary a Renown term of its own (`collectionBeast`,
weight 3, matching items) so category 2 pays like category 1. That is a one-row
edit to `W` in `renown.js` and — importantly — weights may only ever go **down**
or be **added**, never up on an existing term, because `min` thresholds are
compared against the `renownHigh` ratchet. Adding a term strictly increases every
player's score, which is the safe direction. (`renown.js` reasons this out at
length; I am following its rule, not inventing one.)

**Excluded from the denominator, deliberately** — Melvor's own good habit: event
items, the reward cosmetics themselves, dev/debug items, and `hearth_token` /
`muster_seal` (the two currencies the smoke suite already guards against being
minted). An excluded set must be a **data list** with an `exclude:true` flag on
the item, not a hardcoded array in the log module, or the first content drop
silently makes 100% unreachable.

---

## 5 · Server authority — I checked the claim rather than assuming it

The brief asked me to verify that "mastery XP is derived from actions the server
already computes." **That claim is currently FALSE, and the way it is false
matters.**

### 5.1 What I found by reading the engine

`supabase/functions/hr-accrue/accrual.js`, first branch of `computeAccrual`:

```js
// ── (0) The activity pointer. Combat only in Phase C. ────────────────────
if (inp.activeKind !== 'combat' || !inp.activeId) {
  return { accrued: false, reason: inp.activeKind && inp.activeKind !== 'idle'
    ? SKIP.UNSUPPORTED : SKIP.NO_ACTIVITY };
}
```

**The server accrual engine computes combat and nothing else.** Gathering and
artisan accrual are named in that comment as "the next slices" and have not
shipped. And live (non-away) actions are not intents at all — `doSkillAction` and
`doArtisanAction` run entirely client-side, exactly as live combat does (the
handoff says the Field Licence gate "becomes real when live combat is an intent").

**Therefore: today there is no server-computed count of any of the 322 non-combat
actions.** Every Practice or completion count would be client-authored. Saying
"mastery rides the actions the server already computes" would have been a
comfortable assumption and it would have been wrong.

### 5.2 What that means for each phase — stated so nothing ships on a false premise

**Round 2 (this weekend).** `localStorage['hr:serverAccrual']` is absent for every
player and only the literal `'on'` enables it, so round 2 runs the **current
client economy**, and the beta is wiped at cutover. A client-authored
`G.practice` / completion log therefore costs nothing and risks nothing. It
persists automatically — the snapshot is a **denylist**, so a new `G.practice`
field syncs to cloud by default and **must not** be added to `NO_SYNC`.

**At cutover.** Practice and completion counts are a **pure function of the action
count the server must already compute in order to grant the XP**. They add **zero
new trust surface** — no new client-supplied number crosses to another player. But
they cannot ship before the gathering/artisan accrual slices exist, because
before that the server does not know an action happened at all.

**Nothing in this proposal requires trusting a client-reported number** — provided
the counter is derived server-side from the same action resolution that grants XP,
never sent up as a delta the client chose. If anyone implements it by having the
client POST `{practice:{normal_tree:+1}}`, that is a mintable progression value
and it **cannot ship at cutover**. Flagging that loudly, because it is the obvious
shortcut and it is wrong.

**Client is allowed to compute, for display only:** the tier a Practice number
falls into, the completion percentages, the "n more to Practised" hint, and which
milestone is claimable. All of those are pure functions of server-returned state.
**Claiming** a milestone reward must not be — see 5.4.

### 5.3 The storage question, and the concrete limit it hits

Good news first: `player_progress` already has the right shape, and one of its
`kind` values is **designed and unused**.

```sql
kind text not null check (kind in ('quest','daily','bounty','stat','collection','flag'))
key  text not null check (length(key) between 1 and 64)
value bigint not null default 0
```

`kind = 'collection'` exists in both the table and `hr_apply`'s allowlist and
**nothing writes it** (grepped `supabase/**` and `src/**`). The completion log is
the feature that channel was built for.

**But the naive mapping breaks a limit that is already in the schema.**
`hr_state_of` reads progress with `limit 1000` and reports `progress_truncated`
above it, and the comment justifying that limit says permanent rows are *"bounded
by content (a few hundred rows per character at most)"*. Count what a completionist
character would actually hold under a one-row-per-thing mapping:

```
practice (one per action)          322
collection: items                  426
collection: monsters                31
companions                          22
quests / flags / lifetime stats     ~25
periodic dailies in the 31-day read window   ~186
                                   ─────
                                   ~1,012   →  OVER the 1,000 limit
```

**A full collection log plus practice silently trips `progress_truncated` on day
one, and it gets worse with every recipe we add.** This is exactly the cost a
design proposal usually understates, so I am putting the number in the document.

Options, honestly compared:

| option | cost | verdict |
|---|---|---|
| One row per thing in `player_progress` | zero migration | **Rejected — trips the limit as computed above** |
| Dedicated `player_practice(user_id, slot, skill_id, action_id, value)` + `player_discovery(...)`, read on demand rather than in `hr_state_of` | one migration, one RPC, one delta kind, RLS + grants | **Recommended.** Keeps `hr_state_of` bounded; these are browse-time reads, not session-start reads |
| Pack into a bitmap | `value` is `bigint` and there is no text value column | Not available without a schema change anyway |
| Raise the limit to 2,000 | one line | **Do not.** It moves the cliff, it does not remove it, and it doubles a read that runs on every session start |

### 5.4 Two authority notes on the reward side

- **Milestone claims must go through the existing `progress_claim` path**, which
  is the *only* route to `state='claimed'` and requires the row to already be
  `'done'`, with `row_count <> 1` treated as a rejection. That is a double-claim
  guard we already own; do not build a second one.
- **Gold and gem rewards from the log are `gold_in` faucets** and land under the
  25M/character/day ledger-derived budget. The proposed ladder pays a few hundred
  thousand gold across the entire 816-entry log, so it is nowhere near the
  ceiling — but it must be journalled like every other faucet.

---

## 6 · Data shape, in our idiom — and the honest cost

Per the systems map, the test is: how much of this is a row in `src/data/*`
consumed by an existing engine, and how much is genuinely new code?

### 6.1 What is pure data (grow by adding data, not code)

**Practice tiers** — one new table, tiny:

```js
// src/data/practice.js   (PROPOSED — new file, ~40 lines of data)
export const PRACTICE_TIERS = [
  { id:'practised', baseSec:600,   label:'Practised' },
  { id:'seasoned',  baseSec:3600,  label:'Seasoned'  },
  { id:'mastered',  baseSec:18000, label:'Mastered'  },
];
// Which exempt proc key each output class uses. A new output class = a row.
export const PRACTICE_REWARD = {
  material: { practised:{ yield:0.04 }, seasoned:{ yield:0.08 } },
  gear:     { practised:{ craftSave:0.04 }, seasoned:{ craftSave:0.08 } },
};
```

**Signature drops** — one optional field on rows that already exist, in
`gathering.js` / `recipes.js`. No new file, no new engine, and the existing
`b243: PROGRESSION IS REACHABLE` guard already validates that the item id is real
and obtainable.

**Log categories + milestones** — a data table replacing the inline `MILESTONES`
array in `collection-log.js`, plus an `exclude:true` flag on items that must not
count toward 100%.

**Farming needs its own row and I nearly missed it.** `PACE_EXEMPT_SKILLS`
excludes farming because growth is wall-clock, and a turnip's `ms` is 4 *hours* —
14,400 base-seconds, which would clear tier 1 **on the first harvest**. Farming's
9 crops must use a **count** threshold (proposed 10 / 50 / 250 harvests), declared
as a per-skill override row rather than a special case in code.

### 6.2 What is genuinely engine work — sized honestly

| # | Work | Where | Size |
|---|---|---|---|
| 1 | `G.practice[actionId] += act.ms/1000` at the two choke points | `doSkillAction` and `doArtisanAction` in **`legacy.js`** | **2 lines, but in the file nobody can parallelise on.** Both are single choke points (verified), so it is genuinely 2 lines — the cost is scheduling, not code |
| 2 | Farming's harvest counter | `legacy.js` harvest path | 1 line |
| 3 | Save-migration bump for `G.practice` | `src/save-migrations.js` | small, established pattern |
| 4 | Read Practice tiers into the proc rolls | `src/core/artisan.js`, `src/core/progression.js` | **Real work.** Both `resolveArtisanAction` and `resolveGatherAction` are pure and take an explicit ctx — a `practice` field joins `toolCarry`. ~half a day, must stay DOM-free and deterministic or the core-purity guard fails |
| 5 | Signature-drop roll | same two resolvers | small; reuse the existing yield-roll seam and the seeded RNG |
| 6 | 3 new log categories + the milestone ladder | `src/features/collection-log.js` | ~150 lines, additive, its own file |
| 7 | Renown: `collectionBeast` term | `src/features/renown.js` | 2 rows (`W`, `W_LABEL`) + the count |
| 8 | Practice/completion UI | new panel | **Art Director's, not mine.** Do not let this land as another `???` grid without a pass |
| 9 | **Cutover only:** `player_practice` / `player_discovery` tables, RPC, delta kind, RLS, grants, guard | `supabase/migrations/**` | **1–2 days of Systems + Security work.** Not a row. Blocked behind the gathering/artisan accrual slices |

**Tests required in the same commits** (project rule, no exceptions):

- Practice thresholds normalise: assert the same real-hours-to-tier for the
  longest and shortest action in the catalogue. Mutation-prove it by switching the
  metric to raw counts and watching it go red.
- A speed bonus, a tool and a blessing do **not** move a Practice threshold
  (the exploit guard — §7).
- `G.practice` survives a snapshot round trip and is **absent from `NO_SYNC`**.
- The five log categories sum correctly and the excluded set is honoured; 100% is
  reachable given a fully-populated fixture.
- Farming's override fires (a single turnip harvest must **not** clear tier 1).
- A milestone can be claimed exactly once.

**My honest overall estimate: the Completion Log alone is ~1 day and is round-2
safe. Practice tiers plus signature drops are ~3–4 days including tests and are
not round-2 safe** — item 4 touches the two pure resolvers that both the live tick
and the server accrual call, and that is not a thing to rush the week of a beta.

---

## 7 · Balance and exploit review

- **No existing balance value is changed by this document.** `PACE`, `XP_TABLE`,
  every `xp`/`ms`/`req`, and every drop chance are untouched.
- **Practice thresholds cannot be inflated.** They key on `action.ms` — a
  constant in `src/data/*` — not on elapsed time and not on action count. No
  speed perk, tool, blessing, world event, clan feast or muster aura can move
  them. `MIN_ACTION_MS = 500` and `SPEED_FUSE = 0.70` are irrelevant to the
  metric, by design.
- **No Practice reward is a governed throughput key.** All of them live in the
  classes `power-budget.js` deliberately exempts (output procs in the existing
  4%/8% grammar; `craftSave`). **A per-action `ms` reduction would have bypassed
  the budget's fuse entirely and must not be implemented** — recorded here because
  it is the obvious first idea and it is the exact failure this repo already paid
  for once.
- **Gear output cannot be duplicated.** T1/T2 on the 239 gear-output actions
  refunds *inputs*; it never mints an extra typed item. That respects the
  material-only yield law (`isMaterialOutput`), which exists because a yield proc
  on high-`v` gear is the largest gold faucet in the game.
- **Signature drops are `bop` by default** unless a specific one is deliberately
  made tradeable. A new rare with a market price attached is an economy change,
  not a progression change, and should be judged separately.
- **No pay-to-win surface.** Nothing here is purchasable, accelerable with gems,
  or touched by the Hearth Token. Practice comes only from doing the action.
- **No new mint of `hearth_token` or `muster_seal`** — the currency-leak guards
  already assert this and signature drops must be added inside them.
- **Renown weights move only in the safe direction** (a new additive term), so no
  player can be demoted. That constraint comes from `renown.js` itself.
- **The one economy interaction worth watching:** T2's +8% material yield applies
  to gathering nodes, which are the source of every craft input. Across a fully
  T2'd account that is a real supply increase. It is bounded (+8%, per-action,
  8 h of that specific action to earn) and it is smaller than the tool ladder
  already in the game — but **Systems should model it against the market before
  Phase 2 ships**, not after. Raised in `CONFLICTS.md` terms in §9.

---

## 8 · Known limitations of this proposal

1. **The `hr_state_of` 1,000-row analysis assumes the current schema.** If
   Systems raises the limit or repartitions the table, my recommendation in §5.3
   changes. Re-derive it rather than trusting the number here.
2. **The 90 h round-2 activity budget is a model, not a measurement.** It comes
   from `offlineCapHours = 12` × 7 days plus assumed active play. Real round-2
   telemetry will beat it and should be used to retune the Practice thresholds
   before Phase 2.
3. **My Melvor MXP figures reproduce the wiki's stated formula against our data.**
   They are a faithful application of a published formula, not a measurement of
   Melvor. The *relative* conclusion (an 8× per-action spread across our
   catalogue, driven purely by list length) is robust to formula details; the
   absolute hours are not.
4. **I did not evaluate the presentation.** A five-category log is more surface,
   and the existing one already dumps 178 materials into a single block. If it
   reads badly the mechanic is worth nothing — that is an Art Director dependency,
   not a nice-to-have.
5. **Companion drop rates are newly trustworthy but still unmodelled at scale.**
   The double-proc bug was fixed today. My day 2–4 estimate for the first pet is
   arithmetic on a 1-in-2,500 roll, not observed data.
6. **`rollProc` still exists in two copies** (`legacy.js:12870` and
   `features/companions.js:200`), one on `rng()` and one on `Math.random()`.
   Category 3 of the log makes companions more visible; if both copies can load,
   procs fire twice and the log will make that obvious to players. Systems'
   call, flagged not chased.

**One backlog item I can close:** `stats.deaths` **does** increment now —
`src/core/combat-sim.js:165`, with the `AWAY-7` regression asserting both a live
and an away death. My standing note that it never increments is stale.

---

## 9 · Handoffs

**→ Art Director** (mechanic reads badly / needs a pass, not a redesign from me):
- The daily-reward scrim covers the whole screen on first boot and swallows the
  new player's first clicks. Reproduced twice from a clean `localStorage`.
- The Items tab of the collection log puts 178 untyped materials in one
  undifferentiated "Materials" block (`catOf()` fallback).
- A five-category log needs a real information design. It is the retention pillar
  and it currently ships as a `???` grid.

**→ Systems Engineer:**
- `legacy.js:12590` — the activity tile prints XP **without** the `allXP` term but
  duration **with** the speed blessing applied. Measured: tile says `5 XP · 4.6s`,
  engine paid `6`. The header's `actionRate()` is correct; the tile is not. Small
  honesty bug on the most-looked-at number in the game.
- §6.2 items 1–5 and 9 are yours; item 4 touches `src/core/artisan.js` and
  `src/core/progression.js`, which both the live tick and the server accrual call.
- §5.3: `player_progress` cannot hold the completion log one-row-per-thing.
  Recommendation and arithmetic are there.
- §7 final bullet: model T2's +8% material yield against the market before Phase 2.

**→ Quest designer (FYI, no dependency):** category 5 of the log ("have you ever
performed this action") is a natural quest target and a natural quest *reward*
surface. I have deliberately not designed anything that requires a quest, so our
two tracks do not block each other.

---

## 10 · Recommendation, in one page

**Ship for round 2 (7 days):**
1. The Completion Log, five categories, built as an extension of
   `src/features/collection-log.js`.
2. `G.practice[actionId]` — one counter, two call sites — which is what makes
   category 5 possible and what Phase 2 is built on.
3. The per-category milestone ladder (10/25/50/75/100%), plus a bestiary Renown
   term.

First checkpoint: **~minute 4.** A checkpoint every day of the week after that. A
ceiling nobody touches. That is what a 7-day wipe beta needs and it is a ~1-day
build on code we already own.

**Phase 2 (post-beta, ~3–4 days):** Practice tiers — Practised / Seasoned /
Mastered at 600 / 3,600 / 18,000 base-seconds, rewards drawn only from the
power-budget-exempt classes, T3 unlocking signature drops that give the ammo
ladder, the empty `earrings` slot and the orphan tier-3–6 drops a home.

**Phase 3 (post-cutover, needs a Tyler decision first):** the Pool, attached to
Practice as Skill Lore, or to the homestead larder as the Larder — the second of
which also retires the Cellar's fictional `+500 storage` perk.

**Do not build:** Melvor's per-item 1–99 mastery. Our catalogue makes the same
badge cost 7 hours in one skill and 75 in another, and every material tier we add
makes that worse.
