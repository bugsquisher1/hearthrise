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

> ⚠ **SUPERSEDED — see the RE-VERIFY at the end of this file (2026-09-23,
> second pass, lane head `f8f3fc05`).** The verdicts below are the FIRST pass,
> against `585fdc2f`. All four client findings and all four transport findings
> below have since been answered; the operative verdicts are the three lines
> under "RE-VERIFY → Verdicts".

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

---

# RE-VERIFY — 2026-09-23 (second pass, same reviewer)

**Lane:** `lane/m5-push-channel` @ `f8f3fc05`. **Branch:** `sec/m5-push-channel-2`,
cut from that head, docs-only.
**Why this pass exists:** the Coordinator merged the ORIGINAL frame gate into the
set, the matrix went red — `tests/activity-intent.mjs` (the activity-intent
economy guard) caught **S1**, plus the comment-ratio and test-file ratchets — and
the merge was **REVERTED** (`289a1ab0`). The lane re-merges only on this GO.
**Under review:** `fc211e57` (S1), `51260982` (S2), `9f9255e9` (S3), `14979512`
(S4), `a86b89a9` (T1 — the STAGED migration), `7c7e4d84` (T2–T4), `f8f3fc05`
(comment-ratchet paydown). `npm install --no-audit --no-fund` clean.

Every green below is an exit code I read. Every CLOSED below is a repro I ran on
this head, not a diff I approved.

---

## Verdicts

**CLIENT FRAME GATE SHIP (re-merge into the set): GO**

**MIGRATION 2026-09-22-frame-push-channel.sql: GO-WITH-CHANGES**

**TRANSPORT DECISION: ACCEPTED-WITH-CONDITIONS**

All four client findings are closed — S1, S2 and S4 by the **same script run at
both ends of the bisect**: exit 1 on the parent `1e25db3`, exit 0 on `f8f3fc05`. The two ratchets that reddened the matrix
are green. The migration now exists, replays, and its self-check is the strongest
in this repo's chain — and the one property I said was unwritten, the RLS
predicate, I have now **executed**: no cross-player read, against a control that
leaks. What it still owes is one measurement it cannot take from a worktree
(condition 8) and two corrections to its own proof and its own comments.

---

## 1. The original findings, re-run

| # | Was | Now | The proof I ran |
|---|---|---|---|
| **S1** | HIGH — the duplicate drop deleted the refusal correction | **CLOSED** | §1.1 repro, **one script, both ends of the bisect**: on the parent `1e25db3` `G.gold` stays 40 over a server holding 100 — **exit 1**; on `f8f3fc05` it is pulled to **100**, `correction=true`, floor unmoved at 77, reorder still dropped and still `null` — **exit 0**. |
| **S2** | HIGH — `resetFrameGate()` had no production call site | **CLOSED** | Identity switch through the **production hook only**. Parent `1e25db3`: `resetAccrualIdentity()` leaves the floor at **4200** and B's boot read is dropped whole — **exit 1**. Head: 4200 → **−1** → B's frame lands, floor 37 — **exit 0**. |
| **S3** | MEDIUM — no detector for a floor that is too high | **SUBSTANTIALLY CLOSED**, one gap → **R3** | The counter is real, counted at all three appliers, and `tests/frame-drop-streak.mjs` catches 5/5 mutations. The publish half lands on a seam with no production reader. |
| **S4** | LOW — `classifyFrame` failed OPEN on a falsy-finite `since` | **CLOSED** | Floor 500, frame 9. Parent: **5 of 8** falsy non-numbers classify `fresh` against a floor of ZERO — **exit 1**. Head: all eight classify `reorder`, and an explicit numeric `0` still overrides — **exit 0**. |
| **T1** | MEDIUM — the STAGED migration did not exist | **CLOSED** | 704 lines, in `supabase/migrations/`, replays byte-identically (`schema-drift` exit 0, fingerprint `ac920d6c6f9f…`), self-check asserts by executing SQL, `selfcheck-no-global-dml` exit 0. |
| **T2** | MEDIUM — §3.6 charged (b) one `hr_state_of` too few | **CLOSED** | §3.6's (b) column now states the same one call per frame at the same 3.23 ms, **moved onto the write path inside `hr_apply`'s lock**, marked `[D, UNMEASURED IN THE LOCK]`; §3.7 names condition 8 open. |
| **T3** | MEDIUM — the RLS predicate was unwritten | **CLOSED, and now EXECUTED** | §6.1 states it verbatim and is **byte-identical** to the migration's (normalised for comments/whitespace — I diffed the two texts programmatically). Then I attacked it: see §2. |
| **T4** | LOW — dollars derived from `[R]` allowances | **CLOSED** | Every figure `[R, UNVERIFIED]`, a standing blockquote that no spend may rest on them, **and none is requested**. The 2026-08-17 freeze is respected. |

### 1.1 S1's fix creates a new write path, so I attacked that too

The lane took option 1 — a `duplicate` re-applies, absolutely, and never raises
the floor — and went further than I asked: it noticed that a **retransmit**
reaches the same branch and that the away collect receipt is an **event**, not
state. `legacy.js` credits `written.paidReceipt` into `updateDaily('kill_any')`,
the Muster's **shared** world meter, so re-hanging it would put a forged
contribution on a shared surface (`CLAUDE.md` §1). Executed on this head:

```
FRESH   @77 : WRITTEN | paidReceipt HUNG | correction false
RETRANS @77 : WRITTEN | paidReceipt none | correction true
state after : gold = 100 | copper_ore = 3 | floor = 77
IDEMPOTENT — the receipt is hung ONCE; a retransmit cannot pay the shared meter twice.
```

The state re-states identically and the floor holds. **The `CLAUDE.md` §1 target
property is intact and this lane does not weaken it.**

### 1.2 S2 — I checked the sign-IN side too, not just sign-out

`resetAccrualIdentity()` has exactly two production call sites, `auth.js:940`
(`signOut()`, which deliberately does not reload) and `multi-character.js:396`
(before the slot pointer moves), and `resetFrameGate()` is now called from it
(`accrue.js:856`). The sign-**in** paths — `settings-page.js:355`,
`account-gate.js:1062/1096` — are reachable only from a signed-out UI, so a
sign-out always precedes them; `onAuthStateChange` needs no call. `resetGold()`
keeps its own call and the comment now names it correctly as the suite's.

---

## 2. Condition 2 — the RLS predicate, EXECUTED

This is the highest-blast-radius property in the file: the frame payload is the
whole `hr_state_of` projection, so the `using` clause is the entire thing keeping
one player's economy out of another player's socket. The migration's own `e2`
**skips** wherever `realtime.messages` is absent, and it is absent from the
PGlite replay — so "e2 covers it" was, in this environment, a skip.

I gave the replay a faithful stand-in (`realtime.messages` with the columns the
policy reads; `realtime.topic()` as the GUC Supabase sets it from) and installed
the policy **from the migration's own text, extracted verbatim, never retyped**.
Then I joined as one user and asked for other users' topics — which is exactly
the request an attacker sends, since `realtime.topic()` is entirely attacker-
controlled and only the JWT is not.

```
  ✓ another player's topic         rows=0   ✓ a wildcard-shaped topic  rows=0
  ✓ another player's other slot    rows=0   ✓ every topic, unsegmented rows=0
  ✓ my own topic                   rows=4   ✓ as `anon`, no JWT        rows=0
  ✗ my topic + an attacker suffix  rows=4   ← R2

CONTROL: the same attack against the shape-scoped policy this review warned
about (`topic like 'hr:%'`) → rows=4. It LEAKS, so the test measures something.
```

(The owner's row reads 4, not 1, and that is correct rather than a leak: RLS on
`realtime.messages` is how Realtime authorizes a **channel join**, not a
per-row delivery filter — the predicate never compares the row's `topic`
column to anything. My first harness expected a row filter and was wrong about
that; the policy is not.)

**NO CROSS-PLAYER READ.** The predicate binds identity, and the owner can still
join, and the control proves the harness is not simply denying everything.
Condition 2's *property* is met. Two things about the *proof* of it are not, and
I found the first by tripping over it.

---

## 3. New findings

| # | Surface | Sev | Status | Blast radius | Blocks |
|---|---|---|---|---|---|
| **R1** | `2026-09-22-frame-push-channel.sql` `e2` — a cross-user join that asserts zero rows, with **no positive control** | **MEDIUM** | **CONFIRMED** (I reproduced the vacuous pass) | none directly; it is the *proof* of the highest-blast-radius property in the file | migration |
| **R2** | the same file §6 — `split_part` does not anchor the END of the topic, and two comments say it does | LOW | CONFIRMED (executed, §2) | none today — segment 2 still binds the subscriber's own `auth.uid()` | migration |
| **R3** | `src/net/accrue.js:809` — the frame-drop streak is published on `getAccrualState()`, which has **zero production readers** | LOW | CONFIRMED (grep + `src/bug-report.js`) | self; a stuck client stays as invisible to a bug report as before | — (same-day follow-up) |
| **R4** | the same file's header — "s9 asserts it by executing a shadow settle"; `s9` does no such thing | LOW | CONFIRMED | none — the property holds by construction | — |

### R1 — MEDIUM. `e2` cannot tell "refused" from "nothing there".

`e2` sets a JWT for user A, points `realtime.topic` at user B's topic, assumes
`authenticated`, and asserts `count(*) = 0`. It never asserts that the **owner's**
join returns more than zero. If `auth.uid()` resolves to NULL for any reason the
policy denies everything, `e2` passes, and it has proved nothing at all.

**This is not hypothetical — I hit it.** `e2` sets only `request.jwt.claims`;
this repo's own `tests/sql/pglite-fixture.sql` reads
`request.jwt.claim.sub`. On my first run the identical attack returned 0 rows
against a policy that was doing **nothing**, and the only reason I noticed was
the `like 'hr:%'` control leaking 4 rows beside it. Supabase production's
`auth.uid()` does read `request.jwt.claims`, so `e2` is correct on the apply that
counts — but a check that passes both when the policy works and when it is inert
is the **always-null-probe** family, which `pglite-fixture.sql`'s own header
names, and which `s6b` in this very file was written to avoid ("s6 would pass
just as happily on a trigger that had been dropped").

**Required change:** in the same block, **before** the stranger's zero, point
`realtime.topic` at `hr_frame_topic(v_u, 0)` under v_u's own JWT and assert the
count is **> 0**; fail with "e2 proved nothing — the owner cannot read either,
so the zero below is the policy being inert, not the policy working." Set both
claim spellings while you are there, so the check is not silently inert wherever
the older GUC is what `auth.uid()` reads.

### R2 — LOW. The predicate is unanchored; two comments claim it is not.

`split_part(topic, ':', 3) ~ '^[0-5]$'` does not reject a fourth segment.
Executed: `hr:<own-uid>:0:injected` is **accepted**. The migration's §6 comment
("The three segments are matched exactly") and `LIVE_COUNTERS_PUSH.md` §6.1
point 2 (which offers precisely `hr:<uid>:0:anything` as the reason to prefer
`split_part` over `like`) are therefore **both false**: on the suffix question
the two spellings are equivalent. `e1c` does not catch it — it greps for
`~~`/`like`/`similar to`.

**Not a cross-player break, and I will not inflate it:** segment 2 still binds
`auth.uid()`, so a player reaches only `hr:<their-own-uid>:<0-5>:<anything>`, and
the emitter writes three-segment topics only, so nothing is delivered there.
Blast radius today is **none**. It matters because the file's stated reason for
its own spelling is wrong, and because the day `hr:`-prefixed topics gain a
fourth segment for anything else, this predicate silently reaches it.

**Required change:** one more conjunct —
`and array_length(string_to_array((select realtime.topic()), ':'), 1) = 3` —
and correct both comments to say what `split_part` actually buys (segment 2
pinned to the JWT, segment 3 pinned to one digit), which is real and is enough.

### R3 — LOW. The streak is counted correctly and published to nobody.

`getFrameDrops()` is folded into `getAccrualState()` under a comment reading "on
the sheet a bug report already carries". `src/bug-report.js` builds its
diagnostics from a hand-listed set and does not call `getAccrualState()`; every
consumer of that function in the tree is the smoke suite. It is reachable from
devtools on `window.HearthriseAccrual`, which is better than the nothing that
was there before — but the comment is **false in the tree**, and that is the
b339 shape this lane just fixed for S2, one function over.

**Required change (same day, not before the merge):** carry
`window.HearthriseAccrual?.getAccrualState?.()`'s `{frame, drops, verdict}` into
`bug-report.js`'s diagnostics, or correct the comment to say devtools. I will
not hold a proven S1/S2 fix hostage to a one-line diagnostics wire, and I will
not let the comment ship saying something untrue.

### R4 — LOW. The header overstates which check proves the shadow property.

The header says "s9 asserts it by executing a shadow settle". `s9` is the
no-INSERT-policy check. The shadow property is `e4`/`e4b`, a **source-position**
check on `hr_tick_settle` (first occurrence of `hr_tick_shadow` vs `hr_apply`).
The property itself holds by construction — an `AFTER UPDATE` trigger cannot fire
where no row is written — and `e4` pins the structure, so this is an honesty gap,
not a hole. The probe-trigger machinery already in the file (`hr922_probe_emit`
+ the `hr922.fires` counter) would make an executed shadow settle nearly free;
recommended, not required. **Fix the header either way.**

---

## 4. Security's eleven conditions, re-graded by me

The lane's own §6.2 checklist claims 10 of 11 met with condition 8 open, and
invites a re-verify to attack it rather than restate it. My grading:

| # | Lane says | I say | On what |
|---|---|---|---|
| 1 | MET | **MET** | the file replays; `schema-drift`, `selfcheck-no-global-dml`, `apply-order-honesty` all exit 0 |
| 2 | MET | **MET (property), WEAK (proof)** | §2 above — I executed it; **R1** is the proof's gap |
| 3 | MET | **MET** | no INSERT/ALL/UPDATE/DELETE policy; `revoke … from public` first, then anon/authenticated/service_role/hr_engine/hr_tick; `s4` asserts all four client roles |
| 4 | MET | **MET, and well** | `s5` (armed + committed), `s5b` (a deliberately throwing probe trigger, payment intact, plus `s5b2` proving the probe fired at all), `s5c3` (the handler **follows** the send in the source, so it wraps it) |
| 5 | MET | **MET** | `s1` (flag false), `e6` (missing/NULL row fails closed) |
| 6 | MET | **MET** | `e3`, `e3b` (no `nextval`/`+1` derivation), `e3c` (a version that goes down still emits) |
| 7 | MET | **MET by construction, asserted weakly** | **R4** |
| 8 | ⚠ OPEN | **OPEN — and it is the blocker on the apply** | needs a live database under load; not a worktree's to take |
| 9 | MET | **MET** | `e5`/`e5b`, the `frame_keys` CHECK, and `s1b` keeping `inventory`/`bank` out until the ABSOLUTE flip |
| 10 | MET | **MET** | `s8` in-database; the publication is unmoved |
| 11 | MET | **MET** | `revoke … from service_role` explicit; `grep` finds no service-role key anywhere in `src/**` |

**On the M6 S-5 allowlist lesson (checked, and it does not bite this file).**
The live last toucher of `hr_assert_grant_hygiene` is
`2026-09-22-trophy-claim.sql` (applied 2026-09-23T00:41:24Z; it is in
`live-hash-drift.baseline.json`, arrives with `lane/m7-bestiary-backend`, and is
not on this branch). **This migration adds no allowlist link at all** — it
appears zero times in `tools/derive-grant-hygiene.mjs`'s `LINKS`, and it never
restates the detector; `s7` only **reads** the detector's two reports and greps
them for `hr_frame_%`, which is body-agnostic and therefore safe against exactly
that skew. There is no link base here to cut wrong.
`node tools/derive-grant-hygiene.mjs --check` — exit **0**, 10 links, 11 patches.

---

## 5. Guards — exit codes I saw

| Command | Exit | Result |
|---|---|---|
| `node tests/envelope-frame-gate.mjs` | **0** | one monotonic frame gate, strictly greater, whole-frame-or-nothing, committed by all three appliers |
| `node tests/envelope-frame-gate.mjs --selftest` | **0** | **8/8 caught**, incl. the three new ones: `duplicate_dropped`→S6,F6 · `since_fails_open`→F7 · `identity_reset_missing`→S7 |
| `node tests/frame-drop-streak.mjs` | **0** | streak counted at all three appliers; `D4` pins the too-high gap **as a gap** |
| `node tests/frame-drop-streak.mjs --mutate` | **0** | 5/5 caught |
| `node tests/activity-intent.mjs` | **0** | **the economy guard that caught S1 — 22 groups, real PG18 + the deployed intent module** |
| `node tests/no-client-xp-mint.mjs` | **0** | 9 `addXp` sites, 0 unclassified; 3 direct `G.skills` writes, all named |
| `node tests/property-gate-census.mjs` | **0** | merge rule both directions; 229 sources |
| `node tests/comment-ratio-ratchet.mjs` | **0** | **was RED on the reverted merge — paid down in this lane, as §4 requires** |
| `node tests/test-file-ratchet.mjs` | **0** | **was RED — now 33.65 against a ceiling of 33.65. Green, and with nothing left.** See the runbook. |
| `node tests/ci-shape.mjs` | **0** | 193 guard commands, 193 distinct, 7 jobs |
| `node tests/schema-drift.mjs` | **0** | repo rebuilds to `ac920d6c6f9f…`; the new migration replays byte-identically |
| `node tests/apply-order-honesty.mjs` | **0** | 28 files carry a measured verdict, all agreeing with the live-hash baseline |
| `node tests/selfcheck-no-global-dml.mjs` | **0** | 208 migrations, 9 global statements, all acknowledged |
| `node tools/derive-grant-hygiene.mjs --check` | **0** | derivation in sync (10 links, 11 patches) |
| `node tests/frame-drop-streak.mjs` (S3, both directions executed) | **0** | floor too LOW: 2 drops → `hello` @900 lands, streak **0**. Floor too HIGH (4200): 3 real frames + the `hello` itself all refused, streak **4**. The gap is real, pinned, and now countable. |
| `node tools/lane-done.mjs` | **0** | **`lane-done: all green.`** 23 guards, incl. both ratchets that reddened the matrix. By `CLAUDE.md` §4 the lane is done. |
| `node tests/run-smoke.mjs` | **1** | in-page `passed 1324/1338  failed 1  skipped 13  runtime errors 0` + 4 guard failures — **NOT a valid record in this environment**, see §9. All seven `M5 regression:` tests passed. |

**The bisect, as one line:** the S1, S2 and S4 repro scripts are **byte-identical
between the two runs**; only the tree changed. Parent `1e25db3` → exit 1, 1, 1.
Head `f8f3fc05` → exit 0, 0, 0.

---

## 6. What the Coordinator needs

**The re-merge target is the SET branch (`next` / `set/b<NNN>`), not `main`.**
This lane already merged `origin/next` at `1e25db3`, so a diff against `main`
shows the day's other work — `b5e9ff4` (the Coordinator's own M7 trophy
live-hash re-measure) and `8260682` (another lane's tick hydration) — that this
lane did not author. Against `origin/next` the lane adds **exactly its own**:
`accrue.js` / `activity.js` / `gold.js`, the two guards, the in-page
regressions, the migration with its apply-order and schema-drift baselines, and
the docs.

- **`git merge origin/lane/m5-push-channel` into the set has ZERO conflict
  hunks** — `git merge-tree --write-tree` against `origin/main` (b551) exits 0.
  `CLAUDE.md` §3.3's integration rule is satisfied without a hand-resolved hunk;
  §5a of the original review is closed by the lane's own `1e25db3`.
- **No edge deploy is owed by this lane.** It touches no `supabase/functions/**`
  of its own. (The *set* may still owe one from `8260682`; that is not this
  lane's and is not this review's.)
- **No bump conflict.** The lane touches neither `src/build-info.js` nor
  `index.html` nor `CHANGELOG.md`; its ESM imports are already at `?v=551`.
- **`tests/live-hash-drift.baseline.json` is untouched by this lane** —
  correctly, it is Coordinator-only (`CLAUDE.md` §2). The two baselines it does
  move, `schema-apply-order.json` and `schema-drift.baseline.json`, are
  regenerated by their own tools and both guards are green.
- **The migration does NOT apply at this merge.** Its apply-order note reads
  `STAGED, NOT APPLIED — REVIEW ONLY`, and `apply-order-honesty` agrees.
  Per `CLAUDE.md` §3.3a a lane-C apply does not wait for the cut — but this one
  waits for **condition 8**, below.
- **⚠ `tests/test-file-ratchet.mjs` is green at exactly its ceiling**:
  `33.65` CODE lines per registered test against a ceiling of `33.65`. It is
  green and it has **nothing left in the band**. The next lane that adds code
  without tests turns it red on the set, and that will look like this lane's
  regression when it is not. Worth a `--write` re-pin by whoever lands next.

### Before the migration is applied (lane C, a separate step)

1. **R1 and R2 land in the file first** (`GO-WITH-CHANGES`, `CLAUDE.md` §2).
   Both are inside the self-check and the policy; neither needs a redesign.
2. **Condition 8 is measured** — the trigger's added lock-hold on `player_state`
   (`hr_state_of` + the `realtime.messages` INSERT, timed *inside* `hr_apply`'s
   transaction), and §3.6 restated from the measurement. This cannot be taken
   from a worktree; it is the Coordinator's or Reliability's, on a live database
   under load. **No GO for the apply until it exists.** Reliability also owes the
   WAL/retention read on one `realtime.messages` row per frame under
   `wal_level = logical` with two slots.
3. Apply with `node tools/apply-migration.mjs supabase/migrations/2026-09-22-frame-push-channel.sql`
   — one file, never inside `begin/commit`, never 00:00–00:10 UTC. It is
   ordered **after** `2026-09-21-world-tick-settle-fence.sql` and
   `2026-09-14-hr-state-of-restatement.sql`; both are live.
4. On the apply, read the NOTICEs. `e2`, `e1`, `s9` and `s9b` all **skip** where
   `realtime.messages` is absent — on production it is present, so a
   `SKIPPED` notice there means the check did not run and the apply must be
   treated as unverified for condition 2, not as passed.
5. Applying changes the behaviour of nothing: `frame_push` ships `false`, and
   `s1` fails the apply if it does not. The undo is
   `update public.hr_tick_config set frame_push = false;` — no deploy, no schema
   change, no player-visible effect.
6. Then `live-hash-drift --live --write` + whys, the apply-order note flipped to
   APPLIED, and `restore-census` (the file adds no table, so expect no new
   classification).

### Before `lane/m5-live-subscribe` (unchanged from the first review, re-checked)

S1, S2 and S4 are now on the lane and may go to `main`. Still owed by *that*
lane: the forced re-read that is allowed to **reset** the floor after N
consecutive drops (`tests/frame-drop-streak.mjs` `D4` pins the hole and **will
go red when it is closed** — that is deliberate, and the author who closes it
must come to that claim and say so); the inventory/bank ABSOLUTE flip
(`WORLD_TICK_DESIGN.md` §7a step 1) before any frame carries `inventory` —
`s1b` enforces the ordering from the database side; `RESIDUE_FIELDS` gains
nothing; one Realtime client and one connection; `setAuth` re-run on every token
refresh.

---

## 7. Residual risk I am accepting

- **Closed.** Nothing in this lane lets a forged client value cross into another
  player's economy or ranking. The client sends `{ slot }`, authors no version,
  persists no frame, and the gate is raise-only. S1's new re-apply arm is
  **idempotent on the one thing that is an event** — the away collect receipt
  that feeds the Muster's shared meter — which I executed, not read. The
  `CLAUDE.md` §1 target property is intact.
- **Closed, and now proven rather than intended.** The cross-player
  confidentiality property of the push channel: a subscriber authenticated as
  one user reads zero rows on another user's topic, on both slots, against a
  control that leaks. This was the single largest open item of the first review.
- **Bounded.** R2's unanchored predicate reaches only the subscriber's own
  `hr:<uid>:<0-5>:<suffix>`, where the emitter never writes. No data is
  delivered there today.
- **Remains, self-only, and now SAYABLE but not SAID.** A client whose floor is
  stuck high still drops every frame including its own healer. The streak is
  counted and pinned by `D4`; it reaches `getAccrualState()` and no further
  (**R3**), so a bug report still cannot tell a stuck client from a quiet one.
  `CLAUDE.md` §3.4's two-day rule still applies to that blindness.
- **Remains, unmeasured by anyone.** Condition 8 — the emitter's cost inside
  `hr_apply`'s row lock on the money write path. And there is still no load test
  against a real Realtime tenant at any concurrency; the 500-connection ceiling
  is a quota line, not an observation. The document says both itself.
- **Remains, and no spend may rest on it.** Every dollar in §3.4 is `[R]`.
  `supabase.com` is blocked by this environment's egress proxy, so I could not
  verify them either. The 2026-08-17 freeze holds; none is requested.
- **Not a valid record here.** See §5's note on `run-smoke.mjs` below — the
  in-page suite's record of truth is the GitHub run on the release SHA
  (`CLAUDE.md` §3.3), not this container.

---

## 8. What I checked this pass and found CORRECT

Recorded so the next reviewer does not re-derive it, and because two of these
are places I expected to find something and did not.

| Question | Answer |
|---|---|
| **Does the swallowed `enable row level security` leave a hole?** §6 tries it and catches `insufficient_privilege` with a notice reading "Supabase manages it; the policy below is what matters" — and the policy does **not** matter if RLS is off. Nothing in the file asserts `relrowsecurity`. | **No hole. `e2` catches it.** I built all four worlds and executed them: with RLS **off**, grants alone decide and the cross-user join returns every topic's rows (3), so `e2` **raises**. The only world where `e2` passes while the property is not held is `auth.uid()` NULL **with RLS on** — which is **R1**, and only R1. I went looking for a second finding here and there is not one. An explicit `relrowsecurity` assertion would still be a cheap belt, but it is not required. |
| Is the `duplicate` re-apply arm idempotent on anything that is not state? | **Yes** — §1.1. The collect receipt is the only event on that path and it is suppressed on the arm; a retransmit hangs it once. |
| Does a `duplicate` correction wrongly clear or wrongly raise the drop streak? | **Neither, and that is right.** `commitFrame` is raise-only, so the duplicate's commit is a no-op and `clearFrameDrops()` does not run; the duplicate arm does not call `noteFrameDrop` either. A correction leaves the streak untouched, which is honest: an equal frame proves the floor is not too high, but it does not prove frames are advancing. |
| `search_path` hijacking of the SECURITY DEFINER emitter? | **No.** `set search_path = public` on both functions, and every call inside the emitter is schema-qualified (`public.hr_tick_config`, `public.hr_state_of`, `public.hr_frame_topic`, `realtime.send`, `to_regprocedure('realtime.send(...)')`). |
| Does the lane persist a frame number, or send one? | **No** — unchanged from the first review, re-checked: the floor is module scope, absent from `RESIDUE_FIELDS`, and `buildAccrueRequest` still sends `{ slot }`. No residue-ahead. |
| Does the trigger's `WHEN` clause let a housekeeping write masquerade as a frame? | **No.** `when (new.version is distinct from old.version)`; `s6` proves the negative and **`s6b` is the control** that proves `s6` was measuring a trigger that exists. That control is the difference between a guard and decoration, and the file wrote it unprompted. |
| Does the emitter's `exception when others` actually wrap the send, or merely coexist with it? | **It wraps it, and this is asserted.** `s5c3` compares source positions: a handler that came *before* the `realtime.send` would catch nothing and would read, to a skimmer, exactly like one that does. This is the sharpest check in the file. |
| Does this lane add an allowlist link that could be cut off a stale base (the M6 S-5 lesson)? | **It adds none.** §4 above; `derive-grant-hygiene --check` exit 0. |
| Do the two new guards actually run on the record gate, or only locally? | **They run.** Both are registered in `.github/workflows/smoke.yml`'s `client-guards` job (`CLAUDE.md` §5's rule that new guards are registered *there*), `node tests/run-ci-local.mjs --list` enumerates all four commands, and `ci-shape` agrees at 193 distinct commands across 7 jobs. A guard that is not in the workflow never runs on the SHA that decides. |
| Does the lane touch the Coordinator-only live-hash baseline? | **No.** §6 above. |
| Did the comment-ratchet paydown (`f8f3fc05`, −129/+68 lines) thin any load-bearing prose? | **No — it compressed, it did not delete.** I diffed every removed line against the surviving text: "advancing and applying are different questions", "this counts the state; it does not fix it", "counted at the appliers, never in `classifyFrame`", the healer's honest limit and the S4 note all survive in tighter form. **No guard was loosened to get the ratchet green** (`CLAUDE.md` §2), which is the thing I was actually checking for. One casualty is worth naming: the removed text said the streak is sayable "by the diagnostics sheet, **by a bug report**, and by `tests/frame-drop-streak.mjs`" — the bug-report half was already untrue and the surviving comment still says it. That is **R3**. |
| Does every SEC finding carry an in-page regression under "regression suite" (`CLAUDE.md` §4)? | **S1, S2 and S3 do** — `M5 · regression suite` at `record-seam-and-hydration.js:7909`, seven tests, three of them named for the findings. **S4 does not**, and that is right: it is latent with no production caller, and it carries the headless claim `F7` plus the `since_fails_open` mutation. |

---

## 9. Note on `node tests/run-smoke.mjs` in this container

Recorded once, honestly, because it is the same limit as the first review and it
is **not** a statement about this lane either way. This container has no Supabase
egress and does not ship the Chromium build the repo pins (it has 1194; the
suite asks for 1234, which I shimmed under `/opt/pw-browsers/` to get the run to
start at all). Per `CLAUDE.md` §3.3 **the record gate is the GitHub run on the
release SHA**, not a local suite — so what follows is a smoke signal, not a
record, and this review does not rest on it.

```
Hearthrise smoke suite — v0.9.2-beta (b551)
  passed 1324/1338   failed 1   skipped 13   runtime errors 0
```

**All seven `M5 regression:` tests PASSED** — the three named for S1, S2 and S3
among them. None appears in the failure list.

| ✗ | Attributable to |
|---|---|
| `errors: clean log` — 6 × `unhandled-rejection: Failed to fetch` | **this container's egress**, not the lane |
| `Edge payload guard` — `GET …/functions/v1/hr-accrue` → **403** | **the proxy**, not the lane |
| `Account-wall guard` / `Cold-load guard` — `pageerror: Failed to fetch` | **this container's egress**, not the lane |
| `Reachability guard` — `#btn-settings-rail` at y 731..769 in a 768 px viewport | **plausibly the shimmed Chromium 1194** (1 px), unverified — identical to the first pass |

**⚠ AND ONE THING THE FIRST PASS FLAGGED IS GONE.** That run was
`1317/1332 failed 2`; the second ✗ was `B354-13-CONTROL` in
`market-night-and-prices.js` ("day N of the cycle pays no gems, so the gem half
of this test has no subject"), which I could not attribute and warned might make
the GitHub `smoke` job unreachable for every later build — the b512 shape. **It
does not appear at all in today's run.** That confirms what I suspected: it is
**day-of-cycle dependent**, not this lane's, and not red today. It is still an
unpinned clock (`CLAUDE.md` §4: "clock pinned, state torn down") and will come
back on the wrong cycle day, so it is worth a ticket — but it is **not blocking
this lane and not a P1 today**, and I am withdrawing the "may make the CI gate
unreachable" warning as it applied to this build.

---

## 10. ⚠ What `schema-drift`'s green does NOT cover

`node tests/schema-drift.mjs` exits 0 and the migration replays byte-identically
— but the replay is PGlite, and **nothing in this repo creates a `realtime`
schema**: the fixture does not, and the only migration that names
`realtime.messages` is this one, which guards on its absence. So in the replay:

| Self-check | Replay | Covers |
|---|---|---|
| `s1`–`s8`, `e3`–`e6` | **RUN** | the flag, the key set, the topic spelling, the grants, the payment-survives-a-broken-push proof, the WHEN clause + its control, grant hygiene, the publication, the frame number, the shadow structure, the whole-projection rule, the missing-config row |
| `e1`, `e1b`, `e1c`, `e2`, `s9`, `s9b` | **SKIP** | **conditions 2 and 3 — the RLS predicate and the no-INSERT rule** |

**So a green `schema-drift` is not evidence for the two highest-blast-radius
conditions in the file.** That is the whole reason §2 of this re-verify exists,
and the whole reason runbook item 4 says a `SKIPPED` notice on the *production*
apply means unverified, not passed.

---
---

# RE-VERIFY 3 — 2026-09-23 (third pass, same reviewer)

**Lane:** `lane/m5-push-channel` @ `622d4c45`. **Branch:** `sec/m5-push-channel-3`,
cut from that head, docs-only.
**Why this pass exists:** after RE-VERIFY's `MIGRATION: GO-WITH-CHANGES`, commit
`622d4c45` rewrote the self-check's `e4` arm — `to_regprocedure('public.hr_tick_settle(int)')`
was NULL in every database (the real signature carries nine arguments), so
`e4`/`e4b` had never executed anywhere. The arm now loops `pg_proc` by
`proname`, grades every overload, raises `e4c` on no match, strips comments
before the ordering test, and adds `e4d`. `tests/schema-drift.mjs` gained
`frame_e4_homes_on_nothing`. **Under review:** `git diff a030727f..622d4c45`
(74 lines in the migration, 20 in the mutation table). `npm install
--no-audit --no-fund` clean.

**Everything below is an exit code or a replay transcript I read. Nothing below
is a diff I approved by reading.**

---

## Verdicts

**`e4` REWRITE (the diff under review): GO.** It converts an arm that could not
fail anywhere into one that fails on every defect I could plant in its own
shape. Four arms, four executed refusals. It is a pure catalogue READ.

**MIGRATION `2026-09-22-frame-push-channel.sql`: GO-WITH-CHANGES — UNCHANGED,
AND NOT YET EARNED. The apply is BLOCKED today.** RE-VERIFY's two required
changes, **R1 and R2, have not landed**; condition 8 is still unmeasured; and
this pass adds **R5 and R6**, two ways to defeat `e4b`/`e4d` silently, both
reproduced on the replay.

**CLIENT FRAME GATE SHIP: GO (unchanged).** Nothing in this diff touches the
client. `node tools/lane-done.mjs` exits 0 at this head.

---

## 1. `e4`/`e4b`/`e4c`/`e4d`, EXECUTED

Six replays through `tests/schema-replay.mjs` `bootReplay()`. Each patches the
**fence** file (`2026-09-21-world-tick-settle-fence.sql`, which owns
`hr_tick_settle`) and asks one question: does
`2026-09-22-frame-push-channel.sql` **refuse to apply**? Every planted defect
is behaviour-preserving where it can be, so the fence's own `e15`/`e16` still
pass and the refusal is attributable to `e4` and to nothing else.

| # | What I planted | Result | Arm |
|---|---|---|---|
| A | nothing (control) | **APPLIED**, exit 0 | — |
| B | the shadow insert spelled `public.U&"hr_tick_shado\0077"` — same table, so the fence's own checks still pass, but `prosrc` no longer contains the name | **REFUSED** | `e4` |
| C | `proname = 'hr_tick_settle(int)'` — a signature spelled into the name, exactly the shipped defect | **REFUSED** | `e4c` |
| D | `if p_holder = 'no-such-holder' then v_out := public.hr_apply(…); end if;` placed **before** the shadow branch | **REFUSED** | `e4b` |
| E | the same call placed **after** the shadow insert and **before** its `return` | **REFUSED** | `e4d` |

Verbatim, from the transcript:

```
[baseline]            APPLIED
[b_no_shadow_name]    REFUSED  e4:  hr_tick_settle(text,uuid,integer,…,jsonb) no longer names hr_tick_shadow …
[c_homes_on_nothing]  REFUSED  e4c: no public.hr_tick_settle is installed, so e4 graded nothing at all …
[d_apply_before_shadow] REFUSED e4b: … reaches hr_apply BEFORE its shadow branch, so a SHADOW settle now writes player_state and emits a frame …
[e_fallthrough]       REFUSED  e4d: … writes its shadow journal row and reaches hr_apply without returning first …
```

**All four arms are load-bearing.** `e4c` is the important one: it is what stops
this arm from ever silently returning to the state `622d4c45` found it in.
`frame_e4_homes_on_nothing` is a real mutation — `node tests/schema-drift.mjs
--mutate` reports `caught frame_e4_homes_on_nothing via replay`, 17/17.

### 1.1 The arm is a pure READ — confirmed

```sql
select p.oid::regprocedure::text, pg_get_functiondef(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'hr_tick_settle'
```

Two catalogue reads and `pg_get_functiondef`. No DML, no `set_config`, no
`execute`. **Nothing of `hr_tick_settle`'s body is restated in this file** — the
arm asserts against the installed source and holds no copy of it, which is the
property that stops the two files drifting apart in silence.
`node tests/selfcheck-no-global-dml.mjs` exit 0 (210 migrations, 9 global
statements, all 9 acknowledged). `v_n` is re-initialised to 0 immediately
before the loop and read by nothing after `e4c`; no later arm is clobbered.

---

## 2. R5 and R6 — the comment stripper CAN produce a silent pass

The arm's own comment states an absolute:

> A `--` inside a string literal would strip the rest of that source line, which
> can only ever produce a false RED; **a silent pass it cannot produce.**

**That is false, and I reproduced it in both directions.**

### R5 — MEDIUM, CONFIRMED. A `--` or `/*` inside a string literal hides a real `hr_apply` call site from `e4b`.

Case **F** is case D byte-for-byte, with one `raise notice` ahead of the call on
the same source line:

```sql
if p_holder = 'no-such-holder' then raise notice 'tick -- note'; v_out := public.hr_apply(…); end if;
```

`regexp_replace(…, '--[^\n]*', '', 'g')` is not string-aware. It deletes from
the `--` inside that message to end of line — taking the `hr_apply` call with
it. `e4b` never sees the occurrence.

```
[d_apply_before_shadow]      REFUSED   (e4b)
[f_dashdash_hides_apply]     APPLIED   ← same defect, same position, one string literal added
```

Case **G** is the same with `/* … */`, both halves inside `raise notice`
messages on different lines; the block stripper is `'gs'` and non-greedy, so it
deletes everything between them — including the `hr_apply` call sitting on the
line in between. **`APPLIED`.**

The planted call is a real branch on a real parameter, not dead code. Whether
it is *reachable* is precisely what a text check cannot decide — which is the
point: `e4b` grades text, so text is all an author has to get past it.

### R6 — MEDIUM, CONFIRMED. `e4d`'s `\mreturn\M` matches inside a string literal.

Comments are stripped; **string literals are not**. Case **H** is case E plus
one line inside the shadow branch:

```sql
raise notice 'the shadow branch will return shortly';
```

```
[e_fallthrough]          REFUSED   (e4d)
[h_return_in_a_string]   APPLIED   ← identical fall-through, one notice added
```

A shadow branch that writes its journal row and falls through to `hr_apply` —
the exact failure `e4d` was added to catch — passes if anything between the two
positions merely *says* the word `return`.

### The fix, and why the obvious one is NOT the fix

The obvious repair is to strip string literals *before* comments. **I tried it
and it is worse.** Patching the stripper to
`regexp_replace(v_txt, '''(''''|[^''])*''', '''''''', 'g')` ahead of the two
existing passes turns the **unmodified, correct** `hr_tick_settle` red:

```
[i_baseline]  REFUSED   e4: … no longer names hr_tick_shadow …
```

Because `hr_tick_settle`'s comments carry bare apostrophes —
`current_setting('role')` **is the REQUEST's**, `S-3's`, the `tick's`, the
`window's` (fence lines 337, 414, 421, 423, 430). Each is an unbalanced quote, so a
strings-first pass matches across the shadow insert and deletes it.

**Comments-first is defeated by strings; strings-first is defeated by comments.
Neither regex order is sound, and no third order exists.** The stripper is
nonetheless load-bearing — `hr_tick_settle` genuinely discusses `hr_apply` in
`--` comments at lines 338, 389 and 449, all before the shadow branch at 461 —
so it cannot simply be removed either.

**Required change (one of, in preference order):**

1. **Stop grading text. Execute the property.** The probe machinery is *already
   in this file* — `hr922_probe_emit` + the `hr922.fires` counter, used by
   `e3c`. Set `hr_tick_config.shadow`, call `hr_tick_settle` with the probe
   row's arguments, and assert `hr922.fires = 0` and that `player_state.version`
   and `gold` are unmoved. An executed shadow settle cannot be fooled by a
   comment, a string literal or a stripper, and **this is what RE-VERIFY's R4
   already called "nearly free"**. It also closes R4 for real instead of by
   correcting a header.
2. **Or lex it properly** — a ~20-line PL/pgSQL single pass over `prosrc`
   tracking `in-string` / `in-line-comment` / `in-block-comment` and emitting
   code-only text. Deterministic, no backtracking, correct in both directions.
3. **Minimum, if neither lands: refuse on ambiguity.** Add `e4e` — raise if
   `prosrc` contains `--`, `/*` or `return` *inside a single-quoted literal* at
   all. A guard that stops rather than guesses is honest; one that guesses
   wrong in the passing direction is `e4(int)` again in a new costume.

**And delete the "a silent pass it cannot produce" sentence regardless of which
fix lands.** `CLAUDE.md` §4: a claim is gated on an exit code, never on
expectation. That sentence is an expectation, and it is wrong.

---

## 3. R1 and R2 — NOT LANDED

RE-VERIFY §6 lists them as the first thing owed *before the migration is
applied*, and `CLAUDE.md` §2 is explicit: **GO-WITH-CHANGES means the listed
changes land first.** I went looking for them at `622d4c45`. They are not there.

**R1 (the `e2` positive control) — ABSENT.** `e2` is unchanged at lines
587–616. It still sets one claim spelling and still asserts only a zero:

```sql
        perform set_config('request.jwt.claims',
          json_build_object('sub', v_u::text, 'role', 'authenticated')::text, true);
        perform set_config('realtime.topic',
          public.hr_frame_topic('00000000-0000-4000-8000-0000000051de'::uuid, 0), true);
        set local role authenticated;
        select count(*) into v_n from realtime.messages;
        reset role;
        if v_n <> 0 then
```

No owner-side `> 0` assertion anywhere in the block; no `request.jwt.claim.sub`.
The always-null-probe hole RE-VERIFY reproduced is open, unchanged.

**R2 (the unanchored predicate) — ABSENT, and both false comments still ship.**
Lines 303–305:

```sql
        and split_part((select realtime.topic()), ':', 1) = 'hr'
        and split_part((select realtime.topic()), ':', 2) = (select auth.uid())::text
        and split_part((select realtime.topic()), ':', 3) ~ '^[0-5]$'
```

No `array_length(string_to_array(…, ':'), 1) = 3` conjunct. And lines 292-293 still
read:

```
     match `hr:<uuid>:0:anything`, and "anything" is attacker-chosen. The three
     segments are matched exactly, and the third is a single digit because a
```

`hr:<own-uid>:0:injected` is still accepted; the sentence claiming otherwise is
still in the file. Blast radius is still **none** today (segment 2 binds
`auth.uid()`, the emitter writes three segments), exactly as graded before — but
the condition was to land the change, and it did not land.

**R3** — `a030727f` ("R3's comment is true") corrects the comment to say
devtools rather than claim a bug-report wire. That closes R3 as *honest*; the
diagnostics wire remains the same-day follow-up it always was. **R4** remains
open; fix 1 above closes it properly.

---

## 4. Re-grade: what remains before `node tools/apply-migration.mjs 2026-09-22-frame-push-channel.sql`

**MIGRATION: GO-WITH-CHANGES. Five items, all of them blocking, none of them a
redesign.**

| # | Owed | Owner | Why it blocks |
|---|---|---|---|
| **R1** | `e2` gains an owner-side `> 0` control and sets both claim spellings | the lane | `e2` is the only executed proof of the highest-blast-radius property in the file, and it passes today whether the policy works or is inert |
| **R2** | one `array_length(…) = 3` conjunct; both comments corrected | the lane | not a break today; the file's stated reason for its own spelling is false, and `CLAUDE.md` §2 means a listed change lands |
| **R5** | `e4b` cannot be defeated by a `--`/`/*` inside a string literal | the lane | reproduced: `APPLIED` on a defect that `REFUSED` without the literal |
| **R6** | `e4d`'s `return` is graded on code, not on prose | the lane | reproduced: `APPLIED` on a fall-through that `REFUSED` without the notice |
| **8** | the lock-hold measurement, §4.1 below | **Coordinator / Reliability** | `hr_apply` is the money write path; an unmeasured addition to its row lock is not something this review can lift |

Not lifted by this review, unchanged from RE-VERIFY: runbook items 3–6 (one
file, never inside `begin/commit`, never 00:00–00:10 UTC; read the NOTICEs and
treat a `SKIPPED` on production as *unverified*, not passed; then
`live-hash-drift --live --write`, the apply-order note flipped to APPLIED, and
`restore-census`).

### 4.1 CONDITION 8 — the executable procedure

The trigger is not installed on production, so its cost cannot be observed
directly without applying the thing being gated. **Measure the two statements
the trigger adds, inside a real `player_state` row lock, in a transaction that
is rolled back.** Nothing is committed: no player state is written
(`CLAUDE.md` §2), and the `realtime.messages` row `realtime.send` inserts
disappears with the rollback.

**Run as the Coordinator, one `psql` session, at the measured daily peak.** Find
the peak first — this is also the load figure the pass criteria need:

```sql
-- (L) the busiest hour of the last 7 days, and the write rate in it.
select date_trunc('hour', at) as hour,
       count(*)                as accepted_writes,
       round(count(*)/3600.0, 3) as writes_per_sec
  from public.player_intents
 where at > now() - interval '7 days'
 group by 1 order by 2 desc limit 5;
```

Then, **in that hour**:

```sql
-- CONDITION 8. Times hr_state_of + the frame_keys fold + realtime.send as one
-- unit, inside the exact lock hr_apply holds, 100 times. Ends in ROLLBACK.
-- Substitute the QA account's user_id. Never a live player picked at random.
begin;
set local hr8.user = '<QA-ACCOUNT-UUID>';
set local hr8.slot = '0';

-- (1) the lock hr_apply takes on the row it is about to write.
select version from public.player_state
 where user_id = current_setting('hr8.user')::uuid
   and slot    = current_setting('hr8.slot')::int
 for update;

-- (2) the trigger's added work, inside that lock. 100 samples, because
--     CLAUDE.md §4: one sample is not a verdict.
do $$
declare
  v_u    uuid := current_setting('hr8.user')::uuid;
  v_s    int  := current_setting('hr8.slot')::int;
  v_keys text[] := (select frame_keys from public.hr_tick_config where id limit 1);
  t0 timestamptz; i int; v_env jsonb; v_patch jsonb; v_key text;
  all_ms numeric[] := '{}'; env_ms numeric[] := '{}'; bytes int := 0;
begin
  for i in 1..100 loop
    t0 := clock_timestamp();
    v_env := public.hr_state_of(v_u, v_s);
    env_ms := env_ms || round(extract(epoch from clock_timestamp() - t0) * 1000, 3);
    v_patch := '{}'::jsonb;
    foreach v_key in array v_keys loop
      if v_env ? v_key then v_patch := v_patch || jsonb_build_object(v_key, v_env->v_key); end if;
    end loop;
    perform realtime.send(
      jsonb_build_object('t','delta','frame', 0, 'patch', v_patch),
      'frame', public.hr_frame_topic(v_u, v_s), true);
    all_ms := all_ms || round(extract(epoch from clock_timestamp() - t0) * 1000, 3);
    bytes  := greatest(bytes, octet_length(v_patch::text));
  end loop;
  raise warning 'condition8 n=% | TOTAL p50=% p95=% p99=% max=% | hr_state_of p95=% | payload_max_bytes=%',
    array_length(all_ms, 1),
    (select percentile_disc(0.50) within group (order by x) from unnest(all_ms) x),
    (select percentile_disc(0.95) within group (order by x) from unnest(all_ms) x),
    (select percentile_disc(0.99) within group (order by x) from unnest(all_ms) x),
    (select max(x) from unnest(all_ms) x),
    (select percentile_disc(0.95) within group (order by x) from unnest(env_ms) x),
    bytes;
end $$;
rollback;
```

**The numbers that pass.** All four, or condition 8 is not met and §3.6 is
restated from the measurement before it is met:

| Measure | Passes | Fails |
|---|---|---|
| `TOTAL p95` — the ms added to every accepted write, inside the lock | **≤ 10 ms** | > 10 ms |
| `TOTAL p99` / `max` — what a player feels on a bad sample | **p99 ≤ 25 ms and max ≤ 250 ms** | either exceeded |
| added load = `p95 × writes_per_sec ÷ 1000` from (L) | **≤ 0.05** (5% of one core-second per second at peak) | > 0.05 |
| `payload_max_bytes` against the Realtime broadcast limit | **≤ 64 KB** | > 64 KB (and a hard stop at 256 KB — over the limit the send throws, the emitter swallows it, and every frame for that character is silently lost) |

`hr_state_of p95` is reported separately so §3.6's `[D, UNMEASURED IN THE LOCK]`
`3.23 ms` charge can be replaced with a measured number rather than re-asserted.
Run it **twice** — once at peak, once at a quiet hour — and report both; a
number taken only when the database is idle is not a measurement of the thing
condition 8 is about.

Two honest limits on this procedure, stated so nobody reads more into the result
than it carries: it measures the added work in **one** session, so it bounds
per-write latency and CPU but says nothing about Realtime tenant behaviour at
concurrency (the 500-connection ceiling is still a quota line, not an
observation); and `realtime.send` inside a rolled-back transaction exercises the
insert but not the delivery path.

### 4.2 The WAL / retention read Reliability owes — as a question, with the queries

**The question:** *at one `realtime.messages` row per accepted write, under
`wal_level = logical` with two replication slots — (a) how many WAL bytes per
day does the frame channel add, (b) can either slot fall far enough behind to
pin WAL beyond the instance's disk headroom, and (c) does `realtime.messages`'
partition retention actually drop partitions, or do they accumulate?*

```sql
-- (a) the settings that make this a WAL question at all
select name, setting from pg_settings
 where name in ('wal_level','max_replication_slots','max_wal_size','min_wal_size',
                'wal_keep_size','max_slot_wal_keep_size','archive_mode');

-- (b) every slot: how far behind, and how much WAL it pins
select slot_name, plugin, slot_type, active, temporary, wal_status, safe_wal_size,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn))        as retained_wal,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)) as unconfirmed
  from pg_replication_slots order by restart_lsn;

-- (c) WAL on disk now
select count(*) as segments, pg_size_pretty(sum(size)) as wal_on_disk from pg_ls_waldir();

-- (d) does either slot's publication actually carry realtime.messages?
select p.pubname, p.puballtables from pg_publication p;
select p.pubname, n.nspname, c.relname
  from pg_publication_rel r
  join pg_publication p on p.oid = r.prpubid
  join pg_class c       on c.oid = r.prrelid
  join pg_namespace n   on n.oid = c.relnamespace
 where n.nspname = 'realtime';

-- (e) the partitions, their size, and whether old ones are being dropped
select c.relname, c.relpersistence, c.relreplident,
       pg_size_pretty(pg_total_relation_size(c.oid)) as total,
       c.reltuples::bigint                            as est_rows
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'realtime' and c.relname like 'messages%'
 order by c.relname;

-- (f) growth MEASURED, not estimated: run twice, 600 s apart.
select pg_current_wal_lsn(), now();
-- bytes/day = pg_wal_lsn_diff(lsn_1, lsn_0) * 144
```

**What the answer has to establish before condition 8 is signed off:** that
`(f)` measured *with* the frame channel's projected row rate still leaves
`safe_wal_size` positive on **both** slots at their worst observed lag from
`(b)`, and that `(e)` shows partitions being dropped rather than accumulating.
If `(d)` shows neither publication carries `realtime.messages`, say so — the
WAL question shrinks to plain heap growth and `(e)` alone decides it. That is a
Reliability answer, not a Security one; this review does not grade it, it only
refuses to call condition 8 met without it.

---

## 5. Guards — exit codes I read, on `622d4c45`

`$?` captured after each command; no `|| echo` anywhere (`CLAUDE.md` §4).

| Command | Exit | Last line |
|---|---|---|
| `node tests/schema-drift.mjs` | **0** | `OK — repo rebuilds to the committed fingerprint (65061ed937e4…)` |
| `node tests/schema-drift.mjs --mutate` | **0** | `all 17 planted defects caught` — incl. `caught frame_e4_homes_on_nothing via replay` |
| `node tests/selfcheck-no-global-dml.mjs` | **0** | `OK — 210 migrations, 9 global statement(s), all 9 acknowledged with a written reason` |
| `node tests/envelope-frame-gate.mjs` | **0** | `OK — one monotonic frame gate, strictly greater, whole-frame-or-nothing, committed by all three appliers.` |
| `node tests/apply-order-honesty.mjs` | **0** | `30 file(s) carry a measured verdict (30 evidenced-live, 0 evidenced-absent) and every note about them agrees with tests/live-hash-drift.baseline.json.` |
| `node tests/guard-hygiene.mjs` | **0** | `PASSED — no orphans, no ghosts, no stale entries, no vacuous proofs.` |
| `node tools/lane-done.mjs` | **0** | `lane-done: all green.` (24 steps) |

`apply-order-honesty` is **green**, not red: the frame-push note still reads
`STAGED, NOT APPLIED — REVIEW ONLY` and agrees with the baseline, which is
correct for a file that has not been applied. `tests/live-hash-drift.baseline.json`
is untouched by this branch (`CLAUDE.md` §2 — Coordinator-only).

**⚠ And `guard-hygiene`'s green is worth reading narrowly.** It reports `100
workflow step(s) claim a mutation proof; each resolves to a file that branches
on the flag`. That is a proof that the mutation *exists and is wired*, which is
exactly what `frame_e4_homes_on_nothing` now supplies — and exactly what the
arm lacked for its whole life before `622d4c45`, while every guard in this table
was green. R5 and R6 are the same shape one layer down: the mutation table
plants the defect the author thought of, and `--mutate`'s green says nothing
about the two I planted in §2.

---

## 6. What I checked this pass and found CORRECT

| Question I attacked | Answer |
|---|---|
| Does `e4c` actually fire, or is it unreachable like the arm it replaced? | **Fires.** Case C, the shipped mutation's own shape: `REFUSED`. |
| Does the loop grade *every* overload, or stop at the first? | **Every one.** `for … loop` over `pg_proc` ordered by `oid`, each graded, `v_n` counted; a second `hr_tick_settle` carrying its own shadow branch is graded too. |
| Can `e4d`'s `substring(… for position(apply) - position(shadow))` take a negative length and error instead of asserting? | **No.** Negative length is only possible when `apply < shadow`, and `e4b` raises on that first, in the same iteration, before `e4d` is evaluated. |
| Does `v_n := 0` clobber a later arm? | **No.** `v_n` is re-initialised immediately before the loop and read by nothing after `e4c`. |
| Does the arm restate any part of `hr_tick_settle`? | **No.** It reads `pg_get_functiondef` and holds no copy. §1.1. |
| Is the comment stripper load-bearing, or could it just be deleted? | **Load-bearing.** `hr_tick_settle` discusses `hr_apply` in `--` comments at fence lines 338, 389 and 449, all ahead of the shadow branch at 461. Without stripping, `e4b` fires on a correct function. That is why R5's fix is "execute the property", not "remove the stripper". |
| Did this diff touch the client, the build, or any baseline it may not? | **No.** Two files: the migration and the mutation table. `lane-done` exit 0. |

---

## 7. Residual risk I am accepting

- **Improved, and now proven.** `e4` went from an assertion that could not fail
  anywhere to one that refuses the apply on four distinct planted defects. That
  is the single largest thing this diff buys, and it is real.
- **Open, reproduced, and mine to have caught.** R5 and R6 — `e4b` and `e4d` can
  each be defeated by a string literal. Not exploitable by a player; the exposure
  is that the property `e4` exists to pin could regress with the arm still green.
  `frame_push` ships `false` and the shadow property holds by construction today,
  so the blast radius **now** is none; the blast radius is entirely in the future
  this guard was written to protect.
- **Open, unchanged, and the reason the apply does not go.** R1 and R2 did not
  land. I am not softening a GO-WITH-CHANGES because the intervening diff was
  good work on a third thing.
- **Remains, unmeasured by anyone.** Condition 8. §4.1 is now executable end to
  end, with pass numbers, so the next round-trip is a measurement rather than a
  question. The WAL/retention read (§4.2) is Reliability's and is stated as a
  question with its queries.
- **Not re-run this pass.** The in-page suite; RE-VERIFY §9's container limits
  are unchanged and this diff touches no client file. The record gate is the
  GitHub run on the release SHA (`CLAUDE.md` §3.3).

---

# Coordinator measurement — CONDITION 8 and the WAL read (2026-09-23, 05:49–06:03 UTC)

Executed by the Coordinator on production, read-only in effect: condition 8 ran as ONE `do` block
that takes the QA character's `player_state` row lock (`for update`), runs the trigger's added work
100 times, and ends in `raise exception` carrying the numbers — the lock, the 100 `realtime.send`
inserts and everything else roll back (CLAUDE.md §2: nothing persisted). Because the migration is not
applied, `frame_keys` and `hr_frame_topic` do not exist on production yet; the block inlines the
file's own default key set (`state, skills, buffs, place`) and the topic format
(`'hr:' || user || ':' || slot`) verbatim. Character: the QA account, slot 2 (the played slot, so the
envelope is a real one — 2,168 bytes, not an empty probe).

## CONDITION 8 — three samples at a QUIET hour (0 accepted writes in the hour)

| sample (UTC) | TOTAL p50 | TOTAL p95 | TOTAL p99 | max | hr_state_of p95 | payload max |
|---|---|---|---|---|---|---|
| 05:50:46 | 7.998 ms | **10.078 ms** | 12.216 ms | 22.406 ms | 9.573 ms | 2,168 B |
| 05:51:03 | 8.105 ms | 9.918 ms | 10.356 ms | 22.277 ms | 9.394 ms | 2,168 B |
| 05:51:10 | 8.281 ms | **10.153 ms** | 10.664 ms | 23.516 ms | 9.675 ms | 2,168 B |

Against §4.1's four criteria: p99 ≤ 25 ms and max ≤ 250 ms **pass**; payload 2,168 B ≤ 64 KB
**passes**; added load = 10.15 ms × 0.018 writes/s ÷ 1000 = **0.0002 ≤ 0.05 passes** (the measured
peak hour is 22:00 UTC on 2026-09-22 with 66 accepted writes); **TOTAL p95 ≤ 10 ms is NOT MET** —
two of three samples read 10.08 and 10.15 ms and the third 9.92 ms. The line is straddled, not
cleared, and one sample is not a verdict either way. **Condition 8 is therefore not met as
specified.** The peak-hour sample (22:00 UTC) is still owed and cannot read lower.

**What the number is made of.** `hr_state_of` alone is 9.4–9.7 ms at p95 — about 94 % of the
added work. The trigger's cost is a SECOND projection of the row `hr_apply` has just written, and
`hr_apply` already computes that envelope to return it. A design that emits the frame from the
envelope `hr_apply` already holds (one projection per write, no trigger-side re-read) would remove
almost the whole charge; the `realtime.send` insert and the key fold are well under 1 ms. That is a
lane decision for backend-architect under a Security ruling, not something this measurement decides —
it is recorded here so §3.6 can be restated from a measured number instead of the `[D, UNMEASURED IN
THE LOCK] 3.23 ms` charge, which is wrong by a factor of three.

## The WAL / retention read (§4.2), answered with the queries as written

- **(a)** `wal_level = logical`, `max_replication_slots = 10`, `max_slot_wal_keep_size = 512 MB`,
  `max_wal_size = 4096 MB`, `min_wal_size = 1024 MB`, `wal_keep_size = 0`, `archive_mode = on`;
  also `archive_timeout = 120 s`, `checkpoint_timeout = 300 s`, `full_page_writes = on`,
  `wal_compression = zstd`.
- **(b)** two logical slots, both `active`, both `temporary`, `wal_status = reserved`,
  `safe_wal_size = 512 MB`, `retained_wal = 16 MB` each, `unconfirmed = 0` — neither slot is behind.
  `supabase_realtime_replication_slot_…` (wal2json) and
  `supabase_realtime_messages_replication_slot_…` (pgoutput).
- **(c)** 9 segments, 112 MB of WAL on disk.
- **(d)** `supabase_realtime` (no tables) and `supabase_realtime_messages_publication`, which
  **does carry `realtime.messages`** — so every frame row goes through the pgoutput slot and the WAL
  question is real, not plain heap growth.
- **(e)** daily partitions `messages_2026_09_20` … `messages_2026_09_26`, 24 kB each, 0 rows. None
  older than three days exists, so partitions are being created ahead; whether old ones are DROPPED
  is not yet observable — the oldest is from the install date. Re-read (e) after 2026-09-27.
- **(f)** measured twice: `82/B2003350` at 05:49:05 → `82/B70051B8` at 05:59:58 = 80 MB in 653 s.
  **That figure is NOT record volume.** `archive_timeout = 120 s` forces a 16 MB segment switch every
  two minutes on an idle server, and 5 switches × 16 MB is the whole 80 MB. The honest measure is
  `pg_stat_wal` over a 123.5 s window with no other activity: `wal_bytes` +76,297, `wal_records`
  +228, `wal_fpi` +48 across 12 tick fires — **6.4 kB, 19 records and 4 full-page images per fire,
  ≈ 55 MB/day of WAL records at the 10 s cadence** (consistent with the 2.9 GB `pg_stat_wal` has
  counted since 2026-08-17: 78 MB/day). Per fire that is one `hr_tick_cron_log` insert, one HOT
  update of `hr_tick_config`, ~1.2 HOT updates of `hr_tick_ownership`, one `net.http_request_queue`
  insert, and a `hr_tick_shadow` insert every 90 s.
- **The frame channel's projection:** one `realtime.messages` row per accepted write at ~2.2 kB
  payload ≈ 3 kB of WAL record plus amortised FPI. At the measured peak (66 writes/h) that is
  ~0.2 MB/h — nothing. At the scale the world-tick program is built for (5,000 concurrent
  characters settling every 90 s ≈ 55 writes/s) it is ~165 kB/s ≈ **14 GB/day through the pgoutput
  slot**, and a slot that falls ~52 minutes behind at that rate reaches `max_slot_wal_keep_size` and
  is invalidated. That is the number Reliability has to sign, together with a re-read of (e) once a
  partition is old enough to have been dropped.

---
---

# RE-VERIFY 4 — 2026-09-23 (fourth pass, same reviewer)

**Lane:** `lane/m5-push-channel` @ `b3a92a61`, merged with `origin/set/b551`
(docs-only on that side; zero conflict hunks, `CLAUDE.md` §3.3).
**Branch:** `sec/m5-push-channel-4`, docs-only.
**Under review:** `git diff 622d4c45..b3a92a61` on the migration
(312 lines) and `tests/schema-drift.mjs` (60), plus the Coordinator's
CONDITION 8 / WAL measurement on `set/b551` (`c3abd36b`). `npm install
--no-audit --no-fund` clean.

**Everything below is an exit code or a replay transcript I read. The one
place I state a fix, I RAN the fix and printed what it changed.**

---

## Verdicts

**MIGRATION `2026-09-22-frame-push-channel.sql`: GO-WITH-CHANGES. Two items,
both small, one of them already proven.** R1, R2, R5 and R6 are **LANDED** —
each executed, each with a planted defect that turns the apply red. The diff
also introduced one new MEDIUM, **R7**, and it is the reason this is not a
clean GO: the executed `e4` runs its probe settle as the APPLY's role, so
`hr_apply`'s impersonation seam refuses before the property can be observed,
and `e4b`/`e4d`'s zeros are earned by that seam rather than by the shadow
branch returning first. Two lines fix it and I ran the fix.

**CONDITION 8: NOT MET as specified**, and it **gates the flag flip, not the
apply** — `hr_frame_emit` returns before `hr_state_of` when `frame_push` is
false, so applying this file cannot add the measured 10.1 ms to any write.
What the apply DOES add on every accepted write for ever — one trigger
invocation and one `hr_tick_config` read — is unmeasured. §2 splits it.

**THE WAL READ: ANSWERED, and it no longer withholds condition 8.** It is a
better answer than the query I wrote asked for. Two items remain owed to
Reliability; neither blocks this apply, and both gate the flip. §3.

**CLIENT FRAME GATE SHIP: GO (unchanged).** Nothing in this diff touches the
client. `node tools/lane-done.mjs` exit 0 at this head.

---

## 1. R1, R2, R5, R6 — graded by EXECUTION

Sixteen replays through `tests/schema-replay.mjs` `bootReplay()`, `upTo` the
file under review. Each asks one question: does
`2026-09-22-frame-push-channel.sql` **refuse to apply**?

`e1`/`e1d`/`e2`/`e2a`/`s9` **skip** wherever `realtime.messages` is absent, and
it is absent from the repo's PGlite replay — so on the replay as shipped those
arms are a NOTICE, not a check. I therefore gave the replay a faithful
stand-in through `seedBefore` (`realtime.messages` with the columns the policy
and `e2a`'s probe insert read; `realtime.topic()` as the GUC Supabase sets it
from; `grant execute` so the predicate is evaluable by `authenticated`) so the
file's **own** arms EXECUTE rather than skip. The refusals below are the
migration's, not a side harness's.

| # | What I planted | Result | Arm |
|---|---|---|---|
| **A0** | nothing, `realtime` absent (the repo replay) | **APPLIED**, exit 0 | — |
| **A1** | nothing, `realtime` stand-in present | **APPLIED**, exit 0 | — |
| **R1a** | `set_config('request.jwt.claim.sub', …)` deleted — the only spelling this replay's `auth.uid()` reads | **REFUSED** | `e2a` |
| **R1b** | the predicate keeps `auth.uid()` (so `e1b`/`e1c`/`e1d` all still pass) but can never match | **REFUSED** | `e2a` |
| **R1c** | the shape-scoped policy this review warned about — owner reads, STRANGER reads too | **REFUSED** | `e2` |
| **R2a** | the `array_length` conjunct deleted from the policy | **REFUSED** | `e1d` |
| **R2b** | `hr_frame_topic` grows a fourth segment | **REFUSED** | `s3c` |
| **C** | `proname = 'hr_tick_settle(int)'` — a signature spelled into the name (RE-VERIFY 3 case C) | **REFUSED** | `e4c` |
| **E** | the shadow branch writes its row and falls through to `hr_apply` (case E) | **REFUSED** | `e4a` ⚠ |
| **H** | case E plus `raise notice '… will return shortly'` (case H, R6) | **REFUSED** | `e4a` ⚠ |
| **e4a** | the settle answers a refusal for the probe | **REFUSED** | `e4a` |
| **e4e** | `mode=shadow` reported without taking the shadow branch | **REFUSED** | `e4e` |
| **D** | a dormant `hr_apply` before the shadow branch (case D) | **APPLIED** | — (lane discloses) |
| **F** | case D plus `--` inside a string literal (case F, R5) | **APPLIED** | — |
| **F2** | ★ a **REACHABLE** `hr_apply` before the shadow branch, `--` in a string literal | **APPLIED** ← **R7** | — |
| **G2** | ★ the same reachable call with `/*` and `*/` straddling it | **APPLIED** ← **R7** | — |

Verbatim, the ones that matter:

```
✓ R1a_claim_spelling_removed      REFUSED  e2a: e2 proved nothing — the owner cannot read either, so the
                                           zero below is the policy being inert, not the policy working …
✓ R1c_shape_scoped_policy_leaks   REFUSED  e2: a subscriber authenticated as one user read 1 row(s) on
                                           ANOTHER user's topic …
✓ R2a_anchor_removed              REFUSED  e1d: the receive policy does not bound the NUMBER of topic segments …
✓ R2b_emitter_grows_a_segment     REFUSED  s3c: hr_frame_topic (hr:…:3:v2) is not three segments …
✓ C_homes_on_nothing              REFUSED  e4c: no public.hr_tick_settle is installed …
✓ e4e_shadow_row_never_written    REFUSED  e4e: the probe shadow settle wrote 0 hr_tick_shadow row(s), expected 1 …
✗ F2_REACHABLE_hidden_by_dashdash APPLIED  ← a reachable hr_apply call before the shadow branch. R7.
```

### 1.1 R1 — **LANDED.** The always-null probe is closed, and I reproduced it to prove the closure bites.

`R1a` is RE-VERIFY's finding put back byte-for-byte: delete the one claim
spelling this environment's `auth.uid()` reads and the cross-user zero becomes
the zero of a policy doing nothing. **It now refuses the apply.** `R1b` closes
the other half — a predicate that keeps `auth.uid()` in its text (so `e1b`,
`e1c` and `e1d` are all satisfied) and still matches nobody — and `e2a` refuses
that too. `R1c` is the control on the control: the shape-scoped policy leaks
and `e2` still fires on it, so the arm has not been traded for its own
positive control. Both claim spellings are set. The `insert`-and-retry has a
real SKIP path with a stated reason when the probe row cannot be seeded, which
is the honest behaviour and not a pass it has not earned.

### 1.2 R2 — **LANDED, and executed against the predicate itself.**

Against the installed policy on the stand-in, as one authenticated user:

```
own topic            hr:<me>:0            rows=2   ← the positive control; the policy is not inert
R2 suffix attack     hr:<me>:0:injected   rows=0   ← RE-VERIFY 3 measured rows=4 here
another player       hr:<other>:0         rows=0
wildcard shape       hr:%:0               rows=0
no jwt at all        hr:<me>:0            rows=0
```

The suffix `hr:<own-uid>:0:injected` is now **refused**, `e1d` refuses a policy
that loses the conjunct, `s3c` refuses an emitter that grows a segment, and both
false comments are corrected — in the migration §6 and in
`LIVE_COUNTERS_PUSH.md` §6.1, which now names the correction rather than
repeating the claim. Nothing left open.

### 1.3 R5 and R6 — **LANDED.** The stripper is gone, so neither defeat exists.

`e4` no longer reads `hr_tick_settle`'s text at all, so there is no
comments-first/strings-first order left to defeat. Case **H** — RE-VERIFY 3's
R6 reproduction, an identical fall-through that `APPLIED` once anything between
the two positions merely *said* the word `return` — now **REFUSES**. The
"a silent pass it cannot produce" sentence is gone with the stripper.
`frame_e4_shadow_emits_a_frame` and `frame_e4_shadow_pays` are real mutations:
`node tests/schema-drift.mjs --mutate` exit 0, **19/19**, both named in the
transcript. R4 is closed properly — the header now says `e4`, and `e4` is what
executes the shadow settle.

### 1.4 The arm is **NO LONGER A PURE READ** — and the probe rows do roll back

RE-VERIFY 3 confirmed `e4` was two catalogue reads. It is not any more, by
design: it now UPDATEs `player_state` twice (scoped to `v_u`, `version`
deliberately unchanged), INSERTs a lease into `hr_tick_ownership`, calls
`hr_tick_settle` (which INSERTs `hr_tick_shadow` and UPDATEs
`hr_tick_ownership`), and UPDATEs `hr_tick_config` **unscoped**:

```sql
update public.hr_tick_config set enabled = true, shadow = true where id;   -- line 810
```

That is a global write to the operator singleton, and it **arms the world tick**
for the duration of the apply transaction. I executed the rollback question
rather than reading the `begin/exception` shape. After the chain applies, on the
same database:

```
hr_tick_config       enabled=false shadow=true frame_push=false keys={state,skills,buffs,place}
hr_tick_shadow probe rows=0          hr_tick_ownership 'hr922-selfcheck' rows=0
player_state probe rows=0            realtime.messages probe rows=0
hr922 trigger still installed=0
```

**Everything rolls back**, including the probe character, the lease, the
`realtime.messages` probe row, the probe trigger and all three config columns.
`node tests/selfcheck-no-global-dml.mjs` exit 0 — **but read that narrowly**:
`--list` reports **no finding at all** in this file, because that guard's scope
is `restore-census.baseline.json`'s `player_value_tables`, and
`hr_tick_config`, `hr_tick_ownership` and `hr_tick_shadow` are **not in it**.
The two `player_state` writes ARE in scope and are correctly scoped to `v_u`;
the unscoped `hr_tick_config` write is invisible to the guard. Line 810 is not
new in class (lines 365 and 419 already wrote `frame_keys` and `frame_push`
unscoped in the same rolled-back block, reviewed and accepted in pass 1), so I
am not blocking on it — but it is new in **kind**, and two things follow that
belong in the runbook rather than in the file:

- The block holds the `hr_tick_config` singleton's row lock from line 810 to the
  rollback. The live tick driver HOT-updates that same row on **every fire**
  (the Coordinator's WAL read: ~one per 10 s). So the apply and the tick will
  briefly block each other. Bounded and short, but it is a real interaction and
  the apply should not be run with a `statement_timeout` low enough to turn it
  into a failed tick fire.
- `enabled = true` inside the apply transaction is uncommitted and invisible to
  the driver, which is why this is a note and not a finding. It is also why it
  must stay inside that block: moved one line out, it arms the tick on
  production.

---

## 2. R7 — NEW, MEDIUM, CONFIRMED. `e4` measures `hr_apply`'s impersonation seam, not the shadow branch.

`e4` exists to pin ONE property: **a shadow settle must never reach
`hr_apply`.** The arm now executes the settle and asserts zero frames (`e4b`)
and unmoved `version`/`gold` (`e4d`). But it calls `hr_tick_settle` as the
role the APPLY runs as, and `hr_apply`'s seam
(`2026-09-14-hr-apply-restatement.sql:699` — `v_role := coalesce(nullif(
current_setting('role', true), 'none'), session_user)`) refuses any caller that
is not `hr_engine`. So when a planted shadow branch DOES reach `hr_apply`, what
comes back is:

```
DEBUG hr_apply said {"ok": false, "error": "forbidden_impersonation"} (version arg 3)
```

Nothing is written, no frame is emitted, and `e4b`/`e4d` pass — **on a function
that reached `hr_apply`.** The zeros are the seam's, not the branch's. This is
the same family as R1 one layer down: a check that passes both when the property
holds and when the thing it is calling refused it. The fence's own `e12`/`e13`
gets this right, one file earlier, at line 704: `set local role hr_engine;`.

**Executed, three ways.** Each plants a REACHABLE `hr_apply` call scoped to
`e4`'s own probe uuid (so the fence's `e13` — a different probe user — cannot
be what refuses, and the verdict is attributable to `e4` alone):

```
F2  reachable hr_apply BEFORE the shadow branch, `--` in a string literal   APPLIED
G2  the same, `/*` … `*/` straddling the call                               APPLIED
E'  reachable fall-through, hr_apply's answer DISCARDED, normal shadow tuple returned  APPLIED
```

Cases **E** and **H** refuse only because the planted code *returned*
`hr_apply`'s `ok:false` to the caller, where `e4a` saw it. Discard that answer —
which is what a real regression does — and the arm is blind. And the two
mutations in `tests/schema-drift.mjs` cannot see this, because they plant a
**direct** `update public.player_state`, which bypasses `hr_apply` entirely:
they are green with the role set and green without it.

**Where the class IS still caught, stated fairly.** Unscoped — reachable for
every user, which is what an ordinary regression looks like — the fence's own
`e13` refuses it one file earlier, and I executed that too:

```
E'  fall-through for ALL users        REFUSED  e13: SHADOW mode moved player state (gold=100, version=2, …)
D   before-shadow for ALL users       REFUSED  e13: SHADOW mode moved player state (gold=100, version=2, …)
```

So the blast radius today is **none**: `frame_push` ships `false`, the shadow
branch is correct, and the fence catches the unscoped shape. What is open is
that `e4` — the arm this file adds precisely so the claim does not depend on an
argument about another file — currently depends on `hr_apply` refusing a role,
and would stay green through a probe-scoped regression. `CLAUDE.md` §4: mutate
the caller; a guard that has never been red on the thing it is about is not a
guard.

### 2.1 The required change, RUN rather than proposed

Two lines in the file under review, copied from the fence's own `e12`:

```sql
    set local role hr_engine;
    v_r := public.hr_tick_settle('hr922-selfcheck', v_u, 0, 'gather', v_v, v_tf, v_tt,
             '00000000-0000-4000-8000-00000000fa04', v_d);
    reset role;
```

I applied exactly that to the migration on the replay and re-ran the three
cases it is supposed to catch:

```
FIXED_control_unpatched             APPLIED   ← the correct function still applies
FIXED_F2_reachable_dashdash         REFUSED   e4b: a SHADOW settle emitted 1 frame(s) …
FIXED_G2_reachable_blockcomment     REFUSED   e4b: a SHADOW settle emitted 1 frame(s) …
FIXED_E_silent_fallthrough          REFUSED   e4b: a SHADOW settle emitted 1 frame(s) …
```

**All three flip to RED via `e4b`, and the control still applies.** That is the
whole change. It must ship with one more mutation in `tests/schema-drift.mjs`
that plants a **reachable, probe-scoped `hr_apply` call** (not a direct
`player_state` write) and requires `e4b`/`e4d` red — otherwise the mutation
table stays insensitive to the role and `--mutate`'s green says nothing about
whether the fix is still there. Case **D** (a genuinely dormant branch the probe
never reaches) stays invisible and the file's disclosure of that is accurate and
fairly argued; a dormant branch pays nobody, and I accept the trade in that
direction.

### 2.2 CONDITION 8 — ruling: **NOT MET**, and it gates the FLIP, not the apply

Read against §4.1's four criteria, on the measurement as written:

| Measure | Line | Measured (3 quiet-hour samples) | |
|---|---|---|---|
| `TOTAL p95` | ≤ 10 ms | **10.078 / 9.918 / 10.153 ms** | ✗ **FAIL** |
| `TOTAL p99` / `max` | ≤ 25 / ≤ 250 ms | 12.216–10.664 / 22.277–23.516 ms | ✓ |
| added load | ≤ 0.05 | 0.0002 | ✓ |
| `payload_max_bytes` | ≤ 64 KB | 2,168 B | ✓ |

Two of three samples are over the line and the third is 0.08 ms under it. The
line is straddled, not cleared; the Coordinator graded it that way and is
right. §4.1 also asked for the run **twice — once at peak, once at a quiet
hour** — and only the quiet hour was taken. The quiet hour had **zero** accepted
writes, so this is a floor, not a typical figure; contention only adds.
**CONDITION 8 IS NOT MET.**

**But it does not gate this apply, and that matters.** `hr_frame_emit`'s second
statement is:

```sql
    select * into v_cfg from public.hr_tick_config where id limit 1;
    if not found or not coalesce(v_cfg.frame_push, false) then return null; end if;
```

The emitter returns **before** `hr_state_of`. The 10.1 ms the Coordinator
measured is the cost of a flipped channel; with `frame_push = false` — how this
file ships, asserted by `s1` — applying it cannot add that time to any write. So
condition 8 splits, faithfully to what §4.1 said it was for ("an unmeasured
addition to `hr_apply`'s row lock"):

- **8a — the apply's addition, and it IS unmeasured.** Every accepted write now
  fires an `AFTER UPDATE … WHEN (new.version is distinct from old.version)`
  trigger and does one single-row read of `hr_tick_config` before returning
  null. That is almost certainly sub-millisecond and I will not assert a number
  I have not seen (`CLAUDE.md` §4). **Required: run §4.1's block unchanged with
  `frame_push` left false — three samples, quiet hour is fine, since the trigger
  is not load-sensitive — and `TOTAL p95` must read ≤ 0.5 ms.** It is the same
  `do` block, minutes of work, and it is the only latency figure the apply
  itself is answerable for.
- **8b — the flip's addition: NOT MET.** This gates `update
  public.hr_tick_config set frame_push = true`, and nothing else.

**The ONE design change I will accept for 8b** is the one the Coordinator
recorded without deciding: **the frame is emitted from the envelope `hr_apply`
already computed — one projection per accepted write, no trigger-side
`hr_state_of`.** `hr_state_of` alone is 9.4–9.7 ms at p95, ~94 % of the added
work; the `realtime.send` insert and the key fold are together under 1 ms. That
change removes almost the entire charge and removes it from inside the lock.
What it must prove, all of it executed, none of it asserted:

1. **The payload is unchanged.** For at least one real, non-empty character
   (2,168 B, not an empty probe), the patch built from `hr_apply`'s own envelope
   is **byte-identical** to the patch the trigger builds from a fresh
   `hr_state_of` at the same version. Compare them in one block; do not argue it
   from the fact that both call the same function.
2. **There is exactly ONE projection per accepted write.** Counted by execution
   — a call counter on `hr_state_of` in the style of this file's own
   `hr922.fires`, not a grep and not a comment. This is the property being
   bought; it is the one that must be pinned.
3. **A push failure still cannot fail a payment.** The file's non-negotiable.
   The emit must stay inside a swallowing `exception` block, and this file's
   existing `HR922_DELIBERATE_PUSH_FAILURE` arm must still show the payment
   committed with the frame lost.
4. **The frame gate is unmoved.** The frame still carries `hr_apply`'s
   post-write `version`, never a synthesised or incremented one, and
   `tests/envelope-frame-gate.mjs` stays green.
5. **Re-measure, at BOTH hours.** §4.1's block against the new shape: three
   samples at a quiet hour AND three at the measured peak, **22:00 UTC** (the
   Coordinator's peak: 2026-09-22, 66 accepted writes). **All three peak samples
   must read `TOTAL p95` ≤ 10 ms**, with `hr_state_of`'s own charge reported
   separately and expected to leave the added work entirely. One sample is not a
   verdict and the quiet hour already straddled the line, so a single passing
   peak sample will not lift this.
6. **Restate the documents from the measurement.** `LIVE_COUNTERS_PUSH.md` §3.6
   charges `[D, UNMEASURED IN THE LOCK] 3.23 ms` for the thing that measures
   9.4–9.7 ms — wrong by a factor of three, and it is the number the design
   decision was made on. `WORLD_TICK_DESIGN.md` §3.6 gets the same treatment
   wherever it carries that figure.

**Why 10.1 ms inside `hr_apply`'s lock is not acceptable at the scale this
program targets**, stated from the measured number rather than from principle:
the charge is not CPU, it is **serialized lock-hold on the money write path**.
At the world-tick program's own target (5,000 concurrent characters settling
every 90 s ≈ 55 accepted writes/s), 10.1 ms per write is 0.56 core-seconds of
lock time per second — **11× the 0.05 pass line**, and it is 0.56 of a
connection-second per second of extra pool occupancy on the instance every
player-facing write shares. The design target in `CLAUDE.md` §1 is "a
large-scale multiplayer semi-idle game"; doubling the projection cost of every
accepted write, inside the row lock, to copy a fact the transaction already
holds is the opposite of that, and it costs fourteen lines to not do. At today's
66 writes/hour it harms nobody — which is exactly why it is cheap to fix now and
expensive to fix after the flip.

---

## 3. The WAL / retention answer — graded

**ANSWERED, and better than the question.** §4.2 asked for `(f)` by LSN diff;
the Coordinator ran it, got 80 MB in 653 s, and **refused its own number** —
`archive_timeout = 120 s` forces a 16 MB segment switch every two minutes on an
idle server and 5 × 16 MB is the whole figure. The honest measure it substituted
(`pg_stat_wal` over a quiet 123.5 s window: +76,297 bytes, +228 records, +48
FPI across 12 tick fires = 6.4 kB/fire, ≈55 MB/day, cross-checked against
2.9 GB since 2026-08-17 = 78 MB/day) is the right instrument, and the query I
wrote would have over-reported by ~6×. That correction is credited, not merely
accepted. `(d)` settles the question the whole read existed for:
`supabase_realtime_messages_publication` **does** carry `realtime.messages`, so
every frame row goes through the pgoutput slot and this is a WAL question, not
heap growth. `(a)`, `(b)`, `(c)` are complete. **Condition 8 is no longer
withheld for want of this read** — what withholds it is the p95 in §2.2.

**What Reliability still owes, and when it is owed:**

| # | Owed | Blocks the apply? | Blocks the flip? |
|---|---|---|---|
| W1 | `(e)` re-read after **2026-09-27**, once a partition is old enough to have been dropped. Today the oldest is from the install date, so "partitions are dropped" is **not observable** — correctly named as unproven rather than assumed. | **No** | **Yes** |
| W2 | The **14 GB/day at scale** figure signed against `max_slot_wal_keep_size = 512 MB`: a slot ~52 minutes behind at 55 writes/s is **invalidated**, and an invalidated logical slot on `realtime.messages` means Realtime stops delivering — which for the frame channel is a *silent* stop, not an error a player or an operator sees. That needs a lag budget and a named detector, not a headroom calculation. | **No** | **Yes** |
| W3 | A **worst-case** slot-lag observation. `(b)` was read once at a quiet hour with both slots at zero lag, `wal_status = reserved`, `safe_wal_size = 512 MB`, `unconfirmed = 0`. §4.2 asked for `safe_wal_size` positive at each slot's **worst observed lag**; an idle reading is not that. | **No** | **Yes** |

**None of it blocks THIS apply, at today's load or at any load.** Applying the
file with `frame_push = false` writes **zero** `realtime.messages` rows and adds
**zero** WAL through either slot. The WAL question becomes real at the flip and
only at scale. W1–W3 therefore move from "condition 8 is unsigned" to "the flag
flip is unsigned", which is where they belong.

---

## 4. Guards — exit codes I read, on `8d26e2a`

`$?` captured after each command; no `|| echo` anywhere (`CLAUDE.md` §4).

| Command | Exit | Last line |
|---|---|---|
| `node tests/schema-drift.mjs` | **0** | `OK — repo rebuilds to the committed fingerprint (daaba91163f4…)` |
| `node tests/schema-drift.mjs --mutate` | **0** | `all 19 planted defects caught` — incl. `frame_e4_shadow_emits_a_frame`, `frame_e4_shadow_pays` |
| `node tests/selfcheck-no-global-dml.mjs` | **0** | `OK — 212 migrations, 9 global statement(s), all 9 acknowledged with a written reason` |
| `node tests/envelope-frame-gate.mjs` | **0** | `OK — one monotonic frame gate, strictly greater, whole-frame-or-nothing, committed by all three appliers.` |
| `node tests/apply-order-honesty.mjs` | **0** | `35 file(s) carry a measured verdict (34 evidenced-live, 1 evidenced-absent) and every note about them agrees with tests/live-hash-drift.baseline.json.` |
| `node tests/guard-hygiene.mjs` | **0** | `PASSED — no orphans, no ghosts, no stale entries, no vacuous proofs.` |
| `node tools/lane-done.mjs` | **0** | `lane-done: all green.` |

`apply-order-honesty` is green because the frame-push note still reads
`STAGED, NOT APPLIED — REVIEW ONLY`, which is correct for a file that has not
been applied. `tests/live-hash-drift.baseline.json` is untouched by the lane's
own commit (`git show --stat b3a92a61`: three files, none of them the baseline)
and untouched by this branch; its diff against `main` arrives with the
`set/b551` merge, i.e. from the Coordinator, which is where `CLAUDE.md` §2 puts
it.

**And read `--mutate`'s green narrowly, again.** 19/19 says the defects the
author thought of are caught. It says nothing about R7, whose two sibling
mutations are green with the role fix and green without it.

---

## 5. Final verdict

> ### MIGRATION `2026-09-22-frame-push-channel.sql`: **GO-WITH-CHANGES.**
> The apply may go once these two land. Nothing else is owed by anyone.

| # | Owed | Owner | Proven by |
|---|---|---|---|
| **R7** | `set local role hr_engine;` / `reset role;` around `e4`'s probe settle, plus one mutation in `tests/schema-drift.mjs` planting a **reachable, probe-scoped `hr_apply` call** (not a direct `player_state` write) that must turn `e4b`/`e4d` red | the lane | **the fix is already run** — §2.1: three defects flip to RED via `e4b`, control still applies |
| **8a** | §4.1's block with `frame_push` left **false**, three samples: `TOTAL p95` ≤ 0.5 ms | Coordinator | minutes; same block, one flag |

**LANDED this pass, nothing further owed:** **R1** (executed — `e2a` refuses the
exact vacuous pass, `e2` still refuses a real leak), **R2** (executed — the
suffix attack goes 4 rows → 0; `e1d` and `s3c` both bite; both comments
corrected in the migration and in `LIVE_COUNTERS_PUSH.md` §6.1), **R5** and
**R6** (the stripper is gone, so neither defeat exists; case H now refuses),
**R4** (closed by the arm, not by a header).

**NOT lifted, and not this apply's to lift:**

- **Condition 8b** — the flipped 10.1 ms. **NOT MET.** Gates `update
  public.hr_tick_config set frame_push = true`. One design change accepted
  (emit from `hr_apply`'s own envelope) with the six proofs in §2.2, or a
  peak-hour (22:00 UTC) re-measurement in which **all three** samples read
  `TOTAL p95` ≤ 10 ms.
- **W1 / W2 / W3** — Reliability's, and they gate the same flip. §3.
- **Runbook, unchanged from RE-VERIFY**: one file per
  `node tools/apply-migration.mjs`, never inside `begin/commit`, never
  00:00–00:10 UTC; read the NOTICEs and treat a `SKIPPED` on production as
  **unverified**, not passed — `e1`/`e2`/`e2a`/`s9` skip wherever
  `realtime.messages` is absent, and this pass only executed them against a
  stand-in; then `live-hash-drift --live --write`, the apply-order note flipped
  to APPLIED, and `restore-census`. **Added this pass:** do not run the apply
  under a `statement_timeout` short enough to be tripped by the
  `hr_tick_config` row lock the self-check and the live tick driver now
  contend for (§1.4).

**CLIENT FRAME GATE SHIP: GO (unchanged).**

---

## 6. Residual risk I am accepting

- **Real, and the largest thing this diff buys.** R1 and R2 went from "listed
  and not landed" to executed refusals, and `e4` went from a text check that two
  string literals defeated to an executed settle. Three passes of findings are
  closed here, not deferred.
- **Open, mine to have caught in pass 3.** R7. I graded the *fix direction*
  ("execute the property") without asking what role the property would be
  executed as. The lane implemented what I asked for; the gap is in what I
  asked for.
- **Accepted, with the trade stated by the lane and re-checked by me.** A
  genuinely dormant `hr_apply` branch (case D) is invisible to an executed
  arm and was caught by the text check. A dormant branch pays nobody, and the
  unscoped shape — what a regression actually looks like — is refused by the
  fence's `e13`, executed above. I take this direction over the one that passed
  **reachable** calls outright.
- **Unmeasured by anyone.** 8a, the flag-off residual. Small, and named rather
  than assumed.
- **Not re-run this pass.** The in-page suite; RE-VERIFY §9's container limits
  are unchanged and this diff touches no client file. The record gate is the
  GitHub run on the release SHA (`CLAUDE.md` §3.3).
- **Still true of every green in §4.** A guard's exit code proves the defects
  somebody planted are caught. R7 is what that sentence looks like when it
  bites.

---

# Coordinator measurement — CONDITION 8a (RE-VERIFY 4 §2.2), 2026-09-23 07:25 UTC

The apply's own addition with `frame_push` left **false**: one single-row `hr_tick_config` read and
the early return, inside the QA character's `player_state` row lock, 100 samples per run, three
runs, each rolled back through `raise exception` (nothing persisted). `frame_push` does not exist on
production until the apply, so it is read through `to_jsonb(v_cfg)->>'frame_push'` and defaults to
false, which is what `coalesce(v_cfg.frame_push, false)` will do.

| run (UTC) | early returns | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| 07:25:09 | 100/100 | 0.020 ms | **0.028 ms** | 0.054 ms | 1.072 ms |
| 07:25:13 | 100/100 | 0.021 ms | **0.030 ms** | 0.069 ms | 1.156 ms |
| 07:25:17 | 100/100 | 0.020 ms | **0.025 ms** | 0.062 ms | 1.079 ms |

**8a is MET**: every sample's `TOTAL p95` is under 0.05 ms against the ≤ 0.5 ms line. The trigger's
dispatch overhead itself is not in this figure (the trigger is not installed until the apply) and is
intrinsic to `AFTER UPDATE … WHEN (new.version is distinct from old.version)`.

Condition 8b (the flipped channel, 10.1 ms) stays NOT MET and gates the flag flip, exactly as ruled.

---
---

# Reliability — W1–W3 (2026-09-23)

Answering RE-VERIFY 4 §3's table. **None of this blocks the apply** — Security
already ruled that, and the reason holds arithmetically: with `frame_push =
false` the emitter early-returns in 0.028 ms (CONDITION 8a) and writes **zero**
`realtime.messages` rows, so zero WAL through either slot. W1–W3 gate the
**flip**, and this section signs the load ceiling the flip is safe at.

**What I could execute and what I could not.** This lane has no database access
(`CLAUDE.md` §2 — agents never touch production), so every figure below is
arithmetic on the Coordinator's own measured numbers in *Coordinator measurement
— CONDITION 8 and the WAL read* and *CONDITION 8a*, or fetched from the docs
mirror. Tags follow `LIVE_COUNTERS_PUSH.md` §3.0: **[M]** measured on this
production database, **[F]** fetched from the vendor docs source, **[D]** derived
here by arithmetic that is shown. Nothing here is **[R]**. Two reads remain owed
to the Coordinator because only a `psql` session can take them; they are the
paste block in §R4.

---

## W1 — the partition-drop question

**The vendor's claim, quoted.** Fetched 2026-09-23 from the docs source mirror
(`supabase.com` is blocked by this environment's egress proxy; the mirror is the
same content the site renders) **[F]**:

> "It uses partitioned tables per day, which allows performant deletion of your
> previous messages by dropping the physical tables of this partitioned table.
> **Tables older than 3 days are deleted.**"
>
> "Messages are stored in daily partitions, and **partitions older than 72 hours
> are dropped.** Because whole days are removed at once, a message stays
> available for at least 72 hours and at most 4 days, depending on the time of
> day it was sent."

Source: `raw.githubusercontent.com/supabase/supabase/master/apps/docs/content/guides/realtime/broadcast.mdx`
(lines 1021 and 1137), which renders as **https://supabase.com/docs/guides/realtime/broadcast**.

**What the Coordinator must read, and when.** Re-run query (e) verbatim. The
first drop is observable **2026-09-24**, not 09-27: `messages_2026_09_20` turns
four days old that day and "at most 4 days" expires it. Security's 09-27 date is
the better one to *sign* on, because one disappearance could be an install
artifact and 09-27 gives four consecutive drop events — so read it on both dates
and sign on the second.

```sql
-- W1. The partition roll. Run 2026-09-24 and again after 2026-09-27.
select c.relname, c.relpersistence, c.relreplident,
       pg_size_pretty(pg_total_relation_size(c.oid)) as total,
       c.reltuples::bigint                            as est_rows
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'realtime' and c.relname like 'messages%'
 order by c.relname;
```

**Expected output if drops happen.** On 2026-09-28 the list is a *rolling window
that has moved*, not a list that has grown: `messages_2026_09_20` through
`messages_2026_09_24` are **ABSENT**, and what remains is roughly
`messages_2026_09_25 … messages_2026_09_31` — the same **7 rows** (3 back + today
+ 3 created ahead) the 09-23 read returned **[M]**, with every name advanced by
five days. The count staying at ~7 while the names advance **is** the proof;
`messages_2026_09_20` still being present on 09-28 **is** the failure. Note the
parent `realtime.messages` row itself never drops — do not read its presence as a
failure.

**What to do if they do not drop.** Retention is the Realtime service's job, not
this database's: the 09-23 read found no such job and the repo has no evidence of
one. Establish which it is before escalating —

```sql
-- W1b. Is anything in THIS database scheduled to drop them?
select jobid, jobname, schedule, command, active from cron.job
 where command ilike '%realtime%' or command ilike '%messages%';
```

If W1b returns **0 rows** (the expected case) and the partitions are still
accumulating on 09-28, the vendor's documented behaviour is not happening on this
project and that is a **support escalation**, not a migration. Do not hand-drop
the partitions: `realtime.messages` is owned by `supabase_admin`, the 09-22 file
already records that this role cannot so much as `alter table … enable row level
security` on it without a notice, and a hand-drop races the service that creates
them. The interim mitigation is the flag itself — `update public.hr_tick_config
set frame_push = false;` returns the growth to zero on the next write, which is
precisely why the kill switch is a config read and not a deploy.

**The size of the downside, so the escalation can be priced [D].** Undropped
partitions grow at `writes/s × 86,400 × 2.2 kB`:

| accepted writes/s | rows/day | heap/day, never reclaimed |
|---|---|---|
| 0.018 (today's measured peak, 66/h) **[M]** | 1,584 | **3.5 MB** |
| 1.0 (the §R3 ceiling) | 86,400 | **190 MB** |
| 55.6 (5,000 chars @ 90 s) | 4.8 M | **10.6 GB** |

At beta load a broken retention job is a curiosity — 3.5 MB/day, years of
runway. At 5,000 characters it ends a Micro instance inside a week. **W1 is
therefore a scale gate, not a beta gate**, and §R3's ceiling is set low enough
that the 09-24/09-28 reads can settle it without risk in the meantime.

**What I could not verify from the repo, stated plainly.** (1) Whether the drop
is a `cron.job` row, a `realtime` internal process, or the Elixir service — the
repo holds no dump of the `cron` or `realtime` schemas, so W1b is a genuine
unknown until someone runs it. (2) `realtime.messages` is **not classified by
`tests/restore-census.mjs`** — I read `tests/restore-census.baseline.json` and it
contains no `realtime` entry, so this table's growth sits outside the durability
inventory entirely. If the flip goes, the census needs a row for it; that is a
lane, and it is named here rather than assumed.

---

## W2 — slot keep at scale, and the detector

**The arithmetic, corrected in one place [D].** Security's figure is one slot's
worth of *frame* WAL: 55.6 writes/s × 3 kB = 167 kB/s = **14.4 GB/day**, and
512 MB ÷ 167 kB/s ≈ 52 min. Two corrections, both of which shorten the fuse:

1. **`max_slot_wal_keep_size` is a Postgres GUC, so its "MB" is 1,048,576 bytes**,
   not 1,000,000. 512 MB = 536,870,912 B. Against frame WAL alone that is
   **53.7 min**, not 52 — the only correction here that moves the number the
   *right* way.
2. **A slot pins ALL WAL, not its own publication's share.** `restart_lsn` is a
   position in the single physical WAL stream; the frame rows do not travel in a
   private one. So the budget is consumed by the frame rows *plus* the
   `player_state` applies that trigger them (~2 kB/apply **[M**,
   `restore-runbook.md` §14f**]**) plus the tick machinery (55 MB/day **[M]**,
   0.6 kB/s, negligible):

   | component | at 55.6 writes/s | per day |
   |---|---|---|
   | frame rows @ 3 kB | 167 kB/s | 14.4 GB |
   | `player_state` applies @ 2 kB | 111 kB/s | 9.6 GB |
   | tick machinery **[M]** | 0.6 kB/s | 0.055 GB |
   | **total** | **278 kB/s** | **24.0 GB** |

   536,870,912 B ÷ 278,000 B/s = 1,931 s = **32.2 minutes**. *That* is the number
   to sign: **a slot 32 minutes behind at 5,000 characters is invalidated**, not
   52. And `max_slot_wal_keep_size` is enforced at **checkpoint**, with
   `checkpoint_timeout = 300 s` **[M]** — so the enforcement granularity is up to
   5 minutes, and the usable budget is nearer **27 minutes**.

**What invalidation does, and why it is silent.** `wal_status` walks
`reserved → extended → unreserved → lost`. At `lost` the slot's WAL is gone and
Realtime cannot resume decoding from `restart_lsn`; delivery on
`realtime.messages` stops. Nothing in the frame channel notices: the client's
frame gate is monotonic and *whole-frame-or-nothing*, so a channel that simply
stops sending frames looks exactly like a character that stopped settling. No
error, no refusal, no red guard — the player sees numbers that quietly stop
moving, which is the failure mode `CLAUDE.md` §6 exists to forbid. **This is why
W2 asks for a detector and not a headroom calculation.**

**And the second silent stop, which the lag alarm alone would miss.** Both slots
read `temporary = true` **[M]**. A temporary slot is dropped when its owning
session ends, so when Realtime reconnects the slot **disappears and a new one is
created under a new name**. Two consequences the alarm must carry:

- **An alarm keyed to an exact `slot_name` monitors nothing after the first
  Realtime restart** — the name carries a suffix
  (`supabase_realtime_messages_replication_slot_…`). Match on `plugin` and prefix.
- **Absence is a stop.** Zero rows for the pgoutput slot is not "no lag", it is
  "no channel". The detector must be two-sided: alarm on lag, *and* alarm on
  count = 0.

**The detector [D].** Thresholds expressed on `safe_wal_size` (bytes remaining
before invalidation risk), because `wal_status` is already too late to be an
alarm — `unreserved` means the budget is spent:

| condition | meaning | action |
|---|---|---|
| pgoutput slot row count = 0 | Realtime is not decoding at all | **PAGE** |
| `wal_status <> 'reserved'` | budget spent or slot lost | **PAGE** |
| `safe_wal_size < 384 MB` (128 MB retained, 25 % of budget) | ~8 min of runway at scale, ~7.5 h at the §R3 ceiling | **ALARM** |
| `safe_wal_size < 256 MB` (50 % of budget) | ~16 min at scale | **PAGE** |
| `active = false` on a slot that exists | owner gone, WAL still pinned | **ALARM** |

The exact read is `(W2)` in §R4. Poll it every **60 s** at the §R3 ceiling and
every **30 s** above 10 writes/s — an alarm whose poll interval is a third of the
runway it guards is not an alarm. At 5,000 characters the 8-minute runway between
ALARM and invalidation is shorter than most human responses, which is the honest
argument that **512 MB is not a 5,000-character setting** (§R3).

---

## W3 — two slots, and what is actually multiplied

**Does the wal2json slot carry the frame rows? No — and the repo's own
measurement settles it, not an assumption.** Read (d) returned two publications
**[M]**: `supabase_realtime` (**no tables**, which is `postgres_changes`' own
publication, trimmed) and `supabase_realtime_messages_publication`, which **does**
carry `realtime.messages`. Logical decoding filters output by publication
membership, so the pgoutput slot
(`supabase_realtime_messages_replication_slot_…`) emits every frame row and the
wal2json slot (`supabase_realtime_replication_slot_…`, `postgres_changes`) emits
**none of them** — its publication has nothing in it to emit. Confirm it has not
drifted with `(W3)` in §R4 before the flip; a future lane adding a table to
`supabase_realtime` changes this answer silently.

**The WAL multiplier if both did carry them: still 1× on bytes written.** This is
the part worth stating precisely, because "two slots" invites a doubling that does
not exist. WAL is written **once**, by the inserting backend, into one physical
stream; `wal_level = logical` **[M]** already paid the extra cost and it is inside
the measured 3 kB. A second slot copies nothing, writes nothing and stores
nothing. So:

| resource | multiplier at 2 slots | why |
|---|---|---|
| **WAL bytes written / on disk** | **1×** | one stream; slots hold positions in it, they do not copy it |
| **WAL retention** | **1×, set by the OLDEST `restart_lsn`** | the laggiest slot decides what checkpoint may remove |
| **decode CPU** | **2×** | every slot reads and discards every record, including the ones it filters away |
| **`logical_decoding_work_mem`** | **2×, per slot** | 64 MB default each; a transaction past it spills to `pg_replslot/<slot>/` on the same disk |
| **egress / Realtime messages** | **1×** | only the pgoutput slot has anything to deliver |

**The non-obvious consequence, and it is the one that bites.** Because retention
is set by the oldest `restart_lsn` across *all* slots, **the wal2json slot — which
delivers zero frame rows — can pin the WAL the frame rows generate.** A stalled
`postgres_changes` slot holds 24 GB/day of disk it has no stake in, and it reaches
its own 512 MB invalidation on the same 32-minute clock (§W2) even though every
byte it is counting belongs to a publication it does not carry. The detector in
§W2 therefore alarms on **both** slots by design — `(W2)` deliberately has no
`where plugin = 'pgoutput'` filter. Monitoring only the slot that matters is how
this one gets missed.

One check the 09-23 read did not report and `(W3)` now takes: `relreplident` on
`realtime.messages`. If it is `f` (FULL), UPDATEs and DELETEs log the old tuple
too. The frame channel only ever **inserts**, so FULL costs it nothing today — but
the partition drop is a `DROP TABLE`, not a `DELETE`, precisely so that reclaiming
three days of rows costs no WAL at all. That is a second reason W1's answer has to
be "the partitions are dropped": if retention ever degrades to `DELETE`, the WAL
bill in §W2 roughly doubles and every number above is wrong.

---

## SIGN-OFF

> ### The flip is safe TODAY, on Micro, at **≤ 1.0 accepted write/s sustained** (≤ 3,600/hour).
> ### That is **55× today's measured peak** of 66 writes/hour **[M]**. Above it, do not flip.

**Why 1.0/s and not 4.9/s.** The CPU line is higher: §4.1's criterion is
`p95 × writes/s ÷ 1000 ≤ 0.05`, and at the measured 10.153 ms that permits
**4.92 writes/s** **[D]**. I am not signing the line, for two reasons, both
arithmetic. (1) 4.92/s *is* the criterion, with no margin, computed from a p95
that CONDITION 8 already ruled **NOT MET** — signing a ceiling off a failing
measurement at its exact boundary is how 10.15 ms becomes 12 ms in production and
nobody notices. (2) W1 is unproven until 09-28, and the downside of a broken
retention job is priced at 190 MB/day at 1.0/s (≈0.95 GB across the five days to
the confirming read — absorbable on a Micro) against **3.7 GB** at 4.92/s over the
same window. 1.0/s buys the W1 answer for free. At 1.0/s every budget is
comfortable, not merely inside: CPU **1.02 %** of one core against the 5 % line;
WAL **432 MB/day** (5 kB/s: 3 kB frame + 2 kB apply), giving **29.8 hours** of
slot lag before invalidation against 512 MB; Realtime **1 msg/s** against the
500/s Pro-with-cap line; and ~90 concurrent characters at the shipped 90 s flush,
against the 500-connection wall that `LIVE_COUNTERS_PUSH.md` §3.3 correctly names
as the binding Realtime limit.

**The two reads that must stay under it.** Both are in §R4; both are the
Coordinator's, and neither is satisfied by having been green once.

1. **`(L)` — load.** `max(accepted_writes)` over the last 7 days of
   `public.player_intents` must stay **< 3,600 per hour**. If any hour crosses it,
   `frame_push` goes back to false and the ceiling is re-signed against a fresh
   CONDITION 8 at that load — the 10.153 ms p95 was measured at a **quiet** hour
   and cannot be assumed to hold at a busy one.
2. **`(W2)` — slot health.** Every row: `wal_status = 'reserved'` **and**
   `safe_wal_size ≥ 384 MB` **and** at least one row with `plugin = 'pgoutput'`.
   Zero pgoutput rows fails this read even though nothing is lagging.

Read `(L)` at the flip, at +1 h, at +24 h, then daily. Read `(W2)` on the 60 s
poll from §W2. **Neither read is a gate that passes once** — the flip is
reversible by one `update`, and the discipline that makes that worth anything is
reading the two numbers that tell you to run it.

**What must be true before 5,000 characters.** Seven things, and the first alone
is disqualifying:

| # | Must be true | Where it stands today |
|---|---|---|
| 1 | The trigger's added p95 is **≤ 0.9 ms**, not 10.153 ms. At 55.6 writes/s, 10.153 ms is **564 ms of CPU per wall-clock second — 56 % of one core** **[D]**, against a 5 % criterion. The fix is named in the Coordinator's own measurement: emit the frame from the envelope `hr_apply` **already holds**, one projection per write instead of two — `hr_state_of` is 9.4–9.7 ms of the 10.15 **[M]**, ~94 % of the charge. | **Open.** CONDITION 8b NOT MET. A backend-architect lane under a Security ruling, not a tuning exercise. |
| 2 | W1 proven: ≥ 2 observed drop events, else 10.6 GB/day of unreclaimable heap. | **Open until 2026-09-28.** |
| 3 | `max_slot_wal_keep_size` raised, **or** a lag response proven faster than the 27-minute usable budget (§W2). 512 MB at 278 kB/s is not a 5,000-character setting. | **Open.** Raising it needs disk headroom, which needs a compute tier, which is §2's budget freeze. |
| 4 | W3 re-confirmed: `supabase_realtime` still carries no tables, so the frame rows still take one publication and not two. | **True today [M]**, and silently reversible by any lane that publishes a table. `(W3)` is the standing check. |
| 5 | Connections: 5,000 concurrent against a **500** Pro-with-spend-cap wall **[M]**. | **Open — Tyler's, and only Tyler's.** `CLAUDE.md` §2's budget freeze (2026-08-17) forbids this lane taking it. |
| 6 | Compute: 5,000 characters on **Micro** — `max_connections = 60`, `shared_buffers = 256 MB`, ~35 connections of headroom **[M**, `restore-runbook.md` §14f**]**. The frame channel is not the binding constraint here; the instance is. | **Open**, same budget gate as 5. |
| 7 | A **worst-case** slot-lag observation under real load (W3's original ask): `(b)` was read once at a quiet hour with both slots at zero lag. An idle reading is not a worst case. | **Open.** The `(W2)` poll produces it as a by-product — sign it off the observed maximum after 7 days at the ceiling, not from another idle sample. |

Items 1–3 and 7 are engineering and are ours. Items 5 and 6 are spend and are
Tyler's. **W1, W2 and W3 are answered; the flip is signed at 1.0 write/s and
unsigned above it.**

---

## R4 — the standing reads, as one paste block

Read-only, one statement per read, no CTEs, safe at any hour (they take no locks
and write nothing). `(L)` and `(W2)` are the two the sign-off rests on.

```sql
-- (L) LOAD — the busiest hour of the last 7 days. CEILING: < 3600 accepted writes/hour.
select date_trunc('hour', at)     as hour,
       count(*)                   as accepted_writes,
       round(count(*)/3600.0, 3)  as writes_per_sec
  from public.player_intents
 where at > now() - interval '7 days'
 group by 1 order by 2 desc limit 5;

-- (W2) SLOT HEALTH — every slot, no plugin filter (§W3: the slot that carries nothing
-- can still pin the WAL). ALARM if any row is not 'reserved', or safe_wal_size < 384 MB,
-- or NO row has plugin='pgoutput' (absence is a silent stop, not "no lag").
select slot_name, plugin, slot_type, active, temporary, wal_status,
       pg_size_pretty(safe_wal_size)                                              as safe_remaining,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn))         as retained_wal,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)) as unconfirmed
  from pg_replication_slots
 order by restart_lsn;

-- (W2b) The same read collapsed to ONE alarm row, for a scripted poll.
-- Expect: pgoutput_slots >= 1, worst_status = 'reserved', min_safe_mb >= 384.
select count(*) filter (where plugin = 'pgoutput')            as pgoutput_slots,
       max(wal_status)                                        as worst_status,
       min(safe_wal_size) / 1048576                           as min_safe_mb,
       max(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) / 1048576 as max_retained_mb,
       count(*) filter (where not active)                     as inactive_slots
  from pg_replication_slots;

-- (W1) PARTITION ROLL — run 2026-09-24 and after 2026-09-27.
-- Expect the NAMES to advance while the COUNT stays ~7. messages_2026_09_20 present
-- on 2026-09-28 = retention is not running.
select c.relname, c.relpersistence, c.relreplident,
       pg_size_pretty(pg_total_relation_size(c.oid)) as total,
       c.reltuples::bigint                            as est_rows
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'realtime' and c.relname like 'messages%'
 order by c.relname;

-- (W1b) Is anything in THIS database scheduled to drop them? 0 rows is expected
-- (retention is the Realtime service's, not ours) — read it before escalating.
select jobid, jobname, schedule, command, active
  from cron.job
 where command ilike '%realtime%' or command ilike '%messages%';

-- (W3) PUBLICATION DRIFT — expect EXACTLY ONE row: supabase_realtime_messages_publication
-- carrying realtime.messages. A second row means postgres_changes now decodes frame rows too.
select p.pubname, p.puballtables, n.nspname, c.relname
  from pg_publication p
  left join pg_publication_rel r on r.prpubid = p.oid
  left join pg_class c           on c.oid = r.prrelid
  left join pg_namespace n       on n.oid = c.relnamespace
 order by p.pubname, n.nspname, c.relname;

-- (W3b) Heap growth, if W1 ever reads wrong. At the 1.0 writes/s ceiling this is
-- ~190 MB/day; anything climbing past a few hundred MB means retention stopped.
select pg_size_pretty(pg_total_relation_size('realtime.messages'::regclass)) as messages_total;

-- (G) The settings the three answers rest on — re-read after any Supabase platform
-- upgrade. Expect wal_level=logical, max_slot_wal_keep_size=512MB, checkpoint_timeout=300s.
select name, setting, unit from pg_settings
 where name in ('wal_level','max_replication_slots','max_slot_wal_keep_size',
                'max_wal_size','min_wal_size','wal_keep_size','checkpoint_timeout',
                'archive_timeout','logical_decoding_work_mem')
 order by name;
```
