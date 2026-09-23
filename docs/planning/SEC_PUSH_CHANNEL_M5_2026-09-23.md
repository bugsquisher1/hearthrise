# Security review — M5 push channel: the client frame gate + the transport decision

**Reviewer:** security-engineer (veto authority, `CLAUDE.md` §2).
**Date:** 2026-09-23. **Lane:** `lane/m5-push-channel` @ `585fdc2f`.
**Under review:** `f6d4c95c` (`docs/design/LIVE_COUNTERS_PUSH.md`) and `585fdc2f`
(`src/net/accrue.js`, `src/net/gold.js`, `src/net/activity.js`,
`tests/envelope-frame-gate.mjs`, in-page regressions in
`src/features/smoke/record-seam-and-hydration.js`).
**Design authority:** `docs/planning/WORLD_TICK_DESIGN.md` §7 (7.1 the monotonic
frame gate, 7.2 key-level replaces, 7.3 no intents on the socket), which
`CLAUDE.md` §1/§2/§6 outrank.
**Scope:** this is the **client half of a money surface** — the envelope carries
gold, inventory and XP — so it is reviewed as one.

---

## Verdicts

**CLIENT FRAME GATE SHIP: GO-WITH-CHANGES**

**TRANSPORT DECISION: ACCEPTED-WITH-CONDITIONS**

The gate is the right rule in the right place and the guard behind it is a real
guard. It also introduces one **confirmed** new instance of the exact
`CLAUDE.md` §6 class it exists to kill (S1), and its one load-bearing safety
valve is **wired to nothing in production** (S2). Both are small and local;
neither crosses to another player. The transport decision picks the correct
option for the correct, measured reasons, but the migration it calls STAGED does
not exist, and the property that keeps one player's gold and bag out of another
player's socket is not yet written down anywhere I can read.

---

## 1. Ranked findings

| # | Surface | Sev | Status | Blast radius | Blocks |
|---|---|---|---|---|---|
| **S1** | `src/net/activity.js:778` `applyIntentEnvelope` — the duplicate drop deletes the refusal correction | **HIGH** | **CONFIRMED** (repro §1.1, bisected) | self; browser shows a number the server does not hold | client gate |
| **S2** | `resetFrameGate()` has **no production call site** — the per-character floor is never reset | **HIGH** | **CONFIRMED** (grep + `auth.js:938`) | self; a character whose every frame is dropped for the whole session | client gate |
| **S3** | No healer and no detector for a floor that is **too high**; "hello heals" is directional only | MEDIUM | CONFIRMED | makes S2 permanent rather than transient | client gate (guard only) |
| **S4** | `classifyFrame(v, since)` fails **OPEN** on a falsy-but-finite `since` (`Number(null) === 0`) | LOW | CONFIRMED, latent | none today — no production caller passes `since` | — |
| **T1** | `supabase/migrations/2026-09-22-frame-push-channel.sql` — cited as STAGED, **absent from the repo** | MEDIUM | CONFIRMED | Security cannot GO a migration it cannot read | transport GO |
| **T2** | `LIVE_COUNTERS_PUSH.md` §3.6 "(b) extra `hr_state_of` calls: **none**" contradicts §6, and the cost lands inside `hr_apply`'s row lock | MEDIUM | CONFIRMED | understated DB cost on the **money write path** | transport GO |
| **T3** | The RLS predicate on `realtime.messages` is the whole cross-player confidentiality property and is not stated | MEDIUM | PLAUSIBLE (unwritten) | **another player's** gold, bag, XP and bank | transport GO |
| **T4** | §3.4's dollar figures are derived entirely from `[R]` (recalled, unverified) allowances | LOW | CONFIRMED (self-declared) | budget freeze `CLAUDE.md` §2 | any spend |

---

### S1 — HIGH, CONFIRMED. A refusal no longer corrects the client.

**The rule.** §7.1 drops an **equal** frame. `gold.js`'s pre-M5 rule accepted it
(`env.version < lastVersion`); the lane tightens it to strictly greater and calls
that "the one behaviour change", arguing nothing is lost because "an equal
version can only mean the client already applied that exact frame".

**Why the argument does not hold.** It is true of the *applied* state and false
of what is **on screen**. The client carries optimistic writes on top of the
applied frame, and the envelope that retires them is a **refusal** — and a
refusal writes nothing server-side, so `player_state.version` does **not** move.
A refusal therefore arrives at `version === lastAppliedFrame`, classifies as
`duplicate`, and `applyIntentEnvelope` returns `null` at the top, **before**
`applyEnvelopeState`. The correction never lands.

`src/net/equip.js:545-550` states the exact shape, in the tree, today:

> a REFUSED equip's envelope states the server's OLD worn set while
> `G.equipment` still holds the swap the caller has not rolled back yet

Pre-M5 that envelope was applied and `G.equipment` was pulled back to the
server's truth. Post-M5 it is dropped whole and the swap stays on screen.

**`gold.js` is not affected; `activity.js` is.** `applyGoldEnvelope` runs
`rollbackPrediction(G, ownKey)` on the same non-apply verdict, so the gold carry
is retired. `applyIntentEnvelope` has **no compensator at all** — it returns
`null` and writes nothing. Every non-gold intent routed through
`legacy.js:1999 onEnvelope → applyServerEnvelope(res,{intent:true})` — equip,
enchant, recipe learn, the activity switch — is on the uncompensated path.

**#### 1.1 Reproduction (real shipped modules, bisected)**

```js
// node, importing src/net/accrue.js?v=550 and src/net/activity.js?v=550
const body = (version, gold) => ({ ok:true, accrued:true, version, now:…,
  state:{ gold, hp:10 }, skills:{…}, inventory:{ items:{} } });
A.resetFrameGate();
const G = {};
M.applyIntentEnvelope(G, body(77, 100));   // the server's truth lands
G.gold = 40;                               // the player taps; the client shows the optimistic spend
M.applyIntentEnvelope(G, body(77, 100));   // the server REFUSES — nothing written, version unmoved
```

```
######## HEAD 585fdc2 (WITH the frame gate) ########
after apply @77   : G.gold = 100 | floor = 77
after refusal @77 : G.gold = 40  | returned null
NOT CORRECTED — browser shows 40, server holds 100. CLAUDE.md §6.

######## PARENT f6d4c95 (BEFORE the frame gate) ########
after apply @77   : G.gold = 100
after refusal @77 : G.gold = 100 | returned WRITTEN
CORRECTED — the client was pulled back to the server's 100.
```

The lane is the bisect. This is the 2026-09-13 "browser says X, server says Y"
class (`CLAUDE.md` §6), which Tyler's 2026-09-14 01:30 UTC ruling makes a **P1
class-kill**, introduced by the lane whose stated purpose is to prevent it.

**Blast radius: self only.** The server still holds and still enforces its own
number, so nothing forged crosses into another player's economy or ranking. The
target property of `CLAUDE.md` §1 is intact. This is a §6 violation, not an
economy exploit.

**Would the existing tests have caught it?** No. `tests/envelope-frame-gate.mjs`
F2 asserts an equal frame is *refused*, which is the defect's mechanism, and S2
asserts `applyIntentEnvelope` *gates*. Nothing drives a refusal through the
applier with a prediction standing.

**Required change (pick one; the first is preferred):**

1. **A `duplicate` verdict re-applies, absolutely and idempotently, and never
   raises the floor.** `reorder` stays dropped. This keeps §7.1's actual safety
   property — a frame equal to the floor carries, by the rule's own argument,
   the state the client already applied, so re-applying it **cannot** be a
   rewind — while restoring the correction. §7.1's "equal is dropped" is sound
   for a *stateless* receiver; this client is not one.
2. Or: every applier runs `gold.js`'s prediction retirement on a non-apply
   verdict, and `applyIntentEnvelope` gains the compensator it lacks.

**Required guard:** a mutation in `tests/envelope-frame-gate.mjs` — a refusal at
the floor, with an optimistic value in `G`, must leave `G` holding the server's
number; and the in-page equivalent under "regression suite" per `CLAUDE.md` §4.
Whichever option is taken, `WORLD_TICK_DESIGN.md` §7.1 and
`LIVE_COUNTERS_PUSH.md` §5/§7 must be restated to match — the design authority
and the code may not disagree about this.

---

### S2 — HIGH, CONFIRMED. The per-character reset is documented, asserted, and wired to nothing.

`accrue.js:330` says `resetFrameGate()` is "called from `resetGold()` (which
every slot change and every sign-out already runs)".
`LIVE_COUNTERS_PUSH.md` §5 repeats it and calls the reset "load-bearing, not
hygiene". Both are false in the tree:

```
$ grep -rn "resetGold" --include=* .   # excluding src/features/smoke/**
./src/net/gold.js:324    export function resetGold() { … resetFrameGate(); }   ← the definition
./src/net/gold.js:1353   …getGoldState, resetGold,                            ← the window export
./tests/envelope-frame-gate.mjs:124   …                                       ← a mutation string
./docs/…                                                                      ← prose
```

**`resetGold()` has zero production call sites, so `resetFrameGate()` has zero
production call sites.** Every caller is the smoke suite or `_harness.js`. The
tests wire what production does not — which is the b339 class this repo has
already named in its own comments: *"a documented collaborator with no call site
is a comment, not a seam."*

**The production path that is not masked by a reload.** `src/net/auth.js:938`,
in `signOut()`, states it outright:

> **Sign-out does NOT reload**, so without this they are live module state when
> the next account signs in on this tab.

…and then hand-resets three other identity-scoped holders —
`resetCharacterIntent()`, `resetAccrualGate()`, `resetAccrualIdentity()`. The
frame floor is the fourth and is not among them. `resetAccrualIdentity()`
(`accrue.js:833`), which is the documented identity-change hook and is also
called by `multi-character.js:396` *before the pointer moves*, does not touch it
either.

**Trigger.** Sign out of account A (`player_state.version` ≈ 4,200) and sign in
as account B (version 37) in the same tab. `lastAppliedFrame` is still 4,200.
Every envelope for B — the boot read, the away grant, every gold verb, every
intent — classifies `reorder` and is dropped **whole**, for the rest of the
session, until B's version passes 4,200. The player sees the parked local save
while the server holds something else, and there is no healer (S3).

Pre-M5 this was bounded to gold (`gold.js`'s own `lastVersion`, equally
unreset). The lane widens the same latent defect from one field to the whole
envelope and to the boot load path. The slot-switch vector is masked in
production — `switchSlotAsync` reloads, and `noReload:true` has only a suite
caller — but `multi-character.js:394` names the reload "a race, not a
guarantee", and `accrue.js:623` agrees.

**Required change:** call `resetFrameGate()` from `resetAccrualIdentity()` — one
line, in the hook both production identity-change paths already call. Keep
`resetGold()`'s call for the suite. Then correct `accrue.js:330` and
`LIVE_COUNTERS_PUSH.md` §5 to name the real caller.

**Required guard:** a mutation in `tests/envelope-frame-gate.mjs` that deletes
the `resetFrameGate()` call from `resetAccrualIdentity()` and must be CAUGHT by
a new source claim (`S6 — IDENTITY RESET`). A reset with no production caller is
the defect; a guard that only exercises the suite's own call proves nothing.

---

### S3 — MEDIUM. The floor can only be healed upward, and nothing notices it is stuck.

`LIVE_COUNTERS_PUSH.md` §5 and §9(4) make `hello` — the existing
`hr-accrue`/`hr_state_of` round trip — "the reconnect healer … and there is no
other one". It heals a floor that is too **low**. A floor that is too **high**
(S2, or any future frame stamped wrong) makes the `hello` envelope itself
classify as `reorder`, so the healer is gated by the thing it is meant to heal.
`tests/envelope-frame-gate.mjs` F5 only proves the upward direction (a full
envelope at a *higher* version), and the in-page regression at
`record-seam-and-hydration.js:8034` simulates `hello` by applying frame 900 by
hand.

There is also **no counter of dropped frames** anywhere, so a client in this
state is indistinguishable from a quiet one, in the browser and in
`vitals.mjs` — and `CLAUDE.md` §3.4 is explicit that a feature invisible for two
days is a P1 by definition.

**Required change:** count consecutive non-apply verdicts and publish the count
on the existing diagnostics/bug-report seam (`getAppliedFrame()` is already
exported for it). **Required for `lane/m5-live-subscribe`, as a hard
prerequisite:** after N consecutive drops, one forced full re-read that is
allowed to **reset** the floor rather than be gated by it — otherwise §5's
"Reconnect" row is not true of the shipped client.

---

### S4 — LOW, latent. `classifyFrame` fails OPEN on a falsy-but-finite `since`.

```js
const floor = Number.isFinite(Number(since)) ? Number(since) : lastAppliedFrame;
```

`Number(null) === 0` and `Number('') === 0` are both finite, so
`classifyFrame(v, null)` silently gates against floor **0** instead of the module
floor — the fail-**open** direction, in a function whose own comment is "⚠ FAIL
CLOSED ON AN UNREADABLE VERSION". No production caller passes `since` today
(`applyEnvelope` → `isEnvelopeApplicable(res)`, one argument; `gold.js` and
`activity.js` call `classifyFrame(env.version)`), so this is latent. It becomes
live the moment the subscription lane forwards an optional `since` through
`isEnvelopeApplicable(frameAsEnvelope, opts.since)`.

**Required change:** `typeof since === 'number' && Number.isFinite(since)`.

---

## 2. What I checked and found CORRECT

Recorded so the next reviewer does not re-derive it.

| Question (from the brief) | Answer |
|---|---|
| Is the gate exactly §7.1 — whole envelope, strictly greater, equal dropped, lower dropped, no per-key merge, no rollback of a server version? | **Yes.** `classifyFrame` is `>` / `===` / else; `applyEnvelope:4760` gates before any write; `commitFrame` is **raise-only** (`v <= lastAppliedFrame` → no-op), so the client cannot roll a server version back (`CLAUDE.md` §6). Unorderable versions (absent, `NaN`, `Infinity`) fail **closed** — and the `Infinity` case is the right one to have thought about: it is `> floor` for every finite floor and would have latched the gate shut for ever. |
| Was `gold.js`'s gate deleted rather than duplicated? | **Yes.** The `lastVersion` binding is gone, not shadowed; `getGoldState()` now reports the shared floor. The `gold_copy_restored` mutation restores it and the guard goes red — I ran it. |
| Does `tests/envelope-frame-gate.mjs --selftest` actually bite? | **Yes, all five, exit 0.** `equal_accepted` → caught by S4,F2. `per_key_merge` → S5,F3. `gold_copy_restored` → S1. Plus `activity_does_not_commit` → S2 and `classify_gates_on_frame` → S3. The guard is also honest about its own limit: `--selftest` proves the **source** claims bite and says so. |
| Does anything read a client-held version as authority (residue-ahead)? | **No.** The floor is module scope, never persisted, absent from `RESIDUE_FIELDS`, and `buildAccrueRequest` sends `{ slot }` and nothing else — the client never sends a version and the server never reads one from it. `getGoldState().version` has no production consumer. The lane's own comment ("a client-persisted frame number is the residue-ahead class wearing a transport") is correct and is honoured in the code. |
| Is `frame` = `version` from `hr_apply`, with no second counter? | **Yes.** The emitter fires `WHEN (new.version IS DISTINCT FROM old.version)` and puts `new.version` in the message. Never incremented, never defaulted, never read from a request. |
| Does a SHADOW apply emit nothing? | **Yes, by construction — verified.** `2026-09-21-world-tick-settle-fence.sql` §3(8): the shadow branch writes `hr_tick_shadow` and `hr_tick_ownership` and **returns before `hr_apply`**; no `player_state` row is written. An `AFTER UPDATE ON player_state` trigger therefore *cannot* fire on a shadow settle. Hanging the emitter on the column that is the frame number, rather than inside `hr_tick_settle`, is the right call and it survives somebody forgetting a flag — which is the only kind of argument this review accepts. |
| No intents on the socket (§7.3)? | **Yes.** §9's brief keeps writes on HTTPS with their existing auth, rate limits and idempotency, and puts socket intents explicitly out of scope for every lane. |
| Does the cost table cite the Supabase plan line it assumed? | **Yes, and it labels its own confidence.** §3.1 cites Pro from `get_organization` `[M]` and the hard 500-connection spend cap from `PRIORITY_BOARD.md` `[M]`; §3.3's per-plan quota table is `[F]` from the docs mirror. The `[M]/[F]/[D]/[R]` convention, §3.7's "no load test exists", and the self-correction of §12's 400 B frame budget to ~2.5 kB (out by 5×) are the standard this role wants to see. See **T4** for the one place the labelling has to bind a decision. |
| `classifyAccrueResponse` gating on SHAPE, not frame | **Correct, and load-bearing.** Putting the frame gate there would classify a duplicate as `malformed`; three would trip `ACCRUE_HALT_AFTER_TRIES` and pin the "Away progress is paused" sheet in front of a player whose grant the server already made — b475's exact shape, permanent under a push stream. The split is right. |

---

## 3. The transport decision

**Option (b), broadcast from the database, is the right choice** and I accept it.
The decisive lines are `[M]` and `[F]`, not recalled: `postgres_changes`
authorizes per change **per subscriber** (2.5M reads/s at 5,000 on Realtime's
single change-processing thread), it requires putting `player_state` — the
game's hottest-written table — into `supabase_realtime`, reversing
`2026-09-06-realtime-publication-trim.sql` against a WAL poller already measured
at **~61% of all measured exec time for two published tables holding zero rows**,
and the vendor's own docs recommend Broadcast at this shape. None of that is
close.

### T1 — MEDIUM. The STAGED migration does not exist.

§6 is headed `(STAGED — supabase/migrations/2026-09-22-frame-push-channel.sql)`
and the status block says "the server half of the chosen option is STAGED, NOT
APPLIED". The file is not in `supabase/migrations/` on `585fdc2f`, and
`hr_frame_emit` / `realtime.send` / `frame_push` appear nowhere in the repo
outside the two prose documents. §6 describes shape only, and says so in its own
first line ("the migration is the authority").

**This is not a nit.** `CLAUDE.md` §2 puts every migration on a shared surface
behind an adversarial review *before apply*, and lane C sequences Security GO
ahead of the Coordinator's apply. There is nothing to review. The transport
**decision** is accepted here; the **migration** is not reviewed and has no GO.
Correct the document to say DESIGNED, not STAGED, or stage the file.

### T2 — MEDIUM. §3.6 charges (b) for one `hr_state_of` too few, on the write path.

§3.6 charges option (a) "one [`hr_state_of`] per frame … at 3.23 ms `[M]` =
1.6% / 16.2% / **161.5% of one core**" and credits option (b) with "**none.** The
payload is the answer." But §6 says the payload is built from
`public.hr_state_of(new.user_id, new.slot)` **inside the `AFTER UPDATE`
trigger**. That is the same one call per frame and the same 3.23 ms — it has not
been eliminated, it has been **moved from a client-initiated read onto the
server's write path**, inside `hr_apply`'s transaction and under its
per-character row lock.

What (b) genuinely saves is the network round trip, the edge invocation,
`hr_rate_gate`'s 271 ms mean, and 2.6× the egress. Those are real and the
decision does not change. But a money function's lock-hold is exactly the number
this role does not accept as an unstated rounding error: lengthening the
per-character lock on every accepted write is a concurrency and availability
property of the payment path, and at 5,000 concurrent on a 10 s cadence it is
161% of a core added to **writes**, not reads.

**Required:** restate the §3.6 row honestly, and measure the trigger's added
time inside the lock before the migration gets a GO (see §4).

### T3 — MEDIUM. The one property that keeps players out of each other's sockets is not written down.

The frame payload is the **whole `hr_state_of` projection**: gold, gems,
inventory, bank, equipment, skills, XP, farm, progress. §6 promises "a
**SELECT-only**, topic-scoped policy for `authenticated`, and **no INSERT policy
at all**", `revoke … from public` first, topic `hr:<user_id>:<slot>`,
`private => true` — every one of which is the right instinct, and `[M]` that
`realtime.messages` has **0 policies today**, i.e. private channels are
unjoinable until this migration makes exactly one shape joinable.

But the **predicate** is the property, and the predicate is not stated. A policy
scoped by topic *shape* (`topic like 'hr:%'`) rather than by *identity* would let
any authenticated player join any other player's topic and stream their entire
economy. That is a cross-player confidentiality break — blast radius **another
player**, the highest this role ranks — and it is a one-word difference in a
`using` clause. `CLAUDE.md` §2's rule is "read the grants, not the intent", and
there is no grant to read yet.

### T4 — LOW. No spend may be approved on §3.4.

§3.4 is correctly called "the most important row in the document" and its
conclusion is sound and conservative: a 10 s cadence is **not free at 50
concurrent characters**, so zero-spend constrains the **cadence**, not the
transport, and `hr_tick_config.flush_seconds` should stay at 90. Accepted.

But every dollar in that table is derived from two `[R]` figures — ~5M included
messages/month and ~$2.50 per additional million — which the document itself
flags as recalled-not-verified because `supabase.com` is blocked by this
environment's egress proxy. Under the 2026-08-17 budget freeze
(`CLAUDE.md` §2), no spend decision — the spend cap coming off at 500
connections included — may be taken on `[R]`. The figures must be read from the
vendor's own page first, by someone whose network can reach it.

---

## 4. What the server-side lane must prove before Security will GO its migration

Stated as conditions, each one satisfiable and checkable. `GO-WITH-CHANGES`
means these land **first** (`CLAUDE.md` §2).

1. **The migration exists and is in the repo**, one file, and it carries a §4
   self-check block that asserts its properties **by executing SQL**, not by
   markers (`CLAUDE.md` §4).
2. **The RLS predicate binds identity, not shape.** The `realtime.messages`
   SELECT policy resolves the subscriber from the **JWT** (`auth.uid()`) and
   compares it to the topic's own user segment —
   `topic = 'hr:' || auth.uid()::text || ':' || <slot>`, not a `like`. The
   self-check must **attempt a cross-user topic join and assert zero rows**. A
   policy that only proves the owner *can* read proves nothing.
3. **No INSERT policy on `realtime.messages`, and `revoke … from public` before
   any grant.** A client-writable topic is server impersonation into another
   player's client, and it is the P0 of this area. The self-check asserts the
   INSERT path is denied for `authenticated`.
4. **The emitter cannot fail the payment.** `exception when others then raise
   warning` around the whole body, proven by a self-check that makes
   `realtime.send` fail (missing function, oversized payload) and asserts
   `hr_apply`'s value **still committed**. This is the single non-negotiable
   property of hanging anything off the money path, and an assertion in prose is
   not a proof.
5. **Fail-closed on the flag.** `hr_tick_config.frame_push` ships `false`, and a
   missing config row emits nothing — asserted, in the same direction as every
   other gate in the fence file.
6. **The frame number is never synthesised.** The self-check asserts the emitted
   `frame` equals `new.version` exactly, for a write from each producer (edge
   intent and tick settle), and that a version that goes *down* still emits
   (the client drops it — fail-safe).
7. **The shadow property is asserted, not inherited.** An e-numbered check that a
   shadow settle emits **no** frame. It is true today by construction (§2); it
   should be pinned so it stays true.
8. **The trigger's cost inside the lock is measured** — `hr_state_of` + the
   `realtime.messages` insert, timed as added lock-hold on `player_state`, with
   §3.6 restated from the measurement (T2). Reliability reviews the WAL and
   retention consequences of one `realtime.messages` row per frame under
   `wal_level = logical` with 2 slots.
9. **The delta states the WHOLE projection, every time.** §7.2 forbids path
   patches; combined with S1's "equal is dropped" a *partial* delta would leave
   the client holding a state assembled from two frames that the server never
   held — the failure the gate exists to forbid, arriving through the emitter
   instead of the applier. Assert the payload's top-level key set equals
   `hr_state_of`'s.
10. **`tests/realtime-cost.mjs` stays green**: `supabase_realtime` still
    publishes exactly `{chat_messages}`. A frame subscription must never add a
    table.
11. **No service-role key** anywhere in the socket path (`WORLD_TICK_DESIGN.md`
    §8), and the anon key remains the only key in the client bundle.

**For `lane/m5-live-subscribe`, additionally:** S1, S2 and S3 fixed and on
`main`; the inventory/bank ABSOLUTE flip (`WORLD_TICK_DESIGN.md` §7a step 1)
landed before any frame carries `inventory`; `RESIDUE_FIELDS` gains nothing; one
Realtime client and one connection; and `setAuth` re-run on every token refresh —
a channel that silently stops authorizing is a client that silently stops
receiving, which is S3 again wearing a transport.

---

## 5. Guards — exit codes I saw, not expectations

| Command | Exit | Result |
|---|---|---|
| `node tests/envelope-frame-gate.mjs` | **0** | `OK — one monotonic frame gate, strictly greater, whole-frame-or-nothing, committed by all three appliers.` |
| `node tests/envelope-frame-gate.mjs --selftest` | **0** | all 5 mutations CAUGHT: `equal_accepted`→S4,F2 · `per_key_merge`→S5,F3 · `gold_copy_restored`→S1 · `activity_does_not_commit`→S2 · `classify_gates_on_frame`→S3 |
| `node tests/no-client-xp-mint.mjs` | **0** | 9 `addXp` sites, 5 classified paths, 0 unclassified; 3 direct `G.skills` writes, all named |
| `node tests/property-gate-census.mjs` | **0** | merge rule proven both directions; 229 sources, 2 residue owners, 7 classified consumers |
| `node tests/ci-shape.mjs` | **0** | 188 guard commands, 188 distinct, across 7 jobs |
| `node tools/lane-done.mjs` | **1** | **RED — `2 guard(s) red — the lane is not done.`** |
| `node tests/run-smoke.mjs` | **1** | in-page `passed 1317/1332  failed 2  skipped 13  runtime errors 0`, + 4 guard failures — **NOT a valid record in this environment**, see below |

**`lane-done` is RED**, and by `CLAUDE.md` §4 that alone means the lane is not
done, independent of this review:

- `tests/comment-ratio-ratchet.mjs` — 6 counts rose. `CR-1 src/net/accrue.js`:
  3,490 comment lines against an allowance of 3,452. `CR-2 accrue.js`:
  build-number narrative 127 → 128. `CR-1 src/net/gold.js`: 729 against 697.
- `tests/test-file-ratchet.mjs` — `TF-1` code lines per registered test rose
  33.32 → 33.70, past the +1% band (ceiling 33.65).

Both are the paydown `CLAUDE.md` §4 requires to happen **where the code is
written**, in this lane, not by a second lane after the merge. The prose in
these three files is unusually good and I would not want it thinned by much —
but the ratchet is a guard, and `CLAUDE.md` §2 is absolute that a guard is never
loosened to get green.

**`run-smoke.mjs` ran to completion but is NOT a valid record here.** This
container has no Supabase egress and does not have the browser build the repo
pins (it ships Chromium 1194; the suite asks for 1234, which I shimmed to get
the run to start at all). The run reported:

```
Hearthrise smoke suite — v0.9.2-beta (b550)
  passed 1317/1332   failed 2   skipped 13   runtime errors 0
```

plus four guard failures. Attributing each one honestly:

| ✗ | Attributable to |
|---|---|
| `errors: clean log` — 6 × `unhandled-rejection: Failed to fetch` | **this container's egress**, not the lane |
| `Edge payload guard` — `GET …/functions/v1/hr-accrue` → **403** | **the proxy**, not the lane |
| `Account-wall guard` / `Cold-load guard` — 3 × `pageerror: Failed to fetch` each | **this container's egress**, not the lane |
| `Reachability guard` — `#btn-settings-rail` at y 731..769 in a 768 px viewport | **plausibly the shimmed Chromium build** (1 px), unverified |
| `B354-10/11/12/13` — `B354-13-CONTROL: day N of the cycle pays no gems, so the gem half of this test has no subject` | **neither** — see below |

**The B354-13 failure is not this lane's and is not network.** It is in
`src/features/smoke/market-night-and-prices.js`, which this lane does not
touch (last changed at b550, `f1eba40`), and the failing line is the **control**
at :176 — `rw.gems > 0` — which runs before any envelope reaches any applier, so
the frame gate cannot reach it. It is a streak-cycle-day-dependent control of
exactly the kind `CLAUDE.md` §4 names ("clock pinned, state torn down"). I could
not establish whether it reproduces outside this container.

It still matters, and not to this lane alone: **the GitHub `smoke` job fails on
ANY in-page ✗**, so if this reproduces on the Coordinator's machine the CI gate
is unreachable for every later build — the b512 shape — and by `CLAUDE.md` §4
that is a P1 to be fixed at its source, never re-run until green.

**Nothing in this run touches the frame gate**, and none of it is evidence for
or against this lane. The in-page suite must be run on the Coordinator's machine
or on GitHub before this lane ships; per `CLAUDE.md` §3.3 the GitHub run on the
release SHA is the record gate.

---

## 5a. The lane does not merge `origin/main` (b551) — it goes back to its lane

`CLAUDE.md` §3.3: *"The Coordinator never resolves a conflict by hand …
a branch that conflicts goes back to its authoring lane, which merges main/next
into itself, re-runs its own tests and reports."* I tried the merge on this
review branch and aborted it rather than hand-resolve — the same rule binds me:

```
$ git merge origin/main          # 372cf67  release(b551): The realm starts ticking
CONFLICT (content): src/net/gold.js                             1 hunk
CONFLICT (content): src/net/activity.js                         1 hunk
CONFLICT (content): src/features/smoke/record-seam-and-hydration.js   1 hunk
```

All three are in files this lane rewrote, and b551 has moved the cache buster,
so the lane's `?v=550` imports are a build behind. `CLAUDE.md` §5 already says
how those resolve — *branch content at the new version* — but that is the
authoring lane's call and its re-run, not a reviewer's and not the
Coordinator's. **This review branch is docs-only and is deliberately a clean
child of `585fdc2f`.**

---

## 6. Residual risk I am accepting

- **Closed:** nothing in this change lets a forged client value cross into
  another player's economy or ranking. The client sends `{ slot }`, authors no
  version, persists no frame, and the gate is raise-only. The money property of
  `CLAUDE.md` §1 is intact, and this lane does not weaken it.
- **Bounded and journalled:** S1's desync is self-only, corrected at the next
  accepted write, and every value movement remains in `player_ledger`.
- **Remains, until S2 and S3 land:** a client can enter a state where every
  server frame is dropped for the whole session, invisibly to the player, to the
  browser and to `vitals.mjs`. Trigger: an identity change in a tab that does not
  reload — today, sign-out → sign-in.
- **Remains, unreviewable:** the server half. There is no migration to read
  (T1), so the cross-player confidentiality property (T3) is an intention, not a
  grant. No GO is given or implied for it.
- **Not measured by anyone:** no load test against a real Realtime tenant exists,
  at any concurrency, and the document says so itself (§3.7). The connection
  ceiling of 500 is a quota line, not an observation.
