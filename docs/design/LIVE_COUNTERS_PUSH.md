# Live counters — the push transport DECISION (M5)

Written 2026-09-22 by the Backend Architect (systems-engineer hat for the client
half), for milestone **M5 (2026-10-09) — "pushed live counters, feels like
Huntera"**: the server runs the world, and the client becomes a closable window
that RECEIVES frames instead of polling for them.

Authority order is unchanged: `CLAUDE.md` §1 wins over anything here, then
`docs/planning/WORLD_TICK_DESIGN.md` §7, which this document implements rather
than re-derives. Nothing below proposes that a client author a value, and
nothing below makes the push channel an authority: **the socket carries a copy
of what `hr_apply` already wrote, and if it never arrives the player loses
nothing but latency.**

**Status: DECISION + client gate. The server half of the chosen option is
STAGED, NOT APPLIED. No spend, no new host, no signup, nothing purchased**
(budget freeze 2026-08-17). Supabase Realtime is inside the plan the project
already pays for; a separate socket process is not allowed and none is proposed.

---

## 1. The decision, in five lines

1. **Option (b), BROADCAST FROM THE DATABASE, wins** — `realtime.send()` from an
   `AFTER UPDATE` trigger on `player_state`, carrying the frame's payload with it.
2. **Option (a) is refused on a number this repo already measured**: Postgres
   Changes authorizes every change once *per connected subscriber*, so the work
   is `writes/s × subscribers` — **2.5M authorization reads/s at 5,000
   concurrent**, on Realtime's single change-processing thread, against a WAL
   poller that is **already 61% of all measured exec time in this database** for
   two published tables holding zero rows.
3. **Option (a) also pays twice on the wire**: a change event tells the client
   only that *something* moved, so every frame costs a second `hr_state_of`
   round trip — **+3.23 ms of database CPU per frame (161% of one core at 5,000
   concurrent)** and 2.6× the egress of carrying the payload in the message.
4. **Option (b) costs one extra `realtime.messages` row per frame and nothing
   else**: it is routed by topic to exactly one subscriber, it needs no table in
   `supabase_realtime`, and it therefore does not reverse
   `2026-09-06-realtime-publication-trim.sql` — which is the only lever this
   project has on the poller.
5. **The two options cost the same in Realtime MESSAGES** (one delivered message
   per frame either way), so the message bill is a property of the FRAME RATE,
   not of the transport — and at a 10 s cadence that bill is real (§3.4). The
   transport choice buys database CPU and egress; the cadence buys the invoice.

---

## 2. The two options, stated exactly

### (a) `postgres_changes` on the player's own `player_state` row

```js
supabase.channel('ps')
  .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'player_state',
        filter: `user_id=eq.${uid}` },
      () => refetch())        // ← and then an hr_state_of round trip
  .subscribe()
```

Requires `alter publication supabase_realtime add table public.player_state`.
RLS on `player_state` is what makes the row private. The event body is the
changed `player_state` row — **not the envelope**: `skills`, `inventory`, `bank`,
`equipment`, `workers`, `farm` and `progress` live in other tables, so the client
learns "your version moved" and must re-read to learn *what*.

### (b) Broadcast from the database (CHOSEN)

```sql
-- AFTER UPDATE ON player_state, WHEN (new.version IS DISTINCT FROM old.version)
perform realtime.send(
  jsonb_build_object('t','delta','frame',new.version,'patch', <changed keys>),
  'frame', 'hr:' || new.user_id || ':' || new.slot, true /* private */);
```

`realtime.send` inserts one row into `realtime.messages`; the Realtime server
routes it **by topic** to the subscribers of that one topic. Authorization is an
RLS policy on `realtime.messages`, evaluated per *topic join*, not per change per
subscriber. The payload carries the frame, so there is no second read.

**Why a TRIGGER on `player_state` and not a call inside `hr_tick_settle`.** The
brief offered both. The trigger is strictly better for three reasons:

- **It catches BOTH producers.** `WORLD_TICK_DESIGN.md` §7.1 fixes `frame =
  player_state.version` precisely because the edge and the tick both cause
  frames. `version` is bumped by `hr_apply` under its per-character row lock
  whichever caller asked, so a trigger on the column that IS the frame number is
  the one emitter that cannot miss a producer or invent a number.
- **It touches no money function.** No `create or replace` on `hr_apply` or
  `hr_tick_settle`, so no live-hash move on the functions that write player
  value, and no second adversarial review of the payment path.
- **A shadow apply emits NOTHING by construction, not by a flag.**
  `2026-09-21-world-tick-settle-fence.sql` §3(8) writes no `player_state` row in
  shadow mode — it journals into `hr_tick_shadow` and returns. A trigger on
  `player_state` therefore cannot fire on a shadow settle. That is a property of
  where the trigger is hung, and it survives somebody forgetting a flag.

---

## 3. Cost and scale

### 3.0 What is measured, what is fetched, what is recalled

House rule, per `WORLD_TICK_DESIGN.md` §15a's honesty note: every number below
is labelled.

| Tag | Meaning |
|---|---|
| **M** | measured on this project's production database, cited to the file that measured it |
| **F** | fetched 2026-09-22 from Supabase's own docs source (`raw.githubusercontent.com/supabase/supabase`). ⚠ `supabase.com` itself is **blocked by this environment's egress proxy**, so the *pricing* page could not be read — only the docs mirror |
| **D** | derived here from M/F by arithmetic that is shown |
| **R** | ⚠ **RECALLED, NOT VERIFIED.** Confirm on the vendor's own page before any approval |

### 3.1 The plan line assumed

**Pro** — `get_organization` returned `plan: "pro"`
(`docs/design/HANDOFF-server-authority.md`, CORRECTION 1) **[M]**. The spend cap
is assumed **ON**, which `docs/planning/PRIORITY_BOARD.md` records as a **hard
500 concurrent connections** **[M, prior lane]**.

Realtime limits, per plan **[F]**:

| Metric | Free | **Pro (cap ON)** | Pro (cap OFF) / Team |
|---|---|---|---|
| Concurrent connections | 200 | **500** | 10,000 |
| Messages per second | 100 | **500** | 2,500 |
| Channel joins per second | 100 | **500** | 2,500 |
| Channels per connection | 100 | 100 | 100 |
| Broadcast payload size | 256 KB | **3,000 KB** | 3,000 KB |

Monthly allowances **[R]**: Pro includes ~5M Realtime messages/month (overage
~$2.50 per additional million) and ~250 GB egress (overage ~$0.09/GB); additional
peak connections ~$10 per 1,000. `PRIORITY_BOARD.md`'s Living-Town costing is
already priced on these same figures, so the house has been using them — that is
consistency, not verification.

### 3.2 The frame rate

One frame per **accepted** settle. `WORLD_TICK_DESIGN.md` §9 sets push cadence =
flush cadence = **10 s** for the beta, so a continuously-active character
produces **8,640 frames/day**. `hr_tick_config.flush_seconds` ships at **90**,
which is 960/day — a 9× difference that the tables below hold apart, because
picking one silently is how a cadence decision becomes an invoice.

`WORLD_TICK_DESIGN.md` §15a measured today's real duty cycle at **~24 accrue
rows/char/day**. That is the third column, and it is what the beta actually costs.

### 3.3 Messages and connections

| Concurrent characters | msg/s @10 s | msg/day @10 s | msg/day @90 s | msg/day @ measured duty |
|---|---|---|---|---|
| 50 | **5** | 432,000 | 48,000 | 1,200 |
| 500 | **50** | 4,320,000 | 480,000 | 12,000 |
| 5,000 | **500** | 43,200,000 | 4,800,000 | 120,000 |

**[D]** from §3.2. Identical for (a) and (b) — one delivered message per frame
either way.

⚠ **The binding Realtime line is CONNECTIONS, not messages, and it binds at 500.**
One signed-in client holds one connection under either option, so **500 concurrent
characters is the Pro-with-spend-cap wall** and it is not a transport question.
Above it the spend cap must come off (~$10/1,000 peak connections **[R]**), which
is a budget decision for Tyler and is named here, not assumed.

At **5,000 concurrent on a 10 s cadence the message rate is 500/s — exactly the
capped Pro line** and 20% of the uncapped one. The 90 s flush the config actually
ships lands at 56/s, comfortably inside both.

### 3.4 The message bill, which is the cadence's bill and not the transport's

Against ~5M included messages/month **[R]**, 30-day month **[D]**:

| Concurrent | @10 s | @90 s | @ measured duty |
|---|---|---|---|
| 50 | 13.0M → **~$20/mo** | 1.4M → **$0** | 36k → **$0** |
| 500 | 129.6M → **~$311/mo** | 14.4M → **~$24/mo** | 360k → **$0** |
| 5,000 | 1.296B → **~$3,230/mo** | 144M → **~$348/mo** | 3.6M → **$0** |

**This is the most important row in the document.** The beta, at today's duty
cycle, is free at every scale in the table. A 10 s cadence is **not free at 50
concurrent characters**, and "zero spend" therefore constrains the *cadence*, not
the transport. `WORLD_TICK_DESIGN.md` §14.4 ("push cadence vs flush cadence") is
now a cost question with a dollar figure attached, and §9's "set both to 10 s for
the beta and revisit under load" should be read as **set both to 90 s and revisit
with an approved spend**, which is what `hr_tick_config` already ships.

### 3.5 Bytes

**Frame payload, shape-derived [D]** — and this is a **correction to
`WORLD_TICK_DESIGN.md` §12/§15a, which budget a frame at 400 B**. Under §7.2 a
frame states *whole top-level envelope keys*, and the envelope's top-level keys
are `ok, version, now, buffs, place, dungeon_cooldowns, state, skills, inventory,
bank, equipment, enchant, workers, farm, progress, progress_truncated`
(`2026-09-14-hr-state-of-restatement.sql`) — `state` alone carries ~40 fields.
For a mid-game character:

| Object | Derived size |
|---|---|
| full `hr_state_of` envelope | **~4.5 kB** |
| a gather-tick delta (`state` + `skills` + `inventory`, whole keys) | **~2.2 kB** |
| on the wire with frame/topic/JSON overhead | **~2.5 kB** |

400 B is out by roughly **5×**. Nothing downstream breaks — 2.5 kB is 0.08% of
the 3,000 kB broadcast payload limit **[F]** — but the egress lines below are
what that error was hiding, and the program's budgeting should use 2.5 kB.

| Concurrent | **(b) egress/day @10 s** | **(a) egress/day @10 s** | (b) @90 s |
|---|---|---|---|
| 50 | 1.08 GB | 2.76 GB | 0.12 GB |
| 500 | 10.8 GB | 27.6 GB | 1.2 GB |
| 5,000 | 108 GB | 276 GB | 12 GB |

**[D]**: (b) = 2.5 kB/frame. (a) = the changed `player_state` row (~1.2 kB, no
inventory/skills/bank — those are other tables) **plus** a full `hr_state_of`
re-read (~4.5 kB) **plus** HTTPS request/response overhead (~0.7 kB) = 6.4 kB,
i.e. **2.6× (b)**. Against ~250 GB/month included **[R]**, (b) at 500 concurrent
and 10 s is 324 GB/month (~$7 overage); (a) at the same point is 829 GB/month.

### 3.6 Database cost — where the two options actually diverge

| Line | (a) `postgres_changes` | **(b) broadcast** |
|---|---|---|
| Authorization work | **one read per change PER SUBSCRIBER** on the published table **[F]**, on Realtime's **single** change-processing thread **[F]** → **250 / 25,000 / 2,500,000 reads per second** at 50 / 500 / 5,000 **[D]** | one RLS evaluation per **topic join**, not per change. A reconnect, not a frame. |
| Extra `hr_state_of` calls | one per frame: 5 / 50 / 500 per second → at 3.23 ms **[M**, `restore-runbook` §14**]** = **1.6% / 16.2% / 161.5% of one core** **[D]**, before `hr_rate_gate`'s 271 ms mean and its per-character row lock **[M]** | **none.** The payload is the answer. |
| Publication | requires `player_state` — the hottest-written table in the game — in `supabase_realtime`, **reversing `2026-09-06-realtime-publication-trim.sql`** and turning `tests/realtime-cost.mjs` red | **none.** `realtime.messages` is Realtime's own table; `supabase_realtime` stays `{chat_messages}`. |
| WAL | the `player_state` UPDATE is already written; publishing it adds per-write decode + per-subscriber RLS | one extra `realtime.messages` INSERT per frame (~1 kB WAL **[D]**), **paid twice** under `wal_level = logical` with 2 slots **[M]**. Partitioned daily, ~3-day retention, **not** subject to `hr_ledger_prune`'s 480,000 rows/day ceiling **[M]** |
| Poller | **[M, 2026-09-06]** the Realtime WAL poller is 2,706,517 calls / 15,669 s / mean 5.79 ms / **max 9,847 ms** over 20.25 days = **~61% of all measured exec time and ~36× the #2 statement — for two published tables holding zero rows.** Adding the game's hottest table to it is the decision this measurement exists to prevent. | unchanged |
| Vendor guidance **[F]** | "If you expect more than ~3,000 concurrent subscribers on the same changes, use Broadcast to stream database changes instead." | this is Broadcast. |

Supabase's own docs recommend against (a) at this shape, this repo has already
rejected `postgres_changes` fan-out once on the same grounds
(`PRIORITY_BOARD.md`, Living Town: "RLS re-evaluated per subscriber per change;
the WAL poller is already 61% of all measured exec time"), and
`PRIORITY_BOARD.md`'s architect recommendation already names
**Broadcast-from-Database, `realtime.send()` inside the same `SECURITY DEFINER`
transaction that writes the row**, as the intended push mechanism. This document
does not discover that; it confirms it with M5's own numbers and then builds it.

### 3.7 The honest limitations of this table

- **No load test exists.** Nothing here has been measured against a real Realtime
  tenant at any concurrency. The message and connection lines are quota
  arithmetic; the egress and payload lines are shape arithmetic.
- **The payload sizes are derived from the projection's shape, not measured on
  the wire.** They should be re-measured the first time a real frame is emitted,
  and §3.5 re-stated if they are wrong again.
- **The monthly allowance and overage figures are [R].** The *decision* does not
  rest on them — it rests on §3.6, which is [M] and [F].
- `realtime.messages` row cost is assumed to be `player_ledger`-shaped (407 B/row
  **[M]**) plus payload. That is an analogy, not a measurement.

---

## 4. The frame rule, verbatim

Quoted from `docs/planning/WORLD_TICK_DESIGN.md` §7.1, which is the authority;
this document restates it so the transport cannot drift from it.

> - `frame` is **per character**, not per socket and not global, and it is
>   allocated by the process that produced the frame. For tick frames that is the
>   shard; for intent-driven frames it is derived from `player_state.version`, so
>   the two producers cannot collide (see below).
> - **A client applies a frame only if `frame > lastAppliedFrame`.** Strictly
>   greater. Equal is a duplicate and is dropped; lower is a reorder and is
>   dropped. There is no merge, no "apply the newer fields", no per-key
>   comparison — the whole frame is applied or the whole frame is dropped.
> - A dropped frame is not a hole to be patched: a `delta` frame always states
>   whole top-level envelope keys, so the next frame that touches a key makes the
>   client whole again. A client that wants certainty sends `hello` again and gets
>   a full `envelope`.
> - **Collision between the two producers.** The tick and the edge both cause
>   frames. Rather than a second counter to keep in step, `frame` is
>   `player_state.version` — which `hr_apply` already bumps on every accepted
>   write, from either caller, under the per-character lock. It is already
>   monotonic per character and it is already the thing the client's stale check
>   would compare. The tick therefore does not allocate frame numbers at all; it
>   reports the version `hr_apply` returned. **A tick window that `hr_apply`
>   refuses produces no frame**, which is the correct behaviour and is free.

**The per-character `frame` = `player_state.version` rule, as this lane
implements it:** the emitter reads `new.version` off the row `hr_apply` just
wrote, inside the same transaction and under the same row lock, and puts that
integer in the message. It is never incremented, never defaulted, never
synthesised by the push layer, and never read from a request. A frame the
database did not stamp does not exist.

And the client half, which is **transport-independent and lands first** (commit 2
of this lane): the monotonic rule moves out of `src/net/gold.js` — where it
guarded one field — up into `isEnvelopeApplicable` in `src/net/accrue.js`, where
it guards the whole envelope. See §7.

---

## 5. Failure modes, and the rule that heals each one

A push transport's failure modes are not hypotheticals — they are the normal
operating condition of a mobile client on a train. Each one below is **self-
healing by a rule that already exists**, which is the actual argument for the
protocol in §7 of the parent document.

| Failure | What the client sees | The rule that heals it | Why it is safe |
|---|---|---|---|
| **Missed frame** (disconnected, message dropped, Realtime outage) | frames 10, 11, **—**, 13 | §7.2 **key-level replaces**: frame 13 states *whole* top-level keys, so every key frame 12 would have moved is restated by the next frame that touches it. And the poll is still there — `SETTLE_INTERVAL_MS` is untouched by this lane. | Broadcast is fire-and-forget: a disconnected client gets **no replay**, and it does not need one. A path-addressed JSON patch would need one, and that is exactly why §7.2 forbids patches. |
| **Reorder** (frames arrive 13, 12) | 12 after 13 | §7.1 **strictly greater**: 12 ≤ `lastAppliedFrame` = 13, so the whole frame is dropped. | The state at 13 is newer by definition — `version` is bumped under `hr_apply`'s per-character row lock, so frame order *is* write order. Applying 12 would be a **silent rewind**, and it is the bug the gate exists to make impossible. |
| **Duplicate** (the same frame twice) | 13, 13 | §7.1 **equal is dropped**. | Idempotent. Note this is a **tightening** of today's gold rule, which accepts equality (`if (env.version < lastVersion)`); §7 records why the tightening is correct and what it costs. |
| **Reconnect** (tab wake, network flap, token refresh) | an unknown gap | `hello` → a **full envelope** at the current version. In this codebase that is the existing `hr-accrue` / `hr_state_of` round trip, not a new message. `lastAppliedFrame` jumps to the envelope's version and every in-flight frame below it is dropped by the same rule. | The re-read is the reconciler and the push is the nudge — never the reverse. A Realtime outage degrades M5 to exactly today's behaviour, which is a working game. |
| **A frame arrives for the wrong character** (slot switch, account switch) | a version from another counter | `frame` is **per character**; the ledger is reset on slot change (`resetFrameGate()`, called from `resetGold()`). | Two characters' `version` counters are unrelated integers. A shared ledger across a slot switch would drop every frame of the new character until its version passed the old one's — so the reset is load-bearing, not hygiene. |
| **The push layer itself fails** (Realtime down, `realtime.send` throws) | no frames at all | The emitter is wrapped so that **a push failure can never fail the payment**. `hr_apply` has already committed the value; the frame is a copy. | This is the single non-negotiable property of hanging anything off the money path. §6 spells out the exception handling. |

---

## 6. The server side (STAGED — `supabase/migrations/2026-09-22-frame-push-channel.sql`)

Shape only; the migration is the authority and carries its own §4 self-check.

- `public.hr_frame_emit()` — `AFTER UPDATE ON public.player_state FOR EACH ROW
  WHEN (new.version IS DISTINCT FROM old.version)`. `SECURITY DEFINER`, owned by
  the migration runner, `search_path = public`. Reads `hr_tick_config.frame_push`
  (ships **false**) and returns immediately when it is off or the row is missing
  — fail-closed, the same direction as every other gate in the fence file.
- The payload is `{t:'delta', frame:<new.version>, patch:<whole top-level keys>}`
  built from `public.hr_state_of(new.user_id, new.slot)`, which is already
  `SECURITY DEFINER` and already granted to `hr_engine`, and which is the same
  projection the client applies. **One projection, not a second one.**
- **The whole body is wrapped in `exception when others then raise warning`.** A
  Realtime failure, a missing `realtime.send`, a payload over the limit — none of
  them may roll back the value `hr_apply` just wrote.
- Topic `hr:<user_id>:<slot>`, `private => true`.
- RLS on `realtime.messages`: a **SELECT-only**, topic-scoped policy for
  `authenticated`, and **no INSERT policy at all** — a client-writable topic is
  server impersonation, and `PRIORITY_BOARD.md` already names it the P0 of this
  area. `revoke ... from public` first, per `CLAUDE.md` §2.
- Production fact **[M, prior lane]**: `realtime.messages` currently has **0 RLS
  policies**, i.e. private channels are unjoinable today. This migration is what
  makes exactly one topic shape joinable, by its owner, read-only.

---

## 7. The client frame gate (commit 2 — SHIPPED IN THIS LANE)

This half is **transport-independent and load-bearing**, and it lands whether or
not the migration ever applies. `WORLD_TICK_DESIGN.md` §7a fixes the ordering:
the gate must exist before anything pushes frames, because an absolute fold plus
a reordered frame is a *visible* rewind rather than a quiet ratchet.

**Before:** `isEnvelopeApplicable` (`src/net/accrue.js`) required `res.version` to
be a finite number and nothing more. The monotonic rule existed in exactly one
place, for one field — `src/net/gold.js:599`, `if (env.version < lastVersion)`.

**After:** one ledger, in `accrue.js`, gating the **whole envelope** on `version >
lastAppliedFrame`; `gold.js` imports it and its own copy is deleted. Three
appliers commit through it: `applyEnvelope` (accrue), `applyGoldEnvelope` (gold)
and `applyIntentEnvelope` (activity).

**The one behaviour change, stated plainly rather than buried:** gold's rule
accepted an **equal** version; the frame rule drops it. An equal version can only
mean the client already applied that exact frame, so nothing is lost — but the
prediction the answer belongs to must still be accounted for, so the duplicate
path rolls the prediction back exactly as the stale path does. `gold.js`'s own
comment is the argument: the carry is removed because the gesture has now been
answered, and the envelope already in hand is at least as new.

Guards: `tests/envelope-frame-gate.mjs` (+ `--selftest`) and an in-page
regression in `src/features/smoke/record-seam-and-hydration.js`.

---

## 8. What this lane does NOT do

- **No client subscription.** Nothing in `src/**` opens a Realtime channel for
  frames. See §9.
- **No apply.** The migration is STAGED. The Coordinator applies after a Security
  GO (`CLAUDE.md` §2, lane C).
- **No cadence decision.** §3.4 puts a dollar figure on it and hands it to Tyler
  and Reliability; `hr_tick_config.flush_seconds` stays at 90.
- **No spend, no host, no signup.**
- **No load test**, and none is possible without a subscriber (§3.7).

---

## 9. Brief for the client-subscription lane (`lane/m5-live-subscribe`)

Precise, and scoped so it can be picked up cold.

**Prerequisites, hard.** (1) `2026-09-22-frame-push-channel.sql` applied and
`hr_tick_config.frame_push = true`. (2) The frame gate of §7 on `main` — without
it a reordered frame is a visible rewind (`WORLD_TICK_DESIGN.md` §7a). (3) The
inventory/bank **ABSOLUTE flip** (§7a step 1) before any frame carries
`inventory`; until then the subscription may be armed for `state` and `skills`
only, because `reconcileInventory`'s `Math.max` fold plus a pushed frame is the
2026-09-13 "browser says X, server says Y" class at 10 s resolution.

**Deliver `src/net/live.js` — ONE Realtime connection and a topic router.**
`PRIORITY_BOARD.md` item (3) is explicit that per-feature clients multiply the
*billed peak connections*, which §3.3 shows is the binding Pro line at 500. So:
one client, one connection, a router; and `src/net/supabase-chat-backend.js:150`
migrates onto it in the same lane. Two connections per player halves the
connection ceiling, which is the whole scale budget.

1. Subscribe to `hr:<auth.uid()>:<slot>` with `{ config: { private: true } }`,
   after `setAuth(jwt)`. Re-`setAuth` on token refresh or the channel silently
   stops authorizing.
2. On a message: `isEnvelopeApplicable(frameAsEnvelope)` → `applyEnvelope`. **Do
   not add a second applier.** `WORLD_TICK_DESIGN.md` §7a's correction stands —
   ~4,500 lines of `accrue.js` are applier, transport and receipts that the push
   channel still needs, and this lane is *re-pointing* them from fetch to socket,
   not replacing them.
3. **The poll stays.** `SETTLE_INTERVAL_MS` is untouched; push is a nudge and the
   poll is the reconciler and the Realtime-outage fallback. Deleting the poll is a
   separate, later, separately-reviewed decision.
4. On `SUBSCRIBED` (first join **and every re-join**) do one `hello`: the existing
   accrue/`hr_state_of` round trip, applied through the same gate. That is the
   reconnect healer in §5 and there is no other one.
5. **`RESIDUE_FIELDS` gains nothing.** Not `frame`, not `lastAppliedFrame`, not a
   socket state. The frame ledger is session state; after a reload the `hello`
   restates it. A client-persisted frame number is the residue-ahead class
   (`CLAUDE.md` §6) wearing a transport.
6. Degrade silently. No connection, no permission, no Realtime: the game is
   exactly today's game. Never a modal, never a blocked gate, never a fail-open.
7. Tests: an in-page regression that drives a reordered / duplicated / missed
   frame sequence through the router and asserts the gate's verdicts; a
   `tests/realtime-cost.mjs` extension asserting `supabase_realtime` still
   publishes exactly `{chat_messages}` (a frame subscription must never add a
   table); and a guard that `src/**` opens exactly one Realtime client.
8. Measure and re-state §3.5 from real wire bytes on the first live frame. The
   400 B figure in `WORLD_TICK_DESIGN.md` §12 was wrong by ~5× and was believed
   for six days; the next figure should be a measurement.

**Not in that lane, and not in any lane yet:** intents over the socket
(`WORLD_TICK_DESIGN.md` §7.3 — one transport for reads, one for writes), presence,
peers, and anything that makes the socket an authority.
