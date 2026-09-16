# Live world brief — what Huntera does, what we have, what is missing

Written 2026-09-16 after a night driving a four-character Huntera party from the browser (Tyler's question: "is what we have built useless if we want a game like Huntera?"). Answer first, then the evidence, then the plan.

## Answer

No. About four fifths of what exists is the layer Huntera also has to have under its simulation, and it stays. What we lack is one piece: a process that runs our engines on a server clock and pushes state to clients. Accrual-on-return does not get thrown away; it becomes the reconnect path.

## What Huntera does (observed, not inferred from docs)

- A character keeps hunting with its tab closed. Measured: the Sorcerer's party damage total went 81.5k → 108k at 316 DPS across 90 seconds with no client. The login page says "Your hunt is where you left it."
- Other clients see it live: the party panel on Tyler's tab updated the Sorcerer's totals every few seconds. That is a server push, not a poll on claim.
- The client computes nothing that matters. Kill counts, XP, gold, Bestiary stages, claims, hunt state all arrive from the server. The Hunt Analyzer is a view of server counters (per-hunt session, resets when the server starts a new hunt).
- Protocol shape (from 2026-08-23 inspection): a custom WebSocket server, 123 client intents, 184 server events. Angular + Phaser client.
- Party hunts are a server object: the leader "starts with team", each member accepts, the server walks everyone to the portal and runs the hunt as one unit. Leaving is a server intent with a 3-second countdown.
- Background-tab throttling only hurts the client: hidden tabs miss keepalives and reconnect ("Entering world"), but the character never stopped. The world does not depend on any client being awake.

## What we have (by file, so nobody argues from memory)

| Layer | Where | Lines | Verdict |
|---|---|---|---|
| Authority + ledger: Postgres RPCs (221 `hr_*` functions, 198 migrations), RLS per user, `player_ledger`, per-call clamps, catalogues | `supabase/migrations` | — | **Keep.** This is what Huntera must have underneath its sim. It is the anti-dupe layer and it is done. |
| Engines: combat, away, skill, artisan, farm, buffs, auto-eat, ammo, bounty, goals, perks | `src/core/*` | 9,486 | **Keep.** Already pure and dual-runtime (imported by the edge). This is the code a live tick would run. |
| Accrual engine: computes what happened since last seen, on return | `supabase/functions/hr-accrue/accrual.js` + `set-activity.js` + `intents.js` + `claim-reward.js` + `eat.js` | 13,649 | **Keep as the reconnect/catch-up path.** Stops being the main loop. |
| Client intent plumbing and record sync | `src/net/record.js`, `sync.js`, `activity.js`, `server-rpc.js`, the `*-record.js` files | ~10k | **Mostly keep.** Intents stay intents. The transport changes from "RPC then apply envelope" to "socket event stream", so `sync.js` and `record.js` shrink. |
| Client-side accrual mirror and prediction | `src/net/accrue.js` (5,795), `predict.js` (576), `client-state.js` residue | ~7k | **Replaced.** These exist only because nothing ticks server-side. Every "browser says X, server says Y" bug of the last week lives here. |
| Auth, account gate, signup door, build watch | `src/net/auth.js`, `account-gate.js`, `signup-door.js`, `build-watch.js` | ~3.7k | **Keep.** |
| Monolith UI | `src/legacy.js` | 19,156 | **Unchanged by this question.** It renders state; where the state comes from does not matter to it. Its extraction is a separate program (#129). |
| Content as data | `src/data/*` (31 files) | — | **Keep.** Exactly the Huntera pattern (their content is server catalogues). |

Rough split: ~80% stays, ~7k lines of client prediction/mirror get retired, one new service gets written.

## What is missing

1. **A world tick.** One long-running process per shard that, every N seconds, advances every active character through the same `src/core` engines the edge already imports, and writes results through the existing RPCs (same ledger, same clamps, same catalogues). Nothing new is trusted; the tick is just another server-side caller.
2. **A push channel.** Clients hold a socket; the tick emits deltas (the envelope we already produce, but pushed rather than fetched). Party panels, shared spawns, market ticks, and the "someone got a rare drop" broadcast all ride this.
3. **Session as a server object.** Hunts/activities become rows the tick owns, with start/stop intents, so "close the tab and it keeps going" is the default rather than a reconstruction on return.

Accrual-on-return stays for the case where the tick was down or the character was inactive: on connect, the server catches the character up (the current `hr-accrue` path), then hands over to the tick.

## Why we did not build it this way first

- **Cost.** The current stack is serverless and costs nothing idle. A world tick is a process that runs 24/7 whether anyone is online, and scales per shard. This was the right call under the spend freeze; it is the wrong call for a launch gate that says "Huntera-style live system" (Tyler, 2026-09-11).
- **Authority first.** A fluid world without the ledger/RLS/clamp layer is a fluid world that gets duped. That layer is done and is not wasted.
- **The mistake.** We kept polishing client prediction and reconciliation to fake fluidity instead of naming the missing piece. That is the ~7k lines above, and the bug class of 2026-09-13/14.

## Cost estimate for the always-on piece (order of magnitude, Tyler's decision)

- One small always-on VM or container running the tick + socket server: on the order of 15–40 USD/month for the beta's population; Supabase stays as the database and auth. Postgres load moves from "burst on claim" to "steady small writes per tick per active character"; batching per tick keeps it inside the current plan for a long while.
- Alternative that avoids a new host: Supabase Realtime for the push channel plus a cron-driven tick (pg_cron or a scheduled edge function every 10–30 s). Cheaper and inside the current freeze; coarser tick and harder to keep shared spawns consistent. Reasonable first step; not the end state.

## Proposed sequence (strangler, no rewrite)

1. **Tick service, read-only shadow.** Runs the engines on a clock for active characters and logs what it *would* write, compared against what accrual-on-return actually writes. Parity gate: `AWAY-1` style, tick vs accrual byte-identical on the same inputs.
2. **Tick becomes the writer for one channel** (combat first, since `combat-sim.js` is already the single engine). Accrual becomes catch-up for that channel. Security GO required: the tick is a new writer on money and XP surfaces.
3. **Push channel.** Envelope deltas over a socket; client applies, never predicts. Retire `predict.js`, then `accrue.js` mirror paths channel by channel.
4. **Session objects.** Activities as server rows with start/stop intents; party sessions when parties exist.
5. **Shared world.** Spawns, market ticks, broadcasts. This is the part that cannot be faked on return and is the actual reason for the tick.

Each step ships behind a flag and keeps the current path as fallback, so a red gate rolls back by flipping the flag, not by reverting a rewrite.

## Decisions (Tyler, 2026-09-16: "all of these should be your gut instinct, yes")

- **Always-on host: yes.** One small VM/container for the tick + socket server; Supabase remains the database and auth. The freeze still requires the exact monthly figure to be approved before purchase; the direction is decided, the Realtime + cron variant is not pursued.
- **Tick: 10 s for the beta**, designed so 5 s is a config change, not a redesign.
- **Displaces the feature track** from the moment the current P1 class-kill lands. No new client-prediction or reconciliation work from this date; such work is built on the tick or waits for it.

Next step: protocol capture of Huntera's socket (cadence, event catalogue) → brief v2 → step 1 of the sequence (tick service in read-only shadow, parity gate against accrual).
