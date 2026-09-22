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

> **Capacity baseline, measured 2026-09-18 — `docs/design/restore-runbook.md` §14.**
> The Reliability lane measured production read-only before this tick ships. Three numbers
> bind this design and are not estimates:
> * **`hr_apply` costs 9.35 ms** (14,240 real calls) — that is the tick's unit cost, and
>   `hr_state_of` is 3.23 ms. Both are healthy.
> * **⛔ `hr_ledger_prune` has a hard ceiling of 480,000 rows/day.** One ledger row per 10 s
>   tick reaches 432,000 rows/day at **50 active characters**, so at **~56 characters the
>   arrival rate exceeds the prune rate and `player_ledger` grows without bound** (90-day
>   footprint at 50 characters ≈ 20.9 GB against a **2 GB** disk). **The tick must journal
>   one row per credited window or value transfer, never one per tick.** Reliability blocks
>   a per-tick ledger write on this number. §4's routing through `hr_apply` is the right
>   shape; the row-count consequence is the part to decide deliberately.
> * **Every row the tick writes is paid for twice.** `wal_level = logical` with two active
>   replication slots means logical decoding walks every WAL record even though only
>   `public.chat_messages` is published — already **7.16 h of CPU across 4.5M records**, the
>   largest single consumer in the database. Budget tick writes at ~2 kB WAL each.
>
> Also relevant here: `hr_rate_gate` wraps the projection at **271 ms mean / 6.8 s max** and
> takes a row lock per character per gated call (§14e), and PITR is **off** — a 24 h
> data-loss window costs far more player-hours once progression accrues continuously (§14h).


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

1. **`caller` taxonomy** (§4.1). **CLOSED 2026-09-18 — implemented.**
   `finalWindow` (boolean) is now `inp.caller: 'accrue' | 'collect' | 'tick'`
   (`accrual.js` `accrualCaller`). The boolean was answering two questions with
   one bit:

   | caller | ACCRUE_MIN_MS floor | sub-action remainder | call site |
   |---|---|---|---|
   | `'accrue'` | **applies** | **deferred** | `index.ts` cadence poll |
   | `'collect'` | exempt | stamped at `now()` | `set-activity.js` collect-before-switch (b531) |
   | `'tick'` | exempt | **deferred** | `services/world-tick` |

   `'tick'` is the row the boolean could not spell. The min-span floor does NOT
   apply to a tick window (10 s is below it by design) but the *deferral* does,
   because a tick's next window starts at the watermark this one stamped — the
   condition that actually matters is not "no next CALL", it is "no next WINDOW
   to defer into", and only the collect satisfies it.

   **Fail-safe:** anything unrecognised — absent, misspelled, hostile — reads as
   `'accrue'`: the floor stays ON (grants nothing) and the remainder is deferred
   (settles *less* than now). The only caller that loses time by being
   mislabelled is `'collect'`, and that is a single call site with its own
   source guard. Fuzzed over 13 hostile values in
   `tests/settle-carry-defer.mjs` D4d/D4f.

   **The caller is a SERVER LITERAL at both production call sites** and is never
   read from a request body — a client that could name its own caller would pick
   `'collect'` and buy the floor exemption on demand, turning a 1 s poll loop
   into a payable window. A14 compares the two literals field-by-field.

   Production behaviour is byte-identical for both existing callers: proved by
   `tests/settle-carry-defer.mjs` D4 (collect still stamps `now()`) and D4b
   (accrue still defers), plus the 14 accrual guards and the unchanged P6
   numbers (1,686 pairs / 118 proven / 0 failed / 5 unaccounted).
2. **The seed label's granularity** (§11). `'accrue:' || accrued_to` is unique
   per window because the watermark moves, and `hr_seed` mixes `user` and `slot`
   so two characters settling at the same instant get different streams. I
   believe that is sufficient at a 10 s cadence and found no collision, but the
   label is about to be used at ~9× the rate it was designed for and that is
   worth a second pair of eyes from Security before the tick writes.
3. **ANSWERED 2026-09-18 (§15a): gather, not farm and not combat.** The
   original text is kept below because its reasoning about cost-of-being-wrong
   still holds; what it did not know is that farm has no accrual path to reuse.
   *Original:* **Farm, not combat, as the tick's first channel.** Farming is pure time with
   no drop rolls, so the cost of getting the first channel wrong is a carrot
   rather than a dupe — and it is the feature that sat at zero from 2026-08-27
   to 2026-09-06 with nobody able to see it. The brief says combat first because
   `combat-sim.js` is already the single engine; I disagree and say so in §17.
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

## 15a. Step 1 results — 2026-09-18 (real data, read-only)

Written after replaying **1,703 accepted `accrue` settle windows** from
production (14 days, 8 accounts, 17 (user, slot, channel) streams) READ-ONLY
through the management query endpoint, token read as file bytes, SELECT-only,
**zero writes of any kind**. Tool: `tools/world-tick-replay.mjs`; the analysis is
pure and lives in `services/world-tick/replay.js`; the de-identified,
value-stripped snapshot is `tests/fixtures/world-tick-real-windows.json` and is
now guard P6.

### What the journal can and cannot replay

A `player_ledger` accrue row carries the window's **geometry and result**
(`ms, from, to, ticks, capped, kills|made, ate, stopped, delta{g,i,x,k}`). It
does **not** carry the window's **starting state**, and it cannot carry the
**seed** — `hr_seed(user, slot, 'accrue:'||accrued_to)` mixes a 256-bit secret
behind RLS, which is a security property (S20), not a gap. So a **value replay**
("re-roll the window, compare gold/XP/items") is **not possible today and this
lane did not fake one**. The exact missing list is
`MISSING_FOR_VALUE_REPLAY` in `replay.js`: `start_hp, start_max_hp, start_skills,
start_equipment, start_inventory, start_fight, start_consec_falls, start_buffs,
seed, recover_ms, idle_ms` (11 fields; P6 asserts the list has not been quietly
shortened to make a replay "work").

What **is** replayable with nothing invented is the property the tick must agree
with: **the settle watermark**. `settledWatermarkMs` advances `accrued_to` by the
time the simulation *accounted* for, so the journal is self-checking — the next
window's `from` must be the watermark the previous window's own numbers imply.

### The parity table (production, 14 days)

| channel | watermark_exact | flush | gap | unaccounted | watermark_mismatch |
|---|---|---|---|---|---|
| combat | 51 | 828 | 112 | 5 | **0** |
| craft | 52 | 131 | 236 | 0 | **0** |
| gather | 15 | 137 | 119 | 0 | **0** |
| **TOTAL** | **118** | 1096 | 467 | 5 | **0** |

1,686 consecutive pairs. **118 boundaries land exactly on `settledWatermarkMs`;
0 disagree.** Action intervals inferred purely from the arithmetic ranged
2352–11200 ms across 22 distinct values. Buckets that are *not* proofs, stated
as such:

- **flush (1096)** — the watermark was `now`, which is correct for all four
  cases `settledWatermarkMs` returns `nowMs` for (capped / final / remainder ≥
  one interval / no remainder). Not further checkable without the interval.
- **gap (467)** — `accrued_to` moved forward between the two rows, i.e. another
  writer (a `set_activity` collect, a channel switch) settled in between. Not a
  fault; just not a boundary this pair can speak about.
- **unaccounted (5)** — `ms − deferral` is not a whole number of the window's
  own ticks, so the simulation spent time on something the journal does not
  record. Two of the five contain a journalled death in the window
  (`recoverMs`); three do not, and are unexplained without `idle_ms`.

### The ≤10-line lane-C journalling brief — **LANDED 2026-09-18 as `meta.w`**

The brief below is kept verbatim as the record of what was asked for. What
shipped differs in exactly one respect, and the reason is a guard rather than
taste.

> **Add two aggregate fields to the accrue journal meta: `rms` (recoverMs) and
> `ims` (idleMs).** Both are already computed by `computeAccrual`'s summary and
> discarded at journal time. Cost: two integers on a row that already exists —
> **no new rows, no new table, no ledger-scale growth** (§5's rule is untouched).
> Effect: closes the `unaccounted` bucket, and makes `accounted = ticks×interval
> + rms + ims` an identity the journal can be audited on, instead of an
> inference that breaks whenever a player dies. It does **not** enable a value
> replay — that needs a starting-state snapshot, which is a different and much
> more expensive decision and is **not** recommended at this time.

**What shipped: ONE key, not two.** `meta.w = "<recoverMs>,<idleMs>"`, a
comma-joined scalar, **omitted entirely when both terms are zero**. Two separate
integer keys were not available:

- `tests/artisan-accrual.mjs` **T7** refuses any nested value in the ledger, so
  `w: [rms, ims]` (an array) is rejected outright. The house precedent for "two
  facts, one scalar" is `skipped_items` (C5), and `w` follows it.
- `tests/accrual-engine.mjs` **SHAPE** bounded the combat meta's key count at 8
  — measured, it turned out, on a single sample that carried neither `att` nor
  `spent`, while the real worst case was already **nine**. Two flat keys would
  have made it eleven. The guard was **tightened, not loosened**: it is now an
  **allowlist** (`ms, ticks, kills, capped, ate, att, spent, w, from, to`) plus
  a length bound, with an always-run inline mutation proof that a per-kill-log
  key and an over-long row are both refused. The nominal number moved 8 → 10
  because the old one could be exceeded by a real row while the guard passed.

**Ledger arithmetic for the raise** (the only currency that matters is rows;
bytes are the sanity check). `w` is ≤24 B on a row that already exists and is
absent on every window with no death and no idle time. Reliability's measured
row cost is **407 B/row**, and the 14-day production read behind
`tests/fixtures/world-tick-real-windows.json` is ~1.7k accrue rows for 5 users
≈ **24 rows/user/day**. At 100× the live player base (500 active) that is ~12k
accrue rows/day → **~290 KB/day of `w` at the ceiling**, against ~4.9 MB/day for
the rows themselves. **No new rows, no new table.**

`recover_ms` and `idle_ms` therefore came off `MISSING_FOR_VALUE_REPLAY` (11 →
9 fields). **This did not make a value replay possible** and P6 asserts the list
did not shrink without the arm that uses it: `seed` can never be present (S20).

**Proof it is not decoration** (`tests/world-tick-parity.mjs` P7d/P7f): a real
engine window containing recovery time, journalled in the engine's own meta
shape and fed to the real analyser, replays as `watermark_exact`; **the same row
with `w` stripped falls back to `unaccounted`** — the bucket the five production
pairs sit in. P6 additionally asserts the pre-2026-09-18 fixture still reports
0 waste-backed pairs and 5 unaccounted, because adding a field must never
retroactively reclassify rows that never had it.

### ⚠ The tick's write unit is the SETTLED WINDOW, never the tick (Reliability, 2026-09-18)

Measured on the live database, and it moves §5's rule from "design constraint"
to "hard capacity ceiling":

- `player_ledger` costs **407 B/row**, not the 215 B §11 assumed.
- `hr_ledger_prune(20000)` runs hourly and therefore deletes **at most 480,000
  rows/day**. Anything above that line grows without bound.
- `wal_level = logical` with 2 replication slots decodes every WAL record
  (~2 kB WAL per `hr_apply`), so the write rate is paid twice.

Rows/day at the two candidate write units:

| active characters | **per TICK** (10 s) — rejected | **per SETTLED WINDOW** (90 s flush, continuously active) | at the measured duty cycle (~24 rows/char/day) |
|---|---|---|---|
| 4 | 34,560 | 3,840 | ~96 |
| 50 | **432,000** — 90% of the entire prune budget | 48,000 | ~1,200 |
| 500 | **4,320,000** — 9× the prune ceiling | **480,000** — exactly the ceiling | ~12,000 |

So per-tick journalling goes unbounded from **~56 continuously-active
characters** (≈20.9 GB in 90 days on a 2 GB disk) and is not a tuning problem.
Per settled window it is inside the budget at today's duty cycle at every scale
in the table, and the 500-character *continuous* column lands exactly ON the
prune ceiling — which is the number that makes §9's **flush cadence the lever**,
not an optimisation. At 500 continuously-active characters the rows alone cost
~195 MB/day before `w`, so the cadence has to lengthen (or the apply has to
batch) before the tick owns a channel at that scale.

**The `rms`/`ims` change is row-neutral by construction** — it adds ≤24 B to a
row that would have been written anyway and adds no row of its own — and it must
stay that way. Any later journalling proposal states its rows/day at 4 / 50 /
500 against the 480,000/day prune ceiling **before** its bytes.

### Watermark semantics, proved as a test not as prose (P5)

`tests/world-tick-parity.mjs` now drives 32–36 aligned 10 s tick windows and
then **one ordinary settle**, chaining on the watermark the engine itself
stamped (`delta.accrued_to`), and asserts three things: **P5a** no overlap and
no gap across every boundary including the handover; **P5b** accounted time over
the tick phase *plus* the settle equals the span the watermark actually moved;
**P5c** the only unsettled time is a sub-interval tail, still owed. Measured
green on all three fixtures (600000 == 600000 / 598296 == 598296 / 599808 ==
599808; tails 0 / 1704 / 192 ms, all < one interval).

**⚠ The finding P5 produced — RESOLVED 2026-09-18, see §14.1 below. It upgraded
§14 open question 1 from taxonomy to arithmetic.** A tick window is spelled `finalWindow: true` today, and
`settledWatermarkMs` returns `nowMs` **unconditionally** for a final window
(case (b)). So the deferral the accrual path gained on 2026-09-16 **does not
reach a tick window through the flag the tick is borrowing** — the tick is
protected from the carry loss *only* by `alignWindow`, which makes the remainder
zero so the two answers coincide. Turn alignment off (`--mutate
--unalignedTick`) and the measured forfeit is **12000 / 20640 / 46560 ms of a
ten-minute span (2.0% / 3.5% / 7.8%)**, in the under-paying direction. Two
independent mechanisms now have to agree for the tick to be correct, and one of
them is a flag whose name says the opposite. **Recommendation, unchanged in
substance and now with a number behind it: replace the boolean with
`inp.caller: 'accrue' | 'collect' | 'tick'`, exempt `'tick'` from the min-span
floor and let it *defer* like an ordinary settle.** Additive, byte-identical for
every existing caller.

Mutation proofs, all nine exit 0 under `--mutate` and each turns a named claim
red: `unaligned`→P2, `nofight`→P2b, `capIsCadence`→P1, `fixedSeed`→P1/P4,
**`rewind`→P5a+P5b (double-pay direction)**, **`replayLax`→P6** (one real
boundary nudged by 1 ms; a decorative analyser would still have said zero), and
the three caller mutants added 2026-09-18: **`callerAccrue`→P7a/P7c/P7d/P7e**,
**`callerCollect`→P7b/P7e**, **`callerTick`→P5b** (which reproduces the
12000 / 20640 ms forfeit measured below).

**`unalignedTick` was RETIRED**, and that is the result rather than a deletion:
under `caller: 'tick'` the unaligned chain forfeits **zero**, so it stopped
being a mutation and became a positive claim, **P5d** (`alignWindow` is a
performance property, not the carry's only defence). A mutation that no longer
bites is replaced by the claim it proved, never left in place exiting 0.

### First channel: the decision changes to **gather**, not farm and not combat

§17.1 argued farm first on cost-of-being-wrong grounds. The real windows say
otherwise on a ground the fixtures could not show: **farm has no accrual window
at all.** Fourteen days of `player_ledger` carry `farm_plant` / `farm_water` /
`farm_harvest` intents (143/132/124, 3 users) and **zero `kind='farm'` accrue
rows** — farm growth is computed on-read inside `hr_farm_*` RPCs against
`hr_farm_growth_hours`, not through `computeAccrual` and not through a watermark.
Making farm the tick's first channel therefore means writing a *new* accrual
path and a *new* watermark for it, which is the opposite of "just another
server-side caller" and puts the pipeline's first proof on the one channel where
none of the proven machinery exists. Combat, per §7a, is still blocked behind the
inventory ABSOLUTE flip and the frame gate, and it is the only channel with drop
rolls. **Gather is the answer**: it already flows through `computeAccrual` →
`hr_apply` (185 windows / 5 users / 7 days — the widest user base of any accrual
channel), its state is the simplest of the three payable kinds (`tool_carry` and
a watermark; no `fight` checkpoint, no `consec_falls`, no recovery clock, no
auto-eat), its drops are catalogue yields rather than rare rolls, and per
`CLIENT_PREDICTION_RETIREMENT.md` its client surface is a progress bar rather
than an inventory fold — so it can be tick-owned *before* the ABSOLUTE flip
lands, which combat cannot. Farm moves to third, after the flip, as the first
channel that needs a new accrual path rather than the first that proves one.

**The exact RPC list the tick calls for gather** — as just another server-side
caller, adding no new surface:

| Call | Why |
|---|---|
| `hr_tick_roster(p_shard, p_limit)` (**new**, §2) | the active set; `SECURITY DEFINER`, executable by `hr_tick` only |
| `hr_seed(user, slot, 'accrue:'||accrued_to)` | the per-window PRNG label, verbatim as the edge derives it (§11) |
| `hr_state_of(user, slot)` | hydration, the same projection the client applies |
| `hr_apply(user, slot, version, delta, idem)` | **the only writer.** Unchanged, re-validates every invariant, bumps the version that is the push frame |

That is four calls, of which exactly one is new. No new value RPC, no new grant
beyond the two EXECUTEs in §8, no new client-reachable path.

### Host plan — no spend, no signup, nothing purchased

| Line | 4 active | 50 active | 500 active |
|---|---|---|---|
| Simulated actions/s (measured interval 2352–11200 ms, mean ≈ 3.5 s) | ~1 | ~14 | ~143 |
| CPU (spike runs ~190 windows across 3 characters in <1 s ⇒ ≥200 windows/s/core) | <1% of a core | ~1% | ~7% |
| RAM (5–10 KB hydrated per character + buffers) | <1 MB | ~0.5 MB | ~5 MB |
| Postgres connections | **2, fixed** (1 roster + 1 apply), pooled — never per character | 2 | 2–4 |
| Writes/s at a 10 s flush | 0.4 | 5 | 50 — **batch `hr_apply` or move the flush to 60 s** |
| Journal rows/day (§5 rule: session + value transfer only) | ~20 | ~250 | ~2.5k |
| Egress (400 B frame, 6/min) | ~1 MB/h | ~7 MB/h | ~70 MB/h |

The binding constraint is **Postgres write rate, not CPU**, and it binds between
50 and 500 active characters. The lever is §9's flush cadence, and taking it
requires the provisional-frame design §14.4 names.

| Option | Shape | Monthly | Note |
|---|---|---|---|
| Fly.io `shared-cpu-1x`, 512 MB, one machine | container, same region as Supabase | **~$4–7** | closest to the deploy model in §1; scale-to-zero must be OFF |
| Hetzner CX22 (2 vCPU / 4 GB) | plain VM + systemd | **~$4–5** | cheapest headroom; we run the host, patching is ours |
| Supabase-adjacent hyperscaler (Fargate 0.25 vCPU / 0.5 GB, or DO App Platform basic) | managed container | **~$10–15** | least operational work, most expensive per unit |

**Nothing purchased, nothing signed up for, no account created** (budget freeze,
2026-08-17). ⚠ **Honesty note: the three monthly figures are recalled list
prices, NOT verified** — this lane fetched no vendor page and requested no
quote, so treat them as an order of magnitude ("one small always-on container is
single-digit to low-double-digit dollars") and confirm the exact figure on the
vendor's own pricing page before any approval. The per-spend approval is
Tyler's.

---

## 15b. Step 2 PREPARATION — the gather channel, built in shadow (2026-09-18)

Everything in this section exists in the repo and **nothing is deployed**. The
tick service is not running, the migration is STAGED, and the only thing left
for step 2 is *flip the flag after Security says GO*.

| Piece | Where |
|---|---|
| the gather channel module | `services/world-tick/gather.js` |
| the fixtures (3 sessions, validated against `src/data` on load) | `services/world-tick/fixtures/gather-sessions.json` |
| the ONE new RPC, staged | `supabase/migrations/2026-09-20-world-tick-roster.sql` |
| the proof | `tests/world-tick-parity.mjs` P-G1…P-G8 + 6 new mutants |
| the read-only dry run | `node tools/world-tick-replay.mjs --gather` |

### 15b.1 The ownership handover, as a state machine

**The load-bearing claim of this section, stated first: no handover flag is
needed for CORRECTNESS.** `player_state.accrued_to` is the single source of
truth for "what has been paid for", it moves only forward, and it moves only
inside `hr_apply`'s per-character `select … for update`. Whoever settles —
edge or tick — reads it, proposes a window that starts there, and hands it back
advanced. Two writers cannot double-pay because the second one's window starts
where the first one's ended, and neither can leave a gap because neither is
permitted to skip time. The flag is a **rollout control**, not a correctness
mechanism, and the difference matters: a correctness mechanism that can be
mis-set is a liability, and this one cannot pay a player twice however it is
set.

```
                (no row, or owned=false)                ← FAIL-SAFE, the default
   ┌─────────────────────────────────────────────────┐
   │  ACCRUE-OWNED    edge settles on return.        │
   │                  tick does not see the row.     │
   └───────┬─────────────────────────────────────────┘
           │  operator: update hr_tick_ownership set owned = true
           ▼        (no state to migrate: the watermark IS the handover)
   ┌─────────────────────────────────────────────────┐
   │  TICK-OWNED      tick polls watermark→now every │
   │                  cadence; flushes one hr_apply  │
   │                  per 90 s window.               │
   │                  edge STILL WORKS, unchanged:   │
   │                  a return settles whatever the  │
   │                  tick has not, which is a       │
   │                  sub-action tail.               │
   └───────┬─────────────────────────────────────────┘
           │  operator: owned = false   (or the lease simply expires)
           ▼
       ACCRUE-OWNED again, from wherever the tick left accrued_to.
```

**What the edge does when it sees a tick-owned session: nothing different.**
This is the part worth being explicit about, because the obvious design — teach
the edge to read an ownership flag and behave differently — adds a read, a
branch and a failure mode, and buys nothing. The edge already settles
`accrued_to → now()`. If the tick is 2 s behind, that call is worth 2 s. It is
*already* "catch-up only from the tick's watermark", because the tick's
watermark is the only watermark there is.

**What the tick does after downtime: one catch-up window, capped exactly like
accrue's.** The first poll after a restart is `accruedTo → now()`, which may be
hours. It is priced by the *same* `computeAccrual` under the *same* `capMs`
the accrual path uses, so the per-absence cap is enforced by the engine and not
by the tick. Refusal (a) — the 24 h `ACCRUE_MAX_SPAN_MS` — is applied a second
time, earlier and more cheaply, by `hr_tick_roster`'s
`accrued_to > now() - interval '24 hours'`: a character past the cap is
**dropped from the roster** rather than simulated to zero.

The failure cases, each with its mechanism rather than an intention:

| Failure | What happens | Mechanism |
|---|---|---|
| **tick dies mid-window** | the in-memory batch is lost; `accrued_to` never moved, so the time is still OWED and the next owner (tick or edge) pays it | the watermark only advances inside `hr_apply` |
| **two tick processes** | they claim **disjoint** sets and neither can settle the other's character | `for update … skip locked` on the OWNERSHIP row + a durable `lease_until`; and even if both claimed one character, the second `hr_apply` loses on `p_version` |
| **clock skew, host ahead** | the proposal is **refused**, never minted | `hr_apply` clamps `accrued_to` into `[old, now()]` using Postgres `now()`. The host clock schedules; it never authorises |
| **clock skew, host behind** | the tick simply settles less; the remainder is carried | the watermark is not the clock |
| **player switches activity mid-tick** | the intent bumps `version`; the tick's next `hr_apply` is refused with `version_conflict`, it rehydrates and re-plans from the NEW `accrued_to` — and a `version_conflict` **releases the idempotency key** (b346), so the retry is not locked out | `p_version` + `hr_apply`'s narrow key release |
| **pointer changes inside one flush window** | refused **loudly** in the tick rather than folded: `foldGatherMeta` throws if two polls carry different `node`s | the batch must close on a switch |
| **player deletes / renames the character** | the roster join to `player_state` returns nothing next cadence; an in-flight `hr_apply` fails its own lookup. A display name is never read by the tick at all | the roster is a join, not a cache; names come from `profiles` |

**Reversal is one statement:** `update public.hr_tick_ownership set owned =
false;`. No schema change, no player-visible effect, no data to migrate.

### 15b.2 What was proved, and how

`tests/world-tick-parity.mjs` grew eight gather arms and six mutants (all 15
mutants in the file exit 0 under `--mutate`, each turning a **named** claim
red):

| Arm | Claim | Mutant that kills it |
|---|---|---|
| P-G1 | tick intents == accrual-on-return **exactly** (xp, items, ticks); `tool_carry` within 1e-6 | `gatherWallclock` |
| P-G2 | flush windows tile the span: no overlap, no gap, tail < one action interval | `gatherWallclock` |
| P-G3 | one row per **settled window**, steady-state rate inside the 480k/day prune ceiling | `gatherPerTickRow` |
| P-G4 | `uuid5('tick:<shard>:<user>:<slot>:<windowFrom>')`; a re-run is byte-identical; the version is the hydrated one | `gatherIdemConst` |
| P-G5 | journalled `ms` == the span the watermark moved | `gatherSumMs` |
| P-G6 | the ledger meta is accrue's key set + `src:'tick'`, nothing nested | `gatherShapeDrift` |
| P-G7 | `hr_tick_roster`'s `c_payable` == `accrual.js` `PAYABLE_KINDS` | `gatherPayableDrift` |
| P-G8 | chaining on the wall clock forfeits; chaining on `accrued_to` does not | `gatherWallclock` |

**Two findings came out of building it, both in the under-paying / over-stating
direction and both now guarded:**

1. **Chaining on the wall clock forfeits 45% of a gather session.** Measured on
   the oak fixture (4000 ms node, 10 s cadence): the naive "each poll settles
   the last cadence" loop paid **60 of 110** action ticks. The engine's
   `delta.accrued_to` is the only legal chain. (P-G8.)
2. **Summing per-poll `grantMs` over-states the receipt by up to 31%.** Each
   poll is asked *watermark → now*, so its `grantMs` includes the tail the
   previous poll deferred. Measured: 732000 / 761440 / 784560 ms for a 600000 ms
   span. The journalled `ms` is restated from the watermark. (P-G5.)

A third, smaller one is recorded rather than fixed: **the tool carry is not
bit-exact across a decomposition** (0.279999995 vs 0.280000000 over ten
minutes — 5e-9 of one ore) because the carry is rounded per window instead of
once per span. It cannot compound: the carry is re-hydrated from the server
every roster call and is bounded in [0,1). P-G1 holds it at 1e-6.

### 15b.3 The dry run, read-only, against real data

`node tools/world-tick-replay.mjs --gather` (SELECT-only; the analysis is pure
and lives in `services/world-tick/replay.js`). **Value is deliberately NOT
re-rolled** — the journal carries no starting state and the seed is
unobtainable by design (S20), so a re-roll printed next to a historical result
would *look* like a comparison and be a new roll. Geometry and cost are exact.

Over the 14-day production snapshot (`tests/fixtures/world-tick-real-windows.json`,
279 real gather windows, 8 streams, 235.6 h of credited gathering):

| | accrual (actual) | tick @ 90 s flush | tick @ 10 s (rejected) |
|---|---|---|---|
| ledger rows | **279** | **9,551** (×34.2) | 84,812 (×304) |
| bytes @ 407 B/row | ~111 KiB | ~3.7 MiB | ~33 MiB |

**This is the cost of the program stated honestly, and it is bigger than §15a's
table implies.** §15a priced the tick against a *continuously active* baseline;
this is the real one. Accrual settles a twelve-hour absence in **one** row; the
tick settles the same twelve hours in **480**. The row count is therefore not
driven by how much players play but by how long their pointers are *parked*,
and a parked pointer costs the tick the same as an active one. At 500
continuously-active characters a 90 s flush lands **exactly on** the 480,000
rows/day prune ceiling with zero headroom. **Before gather is flipped on for
more than a handful of characters, either the flush lengthens or `hr_apply`
learns to batch** — §9's lever, now with a measurement behind it.

**Live roster check, read-only, 2026-09-18:** 22 characters carry a `gather`
pointer; **0** of them are inside the 24 h window, the freshest lag being
2 d 17 h. So the tick's gather roster **would be empty right now**, which is the
correct answer and the fail-safe working: those 22 pointers are parked, not
active, and the roster is proportional to active players, not registered ones.
It also means the first real flip will need a played gather session to watch.

**Tiling:** 15 overlapping and 119 gapped boundaries inside a stream. The gaps
are expected (another writer settled in between — a `set_activity` collect or a
channel switch). **The 15 overlaps are NOT explained** and are recorded here as
an open item rather than dismissed: step 1's analyser reported **0**
`watermark_mismatch` on the same data, so whatever they are, they are not a
watermark disagreement — most likely two rows whose `credit` windows are
reported over a span another writer re-settled. Worth one read before gather is
flipped on, and it is **not** a blocker for the staged migration, which writes
nothing.

---

## 15c. MILESTONE 1 — the fence and the scheduler (2026-09-21, `lane/world-tick-m1`)

Step 2 became reachable when Security returned **GO-WITH-CHANGES**
(`docs/planning/SEC_WORLD_TICK_GATHER_2026-09-19.md`). This section is what the
lane landed, what it costs, and exactly what the Coordinator does to ship it in
SHADOW on production. **Nothing here is applied and nothing here is armed.**

### The writer, fenced

The verdict's S-1 killed the design as staged: `hr_apply`'s impersonation seam
tests `v_role = 'hr_engine'` **literally**, so the `hr_tick` role the roster
migration granted `hr_apply` to could settle nothing — and each attempt would
journal a `forbidden_impersonation` rejection, the highest-signal anti-cheat
alert in the system, at one per flush per character.

Security offered two ways out (splice the money function's seam, or let the tick
present `hr_engine`) and preferred the second. The lane took a third that is
strictly narrower, and it is available only because **milestone 1 has no
always-on host** — the budget freeze stands:

| | before | after |
|---|---|---|
| who selects | `hr_tick_roster`, granted to `hr_tick` | unchanged |
| who settles | `hr_tick` → raw `hr_apply` (refused) | `hr_engine` → `hr_tick_settle` → `hr_apply` |
| `hr_tick`'s grants | `hr_tick_roster` + `hr_apply` + `hr_seed` | `hr_tick_roster`, and nothing else |
| `hr_apply`'s body | claimed unchanged, had to change | **genuinely unchanged; no live hash moves** |

`hr_tick_settle` is `SECURITY DEFINER`, granted to `hr_engine` alone. The
`role` GUC is the *request's* role and survives a definer boundary, so a call
from the Edge Function reaches `hr_apply` as `hr_engine` and the seam accepts it
without being touched. Measured, not assumed: self-check `e12` performs exactly
that transition.

**The selector and the settler are different roles, and neither can become the
other.** "Choose whose world ticks" is therefore not a request field, not a
config value and not a privilege the settling role holds — it is a lease row
written by a function the settling role cannot execute.

### The defence that did not exist (S-3)

The roster file claimed three times that `hr_apply` clamping `accrued_to` into
`[old, now()]` refuses a replayed window "on arithmetic". Security executed it:
the clamp defends the **timestamp** and applies the **value** anyway, so a
replay carrying a fresh version paid twice and moved the watermark zero
milliseconds. There was one defence, not two.

`hr_tick_settle` supplies the missing one, in SQL, under the row lock:

```sql
select * into v_st from public.player_state
 where user_id = p_user and slot = p_slot for update;   -- the lock FIRST
...
if p_window_from < v_st.accrued_to then                  -- then the CAS
  return jsonb_build_object('ok', false, 'error', 'window_already_settled');
```

A **compare-and-set on the settled watermark**, independent of the idempotency
key and of the version. Equality is the honest deferral boundary
(`settledWatermarkMs` stamps the next window's `from` *at* the previous
watermark), so nothing correct is refused — `tests/world-tick-double-pay.mjs`
D2b asserts that explicitly, because a CAS that was off by one would stall the
tick after its first window. `p_delta->>'accrued_to' = p_window_to` binds the
declared window to the paid one, so a caller cannot name ten seconds and pay an
hour.

### The 15 "overlapping" windows (S-5)

They are not double pays and there was never a defect in the engine. The dry
run counted an overlap as `from < prevTo`, which is the shape of **every**
honest deferred window since `settledWatermarkMs` landed on 2026-09-16.
`gatherDryRun` now classifies the boundary with `replayStream` — the arithmetic
that solves each window's own geometry — and reports four buckets: `deferred`
(correct), `overlap` (the only failing one), `gap`, `unprovable`. The tool's
legend says so. **The Coordinator re-runs `node tools/world-tick-replay.mjs
--gather` on production to confirm the count moves to zero**; this lane cannot,
having no database access, and the number is not asserted here on anyone's
authority.

### The scheduler, in ten lines

1. `pg_cron` fires `hr_tick_cron_run()` every 10 s. Both extensions are free and
   in-database; pg_cron already runs six jobs here.
2. The driver takes `pg_try_advisory_xact_lock` **first** — a slow tick skips
   the next fire, never queues behind it.
3. Then the kill switch: `hr_tick_config.enabled` false ⇒ return in under a
   millisecond, lease nothing, post nothing.
4. Then one `hr_tick_roster` call: batch cap (`batch_limit`, default 200) plus a
   **keyset cursor** on `(accrued_to, user_id, slot)`, so a roster larger than
   the cap is walked to its end rather than re-serving its head.
5. The roster stamps a lease in the driver's own holder name; a short batch
   wraps the cursor.
6. The bearer is read from `vault.decrypted_secrets` at call time — never in the
   repo, never in argv, never journalled (`c8b` asserts nothing bearer-shaped
   reaches the log).
7. One `pg_net` POST carries the whole batch to `hr-accrue` as `op:'tick'`.
8. The edge runs `computeAccrual` with `caller:'tick'` — the engine it already
   runs — and calls `hr_tick_settle` per flush window.
9. `hr_tick_config.shadow` true ⇒ the fence journals what *would* have been paid
   into `hr_tick_shadow`, stamps `hr_tick_ownership.shadow_accrued_to`, and
   returns before `hr_apply`. Nothing a player owns moves.
10. Every fire writes one `hr_tick_cron_log` row: outcome, rostered count,
    duration, and `effective_cadence_seconds` — the number that says "buy the
    host" when it crosses 30.

**Pure-SQL ticking was rejected with a reason, not an estimate:** a gather
yield comes out of `accrueGather` → `src/core/skill-sim.js`. Re-implementing it
in plpgsql is the second engine CLAUDE.md §1 and AWAY-12 forbid.

### The shadow watermark, and why the parity number needs one

In SHADOW the tick pays nothing, so `player_state.accrued_to` never moves for
it. A tick that kept chaining on `accrued_to` would propose `[T0, T0+10s]`, then
`[T0, T0+20s]`, then `[T0, T0+30s]` — **overlapping windows, every one of them
journalled**. Summing `hr_tick_shadow.would_gold` over 48 h would then count the
same minutes again and again, and the parity report — the entire deliverable of
the shadow run — would say the tick pays several times what accrual pays. Read
one way that blocks a correct rollout; read the other way it hides a real gap.

`hr_tick_ownership.shadow_accrued_to` is the watermark the tick chains on while
shadowed. It is not authority and it is not player value:

* the fence compares against `greatest(accrued_to, shadow_accrued_to)`, so a
  client accrue landing mid-shadow **drags the mark forward** rather than being
  replayed over;
* an armed payment **clears it**, because `accrued_to` is the authority again
  and a second watermark nobody reads is how a wrong one survives long enough to
  be believed;
* the roster seeds each window from the *effective* watermark, not from
  `accrued_to` — seeding every shadow window from one constant instant is the
  `fixedSeed` mutant of §11, which measured **+48% gold and three rare drops at
  rate zero**.

`tests/world-tick-double-pay.mjs` D4e–D4g are its exit code: the mark is
stamped, the next window tiles onto it, and re-proposing the first window is
refused **even though `accrued_to` still permits it**.

### Cost, at three sizes

| | beta (50 active) | 10× (500) | 100× (5,000) |
|---|---|---|---|
| Edge invocations/month | 263,000 **ceiling** (**zero while nobody is active**) | unchanged | unchanged |
| effective per-character cadence | 10 s | **30 s** | **250 s** — the design is over |
| **`player_ledger` rows/day, ARMED** (90 s flush) | 48,000 — **10%** of the shared 480,000/day prune budget | 480,000 — **100% of it. OVER, not "at" it.** | 4,800,000 — **10× over** |
| **`hr_tick_shadow` rows/day, SHADOW** (90 s flush) | 48,000 — its **own** 14-day retention and its **own** hourly prune | 480,000 — same, own budget | 4,800,000 — needs a bigger prune batch |
| **`player_ledger` rows/day, SHADOW (= milestone 1)** | **0** | **0** | **0** |
| DB time per fire | ~2.5 s (25% of a core, continuous) | ~6.3 s (63%) | ~63 s — 6.3 cores |

#### The ledger arithmetic, corrected (Security M-6, 2026-09-21)

The row that used to read "480,000 — at the ceiling" was **understated, and the
wording hid it.** `hr_ledger_prune` runs `[7 * * * *] select
public.hr_ledger_prune(20000)` — 20,000/hour × 24 = **480,000 rows/day, SHARED
by every ledger writer in the game.** So at 10× the tick alone consumes **100%
of it**, leaving zero for combat, buys, claims, market, dungeons and the rest;
`player_ledger` then grows monotonically, and it is the money journal every
dispute is read from. It is not *at* the ceiling. **It is the ceiling.**

Three things make that survivable, and all three are properties of the design
rather than promises:

1. **SHADOW writes ZERO ledger rows, so milestone 1 costs the ledger nothing.**
   `hr_tick_settle` step (8) returns before `hr_apply`; the shadow branch
   inserts one row into `hr_tick_shadow` and updates one watermark, and Security
   enumerated all 111 public base tables around one shadow settle to confirm
   nothing else moved. **The ledger pressure arrives at ARMING, not at apply.**
2. **The journal is per SETTLED WINDOW, never per tick.** The edge computes at
   most one flush window per character per fire and skips below the flush line
   (`below_flush`), so the rate is `active ÷ flush_seconds`, not
   `active ÷ cadence_seconds`. At a 10 s cadence and a 90 s flush that is the
   difference between 480,000/day and **4,320,000/day** — the 9× the §9 table
   already priced. `flush_seconds >= cadence_seconds` is a CHECK constraint on
   `hr_tick_config` and is restated as a clamp in `tick.js`, so a body naming
   two numbers cannot reach the expensive shape.
3. **The shadow journal never touches the ledger budget.** `hr_tick_shadow` has
   its own 14-day retention and its own hourly prune job,
   `hr-tick-shadow-prune` → `hr_tick_shadow_prune(20000)`. At 1× and 10× that
   budget covers its own arrivals exactly as the ledger's does; at 100× the
   prune batch needs raising, which is a one-line config change and not a
   design change. `hr_tick_cron_log` is one row per FIRE (never per character)
   on a 7-day retention with its own prune — 8,640/day at a 10 s cadence,
   independent of player count.

**Therefore, and this is a gate rather than a note: arming gather at 10× or
above requires Reliability's sign-off with this arithmetic attached, and so does
any change to `flush_seconds` or `batch_limit` at arming time.** The pre-arm
read is measured, not assumed:

```sql
-- headroom in the SHARED daily budget, before the tick is armed
select count(*) filter (where at > now() - interval '1 day') as ledger_rows_yesterday,
       480000 - count(*) filter (where at > now() - interval '1 day') as headroom_for_the_tick
  from public.player_ledger;
-- EXPECT: headroom comfortably above 48,000 (the 1x tick budget) BEFORE ARMING.
```

At 1× (48,000/day, 10%) the design is genuinely comfortable. At 10× the honest
options are: raise `hr_ledger_prune`'s hourly batch, lengthen `flush_seconds`
(the lever §9 names), or shorten `player_ledger` retention — a decision with
Reliability, taken before `shadow = false`, not after the table starts growing.

**The invocation number is arithmetic; the plan ceiling is not mine to assert.**
86,400/10 × 30.44 = 263,000 fires a month is a calculation and it stands. What
it is *53% of* depends on the project's actual plan, and this lane has no
database or dashboard access to read it — the published Free-tier figure at time
of writing is 500,000 invocations/month and Pro is 2,000,000, but **the
Coordinator confirms the real ceiling against the project's own billing page
before arming.** A 5 s cadence doubles the figure to 525,000, which crosses the
published Free line, so halving the cadence is a billing decision rather than a
config change; `cadence_seconds` is checked `>= 5` so the smallest legal value is
the one that needs the conversation. The failure mode at scale is the right one: the world
slows uniformly, the bill does not rise.

### Coordinator steps to ship M1 in SHADOW

**The milestone is FOUR files, not three** (Security M-2). Step 3 is not
optional and **must not trail step 4 overnight**: between steps 2 and 3 the
nightly `hr-grant-hygiene` job raises, and a detector that is expected to be
red hides the next real regression.

```
# 0. one file per call, never inside begin/commit, never 00:00–00:10 UTC
node tools/apply-migration.mjs supabase/migrations/2026-09-20-world-tick-roster.sql
node tools/apply-migration.mjs supabase/migrations/2026-09-21-world-tick-settle-fence.sql
node tools/apply-migration.mjs supabase/migrations/2026-09-21-engine-allowlist-tick-settle.sql
node tools/apply-migration.mjs supabase/migrations/2026-09-21-world-tick-cron.sql
# 1. read-only post-apply verification agent, then:
node tests/live-hash-drift.mjs --live --write
#    ⚠ EXPECT A MOVE on hr_assert_grant_hygiene (step 3 restates it) and
#      NO MOVE on hr_apply. "MOVES NO LIVE HASH" is true of each of the other
#      three files and FALSE OF THE MILESTONE — write the whys from --codediff.
node tests/restore-census.mjs                     # hr_tick_* already classified
select public.hr_assert_grant_hygiene();          # EXPECT: no raise (M-2 landed)
#    flip ALL FOUR apply-order notes to APPLIED
# 2. the free extension the driver needs
#    (psql / dashboard)  create extension if not exists pg_net;
# 3. TWO Vault secrets — ONE TIME, never in git, never in argv.
#    There are two because verify_jwt = true stays on: the gateway checks
#    Authorization before the function runs, and the tick's own bearer rides
#    X-HR-Tick-Auth. The gateway key is the PUBLIC anon key and is not the
#    tick's authorisation; do not conflate them.
#    select vault.create_secret(encode(gen_random_bytes(32),'hex'),
#      'hr_tick_shared_secret', 'X-HR-Tick-Auth: pg_net -> hr-accrue op:tick');
#    select vault.create_secret('<project anon key>', 'hr_tick_gateway_key',
#      'Authorization: Bearer — satisfies verify_jwt at the gateway');
#    npx supabase secrets set HR_TICK_SHARED_SECRET=<value> --project-ref nezapsylztqbbwuwembx
# 4. point the driver at the function
#    update public.hr_tick_config set edge_url =
#      'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue';
#    ⚠ hr_tick_config_edge_url_ck (Security M-5) now PINS this to https and to
#      this project's functions origin, so a typo that would otherwise RESOLVE
#      is a check_violation instead of a two-secret exfiltration: this column
#      aims net.http_post, which carries BOTH Vault bearers and the full
#      hr_state_of envelope of every rostered character. A foreign host, a
#      plaintext scheme, file://, and '' are all refused by execution (fence
#      e22). If this UPDATE fails, read the URL — do not drop the constraint.
# 5. edge deploy (the op:'tick' entry — see "remaining work" below)
# 6. ARM IN SHADOW. Pays nothing, and costs the ledger NOTHING (M-6):
#    player_ledger rows/day while shadowed is ZERO at every size.
#    update public.hr_tick_config set enabled = true, shadow = true;
#    insert into public.hr_tick_ownership (user_id, slot, channel, owned)
#      select user_id, slot, 'gather', true from public.player_state
#       where active_kind = 'gather';        -- the rollout cohort, one INSERT
```

Reading the 48 h parity numbers. **These only mean anything because the shadow
chain was fixed (M-1):** before it, the driver shipped the frozen `accrued_to`,
every fire after the first was refused `window_already_settled`, and the first
query below would have returned **one row per character instead of one per
flush** — ~0.05% of what accrual paid. `tests/world-tick-shadow-chain.mjs` is
the exit code for that and is registered in `smoke.yml`. **A parity read that
returns roughly one row per character is that bug, not a tick that pays
nothing — check the row count before reading the sums.**

```sql
-- what the tick WOULD have paid, against what accrual actually paid
select date_trunc('hour', at) h, count(*) rows, sum(would_gold) gold, sum(would_qty) qty
  from public.hr_tick_shadow group by 1 order by 1;
select date_trunc('hour', at) h, count(*) rows,
       sum((meta->'delta'->>'g')::bigint) gold, sum((meta->>'qty')::bigint) qty
  from public.player_ledger
 where kind = 'gather' and intent = 'accrue' and at > now() - interval '48 hours'
 group by 1 order by 1;
-- the driver's own health: outcome mix, and the "buy the host" number
select outcome, count(*), avg(ms)::int ms, max(effective_cadence_seconds) eff
  from public.hr_tick_cron_log where at > now() - interval '24 hours' group by 1;
```

**Arming is a separate decision with its own Security GO** (`update
public.hr_tick_config set shadow = false;`), and the kill switch — `set enabled
= false` — is the rollback for all of it, with no deploy and no schema change.

### Remaining work before gather can be ARMED

| # | Work | Why it is not in this lane |
|---|---|---|
| 1 | ~~**The `op:'tick'` entry in `hr-accrue`**~~ — **LANDED on `lane/world-tick-m1b`** (`supabase/functions/hr-accrue/tick.js`), hardened on `lane/world-tick-m1c`. | Still needs its own adversarial review — it is a NEW AUTHENTICATION PATH on the function that writes all player value and it sits **before** `verifyJwt`, a deliberate bypass of the gate `tests/edge-jwt-gate.mjs` defends. `tests/edge-tick-gate.mjs` is the standing exit code (13 arms, 6 mutations, all biting); the review's attack list is SEC_WORLD_TICK_M1_2026-09-21.md §7 and items 4, 5, 7 and 8 of it are now covered by execution (T-M1e, T-M1, T-R1, T-BB1). **It couples the milestone to an edge deploy: `supabase/functions/**` moved, so `pack-edge` + deploy comes BEFORE the push, or the in-page payload guard is red for every other lane.** |
| 2 | **A Security GO on the three staged migrations**, with the fence read as a money surface. | CLAUDE.md §2 — the security role holds the veto and this lane cannot grant it to itself. |
| 3 | **48 h of SHADOW parity on production**, read with the queries above. | Needs the apply, the deploy and real players. |
| 4 | **Re-run `--gather` on production** and confirm the overlap count is 0 under the corrected classification. | No database access in this lane (S-5). |
| 5 | **Confirm the concurrency claim on production**, read-only. | PGlite is one backend; every arm here proves the MECHANISM (lock before read, CAS against the locked row, UPDATE in the same transaction) and simulates the interleaving by ordering. Same limitation `tools/race-test.mjs` records. |
| 6 | **pg_cron >= 1.5 confirmed on this project.** The migration probes for sub-minute support and falls back to 60 s with a NOTICE, so this is a fluidity question, not a blocker. | Needs the apply to answer. |

### The `op:'tick'` entry, specified

Two headers, and the reason there are two is `verify_jwt = true` in
`supabase/config.toml`, which stays on:

| header | value | who checks it |
|---|---|---|
| `Authorization: Bearer …` | the project's **gateway key** (the anon key is a valid JWT and the gateway accepts it), read from Vault as `hr_tick_gateway_key` | Supabase's gateway, before the function runs |
| `X-HR-Tick-Auth` | the tick bearer, Vault `hr_tick_shared_secret` | the new branch, in constant time |

`index.ts` verifies a PLAYER's JWT as its second statement and derives `user`
from it. A tick request is not about one player and carries no player token, so
the branch must come **before** that call, must compare `X-HR-Tick-Auth` against
`HR_TICK_SHARED_SECRET` in constant time, must return the same `401
not_signed_in` on any mismatch (so it is not an oracle), and must do nothing
else on that path — no database access, no body parse, before the comparison
succeeds. Then, per roster row: `computeAccrual` with `caller:'tick'`,
`settleGatherSession`, and one `hr_tick_settle` per flush window. It never calls
`hr_apply` directly and never reads a user id from the body.

That "before `verifyJwt`" is the whole reason item 1 is a separate review rather
than a line in this lane: it is the one place in the system where a request
reaches the engine without a player behind it.

Honest estimate: **items 1–2 are ~1 lane-day each; item 3 is 48 h of wall clock
that costs no agent time; items 4–6 are minutes once the apply lands.** Gather
can be armed roughly three days after the Security GO, and the tick is a writer
for one channel at that point — not a live world yet. The push channel (§7),
the inventory ABSOLUTE flip (§7a) and combat remain ahead of it, in that order.

## 16. MILESTONE 3 — the COMBAT channel on the tick, in SHADOW (2026-09-22, `lane/world-tick-m3`)

Gather (§15b, §15c) was chosen first because it is the *simplest* payable kind:
a watermark and `tool_carry`, no `fight` checkpoint, no `consec_falls`, no
recovery clock, no auto-eat, no rare roll. Combat is every one of those things
at once, and this section is what the tick has to do differently to pay a combat
window the way the accrue path pays it.

**Status: SHADOW, and not yet wired.** `services/world-tick/combat.js` exists,
`tests/world-tick-combat-parity.mjs` is its exit code, and
`supabase/migrations/2026-09-22-world-tick-combat-channel.sql` is STAGED. The
`op:'tick'` entry (`supabase/functions/hr-accrue/tick.js`) still speaks gather
only; wiring it is M3's next step and is listed under "what remains" below.
Nothing in this section is applied, deployed or armed.

**The one-line summary, because it is not the one the brief expected:** the
combat channel did not need a new engine, a new window rule or a new fence — it
needed **eleven more inputs handed to the engine it already runs**, and two of
the eleven were measured to move a ten-minute window by 65% of its gold and to
hand a seven-time-dead character a first-death grace.

---

### 16.1 The window: a 10 s tick driving `combat-sim` in fixed windows

Unchanged from gather, and deliberately so — the geometry is a property of the
CALLER, not of the channel:

1. **The cadence is 10 s; the window is `watermark → clock`.** Never
   `previous clock → clock`. The engine answers with `delta.accrued_to` — the
   instant it actually ACCOUNTED for — and that becomes the next window's
   `accruedToMs`. (Rule 1 of `tick-gather.js`; P-G8 measured 45% forfeit on the
   wall-clock chain.)
2. **`caller: 'tick'`** — exempt from `ACCRUE_MIN_MS` like a collect, but its
   sub-action remainder is DEFERRED, because the tick's next window starts at
   the watermark this one stamped (§14.1).
3. **`alignWindow` is a performance property, not a correctness one** (P5d).
   Under `caller:'tick'` the unaligned chain forfeits zero, because
   `settledWatermarkMs` hands the remainder to the next window instead of
   stamping `now()`.
4. **The write unit is the SETTLED WINDOW, never the tick.** Ticks accumulate in
   memory; one `hr_tick_settle` per 90 s flush (§15a's 480,000 rows/day prune
   ceiling). Combat does not get an exemption from that arithmetic.

What combat adds to the geometry is **one accounting term**. `settledWatermarkMs`
computes `accounted = ticks × tickMs + recoverMs + idleMs`. Gather windows have
`recoverMs = 0` and `idleMs = 0` always, so gather never exercised the other two
terms. A combat window can be **entirely recovery** — zero ticks, zero kills,
zero value — and it must still settle, because `delta.recovering_until` is the
only thing that carries the recovery line forward and `SKIP.NOTHING` sends no
delta at all (accrual.js `nothingHappened`, RECOVER-2). So:

> **A combat tick window that proposes no value is not a no-op.** The tick must
> batch and flush it exactly like a paying one. A caller that skipped
> `accrued === true && no gold && no items && no xp` would re-simulate the same
> knockout every cadence — recovery exploit R1, arriving through the tick.

### 16.2 Where the window boundary falls relative to a death, a clock and a meal

Three boundary questions, each with the mechanism rather than an intention.

**A death.** `simulateSpan` stamps `recoverUntilMs = atMs + tickMs + rec` at the
fall and writes one `deathLog` entry. Both cross a window boundary intact:
`delta.recovering_until` is an ABSOLUTE ISO instant (already an `ABSOLUTE` key
in `tick-contract.js`), and `delta.deaths` is `APPEND`. `delta.fight` is voided
to `{}` on any window that contained a death, so the next window repairs the
monster to full HP from the catalogue rather than resuming a corpse. **A death
on the last tick of a window is therefore not a free kill**, and that is three
separate mechanisms agreeing rather than one rule:

| mechanism | what it carries | if it were missing |
|---|---|---|
| `delta.recovering_until` (ABSOLUTE) | the line | the knockout is re-served every window (R1) |
| `delta.fight = {}` on `died` | "nothing in flight" | the next window swings at a 0 HP foe → a death PAYS |
| `resolveDeath` sets `playerHp = resumeHpFor(maxHp)` | the 40% stand-up | the resume never happens across the boundary |

The one case worth stating because it looks like a bug and is not: **the `downed`
flag is a `simulateSpan` local and is NOT carried.** It is re-derived as
`recoverUntilMs > 0` at every span start. A window whose recovery line falls
EXACTLY on its own `toMs` clears `state.recoveringUntilMs` to 0, so the next
window seeds `downed = false` and never runs the resume block. That is benign,
but only because the resume block's two effects (monster to full HP, player to
40%) have already been performed by `delta.fight = {}` and by `resolveDeath`.
It is benign by coincidence of three mechanisms, so it is a **guard**
(`C7 recovery-boundary`), not a comment.

**A recovery clock crossing the span.** The line is an absolute instant, so a
window that opens mid-recovery spends its budget on recovery ticks, earns
nothing, drains the buff queue, and reports `summary.recoverMs > 0`. Accounted
time is therefore `recoverMs` and the watermark advances by exactly it. Two
windows tiling one knockout account for the same milliseconds one window would.
The retreat's `idleMs` is the same shape — but see 16.6, because a retreat is
also the one thing that ENDS a tick session.

**A food debit.** `delta.items[foodId]` is negative and `ADDITIVE_MAP`, so the
fold sums it; `advance()` carries the bag forward and deletes a key that reaches
zero. The bag the engine reads at window *k* is therefore the bag window *k-1*
ate out of, which is what makes a mid-span exhaustion land on the same tick in
both paths.

**⚠ But one death-row field is a window-OPEN snapshot and therefore genuinely
diverges.** `hadFood` is computed once per `computeAccrual` call, before the
span (accrual.js: *"Computed before the span because after it the bag has been
eaten out of"*), and it is journalled as `delta.deaths[].food_in_bag` and
`summary.autoEat.hadFood`. Over a decomposition it is re-computed per window, so
for a character whose bag empties at minute 5 and who falls at minute 8:

| | `food_in_bag` on that death row |
|---|---|
| accrue path, one 10-minute call | `true` (the bag had food when the WINDOW opened) |
| tick, 60 windows | `false` (the bag was empty when THAT window opened) |

Neither is wrong; they answer different questions, and the decomposed answer is
the one that agrees with `resolveDeath`'s own `foodless`, which reads the LIVE
bag at the fall and is the fact the retreat ladder actually uses. **It is not a
value defect** — `food_in_bag` is an audit field on the death ledger row and no
gate, price or grant reads it. It is recorded here, asserted by `C8`, and named
in 16.8's honest list, because the alternative — quietly calling it parity —
is how a receipt field stops meaning anything.

### 16.3 The seed label MUST be the `hr_state_of` JSONB rendering (Security T-2)

`hr_seed(user, slot, label)` hashes the LABEL. Security executed the three
spellings in play and found the tick and the roster agreeing with each other and
neither agreeing with the accrue path
(`SEC_WORLD_TICK_M1_2026-09-21.md` T-2, **P0, blocks SHADOW**):

| | expression | result |
|---|---|---|
| accrue path (the incumbent, 200 days of live seeds) | `'accrue:' + String(st.accrued_to)`, `st` = the `hr_state_of` **JSONB** envelope | `accrue:2026-09-21T17:55:55.739123+00:00` |
| `tick.js:380` | `'accrue:' + new Date(ms).toISOString()` | `accrue:2026-09-21T17:55:55.739Z` |
| roster `:507` | `'accrue:' \|\| to_char(…,'…MS"Z"')` | `accrue:2026-09-21T17:55:55.739Z` |

Executed, `hr_seed` over the two labels returns
`-1921344458354348381` vs `7953584315518101330`. **`Z` vs `+00:00`, and
milliseconds vs microseconds, are two different RNG streams.**

For gather that costs the measurement. **For combat it costs more**, because
combat is the only channel with rare drop rolls: every drop, every crit and
every gold roll in `hr_tick_shadow` would diverge from what accrual paid *by
construction*, and the natural reading of a 48 h mismatch on a channel that
mints loot is "the tick is wrong" — or, worse, "loosen something".

**The rule for the combat channel, therefore, stated as a contract and not as a
convention:**

> The tick never *builds* a seed label from a `Date`. It carries the watermark's
> **string as the envelope rendered it** and labels with that string verbatim.
> `combat.js` `sessionFromRoster` keeps `accruedToText` beside `accruedToMs`;
> `seedLabelFor(text)` is `'accrue:' + text` and takes no Date, no number and no
> format argument. A window whose label is unobtainable **breaks the walk** and
> leaves the tail owed — never a fallback seed, which is the `fixedSeed` mutant
> (+48% gold, three rare drops at rate zero).

`C9` is the exit code: relabelling one window `…Z` instead of `…+00:00` must
turn the arm red. The guard is built so it is **not** structurally blind the way
`world-tick-parity.mjs` was — that file feeds the same JS `seedFor()` to both
sides of every comparison, which is exactly why nothing in the repo saw T-2.

**And the module written to prevent T-2 fell into it, which is the strongest
thing this section can say about the rule.** `settleCombatSession` originally
left the seed hook unset when no production one was supplied, so it fell through
to `tick-shadow.js` `seedFor` — the Date path, the `…Z` spelling. Nothing looked
wrong: the code reads as "no hook, no override". `C14`'s value-conservation arm
caught it, because the shipped loop and the guard's own chain then drew two
different streams for the same windows and their item maps disagreed by a few
units. So the label is now derived in ONE place from the envelope's string, and
a session carrying no rendered watermark is **refused** rather than seeded from
a Date — the failure mode is "the tick cannot settle this", not "the tick
settles it on a stream nobody chose". That precondition is itself an arm of C9.

The general lesson, since it is the second time in this program: **an
UNSPELLABLE default beats a documented one.** T-2 and this were both a
reasonable-looking fallback, not a mistake anybody typed.

### 16.4 The eleven missing inputs — the actual content of this milestone

`tick-shadow.js` built the engine's input object from the fields a GATHER window
needs. `hr-accrue/index.ts` `runAccrual` builds it from the whole `hr_state_of`
row. The difference, for a combat pointer, is eleven keys, and this is the list:

| input | what it drives | direction if omitted |
|---|---|---|
| **`autoEatEnabled` / `autoEatFood` / `autoEatPct`** | `fx.autoEat` → `resolveAutoEat` | **UNDER-PAY, catastrophically** |
| **`deathsTodayBefore` / `deathsLifetimeBefore`** | `recoveryFor()` — which rung of the ladder this fall charges | **OVER-PAY (a mint)** |
| `combatXpAccruedToMs` | `xpEligibleFromMs` — the split against XP a live credit already applied | over-pay (double-credited combat XP) |
| `hearthfindReady` | whether `delta.hearthfind` may be proposed at all | under-pay, and a deleted "wow" moment |
| `enchant` | gear bonuses inside `equipmentStats` | unmeasured |
| `combatStyle` | `deriveTickMs(equipment, items, style)` | measured INERT on the bow fixture (2112 ms either way); unproven in general |
| `companionXpBacked` | the pet-XP ops a kill files | under-pay |
| `ammoCarry` | the consumable remainder | inert TODAY (`player_state.ammo_carry` does not exist) |

**MEASURED, same character, same window, same seed** (`small_wolf`, 10 minutes,
hp 20, 40 Cooked Trout in the bag, auto-eat at 70%):

| | kills | ticks | deaths | gold | XP | meals |
|---|---|---|---|---|---|---|
| tick input as M1 shipped it (auto-eat keys absent) | 48 | 99 | **5** | 276 | 2,464 | 0 |
| accrue input (auto-eat on) | **139** | **250** | **0** | **788** | **6,568** | 15 |
| | | | | **−65.0%** | **−62.5%** | |

That reproduces, through the TICK, the −63% to −99% band `src/core/auto-eat.js`
measured when the *engine* had no auto-eat at all. A tick-owned combat channel
shipped with this input set would have deleted between two thirds and
ninety-nine per cent of every unattended night **for exactly the players who
bought Auto-Eat to avoid that**.

**And the ladder, which runs the other way** (`lesser_demon`, 10 minutes, a
character with 6 deaths today / 60 lifetime):

| | recovery per fall | `deaths_today` on the ledger row | `recoverMs` | paying ticks |
|---|---|---|---|---|
| tick input as M1 shipped it | `0 ms`, then `120,000 ms` | 1, 2, 3 | 120,000 | 7 |
| accrue input (`deathsTodayBefore: 6`) | **`3,840,000 ms`** | **7** | 590,400 | 4 |

The tick hands a seven-time-dead character **the first-death novice grace**.
Recovery is the *cost* of dying, so less knockout time is more paying time: this
one is a mint, it is silent, and the ledger row it writes says `deaths_today: 1`
about a character on rung 7.

**Why no guard saw either.** `tests/world-tick-parity.mjs` `accrualOnReturn`
DOES pass `autoEatEnabled/Pct/Food`; `shadowTick` does not. P1 compares them for
byte-identity and has been green — because the only fixture with auto-eat on is a
maxed character at 99 HP fighting a slime, who never drops below the 50%
threshold, so the handler never fires and the two contracts are indistinguishable
on that data. **The guard was not wrong; it was blind.** The fix is a fixture
that can tell them apart and a structural arm that does not depend on a fixture
at all:

> **`C1 — ENGINE-INPUT KEY PARITY.** The key set of the object the tick hands
> `computeAccrual` must equal the key set `hr-accrue/index.ts` hands it, derived
> **from that file's source** rather than retyped here.* A key added to the
> accrue path and not to the tick is then red on the commit that adds it, which
> is the only way this class of defect stops recurring.

### 16.5 The fold, where combat is genuinely different from gather

The fold law (§6) classifies every delta key. Gather's flush only ever exercised
`ADDITIVE_*` and `ABSOLUTE`. Combat is the first channel that puts real content
in `APPEND`, and **three of its per-call clamps are re-checked after the fold
for the first time**. All three were measured to bite on ordinary play.

**(a) `progress` — measured 69 ops against `hr_apply`'s cap of 64.**
`c_max_progress_ops constant int := 64` (2026-09-14-hr-apply-restatement.sql
:316). A combat window files up to **ten** progress ops — `stat:kills`,
`stat:crits`, `stat:deaths` (lifetime), `stat:deaths` (UTC day), `stat:rare_drops`,
the goal counters (`ev:kill_any`, `ev:kill_monster:<id>`, `ev:loot:<item>` …),
the modal-goal daily rows, and a `flag:recipe:<id>` for every recipe scroll that
dropped. Nine of those windows is ONE 90 s flush at the shipped 10 s cadence.
Measured on the M3 fixtures over ten minutes, raw ops per flush → folded
(`node tests/world-tick-combat-parity.mjs --verbose` reprints this on every run):

| fixture | flush 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| goblin grind | 55→7 | 56→9 | 52→6 | 58→11 | 56→9 | **64**→11 |
| auto-eat, bag empties | **68**→9 | **65**→9 | **65**→9 | 62→9 | **65**→9 | 62→9 |
| opens Knocked Out | 0→0 | 32→9 | 63→11 | **65**→11 | 54→9 | 53→7 |
| bow vs rat | **65**→9 | **66**→9 | 59→8 | 63→8 | **65**→9 | **69**→9 |

**Anything over 64 is `too_many_progress_ops`, which refuses the whole flush
window.** Three of the four fixtures are over it on an ORDINARY fight, and the
fourth touches 64 exactly. So the combat flush folds `progress` by
`(kind, key, period, state)` and sums `add`.

That is a FOLD and not a clamp, and the distinction is the whole argument for
being allowed to do it: `hr_apply`'s own loop applies each op as
`progress = progress + add` against a row keyed on exactly
`(kind, key, period_key)`, so summing identical keys before the call is
arithmetically the same write. `sum(add)` is therefore preserved exactly, and
that equality is asserted on every flush of every fixture on every run (C13) —
not sampled. `state` is part of the fold key so a `done` is never summed into
an `active`, and first-seen order is preserved, because `hr_apply` applies them
in order and a reordered stream is a different ledger to read.
**Nothing is clamped, dropped or re-priced.**

`foldCombatDelta` still FAILS LOUD if the folded list somehow exceeds the cap
(the worst folded flush measured is 11 against 64). Truncating there would
silently drop a counter a player watches; shortening the flush is the caller's
decision, so the caller is the one told.

**(b) `hearthfind` — the fold produces an ARRAY, and `hr_apply` refuses it.**
`foldDeltas` classifies `hearthfind` as `APPEND`, so two windows that each rolled
a find produce `hearthfind: [ {...}, {...} ]`. `hr_apply` (§4a-h) checks
`jsonb_typeof` and answers `bad_hearthfind` — *"the `hearthfind` key is an
OBJECT, so the body structurally cannot see two"*. The flush therefore collapses
to ONE find carrying `dropped: <count of the rest>`, which is the identical rule
`accrual.js` already applies WITHIN one window (`finds.length > 1 ? {...finds[0],
dropped} : finds[0]`). One rule, restated at the one place a second find can
now appear. The discard is journalled by `hr_apply` as `hearthfind_span_discard`
exactly as it is today.

**(c) `deaths` — clamp to `MAX_DEATH_ROWS` after the fold.** Each window already
slices to 24; nine windows can carry 216. `hr_apply` rejects `> c_max_death_rows`
with the whole flush attached (:1560). The flush slices after the fold.

**(d) `consec_falls`, `fight`, `recovering_until`, `hp`, `activity`** are all
`ABSOLUTE` — last window wins — which is already correct and needed no change.
**(e) `gold`, `xp`, `items`** are additive; `items` is SIGNED, so the food debit
and the drops sum into one map, which is what `hr_apply`'s
`have + delta >= 0` re-check is written against.

**The journal meta.** The tick's combat row is `accrue`'s own meta key set plus
`src:'tick'`, per §15b: `ms, ticks, kills, capped, ate, spent?, w?, from, to,
src`. `ms` is RESTATED from the watermark, never summed from the polls (P-G5's
+31% over-statement). That is **ten keys at the widest**, which is exactly
`tests/accrual-engine.mjs` SHAPE's allowlist length — and it fits only because
`att` is structurally absent from a tick row. See 16.6.

### 16.6 The attended split, and why the tick refuses it rather than prices it

`attended` is the server's own record of kills it has ALREADY accepted and
clamped for this character since `accrued_to` (`hr_attended_kills`). The accrue
path pays `min(claimed, attendedKillCap, ATTENDED_MAX_FIDELITY × sim) − sim` on
top of the simulation.

**Every term of that is priced against the SPAN.** Decompose a span into sixty
windows and hand each the same claim and it is paid sixty times; split the claim
and the arithmetic is undefined. There is no correct way for a 10 s window to
carry an attended top-up, so:

> **The combat channel hands the engine `attended: null`, always, and
> `settleCombatSession` THROWS if a caller supplies one.** Fail-closed, and
> executable (`C10`).

Two consequences, both stated rather than discovered later:

1. **In SHADOW this pollutes the parity read, and the read must partition.** A
   character with live kill-credit in the window will show `hr_tick_shadow`
   under what `player_ledger` recorded, by exactly the top-up — and that is the
   T-2 failure shape (a measurement that reads as a defect). It needs no new
   column: the accrue path journals `meta.att` on **every** attended settle, so
   the partition key already exists.

   ```sql
   -- COMBAT parity, 48 h, partitioned on whether the window was attended
   select date_trunc('hour', at) h, (meta->'meta' ? 'att') attended,
          count(*) rows, sum((meta->'delta'->>'g')::bigint) gold
     from public.player_ledger
    where kind = 'combat' and intent = 'accrue' and at > now() - interval '48 hours'
    group by 1, 2 order by 1, 2;
   -- compare ONLY the attended=false bucket against hr_tick_shadow.
   ```

2. **It is a hard ARM blocker.** Arming combat while an attended character is on
   the roster under-pays them by the top-up. Before `shadow = false` for combat,
   either the roster excludes a character with kill-credit rows newer than
   `accrued_to − ATTENDED_EDGE_SLACK_MS`, or the entry passes `attended` through
   and the flush becomes the unit the cap is priced on. **Neither is in this
   lane**; both are named in 16.8.

It also buys the meta key budget in 16.5: a tick combat row cannot carry `att`,
so its widest shape is ten keys and SHAPE's allowlist is not touched.

### 16.7 Rested XP is NOT the tick's, and that is loss-free — proved, not asserted

`index.ts` settles the Rested bank alongside every accrual, on its **own**
watermark `rested_at`, even when the pointer accrual refused. The tick does not,
and must not: `rested_xp` / `rested_at` are not in `tick-contract.js`'s key
classification, so `foldDeltas` would throw on them — correctly, because a bank
charge is not a combat product and folding it would be the second copy of
`accrueRested`.

The reason that costs nothing is arithmetic rather than hope.
`accrueRestedXp` grants `floor((now − restedAt) / CHARGE_MS)` and advances
`restedAt` by **exactly the charges paid**, never to `now()`. So over any
partition of `[t0, t1]` the charges telescope:
`Σ floor((wᵢ − restedAtᵢ₋₁)/C) = floor((t1 − restedAt₀)/C)`, and the bank is a
saturating add, for which `min(lim, min(lim, b+c₁)+c₂) = min(lim, b+c₁+c₂)`.
**A player whose combat is tick-settled banks the identical Rested XP at their
next return, to the charge.** `C11` asserts the telescoping identity and its
mutant (`restedNow` — advance `rested_at` to `now()` instead of by the charges
granted) turns it red.

The honest note that goes with it: **this is equally true of the gather channel,
which also does not settle Rested XP**, so 16.7 is a statement about the tick
and not about combat.

### 16.8 The one honest list: where combat differs from gather

| # | Gather | Combat | Where it is handled |
|---|---|---|---|
| 1 | no rare roll — a decomposition is digit-for-digit equal (P-G1) | drop rolls, crit rolls, gold rolls — a decomposition **resamples the stream** and is NOT equal to one call | parity is **per window** (C2), stream health across the span (C6). §11's "P1, not P4" |
| 2 | `tool_carry` only | `fight`, `consec_falls`, `recovering_until`, `hp`, plus the death log | all ABSOLUTE/APPEND and already classified; C3/C7 |
| 3 | no recovery | a window can be **entirely recovery** and must still settle | 16.1; RECOVER-2 |
| 4 | bag is written only | bag is **spent** (auto-eat) and read back | 16.2; `advance()` carries it |
| 5 | pointer changes only on a level stop | **retreat** idles the pointer mid-flush (measured: a weak character retreats and 58 of 60 windows then refuse `no_activity`) | the batch CLOSES on an `activity` key and the character leaves the roster; C5 |
| 6 | ≤2 progress ops/window | up to **10**, and **69** in a 90 s flush against a cap of 64 | the progress fold, 16.5(a) |
| 7 | `hearthfind` possible but rare | same key, and the fold turns two into an ARRAY `hr_apply` refuses | 16.5(b) |
| 8 | no attended surface | the attended top-up cannot be decomposed | refused, 16.6 |
| 9 | 8 engine inputs | **19** — eleven more, two of them P0 | 16.4, C1 |
| 10 | seed label costs the measurement | seed label costs the measurement **and every drop roll** | 16.3, C9 |
| 11 | `food_in_bag` n/a | a window-OPEN snapshot that genuinely diverges under decomposition | 16.2, C8 — recorded, not papered over |

**The double-pay fence is reused UNCHANGED**, and that is the one place combat
is boring. `hr_tick_settle` takes the `player_state` row lock, compare-and-sets
`greatest(accrued_to, shadow_accrued_to)`, checks the version, binds
`p_delta->>'accrued_to'` to `p_window_to`, honours the kill switch and the shadow
flag — none of which is channel-aware. `tickIntentId` is imported from
`tick-gather.js` rather than re-spelled: one copy, so a channel cannot drift into
a weaker key. The channel appears in the key only through the window bounds and
the version, which is sufficient because a character has exactly one pointer.

### 16.9 What the shadow table records for combat, and why

The 48 h parity read has to be answerable **per field**, because "the tick paid
5% less" is not an actionable sentence — "the tick paid 5% less and ate 0 meals"
is. `hr_tick_shadow` today denormalises `would_gold`, `would_qty`, `would_ticks`,
which is the gather shape. The staged migration adds, **as STORED GENERATED
columns over the `delta` the fence already stores verbatim**:

| column | from | reads |
|---|---|---|
| `would_kills` | `delta#>>'{journal,meta,kills}'` | kills |
| `would_ate` | `delta#>>'{journal,meta,ate}'` | **food eaten — the auto-eat parity number of 16.4** |
| `would_xp` | `delta->'xp'` | XP by skill |
| `would_items` | `delta->'items'` | **drops by item, and the signed food debit** |
| `would_deaths` | `jsonb_array_length(delta->'deaths')` | deaths |
| `would_recovering_until` | `delta->>'recovering_until'` | the recovery state, **as text** |
| `would_hp` | `delta->>'hp'` | the resulting HP |
| `would_consec_falls` | `delta->>'consec_falls'` | the retreat counter |

Three deliberate choices:

- **GENERATED, not inserted.** `hr_tick_settle`'s body is not restated, so the
  file adds no ordering dependency on an unapplied function and moves no live
  hash. The columns cannot disagree with the delta they are derived from.
- **`would_recovering_until` is `text`, not `timestamptz`.** The cast
  `text → timestamptz` is STABLE (it reads the `TimeZone` GUC), not IMMUTABLE,
  so a generated column cannot use it. Storing the ISO string the engine
  actually proposed is the honest value anyway — it is what `hr_apply` would
  have been handed.
- **`would_xp` / `would_items` are jsonb**, because "which skill" and "which
  item" is the whole question a combat parity read asks, and a scalar sum would
  answer none of it.

`hr_tick_config.channels` also gains a CHECK: it is the only tunable on that row
with no constraint, and it is the column that decides which kinds the tick may
be pointed at. It is constrained to `accrual.js` `PAYABLE_KINDS`, the same set
the roster's `c_payable` already carries. **It is NOT defaulted to include
combat** — arming is an operator UPDATE with its own Security GO, and a
migration that widened the default would arm a channel by applying a file.

The `hr_tick_ownership` and `hr_tick_shadow` channel CHECKs **already list
`'combat'`** (roster `:249`, fence `:285`), so the enum half of this file is a
no-op and the file says so rather than pretending to add it.

### 16.10 What is proved, what needs production, and what remains

**Proved offline, with an exit code.** `node tests/world-tick-combat-parity.mjs`
(registered in `smoke.yml` beside its gather sibling): fifteen claims, thirteen
mutants, each mutant red on the claim it is FILED against rather than merely on
something.

| | claim | its mutant |
|---|---|---|
| C1 | engine-input key parity, derived from `index.ts`'s own source, both directions | `noAutoEat`, `noDeathCounters` |
| C2 | per-window construction parity — all 60 windows of every chain, byte-identical | `nofight`, `shiftWindow` |
| C3 | checkpoint continuity: `fight` / `consec_falls` / `recovering_until` / hp / bag | `nofight` |
| C4 | tiling and the receipt — no overlap, no gap, `ms` restated from the watermark | `wallclock`, `shiftWindow` |
| C5 | a retreat closes the batch and ends the session | — (positive claim; measured: the pointer ends at window 14 of 60, `stoppedBy='activity'`, 2 intents) |
| C6 | stream health over 8 span starts: no rare row starved at ALL of them, drift in band | `fixedSeed` |
| C7 | the recovery boundary is not a free heal and not a free kill | `freeHeal` |
| C8 | the food debit is conserved exactly; `food_in_bag` divergence is PINNED | `skipFoodDebit` |
| C9 | EVERY window's seed label is a server rendering of that window's own watermark | `relabelSeed` |
| C10 | the attended top-up is refused, not priced | `attendedThrough` |
| C11 | Rested XP telescopes below the bank cap | `restedNow` |
| C12 | the journal row is accrue's meta + `src:'tick'`, ≤10 keys, never an `att` | — |
| C13 | the fold re-checks the three per-apply clamps | `progressNoFold`, `hearthfindArray` |
| C14 | the fence is reused unchanged — one intent id, version on intent 0 only | — |
| C15 | the staged migration's channel literal == `PAYABLE_KINDS`, and it arms nothing | — |

The four the M3 brief asked for by name are `skipFoodDebit`, `shiftWindow`,
`relabelSeed` and `freeHeal`. `freeHeal` is worth one sentence because of where
it had to bite: applied to this window's delta it changes nothing (the delta is
already correct), so the assertion reads the INPUT of the NEXT window — which is
exactly where a decomposition would re-introduce b509.

**Needs production to answer**, and is asserted by nobody here: whether the
combat roster is non-empty (the gather roster was measured EMPTY on 2026-09-18 —
22 parked pointers, 0 inside the 24 h window); the real 48 h value drift on the
attended=false bucket; whether `combatStyle` and `enchant` move a real
character's window, since both measured inert on these fixtures; and the
`too_many_progress_ops` rate at real flush lengths.

**⚠ THE EDGE PAYLOAD HASH MOVES, AND IT HAS MOVED TWICE.**
`tick-shadow.js` is IN the payload (`tick.js` → `tick-gather.js` → it), so the
eleven-input change moves `pack-edge --hash` off
`253215e48d3e2b3ccd3d1ebec1f52e529d3e8cf50147429ef80915c680ab14d8` — the exact
hash `SEC_WORLD_TICK_M1_2026-09-21.md` returns **BLOCK** at.

**The hash to verify after the deploy is
`9f9ec411bfefe428056df54b0cb9947fe683bfe5254096790f8d09ed997138f3`**, measured
with `node tools/pack-edge.mjs hr-accrue --hash` at this lane's head. Two
earlier numbers are in circulation and BOTH are stale, which is the whole
reason this paragraph names how it was measured rather than only what it says
(Security S-6): `df215d58…` was the hash at `ea889df`, before the lane merged
`next`, and `e76ae11c…` was the hash at `59b748e5`, before it merged `next`
again for the fence's `::text::jsonb` delta fix. An operator who verifies
`payload_sha256` against either will chase a deploy that in fact succeeded.
Nothing in the S-1/S-2/S-3 fixes moves it again: they live in
`services/world-tick/combat.js`, which `pack-edge --check` does not list.

Two consequences, neither optional:

1. **`supabase/functions/**` moved, so `pack-edge` + deploy comes BEFORE the
   push**, or the in-page payload guard is red for every other lane (CLAUDE.md
   §3.3).
2. **Security re-verifies at the new hash.** The change is on the seam that
   decides what the engine is told, which is squarely in the T-series' scope.

**The deployed GATHER behaviour does not move, and that is asserted rather than
argued.** `tick-gather.js`'s `sessionFromRoster` sets none of the eleven, so
they arrive `undefined` exactly as they did; `attended: null` and an absent
`attended` both `normaliseAttended` to `null`; and `goals` was removed because
`computeAccrual` builds its own counter and never read `inp.goals` — a plumbed
input that did nothing, which is worse than an absent one because the next
author wires a real goal model into it. P-G1…P-G9 staying green is the exit
code for all of that.

**THE APPLY RUNBOOK** (`2026-09-22-world-tick-combat-channel.sql`; the same
steps are in the migration header, where the operator running it will look).

1. **Pre-flight, read-only, before anything (Security S-5).** The `channels`
   CHECK is validated against the existing row on apply, and a **NULL element**
   in the live array makes the predicate NULL — which *passes* validation. §3
   `c2c` only probes a temp table, so it never sees the live row.

   ```sql
   select channels,
          array_position(channels, null) as has_null_element,   -- must be NULL
          enabled, shadow
     from public.hr_tick_config where id;
   -- Expect: channels = {gather}, has_null_element NULL, enabled false, shadow true.

   select pg_size_pretty(pg_total_relation_size('public.hr_tick_shadow')) as size,
          count(*) as rows
     from public.hr_tick_shadow;
   ```

   If `has_null_element` is not NULL, **stop** and clean the array first: the
   constraint would validate a value the tick cannot settle.

2. **Drain the lease and pause the tick — this is a TABLE REWRITE (Security
   S-4).** The eight new columns are `GENERATED ALWAYS … STORED`, and
   PostgreSQL always rewrites a table to add one. The rewrite holds ACCESS
   EXCLUSIVE on `hr_tick_shadow` while the gather shadow inserts into it every
   90 s: the apply blocks on the running writer and blocks it in turn, for a
   duration that scales with the table (sized by the second select above).
   This is the "changes" in GO-WITH-CHANGES; the migration is otherwise clean.

   Wait for the current lease to expire (`lease_until <= now()` in
   `hr_tick_ownership`), then `update public.hr_tick_config set enabled = false
   where id;` for the apply, and set it back to `true` afterwards. The file
   arms nothing either way (§3 `c3`), so the gather cohort resumes untouched.

3. **Apply**, one file, Coordinator only, never inside `begin/commit`, never
   00:00–00:10 UTC (CLAUDE.md §2):

   ```bash
   node tools/apply-migration.mjs supabase/migrations/2026-09-22-world-tick-combat-channel.sql
   ```

**What remains before combat is even SHADOW-able on production**, in order:

| # | Work | Owner |
|---|---|---|
| 1 | Security's T-1/T-2/T-3 fixes land — combat inherits T-2 and is hurt worse by it (16.3) | M1 |
| 2 | The `op:'tick'` entry learns the combat channel (`tick.js` is gather-only) | next M3 step |
| 3 | The migration applies behind a Security GO; it touches a money surface's journal | Coordinator |
| 4 | `update hr_tick_config set channels = channels \|\| 'combat'` + an ownership cohort | operator |
| 5 | **Before ARMING**: the attended fence (16.6), and §7a's inventory ABSOLUTE flip + monotonic frame gate, which combat has always been behind | separate lanes |

---

## 17. Where I disagree with the brief

0. **Superseded 2026-09-18 by §15a:** the first-channel argument below said
   *farm*. Real windows changed the answer to **gather** — farm has no accrual
   window at all, so it is the one channel where "the tick is just another
   caller of the existing engine" is false. Read §15a before this item.

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
