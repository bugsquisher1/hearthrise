# World tick — service design (step 1: read-only shadow)

Written 2026-09-16 by the Backend Architect, for step 1 of the sequence in
`docs/planning/LIVE_WORLD_BRIEF.md`. Tyler's decisions of 2026-09-16 are the
frame: an always-on host is approved in principle (the exact monthly figure
still needs approval before purchase), the tick is **10 s for the beta with 5 s
as a config change**, and this program displaces the feature track.

Authority order is unchanged: `CLAUDE.md` §1 wins over anything here. Nothing in
this document proposes that a client author a value, and nothing proposes that
the tick become a new owner of value.

**Status: SHADOW. Nothing described here writes to production.** The spike in
`services/world-tick/` has no Supabase client, no `fetch` and no credential.
The parity guard is `node tests/world-tick-parity.mjs`.

The client half of this contract is the systems-engineer lane's
`docs/planning/CLIENT_PREDICTION_RETIREMENT.md`; where the two documents touch
(the push frame, §7, and the sequencing, §7a) that document's measurements are
authoritative and are quoted here rather than re-derived.

---

## 0. The one-sentence architecture

**The world tick is not a new engine and not a new authority — it is a new
*caller* of the engine the Edge Function already runs, on a clock instead of on
a request.**

Everything below follows from that sentence. If a decision here would have made
the tick compute a number the accrual path does not compute, or write a value
the accrual path is not allowed to write, the decision is wrong.

```
            today                                  after step 2
   client ──intent──▶ hr-accrue (edge)      client ──intent──▶ hr-accrue (edge)
                         │                                        │
                    computeAccrual                           computeAccrual
                         │                                        │
                      hr_apply  ◀── the only writer ──▶        hr_apply
                         │                                        ▲
                     Postgres                                     │
                                                          world-tick (Node)
                                                             computeAccrual
                                                             on a 10 s clock
```

Two callers, one engine, one writer. The edge keeps its job (intents, and
catch-up on reconnect); the tick takes over "what happened while nobody asked".

---

## 1. Process model

**One Node process per shard. No framework, no worker pool, no queue.**

| Property | Choice | Why |
|---|---|---|
| Runtime | Node 20+, pure ESM | `src/core/*` and `supabase/functions/hr-accrue/*.js` already import cleanly in Node — `tests/accrual-engine.mjs` has run them there since Phase C. No bundler, no transpile, no second copy. |
| Concurrency | single-threaded event loop; the simulation is synchronous | The simulation is pure CPU over small objects. At the measured cost (§12) one core carries the whole beta and then some. A worker pool would buy nothing and would introduce a second clock. |
| Shard | one process owns a disjoint set of characters | §9. |
| Restart | stateless by design — hydrate from `hr_state_of`, not from a local file | The tick holds *no* durable state of its own. A crash loses at most one settle interval, and that interval is recovered by the accrual path on rehydrate (§9). This is the single most important operational property and it is free, because accrual-on-return already exists and is deterministic. |
| Deploy | container image, one process, no local disk | The image contains the repo's `src/`, `services/` and `supabase/functions/hr-accrue/`; the payload hash is pinned the way `tools/pack-edge.mjs` already pins the edge payload. |

### The loop

```
every CADENCE_MS (10_000, config):
  t = Date.now()                       # the host clock, §9
  for each character in the active set:
      w = alignWindow(session.anchorMs, char.accruedToMs, t, char.tickMs)
      if w.ms <= 0: continue           # not a whole combat tick yet
      res = computeAccrual({ ...char, accruedToMs: w.fromMs, nowMs: w.toMs, ... })
      if !res.accrued: record the refusal reason; continue
      char = advance(char, res)        # in memory
      pending.push({ char, res })
  if (settleDue(t)) flushToPostgres(pending)   # §5
  pushFrames(pending)                  # §7
```

That loop is `services/world-tick/shadow.js` `shadowSpan()` today, with
`flushToPostgres` absent and `pushFrames` replaced by `console.log`.

---

## 2. Loading the active set

**The active set is "characters with a payable activity pointer", and it is a
server fact, not a connection fact.** A character keeps hunting with its tab
closed — that is the whole point of the program — so "who is online" is the
*push* question, not the *simulate* question.

```sql
-- hr_tick_roster(p_shard int, p_limit int) → setof the tick's hydration rows
-- SECURITY DEFINER, executable by hr_tick ONLY.
select user_id, slot, active_kind, active_id, active_since, accrued_to, version, ...
  from public.player_state
 where active_kind = any (array['combat','gather','artisan'])   -- = PAYABLE_KINDS
   and accrued_to > now() - interval '24 hours'                 -- = ACCRUE_MAX_SPAN_MS
   and hr_shard_of(user_id) = p_shard
```

- `PAYABLE_KINDS` is **read from `accrual.js`**, never retyped in SQL. The
  roster function takes the array as a parameter supplied by the tick, and a
  `do $$` block in its migration asserts the array it defaults to matches the
  generated catalogue — the same drift-guard discipline as
  `tools/gen-catalogues.mjs`.
- A character past the 24 h cap is **dropped from the roster**, not simulated to
  zero: their next window is worth nothing and the accrual path already forfeits
  the tail. This is what keeps the roster proportional to *active* players and
  not to *registered* players, and it is the difference between a 600-row set
  and a 200,000-row set.
- Hydration is the **full `hr_state_of` envelope** — the same projection the
  client applies — so "what the tick holds" and "what the player sees" are one
  object. The tick never assembles a character out of parts.
- Re-hydration is event-driven, not polled: an accepted intent bumps `version`,
  and the tick learns about it through the version check in §10.

---

## 3. Running the existing engines

The tick calls **`computeAccrual` from `supabase/functions/hr-accrue/accrual.js`
and nothing else.** That function is already the only thing that knows how to
turn (server state, server clock) into a proposed delta, and it already reaches
through to every engine the brief lists:

| Engine | Reached via | Notes |
|---|---|---|
| `src/core/combat-sim.js` | `computeAccrual` combat branch → `simulateSpan` | The same function the live 2.4 s tick runs (`AWAY-1`). |
| `src/core/skill-sim.js` | `accrueGather` | gather branch |
| `src/core/artisan-sim.js` | `accrueArtisan` | bench branch, `benchPayable()` gate intact |
| `src/core/away.js` | `creditWindow`, `utcDaySegments`, `recoveryRefuses`, `AWAY_SCOPE` | The credited-window anchor and the recovery rule are unchanged — the tick's windows are short, so `creditWindow` is an identity on them, which is exactly why decomposition is *possible*. |
| `src/core/buffs.js` | `buffQueueFromServer` / `tickBuffs` inside `simulateSpan` | Buff clocks drain on the tick's own instants. |
| `src/core/auto-eat.js` | `chooseFood` / `resolveAutoEat` via `fx.autoEat` | unchanged |
| `src/core/farm.js` | **not yet** — farm growth is not a `PAYABLE_KIND` | Farming stays on its own RPCs in step 1; out of scope until combat is proven. See §14 open question 3 — I think it should be the *first* channel, on cost-of-being-wrong grounds. |
| `src/core/rng.js` | `createRng(inp.seed)` inside `computeAccrual`, seeded per window from a watermark label | §11. No change needed — the tick reuses the edge's seeding mechanism verbatim. |

There is no second path. `services/world-tick/shadow.js` is ~140 lines and
contains no arithmetic on a game value; guard `P1` in
`tests/world-tick-parity.mjs` asserts byte-identity of its proposed delta
against an independently-constructed accrual call for the same window.

---

## 4. Mapping a tick onto the RPC contract that already exists

**The tick does not get an RPC of its own for value.** Its output is the same
`delta` object `hr-accrue/index.ts` hands `hr_apply` today, with the same keys
and the same clamps, and it goes through `hr_apply` unchanged.

```
hr_apply(p_user uuid, p_slot int, p_version bigint, p_delta jsonb, p_idem text)
       → envelope (the same one hr_state_of projects)
```

What the tick supplies:

| Argument | Tick's value | Why it is safe |
|---|---|---|
| `p_user`, `p_slot` | from the roster row | never from a client |
| `p_version` | the version the tick's in-memory character was hydrated at | §10 — this is the concurrency arbiter. |
| `p_delta` | `res.delta`, verbatim | `hr_apply` re-validates every invariant regardless of caller. It has never trusted the edge and it will not trust the tick. |
| `p_idem` | `tick:<shard>:<user>:<slot>:<windowFromMs>` | §10. |

Three contract notes, all of which are open items rather than done work:

1. **`finalWindow` is the wrong spelling for the tick.** `computeAccrual`
   refuses a window shorter than `ACCRUE_MIN_MS` (60 s) unless
   `inp.finalWindow === true`, a flag whose documented meaning is
   "collect-before-switch: this window has no next call" (b531). A 10 s tick
   window is also a window with no next call, so reusing the flag is
   *semantically* right and the spike does exactly that — but the name will
   read as a lie in six months. **Proposed:** replace the boolean with
   `inp.caller: 'accrue' | 'collect' | 'tick'`, with `'accrue'` keeping the
   floor and the other two exempt. Additive, byte-identical for every existing
   caller, and it makes the journal able to say which caller paid a window.
2. **`set-activity.js` is unchanged.** Start/stop stay client intents through
   the edge. The tick observes the pointer; it never moves it — except through
   the `delta.activity = {kind:'idle'}` the *engine itself* proposes when a run
   retreats or a monster is gone, which is existing engine behaviour and is
   re-clamped by `hr_apply`.
3. **`intents.js` is unchanged.** Every player-initiated value movement keeps
   going through the edge. The tick has no intent surface at all — it accepts
   no input from anyone. That is a deliberate and large reduction in exploit
   surface versus a "tick server that clients talk to".

---

## 5. What the tick writes in shadow mode: **nothing**

Enumerated, because "nothing" is a claim that has to be checkable:

- no `hr_apply` call, no `hr_*` RPC call of any kind;
- no Supabase client is imported anywhere under `services/world-tick/`;
- no `fetch`, no `node:net`, no `node:http`;
- no file is written; the fixture JSON is read-only;
- the roster is a **JSON fixture**, not a production read, so the spike cannot
  even observe a real player.

The shadow output is a proposed delta that is compared and discarded. The
comparison is the deliverable.

### Journalling, when it stops being shadow

**One journal row per SESSION, plus one per value transfer. Never one per tick.**
This is the `game_events` lesson made into a number: 1.6M rows / 229 MB from six
players in four days by journalling every kill. A per-tick journal is strictly
worse — at a 10 s cadence one character generates **8,640 rows/day**, so 600
active characters generate **5.2M rows/day** and 10k DAU generates ~**86M
rows/day**. That is not a tuning problem, it is a different product.

The rule:

| Event | Rows |
|---|---|
| A tick window settles | **0 ledger rows.** The state write carries the value; the journal does not. |
| A settle flush (§9, default 60 s) | 1 `player_intents`-class row per character per flush, with `meta = {ms, ticks, kills, ate, from, to}` aggregated over the flush — i.e. exactly today's accrual journal shape, at roughly today's cadence, unchanged. |
| A death | 1 row (already: `MAX_DEATH_ROWS`, ladder-bounded) |
| A rare drop / hearthfind | 1 row (already) |
| A session start / stop | 1 row each |

Net effect: **the tick does not increase journal volume at all** versus today's
~90 s settle cadence. That is the design constraint, not a hoped-for outcome.

---

## 6. The parity gate

`node tests/world-tick-parity.mjs`. Five claims, `AWAY-1` in shape: the same
inputs must produce the same answer whichever path computed them.

| Claim | Statement | Status |
|---|---|---|
| **P1 construction parity** | The input object the tick builds for `computeAccrual` yields a **byte-identical** `delta` and value summary to the input the accrual path builds for the same window. | **green** |
| **P2 time conservation** | A span settled as N tick-aligned windows simulates exactly as many combat ticks as the same span settled in one call, and the unsettled tail is `< tickMs` (deferred, never forfeited). | **green** |
| **P2b checkpoint continuity** | Window *i* is handed window *i-1*'s `fight`, `consec_falls` and `recovering_until` checkpoints, asserted on the input the engine actually received. | **green** |
| **P3 the alignment rule bites** | The same span settled as N **unaligned** 10 s windows simulates measurably **fewer** ticks. Run on every green pass, so RULE 1 is a measurement and not a belief. | **green** (measured loss 4.0% / 6.6% / 15.5% across the three fixtures) |
| **P4 stream health** | A decomposed span starves no drop the one-call span reaches, and its value drift stays inside ±15%. Decomposition resamples the stream; it is not supposed to reproduce the one-call totals (§11). | **green** (drift −1.1% / −5.6% / −4.5%, no starved drops) |

Mutation proofs (`--mutate`), each turning at least one claim red:

| `--mutate --X` | What it does | Kills |
|---|---|---|
| `unaligned` | settles the raw wall-clock cadence | P2 |
| `nofight` | drops the `fight` checkpoint between windows | P2b |
| `capIsCadence` | passes the cadence as `capMs` | P1 |
| `fixedSeed` | seeds every window from one per-character constant instead of from its watermark label | P1, P4 (+48% gold, three drops starved) |

### RULE 1 — tick-aligned windows (the measurement behind P2/P3)

`simulateSpan` budgets a segment as `seg.ms * rate + carryMs`, runs
`floor(budget / tickMs)` ticks and keeps the remainder in **`carryMs`, a local
that is initialised to 0 on every call and is in no checkpoint the delta
carries.** Split a span into windows that are not whole multiples of the
character's `tickMs` and every window silently discards its remainder.

Measured on the spike's fixtures over a ten-minute span at a 10 s cadence:

| Fixture | combat tick | unaligned ticks | correct ticks | loss |
|---|---|---|---|---|
| early-game goblin | 2400 ms | 240 | 250 | **4.0%** |
| maxed vs slime | 2328 ms | 240 | 257 | **6.6%** |
| bow user vs rat | 2112 ms | 240 | 284 | **15.5%** |

The loss is in the **under-paying** direction, which is why it would never be
reported as a dupe and would instead be reported as "away feels worse than
playing" — for a year. The fix costs nothing and needs no engine change: the
tick's **cadence** is 10 s, but the **window it settles** is snapped down to the
last instant that is a whole number of `tickMs` from the session anchor. The
remainder is not lost, it is simply still unsettled, and the next window starts
where this one ended. `services/world-tick/contract.js` `alignWindow` /
`planWindows`.

### The fold law

A proposed delta has three kinds of key; confusing them is a dupe or a loss.
Stated once, in `contract.js`, and it **throws on an unclassified key** — because
a fold that silently dropped a key would agree with a delta `hr_apply` would
have 409'd.

| Class | Keys | Fold |
|---|---|---|
| additive scalar | `gold` | sum |
| additive map | `xp`, `items` | sum per id |
| **absolute checkpoint** | `accrued_to`, `hp`, `fight`, `activity`, `recovering_until`, `ammo_carry`, `tool_carry`, `consec_falls` | last window wins |
| append | `deaths`, `progress`, `hearthfind` | concatenate — **and re-clamp after the fold**, never only per window (`MAX_DEATH_ROWS`, the progress-op cap) |

The fold exists only for the shadow comparison. In step 2 it is **deleted**:
each window goes through `hr_apply`, which already knows each key's arithmetic.

---

## 7. The push channel

**Reuse the envelope, do not invent a protocol.** `hr_state_of` already projects
the object the client applies, and `CLAUDE.md` §6 already says the client
replaces from it and never merges upward. The socket carries the same object.

```
server → client
  { t:"envelope", frame:<n>, v:<version>, state:<full hr_state_of projection> }
  { t:"delta",    frame:<n>, v:<version>, patch:{ ...changed TOP-LEVEL envelope keys } }
  { t:"event",    frame:<n>, kind:"rare_drop"|"level_up"|"death"|"broadcast", ... }

client → server
  { t:"hello", jwt }            # the ONLY client→server message in step 3
  { t:"ack", frame }            # flow control
```

### 7.1 The monotonic frame gate (client-lane finding 1 — load-bearing)

The systems-engineer lane measured that **there is no whole-frame version gate
on the client today**: `isEnvelopeApplicable` only requires `res.version` to be
a finite number (`src/net/accrue.js:286`), and the monotonic rule exists in
exactly one place, for gold — `src/net/gold.js:599`,
`if (env.version < lastVersion) return { stale: true … }`. Under today's
request/response transport that is survivable, because a response is the answer
to a request the client just made. **Under a 10 s push stream it is not**: any
reordering, any duplicate, any late retransmit rewinds state, and the rewind is
silent.

So the protocol above carries **`frame`, a monotonic per-character counter
stamped by the server**, and the rule is stated on the server side of the
contract as well as the client side:

- `frame` is **per character**, not per socket and not global, and it is
  allocated by the process that produced the frame. For tick frames that is the
  shard; for intent-driven frames it is derived from `player_state.version`, so
  the two producers cannot collide (see below).
- **A client applies a frame only if `frame > lastAppliedFrame`.** Strictly
  greater. Equal is a duplicate and is dropped; lower is a reorder and is
  dropped. There is no merge, no "apply the newer fields", no per-key
  comparison — the whole frame is applied or the whole frame is dropped.
- A dropped frame is not a hole to be patched: a `delta` frame always states
  whole top-level envelope keys, so the next frame that touches a key makes the
  client whole again. A client that wants certainty sends `hello` again and gets
  a full `envelope`.
- **Where the client lifts the rule:** the gold gate at `src/net/gold.js:599` is
  the existing, working implementation of exactly this. It moves up one level
  into `isEnvelopeApplicable` (`src/net/accrue.js:286`) so it gates the whole
  envelope rather than one field, and `gold.js`'s own copy is then deleted
  rather than left as a second authority. That is the systems-engineer lane's
  change, not mine; this document's obligation is to guarantee the server
  stamps a counter that makes it possible.
- **Collision between the two producers.** The tick and the edge both cause
  frames. Rather than a second counter to keep in step, `frame` is
  `player_state.version` — which `hr_apply` already bumps on every accepted
  write, from either caller, under the per-character lock. It is already
  monotonic per character and it is already the thing the client's stale check
  would compare. The tick therefore does not allocate frame numbers at all; it
  reports the version `hr_apply` returned. **A tick window that `hr_apply`
  refuses produces no frame**, which is the correct behaviour and is free.

### 7.2 Frames are key-level replaces, never path patches

A path-addressed JSON patch is how "the browser says one thing and the server
says another" comes back: a missed patch leaves a client believing a number the
server does not hold, and the missing-ness is undetectable. A key-level replace
is idempotent and self-healing. This is the same rule `CLAUDE.md` §6 already
states for the envelope; the socket does not get an exemption from it.

### 7.3 What the socket does not carry

- **No intents in step 3.** Intents keep going over HTTPS to the edge. One
  transport for reads, one for writes, and the write path keeps its existing
  auth, rate limits and idempotency. Moving intents onto the socket is a later,
  separately-reviewed step and is not needed for fluidity.
- Auth is the existing JWT, verified with the existing `hr-accrue/jwt.js`. The
  socket process holds the anon key and the player's JWT; it holds **no**
  service-role key (§8).
- Single-active-session still keys on the tab (`CLAUDE.md` §6); the socket makes
  stale-takeover *detectable server-side* rather than by heartbeat, which is a
  strict improvement.

---

## 7a. Sequencing prerequisite: the inventory ABSOLUTE flip (client-lane finding 2)

The systems-engineer lane located the 2026-09-13/14 "browser says X, server says
Y" class precisely, and it is **not** in `predict.js`. It is in the client's
inventory and bank **folds** — `reconcileInventory`'s merge branch (a one-way
`Math.max` ratchet that can never remove an item) and `reconcileBank`'s
`'absent'` mode — together with the attended kill's client-rolled drop. A
`Math.max` fold and a pushed frame are incompatible by construction: the frame
says "you have 0 Goblin Seals", the fold keeps the 1 the client rolled for
display, and the player is told they have a key they cannot spend, for ever.

**Therefore the ordering is fixed, and this document is bound by it:**

1. The **inventory/bank ABSOLUTE flip** lands first — server stack is the whole
   truth, replaced per frame, never merged upward; `reconcileInventory`'s merge
   branch and `reconcileBank`'s `'absent'` mode collapse to assignments.
2. The **monotonic frame gate** (§7.1) lands, so replacing-per-frame is safe
   against reordering. (1) without (2) is worse than neither: an absolute fold
   plus a reordered frame is a *visible* rewind rather than a quiet ratchet.
3. Only then may the tick own combat loot and push an inventory frame.

The tick lane must not schedule "tick owns combat loot" ahead of (1) and (2).
If the tick pushes an inventory frame into a merging client, the class of bug
this whole program exists to kill comes back at 10 s resolution instead of 90 s.

**Correction to the brief, carried here so the two documents agree:** the brief
says ~7k lines of client mirror/prediction get "replaced". Measured on b545, the
true prediction surface is **~2,860 lines**; roughly **4,500 lines of
`accrue.js` are applier, transport and receipts that the push channel still
needs**. Do not plan on deleting the applier — it is the asset, and the push
channel's client half is mostly *re-pointing* it from fetch to socket.

---

## 8. Security boundary

**The tick role holds no value privileges.** Concretely:

| Object | Grant |
|---|---|
| `hr_tick` (new role) | `EXECUTE` on `hr_tick_roster(int,int)` and `hr_apply(...)`. **Zero table privileges.** No `SELECT` on `player_state`, `player_inventory`, `player_ledger`. Asserted by a `do $$` block in its migration, exactly as `hr_engine` is today (`docs/design/server-authority.md` §2a, S1). |
| the tick host | the **anon** key and a short-lived `hr_tick` JWT minted per process from a secret held in the host's environment. **No service-role key ever reaches the tick host.** |
| `hr_apply` | unchanged. It re-validates every invariant regardless of caller; it has never trusted the edge and it does not trust the tick. |
| catalogues | unchanged — server-side, generated from `src/data` by `tools/gen-catalogues.mjs`, drift-guarded. |
| clamps and the ledger | unchanged, and remain **the only writers of value**. |

The exploit-surface delta of **step 1** is therefore **zero**: no new role, no
new grant, no new network listener, no new client-reachable path. The spike is a
program that reads a JSON file.

The exploit-surface delta of **step 2** is one new role with two EXECUTE grants
and one new host holding a signing secret — and that is what the Security
Engineer must review before any of it applies. The two questions I would ask in
their seat:

1. *Can the tick be made to settle a window it should not?* The only inputs are
   the roster (server rows) and the host clock. A **fast clock** is the real
   attack: `now()` inside `hr_apply` clamps `accrued_to` into `[old, now()]`, so
   a tick host whose clock runs ahead proposes a window the database refuses.
   Fail-closed, but it means clock skew shows up as refusals, not as mints —
   which is the right direction and must be monitored (§13).
2. *Can a compromised tick host drain an account?* It can propose any delta for
   any character in its shard. `hr_apply`'s per-call and per-day clamps bound
   that, and the ledger records it — the same bound the edge has had since
   2026-08-11. A compromised tick host is exactly as dangerous as a compromised
   edge deploy, and no more. That is the argument for reusing `hr_apply` rather
   than giving the tick a fast path.

A third, from §7.1: the **frame counter is `player_state.version`, a server
column**, never a tick-local integer. A tick that could mint frame numbers could
make a client believe a state the database never held.

---

## 9. Sharding and the clock

- **Shard = world region, not a hash bucket.** A character belongs to exactly
  one region at a time; the region's tick owns its spawns, its broadcasts and
  its ambient state. Hash-sharding by `user_id` would make a shared world
  impossible to keep consistent, which is the actual reason the tick exists.
- Cross-region interaction (market, clans, leaderboards) goes through
  **Postgres**, never tick-to-tick. There is no inter-process protocol and there
  must never be one: two ticks agreeing about gold is a distributed-consensus
  problem, and `hr_apply` already solves it by being the single writer.
- **One shard for the beta.** `hr_shard_of(user_id)` exists from day one and
  returns 0 for everybody, so adding a second shard is a function body change
  and a second container, not a migration.
- **Cadence is config, not code.** `CADENCE_MS` is an environment variable;
  `--cadence=5` is verified working in the spike and conserves the same 125
  simulated ticks as `--cadence=10` over the same span (P2 is cadence-agnostic
  by construction, because alignment is per-character and not per-cadence).
- **The clock is the host's `Date.now()` for scheduling and `now()` for
  authority.** They are allowed to differ; the authority one wins. The tick
  proposes `nowMs = w.toMs`; `hr_apply` clamps it. A tick host must run NTP, and
  clock skew beyond one cadence is an alertable condition.
- **Settle cadence ≠ push cadence.** Push every 10 s from memory; flush to
  Postgres every **60 s** (config). A crash loses at most one flush interval,
  and that interval is recovered on rehydrate by the accrual path, which is
  deterministic over the same span. This is the property that keeps the database
  write rate independent of the fluidity of the game.
  ⚠ It interacts with §7.1: a frame is `player_state.version`, and version only
  moves when `hr_apply` accepts. So a 10 s *display* push between flushes is
  either (a) frame-less and display-only — which is a prediction by another name
  and is banned — or (b) the flush cadence equals the push cadence. **For the
  beta, set both to 10 s and revisit under load.** The 60 s flush is the lever
  for scale, and taking it means accepting 10 s frames that carry no authority,
  which needs its own design. Named, not solved.

---

## 10. Concurrency and idempotency

**Two writers can touch one character: the tick and a player intent through the
edge.** The arbiter is the mechanism that already exists.

- `hr_apply` takes `p_version` and refuses a stale one. The tick holds the
  version it hydrated at; if a player's intent landed in between, the tick's
  call is refused, the tick **rehydrates and re-plans the window from the new
  `accrued_to`** — it never retries the old delta. Losing the race costs at most
  one cadence of latency and zero value, because `accrued_to` was not advanced.
- `hr_apply` takes a per-character lock (`select ... for update` on
  `player_state`) — no read-modify-write crosses a network hop.
- **Idempotency key:** `tick:<shard>:<user>:<slot>:<windowFromMs>`. `windowFromMs`
  is tick-aligned and monotonic per character, so a retry after a timeout
  replays to the same key and is a no-op. Belt and braces: `accrued_to` is
  clamped into `[old, now()]`, so a replayed window is *also* refused by the
  watermark. Two independent defences, which is what a payment path should have.
- **A character is owned by exactly one tick process at a time**, enforced by an
  advisory lock on `hash(user_id, slot)` taken by `hr_tick_roster` — so a rolling
  deploy with two processes briefly alive cannot double-settle. The lock is
  advisory and session-scoped; a dead process releases it when its connection
  drops, and the surviving process picks the character up on the next roster.
- **Determinism:** `Math.random()` is banned server-side and is already absent
  from `src/core`. The tick introduces no new randomness and no new seeding
  mechanism — §11.

---

## 11. Seeding: per-tick watermark label, and no new column

**Corrected 2026-09-16 after Coordinator review.** My first draft of this
section claimed a blocker that does not exist on the live path, and reached it
from a fixture that seeded every window from one per-character constant. That is
not what production does.

`hr-accrue/index.ts` (~L641, `seedSql`) derives the PRNG seed as

```sql
public.hr_seed(user, slot, 'accrue:' || accrued_to) & 4294967295
```

— a label that **names the watermark**, mixed with a 256-bit secret held in a
table with RLS on, so a player cannot predict their own rolls (server-authority
review S20). Every settle window already draws a distinct stream. Two settles of
different lengths already produce different answers for the same wall-clock
minutes, today, and that is accepted behaviour.

**The tick inherits the mechanism unchanged.** A tick window's watermark is its
`fromMs`, so the tick seeds each window from a label naming it, exactly as the
edge does. Consequences:

- **No `rng_state` column.** Withdrawn.
- **No `createRng.state()` getter.** Withdrawn.
- **No Security GO for a seeding change.** Withdrawn — there is no change.
- **No engine edit at all.** `computeAccrual` takes `inp.seed` and always has.

`services/world-tick/shadow.js` `seedFor()` implements the label. The spike has
no secret and must not invent one, so it uses `hashSeed` from `src/core/rng.js`
over the same label shape — which reproduces the property under test (a distinct
stream per watermark) without reproducing the property it is not testing
(unpredictability). The real service calls `hr_seed`, as the edge does.

### What the parity contract therefore is

**P1, not P4.** The contract is *"the same window, computed by either caller,
gives the same answer"* — which is provable and is green. It is **not** *"a span
cut into sixty pieces reproduces the one-call answer"*, which is not achievable,
not required, and not true of the accrual path against itself either.

What must hold instead is that the decomposed stream is **healthy**, and P4 now
asserts exactly that. Measured on the spike's fixtures over ten minutes at a
10 s cadence, with production seeding:

| Fixture | gold, 63–71 windows | gold, one call | drift | rare drops |
|---|---|---|---|---|
| early-game goblin | 792 | 801 | **−1.1%** | both paths reach `goblin_seal`, `goblin_totem`, `bronze_sword` |
| maxed vs slime | 425 | 450 | **−5.6%** | both reach `sticky_core` |
| bow user vs rat | 550 | 576 | **−4.5%** | both reach `small_fang`, `wheat` |

That is noise between two draws of the same distribution, with no starved drops
and no direction. P4's band is ±15%: wide enough for these three, narrow enough
to catch the failure mode below.

### The failure mode this section is really about, now a mutation proof

Seeding every window from **one per-character constant** — the mistake a tick
author makes by reaching for `char.seed` because it is right there — makes sixty
windows replay one stream prefix sixty times. Measured:

| Fixture | gold, constant seed | gold, one call | drops **never reached** |
|---|---|---|---|
| early-game goblin | **1124** | 760 | `goblin_totem`, `goblin_seal`, `bronze_sword` |
| maxed vs slime | 449 | 426 | `bones`, `sticky_core` |
| bow user vs rat | 497 | 570 | `small_fang`, `wheat` |

**+48% gold** (a dupe direction) and **rare drops at rate zero** — the "WOW I got
something rare" moment silently deleted, with nobody able to file a bug for it.
That measurement is now `--mutate --fixedSeed`, which turns P1 and P4 red. The
finding kept its value by becoming the guard's proof rather than the program's
blocker.

### The one blocker that stands

**The carry loss (§6, RULE 1).** `simulateSpan`'s `carryMs` is a call-local, so
any settle boundary that is not a whole multiple of the character's `tickMs`
discards the remainder — measured at 4.0% / 6.6% / 15.5% of a night on the three
fixtures, in the under-paying direction. The tick answers it with `alignWindow`
and no engine change. The same arithmetic applies to today's ~90 s attended
settle cadence, which is already live; that measurement is being taken
separately and is not in this lane.

---

## 12. Cost, honestly

Approval is Tyler's and this needs the exact figure before purchase (budget
freeze, 2026-08-17). These are order-of-magnitude, and I have **not** priced a
specific vendor plan.

**Beta population** (measured: 6 players; plan for 50 registered, ~10 concurrent):

| Line | Estimate |
|---|---|
| One small always-on container (1 vCPU / 1 GB) | **~5–15 USD/month** at the commodity end (Hetzner/Fly/DO class), ~12–25 USD on a hyperscaler. The brief's 15–40 USD is the safe upper half of that. |
| Egress | negligible — an envelope delta is a few hundred bytes; 10 concurrent × 6/min × 400 B ≈ **1.7 MB/hour**. |
| Supabase | **unchanged** if the flush cadence stays near today's 90 s settle. At a 10 s flush (§9's caveat) it is **9× today's write rate** on `player_state` — still small in absolute terms at beta size (≈1 write/s), but it is the line that grows fastest and it is the one to measure first. |

**At 10k DAU** (assume 12% concurrency ≈ 1,200 active characters):

| Line | Estimate | Note |
|---|---|---|
| CPU | ~1,200 chars × ~4 combat ticks per 10 s cadence ≈ **500 simulated ticks/s** | A combat tick is a handful of arithmetic ops on small objects. One core is not close to the limit; the socket fan-out will bind first. |
| Memory | ~5–10 KB per hydrated character ≈ **6–12 MB** + socket buffers | Not a constraint. |
| Postgres writes | at a 60 s flush: 1,200 / 60 = **20 characters/s**, batched as one statement per flush carrying ~1,200 rows. At a 10 s flush: **120 characters/s**, 1 batched statement per 10 s. | Batching is why this is small. Per-character round trips at 10 s would be 120 single-row UPDATEs/s, which is the design that does not scale. |
| Journal rows | ~1,200 × 1,440 flushes/day = **1.7M rows/day** if every flush journals | **Too many.** Journal on value-transfer and session boundaries only, per §5: a character with one 3-hour session/day produces ~2 session rows + a handful of death/rare rows, i.e. **~10k rows/day at 10k DAU** — three orders of magnitude less. This is the single cost decision that has to be made correctly *before* step 2, not after. |
| Hosts | 2–3 shard containers + 1 socket tier | **~50–120 USD/month** total, still small next to Supabase at that scale. |

The honest limitation: I have measured CPU per tick only by construction (the
spike runs ~190 windows across three characters in well under a second); I have
**not** load-tested 1,200 concurrent characters, and I have not measured socket
fan-out at all because step 1 has no socket.

---

## 13. What CI needs (registering nothing yet, per the brief)

`tools/run-ci-local.mjs` derives its step list by **parsing
`.github/workflows/smoke.yml`**, so a guard that is not registered there does
not run anywhere. When step 2 starts, the CI shape needs:

1. A step `node tests/world-tick-parity.mjs` in `smoke.yml`, in the guards job
   alongside `accrual-engine`.
2. A step `node tests/world-tick-parity.mjs --mutate` — the guard-hygiene
   discipline (`tests/guard-hygiene.mjs`) wants a mutation proof for every
   standing guard, and this one has three.
3. A re-pin of `tests/ci-shape.baseline.json`, which freezes the workflow's step
   list; adding steps without re-pinning turns `ci-shape` red.
4. `tests/core-purity.mjs` and the dead-export/window-globals ratchets do not
   cover `services/**` today. Either extend their scan roots to `services/` (my
   preference — the purity rule "no `Math.random`, no DOM, no ambient clock"
   should bind the tick harder than it binds the client) or state explicitly
   that `services/` is out of scope. **Open question for the QA lane.**
5. A guard asserting `services/world-tick/**` imports no Supabase client and
   calls no `fetch` — "shadow mode writes nothing" should be a machine-checked
   property, not a promise in a document. One `grep`-class test, three lines.
6. `tools/pack-edge.mjs`'s `versionQueryGuard()` bans `?v=` outside `src/**`;
   `services/**` inherits the ban correctly because the guard is an allowlist.
   No change needed, but worth a test.

Also monitoring, when the tick becomes a writer: `hr_rejections` already records
refusals as an aggregate per (user, slot, day, code), and lane
`c-hr-rejections-journal` added the verb map. A **stale-version refusal rate**
and a **clock-skew refusal rate** per shard are the two tick-specific vitals;
`tools/vitals.mjs` is where they belong.

Nothing is registered in this lane.

---

## 14. Open questions

1. **`caller` taxonomy** (§4.1). `finalWindow` is being borrowed. Does the Game
   Designer or Security want the min-span floor to apply to a tick window at
   all, or is "settle every aligned window" the rule?
2. **The seed label's granularity** (§11). `'accrue:' || accrued_to` is unique
   per window because the watermark moves, and `hr_seed` mixes `user` and `slot`
   so two characters settling at the same instant get different streams. I
   believe that is sufficient at a 10 s cadence and found no collision, but the
   label is about to be used at ~9× the rate it was designed for and that is
   worth a second pair of eyes from Security before the tick writes.
3. **Farm, not combat, as the tick's first channel.** Farming is pure time with
   no drop rolls, so the cost of getting the first channel wrong is a carrot
   rather than a dupe — and it is the feature that sat at zero from 2026-08-27
   to 2026-09-06 with nobody able to see it. The brief says combat first because
   `combat-sim.js` is already the single engine; I disagree and say so in §16.
4. **Push cadence vs flush cadence** (§9's ⚠). A 10 s display frame that carries
   no authority is a prediction by another name. Either flush at push cadence or
   design an explicitly-provisional frame. Needs a decision before step 3.
5. **Which process terminates a session.** If a character's supplies run out at
   02:14, the tick knows immediately. Does it propose `activity: idle` (the
   engine already does this on retreat), and if so does the player get a
   notification, or find out on return? Designer question.
6. **Roster staleness.** A character whose pointer is set while the tick's roster
   is 10 s old waits one cadence. Acceptable, or does an accepted `set_activity`
   need to notify the shard? (`LISTEN/NOTIFY` on an existing channel would do it
   with no new infrastructure.)
7. **Where the socket tier lives.** Same process as the tick (simple, couples
   fan-out to simulation) or a separate tier (scales independently, needs
   tick→socket transport). Beta: same process. I have not designed the split.

---

## 15. Known limitations of this lane

- **Nothing here has been verified against a database.** No branch was created,
  no migration was written, no RPC exists. Every SQL snippet above is a
  *proposal*; `hr_tick_roster`, `hr_shard_of` and `hr_tick` do not exist. The
  seeding path (§11) is the one part of this document that rests on shipped,
  live code and needs nothing new.
- Parity is proven for the **combat** channel only. Gather and artisan go
  through the same `computeAccrual` front half and the same alignment rule, but
  their sims (`skill-sim.js`, `artisan-sim.js`) have their own carry state
  (`tool_carry`, bench progress) and I have **not** measured their
  decomposition. Assume they have their own version of RULE 1 until measured.
- No socket, no push channel, no load test, no clock-skew test, no measurement
  of the frame gate against a real client.
- The shadow `advance()` in `shadow.js` is a *stand-in* for `hr_apply` and
  implements no clamp, no catalogue and no authority. It exists to carry a
  fixture forward between windows and is deleted in step 2. It must never grow
  a rule.

---

## 16. Where I disagree with the brief

1. **"Tick becomes the writer for one channel (combat first)".** Combat has the
   most value at risk and is the only channel with drop rolls, so it is the
   channel where a mistake is a dupe. **Farm first**: pure time, no rolls, no
   dupe direction, already the feature that went unobserved for ten days, and it
   proves the whole pipeline (roster → engine → `hr_apply` → frame → client)
   where being wrong costs a carrot. Combat second — not because it is blocked,
   but because it should not be the rehearsal.
2. **"~7k lines of client prediction/mirror get retired".** Measured on b545 by
   the systems-engineer lane: **~2,860 lines** are true prediction; ~4,500 lines
   of `accrue.js` are applier, transport and receipts the push channel still
   needs. Planning the program around deleting 7k lines will produce a schedule
   that is wrong in both directions — less deletion than hoped, and a large
   *re-pointing* job that is not on anyone's list.
3. **"Clients hold a socket; the tick emits deltas."** Not until the inventory
   ABSOLUTE flip and the monotonic frame gate land (§7a). Pushing frames into a
   client whose inventory fold is a one-way `Math.max` ratchet reproduces the
   2026-09-13/14 bug class at 10 s resolution. This is a hard ordering
   constraint, not a preference.
