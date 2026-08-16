# SPEC — LIVE-PLAY SETTLEMENT

Status: **DESIGN, not implemented.** Backend Architect, 2026-08-16.
Governing rule: `CLAUDE.md` §"Server authority (locked 2026-08-10)".
Reads on: `docs/design/server-authority.md`, `docs/design/away-time-ruling.md`,
`docs/design/HANDOFF-server-authority.md`.
Measurements: `tools/probe-live-settle.mjs` (`node tools/probe-live-settle.mjs`).

Tyler, after the b359 P0: *"Why isn't it just 'kill monster, kill is recorded on
the server, exp is recorded on the server, and all loot gained is recorded on the
server'?"*

This spec answers that, and its answer is **yes, and the machinery already
exists** — with one structural gap that no amount of cadence tuning closes and
that Phase 0 has to fill first.

---

## 0. THE THESIS, AND WHERE IT IS WRONG

**The thesis as briefed:** live play is away accrual that happens while you're
watching. The server already prices any span between `accrued_to` and `now()`
through ONE engine (`computeAccrual` → `simulateSpan`/`sliceSpan`), with a
watermark guaranteeing exactly-once payment, an idempotent apply, and race
behaviour proven in production. So the client keeps its local tick purely for
responsiveness and SETTLES periodically; the same accrue/collect path pays the
live span server-side. No per-swing round trips.

**Held, on three counts, by measurement rather than by reading:**

- The deployed engine pays a 60,000 ms span correctly today. `ACCRUE_MIN_MS` is
  exactly `60000` and 59,999 ms is refused `below_min_span` (P1). A 60 s span
  produces real kills, gold, XP and drops.
- Slicing an hour into settles is payment-neutral for combat within noise:
  averaged over 40 seeds, settling every 60/90/120/300/900 s lands within
  **±1.8 %** of one 60-minute window, with no consistent sign (P2). The single-seed
  −5 % figures that show up on a first look are variance, not structure.
- The rate gate does not need re-sizing. `hr_rate_gate`'s live body allows
  `accrue` **30/min** (also `activity` 30, `shop` 30, `claim` 20 — read out of
  production). A 90 s cadence spends 0.67/min. There is 45× headroom.

**Where the thesis is wrong, and it is the finding that reorders the whole
programme:**

> ### ⛔ P3 — A FIGHT LONGER THAN THE CADENCE PAYS ZERO, FOREVER
>
> Measured: a `dragon` (520 HP) against a mediocre-offence character takes 488
> ticks — about 20 minutes — for ONE kill. Priced as one 60-minute window it pays
> **1 kill / 575 gold**. Priced as sixty 60-second settles, or thirty 120-second
> settles, or twelve 300-second settles, it pays **0 kills / 0 gold / 0 XP**.
> At every cadence. Indefinitely.
>
> Cause: **the in-progress monster is not server state.** `computeAccrual` builds
> `state = { monsterHp: 0, monsterMaxHp: 0 /* repaired by simulateSpan */ }` —
> every span starts a *fresh* monster at full HP, because `player_state` has no
> column for a fight in flight. Every settle boundary therefore discards all
> damage dealt since the last one and restarts the fight.
>
> This is not a rounding loss and not a balance question. It is a total
> confiscation for any target whose time-to-kill exceeds the settle interval —
> i.e. exactly the bosses, dungeon monsters and above-level targets that a
> present, watching player is most likely to be fighting. It is also, today, a
> live under-payment on every `set_activity` collect: a player who re-targets
> mid-fight already loses the partial.

**Consequence for the plan:** carrying in-fight state is **Phase 0** and it is a
prerequisite, not a polish item. Everything else in this spec is cheap; this is
the only part that touches the simulation contract.

---

## 1. THE MODEL, IN ONE PARAGRAPH

`player_state.accrued_to` is the instant the server has paid up to. Today it
moves on a return-from-absence and on an activity switch. Under live settlement
it moves **continuously**: a present client posts `{"verb":"accrue"}` on a timer,
the server prices `[accrued_to, now()]` through the same `computeAccrual` it uses
for a twelve-hour night, applies the delta through `hr_apply`, journals it, bumps
`version` and returns the envelope. There is no new verb, no new engine, no new
idempotency scheme and no new concurrency model. **Away accrual and live play
become the same operation at different intervals.** The client's local tick is
demoted to a display prediction.

Nothing about the away path changes. `AWAY_SCOPE` still decides which channels
pay; the only channel it excludes is `blessing` (server-wide events), and §4
below is about paying that one back when the player is genuinely present.

---

## 2. THE CONTRACT

### 2.1 Wire (unchanged from `intents.js`)

```
POST <SUPABASE_URL>/functions/v1/hr-accrue
  apikey: <anon>   Authorization: Bearer <user JWT>   Content-Type: application/json
  {"slot": N}                       -- an absent verb IS `accrue`
→ 200 {ok:true, accrued:true,  ...envelope, away:{…receipt…}, levels}
  200 {ok:true, accrued:false, reason:'below_min_span'|'idle'|…}
  409 {ok:false, error:'no_character'|<hr_apply code>, detail}
  429 {ok:false, error:'rate_limited'}
```

**No new verb.** A `settle` verb would be `accrue` with a different name, a
second registry row, a second rate bucket and a second thing to keep in step with
the engine. The only difference between "away accrual" and "live settlement" is
how long ago the last one was, and the server can already see that.

### 2.2 New server state — `player_state`, Phase 0

| column | type | written by | why |
|---|---|---|---|
| `fight_monster` | text null | `hr_apply` (`fight` delta key) | which monster the in-flight fight is against; must agree with `active_id` or the fight is void |
| `fight_hp` | int null | ditto | the monster's remaining HP at `accrued_to` |
| `fight_kills` | int not null default 0 | ditto | `combatKillsThisFoe`, which drives streak/боss logic in `simulateSpan` |

`fight_*` is **derived output of the engine, never client input.** It enters
`hr_apply` under a new delta key `fight` whose whole value is produced by
`computeAccrual`, exactly as `tool_carry` already is. `hr_apply` must:

- accept `fight` in its delta allowlist and clamp `fight_hp` into
  `[0, monsters[fight_monster].hp]` re-derived from `hr_monsters` server-side —
  the engine's proposal is checked, not trusted (Law 1);
- **null the whole triple whenever `activity` is present in the delta.** A
  target switch voids the fight. Otherwise a player banks a nearly-dead dragon,
  switches to slimes, switches back, and finishes it — and worse, could bank one
  low-HP fight and re-enter it repeatedly if the reset were ever incomplete;
- null it when `active_kind <> 'combat'`.

`computeAccrual` gains two symmetric changes: it seeds `state.monsterHp` /
`monsterMaxHp` / `combatKillsThisFoe` from the input instead of from zero, and it
emits the end-of-span values into `delta.fight`. Both guarded by
`fight_monster === activeId`; a mismatch starts fresh (fail-closed, and the only
direction that can be wrong is a small under-payment).

Absent columns → `hr_state_of` returns undefined → the engine starts fresh and
**omits `fight` from the delta**, byte-for-byte today's behaviour. Same
self-configuring switch `tool_carry` uses; no flag, no ordering hazard between
the migration and the deploy.

### 2.3 Error taxonomy

No new codes. `below_min_span` becomes the ordinary answer to a settle that
fired early and the client must treat it as a non-event (§3.4).

---

## 3. Q1 — TRIGGERS AND CADENCE

### 3.1 The recommendation

| trigger | when | notes |
|---|---|---|
| **interval** | every **90 s** while the tab is visible AND an activity is set | not 60 |
| **activity switch** | already exists — `set_activity` collects first | unchanged |
| **tab hide / close** | `visibilitychange`→hidden, `pagehide` | `fetch(..., {keepalive:true})` |
| **reconnect** | on `online`, and on auth-token refresh | reuses the existing gate/backoff |
| **cold load** | already exists (`processOffline` → `beginServerAccrual`) | unchanged |
| **before any value-moving intent** | market/shop/claim | see §3.5 |

### 3.2 Why 90 s and not 60 s

`ACCRUE_MIN_MS` is exactly 60,000 ms and 59,999 ms is refused (P1, measured). A
60-second timer is *on the boundary*: `setInterval` drift, a throttled background
tab, and the round-trip latency of the previous settle all push a real span below
the floor, and every one of those lands `below_min_span` — a wasted invocation, a
wasted rate-gate spend, and a settle that silently did not happen. 90 s clears
the floor by 50 % with no tuning, costs 0.67 calls/min against a 30/min budget,
and measured within ±1.8 % of a single window (P2).

**On Security's prior ruling** ("`ACCRUE_MIN_MS` floor becomes one action, gated
on `hr_rate_gate` sizing"): the ruling is honoured *without touching either
number*. Setting the cadence above the existing floor achieves what lowering the
floor was meant to achieve, and leaves the floor in place as the second line of
defence against a client that settles in a loop. **Recommendation: do not lower
`ACCRUE_MIN_MS` and do not re-size the gate.** Both are already correct for this
workload, and the gate is the cheapest thing standing between a compromised
client and 240 writes/minute.

### 3.3 Tab close — `sendBeacon` is UNUSABLE, and this is a hard fact

`navigator.sendBeacon` **cannot set an `Authorization` header.** `index.ts`'s
only identity is the bearer JWT (`verifyJwt(bearerOf(req.headers.get(...)))`),
and there is no query-parameter or body token path — deliberately, and it must
not gain one. A beacon therefore arrives as `not_signed_in`, 401.

Use `fetch(url, {..., keepalive: true})` instead. It carries headers, survives
document unload in every browser that ships `sendBeacon`, and is subject only to
a 64 KB body cap — our body is `{"slot":0}`. CORS is already correct
(`cors.js` allows `authorization`, `apikey`, `content-type` and answers
`OPTIONS` itself); a keepalive POST is an ordinary CORS request and the deployed
preflight already passes it (`tests/cors-preflight.mjs` C4).

**Cost, stated:** a keepalive fetch is best-effort. A hard tab kill or an OS
process kill loses it. That costs the player nothing — the window is simply
still unpaid, and the next login's cold-load accrual pays it as away time. The
only loss is the blessing channel on that final ≤90 s (§4).

### 3.4 `below_min_span` is a non-event

Today `accrue.js` classifies `accrued:false` as outcome `'nothing'`, which
resets the gate and is correct. Under live settlement it will be the *modal*
answer — every settle that races an activity switch, every retry, every
visibility flap. It must not surface to the player, must not reset the away
receipt, and must not clear `lastOfflineSummary`. Regression required.

### 3.5 Settle before a value-moving intent

`shop_buy`, `vendor_sell`, `market_list`, `market_buy`, `claim_reward` all
declare `collectsFirst: false` — correctly, because their deltas carry none of
`STAMPING_DELTA_KEYS` and so confiscate nothing. That stays true. But under live
settlement there is a *second* reason to settle first, and it is a UX one: a
player who has 40 unpaid seconds of gold on the client and spends it will have
their purchase refused `insufficient_gold` once gold is server-of-record. The
client should fire a settle and await it before a spend gesture. **This is a
client-side sequencing rule, not a registry change** — do not flip
`collectsFirst`, which would make every purchase confiscate on a refused collect.

---

## 4. Q3 — PRESENCE AND THE BLESSING CHANNEL

`AWAY_SCOPE` excludes exactly one channel from away pay: `blessing` (rotating
daily/weekly blessings and world events, presence-gated by Tyler's b227
direction). Everything else — permanent, crit, BotD, heal, and, since the b351
scope consolidation, **timed consumable buffs** — already pays away. So the
presence question is narrow: it is about `blessing` and nothing else.

**A client "I was here" claim is forgeable and must never be sent.** There is no
`present: true` field, ever.

**Recommendation — the settle call IS the evidence, bounded by a window:**

```
blessedMs = min(grantMs, PRESENCE_WINDOW_MS)      // PRESENCE_WINDOW_MS = 270_000 (3× cadence)
```

`simulateSpan` already resolves BotD per UTC-day segment; the blessing channel
gets the same treatment against `blessedMs` — the first `blessedMs` of the
credited window pays blessings, the remainder does not.

Properties:

- A player settling every 90 s gets **100 % blessing pay**, because
  `grantMs ≈ 90 s < 270 s` on every call.
- A player who closes the tab for eight hours gets blessing on **4.5 minutes**
  of a twelve-hour grant — 0.6 % — which is indistinguishable from today's zero
  and preserves the b227 ruling in substance.
- **The abuse bound is explicit and acceptable:** a forger must keep an
  authenticated session posting every 90 s. That is a real session with a real
  JWT burning a real rate budget, which is precisely the thing "presence" is
  supposed to mean. They gain the blessing multiplier over an idle player — a
  bounded percentage lift, not an unbounded mint. This is Idle Clans' own bound.
- **No new state.** No heartbeat table, no `last_seen_at` column, no second
  freshness clock to skew. The bound is derived from `grantMs`, which the server
  computed from its own clock.

**Rejected alternative — a heartbeat table.** A `player_presence` row updated
every 90 s is one more write per settle (doubling the write cost in §9), one
more thing to lie about, and it is *strictly weaker*: it is forgeable by exactly
the same script, and it adds a state a settle could disagree with.

⚠ **ROUTE TO SECURITY.** Their questions to answer: (a) is the value of the
blessing lift × 8 h of scripted settling worth the cost of running the script,
at the top of the blessing table? (b) does `PRESENCE_WINDOW_MS = 3× cadence`
leak a way to get *more* than 100 % — e.g. by settling at 269 s intervals and
being paid blessing on every millisecond of a span that a present player would
also be paid for? (Answer as designed: no, `min()` caps it at the span, so the
maximum is 100 % and a slower settler gets a *smaller* fraction. But it should
be their finding, not mine.) Not to be shipped without their verdict.

---

## 5. Q2 — THE PREDICTION SEAM

### 5.1 The problem

`src/legacy.js`'s live tick mutates `G.skills`, `G.inventory` and `G.gold`
directly at dozens of sites. `record.js`'s ordering rule is explicit:

> **a field may move only after EVERY path that mutates it has moved**

and its table names `skills xp` as movable "after the activity intents",
`inventory qty` "after craft/gather intents". Live settlement is what satisfies
both entries — but only once the client stops writing them.

The b359 max-merge exists because that ordering was violated in the other
direction: envelopes arrived describing a server that had never seen live play,
and replaced live-earned progress with it. `Math.max` on every named key was the
correct emergency response and is explicitly temporary.

### 5.2 Phase 1 — settle, keep predicting, keep the merge, **fix consumption**

Client mutation stays. The b359 max-merge stays. Interval settling is added.
Live gains become server-recorded within ~90 s and nothing regresses — the
max-merge means the server's number can only ever raise the client's.

**But the max-merge cannot see a consumption, and that is Q6.** A settled span
*spends*: auto-eat food today, artisan inputs when `artisan` settles, ammunition
when E1 lands. `applyEnvelopeState`'s inventory loop is
`inv[k] = Math.max(have, q)`, whose own header states the cost: *"an item the
server legitimately CONSUMED while he was away will not be deducted from the
client copy."* Away, that fires rarely. Settling every 90 s makes it fire
**every 90 s**, and a duplication that fires 320 times a day is a faucet.

**The Phase-1 fix, and it is small:** the away receipt already carries the
signed item delta the server applied. Apply **debits absolutely, credits by
max**:

```js
// applyEnvelopeState, inventory loop
const consumed = negativeKeysOf(res.away && res.away.items);   // ids the server DEBITED
for (const k of Object.keys(res.inventory || {})) {
  const q = Number(res.inventory[k]);
  if (!Number.isFinite(q) || q < 0) continue;
  const have = Number(inv[k]) || 0;
  inv[k] = consumed.has(k) ? q : Math.max(have, q);   // debits win, credits merge
}
```

This is exact, not a heuristic: a key the server says it *spent* is a key the
server's number is authoritative for, because the client cannot have spent it on
the server's behalf. It keeps every byte of the b359 protection for the keys the
incident was about (drops the server never saw) and closes the double-keep for
the keys it was never about. It also does not depend on `SERVER_OF_RECORD`
moving, so it ships in Phase 1.

Residual, stated: an item both credited and debited in one span nets to a single
positive envelope key and is treated as a credit (merged). That is the safe
direction — it can only under-deduct by at most the amount the same span
credited, and it is gone at Phase 2.

### 5.3 Phase 2 — the flip to absolute

When live drops, XP and gold are all server-authored, the envelope names every
key it owns, omission stops being ambiguous, and `applyEnvelopeState` reverts to
**absolute replacement** — which is what `record.js`'s rule was always waiting
for. `skills` and `inventory` join `SERVER_OF_RECORD`. The client's tick becomes
pure display: it computes numbers to *animate towards*, and every envelope is the
truth.

**Flip condition, stated as a checkable predicate rather than a feeling:**
Phase 2 may flip only when, for a full day of live beta play, **no envelope
names a key whose client value exceeds it** — i.e. `describeReplacement()`
returns `destructive: false` for every applied envelope. That function already
measures exactly this and is already called on every apply; Phase 1 should start
*recording* its verdict (a counter, not a ledger row) so the flip is gated on a
measurement instead of a judgement call.

### 5.4 What tests flip, and when

| test | today asserts | flips at | becomes |
|---|---|---|---|
| **B359-1** | envelope omission leaves a key alone; named keys take `max` | Phase 2 | envelope replaces wholesale; an omitted key is DELETED |
| **b337 / B339-5** (replacement-ack) | a destructive apply is refused until acknowledged | Phase 2 | retired — with the client no longer holding a rival copy, there is nothing to consent to; the sheet becomes unreachable |
| **AWAY-1** (parity) | a seeded fight is byte-identical `away:true`/`false` | never | unchanged, and it becomes the load-bearing test of the whole model |
| — | — | Phase 0 | **new: `SETTLE-1`** a 20-minute kill settled every 90 s pays the same kill as one 20-minute window (the P3 regression) |
| — | — | Phase 1 | **new: `SETTLE-2`** a settle that debits food reduces the client copy (the §5.2 fix, mutation-proven by reverting to plain `max`) |

⚠ The Phase-2 flip of B359-1 is the one place this spec asks a test to *invert*.
That is legitimate only because the contract inverts with it and the flip
condition in §5.3 is measured. It must ship in the same commit as
`SERVER_OF_RECORD` gaining `skills`/`inventory`, never before, and the commit
must state the measurement.

---

## 6. Q4 — DIVERGENCE

The client and the server run the *same* `simulateSpan` over the *same*
`src/core` — but from different seeds, so they will not agree kill-for-kill.

**The rule: the server's answer is the record; the client's is an animation.**
Nothing reconciles "mid-fight", because there is nothing to reconcile — the
client's fight is a rendering.

| divergence | what happens | what the player sees |
|---|---|---|
| client predicted a drop the server didn't roll | envelope omits it; Phase 2 deletes it | Phase 1: it survives (max-merge) — a known, temporary over-show. Phase 2: it disappears at the next settle |
| server rolled a drop the client didn't | envelope names it; both phases credit it | it appears |
| HP mismatch mid-fight | envelope's `hp`/`max_hp` are absolute in BOTH phases already | the health bar corrects, up to once per 90 s |
| client predicted death, server survived | server's `active_kind` still combat | the client's death animation is undone by the envelope — **jarring; Designer owns it** |
| server died, client alive | the accrual delta idles the pointer; the receipt carries `died:true` | "you fell" |

**Recommended feel rule, flagged to the Game Designer, not decided here:** never
roll a visible number *down* inside an animation. Reconcile downward silently at
the next natural boundary (a kill, a screen change); reconcile upward
immediately. The one exception is HP, which must be honest instantly, because a
player fighting on a health bar that lies will die and blame the server.

**Death prediction should simply be removed from the client tick.** It is the
only divergence with no non-jarring resolution, it is rare, and the client has no
reason to guess at it — it already renders a server-declared death correctly from
the away path (`legacy.js:3217`, the branch that deliberately makes NO
`set_activity` call because the server already idled the pointer).

---

## 7. Q5 — CAPS, WATERMARKS AND SKEW

- **The offline cap cannot bite an active session, by arithmetic.** `grantMs =
  min(elapsedMs, sinceActivityMs, capMs)` with `capMs ≥ 12 h`, and continuous
  settling holds `elapsedMs ≈ 90 s`. `capped` is `elapsedMs > grantMs`, which is
  false. No change needed, and Ruling 2's `creditWindow` is a no-op on a short
  span (`W + grantMs === now`) — verified in the ruling's own text and
  structurally in `creditWindowGuard`.
- **`active_since` is not touched by a settle.** Only `accrued_to` moves. That
  is already true: `hr_apply` stamps `active_since` from `now()` only on
  `restart: true`, which a settle never sends. So the `sinceActivityMs` clamp
  keeps working across an arbitrarily long chain of settles.
- **Clock skew is structurally impossible.** The client's timer is a *trigger*,
  never a measurement: the request body is `{"slot": N}` and contains no
  timestamp. Both ends of the span come from `select now()` in Postgres. A client
  with a clock a year fast settles at the wrong wall time and is paid the correct
  amount.
- **The `below_min_span` remainder is never lost.** Unlike the client's
  watermark, the server's `accrued_to` is left alone on a refusal, so an early
  settle simply means the next one prices a longer span (`accrual.js` states
  this explicitly). Only an `activity` delta discards a remainder, and that is
  bounded at <60 s per switch — the pre-existing trade recorded in `intents.js`.

---

## 8. Q7 — WHAT RETIRES, AND ON WHAT CONDITION

| thing | where | flip condition |
|---|---|---|
| **b359 max-merge** (`applyEnvelopeState` skills + inventory) | `src/net/accrue.js:712-742` | Phase 2 — `describeReplacement()` returns `destructive:false` for a full day of live beta play. Replaced by absolute assignment. |
| the max-merge's **consumption hole** | same block | **Phase 1**, by §5.2. Does not wait for Phase 2. |
| **B359-1** test form | smoke suite | Phase 2, in the same commit as the merge. Inverts to "omission deletes". |
| **b337 / B339-5** replacement-ack sheet (`ACCRUE_REPLACE_*`) | `src/net/accrue.js:569-630, 897-980` | Phase 2. Once the client holds no rival copy, `describeReplacement` is permanently non-destructive and the sheet is dead code. Delete it; do not leave an unreachable modal. |
| `describeReplacement` itself | same file | **Keep**, repurposed as the Phase-2 flip *gate* (§5.3) and then as a permanent drift detector. It is the only thing that measures client-vs-server divergence. |
| `stampAwayWatermarks` / `G.offlineBudget.at` / `G.restedAt` | `accrue.js:155` | Phase 2 — `offlineBudget` is already on `SERVER_OF_RECORD`; the kill switch is what keeps them alive. Retires with the switch. |
| **`ACCRUE_KILL_KEY`** kill switch | `accrue.js:115` | **Not in this programme.** It is the incident lever and it must outlive the flip. |

---

## 9. Q8 — COST

Assumptions: 8 active hours/player/day, 90 s cadence ⇒ **320 settles/player/day**
(plus ~20 switch/cold-load calls; call it 340).

| | 20 players (today) | 600 players (100×) |
|---|---|---|
| settle calls/day | 6,800 | 204,000 |
| Edge invocations/month | 204,000 | **6.1 M** |
| `hr_apply` writes/day | 6,800 | 204,000 |
| **`player_ledger` rows/day, naive** | 6,800 | **204,000** |
| ledger bytes/day, naive (436 B/row measured, ~600 B with indexes) | 4 MB | **122 MB/day → 3.7 GB/month** |

Edge invocations at 600 players exceed Pro's 2 M/month included, at roughly
$2/M — about **$8/month**. Not a blocker.

**The ledger is the blocker, and it is the mistake CLAUDE.md names**
(`game_events` reaching 1.6 M rows / 229 MB from six players in four days).
122 MB/day of journal is that failure at ledger scale.

### 9.1 ⚠ THE LEDGER CANNOT BE ROLLED UP AFTER THE FACT

Verified against production: `player_ledger` carries
`hr_ledger_immutable` (BEFORE DELETE OR UPDATE, FOR EACH ROW) and
`hr_ledger_no_truncate` (BEFORE TRUNCATE). There is **no** post-hoc
aggregation path. An hourly rollup cron is not available. Aggregation must
happen **before the insert**.

### 9.2 The aggregation rule

**One ledger row per (user, slot, ledger kind, UTC hour).** Achieved with a
mutable accumulator that the immutable ledger reads from:

```
player_accrual_open (user_id, slot, kind, hour_key, gold, xp jsonb,
                     qty, kills, spans, opened_at)
  primary key (user_id, slot, kind, hour_key)
```

`hr_apply`, on an accrual delta, UPSERTs into this table instead of inserting a
ledger row, and flushes an *older* `hour_key` for the same character into
`player_ledger` as it goes (a settle at 14:00:03 flushes the 13:00 row). A
flush also fires on an activity switch, on a `no_character`/idle transition, and
from a low-frequency cron for characters that stopped settling. `hour_key` is
`date_trunc('hour', now())` — server clock, naturally.

- Rows/day at 600 players: 600 × 8 = **4,800** (~2.9 MB/day). A 42× reduction.
- The audit property survives: gold, XP and quantities are **summed, not
  sampled**, `spans` records how many settles composed the row, and every value
  transfer is still reconstructible. Journal rule 6 asks for value transfers and
  aggregates, never per-tick — this *is* the aggregate.
- ⚠ **`hr_day_budget_check` reads the ledger** (`gold_in`/`xp_in`/`qty_in`) to
  enforce the daily ceiling. Moving accrual sums out of the ledger and into an
  open row **breaks the budget** unless the check reads both. This is the single
  most dangerous detail in §9: the budget is the last clamp on a compromised
  engine. `hr_day_budget_check` must sum `player_ledger + player_accrual_open`
  for the current day, and the migration's self-check must prove the ceiling
  still refuses at exactly the limit with an open row carrying part of the total.
- `player_accrual_open` is written only by `hr_apply` (SECURITY DEFINER), has no
  client grant, and is born fail-closed under the batch-5 default ACL.

### 9.3 Phase 1 without the accumulator

Phase 1 at 20 beta players is 6,800 ledger rows/day ≈ 4 MB/day. That is
survivable for a bounded beta but not for a month. **Recommendation: Phase 1
ships with a cadence of 90 s and the naive one-row-per-settle journal, and Phase
3 (the accumulator) is scheduled before player count leaves single digits ×2.**
State the burn rate in the Phase-1 change contract so it is a scheduled debt and
not a discovered one.

---

## 10. THE PHASED PLAN

Each phase is independently shippable and leaves the live beta green.

### PHASE 0 — IN-FIGHT STATE (the prerequisite) — ~2–3 days

**Ships:** `player_state.fight_monster/fight_hp/fight_kills`; the `fight` delta
key in `hr_apply` with server-side re-clamping and the void-on-activity-change
rule; `computeAccrual` seeding and emitting it; `hr_state_of` projecting it.

**Why first:** without it, live settlement makes long fights pay zero (P3).
Shipping settling before this is shipping a regression.

**Test contract:**
- `SETTLE-1` — a 20-minute-per-kill target settled every 90 s pays the same
  kills as one 20-minute window. Mutation-proven by removing the seeding.
- `SETTLE-1b` — a `set_activity` switch mid-fight VOIDS the fight; re-declaring
  the same target starts at full monster HP. Mutation-proven by removing the
  null-out.
- `SETTLE-1c` — a hostile `fight_hp` (negative, above max, naming a different
  monster) is clamped/voided by `hr_apply`, not by the engine.
- migration self-check: no client write policy on the new columns; `hr_apply`
  still not executable by `authenticated`/`anon`.

**Security gate:** REQUIRED, and it is the important one. The exploit question:
*can a player bank a nearly-dead high-value boss and re-enter it cheaply?* The
void-on-switch rule is the answer and Security must try to get round it.

**Verified on a branch before merge**, per the standing rule.

### PHASE 1 — INTERVAL SETTLING — ~2 days

**Ships:** a 90 s settle timer in the client (visible tab + activity set);
`keepalive` settle on `pagehide`/`visibilitychange`; settle on `online`;
`below_min_span` treated as a non-event; the §5.2 consumption fix; a counter
recording `describeReplacement().destructive` for the Phase-2 gate. **No server
change at all.** No migration. No new verb.

**Test contract:**
- `SETTLE-2` — a settle that debits food reduces the client copy (mutation:
  revert to plain `max`, goes red).
- `SETTLE-3` — `below_min_span` does not clear `lastOfflineSummary`, does not
  surface a sheet, does not reset the away receipt.
- `SETTLE-4` — the unload settle builds a request with an `Authorization`
  header and `keepalive: true` (asserted on the literal bytes, `accrue.js`'s
  own rule). A `sendBeacon` call site fails the build.
- `SETTLE-5` — the timer does not run with no activity set, and does not run
  while `document.hidden`.

**Security gate:** LIGHT — the wire is unchanged and the rate budget is
unchanged. One question: does a 90 s timer plus the unload settle plus a
reconnect storm ever exceed 30/min? (Arithmetic: no. Get it confirmed.)

### PHASE 2 — THE PREDICTION FLIP — ~3–4 days

**Ships:** `skills` + `inventory` (+ `gold`, if the UNKNOWN-balance accessor has
landed) onto `SERVER_OF_RECORD`; `applyEnvelopeState` reverts to absolute
replacement; b359 max-merge deleted; B359-1 inverted; the replacement-ack sheet
deleted; the client tick demoted to display prediction (death prediction
removed, §6).

**Gate to enter:** §5.3's measured predicate — a full day of live beta with
`destructive:false` on every envelope.

**Security gate:** REQUIRED. This is where a forged client value stops being
able to survive a round trip at all, and it is where the biggest client surface
changes.

### PHASE 3 — THE LEDGER ACCUMULATOR — ~2–3 days

**Ships:** `player_accrual_open`; `hr_apply` UPSERT + flush; the
`hr_day_budget_check` dual-source fix (§9.2, load-bearing); a flush cron.

**Gate to enter:** before player count doubles, or before the beta runs a month
— whichever is first.

**Test contract:** the daily budget still refuses at exactly the limit with the
day's total split across the ledger and an open row (mutation: read only the
ledger, ceiling silently doubles, goes red). One ledger row per character-hour
asserted by count. Ledger immutability still holds.

**Security gate:** REQUIRED — it moves the daily budget's source of truth.

---

## 11. WHAT I VERIFIED, AND WHAT I DID NOT

**Verified by execution** (`node tools/probe-live-settle.mjs`, plain Node against
the repo's deployed-engine source):
- `ACCRUE_MIN_MS = 60000`; 59,999 ms refused `below_min_span`; 60,000 ms pays.
- Slicing bias for combat is within ±1.8 % across 60/90/120/300/900 s cadences,
  40 seeds, no consistent sign.
- **P3: a 20-minute kill pays 0 at every cadence tested.** This is the finding.

**Verified by read-only query against production** (`nezapsylztqbbwuwembx`, no
writes, no migration applied):
- `hr_rate_gate` limits: accrue 30/min, activity 30/min, shop 30/min, claim
  20/min. 45× headroom at a 90 s cadence.
- `player_ledger`: 109 rows, 160 kB total, **436 B mean heap row**.
- `player_ledger` carries `hr_ledger_immutable` (DELETE/UPDATE) and
  `hr_ledger_no_truncate`. **Post-hoc rollup is impossible.**

**Verified by reading source, not by running it:** that `sendBeacon` cannot
authenticate (`index.ts` reads identity only from the `Authorization` header;
`cors.js` allows the header on a real fetch). The keepalive-fetch path has **not**
been exercised against the deployed function.

**NOT verified, and each needs Tyler or a live account:**
- **That the deployed function pays a real 60–90 s live span end to end over
  HTTP.** This needs a real user JWT (`tools/switch-on-test.mjs` /
  `tools/probe-intent.mjs` prompt for a password on stdin). The engine is proven;
  the transport for *this cadence* is not. **Run it before Phase 1 merges.**
- Whether a real browser's `pagehide` keepalive settle survives a tab close on
  the deployed CORS config.
- The row-size estimate for an *accrual* ledger row specifically — 436 B is the
  mean over a mixed population of 109 rows, most of them admin fixtures. An
  accrual row's `meta` is larger. Treat §9's byte figures as a lower bound.

---

## 12. KNOWN LIMITATIONS AND OPEN ITEMS

1. **Equipment is read at collect time and prices the whole window** (review S5,
   `accrual.js`'s own header: measured 12.8× gold / 20× XP naked→BiS on a 12 h
   window). Live settlement **shrinks this to ~90 s of exposure**, which is a
   large incidental win, but does not close it. It closes with the equip intent.
2. **The perk stack has the same shape** and the same 90 s shrink.
3. `killMonster`'s five client wrappers (dungeon keys, companions, pets,
   collection log, chronicle) still have no server model, so a settled kill does
   not feed them. Under the 2026-08-15 ruling these are must-close, not
   tradeoffs. Not in this spec's scope; named so it is not rediscovered.
4. Combat **style** is still not server state; a settled span uses the weapon
   family default. Changes XP *routing*, never the total.
5. `artisan` settling inherits the `noBurn` / `benchPayable` hold-back unchanged.
6. Settling does not make the client's *displayed* number correct between
   settles — it makes it correct within 90 s. That is the whole trade, and it is
   Idle Clans' trade.

---

## 13. REVERSIBILITY

- **Phase 0** — additive columns, nullable, engine self-configures on their
  absence (the `tool_carry` pattern). Reverting the Edge payload leaves the
  columns unread. Fully reversible.
- **Phase 1** — client-only. The `ACCRUE_KILL_KEY` switch already drops one
  player back; a redeploy drops everyone. Fully reversible.
- **Phase 2** — the one-way door. Once `skills`/`inventory` are
  `SERVER_OF_RECORD` and the client stops writing them, reverting means the
  client resumes authoring progression. Reversible only *at* the flip; treat it
  as a release with a rollback window, not a toggle.
- **Phase 3** — additive table; the flush is idempotent; the ledger is
  append-only either way. Reverting means going back to one row per settle.
