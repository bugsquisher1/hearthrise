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
- **A frame ADVANCES the gate only if `frame > lastAppliedFrame`.** Strictly
  greater. Equal is a duplicate and lower is a reorder, and neither ever raises
  the floor. There is no merge, no "apply the newer fields", no per-key
  comparison — the whole frame is applied or the whole frame is dropped.
- **A duplicate is nonetheless RE-APPLIED by the intent applier, absolutely**
  (amended 2026-09-23, `SEC_PUSH_CHANNEL_M5_2026-09-23.md` S1). "Equal is
  dropped" is sound for a *stateless* receiver; this client is not one. It
  carries optimistic writes on top of the applied frame, and the envelope that
  retires them is a **refusal** — which writes nothing server-side, so
  `player_state.version` does not move and the correction arrives at exactly
  `lastAppliedFrame`. Dropping it leaves the browser showing a number the
  server does not hold, which is `CLAUDE.md` §6 and a P1 class-kill. Re-applying
  cannot be a rewind: the server never rewrites the content of a version it has
  already stamped, so an equal frame is byte-for-byte the state behind the
  floor. **A reorder is still dropped whole** — that one *would* be a rewind.
  What a duplicate may not do is replay anything non-idempotent: it does not
  raise the floor and it does not re-hang a collect receipt, because a receipt
  is replayed into `updateDaily('kill_any')` and that is a shared surface.
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

   **THE SPELLING IS `meta ? 'att'`, AT THE TOP (Security S-10, 2026-09-23).**
   `hr_apply` writes the row as
   `jsonb_build_object('delta', v_meta) || coalesce(v_j->'meta','{}')`
   (`2026-08-11-apply-engine.sql:1159` and every restatement since), so the
   journal's own keys — `att`, `kills`, `ate`, `capped`, `ms`, `ticks` — are
   merged at the TOP of `player_ledger.meta`, and only the engine's delta
   summary sits under `meta->'delta'`. There is no `meta->'meta'` level.

   This block used to spell the partition `(meta->'meta' ? 'att')`, which
   evaluates to **NULL** — so `group by` collapsed to one bucket and any
   `where … and not (meta->'meta' ? 'att')` returned NO ROWS AT ALL. That is
   16.3's own failure shape planted in the instrument: a measurement that
   reads as a defect, or as nothing. Three related spellings were wrong the
   same way and are corrected wherever they appear: `hr_tick_config` has
   **`flush_seconds`**, not `flush_ms`; `hr_kill_credit_log` has
   **`created_at`**, not `at`; and **deaths are their own `intent = 'death'`
   ledger rows**, never a `meta->'delta'->'deaths'` array — the delta summary
   carries `g`, `m`, `i`, `x`, `e`, `bs`, `k` and no deaths at all, so
   `jsonb_array_length(meta->'delta'->'deaths')` is always 0.

   ```sql
   -- COMBAT parity, 48 h, partitioned on whether the window was attended.
   -- NOTE THE LEVEL: `meta ? 'att'`, not `meta->'meta' ? 'att'`.
   select date_trunc('hour', at) h, (meta ? 'att') attended,
          count(*) rows, sum((meta->'delta'->>'g')::bigint) gold,
          sum((meta->>'kills')::bigint) kills, sum((meta->>'ate')::bigint) ate
     from public.player_ledger
    where kind = 'combat' and intent = 'accrue' and at > now() - interval '48 hours'
    group by 1, 2 order by 1, 2;
   -- compare ONLY the attended=false bucket against hr_tick_shadow.
   ```

   **Every query in this section is EXECUTED by
   `tests/world-tick-ledger-meta.mjs`** against a real `hr_apply` ledger row on
   the PGlite chain replay — the block above is lifted out of this file and
   run, and the old spelling is pinned as still returning nothing. A parity
   read that silently addresses a level that does not exist cannot come back.

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

**⚠ THIS SECTION NAMES NO PAYLOAD HASH, AND THAT IS THE RULE (Security S-6b,
2026-09-23).** It named one three times and the literal was stale all three
times — `253215e4…`, then `df215d58…`, then `e76ae11c…`, then `9f9ec411…` —
because every merge into the lane moves it. An operator verifying
`payload_sha256` against a number written down days earlier chases a deploy
that in fact succeeded, and a document that keeps a value which rots by
construction will keep producing that finding. So the value is no longer
written here at all:

> **MEASURE IT AT THE SHA YOU ARE DEPLOYING.** Run
> `node tools/pack-edge.mjs hr-accrue --hash` at the exact commit being
> deployed, and verify the live function's `payload_sha256` equals **that**
> output. Never against a hash quoted in this file, in a review, or in a
> changelog — all three are historical by the time they are read.

The payload genuinely does move, which is why the instruction is a
measurement and not a constant: `tick-shadow.js` and `tick-gather.js` are in it
(`tick.js` → them), and since 2026-09-23 so is `tick-combat.js` — the combat
settler MOVED into `supabase/functions/hr-accrue/` when `tick.js` learned to
dispatch on `active_kind` (Security S-8). The older note that the combat fixes
"live in `services/world-tick/combat.js`, which `pack-edge --check` does not
list" was true when written and is **no longer**: that file is a re-export now,
and a change to the settler moves the payload hash like any other edge file.

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

---

## 17. The derived per-request token — T-5.3, the condition on PAYING

**Status: STAGED on `lane/world-tick-token`. Security review of T-5.3 pending.**
M1 is arming in SHADOW on production. M2 — `update public.hr_tick_config set
shadow = false;` — is BLOCKED by Security ruling T-5.3
(`docs/planning/SEC_WORLD_TICK_M1_2026-09-21.md`) until the static bearer the
cron driver posts is replaced by a token derived per fire. This section is the
design of that replacement. It is a money-gating surface: it decides when the
tick may PAY.

### 17.1 The problem, restated in one paragraph

`hr_tick_cron_run` reads the Vault secret `hr_tick_shared_secret` and posts it
verbatim in `X-HR-Tick-Auth`. That header transits `net.http_request_queue` and
`net._http_response`, both of which carry **SELECT to PUBLIC**, granted by
`supabase_admin`, which the applying role `postgres` cannot revoke —
`2026-09-22-pg-net-queue-lockdown.sql` is that revoke and its own self-check
refused the apply for exactly this reason (T-5.1). The secret is therefore
unreachable today because of *one PostgREST setting we do not own* plus *the
absence of a bridge we do own*, and not because of privilege. In SHADOW a
stolen bearer moves no value, which is why T-5.1 granted the arm. Once
`shadow = false` a holder of that bearer can propose a legal delta for any
character the roster leased. **A derived token removes the class: nothing
long-lived ever transits the queue.**

### 17.2 The shape — T-5.3's, exactly

The brief for this lane sketched `v2.<ts>.<nonce>.<mac>` with a per-isolate
nonce LRU. **T-5.3 prescribes a different shape and T-5.3 wins** (CLAUDE.md §0:
a dated ruling is not overridden by an undated one). The shape is:

```
X-HR-Tick-Auth: v1 t=<bucket> b=<body_sha256_hex> m=<hmac_sha256_hex>

  bucket      = floor(extract(epoch from now()) / 30)::bigint
  body_sha256 = hex sha256 of the EXACT posted body bytes
  m           = hex hmac_sha256(key = the Vault secret,
                                msg = bucket::text || '.' || body_sha256)
```

- The Vault secret `hr_tick_shared_secret` **never leaves the database**. The
  driver sends a derivation of it.
- The edge recomputes `m` from `HR_TICK_SHARED_SECRET` for
  `bucket ∈ {n-1, n, n+1}` and compares **constant time**. Three 30 s buckets is
  a **≤90 s acceptance window** — the flush cadence, and far wider than any
  Postgres↔edge clock skew.
- The edge ALSO recomputes `sha256(body bytes)` and requires it to equal `b`.
  **Both checks are load-bearing and neither is redundant**: `m` covers only
  `t` and `b`, so without the body-hash check a captured triple would
  authenticate *any* body. That check is the body binding.
- An unset or short (`< MIN_SECRET_LEN`, 32) `HR_TICK_SHARED_SECRET` refuses
  every tick request, unchanged from the static form.

### 17.3 Why there is no nonce and no replay cache

The brief asked for an in-memory LRU per isolate. **It is not built, and the
reason is a liveness bug rather than a preference.** At a 10 s cadence three
fires land in each 30 s bucket. When the roster has not moved between them the
driver's body is **byte-identical** — same holder, same geometry, same roster
rows, same watermarks — so `t`, `b` and therefore `m` are identical too. An LRU
keyed on the token would refuse the driver's own second and third legitimate
fire of every bucket. A replay cache that cannot tell a replay from a repeat
is not a control; it is an outage with a security-shaped name.

Per-isolate memory would not have been a replay control anyway: Deno Deploy
runs N isolates behind one URL and recycles them, so a cache in one isolate
sees a fraction of the traffic and forgets it on every cold start. A control
that catches an unknown fraction of attempts is a control nobody can reason
about.

**So replay is closed downstream, and here is the honest accounting of it.**
T-5.3 says a replay "is refused `window_already_settled` by the control that
already exists (S-3)". That sentence is *nearly* right and the difference
matters to a reviewer: the entry does **not** take the window origin from the
body — `tick.js` re-derives it from the fence's watermark probe on every
request, which is the M-1 fix and the property `T-B1g` executes. So a verbatim
replay inside the ≤90 s window is not refused as a stale window; it is
**indistinguishable from an extra driver fire**, and that is the correct
statement of the residual:

> **Residual R-T1.** A captured `(header, body)` pair can be re-posted verbatim
> for ≤90 s. Its effect is bounded to what one extra cron fire does: the fence
> (`hr_tick_settle`) refuses any character the roster did not lease in the
> driver's own holder name, the watermark CAS under the row lock refuses a
> second payment for a window already settled (S-3), and the accrual is bounded
> to `[server watermark, server now()]` whatever the body says. **It cannot
> double-pay, cannot name an unleased character, and cannot move a watermark
> backwards.** What it can do is make the tick run marginally early, at the cost
> of one Edge invocation. That is the whole of it, and it is a smaller residual
> than a 64-hex long-lived bearer sitting in a PUBLIC-readable table.
>
> **★ And its size depends on `flush_seconds`, which is a tunable** (Security
> T-2, 2026-09-23). Two numbers hide behind "≤90 s" and only one of them is the
> replay number: ≤90 s is the **width of the accepted set** `{n-1, n, n+1}`,
> which is the figure that matters for clock skew, while a token minted in
> bucket *n* is accepted only until the end of bucket *n*+1 — so its **post-mint
> validity is ≤60 s**. `tick.js` settles only when a *whole* flush period has
> elapsed since the watermark. Therefore: **at `flush_seconds > 60` a verbatim
> replay settles nothing, because the flush floor refuses it; below that it can
> settle one window up to 60 s early, which is still not a double pay.** The
> shipped default is 90 and is on the zero side, but `hr_tick_config_flush_ck`
> permits 10 — so the zero residual is a property of the **configuration**, not
> an invariant. The migration's `d11` gates what is the repo's to keep true (the
> bucket width, the column default, the floor still sitting below the window)
> and NOTICEs the live row, which is Reliability's row-volume lever; `X-5a-e` in
> `tests/world-tick-token-leak.mjs` hold the same sentence to an exit code from
> the edge's side, and `MX6` proves `d11` bites.

### 17.4 What the body binding costs, stated rather than skipped

The mac covers the body hash, so the edge **must read the body bytes before it
can authenticate**. Today it reads nothing until the bearer has been accepted.
That ordering changes, and the change is a real one:

- **Before the read**, the edge checks the header's *shape* (`v1 t= b= m=`,
  `b` and `m` both 64 lower-case hex) and the *bucket window*. Both are cheap,
  allocate nothing and run before a single byte of body is buffered.
- **The read itself stays bounded** by `MAX_BODY_BYTES` (4 MiB), enforced both
  by `Content-Length` and by counting the bytes that actually arrive, so a
  chunked sender that omits the header is metered too.
- **Residual R-T2.** A caller who can present a syntactically valid, in-window
  header — which needs no secret, because the shape is not authenticated — can
  make the function buffer up to 4 MiB before being refused. The ceiling is the
  control; it is the same ceiling that bounded the authenticated caller before,
  now doing a job it was already sized for. Nothing is parsed, and nothing
  touches the database, until the mac verifies.

Ordering, in the entry, after this change: **shape → window → bounded byte read
→ body hash → mac (constant time) → JSON.parse → pooler → engine.** The body is
now *authenticated before it is parsed*, which the static form never was.

### 17.5 Every pre-auth refusal is the same answer

`401 { ok: false, error: 'not_signed_in' }` — the body the player path returns
for a bad token — for all of: no usable secret, a malformed header, a bucket
outside the window, a body that could not be read or exceeded the ceiling, a
body whose hash does not match `b`, and a mac that does not verify. **The
oversize-body case is deliberately folded into the 401 rather than answered
`400 bad_request`**: a body we could not read is a body we could not
authenticate, and answering differently would hand an unauthenticated caller an
oracle the static form never gave. `400 bad_request` survives only for a body
that authenticated and then failed to parse as JSON, where the caller already
holds the secret.

### 17.6 Hashing the bytes pg_net actually sends

The mac binds `b` to the posted bytes, so the driver must hash exactly what
leaves. `net.http_post(url, body jsonb, …)` stores `convert_to(body::text,
'UTF8')` in the queue and the worker sends those bytes verbatim. The driver
therefore materialises the body as **text first** —
`v_body_txt := <the jsonb>::text` — hashes `convert_to(v_body_txt, 'UTF8')`,
and posts `v_body_txt::jsonb`. Both sides call the same `jsonb_out`, on the same
value, so the bytes are the same bytes; `jsonb::text` is normalised (sorted
keys, no insignificant whitespace), which is what makes that a property rather
than a coincidence. Where pg_net is installed, the migration's §4 self-check
**executes** the equality against the real queue row rather than asserting it in
prose.

### 17.7 pgcrypto, resolved rather than assumed

`hr_tick_cron_run` carries `set search_path = public`, so `hmac` and `digest`
must be schema-qualified (T-5.3). The repo has never executed pgcrypto in a
migration — both existing mentions are comments — so the schema is **resolved
from `pg_proc` at call time** and interpolated with `quote_ident`, rather than
guessed at `extensions`. If `hmac(text,text,text)` is not found the driver
returns the new outcome **`no_hmac`** and posts nothing: it **never falls back
to the static bearer**, because a fallback is the whole class this change
removes.

**★ The match is on the argument TYPES, never on their rendering** (Security
T-3, 2026-09-23). The first draft compared
`pg_get_function_identity_arguments(p.oid)` to `'text, text, text'`, and that
function **renders argument names where they exist** — measured on PG 18.3,
`hmac(a text, b text, c text)` identifies as `'a text, b text, c text'`. The
equality was therefore correct for pgcrypto *only because pgcrypto happens to
declare these two unnamed*; any build, repackaging or self-hosted rebuild that
named them would have been silently not found, and the whole tick would have
died `no_hmac` on a database where the algorithm was sitting right there.
`oidvectortypes(proargtypes)` is the same signature with the names taken out,
and `prokind = 'f'` stops an aggregate or procedure of the same name answering
for one. `X-8a-d` in `tests/world-tick-token-leak.mjs` execute the same
algorithm under both spellings and with pgcrypto absent; `MX7` proves the
revert is caught.

**★ And "not found" is now an exit code at apply time** (Security T-1): §0b of
the migration raises `HR_TICK_NO_PGCRYPTO` when `vault.decrypted_secrets`
exists and the resolution comes back NULL, so a Supabase-shaped database
cannot take this file and then quietly stop ticking.
`tests/world-tick-token-failclosed.mjs` builds all three states.

`@electric-sql/pglite` ships without pgcrypto (measured, 2026-09-22), so the
credential-free replay cannot execute the derivation. The self-check is honest
about that: on the replay it asserts the fail-closed path (`no_hmac`, nothing
posted, no secret in the log) and NOTICEs the skip; on production, where
pgcrypto is present, it executes the header shape, the known test vector and
the queue-row body binding at apply time.

### 17.8 The secret stops being a variable

Today the driver reads the plaintext into `v_secret` and interpolates it into
the header. After this change the plaintext is never assigned to a plpgsql
variable at all: `hr_tick_auth_header(bucket, body_sha)` reads
`vault.decrypted_secrets` and computes the mac **inside one dynamic EXECUTE**,
and only the mac comes back. That helper is a mac oracle by construction, so it
is `security definer` and **revoked from `public, anon, authenticated,
service_role, hr_engine, hr_tick`** — the same posture as `hr_tick_cron_run`,
asserted by the self-check. `hr_tick_gateway_key` is unchanged and stays a
variable: it is the project anon key, public by design, and T-5.3 puts it
explicitly out of scope.

### 17.9 The cutover: one form at a time, no dual-accept

**Chosen: the edge accepts `v1 t= b= m=` ONLY, and the static bearer is refused
from the moment that build is live.** The seam is the kill switch, not a
dual-accept window:

1. `update public.hr_tick_config set enabled = false;` — fires stop in ≤10 s.
2. Apply `2026-09-22-world-tick-derived-token.sql` (Coordinator, one file).
3. Pack and deploy `hr-accrue`; verify the live `payload_sha256` equals
   `pack-edge --hash`.
4. `update public.hr_tick_config set enabled = true;` — re-arm.

Between (1) and (4) the tick posts nothing, so there is no window in which the
two halves disagree and no window in which a build exists that accepts both
forms. **Dual-accept was rejected**: it needs two deploys, the second one is the
one that actually satisfies T-5.3, and a "remove this by <date>" line on a money
gate is the thing that gets forgotten. It also costs the in-page payload guard
its meaning for the duration — there would be a live build whose hash is green
and whose behaviour is the thing Security blocked.

If steps (1)–(4) are not run as one sequence, the honest failure is loud and
free: the driver posts `v1 …`, an edge still holding the static check finds no
match and answers `401 not_signed_in`, the watermark does not move, and the owed
time is paid by the next accepted fire. `net.http_post` is asynchronous, so
`hr_tick_cron_log` still reads `posted` — **verify a cutover in
`net._http_response` or the Edge logs, never in the fire log** (the same trap
the rotation note in `2026-09-21-world-tick-cron.sql` §3 documents).

### 17.10 Rotation, after this lands

Unchanged in shape and strictly better in cost: accept `HR_TICK_SHARED_SECRET`
and `HR_TICK_SHARED_SECRET_PREV` on the edge for one deploy, then drop the
second. The plaintext transits nothing either way, so the disagreement window
stops being a confidentiality question and becomes an availability one.
**Not built in this lane** — it is a separate change with its own arms, and
naming it here is not shipping it.

### 17.11 Operator section — apply, deploy, verify, kill

The authoritative copy is §6 of `2026-09-22-world-tick-derived-token.sql`; this
is the same thing short enough to work from. Coordinator only (CLAUDE.md §2 —
agents stage, the Coordinator applies).

**Pre-flight, read-only, BEFORE `apply-migration`.** These are reads, not
checks you can skip because the guards are green: the guards ran on a replay,
and two of these are about the production database specifically.

```sql
-- (P1) pgcrypto: PRESENT, and in which schema. §0b of the migration REFUSES the
--      apply if this comes back empty while `vault.decrypted_secrets` exists
--      (Security T-1) — so a miss here is a failed apply, not a silent no-op.
select n.nspname as schema, p.proname, oidvectortypes(p.proargtypes) as arg_types
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where p.proname in ('hmac', 'digest') order by 1, 2;
--   EXPECT  extensions | digest | bytea, text
--           extensions | hmac   | text, text, text
--   NO ROWS => run `create extension if not exists pgcrypto with schema extensions;`

-- (P2) the Vault contract. The apply is harmless without it; the RE-ARM is not.
select name, length(decrypted_secret) as len from vault.decrypted_secrets
 where name in ('hr_tick_shared_secret', 'hr_tick_gateway_key') order by 1;
--   EXPECT hr_tick_shared_secret with len >= 32 (the edge's MIN_SECRET_LEN and
--   the helper's own floor — a short secret refuses on BOTH sides, by design).

-- (P4) ★ the state the apply lands in, and R-T1's size (Security T-2).
--      ...and see (P3) below, which is a shell read rather than a SQL one and
--      is the only one of these that STOPS BEING READABLE once step 3 runs.
select enabled, shadow, cadence_seconds, flush_seconds, edge_url
  from public.hr_tick_config;
--   EXPECT shadow = true. THIS FILE DOES NOT FLIP IT.
--   flush_seconds SHOULD be 90. The token's post-mint validity is <= 60 s, and
--   a fire settles only after a WHOLE flush period, so at flush_seconds > 60 a
--   verbatim replay settles NOTHING; at <= 60 it can settle one window up to
--   60 s early (never twice, never for an unleased character, never backwards).
--   d11 NOTICEs this at apply time rather than refusing — the row is
--   Reliability's row-volume lever, not this file's.

-- (P5) what the §5 probe fire will touch. A 0 here means d7 proves nothing
--      about a real batch.
select count(*) as owned from public.hr_tick_ownership where owned;
```

**★ (P3) THE ROLLBACK VALUE — read it now, because step 3 overwrites it**
(Security T-4, 2026-09-23). The rollback below says "re-deploy the previous
hr-accrue payload", and until this read is written down, *nothing anywhere
records what that payload is*. A deploy is not reversible by memory.

```bash
curl -s https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue
#   -> the GET returns `payload_sha256`. WRITE IT DOWN, here, before step 3:
#
#        PREVIOUS payload_sha256 = ____________________________________________
#        read at (UTC)           = ____________________________________________
#
#   This is the ONLY pre-flight read that cannot be taken again afterwards.
#   If the GET does not answer, STOP: a function you cannot read is a function
#   you cannot roll back to, and the cutover can wait for that.
```

⚠ **Do not copy a payload hash out of a document — including this one.** The
value moves whenever anything under `supabase/functions/**` moves, and on this
branch it already has: Security's review recorded `1b97422c…` on 2026-09-23,
and merging `origin/next` (M1f's `hr-accrue/envelope.js` and the M5 frame gate)
took the packed payload to `92f5d8b5…`, which the combat-channel merge has
moved again. Each is correct for the tree that produced it and none is
authoritative for yours — which is why only their truncated forms survive here
(Security S-6b): a full-length value is the only form an operator can paste
into a comparison, so this section does not carry one. **`node tools/pack-edge.mjs hr-accrue --hash`
at deploy time is the number that matters**; what this section pins is the
READ, not the digest.

**Order.** Steps 1 and 4 are the seam; between them the tick posts nothing, so
no build ever exists that accepts both forms.

```bash
# 1. STOP THE FIRES (takes effect on the next fire, ≤10 s)
#    update public.hr_tick_config set enabled = false;
#    select at, outcome from public.hr_tick_cron_log order by id desc limit 5;   -- EXPECT: disabled

# 2. APPLY — one file, never inside begin/commit, never 00:00–00:10 UTC
node tools/apply-migration.mjs supabase/migrations/2026-09-22-world-tick-derived-token.sql
#    EXPECT the §5 notice to name d1 d2 d9 d4 d5 d6 d7 d8 d8b d10 d11 as RAN.
#    ⚠ IF d4–d7 READ AS SKIPPED ON PRODUCTION, STOP: pgcrypto is not reachable,
#      the tick will answer `no_hmac` forever, and the fix is
#      `create extension if not exists pgcrypto;` + a re-apply, not a re-arm.
#      ★ Since 2026-09-23 that STOP is an exit code (Security T-1): §0b raises
#        HR_TICK_NO_PGCRYPTO and the apply fails by itself. You are not the gate.
#    ★ ALSO READ the `d11` notice if one appears: it means flush_seconds is at
#      or below the token's 60 s replay window and R-T1's residual is non-zero
#      on this database (Security T-2). It is not a reason to stop — it is a
#      number to know before `shadow = false` is discussed.

# 3. DEPLOY THE EDGE HALF — nothing works until both halves are the same version
node tools/pack-edge.mjs hr-accrue --out <dir>/supabase/functions/hr-accrue
cp supabase/config.toml <dir>/supabase/config.toml
npx --yes supabase@latest functions deploy hr-accrue --workdir <dir> \
  --project-ref nezapsylztqbbwuwembx
node tools/pack-edge.mjs hr-accrue --hash
curl -s https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue
#    The GET's `payload_sha256` MUST equal --hash — compare the two VALUES you
#    just read, never a value from a document (see (P3)). There is deliberately
#    no expected value printed here: --hash at the SHA you are deploying IS the
#    expectation (Security S-6b).
#    ★ (P3) must already be written down. If it is not, go back — the previous
#      payload_sha256 is no longer readable once this deploy lands.

# 4. RE-ARM
#    update public.hr_tick_config set enabled = true;
```

**Then, after the apply:** `live-hash-drift --live --write` plus a whys entry
(`hr_tick_cron_run` is a restated live body), the apply-order note flipped to
APPLIED, and `restore-census` re-run — no new table, so it should be a no-op.

**The verification reads, and what each one means.**

| # | read | expect | if not |
|---|---|---|---|
| a | `select at, outcome, detail->>'auth', detail->>'bucket' from public.hr_tick_cron_log order by id desc limit 10;` | `posted`, auth `v1` | `no_hmac` → pgcrypto; `no_secret` → Vault secret missing or <32 chars; `error` → read `sqlstate` |
| b | `select id, status_code from net._http_response order by id desc limit 10;` | 200 | **401 = the two halves disagree.** `net.http_post` is async, so a rejected token still logs `posted` — (a) cannot tell you this and (b) is the only honest read |
| c | `select count(*) from net.http_request_queue q, vault.decrypted_secrets s where s.name='hr_tick_shared_secret' and q.headers->>'X-HR-Tick-Auth' = s.decrypted_secret;` | **0** | non-zero = the plaintext is on the wire and this whole change did not land |
| d | `select count(*), max(at) from public.hr_tick_shadow where at > now() - interval '1 hour';` | climbing at ≈ active/flush_seconds | frozen at the cutover instant = step 3 or 4 did not land |

Queue depth is normally **0** (the pg_net worker deletes the row after the
send), so (c) returning no rows is health, not a failure.

**The kill switch is unchanged by this lane** and is verified in code (T-5.4):

```sql
update public.hr_tick_config set enabled = false;   -- USE THIS FIRST
select public.hr_cron_drop('hr-tick-run');          -- stops the driver entirely
```

The first is a single-row UPDATE on a singleton, takes effect on the next 10 s
fire, and needs neither a migration nor a deploy — use it at any surprise and
diagnose second. `hr_cron_drop` returns false rather than raising when the job is
already gone and is revoked from `public, anon, authenticated, service_role`: no
client can stop the world tick. After it the job is **gone, not paused**; re-arm
with `select public.hr_cron_ensure('hr-tick-run', '10 seconds', 'select
public.hr_tick_cron_run()');`.

**Rolling this lane back.** Both halves, behind the kill switch, and the
**deploy goes first** on the way back for the same reason the migration went
first on the way out: the half that ACCEPTS must never be older than the half
that SENDS. Both intermediate states refuse, so neither direction can pay.

```bash
# 1. STOP THE FIRES
#    update public.hr_tick_config set enabled = false;

# 2. RE-DEPLOY THE PREVIOUS PAYLOAD — the one (P3) recorded. <P3_HASH> is that
#    value; it is not in this file and cannot be, because it describes what was
#    live before you started.
git log --oneline -- supabase/functions/hr-accrue   # find the deployed commit
git worktree add /tmp/hr-rollback <that commit>
# pack-edge derives its ROOT from its OWN path, so run the copy INSIDE the
# rollback worktree and it packs that tree (verified 2026-09-23). There is no
# --root flag; reaching for one is how a rollback quietly packs HEAD instead.
node /tmp/hr-rollback/tools/pack-edge.mjs hr-accrue --hash
#    ★ THIS MUST PRINT <P3_HASH>. If it does not, you have the wrong commit and
#      re-deploying it is a second change, not a rollback. Stop and find the one
#      that does — that is exactly what (P3) was read for.
node /tmp/hr-rollback/tools/pack-edge.mjs hr-accrue \
  --out /tmp/hr-rollback-pack/supabase/functions/hr-accrue
cp /tmp/hr-rollback/supabase/config.toml /tmp/hr-rollback-pack/supabase/config.toml
npx --yes supabase@latest functions deploy hr-accrue --workdir /tmp/hr-rollback-pack \
  --project-ref nezapsylztqbbwuwembx
curl -s https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue
#    payload_sha256 MUST now equal <P3_HASH>. That is the rollback, confirmed.

# 3. RESTATE THE DRIVER IN ITS STATIC FORM
node tools/apply-migration.mjs supabase/migrations/2026-09-21-world-tick-cron.sql
#    X-7a-c execute that this re-applies cleanly, restores the static form, and
#    is NOT blocked by the `no_hmac` rows the failed cutover wrote.

# 4. RE-ARM
#    update public.hr_tick_config set enabled = true;
#    -- and if the JOB itself was dropped rather than disabled:
#    select public.hr_cron_ensure('hr-tick-run', '10 seconds',
#                                 'select public.hr_tick_cron_run()');
```

Rolling back puts the T-5.3 block back, so **M2 is blocked again** — that is
the intended consequence, not a side effect.

---

## §18 PARTIES — server-owned hunting groups (M8 design, 2026-09-23)

Written by the Game Designer (§18.1, final authority per `CLAUDE.md` §3.1 —
nothing here is queued on Tyler except the two finance lines in §18.6) and the
Backend Architect (§18.2–§18.5). Milestone **M8, target 2026-10-30**, and the
thing `LIVE_WORLD_BRIEF.md` observed in Huntera that we do not have: *"party
hunts are a server object: the leader starts with team, each member accepts, the
server walks everyone to the portal and runs the hunt as one unit."*

**The one-sentence design: a party is a ROSTER UNIT, not a new engine, not a new
channel and not a new authority — the tick settles four characters in one fenced
call instead of four, and the split is arithmetic the settle does under the row
locks it already holds.** If a decision below would have created a second place
where "what a character is doing" lives, a second money journal, or a client
field that names a share, a weight or a recipient, the decision is wrong.

Status: **DESIGN ONLY.** No migration, no data row, no code in this lane.

---

### §18.1 THE PLAYER EXPERIENCE

Amended 2026-09-23 against §18-SEC. Every changed passage carries its finding
tag inline; §18.7 is the map.

#### Forming one

Kaya and Bram are friends, both around combat level 30. Kaya opens the Party
panel (empty: one button, *Form a party*), taps it, and is a party of one with
herself as leader. She taps *Invite*, types Bram's display name; Bram sees a
card — *Kaya invited you to a party*, Accept / Decline, a 15-minute clock. He
accepts; both panels show two rows: name, combat level, HP bar, "idle".

No lobby, no matchmaking, no party chat in M8. A party is a named list of two to
four characters and the hunt they are on. That is the whole object.

- **Party size: 2–4.** Four because that is the number at which a single
  monster's HP pool divided by the party's combined DPS still leaves every
  member a visible contribution, and because four is the largest fan-out that
  keeps the ledger arithmetic identical to solo (§18.4). A party that falls to
  one member keeps existing so its last member can invite again, but its hunt
  stops.
- **Level spread: the number is TEN combat levels** between the lowest and the
  highest member, and it is written once, here. It is checked at **hunt start**
  and **again on accept** (answers S-12), and never continuously — a member who
  levels past the spread mid-hunt did it by fighting, and stopping the party for
  that is the game taking back what it paid, whereas *joining* past the spread
  is a new member the party has never priced. Refusal `party_level_spread` in
  both places. S-11 refuses an accept during a live hunt anyway, so the accept
  check costs nothing today; it is written down because S-11 may be relaxed
  later and this rule must not relax with it.

#### Starting a hunt

Kaya picks Wolves, a stance (`careful` / `steady` / `reckless`,
`HUNTS_AND_ANALYZER.md` §2.2) and stop rules, and taps *Start with team*. Only
the leader may start. The server refuses if any member is knocked out
(`party_member_recovering`), if any member's open accrual window cannot be
priced (`member_uncollectable` — the start closes four windows at once, so it
collects first for all four, `CLAUDE.md` §3 rule 3), or if the spread fails. On
success every member's activity pointer moves in one transaction, and from that
instant the **party owns each member's accrual window** until the hunt ends
(§18.2.3 invariant 8, answers S-3).

**What a member may still do while the hunt runs (answers S-3, S-4).** Nothing
that re-prices the window. A partied character's own `accrue` is refused
(`party_settle_required`), and so is every verb that would close or re-price the
shared window — changing activity, equipping, enchanting, eating, shopping —
with `party_hunt_running` and a panel that offers *Stop the hunt* and *Leave*.
This is restrictive on purpose and the cost is named rather than discovered: the
alternative is a member's button press silently re-pricing a window three other
people are paid from, and a refusal a player can see is better than an
approximation four players share. Auto-eat still fires inside the simulation, so
nothing a hunt actually needs is behind the refusal. Mid-hunt eating and
shopping return in a later milestone as a per-member sub-window, which is the
same redesign S-11 names, not a flag flip.

#### Both tabs closed

Kaya shuts her laptop; Bram's tab is open on his phone, and his party panel
keeps updating every 10 s — Kaya's damage climbing, her kills climbing, her HP
dipping and recovering as auto-eat fires. **That is the M8 moment and it is the
whole point**: the proof a player can *see* that the world does not depend on a
client being awake is a friend's numbers moving on a machine the friend is not
sitting at. Then Bram closes his tab too and nothing changes server-side — the
tick holds the party's lease and settles it every flush window until a stop rule
fires or Vigour and supplies run down.

**And Bram's own open tab changes nothing about what he is paid** (answers S-4).
On a party hunt there is no attended top-up and no attended cadence: his client
renders the frames the server pushes and computes nothing. A partied character's
attended kill credit is not accepted at all, so §16.6's attended bucket is
**empty** for every party member — and that emptiness is itself the assertion
that this fence is live (§18-SEC.2, 8c). Watching costs the party nothing and
earns the watcher nothing extra, which is the only shape under which "both tabs
closed" and "one tab open" can be the same promise.

#### What each member sees on return

The Hunt Analyzer, unchanged (`HUNTS_AND_ANALYZER.md` §3), plus one block
(answers S-5 — the floor is XP-only, and the block now shows that):

```
Fellowship — Wolf Ridge, 6 h 12 m
  Kaya    52.0% of damage   xp share 50.0%   3,223 xp   1,186 g   fell 0
  Bram    38.6% of damage   xp share 37.1%   2,391 xp     880 g   fell 1
  Ilse     9.0% of damage   xp share 12.5%     806 xp     205 g   fell 3  ← xp floor
  Tomas    0.4% of damage   xp share  0.4%      23 xp       9 g          ← parked
  Gold and loot follow damage exactly — there is no floor on either.
  Fellowship bonus +10% xp (3 of 4 fought)   ·   settled 41 s ago
```

Read the two columns against each other and the rule is legible without a
tooltip: Ilse's **xp** share is 12.5 % against 9.0 % of the damage, because the
floor lifted it; her **gold** is 205 g, which is 9.0 % of the party's 2,280 g,
because gold does not have one. Tomas is below the participation threshold, so
he is paid his raw share in everything and grants no fellowship bonus.

Every number is the last **settled** window's projection, replaced whole by each
envelope, never extrapolated (`CLAUDE.md` §6). No client-side kill counter ticks
up between windows: that is the phantom-seed bug with a different noun.

#### The split rule

**Contribution-weighted by damage dealt. Gold and the item-assignment lottery
follow that weight EXACTLY. XP — and XP alone — carries a 50 %-of-equal-share
floor, and the floor itself applies only to a member above a 25 %-of-equal-share
participation threshold** (answers S-5).

Concretely, in a four-party (equal share = 25 %):

- **Gold, and the weight each member carries in the drop lottery:** the raw
  damage share, in basis points. No floor, no threshold, no adjustment. A member
  who dealt 9.0 % of the damage is paid 9.0 % of the gold and carries 9.0 % of
  the lottery weight.
- **XP:** a member holding ≥ 6.25 % of the window's damage is paid
  `max(raw_share, 12.5 %)`; a member below 6.25 % is paid `raw_share`.

Each vector is computed in basis points and renormalised to exactly 10,000 bp —
the gold/loot vector trivially, the XP vector after the floor by scaling the
above-floor members down proportionally. **The integer remainder goes to the
LOWEST `(user_id, slot)`** among the tied-largest shares (answers S-6): the
previous rule handed it to the largest share, and under S-6's re-roll lever that
is the same member every time, chosen by the member choosing the boundaries.
Lowest-`(user_id, slot)` is equally deterministic, equally replayable, and
nobody can position themselves to collect it. Nothing is minted and nothing is
lost either way.

Item drops roll **once per kill, never once per member**, and each roll is
assigned to one member by a lottery weighted with the **damage** vector and
seeded from the window seed — so expected item value tracks damage dealt and a
one-quantity sword lands in exactly one bag.

**Defence, three sentences.** Weighting by damage is what makes a party useless
as a pipe — an account that did not fight cannot be paid, so a party can neither
boost an alt's XP nor carry gold to a fresh account, and a parked member only
dilutes the people who fought. The XP floor exists because a tank, a worse
weapon or a night spent knocked out are legitimate ways to be in a party and a
raw proportional split punishes exactly the player who took the hits — but that
is a *progression* fairness problem, so the floor is paid in the one quantity
nobody can sell. **Every tradeable quantity — gold, items, and therefore
everything a market or a ranking can see — follows raw damage with no subsidy at
any threshold**, which is what makes §18.4's T-4 hold literally rather than
approximately. If gold fairness for tanks is wanted later it returns as an
*effective-contribution* metric the engine already knows — damage dealt + damage
mitigated + healing done — never as a flat floor, and it returns with its own
Security GO.

#### Why party at all

Per member a party is **never better than solo on gold or loot** — the table
rolls once per kill either way, so four people split one stream. A party buys
(a) **access** to spawns a solo character of that level cannot survive, and
(b) a capped **fellowship XP bonus: +5% per member beyond the first, maximum
+15% at four**, XP only, **counted over members above the participation
threshold and paid only to them** (three who fought and one parked = +10%, and
the parked member gets none of it). That shape
makes a party a reason to have friends and never a reason to run four clients,
because four boxed alts split one stream four ways to buy 15% XP — strictly
worse than four solo hunts. Gems and Hearth Tokens may never buy, extend or
boost a party, for the reason that removed Offline+
(`HUNTS_AND_ANALYZER.md` §4.4).

#### Vigour inside a party

A party hunt charges Vigour, on the same terms as a solo one, and the terms are
stated per member rather than per window because the members are not all doing
the same thing (answers S-10):

- **The charge is priced on the member's own FIGHTING ms**, not on the window's
  wall clock: `fight_ms(member) = window_ms − the member's recovering ms inside
  that window`. It is filed with the quotient/remainder pair
  (`ev:vigour_min` + `ev:vigour_rem_ms`) that `SEC_HUNTS_M6_2026-09-22.md` S-1
  landed, so an hour costs an hour however the hour was cut up — and a per-member
  per-window floor, which is that same P0 at four times the rate, cannot appear.
- **An active member** is charged their whole window. **A parked member** — one
  below the participation threshold — is charged the same, because they were in
  the fight and merely bad at it; Vigour is a budget of hunting minutes, not of
  successful ones. **A knocked-out member is charged nothing for the span they
  are down**, which falls straight out of the `fight_ms` definition: they deal no
  damage and are paid ≈0, and charging a full window for that would be payment
  for nothing.
- **A Vigour-dry member takes `VIGOUR_DRY_MULT = 0.25` on their OWN share**, and
  on nobody else's. The number is adopted as Security proposed it, and it is not
  a new number: `VIGOUR_DRY_MULT` is `AMMO_DRY_MULT`, derived and not retyped
  (`src/core/hunt.js:275`), precisely so "dry means a quarter" is learned once
  and true twice. Picking a party-specific number here would create the drift
  that derivation exists to prevent. The consequence for the conservation
  property is stated where it belongs, in §18.2.6.

#### A death inside a party

The Recovery Rule (rev. 2) is unchanged and is **per character**: a member who
falls is knocked out, stops dealing damage, and watches their own weighted share
fall while the others keep fighting — the honest consequence, needing no extra
rule. The hunt continues, and a death is never a free heal, attended or away.

What a knocked-out member is paid, stated plainly because a player will ask
(answers S-5, S-10): their **gold and loot fall with their damage**, because
those follow damage exactly and a member who is down deals none. Their **XP
share is still floored** if their damage across the whole window leaves them
above the participation threshold — which is the case the floor was written for,
and it is why the floor lives on XP rather than on gold. And they are **charged
no Vigour** for the span they were down. Two party-level rules sit on top:

1. **Party wipe stops the hunt.** When every live member is recovering at the
   same settle, the party hunt ends with `stopped_by = 'party_wipe'` and all
   members go idle. A party grinding to zero all night with nobody alive is the
   silent-loss shape `bag_full` exists to prevent.
2. **The `falls` stop rule is per member and stops the PARTY.** `careful`'s two
   consecutive falls, or an explicit `falls: N`, ends the hunt for everyone with
   `stopped_by = 'falls:<user>'`. One member dying repeatedly is the party's
   problem, not that member's alone — and the alternative (drop the dead member,
   keep hunting) is a kick dressed as a mechanic.

#### Leaving and being kicked

Leaving is one intent, effective at the next settle boundary (at most one flush
window away). There is no 3-second countdown: **the settle boundary is the
atomic point**, so a leaver is paid their share of the window they were in and
then removed, and a countdown would be UI theatre over a guarantee the
transaction already gives. A kick carries the same guarantee (settle first,
remove second, §18.4 T-3). The last member to leave dissolves the party; if the
leader leaves, leadership transfers to the longest-tenured live member (`order
by joined_at, user_id`) — deterministic, no election, no vote.

**The price on the lever, and the number is EIGHT (answers S-6).** Settling the
open window first is right and it stays, but its side effect is that every join,
leave and kick forces a settle boundary at an instant a player chooses, and
cutting a window short re-simulates its kills and re-assigns its drops. So:
**a party gets at most 8 membership-forced settle boundaries per UTC day**,
journalled, refusal `party_settle_churn`. Eight is chosen against ordinary play
rather than against the exploit: a four-member party that re-forms its roster
twice over a day spends four, and a party that reshuffles every member once
spends four more — past that it is not a roster, it is a dice cup. A re-roll
lever needs headroom in the tens before it is worth working, and eight is well
inside that.

**The right to leave is not what is being priced.** Past the eighth boundary a
leave is still honoured **immediately for membership** — the member is out of
the party, out of the hunt, and free at once, and no refusal can ever hold a
player in a party — but it is *paid* at the next **natural** flush boundary
instead of forcing one. The leaver loses nothing: the window they were in is
settled on the tick's own cadence and their share of it is theirs. What they
lose is the ability to choose the instant the dice are cut, which is the whole
of the lever and none of the right. The same applies to a kick, which is
additionally clamped at 20/party/day; `party_leave` itself stays unclamped, as
§18.3 says, because the clamp here is on the *boundary*, not on the *verb*.

---

### §18.2 THE SERVER OBJECTS — rewritten 2026-09-23 on §18-SEC's REDESIGN

§18-SEC graded this section **REDESIGN** on four P0s: attribution rode `delta`
and `hr_apply` refuses unknown delta keys (S-1); seven top-level meta keys
against an eleven-key allowlist (S-2); a member's own `accrue` was a second
settler for the party's window (S-3); §16.6's attended fence had no party form
(S-4). All four are answered below, and the section is rewritten rather than
patched because S-1 and S-3 move where things are written, not how they are
worded. S-8, S-9, S-10 and S-16 are answered here too; S-7, S-14 and the
membership objects are settled and being built in slice 1 and are restated only
where the settle depends on them.

#### §18.2.1 Tables

```sql
create table public.party (
  id            uuid primary key default gen_random_uuid(),
  leader_user   uuid not null references auth.users(id) on delete cascade,
  leader_slot   int  not null,
  size_cap      int  not null default 4 check (size_cap between 2 and 4),
  created_at    timestamptz not null default now(),
  dissolved_at  timestamptz,
  version       bigint not null default 0
);

create table public.party_member (
  party_id  uuid not null references public.party(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  slot      int  not null,
  role      text not null default 'member' check (role in ('leader','member')),
  joined_at timestamptz not null default now(),
  left_at   timestamptz,
  primary key (party_id, user_id, slot)
);
-- INVARIANT 1 (one party per character) and INVARIANT 2 (one character per USER
-- per party — an account cannot fill a party with its own slots), enforced by
-- indexes rather than by a read.
create unique index party_member_one_live
  on public.party_member (user_id, slot) where left_at is null;
create unique index party_member_one_char_per_user
  on public.party_member (party_id, user_id) where left_at is null;

-- clan_invites' shape verbatim, with a 15-minute expiry instead of 7 days and a
-- slot column: (id, party_id, user_id, slot, invited_by_user, created_at,
-- expires_at default now() + interval '15 minutes', accepted_at, revoked_at),
-- plus the same partial unique index on the LIVE row.
create table public.party_invite ( … );
create unique index party_invite_live on public.party_invite (party_id, user_id, slot)
  where accepted_at is null and revoked_at is null;

-- THE SESSION OBJECT. One live row per party; history is kept for the Analyzer.
create table public.party_hunt (
  id          uuid primary key default gen_random_uuid(),
  party_id    uuid not null references public.party(id) on delete cascade,
  active_id   text not null,                    -- monster/spawn id, hr_activities-validated
  stance      text not null default 'steady',
  stop        jsonb not null default '{}'::jsonb,
  started_at  timestamptz not null default now(),
  accrued_to  timestamptz not null,             -- THE PARTY WATERMARK
  ended_at    timestamptz,
  stopped_by  text,
  version     bigint not null default 0
);
create unique index party_hunt_one_live on public.party_hunt (party_id)
  where ended_at is null;

-- The lease, at PARTY grain. hr_tick_ownership's semantics, one row per party.
create table public.party_tick_lease (
  party_id          uuid primary key references public.party(id) on delete cascade,
  owned             boolean not null default false,
  lease_holder      text,
  lease_until       timestamptz,
  shadow_accrued_to timestamptz,                -- §15c's shadow watermark, per party
  updated_at        timestamptz not null default now()
);

-- ATTRIBUTION IN SHADOW, AS ITS OWN NULLABLE COLUMN (answers S-1, S-16). A
-- plain nullable add is CATALOG-ONLY: it writes a pg_attribute row and rewrites
-- no heap. §16's ACCESS EXCLUSIVE drain argument was about a STORED GENERATED
-- column, which does rewrite — see §18.2.1a for why the old refusal was wrong.
alter table public.hr_tick_shadow add column if not exists party jsonb;
```

#### §18.2.1a WHERE ATTRIBUTION LIVES, AND WHY NOT IN `delta` (answers S-1, S-2, S-16)

The previous draft carried `party_id`, `dmg_bp` and `share_bp` **inside the
`delta` jsonb**. S-1 is correct and it is fatal:
`2026-09-14-hr-apply-restatement.sql` declares `c_delta_keys` and refuses every
top-level key outside it by name (`unknown_delta_key`). Three unknown keys means
the armed branch refuses the first member, all-or-nothing turns that into a
party that never pays anybody, and `hr_record_rejection` journals it four times
a window for every party in the game. In SHADOW it is worse than loud, because
the shadow branch returns before `hr_apply` ever sees the object: S2–S4 would
accumulate 48 h of parity evidence for a payload that cannot be paid.

**THE RULE: the delta handed to `hr_apply` is key-for-key the delta a solo
settle would hand it. Attribution is JOURNAL, never DELTA.**

That rule is satisfiable today, with no change to `hr_apply` at all, because
`journal` is **already** on `c_delta_keys` and `hr_apply` already merges what it
carries. The relevant three lines of the restatement, quoted rather than
paraphrased:

```
    v_j    := coalesce(p_delta->'journal', '{}'::jsonb);
    …
       jsonb_build_object('delta', v_meta) || coalesce(v_j->'meta', '{}'::jsonb));
```

So the keys the party settle uses are **`journal`, and nothing else new**. The
delta a party settle hands `hr_apply` is:

```
  gold, xp, items, hp, fight, consec_falls, recovering_until, deaths,
  progress, accrued_to, journal        ← exactly a solo combat settle's key set
```

and the party rides inside `journal.meta` as **ONE key** (answers S-2):

```
  journal = { kind: 'combat', intent: 'accrue',
              meta: { ms, ticks, kills, capped, ate, spent?, w?, from, to, src,
                      party: { id, hunt, dmg_bp, xp_bp, floor, fellow_bp, roll } } }
```

**Why one key and not seven.** `tests/accrual-engine.mjs`'s `META_KEYS` is an
enumerated allowlist — `ms, ticks, kills, capped, ate, att, spent, w, from, to,
stopped`, **eleven** today — and its own closing note rules that the next key
arrives *"with its byte-and-rows arithmetic, or nested inside an existing one the
way `att` is"*, never by raising a number. Seven flat keys would make eighteen
and SHAPE would go red; loosening SHAPE to fit is refused by `CLAUDE.md` §2.
`party` is one nested object of seven related fields, which is exactly the `att`
precedent. **Rows added: ZERO** — it is a scalar object on a ledger row that
already exists, and §18.4's ledger note stands unchanged: four characters in a
party write the same four rows per window they would write hunting alone.
**Bytes:** ~90 on a combat row, and only on party rows. The allowlist widens by
**exactly one**, and S2's guard carries the `--mutate` proof that a *twelfth*
flat key, or an eighteenth of any kind, still goes red.

**AND THE LEVEL, STATED, because this is S-10-from-six-days-ago wearing a
different noun (answers S-2).** `hr_apply` writes the ledger row's meta as
`jsonb_build_object('delta', v_meta) || coalesce(v_j->'meta','{}')`. The `||`
is load-bearing: the journal's own keys are merged at the **TOP** of
`player_ledger.meta`. **The party read is `meta->'party'`.** The two wrong
spellings are named here in prose so the next reader sees the trap, and they are
never executed: a `meta` arrow `meta` level does not exist and evaluates to NULL,
so a `where` on it returns no rows at all; and `meta->'delta'->'party'` is the
engine's delta summary, which carries `g, m, i, x, e, bs, k` and no party at all.
`tests/world-tick-ledger-meta.mjs` must EXECUTE the party read against a real
`hr_apply` ledger row on the PGlite chain and pin both wrong spellings as
returning nothing, exactly as it now does for the attended key.

```sql
-- THE PARTY READ, AT THE LEVEL hr_apply ACTUALLY WRITES. The journal's own keys
-- merge at the TOP of player_ledger.meta; only the engine's delta summary sits
-- one level down under 'delta'.
select l.meta->'party'->>'id'                        as party_id,
       (l.meta->'party'->>'dmg_bp')::int             as dmg_bp,
       (l.meta->'party'->>'xp_bp')::int              as xp_bp,
       (l.meta->'party'->>'fellow_bp')::int          as fellow_bp,
       (l.meta->'delta'->>'g')::bigint               as gold
  from public.player_ledger l
 where l.kind = 'combat' and l.intent = 'accrue'
   and l.meta ? 'party' and l.at > now() - interval '48 hours';
```

**The shadow half is the new column, not the delta** (answers S-1, S-16).
`hr_tick_shadow` gains one **nullable `party jsonb`**, carrying the same object
the journal will carry, so the 48 h parity read groups on a column instead of
walking a jsonb and — the point — so the `delta` stored verbatim in shadow is
byte-for-byte the object `hr_apply` would receive. **§18's previous reason for
refusing that column was not true, and the correction is recorded rather than
buried (answers S-16):** §16's ACCESS EXCLUSIVE drain argument is about a
`GENERATED … STORED` column, which rewrites the heap. A plain nullable add is
catalog-only and rewrites nothing — which §18 itself said, correctly, three
paragraphs later about `hr_tick_ownership.party_id`. They are the same `ALTER`.
An argument wrong in the direction of *"we cannot"* costs as much as one wrong in
the direction of *"we can"*, and this one bought S-1.

**There is still no `party_ledger`, and there will not be one**, and there is no
`hr_party_pay` either. The alternative to `journal.meta.party` is a dedicated
`SECURITY DEFINER` payer with its own ledger `kind` and its own journal, and it
is refused on three counts: `hr_apply` is the only money writer in this system
(`CLAUDE.md` §6) and a second one doubles the surface every clamp, every
`gold_in`/`xp_in`/`qty_in` stamp and every daily-budget check has to be right
on; a second `kind` is the per-hunt counter table `HUNTS_AND_ANALYZER.md` §3
already refused, wearing a party hat; and it would break **(P-a) degenerate
parity** by construction, since a one-member party would pay through a different
function than a solo character. The journal route needs no new writer, no new
kind and no `hr_apply` change — it needs one allowlist entry and a level
correctly spelled.

**`party` is NOT a new tick channel.** `hr_tick_shadow.channel` and
`hr_tick_ownership.channel` stay `('combat','gather','artisan')` and neither
CHECK is widened: a party settle writes ordinary `channel = 'combat'` rows. The
party is a unit of *scheduling*, not a kind of work.

#### §18.2.2 RLS and who may write which column

**Nobody writes any of these tables through a policy. There is no client INSERT,
UPDATE or DELETE anywhere in §18.2.1** — the clan lesson, stated in
`2026-08-11-clan-membership-authority.sql`: *a client that could INSERT here
could invite itself.* The RPCs are the only door.

| Table | SELECT policy (`to authenticated`) | Writers |
|---|---|---|
| `party` | live member of it, via `hr_party_of(auth.uid(), slot)` | `hr_party_create/leave/kick/transfer` |
| `party_member` | `auth.uid() = user_id` **or** a live co-member resolved by `hr_party_of`, never by a policy that reads `party_member` (S-7; a policy on T whose `USING` reads T recurses) | `hr_party_accept/leave/kick`, and `hr_party_tick_settle` never |
| `party_invite` | `auth.uid() = user_id` (your own invites only) | `hr_party_invite/accept/revoke` |
| `party_hunt` | live member of the party | `hr_party_hunt_start/stop`, `hr_party_tick_settle` (`accrued_to`, `ended_at`, `stopped_by` only) |
| `party_tick_lease` | **none — no client policy at all** | `hr_party_roster` (lease columns), `hr_party_tick_settle` (`shadow_accrued_to`) |

The panel's cross-user read is `hr_party_view(p_party)`, `SECURITY DEFINER`,
refusing any caller who is not a live member, returning a **frozen** column set
— display name, combat level, `hp`/`hp_max`, `recovering_until`, and the last
settled window's `dmg_bp`/`xp_bp`/`xp`/`gold`. Never inventory, never gold
balance, never the ledger, never activity detail, never another member's
envelope. It is S-7's ruling, it is slice 1's to build, and it is restated here
because §18.2.7's frames project exactly this column set and nothing wider.

Grants mirror the fence exactly (§15c): `hr_party_roster` executable by
**`hr_tick` and nothing else**, `hr_party_tick_settle` by **`hr_engine` and
nothing else**, and `hr_party_role(p_party, p_user, p_slot) →
'leader'|'member'|null` `SECURITY DEFINER` and **revoked from `anon`,
`authenticated`, `service_role`**, exactly as `hr_clan_may_admit` is. The
selector and the settler remain different roles and neither can become the
other. **Every one of these functions carries its `hr_assert_grant_hygiene`
allowlist entry with its claim argued, in the same lane-C batch, after the file
that grants it** (S-14) — `hr_party_roster`, `hr_party_tick_settle`,
`hr_party_role`, `hr_party_of`, `hr_party_view`. We have shipped that omission
twice and `2026-09-22-engine-allowlist-hunt-reads.sql` exists only to clean it
up.

#### §18.2.3 Invariants

1. One party per character — `party_member_one_live`.
2. One character per user per party — `party_member_one_char_per_user`.
3. The leader is always a live member; leader departure transfers to
   `order by joined_at, user_id limit 1` inside the same transaction.
4. The last live member leaving stamps `party.dissolved_at`, revokes live
   invites, and ends any open `party_hunt`.
5. **A membership change while a hunt is live settles the open window FIRST**,
   in the same transaction (§18.4, kick-before-split) — subject to the 8-per-day
   boundary budget of §18.1 (S-6), past which the membership change lands
   immediately and the payment rides the next natural flush.
6. **The character stays the STATE unit; the party is only the ROSTER unit** —
   for everything the Analyzer, `recovering`, Vigour, the envelope and the
   existing guards read. It is **not** a licence for a second writer, which is
   what invariant 8 now says out loud.
7. **THE EXCLUSION IS POSITIVE AND DERIVED, NOT A COLUMN (answers S-8).** The
   per-character roster excludes a character that is a live member of a party
   with a live `party_hunt`, **by join**, on every fire:

   ```sql
   -- The predicate, written once and referenced everywhere it is needed.
   -- hr_tick_roster adds `and not public.hr_partied(c.user_id, c.slot)`.
   create or replace function public.hr_partied(p_user uuid, p_slot int)
   returns boolean language sql stable security definer set search_path = public as $fn$
     select exists (
       select 1
         from public.party_member m
         join public.party_hunt   h on h.party_id = m.party_id
        where m.user_id = p_user and m.slot = p_slot
          and m.left_at is null and h.ended_at is null);
   $fn$;
   ```

   The previous draft made the exclusion `hr_tick_ownership.party_id is not
   null`, which fails at both ends: nothing said who wrote that column or in
   which transaction, so a character was servable by both rosters in between —
   and the failure is not symmetric, because the solo settle pays 100 % of a
   party's stream to one member and the party settle then fails its CAS and the
   party wedges; and a character with **no** `hr_tick_ownership` row at all has
   no `party_id` to be non-null, so the exclusion never fires and the
   double-serve is permanent rather than transient. `hr_tick_ownership.party_id`
   **may stay as an index helper. It may not be the authority.** A second source
   of truth for "what is this character doing" is precisely what §18's own
   one-sentence design forbids. A standing guard asserts the two rosters'
   outputs are **disjoint on every fire** and is mutation-proved by planting one
   character in both.
8. **THE SINGLE SETTLER (answers S-3). For the duration of a live
   `party_hunt`, the party watermark IS the member's watermark.** Stated as a
   predicate, asserted rather than described:

   > For every `(user_id, slot)` with `hr_partied(user_id, slot) = true`, and at
   > every commit boundary:
   > `player_state.accrued_to = party_hunt.accrued_to` for that member's party,
   > and **`hr_party_tick_settle` is the only function that moves either.**

   §18.2.4's old "a member whose own `accrued_to` is ahead drags the party's
   `from` forward" sentence is **deleted, not softened.** There is no correct
   way for one member to move a shared window's left edge: the party does not
   replay, and the other three are not paid for the interval either, so the
   *timing* of an ordinary client intent — a quantity the client fully controls
   — crosses into three other players' economies. That is `CLAUDE.md` §1's
   target property failing by timing rather than by number, on the normal client
   path, every time anybody in a party touches anything.

   The fence is one predicate at four doors, and `hr_partied` is the predicate
   at all four:

   | door | what it does for a partied character |
   |---|---|
   | the `accrue` verb | **refused `party_settle_required`** (409, journalled with its verb). There is nothing for it to price: the party owns `[party_hunt.accrued_to, now]`. |
   | every other `collectsFirst: true` verb — `set_activity`, equip, enchant, eat, the shop and buff verbs | **refused `party_hunt_running`**. Each of them either stamps a `STAMP_KEYS` key (`activity`, `equip`, `accrued_to`, `enchant`) or changes an input the shared window is priced from. Suppressing the collect instead would leave an approximation four players share; a refusal one player can see is strictly better, and §18.1 names the cost. |
   | `party_leave`, `party_kick`, `party_hunt_stop` | collect through `hr_party_tick_settle` for `[party_hunt.accrued_to, now()]`, **never** through the member's own path. |
   | `hr_tick_settle`, per character | never offered the character at all — invariant 7. |

   `guardStampKeys()` stays exactly as it is and is the backstop, not the fence:
   the day someone adds a stamping key to a party delta it is a loud
   `delta_would_stamp` refusal rather than the silent confiscation of four
   players' nights at once.
9. **THE ATTENDED FORM OF §16.6's FENCE (answers S-4). Attended kill credit is
   not accepted for a character in a live party hunt.** §16.6 rules that the
   combat channel hands the engine `attended: null` always and that
   `settleCombatSession` THROWS if a caller supplies one, and it names its own
   ARM blocker: before `shadow = false` for combat, the roster excludes a
   character with kill-credit rows newer than
   `accrued_to − ATTENDED_EDGE_SLACK_MS`. **That exclusion is per character and
   §18 makes the roster unit the party**, so the naive party form — exclude the
   whole party whenever any member has fresh kill credit — lets one member
   playing attended stall four players' settles for as long as they keep
   playing. That is the exact inverse of §18.1's "both tabs closed" promise and
   it is a silent-loss shape rather than a refusal anybody sees.

   Security offered (1) refuse the credit, (2) exclude the party and journal
   why, and vetoed (3) pricing attended per member inside the party settle.
   **This design takes (1)**, which was also the recommendation, and takes it
   because it is not a third rule: it is invariant 8's predicate at a fifth
   door. A partied character's attended cadence RPCs have nothing to do —
   `accrue` is already refused by invariant 8, so the ~90 s attended top-up
   simply does not exist for them — and no `hr_kill_credit_log` row is written
   for a partied character, so §16.6's roster exclusion is **vacuous** for party
   members rather than contended. The client renders the frames of §18.2.7 and
   computes nothing.

   **The assertion that this fence is live is an emptiness**: under (1) the
   attended bucket of §16.6's partition must contain **no party member's rows at
   all**, and §18-SEC.2's 8c reads exactly that. **This is named as an M4
   co-blocker**, as Security named it: it is not M8-only work, because M4's own
   arm fence is what this composes with, and neither can be verified without the
   other.
10. **`hr_apply` is the only money writer**, per `CLAUDE.md` §6 — for parties as
    for everything else. `hr_party_tick_settle` computes and fences; it never
    moves a value except through `hr_apply`.

#### §18.2.4 The roster, the lease, and the watermark

**Decision: the party is the roster unit, and the lease lives on the party.**

- `hr_tick_roster` gains a sibling `hr_party_roster(p_channels, p_cursor,
  p_limit, p_holder)` returning **one row per live `party_hunt`** with its
  members' full `hr_state_of` envelopes nested — §2's rule, the tick never
  assembles a character out of parts.
- `hr_tick_roster` itself gains one clause and no column: `and not
  public.hr_partied(user_id, slot)` (invariant 7). `hr_tick_ownership` may still
  carry a nullable `party_id uuid` as an **index helper** — a catalog-only
  `ALTER`, no `GENERATED … STORED`, no table rewrite — but it is not consulted
  as authority anywhere.
- **One lease, on the party.** `party_tick_lease` is stamped in the driver's own
  holder name exactly as `hr_tick_ownership` is; a member cannot be leased away
  from under it because the member row is never offered.
- **Members' `accrued_to` move together, and ONLY together**: a party window is
  `[party_hunt.accrued_to, t]` for every member, one geometry, computed once. By
  invariant 8 no member's own `accrued_to` can be ahead of the party's, because
  no door exists through which it could move — so there is nothing to drag
  forward and the previous draft's drag-forward rule is gone (answers S-3). A
  member whose `player_state.accrued_to` is nonetheless found ahead of
  `party_hunt.accrued_to` at settle time is a **broken invariant, not a case to
  handle**: the settle refuses the whole party with
  `party_window_already_settled` and names the member, and §18-SEC.2's 8b
  per-party tiling read is the detector that must exist even after S-3 is fixed.
- In SHADOW the party chains on `party_tick_lease.shadow_accrued_to`, for
  exactly the §15c reason: chaining on `party_hunt.accrued_to` while paying
  nothing produces overlapping windows and a parity number that lies upward.
  Arming clears it.
- **The party cohort's `batch_limit` is stated in CHARACTERS, not parties**
  (I-3): a party takes one lease but four characters of settle work, so a limit
  counted in parties makes the first cohort up to 4× the intended size. The
  driver admits parties until the running sum of their live member counts
  reaches the limit.

#### §18.2.5 How `hr_tick_settle` receives a party settle

**Decision: ONE fence call per party, carrying per-member deltas, all-or-nothing.
Not one call per member under a party lock.**

```sql
hr_party_tick_settle(
  p_holder      text,
  p_party       uuid,
  p_window_from timestamptz,
  p_window_to   timestamptz,
  p_intent_id   uuid,            -- ONE key for the whole party window
  p_members     jsonb            -- [{user, slot, version, delta}, …] 2..4
) returns jsonb
```

One `p_intent_id` across 2–4 members is safe and is not an assumption:
`hr_tick_shadow_intent_uidx` is unique on **`(user_id, slot, intent_id)`**, so
one key spans the party's members without collision while still refusing a
replay of any one of them. `hr_apply`'s own idempotency is keyed the same way.

Order inside, and every step is `hr_tick_settle`'s own with the party grain
added:

1. **Identity** — `current_setting('role')` refused for
   `anon/authenticated/service_role/hr_tick`, and the GRANT is the primary
   control (§15c).
2. **Kill switch** — `hr_tick_config.enabled`, missing row = off.
3. `select … from party_hunt where party_id = p_party and ended_at is null
   for update` — **the party lock, taken first.** This is what serialises a
   settle against a join, a leave and a kick.
4. Lock member `player_state` rows `for update` **ordered by `(user_id, slot)`**.
   Deterministic order is the whole deadlock argument: a concurrent solo settle
   holds exactly one of these rows and can only ever be waited on, never
   circularly.
5. **THE CAS, STATED PRECISELY.** The mark is the **party's**, computed once,
   exactly as `hr_tick_settle` computes the per-character one
   (`2026-09-21-world-tick-settle-fence.sql`, "THE MARK THE CAS COMPARES
   AGAINST"):

   ```sql
   -- v_mark is the PARTY's, not any member's. Armed: the party watermark, which
   -- the party's own payments move. Shadow: greatest of it and the party's
   -- shadow watermark, so windows cannot overlap while nothing is being paid.
   -- greatest() keeps the mark from ever being behind, and it is per PARTY
   -- because invariant 8 makes every member's mark equal to it.
   select case when cfg.shadow
               then greatest(h.accrued_to, coalesce(l.shadow_accrued_to, h.accrued_to))
               else h.accrued_to end
     from public.party_hunt h
     join public.party_tick_lease l on l.party_id = h.party_id
    cross join public.hr_tick_config cfg
    where h.party_id = p_party and h.ended_at is null;
   ```

   Refuse if `p_window_from < v_mark` or `p_window_to <= v_mark`. Then, **per
   member**: assert `player_state.accrued_to = v_mark` (invariant 8 — an
   inequality either way is a broken invariant, not a window to clamp), assert
   `player_state.version = the version in p_members`, and assert
   `member.delta->>'accrued_to' = p_window_to`, binding the declared window to
   the paid one. **Any member failing ⇒ the whole call returns
   `{ok:false, error:'party_window_already_settled', member:{…}}` and nothing is
   written.** All-or-nothing is not tidiness: a partial settle pays three
   members a split computed from four contributors, which is a mint.
6. **Re-count the live membership under the lock** (T-6) and re-assert the
   member set in `p_members` is exactly it. A count read outside the lock is the
   shape the clan member-cap bug turned on.
7. **Shadow branch** — one `hr_tick_shadow` row per member, `channel='combat'`,
   `delta` **verbatim and carrying no party key at all**, the attribution in the
   new nullable `party` column; stamp `party_tick_lease.shadow_accrued_to`;
   return **before** `hr_apply`. Nothing a player owns moves.
8. **Armed branch** — `hr_apply` once per member inside the one transaction,
   each with a solo-shaped delta whose `journal.meta.party` carries that
   member's attribution; then `party_hunt.accrued_to = p_window_to`, then
   `party.version + 1`.

**Why one call and not four.** Four calls under a party advisory lock are four
transactions: a crash between the second and the third leaves two members paid
from a four-way split with the party watermark un-advanced, and the retry then
either double-pays the first two or refuses them and pays nobody. The split is
one arithmetic over one window and must commit as one row set. The cost is
stated rather than discovered: the settle holds up to four `player_state` row
locks across four `hr_apply` calls, which is why step 4's ordering is a hard
rule and why S2's guard mutation-proves it.

#### §18.2.5a WHEN ONE MEMBER'S `hr_apply` REFUSES (answers S-9)

Step 5's all-or-nothing covers the CAS. It said nothing about step 8, and
`hr_apply` refuses for reasons that are **ordinary play, not corruption**:
`too_many_progress_ops` (§16.5 measured 69 ops against a cap of 64 on an
ordinary fight, before any party fan-out), a bag that cannot take the item,
`c_max_progress_add`. Under a naive all-or-nothing, one member's full bag stops
four players' payouts and the unsettled window then grows against the 24 h cap
until a night is silently eaten — the `bag_full` silent-loss shape §18.1 itself
cites as the thing party wipe exists to prevent. **And the answer is not "pay
the others", because that is step 5's mint.**

**THE RULE: a member-level `hr_apply` refusal rolls the whole fan-out back and
ENDS the party hunt. Nothing is paid, no watermark moves, and the party stops
being a party — so the retry is four solo settles, not a fifth party attempt.**

The mechanism is plpgsql's own and needs no new transaction, which is what makes
it a rule rather than a wish. The fan-out runs inside one `begin … exception`
sub-block; a member refusal is re-raised inside it; the sub-block's implicit
savepoint rolls back **every** `hr_apply` write from the fan-out; and the
handler's own statements run in the outer transaction, which is still live:

```sql
-- INSIDE hr_party_tick_settle's armed branch. The sub-block's rollback undoes
-- every member's hr_apply; the handler then writes in the surviving outer
-- transaction, which is the whole reason this is one call and not two.
begin
  -- … hr_apply once per member; raise 'HR_PARTY_MEMBER_UNPAYABLE' on any ok=false …
  update public.party_hunt set accrued_to = p_window_to
   where party_id = p_party and ended_at is null;
exception when others then
  update public.party_hunt
     set ended_at = now(), stopped_by = 'member_unpayable:' || v_bad_user
   where party_id = p_party and ended_at is null;
  return jsonb_build_object('ok', false, 'error', 'member_unpayable',
                            'member', v_bad_member);
end;
```

`party_hunt.accrued_to` is **not** advanced, so the window is intact. The next
fire finds no live `party_hunt`, `hr_partied` goes false for all four, invariant
7 stops excluding them, and the per-character roster serves each of them: the
same window is priced **once** per member under the ordinary solo rules, the
refusing member meets their own `bag_full` alone where it is their own problem
to solve, and the other three are paid. The party's members are told
`member_unpayable` and the panel says whose bag it was.

S2's guard plants each of the three refusals above and asserts the window is
**fully paid or fully unpaid, never partial**, that `party_hunt.ended_at` is
stamped, and that the party does not wedge.

#### §18.2.6 The shadow / parity read

```sql
-- Party grain, 24 h. Attribution is the COLUMN now, never the delta (S-1), so
-- this groups instead of walking jsonb — and `delta` in these rows is
-- byte-for-byte what hr_apply would have received.
select s.party->>'id' as party_id, s.window_from, s.window_to,
       count(*) as members,
       sum(s.would_gold) as party_gold,
       sum((s.party->>'dmg_bp')::int) as dmg_bp_total,
       sum((s.party->>'xp_bp')::int)  as xp_bp_total
  from public.hr_tick_shadow s
 where s.party is not null and s.window_to > now() - interval '24 hours'
 group by 1,2,3;   -- dmg_bp_total AND xp_bp_total MUST BOTH be 10000 on every row
```

`node tools/world-tick-replay.mjs --party` re-runs the window through
`computeAccrual` + `src/core/party-split.js` and asserts three properties:

- **(P-a) Degenerate parity, and the comparison is now exactly stateable**
  (answers S-1). A one-member party's delta is **byte-identical to the solo
  path's on the same inputs after deleting `{journal,meta,party}`** — i.e.
  `delta #- '{journal,meta,party}'` compares byte-for-byte, and the deleted
  object is the only difference there is. That is a sharper property than the
  previous draft could state, because under the old design the delta carried
  three top-level keys solo does not and byte-identity was false by
  construction. This is the `AWAY-1` property restated at party grain and it is
  the single most valuable guard in the milestone: it makes the party path a
  *wrapper* rather than a second engine (`AWAY-12`).
- **(P-b) BOTH share vectors sum to exactly 10,000 bp**, every window, with
  §18.1's lowest-`(user_id, slot)` remainder rule applied — `dmg_bp` (gold and
  lottery weight) and `xp_bp` (floored). Zero tolerance: this is integer
  arithmetic, not a simulation, and a band would hide a rounding leak in either
  direction.
- **(P-c) Conservation, AS AN INEQUALITY IN THE SAFE DIRECTION PLUS AN EXACT
  EQUALITY UNDERNEATH IT (answers S-10c).** The previous draft made it *"a
  strict equality with the fellowship bonus subtracted"*, which is **false on
  any window containing a Vigour-dry member**, because `VIGOUR_DRY_MULT` makes
  the sum over members strictly less than the party total — so the guard would
  be red on ordinary play and would get relaxed, which is how a guard stops
  being one. The property is therefore two statements:

  > **paid ≤ produced + fellowship**, always, on every quantity; **and**
  > `Σ pre-multiplier member share = produced` exactly, with the fellowship line
  > and each member's `VIGOUR_DRY_MULT` reduction carried on their own
  > `meta.party` fields so both terms are readable from the journal.

  A party may never pay out more than it produced. The fellowship bonus is the
  one declared exception and the dry multiplier is the one declared reduction,
  and both are journalled, so the equality is checkable with them accounted
  rather than assumed away.

#### §18.2.7 The party frame — per member, on the topic M5 already proved (answers S-15)

§18.5's S5 and §18.6 both assumed *"pushed party frames on the party topic"*.
There is no such topic and there must not be one. M5's `realtime.messages`
policy authorizes a join by comparing the topic's own user segment to the JWT —
`topic = 'hr:' || auth.uid()::text || ':' || <slot>`, deliberately an equality
and not a `like`, because a topic-shaped predicate *"would let any authenticated
player join any other player's topic and stream their entire state"*
(`SEC_PUSH_CHANNEL_M5_2026-09-23.md` S1, and its `s3c` arm refuses a fourth
segment outright). A party topic has no user segment, so that policy cannot
authorize it, and a new predicate resolving party membership **inside** an RLS
policy is evaluated per subscriber per change — the 2.5M-reads/s line that
document already flags at 5,000 characters.

And Realtime authorizes at **join**, not per delivery, so a kicked or departed
member keeps receiving the party's frames on an already-open channel until they
reconnect: a disclosure that outlives the membership that justified it.

**The design: N per-member frames, each on that member's own already-proven
`hr:<user_id>:<slot>` topic**, carrying `hr_party_view`'s frozen projection
(§18.2.2) and nothing else. Consequences, all of them good:

- **Unsubscribe is not a mechanism, it is an absence.** A leaver or a kicked
  member is no longer a live member, so `hr_party_view` refuses them and the
  emitter simply stops addressing them. There is no channel to revoke, no
  reconnect to wait for, and no window in which a departed member reads a party
  they are not in. The membership change and the disclosure end in the same
  transaction, which is the property a party topic could not give at any price.
- **No new topic shape and no new policy.** `hr_frame_topic(user, slot)` is
  unchanged, the three-segment anchor is unchanged, and M5's `e2` cross-user
  probe keeps meaning what it means.
- **The frame rides the `frame_keys` allowlist** — one new key, `party`, inside
  `hr_tick_config.frame_keys`' CHECK, subject to the same `between 1 and 12`
  bound and the same rule that `inventory`/`bank` wait for §7a's ABSOLUTE flip.
- **It costs the invoice nothing §18.6 has not already priced.** §18.6's second
  question budgets four deliveries per frame for a four-party; N sends of one
  delivery each is the same N deliveries. That question is a finance call and is
  left exactly as it stands; only the transport under it is corrected here.

---

### §18.3 THE INTENTS

Seven verbs, all `needsKey: true`, all through `hr-accrue`'s existing dispatcher
and `INTENT_REGISTRY`. No new transport, no new door.

| verb | bucket | collectsFirst | per-call clamp | per-day clamp |
|---|---|---|---|---|
| `party_create` | `party` | false | — | 10 / character / UTC day |
| `party_invite` | `party` | false | resolved inside the RPC; ONE refusal for every unavailable target | 20 sent / character / day, **and 5 live + 20 received / character / day** |
| `party_accept` | `party` | false | invite live and ≤ 15 min old; **refused `party_hunt_running` while the party has a live hunt**; spread re-checked | 20 / character / day |
| `party_leave` | `party` | **true** | settles an open hunt first, inside §18.1's 8-boundary budget | — (never clamped: a player may always leave) |
| `party_kick` | `party` | **true** | leader only; settles first | 20 / party / day |
| `party_hunt_start` | `activity` | **true** | 2–4 live members, spread ≤ 10, none recovering | 60 / character / day (the `activity` budget) |
| `party_hunt_stop` | `activity` | **true** | leader, or any member for themselves (= leave) | — |

`collectsFirst: true` on the last four is derived, not preferred: each builds a
delta carrying `activity`, `hr_apply` stamps `accrued_to` on exactly that key,
and a verb that stamps without collecting confiscates the elapsed window. For
the last four that collect is **the party's** (`hr_party_tick_settle` over
`[party_hunt.accrued_to, now()]`), never the member's own — invariant 8.
`guardStampKeys()` re-checks the shape at runtime, so the day someone adds
`equip` to a party delta it is a refusal (`delta_would_stamp`) rather than the
silent confiscation of four players' nights at once.

**What the EXISTING verbs do for a partied character (answers S-3, S-4).** This
is the half the previous draft left to code time, and it is the P0. The
predicate is `hr_partied(user, slot)` (§18.2.3 invariant 7) and it is checked in
`INTENT_REGISTRY`'s dispatch, before any key is derived:

| existing verb | for a partied character |
|---|---|
| `accrue` — including the client's ~90 s attended cadence | **`party_settle_required`**. The party owns the window; there is nothing to price. This is also the whole of S-4's attended fence: with `accrue` refused there is no attended top-up for a party member to receive, and no `hr_kill_credit_log` row is written for them. |
| `set_activity`, `equip`, `enchant`, `eat`, the shop and buff verbs — every `collectsFirst: true` verb | **`party_hunt_running`**, with *Stop the hunt* / *Leave* offered. Each either stamps a `STAMP_KEYS` key or changes an input the shared window is priced from. |
| everything else (reads, bug reports, cosmetics) | unaffected. |

**Idempotency.** One client-supplied `intentId` per membership verb, exactly as
today. The **hunt window** key is different and is *derived*, never supplied:
`uuid_v5(party_id, window_from||window_to)`, so a retried party settle is the
same operation however many times the tick asks — the accrue verb's rule
(`index.ts §Idempotency`) at party grain. It needs no `hr_seed` salt, and that
is an argument rather than an omission: the accrue key is salted because
`hr_load` returns `accrued_to` to the client, which makes an unsalted key
*computable by the player*. Nothing in the party window key is client-supplied
and `hr_party_tick_settle` is executable by `hr_engine` and nothing else, so
there is no caller who could present a guessed key. One key spans 2–4 members
without collision because `hr_tick_shadow_intent_uidx` is unique on
`(user_id, slot, intent_id)`.

**Refusal codes** (400 = malformed, 409 = a real thing the server refuses; the
split follows `intents.js`'s existing taxonomy so a player is never told "bad
request" when the truth is "your friend is knocked out"):

| code | HTTP | what the client shows |
|---|---|---|
| `bad_party` | 400 | *(a bug — file it)*; the panel refreshes from the envelope |
| `unknown_party` | 409 | "That party no longer exists." Panel clears. |
| `already_in_party` | 409 | "You're already in a party." Offer *Leave first*. |
| `not_in_party` | 409 | "You're not in that party." Panel clears. |
| `not_party_leader` | 409 | The button is not rendered for non-leaders; if it is reached, "Only the leader can do that." |
| `party_full` | 409 | "That party is full (4)." |
| `invite_expired` | 409 | "That invite expired." Card removed. |
| `invite_gone` | 409 | "That invite was withdrawn." |
| `invite_target_unavailable` | 409 | "Couldn't invite that player." ONE string for every reason, so the sender learns nothing about who exists or who is partied (S-13). |
| `invite_inbox_full` | 409 | Shown to the SENDER as `invite_target_unavailable`; the receiver clamp is invisible to them (S-13). |
| `party_level_spread` | 409 | "Everyone must be within 10 levels — Tomas is 18 below." Names the member and the gap. |
| `party_member_recovering` | 409 | "Ilse is recovering (4 m 12 s)." Carries `until` + `remaining_ms` so the client renders a countdown, never a retry loop — `recovering`'s own shape. STATEFUL, so it is **not** on `STATELESS_REFUSALS` (I-1). |
| `member_uncollectable` | 409 | "Couldn't price Bram's last session — nothing was lost, try again." Nothing written; every window intact. |
| `party_hunt_running` | 409 | "Stop the hunt first." Also the answer to every `collectsFirst` verb from a partied character, and to `party_accept` into a live hunt. |
| `party_settle_required` | 409 | "Settling the last window — one moment." The client retries once after 2 s, then surfaces it. Also the `accrue` refusal of invariant 8, where the panel shows the party instead of retrying. |
| `party_settle_churn` | 409 | **"Leaving now — your share of this window pays on the next settle."** Not a refusal of the leave: the member is out immediately and the payment rides the next natural flush (§18.1, S-6). |
| `member_unpayable` | 409 | "Bram's bag is full — the party hunt stopped and nobody lost a window." Names the member; the hunt is ended and each character settles alone (§18.2.5a, S-9). |
| `party_daily_cap` | 429-shaped 409 | "You've formed enough parties today." |
| `rate_limited` | 429 | the existing bucket message |

`bad_party` and the registry-shape refusals belong on `STATELESS_REFUSALS`
(`intents.js:895`), because a malformed client that spends the rate budget
defeats the check that budget exists to protect; every code above that carries
server state — `party_member_recovering`, `party_settle_churn`,
`member_unpayable`, `party_settle_required` — does not (I-1).

Every refusal is journalled in `hr_rejections` with its verb, by the
`c-hr-rejections-journal` verb map (§3.4) — so "nobody can start a party hunt"
is visible in `vitals.mjs --refusals` on the day it breaks, not two days later.
M8 depends on that lane knowingly (I-2): without its verb map a party refusal
burst reads as a verbless aggregate, which is exactly the visibility §18 claims
to be buying.

---

### §18.4 ECONOMY + ANTI-ABUSE — the threat model Security will grade

T-1, T-5, T-6, T-7, T-9 and T-10 were graded as holding and are unchanged. T-2
and T-4 were **stated more strongly than they held** and are restated to what
actually holds under §18.1's XP-only floor; T-3's fix created a re-roll lever it
did not price, and now prices it.

| # | Threat | The rule that defeats it |
|---|---|---|
| T-1 | **Loot laundering between alts.** Main farms, drops land in a throwaway. | **There is no directed transfer anywhere in the API.** No intent carries a recipient, an item id, a quantity or a share. Drops roll once per kill and are assigned by a **damage-weighted**, window-seeded lottery inside `hr_party_tick_settle`; the assignment is journalled with `meta.party.roll`, so the whole distribution is replayable from the ledger. |
| T-2 | **Low-level leech** parked in a high-level party. | Three controls, and the claim is now the true one (answers S-5). The **level spread ≤ 10**, checked at start **and on accept** (S-12). **Damage weighting**, which governs gold and loot with **no floor and no threshold at all** — so a leech's gold is exactly their damage, at every level of participation, not merely below a threshold. And the **XP** floor, which is the only subsidy in the design and is paid in the one quantity that cannot be sold, ranked against another player's wallet or carried to another account. The previous claim, *"leeching pays nothing"*, was true only below the 25 %-of-equal threshold, which is the one place nobody would sit; under the XP-only floor it is true of every tradeable quantity everywhere. |
| T-3 | **Kick-before-split.** Leader kicks at minute 59 of a 60-minute window and keeps the share. | **A membership change while a hunt is live settles the open window first, in the same transaction** (invariant 5): `hr_party_kick` calls `hr_party_tick_settle` for `[accrued_to, now()]`, pays *every* member including the one being removed, and only then writes `left_at`. If the settle cannot run, the kick is refused with `party_settle_required` — the kick is never the cheaper path. |
| T-3b | **The re-roll lever T-3's fix creates** (answers S-6). Every join, leave and kick forces a settle boundary at a player-chosen instant, which re-simulates the window's kills and re-assigns its drops; `party_kick` was clamped at 20/party/day but `party_leave` was unclamped by design, so leave → re-invite → accept gave roughly **80 chosen re-rolls a day per party**. | **At most 8 membership-forced settle boundaries per party per UTC day**, journalled, refusal `party_settle_churn` — and the clamp is on the **boundary**, not on the verb, so `party_leave` stays unclamped and **the right to leave is untouched**: past the eighth a member is out immediately and is paid at the next natural flush (§18.1). Compounding is removed too: the integer remainder goes to the **lowest `(user_id, slot)`** among tied-largest shares, not to the largest share, so the member choosing the boundaries can no longer position themselves to collect every remainder. |
| T-4 | **A party as a gold-transfer channel** to a fresh account for sale. | **Gold follows raw damage share exactly — no floor, no threshold, no subsidy at any level of participation** (answers S-5). This is now literally true rather than approximately: the previous design's 50 %-of-equal floor was, in gold, a **directed transfer** — three alts each clearing the 6.25 % threshold collected 37.5 % of the party's gold for ~19 % of its damage, a 2× subsidy at the threshold, funded by scaling the real fighters down. With the floor confined to XP, a non-fighting account receives ≈0 and a *barely*-fighting account receives exactly what it fought for. There is no split-override, no "give my share to", no leader-takes-all mode, and no way for a member to be paid from a window they were not in (§18.2.5 step 5 binds the payout to the locked member set). |
| T-5 | **A member forging the split.** | The split is computed **inside the settle**, from the engine's own per-member damage totals, by `src/core/party-split.js` — one pure function, dual-runtime, the same code in the live tick and the away replay. **No client field names a share, a weight, a damage number or a recipient**; the intents carry a party id, a member id and an idempotency key. A forged client value has nothing to forge. |
| T-5b | **Forging by TIMING rather than by number** (answers S-3). A member's own `accrue`, or any `collectsFirst` verb, used to be able to advance their `accrued_to` into the middle of a party window — at which point the party could not replay over the paid minute and the other three were never paid for it either. A client-controlled quantity (the instant of an ordinary intent) crossed into three other players' economies. | **Invariant 8.** The party watermark IS the member's watermark for the life of the hunt; `hr_party_tick_settle` is the only writer of either; `accrue` is refused `party_settle_required` and every other `collectsFirst` verb `party_hunt_running`. §18-SEC.2's 8b per-party tiling read is the standing detector and exists even after the fence is built. |
| T-6 | **Over-filling the party** (5+ members, or one user's four slots). | `party_member_one_char_per_user` and a re-count under the `party_hunt` row lock at start and at every settle (§18.2.5 step 6); `size_cap` CHECK `between 2 and 4`. A count read outside the lock is the shape the clan member-cap bug turned on. |
| T-7 | **Replay / double pay** of a party window. | The party-grain CAS of §18.2.5 step 5, all-or-nothing, plus the derived window key and `hr_tick_shadow_intent_uidx` on `(user_id, slot, intent_id)`. The D-series of `world-tick-double-pay.mjs` is re-run at party grain. |
| T-8 | **Fellowship-bonus farming** with boxed accounts. | Capped at **+15%, XP only**, paid only above the participation threshold, journalled per member as `meta.party.fellow_bp`, and economically dominated: four boxed alts split one monster stream four ways to buy 15% XP, which is strictly worse than four solo hunts. |
| T-9 | **Settle starvation / deadlock** wedging a party's payouts. | Step 4's fixed `(user_id, slot)` lock order; the party lease expires like any other, so an abandoned lease is re-taken by the next fire; a party that cannot settle for a full lease period is journalled in `hr_tick_cron_log` with its party id. A member whose `hr_apply` refuses does not wedge the party either — §18.2.5a ends the hunt and the four characters settle alone. |
| T-10 | **Cross-party double membership** (a character hunting solo *and* in a party). | Invariant 1 (unique index) plus invariant 7's **positive, derived** exclusion (`hr_partied`, by join) — two enforcement points, one at the write and one at the read, and neither is a denormalised column that can be stale or absent (answers S-8). |
| T-11 | **Bypassing the daily Vigour limiter through the highest-throughput hunting surface in the game** (answers S-10). | The party settle **charges Vigour**, per member, from the member's own fighting ms, filed as `ev:vigour_min` + `ev:vigour_rem_ms` in the same transaction as the payout (§18.1). A settle path that pays combat and does not file the charge is a clean bypass of the limiter the refill gold sink is priced against, arriving at 4× the throughput of the path it bypasses. |

Two ledger facts Security and Reliability will both want, stated plainly:

- **Ledger rows are per MEMBER per settled window, i.e. identical to solo.** Four
  characters in a party write the same four rows per flush window that they
  would write hunting alone, so §15c's shared 480,000/day prune budget is
  unchanged by M8 — and `meta.party` adds no rows, only ~90 bytes to the rows
  that already exist. What M8 *saves* is edge invocations and lock
  acquisitions: one settle call per party instead of four.
- **The fellowship bonus is the only place the party pays out more than the
  simulation produced, and `VIGOUR_DRY_MULT` is the only place it pays out
  less.** The bonus is XP, never gold, never an item; both terms are carried on
  their own `meta.party` fields precisely so (P-c) can be a safe-direction
  inequality with an exact equality underneath it (§18.2.6) rather than a strict
  equality that ordinary play makes red.

---

### §18.5 THE SLICES FOR M8

A slice = one lane-C migration + one edge change + one client half, each with an
in-page test, per `CLAUDE.md` §3.3. **The "before ARMED" column is corrected**
(§18-SEC.3, Correction 1): S2 and S3 are before *paying*, which is not the same
as before ARMED. S2 builds the settle whose armed branch reaches `hr_apply` and
S3 builds the arithmetic that decides who is paid what; **both are money-surface
reviews under `CLAUDE.md` §2 and neither applies without its own Security GO**,
even though neither moves a coin on the day it applies — the money moves later,
on an operator `update`, with no further code review in between. Only S1's
review is structural, and that sentence must not be read across.

| # | Slice | Migration | Edge | Client | Guards | GO? |
|---|---|---|---|---|---|---|
| **S1** | **The party exists.** Membership only — no hunting, no money. | `party`, `party_member`, `party_invite`, `hr_party_role`, `hr_party_of`, `hr_party_view`, `hr_party_create/invite/accept/leave/kick/transfer`, RLS per §18.2.2 | 5 verbs in `INTENT_REGISTRY` + `party.js`; `party` rate bucket in `hr_rpc_gate` | Party panel, invite card, projected `party` block in the envelope | `tests/party-membership.mjs` + `--selftest` (invariants 1–4 each mutation-proved); in-page "player actions" test that forms, invites, accepts, leaves, dissolves. **§4 self-check EXECUTES**: `set role authenticated` + INSERT/UPDATE/DELETE against all three tables, each asserted to RAISE; both unique-index violations provoked; `has_function_privilege` false for `anon`/`authenticated`/`service_role` on `hr_party_role`; `hr_party_view` refuses a non-member; `hr_assert_grant_hygiene(true)` does not raise (S-14) | structural review; **dispatched** |
| **S2** | **The party is a roster unit, in SHADOW.** | `party_hunt`, `party_tick_lease`, `hr_partied`, `hr_tick_shadow.party` (nullable, catalog-only), `hr_party_roster`, `hr_party_tick_settle` **shadow branch only**, `hr_tick_roster`'s `not hr_partied(…)` clause | `tick.js` learns the party roster shape and the one-call settle; the `hr_partied` fence on `accrue` and every `collectsFirst` verb (invariant 8) | none (shadow pays nothing) | `tests/party-tick-parity.mjs` — **(P-a)** on `delta #- '{journal,meta,party}'`, **(P-b)** both vectors at 10,000 bp, **(P-c)** as the S-10(c) inequality; `world-tick-double-pay.mjs` D-series at party grain; a planted partial-settle mutant must go red; the two rosters asserted **disjoint** with a character planted in both (S-8); the three `hr_apply` refusals of §18.2.5a each planted, each asserting fully-paid-or-fully-unpaid and a stamped `ended_at` (S-9); `world-tick-ledger-meta.mjs` extended to EXECUTE the `meta->'party'` read and pin both wrong spellings as empty (S-2). **§4 self-check EXECUTES**: `has_function_privilege` for all five roles on the settle and the roster; the identity refusal called as each forbidden role; a CAS-rejected member set asserting zero rows written anywhere; `hr_tick_shadow.channel`'s CHECK unchanged | **own GO** |
| **S3** | **The split, in shadow.** | none (the settle from S2 calls it) | `src/core/party-split.js` (pure, dual-runtime); `computeAccrual` returns per-member damage | Analyzer's Fellowship block with **both** columns (damage and xp share), rendered from the projection, replaced per envelope | `tests/party-split.mjs` + `--mutate`: removing the XP floor, removing the participation threshold, **applying the floor to gold or to the lottery weights** (S-5), sending the remainder to the largest share instead of the lowest `(user_id, slot)` (S-6), or rolling loot per member must each turn it red; ATTENDED **and** AWAY tests (both-path rule, §4). **§4 self-check**: the migration half has no body; one executing assertion that both vectors read back out of `hr_tick_shadow.party` sum to 10,000 bp on a planted four-member window | **own GO** |
| **S4** | **The hunt intents.** Lands **after S3**, not merely numbered after it: T-3's kick calls the settle, which calls the split, so S4's assertions run against S3's arithmetic (§18-SEC.3, Correction 2). | `hr_party_hunt_start/stop` (pointer only; the settle is S2's) | 2 verbs, `collectsFirst: true`, the refusal table of §18.3 | Start-with-team / Stop, every refusal string, the recovering countdown, the `party_settle_churn` copy | `tests/party-intents.mjs`: spread at start **and on accept** (S-12), recovering, `member_uncollectable`, kick-before-split (T-3), the 8-boundary budget and that the 9th leave still removes the member immediately (S-6), `party_hunt_running` on accept into a live hunt (S-11) — each asserted by exit code; in-page happy path. **§4 self-check EXECUTES** each of those refusal paths and asserts `left_at` is unwritten when the settle cannot run | **own GO** |
| **S5** | **ARM parties on combat.** | none — an operator `update hr_tick_config` plus a party cohort in `party_tick_lease`, its limit counted in **characters** (I-3) | the armed branch of `hr_party_tick_settle` begins reaching `hr_apply`; the emitter sends **N per-member frames on `hr:<user>:<slot>`** (§18.2.7, S-15) and `party` joins `frame_keys` | the party panel reads its own frame; no party topic is ever joined | pre-arm: Security **GO** on this whole §18 threat model, Reliability sign-off on the ledger read, and a **48 h** shadow run with **all of §18-SEC.2's 8a–8e green** plus (P-a) byte-identical, on at least one real four-member party **and one one-member party** | **own GO** |

Ordering constraints that are not preferences:

1. **S1–S4 all land in SHADOW and pay nobody.** That is deliberate: it means M8
   can be built in parallel with M4's arming work instead of queueing behind it,
   and the 48 h shadow parity run that S5 needs is already accumulating by the
   time M4 flips. It does **not** make S2 and S3 structural reviews.
2. **S5 cannot precede M4.** A party settle reaching `hr_apply` *is* the combat
   channel paying; arming parties first would arm combat through a side door.
   **And invariant 9 is an M4 co-blocker in the other direction** (S-4): M4's own
   pre-arm roster fence and the party's attended refusal compose, and neither is
   verifiable without the other.
3. **S5 cannot precede M5 + §7a.** Pushing party frames into a client whose
   inventory fold is a one-way `Math.max` ratchet reproduces the 2026-09-13/14
   bug class — at four characters at once, on a shared surface, which is the
   worst version of it.
4. **Every slice is its own lane-C review, and S2, S3, S4 and S5 each need their
   own GO** — S1 alone is structural (§18-SEC.3, Correction 1).

---

### §18.6 OPEN QUESTIONS FOR TYLER — finance only

Nothing else in this document is queued on Tyler; every design decision above is
made under `CLAUDE.md` §3.1.

1. **Does the (still unapproved) always-on host figure cover the M8 shape?** A
   party settle holds up to four `player_state` row locks for the duration of
   four `hr_apply` calls, so the per-fire database time at a given active
   population is higher than §15c's per-character number even though the *row*
   counts are identical. The direction was approved on 2026-09-16; the monthly
   figure never was, and this is the milestone that makes it a gate rather than
   a preference. **No spend has been made or committed by this lane.**
2. **Realtime delivered-message budget for party frames.** A party frame is one
   `realtime.send` delivered to N subscribers, and Realtime bills *delivered*
   messages — so a four-party costs 4 deliveries per frame where a solo
   character costs 1, at the same cadence. At M5's 10 s cadence that is a real
   invoice line. The lever is the party frame cadence (30 s for the party panel,
   10 s for your own character, which is also the honest UX split), and which
   way to take it is a budget call, not a design one.

---

### §18.7 Security answers — where each finding is answered

Written 2026-09-23 by the Backend Architect (S-1 – S-4, S-8, S-9, S-10
mechanics, S-15) and the Game Designer (S-5, S-6, S-12's number, S-16 and every
player-facing restatement), answering `§18-SEC.1`. **No §18-SEC text was
edited**: Security's record is immutable, and the two places this document
disagrees with a finding's reasoning are stated below rather than by amending
it.

`S1 — built` means the finding was carried into the already-dispatched slice-1
membership brief on §18-SEC.0's ruling and is settled there; this lane did not
reopen it.

| # | Sev | Verdict here | Answered in |
|---|---|---|---|
| **S-1** | P0 | **ACCEPTED** — attribution is JOURNAL, never DELTA | **§18.2.1a**, and §18.2.1's `alter table … add column party jsonb`. The delta's key set is named there; §18.2.5 steps 7–8 carry it; (P-a) is restated on it in §18.2.6. |
| **S-2** | P0 | **ACCEPTED** — one namespaced key, and the level stated | **§18.2.1a** ("Why one key and not seven", and "AND THE LEVEL, STATED"), with the executable `meta->'party'` read. Guard work in §18.5 S2. |
| **S-3** | P0 | **ACCEPTED** — the drag-forward rule is deleted, not softened | **§18.2.3 invariant 8** (the predicate and the four doors), §18.2.4's watermark bullet, §18.3's existing-verbs table, §18.4 T-5b. |
| **S-4** | P0 | **ACCEPTED**, taking option (1), refuse the credit | **§18.2.3 invariant 9**, §18.1 "Both tabs closed", §18.3's existing-verbs table. Named an **M4 co-blocker** in §18.5 ordering constraint 2. |
| **S-5** | P1 | **ACCEPTED** — the floor is XP-only | **§18.1 "The split rule"** and the corrected Fellowship block; §18.4 **T-2** and **T-4** restated to what holds. |
| **S-6** | P1 | **ACCEPTED**, priced at **8 boundaries / party / UTC day** | **§18.1 "Leaving and being kicked"**; remainder rule in §18.1 "The split rule"; §18.4 **T-3b**; refusal `party_settle_churn` in §18.3. |
| **S-7** | P1 | **S1 — built** | Restated only where the settle depends on it: §18.2.2's `hr_party_view` paragraph, and §18.2.7, whose frames project that column set and nothing wider. |
| **S-8** | P1 | **ACCEPTED** — the exclusion is positive and derived | **§18.2.3 invariant 7** (`hr_partied`, by join), §18.2.4's roster bullet, §18.4 T-10. The column survives as an index helper only. |
| **S-9** | P1 | **ACCEPTED**, and it is not "pay the others" | **§18.2.5a** — roll the fan-out back, end the hunt `member_unpayable:<user>`, retry as four solo settles. Refusal in §18.3; guard in §18.5 S2. |
| **S-10** | P1 | **ACCEPTED** in all three sub-rules, including `VIGOUR_DRY_MULT = 0.25` | **§18.1 "Vigour inside a party"** (a, b, c); **§18.2.6 (P-c)** as an inequality with an exact equality underneath; §18.4 **T-11**. |
| **S-11** | P2 | **S1 — built** | Reflected where it changes a table: `party_accept` is `party_hunt_running` during a live hunt (§18.3), and §18.1 notes the spread check is written down anyway because S-11 may be relaxed later. |
| **S-12** | P2 | **S1 — built**; the number is stated once here | **§18.1 "Forming one"** — ten levels, checked at start **and on accept**, never continuously. Guard in §18.5 S4. |
| **S-13** | P2 | **S1 — built** | Reflected in §18.3's clamp column and the single `invite_target_unavailable` / hidden `invite_inbox_full` refusals. |
| **S-14** | P2 | **S1 — built** | Restated in §18.2.2's grants paragraph (five functions named) and in §18.5's S1 and S2 self-check cells. |
| **S-15** | P2 | **ACCEPTED** — no party topic; N per-member frames | **§18.2.7**. §18.6's finance question is left exactly as it stands: N sends of one delivery is the same N deliveries it already prices. |
| **S-16** | P2 | **ACCEPTED** — the refused column was refused on a fence that is not one | **§18.2.1a**, final paragraph of the shadow-half block; the column itself is in §18.2.1. |
| **I-1** | I | recorded and decided per code | §18.3, the paragraph under the refusal table. |
| **I-2** | I | recorded as a knowing dependency | §18.3, final paragraph. |
| **I-3** | I | accepted — the cohort limit is in **characters** | §18.2.4, final bullet; §18.5 S5. |

**Two corrections for Security to re-verify, neither of which changes a ruling.**

1. **S-1's proposed mechanism names an argument `hr_apply` does not have.** The
   finding says *"the split passed as the `meta` argument `hr_apply` already
   takes"*. `hr_apply`'s signature is
   `(p_user, p_slot, p_version, p_intent_id, p_delta)` — there is no `p_meta`.
   The route that satisfies the finding's own **rule** is the `journal` DELTA
   KEY, which is already on `c_delta_keys` and whose `meta` object `hr_apply`
   merges verbatim at the top of `player_ledger.meta`. §18.2.1a takes that
   route. The ruling is unchanged and arguably strengthened: no new argument, no
   new writer, and the delta stays key-for-key solo.
2. **S-2's "ten-key allowlist" is eleven keys today.** `tests/accrual-engine.mjs`
   `META_KEYS` is `ms, ticks, kills, capped, ate, att, spent, w, from, to,
   stopped` — `stopped` landed 2026-09-22. The budget argument is unaffected
   (seven flat keys would make eighteen either way) and the ONE-key ruling is
   adopted as written; the number in the finding is one behind the file.

**Nothing in §18 is queued on Tyler except §18.6's two finance lines.** S-1
through S-16 are now answered in this document, which is the condition
§18-SEC.0 set for **S2 through S5 to become briefable**.

---

## §18-SEC Security threat model — §18 parties (2026-09-23)

Adversarial review of `lane/m8-parties-design` @ `efda8e91` by the
security-engineer, before any code exists. Graded against `CLAUDE.md` §1's
target property — *a forged client value cannot cross into another player's
economy or ranking* — and against the fences already standing: the tick fence
(§15c), `hr_apply` as the only money writer, `player_ledger` journalling with
per-call/per-day clamps, RLS per user, the Recovery Rule, §16.6's attended
fence, M5's frame topic policy, and the 5,000-character scale target.

Design reviews are cheaper than migrations, so this one is long where §18 is
silent and short where §18 is right. **§18 is right about the big decision** —
the party as a roster unit, one fenced call, all-or-nothing, no second ledger,
no client field naming a share — and most of what follows is the second layer
of that same decision, which §18 has not reached yet.

### §18-SEC.0 Verdict

| Section | Verdict | The reason in one line |
|---|---|---|
| §18.1 Player experience | **ACCEPT-WITH-CHANGES** | The split floor is a directed transfer (S-5); the parked and knocked-out member's Vigour charge is unstated (S-10). |
| §18.2 Server objects | **REDESIGN** | Attribution rides `delta`, which `hr_apply` refuses by design (S-1); the roster exclusion is a denormalised column (S-8); the member's own `accrue` is a second settler (S-3); §16.6 has no party form (S-4). |
| §18.3 Intents | **ACCEPT-WITH-CHANGES** | `party_accept` must collect first or be refused during a live hunt (S-11); invite targeting is an enumeration oracle with no receiver clamp (S-13). |
| §18.4 Economy + anti-abuse | **ACCEPT-WITH-CHANGES** | T-1, T-5, T-6, T-7, T-9, T-10 hold as written. T-2 and T-4 are stated more strongly than they hold (S-5); T-3's fix creates a re-roll lever it does not price (S-6). |
| §18.5 Slices | **ACCEPT-WITH-CHANGES** | No slice carries a §4 self-check block, and none names the grant-hygiene allowlist entry we have now shipped without twice (S-14). |
| §18.6 Finance | **ACCEPT** | Correctly Tyler's, correctly two lines, no spend committed. |

**Ruling on the brief: YES — M8 slice 1 may be briefed to a backend lane now**,
scoped to membership only (`party`, `party_member`, `party_invite`,
`hr_party_role`, `hr_party_of`, `hr_party_view`, the five membership verbs, the
`party` rate bucket, the panel), carrying S-7, S-11, S-12, S-13 and S-14, and
touching **no** money surface: no `party_hunt`, no `party_tick_lease`, no
settle, no split, no `hr_apply` reachability. S1's own review at apply time is
structural and is a separate GO from this one. **S2 through S5 are not briefable
until S-1 through S-4 are answered in this document** — each of the four
invalidates work that would be built on it, and S-1 in particular means a 48 h
shadow parity run would measure a delta shape that can never be paid.

### §18-SEC.1 Findings

Severity is the usual: **P0** blocks the named slice outright, **P1** blocks it
until answered, **P2** lands with the slice, **I** is recorded, not owed.

#### S-1 — the split attribution rides `delta`, and `hr_apply` refuses unknown delta keys **[P0 — BLOCKS S2, S3, S5]**

§18.2.1: *"a party settle writes ordinary `channel = 'combat'` rows and carries
`party_id`, `dmg_bp` and `share_bp` **inside the existing `delta` jsonb***".
§18.2.5 step 7 then calls `hr_apply` once per member, in the one transaction —
with that delta.

`2026-09-14-hr-apply-restatement.sql:719`:

```
  -- Unknown top-level keys are an error, not a shrug. A delta key that this
  -- function does not implement must never look like it worked.
  if exists (select 1 from jsonb_object_keys(p_delta) as t(dk)
              where dk <> all (c_delta_keys)) then
    v_out := jsonb_build_object('ok', false, 'error', 'unknown_delta_key', …
```

So the armed branch refuses **every** party settle, on the first member, and
all-or-nothing turns one refusal into a party that never pays anybody — while
`hr_record_rejection` journals `unknown_delta_key` four times a window for
every party in the game. In SHADOW it is worse than a loud error, because the
shadow branch returns *before* `hr_apply`: S2–S4 would accumulate 48 h of
parity evidence for a delta shape that `hr_apply` would have refused, and S5's
pre-arm report would read green on a payload that cannot pay.

It also breaks **(P-a) degenerate parity** by construction, which §18 calls
"the single most valuable guard in the milestone": a one-member party cannot be
byte-identical to solo if its delta carries three keys solo does not.

**The rule that must hold: the delta handed to `hr_apply` is key-for-key the
delta a solo settle would hand it. Attribution is JOURNAL, never DELTA.**
§18 does not state it. The fix is one nullable `party jsonb` column on
`hr_tick_shadow` — catalog-only, and see S-16 for why §18's stated reason for
refusing it is not a real fence — plus the split passed as the `meta` argument
`hr_apply` already takes.

#### S-2 — seven new top-level meta keys, against a ten-key allowlist, at an unstated level **[P0 — BLOCKS S2]**

§18.2.1 proposes `meta.party_id`, `meta.party_hunt`, `meta.dmg_bp`,
`meta.share_bp`, `meta.floor_applied`, `meta.fellowship_bp`, `meta.roll_seq`.

§16.5's *journal meta* paragraph pins the budget: the tick's combat row is
`ms, ticks, kills, capped, ate, spent?, w?, from, to, src` — *"ten keys at the
widest, which is exactly `tests/accrual-engine.mjs` SHAPE's allowlist length"* —
and §16.6 closes by spending the last of it: *"a tick combat row cannot carry
`att`, so its widest shape is ten keys and SHAPE's allowlist is not touched."*
Seven more makes seventeen, SHAPE goes red, and loosening SHAPE to fit is
refused by `CLAUDE.md` §2.

**The rule: ONE key.** `meta.party = {id, hunt, dmg_bp, share_bp, floor,
fellow_bp, roll}` widens the allowlist by exactly one, with a `--mutate` proof
that an eighteenth key still goes red.

And **state the level**, because this is S-10's bug from six days ago wearing a
different noun. `hr_apply` writes the row as `jsonb_build_object('delta',
v_meta) || coalesce(v_j->'meta','{}')`, so journal keys merge at the **TOP** of
`player_ledger.meta`. The read is `meta->'party'` — never `meta->'meta'->'party'`
(no such level; it evaluates to NULL and a `where` on it returns no rows at all)
and never `meta->'delta'->'party'` (that is the engine's delta summary).
`tests/world-tick-ledger-meta.mjs` must EXECUTE the party read against a real
`hr_apply` ledger row on the PGlite chain and pin both wrong spellings as
returning nothing, exactly as it now does for `meta ? 'att'`.

#### S-3 — a member's own `accrue` is a second settler for the party's window **[P0 — BLOCKS S2, S4]**

§18.2.3 invariant 6 states the collision as a feature:

> "**The character stays the STATE unit; the party is only the ROSTER unit.**
> Every member's `player_state.active_kind/active_id/active_since/accrued_to`
> move exactly as they do solo…"

`INTENT_REGISTRY` (`supabase/functions/hr-accrue/intents.js:383`) makes that
concrete: `accrue` prices `[accrued_to, now]` for whatever the character is
doing — which, for a party member, is the party's combat — and every
`collectsFirst: true` verb (`set_activity`, eat, equip, the shop verbs) collects
first. A member with a tab open therefore pays themselves a **solo** simulation
of the party's monster stream: 100 % of it, not their ~25 % share, plus the
attended top-up §16.6 exists to fence, for a sliver the party has not settled,
at a cadence they choose.

§18.2.4 then makes one member's button press into everyone's loss:

> "A member whose own `player_state.accrued_to` is *ahead* of the party's (a
> client accrue landed mid-window) drags the party's `from` forward the same way
> `greatest(accrued_to, shadow_accrued_to)` does today — the party never replays
> over a paid minute."

The party does not replay, and the other three are not paid for the interval
either. A client-controlled quantity — the *timing* of an ordinary intent —
crosses into three other players' economies. That is `CLAUDE.md` §1's target
property failing by timing rather than by number, and it is not an edge case:
it is the normal client path, every time anybody in a party touches anything.

**The rule: for the duration of a live `party_hunt`, the party watermark IS the
member's watermark.** The member's own collect for the party's activity refuses
(`party_settle_required`, journalled), and every `collectsFirst` verb collects
against `party_hunt.accrued_to` as a hard floor it may never advance past.
§18.2.4's "drags forward" sentence must be **deleted, not softened** — there is
no correct way for one member to move a shared window's left edge.

#### S-4 — §16.6's attended fence has no party form, and §18 does not mention it **[P0 — BLOCKS S5; an M4 co-blocker §18 does not name]**

§16.6 is not cited once in §18. It rules: *"The combat channel hands the engine
`attended: null`, always, and `settleCombatSession` THROWS if a caller supplies
one"*, and it names its own ARM blocker — before `shadow = false` for combat,
*"the roster excludes a character with kill-credit rows newer than
`accrued_to − ATTENDED_EDGE_SLACK_MS`"*.

That exclusion is **per character**. §18 makes the roster unit the **party**. So
the party form of it is: exclude the whole party whenever *any* member has fresh
kill credit — one member playing attended stalls four players' settles for as
long as they keep playing, which is the exact inverse of §18.1's "both tabs
closed" promise and is a silent-loss shape rather than a refusal anybody sees.

Three honest answers exist; §18 owes one:

1. **Refuse the credit, not the party** — attended kill credit is not accepted
   for a character in a live party hunt. The attended client renders; the party
   pays. Cleanest, and it composes with S-3's fence (same predicate, same place).
2. **Exclude the party, and journal why** — with a distinct `hr_tick_cron_log`
   outcome so an attended-stalled party is visible in the 8e histogram rather
   than inferred from a gap.
3. Price attended per member inside the party settle. **Vetoed** on §16.6's own
   proof: *"Decompose a span into sixty windows and hand each the same claim and
   it is paid sixty times; split the claim and the arithmetic is undefined."*

I will accept (1) or (2). (1) is my recommendation.

#### S-5 — the 50 %-of-equal floor is a directed transfer; T-2 and T-4 are overstated **[P1 — BLOCKS S3]**

§18.4 T-4: *"The most a non-fighting account can receive is its raw share (≈0)."*
True — and not the threat. The threat is the *barely*-fighting account.

§18.1's own arithmetic: in a four-party a member holding ≥ 6.25 % of the
window's damage is paid `max(raw_share, 12.5 %)`, funded by scaling the
above-floor members down. At the threshold that is a **2× subsidy**, and the
subsidy is paid in gold and loot value, not only XP. Three alts each clearing
6.25 % — which a character within the ten-level spread clears with a starter
weapon against a monster the main is killing anyway — collect 37.5 % of the
party's gold for ~19 % of its damage. In a two-party the shape is the same at
25 % against a 12.5 % threshold. §18.1's defence sentence, *"an account that did
not fight cannot be paid"*, is true of the absent member and silent about the
subsidised one, and T-2's *"leeching pays nothing"* is true only below the
threshold, which is the one place nobody will sit.

This is T-4 — a party as a gold pipe to a fresh account for sale — and it
survives §18's stated defences.

**Ruling: the floor is XP-only.** Gold and the item-assignment lottery weights
follow raw damage share exactly, no floor, no threshold; T-4 then holds
literally rather than approximately, and the parked member's ≈0 is genuinely
≈0 in every tradeable quantity. The tank §18 wants to protect is a *progression*
fairness problem, which an XP floor solves. If gold fairness for tanks is wanted
later it returns as an **effective-contribution** metric the engine already
knows — damage dealt + damage mitigated + healing done — not as a flat floor,
and it returns with its own GO.

The rest of the split rule I accept as written and it is good work: basis
points, renormalisation to exactly 10,000 bp, one roll per kill assigned by a
share-weighted window-seeded lottery, one rule for all three quantities. See
S-6 for the remainder recipient.

#### S-6 — a membership change is a re-roll lever, and `party_leave` is unclamped by design **[P1 — BLOCKS S4]**

T-3's fix is right and I accept it: settle the open window first, in the same
transaction, pay the member being removed, then write `left_at`. Its side effect
is not stated. **Every join, leave and kick forces a settle boundary at an
instant a player chooses**, and §18.1 seeds the drop lottery "from the window
seed" (§16.3: the seed label is the `hr_state_of` JSONB rendering). Cutting a
window short re-simulates its kills and re-assigns its drops.

`party_kick` is clamped at 20/party/day. `party_leave` is *"never clamped: a
player may always leave"*, and leave → re-invite → accept is the same lever with
20/day of headroom per member — roughly **80 chosen re-rolls a day per party**.
The integer remainder rule compounds it: *"the integer remainder goes to the
largest share"* hands every one of those boundaries' remainders to the same
member, who is the one choosing the boundaries.

**The numbers §18 does not give, and they are the finding:**

- **Forced settle boundaries from membership changes: ≤ 8 per party per UTC
  day**, journalled, refusal `party_settle_churn`. Past 8, a leave is still
  honoured **immediately for membership** — nobody is ever held in a party —
  but it is *paid* at the next natural flush boundary. The right to leave is
  preserved exactly; the lever is not.
- **The remainder goes to the LOWEST `(user_id, slot)`** among the tied-largest
  shares, not to the largest share. Nobody can position themselves to collect
  it, and it stays deterministic and replayable.

#### S-7 — `party_member`'s SELECT policy recurses, and the panel's read surface is undesigned **[P1 — BLOCKS S1]**

§18.2.2 gives `party_member` a SELECT policy of *"`auth.uid() = user_id` **or**
live co-member (same predicate)"*, where that predicate selects from
`party_member`. A policy on T whose `USING` clause reads T recurses. The repo
already knows the fix and §18 already cites it: `hr_clan_may_admit` is
`SECURITY DEFINER` for this reason. Use `hr_party_of(auth.uid(), slot)`, which
S1 builds anyway.

The larger half: §18.1's panel renders each member's **name, combat level and
HP bar**, and the Fellowship block renders each member's **xp and gold**. None
of the four tables in §18.2.1 carries any of that, and §18.2.2 does not say
where it comes from — so the read surface gets invented at code time, by
someone reaching for a cross-user read of `player_state` or `hr_state_of`. It
must be designed here:

> **`hr_party_view(p_party)`, `SECURITY DEFINER`, refusing any caller who is not
> a live member, returning a FROZEN column set**: display name, combat level,
> `hp`/`hp_max`, `recovering_until`, and the last settled window's
> `share_bp`/`xp`/`gold`. Never inventory, never gold balance, never the ledger,
> never activity detail, never another member's envelope.

A column added to that list is a code change with a review, which is the point.
It is also the one new cross-user read M8 introduces, so it is where the review
attention belongs.

#### S-8 — invariant 7 is a denormalised column with no maintainer **[P1 — BLOCKS S2]**

§18.2.3.7: *"`hr_tick_ownership.party_id is not null` ⇒ the per-character roster
**refuses to serve that character**."* Two gaps, and they open at both ends.

1. **Nothing says who writes that column, or in which transaction.** If the
   `party_hunt` insert and the `hr_tick_ownership.party_id` update are not the
   same statement, a character is servable by both rosters in between. The
   failure is not symmetric: the solo settle pays 100 % of a party's stream to
   one member, and the party settle then fails its CAS and the party wedges.
2. **A character with no `hr_tick_ownership` row at all** — never served, or
   pruned — has no `party_id` to be non-null, so the exclusion never fires and
   the double-serve is permanent rather than transient.

**The exclusion must be POSITIVE and derived**: the per-character roster
excludes a character that is a live member of a party with a live `party_hunt`,
by join. A standing guard asserts the two rosters' outputs are **disjoint on
every fire**, and it is cheap to mutation-prove — plant one character in both
and it goes red. The denormalised column may stay as an index helper; it may not
be the authority. A second source of truth for "what is this character doing" is
precisely what §18's own one-sentence design forbids.

#### S-9 — atomicity is specified for the CAS and left open for `hr_apply` **[P1 — BLOCKS S2]**

§18.2.5 step 5 is right, and its argument is the best sentence in the document:
*"a partial settle pays three members a split computed from four contributors,
which is a mint."* Step 7 then calls `hr_apply` four times and says nothing
about one of them refusing.

`hr_apply` refuses for reasons that are ordinary play, not corruption:
`too_many_progress_ops` (§16.5 measured **69 ops against a cap of 64** on an
ordinary fight, before any party fan-out), a bag that cannot take the item,
`c_max_progress_add`. Under all-or-nothing, one member's full bag stops four
players' payouts; the unsettled window then grows against the 24 h cap until a
night is silently eaten — the `bag_full` silent-loss shape §18.1 itself cites as
the thing party wipe exists to prevent.

The rule must be stated, and it must not be "pay the others" (that is step 5's
mint). **A member-level `hr_apply` refusal rolls back the whole transaction and
ends the party hunt** with `stopped_by = 'member_unpayable:<user>'`; the retry
settles the same window with the party already ended, so the refusing member's
overflow is priced once under the pre-existing solo rules and the other three
are paid. Whatever shape is chosen, S2's guard plants each of the three
refusals above and asserts the window is **fully paid or fully unpaid, never
partial**, and that the party does not wedge.

#### S-10 — the party settle does not charge Vigour, and it is the highest-throughput hunting surface in the game **[P1 — BLOCKS S2]**

§18 names Vigour twice, both in passing (*"until a stop rule fires or Vigour and
supplies run down"*; *"the Analyzer, `recovering`, Vigour … keep working"*). It
never says the party settle charges it. Vigour is *"a daily budget of PAID
hunting minutes"*, *"charged from the same `ms` the payout is computed from, in
the same transaction"* (`HUNTS_AND_ANALYZER.md` §4, §5) — it is the scarcity the
refill gold sink is priced against. **A settle path that pays combat and does
not file `ev:vigour_min` is a clean bypass of the daily limiter for every party
in the game**, and it arrives at 4× the throughput of the path it bypasses.

Three sub-rules are owed, because each has a different answer:

- **(a) Every live member is charged from the same window ms**, using the
  quotient/remainder pair (`ev:vigour_min` + `ev:vigour_rem_ms`) that
  `SEC_HUNTS_M6_2026-09-22.md` S-1 landed. A per-member per-window floor is that
  P0 back at four times the rate: *"windows of just under 2U charge U"*.
- **(b) A knocked-out member** deals no damage and is paid ≈0. Charging them a
  full window of Vigour is payment for nothing. State it: the charge is priced
  on the member's own **fighting** ms, not the window's wall clock — which also
  makes (a) fall out for free.
- **(c) A Vigour-dry member** takes `VIGOUR_DRY_MULT = 0.25` on their own
  payout, so the sum over members is strictly **less** than the party total.
  **(P-c) conservation as §18 writes it — "a strict equality with [the
  fellowship bonus] subtracted" — is therefore false on any window containing a
  dry member.** (P-c) must be an inequality in the safe direction (paid ≤
  produced + fellowship) **plus** an exact equality on the pre-multiplier
  shares, or the guard will be red on ordinary play and get relaxed, which is
  how a guard stops being one.

#### S-11 — `party_accept` must collect first, or be refused during a live hunt **[P2 — BLOCKS S1]**

§18.3 gives `party_accept` `collectsFirst: false`. A character accepting into a
party whose hunt is already live is then inside the next party window while
their own `accrued_to` sits wherever they left it — days back, for a returning
player. Step 5's CAS is on `greatest(accrued_to, shadow_accrued_to)` against
`p_window_from`, so either the settle refuses forever (the party wedges on its
new member) or it stamps `accrued_to = p_window_to` and **confiscates that
player's entire away window** — `guardStampKeys`'s `delta_would_stamp` failure
on a path `guardStampKeys` does not run.

**The narrow rule is the right one: `party_accept` is refused with
`party_hunt_running` while the party has a live hunt.** It closes S-12 for free.
If joining mid-hunt is wanted later it returns as `collectsFirst: true` plus a
per-member `joined_at` floor on the window — a redesign of §18.2.4's "one
geometry, computed once", not a flag flip.

#### S-12 — the level spread is checked at start only, and members can be added after the start **[P2 — BLOCKS S4]**

§18.1: *"checked **at hunt start only**, never continuously"*, because *"a member
who levels past the spread mid-hunt did it by fighting, and stopping the party
for that is the game taking back what it paid."* That reasoning is right and I
accept it — **for levelling**. It does not cover **joining**: invariant 5
explicitly contemplates a membership change during a live hunt, so a party can
start inside the spread and then accept a level-1 alt into a level-30 hunt with
no check at all, which is T-2 through the side door.

Re-check the spread **on accept**. That is not "continuous" and it takes back
nothing already paid. Under S-11 it costs nothing; it must still be written
down, because S-11 may be relaxed later and this rule must not relax with it.

#### S-13 — invite targeting is an enumeration oracle with no receiver clamp **[P2 — BLOCKS S1]**

§18.3 clamps `party_invite` at 20/character/day, with a per-call clamp of
*"target must exist, not be in a party, not be you"* — three distinguishable
refusals, i.e. an oracle answering *"does this display name exist"* and *"is
this player currently partied"* twenty times a day per account. The name → user
resolution surface itself is designed nowhere in §18. And the clamp is on the
**sender**: twenty accounts hand one player four hundred invite cards a day.

- Resolve the name **inside** the RPC and return **one** refusal,
  `invite_target_unavailable`, for all three cases; the real reason is journalled
  server-side where the player cannot read it.
- Add the receiver clamp §18 omits: **at most 5 live invites and 20 received per
  character per UTC day**, refusal `invite_inbox_full`, with no distinction
  visible to the sender.

#### S-14 — the grant-hygiene allowlist entry, in the same lane-C batch **[P2 — BLOCKS S1, S2]**

§18.2.2 says *"Grants mirror the fence exactly (§15c)"* and stops. `hr_engine`'s
EXECUTE allowlist is an argued list **inside `hr_assert_grant_hygiene`**, and a
grant outside it is a finding that RAISES nightly. We have shipped that mistake
twice; `2026-09-22-engine-allowlist-hunt-reads.sql` exists only to clean it up,
and says so: *"Review did not catch it; the suite did."*

Every function §18 adds needs its allowlist entry with its claim argued, in the
**same** lane-C batch, **after** the file that grants it: `hr_party_roster` (to
`hr_tick`), `hr_party_tick_settle` (to `hr_engine`), `hr_party_role`,
`hr_party_of`, and `hr_party_view` from S-7. §18.5's Guards column must name it
per slice, or it gets remembered on the morning the detector is red — and a
detector expected to be red hides the next real regression, which is the whole
cost.

#### S-15 — the party frame does not fit M5's topic policy, and a leaver keeps receiving it **[P2 — BLOCKS S5]**

§18.5 S5 and §18.6 both assume *"pushed party frames on the party topic (M5
transport)"*. M5's `realtime.messages` policy authorizes a join by comparing the
topic's own user segment to the JWT — `topic = 'hr:' || auth.uid()::text || ':'
|| <slot>`, deliberately an equality and **not** a `like`, because a
topic-shaped predicate *"would let any authenticated player join any other
player's topic and stream their entire state"*
(`SEC_PUSH_CHANNEL_M5_2026-09-23.md` S1). A party topic has no user segment, so
that policy cannot authorize it, and a new predicate resolving membership inside
an RLS policy is evaluated per subscriber per change — the 2.5M-reads/s line
that document already flags at 5,000 characters.

Worse: Realtime authorizes at **join**, not per delivery. A kicked or departed
member keeps receiving the party's frames on an already-open channel until they
reconnect — a disclosure that outlives the membership that justified it.

Both problems vanish with the cheaper design: **emit N per-member frames on each
member's own, already-proven `hr:<user_id>:<slot>` topic**, carrying the S-7
projection and nothing else. §18.6 already budgets four deliveries per frame, so
this costs nothing it has not priced, and it adds no topic shape and no policy.

#### S-16 — §18 refuses a column on a fence that is not one **[P2]**

§18.2.1 refuses to touch `hr_tick_shadow` because it *"gains **no column and is
never rewritten**, which is the whole of §16's ACCESS EXCLUSIVE drain avoided"*
— and §18.2.4, three paragraphs later, correctly says `hr_tick_ownership` gains
*"one nullable `party_id uuid` column (a catalog-only `ALTER` — no `GENERATED …
STORED`, so no table rewrite…)"*.

They are the same `ALTER`. §16's drain argument was about a **stored generated**
column, which rewrites; a plain nullable add does not, by §18's own sentence.
So the stated reason for cramming the split into `delta` is not true, and S-1
needs that column. Correct the claim rather than keep a fence that is not one:
an argument wrong in the direction of *"we cannot"* costs as much as one wrong
in the direction of *"we can"*, and this one bought S-1.

#### Recorded, not owed

- **I-1** — the fifteen refusal codes of §18.3 need their `STATELESS_REFUSALS`
  decision made per code (`intents.js:895`). `party_member_recovering` carries
  `until` + `remaining_ms` and is **stateful** — it must not be listed. The
  shape refusals answered before any database work (`bad_party`, and the
  registry ones) belong on the list, or a malformed client spends the rate
  budget the check exists to protect.
- **I-2** — §18.3's journalling claim depends on `c-hr-rejections-journal`'s
  verb map, which `CLAUDE.md` §3.4 records as *staged 2026-09-11, Security
  review pending*. Without it a party refusal burst reads as an aggregate with
  no verb, i.e. invisible in `vitals.mjs --refusals` — which is the thing §18
  says it is buying. Not M8's to fix; M8's to depend on knowingly.
- **I-3** — capacity: a party takes **one** lease but **four** characters of
  settle work, so `batch_limit` stops meaning what it means today (R-3's slot
  accounting). State the party cohort's limit in characters, not parties, before
  S2's dry run, or the first cohort is 4× the intended size.

### §18-SEC.2 The shadow / parity read at party grain — what 8a–8e become

§18.2.6 proposes one grouped query and three properties. The three properties
(P-a, P-b, P-c) are good and I accept them with S-10(c)'s correction to P-c.
They are not a substitute for 8a–8e, which answer a different question — *is the
instrument measuring anything at all* — and M3 learned that the expensive way.
The party forms, read in this order:

- **(8a) Is it running.** `count(*)` of `hr_tick_shadow` rows carrying a party
  id in the last hour, **and** the count of distinct party ids. Zero rows is the
  S-8 shape and everything below measures nothing — **STOP**. Expect
  `members × 3600 / flush_seconds` rows per party. The denominator is **per
  admissible interval**, not wall clock, per RE-VERIFY 2's correction.
- **(8b) Do the windows tile — twice.** Per member as today (`breaks = 0`), and
  **per party**: `lag(window_to) over (partition by party_id order by
  window_from)`. A party whose members tile individually but not collectively is
  §18.2.4's "drags forward" bug (S-3) showing up as a gap in three members and
  not in the fourth. This read is the S-3 detector and it must exist even after
  S-3 is fixed.
- **(8b-ii) NEW, party-only. Every window has the same member set it was priced
  on.** `count(distinct user_id)` per `(party_id, window_from, window_to)` equals
  the party's live member count at `window_to`. Anything else is S-9's partial
  settle, and it is the one defect that cannot be recovered after the fact.
- **(8c) Per-field parity, span-fenced, per member** — unchanged, with the
  attended partition on `meta ? 'att'` at the **top** level. Under S-4(1) the
  attended bucket must be **empty** for party members, and that emptiness is
  itself the assertion that S-4's fence is live.
- **(8c-ii) The split, which is the only genuinely new read.** Per window:
  `sum(share_bp) = 10000` **exactly** (P-b, zero tolerance — this is integer
  arithmetic, not a simulation, and a band would hide a rounding leak); paid
  gold/xp/items summed over members **≤** the party simulation's own total, with
  equality once the fellowship line and any `VIGOUR_DRY_MULT` reduction are
  accounted (P-c per S-10(c)); and `count(*) filter (where floor_applied)` — if
  the floor is applied on more than a small minority of member-windows it is not
  a floor, it is the split, and S-5's ruling needs revisiting before arming.
- **(8d) The refusal histogram, and the proof that shadow paid nothing.** Add
  `unknown_delta_key` to what is read (S-1 makes it the expected failure if S-1
  is not fixed), plus `party_settle_required`, `party_window_already_settled`
  and `member_unpayable`. **Zero** tick-sourced `player_ledger` rows for the
  party cohort, as today.
- **(8e) The per-party outcome histogram**, on `hr_tick_cron_log`, with S-4(2)'s
  attended-stall outcome as its own spelling, distinct from `channel_moved` and
  from `channel_not_driven`. Three causes that read as one gap is how M3's S-8
  hid for a week.

**Pre-arm bar for S5: 48 h, all of 8a–8e green, plus (P-a) degenerate parity
byte-identical, on at least one real four-member party and one one-member party.**
A one-member party is not a formality — it is the only configuration where the
party path and the solo path can be compared *byte for byte*, and S-1 means it
does not currently hold.

### §18-SEC.3 The slice order, and what each §4 self-check must EXECUTE

§18.5's ordering constraints 1–4 are correct and I accept them, including the
ruling that S5 cannot precede M4 (*"arming parties first would arm combat
through a side door"*) and cannot precede M5 + §7a. Two corrections and one
omission:

**Correction 1 — S2 and S3 are not "before ARMED" in the sense §18 means.**
They are before *paying*, which is different. S2 builds the settle whose armed
branch reaches `hr_apply`, and S3 builds the arithmetic that decides who is
paid what. Both are money-surface reviews under `CLAUDE.md` §2 even though
neither moves a coin on the day it applies — the money moves later, on an
operator `update`, with no further code review in between. §18.5's note that
"S1 touches no money surface and Security's review there is structural" is
right; the same sentence must not be read across to S2 and S3.

**Correction 2 — S4 cannot land before S3.** §18.5 lists the hunt intents (S4)
as landing after the split (S3), which is right, but its per-slice guard column
lets S4's `member_uncollectable` and kick-before-split assertions stand alone.
T-3's kick **calls the settle**, which calls the split; S4's tests are asserting
against S3's arithmetic and must be ordered as such, not merely numbered.

**Omission — not one slice carries a §4 self-check block.** `CLAUDE.md` §4:
*"Server-side changes carry a §4 self-check block in the migration (properties
asserted by executing SQL, not by markers)."* §18.5's Guards column names only
external node guards. What each migration must EXECUTE, at apply time, refusing
to install otherwise:

- **S1** — `set role authenticated` and attempt an INSERT, UPDATE and DELETE
  against each of `party`, `party_member`, `party_invite`; assert each RAISES
  (this is the clan lesson §18.2.2 quotes, executed rather than asserted).
  Attempt the duplicate inserts that `party_member_one_live` and
  `party_member_one_char_per_user` exist to refuse, and assert the unique
  violation — an index that has never been red is not an invariant. Assert
  `has_function_privilege('authenticated', 'hr_party_role(uuid,uuid,integer)',
  'EXECUTE')` is **false** for each of `anon`, `authenticated`, `service_role`.
  Assert `hr_party_view` refuses a non-member (S-7). Assert
  `hr_assert_grant_hygiene(true)` does not raise (S-14).
- **S2** — assert `hr_party_tick_settle` is executable by `hr_engine` and by
  nothing else, and `hr_party_roster` by `hr_tick` and nothing else, by
  `has_function_privilege` for all five roles. Execute the identity refusal:
  call the settle as each forbidden role and assert the refusal string. Execute
  a **partial-settle mutant** — a member set the CAS must reject — and assert
  zero rows written anywhere (S-9). Assert the two rosters are disjoint for a
  planted party member (S-8). Assert `hr_tick_shadow.channel`'s CHECK is
  unchanged.
- **S3** — the split is a pure function, so its self-check is in
  `tests/party-split.mjs --mutate` and §18.5 has it right; the migration half
  has no body. Add one executing assertion where it does touch SQL: shares
  summing to 10,000 bp on a planted four-member window read back out of
  `hr_tick_shadow`.
- **S4** — execute each refusal path and assert the code: spread, recovering,
  `member_uncollectable`, `party_hunt_running` on accept (S-11), the spread
  re-check on accept (S-12), and kick-before-split leaving `left_at` unwritten
  when the settle cannot run.
- **S5** — no migration; the gate is this GO plus §18.5's stated pre-arm bar,
  with §18-SEC.2's additions.

**Which slices may land before M4 arms combat:** S1 unconditionally (it has no
settle and no `hr_apply` reachability); S2, S3 and S4 in shadow, once S-1
through S-4 are answered — they are genuinely parallel to M4's arming work, and
§18.5's argument for that is good. **S5 needs its own GO** and so do S2 and S3,
per Correction 1.

### §18-SEC.4 What §18 gets right, recorded because it will be built on

Stated plainly so the next reviewer does not re-litigate it: the roster-unit
decision (§18.2.4), the one-call all-or-nothing settle with its `(user_id,
slot)` lock ordering and its explicit cost (§18.2.5 steps 3–5, 7), the refusal
of a `party_ledger` (§18.2.1), no client field naming a share, weight, damage or
recipient (T-5), one roll per **kill** rather than per member (T-1), the
participation threshold on the fellowship bonus (T-8), shadow chaining on a
separate watermark (§18.2.4), the per-character Recovery Rule left untouched
with two party rules layered on top (§18.1), and `collectsFirst: true` derived
from "does the delta stamp" rather than preferred (§18.3). Those are the load-bearing
ones and they are sound.
