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
