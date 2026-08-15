# SPEC — Quests: one board, a generator, and a Charter for hour one

**Owner:** Game Designer · **Date:** 2026-08-15 · **Status:** design, not built.
**For:** the 7-day round-2 closed beta, which opens *after* the server-authority
cutover wipe. On day one, 100% of the population is a brand-new character.

**Binding documents this sits inside, none of which it amends:**
[`away-time-ruling.md`](./away-time-ruling.md) · [`pacing-overhaul.md`](./pacing-overhaul.md) ·
[`away-combat-licence.md`](./away-combat-licence.md) (the working precedent — the Field
Licence already ships *as a quest*) · `CLAUDE.md` → *Server authority (locked 2026-08-10)* ·
[`docs/SYSTEMS_MAP.md`](../SYSTEMS_MAP.md) → *grow by adding data, not code*.

**Groundwork:** Tyler pointed at Idle Clans' quest system as foundational — explicitly
*not* as the best design, but as a structure worth taking from. The parts taken are named
in §4.0. The parts deliberately **not** taken are named in §4.9, each with a reason.

Everything below marked **PROPOSAL** is a taste call. Everything marked **MEASURED** is
something I did in the running build on 2026-08-15 and can reproduce.

---

## 0 · The one-line spec

**One Quest Board with three lanes — a hand-authored *Charter* you complete once, a
*Daily* lane and a *Weekly* lane whose contents are GENERATED server-side from four
parts (skill · band · amount · reward) — replacing the four overlapping objective
systems the game ships today. Every objective is a threshold on a counter the server
already owns, and no quest lane may mint gems.**

---

## 1 · What I played, and what it measured

Booted the real `index.html` on a clean profile, past the account wall the way
`tests/run-smoke.mjs` does, and played a fresh character.

### 1.1 The fresh character

`gold 500 · hp 10/10 · bronze_sword equipped · inventory {shrimp:8, turnip_seed:5,
carrot_seed:3} · foodSlot null · no traits · every skill level 1`.

`shrimp` is **Raw** Shrimp (`heals:3`). `cooked_shrimp` **heals 8** — 80% of the health
bar. The starting kit is eight items of food the player cannot use well and is never
told to cook.

### 1.2 Combat, as a new player meets it — MEASURED

| run | what I did | result |
|---|---|---|
| A | `startCombat('slime')`, touch nothing | **7 kills · 79 s · dead** |
| B | same, second character | **5 kills · 53 s · dead** |
| C | cooked the 8 starting shrimp first, ate by hand at ≤5 HP | **27 kills · 324 s · Attack 5 · ~700 g** |

**Cooking your starting food is a 4× multiplier on your first combat session, and
nothing in the game says so.** That single fact is the spine of the Charter in §7.

`stats.deaths` **does** increment now (read 1 after run A) — my standing backlog item
"`deaths` never increments" is **closed by measurement**.

The death itself, in full: one line in the combat log (`💀 You died! Respawning…`), one
toast, `stopCombat()`, and the arena resets to *"Choose a foe — Pick a monster from the
list to begin."* No cause, no elapsed time, no food prompt, no re-engage. **The most
teachable moment in the first ten minutes currently teaches nothing.**

### 1.3 Skilling, as a new player meets it — MEASURED

60-second samples, level 1, no tools, no bonuses (`PACE.xp 0.39`, `PACE.actionMs 1.60`):

| activity | actions / min | ≈ actions / hr | ≈ XP / hr |
|---|---|---|---|
| Woodcutting · Normal Tree | 13 | 780 | 4,560 |
| Mining · Copper Rock | 13 | 780 | 6,390 |
| Fishing · Shrimp | 11 | 660 | 2,830 |
| Cooking · Shrimp | 15 attempts → **12 cooked, 3 burnt** | 720 | 5,060 |

So the early loop's real exchange rate is: **~90 seconds of fishing + cooking buys ~5.5
minutes of combat.** That ratio is good design and it is currently invisible.

### 1.4 The objective systems, as a new player meets them — MEASURED

On the Home screen, minute one, a new character is shown *Kill 25 monsters · Gather 50
resources · Cook 12 items*. Behind the Quests button, the same character is shown *Plant
5 crops · Slay 30 monsters · Gain a skill level*. The Home screen's "All quests →" leads
to a third list (*Gather 15 resources · Cook 5 dishes · Defeat 5 monsters · Harvest 10
crops · Field Licence*). The Bounty Board offers *cull 83 Slimes · cull 109 Weak
Skeletons*. Achievements holds 29 more.

**Six live kill-objectives at once — 5, 25, 30, 83, 100 and 109 — all fed by the same
click.** That is not a rich goal structure; it is six progress bars wearing the same hat.

And the two halves are not the same difficulty:

- *Gather 15 resources* — **done in 75 s**.
- *Cook 5 dishes* — **done in 25 s**.
- *Cook 12 items*, worth **400 gold** — **done in 60 s**.
- *Kill 25 monsters* — four deaths and a food detour, ~20 minutes.

Objective payouts alone handed me **+750 gold in the first four minutes** against a
500-gold starting purse. The skilling objectives are free money; the combat objective is
the whole first session. They sit side by side with comparable rewards.

### 1.5 The one that has to be said out loud

`DAILY_REWARDS` pays **1 gem** for two of the nine dailies, and `WEEKLY_GOAL_POOL` pays
**2–5 gems** on five of eleven weeklies. Gems are a **real-money currency** —
`gems_starter` is 250 gems for $4.99, `gems_legend` is 5,800 for $49.99 — and they are
what hero slots cost (200 / 500 / 900 / 1,500).

**Today's quest system mints an IAP currency.** At ~0.94 gems/day expected that is small.
Under a *generated, rerollable, repeatable* system it would not stay small, and it is the
exact surface the Season Pass was removed for. §5.4 makes the rule explicit.

---

## 2 · What exists today, honestly

| # | system | catalogue | state | how progress moves | reward | where it is shown |
|---|---|---|---|---|---|---|
| 1 | **Onboarding quests** | `QUEST_DEFS` (5) | `G.quests` | `updateQuest(type)` events + one `mirror` | authored gold/item/combatXp, **auto-granted** | Home "Next up" / "All quests →" |
| 2 | **Daily tasks** | `DAILY_TASK_POOL` (3 of 8) | `G.daily.tasks` | `updateDaily(type)` events | flat gold, **auto-granted** | Home "Next up" |
| 3 | **Daily goals** | `DAILY_GOAL_POOL` (3 of 9) | `G.dailyGoals` | `readSource(path)` **delta from a baseline** | `DAILY_REWARDS`, **manual claim** | Quests modal → Daily |
| 4 | **Weekly goals** | `WEEKLY_GOAL_POOL` (3 of 11) | `G.weeklyGoals` | `readSource` delta | inline `reward`, **manual claim** | Quests modal → Weekly |
| 5 | **Bounties** | `src/core/bounty.js` (seeded, 3 slots) | `G.bountyHunter` | per-kill hooks | gold + **Marks** + Bounty Hunter XP | Bounty tab |
| 6 | **Achievements** | `ACHIEVEMENTS` (29) | `G.achievements` | `readPath` lifetime thresholds | — | Achievements panel |

Two of these are called "quests" and neither is the one in `G.quests`. Three different
progress mechanics. Three different reward mechanics. Four screens.

**The good news, and it is genuinely good:** systems 3 and 4 already use the *right*
mechanic — a **threshold on a counter, measured as a delta from a baseline**. That is the
only objective shape a server can verify without trusting the client, and it is already
half the design. `updateDaily`/`updateQuest` event counting (systems 1 and 2) is the shape
that cannot survive cutover, because an event is a client assertion.

**Farmer's Deeds is NOT an objective system** and is not in this table. `farm_deed` is a
drop-based plot-upgrade currency (`src/features/farm-progression.js`) with no goal, no
progress bar and no claim. It overlaps nothing here and is untouched by this spec.

---

## 3 · The data shape

Three files. Two are data; one is a pure core module shared by client and server, exactly
mirroring how `src/core/bounty.js` and `src/data/monsters.js` already split.

```
src/data/quests.js     the archetypes, the bands, the pool weights, the Charter,
                       the lane config.                              ~200 lines of DATA
src/core/quests.js     band selection, graduation, the seeded draw, the amount clamp,
                       the reward formula, the key grammar, the completion predicate.
                       PURE ESM — no DOM, no window, no Math.random.  ~250 lines
src/features/quest-board.js   one renderer for three lanes.
```

### 3.1 The quest instance — it lands in a table that already exists

The single most important structural finding in this whole document:

```sql
-- supabase/migrations/2026-08-11-player-state.sql :310
create table public.player_progress (
  user_id, slot,
  kind       text check (kind in ('quest','daily','bounty','stat','collection','flag')),
  key        text check (length(key) between 1 and 64),
  value      bigint,
  period_key text check (length(period_key) <= 16),
  state      text check (state in ('active','done','claimed')),
  primary key (user_id, slot, kind, key, period_key)
);
```

`kind` already has `'quest'` and `'daily'`. `period_key` already exists for periodic
rows and is already pruned. `state` already has the three-step `active → done → claimed`
lifecycle, and `hr_apply` already has a `progress_claim` op that is **the only route to
`'claimed'` and requires the row to already be `'done'`.**

> **This quest system needs ZERO schema migrations.** The table was designed for it.
> Every quest, its progress, its baseline and its lane's reroll budget are rows in
> `player_progress`.

### 3.2 The key grammar — the amount lives in the key

```
<lane>:<archetype>:<subject>:<band>:<amount>
```

| part | values |
|---|---|
| `lane` | `d` daily · `w` weekly · `c` charter |
| `archetype` | `gather` `refine` `harvest` `cull` `hunt` `slay` `tribute` `earn` `study` |
| `subject` | a skill id, a monster family, a tier, an item id, or `-` |
| `band` | `1`–`4` (charter always `0`) |
| `amount` | integer |

Examples — `d:gather:woodcutting:1:140` (24 chars), `w:hunt:undead:2:280`,
`d:tribute:venom_sac:3:14`, `c:cull:-:0:25`. Longest realistic key is ~34 chars against
a 64-char column.

Putting the amount **in the key** means the offer needs no extra storage, `done` is
`value >= parseAmount(key)`, and every ledger row is self-describing for forensics. It
also makes a reroll a **different key**, which is what lets the reroll op be a delete +
insert with no ambiguity.

### 3.3 The rows a single quest occupies

| row | kind | key | period_key | value | state |
|---|---|---|---|---|---|
| the offer | `daily` | `d:gather:woodcutting:1:140` | `20260815` | progress | active/done/claimed |
| its baseline | `flag` | `qb:d:gather:woodcutting:1:140` | `20260815` | counter value at issue | — |
| the lane's reroll budget | `flag` | `qr:d` | `20260815` | rerolls used | — |

Three row kinds, all already legal. **Bounded:** 6 dailies + 3 weeklies = 9 offers → at
most ~20 periodic rows per character per period, well inside the existing prune window.

### 3.4 The catalogue row (`src/data/quests.js`)

An **archetype** — what a quest can ask for. There are nine; there is no per-quest row.

```js
export const QUEST_ARCHETYPES = {
  gather:  { counter:'act:{skill}',    subjects:'skills:gather',   w:3,
             daily:[70,180],  weekly:[400,1000], targetMin:{d:18, w:90} },
  refine:  { counter:'act:{skill}',    subjects:'skills:artisan',  w:2,
             daily:[50,140],  weekly:[300,800],  targetMin:{d:18, w:90} },
  harvest: { counter:'crops',          subjects:'-',               w:1,
             perPlot:[1.5,4], weeklyPerPlot:[9,22] },
  cull:    { counter:'kills',          subjects:'-',               w:3,
             daily:[40,110],  weekly:[240,600] },
  hunt:    { counter:'kills:f{family}',subjects:'families',        w:2,
             daily:[25,70],   weekly:[150,380] },
  slay:    { counter:'kills:t{tier}',  subjects:'tiers',           w:2,
             daily:[20,60],   weekly:[120,320] },
  tribute: { counter:'deliver:{item}', subjects:'orphanDrops',     w:1, consumes:true,
             daily:[6,18],    weekly:[35,90] },
  earn:    { counter:'gold_in',        subjects:'-',               w:1, scale:'income' },
  study:   { counter:'xp:{skill}',     subjects:'skills:all',      w:1, scale:'hours' },
};
```

| field | who consumes it |
|---|---|
| `counter` | **`hr_quest_sync`** (new, §9.3) — the `stat` progress key the objective reads. `{skill}`/`{family}`/`{tier}`/`{item}` are substituted from `subject`. |
| `subjects` | **`src/core/quests.js` `subjectPool()`** — resolved against the SERVER catalogues (`hr_activities`, `hr_skills`, `hr_crops`, monster families). Never a hand-written list. |
| `w` | the weighted draw in `rollBoard()`. |
| `daily` / `weekly` | the amount range, drawn **independently of band** (§4.4). |
| `targetMin` | the amount clamp — a ceiling in minutes, priced off the server-known action interval (§4.4). |
| `perPlot` | `harvest` only — scales with server-known plot count. **This is the fix for the "Harvest 25 crops on a 2-plot camp" backlog item, and it is structural rather than a retune.** |
| `scale` | `'income'` prices `earn` off the player's own 7-day ledger median; `'hours'` prices `study` off `pacing.actionRate`. Both self-scale and neither can be gamed by a fresh account. |

**The subject pools are derived, not authored.** `hr_activities` already holds 344 rows of
`(kind, activity_id, req_skill, req_lv)`, generated from `src/data/*` by
`tools/gen-catalogues.mjs`. Adding a tree to `gathering.js` therefore adds it to the quest
pool with no quest-side edit — which is the SYSTEMS_MAP golden rule holding for quests.

### 3.5 The Charter row (hand-authored, §7)

```js
{ id, name, obj:{counter, n, all?}, unlock, reward:{gold?, xp?, item?, qty?}, note, hint }
```

| field | who consumes it |
|---|---|
| `obj.counter` | `hr_quest_sync` — same vocabulary as a generated quest. `all:[…]` = every clause must hold (used once, by *Four Walls*). |
| `unlock` | `src/core/quests.js` `charterVisible()` — `null`, a prior quest id, or a counter threshold (`deaths>=1`). |
| `reward` | the claim RPC. Authored payout — granted with `{authored:true}` so `PACE.xp` never scales it (`pacing-overhaul.md` §4.5), exactly as `completeQuest()` already does for the Field Licence. |
| `note` | the completion line. |
| `hint` | shown on the **death toast** while this quest is the active Charter step (§7.3). |

Charter rows live in `player_progress` with `kind='quest'`, `period_key=''` — the
permanent population, kept forever, bounded by content at ten rows.

### 3.6 State on the client

```js
G.quests      // the CHARTER only — ten rows, once ever. Unchanged shape.
G.questBoard  // { d:{period, rerolls, offers:[…]}, w:{…} }  — display cache of server truth.
```

**Keeping the Charter in `G.quests` is load-bearing, not cosmetic.**
`src/features/renown.js` scores `G.quests.filter(done).length × 25`. If generated dailies
were written into `G.quests`, every completed daily would mint 25 Renown forever and the
"Rise to the Throne" ladder would become a daily-login counter. The Charter is bounded at
ten (250 Renown, once, ever); the generated lanes go in `G.questBoard` and score nothing.
**Do not merge these two arrays.**

---

## 4 · The generator

### 4.0 What is taken from Idle Clans, and what is derived

| taken | how it lands here |
|---|---|
| Quests are **generated from four parts**, not authored | `skill · band · amount · reward` (§4.1) |
| **Two families**, skilling and combat | nine archetypes across the two (§3.4) |
| **Difficulty is gated by the player's own skill level**, per skill | §4.2 |
| **Graduation** — the board self-levels, low bands stop appearing | §4.3 |
| **Amount is drawn independently of difficulty**; difficulty scales the *reward* | §4.4 |
| **Rerolls as the agency valve**, separate counters per lane, completed quests re-enter the pool, per-entry weight | §5 |
| **Daily / weekly cadence** with the weekly paying a multiple for a proportional amount | §4.5, §4.6 |
| **Starter quests**, once ever, exclusive to new accounts | §7 — the Charter |
| **Auto-continue** on task completion | §5.3 |

Derived rather than copied: the band windows (their cap is 100+; ours is 99 on an OSRS
curve where **94% of the XP sits above level 70** — level 60 is 273,742 XP of a
13,034,431 XP 99, so copying Easy 1-30 / Medium 30-59 would put **two of four bands inside
the first 2.1% of the curve**), the reroll counts, the reward magnitudes, and the pet
channel (§4.9).

### 4.1 The four parts

```
quest = { skill, band, amount, reward }
```

- **skill** — which skill (or combat) the quest belongs to. Picks the subject pool.
- **band** — difficulty. Drawn from the bands that skill's own level makes eligible.
- **amount** — how many completions. Drawn from the archetype's range, band-independent.
- **reward** — derived from band and the skill's honest rate. Never a table of numbers per quest.

### 4.2 The bands, derived from our content ladder

Our node rungs sit at req **1 / 15 / 30 / 45 / 60 / 75 / 90** (trees), **1 / 15 / 30 / 45 /
52 / 60 / 75 / 90** (rocks), **1 / 10 / 20 / 40 / 55 / 66 / 76 / 90** (fish). Bands should
follow the ladder the player actually climbs, not an arbitrary split.

| band | window | graduates at | the content it means |
|---|---|---|---|
| 1 **Apprentice** | 1–29 | 40 | rungs 1–2 · Normal/Oak · Copper/Iron · Shrimp/Herring/Trout |
| 2 **Journeyman** | 30–59 | 70 | rungs 3–4 · Willow/Maple · Coal/Gold · Lobster/Swordfish |
| 3 **Expert** | 60–84 | 90 | rungs 5–6 · Yew/Runewood · Mithril/Emberstone · Frostfin/Shark |
| 4 **Master** | 85–99 | — | rung 7 · Duskwood · Dawnstone · Moonfish |

### 4.3 Graduation — the rule that makes the board self-level

```
eligible(level) = { band : band.min <= level }  minus  { band : band.graduatesAt <= level }
```

| your level in that skill | bands you can be offered |
|---|---|
| 1–29 | Apprentice |
| 30–39 | Apprentice, Journeyman |
| 40–59 | Journeyman |
| 60–69 | Journeyman, Expert |
| 70–84 | Expert |
| 85–89 | Expert, Master |
| 90–99 | Master |

**Band is chosen per skill, from that skill's own level.** A player at Woodcutting 80 /
Cooking 3 gets an Expert woodcutting quest and an Apprentice cooking quest on the same
board on the same day. That is the property most worth taking from Idle Clans, and it is
the thing that makes one generator serve a fresh wipe and a 99 without a content patch.

For the combat archetypes (`cull`/`hunt`/`slay`) the governing level is **combat level**,
and the monster subject pool is filtered to that band's tiers (band 1 → tiers 1–2, band 2
→ 2–3, band 3 → 4–5, band 4 → 5–6), which reuses `unlockedTier()`'s existing shape.

### 4.4 Amount — drawn independently of band, then clamped

**Take Idle Clans' separation.** *"Quest difficulty does not influence the number of task
completions required."* It is correct here for a reason worth writing down: our rung-1 to
rung-7 **action time** spread is 3,000 ms → 13,000 ms, i.e. **4.3×**. The same amount
therefore already takes 4.3× longer at Master, and the band's reward multiplier (§4.6,
~3.7×) is what pays for it. Two dials would double-count.

**One deliberate divergence — a clamp.** Unclamped, a top-band `gather` draw of 180
Duskwood is `180 × 20.8 s ≈ 62 minutes` for **one of six** dailies. That is a board a
player abandons. So:

```
n = clamp( draw(range), range.min, floor(targetMinutes × 60000 / actionIntervalMs) )
```

`actionIntervalMs` is `HearthriseCore.pacing.actionIntervalMs(skill, baseMs, ctx)` — the
function the engine already uses to schedule the action, so the clamp is priced off the
real rate including the player's tools and perks. `targetMin` is **18 min daily / 90 min
weekly**. Worked example: Duskwood at 20.8 s/action clamps to 51, not 180.

**PROPOSAL** — the clamp is the one place I have chosen a bounded quest over a pure copy.
If Tyler prefers the pure Idle Clans separation, delete `targetMin` and the rerolls in §5
become the mitigation instead.

### 4.5 Cadence

| lane | offers | resets | key |
|---|---|---|---|
| Charter | 10 | never | `period_key = ''` |
| Daily | **6** | 00:00 UTC | `20260815` — the existing `todayKey()` |
| Weekly | **3** | Monday 00:00 UTC | `2026W33` — the existing `thisWeekKey()`, already Monday-aligned since b291 |

Weekly amounts are ~5× daily; weekly rewards are ~5× daily (§4.6), so a weekly is
**flat per minute** against a daily. Its premium is the **item**: dailies pay gold and XP,
weeklies pay a meaningful item. That is a cleaner feel than a rate premium and it keeps
the two lanes from competing on the same axis.

**Expiry.** Idle Clans forfeits unfinished *and unclaimed* quests at reset. Take the first
half; **PROPOSAL: reject the second.** Unfinished progress is lost — that is the deadline
and it is what makes a daily a daily. But a **completed** quest **auto-claims at reset**.
Forfeiting a reward the player *earned* because they closed the tab punishes the exact
behaviour this game is built on ("progress accrues while you're away"). Reconciling that
contradiction in the player's favour costs nothing and removes a whole class of grievance
ticket.

**Lane unlock — PROPOSAL.** The Daily lane appears when Charter step 5 completes (~10
minutes in); the Weekly lane appears at the Field Licence (~60 minutes in). Six generated
dailies on top of ten Charter quests in minute one would recreate the §1.4 noise problem
on day one of round 2. The board should get complicated at the same rate the player does.

### 4.6 Reward — two channels, two logics

```
xp   = bandHours[lane][band] × honestXpPerHour(skill, level)     → paid to that skill
gold = goldByBand[lane][band]                                    → flat per band
item = archetypeItem(subject), qty = ceil(n × 0.10)
```

**XP tracks the skill's own rate.** `honestXpPerHour` is
`HearthriseCore.pacing.actionRate(...)` — the function that already computes *"the
advertised rate, computed the way the engine actually pays"*. One call, no table to
drift, and the reward is automatically correct for any skill, any level, and any content
rung added later. **A quest reward that reads a rate function can never go stale.**

**Gold tracks the player's station, not the skill's rate.** A level-1 fishing daily priced
off the fishing rate would pay 58 gold, which is insulting to the player who needs gold
most. Gold is flat per band.

| band | daily hours | weekly hours | daily gold | weekly gold |
|---|---|---|---|---|
| 1 Apprentice | 0.06 | 0.30 | 250 | 1,400 |
| 2 Journeyman | 0.10 | 0.50 | 700 | 3,900 |
| 3 Expert | 0.15 | 0.75 | 1,800 | 10,000 |
| 4 Master | 0.22 | 1.10 | 4,500 | 25,000 |

**Worked example — Fishing 42, band 2 (Journeyman is the only eligible band at 42).**
Best rung is Lobster (req 40): `8,000 ms × 1.60 = 12,800 ms` → 281 actions/hr;
`84 xp × 0.39 = 32.8` → **9,214 Fishing XP/hr**. Draw 120 from `[70,180]`, clamp to
`18 × 60000 / 12800 = 84`. Quest: **"Land 84 Lobster."** ≈ 18 minutes.
Reward: `0.10 h × 9,214 = 921 Fishing XP` + **700 gold** + 8 Raw Lobster.
The 84 lobsters themselves pay 2,755 XP, so the quest is a **+33% bonus on work the
player was going to do anyway.** That is the target feel.

**Combat quests pay through the player's active style** (`src/core/styles.js
killXpRoute`), exactly as `field_licence` already does — a bow user is paid Ranged.
**Deliberately not Idle Clans' random combat-XP type**: a Ranged build handed Magic XP is
dead value, and we already own the routing table that does it correctly.

**The pacing check.** 6 dailies/day at ~0.10 h average = 0.6 h. 3 weeklies/week at ~0.50 h
= 1.5 h/week = 0.21 h/day. **Total ≈ 0.81 h/day of authored XP against the 12 h daily
budget = +6.8%.** Noticeable, worth logging in for, and it does not move the 57.2-day
first-99 floor in any way a player could perceive. Gold: 6 × 250 = **1,500 g/day at
Apprentice**, against today's **≈2,370 g/day** (the mean `DAILY_TASK_POOL` draw is 517 g
and the mean `DAILY_REWARDS` draw is 272 g, three of each). This system is
**deflationary** at the bottom of the ladder — by about a third.

### 4.7 `tribute` — the archetype that pays off a standing backlog item

`tribute` asks the player to **deliver N of an item**, consuming it. Its subject pool is
drawn from **monster drops that have no recipe and no use** — the 34 recipe-less tier-1–6
drops on my standing backlog.

This costs zero new items, zero new recipes and zero new balance. It turns Slime Gel,
Bat Wings and Goblin Ears from vendor trash into a thing the board wants this week. It is
server-verifiable (inventory is server-owned; the delivery is a consume in the claim
transaction). **PROPOSAL:** ship `tribute` in the weekly lane only at first — a consuming
objective wants to feel like a haul, not a chore.

### 4.8 `study` — the universal fallback

*"Gain 20 minutes of Woodcutting XP."* Amount = `bandHours × honestXpPerHour`, so it
self-scales perfectly. It is the least flavourful archetype (weight 1) and it is in every
pool for one reason: **XP is the single most server-verifiable quantity in the game** — it
*is* the server's own number, in `player_skills`. If any counter emission (§9.2) is late,
`study` can carry a lane on its own and the board is never empty.

### 4.9 What was deliberately NOT taken

**The pet reward.** Idle Clans pays a pet as the rare chase (daily 0.1–0.4%, weekly 1–4%).
Our pets are already ~**1-in-2,500 actions** (`src/data/companions.js`,
`source:'skill:woodcutting:2500'`) — at 780 actions/hr that is an expected first Beaver in
**~3.2 hours of woodcutting**. A quest pet roll is not a chase against a 3-hour base rate;
it is noise. **PROPOSAL: ship the `pet:` field in the reward shape with every value at 0**,
so the mechanism exists and the number is Tyler's call. If pet rates are ever rebalanced
toward OSRS-like odds, the channel is already there. (Noted: the Coordinator fixed a
double-rate companion proc bug today, so companion rates are newly trustworthy — which is
an argument for revisiting pet rates generally, separately from this spec.)

**Paid reroll expansion.** Idle Clans sells 10 daily / 16 rerolls behind a token. Tyler has
not asked for monetisation and I am not designing it. §5.1 flags the *shape* of an
expansion — a lane's offer count and reroll budget are two integers — without proposing a
price or a source. **Any future source for them must not be gold, because gold is
PvE-mintable.**

---

## 5 · The reroll economy

### 5.1 Counts — PROPOSAL

| lane | offers | rerolls |
|---|---|---|
| Daily | 6 | **6** |
| Weekly | 3 | **3** |

Separate counters, each resetting with its own lane. **One reroll per slot** is the
principle: the player can decline every offer exactly once, which is the minimum agency
that makes a board feel *chosen* rather than *dealt*. More than that and the player
optimises the board instead of playing it; fewer and a bad deal is a dead slot for a day.
Both numbers are dials.

### 5.2 The rules

1. A reroll draws from the same weighted pool, **excluding every key currently on that
   lane's board** — never a duplicate.
2. **A completed-and-claimed quest re-enters the pool.** Taken from Idle Clans, and it is
   what lets a player who loves fishing chase fishing quests all week.
3. **Weight** (`w` on the archetype, §3.4) governs how often an entry appears. Weighted
   toward what is always playable — `gather` and `cull` at 3, the archetypes with a
   prerequisite (`refine` needs inputs, `harvest` needs plots, `tribute` needs drops)
   lower. An entry the player *cannot* do at all — `req_lv` unmet, zero plots, no eligible
   monster — is filtered out of the draw entirely, before weighting.
4. **Rerolling is safe from exploitation by construction, and this is a design property
   worth stating.** Because reward is `bandHours × the skill's own honest rate`, every
   quest at a given band pays about the same per minute of work. **There is no jackpot to
   reroll toward.** Any future reward channel that breaks that invariant — a flat item
   drop with a high value, a currency, a gem — reopens it. See §5.4.

### 5.3 Auto-continue

On accepting a quest the player picks what happens when it completes:
**(a) keep going · (b) return to what I was doing · (c) start the next quest** (dailies
before weeklies). It is stored as one field on the lane, and because the server owns the
activity pointer (`player_state.active_kind/active_id/active_since`) this is the one place
the server may legitimately re-point an activity without a client intent.

**Auto-continue never re-points into a combat activity.** Idle Clans reaches the same
conclusion (combat quests cannot auto-complete); our reason is our own — combat can kill
you, and an unattended re-point into a fight the player did not choose burns food and
ends in a death card they cannot explain. Auto-continue is for loops that do not hit back.

### 5.4 The economy rules — non-negotiable

1. **No generated lane may mint gems.** Gems are an IAP currency ($4.99 = 250) and buy
   hero slots. A rerollable, repeatable, generated objective that mints them is an
   unbounded IAP faucet, which is the surface the Season Pass was removed for. The Charter
   may pay a fixed one-time gem grant if Tyler wants one; **the Daily and Weekly lanes may
   not, ever.** This removes gems from today's `DAILY_REWARDS` and `WEEKLY_GOAL_POOL`.
2. **No lane may mint `hearth_token` or `muster_seal`.** Already guarded by the existing
   currency-leak smoke tests; the quest reward path must be added to their scope.
3. **`bounty_marks` stay bounty-only.** Marks are the Bounty Hunter's own currency and
   the price of Auto-Eat; a second faucet would deflate the one goal the early combat
   player is aiming at (`away-combat-licence.md` §5.2).
4. **Quest rewards are authored payouts**, granted `{authored:true}` so `PACE.xp` never
   scales them — the rule `completeQuest()` already follows.

---

## 6 · Server authority — the part that decides whether this ships at cutover

### 6.1 The one line that matters most

`hr_apply` today accepts a client-supplied `progress` array with a clamped `add`:

```sql
-- 2026-08-11-apply-engine.sql :865
if p_delta ? 'progress' then
  ... kind in ('quest','daily','bounty','stat','collection','flag') ...
  v_n := coalesce((v_prog->>'add')::bigint, 0);   -- CLIENT-SUPPLIED
```

Clamped is not the same as verified. If a quest's progress can be `add`-ed by the client,
the entire system is self-reported and the generator is decoration.

> **THE RULE: `hr_apply` must reject a client `progress` op whose `kind` is `'quest'` or
> `'daily'`.** One line. Quest progress is **derived** server-side from `stat` counters,
> never added. This is the single most important line in the design.

### 6.2 Objectives are thresholds on counters, and nothing else

Every objective in §3.4 and §7 has the same shape:

```
done  ⇔  counter(key) − baseline  ≥  amount
```

`baseline` is captured server-side at issue (§3.3) and `counter` is a server-owned `stat`
row. Nothing is ever reported; everything is read. This is the shape systems 3 and 4
already use (`readSource` delta from `startValues`) — the design is *promoting the
mechanic that already works*, not inventing one.

### 6.3 The three tiers — what can ship at cutover, and what cannot

**Tier A — the server already owns and already emits it. Ships as-is.**

| counter | source |
|---|---|
| `kills`, `crits`, `deaths`, `rare_drops` | `hr-accrue/accrual.js` already emits these as `stat` rows |
| `xp:{skill}` | `player_skills` — the server's own number |
| `gold_in` | `player_ledger.gold_in` |
| `inv:{item}` | `player_inventory` |
| `deliver:{item}` | `player_inventory` + a consume in the claim transaction |

**Tier B — the server owns the event but does not yet emit a counter. Small, precise
engine work (§9.2); ships at cutover if that work lands.**

| counter | what has to happen |
|---|---|
| `act:{skill}` (chopped/mined/fished/cooked/smithed/crafted/buried) | the gather+artisan grant paths already know the activity id and its `req_skill` from `hr_activities`; emit one `stat` row per completed action |
| `kills:t{tier}`, `kills:f{family}` | `combat-sim` already has the monster; emit alongside `stat('kills',…)` |
| `crops` | `player_farm` is server state; emit on harvest |
| `bounties` | bounty completion is already server-adjacent; emit a counter |

**Tier C — CANNOT be verified from server-owned state today. DO NOT SHIP THESE AS
OBJECTIVES.** Listed loudly, because each one is a trap that looks shippable:

| would-be objective | why it cannot be verified |
|---|---|
| *"eat food during a fight"* | `accrual.js` says it plainly: *"food_slot / auto_eat_pct are not columns on player_state, so the server cannot know which food the player nominated."* There is no server model of eating. |
| *"build a homestead room"* | the homestead is entirely client-side. `stats.roomsBuilt` has no server counterpart. |
| *"gain a skill level"* | derivable, but a **bad objective regardless**: its cost varies ~1,000× between level 5 and level 95, so it is trivial for a new player and impossible for a veteran. Today's `level_up` daily pays 500 g + 1 gem for what is 60 seconds of mining at level 1. **Retire it, do not port it.** |
| *"find a rare drop"* | `rare_drops` **is** emitted (Tier A) — but as an *objective* it is a coin flip the player cannot aim at, which is a bad daily whatever its verifiability. |
| collection-log entries, Chronicle beats, Farmer's Deeds, companion procs, dungeon runs, world events, `buffsConsumed` | all client-only features with no server model. Every one would require trusting a client self-report. |

**The honest summary:** of the nine archetypes in §3.4, **five are Tier A** (`cull`,
`tribute`, `earn`, `study`, plus every inventory objective in the Charter) and **four are
Tier B** (`gather`, `refine`, `harvest`, `hunt`/`slay`). **None are Tier C.** That is not
an accident — it is the constraint the archetype list was written against.

### 6.4 The board is generated server-side, and it is seeded

A generated quest with a random amount and a reroll budget **cannot** be client-generated:
a player would reroll locally until they drew a trivial quest. So:

```
board(user, slot, lane, period) = seededDraw( hashSeed(user_id + slot + lane + period), levels, catalogues )
```

Same discipline `src/core/bounty.js` already established, and for the same reason its
header gives: *"a server that generates the board cannot prove what it offered, and a
client that predicts one cannot match it."*

**Generation happens once per period, on first touch, inside `hr_apply`'s transaction,
and the result is PINNED by writing the six offer rows.** From then on the board is read
from those rows, never regenerated — otherwise a mid-day level-up would silently reband a
player's board out from under them.

The client may run the identical `src/core/quests.js` to *predict* the board for instant
rendering. That prediction is display-only and reconciled to the server's rows, exactly as
`CLAUDE.md` requires.

### 6.5 The client-side gap that must be named

`stats.kills` and every other counter still live in the client-authored `game_saves`
snapshot today. Until the cutover, a client-evaluated quest threshold is decorative —
the same caveat `away-combat-licence.md` §3.2 already puts on the Field Licence.
**Say so in the commit rather than pretending otherwise.** This spec is written for the
post-cutover world; if any part of it ships before, it ships as UI with a known gap.

---

## 7 · The Charter — hour one, hand-authored

Round 2 is a full wipe. On day one every player is here, so this is the most important
content in the document.

### 7.1 The arc

*You arrive with a sword, ten hit points and eight raw shrimp. By the end of hour one you
have a hearth, a full larder, two tools, a bounty in hand, and a Field Licence that makes
your fights carry on while you're away.*

The Charter braids the two rhythms deliberately: **gathering pays while you're away;
combat pays while you're here.** Three of the ten quests exist purely to teach that
contrast, and one exists purely to explain a death.

### 7.2 The ten

Amounts derived from the §1.3 measurements. `xp` is combat XP routed through the active
style unless a skill is named.

| # | id · name | objective | counter (tier) | unlock | reward | why |
|---|---|---|---|---|---|---|
| 1 | `c_first_light` · **First Light** | Complete **5** actions of any gathering skill | `act:woodcutting+mining+fishing` (B) | — | **60 g · Bronze Axe** | ~23 s. The first tap, and the axe makes the *next* 23 s visibly faster — the first "why does this matter" answered inside a minute. Note: *"A tree doesn't hit back. Set a skill running before you close the tab — it pays the whole time you're gone."* |
| 2 | `c_first_blood` · **First Blood** | Defeat **3** monsters | `kills` (A) | #1 | **60 g · 120 combat XP** | ~35 s, comfortably inside the 5–7 kills a fresh character survives (MEASURED). The first fight should be a win, not a lesson. |
| 3 | `c_own_supper` · **Bring Your Own Supper** | Carry **5 Cooked Shrimp** | `inv:cooked_shrimp` (A) | #2, **or `deaths ≥ 1`, whichever first** | **80 g · 3 Cooked Trout** | The death quest. Raw Shrimp heals 3; Cooked heals 8 against a 10 HP bar. Reward is Cooked Trout (heals 14) so the player *sees* the cooking ladder go up. ~100 s. |
| 4 | `c_full_larder` · **A Full Larder** | Cook **10** meals | `act:cooking` (B) | #3 | **100 g · 150 Cooking XP** | At level 1 the burn rate is ~50% (MEASURED: 15 attempts → 12 cooked, 3 burnt after a level-up), so 10 successes means ~15 raw and a return trip to the water. The resupply loop is taught by needing it. ~157 s. |
| 5 | `c_hold_field` · **Hold the Field** | Defeat **25** monsters | `kills` (A) | #4 | **120 g · 400 combat XP** · *unlocks the Daily lane* | MEASURED: a full larder buys **27 kills in 324 s**. 25 is that run, minus a margin. This is the payoff for quests 3 and 4 and the moment the player learns the exchange rate. |
| 6 | `c_timber` · **Timber** | Chop **30** Normal Logs | `act:woodcutting` (B) | #5 | **100 g · Bronze Pickaxe** | ~138 s. 30 logs is exactly what Hearthside Homestead costs. The pickaxe sets up #7. |
| 7 | `c_first_seam` · **The First Seam** | Mine **20** Copper Ore | `act:mining` (B) | #6 | **100 g · 200 Mining XP** | ~92 s with the pickaxe. 20 ore is exactly what Hearthside Homestead costs. |
| 8 | `c_four_walls` · **Four Walls** | Hold **30 Normal Log** and **20 Copper Ore** at once | `all:[inv:normal_log≥30, inv:copper_ore≥20]` (A) | #7 | **150 g · 5 Wheat Seed** | Latches the instant #6 and #7 both land. Its whole job is to point at the Build button with the materials already in the bag — **the Homestead is the first thing the player wants that they had to work for.** |
| 9 | `c_the_board` · **The Notice Board** | Complete **1** bounty | `bounties` (B) | #8 | **120 g · 40 Bounty Hunter XP** | ~120 s — **but only if the tutorial bounty ships. See §7.4.** Hands the player off to the system that owns combat progression, with Marks and the Auto-Eat goal now on their screen. |
| 10 | `c_field_licence` · **Field Licence** | Defeat **100** monsters | `kills` (A) · mirrored | #9 | **1,500 combat XP** · *unlocks the Weekly lane* | **UNCHANGED — this already ships.** Same id, same mirror, same reward, same note. The Charter is built around it, not over it. |

**Gold total: 890 g** across nine new quests, against the **1,000 g** the current
five-quest chain pays. Net effect on the economy: **−110 g per account, once.**

**XP total:** 2,020 authored combat XP + 350 skill XP. Against a 13,034,431 first-99 that
is **0.018% of one skill**. The Charter cannot distort pacing because it is not a rate
(`pacing-overhaul.md` §4.5).

### 7.3 The death beat

Today: one log line, one toast, `stopCombat()`, and an empty arena. The Charter fixes it
with data, not a new system — quest #3's `hint` is shown **on the death toast** while #3
is the active Charter step:

> **You fell after 53 seconds.** Raw Shrimp heals 3. **Cooked** Shrimp heals 8 — most of
> your health bar. Cook the eight in your bag before you fight again.

One `hint` field on one row. It answers the player's actual question, which is not *"did I
die"* but *"why so fast, and what do I do differently."* The measured answer is
**7 kills → 27 kills** (§1.2), and that is worth a sentence.

*(Where that sentence sits and how it looks → **Art Director**. The content and the trigger
are specified here.)*

### 7.4 The dependency that must be stated

**Quest #9 does not ship unless the tutorial bounty from `away-combat-licence.md` §5.3
ships.** The first bounty on a fresh board today is **"cull 83 Slimes"** (MEASURED) — 16
lives of combat for 270 g and 5 Marks against a 100-Mark Auto-Eat. Handing a 20-minute-old
character an 83-kill contract as their tenth quest converts the handoff into a wall. The
licence spec's fix is a one-per-account **10-kill cull worth 5 Marks**, server-gated on
`bountyHunter.completed === 0`. Five Marks, once, ever.

### 7.5 The timing, checked against the measurements

| step | derived from | ≈ time |
|---|---|---|
| #1 · 5 gathering actions | 13/min | 23 s |
| #2 · 3 kills | ~11 s/kill | 35 s |
| *(a death lands here, 60–80 s in)* | MEASURED 53–79 s | — |
| #3 · 5 cooked shrimp | 6 raw @ 11/min + ~10 cooks @ 50% burn | 100 s |
| #4 · cook 10 | ~15 raw + 15 cooks | 157 s |
| #5 · 25 kills | MEASURED 27 kills / 324 s on a full larder | 300 s |
| #6 · 30 logs | 13/min | 138 s |
| #7 · 20 copper | 13/min + tool | 92 s |
| #8 · latch | — | 0 s |
| #9 · 10-kill bounty | ~11 s/kill | 120 s |
| **#1–#9 subtotal** | | **≈ 16 min of activity** |

With the FTUE, the daily-reward modal, menu-reading, inventory fumbling and two or three
deaths, that is a realistic **30–35 minutes** for #1–#9. **#10 (100 kills) closes at
≈ 55–65 minutes** — about four larder cycles.

**And it lands on the same beat as the first cull bounty (80–120 kills).** One session
ends with **two unlocks and a visible new goal**: the Field Licence, the first Bounty
Marks, and a 100-Mark Auto-Eat now legible on the Combat panel. That convergence is
`away-combat-licence.md` §2.3's alignment, and the Charter is built to preserve it. **Do
not tune #10 away from `BOUNTY_KILL_COUNTS.cull[1]`.**

---

## 8 · What this replaces, absorbs, and retires

| system | verdict |
|---|---|
| **`QUEST_DEFS` (5 onboarding quests)** | **REPLACED** by the Charter. `field_licence` is carried over **unchanged, same id**; the other four are superseded (`gatherer`/`first_cook`/`first_blood`/`farmhand` become Charter #1–#5 with real pacing behind them). |
| **`DAILY_TASK_POOL` + `updateDaily` event counting** | **RETIRED as a catalogue.** ⚠️ **DO NOT DELETE `updateDaily()` itself** — it is a named wrapper chain (`wrapUpdateDaily`, `__wrappedBy`) that the Muster already hooks and castle Labour will hook next (CONFLICTS #6). Retire the pool it drives; keep the seam. |
| **`DAILY_GOAL_POOL` + `DAILY_REWARDS`** | **ABSORBED.** Its mechanic — a threshold on `readSource`, measured as a delta from `startValues` — is the correct one and becomes the whole system's shape. Its *contents* are replaced by generation. `level_up` and `gold_500` are not ported (§6.3). |
| **`WEEKLY_GOAL_POOL`** | **ABSORBED** into the Weekly lane, same reasoning. Its gem rewards are removed (§5.4). |
| **The Quests modal's Daily/Weekly tabs + `global-quests-strip` + Home's "Next up" task rows** | **REPLACED** by one board with three lanes. Three surfaces collapse to one. |
| **`src/features/quest-nav.js`** | **KEPT, and it is the reason this is cheap.** The resolver already routes by `goal.source` / `goal.type` / bounty shape / text, and it already covers `kills`, `chopped`, `mined`, `fished`, `cooked`, `smithed`, `crafted`, `planted`, `harvested`. It needs the nine archetype names added to `TYPE_DEST` — nine rows — and its existing totality gate will fail loudly if one is missed. |
| **Bounties** | **KEPT, untouched.** A distinct fantasy, its own currency (Marks), its own skill (Bounty Hunter), its own board, its own seeded generator. Folding it in would delete a skill. The Charter *hands off* to it (#9); it does not absorb it. |
| **Achievements (29)** | **KEPT, untouched.** Lifetime, never reset, no claim. A trophy case, not a task list. They answer *"what have I done"*; quests answer *"what should I do now."* Different questions, different surfaces. |
| **Farmer's Deeds** | **UNTOUCHED.** Not an objective system — a drop-based plot-upgrade currency with no goal and no claim. |

**Net: four objective systems become one, and the two that stay have a sentence
explaining what they are for.**

---

## 9 · Engine work beyond data — be precise

Roughly **450 lines of new code, ~200 lines of data, ~150 lines of SQL, against ~350 lines
retired.** Honest estimate: **two engineer-days for the client half, one for the SQL
half.** The generator is the small part. Items 9.2 and 9.5 are the load-bearing ones.

### 9.1 `src/core/quests.js` — NEW, pure (~250 lines)
Band selection, graduation, `subjectPool()` against the catalogues, the seeded weighted
draw, the amount clamp, the reward formula, key `format`/`parse`, the completion
predicate. **PURE ESM — no DOM, no window, no `Math.random`.** Imported by the client
renderer *and* by `supabase/functions/hr-accrue`, exactly as `src/core/bounty.js` and
`src/core/licence.js` already are. Covered by the existing `tests/core-purity.mjs` gate.

### 9.2 Counter emission — THE LOAD-BEARING CHANGE (~15 lines, two files)
`hr-accrue/accrual.js` currently emits exactly four `stat` keys — `kills`, `crits`,
`deaths`, `rare_drops` — and says so deliberately:

> *"the drop log, Farmer's Deeds, bounties, dailies and quests have no server progress
> model yet. Emitting invented progress keys now would hand the quest workstream a
> contract it has to break."*

**This document is that contract.** The Tier-B keys in §6.3 (`act:{skill}`,
`kills:t{tier}`, `kills:f{family}`, `crops`, `bounties`) must be emitted from the same
place, in both `accrual.js` and `hr_apply`'s gather/artisan grant paths. **Without this,
four of nine archetypes cannot be verified and the generator is decoration.**

⚠️ **Naming:** the server uses snake_case (`rare_drops`) where the client uses camelCase
(`rareDrops`). Pick one vocabulary for the quest counter namespace, write it down, and
guard it — a silent mismatch here reads to the player as "my quest never moves," which is
precisely the b224 bug (`readSource` returning 0 forever with nothing in the console).

### 9.3 `hr_quest_sync(user, slot)` — NEW PL/pgSQL (~80 lines)
Called at the end of `hr_apply` and after `hr_accrue` writes. For each `active` quest row:
read its counter, subtract its `qb:` baseline, write `value`, flip to `'done'` at the
threshold. **Derivation, never addition.** The existing `progress_claim` op handles the
`done → claimed` step unchanged.

### 9.4 Two new `hr_apply` ops (~60 lines)
- **`quest_roll`** — generate and PIN a lane's offers for a period, idempotent on
  `(lane, period)`. Writes the offer rows + their `qb:` baselines.
- **`quest_reroll`** — delete one named key's rows, insert the replacement, increment
  `qr:<lane>`, **reject when the lane's budget is spent**. The budget check is server-side
  or the reroll count is a suggestion.

### 9.5 One rejection rule (1 line) — §6.1
`hr_apply` must reject a client `progress` op with `kind in ('quest','daily')`.
**If only one thing from §9 ships, ship this.**

### 9.6 Client (~150 lines)
One `src/features/quest-board.js` renderer for three lanes, replacing the strip, the
modal's two tabs, and Home's "Next up" task rows. Nine rows added to `quest-nav.js`'s
`TYPE_DEST`. `G.questBoard` added to the save (persists by default — save invariant 3;
**it must not go in `NO_SYNC`**).

### 9.7 What is NOT needed, and it is worth celebrating
- **No schema migration.** `player_progress` already has `kind='quest'|'daily'`,
  `period_key`, and the `active→done→claimed` lifecycle (§3.1).
- **No new catalogue tables.** `hr_activities` (344 rows), `hr_skills`, `hr_crops` and the
  monster tables already hold every subject pool.
- **No change to `src/core/away.js`, `combat-sim.js`, or `AWAY_SCOPE`.** Quests are read
  from counters after the fact; they are not a bonus channel.
- **No change to `bounty.js`, `pacing.js`, or any existing balance value.**

---

## 10 · Required regression coverage

In `src/features/smoke-test.js`, mirrored server-side in `tests/accrual-engine.mjs` where
the counter emission runs.

1. **`QUEST-1` — client cannot self-report.** An `hr_apply` call with
   `progress:[{kind:'daily', add:999}]` is **rejected**. The test that makes the whole
   system real.
2. **`QUEST-2` — determinism.** The same `(user, slot, lane, period, levels)` produces a
   byte-identical board across two independent generations, in Node and in the browser.
3. **`QUEST-3` — pinning.** A board generated at Woodcutting 39, then re-read after the
   player hits 40, returns the **same** quests. A mid-day level-up never rebands a live
   board.
4. **`QUEST-4` — graduation.** Sweep levels 1→99 for every skill; assert the eligible-band
   set matches §4.3 exactly and is never empty.
5. **`QUEST-5` — the amount clamp.** No generated quest at any band, for any skill, at any
   level, exceeds `targetMin` minutes priced off the real `actionIntervalMs`.
6. **`QUEST-6` — no gem minting.** Sweep every archetype × band × lane; assert **zero**
   gems, `hearth_token`, `muster_seal` and `bounty_marks` in any generated reward. Extends
   the existing currency-leak guards.
7. **`QUEST-7` — the reroll budget is server-side.** Rerolling past the budget is rejected;
   the board is unchanged; the counter did not move.
8. **`QUEST-8` — no Tier-C objective ships.** Assert every archetype's `counter` is in the
   Tier A ∪ Tier B allowlist (§6.3). **This is the test that keeps an unverifiable
   objective from sneaking in later**, which is the failure mode that would force a
   post-cutover rebuild.
9. **`QUEST-9` — the Charter is bounded.** `G.quests` never exceeds ten rows; no generated
   quest is ever written into it. Guards Renown from becoming a daily-login counter (§3.6).
10. **`QUEST-10` — the Charter is reachable and correctly ordered.** Drive counters
    programmatically through #1→#10 and assert each unlocks, completes and pays exactly
    once — including the `deaths ≥ 1` alternate unlock on #3.
11. **`QUEST-11` — auto-claim at reset.** A `done`-but-unclaimed quest pays at reset; an
    `active` one is forfeited and leaves no rows behind.
12. **`QUEST-12` — nav totality.** `HearthriseQuestNav.unmapped(livePools())` is `[]` for a
    fully-generated board. The existing gate, pointed at the new pool.

---

## 11 · Handoffs, and the calls that are Tyler's

**Systems Engineer** — §9, in priority order: the §6.1 rejection rule, then §9.2 counter
emission (read `accrual.js`'s own comment at line 296 first — it names this document's job),
then `hr_quest_sync`, then the two `hr_apply` ops. Flagged separately to `CONFLICTS.md`:
**`updateDaily()` is a wrapper chain the Muster hooks — retire the pool, keep the seam.**
Also: the snake_case/camelCase counter-namespace split (§9.2) needs one decision and one
guard.

**Art Director** — one board, three lanes, on one screen, replacing three surfaces
(`global-quests-strip`, the Quests modal's Daily/Weekly tabs, Home's "Next up" task rows).
Two content specs that are mine and two placements that are yours: the **death-toast hint**
(§7.3) and the **band label on a quest row** — a player must be able to see *why* today's
fishing quest is bigger than yesterday's. Filed to `DISCOVERIES.md`: a new character is
currently shown six live kill-objectives across four screens (§1.4).

**QA Engineer** — §10. `QUEST-1` and `QUEST-8` are the two that decide whether this
survives cutover; `QUEST-9` is the one that protects Renown.

**Tyler — six taste calls, all labelled PROPOSAL above:**
1. **Lane sizes and reroll counts** — 6 daily / 6 rerolls, 3 weekly / 3 rerolls (§5.1).
2. **Auto-claim at reset** vs Idle Clans' forfeit-the-unclaimed (§4.5). I recommend
   auto-claim; it is the reading consistent with an away-first game.
3. **The amount clamp** (§4.4) — a deliberate divergence from the pure four-part
   separation, bought to keep a top-band daily under 18 minutes.
4. **No pet channel** (§4.9) — our pets are ~1-in-2,500 actions, so a quest pet roll is
   noise. Shipping the field at 0 keeps the option open.
5. **Staggered lane unlock** — Daily at Charter #5, Weekly at the Field Licence (§4.5).
6. **The gem rule** (§5.4) — removing gems from daily and weekly rewards. This is the one I
   would defend hardest: today's quests mint a real-money currency, and a *generated,
   rerollable* system must not.

**One dependency, not a taste call:** Charter #9 requires the tutorial bounty from
`away-combat-licence.md` §5.3 (§7.4). Without it, the tenth quest of a player's first hour
is an 83-kill contract.
