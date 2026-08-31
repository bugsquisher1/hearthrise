# Systems Engineer — running log

_Your private journal. Newest at top. Team-wide items also go to `DISCOVERIES.md` / `HANDOFFS.md`._

## 2026-08-31 — THE AUTO-EAT COMPLETION: a Pareto change you cannot prove by reading it

**Branch:** `fix/autoeat-fallback-and-arm` (worktree `R:/the game/wt-autoeat-complete`), base
main `f9a04b0a` (b499 live). Suite **1107/1107, 0 runtime errors** (baseline 1103, +4). Edge
payload `c17cd6bd…` → `2efae5aa…`. Not bumped, not pushed.

### WHAT SHIPPED
Designer rulings 2 (cheapest-sufficient, processed-before-raw) and 2b (arm the ON/OFF sync, with
all three of its binding conditions), as one branch. Details in HANDOFFS/CONFLICTS today.

### THE LESSON I WANT BACK LATER: "HP-IDENTICAL" IS A CLAIM ABOUT A NIGHT, NOT ABOUT A FUNCTION
The ruling's whole justification is *"(b) is HP-identical to today and strictly cheaper — a
Pareto improvement, never a nerf."* Every instinct says that is obvious: "covers the deficit"
means "heals to full", `resolveAutoEat` caps at maxHp, so the post-eat HP is the same number.
Reading the diff proves it.

**It is not enough, and the reason is that the chooser is INSIDE a seeded loop.** The claim that
actually matters is *the fight does not move* — same ticks, same kills, same crits, same death,
same survivedMs, same XP, same gold, same loot — and that only holds while the covering stack
lasts. The moment a stack empties the two rules diverge for real. A unit test on the pick order
cannot see any of that. So the guard runs a **twelve-hour night twice on the same seed**, once
through a transcription of the pre-ruling rule and once through the shipped one, and asserts the
identity field by field while the bag bill drops:

```
late-game fisher/cook vs magma_elemental: 1429 meals · 1,286,100 g (1429x cooked_shark)
  → 322,634 g (144x cooked_shark + 705x cooked_lobster + 362x cooked_trout + 218x cooked_shrimp)
  = 4.0x cheaper, same 2415 kills / 18556 ticks / died=false
farmer holding Moonbloom vs slime: 48 meals · 40,800 g (48x moonbloom) → 864 g (48x cooked_shrimp)
  = 47.2x cheaper, same 16005 kills / 18556 ticks / died=false
```

**The rule I am taking from it:** when a change is defended as "identical except for X", the test
must run the thing end to end with X varied and assert the identity — because the interesting
failure is never in the branch you changed, it is in what the branch feeds.

### THREE THINGS THE TESTS CAUGHT THAT REVIEW DID NOT
1. **`Number(null)` is 0.** `chooseFood(nominated, inv, items, deficit)` treated an omitted
   deficit as "you are at full health", which makes every food in the bag sufficient and hands
   the cheap branch to a caller that never stated one. This file's own header documents the same
   trap on `thresholdFromPct` twelve lines away and I walked straight into it. `typeof !== 'number'`
   FIRST, every time, on any parameter whose absence has a different meaning from its zero.
2. **`JSON.stringify` is an ordered comparison.** The mixed-bag parity assertion reported
   "the two sides drained DIFFERENT STACKS" on identical maps — the client walks the bag, the
   server accumulates as it eats, so the key orders differ by construction. Sort before comparing
   maps, or the guard cries wolf on its first real run and gets weakened by whoever is in a hurry.
3. **A copy pin earned its keep.** Rewording the death-sheet tip to lead with the ruling's phrase
   dropped "already have Auto-Eat" — the exact fact that test was written for — while every other
   assertion stayed green. Kept the assertions separate so a future rewrite is told *which* of the
   three facts it lost.

### THE HOLE THE RULING MADE ME FIND
Condition 2 says the receipt must NAME the cause. It could not: **`summaryFromAway` carried no
death at all above the nested `combat` block** — no `diedTo`, so a server-stated death rendered
"You died" with a blank where the monster goes, and on a **0-kill** death `combat` is `null`, so
`receiptDied()` read false and the row vanished entirely. The absence that most needs explaining
is precisely the one that ended sixty seconds in, and it was the one the receipt could not
describe. b341 built that row on the client path and the server cutover quietly took it away.
Generalise: **when a payment path is replaced, diff the RECEIPT field by field, not just the
totals.** The totals were right the whole time.

### PERFORMANCE, MEASURED
247-key late-game bag, 300k calls: pre-ruling `chooseFood` 22.67 µs, shipped 24.11 µs — **+6.3%**
on a function that runs about 1,400 times in a twelve-hour night, i.e. **+2 ms per night**. It is
ONE pass, not two: `scanProvisions` answers both questions at once, because for a maxed character
the "nothing covers it" fallback is the COMMON case (74 HP down, largest Provision heals 42) and a
try-cheapest-then-best shape would have walked the bag twice on every meal.

## 2026-08-30 — THE WORKER EFFICIENCY ANCHOR: a nerf that missed by 60%, and the guard that watched it happen

**Branch:** `fix/worker-efficiency-anchor` (worktree `R:/the game/wt-worker-anchor`), base main
b496 `fe2a7111`.

### THE DEFECT IN ONE LINE
Both engines computed `perTickMs = node.ms / eff` while a player gathers at
`pacedActionMs(node.ms)` (`PACE.actionMs` = 1.60). So a worker produced `1.60 x eff` of an active
player, not `eff`: a Lv10 crew of six was **1.65 active-player-equivalents**, not the 1.03 b389
ruled. The nerf landed 60% short, in the direction of the faucet it was written to close.

### WHAT MAKES IT INTERESTING, AND THE RULE I TOOK FROM IT
`docs/design/bonus-rebase.md` §244 already stated the model exactly right — worker efficiency is
"a *fraction* of [your rate] … **It inherits `PACE` automatically** and cannot inflate." The design
was correct and the implementation simply never expressed it, because **the thing the fraction was
a fraction OF had no name in the code.** `eff` existed (twice, mirrored, with a "Mirrors …"
comment); its denominator existed nowhere. An unnamed quantity cannot be reviewed, cannot be
tested, and cannot drift *loudly*.

**THE GUARD IS THE REAL LESSON.** `smoke-test.js` "b389: worker rebalance — a full castle crew ≤ ~1
active-equivalent" was written specifically to stop this and asserted `6 * W.eff(...) <= 1.1`. It
was green for four builds while the rule was broken, because **it measured one HALF of a ratio and
assumed the other.** Generalised, and worth applying elsewhere: *a guard on a RATIO must divide the
two quantities, each through the function its own consumer calls.* A guard on a proxy is satisfied
by construction and tells you nothing. Both new guards (W11 in `tests/worker-accrual.mjs`, the
rewritten in-page one) now compute `actionIntervalMs(node) / workerTickMs(node)` — two functions in
two modules with two different consumers, so no single edit can satisfy them.

Same shape as the b493 "pinned BY VALUE" ruling and the gold-site census: **the assertion has to be
in the dimension of the thing you care about.**

### WHAT I BUILT
`src/core/workers.js` — the crew rate model as one authority: the constants, the level/eff curve,
`workerEffE` (the integer that keeps the server's tick split exact), and the newly-named
`workerAnchorMs` = `pacedActionMs`. `accrual.js` imports and **re-exports** it (index.ts and the
Node suite keep their import sites, and there is no second definition to drift);
`src/features/workers.js` reaches it through core-bridge. The client is display-only under
`WORKER_PRODUCTION_SERVER_BACKED`, so the reason this had to be lockstep is not value — it is that
the crew card was **advertising a rate the settle would not pay**.

Deliberately NOT in the anchor: the player's own speed perks + tool ladder. A share of the BASE
paced action, not of what the employer is wearing — otherwise a Rune Axe speeds the whole crew, the
client can never predict the server (perks are re-derived server-side), and the rate moves on every
tool swap. Written into the module header so the omission reads as a decision.

### THE THING I CHECKED THAT NOBODY ASKED ABOUT
`WORKER_MAX_ACC_MS = 900000` is a **security** constant — `hr_apply` REFUSES (never clamps) an
`acc_ms` outside `[0, it)`. Its justification lived in a comment: "largest perTickMs =
max(node.ms)/min(eff) = 13000/0.10 = 130,000". That was stale **twice**: the slowest node is 14,000
ms today, and the anchor moved it to 224,000. Still inside 900,000 — but I found that out by
computing it, and the next person would have found out from a `bad_worker_carry` rejection in
production. **A comment cannot notice it has gone stale**, so W13 walks the real node catalogue and
fails if the achievable carry ever reaches the constant. That is the derivation as a test, and it
holds at 10x the content. (The applied migration's comment is left as history; the live rationale
now lives in `src/core/workers.js`.)

### THE DEPLOY BOUNDARY, PROVEN NOT ARGUED
`acc_ms` is banked TIME, and the anchor only ever LENGTHENS a tick — so a carry written under the
old regime is `< oldPerTick < newPerTick` and cannot buy a tick on its own. W12 asserts both
directions: the largest possible legacy carry mints nothing across a 1 ms settle (no burst), and
the same carry still buys its tick once enough new time joins it (not confiscated).

### DEPLOY ORDER MATTERS AND ONLY IN ONE DIRECTION
Client-first is safe (display under-quotes, server over-pays for a few minutes); edge-first
over-promises. No correctness hazard either way — the client mints nothing under the arm — but the
honest order is client, then edge.

### VERIFICATION
Suite **1089/1089, 0 failed, 0 runtime errors** (edge-payload guard red by construction until the
Coordinator redeploys). `tests/worker-accrual.mjs` all green; **mutation: reverting the anchor to
the raw `node.ms` turns 7 assertions red and reports exactly 1.651 equivalents — the audit's
measured figure.** Runtime in the real client: the crew card renders "Normal Tree · ~75/hr", banks
75, and the player-side prediction is 75 — three numbers that used to be 120 / 120 / 75. 0 console
errors, 0 page errors.

### TWO TESTS I HAD TO FIX, AND WHY THAT IS PART OF THE FINDING
`WORKER-LEDGER-1` asserted `L.total > 80` and the legacy-mint test `gained > 80 && gained < 350` —
hand-tuned bands around magic numbers, one of them with arithmetic its own comment got wrong
("~1.5 qty" on a `[1,1]` node). A band that has to be re-tuned every time a rate moves is a band
that cannot detect a rate moving. Both are exact now and predicted from the PLAYER's side of the
ratio, so the worker engine cannot satisfy them by agreeing with itself.
## 2026-09-04 — b497 DATA RETUNE: "one migration on hr_goal_rewards" was THREE surfaces

**Branch:** `data/goal-gold-retune` (worktree `R:/the game/wt-data-retune`), base main b496
`fe2a7111`. Designer balance ruling, implemented as authored.

### THE FIRST THING I DID WAS DISPROVE THE BRIEF, AND IT WAS THE WHOLE JOB
The task said "+ ONE forward migration on `hr_goal_rewards`", and told me to check that before
assuming it. The eight retuned ids do **not** live in one place. They live in three, and the
difference decides the shape of every fix:

| system | where its catalogue lives | how you move PRODUCTION |
|---|---|---|
| modal goal board (`gather_logs`/`mine_ore`/`fish`/`cook`/`plant`) | **rows** in `public.hr_goal_rewards` | `UPDATE` |
| daily TASKS (`daily_kill`/`_big`/`daily_smith`/`daily_craft`) | a **`case`** inside `hr_claim_daily__ungated` | patch the function body |
| onboarding QUESTS (`farmhand`) | a **`case`** inside `hr_claim_quest__ungated` | patch the function body |

**The reusable lesson: "is it server-catalogued?" and "is it a ROW?" are different questions, and
only the second one tells you what a forward migration has to be.** A catalogue that lives inside a
function body cannot be UPDATEd; it can only be re-created, and re-creating a ~90-line body this
change did not author is exactly how the b484-b487 wave silently reverted other migrations. So §2/§3
use the programmatic-patch idiom (`pg_get_functiondef` + an anchored `regexp_replace` that refuses to
patch blind), which takes over no last-toucher role and cannot delete a stranger's change.

`src/data/goal-catalogue.js`'s `BLOCKED_GOAL_BOARD` string says the modal board has no server model.
**That has been false since 2026-08-23** (`hr_goal_rewards` + `hr_claim_goal` + `goal-period.js`'s
counters). `src/net/gold-sites.js DAILY_COUNTERS` repeats it and cites it. I did NOT fix them — a
gold-site blocker is censused and this was not my ruled scope — but I nearly reasoned from a comment
that has been wrong for two weeks. Filed in HANDOFFS.

### THE HOLE I FOUND WHILE BINDING THE CATALOGUE
`hr_claim_daily__ungated`'s CASE catalogue exists in **two** migrations —
`2026-08-20-goal-reward-rpc-credit.sql` §6 and its verbatim restatement in
`2026-08-29-daily-task-eligibility.sql` §4 — and `goal-catalogue-drift.mjs` read **only the first**.
The second is the one a rebuild installs (it runs later). So the checked copy was the one that does
not matter, and the two could disagree forever. Same two-copies-nothing-compares shape the file
exists to prevent, one layer down. Both are bound now, plus the forward migration's ruled
replacements — mutation-proven (planting 900 in the restatement reads RED).

### THE CLOTH FAUCET WAS A GENERATOR DEFECT, NOT A RECIPE
`recipe-yield-guard.mjs`'s own header has recorded "gear ratios reach 700x (`craft_voidweave_body`:
108 g of silk and essence into a 75,600 g robe)" since the day it was written, and guarded nothing.
It was right that a flat ratio cap can't express the gear rule; it was wrong that no rule could.
Measured: plate and leather cost `[tier material] × [slot weight]`; cloth had **neither term**, so a
whole 42-item line ran 160 g → 540 g of input while its output ran 50 g → 75,600 g, **and a Voidweave
Sash cost exactly what a Voidweave Robe Top did**. One wrong expression, 42 wrong rows — which is why
no per-recipe review would ever have seen it. CHECK 4 now caps the vendor faucet ratio **per ladder
rung**, stated over `GEAR_LADDERS` and resolved **by output item** (an id-keyed lookup silently skips
12 rungs, because a hand-authored recipe wins under its own id — `forge_bronze_sword` beats
`make_bronze_sword`). Cap 20; post-fix population tops out at 11.2×; the replanted defect reads 700×.
The mechanism I chose (the tier's plank at half the slot's weight) borrows a material rather than
adding a cloth-bolt ladder — flagged to the Designer in CONFLICTS with the measurement behind it.

### THE RETUNE WOULD HAVE SHIPPED TWO SAVE-BLOB BUGS, AND I ALMOST DIDN'T LOOK
Everything above was green when I asked the CLAUDE.md question — *what does this write, and how
long does it live?* Both answers were bad, and both are the "forgotten in the save blob" class:

- **`G.quests` freezes the DEFINITION.** A quest row is a copy of its QUEST_DEFS entry made once,
  and the b341 merge only ever adds MISSING rows. So `farmhand` goal 10 → 6 reached **nobody** —
  every live save would keep `goal:10` and the label "Harvest 10 crops" forever while the server
  started accepting 6. A ruling authored, tested, migrated onto production, and delivered to no one.
  That is the *same sentence* b341 wrote about ADDING a quest; it fixed one half and left the other.
  Fixed by stating the model: a quest row is AUTHORED DATA plus exactly TWO save fields
  (`progress`, `done`), and the authored half is re-read on every merge.
- **`G.daily.tasks` freezes the SLATE, and the failure is worse than staleness.** Stored
  "Smith 8 items" + a server goal of 40: the player smiths 8, `updateDaily` latches `done` and fires
  `claimDaily` **once**, fire-and-forget; the server answers `incomplete`; `done` means it can never
  fire again; and under the gold arm the local credit is a no-op. The daily is spent, nothing is
  paid, and the UI says it is finished. A **fresh instance of the exact class I fixed on the rank and
  milestone claims last week** — created by a pure balance change, which is what makes it worth
  writing down: *a data retune can manufacture a fire-and-forget loss if any consumer latches a
  completion flag against the old number.*

The daily repair is deliberately TWO things, because they break independently: the numbers are
re-read from the authored pool, and **`done` is re-derived from `progress >= goal` unconditionally**.
The second is not a consequence of the first — the pre-existing b461 eligibility rebuild already
produces the bad state on its own by copying an old `done` onto a freshly generated task, so a repair
gated on "the numbers differ" walks straight past it. `done` unsupported by its own progress is never
legitimate, which makes it an invariant of the structure rather than a guess about how it broke.

### VERIFICATION NOTES WORTH KEEPING
- **THREE "mutated" runs were not mutated, and they all looked like results.** My patch script
  asserted on a multi-line anchor written with `\n` against a file read with `newline=''` — i.e. CRLF
  — so it raised, `python` exited 2, and the next command in the chain ran the suite on CLEAN source
  anyway. Two of those runs timed out (I blamed load) and one reported **1091/1091 green**, which I
  was one keystroke away from recording as "the mutation was not caught". A mutation harness must
  PROVE it planted something; single-line anchors, or a newline-normalising read, or an explicit
  post-check. `bootReplay`'s own patcher gets this right and throws — mine did not.
- **`HR_SUITE_TIMEOUT_MS` exists for exactly the machine I was on.** The in-page budget is 120 s and
  I had been running PGlite replays back to back beside Tyler's 1.4 GB Chrome; the suite flaked
  twice on unmodified code. It is documented in run-smoke.mjs's own header (b461) and it is not a
  licence to widen an assertion — only the wall clock flexes.
- **A mutation that plants no observable defect proves nothing.** My first `verify_is_decoration`
  only softened the migration's read-back — but §1 still wrote, so every assertion passed either way
  and the selftest said MISSED. The configuration a real defect survives in is BOTH halves (the write
  dropped AND the gate softened), which is precisely how b492's phantom XP lived four builds.
  Restated as a `pairs` mutation; now caught.
- **Drift is a property of the DATABASE, so plant it there.** For the migration's fail-closed proof I
  drift each surface *in the booted database* (an `UPDATE`, and two `regexp_replace` re-authorings of
  the installed bodies) rather than in an authoring file — patching a file would test a
  differently-built chain instead of a drifted one, and it also costs three extra full replays.
- **`59 logs must be REFUSED`** is the assertion that proves the TARGET moved. A gold-only check
  passes just as happily against a target still sitting at 25 — the mutation run printed
  `target: 25, gold: 250, outcome: applied`, and that is what caught it.
- `[[:space:]]+`, never `\s+`, in any SQL that normalises a function body. The b493 note is right:
  the two runtimes disagree on backslash classes under `standard_conforming_strings`.

## 2026-08-29 — P1: THE RANK CLAIM WAS FIRE-AND-FORGET OVER A SERVER VERDICT

**Branch:** `fix/rank-claim-silent-loss` (worktree `R:/the game/wt-rank-claim`), commit `0f69312c`,
base main b493 `62c7b293`. Found by the security pass on the renown kill-faucet fix (F2).

### THE SHAPE OF THE BUG, AND WHY IT IS A CLASS
`claimRank` fired `hr_claim_rank` with `.catch(noop)` and then did `s.claimed.push(rankId)`
**unconditionally**. Three facts have to be held at once for it to be visible, which is exactly why
it survived a migration written *by* a security review:

1. the server decides on ITS OWN score (`hr_renown_of` → `renown_high`) and can answer
   `not_reached`;
2. `G.renown` is **residue** — `client-state.js RESIDUE_FIELDS` — so the claimed mark survives
   every reload, forever;
3. under the gold arm the local credit is a **no-op**, so the only thing the click actually did was
   consume the rank.

Fire-and-forget is safe *only* where a refusal costs nothing a later call cannot recover — that is
literally the sentence in `goal-claim.js`'s own header, written for `claimDaily`/`claimQuest`, where
the claim slot is not consumed until the server credits it. Ranks broke the precondition by
consuming the slot LOCALLY and PERMANENTLY. **The lesson generalises: fire-and-forget is a property
of the PAIR (transport, local state lifetime), never of the transport alone.** Audit rule for next
time — for every `.catch(noop)` RPC, ask "what does the client write regardless, and how long does
it live?" If the answer is residue or a record, it is not fire-and-forget, it is a two-phase commit
missing its second phase.

**I applied that rule and it found a second instance immediately — so I killed the class, not the
bug** (CLAUDE.md session criterion 3). `collection-log.js claimMilestone` is byte-for-byte the same
defect: `.catch(noop)`, unconditional `s.claimed.push(id)`, and `collectionLog` is residue.
**It is arguably WORSE, because its refusal is the common case rather than the edge one:**
`getStats` counts `G.bestiary`/`G.collection` — everything the ATTENDED player saw — while
`hr_claim_milestone` counts `hr_bestiary_of`/`hr_collection_of`, rows the away/span-sim writes,
which realise 60–99% fewer kills (goal-claim.js `creditKills`). Client 12 monsters, server 4,
`incomplete`, milestone consumed, nothing paid. The renown one needed the faucet fix to start
biting; this one has been live. Fixed in the same shape, second commit, separable.

Both are now the ONLY two remaining `.catch(noop)` claim transports that consume residue.
`claimDaily`/`claimQuest` are genuinely fire-and-forget (the slot is not consumed until the server
credits); `creditKills`/`creditCombatXp`/`bountyReroll`/`equipCompanion`/`setStyle` write nothing
permanent a refusal cannot recover.

### WHAT I DID NOT DO, AND WHY
Did **not** hide the Claim button on a rank the server is known to be short on. `hr_claim_rank`
advances `renown_high = greatest(renown_high, hr_renown_of(...))` **before** it decides — the click
is the only thing that moves the server's number — so the b487 fail-closed-on-knowledge treatment
would have converted a dead button into a permanent dead END. Fail-closed is not free; it is only
correct where something else advances the state.

Did **not** add the server-score projection. `hr_renown_of` is revoked from `authenticated` on
purpose and `hr_state_of` is the b487 anchored-patch danger zone. Instead the client caches the
`renown_high` + `min` the refusal envelope **already carries** — zero migration, and it makes the
refusal honest in the server's own figures. Full projection scoped in HANDOFFS (recommendation: a
new `hr_renown_state(p_slot)`, additive, rather than patching `hr_state_of`).

### FOUND WHILE THERE
- **`snapshotG()` did not cover `G.renown`** while it did cover `renownHigh`. Four tests assign
  `{claimed:[],seenRank:0}`, and `renown` is residue — so a smoke run in the live page **erased the
  player's record of which rank rewards they had taken, and persisted it.** The suite's snapshot
  list is an allowlist over a residue allowlist; the two drift silently. Worth a mechanical guard
  (every `G.<field>` a test assigns vs `snapshotG` keys), same shape as `arm-homing-guard`.
- **An ok credit refreshed nothing.** gold/gems are SERVER_OF_RECORD, so the largest single payout
  in the game (1,000,000 gold) left the topbar untouched until the next envelope — the
  bug_reports #46 "completed, 0 marks" class, third occurrence. `requestRecord()` is one line and
  three surfaces now use it; it should be part of the definition of "server-credited claim".
- **The gold-site census earned its keep.** Renaming the write site `claimRank` → `grantLocally`
  failed the run *twice over* (undeclared new site + a ledger row naming code nobody runs). That is
  a guard that cannot be satisfied by accident.

### Verification
**Rebased onto current main `9dfab9d4` (which already carries the kill-faucet integration) and
verified there: suite 1085/1085, 0 failed, 0 runtime errors, 0 console errors.** On my original
base it was 1084/1085, the one failure pre-existing and **date-dependent**: today's Boss of the Day
is `cyclops`, which has no wired art, and `bossIconHtml()` falls through to the monster's raw emoji.
I traced it to source before assuming it was not mine — and main had independently exempted
declared-pending icons from the pin in the meantime. **The underlying hole is still open:**
`bossIconHtml` has no atlas-glyph fallback, so an unwired monster still renders an emoji to a real
player even though the test no longer fails on it. Handed to Art/Asset. Runtime proof: booted the real client at 1440x900 and 922x423, drove a
REAL `not_reached` through the real transport (mocked only the wire), and read the ladder — the
Knight row keeps its Claim button, gains "The realm has counted 1,840 of 2,200 — this unlocks
itself as it catches up", `getClaimable` still offers it, no gold/gem prediction, `overflowX 0`,
zero page errors. Same for the Collection Log's Novice Hunter row ("counted 4 of 10 monsters"),
still claimable, button intact. `RANK-CLAIM-1` and `MILESTONE-CLAIM-1` both fail on clean HEAD (the
unconditional push).

## 2026-08-29 — LIVE P1: the SILENT BOOT-HYDRATION FAILURE ("my character is gone")

**Branch:** `fix/boot-hydration-loud` (worktree `R:/the game/boot-hydration-wt`) · base main b491.

### THE REPRO, AND THE ONE FACT THAT CRACKED IT
Chrome cold start after a PC restart. 36+ seconds "ready" showing attack 0 / hitpoints 1154 xp /
500 gold on an account holding attack 428 and 7,520 gold. Pill "Online". No banner. No gate.
**A hand-typed `HearthriseAccrual.requestAccrual('probe')` from that same page hydrated everything
instantly.** That is the whole diagnosis in one sentence: the transport and the token were fine, so
the boot read had failed and *nothing was ever going to ask again*. accrue.js has its OWN in-flight
latch — which is why the probe worked while the boot chain stayed dead.

### FOUR DEFECTS, EACH SUFFICIENT ALONE
1. **No timeout + a caller-frame latch release** (record.js, character.js). A browser `fetch` never
   times out; `try { return await inFlight } finally { inFlight = null }` only releases when *this
   frame* resumes. One stalled socket = a permanently wedged session, and legacy.js's 4s resume
   watchdog (the only thing that re-fires the boot read today) is handed the corpse.
2. **No retry this module owns.** `settle()` answered a failure with one `console.warn`.
3. **`p.then(fn)` — a one-argument then** on `ensureThenAccrue()`. A rejected/never-settling ensure
   silently deleted every hr_load the session would make.
4. **The capstone early return skips `forgetServerOfRecord(G)`**, so the fresh-G factory literal
   (gold 500, attack 0, hitpoints 1154 xp, a bronze sword) lived in a live G under an armed record.

### THE JUDGEMENT CALL I GOT WRONG FIRST, AND WHY IT MATTERS
My first fix gated skill-record.js's display rung (b) on "has the server ever spoken". **B429-6 went
red and B429-6 was right**: with the capstone dormant the blob has loaded a real character and
`_record` may legitimately be absent, so that predicate collapses a genuine level 5 to level 1 — the
exact bounce b456 exists to make unreachable. PRESENCE was never the wrong test; what was broken was
the *meaning* of presence. Fixed at source instead. The wrong lever is documented in-place in
skill-record.js so the next person does not reach for it again.

### WHAT I DID NOT DO, DELIBERATELY
- **No cadence floor on hr_load**, even though `processOffline` → `beginRecordLoad` fires it every
  4 seconds per player (~15 rpm against a 180/min budget — real, measurable debt). Adding one on a
  P1 trust fix would remove the incidental safety net my ladder is layered *under*. Filed, not taken.
- **Did not fix `migrateEquipmentSlots()`**, which writes all-null slots into `G.equipment` on every
  inventory/loadout render and permanently breaks the b347 equipment fingerprint. Real, known
  (getWeaponType's b455 block already works around it), separate blast radius.
- **Gated `migrate()`'s ungated `G.skills` write, measured it, and REVERTED it.** Gating leaves
  `G.skills` genuinely absent for the whole pre-hydration window, and `src/ftue.js:183` +
  legacy.js's `gainedXp` index it raw and throw. **A boot crash is worse than a level-1 map the veil
  never shows.** The correct order is: sweep the raw readers onto skill-record.js FIRST, then gate.
  Written up in full at the call site so it is not re-attempted backwards.

### LEARNINGS
- **Measure the patched boot, do not reason about it.** The `migrate()` second writer was invisible
  in the source and obvious in a 40-line Playwright probe printing `hasOwnProperty(G, field)` four
  seconds after load. So was the fact that gating it breaks the boot.
- **The suite had an undeclared dependency on the fresh-G factory literal.** Five places seeded a
  character by indexing `G.skills[...]` bare — and when the literal vanished they did not fail, they
  measured an EMPTY game and kept passing (a `catch (e) {}` around the seeding). Fixed by stating the
  precondition + adding a vacuity check, not by putting the literal back.
- **A guard that is also silent is half a defect.** Seven `catch (e) {}` blocks in `settle()` could
  drop the farm, the bag or the crew while still reporting `loaded` and lifting the veil. They are
  now `hydrationStep(name, fn)` — same guard, named casualty, surfaced on `bootHydrationState()`.
- **Fail-closed authority needs a fail-loud PICTURE.** record.js has always been right that an
  un-arrived field is UNKNOWN. Nothing rendered UNKNOWN for the *character*, so the render defaulted.
  Save-invariant #2 ("act only on certainty") had never been applied to a screen.

## 2026-08-29 — LIVE P0 (4 reports, b467→b479): "eaten food gets restocked"

**Branch:** `worktree-agent-acfefa38410638b13` · **Smoke:** 1057/1057, 0 failed, 0 runtime errors,
clean console (b488, merged main). Runtime-verified in the booted game.

### ROOT CAUSE — TWO DEFECTS, ONE REPORT
1. **The reconcile restocks by construction.** `src/net/accrue.js reconcileInventory` takes the
   LARGER of the client's copy and the envelope's figure (merge: `Math.max(have, q)`; absolute-
   excluded: same max; absolute-owned: the server's figure outright). A locally-eaten unit makes the
   client's copy SMALLER, so ANY envelope naming the pre-eat count hands it back — and because
   `have` is itself the ratcheted value, the eat's own correct response then loses the max and the
   client stays permanently one ahead of the server. Not a race that heals: a ratchet that locks.
2. **Nobody debited an auto-eaten Provision.** `HearthriseAuto.maybeAutoEat()` (the path that fires
   in a fight, via `COMBAT_FX.autoEat`) healed and decremented LOCALLY and sent nothing — and the
   server was not eating either, because its engine only eats when `player_state.auto_eat_enabled`
   is set and `hr_set_auto_eat` (that column's only writer) has never had a client caller.
   `2026-08-29-auto-eat-tiers.sql` records it: **"0 rows on production — no character has
   auto_eat_enabled"**. That is the deterministic half of "every time I use 1 it returns".

### THE FIX
- `src/net/pending-consume.js` (new, pure, node-importable) — a scratch, session-only hold of what
  the client has spent and the server has not agreed to. Folded OUT of the envelope's figures before
  EITHER branch reads one; drains on EVIDENCE (the server's own figure coming down), TTL only as a
  safety valve. **Only ever LOWERS a figure** — no branch adds a key, raises one, or writes the bag,
  so it cannot mint under any envelope with any ledger, forged or not.
- `noteServerAutoEat` / `clientOwnsAutoEatDebit` in accrue.js — the client sends an auto-eat intent
  ONLY on a definite `state.auto_eat_enabled === false` from the server. Fail-closed on unknown.
- `window.noteItemConsumed(id, qty, opts)` in legacy.js — ONE seam for a client-local consumption:
  records the hold, gates the send, paces the auto path (3 s, 120-deep, sized inside the hold's TTL)
  against the shared 30/min `activity` bucket, and is a no-op during an away replay.

### LEARNINGS
- **The dangerous direction was the OPPOSITE of the bug.** My first cut sent an `eat` intent for
  every auto-eat. If the server's `auto_eat_enabled` is ever true it eats the same food itself and
  states the debit in `away.items` — the intent would then debit TWICE, which is item LOSS, strictly
  worse than a restock. The fix is not a constant ("the server doesn't eat today") but an
  OBSERVATION of `state.auto_eat_enabled`, which hr_state_of already projects on every envelope. It
  retires itself the day the settings sync lands, with no flag to remember.
- **A `Math.max` reconcile is a ratchet, and a ratchet has no reverse.** Every "the server's number
  is lower and that's fine" merge is also "the client can never come down". Worth checking every
  such site for a client-side DECREMENT that has no server verb yet.
- **Session scratch is not fixture state.** The hold broke `b337` — a test whose envelope fixture
  read one lower because an EARLIER test's `maybeAutoEat` left a hold on the live `G`. Cleared at
  every `tryRun`/`tryRunAsync` boundary. In production the equivalent (a wholesale bag replacement)
  only happens on paths that reload, so scratch dies anyway.
- Debt paid: manual and automatic eating now share ONE consumption seam instead of two half-wired
  paths. Debt added: the hold is a reconcile-ordering correction, not authority — it retires when
  every consumption is an intent the server settles before it can build an envelope.

### HANDOFF (raised in HANDOFFS.md)
The remaining root cause of the auto-eat half is that **nothing syncs the client's auto-eat settings
to the server**. `hr_set_auto_eat` is granted to `authenticated` and takes (slot, enabled, food, pct,
…); wiring `HearthriseAuto.setEat` to it makes the server's sim eat exactly what the client's does,
debit it for real, and retires the client-side eat intent automatically. It belongs with the
auto-eat-tiers track, not bolted on here.

## 2026-08-17 — b372 — F7 auto-eat never fires · F18 fight resume broken (live audit)

**Branch:** worktree `agent-ab5e4fe2d47d3fce8` · **Smoke:** 830/830, 0 runtime errors, exit 0. No bump, no push.

### F7 — WHICH BRANCH IT WAS, TRUTHFULLY
Branch (a). Measured in a real browser on the audit's exact state (HP 3/10, Raw Lobster ×5):

| | before | after |
|---|---|---|
| `isAutoEatable(ITEMS.lobster)` | **true** | true |
| no trait: `maybeAutoEat()` | false | false *(correct)* |
| no trait: Settings offers a live threshold slider | **YES — the bug** | no: `LOCKED` + price + "press Eat" |
| trait owned: one live `combatTick()` | — | HP 3 → 10, one lobster consumed, `🍖 Auto-ate Raw Lobster (+12 HP)` |

The food was never the problem and neither was the engine. The gate is
`enabled && owned` (`features/auto-actions.js maybeAutoEat`) and BOTH were false.
The SCREEN was the defect: Settings › Gameplay painted a live, draggable,
**persisted** control for a 100-Bounty-Mark trait the character did not own — and
for an `enabled` switch that had **no UI anywhere in the game** (reachable only by
buying the trait or picking a food). The combat screen has said the honest thing
since b361; Settings contradicted it.

Also found and fixed, a genuine branch-(b) hole: migration **v5→v6** grants the
trait when `save.foodSlot` is set, and that arm matches saves whose
`autoActions.eat.enabled` is FALSE. Those players got a paid trait plus an off
switch with no UI — auto-eat dead forever, for exactly the players the migration
exists to protect.

### F18 — TWO DEFECTS, ONE OF THEM ARCHITECTURAL
1. **`startCombat` is a TOGGLE** (`if(G.activeMonster===mId){stopCombat();return;}`)
   and `getResumePayload()`'s "is anything running" guard is evaluated at **paint**
   time, not at click time. Home renders the chip while idle → boot's `loadLocal()`
   re-arms the saved fight → the player presses Resume → **the fight stops.**
   "A Resume chip appeared but did not resume", verbatim.
2. **The client had no reader for the server's fight carry.** `player_state.fight`
   has been server state since `2026-08-17-fight-carry.sql`, `hr_state_of` projects
   it and hr-accrue resumes from it every span — but `activityOf()` read
   `active_kind`/`active_id` and stopped there. So every reconcile that had to move
   the pointer called `startCombat`, which sets `monsterHp = m.hp`, and **restarted**
   the foe the server was still holding. On a 520-hp dragon that is the whole fight,
   every settle. The server resumed; the client did not.

Verified at runtime: a reconcile of `{combat,dragon}` + `{monster:dragon,hp:5,kills:4}`
now lands on **dragon 5/520, 4 kills**; pressing Resume on a live dragon leaves it at
**9 hp** instead of stopping it.

### FILES CHANGED
- `src/settings-page.js` — `ownsAutoEat()` / `autoEatPrice()` / `autoEatHtml()`; locked row when unowned, ON/OFF switch + slider when owned; `[data-autoeat]` binder routed through `HearthriseAuto.setEat` (NOT the generic `data-set` writer — one authoritative writer, per b326/b329).
- `src/styles/audit-overrides.css` — `.ss-row.is-locked .ss-label`, `.ss-locked-tag`. Tokens only, 14.5px (the b227 floor — my first draft at 13px was caught by the type guard).
- `src/save-migrations.js` — v5→v6 also sets `eat.enabled = true` and carries `foodSlot` → `eat.foodId`.
- `src/net/activity.js` — new `fightOf(body)`; `lastServerFight` module state; `fire()` widened to a 3rd arg; both `onReconcile` call sites carry the fight; exported on `HearthriseActivity`.
- `src/legacy.js` — new `applyCarriedFight(id,fight)`; `reconcileActivityPointer(a,fight)` applies it **only on a restart**; the `onReconcile` hook forwards it.
- `src/features/profile-launchpad.js` — the Resume action re-asks at CLICK time.
- `src/features/smoke-test.js` — 6 new guards (F7-1/2/3, F18-1/2/3/4).

**Intentionally untouched:** `src/core/auto-eat.js` (the decision was already right),
`combat-sim.js`, `accrue.js`, `snapshot()`/`NO_SYNC`, all SQL and the Edge payload.

### BLAST RADIUS
- `fire()` gained a 3rd parameter — additive; `onEnvelope`/`onOutcome` ignore it.
- `applied.reconciled` shape is UNCHANGED (the fight is passed BESIDE the pointer, never merged into it), so the b347 diagnostic assertions still hold.
- `reconcileActivityPointer`'s new parameter is optional; the gather/idle/artisan branches are byte-identical.
- CSS: two new selectors, no existing rule touched, no new colour.

### SAVE MIGRATION
No new persistent field and no schema bump. The v5→v6 change is to an EXISTING
migration and is guarded by the same `hadAutoEat` predicate, so a fresh save still
cannot enter it (asserted in F7-3). `autoActions` already rides the snapshot.

### MUTATION PROOF (each mutant RED, on its own guard, with the intended message)
| mutation | guard that died |
|---|---|
| Resume click-time guard reverted | F18-4 "pressing Resume STOPPED the fight" |
| `fight.monster!==id` neutered + carry apply removed | F18-2 "the dragon is on 520/520 instead of 5" |
| carry applied to a LIVE fight too | F18-3 "the dragon went back to 520" |
| `if(!ownsAutoEat())` → `if(false)` | F7-1 "the threshold slider is live without the trait" |
| migration's `{enabled:true}` removed | F7-3 "the trait was granted but auto-eat stayed off" |
| `fightOf`'s `hp > 0` guard removed | F18-1 "a zero-hp carry was accepted" |

### VISUAL
Settings › Gameplay screenshotted and READ at desktop 1280×900 and mobile-landscape
922×423, both branches (locked / owned). Locked reads as "not yours yet" with the
price, the shop and the alternative on one line; owned shows a real switch above the
slider. Console clean in every context.

### PERFORMANCE
Nothing per-tick. `fightOf` runs once per envelope; `applyCarriedFight` only on a
pointer restart. The Settings toggle repaints ONE hint node rather than re-rendering
the panel (a re-render would collapse every open section and lose scroll position).

### TECHNICAL DEBT
Paid down: the client now reads the fight carry the server has been maintaining
alone; `autoActions.eat.enabled` finally has a UI. Added: none.

### KNOWN LIMITATIONS
1. The carry is applied ONLY on a reconcile restart. A cold boot still resumes from
   the LOCAL save (which does hold `activeMonster`/`monsterHp` — verified), and the
   server's carry only corrects it on the first envelope. Cross-device mid-fight
   resume therefore costs one settle round trip. Correct, but not instant.
2. `fightOf` is wired to `set_activity` answers only. Wiring it to the plain
   `accrue` envelope in `src/net/accrue.js` would close (1) — deliberately NOT done
   here: that path owns the replacement gate and is outside this change's blast radius.
3. Settings still has no auto-eat FOOD picker; that lives on the combat screen and
   the inventory detail modal. Not regressed, not extended.

## 2026-08-16 — b355 — the invisible blueprint (Tyler, live, Kitchen room modal)

**Symptom.** "This doesn't tell me anywhere it requires a blueprint or how to get a blueprint."

**Root cause — structural, not copy.** The blueprint check was an inline loop over `ITEMS` *inside*
`upgradeRoom`, reachable only by ACTING. So no surface could state it — and worse, the view
DISAGREED with the authority: `roomDescriptor().next.affordable` looked only at gold/materials, so a
player holding the gold and the logs got a lit, PRIMARY Build button that then refused with a toast.

**The seam.** `window.roomRungItemGate(id, want)` in `legacy.js` — TOTAL (answers for any rung,
owned or not), returns `{id,name,need,have,ok,source}` or `null`. `upgradeRoom` now enforces with
the same function every view reads, so authority and view cannot drift. `source` comes from
`window.itemSourceLine` (b242), never from prose.

**Learning worth keeping.** The b242 reverse index did NOT index dungeon loot or the Quartermaster —
which is exactly why the old toast had to hardcode "they drop from dungeons". A requirement that can
only be discovered by failing is not a requirement, it is a trap; and hardcoded prose in a toast is
the tell that some seam is missing data. Both are fixed at the data layer now, so every dungeon-only
item (8 blueprints, farm deeds, the signature boss weapons) describes itself everywhere.

**Requirement classes are now three, deliberately.** (a) met cost and (b) short cost are the same
component in two states — correct. (c) ITEM GATE gets its OWN line, because rendering it as a third
cost chip ("0/1 Kitchen Blueprint II") reads as one more plank when it means "you cannot start".

**Handoff / open.** `farm-progression.js`'s Farmer's Deed card (House › Plot) is the one other
GATED-BY-ITEM surface. It is NOT invisible — it already prints "Have N Deeds · need M" at the
decision point — but it never says where deeds come from and it is hand-rolled rather than going
through the `gates` seam. Worth folding onto the seam when that card is next touched; not urgent.

## 2026-08-15 — b349 — 19% of all traffic was a question the client had no right to ask

Worktree `agent-aea11985dd254af77`, commit `ce9dc9c`. Suite **710/710** (baseline 707; +3), 0 runtime
errors, **four consecutive clean runs**, no `AWAY-16` flake. **Nine mutations, each RED on exactly its
target.** No version bump, nothing deployed. `src/core/**`, `src/data/**`, `supabase/functions/**`,
migrations, `hr_client_rpc_baseline` — all untouched. No grant changed.

**The lesson: A RATIO THAT IS AN EXACT INTEGER IS NOT A COINCIDENCE, IT IS AN ATTRIBUTION.** The
offender table looked like nine unrelated problems. It was two. `53` divides every non-`hr_server_now`
row exactly — 6 RPCs sharing `p_clan_id` → 318, 3 sharing `p_day_key` → 159, 2 sharing `p_slot` → 106,
1 alone → 53 — and the multiplier is the *count of `tests/rpc-resolution.targets.json` entries with
that parameter signature*. So 2,014 of the 5,217 are 53 CI runs of a deliberate, documented,
production-safe anon probe, and I changed nothing about it. The remaining 3,196 are one client bug.
**Arithmetic did the attribution that reading nine call sites would not have.**

**The bug was not "signed-out players".** That was my first hypothesis and it was wrong by an order of
magnitude. Driven in real Chromium with a VALID cached session and the wall open on `reason:'session'`,
`isSignedIn()` true: `hr_server_now` still went out anonymous. It is a **boot race that always loses** —
muster boots at DOMContentLoaded+420ms, auth.js cannot publish a session until a CDN `import()` of
supabase-js resolves, measured 94 / 159 / 358 / 1,040ms later across four runs *on localhost*. Every
player, every page load. **A hypothesis about who is affected is worth exactly one measurement.**

**The mechanism was one expression, copied six times:**
`'Authorization': 'Bearer ' + ((s && s.access_token) || c.anonKey)`. That fallback does not mean "call
this anonymously"; it means "send it without the standing to send it". Fixing it at the call site would
have been three lines and would have taught nothing.

**Fixing it exposed a second bug the first was hiding** — the same shape as b347's `fire('onEnvelope')`.
`hydratePledge` lost the identical race but *quietly*, because it had its own `isSignedIn()` check: at
boot it did nothing, and the probe sat un-run until the 60s tick — defeating the exact "settle before
the player's first click" promise its own comment makes. After the fix, boot sends BOTH RPCs,
authenticated, at +2.1s. **A guard that returns early is not the same as a guard that waits.**

**Design call I would defend: the predicate is INVERTED.** `ANON_CALLABLE` lists what may go out
without a session (one entry) rather than what may not (38). A new RPC is protected the day it is
written by nobody remembering anything, and the maintained list is the short one. The failure
directions are asymmetric and that is the argument: omitting an anon RPC breaks a visible feature in
one boot; omitting an authenticated RPC — the old shape — cost nothing visible for months.

**Two sources that cannot vouch for each other.** The client's `ANON_CALLABLE` is checked against
`tests/rpc-resolution.baseline.json`, which is CI-verified against the LIVE grants and maintained by a
different concern for a different reason. M4 and M5 redden it in opposite directions.

**Operational, and it cost me an hour: MY MUTATION HARNESS ATE MY UNCOMMITTED WORK.** `restore()` ran
`git checkout --` on three files *before* the first mutation, against an uncommitted tree. Recovered
from context, then committed BEFORE re-running. **A mutation harness that restores with git is only
safe against a committed baseline — commit first, always.** (Second gotcha: the worktree is CRLF and
the anchors were LF, so every anchor missed until the harness normalised.)

**Not mine, captured as asked:** the Edge payload guard has been RED since partway through this
session — deployed `hr-accrue` reports `a2a42250dd81e795…`, this repo packs `2f6334133c627f81…`. It was
GREEN on my first run and RED on every run after, with no change from me; my diff touches no
`src/core`, `src/data` or `supabase/functions`. Another agent deployed. Someone owns that redeploy.

## 2026-08-15 — b347 — the seam, and the record that had two writers

Branch `worktree-agent-aa3e8484ab2c37486`, commit `b0b7ac4`. Suite **702/702** (baseline 692; +10),
0 runtime errors, 0 console errors, four consecutive full runs after the last code change. **Thirteen
mutations, each RED on exactly its target.** `AWAY-1 PARITY` never moved. No version bump, nothing
deployed. `src/core/**`, `supabase/functions/**`, `src/data/**`, `docs/design/*.md` untouched.

**The lesson, stated once: A DIAGNOSTIC THAT REPORTS AN INTENTION AS AN OUTCOME IS AN ASSERTION THAT
ASSERTS NOTHING, WEARING A DIFFERENT HAT — and it is worse, because it is what an incident gets read
from.** Two instances, one hour apart, both found by driving a real gesture rather than by reading:

1. `getActivityState().applied.envelope` was set to `true` immediately after `fire('onEnvelope')`. It
   meant "a hook was called". It read as "the envelope was applied". Measured in real Chromium on a
   switch where the replacement gate had refused and NOTHING was written: `envelope: true`, gold
   unmoved, no receipt. `fire` now returns the hook's value and the field is `!!wrote`.
2. Which immediately exposed the second: legacy's hook was `function(res){ applyServerEnvelope(...); }`
   — no `return`. So the honest field reported `false` on a switch that had genuinely paid 512 gold.
   The first bug had been *hiding* the second.

**The same family, one layer out, in my own test.** ACT-6 ("the away death branch declares nothing")
first drove `window.simulateAwayCombat()` — which is what the b341 death test does — and went RED
with a captured stack showing `onDeath → stopCombat → declareActivity`. Not a bug in the seam:
`ctx.away` is `inOfflineReplay()`, the b227 latch, and **the latch is set by `processOffline`, not by
the simulation.** Called directly the sim runs the LIVE death branch, so my assertion was grading the
wrong half of an `if`. Generalise: *when a test asserts that a branch does NOT do something, first
prove the fixture reaches that branch.* And the control is the whole test — "zero calls" passes
trivially against a dead spy, so ACT-6 requires the same spy to record exactly one live stop first.
Mutation M12 (delete the declare from `stopCombat`) reddens ACT-6 as well as ACT-1, which is that
control doing its job.

**The design call I would defend: one applier for two verbs.** The spec's warning was "route
`collected` through the SAME renderer the away card uses, not through a second one written for this
call". Obeying that literally was impossible — `applyEnvelope` demands `accrued:true` and an `away`
block, which a `set_activity` answer has neither of. So the *shared part* was factored out
(`applyEnvelopeState`, and `summaryFromAway` was already shared) and legacy grew ONE
`applyServerEnvelope(res,{intent})` where the b337 hook body used to be. Two verbs, one idea of what
a server answer means. Adapting the body into a fake `accrued:true` envelope would have been three
lines and a lie in the shape.

**And the one the spec did not mention.** `applyRecord` fails closed on `ok !== true`, so a
`stage:'switch'` refusal — which DID collect, and therefore DID move `accrued_to` — would have left
the record stale by exactly the window that was just paid. `applyIntentEnvelope` returns its
CONSTRUCTED envelope and legacy hands that to `applyRecord`, so a refusal's state reaches the record
without `decodeRecord` learning to trust `ok:false`.

**Part 2 is four lines of guard and a page of reasoning, and the reasoning is the deliverable.**
`offlineBudget` is the only entry on `SERVER_OF_RECORD` and it had two live client writers after b340
moved it — `saveLocal` advancing it to `lastSeen` on every autosave, and the cloud overlay
re-stamping it to `cloudAt` **three lines after stripping it out of that same snapshot**. The header
of `record.js` said "there is no third writer and no fallback"; that was true of `record.js` and
false of the game. What makes it not recur is that the rule is now *askable* (`mayClientWrite`, one
implementation, switch from accrue.js and field list from record.js so neither vouches for the
other's absence, failing CLOSED) and *checkable* (`fingerprint` + `_record.stamp`, so `recordValue`
compares what is there against what it saw arrive). Prevention alone would have left the accessor
still able to lie the day a fifth writer appears for gold.

**Both R-tests mutate the CALLER, which is the b339 condition.** B347-R1 drives the real
`window.saveLocal()` with `document.hidden` forced false — without that force the line never runs in
the harness and the test would pass with the fix reverted, deleted, or replaced by anything at all.
B347-R2 drives `auth.js`'s own `applyCloudOverlay`, which now contains the whole cloud→G seam so that
`pullAndMaybeRestore` (unreachable without a live session) holds no blob→G statement of its own. Both
carry a switch-OFF **control**: a "fix" that freezes the watermark unconditionally breaks a shipping
game to protect a field nothing owns yet.

**Not mine, captured as asked:** `AWAY-16` went red ONCE, alongside mutation M1, and did not recur in
five further M1 runs or eight clean runs. M1 restores the pre-b347 line, which is behaviourally
identical to the shipped one whenever the switch is off — and AWAY-16 runs with it off, so M1 cannot
be the cause. It runs two 8-hour gather nights against the wall clock and compares action counts, so
a tick boundary between the two changes the pile: the same shape as the known `b227 blessing` flake.
Someone should pin its clock.

**Operational note for the next agent:** the session scratchpad is SHARED between concurrently
running agents. A file I wrote as `mutate.mjs` was overwritten mid-session by another agent's harness
of the same name, pointing at a different worktree. Nothing crossed into my files (git status stayed
exactly my seven), but a long background job reading a generically-named scratchpad script can be
swapped under it. Use a name nobody else would pick.
## 2026-08-15 — b348 — Xarn's five, and the runner that could not fail

Branch `agent-a597c79506d8d0445`. Suite **696/696** (baseline 692; +4), 0 runtime errors, 0 console
errors, five consecutive full runs. **Seventeen mutations, each RED on exactly one test.** No version
bump, nothing deployed, nothing applied. Labelled b348 — b347 is the merged away-buff work.

**THE LESSON, AND IT IS ABOUT MY OWN TOOLING: A TEST RUNNER CAN BE THE THING THAT ASSERTS NOTHING.**
`tryRun` is `try { fn(); return pass(name); } catch {…}`. Hand it an `async` body and it receives a
PROMISE — nothing throws synchronously, the catch is unreachable, and PASS is returned before one
assertion executes. I wrote two of those. **Seven mutations, including restoring the exact bug the
tests existed for, all came back GREEN.** Reading them would never have found it. This is b347's
lying-guard family one layer DOWN: not a wrong assertion, a runner that never reaches an assertion.
`tryRun` now fails loudly on a thenable return, naming `tryRunAsync`. **Generalise: when a whole
batch of mutations comes back green, suspect the harness before you congratulate the code.**

**The bug under Xarn's bug was structural, exactly as the brief guessed.** Two recipe authorities: the
generated curve in `gear-tiers.js`, and hand-authored rows in `recipes.js` spread FIRST so they win.
Five of those rows share an ID with their generated twin, so `mergeGenerated` drops the generated
recipe by id and the hand-authored `req` replaces the curve **leaving no trace at all**. Measured
across 22 lanes: **16 rungs off the curve, 3 lanes disordered** — platebody INVERTED (steel 60 >
mithril 55, Xarn's exact case), helm and belt TIED. I moved five values onto the curve and left the
other eleven, because they are ORDERED and retuning them is balance churn with no defect behind it.

**The guard's shape is the part I would defend.** Rebuilding the lanes from item-id patterns would
carry a SECOND copy of the id scheme (plate is `mat.id + '_' + slot.key`; leather/cloth are
`tierId + '_' + slot.slot`) — the same two-authority bug one layer up. So the generator PUBLISHES
`GEAR_LADDERS`, and the guard grades the live merged table against it. It asserts **monotonicity, not
equality to the curve**: a deliberate deviation that keeps the ladder ordered stays legal, because
order is the property the player actually experiences. And it looks rungs up by **OUTPUT**, so
`tailor_leather_boots` beating `craft_leather_boots` is still seen.

**Report #2 was a stylesheet eating a fact, and the archaeology matters.**
`#panel-combat .csb-btn small { display:none }` — comment: *"hide ATTACK/STRENGTH/DEFENSE labels"* —
landed in **b110**, when that font was 10px and the block had no room. Then b227 raised the type floor
to 14.5px (the density argument expired) and **b329 put the per-style SWING TIME inside the same
`<small>`** — the number that answered Xarn's PREVIOUS report, invisible on his phone from the day it
shipped. Measured at 922×423: computed `display:none`, innerText carrying neither fact. And on mobile
`.csb-meta` is hidden too, so there was **no surface at all** stating the XP route. Fixed by splitting
the two facts into `.csb-trains` / `.csb-swing` so a future density pass can drop the speed and never
the route. **Generalise: when you add a fact to an existing element, check what already governs it.**

**Two guards, deliberately, for one bug.** An in-page test cannot force a media query, so it walks the
**CSSOM** (rules inside `@media` included) and fails on any rule hiding the label — it grades the rule
wherever it sleeps. The landscape guard then proves the RESULT at 820×360, because a future density
pass could hide it by a mechanism no rule-scan would name (a zero height, a clipped parent). Its first
run failed for the wrong reason and that was worth more than a pass: the picker was not laid out
because the seeded save is mid-fight and `combat-mobile-tabs.js` steers a live fight to the Arena
until the player chooses. Writing `dataset.mobileSub` is undone within 1.5s; **tapping** the tab sets
`_playerChose` and sticks. The guard now taps, and reports "not laid out" as a DISTINCT failure from
"hides its label", so the next reader is not sent after the wrong thing.

**Report #3 had two causes and only fixing both makes the purchase visible.** The grid sized itself
`max(88, ceil(items/11)*11)` — item count, and the `/11` did not even align to a row because
`.invc-grid` is `repeat(auto-fill, minmax(72px,1fr))`. AND `_renderInvSummary()` overwrote the whole
`.invc-space` node on every tab entry, so the one label stating capacity survived ~50ms and was
replaced by "16 items · 63 gp". Measured before: 88 tiles at cap 100, **88 at cap 160 after paying 45
gems**, 88 at cap 200. After: 100/160/200. **Perf is bounded and measured** — an empty tile costs
~0.006ms, so the grid draws capacity up to a 600 ceiling (~18ms, plateaus there) and states the
surplus as one chip; gold slots self-limit at 1.32× a buy but GEM slots are flat, so capacity has no
upper bound and neither would the DOM.

**A mutation caught my filtered-view assertion being satisfiable by the bug.** I asserted
`filtered.total < bankCap()`. Free space is `cap − used`, so a lane holding fewer items than the bag
lands under the cap **even when it IS deriving from capacity** — the mutation stayed green. Rewritten
as an equality against the container fill, it goes red at "155 tiles for 1 matches (cap 160)".
**A `<` on a derived quantity is usually a `=` you have not worked out yet.**

**Report #4's data half is the same one-authority story.** The six classic hand-authored plate pieces
carry NO `reqSkill`/`reqLv` at all — their gate comes from `tier` through `gearWieldReq`. So
`openInvDetail`'s `if(it.reqSkill && it.reqLv)` line **existed and printed nothing for exactly the gear
a mid-game player is deciding about**. Every surface now asks `gearWieldReq`, the pair `equipItem()`
enforces and the b341 shop row already asked.

**Found in passing, not fixed:** on the generated ladder a tier's gear unlocks BELOW the bar it is
made from — bronze gauntlets 2 / boots 3 / belt 4 / helm 6 against `smelt_bronze` at **8**; mithril
gauntlets 46 through body 55 against `smelt_mithril` at **55**. Pre-existing, systemic, and a
MATERIAL_TIERS design call rather than a bug fix. And `AWAY-16` is **flaky** — twice in ~20 runs under
mutations that cannot touch it.

**Edge payload hash moved; catalogue regenerated (5 `hr_activities` rows, nothing else) — REDEPLOY
AND RE-APPLY NEEDED, NEITHER PERFORMED.**

## 2026-08-15 — b347 — the loop that paid a buff all night and spent none of it

Branch `worktree-agent-a454de83fe91b6768`, with `agent-a06ecbcee310aa2c7` merged in. Suite
**692/692**, 0 runtime errors, 0 console errors, four consecutive full runs. Seven mutations, each
RED on exactly one test. No version bump, nothing deployed.

**The lesson, stated once: a RULE THAT LIVES IN A TABLE REACHES EVERY CONSUMER, AND NOT EVERY
CONSUMER IS READY FOR IT.** `AWAY_SCOPE` was built precisely so the away/active split could not be
a code path — that was the right call and it is why the b326 exploit stayed closed. But flipping
`buff: false → true` opened the channel for three callers simultaneously, and only one of them owned
a clock. The table made the payout universal and could not make the DRAIN universal, because
draining needs a timeline and a timeline is a property of the caller. **When a scope table gains a
member whose rule has two halves, audit every consumer for the half the table cannot express.**

**Measured before/after**, 8h away, woodcutting Normal Tree, one 10-minute consumable eaten on the
way out: `gather_speed +4%` bought **250 extra actions** (6,250 vs a 6,000 control) and drained
**0 of 600,000 ms**; `all_xp +5%` bought **+20.0% XP**. After: **+5 actions**, **+0.417% XP**, buff
spent to zero and pruned. 50× and 48× overpay. **`AWAY-1 PARITY` and `AWAY-5` pass with every bit
of that present** — the combat path was genuinely correct, which is exactly what made the gap
invisible.

**The shape I did NOT invent.** `simulateSpan` asks "is a buff alive?" once per swing, which works
because combat's tick length is fixed. Copying that here would have been wrong: `gather_speed`
changes THE INTERVAL, the number the tick count is derived from. So `replayAwaySpan` uses core's
other established shape — `utcDaySegments` — splitting the span at boundaries and running each slice
at its own rate, carrying the sub-tick remainder across exactly as the UTC-midnight split does. With
no buff held there is ONE slice and the arithmetic is identical to the flat loop, which is what let
every pre-existing away test stay honest rather than be re-baselined. Two boundary sources, one
mechanism.

**A mutation caught a lying guard of MINE, and that is the part worth remembering.** I asserted
`buffsPaused === false` on the expiring-buff scenario. Mutation (iv) — restore the old
`G.buffs.some(alive)` expression — came back **GREEN**: the buff is pruned during the replay, so the
old expression is coincidentally false by summary time. The two expressions differ ONLY when a buff
outlives the absence. **An assertion placed on the wrong fixture is indistinguishable from a passing
one, and only mutation tells you which you wrote.** Four lying guards were found on this repo in a
day; this would have been the fifth, and it would have been mine.

**Termination is a design property, not an accident.** Each pass either consumes the rest of the
span or drains the soonest buff to exactly zero, so the pass count is bounded by the queue. The
64-slice budget exists for the one shape that breaks that — core present but `advanceBuffClock`
missing — and it **flattens to the old behaviour rather than abandoning the night.** `while(guard++
< N)` would have exited with `remaining` unspent, i.e. the player silently losing their absence,
which is the failure mode of every away bug in this file's history. Mutation (vii) demonstrated it
live: with every boundary forced to 0, the budget held and the night still paid.

## 2026-08-15 — b345 — the break that never broke, and two more surfaces that argued with the engine

Branch `worktree-agent-a7cbb539ab26abecb`. Suite **687/687** (baseline 684; +3), 0 runtime errors,
0 console errors, four consecutive full runs. Twelve mutations, each RED on exactly one test with
every other test green. No version bump, nothing deployed.

**The brief's diagnosis was right about the symptom and wrong about the cause, and the difference
mattered.** It said `legacy.js:1342` "KNOWS the run stopped and drops that fact on the floor."
Measured: line 1342 knew nothing. `if(typeof hasInputs==='function' && !hasInputs(rec)) break;` names
a function declared inside the IIFE at ~10670 and never published, so the free identifier resolved
against the global object, the `typeof` was false, and the break **never executed once in its life**.
7,500 `doArtisanAction` calls into a bag empty since call 9 (11,250 at the 12h cap). Had I only added
fields to the summary I would have shipped an honest receipt attached to a loop still burning 11,241
no-op calls.

**And the trap under that.** The obvious repair — make the break work — DELETES player-facing
behaviour. The one honest line the player currently gets ("Out of Raw Shrimp — cooking stopped", plus
the activity actually stopping) is fired by `doArtisanAction`'s own refusal branch, i.e. by the extra
call the broken loop kept making. Proved before believing it: publishing a global `hasInputs` left
`G.activeSkill` stuck on `'cooking'` and the toast gone. So the loop now decides to stop and then
asks the refusal branch to do its job ONCE, rather than growing a second copy of stop-and-say-why.
**Generalise: when you repair a path that never ran, first find out what the broken path was
incidentally doing.**

**Design call I would defend:** death was FOLDED INTO the new `stoppedBy` seam rather than left
beside it. `died`/`diedAfterMs`/`diedTo` are untouched (three surfaces read them, and death owns
richer copy), but a death also reports as `stoppedBy:'death'` — so a renderer asks ONE question
("did the run end before the absence did, and what ended it?") and a future reason (a full bank, a
despawn) is a new VALUE plus a copy row, not a new field and a new branch. That is `AWAY_SCOPE`'s
lesson applied one layer out. `paidMs` is set on EVERY receipt, and the renderers key on the stated
`stoppedBy` — never on `paidMs < awayMs`, which tick-flooring makes true on an ordinary night.

**The thing the browser caught that reading could not.** With the stop line added, the card read
"Cooking ran out of Raw Shrimp 30s in — the remaining 11h 59m paid nothing." immediately above
"Capped at your 12h away max — upgrades raise this." A true sentence standing where a cause belongs,
selling an upgrade that would have bought that player nothing. Both the card and the toast now
suppress the cap line when the run stopped early — and a capped night that ran the whole way keeps
it, asserted both ways so the fix cannot over-correct.

**My own tests were flaky and I found it by mutating.** `power-budget.js` re-installs itself as the
outermost `window.getBonus` on a permanent 1-second interval, so an async test's substituted getBonus
is a different stack after a second (measured: an override reading 3.03 came back 0.28). And
`offlineIntervalMs()` resolves the CURRENTLY ACTIVE action, so reading it after a run that stopped
the activity falls back to a stale `G.skillMs` (3,763 vs the 3,840 the run used). Both fixed by
removing the moving part — claiming `__hrPowerBudget` and pinning the speed keys, capturing the
interval before the run — never by a tolerance. A tolerance on a span accepts a mis-measured span,
which is the whole bug.

**A false-positive mutation, worth more than the true ones.** `M7` (revert `activities-grid.js`'s XP
expression) went RED twice before the pinning and GREEN after — because the reds were the getBonus
instability, not the mutation. The twin is a DEAD renderer: legacy block 27 assigns
`window.renderSkillDetail` last, so reverting the ESM copy changes nothing a player sees. A twin no
test can reach is a twin that drifts, so it now publishes `__tileForGather`/`__tileForArtisan` (the
`__awayCardHtml` pattern) and the suite grades it directly. **Mutation-prove in both directions: a
red that goes away when you stabilise the fixture was never proving your fix.**

**Handed off, not fixed:** `actionRate()` omits the gathering tool's `toolXpB` (which
`doSkillAction` applies before `addXp`), so every xp/hr readout understates a tooled gatherer by up
to 14%; and it omits artisan tool speed, which `activityIntervalMs()` applies. Both live in
`src/core/pacing.js`, shared with the accrual payload — a coordination point, not a drive-by. Neither
is a live/away divergence and the server calls neither today.
## 2026-08-15 — the away buff rule: paying and spending are ONE rule

Branch `worktree-agent-a06ecbcee310aa2c7` · smoke **685/685**, 0 runtime errors, four consecutive runs.

`AWAY_SCOPE.buff` false -> **true**; `blessing` stays false. The scope table's line was never
timed-vs-permanent — it is **server-wide vs personal**, and `clan` already sitting on the permanent
channel was that same call, half-made.

**The measurement that framed the job.** Before: an 8h away night holding a 10-minute +100%
drop_rate buff paid **0 of 12,000 ticks**, and the buff still read 600,000ms afterwards — neither
paid nor drained. After: **250 of 12,000 ticks** (600,000ms exactly), expired and pruned mid-night.
And the half that makes it honest: restoring the freeze while leaving the payout open pays the
**whole** 3,600,000ms absence out of a 300,000ms consumable — a **12x mint**, strictly worse than the
exploit b326 closed. Pay and drain are not two features; they are one rule with two halves.

**Where the clock lives, and why there.** `src/core/combat-sim.js simulateSpan`, per tick — the only
away caller that owns a TIMELINE (it already segments the absence by UTC day for the Boss of the
Day). Nothing was plumbed to make the payout follow: `ctx.bonus` is the client getBonus chain, whose
buff term reads the same `G.buffs` the clock drains. One identity, not two copies reconciled by a
guard — the property `unifyObject` buys for the data layer, applied to time.

**The gap I could not close, stated rather than shipped quietly.** `AWAY_SCOPE` is a TABLE, so it
opens for every away caller at once, and legacy's gather/artisan replay is a flat single-rate loop
(`ticks = floor(spanMs / offlineIntervalMs())`, interval derived once) with no clock inside it — it
pays a buff all night and drains none. Measured ceiling with the shipped catalogue: **+4% speed,
+5% XP**. The fix is a legacy split at the buff-expiry boundary and I do not hold that file. Logged
as a BLOCKER in CONFLICTS.md and written into the foot of `src/core/away.js`, so the next reader
finds it at the table rather than in a document nobody opens.

**Two lessons worth more than the fix.**
1. *A test can pass while asserting nothing, and the giveaway is a mutation that stays GREEN.* My
   first aliasing guard swapped `state.buffs` for a new array mid-span. It could not fail:
   `filter()`/`slice()` share the ELEMENT objects, so a stale array reference drains the live buffs
   anyway. The case that distinguishes the implementations is a buff **appearing** in a queue that
   was empty at span start. Rewritten, the mutation went red at `expected 600000, got 0`.
2. *Fixing the vacuous test exposed a real bug.* Re-reading the queue after the tick — which looks
   equivalent — charged a buff added during that tick for an interval it was never alive for
   (597,600 vs 600,000), because `fx.onSwing` runs inside `simulateTick`. Read once, before the
   tick; charge and drain that one.

**Balance, measured, nothing retuned.** Shipped buff foods are magnitude 1–5 for 2–20 minutes.
Against a 12h cap the longest covers **2.78%** of the night, so a full 12h absence gains **+0.11% to
+0.15%** total output — sub-noise. The ceiling is a fully-covered short absence: 20 minutes with
every stackable combat buff held is **+5.2% XP**. Away crit with `damage_crit` food: **7.67% ->
11.25% effective for the buffed window**, **+1.7% crits** over a full night. The `CHANNEL.CRIT`
comment claiming crit is "gear-sourced by construction when away" was made false by this and is
rewritten in the same commit.

**Perf.** 12h span, 18,000 ticks, median of 7: 2.1ms with no queue, 2.9ms with one. Under 1ms per
replay, and the rig has no fx, so well under 1% of a real catch-up.

**Save.** `G.buffs` is not in `NO_SYNC`, so the drained queue persists by default. Verified through
the real path: a 15-min buff expired and was pruned, a 2h buff came out at exactly 3,600,000ms after
a 1h night, and both `saveLocal` and `HearthriseEvents.snapshot` carried the drained values.

Edge payload hash moved `65f0e8ed297f71b5` -> `95d8adf9c138425b` — **redeploy needed, not performed**.

## 2026-08-14 — b342 — the Field Licence had a rule, honesty copy, and NO SURFACES

Branch `worktree-agent-ae97e9393a06e3ca9` · commit `1a4eeb8` · smoke **675/675**, 0 runtime errors.

**The finding under the five findings.** b341's guard asserted `G._awayLicence` EXISTS. It does. The
away card that was supposed to read it was never built, and the assertion could not tell. That is
this repo's "passes while asserting nothing" family one layer out: it graded DATA where the contract
was EXPERIENCE. Every b342 test reads a rendered surface — `.hd-awayband` inside `#hd-root`,
`#ab-meta`'s text, `.botd-away`'s classList, a click on `.ce-next`, `#welcome-rows` — and not one of
them is satisfied by a field being present in G.

**The receipt is the seam.** A declined night now writes `lastOfflineSummary` (every gain an explicit
0, `licence.declined` stated) instead of only the `_`-prefixed scratch field, so it travels the paths
that already exist: Home card, welcome-back modal, dashboard line. One receipt per absence, whatever
happened in it. Verified: survives save/load, present in the local save, **absent from the cloud
snapshot** (`NO_SYNC` untouched).

**Two things the browser caught that reading could not.**
1. `.botd-away` is a flex row with a `::before` rule, so an unwrapped `<b>41 / 100</b>` became a
   second COLUMN and the sentence broke mid-clause. Wrapped in one `<span>`.
2. Both boss cards only fully re-render on a UTC day rollover — the 1s tick otherwise just rewrites
   the countdown. State-dependent copy would have gone stale until midnight. The tick now watches the
   verdict, and the cache is written by `awayLine()` (the one place that puts it in the DOM), not by
   the tick. A cache of what something ELSE did is the rewire-walker shape b341 retired.

**Measured, adjacent, and someone should decide on it:** whether the welcome-back modal appears at
all is a RACE. Both modals gate on `Date.now() - G.lastSeen`, and `chronicle.js reconcile()` →
`persist()` → `saveLocal()` stamps `lastSeen = now` at ~315ms — before the 1500ms boot timer reads
it. A seeding or newly-levelled account never sees the modal; a quiet established one does. I fixed
the modal's CONTENT, not its trigger: making a currently-intermittent modal reliable is a design
call, and there are still TWO welcome modals (b341 already flagged that the v2 block's "suppression"
suppresses nothing).

**Handoff — the licence gate is still client-only.** `legacy.js:1205` claims "The authority is
hr-accrue, which asks the same fieldLicence() against server-known `stats.kills`". There is no
`licence` anywhere in `supabase/functions/hr-accrue/**`, and `summaryFromAway()` carries no licence
field. `isServerAccrualEnabled()` is off by default, so the client path is what the beta runs and
this is correct today — and wrong the moment the switch flips: under server accrual a declined night
would go silent again. Spec §3.2 / §11 owns it.

## 2026-08-14 — b342 P0 — the companion proc hooks fired TWICE per trigger (measured, fixed)

Branch `worktree-agent-a45c8f05da721f460`. Suite **670/670** (baseline 668; +2), 0 runtime errors,
0 console errors. No version bump, nothing deployed.

**The suspicion reproduced.** `rollProc` existed in `src/legacy.js` (block 31) *and* in
`src/features/companions.js`, and BOTH files wrapped `window.killMonster`, `window.combatTick` and
`window.addItem`. Each wrapper calls the next, so one trigger ran two rolls. This is the b228 bug
one layer up: b228 deleted the duplicated `getBonus` wrapper and left the proc hooks standing.

**Measured, not inferred** — real client, headless Chromium, real `index.html`, proc chance forced
to 1 and the payout marked at 1e7 so no ordinary kill reward could be confused with it:

| trigger | proc applications | toasts | companion XP (want 0.5) |
|---|---|---|---|
| `killMonster()` | **2** | 2 | **1.0** |
| `combatTick()` | **2** | 2 | — |
| `addItem()` gather | **2** | 2 | — |
| `addItem()` cook | **2** | 2 | **1.0** |

After the fix: 1 / 1 / 0.5 across the board. A Raccoon advertising "20% on kill" really fired at
1 − 0.8² = **36%**. Every proc pet paid ~double its declared rate against a power budget that had
never been told — and `HearthrisePetSession`, which only the ESM copy reports to, showed the player
**exactly half** of what their pet was really paying. Block 31 also ran a 250ms interval that fired
a THIRD gather proc each time `G.skillProgress` crossed 0.99.

**The same removal's other half.** legacy.js block 35 duplicated the acquisition hooks too:
- `killMonster` → two independent drop rolls per kill (Wolf Pup's 1% was really 1.99%). The legacy
  copy rolled on `Math.random()`; companions.js deliberately rolls on the **seeded** core stream so
  an away kill stays replayable — so deleting it *paid down* one unseeded roll on the away path.
- `invItemTap` → **measured: one Dragon Egg tap raised TWO `confirm()` prompts.** Now 1.
- `harvestPlot` → **measured: `G.stats.cropsHarvested` moved by 2 per harvest.** The Bunny quest
  ("harvest 100") completed at 50 and the weekly `wk_harvest` ("Harvest 120 crops") at 60. Now 1.

**Kept:** block 35's shop-row injection, `_buyCompanion` and `parseSource` — no ESM equivalent.

**Mutation proof.** `git checkout HEAD -- src/legacy.js` (the exact bug, new tests kept) →
**668/670, the two new tests RED**, every other test green. Restored → **670/670**.

**Standing debt, NOT fixed here (one line, different concern):** `src/features/companions.js:205`
still rolls procs on `Math.random()`. `COMBAT_FX.killMonster` resolves through the wrapper chain
(legacy.js:3020–3028, bare identifiers on purpose), so an **away** kill fires proc rolls outside the
seeded stream — the one remaining unseeded roll on a path whose contract is byte-identical replay.
It is also why `AWAY-1 PARITY` passes by luck: its rig never resets `G.companions`, and only a
`kill`-trigger pet would make live and away gold diverge. The server's `hr-accrue` deliberately has
no `killMonster` fx at all, so it models no companion proc — documented in `accrual.js:284–302`.

## 2026-08-14 - b340 - getting the client off two tables it should never have been touching

Branch `worktree-agent-a9521184e802dbc3f`. Suite **645/645** (baseline 640; +5), 0 runtime errors,
0 console errors. `leaderboard-lockdown-guard` clean with 5/5 mutations RED; `market-offers-guard`
clean; `schema-drift` OK; `rpc-resolution` 41/41. No version bump. **Nothing applied.**

**The finding worth keeping** is in DISCOVERIES: `information_schema` omits materialized views, so
my own grant check on `leaderboard_ranked` was an always-null probe (#14). It was caught because the
mutation harness asserts WHICH assertion fires, not just that the apply was refused - a mutation
proof that only checks "it was refused" scores an always-null probe as a pass.

**Second finding, cheaper but real:** the handoff's market-v2 blocker list was a list of LINE
NUMBERS (`73,93,107,120`), and a line-number list cannot describe `collectSales`, which reads a
COLUMN market-v2 deletes. Closing the four named writes and stopping would have shipped a
minute-by-minute silent 400. When a blocker is recorded as coordinates, re-derive it from the schema
diff before believing the list is complete.

**Design calls I made and would defend:**
- ONE home for "does this RPC exist yet" (`src/net/server-rpc.js`, a classic script because its two
  consumers sit on opposite sides of the module boundary). leaderboards.js keeps its copy - no churn
  - but a suite test now requires the two copies to AGREE across nine status/body shapes. Five copies
  of FNV-1a cost this project five builds of deleted content; two copies pinned to each other cost
  nothing.
- A refusal is never an absence. Only 404/PGRST202/42883/42P01 fall back; 401/403/429/5xx surface.
  A fallback on a bad day reopens exactly the write the migration exists to close, at exactly the
  wrong moment.
- `clans.js` stopped owning a second leaderboard transport. `leaderboards.js` has owned that screen
  since b222; the override now calls its `fetchBoard`. It reads all THREE stat boards rather than
  padding two columns with zeroes, because the fallback renderer prints Lv/CL/gold on every row and
  a zero there is fabricated data about another player.
- `placeOffer` deliberately still writes `market_buy_offers` directly. That table got the full
  stamping/immutability/cap treatment in the APPLIED 2026-08-12 migration and market-v2 does not
  touch it; routing it through an RPC would invent a third market authority model for nothing.

**Mutation-proven RED, each named:** M1 createListing POSTs the table (caller), M2 listClans GETs
clan_leaderboard (caller), M3 NetClient.leaderboard reads the view (caller), M4 collectSales polls
regardless of schema (caller), M5 isMissingRpc reads 401 as absent. Four of the five are on the
SHIPPING METHOD, not on a helper - b339's lesson.

**Handed off:** market-v2 is unblocked on the client-write precondition ONLY; `player_inventory` is
still empty and the gold/inventory rewire is still open. F5's migration must not be applied until
b340 is deployed.

---

## 2026-08-14 · b339 — clearing Security's six conditions, and a guard that asserted nothing INSIDE the guard about guards

Branch `worktree-agent-accebe93e640a7e76`. Suite **640/640**, 0 runtime errors (baseline 632; +8
tests). `character-bootstrap-guard --selftest`: 18/18 mutations caught, 3 of them new. No version
bump. **The migration was EDITED, NOT APPLIED.**

**The finding worth keeping.** §5(K) of `2026-08-14-character-bootstrap.sql` counted callers of
`hr_create_character` through `pg_depend`. **A PL/pgSQL body is an opaque string to the dependency
tracker — a function->function call creates no edge.** Measured: `pg_depend` callers of `hr_rate_ok`
= 0, text-scan callers = 6. So the assertion returned 0 on every database that will ever exist,
including the day the non-VOLATILE caller it was written to catch arrives. That guard existed
*because of* the A11 outage, which existed because a volatility claim was made about a call tree
nobody had scanned. Instance #13.

**What I did differently from "swap pg_depend for prosrc".** A prosrc scan is just as unfalsifiable
if nothing proves it can see anything, so the replacement PLANTS a STABLE function that calls the
target, requires the scan to find it by name, drops it, and only then believes the scan's zero. And
the scan is ONE query text `execute`d twice — control and assertion — so blinding the assertion
blinds its own proof. That is the b332 pack-edge lesson (a property defended by two call sites
agreeing is defended by nobody) applied to an assertion instead of a build.

**The mutation that SLIPPED, and why it is the most useful result of the session.** I wrote a test
proving `accrue.js` resolves the active character slot, and separately took `slot: 0` out of
`auth.js`. Then I ran the mutation — put `slot: 0` back in `auth.js` — and the suite stayed 639/639
GREEN. The test configured the module itself, so it could never see the wiring. That is the "proof
of the ADJACENT thing" family from b332, and I only found it because I mutation-tested a fix I was
already confident in. The fix: `enableLiveSync`'s two inline object literals (unreachable without a
live session) became `buildIntentWiring`/`wireServerIntents`, driven by the suite with spy modules.
**Generalise: if a test does its own setup of the thing under test, it is testing the module, not
the integration. Mutate the CALLER, not just the callee.**

**A side effect I nearly shipped.** Stamping the away watermarks inside `setServerAccrualEnabled`
(so flipping the switch back OFF cannot re-pay a span the server already paid) meant the SMOKE SUITE
flips it four times against the live `G` — so a player running the suite in-game would lose their
banked rested charges to a test. Fixed by save/restoring in the two switch-only tests and by only
stamping on an actual CHANGE. Worth remembering: a function that becomes stateful is a function
every existing caller now has a new relationship with, tests included.

**Known-flaky, NOT mine:** `b227: OFFLINE output is byte-identical with and without an active
blessing` failed once in ~13 runs (11390 vs 11415 XP) and passed every other time, including all
nine mutation runs. It re-runs a 3h absence twice against the wall clock, so crossing a tick
boundary between the two runs changes the pile. It runs long before anything b339 touches. Someone
should pin its clock.


## 2026-08-12 · Making `hr-accrue` deployable — the `?v=` strip, and a five-build drift

Branch `fix/edge-payload-strip-query`. 597/598 (the one red is the pre-existing, someone else's
`b222 SEAM 1: goldFind`). **No version bump — Tyler ships.** New payload
`752c6a7a83cd49e70b31fc91a5c68a42b1a978c4c77dc35476d2207dcf8da381`, 22 files, 230,560 bytes.

**The decision I want to be able to defend later.** `pack-edge`'s header spent forty lines
defending "the vendored files are byte-identical to the repo", and it was defending a real thing.
I gave it up, and I want the reasoning on the record rather than the outcome: byte-identity was
always the MEANS; the END was "the server runs exactly the rules the client does". A payload the
hosted bundler rejects runs no rules at all, so the means had to yield. What I refused to do was
replace it with *nothing*: the invariant is now

    vendored payload bytes === stripVersionQueries(repo bytes)

— identity after ONE named, total, mechanical transform, asserted by `--check` against the raw disk
bytes (not against a re-run of the transform under test, which is the S10 trap this file already
carries a scar from).

**Why the strip is unconditional and not a flag.** Three options: flag, default-on flag, only
behaviour. The brief called a must-remember flag the weakest and I agree, but the decisive argument
is stronger than "people forget": if `pack()` accepts an option that changes the payload, then the
smoke suite's hash guard and the hand-run deploy agree only because two call sites pass the same
argument *today*. Remove the parameter and they agree **by construction**. And the failure mode of
disagreement is nasty — a permanent hash mismatch whose obvious "fix" is to loosen the comparison,
which converts the only deployed-bytes-equal-reviewed-bytes check in the program into decoration.

**Two guards, both mutation-proven RED before I trusted either.**
1. `pack()` fails if any relative specifier survives into the packed bytes with a `?v=`. It is
   deliberately BROADER than the transform: `stripVersionQueries` only understands `… from '…'`, so
   a side-effect `import './x.js?v=331';` would slip past it and reproduce the exact 400. Proved by
   planting one in `src/core/combat-sim.js` (RED), and again by reverting `vendorSource` to return
   `src` (14 RED, plus 4 from the vendored-equality check).
2. `versionQueryGuard()` fails if any file under `supabase/functions/**` or `tests/**` carries a
   `?v=` on disk. Proved by restoring `?v=326` on one import — RED through `--check` AND through
   the full smoke run, because a guard is only wired if you have seen it fail *there*.

**The second bug was the more valuable one.** `bump-version.sh` walks `src/` only, so the function's
imports had been frozen at `?v=326` since b326 while their targets moved to `?v=331`. I did not
widen the script. A cache-buster is a browser mechanism; nothing under those roots is served to a
browser, so a version there has no job and can only rot. Removing it also means **a bump no longer
moves the payload hash** — verified by rewriting `?v=331 → ?v=999` across `src/**` and repacking to
the identical digest. That deletes a whole class of "redeploy required for a change that altered no
behaviour".

**Debt paid:** `pack-edge --check` existed and nothing invoked it on a push; it is now in
`run-smoke.mjs`, and `pack()`'s own problems — previously discarded while the hash was kept — are
surfaced. Reporting a hash for a payload that cannot deploy is the decoration failure in miniature.

**Known limitation, stated:** I have not deployed. The bundler-acceptance claim is inference from
its own error message (it named the file it could not open), not execution. First person to deploy
should confirm, and if it still fails, the next suspect is `npm:postgres@3.4.5` — not the queries.

## 2026-08-11 · b330 — the clan management surface, and two flakes that were never flaky

Branch `feat/clan-management-b330`, off `173665d` (b329). **590/590, 0 runtime errors.** No version bump.

**The lesson I want to keep.** Both "flaky" tests were tests whose fixtures did not guarantee what
they asserted, and in both cases the honest fix was a *seam*, never a tolerance.

- `b307` asserted "a second read of the SAME INSTANT banks nothing" while sampling `Date.now()`
  five separate times. `claimOfflineMs(now, active)` takes the instant as a parameter for exactly
  this reason. Freezing it made the test say what it meant. A tolerance would have accepted a real
  few-millisecond double-pay — the b214 class.
- `b260` replayed five real minutes of away combat with an rng seeded from `Math.random()`. On the
  unlucky seeds the player *died*, which clears `G.activeMonster`, so the resume correctly re-armed
  nothing and the test called it a failure. I proved that rather than assuming it: weakening the
  fixture on purpose produced 2 failures out of 2 with that exact message. Death is now removed by
  construction, the seed is pinned, and the precondition is an assertion — a future balance change
  fails loudly instead of going flaky.

**The bug I would not have found by reading.** Arming the two-step Remove repaints the modal, and
the repaint rebuilt every control from its descriptor — so picking a 24-hour bar and then clicking
Remove sent **168**. Caught by driving the panel in a browser with a stubbed `fetch` and reading the
request body. Fixed in `paint()` (which already preserved `scrollTop` for the same reason), so the
whole `[data-cs-sel|qty|txt]` family is covered, including the Storehouse deposit picker's identical
latent defect.

**What I deliberately did not do.** No `clan_invites` SELECT policy, no invented decline path, no
session-only invite list. The outstanding-invitations list is derived from `clan_ledger` (public
read, journalled by every membership RPC) and the replacement RPC is specified in `CONFLICTS.md`.

## 2026-08-11 · XARN'S AUTO-EAT — a control that wrote to nobody

Branch `fix/auto-eat-threshold-b329`, commit `2f90ad8`. **581/581, 0 runtime errors.**

The bug was not in the combat path at all. Settings › Gameplay's threshold slider wrote
`G.settings.autoEatPct` + `G.autoEatPct`; the engine (`maybeAutoEat`) reads
`G.autoActions.eat.threshold`. `ensureShape()` bridged them exactly ONCE, at branch creation.
So the control was live-looking, saved, rendered its own value back — and reached nothing.
**A settings control that persists its own copy is indistinguishable from a working one.**
The class of bug to hunt: config with a UI copy and an engine copy and a one-shot bridge.

Two things I nearly shipped badly, both caught by EXECUTING rather than reading:
1. `setEat()` mirrored `G.autoEatPct` via `eatThreshold()`, which re-enters `ensureShape()` —
   whose new adoption branch read the still-stale mirror and clawed back the value being set.
   The b133 round-trip guard caught it. Never re-enter a normaliser from inside a writer.
2. The adoption branch ("mirror wins when they diverge") made the slider APPEAR fixed even
   with the write-through reverted — i.e. it had quietly reinstated the mirror as a permanent
   second writer, the exact shape of the bug. Only reverting the fix to check the test had
   teeth exposed it. It is now marked with `eat.pctSynced` so it is a MIGRATION, not a rule.

`x || 0.5` on a numeric config is a bug generator: 0% ("never auto-eat") became 50%. Swept.
Half the report — "does not heal up to the threshold" — was the DESIGN, not a defect
(one Provision per `fx.autoEat` call, once per tick, live and away identically). I documented
it in the UI and handed the balance question to the Designer rather than deciding it.

## 2026-08-11 · THE UNIFICATION — one combat loop for active and away play

`processOfflineCombat` is DELETED. Live play and away accrual now run one function,
`src/core/combat-sim.js simulateTick(state, ctx)`, with `ctx.away` deciding which bonus
channels are in scope. Ruling: `docs/design/away-time-ruling.md`. **Smoke 569/569 (was
554/554, +15). Runtime errors 0. No version bump, no commit.**

**The second loop had drifted in ELEVEN ways, all silent losses to the away player** — no
crits, no `m.xp` (~21% of combat XP), no Boss-of-the-Day lift, no `dropRate` term, no drop
log, no dailies, no quests, no deeds, no `stats.deaths`, the flat 2.4s tick instead of
`combatTickMs()` (a hammer swung 26% MORE often asleep than awake), and — the one nobody had
counted — it never called `window.killMonster`, so the five modules that WRAP that name
(dungeon keys, companions, pets, collection log, chronicle) were skipped away too. Nine of
the eleven are one copy-paste gap repeated. That is the whole argument for one formula.

**The rule is a TABLE, not a code path.** `src/core/away.js` publishes `AWAY_SCOPE`
(permanent/crit/botd/heal = pay away; blessing/buff = do not) and `channelApplies()`. The
world-events wrapper already asked the b227 latch; the buff-queue wrapper now asks the same
one. An UNKNOWN channel defaults to PAYING — the five omissions were all base rewards that
silently vanished, so "quietly missing" must never be the default.

**Three prerequisites, built as core modules.** `botd.js` — the rotation as `botdFor(atMs)`,
byte-identical hash/keys/pool order so today's boss did not move; `buffs.js` — `BUFFS_DEF`
plus `tickBuffs(buffs, elapsedMs, ctx)`, a clock that is a function of elapsed time rather
than a `setInterval`; `combat-sim.js` — the loop. `_toolCarry` → `toolCarry` (migration
v12→v13): the `_` prefix kept a real, earned fractional carry out of the cloud snapshot, so
a device switch discarded it.

**A live exploit closed.** Eat a 10-minute buff → shut the tab → collect twelve buffed hours
→ return with the buff still reading 10:00. Buffs reached the away replay through `getBonus`
while the clock only ran in a live tab. Frozen now: no pay, no drain, no food consumed.

**Three unseeded rolls found IN the kill path** and routed through the RNG seam:
`dungeons.js trySpawnKeyDrop` and `companions.js` drop roll were bare `Math.random()`. The
PARITY test caught the first one within a minute of being written — identical seeds,
identical drop tables, different key counts. That is the value of the test: it does not just
guard the ruling, it finds every remaining hole in replayability.

**A P1 perf defect found with the CPU profiler, unrelated to the ruling but on the same hot
path.** `observability.js` subscribes to the event bus with `on('*')` and its `track()` did a
full read-modify-write of a 500-entry JSON buffer through localStorage PER EVENT. 46% of a
12-hour catch-up, and it costs LIVE play on every kill. Same shape as the incident sync.js
documents above its `EVENT_ALLOWLIST`. Buffer is in memory now, persisted on a 1s trailing
debounce plus immediately on error/flush/pagehide. Also memoised two per-kill table rebuilds
(`pets.js parse()` ran on every `addXp` — three to five times per TICK; `companions.js` drop
sources are indexed by monster now). **12h replay: 848ms → 336ms**, while doing nine more
systems' work than the loop it replaced (which was 184ms).

**Measured, not asserted.** 12h/18,000 ticks/973 kills: 336ms, 2 UTC segments, `rateMult` 1.00.
22h: 296ms. Away XP on a level-appropriate foe: kill XP +58.2%, plus a typical 7.5% gear crit
→ **+65.2%** vs the deleted loop (the ruling's ~+30% is a portfolio average across tiers; the
share is larger where per-kill XP dominates per-damage XP). `toolCarry` round-trips through
`saveLocal` AND `events.snapshot`; no `_`-prefixed key reaches the cloud.

**What I could not reconcile, stated plainly:** away no longer calls `stopCombat()` on death
(it nulls `activeMonster` instead), so the launchpad's `recordStop` still does not fire for an
away death. Calling it would repaint during `loadLocal()`, before the combat panel exists.
Status quo, not a regression — flagged rather than guessed at.

## 2026-08-11 · b323 P1 HOTFIX — the core readiness gate (Phase 0 cold-load crash)

**The regression.** Phase 0 rewrote ~50 simulation call sites in `src/legacy.js` (a CLASSIC
script) onto `window.HearthriseCore`, published by `src/core-bridge.js` (a MODULE, therefore
deferred). Between "legacy.js parsed" and "core-bridge evaluated" the engine is armed but its
maths is missing. Nothing on DOMContentLoaded is at risk (that fires AFTER deferred modules, by
spec — which is why `boot()` was fine). The exposure is work classic scripts SCHEDULE at parse
time: legacy.js alone registers 21 top-level `setTimeout`/`setInterval`s.

Measured on a cold load (only `/src/core/` + `core-bridge.js` responses delayed): **6 pageerrors**
— `getCombatLevel` ×3 via `renderMonsterList`, `getArmorSetBonus` ×2 via `applyAll`, `getLevel`
×1 via `checkAchievements`. A property-getter trap on `window.HearthriseCore` found **49 pre-core
reads across 8 distinct sites** — three more than the crash showed (`migrate` at legacy.js:7750,
`renown.js computeRenown`, `_eqStatsTotals`); the visible crashes were only the subset that
happened to dereference.

**The fix: `src/core-ready.js`** — a classic script placed after the non-engine scripts and
before every engine script. It parks `setTimeout`/`setInterval` registered in the boot window and
releases them, in registration order, when `core-bridge.js` calls `window.__hearthriseCoreOnline()`
as its last statement; then it uninstalls itself. Registration order == file order, so the
scripts above it (theme-picker, observability, storage seam, account gate) are never delayed.

**Why not the alternatives.** Fifty guards is O(call sites), regresses at site 51, and a guard
that returns 0 makes a renderer paint a wrong number silently. A synchronous core would need a
classic mirror of `src/core/*` — a second copy of rules an Edge Function also runs, i.e. exactly
the "one identity" property Phase 0 bought. The timer queue is the single choke point the whole
failure class passes through.

Also published: `whenCoreReady(fn)`, `isCoreReady()`, `HearthriseCoreReady` (promise).
`renderStyleSelector`'s ad-hoc 200ms re-arm poll now uses the gate.

**Two traps found while building it, both fixed:**
1. A released timeout runs under a NEW platform id, so a caller holding the parked id could not
   cancel it. Both `clear*` now consult a remap table which self-empties.
2. Adopting `whenCoreReady` in `renderStyleSelector` created infinite recursion on the *coreless*
   release path (release sets ready → waiter fires immediately → re-registers). **Anyone adopting
   `whenCoreReady` for a RETRY must check `isCoreReady()` first and give up if it is already
   true.**

**Guards added:** `coldLoadGuard` in `tests/run-smoke.mjs` (delays the core module graph 2s via
Playwright route interception, so it works against `--url` production too) plus one in-page
contract test in `smoke-test.js`. Both fail without the fix; the node guard reports exactly 6.

Smoke **554/554** green (was 553). Runtime: 0 pageerrors at 0 / 1.5s / 6s module delay, engine
functional (monster list renders, the 100ms tick survived parking, `saveLocal` works,
`window.PACE === core.PACE`). No version bump, no commit — Coordinator integrates.

## 2026-08-11 · PHASE 0 EXECUTED — the shared simulation core (`src/core/`)

Phase A of `docs/design/server-authority.md`. Behaviour-preserving extraction; the client still
calls everything. **Smoke 544/544 (was 540/540, +4 new). Console clean. No version bump, no commit.**

**Created — 1,529 lines:** `src/core/{rng,xp,combat,drops,pacing,rested,tools,farm,progression,index}.js`
(911 ln, pure ESM — zero `window`/`document`/`Math.random`/`Date.now`/timers/`console`);
`src/core-bridge.js` (206 ln, the ONE impure adapter, the only file that knows both worlds);
`tests/core-purity.mjs` (332 ln — DOM-free guard + PRNG determinism + balance anchors, wired as a
Node-side preflight in `tests/run-smoke.mjs`).
**Net `src/legacy.js` 15,050 → 14,915** while ADDING ~90 lines of comment, so ~220 lines of live
simulation actually left the monolith.

**Three things to know before touching this:**

1. **LOAD ORDER.** `core-bridge.js` is a MODULE: it runs after every classic script but before
   DOMContentLoaded. So `legacy.js` must do NO parse-time work needing the core. Exactly one such
   call existed (`migrateBountyHunterSkill` → `ensureBountyState` → `getCombatLevel`, `:6140`) and
   is deferred to DOMContentLoaded. The account-wall guard fails the build on any console error —
   that is the net that caught it, and the net for the next one.
2. **THE CONSTANTS ARE ONE OBJECT.** `XP_TABLE`, `COMBAT_BALANCE`, `PACE`, `DROP_BAND_MAX`,
   `SPEED_FUSE`, `RESTED_*`, `COMBAT_XP_SKILLS` etc. are deleted from `legacy.js` and published on
   `window` by the bridge FROM the core. `window.PACE === core PACE` — identity, not a copy, which
   is why the b226 tests that stub `window.PACE.xp` still move the real grant. They are window
   properties now, not lexical `const`s: never read them at parse time.
3. **DELEGATION MUST NOT DROP A LINK.** `getEquipmentStats`, `getArmorSetBonus` and
   `restedQuantum` are WRAPPED at runtime (companions.js, clan-seat, the suite). The bridge routes
   through `window.*` for those deliberately — calling core directly would silently escape the
   wrapper. A smoke test asserts the other 21 entry points are one-line hand-offs (source-text
   check; ES module namespaces are frozen, so stubbing is not available as a proof).

**The RNG seam.** `Math.random()` is gone from every extracted path; randomness is injected
(`src/core/rng.js` — mulberry32 + `hashSeed`). The client seeds once from `Math.random()` at boot,
so behaviour is unchanged. `HearthriseCore.setRng()` replaces the old `Math.random = () => 0` test
trick (b235's crit test uses it now — strictly stronger, since it can only pass if the engine
genuinely takes randomness through the seam).

**Divergence found, NOT fixed — Designer call.** `processOfflineCombat` (`:1171`) is a SECOND
combat loop: it never rolls crits, and its drop chance omits the `dropRate` food buff and the
Boss-of-the-Day lift. Offline therefore pays less than online, invisibly. Predates this work;
preserved exactly and flagged in-code rather than quietly "fixed".

**Perf:** 12-hour offline combat replay (~18,000 ticks) measured **184 ms before, 184 ms after**.
Save/load round-trips `restedXp` / `restedAt` / `_toolCarry` unchanged.

**Remaining Phase A:** `doArtisanAction` (`:9910/:9917/:9947` — three bare `Math.random()`),
bounty generation (`:2194/:2218/:2314`). Timer/retime machinery deliberately NOT ported (§4.4: the
server deletes it). `power-budget.js` NOT ported — it polices a wrapper chain, it is not
simulation; server-side the perk sum is computed directly, so porting it would be cargo cult.

**Pre-existing, not mine:** `src/features/character-page.js:23-25` imports `../data/*.js?v=309`
against build 318, so `bump-version.sh --check` fails today.

## 2026-08-09 · Itemization Program Phase 1 — Slice B audit (READ-ONLY, no code changed)
Deliverable: `docs/reports/itemization-audit/B-combat-bosses-dungeons.md`. Scope: combat/monsters/bosses/dungeons/raids-Hunt/bounties/drop-tables.

**Headline findings:**
- **Bosses: 8 data-modeled** — 6 Hunt (`raids.js` BOSSES L79-104) + 2 `boss:true` monsters (`lich`/`dragon`, `monsters.js` L46-47). `boss:true` is a DECORATIVE flag — no combat consumer. Dungeon "bosses" are just HP numbers + loot tables (only Bone Lord has real stats, via the one scavenger config).
- **Boss framework: HALF data-driven.** You can add a HUNT boss by editing data, but it's welded to the clan-raid economy. No framework for ordinary/daily/progression bosses. Rotation engine to REUSE exists and is clean: `HearthriseWorldEvents.utcDayKey/utcWeekKey` + FNV1a `_hash` (`bossOfWeek` raids.js L345).
- **Daily boss: 0.** Weekly = the Hunt (=weekly+raid are the same feature). No daily-boss rotation despite the machinery being right there.
- **Dungeons: 7 solo instances, 3 run paths unevenly built** — scavenger (the good one) configured for ONLY crypt_of_bones; voidbringer/ancient_wyrm are auto-run-only. NO dungeon-native item identity (no set/token/currency/dungeon gear).
- **Drop tables: NOT standardized.** No rarity bands; "rare" = magic `ch<=0.05` threshold at consumer (`killMonster` L2431); rates scattered across monsters.js/dungeons.js(×2)/raids.js/bounty tables; runtime `dropMult` mutates declared rates. Only ~26 items carry `rarity:`, ~16 `tier:`.
- **Combat reads accuracy + maxHit + weakness-match + style ONLY** (`combatTick` L2367, `getPlayerCombatRolls` L1269). **Crit is displayed on 4 screens but NEVER applied** (dead stat). No elemental/status/DoT/passive combat system. Emberfang-style boss effects → HOOKS MUST BE BUILT. `rollProc` (L11410) is a companion ECONOMY proc (gold/doubleDrop), reusable as a dispatcher pattern only.
- **Orphan drops: ~29 of 73** (verified by script) consumed by nothing & no equip/food/scroll identity — incl. marquee boss/Hunt/dungeon loot `death_steel`/`void_chitin`/`hell_ember`/`war_crown`/`dragon_gem`/`ruby`. The 6 Hunt SIG mats are the exception: each feeds a tier-8 unique recipe (recipes.js L128-131,178) — the one working boss→unique-gear loop.
- `boss`/`chain` bounty types defined (BOUNTY_TYPE_MULT L607) but never generated.

**Top 5 (full rationale in the report):** (1) data-driven boss schema + rotation engine, back-port the Hunt onto it; (2) standardized banded drop-table schema, one tunable source; (3) retire/route the ~29 orphan drops; (4) build combat status-effect subsystem + activate crit; (5) dungeon item identity + finish run experience.

## Standing knowledge
- Content authored ONCE in `src/data/*`; `main.js` identity-merges ESM into `window.__LEGACY_INLINE`. Never reintroduce the data double-copy (top-level `const` shadowing). Guard test asserts identity.
- Theme: `:root` = dark tokens; `body[data-theme="cozy-light"]` for retired light. Guard tests fail if unscoped patterns return. When a visual bug recurs, find what re-asserts it — don't stack overrides.
- Economy server-authoritative (Supabase, `schema.sql` applied); no PvE Hearth Token mint; race-safe market + seller ledger.
- Save: `snapshotG` = manual 24-field allowlist (fragile); new state must survive save/load.
- Don't rewrite working architecture without strong evidence. Think at 10× content.

## Standing debt (b214 audit, grade C−)
`showTab` wrapped 23×; `wrapShowTab`/`HearthriseIdentity` built, 0 consumers; 27 files use `localStorage` directly vs 3 on the seam; ~3,000 lines inert cozy-light CSS deletable; gear wield/level-requirement seam unbuilt.

## Log
### 2026-08-09 · CHARACTER/SKILLS SCREEN REWORK — Phase 1 · branch `agent-charscreen` (on b228)

Spec: `docs/design/character-skills-rework.md` (APPROVED, DECISIONS 2026-08-09). Worktree `.claude/worktrees/manual-charscreen`. Built the combined Character screen (sub-tabs **Skills · Equipment · Hero**, Skills default), moved the REAL multi-character selector to Home, cut the fake paywall, mitigated the 3 named breakage risks, and built the Time-Played counter.

**Files:** `src/features/character-page.js` (rewrite — shell/pane split, Account stat grid, skills→character alias, isSkillsVisible seam, scoped token CSS), `src/legacy.js` (isSkillsVisible + broadened 3 live-progress guards @ skillProgressInterval/refreshAll/artisan-progress; `G.stats.playMs` + `tickPlayMs` presence-gated off the existing 10fps activity-bar loop; `window.HearthrisePlayTime`; `window.ACHIEVEMENTS` publish; per-tab progress strip retargeted `panel-skills`→`panel-character`), `src/multi-character.js` (shared `slotRows()`/`selectSlot()`/`esc`; drawer refactored to consume them), `src/features/home-dashboard.js` ("Your heroes" block + wiring, account-gated), `src/ftue.js` (skills step retargeted to `data-tab="character"` — data string only, NOT the filed listener-leak fix), `index.html` (removed standalone Skills nav-btn + bn-btn; `#panel-skills` → empty stub; ids moved into `#panel-character`), `src/features/smoke-test.js` (+11 new b229 tests; 6 existing retuned honestly for the fold).

**3 risks (each with a test):** (1) live bar freeze — every `activeTab==='skills'` hot path now asks `isSkillsVisible()` (`activeTab==='skills' || (character && _charPane==='skills')`); test asserts true on Character/Skills, false on Hero. (2) sub-tab snap-back — `window._charPane` persisted exactly like `_tdPane`, shell built once (never re-innerHTML'd), content repainted into stable `#skills-list`/`#skill-detail`; test re-renders twice and asserts Hero survives. (3) alias/deep-links — `showTab('skills')` aliased in the ESM wrapper (shell built synchronously so `openSkillDetail`'s deferred paint lands); `#skills-list`/`#skill-detail`/`#skill-detail-title` kept in DOM (moved into `#panel-character`); quest-nav/Home-cook/FTUE all funnel through unchanged; tests assert character/skills/profile all resolve.

**Account panel sources (real):** CL `getCombatLevel`, TL `getTotalLevel`, Total XP ΣG.skills, Quests `G.quests.filter(done)`, Achievements `G.achievements[*].unlocked` / `ACHIEVEMENTS.length`, Bounties `G.bountyHunter.completed`, Collections `HearthriseCollection.getStats().overall`, Renown `HearthriseRenown.getState().rank.name`. **NEW:** Time Played `G.stats.playMs` — presence-gated (`blessingsApply()`), delta-capped at 4s (skips sleep/background gaps), ticked from the existing `setInterval(refreshActivityBar,100)`. Total XP + Time Played behind "click to reveal" (`window._charReveal`).

**Migration table (38 items):** ~26 preserved/relocated (doll wholesale incl. companion pane + `_tdPane`; quest-nav/lanes/train-goal/avatar-upload all keep working — identity.js still wraps renderCharacter, decorate re-fires on sub-tab switch because switches go through `window.renderCharacter`), ~9 moved/merged (hero/combat/rates→Hero; skills seams→Skills sub-tab by id; equip summary→real Equipment sub-tab + "Full inventory →"), 3 cut (fake `buildSlotsCard` paywall, standalone Skills nav-btn/bn-btn, dead legacy renderCharacter path left for later cleanup). Nothing silently lost.

**Deferred to Phase 2 (per spec §7.2):** OSRS square-tile grid ART (Phase 1 reuses the existing tiles relocated), the playMs "reveal" flourish (counter itself is built + live), doll internal-Stats vs Hero-stats de-dup, removing the Inventory doll copy + `#panel-skills` stub.

**Verify:** smoke **435/435** (424 baseline + 11), 0 runtime errors; `bump-version.sh --check` OK (no bump). Browser (own Playwright server :8180, harness-flag bypass, cache-busted): Skills default renders grid + detail; Equipment shows the doll with Equipment/Stats/Companion tabs; Hero shows identity + Upload-portrait + 9-cell Account grid (**Time Played read "8s" live — real, not faked**) + Melee/Ranged/Magic; a skill tile → 7 activity tiles inside the Character screen; Home shows "Your heroes" (Adventurer ACTIVE·now, Second Hero·Play, slots 3-5 Buy/locked); clicking Play → `selectSlot(1)`. Did NOT bump build/CHANGELOG (Coordinator does at integration).

### 2026-08-09 · THE BONUS REBASE + THE RENOWN PACE RETUNE · branch `agent-rebase` (b228)

Tyler, binding: *"the % boosts across the board are way too high. 50% smithing? it should be like increments of 2%."* and *"we need to explain how to gain renown, because I don't even know. It also seems to be going way too fast."* Blueprint: `docs/design/bonus-rebase.md`. Worktree `.claude/worktrees/manual-rebase`. Files: `src/features/power-budget.js` (NEW), `src/legacy.js`, `src/data/companions.js`, `src/data/items.js`, `src/features/{companions,renown,world-events,muster,clan-seat,clan-seat-ui,profile-launchpad,smoke-test}.js`, `src/market.js`, `src/main.js`, `index.html`, `tests/run-smoke.mjs`, `supabase/migrations/2026-08-09-bonus-rebase.sql` (NEW), `CHANGELOG.md`. **Untouched on purpose:** the tool ladder (it is gear, and the 57.2-day pacing floor was derived WITH it — rebasing it re-opens the anchor Tyler approved), gear/monster stats, `PACE`, worker efficiency, food heal amounts, and the homestead room ladders (already at the small grammar in b227 — verified, not re-touched).

**1 · The fuse left the castle, because it could not do its job there.** `getBonus` is a base function plus six additive monkey-patch wrappers. The only fuse in the game sat at layer 4 (`clan-seat-ui.js fuseAllXp`) and reduced **only layer 4's own contribution** — companions, food buffs, the muster aura and the whole blessing calendar were added *above* it and were unpoliced. It also policed one key, which is exactly how `smithSpeed` reached +90% with nobody noticing. New `features/power-budget.js` installs as the **final** wrapper: `permanent ≤ 0.20 · temporary ≤ 0.15 · total ≤ 0.30`, per key, on the nine throughput keys, with counts/reliability/duration/ghosts named explicitly as exempt rather than defaulted. The permanent/temporary split is read from each owner directly (`feastBonus`, `liveBonusFor`, the new `muster.liveAura`, `getBuffBonuses`) so no wrapper ordering can fool it, and an owner that throws reads 0 → the power counts as *permanent*, which is the strict direction. **Load order is not trusted:** clan-seat-ui retries its hook on a 200ms timer and the ESM boot installs after every classic script, so `ensureOutermost()` re-wraps whenever something else lands on top (re-clamping is idempotent — min(min(x)) = min(x)), it is called explicitly from `main.js` after `setupCompanions()`, and a 1s watchdog holds it. `CASTLE_TOTAL_CAP` and `PERMANENT_ALLXP_CAP` are **deleted**, not left disagreeing; `CASTLE_KEY_CAP` stays at 0.05 because it is the castle's own *share*, enforced where it is granted. `speedClamp` stays at the consumption choke-point as the last line of defence, retuned 0.85 → **0.70** — derived, not chosen: the largest legal reading is `gatherSpeed` at the 0.30 peak plus the out-of-budget tool ladder's 0.35 = 0.65, so it never binds on a legal stack and still stops `ms × (1 − speed)` reaching zero.

**2 · The magnitudes.** Castle wings `0.005/level` → **+1% at L4, L7, L10** (three felt steps, not ten invisible ones); Great Hall +1%/tier **above the first** → +4% at T5; War Room 10% → 3% with its panel copy re-led on the **Hunt tier ceiling**, which is what that building actually sells. Feast ladder .08/.12/.15/.18 → **.01/.02/.03/.04**, Last Call **+8%**, hours untouched. All 15 blessings ~4× down (Grand Fair 4, forge_fires 4, guild_works 6, deep_veins 6) — deliberately **not** to 2%: a blessing is double-discounted (temporary AND presence-gated to ~17% of the day), so the Grand Fair at +4% is worth 0.69% of a week against the Great Library's 5.00%, and cutting it further would make b227's entire online-pays mechanic worth +0.3%. Muster aura 10% → 2%. Companion bases .05–.10 → **.01** (×2.45 at Lv30 = the budgeted +2.45%). Food buffs onto a 1/2/3/4/5 tier ladder (Lich Soul Soup 50% → 5%). Toolshed 5% → 2%; capstone 5% → 2%; renown four ranks to +1% each.

**3 · Four non-% conversions.** Rested XP: potency → **flat XP quantum** (Tavern 160/level → 1,600; Library L4 800, L5 1,600 + bank 80→120; the larger road wins — §H5's "two roads, one ceiling" survives in new units). It is added **after** the multiplier block, so no perk scales a welcome-back grant. Renown Count → **+1 market listing slot**, King → **+1 daily task slot** — both fields were declared in `getPerks()` and read by nothing since renown shipped; `market.js listingLimit()` and `generateDailyTasks()` are the readers. `farmYield` stopped being floored: `rollFlatBonus()` pays the whole part always and the fraction as its own probability, so expected yield equals the bonus — this alone revives the Scarecrow, Bunny, Squirrel, Carrot Stew and Roasted Pumpkin, all of which had paid **exactly zero since launch**. `farm_yield` buffs also left `isPercent` (they were being divided by 100 into a fraction of a crop and then floored away).

**4 · Four real bugs found on the way, all fixed inside this commit because three of them are power INCREASES.** (a) **P0 — companion bonuses were counted twice.** A getBonus wrapper adding `getCompanionBonus()[key]` existed in *both* `legacy.js` and `features/companions.js`; each is correct alone, so only a behavioural test can hold it. Measured before the fix: a Forge Imp declaring `.10` moved `getBonus('smithSpeed')` by `0.20`. legacy's copy deleted, along with its stale 12-entry `COMPANIONS` table (the module owns the 22). (b) **P1 — `combatXP` skipped ranged and magic**; `COMBAT_XP_SKILLS` is now the one list, shared with `activeBonusKeys()`. (c) **P1 — five companion keys were misspelled** (`xpB`/`goldBonus`/`prayerXp`): Fox, Lichling, Raccoon, Owl and Grave Wisp have paid nothing since they shipped. (d) **The companion XP cap did not match its own curve** — a flat 50,000 against a curve needing 792,783, so every pet stopped dead at level 14 on a bar the Stable draws as "/ 30", and the budget's "level 30 = ×2.45" line was unspendable. Cap now derived from the curve.

**5 · The renown pace.** Weights only; **thresholds are frozen** and a test pins all twelve — `min` is compared against the `renownHigh` ratchet, so lowering a weight can never demote anybody whereas raising a threshold demotes everybody at once. `totalLevel` 14→**2**, `combatLevel` 15→2, `kill` .5→**.05**, `questDone` 200→25, `collection` 25→3, `skill99` 900→100, `streakBest` 25→5, `bountyDone` 12→2, `goldLog` 45→8. Derived against the pacing model: a fresh account scored **~380 before taking a single action** (24 starting levels × 14), and one day of post-PACE play reached ~3,000 — Knight on day one. Now: Serf day 1-2, Squire week 1, Knight day 17-24, Baron day 44-60. Four modelled saves assert the brackets. **This supersedes the spec's §4.3 line "renown weights unchanged"** — that was written before Tyler's directive this session; flagged in CONFLICTS. The Throne screen gained **"How renown is earned"**, generated from the live `W` table (a test moves a weight and asserts the text moves), plus "+N Renown today" off `profile-launchpad`'s existing midnight snapshot — no second clock invented, and the line is omitted entirely rather than guessed when the snapshot has no renown field.

**6 · Server mirrors.** `supabase/migrations/2026-08-09-bonus-rebase.sql` — additive, idempotent, client-first, `create or replace` only. Re-creates `clan_feast_call` (the four `all_xp` constants; hours and `last_call_ms` untouched) and `clan_rested_grant` (potency → `quantum`, 160 XP/level, `potency` hard-zeroed so an old client reads a truthful zero rather than a stale 0.20). Every watermark, guard, cap and ledger write preserved byte for byte. Castle building perks needed no migration — `hr_castle_buildings` stores costs, never perks.

**Verify:** smoke **418/418** (baseline 406 + 12), 0 runtime errors, `bump-version.sh --check` OK, **did not bump**. New **migration guard** in `tests/run-smoke.mjs` (the `</content>` artifact that leaked into a migration yesterday): every `.sql` must end on a SQL terminator and carry no tool-artifact tag. Browser :8179 with a maxed stack + Last Call + Scholar's Day + Grand Fair + a tier-5 draught: `allXP` raw 0.27 → paid **0.22** with `atLimit` true and the note *"the realm's blessing is at its limit"* rendering; every governed key inside its cap; a real `addXp` grant paying 1,220 for 1,000 authored XP; ranged and attack earning **identical** combatXP (1,290 each); grammar sweep clean across rooms, blessings, feast, companions and buffs; the renown explainer rendering all ten live weights, "1 per 20" for the 0.05 kill weight, and "+N Renown today".

**Filed, not built — and this is a deliberate refusal.** `bonus-rebase.md` §5.3 converts the three Keystone L5 benches to **batch capacity ("one action produces five")**. The spec's own §5.5 phasing puts it in b229, and it is not a retune: batching converts an artisan skill's bottleneck from TIME to MATERIALS, which is a ~5× move on artisan XP/hour and directly reverses §5.2's stated "the artisan block collapses onto its no-perks column". That is a pacing decision with Tyler's name on it, not a magnitude I may pick while applying a magnitude spec. The L5 rungs are **not dead** in the meantime — they pay +10% speed and an 8% proc, honestly stated — but the Keystone price is still thin, and that is the open question. **→ Game Designer:** name the batch size (and whether the Shrine's specced bulk-bury of 10 is the same mechanic), then Systems builds it in b229.

### 2026-08-09 · RALLY PLEDGES v2: AUTO-JOIN, THE SWITCH, THEMED CHESTS, NO PLUMBING COPY · branch `agent-rallyv2`
Files: `src/features/muster.js`, `src/features/smoke-test.js`, new `supabase/migrations/2026-08-09-rally-v2.sql`. Untouched on purpose: `world-events.js` (the blessing layer), `raids.js`, every CSS sheet, and the b220 join/contribute/claim RPCs.

**1 · Auto-join.** Pledged + online at any point inside the window = the pledge upgrades itself into the ORDINARY join (`join(true)`, confirm bypassed — the pledge *was* the confirmation). Nothing downstream changed: contribution, the community bar, the aura and the chest are the same code. Online is `HearthrisePresence.isOnline` — the blessing gate's one oracle, asserted equal in the suite so the two can never tell the player different stories. Rides the 1Hz pill tick, not the 60s settle pass, so 13:00:01 is already mustered. `autoJoinDecision()` is pure and returns on its first line in every state but the one that matters.
**No-double-pay:** auto-join is not a payout, it is a join, so all four existing locks hold — local mirror, day-spent, the new in-flight `autoJoining` latch, and `world_event_joins`' PK. Once it lands `adopt()` latches `joined` on the PLEDGE (which outlives the day-rolled mirror), so `pledgeOutcome()` forfeits and the server's LOCK 2 refuses independently. Verified end to end in a real browser: full chest paid once, second settle paid 0.
**2 · Switch.** The choice now lives on the card that HOLDS it: "Switch to <the other rally's name>", exactly one control, gone the moment the pledged window opens (`switchTarget()` returns only a target `canPledge()` would actually accept, so the button can never offer a refused move).
**3 · Themed chests.** Six tables, one per rally, derived from its blessing domain (Forge Levy → smithing+crafting XP + iron bars & coal; Deep Seam → gathering XP + ore & logs; …). Theming CONVERTS value: the server's band is a gold BUDGET and the table decides what it is paid IN — 30% materials at their own vendor value, 20% XP at 2 XP/gold, the rest gold, every division flooring. `chestValue() <= band` is asserted for all six at 750/1500/3000/7500. Gems and Seals untouched. Half honors = the same table on the 750g band. **XP goes through `addXp`** — measured: a 1,500-XP grant landed as 585 after PACE, which is the point.
**4 · Copy ban.** "Provisional / recorded on this device" and the whole class is gone, and there is no local-only pledge any more — if the server cannot hold it, the affordance HIDES (at most "Rally pledges are unavailable right now."). A banned-copy sweep runs the card in all four supported×pledged states plus every refusal sentence and the half-honors toast.
**Migration** `2026-08-09-rally-v2.sql` is additive, idempotent, and does NOT assume rally-preselect ran — it re-states every object it shares with that file and reaches `world_event_joins` through `to_regclass` + dynamic SQL, so it self-checks cleanly standalone. It ports the client's FNV-1a draw to the server (`hr_fnv1a`/`hr_rally_event_id`) so the chest can be derived server-side, and adds `world_event_pledge_settle` (closes a pledge the instant it was answered live; can only record a join that already exists).
**Verify:** smoke **410/410**, 0 runtime errors (current main baseline 406/407 — the one failure there, "running out of materials stops the activity honestly", is pre-existing and not in my footprint; it passes in this tree). `bump-version.sh --check` OK, no bump. Browser :8181 with the harness seam, the module's `_setSkew` clock seam and a stubbed transport so the SERVER paths ran, not the degraded ones: pledge → online at open → auto-joined (`world_event_pledge`, `world_event_join`, `world_event_pledge_settle`) → 3,770g + 10 gems + 15 Iron Bar + 22 Coal + 585/585 smithing/crafting XP + 1 Seal; pledge → offline window → 430g + 1 gem + 1 Iron Bar + 2 Coal + 58/58 XP, and 0 on the replay; switch clicked in the real UI moved the pledge and re-pointed the button, and vanished once the window opened; live-DOM copy sweep clean.
**Known limitations:** the live chest's SPLIT is derived client-side from the mirrored table (the server still owns the BAND, and the ceiling is mirrored exactly as `reduceClaim` already does) — `hr_rally_chest()` is the definition of record and the migration self-check pins the constants, but the two copies are kept in step by assertion, not by a round trip. `XP_PER_GOLD = 2` and the 30/20 split are anchored on the smelting economy and want **Designer ratification** alongside the bonus-magnitude rebase. Legacy saves holding a pre-b231 provisional pledge still settle locally so nobody loses honors; no new one can be created.
### 2026-08-09 · CLAN GOVERNANCE: WORK-ORDER VISIBILITY, VICE LEADERS, THE OPT-IN VOTE · branch `agent-clangov`

Tyler's three clan directives + the tier-gate sentence he could not parse. Worktree `.claude/worktrees/manual-clangov`. Files: `supabase/migrations/2026-08-09-clan-governance.sql` (new), `src/features/clan-seat.js`, `src/features/clan-seat-ui.js`, `src/styles/clan-seat.css`, `src/features/smoke-test.js`, `.claude/launch.json` (:8178). **Untouched on purpose:** world-events, combat, the House region, settings, the Stable, and the door strip / hold scenes that had just been reworked — the WO block sits BELOW them and changes nothing about the picture.

**1 · The Work Order is the panel's lead story.** It was a 40px bar in a three-column strip reading "supply 62%". A percentage is not an instruction: a member who reads "62%" cannot go and fix it, a member who reads "Iron Fittings 80 / 200" can. `workOrderLeadHtml()` now draws, above Standing, an eyebrow + "The Tavern → Level 5" + phase pill, then **every** required material as its own named have/need row with a bar and "260 still needed · 410 waiting in the Storehouse", then the labour meter with the member's own 400/day, then one **Contribute** button straight into that wing's room. The old strip tile is deleted **only when an order is open** — the same news told twice, worse the second time. New CSS section 4b enforces the **cost-text law**: `.hr-cs-wo-mat-nm/-qty/-foot/-hint` are all 14.5px and a smoke test measures the computed size against the real stylesheet rather than trusting the source.

**2 · Only the Leader and Vice Leaders post.** Mapped onto the existing `role` + nullable `charge` model exactly as the spec intended: `'vice'` joins the charge CHECK and **`'steward'` stays accepted, never granted again** — a rename must never silently demote a member a leader promoted last week. The rule now exists ONCE (`hr_clan_may_post` in SQL, `HearthriseClanSeat.mayPostOrder` on the client), and the three functions that each carried their own copy of the steward test (`clan_work_post`, `clan_feast_call`, `clan_withdraw`) were re-created against it — a Vice Leader who could commission work but not call the Feast would be an office nobody could explain. Grant/revoke is `clan_vice_set`, **leader-only**, and it will not clear a Marshal charge by accident. The UI is in the roster inside the Great Hall (the only list that already holds every member's name); the button is not drawn for non-leaders, on the leader's own row, or on a project where the RPC is known missing.

**3 · The opt-in vote.** `clan_order_votes` + `clan_order_ballots`, RLS on with **zero client policies** (RPC-only, or the box could be stuffed directly), **one vote per member enforced by the primary key** `(vote_id, user_id)` with an upsert so changing your mind is free, and a **partial unique index** giving one open ballot per hold. `clan_vote_open` (2–4 candidates, each validated as something the hold could actually commission — a candidate that could never be built is theatre), `clan_vote_cast`, `clan_vote_close`, `clan_vote_read`. **It settles LAZILY**: `clan_vote_read` closes anything past its deadline before answering, the same discipline `clan_upkeep_settle` uses for the Sunday boundary — no cron invented for one feature. **A tie is reported, never broken**: breaking it by row order is a coin flip the player cannot see, so the card says who tied and leadership picks. Posting is factored into `hr_clan_order_create` so the leader's Commission button and a vote closing on a winner derive the 1.58^(n-1) bundle from one place.

**4 · Copy, before → after.** `"3 different members must supply the bundle, each after 72 hours in the hold. Buildings are capped at level 4 until the hold rises."` → **"Needs contributions from 5 different members (1 so far). New members count 3 days after joining — this keeps holds honest. Buildings can reach level 6 now — raise the hold to unlock higher."** The parenthesis is the whole value of the sentence, and the client could not know it — so `clan_seat_read` was re-created with **`tier_contributors`**, the exact query `clan_tier_up` gates on. Missing field ⇒ the clause is **dropped, never zeroed**. Also: the Great Hall's tier rung got the same treatment (spoils now read "150 combat spoils from tier 4 monsters"); every "Steward" refusal became "Only the leader and vice leaders post work orders"; "Only the leader **may**" → "**can**"; the roster's "does not count toward a tier gate for 72h" → "counts toward tier gates in 2d 15h"; and the Tavern Board's **"needs the clan-seat-2 migration"** — a migration filename in player copy — became "the Board is not running on this hold's server". A new test walks every text node in the panel and all six rooms and fails on `.sql|migration|jsonb|rpc|supabase|user_id|clan_members|castle_tier|null|§n`.

**The latent bug I found on the way.** Every action in `clan-seat-ui.js` reduced refusals as `reduceX(d.action === 'accept' ? 200 : 400, {ok:false,error})`. A Supabase RPC refusal is **HTTP 200 with `ok:false`** — status only carries transport failure — so `400` sent every server refusal down the envelope's network branch and the player was told "Could not reach the server" when the server had answered them clearly. Fixed at all five sites. Also fixed: `myRole()` read only the sign-in-time cache on the clan row, so a member promoted mid-session saw the wrong buttons until reload; it now prefers `clan_seat_read.my_role` (which `readSeat` already writes back onto the row).

**Verify:** smoke **361/361** (+6), 0 runtime errors. `bump-version.sh --check` OK; **did not bump**. Browser :8178 — the WO block with all three materials named and Contribute opening the Tavern's supply section; the running vote (tally, "Your vote.", "Close the vote now" for a vice, "7 of 11 members have voted"); the tie card; the opener toggling 1→2 picks and arming/disarming the button; the roster showing Leader / Vice leader / Marshal / Member with grant + revoke and no button on the leader's own row.

**Handoff / known limitation:** the vote card is hidden entirely until `2026-08-09-clan-governance.sql` is run on the project — deliberate, but it means QA cannot see it on the live beta until the migration ships. `clan_withdraw` has no UI caller yet; its gate was updated for coherence, not because anything presses it.

### 2026-08-09 · THE BLESSING GATE BECOMES SESSION-ONLINE · branch `agent-online`

Tyler, on the shipped b227 copy ("…an activity running, this tab open"): *"Reword this, that's confusing. The tab shouldn't need to be open, they just need to be online."* Worktree `.claude/worktrees/manual-online`. Files: `src/legacy.js`, `src/features/world-events.js`, `src/features/home-dashboard.js`, `src/network-status.js`, `src/features/smoke-test.js`, `.claude/launch.json` (:8177). **Untouched on purpose:** the muster LIVE-aura and rally live-join rules (`muster.js` — join-gated content keeps its own contract), the offline BUDGET (`claimOfflineMs`), the b227 replay latch itself.

**The new gate, exactly.** `blessingsApply() = !inOfflineReplay() && sessionOnline()`. `sessionOnline()` asks ONE oracle — `HearthriseNetStatus.getMode() !== 'offline'` — and **fails open** (no honest disconnection signal ⇒ online, because the code is running in their session). The whole attention layer is DELETED, not deprecated: `isPresent()`, `PRESENCE_IDLE_MS`, `_lastInputAt`, the three input listeners, `_setLastInput`/`_lastInput` are gone, and a test asserts they cannot come back as aliases. Two consequences worth naming: a backgrounded tab is blessed (that was the ask), and a farm harvest clicked with **no activity running** is now blessed too — the old gate's `activeSkill||activeMonster||activeArtisanRecipe` clause silently denied `farmYield` to exactly the click that reads it.

**`degraded` is deliberately NOT a disconnection.** Three Supabase 5xx means our cloud is struggling, not that the player left; revoking a blessing there charges the player for our outage. Test asserts it.

**The ordering trap I nearly shipped.** The obvious retiming hook — `window.addEventListener('offline', retimeActivity)` in legacy.js — is WRONG: `network-status.js` loads at index.html:869, legacy.js at :763, so legacy's listener fires FIRST and reads the stale `mode`. Fixed properly by having the oracle announce its own settled state (`hearthrise:netmode` CustomEvent, dispatched inside `setMode` after the assignment); legacy subscribes to that. Ordering is now impossible to get wrong and the oracle stays singular. Verified in-browser: a flip alone retimes a running loop 3600 → 4800 → 3600ms with no action taken.

**Copy, before → after.** Blessing card: "Blessings apply only while you are playing: an activity running, this tab open. Offline progress earns the base rate." → **"Alive while you're in the game. Away? You earn the steady base rate."** (dim branch: "Active — blessings pay while you play." / now "Reconnecting — blessings resume the moment you're back online."). Home "The realm": "Blessings apply while you play. Offline progress earns the base rate." → same sentence as the card. Activity note: "· while you play" / "— idle" → "· alive while you're in the game" / "— reconnecting". Offline toast + `#dash-active`: "at the base rate" → "at the steady base rate". Login toast: "…while you play" → "…alive while you're in the game". **"— idle" as a state no longer exists anywhere.**

**Tests: 355 → 358.** Rewrote the b227 gate tests to drive the REAL connectivity oracle (`NS.setMode`) instead of the retired idle clock, and added three: a **genuinely backgrounded tab** (drives `document.visibilityState`/`hidden` via defineProperty and proves XP grant, interval, gate and note are all identical), a forced disconnect (dims to "reconnecting", pays 0, restores), and a **four-surface copy test** that asserts the shipped strings and forbids the words "tab" and "idle". **The two latch tests kept every assertion verbatim** — only the removed `_setLastInput` seam calls were dropped, and `isPresent()` → `isOnline()` inside the "latch shuts it in a live session" test is a rename of the signal, not a weakening. They are still the crown jewels: the latch, not the gate, is what holds the offline boundary.

**Verify:** smoke **358/358**, 0 runtime errors. `bump-version.sh --check` OK; **did not bump**. Browser :8177 — blessing verified paying with the tab REALLY backgrounded (a second tab fronted, `visibilityState:"hidden"`, XP 4485 = 4485, interval 3600 = 3600, `liveBonusFor('allXP') = 0.15`); offline replay byte-identical under a QUIET vs an all-keys LOUD blessing (11250 XP / 2250 items both ways, `summary.blessed === false`); all four copy surfaces read on screen. **Observation, not touched:** the topbar `#status-pill` renders its own "🟠 Reconnecting…" from the auth/sync layer, independent of `HearthriseNetStatus` — a second connectivity *presentation* (it was honest here: the local verification session really was 401). Worth unifying with the b229 nav-foot rework at some point; out of scope for a blessing-gate change.

### 2026-08-08 · THE CHRONICLE — the dead bell becomes the player's permanent record · branch `agent-chronicle`
Tyler: *"I don't think the notification button actually does anything. Where do the achievements end up after they go away? How can I look at them permanently?"* — audit finding #3. Worktree `.claude/worktrees/manual-chronicle`. Files: **new** `src/features/chronicle.js`; `src/features/toasts.js` (one hook), `src/save-migrations.js` (v8→v9), `src/net/events.js` (cloud allowlist), `src/features/smoke-test.js` (snapshotG allowlist + 17 tests), `index.html` (script tag). **Untouched on purpose:** `renown.js` / `homestead.js` / `clan-seat*.js` / `raids.js` / `identity.js` / `legacy.js` — every milestone source is reached by a WRAPPER installed from chronicle.js onto an already-exported seam, because those regions are held by parallel agents this wave.

**The finding, confirmed.** `#btn-notif` had no `onclick` property, no `onclick` attribute and no `addEventListener` anywhere in `src/`; `#nb-dot` was hardcoded `0` with class `hide` and no writer. A permanently dead control on every screen.

**Two tiers, because they are two different questions.** *"What did I miss while I looked away"* is a session question; *"what have I accomplished"* is a permanent one, and one list cannot serve both.
- **Recent** — an in-memory ring (100) fed from the single `push()` choke-point in `toasts.js`, hooked deliberately ABOVE the queue's visibility decision so a toast the queue *drops* (burst overflow / stale) is still recorded — that is exactly the one the player missed. **Not persisted, argued:** a toast worth outliving the session is a milestone and belongs in the other tier; an idle game emits thousands of `+3 Oak Log` a day, which would be pure noise in the save AND the cloud snapshot; and after a cloud restore on another device a replayed toast log describes events that never happened on that screen. The section is labelled "This session" so the contract is visible, not implied.
- **Milestones** — `G.chronicle.entries`, persisted, capped 500 with compaction that drops the oldest droppable and may never drop a rank-up or a 99 (at most ~24 protected entries exist, so the rule cannot deadlock the cap). Eight kinds shipped: renown rank-up, level marks 25/50/75/92/99, boss first kill, companion/pet unlock, homestead tier, clan-seat castle tier, Hunt clear, name claim.

**Two ways in, one identity.** A HOOK at the source gives a real timestamp; RECONCILE derives from save state and covers everything a hook could not have seen (progress that predates the build, progress made offline, server-authoritative state that mirrors down later). Every entry carries a stable `id` and `record()` is idempotent on it, so hook and sweep can both fire for one moment and exactly one row appears. That is what makes `Chronicle.record(kind, text, {id})` a one-line seam for future systems.

**The rule I would not break: no invented timestamps.** The FIRST reconcile on a save is the seed and cannot know when any of it happened, so those entries are `dated: 0` and render under **"Before the Chronicle"** with the word `undated`, plus a line saying the date is genuinely unknown. Every reconcile AFTER the seed *observed* the transition (it saw the lower value last sweep) so it may honestly date it. The one derived kind that carries a real date into the seed is boss first-kills — legacy's bestiary decorator has always stamped `firstKill`, so that date was written down at the time, not reconstructed.

**Badge semantics.** Unseen = milestones with `ts > seenAt`. Milestones ONLY — a badge fed by toasts sits at 9+ forever and teaches the player to ignore it. Undated seed entries never count, and the seed stamps `seenAt = now` so an existing save opens at 0, not at its whole history. Cleared on open. Repainted the badge gilt (`--gold`): `--red` is destructive-and-lethal only, and "you have something new" is the interactive/attention role — the legacy rule baked three raw hex values, overridden from my own scoped block rather than editing `legacy.css` (held this wave).

**Migration v8→v9 reserves the shape and writes NO entries, deliberately.** A migration runs on a parsed save before any module boots; seeding would need `HearthriseRenown`, `HearthriseHomestead.TIERS`, `MONSTERS`, `COMPANIONS`, `SKILLS_DEF` — live tables that keep moving. A migration must describe the world as it was. `chronicle.js` seeds on first boot instead, with the current tables in front of it.

**Two allowlists, both on purpose.** `snapshotG` (smoke-test) — the suite drives `record()`/`reconcile()` and opens the panel, which stamps `seenAt`; without it a run would write test milestones into the player's permanent history and clear the badge on real unread ones. `snapshot()` (net/events.js, the CLOUD payload) — leaving it out means a restore on a new device silently hands the player a character with no history, which is the one thing this feature exists to prevent. Same reasoning as `restedXp`.

**One trap worth recording (cost me a red test).** `src/features/companions.js` is an ES **module**, so it re-wraps `window.killMonster` AFTER every classic script — my wrapper is still in the chain and still fires, but the `__hrChron` marker is no longer on the outermost function. Never assert "is X hooked" by reading a marker off a live global in this codebase; chronicle.js keeps its own `_hooks()` registry and the test asserts that.

**Verify.** `node tests/run-smoke.mjs` → **363/363, 0 runtime errors**, stable across 3 consecutive runs (baseline on this branch was 346 → +17). `bump-version.sh --check` OK; did NOT bump. Browser on **:8176** via the `__HR_TEST_HARNESS__` seam: drove five milestone kinds through their REAL sources — `addXp` crossing 25, `killMonster` on the Lich, `unlockCompanion('beaver')`, `HearthriseRenown.celebrate`, and a homestead tier picked up by the sweep — then opened the panel **by clicking the bell**. Badge read 8 gilt, cleared to hidden on open; 10 rows rendered with real ages ("1 day ago", "5 days ago", "5 weeks ago"), the two undated ones under "Before the Chronicle"; the Recent tier showed `+3 Duskwood Log ×3` coalesced; Escape closed it; console clean (0 errors). Screenshots: badge, panel top, panel bottom, empty state.

**Known limitations, plainly.** (1) A Hunt clear names the tier from the clan's own ceiling, not the raid row's tier — the claim consumes the server row and does not hand the tier back; solo correctly reads "the Lone Hunt". (2) Castle tier-up records on the sweep ~1.5s after `tierUp()`, because the seat row is re-read asynchronously. (3) If a cloud restore ever brought back an older `chronicle` whose `seeded` is set but whose entries are missing, the next sweep re-dates those as "just now" — self-healing and harmless, but not perfectly honest; a stricter fix would need a per-entry provenance field I judged not worth the save weight. (4) The Recent ring dies with the tab, by design.

### 2026-08-09 · THE HOUSE IS A PLACE — room grid, room modals, and the double-build · branch `agent-homestead`

Two Tyler reports and three coordinator directives, one wave.

**"It let me just keep building the forge" — the root cause was a MISSING REPAINT, not a missing guard.** `refreshAll()` renders profile/inventory/skills/combat/shop and has never rendered the House (there are two `refreshAll` definitions in legacy.js and neither calls `renderHouse`; nothing else repainted after a mutation either). So the row kept the level, price and "Build" label it was painted with. Click two bought rung 2 at rung 2's price with still no acknowledgement; click four hit `if(!nx)return` — a SILENT no-op. Three real purchases at escalating cost, zero feedback, then a dead button, which reads exactly like a screen letting you buy the same forge over and over. **The save is NOT corrupted and no gold was lost:** the only two writers of `G.rooms` are `upgradeRoom` (advances by one, only when `levels[lv]` exists) and homestead.js's grandfather pass (writes the literal 1), so no live path can exceed the ladder. He owns what he paid for; he could not see it. Fixed: repaint at the mutation (`renderHouseSurfaces()`, deliberately NOT inside refreshAll — that fires on every kill and would fight the player's clicks), max refuses out loud in the STATE path, the tier gate now runs on EVERY rung (it ran only at lv 0 — harmless with three rungs, a hole the moment L4 needs a Manor), unknown ids refuse instead of throwing. `buildPlot` had the identical stale-row bug; fixed with it. Save migration v8→v9 clamps room levels to the live ladder as *insurance, not repair* — it only clamps down or up-to-zero, leaves unknown room ids alone, and skips entirely if `window.ROOMS` is absent.

**Phase 1 built: the House is the homestead's Clan Seat.** Rooms tab → grid of structures (owned = lit + gilt "Lv 3/5" badge + rung name; available = dashed outline; tier-locked = dim + lock + which property opens it) → per-room themed modal consuming `window.HearthriseRoomModal` **as published**, descriptor in / modal out, no clan vocabulary, `theme` the only pillar hook. `roomDescriptor(id)` is pure and DOM-free so the suite asserts the ladder rather than HTML. Eight interiors drawn with the castle's own global svg classes so the two pillars stay identical as tokens move. All ladders five rungs; L4 gated tier≥3, L5 tier≥4/5. Cellar repurposed per the §4 ruling via `registerBuffScaler('homestead.cellar')` — zero new machinery, zero migration, and `storage` (read by nothing, ever) is retired.

**THE FUSES ARE NOT WHERE THE SPEC PUT THEM, and my own test is why.** §8 specs the speed and rested clamps as one-liners inside `getBonus`. Built there, measured 0.8999 on prayerSpeed through a clamp that said 0.85 — **`getBonus` is a CHAIN of seven additive wrappers**, so a clamp in the base is escaped by every wrapper above it. A fuse that can be escaped is a false assurance in the code. Both moved to the point of CONSUMPTION: `speedClamp()` at all 10 sites that spend `ms × (1 − speed)` (including the `activities-grid.js` renderer TWIN — patch both or patch neither), and the rested cap inside `spendRestedCharge`, the one reader. The suite asserts this behaviourally (drive a 400% cook speed, read the committed `G.skillMs`) rather than by scanning source, because `startArtisan` is defined three times and a source scan tests the wrapper's shape.

**THREE P1s FOUND, two of them by the test I was told to write.**
1. **Room-cost deadlock (Tyler/coordinator).** Workshop L1 cost `normal_plank:15`; the only plank source is `saw_normal`; crafting is bench-gated on the Workshop. Fresh accounts could never build it. b213 fixed this class for TIER costs and never walked ROOM costs; spec §7 proves its new L4/L5 goods and *assumes* the live rungs. Now `{gold:700, normal_log:40}` (cost-side only — existing owners keep it) plus an **executable §7 proof** that walks every rung of every room against a reachability fixpoint. **My first draft of that proof PASSED the bug**: the Workshop is a tier-2 room, so at T=2 a naive walk counts the crafting bench as available and the plank cost looks fine *via the Workshop*. That circularity IS the deadlock. Rung 1 now excludes the bench the room itself provides, and the exclusion is itself asserted.
2. **The ESM merge silently eats legacy drop injections — live, ~80 builds old.** The proof reported Field Rations unreachable and was right. legacy.js pushed 11 drops onto `MONSTERS` at parse time; `main.js` then runs `unifyObject` = `Object.assign(legacyObj, esmObj)`, a PER-KEY overwrite replacing each whole monster object and discarding every push. Lost: 3 raw meats (so `cooked_wolf_meat`, therefore `field_ration` — a castle good the Clan Seat Storehouse also wants) and **6 recipe scrolls**, so six `gated:` recipes could never unlock. Moved to `src/data/monsters.js` where every other drop lives; b145's Phase-B suppression preserved and re-asserted. **FOR THE TEAM: this trap is general — any legacy-side mutation of MONSTERS/ITEMS/CROPS/SKILLS_DEF running before main.js is equally dead. I only fixed the entries in front of me; a sweep is warranted.**
3. **Costs were unreadable (Tyler's screenshot).** `_costPart` appended the item's display NAME *only in its no-artwork branch* — so every material with an icon rendered as a 15px picture and a bare number, the name suppressed by the thing meant to illustrate it. Name is never optional now, plus hover text naming the item and what you hold, plus met/short as colour (`--green`/`--red` — I had reached for a `--good` token that does not exist). Card faces carry the next rung's price as named text; modal ladders use the have/need checklist.

**The magnitude rebase (Tyler, binding, mid-build)** — "50% smithing? it should be like increments of 2%". All eight ladders retuned to the ratified scheme; **costs and levels untouched**, which is the half of §1's corollary that still stands and is frozen literally in a test. Duration exempt (not throughput power) so the Cellar keeps 20→100%. Library L4/L5 pay in allXP alone — the Rested potency payload is stated on the rung as *reserved for the rested rework* rather than shipped as a promise a player cannot feel. The three proc keys were unnamed by the directive; brought into the grammar at 4/8% for internal coherence and flagged for Designer ratification.

**Verify.** Smoke **352/352**, 0 runtime errors (336 baseline + 16). Every new guard confirmed to FAIL without its fix in two break-and-run batches (repaint removed → the double-build test goes red on the RENDERED dom; plank cost restored → the generic proof names the circularity; drops reverted → the merge guard fires). `bump-version.sh --check` green; **did not bump**. Browser on own server **:8173** through the harness seam, console clean: the three grid states mutually exclusive across all 8 rooms, Forge/Cellar/Shrine/Kitchen-max modals, the double-build walk (clicks 1-3 accepted at 800/3,000/12,000 with the screen moving each time, clicks 4-5 refused at 0 gold), mobile landscape with no horizontal overflow. **Two things I changed only after LOOKING:** the locked cards printed their lock reason twice (line + footer — reads as a rendering bug, not emphasis), and the first scene pass was unreadable because in the dark theme the wall (#1a150f) and the furniture (#090705) are eleven luminance points apart, so every room was an orange blob on black; the wall is now lifted toward its own firelight and furniture takes a warm rim.

**Known limitations.** (a) L4/L5 flourishes the spec describes but I did not build — the Garden's watering-window and seed return, the Shrine's bulk-bury, the Trophy Room's Collection Log display, the Rested cap raise. Those rungs pay in their headline key only; nothing advertises what is not there. (b) `field_ration` and `goldenroot_roast`/`moonbloom_elixir` in the Cellar/Kitchen L4-L5 costs are reachable but *deep* — they need cooking 22/65/92 and, for the last two, plot level 4-5. Legal by the proof, but the Designer should sanity-check the grind. (c) The room grid uses painted EXTERIOR building art where it exists and the drawn interiors elsewhere; the modal always uses interiors. Coherent (grid = structures, modal = the room you walk into) but the two art languages are visibly different, and Workshop/Shrine have no painted asset at all. (d) The card footer truncates a long gate sentence with an ellipsis; the modal states it in full. (e) Spec §0.4 claims the three b215 crops are unplantable and blocks the Garden ladder — **that is stale**, b223 fixed it, so the Garden shipped with its spec'd costs.### 2026-08-09 · RALLY PRE-SELECTION + THE 50% ABSENCE BAND · branch `agent-rally`
Tyler: *"allow users to choose which rally they plan to join that day; if they are offline, they will get 50% participation reward during the event."* Worktree `.claude/worktrees/manual-rally`. Files: `src/features/muster.js`, `supabase/migrations/2026-08-09-rally-preselect.sql` (new), `src/features/smoke-test.js`, `.claude/launch.json` (:8174 entry). **Untouched on purpose:** `world-events.js` (the b227 presence-gated blessing rework is a different layer and must stay that way — the blessing is the no-login-required fairness valve, the rally is the join-gated one), the b220 muster RPCs (read, never altered), `legacy.js`, CSS sheets.

**The shape.** A pledge is NOT a join. `G.rallyPledge` is a separate save slice from `G.muster` **on purpose**: the muster mirror is pruned at the UTC day roll, and the whole promise of half honors is "we'll settle it whenever you come back" — a player returning on Thursday still collects Tuesday's. At most one pledge is ever outstanding (`pledge()` settles the old one first), so the consolation can never accrue into a savings account.

**The no-double-pay proof — two independent locks, either sufficient.**
1. **The day must be over.** `dayCloseMs(dayKey)` = the end of the day's LAST window (13:45 UTC), not the first. Before that a live join is still possible, so nothing is owed. Client `pledgeOutcome` returns `hold`; server `world_event_absence_claim` returns `day_open`. This is the lock that catches the nastiest case: pledged slot 1, skipped it, then turned up for slot 13 — verified in-browser, pays the 1,500g chest and 0 consolation.
2. **The b220 join PK.** `world_event_joins (day_key, user_id)` already guarantees at most one join per user per day, so "answered live" is one unambiguous fact. A row → the pledge closes as `answered_live` paying zero. Client-side the same fact is latched in `adopt()` onto the *pledge* (not the mirror), because settlement can be days after the mirror is gone.
Plus: the payout is a conditional `update … where settled = false` with a checked `row_count`, on a table keyed `(day_key, user_id)`. A replay gets `already_settled`.

**Ownership rule (the cross-device trap I nearly shipped).** A pledge the SERVER registered is settled ONLY by the server; a provisional (local) pledge only locally. Without this, a signed-out client would pay half honors from a pledge the server still holds open, and the account would collect again on the next device. `settlePledge()` returns `hold` rather than guessing. Guarded by a test.

**Economy.** `ABSENT_BAND` = 750g + 1 gem + **0 seals**, derived as `SOLO_BAND × 0.5` and stated once more as constants inside the claim RPC. Against live play: base chest 1,500g/2 gems, ceiling 7,500g/10 gems/1 Rally Seal when the realm holds. Absence is **50% of the floor, 10% of the ceiling**, never a Seal (the Seal means the realm HELD — that needs people who were there), never a share of the community bar, and it costs the player their whole day's rally. Presence wins 2× at worst, 10× at best.

**Degradation.** All three RPCs feature-detected on the existing ten-minute negative-probe seam. Un-migrated or signed-out → a **provisional** pledge under identical rules, labelled in the card, the note and the toast — the same honesty pattern as the solo rally. Client ships first.

**Verified:** smoke **349/349**, 0 runtime errors, 0 console errors; `bump-version.sh --check` OK (no bump). Browser :8174 (worktree served directly; the preview tool's `launch.json` lookup reads the main repo, so `preview_start {url}` + a seeded dev session was the way in). Drove both seams through `_setSkew`: 00:30 pledge → changed slot → changed back → 01:10 lock (`locked`, no buttons render) → next-day 09:00 settle = **+750g +1 gem, once**, second settle pays nothing; and 00:30 pledge → 01:10 live join → chest +1,500g/2 gems → two days later settle = `forfeit`, total unchanged. A fabricated JWT correctly produced 401/PGRST301 → `fail` with no pledge written (a payout is never invented out of an error).

**Known limitations / handoffs.**
- The **server** path is proven only by the unit-tested reducers plus the migration's own `do $$` self-check (schedule, both locks, day-key parse/normalise). The RPCs themselves are unexercised until `2026-08-09-rally-preselect.sql` is run. **Whoever applies it: run it AFTER `2026-08-08-muster.sql`** — the self-check raises if `world_event_joins` is missing, because that PK is lock 2.
- Pledging is **today-only** (the server derives the day from `now()`, which is also what bounds the feature — you can only pledge on a day you were actually online). After 13:45 UTC the card honestly says tomorrow's rallies open at the day roll. If Tyler wants next-day pledging, that is a design call, not a patch.
- A provisional pledge does **not** upgrade to server-registered if the player signs in mid-day; it stays provisional and settles locally. Correct and labelled, but a future nicety.
- **Designer:** the pill now reads `Answering in mm:ss` when the next window is the pledged one. Its `.mp-lab` still says "RALLY" alongside `Rally in …` in the unpledged case — pre-existing b225 redundancy, deliberately not touched (guarded by the b220 pill test); worth a copy pass.

### 2026-08-09 · THE COMBAT STAGE — actions on the stage, reference in modals · branch `agent-combat` (worktree `manual-combat`)

**Tyler, twice, about one screen:** *"The eat food button is hard to read, and it needs to be closer to the character screen. Right now I have to scroll down to see it — that's crazy."* and *"The possible loot / DPS statistics should be modals that you click on near the enemy avatar, not a scrollable thing across the bottom."*

**Root cause — one structural fault, not two complaints.** The combat screen is a fixed stage (`.arena-vs`: portraits + HP bars) sitting above `#combat-area`, which is the card body and therefore **the only scrolling box on the screen**. Every other control rendered into it: `.combat-xp-forecast` (injected at the top by `injectCombatExtras`), the six-tile `.calc` grid, the combat log, `.cbt-food`, and the `.combat-drops-list`. Measured with a real fight running: **735px of content in a 441px box at 1440×900, and 796px in a 91px box at 900×760.** The Eat button rendered LAST, so the control that stops you dying sat ~470px below the fold *during combat*. "Hard to read" and "scroll down to see it" are the same bug seen from two angles.

**The rule I implemented, which is what should survive this change:** on the combat screen an **ACTION belongs to a fighter and is drawn beside that fighter, in the region that cannot scroll**; **REFERENCE belongs in a modal** and costs a click instead of permanent screen height. Eating is yours → Eat under YOUR HP bar. Sizing up the foe is about them → Loot / Stats under THEIRS.

**Files.** `src/features/combat-render.js` (new `HearthriseCombatHud` — paints both action slots, owns both modals), `src/legacy.js` (combat region only: two mount `<div>`s in `ensureArenaVs`, a `HearthriseCombatHud.refresh()` call on the 200ms arena tick and at the end of `renderCombat`, `.calc`/drops-line/Eat removed from `renderCombat`, `injectCombatExtras` + `rarityClass` deleted, `WEAPON_TYPES`/`COMBAT_BALANCE` published), `src/styles/combat-hud.css` (**new, loads last**), `index.html` (one `<link>`), `src/features/smoke-test.js`.

**Three things worth remembering.**
1. `COMBAT_BALANCE` had **no `tickMs` key** while five readers probed for it and silently fell through to their own `|| 2400`. Added the key and routed both `setInterval(combatTick, 2400)` sites through it — the swing interval now has one answer. Same number; not a balance change.
2. The HUD reads `getPlayerCombatRolls` / `getMonsterCombatRolls` / `getWeaknessInfo` rather than re-deriving. A stats panel that disagrees with the fight it describes is worse than no stats panel, and the smoke test pins the modal's numbers to the engine's rolls so a future divergence fails.
3. The action slots repaint on a **200ms** tick, so both slots **diff before they write** (`mount.dataset.sig`). Replacing the node every tick cancels a press mid-click — a button you cannot reliably press is a worse bug than the one being fixed. The click handler is delegated from `.arena-vs` and the "already wired" flag lives on the **element**, not in the module closure.

**Two pre-existing layout faults fixed in passing, because they were spending exactly the height the Eat button needed** (both ≤1180px, both one rule in the new sheet): (a) `legacy.css` hides `.combat-loadout` below 1180px but `audit-overrides.css` declares its column track with `!important` and no media query — **320px of empty painted column** beside the monster list, 340px beside the arena in combat; (b) in combat, `.csb-meta` is `flex:1; min-width:0` next to four `nowrap` style buttons, so below ~1180px it is crushed to ~100px and the style ribbon stacks one word per line at **270px tall** — a third of a 760px window.

**The art director's 420px landscape clip is fixed.** `#panel-combat.active` is declared `display:grid; overflow:hidden` with `!important` and **no media query** in `audit-overrides.css`, so it outranks the unweighted `#panel-combat.active{display:block}` in legacy.css's phone block — the mobile rule was always there, it simply never won. Measured on pristine main at 880×420: `display:grid, overflow-y:hidden, scrollHeight === clientHeight (284)` with the overflow swallowed inside the grid children. After: `display:block, overflow-y:auto, scrollHeight 598 / clientHeight 284` — **314px of content that is now reachable.** This is the one place in the new sheet that uses `!important`, and it is undoing one.

**Verify.** Smoke **333/333** (331 base + 2 new), 0 runtime errors, `bump-version.sh --check` OK, **no bump**. Browser on own static server **:8167** with real fights: Eat measured in-viewport at **1440×900 (y 408–455)** and **900×760 (y 401–448)**; `#combat-area` no longer scrolls at either (382/382 and 193/193, was 735/441 and 796/91); real click on the Eat button heals 2→10 HP; both modals open from the enemy chips, carry every drop with its rate and the full combat maths, close by scrim and by X, and neither overflows the viewport at 1440×900 / 880×420 / 420×820; the modal closes itself when the fight ends. `findUiOverlaps()` **byte-identical to pristine main** at 1440×900, 1280×800 and 900×760 (the one hit at 900×760 is the pre-existing chat-pill-over-bottom-nav pair, present on main). Console clean. Longest Provision in the game ("Eat Cooked Panther Meat") measured at 200×48 with no overflow.

**Handoff — Art Director.** New scoped sheet `src/styles/combat-hud.css`, loaded after `clan-seat.css`. It reuses `.combat-drop-row` + its five rarity bands from `legacy.css` inside the room modal (those band colours are the game's drop-rate vocabulary; re-declaring them here would be a second copy that drifts) and neutralises only that class's own chrome — fill, radius, padding — keeping the band. **Note there are two rarity systems in the codebase and they mean different things:** `.r-common…r-legendary` = *how often this drops*, `RARITY`/`itemRarity()` = *how good this item is*. The drop table uses the first, deliberately.

**Flagged, not fixed (deliberate — three shared sheets, four agents editing them concurrently this wave):** removing the strip left dead CSS in files I should not be editing mid-wave — `#combat-area .calc` (audit-overrides.css ~777-780), `#combat-area .calc > div` (theme-cozy.css ~2306), `.combat-xp-forecast` + `.cxr-*` (legacy.css ~2486-2495), and the `.combat-drops-list` container (legacy.css ~2497). ~20 lines total, zero runtime cost. Delete after integration, in one pass, when the sheets are not contested.

**Known limitations.** (1) The Loot modal has **no icon column**: 35 of the 59 items that drop in the game have no painted art, and the alternative the old strip used was an emoji, which the Final Directive forbids. Add the column when the asset coverage exists. (2) At ≤640px `HearthriseRoomModal` goes full-bleed, so there is no scrim to click and the X is the only dismissal — inherited from the shared component, not introduced here. (3) `.combat-log` is `flex-direction: column-reverse`, so now that it grows into the freed space a short log sits at the bottom of its box with empty room above. That is the chat idiom and it fills in within a minute of fighting.### 2026-08-08 · TWO SMALL, SHARP FIXES — stale "Offline" badge + avatar-is-the-affordance · branch `agent-smallfix`
Two Tyler directives, worktree `.claude/worktrees/manual-smallfix`. Files: `index.html`, `src/legacy.js`, `src/network-status.js`, `src/styles/legacy.css`, `src/features/identity.js`, `src/features/smoke-test.js`, `.claude/launch.json` (added the :8172 preview entry). **Untouched on purpose:** `src/net/auth.js` / `#status-pill` (a separate, correctly-live indicator — see below), `src/features/character-page.js` (identity.js's existing `decorateCharacterPage()` hook already owns the portrait node; no template change needed there).

**#1 root cause, exact.** `#net-status` (the sidebar-foot indicator) was driven by `legacy.js updateNetStatus()`, which gated on `NetClient.online()` — `navigator.onLine && !!ENDPOINT`, and `ENDPOINT` two lines above is **hardcoded `null`** (a pre-Supabase mock-backend relic, comment literally says "set to ...later"). So the sidebar foot read "Offline" **permanently**, for every player, signed in or not, connected or not — the function ran once at `boot()` and from `NetClient.signIn`/`signOut`, neither of which the real auth flow (`src/net/auth.js`, wired to actual Supabase) ever calls. `#status-pill` (topbar) is a *different* indicator, owned by `auth.js renderAuthUi()`, correctly reflecting the live session — that one was never broken and I left it alone.

**The fix.** Ownership of `#net-status` moved entirely to `src/network-status.js` (already the module tracking real connectivity for the floating banner). `updateNetStatus()` no longer touches the element at all. Presentation, per the ruling "connected is the normal state, not a status": default markup ships `hide`d; `network-status.js`'s `updateNavFoot()` hides it whenever `mode==='ok'` and reveals an amber "Reconnecting…" (new `.dot.warn`, off `--gold-2`) otherwise. Detection got a real upgrade, not just a rewire: `probeHost()` does a no-cors `HEAD` against the **actual Supabase host** (`HearthriseSupabase.getConfig().url`, 5s `AbortController` timeout) — `navigator.onLine` only means an interface is up, not that the backend is reachable, so the `online` event now **confirms** via the probe before declaring recovery (a captive-portal wifi still fires `online`), and a 4s background poll runs while disconnected so the badge clears itself even if the browser never fires `online` at all.

**#2 — "clicking the icon should upload an avatar."** The b221 affordance was a text bar (`Upload/Change portrait`) pinned to the bottom of the Character-page portrait; the topbar avatar had none. Both surfaces now: the portrait *itself* is `role="button" tabindex="0"`, click or Enter/Space opens the same `ensureFileInput().click()` pipeline through one new shared trigger, `openAvatarPicker()` (exposed on `window.HearthriseIdentity`, no fork). Character page: `decorateCharacterPage()` wires the (fresh-per-render) `.cr-hero-portrait` node directly, guarded by `data-hr-clickable` for the one path where it re-runs without a re-render (post-upload). Topbar: new `decorateTopbarAvatar()`, called from `refreshUi()` (fires on every avatar-affecting path — boot, upload, clear, remote hydrate) since `.player-avatar` is a static index.html node whose `<img src>` is the only thing ever swapped; wires once, refreshes the tooltip label every call. The existing bottom-bar button's `stopPropagation()` keeps a click on it from double-opening the picker via bubbling to the new container listener — verified with a call-count spy, not assumed.

**One real bug caught by browser verification, not by the tests.** `src/styles/art-direction.css` sets a baseline `body[data-theme] .player-avatar` box-shadow at CSS specificity (0,2,1) — one selector heavier than a bare `.hr-id-clickable:hover` (0,2,0). The topbar hover ring silently never painted; `getComputedStyle` after a real Playwright hover showed the exact same box-shadow idle vs hovered. Fixed by pairing the class with each host selector (`.player-avatar.hr-id-clickable:hover, .cr-hero-portrait.hr-id-clickable:hover { ... }`, specificity (0,3,0)) — wins outright regardless of load order. Re-verified: both surfaces now produce the identical ring (`rgb(20,17,12) 0 0 0 2px, rgb(227,199,126) 0 0 0 4px`).

**Verify.** `node tests/run-smoke.mjs` → **333/333, 0 runtime errors** (331 baseline + 2 new: one drives the real `offline`/`online`-shaped state machine end to end including the legacy-no-longer-writes regression, one spies on the shared file-input's `.click()` to prove both surfaces — plus the existing bottom-bar button — reach the pipeline exactly once, never twice via bubbling). `bump-version.sh --check` OK, did NOT bump. Browser: own static server **:8172** (added to `.claude/launch.json`), verified through the same `window.__HR_TEST_HARNESS__` seam `run-smoke.mjs` uses (a real account-walled page cannot be reached without credentials, which are out of bounds to enter) — sidebar hidden while connected (screenshot), amber "Reconnecting…" on a dispatched `offline` event (screenshot), both hover rings painting the correct gold ring (screenshot + computed-style check), `role="button"`/`tabindex="0"` present on both nodes, console clean throughout. Also confirmed on the plain (un-bypassed) gate page in the shared Browser pane: console clean pre-wall.

**Known limitations.** `#status-pill` (topbar, next to the player name) currently reads "Offline" in this sandboxed dev environment because it depends on a CDN import (`cdn.skypack.dev/@supabase/supabase-js`) that has no outbound path here — that is a pre-existing, environment-specific condition on a different indicator, not something this change touches or should touch (out of my assigned surfaces). The reconnect poll is a plain `setInterval`, not exponential backoff — fine at 4s/disconnect-only, would want backoff if extended to a background health-check while connected (deliberately not added — scope discipline, and it would mean every player's browser pinging Supabase every N seconds forever).

### 2026-08-09 · b227 — the calendar IS the online bonus · branch `agent-presence`

**Brief:** DECISIONS *"Presence rework: blessings are presence-gated; flat +12% removed"*.

**THE OFFLINE AUDIT VERDICT: yes, blessings leaked into offline — completely.** `world-events.js`
wraps `window.getBonus` additively, and `processOffline()` replays through the same
`doSkillAction` / `doArtisanAction` / `addXp` / `applyGoldFind` the live loop uses. Every catch-up
was paid at the day's and week's blessing. **And the naive gate would have reproduced it exactly:
`isPresent()` is TRUE during a catch-up** — `processOffline()` runs inside `loadLocal()` on a
visible tab with `_lastInputAt` freshly initialised and an activity set. b226's own flat ×1.12
leaked into offline grants for precisely this reason (it multiplied every `addXp` inside the
replay). Hence the **replay latch**: a depth counter held across the whole simulation, released in
a `finally`; `blessingsApply() = !inOfflineReplay() && isPresent()`.

**Second leak, subtler: the SPEED keys were baked.** `G.skillMs` was computed once at
`startSkill()` / `startArtisan()`, and `processOffline` divides elapsed time by it — so a session
begun under a Gathering Surge carried blessed speed into the night, and an AFK player kept it too.
Now one shared `activityIntervalMs()` is read by the live loop, a per-action `retimeActivity()` and
the offline replay (which re-derives inside the latch). Free side-fix: buying a tool or a room
mid-session applies on the next swing instead of the next restart. Also de-duplicated the artisan
timer arming, which existed twice in `legacy.js` and could have drifted.

**Not leaks, checked:** `calcCatchup()` is display-only since b214 (grants nothing); farm harvest
reads `farmYield` at click time, which is always a present action — so a farm blessing pays on the
harvest you take, by design.

**Pool:** 9 daily × 6 weekly, ten wired keys. Added goldFind (Open Coffers / King's Bounty) and
noBurn (Steady Fire) families; Grand Fair 10% → 12% (Tyler's number). Removed the dead `glyph:`
emoji field from the data and exported `EVENT_GLYPH` so Home and Events read ONE map. **`rareDrop`
deliberately excluded — no `getBonus('rareDrop')` consumer exists** (it is an equipment/pet item
stat only); a pool entry for it would be a ghost promise of the exact kind b222/b225 had to fix.

**Tests:** 330 → 337. Rewrote the b204 world-events test (bonus now travels *conditionally*) and
replaced the b226 `presence is ×1.12` test with the new contract — deliberately stricter, an exact
equality (`present grant == absent grant with no blessing`) rather than the old ratio. Added a
harness seam `HearthriseWorldEvents._force({daily, weekly})` so tests and browser checks can pin a
KNOWN blessing instead of asserting against the wall clock.
### 2026-08-09 · QUEST NAVIGATION — "take me to the area the quest is asking for" · branch `agent-quest-nav`

Audit finding #2, targeted slice (NOT the two-to-do-list merge). Tyler: *"if it's asking me to catch fish, take me to the fishing section."*

**What was actually wrong — three separate dead ends, not one.** (1) The Quests modal had **no navigation at all**: it named a task and offered only Claim. (2) Home's `questRoute()` was a private regex table keyed on the task LABEL, whose fallback was `View` → `openQuestsModal()` — the audit's exact complaint, a button that opens a window not containing the quest you clicked; its gold rule also navigated to `market` two builds *before* a market panel existed. (3) The milestone row's `deepLink` did the same modal-open trick.

**The fix: one derived resolver.** New `src/features/quest-nav.js` — `questDestination(goal) → {tab, skillId, detail, verb, label, glyph, via}`, total (never null). **Derived, not hand-tagged** — no pool entry grew a `destination:` field (the b220 taxonomy lesson). Layers, strongest first: `goal.source` (what the goal *measures*) → `goal.type` (`updateDaily()`'s existing action vocabulary) → bounty shape → the goal's own words → skills-grid fallback. The gathering third of the source table is **inverted from `window.SKILL_ACTION_STAT`**, newly published from `doSkillAction()`'s old inline literal — one list, so adding a gathering skill wires its counter *and* its quest navigation in a single edit. The artisan **lane** is matched only against `HearthriseArtisanCat.groups(skillId)` (the LIVE category list), so a renamed lane degrades to "no lane" instead of persisting a dead key. Arrival writes `_artisanCat[skill]` *before* `openSkillDetail` so the right lane paints on the first pass instead of flashing the default.

**Wired:** modal rows (Go button + whole row, `[data-goto]`, registered after the claim handler and never present on a claimable row — one primary action per row; closes the modal, because an overlay over the destination is the same dead end), Home's Next-up cards, and the milestone deepLink. Claim untouched. The strip's chips are **not** wired — `theme-cozy.css:2111` hides `.global-quests-strip` entirely (the topbar Quests button replaced it in b224), so per-chip handlers would be dead code; the whole-strip → modal click stays.

**Two real bugs found while wiring, both fixed (both in the ladder this task is about).**
- **`window.xpForLevel` has never existed.** `profile-launchpad.js` has guarded on `typeof window.xpForLevel === 'function'` since b138, so the entire **SKILL half of Home's "Next up" milestone has never run once** — the closest-to-levelling skill, the thing an idle game's home screen most wants to point at, was silently unreachable and the row could only ever show a quest. Added next to `levelFromXp` (same maths `admin.js` already inlines). Verified in-browser: the row now renders "Fishing Lv 4 → 5 · 97%".
- **`var sid` closure in `getNextMilestone()`.** Function-scoped, so every skill `deepLink` shared one binding and read the loop's final value — Train always opened **Bounty Hunter**. Never noticed because of the bug above. `let` per iteration. Regression test added.

**Verify:** smoke **335/335**, 0 runtime errors (330 baseline + 5). New tests: resolver totality over every live pool (zero fallbacks, and the fallback still reachable for an unknown goal), the type→destination table as shipped, arrival (right panel AND right skill AND right lane chip), the modal Go button end-to-end, and the milestone-Train regression. `bump-version.sh --check` OK; **did not bump**. Browser on :8166 (harness seam), 9 goal types clicked end-to-end: `fish`→Fishing detail · `gather_logs`→Woodcutting · `mine_ore`→Mining · `cook`→Cooking w/ Provisions lane · `kill_any`→panel-combat · `plant`→panel-farming · `gold_500`→panel-market · `level_up`→skills grid · Home `smithed`→Smithing/smelting lane, `harvest`→farm, `gather`→grid. Console clean.

**Design pass:** Go is the quiet ghost button, Claim keeps the lit gilt slab — the claimable reward stays the only lit object on a quest row. Gave `.qm-q-go` + `.qm-q-claim` one shared `min-width` because the action column was ragged (three different x positions in one list). New CSS is token-derived (`color-mix` off `--gold-2`); the hardcoded gilt above it is pre-token debt I did not rewrite.

**Known limitations.** (a) A grid destination (`level_up`, generic `gather`) lands on the skills tab with whatever detail was last open still showing — closing it would need new nav machinery, which was explicitly out of scope. (b) The resolver reads a bounty's shape but nothing *renders* bounties as quest rows yet, so that branch is test-covered, not player-visible. (c) The two to-do lists (`DAILY_TASK_POOL` vs `DAILY_GOAL_POOL`) are still two — this task deliberately only made both of them navigable. (d) Artisan counters (`stats.cooked/smithed/crafted`) are still written inline at two call sites rather than through `SKILL_ACTION_STAT`; unifying them touches the live economy path and did not belong in a navigation change.

**Also touched (one line, same file as my tests):** the b220 artisan test's `finally` restored `window.activeTab`, which is a legacy `let` and therefore **not on window** — `showTab(undefined)` was a no-op. Added `|| 'profile'`. Same class of silently-inert nav restore.### 2026-08-09 · LIVE HOTFIX — "it's asking me to choose a name I already have" · branch `agent-login-flow`**Root cause, exact.** `identity.js mustPrompt()` answered *"does this account have a name?"* from the LOCAL record only. That record is written by `adopt()` and by nothing else — i.e. only by a claim **this browser performed**. Tyler's claim reached the server by a different route entirely: `display_names.canonical = 'khemphill22'`, `claimed_at 2026-05-03T21:38Z`, which is his `profiles.created_at` — **section 4 of the unique-names migration backfilled it**. No client ever ran `adopt()`, so the local record was empty, so a player who has owned that name for three months was shown the first-run "Choose your name" modal. Verified by a READ-ONLY REST probe against production (`display_names`, `profiles`, and the `user_id=eq.<uid>` filter the fix uses — all 200, all confirmed). **The backfill makes this the default for the entire existing player base, not an edge case** — and it recurs on any second device or after clearing site data.

**What b221 got wrong against its own contract.** Its comment promised *"re-claims silently once the RPC exists; the player is re-prompted only if someone took it meanwhile."* That promise is `reconcile()`, and `reconcile()` only ever runs when `rec.name` is already set. With an empty record there is nothing to reconcile, so the silent path was unreachable and the modal was the only outcome. b221 treated **ignorance** and **absence** as the same state.

**The fix.** `identity.js` §5b: one memoised GET of `display_names?user_id=eq.<uid>` per session (anon-readable, `for select using (true)`), reduced by a pure `reduceServerName()` in the same shape as the file's other reducers. `found` → adopt silently as `confirmed` (record + `G.playerName`), no modal. `none` → prompt. `unknown` → **silence**: a missed prompt costs one login and the Character screen still offers "Choose a name", while a wrong prompt takes the game away and invites a rename. `shouldAdoptServerName()` is the policy: a **provisional** local name always wins (the player chose it, `reconcile()` is claiming it — overwriting would silently undo a rename), a differing **confirmed** one loses to the server (another device renamed). `owedPrompt()` is now true while the read is IN FLIGHT too, bounded at 15s, so the welcome sheet waits instead of opening in the gap.

**Two more real defects found by WALKING the sequence in a browser rather than reading it.** (1) `daily-reward.js`'s blocker list never contained `.hr-id-scrim` or `#hr-post-signup-modal` — the once-a-day sheet opened straight on top of both, 1.0s later. Exempt since b169; every other first-run flow already named them. (2) The mirror: `identity.js FRONT_DOOR` never contained `.hr-dl-scrim`, so with the daily sheet up the name modal landed on IT. Both directions are now mutually exclusive and whichever is ready first goes first — verified that dismissing the daily sheet still delivers the deferred name prompt, one modal on screen, never two.

**Seamlessness.** `account-gate.js` replaced its flat `setTimeout(reload, 220)` with `whenSessionPersisted()` — it waits for the **fact** (the cached session on disk, the same predicate the next boot's `decide()` reads) rather than for a duration. Faster in the common case (resolves on the first poll) and correct in the slow one, where 220ms meant the reloaded page met the wall again and the player signed in twice. `auth.js`'s `onAuthStateChange` used to delete that cached session on **any** event arriving without one — an `INITIAL_SESSION` replay, an unresolved refresh, a blip — which evicted a signed-in player back to the wall on their next load. Lifted to a pure exported `decideSessionEvent()`: only `SIGNED_OUT`/`USER_DELETED` clear it.

**Falsified, so not "fixed".** I expected the wall to paint on top of an already-visible game shell (`account-gate.js` sits at index.html:738, ~610 lines below `<body>`). Measured it: FCP at 208ms, the gate ran at 204ms, `.app` was already `visibility:hidden` at first paint. The classic scripts above it block the parser, so there is no flash and no head-level pre-hide was warranted. **Did not add the risk.**

**Drive-by outside my lane, flagged not buried.** `b225: the Kitchen is the producer of noBurn` asserted an ABSOLUTE `getBonus('cookSpeed') === 0.25`. `window.getBonus` is wrapped additively by world-events/companions/clans/clan-seat-ui/muster, and the daily/weekly pool contains Feast Day (+0.30 cookSpeed) and Guild Works (+0.20) — so the team's merge gate went red or green **on the UTC date alone**. It was red when I started and green an hour later without a code change. Now measured as a delta. A gate that flips on the calendar is worse than no gate.

**Verification.** `node tests/run-smoke.mjs` → **315/315, 0 runtime errors** (308 baseline + 7 new b226 guards; the flaky b225 cooking test is one of the 308 and is now deterministic). `bump-version.sh --check` green, no bump. Browser walk with a stubbed supabase-js + routed REST, three scenarios, before-tree vs after-tree — sequences in the handoff.

**Known limitations.** The read is one GET per boot; a player who renames on device B sees it on device A only after A's next boot (no realtime subscription — deliberate, it is not worth a channel). `post-signup-welcome.js` still renders in retired cozy-light literals (`#fff8e2`) — visual domain, not mine, but it is the ugliest screen in the login sequence. The b225 `b226: cooking marks its tile active` test is `async` inside a synchronous runner, so its assertions cannot fail the gate — not mine to fix on a hotfix branch, but it is a hole.

### 2026-08-09 · THE PACING RETUNE — 8-week first 99, daily offline budget, +12% presence · branch `agent-pacing`
The whole `docs/design/pacing-overhaul.md` package at Tyler's re-anchor (56 days, not 28). Derived table + arithmetic published as **Appendix A** in the spec; Designer ratifies at integration.

**Constants:** `PACE = { xp: 0.39, actionMs: 1.60 }`. Day model 12h budget + 2.5h × 1.12 = 14.8 eff h/day; 56 × 14.8 = 828.8h against the spec's ratified 120.5h baseline → F = 6.878; holding actionMs at 1.60 leaves `PACE.xp = 1.60/(6.878 × 0.60) = 0.39`. Realised 56.0 / 56.6 / 54.0 days (WC/MI/FI) at 0% allXP — within 4.9%, which is the §4.1 curve correction doing its job.

**The one architecture call I made against the spec's letter.** §4.1 said publish final XP in `gathering.js`. That freezes the pacing dial into 22 data rows, and this doc has already been re-anchored once before a single player saw it. So: **curve correction in data (a balance statement about the rungs), `PACE.xp` live at one choke-point (a speed statement about the game).** `book × 0.55` reproduces §4.1's published table exactly, so the spec's arithmetic is untouched. The cost is that a card would print a book value — paid for by routing **every** XP/duration/rate readout through `pacedXp()` / `pacedActionMs()` / `actionRate()`.

**That cost was real and I nearly shipped it.** Browser verification caught the activity bar advertising **18,000 xp/hr** while woodcutting ticked at 5,250, and tiles reading "15 XP · 3.0s" for an action paying 5 XP every 4.8s. Four separate renderers each did their own book-value arithmetic: `activities-grid.js` tiles (the live `renderSkillDetail`), legacy.js's shadow copy of the same tiles, `_activityXpHr()`, and `gatherRates()` in both character-page files. **Lesson for the team: `renderSkillDetail` and the tile builders exist TWICE — `features/activities-grid.js` overrides legacy.js's copy at boot. Patch both or you patch neither.** There is now one calculator, `window.actionRate(skillId, action)`, and a test that a quoted rate equals a real grant.

**Rulings §11 asked me for.** (1) Presence sits OUTSIDE the additive `allXP` fuse, multiplicative — confirmed; it is a mode multiplier, not a perk, and inside the block it would blow the ≤0.60 fuse for a bonus nobody earned. (2) `renownHigh` ratchet: shipped, one number, every rank decision reads `effectiveRenown()`. (3) **The daily budget wants a watermark, and it got one.** `G.offlineBudget = {dayKey, usedMs, at}` — `at` is the exact instant already accounted for, advanced on EVERY call (even when nothing was running, because the wall-clock passed either way), same shape as Rested XP's `restedAt` and for the same b214 reason. `saveLocal()` keeps `at` level with `lastSeen` during a live session, or a 3-hour evening of play would be charged as an absence.

**Also shipped:** `G.skillMs` now stores the tool-adjusted interval (§1.6 — a straight buff to geared players offline); farming exempt from `PACE.xp` with crop XP ×14 (99 in 8.2 months, was 9.6 years); `VENDOR_RAW_RATE = 0.20` at one `vendorPrice()` choke-point with `raw` **derived** from every gathering `prod` so a future rung cannot be missed; Mithril `ms` 9000→8000; per-skill gather counters; qty `[1,1]` on low tiers; renown 10→14 / 600→900 + ratchet; Founder's mark on `createdAt`.

**Two pre-existing bugs found and fixed while in the files.** (a) `item-ux.js`'s quick-sell slider paid `v × 0.5` while every other sell button in the game paid full `v` — the same item fetched two prices depending on which control you pressed. All six sell paths now read `vendorPrice()`. Net effect on crafted goods: that one path goes 0.5v → 1.0v. It creates no new exploit (the craft-to-vendor margin already filed in CONFLICTS was always computed at full `v` via `invSellAll`), but **it is a semantic change the Designer should see** — flagging rather than burying it. (b) The daily/weekly/achievement gather goals all read item-specific `collection.*` counters, so a Duskwood chopper scored 0 on "Chop 500 logs". Switching to `stats.chopped/mined/fished` would have **zeroed real achievement progress**, so save-migration v7→v8 **seeds them from the collection log** (a cumulative lifetime count). Nobody loses a step; stuck players gain hundreds.

**Verify:** smoke **322/322**, 0 runtime errors; `bump-version.sh --check` OK, no bump. Every new test confirmed to FAIL without its fix, in four break-and-run batches (qty / mithril / raw flags / renown weights / goal sources; skillMs / presence / founder gate / vendor rate; budget cap / farming exemption / addXp pacing / actionMs; ratchet). **One test was too weak and I found it by breaking the code**: the budget test used literal 9h gaps, which is not a violation for a player whose cap is 18h — it now sizes gaps as a fraction of the live cap. Browser (own server **:8163**, harness seam): chopped 60s → 12 actions, 84 XP = exactly 12 × 7, `G.skillMs` 4800ms, activity bar 5,250 xp/hr against a derived 5,250, tiles "5 XP · 4.8s", presence note renders and **dims to "+12% present — idle"** when the 10-minute window lapses (grant 480 → 429 = ÷1.12), console clean.

**Existing tests retuned, honestly.** Three offline tests moved from `G.lastSeen = now - 2h` to a `setAway(h)` helper that drives `G.offlineBudget.at` — not a loosened bound, a corrected one: the watermark IS the clock now, and a test that only moved `lastSeen` was asserting against a field the engine no longer reads. The b225 burn test asserted `burnXp === CF.burnXp(rec)` (8); a burn is a rate, so it now pays `floor(book × PACE.xp)` = 3. Expectation derived from the same dial rather than pinned to 3, because the relationship being guarded (a burn pays the consolation fraction, never the full cook) is what matters and 3 will rot at the next re-anchor.

**Known limitation, filed not fixed (Appendix A.7):** an XP-side stretch cuts items per *hour* but raises the total item count for a 99 (WC 50,705 → 216,020). §6.3's Phase-2 sink scaling is now load-bearing rather than a nicety.

Did NOT bump build version / CHANGELOG (Coordinator does at integration). §8.2's daily/weekly *targets* and the in-game release note are Phase 2 / Designer.
### 2026-08-08 · THE CAMPFIRE RULING — cooking ungated, the open fire burns · branch `agent-campfire`
Hotfix for the binding product-owner ruling (DECISIONS 2026-08-08; `homestead-deepening.md` §2 amendment). Beta testers were walled out of cooking at the tier-1 camp.

**What was gated, and what I removed.** The gate is ONE call: `startArtisan` (legacy.js block 21) → `HearthriseHomestead.hasWorkbench(skill)`, backed by `WORKBENCH = {cooking:'kitchen', smithing:'forge', crafting:'workshop', prayer:'shrine'}`. I did **not** delete the cooking→kitchen mapping — three other readers need it (the grandfather pass that restores a veteran's Kitchen, the `cookSpeed` lookup, the House copy). Instead `hasWorkbench` short-circuits on a declared `UNGATED = {cooking:true}`, so the exemption is greppable and can't silently spread. Forge / Workshop / Shrine verified still gated in the browser.

**The curve as shipped (v1, Designer owns retuning).** `burnChance(recipe, cookingLevel, noBurn) = clamp(0.25 − noBurn − 0.01×max(0, lv − recipe.req), 0, 0.25)`, pure and DOM-free in the new `src/features/cooking-fire.js`. Kitchen rungs produce `noBurn` 0.13 / 0.19 / 0.25 → **25% open fire, 12% / 6% / 0%**; mastery is −1pt per level over the recipe req, stacking, so 25 levels over req is burn-proof on the open fire too. Burn XP = 25% of the recipe (floor 1). Burn consumes the ingredients and yields one generic `burnt_food` (v:1, no `heals`/`foodClass` → `foodClassOf` null → auto-eat can never spend it).

**`noBurn` finally has a producer.** It was one of the six ghost bonus keys (§0 finding 2) — listed in the House panel, produced by nothing. Room rungs gained an optional secondary bonus map `bx:{}` that `getBonus` reads alongside `bk`/`bv`, because the Kitchen now sells two things off one rung and a single bk/bv pair can only express one. A guard test asserts `ROOMS.kitchen.levels[i].bx.noBurn === KITCHEN_NO_BURN[i]` so the two tables can't drift.

**One number, three surfaces.** `cookBurnChance()` is the only reader of live state; the cook, the offline replay and the "Burn risk: N%" line all call it, so what the player is shown is by construction what is rolled. Offline uses the same `doArtisanAction` with `{silent:true}` — burns are counted into `lastOfflineSummary.burnt` and reported once instead of queueing thousands of toasts.

**Quest honesty:** a burn never ticks `stats.cooked` / `updateDaily` / `updateQuest`, so "Cook 5 dishes" counts successes only. Proven: 40 forced burns → progress 0; 5 forced successes → 5/5 done. No deadlock — raw ingredients are infinitely gatherable.

**Found while browser-verifying (real bug, fixed here).** `renderSkillDetail` memoises on an `activeKey` that did not include `noBurn`, so building or upgrading a Kitchen left the OLD odds on screen until some unrelated event changed the key. A live number behind a stale cache is worse than no number. `noBurn` joined the key in **both** renderer twins (legacy block 27 + `features/activities-grid.js`). Regression test included.

**Also fixed:** `b217: cooking progresses daily + quest trackers` cooked 3× at Kitchen L1 and asserted exactly 3 — a 12% coin-flip after this change, i.e. ~1-in-3 flaky for a reason unrelated to what it tests. Pinned to the burn-proof Kitchen L3.

**Verify.** Smoke **302/302**, 0 runtime errors, stable across 3 consecutive runs (294 baseline + 8 new). `bump-version.sh --check` OK, no bump. Browser gate on own static server **:8162** through the `__HR_TEST_HARNESS__` seam, real `index.html`, console clean (0 errors): fresh camp (tier 0, `rooms:{}`) starts a cook — 40 cooks **32.5% observed**, 5,000 cooks **24.56%** (level pinned; the 40-sample is just variance on n=40); Kitchen L1 **11.05%** / L2 **6.05%** / L3 **0.00%** over 2,000 each; +6 levels on the open fire **18.4%** (predicted 19%), +25 levels **0.00%** over 500; burn toast reached the b219 queue and coalesced (`x13`); Burnt Food in the bag, v1, `foodClassOf` null, `bestProvisionId` refuses it; burn XP 8 vs success 33 (0.242 ≈ the documented 0.25). Screenshotted the camp cooking screen (risk line legible under the inputs row, `--red` token) and the Kitchen-L3 screen (no risk line at all).

**Files:** new `src/features/cooking-fire.js`; edited `index.html` (one script tag, outside the nav region), `src/features/homestead.js`, `src/features/activities-grid.js`, `src/data/items.js`, `src/legacy.js`, `src/features/smoke-test.js`. **Untouched on purpose:** all CSS (two agents hold it — the risk line reuses `.at-meta` + the `--red` token inline), `nav-consolidation.js`, `src/net/*`, `DECISIONS.md` / shared coordination files.

**Notes for the Designer.** (1) Because relief is per-level-over-`req`, the burn is a *frontier* mechanic: you burn on food you have just unlocked and stop burning on food you have outgrown (shrimp is burn-proof at cooking 26). That is the genre-standard shape and matches "a nuisance that fades, not a wall", but it does mean the 25% headline is only felt on new recipes. (2) The burn-risk line currently also renders on level-LOCKED tiles; accurate, but if it reads as clutter, gating it on `unlocked` is a one-line change in both twins.

### 2026-08-08 · THE ACCOUNT WALL — accounts are required, no account-less play · branch `agent-account-gate`
Built to DECISIONS 2026-08-08 ("Accounts are REQUIRED") plus the Coordinator's nuance: what is removed is *playing without an account*, not local caching for account holders. **New:** `src/net/account-gate.js`. **Edited:** `index.html` (script tag + pill label), `src/legacy.js` (boot deferral, saveLocal guard, 2 copy strings), `src/net/auth.js` (`decideRestore` extracted + exported, 2 copy strings), `src/features/{identity,daily-reward,raids,home-dashboard,smoke-test}.js`, `src/{ftue,beta-banner,welcome-modal,post-signup-welcome,multi-character,settings-page}.js`, `tests/run-smoke.mjs`. **Untouched on purpose:** `sync.js` (adoption already worked — I proved it rather than changing it), `storage.js`, `supabase-bootstrap.js`, every anon/degraded code path (muster solo, Lone Hunt, local names, degraded leaderboards — those are network-resilience now, not product surfaces; only the UI that *invited* account-less play was removed).

**The mechanism, and why it is this and not an overlay.** A wall you can only see is theatre. Everything that makes Hearthrise *progress* is started from `legacy.js boot()` — `loadLocal()` (which runs `processOffline()` and resumes the combat tick), `startFarmCheck()`, the 90s autosave. So the gate defers that one call via `HearthriseGate.whenOpen()`; behind the wall `window.G` does not exist, there is no offline catch-up, no tick, and no write. Verified: `typeof window.G === 'undefined'`, `hearthbound-save-v2` byte-identical, zero modals.

**The single most dangerous line in the change** is the new early-return in `saveLocal()`. Behind the wall `boot()` has not run, so `G` is still the factory default — one stray autosave would write a brand-new character over a beta player's save. Persistence is hard-off until the gate opens, with a test that forces the gate shut and asserts a sentinel survives.

**Sign-in RELOADS rather than handing off in place.** Dozens of modules have already taken their one shot at DOMContentLoaded by then; resuming that half-built page would be a bug farm, and the thing at stake is the player's save. One clean boot with a live session runs the original, well-tested order.

**Adoption — proven, not assumed.** `sync.js` already adopted correctly; the conflict rule was *inlined* inside `pullAndMaybeRestore()`, which made the one promise this project cannot break unprovable. Lifted it out as pure exported `decideRestore()` → `'none' | 'adopt' | 'prompt'`, with deliberately **no** branch that overwrites a local save without asking. Browser-proven end to end with a network-level Supabase stub (real `auth.js` path, nothing monkey-patched): a 376-byte beta save (Old Beta Hand, 48,210g, 1,877 kills, TL 267) survives the wall untouched, comes back live after sign-in, logs `local save kept (Total Lv 267 vs cloud 100)`, and a *stronger* cloud save raises the confirm instead of clobbering.

**The harness seam.** `window.__HR_TEST_HARNESS__ === true` **AND** a non-player origin. Both halves required, and it is a JS global set by Playwright `addInitScript` — not a URL parameter, so it cannot be typed, bookmarked or shared. On `hearthrise.net` / `bugsquisher1.github.io` it is ignored and `console.error`s. Consequence to know: `run-smoke.mjs --url <production>` now correctly hits the wall instead of bypassing it — live-deploy smoke needs a signed-in profile or the local server.

**New gate in `run-smoke.mjs`, worth more than the in-page tests.** A clean context, storage wiped, no flag: asserts the wall is up, `window.G` absent, shell hidden, nothing written, no modals, console clean. It is the *only* automated check that can reach the walled state — no in-page test can, since the suite runs through the bypass. It is what caught `raids.js`.

**Two real bugs found while verifying, both pre-existing, both fixed + tested.** (1) `raids.js:1110` dereferenced `window.G.raids` bare; because `render()` is async the throw escaped `boot()`'s try/catch as an unhandled rejection. Any early caller hit it — the wall just made it reachable on purpose. Now uses `ensureState()`, which has handled a missing G since it was written. (2) The b221 name modal **raced the FTUE tour**: both fired at DOMContentLoaded+600 and identity guarded on `.ftue-card.show`, which the tour only adds ~80ms after building `.ftue-root` — so a first-sign-in player met two stacked modals. Guard is the tour ROOT now (`_FRONT_DOOR`, exposed + tested), identity's first tick moved to +1200. This *extends* the b223 precedence work rather than regressing it; the new re-prompt sheet joins the same queue.

**The re-prompt is not a second wall.** A lapsed token shows a dismissible sheet beside a running game ("Keep playing offline for now"), never an eject. Getting the trigger right took a rewrite: my first version assumed a lapse from the *cached blob*, which false-alarms on any slow CDN load. It now fires only when `HearthriseAuth.getClient()` exists **and** reports no session — so a slow network stays quiet, a genuinely unreachable CDN stays quiet (nothing to sign into), and a real expiry prompts exactly once.

**Verify:** smoke **286/286**, 0 runtime errors, + the wall guard green; 19/19 browser scenarios green (own server :8154) covering clean boot, local-save adoption, both conflict directions, brand-new account, reload-authed (**zero wall flash** — the cached session opens the gate at parse), mid-session expiry, and deferral. `bump-version.sh --check` OK. Did NOT bump build/CHANGELOG.

**Known limitations, stated plainly.** (1) **This is not a security boundary** and must never be described as one — it is static hosting; devtools deletes the node. It is UX enforcement of an online-only product, and it is *sufficient* only because the server already owns the economy, market, chat, clans, raids, leaderboards and unique names. (2) The gate opens **optimistically** on a cached session rather than blocking the door on a round-trip; a token the client cannot validate is one the server refuses anyway, and the player is re-prompted the moment supabase-js rejects it. (3) **Support gap for the Coordinator:** the floating bug-report button is now hidden behind the wall (it was invisible-but-tab-reachable under it), so a player who *cannot sign in* has no in-game channel — the wall's error copy says "check your connection and reload" and nothing more. Whether a Discord line belongs on the first impression is a product call, not mine.

### 2026-08-08 · b224 LIVE HOTFIX — "the quests are not updating when doing the task" · branch `agent-quest-hotfix`
Files: `src/legacy.js`, `src/features/smoke-test.js`. **Untouched on purpose:** `muster.js`, `clan-seat-ui.js`, `home-dashboard.js`, `profile-launchpad.js` — the prime suspect was innocent (see below).

**The prime suspect was NOT the bug.** b220-b223's two `updateDaily` wrappers (`muster`, `castleLabour`) are both on the chain, both fire exactly once per action, and the Home "Next up" ladder + `G.daily.tasks` tick correctly. Reproduced on b223 in a headless browser: 9s of chopping moved `gatherer` 0→22/15 and `daily_gather_big` 0→22/120 on the rendered Home cards. The b222 SEAM 4 test already guarded that chain, and it was right to.

**Root cause — `readSource()` is trapped inside an IIFE.** `legacy.js` block 16 (`ui-overhaul-js`, opens L5961) is an IIFE. `function readSource(path)` lives inside it. The **Quests strip + modal** — block 40, its own IIFE — read progress with a bare `readSource(...)` behind `if(typeof readSource !== 'function') return 0;`. That guard never threw; it answered **0**. So `getProgress()` returned 0 for every daily and weekly quest, forever: the strip pinned under the topbar on *every screen* read `0 / N` no matter what the player did, `isComplete()` was never true, and nothing was ever claimable. Zero console output. This is the third read out of that scope to be caught this way — b127 fixed `hoursTillUTCMidnight`, b130 fixed `getGoalsForToday`; `readSource` was the one whose failure was silent, so nobody found it. **The player was right and the counter was right; only the panel was blind.**

Two more instances of the same trap, found while proving the fix and fixed with it:
- `claimQuestReward()` resolved a daily goal from `DAILY_GOAL_POOL`, also block-16 scoped → `typeof` was `'undefined'` → every daily claim returned on the next line. Even a finished quest had a **dead Claim button**. Now resolves through the exported `getGoalsForToday()`, which is already narrowed to today's three picks (stricter than the whole pool).
- The strip's `HearthriseEvents.on('*')` subscription was evaluated at legacy.js parse time, *before* main.js boots the ESM bus, so it silently never happened — the strip only ever repainted on its own 2s timer. Bounded retry (50 × 200ms), same late-binding pattern as everything else there.
- `_dailyGoldDelta` is a **derived** source, not a path into G. `readSource` walked `G._dailyGoldDelta` → undefined → 0, so "Earn 500 gold" could never move even with the export in place. Now derived exactly as `readPath()` (block 17) already does it.

**The windfall I nearly shipped.** `G.weeklyGoals.startValues` were captured *in block 40*, i.e. always `0`. Fixing the read alone would have handed every established player three instantly-complete weeklies ("Slay 100 monsters", "Cut 250 logs") and their full rewards — thousands of gold and gems nobody earned. Weekly state now carries `sv:1` and a pre-`sv` baseline is **re-captured once** against the live sources. Nothing real is lost: the panel showed 0 and could not be claimed, so no weekly progress was ever actually tracked. Daily baselines needed no such repair — those were captured *inside* block 16, where `readSource` was always visible, which is exactly why the daily numbers were correct in state and wrong only on screen.

**Why 274 tests were green while quests were dead in production.** Every quest test in the suite asserted the panel **opens** (b127 `closeAllModals`), **closes** (b127 `showTab`), or **lays out** (b132 mobile columns). Not one asserted that a number **moves**. b127 even added `hoursTillUTCMidnight exposed on window` — the right test for the wrong two-thirds of the seam. Closed with 4 tests that drive real counters and read the rendered text back: strip `0 / 30` → `7 / 30` → claim pays; `readSource` walks G, clamps a missing path to 0 and derives the gold delta, and **every source both live pools name is readable**; a pre-`sv` weekly re-baselines and renders `0 / N` with no Claim button; and one real `doSkillAction()` gather moves the ladder while two freshly-registered wrappers each see it **exactly once** on top of the two live ones (boot-order independence). Confirmed to fail without the fix: removing the export → **3 red + a console error** (the new `console.error` fails the headless gate on its own); reverting only the claim fix → 1 red.

**Verify:** smoke **278/278**, 0 runtime errors, console clean. `bump-version.sh --check` OK. Browser (own static server :8155, headless Chromium on this worktree): chopping drove "Gather 25 logs" 0/25 → 25/25 with the claimable marker; 3 kills drove "Slay 30 monsters" 0/30 → 3/30 and `first_blood` 0→3/5; a harvest drove `farmhand` and `daily_harvest` 0→3/10. **Muster + Labour re-verified after the fix:** roster still `muster,castleLabour`, `_addPoints(25)` accrues 25 points / 25 pending, castle Labour grants exactly **400** and stops. Did NOT bump build version / CHANGELOG (Coordinator does at integration).

**Standing debt this exposes (not fixed, bigger than a hotfix):** `legacy.js` is 40 IIFEs that talk to each other through `window` by hand. Every cross-block read is a hand-written export that can be forgotten, and the house style guards them with `typeof x !== 'function'` fallbacks that **return a plausible value instead of failing**. That pattern is why this survived 97 builds. Rule going forward: a missing cross-block export is a wiring break — log it loudly (the smoke gate treats console errors as failures) and never substitute a silent zero.### 2026-08-08 · Wave 3b — backlog #10 THE VISIBLE CLAN SEAT · branch `worktree-agent-a0bb23f14cf83f91d`
Built to `docs/design/clan-overhaul.md` v2 §16 steps 4-8, as amended mid-wave by two product-owner directives (castle reads as BLOCKS; every structure clickable → its own themed room) and a vision-level one (castle + homestead are the twin ultimate progression pillars → the room component must be reusable). Files: **new** `src/features/clan-seat-ui.js`, `src/styles/clan-seat.css`, `supabase/migrations/2026-08-08-clan-seat-2.sql`; **edited** `src/features/clans.js`, `src/styles/theme-cozy.css` (carve-out only), `index.html` (2 tags), `src/features/smoke-test.js`, `.claude/launch.json`. **Untouched on purpose:** `raids.js`, `muster.js`, `legacy.js`, `leaderboards.js`, `schema.sql`, `2026-08-08-clan-seat.sql`.

**Not one formula re-derived.** Every number the panel draws comes from `window.HearthriseClanSeat` (the b222 tested reducers). The only constants declared in the renderer are §7's building→getBonus perk column and §8's budget, and they sit next to the getBonus wiring that consumes them with a test asserting §8.2's audited table.

**THE PERK-CAP RULING (closes the open CONFLICTS entry "Perk stacking power budget").** `getBonus` is a chain of six additive wrappers. A clamp anywhere in it either bites TEMPORARY power it must not touch (§8.4 deliberately budgets a Tavern-10 Last Call feast *above* the permanent ceiling) or is escaped by whoever wraps last. So the fuse is not a blind clamp: it computes the permanent stack directly from its four named sources (homestead capstone, renown, clan ladder, castle) and, when that would exceed +60% allXP, reduces **the castle's own contribution**. The newest system yields — which is the spec's own standing rule written as code. Today the fuse does not bind (5 + 22 + 0 + 5 = 32%). That is the point: a fuse, not a nerf. Per-key castle cap +10% (binds exactly on `raidPower`); `restedXp` is exempt from that cap because it is a per-action multiplier drawn from an 80-charge bank, and clamping it would silently halve the Tavern's stated +20%.

**§8.3 re-scope landed in the same commit,** as the conflict demanded: the clan auto-level ladder loses +25% allXP / +8% gather / +5% artisan and keeps only +1h and +2h offline plus a cosmetic banner. Net power REDUCTION. The b206 test that asserted the old ladder was rewritten, not disabled, and now asserts the grants are *gone at every level*. Also corrected the file header, which documented a fourth invented threshold ladder ("10k, 50k, 200k, 800k, 3M") that has been wrong since b206.

**Rested XP — the trap I nearly walked into.** `legacy.js accrueRestedXp()` already banks charges from `G.restedAt`, and `clan_rested_grant` banks them from `clan_members.last_seen`. Adding the server's charges to `G.restedXp` would have paid the same offline hours twice — the exact b214 double-pay class both watermarks exist to prevent. Ruling: **the client is the only writer of the bank**; the RPC is consulted for the potency (which depends on Tavern level and upkeep state, both server-owned) and for its ledger row. Verified in-browser: bank 5 → 4, and 1,000 XP became 1,130 with a charge vs 1,110 without at Tavern 1 — exactly +2%.

**The room-modal seam (`window.HearthriseRoomModal`).** Published deliberately generic — descriptor in, modal out; `{id,title,subtitle,theme,scene,sections[],onAction}` with section kinds `note|meter|rows|ladder|actions|field`. It contains no clan vocabulary and a test asserts that by regexing its own source. The upgrade ladder is the reusable piece that matters: "what does level N+1 cost and what does it give me" is the same question a homestead stove asks. CSS is `.hr-room-*` (already carved out of the b174 blankets) so `homestead.js` can adopt it without touching `theme-cozy.css` again.

**Integration fix found while verifying:** `raids.js` derives the Hunt tier ceiling from `HearthriseClans.myClan().castle_tier` / `.upgrades`, and that row is only populated at sign-in. A tier-up or a completed War Room order would not have raised the ceiling until reload. `readSeat()` now writes the authoritative four fields back onto the clan row.

**Verify:** smoke **270/270**, 0 runtime errors (250 base + 11 Hunt after merging main + 9 mine). `bump-version.sh --check` OK; did NOT bump. Browser (own static server :8149) with a stubbed in-memory server implementing the real RPC envelopes: full chain — read → deposit 60 beams (inv 400→340, +882 Standing) → post Tavern order → supply from Storehouse → phase flips to labour → 900 real `updateDaily('crafted')` calls → labour stops at exactly 400/day → complete → Tavern Lv 1 → `getBonus('restedXp')` 0.02 → a real `addXp` burns one charge → Tavern 7 feast meter 1440/1440 → call → +15%/3h → Last Call doubles to 0.30 → tier-up to Fortified Keep → clan row synced (ceiling recomputed). Degraded (404/PGRST202): **zero bars rendered**, honest "not chartered yet" copy, treasury still shown. Anon: sign-in prompt, every castle key exactly 0. Console clean of anything from this code. Screenshots at tiers 1/3/5 + all six rooms.

**Two things I changed after LOOKING at them, which the tests would never have caught:** (1) the room caption started as an overlay plate on the vignette — the idiom the hold band uses correctly, because a castle skyline is tall — and it covered the floor of every interior, i.e. exactly where a room keeps its furniture. Caption moved below the scene. (2) The interiors were black-on-black: `--scene-build` furniture on a `--scene-build-2` wall works outdoors against a lit sky and is invisible indoors. Inverted: inside a room the WALL is the lighter surface catching the fire, the furniture is the silhouette.

**Known limitations, stated plainly:** the Board's weekly siege task is catalogued and NOT rolled (`live=false`) because nothing feeds a `raid_damage` counter yet — one boolean when the Hunt lands one. Board gem rewards are not implemented (server cannot grant a client currency honestly). Deposits remain client-trusted for possession (§12.3) — never describe Phase A as fully server-authoritative for materials. Killing Blow / First Blood clan-chat posts: staged, not built — they need an event seam out of `raids.js`, which was not my surface this wave. Mobile spot-checked only (no horizontal overflow at 375px, six doors render); landscape remains the deferred target.

### 2026-08-08 · Wave 3b — backlog #16 THE TIERED HUNT · branch `worktree-agent-a5feef0ed0ef95040`
Built to `docs/design/clan-boss-events.md` §§3-8 + §10.2-10.5, as amended by the Clan Seat v2 reconciliation. Files: `src/features/raids.js` (rewritten in place), `src/data/{items,recipes}.js`, `supabase/migrations/2026-08-08-hunt.sql` (new), `src/features/smoke-test.js`. **Untouched on purpose:** `clans.js`, `clan-seat*.js`, `muster.js`, leaderboards, every CSS file, `index.html`, `legacy.js`, `schema.sql`.

**Why the flat pool had to go.** `CLAN_POOL_HP = 250000` for every clan on earth. Measured: it is *harder than Tier IV at n=10*, i.e. it was tuned for a ~25-person endgame clan and served to a 6-person one. Never downed in production. `pool = TIER_BASE + TIER_PER_MEMBER × members_at_declaration` is the whole fix; it also makes alt-stuffing self-defeating (every alt raises your own boss's HP) and freeloaders a visible cost, which is what ties #16 to #10 instead of leaving two features sharing a table.

**Architecture notes for whoever touches this next.**
- The tier ceiling is computed ONCE, in `HearthriseClanSeat.maxHuntTier` — `raids.js` calls it, never re-derives it. Two copies of a gate is how the card and the castle panel end up disagreeing about what is legal. Castle state is READ via `HearthriseClans.myClan()` (castle_tier / upgrades.war_room / myRole) and never written.
- `render()` paints the solo card **before its first `await`** on purpose. An `async` function runs synchronously to its first await, so a signed-out player still gets a card in the same tick — the b219/b220 DOM tests call `render()` without awaiting and would otherwise assert against an empty node. Cost me one failure; don't "tidy" it into a post-await assignment.
- `simulateStrike(boss, {clamp})` is the only consumer of `getBonus('raidPower')`, applied to the total BEFORE the clamp so the War Room can never push a strike past a tenth of the pool. The clamp is `max(5000, pool × 10%)` — self-scaling, so a new tier never needs a new constant.
- The claim mirror now keeps **two** week keys (current + grace), not one. It still prunes; it is still a mirror, not a ledger.
- `G.raids` is local-save only — it is deliberately NOT in `net/events.js snapshot()`. That is the documented b219 P3 posture (solo claim replay is local-only). Clan claims are server-ledgered, so nothing of value rides on it. No `snapshotG` change was needed.

**Server.** `2026-08-08-hunt.sql` EXTENDS `raid_strike`/`raid_claim` in place (same signatures) rather than replacing them, and re-asserts every b219 rule in its own DO-block. New: `clan_hunt_declare`, `hr_hunt_tiers`, `hr_hunt_bosses`, `hr_max_hunt_tier`, `hr_hunt_pool`, `hr_hunt_clamp`, `hr_week_start`. It declares `clan_members.charge` with the same `add column if not exists` clan-seat uses, so the two are order-independent; and it writes `clans.standing` only if that column exists, leaving `standing_paid` FALSE when it doesn't — a kill must not be recorded as paid for a currency that isn't there yet.

**Two things I decided rather than invented silently — both need a Designer ruling.**
1. **§8.6 contradicts §5.2.** The spec's test says a 100-damage contributor against a 750 median takes a *Partisan* share; §5.2's own table puts the Partisan floor at 20% of the median, and 100/750 = 13%. Both cannot be true. I implemented §5.2 (the normative body, with the reasoning) and corrected the test expectation, with the discrepancy written into the test's own comment so it can't be rediscovered as a bug.
2. **§3.1 never says what happens if nobody declares.** Refusing the whole week holds a roster hostage to one absent officer; auto-founding immediately steals the leadership decision the tier ladder exists to create. Ruling: officers own the first **3 days** of the UTC week; after that the next strike auto-founds a **Tier I** Hunt (the floor tier every clan qualifies for). Constant `c_grace_days` in `raid_strike`, one line to re-tune.

**Open dependency I did NOT close:** `getBonus('raidPower')` now has a consumer but still has **no producer**. Nothing in `legacy.js getBonus` contributes it, because the War Room perk publisher is castle-owned and adding one here would double-count the moment that agent wires it. → Castle/clan owner: publish `raidPower = war_room_level × 0.01` (clan-overhaul v2 §7) and the Hunt picks it up with no further change. Verified in-browser that a granted 0.10 produces exactly ×1.10.

**Verify:** smoke **261/261**, 0 runtime errors (baseline was 250/250; +11 new tests). `bump-version.sh --check` OK. Browser on own server **:8151** (headless Chromium — the shared tab pool was at cap with three other agents' tabs; did not evict theirs): pools for n=5/10/40 across all five tiers match the spec table; ceiling castle-4/War-Room-6 → Tier III; over-ceiling declaration refused with **zero** RPC calls; stubbed declare accepted; 404 declare reads as "not built yet", not an error; the card shows the tier badge, 12,000/155,000, The Faltering, and your damage vs the median at 211px tall with no holes; the undeclared card offers exactly Tiers I-III to an officer, nothing to a member, and **keeps Strike** so pre-Hunt realms still work; raidPower 720 → 792; every b219 refusal still refuses; anon/offline renders the Lone Hunt with no server and an honestly *unmeasured* pool. Console clean. Did NOT bump build version / CHANGELOG (Coordinator does at integration).

### 2026-08-08 · Wave 3a — backlog #10 THE CLAN SEAT foundation · branch `worktree-agent-a7483d838e0205914`
Built to `docs/design/clan-overhaul.md` v2 §16 steps 1-3. New: `src/features/clan-seat.js`, `supabase/migrations/2026-08-08-clan-seat.sql`. Touched: `src/data/{items,recipes}.js`, `src/main.js`, `src/legacy.js` (four seams + the farm writers), `src/net/events.js`, `src/features/{muster,farm-progression,smoke-test}.js`, `src/save-migrations.js` (comment only), `index.html` (one script tag). **No castle UI** — `src/features/clans.js` render, the leaderboard surfaces and every CSS file are untouched (two other agents hold them).

**The lane had to land in the same commit as the items, and the ORDER of the derivation is the real decision.** Four `tag:'castle'` goods match no existing category, so adding them alone breaks the zero-uncategorized regression test (CONFLICTS #2). I made "Castle Stores" the **LAST** claim in each of the three skills rather than the first. A derived taxonomy must never *steal* a recipe from a more specific lane: the Phase-B Cellar ales are specced as `foodClass:'buff'` AND `tag:'castle'`, and §14.3 explicitly wants them in "Feasts & Draughts" where the player drinks them. Castle-first ordering would have silently moved three future ales out of the cooking tab, and nobody would have found it until Phase B. Guarded with a synthetic castle-tagged buff food asserting it still lands in `feasts`.

**Four engine seams. The only one with teeth is Rested XP, and its teeth are the watermark.**
- **`goldFind`** (CONFLICTS #3) — declared since the buff registry shipped, read by nothing. Lich Soul Soup has been promising +50% gold find for 5 minutes and delivering zero; the Treasury perk would have been the second broken promise on the same key. One choke-point (`applyGoldFind`), wired into BOTH kill paths. Scoped to monster gold DROPS only — vendor sales, quest/daily/bounty payouts and chests are designed numbers, and multiplying them here would silently re-tune six systems under a one-line task.
- **Buff scaling** (CONFLICTS #4) — `registerBuffScaler(name, fn)` consulted once inside `applyBuff`, multiplicative, default exactly 1.0×1.0. Named registration is what makes it idempotent: a boot retry re-registering cannot compound a player's buff durations. Scale is applied at APPLICATION time, not tick time — a buff poured under a level-10 Tavern keeps its length even if the Tavern is later dimmed by unpaid upkeep, because the alternative shortens an effect the player is already watching count down. The extend-an-existing-buff branch uses the scaled duration too; that branch is exactly where a "just multiply at the call site" fix would have leaked.
- **Rested XP** (CONFLICTS #5) — `G.restedXp` is a bank of charges; potency is `getBonus('restedXp')`, which is 0 today, so a charge is never burned for nothing and the seam is genuinely inert. **Accrual is WATERMARKED, not elapsed-based:** `G.restedAt` is the instant already paid for and advances by exactly the charges granted. b214 shipped offline rewards paid 2-3× per login because processOffline and two catch-up systems all re-read one unrefreshed `G.lastSeen`; a watermark cannot be double-read, because the second reader sees an already-advanced clock. Test drives the exact b214 shape (stale `lastSeen`, two `processOffline()` calls) and asserts the bank moves once. Capping the grant without capping the watermark would have let a member re-bank the surplus — so the watermark advances by what was *paid*, and the same rule is written into the server's `clan_rested_grant`.
- **`updateDaily` roster** (CONFLICTS #6) — `wrapUpdateDaily(name, after)` keeps `updateDaily.__wrappedBy` as a Set copied forward on every wrap. Double-wrap under the same name THROWS. The private-boolean pattern (`window.__musterCountersHooked`) is what produces the bug it is meant to prevent, because a second system cannot see the first one's flag; muster.js now registers by name and keeps its local flag only to short-circuit a double `boot()` before the chain throws.

**Save allowlist.** `restedXp` + `restedAt` added to `net/events.js snapshot()` deliberately, as a PAIR. A bank that evaporates on cloud restore is not a bank — and a restored save with a *fresh* watermark would re-bank the same offline hours on next login, which is the b214 shape again arriving through the back door.

**`watered` dual-write deleted** (b220's own contract said "delete in the build after b220"; b220 and b221 both shipped). Removed from all four writers (`startFarmCheck`, `plantCrop`, `applyWatering`, the regrow branch). The two READERS — `save-migrations` v6→v7 and `normalizePlot` — are kept and now carry a "do not delete" comment: pre-b220 saves and old cloud snapshots still carry the boolean, and it is the only signal for whether to retro-credit a window. The b220 test that asserted the dual-write EXISTS is inverted rather than removed, so the contract change is visible in the suite.

**Migration.** ~950 lines, house style, additive, self-checking. The design call worth recording: **deposits are only server-authoritative for value if the server owns the item table**, so the migration ships `hr_castle_items` (34 rows — the 4 refined goods + 30 of the 34 routed orphan drops), `hr_castle_tiers` and `hr_castle_buildings`. The 4 absent drops are the RECIPE inputs (slime_gel, bone_chips, ancient_fragment, cracked_spellstone) — the Storehouse must refuse what a workbench consumes, exactly as it refuses a log, and the self-check asserts they are absent. Work Order bundles and labour targets are derived from those tables, never accepted from the client. The daily Labour cap is the primary key `(clan_id, user_id, day_key)` plus `check (ticks between 0 and 400)` — keyed on clan, NOT on order, or a tier-3 clan's second build slot would silently double every member's ceiling to 800.

**Deviations from spec, all flagged:** (1) §6.5's table prints 18,776 labour at building level 10; its own stated formula `round(800 × 1.42^9)` gives **18,780** — the formula wins and the difference is pinned by a test. (2) Deposit clamps (1M gold value/call, 5M/member/day, 40 item kinds, 100k qty) are **mine, not the spec's** — chosen ~400× above honest play so they are an abuse ceiling, not a gameplay limit. (3) Storehouse cap uses `2500 × greatest(1, treasury_level)`, so a hold without a Treasury still has 2,500 of headroom per item rather than instantly paying 0.4× on everything. (4) `sticky_core`/`goblin_totem`/`alpha_fang` are specced for Phase-B Archives/Armory; I catalogued them as ordinary spoils NOW, because leaving three drops as vendor trash for another wave reopens the problem this table exists to close.

**Verify:** smoke **236/236** (+15), 0 runtime errors; `bump-version.sh --check` OK; no version bump. Runtime (own static server :8146, headless Chromium): boot clean, `__errorLog` empty, 0 console errors and 0 warnings from my code; artisan lanes still total exactly (smithing 82/82, crafting 37/37, cooking 28/28, **0 uncategorized in all three**) with castle 1/2/1; `applyGoldFind(1000) === 1000` and `buffScaleFor({})` identity at boot (both seams inert); `updateDailyWrappers()` → `['muster']`; `G.restedXp` 0 with a live numeric watermark; the save snapshot carries `restedXp`. The only failed request on the page is `hr_server_now` 404 against production Supabase — the Muster's own feature-detection probe for a migration Tyler has not run yet, identical on the baseline.

**Known limitations, plainly.** (1) **The migration's SQL has never been executed** — no Postgres in this environment. Its own `do $$` self-check is the safety net (catalogue counts, the Standing gate, the CP/Standing worked pair from §3.4, the Sunday-boundary function at three edges, and a scan for any client write policy on the new tables). Highest-risk constructs are `hr_clan_week_start`'s ISO-week shift and the dynamic `clan_raids.tier` probe. (2) **Possession is client-trusted.** `clan_deposit` is server-authoritative for currency, gates, rewards and rate, and CLIENT-TRUSTED for item possession, clamped and audited — CONFLICTS #8's wording is echoed verbatim in the file header and above the function. Do not let anyone describe Phase A as fully server-authoritative for materials. (3) Rested XP charges accrue on login and are worth nothing until a Tavern exists; that is intended inertness, but it does mean a save field grows before any reader exists. (4) The Tavern Board's RPCs are NOT built (its table is); Work Order slots, tier-up, upkeep, feast, withdrawal and succession all are. (5) `raidPower` is still unconsumed — `simulateStrike` is Hunt work, not this wave.

**Handoffs.** Art/Asset: four goods need icons in `assets/icons-bundle/` (`timber_beam`, `iron_fitting`, `field_ration`, `keystone`) — they currently fall back to gilt `uiChest`/`uiOre` glyphs, never emoji. Designer: the 18,776/18,780 table-vs-formula discrepancy, and a ruling on whether the three Phase-B reagents should stay Phase-A depositable. Whoever builds the castle panel: everything it needs to compute is already in `window.HearthriseClanSeat` and under test — do not re-derive any of it in a renderer.

### 2026-08-08 · Wave 3a — backlog #11 leaderboards · branch `worktree-agent-aac7fb8d700564099`
New: `src/features/leaderboards.js`, `supabase/migrations/2026-08-08-leaderboards.sql`. Touched: `src/net/sync.js` (derived snapshot fields), `src/legacy.js` (ONLY the `RENDER — Social` region L2534-2580 + one line at L31), `index.html` (leaderboard card markup + one script tag), `src/features/smoke-test.js`. Untouched: `src/data/*`, `src/features/clan*`, all CSS files (the module injects its own scoped `#hr-lb-style`).

**The shape decision: ONE materialized view in LONG format.** `(board, subject_id, name, clan_name, score, rank, saved_at)`, one row per player per board, `row_number() over (partition by board order by score desc, subject_id)`. Top-N, "my rank" and "my two rivals" all become index scans on the same two indexes, so the cost is flat from 50 players to 50,000, and board #22 is one more UNION branch with **no schema change, no new index and no client change**. The alternative (per-skill generated columns on `game_saves`) needs 15 ALTERs on the save table and a new client contract per board. `subject_id` rather than `user_id` is deliberate: it lets clan boards share the identical rank/neighbour machinery.

**Rank is a strict total order on purpose.** Ties broken by subject_id → ranks are 1..N with no gaps, which is what makes "the rival directly above you" a single always-present row. An ambiguous tie set would break the one hook the whole feature exists for.

**The refresh is attempted, never assumed.** I could not verify whether `refresh materialized view concurrently` is permitted from inside a function on this server, so the function tries it, falls back to the plain refresh on any error, and returns the stale timestamp if both refuse. `hr_leaderboard` wraps the refresh call in its own exception handler: a stale board is a disappointment, a board that errors is a broken screen. pg_cron is scheduled if present and skipped with a NOTICE if not.

**Two real bugs found while building, both fixed:**
1. **`window.XP_TABLE` never existed.** Top-level `const` in a classic script is global-LEXICAL, not `window`. `renown.js lvlFromXp` therefore returned 1 for every skill, so the meta-spine scored a fresh save's 24 total levels as 15 — **verified 220 Renown where the correct score is 310** — and `admin.js`'s set-level tool dead-ended on `if(!window.XP_TABLE) return;`. Fixed with one assignment in legacy.js (crossed the region boundary deliberately: the Throne board's score IS computeRenown, so shipping the board on a wrong score would have shipped a lie). Regression test added.
2. **`snapshot.combatLevel` was never written.** `public.leaderboard` has read `snapshot->>'combatLevel'` since b205 and nothing ever wrote it — the Combat board has been sorting every player as null since it shipped. Fixed in the same `derivedSnapshotFields` seam as `renown`/`bossKills`.

**Derived-field seam.** `sync.js` now has one exported, testable `derivedSnapshotFields(cfg, win)` instead of an inline totalLevel stamp. Each field takes a config provider if wired, else the live global, else is **omitted** — a client that cannot compute renown is absent from the Throne board rather than ranked at zero. `bossKills` returns null (not 0) when there is no bestiary, for the same reason.

**Intent vs resolution.** The picker keeps `want*` (what the player asked for) separate from `cur*` (what the server can serve). Collapsing them has a long tail: pre-migration the Throne category does not exist, so a naive first render would "choose" Overall, persist it, and the flagship board would never become the default even after the migration landed.

**Verify:** smoke **231/231** (+10), 0 runtime errors; `bump-version.sh --check` OK; no version bump. Browser (own server :8147) across six states with the RPC stubbed present / 404-PGRST202 / 401: migrated Throne default with the self block at #412 of 1,204 and the rank title as the third column; all 15 skill chips with glyphs and horizontal scroll; degraded reads the REAL live view (2 ranked, correct names) with only the boards it can answer; anonymous shows 25 rows and claims no rank; refusal says so; 390px mobile has no horizontal page overflow. Console clean in every state.

**Flagged, not built (would have been fake):** the seasonal "Climbers" board and the Top-25 gem claim (leaderboards.md §5–6) need a `renown_season` baseline table, a claim ledger and a month-rollover job. Staged for its own migration — I will not ship a season with no rollover. Weekly Raid-Damage boards are also unbuilt: they read `raid_contributions`, which the parallel Systems agent holds this wave.
### 2026-08-08 · Wave 2b — backlog #9 unique display names + player portraits · branch `worktree-agent-a75530557b0006b08`
New: `src/features/identity.js`, `supabase/migrations/2026-08-08-unique-names.sql`. Touched: `src/utils/{profile,image-fallback}.js`, `src/features/{character-page,smoke-test}.js`, `src/{chat,market,settings-page,post-signup-welcome}.js`, `index.html` (one script tag + the avatar `onerror`). **Did NOT touch `src/legacy.js`** — every portrait render site there already reads `window._playerAvatar` at render time, so writing that one seam updates all of them.

**The seam decision: ADOPT `HearthriseIdentity`, don't route around it — but split read from write.** `src/utils/profile.js` (b214, 0 consumers) is 40 lines of thin accessors, and it is ESM; a modal + RPC transport + canvas pipeline does not belong in it, and the feature pattern here is classic scripts. So `identity.js` is the WRITE authority and **merges** into the same `window.HearthriseIdentity` (`Object.assign(window.HearthriseIdentity || {}, …)`), and profile.js now merges too instead of assigning. One global, load-order-independent, and the b214 file finally has real callers (market, chat, character-page, settings). A guard test asserts BOTH halves survive — merge-becomes-replace would otherwise fail as "names work but portraits don't" on some loads and the reverse on others.

**Race safety is a primary key, not application logic.** `display_names.canonical` IS the PK, so two concurrent claims become two INSERTs into one unique index: Postgres blocks the second and raises `unique_violation`. Exactly one wins, with no advisory locks and no check-then-insert window. A **rename is a single UPDATE that moves the PK** — if the new name is taken the statement raises and the subtransaction rolls back with the old row intact, which is literally "the old name frees only on success". Delete-then-insert would have leaked the name to a squatter watching for that gap. `canonical` folds case, `_ - .` → space, drops apostrophes, collapses runs — so `Sir_Bob`/`sir bob`/`SIR   BOB` are one name (OSRS precedent; impersonation by punctuation is the cheapest attack and costs nothing to close).

**Four real defects found while building — all caught by tests, not by reading:**
1. **Reserved-list bypass.** `canon('Adm_in')` = `'adm in'`, which never matched `'admin'`. So did `'A d m i n'`. Reserved names are now matched with separators *removed* (the uniqueness key still keeps spaces — `Iron Vale` and `Ironvale` are two players, not one attack).
2. **`image-fallback.js` replaces any failed local `<img>` with an EMOJI span, in the CAPTURE phase.** That pre-empts an element's own `onerror` AND removes the img outright, so a portrait that failed once could never be swapped for a good one — and a failed player portrait would render 📦, i.e. emoji as art. Added an additive `data-no-fallback` opt-out (portraits only; icons keep the greedy behaviour, which is right for them).
3. **The topbar avatar's `onerror` swapped in a ⚔️ pictograph** — same directive violation, previously unreachable, now reachable by any upload. Falls back to the painted default once, then hides.
4. **The FTUE guard in `post-signup-welcome.js` has never worked.** It tests `.hr-ftue`; FTUE renders `.ftue-root > .ftue-card.show`. That sheet has been free to land on top of the tutorial since b141. Fixed, and the precedence is now tutorial → name → welcome (the welcome greets you by *email prefix* until you have a name, so naming must come first).

**Second-writer bug closed.** Settings' "Display name" field wrote `G.playerName` after `trim().slice(0,20)` and nothing else — it could set a name the claim flow refuses, backed by no server row, silently diverging from the unique name everyone else sees. It now goes through `claimName()`. One writer, one rule set.

**Client-first.** Both RPCs feature-detected (404/PGRST202 → `unsupported`) with the 10-min negative-probe expiry, same as muster/raids. Un-migrated → the modal still works, the name is **provisional** (honestly labelled, `isUniqueName()` false) and `reconcile()` re-claims it *silently* once the RPC exists — the player already chose, so they are never asked twice; they are re-prompted only if someone took it meanwhile. Avatar upload degrades identically: bucket missing → local-only portrait, no data loss.

**Portrait pipeline.** Decode → centre-crop square → redraw at 256×256 → re-encode webp (jpeg fallback) stepping quality down until ≤512KB. Re-encoding from *pixels* is what drops EXIF/GPS — the original bytes never leave the device. Enforced: type, pre-decode 16MB refusal, output dimensions, output size (asserted against `blob.size`, not an estimate), owner-only write by path folder. **Not enforced: what the image depicts** — that is moderation, out of scope, said plainly rather than implied.

**Storage placement.** The record lives in `HearthriseStorage` (`hearthrise:identity`), NOT in `G`: the name is account-level (matches `profiles.id = auth.uid()`, which the leaderboard view already reads) so it must survive a character switch, and a 512KB dataURL inside `snapshotG` would upload to `game_saves` every 60s. A test asserts no `data:image/` ever appears in `G`.

**Verify:** smoke **216/216** (+10), 0 runtime errors; `bump-version.sh --check` OK. Browser (own server :8144, scripted Playwright drive-through with stubbed RPC/storage shapes): anonymous boot shows no modal and the default portrait → faked sign-in opens the modal unprompted → live validation refuses short/markup/reserved → claim against an un-migrated server yields `provisional` → migration "lands", `reconcile()` confirms silently with no second prompt → a lost race keeps the held name → upload of a generated 1400×500 image produces 14,888-byte webp, local-only with no bucket, `synced` with one → reload persists name + portrait, seam intact, no re-prompt. Console clean (the only errors are my own stub 404/400s; the clean `run-smoke.mjs` run reports 0).

**Known limitations:** (1) **One name per ACCOUNT, not per character** — `profiles`/`display_names` are keyed on `auth.uid()`, which is what the leaderboard already assumes; all 5 slots share the unique name. Per-slot uniqueness would need a different namespace and was not invented here. (2) Profanity is checked client-side only (ChatFilter); duplicating a curated list in SQL guarantees drift, so it is deliberately one-sided — a determined player can bypass it via a direct RPC call. (3) Other players' avatars are not rendered in chat/leaderboards — that needs a per-user URL fetch and would create broken-image states for everyone without an upload. (4) The migration's SQL could not be executed here (no Postgres); its own self-check DO block is the safety net and raises loudly on drift. (5) Existing players are backfilled from `profiles.display_name` (earliest account wins a collision) so their re-prompt is a one-click confirm, not a forced rename.

### 2026-08-08 · Wave 2 — #15 the Muster + #14 discoverability · branch `worktree-agent-ab0b40724b7d21abb`
Built the joinable layer of world events and the Events destination, per `docs/design/world-event-cadence.md`. New: `src/features/muster.js`, `supabase/migrations/2026-08-08-muster.sql`, `assets/icons-bundle/medieval/muster-seal.svg`. Touched: `index.html` (nav + More sheet + script tag), `src/data/items.js`, `src/dungeons.js`, `src/nav-consolidation.js`, `src/features/{raids,world-events,icon-set,smoke-test}.js`, `src/styles/theme-cozy.css`. **Did NOT touch `src/legacy.js` at all** — two other agents held the farm and artisan-render regions, and everything I needed (topbar pill, showTab tap, contribution counters) was reachable by injection or by the same thin-additive-wrapper pattern `world-events.js` already uses on `getBonus`. Smaller blast radius than the brief assumed.

**Schedule.** Derived, never stored: slots at 01:00/13:00 UTC, 45-minute windows, `event_key = utcDayKey + '#' + utcHour`. Day key reuses `HearthriseWorldEvents.utcDayKey` (UNPADDED `2026-8-8`) so it is byte-identical to `hr_utc_day_key` in the raid migration — the spec's illustrative `2026-08-08` would have silently disagreed with the server. **Sub-finding worth keeping:** picking both slots by FNV-1a alone collides ~1 day in 6, and the whole design argument for "join once per day" is that the two slots are a real *choice*. Slot B is now drawn from the pool with slot A removed, so `eventFor(d,1) !== eventFor(d,13)` is a guarantee, not a probability (tested over 30 consecutive days).

**serverSkewMs (the thing CONFLICTS.md said had no equivalent).** One `hr_server_now` RPC per session; `skew = server − (t0+t1)/2`, ignored under 1.5s so a healthy clock never acquires a permanent wobble. **The useful discovery: the pre-migration fallback works.** The `Date` response header of the *same 404* is readable cross-origin against the live Supabase project (PostgREST exposes it), so skew is correct BEFORE Tyler runs the migration, not only after. Every piece of slot maths in the module reads `now()`, never `Date.now()`.

**Client-first compatibility, concretely.** All four RPCs are new, so nothing pre-existing changes and a pre-b220 client is unaffected by the migration. The client feature-detects each (404/PGRST202 → `unsupported`) with a 10-minute negative-probe expiry, mirroring the Wave-1b `raid_claim` pattern, so a session open across the migration self-heals. Un-migrated/offline/anon degrades to a **solo muster**: real join, real contribution, real chest — but no community bar and **no Muster Seal**, because neither can be honest without a server. Reducers are pure and directly unit-tested.

**Economy.** Chest caps are enforced on BOTH sides (server computes the band from the median of contributors ≥200 pts; client re-clamps to 7,500g / 10 gems / 1 seal and zeroes the seal unless `held`). `muster_seal` is new, `bop:true`, and has exactly one source — a guard test scans MONSTERS drops, DUNGEONS loot, ARTISAN_RECIPES and raid boss rewards for leaks. No code path names `hearth_token`.

**#14.** `Events` is now a real static nav entry (index.html) + a More-sheet entry; `#panel-events` holds muster → Blessing → clan boss → dungeons. `dungeons.js injectNav()` and the `[data-tab=dungeons]` hide rules are both **deleted** — "inject a button then hide it in CSS" IS the bug. `showTab('dungeons')` still resolves (mapped to `events`), so every deep link survives. **Root cause of the 16px raid card:** `.panel.active { display:grid }` with no row template — an injected card became an implicit row in a fixed-height container. `#panel-events.active` is a scrolling block column; the card measures 173px desktop / 227px mobile.

**Found and fixed while in the files:** the static `#more-modal .tap[data-tab]` buttons (Items/House/Social/Store) had **no click handler at all** — only Bounty and Stable worked, because each attaches its own when injecting. One delegated listener fixes the whole sheet. Also de-emoji'd the Blessing strip (atlas glyphs, same map home-dashboard.js uses) and its login toast, since relocating it to a dedicated panel made the emoji prominent.

**Verify:** smoke **194/194** (+6), 0 runtime errors, stable across 3 runs; `bump-version.sh --check` OK; `findUiOverlaps()` empty; only console 404 is the one feature-detection probe. Every new test confirmed to FAIL when its guard is removed (6/6 mutations: hide-rule reinstated, raid card back to `panel-dungeons`, WINDOW_MIN→30, seal added to a dungeon loot table, reward-outranks-live, `already_joined` disabled). Browser (own server :8142): all 7 pill states driven via `_setSkew`; full offline/anon flow — confirm modal → join → real `updateDaily` kills scoring 10 pts → rally once → second slot refused → chest 1,500g/2 gems/**0 seals** → replay refused; mobile 375px pill fits with no overflow, More-button state dot, Events entry routes.

**Known limitations:** (1) `grantReward`-style client-side crediting persists — the server decides *whether* and *how often*, not the inventory write (pre-existing gap, `schema.sql` §3). (2) Home "Next up" muster rows (spec §7.3) and the CL 25/30 unlock moments (§7.4) are NOT built — out of the brief's scope and `home-dashboard.js` is contested. (3) Dungeon/raid card emoji inside the Events panel are pre-existing data glyphs, not mine.

**Deviation from spec, stated plainly:** §4.5 says guests see only "Sign in to join". I let signed-out players join a *solo* muster (honestly labelled, base band, no seal) because (a) the Coordinator's brief requires the offline/anon join path to work, and (b) `raids.js` already sets the precedent that content is never a locked door. State 7 still exists and fires when signed out with no live window.

### 2026-08-08 · Wave 2 — backlog #13 farming: optional watering + working auto-replant · branch `worktree-agent-a87d9d620003063a5`
Built to the Game Designer's spec (`docs/design/farming-watering.md`). Files: `src/features/farm-progression.js`, `src/save-migrations.js`, `src/legacy.js` (farm + daily-pool regions only), `src/styles/art-direction.css`, `src/features/smoke-test.js`. No balance number deviates from the spec.

**The bug was a gate with no timeout.** `startFarmCheck` flipped a plot ready on `elapsed >= crop.hours && p.watered`. `plantCrop` wrote `watered:false`; so did every Tomato regrow; so did `maybeReplant`. An unattended plot therefore stalled **forever**, and `renderFarm` printed `'Tap to water'` with *no percentage and no bar*, so a permanently dead plot was pixel-identical to a fresh one. `calcRichCatchup` carried its own copy of the same predicate, so offline never counted dry plots either. Four re-derivations of "is this crop done", two with the gate baked in.

**Fix shape: one pure function, everything else reads it.** `HearthriseFarm.growthHours(plot, now) = elapsed + min(waterBonus, elapsed)`, derived purely from `plantedAt` + a `waterings[]` timestamp list — no stored counter, nothing to desync, offline-correct for free, and re-derivable server-side later (the §8 handoff). Tick, offline catch-up, progress %, ready check and both renderers now call it. `min(bonus, elapsed)` is the load-bearing line: a forged/duplicated `waterings` array can never beat 2× elapsed (test forges 20 duplicates and asserts the bound). Watering caps itself — the windows must fit inside the shortened grow time, so `floor(hours/4)`, no cap table.

**Migration v6→v7** converts `watered:true → [plantedAt]` (retro-credits one window; strictly better) and `watered:false → []` (the plot *starts finishing*). `farm-progression.normalizePlot()` repeats it defensively on first read for cloud saves / other char slots that never pass through `applyMigrations`. `watered` is **dual-written for exactly this one build** as "has an active window" so a rollback to b219 reads a sane value — **delete the field in b221**. `snapshotG`'s 24-field allowlist is untouched and `net/events.js snapshot()` ships `farmPlots` wholesale, so the shape change needs no allowlist work (confirmed, per §3.3).

**Two things I added that the spec implied but didn't spell out.** (1) `fmtTime()` lives inside another block's scope in `legacy.js` and is NOT reachable from the farm region — a local `fmtSpan()` was needed; the first build threw `ReferenceError: fmtTime is not defined` inside the error boundary on every `renderFarm`. Worth remembering: `legacy.js` top-level `function` decls are global but the file is *not* one flat scope. (2) The 1Hz window countdown is a text-node updater guarded on `activeTab==='farming'`, and only escalates to a real `renderFarm()` when the waterable **count** changes (i.e. a plot crossed a state boundary), so a 2-hour countdown costs no layout.

**Deviation from spec (1, minor):** §5.2 wanted the disabled "Water all" button to read `All plots watered · next in 47m`. The reason lives in the button's `title` and in the status line above it (`Next watering in 1:47:23`) instead — a long stateful button label reads badly next to three sibling buttons. Behaviour identical.

**Verify:** smoke **196/196** (188 base + 8 new), 0 runtime errors; `bump-version.sh --check` OK. Clamp test confirmed to FAIL when `min(bonus, elapsed)` is removed (21 growth-hours in 5h). Browser (own static server :8141): dry turnip runs 0%→ready and the real 5s tick flips it; watered wheat 359m vs identical dry wheat 479m (exactly one 2h window = 2 gifted growth-hours, spec's 8h→6h); auto-replant chained 3 unattended cycles, each maturing dry; reload mid-growth preserved `waterings` and the window countdown; a seeded **v6** save with `watered:false` past grow time loaded through `applyMigrations` and came up **Ready** (it was frozen forever on b219); daily goals measured 10/300g · 18/540g · 36/1080g at 2/6/12 plots. Console clean. Did NOT bump build/CHANGELOG.

**Known limitations, stated plainly.** Farm growth is still client-clocked — moving the system clock forward still fast-forwards crops, exactly as on b219; this change adds the *first* bound (2× elapsed) but does not close it. Auto-replant still requires a manual harvest to fire; there is no auto-harvest, so "unattended" means the chain no longer *stalls*, not that it runs while logged out. Dailies are generated once per day and persisted, so upgrading your property mid-day keeps yesterday's goal until tomorrow (accepted in spec §7). `daily_kill` and `daily_gather` have the identical fixed-goal-vs-variable-capability problem and were left alone — out of scope, worth a ticket.
### 2026-08-08 · Wave 1b — raid economy hardening (server-authoritative) · branch `worktree-agent-a285ce3822eaee1fb`
Closed the Game Designer's three live production exploits **plus a fourth I found while writing the SQL**. Files: `supabase/migrations/2026-08-08-raid-hardening.sql` (new), `supabase/schema.sql` (kept canonical — the two agree), `src/features/raids.js`, `src/features/smoke-test.js`. No balance number changed.

**The shape of the fix.** Everything the client was *trusted* with moved into Postgres; `raids.js` is now explicitly a mirror for UX.
- **P1 unlimited strikes** — `raid_strike` derives the UTC day itself (`hr_utc_day_key`, byte-identical to `HearthriseWorldEvents.utcDayKey`: unpadded `2026-8-8`) and gates on it. The gate IS the contribution upsert: `on conflict … do update … where last_strike_day is distinct from excluded.last_strike_day` — Postgres row-locks before evaluating the WHERE, so two concurrent same-day strikes cannot both pass; `row_count = 0` ⇒ refuse. **Critical sub-finding:** a day gate keyed on a client-supplied `p_week` is no gate at all — invent a fresh week key per request and you get a fresh gate. `p_week` is now validated against the server's own key, never trusted.
- **P2 chest-hopping** — new `raid_claims` table, PK `(user_id, week_key)`. The primary key *is* the rule: one chest per player per UTC week regardless of how many clans you join. `raid_claim()` additionally requires membership `joined_at <= clan_raids.downed_at` (turning up after the kill earns nothing) and ≥1 recorded strike on that pool. The client's direct `PATCH raid_contributions` policy is **revoked** — which also stops a tampered client forging the `damage` figure the Wave-3 bands will read.
- **P3 solo claim replay** — solo claims go into the same server ledger (`scope='solo'`). `G.raids.claimed[wk]` is now a render mirror only.
- **P4 pool forgery (new, mine)** — `raid_strike` took the pool size from the *client* (`p_max_hp`). The first striker of the week could declare a 1-HP boss and hand the whole clan a free chest. `p_max_hp` is now accepted-for-signature-compatibility and **ignored**; 250,000 is a server constant (same number, so not a balance change).

**Backward compatibility — deliberately engineered, this was the hard part.** `raid_strike` keeps its EXACT 5-arg signature (a changed signature would 404 for every cached client). `raid_claim` is NEW, so the client feature-detects it (404 / `PGRST202` → falls back to the b209 PATCH) with a 10-min negative-probe expiry so a session open across the migration self-heals. Pure reducers `_reduceStrike` / `_reduceClaim` carry the contract and are directly unit-tested, including the pre-migration response shape (`{ok,hp_remaining,downed}` with no `day`/`week`/`max_hp`). **Order matters: ship the client, THEN run the migration** — the legacy PATCH policy is revoked by the migration, and it is safe to revoke because per the designer's audit no clan pool has ever been downed in production.

**Two design decisions worth remembering.** (1) The mirror now moves *after* the server accepts, not before-with-rollback — a failed request can no longer lock an honest player out of a real strike. (2) Clock disagreement is reconciled with a *self-expiring* correction (`clockFix` keyed on the local key it disagreed with) and exactly ONE bounded retry, never a loop.

**Verify:** smoke **179/179**, 0 runtime errors (both new tests confirmed to FAIL when the guard they protect is removed — I broke each and re-ran). `bump-version.sh --check` OK. Browser (own static server :8133): clock matches `HearthriseWorldEvents`, offline/anon solo path — strike lands, second same-day strike refused, chest pays 4,000g/10 gems (0.4× Hollow Regent) exactly once, replay refused, card re-renders to "Chest claimed"; console clean. Did NOT bump build/CHANGELOG.

**Known limitation, stated plainly:** `grantReward` still applies gold/gems/items *client-side*. The server now decides *whether* and *how often* a chest is granted, which is what closes all four exploits — but a fully rewritten client can still mint its own inventory. That is the pre-existing "full server inventory authority is the next pass" gap noted in `schema.sql` §3, not something this migration regressed.

**Handoff — Art Director (not mine, not touched):** `#hr-raid-card` renders **16px tall** (collapsed) inside `#panel-dungeons`, whose used `grid-template-rows` gives row 1 only 26px against a 159px card. Reproduced identically on pristine b218 at :8134, so it is pre-existing and NOT from this change; an inline `grid-column:1/-1;display:block` does not fix it, so the fix is in CSS, which is off-limits to me this wave. Note `world-event-cadence.md` §7.2 plans to move this card to the Events panel anyway — fix it there rather than twice.
### 2026-08-08 · Wave 1 — backlog #7 (toasts) + #8 (chat button) + beta-modal emoji · branch `worktree-agent-a6734a16f384fc2ed`

**#7 root cause (all three complaints, one corner).** `notify()` in `src/legacy.js` was six lines: 13.5px type, a flat 3500ms timeout, and `while(el.children.length>5) el.children[0].remove()` — which *destroys* toasts on arrival during a burst rather than queueing them. Positionally, `.notifs` (z 1000, bottom-right 12px), `#chat-dock.mini` (z 10000, bottom-right 16px) and `#hr-bug-btn` (bottom-right, bottom 62px) are **three pieces of floating chrome in one corner** — the chat pill outranks the toasts, so the newest notification was literally behind it. The `audit-overrides.css` zone comment claims `.notifs` owns "zone-toasts" while two other elements sit in it; the zone policy was documentation, not enforcement.
**Fix:** new `src/features/toasts.js` owns the queue (legacy `notify()` delegates, keeps a fallback render). Body-size type (`--t-body`), duration = 4s floor + 55ms/char capped at 9s, ≤4 visible with a real pending queue (stale entries >15s skipped, not shown minutes late), identical messages coalesce to one row with `xN`, pause-on-hover, click to dismiss. Clearance is **measured, not hardcoded**: `layout()` reads the live rects of everything in `OBSTACLES` (`#chat-dock`, `#hr-bug-btn`, `#bottom-nav`) and lifts the column above them; if the required lift exceeds 42% of the viewport (expanded chat panel) it side-steps horizontally instead. New floating chrome adds a selector — no new magic offsets.

**#8 root cause:** the chat pill had no position state at all. **Fix:** pointer-drag on `#chat-dock-min` with a 5px click/drag threshold, edge snap, and clamping that keeps it **below the topbar + activity strip** (movable must not create the same problem elsewhere). Position persists as normalised `{fx,fy}` fractions of the free space — raw pixels saved on a big monitor would strand the pill in a small window — through the **platform storage seam** (`HearthriseStorage`, 4th consumer; the 4 pre-existing chat keys still bypass it, migrating those is a separate change). Free positioning is desktop-only (`innerWidth > 540`); mobile media queries own the pill with `!important` there. Custom position applies to the mini pill only — the expanded panel keeps its default anchor, and the toast queue side-steps it.

**Found while verifying (real pre-existing bug):** claiming the daily reward printed ~700 characters of raw `<svg>` path data as a toast. `daily-reward.js` handed `rewardText()` (built for `innerHTML`) to `notify()`, which renders with `textContent`. Always broken; the b219 toast just stopped it being small and brief enough to miss. Fixed at the call site (plain text + a real toast type — `'gold'` was never one) **and** defensively in the renderer (tags stripped; still `textContent`, never `innerHTML` — that path was the b214 stored-XSS hole).

**Also (Final Directive, files already open):** chat send button was a dingbat arrow `➤` (the project's own emoji filter flags U+27A4) → line-art SVG; `DEFAULT_CHANNELS` carried dead emoji `icon` fields unrendered since b213 → removed.

**Verify:** smoke **185/185**, 0 runtime errors, stable across 3 consecutive runs; `bump-version.sh --check` OK; `findUiOverlaps()` empty; console clean. Each new test confirmed to FAIL without its fix (disabled `toasts.js` → 6 fail; reverted toast font to 13.5px → 1 fail; re-added `🌱` → 1 fail). Browser (own server :8132, cache-busted): real toasts from combat kills / drops / daily-reward claim measured clear of both the chat pill and the bug button (column bottom 808 vs bug top 818), 16px type, 4-up stack with `x6` coalescing, queue drains without dropping, drag persists across reload, click still toggles, expanded panel triggers the side-step, mobile 375px clears the bottom nav.

**Test-harness note for the team:** the game tick runs THROUGH the suite and earlier tests leave combat active, so a real toast can land in `#notifs` mid-test. Never assert on `querySelector('#notifs .notif')` — use the new `findToast(mark)` / `findToasts(mark)` helpers. Cost me 3 flaky failures.

**Flagged, not fixed (not mine / bigger than this change):** `theme-cozy.css:3995` has an unscoped `:root .notif {...}` — the same always-true theme-leak pattern DISCOVERIES records as fixed in b216. My `body[data-theme]` rules outrank it, but the leak is still there and there are likely siblings. Art Director's call.

Did NOT bump build version / CHANGELOG (Coordinator does at integration).
### 2026-08-08 · Wave 0 — backlog #3 (sub-tab snap-back) + #4 (companion tab) · branch `worktree-agent-a5fe79b25379a4838`
Both fixed. Files: `src/legacy.js` (buildTibiaDoll), `src/styles/theme-cozy.css`, `src/features/smoke-test.js`.

**#3 root cause:** the equipment doll (Equipment | Stats | Companion sub-tabs, `buildTibiaDoll()` ~L7280) is rebuilt from scratch on every panel re-render. On the Inventory page that re-render fires from the wrapped `updateTopbar`/`addItem`/`equip`/`unequip` (i.e. every resource gain / kill while idle-training), and each rebuild hardcoded the Equipment pane `active` — snapping the player back within seconds. NOT an idle-timer bug: 7s idle on inventory = 0 rebuilds; the trigger is activity. **Fix:** persist selected pane in `window._tdPane` (same `window._*` UI-state convention as `_invFilter`/`_invMultiSelect` — no new global pattern) and restore it via `applyPane(activePane)` on build.

**#4 root cause:** the Companion sub-tab pane held ONLY the companion equip slot (a lone icon) — no companion level/XP/stats. Beside the doll, `invc-stats-col` always shows the PLAYER's Hero/Weapon-Styles/Bonuses sheet, so opening "Companion" left the player looking at their own stats. All companion progression data already exists and is exposed on window by the companions ESM module (`companionLevelFromXp`, `companionXpToReach`, `getCompanionBonus`, `COMPANIONS[id]`), rendered correctly in the Stable + profile card but never wired into the doll tab. **Fix (contained, per task):** render the equipped companion's own name/level/XP-bar/effective-bonuses/proc into the pane, reusing those existing functions. Styled with tokens, scoped `body[data-theme="hearthlight"]`. No invented fields → nothing routed to Game Designer.

**Verify:** smoke 177/177 (added 2 b218 regression tests), 0 runtime errors; `bump-version.sh --check` OK. Browser (own server :8132, cache-busted, confirmed live code): Companion + Stats sub-tabs survive real `addItem`/`updateTopbar` re-renders and a 6s wait; Companion pane shows "Fox Lv 1 · UTILITY · 0/50 XP · +1 STR +2% XP +1 gold"; console clean. Did NOT bump build version / CHANGELOG (Coordinator does at integration).

### 2026-08-08 · bootstrap
Domain seeded. No active task. Base green at `119a698`.
### 2026-08-09 · Itemization rework Phase 1 — READ-ONLY audit, Slice A (items · data · economy)

Wrote `docs/reports/itemization-audit/A-items-economy.md`. No game code touched (audit only). Grounded every claim in code — counted the table, cross-referenced recipe inputs, traced stat readers.

**Counts:** 281 items (materials 92, armour 52, food 44, weapons 30, tools 21, keys/blueprints 14, recipe-scrolls 9, seeds 9, castle 4, currency 2, jewelry 2, ammo 1, companion 1). 156 recipes (smithing 87, crafting 38, cooking 28, prayer 3). 186/281 items carry no rarity.

**Key findings:**
- **Three ITEMS definitions** — canonical `data/items.js` + TWO dead-but-DRIFTED inline copies in legacy.js (`const ITEMS@149`, `NEW_ITEMS@8694`). Buff magnitudes disagree across them (lich_soul_soup gold_find 50 vs 5, tomato_soup 10 vs 2). ESM wins at boot so the legacy values are dead, but they're a maintenance landmine.
- **34 orphan drops** with no recipe/sink still live — b222 comment claimed they were "routed to castle demand" but only 4 actually were. ~13 of them vendor at FULL `v` (not on RAW_DROPS list) = unintended gold faucet.
- **Dead stats/buffs:** `critB` (never rolled — visual crit is just dmg>=8), `spdB` (never consumed), `rareDrop` (counter only). Buff types `drop_rate`/`monster_respawn`/`damage_crit` have no engine reader → Void Banquet (2400g), Lich Soul Soup, Hunter's Feast deliver nothing or were wired years late.
- **Migration is program-blocking:** mature for SHAPE changes (v10 registry) but ZERO item-id rename/alias mechanism. Inventory/equipment/collection/market/autoActions all key on raw id; any rename/removal in the rework silently drops stacks / ghosts listings unless an alias layer ships first.
- **Schema gap:** current table is a render-payload — missing `desc`, `category`, item-level `level_req`, `source`/`drop_sources`, `passives`, upgrade linkage; `rarity` coupled to `v`. gear-tiers.js generator is the model to extend.

**Top-5 changes:** (1) one item source + id-alias/migration layer BEFORE renames; (2) delete/repurpose 34 orphans + make vendor-trash derived not hand-listed; (3) kill-or-wire dead stats/buffs; (4) extend gear-tiers generator to a full content schema, rarity decoupled from v; (5) make tier/level_req/source legible in UI + per-slot gear icons.

Handoff to synthesis: §7 (migration) is a hard blocker for the whole program; §4 (dead buffs) crosses into the combat slice.

---

## 2026-08-11 — WS0 pivot → SERVER-AUTHORITY FOUNDATION (design + schema, not applied)

Economy-containment work (market caps, forensic audit, save amnesty) was cancelled mid-task by
the Coordinator: the beta is wiped at cutover, so protecting existing data has no value. Nothing
from that brief was written. Re-scoped to the greenfield foundation design.

**Delivered (review-only, nothing applied, no version bump, no commit):**
- `docs/design/server-authority.md` — data model, intent protocol, accrual engine, logic-reuse
  findings with line refs, cutover plan, ~92 engineer-day costing.
- `supabase/migrations/2026-08-11-player-state.sql` — real tables replacing `game_saves.snapshot`.
- `supabase/migrations/2026-08-11-apply-engine.sql` — `hr_load` (client) + `hr_apply`
  (service-role only) — the single transactional commit point for Deno Edge Functions.
- `supabase/migrations/2026-08-11-market-v2.sql` — market with real escrow + seller paid at sale.

**The finding that matters most:** `processOffline()` (`legacy.js:1073`) is ALREADY the accrual
engine — it replays the same action functions the live loop uses, behind a `silent` flag, inside
`withOfflineReplay()`. The server engine is that loop with `G` swapped and the render calls
removed. That de-risks the highest-risk workstream.

**Second finding:** `hr_castle_items` (`2026-08-08-clan-seat.sql:154`) is hand-seeded "from
items.js" by comment only, with NO drift guard. Latent hole; the catalogue generator should
absorb it.

**Ordering rule handed to the Coordinator:** Phase 0 (extract shared sim core, client still
calling it, 540-suite as the equivalence proof) gates every later phase. Do not move authority
for a domain before its logic is extracted and proven.

Smoke: 540/540 green, migration guard green. No `src/` files touched.

---

## b325 follow-up — the accrual tick interval is now safe by construction (2026-08-11)

Three items from the Designer's b325 ratification, done together. No version bump, no commit.

**1. `simulateSpan`'s 1ms tickMs floor was a latent server exploit.** `ticks = floor(elapsed /
tickMs)` makes the swing interval a DIVISOR of elapsed time — at a 1ms floor a 12h absence budgets
43,200,000 ticks instead of ~18,000 (~2400x). The client call was incidentally safe (gear cannot
change while away); the accrual Edge Function is the exposure. Fixed at the primitive:
`COMBAT_BALANCE.minTickMs = 600` is now ONE constant shared by `combatTickMs()` (legacy.js:2496)
and the new `resolveTickMs(ctx)` (combat-sim.js). Finer granularity is an explicit `ctx.minTickMs`
opt-in, never a permissive default.

Measured: the real minimum `combatTickMs()` can produce today is **1689 ms** (ranged 0.88 at the
20% `spdB` cap) — sword 1920, hammer 2592, magic 2016. I floored at 600 anyway, matching
`combatTickMs()`'s own clamp, because 1689 is a function of today's `WEAPON_SPEED_MOD` data and
would become a silent PIN rather than a floor the day a faster family or a larger spd cap ships.
**A clamped-but-client-chosen 600 ms still pays 4x the honest sword rate**, so the clamp is the
second line of defence; the first is the rule now written into `docs/design/server-authority.md`
§3: the server DERIVES tickMs from server-owned equipment and never reads it from the client, and
must not spread a request body into the sim ctx (`minTickMs` would ride in the same way).

**2. AWAY-12 was a regex on source text.** It caught a literal revert and nothing else. Added
`AWAY-12b`, which measures the actual tick budget over a fixed 1h span with real gear equipped:
sword 1500 · hammer 1111 (want 1111.11) · bow 1704 (want 1704.55), ratios read off
`WEAPON_SPEED_MOD` rather than pinned. `AWAY-12c` guards the hostile-tickMs class. The regex stays
as a cheap canary.

**3. Doc drift.** `pacing-overhaul.md` A.4's "gear-independent and therefore exact" went stale at
**b245**, not b325 — `spdB` + `WEAPON_SPEED_MOD` entered the LIVE half then. Corrected to the 0%
anchor wording; the 57.2-day floor is unchanged (combat XP/hour tracks DPS, not swing count).

**Handoff to the Game Designer** — recorded in `pacing-overhaul.md` §A.7b, not actioned:
`spdB` sits OUTSIDE the additive +52% permanent fuse (independently clamped at 0.20 inside
`combatTickMs()`), so the true permanent combat ceiling is `+52% XP x 1.25 rate` and since b325 it
pays 24h/day. Only `leather_boots` (.02) grants it today, so live impact is ~2% — but a real
speed-gear ladder breaks A.4's "cannot get below five weeks". Also: `atkB` is a dead stat at 99
(accuracy clamps at 0.95 with a bronze sword vs tier 6), making sword the worst endgame family.

**Debt paid:** the 600ms swing floor was a bare literal inside `combatTickMs()`; it is a named
balance constant now. **Debt noted, not paid:** the 0.20 `spdB` cap is still a bare literal in
`legacy.js` and belongs in `COMBAT_BALANCE` beside it — it is a Designer-owned value, so I left it.

Smoke: **571/571 green**, 0 runtime errors (569 + the two new guards).

---

## 2026-08-13 · b333 · The fix that could not reach its player (build-watch)

**Problem, from production.** b331/b332 are live; user `b94fa8c0…` was still emitting ~350 HTTP
401/hour two days later with a `game_saves` row stale for 2 days 40 minutes. Receiving a client-side
fix requires a reload they are not doing. There was **no build-version detection anywhere** —
`location.reload()` only behind explicit user actions, and the SW's `skipWaiting()`/`clients.claim()`
only helps the NEXT navigation. For an idle game a tab open for days is the intended way to play, so
"ships" and "arrives" are separate events with an unbounded gap: a structural hole under every client
fix we will ever ship.

**Shape.** `src/net/build-watch.js` — pure decision (`decideBuildUpdate`, `decideBuildPoll`,
`parseDeployedBuild`, `nextPollBackoffMs`) separated from fetching and DOM. 15-min poll while
visible; hidden tabs never poll; `visibilitychange → visible` re-checks (60s throttle) because the
returning player is the one about to act. Two severities: a dismissible bottom-centre card, and —
when `HearthriseSync.getAuthGate().dead` — escalation composed **into** the b331 sheet from outside.
Nothing reloads without a click; the copy never claims the progress is saved, because in that state
saving is what is failing.

**`src/net/{sync,auth}.js` untouched.** `getAuthGate()` was already exported, and
`showAuthExpiredGate()` already returns the existing element — so escalation composes with the b331
sheet without one line of churn in code that just shipped.

**Two things a mutation caught that review did not:**
1. The dismissal latch was **dead code** — `promptedFor` masked `dismissedFor`, so removing the
   dismissal changed nothing observable. Fixed by making the two facts distinct: only a dismissal is
   permanent; a card that vanished unacknowledged (DOM re-render) goes back up.
2. A per-poll `?bw=<ts>` cache-buster would have been a **slow Cache Storage leak** — the SW
   (legacy.js b111) treats every same-origin `.js` as shell and `caches.put()`s each distinct URL,
   so 96 permanent entries/day/tab. Dropped it: `no-store` bypasses the HTTP cache and the SW's
   shell strategy is network-first anyway. Guarded by a test that two polls hit the same URL.

**Limitation, stated.** This cannot rescue tabs already open on b332 and earlier — they have no copy
of it. It closes the hole from b333 forward. A server-pushed variant (realtime broadcast) would be
strictly better and rests on exactly the connection that is dead in this failure mode.

Smoke: **609/609**, 0 runtime errors (602 + 7). Ten mutations, each RED on the intended test.

---

## 2026-08-15 · b343 · Removing a rule the player could not parse — without removing its tests

**Ruling (Tyler, verbatim).** *"I think we just needed to make it a quest and get rid of the
license shit it's way too confusing. The marks that sell auto complete basically make it desirable
to do afk combat anyway."* He could not parse his own UI; round two wipes all 20 beta players to
hour one, so they meet the word with less context than he had. That is a usability finding and it
is decisive.

**What the gate actually was.** b341 shipped `src/core/licence.js` — a precondition asked once,
before `simulateSpan`, that declined a whole combat absence under 100 hand-landed kills. b342 built
five surfaces to explain it. Three facts settled the removal:

1. **It was a second lock on a door that was never open.** `TRAITS.auto_eat` is the real gate:
   `auto-actions.js` eats nothing without the trait, so an unattended fight ends in ~60 seconds. The
   trait costs 100 Bounty Marks and marks come from bounties played by hand. The economy already
   enforced "learn combat attended".
2. **The P0 it shipped for was an HONESTY bug, not a balance bug** — a new character died ~60s into
   an 8h absence and the card reported a normal base-rate night. That fix (`died` / `diedAfterMs` /
   `diedTo` on the receipt) is independent of any gate and survives untouched.
3. **`supabase/functions/hr-accrue` never adopted it** — zero references. The gate was client-only,
   i.e. decorative against the save-editing it was never meant to stop. Confirmed by the Edge payload
   hash being byte-identical after deleting the module (`65f0e8ed297f71b5…` before and after).

**The engineering lessons worth keeping.**

- **A rename of a quest id is a SAVE MIGRATION.** `field_licence → hundred_kills` looks like a data
  edit; it is not. `ensureRetentionState` merges by id, so renaming without moving the saves that
  hold it leaves the retired LABEL on screen AND seeds the new id fresh — a 1,500 XP re-grant to
  every player who had already finished it. `QUEST_ID_RENAMES` + `migrateQuestIds()` renames in
  place, carries `done`/`progress`, and dedupes (two rows under one id complete twice and PAY twice).
  Gated behind a `some()` pre-check so the hot path allocates nothing.
- **A predicate that three surfaces answer must be ONE function.** The gate's one genuine virtue was
  that every surface asked `licence.check()`. Replacing it with per-surface `hasTrait && foodSlot`
  copies would have rebuilt the drift. `awayFightSustains()` is that one function, published on
  window only because `features/combat-render.js` needs it.
- **Removing a state-dependent surface removes machinery you forget about.** b342's boss cards
  needed a third paint watermark (`lastLicOk`) and a once-a-second predicate call purely so the card
  would notice a player crossing the gate mid-session. Gone with the branch.
- **A mutation that "escapes" is usually telling you the test is aimed at the wrong thing.** Two
  did. (a) Parking the offline watermark did not fail my budget test — because `saveLocal` pins
  `offlineBudget.at` to `lastSeen` on every visible save, so `claimOfflineMs` is not the only writer.
  I re-aimed the mutation at the per-absence cap and wrote the masking into the test's comment rather
  than leaving an assertion that claims more than it proves. (b) The rename-dedupe carry-over was
  unreachable from my fixture until I built a save holding BOTH ids — and only in the order where
  the FRESH row is met first. Defensive code nothing exercises is debt, not safety.
- **Removing a gate makes previously-unreachable code paths reachable, and they may be wrong.**
  Measured in the browser: a new character's first away card printed
  `0m on the Boss of the Day (+100% drops)` — the featured line was gated on `featuredMs > 0` while
  `fmtSpanShort` floors to minutes. Unreachable while the span was declined; now the FIRST card a new
  player sees. Fixed to `>= 60000`, the same one-minute slack the death line uses.

**The word guard.** `b343-1` asserts /licen[cs]e/i appears in no player-facing copy via three passes
— authored tables (`QUEST_DEFS`, FTUE steps, `TRAITS`), BOTH branches of every state-dependent
renderer (away card x4 receipts, activity bar x2, boss cards x2, monster preview x2), and all 16
rendered panels including `title` attributes. Deliberately NOT a source scan: comments and test names
must be free to record WHY the thing was removed, and deleting that record is how it comes back.

**Verification.** 681/681 x 3 runs, 0 runtime errors, 0 console errors. 18 mutations, each RED on the
named test. Runtime-verified in a real browser: zero hits sweeping all 16 tabs + quests modal +
monster preview; the away card reads *"8h away — your camp was quiet. You died to Green Dragon 2s in
— the remaining 7h 59m paid nothing."* with a Train-a-skill CTA.

---

## b348 — THE SWITCH-ON TEST: half a seam, and the two lists that could not see each other

**The task.** Tyler ran the first real switch-on test and it failed in minutes: started woodcutting,
left, came back to a stopped run and (he reported) the daily-login panel again.

**What I measured before touching anything.** Three harnesses, each more faithful than the last:
the smoke-harness flag; a plain reload; and finally **no harness flag at all** (the account gate
opened by a planted session), which is the only configuration where the b260 4-second resume
watchdog actually runs — it is disabled under `__HR_TEST_HARNESS__`, so every previous
investigation of this path had been looking at a client Tyler does not have.

  * **Symptom 1 reproduced exactly.** `startSkill` put ZERO requests on the wire; `player_state`
    stayed `idle`/version 0. Cause: b347 wired four COMBAT declaration sites; the next merge widened
    `PAYABLE_KINDS` to include `gather`, `SETTABLE_KINDS` grew from it *by derivation*, and no client
    site was ever added. Nothing was wrong on either side.
  * **Symptom 2 did NOT reproduce, and the brief's hypothesis is falsified by the server's own
    records.** `version 0` + `0 player_intents` means `hr_apply` never ran, so no `accrued:true`
    envelope ever came back, so `applyEnvelopeState` never executed — it cannot have clobbered
    anything. Nothing in the accrue/record/activity path writes `G.dailyReward`; the claim persists
    to the local save and survives a reload; and the daily modal has exactly one auto-opener
    (`autoBoot`, once per page load, early-returns when not claimable). **Therefore the panel
    returning requires `lastClaimDay` to have been rolled back — i.e. a page reload with a stale
    save, of which `auth.js pullAndMaybeRestore` → `applyCloudOverlay` + `location.reload()` is the
    only candidate in this flow.** Reported as an open question with the one measurement that would
    settle it, rather than a fix aimed at a mechanism I could not demonstrate.

**The engineering lessons worth keeping.**

- **Derivation removes the second LIST, not the second SIDE.** `SETTABLE_KINDS = ['idle',
  ...PAYABLE_KINDS]` is good design and it is *why* this shipped broken: the widening happened in a
  file no client author reads, with no client-side diff to review. Any derived server allowlist a
  client must mirror needs a mechanical link, or the derivation hides the change from review.
- **One guard could not cover it.** "Nobody wrote the call site" and "the call site exists and is
  unreachable" are different failures. Node guard (lists ≡, call sites exist, catalogues ≡) +
  browser guard (iterate the client list, drive a REAL gesture, assert the bytes). Chain:
  *server ≡ client* ∧ *client ⇒ gesture on the wire*.
- **`idle` is two sentences that are byte-identical.** "You stopped and I know" vs "I was never
  told". Every character starts idle, so obeying idle as authority ends the run of every player whose
  save predates the seam. The client has to track which of its OWN declarations were acknowledged;
  an unacknowledged idle is a cue to DECLARE, not to stop. This generalises to every future intent
  that reconciles a client pointer against a server default.
- **A spy placed one level too high deletes the mechanism it is testing.** My first "one gesture is
  one intent" test spied `window.declareActivity` — which is where the quiet counter lives — so it
  recorded calls the real seam suppresses and failed on a bug that was not there. Moved to
  `HearthriseActivity.declare`, one level below the counter and above the kill switch.
- **A fixture that starts from the state where the bug cannot happen proves nothing.** The same test
  started every gesture from IDLE, so the activity mutex's cross-stop had nothing to stop, and the
  mutation that removes the quiet wrapper left the suite GREEN. Rewritten so each gesture
  *interrupts the other kind* — which is what a player does — and the mutation now goes red.
- **A latch's lifetime is a design decision.** The one-re-assertion-per-pointer bound was leaking
  across runs. Fixing it as "the budget belongs to a RUN; `endActivityRun()` returns it on any stop"
  is both the correct semantics and the thing that made the tests isolate.
- **Finishing a seam makes previously-unreachable code reachable, and it may be wrong.** b339's
  replacement gate carried the note "today this cannot fire". It fires now, on the first tap of a
  tree, and where the ack latch is already set it replaces the character silently — taking the daily
  reward's gold with it. Flagged as a P1 handoff rather than overturned: it is a standing ruling and
  a Designer/UX call, not a systems bug.

**Verification.** 712/712 × 4 runs, 0 runtime errors, 0 console errors; `AWAY-1 PARITY` green;
`bump-version.sh --check` green at 348. 16 mutations (8 Node, 8 browser), each RED and each naming
its own fault, every one bracketed by a green control and a green restore. Tyler's exact sequence
driven end to end in a real browser on the fixed build: intent recorded, `player_state` =
`gather/oak_tree` version 1, woodcutting still running on return, daily still claimed, stop declares
`idle`, cooking declares `idle` (not silence), zero console errors.

---

## 2026-08-15 · Revalidating the parked consumable-buffs branch, and Design Ruling 3.5

**Branch `worktree-agent-a06ecbcee310aa2c7` (`98e20a1`) needed no merge: it is already an ancestor
of `main`.** `git merge-base 98e20a1 main` returns `98e20a1` itself — it landed through
`b6aaa39 → b348`, and the KNOWN GAP it shipped with (legacy's flat gather/artisan replay could pay a
buff all night and drain none) was closed afterwards by b347 and generalised by b351's
`skillSim.sliceSpan`. Nothing survived to merge, nothing was redundant to delete, and no semantic
conflict was left to resolve. **`main` is a strict superset of the branch**, so the honest work was
to re-measure the claims and pay down the one duplication Ruling 3.5 names.

**Re-measured on merged main, in pure core (no browser, no legacy), exact numbers:**

| claim | combat (`simulateSpan`) | gather (`simulateSkillSpan`) |
|---|---|---|
| 10-min buff over an 8h night | `buffPaidMs` **600,000 ms**, expired + pruned | **600,000 ms**, expired + pruned |
| that night's work | 12,000 ticks | **6,005** actions vs a **6,000** control (**+0.0833%**) |
| **the 12× shape** — 300,000 ms buff, 3,600,000 ms absence | pays **300,000 ms** = **1.0000×** | **300,000 ms** = **1.0000×** |
| drain-is-not-a-nerf — 60-min buff, 15-min absence | spends **900,000 ms**, 2,700,000 left | spends **900,000 ms**, 2,700,000 left |

6,005 is the branch's own "honest" figure reproduced exactly; the pre-b347 flat loop produced 6,250.
**Both halves of Tyler's rule hold together** — buffs pay AND drain on all three away callers — and
the 1.0000× ratio is the number that says the pay-without-drain mint (12.0000×) is gone.
Existing coverage was already sufficient and was NOT duplicated: AWAY-5 measures the 12× shape on
combat (a 300,000 ms buff against a 3,600,000 ms absence), AWAY-16 on gather/artisan, AWAY-23 on the
over-cap window. The forfeited-tail drain lives OUTSIDE the branch arms in `processOffline`, so
AWAY-23 covers gather's capped night by construction; a gather-flavoured copy would have asserted
the same line twice.

**Ruling 3.5 — `blessed` had FOUR authors, not one.** The ruling named `combat-sim.js`'s literal;
b350/b351 had since copied the same `blessed: false` into `skill-sim.js` and `artisan-sim.js`'s
`emptySummary`, and `legacy.js`'s `lastOfflineSummary` carried a fourth. Each restated "blessings are
presence-gated (b227)" in its own comment. They agreed with `AWAY_SCOPE.blessing` by coincidence of
authorship. All four now read `channelApplies(CHANNEL.BLESSING, ctx)` — the resolver `buffs.js` asks
and the file `rateMult` already comes from — so the first world-boss blessing that pays away flips
one line and every receipt follows, including the Edge Function's (it imports `combat-sim.js`).
Guarded by **AWAY-24**, four mutations, each RED independently after a green control.

**Learnings.**
- **"Parked branch, needs merging" is a claim to verify, not a premise.** One `git merge-base` saved
  a whole speculative conflict resolution.
- **A duplicated constant multiplies while a branch is parked.** One `blessed: false` became four
  because b350/b351 copied `emptySummary` from a *correct* sibling. Copying a correct file is how a
  restated rule spreads — the copy gets reviewed against the original, never against the authority.
- **`Object.freeze` on the authority makes the obvious test impossible.** `AWAY_SCOPE` cannot be
  flipped at runtime, so a guard cannot mutate the table. Discriminating by *context* (`away:true`
  vs `away:false` on the same span) catches a re-hardcoded literal in both regimes without
  unfreezing anything; where there is no second context (`processOffline` is always an absence) the
  discriminator has to be structural, which is what AWAY-12 already established here.
- **Do not add a defensive fallback that cannot fire.** My first `_awayBlessed` returned `null` when
  core was missing. `processOffline` dereferences `window.HearthriseCore.away.creditWindow` a
  hundred lines earlier, so the branch was unreachable — and the only value it could have returned
  was a fifth handwritten copy of the rule. Removed; the call is unguarded, matching the stated
  convention of the `creditWindow` call above it.

**Verification.** 723/723, 0 failures, 0 runtime errors (722 baseline + AWAY-24). Edge payload guard
RED as expected — `src/core` changed, so the deployed `hr-accrue` bytes no longer match the repo
(`2673befa442f5c40…` deployed vs `788b4222fb255f75…` packed). Redeploy is the Coordinator's, not
mine; no push, no deploy, no migration.

## 2026-08-16 · b354 · Two small client features, and the one I nearly built twice as expensive

**Task.** (1) Sell auto-eat (100 Bounty Marks, Tyler 2026-08-09) in the Bounty Shop, where the marks
are. (2) Move the Build button on every building-upgrade panel above the fold.

**1 — the offer.** The instruction was "add the row in the SOURCE the generator reads and
regenerate". I did exactly that first: a `{trait:'auto_eat'}` row in `legacy.js` BOUNTY_SHOP,
`spendMarks` delegating to `buyTrait`, `gen-shops.mjs` mapping a delegating row to `trait:auto_eat`,
both generated files regenerated. It worked, 735/735 in-page — and the **Edge payload guard went
RED**: `src/data/shops.js` is bundled into the deployed `hr-accrue` payload, so a shop-table change
of any size requires a production redeploy. Measured, not assumed: HEAD packs to `295c0c62…`, which
is exactly what production reports.

That is the cost that made me look at the design again, and the design was wrong on its own terms:
`bounty.auto_eat` and `trait.auto_eat` would be **two offer ids for one purchase** — same price, same
currency, same unlock — which is a second thing to bookkeep once-per-character the day marks get a
server home, and a permanently-refused `namespace_unsupported:trait` row in `hr_unlock_offers` until
then. The generated catalogue's unit is the purchase, not the button.

Shipped instead: `bountyShopOffers()` — the board's own upgrades **plus every trait priced in
marks**, composed at render. One authored offer, two storefronts. The catalogue, both generated
migrations and the Edge payload are byte-identical to HEAD; no redeploy, no migration, nothing
staged. It also scales by data: the next marks-priced trait appears on that screen by existing, and
a test asserts that rule rather than that row.

**Bounty purchases are still 100% client-side** — `spendMarks` moves `G.bountyHunter.marks` locally,
and `marks` has no server column at all (`catalogue.js` refuses every marks-priced offer by name).
Nothing here made that better or worse; it is the same debt, now with one more thing priced in it.

**2 — the Build button.** The cause was structural, not cosmetic: `actions` was the LAST section of a
descriptor whose earlier sections are a flavour note, a bonus list and a five-rung ladder, all inside
`.hr-room-body`, which is the element that scrolls. Fixed in the **shared seam** rather than in two
callers: a descriptor marks one control `pin: true`, `RoomModal` hoists it out of the body into a bar
between the header and the scroll container, with its `costs` chips. Both pillars adopt it by adding
a flag (homestead Build/Upgrade — pinned even when disabled, because "here is what is short" is the
answer the player came for; castle Commission and Raise the hold). Any future consumer of the seam
gets it free, and `hoistPin` is pure and returns a new section list, so `roomDescriptor` stays the
one answer to "what controls exist" while the renderer owns "where they are drawn".

**Learnings.**
- **A guard that fails on a correct change is telling you the change costs more than you thought.**
  The Edge payload guard did not find a bug in my row; it priced it. A redeploy of the engine that
  owns every progression value, to sell an offer the server refuses by name, is a bad trade — and it
  was only visible because that guard was made un-skippable after the b343 incident.
- **"Add it to the source the generator reads" is right for a NEW thing and wrong for a SECOND
  STOREFRONT.**
- **Pin the disabled control too.** The pre-fix screen's real failure was a player opening a room and
  seeing nothing actionable; a Build button reading "Missing 500 gold" at the top answers that, and
  one hidden below three sections does not.
- Mutation-proven, each RED alone after a green control: build bar removed → the b354 DOM test only;
  composition removed → the b354 offer test only; `spendMarks` charging before delegating (the
  double-debit) → the offer test, on the exact 137→37 arm.

**Verification.** 735/735, 0 failures, 0 runtime errors, **three consecutive runs**, every infra
guard green including Edge payload parity. Runtime-verified in Chromium at 1280×820 and at 922×423
(paione's landscape phone): Build fully in the viewport with the body genuinely scrolling under it,
console clean, Auto-Eat at the top of the Bounty Shop at 100 marks. No new persistent state, so
nothing to migrate. No push, no version bump, no deploy, no migration.


---

## 2026-08-16 - THE MONSTER ROSTER WAVE (b356) - branch `worktree-agent-a50a3e6ac6538c778`

**Purpose.** Land the Tyler-approved 81-monster roster + 11-class taxonomy as DATA, ship the
`MONSTER_ALIAS` prerequisite first, and update every consumer. **31 -> 111 monsters, 2 -> 14 bosses,
6 families -> 11 classes.** Smoke **752/752, 0 runtime errors, three consecutive runs** (was 736).

**The four architectural decisions, and why.**

1. **The CLASS carries the weakness; a monster overrides AT MOST ONE AXIS.** `src/data/monster-classes.js`
   is the whole taxonomy. Adding a monster is `cls:'undead'` and nothing else; a class-wide balance
   change is one row, not 112 edits. `overrideAxisOf()` + `auditRoster()` make "a monster with two
   overrides is rejected in review" mean *the test run rejects it*. 19 of 111 monsters override, all
   single-axis.
2. **The profile is MATERIALISED onto the row, not resolved at read time** (`applyClassProfiles`,
   idempotent + pure, called once at the bottom of `monsters.js`). Twelve live consumers read
   `monster.weaponWeak` as a plain field and two are shared with the Edge Function. A resolver-only
   design would have meant touching all twelve AND leaving a permanent trap where any new reader that
   forgets the resolver silently sees `undefined` and disables the weakness. This way the class table
   stays the single authoring point and the row stays a plain, fully-specified object.
3. **The tier curve is a TABLE, and it is measured, not invented.** `TIER_BANDS` is the literal
   min/max of every stat of the 31 originals, per tier, reproduced by a one-liner in the file's own
   header. All 80 new monsters were placed inside those bands by archetype. `auditRoster` fails the
   build on a stat outside its band - so a future content drop cannot flatten the pacing curve, which
   is the thing that actually breaks at 10x content.
4. **Portrait paths became a MANIFEST** (`src/data/monster-art.js`). A hand-written map cannot express
   "expected but not yet delivered" - only "404" or "silently missing". The manifest names all 111,
   `SHIPPED` names the 30 that exist, `wiredIconMap()` is the intersection, and the FILENAME IS
   DERIVED FROM THE ID so a mis-map is unrepresentable. `monsterArtPreflight` reconciles it against
   the filesystem in both directions.

**Debt paid down (not asked for, but it was the blocker).**
- **legacy.js's second `MONSTERS` copy is DELETED** (`const MONSTERS={}`). b342 measured 14 of 31
  entries diverging and two silently deleting a live drop. `MON-ONECOPY-1` keeps it gone.
- **`data-integrity.js`'s MONSTERS check was BLIND** - it compared a *reference* to the merged object
  against ESM, i.e. against itself. Replaced with a count captured eagerly (a number, immune to the
  merge). **The ITEMS half is still blind** - see DISCOVERIES, it is now the top debt item.
- **`remapItemIds` never walked `dropLog[mon].drops[item]`** (pre-existing since b244). Fixed.

**Ruling I made and own: DEC-NEUT-01's open item.** Retiring `neutral` deletes the x1.15
`NEUTRAL_DROP_BONUS` that 7 monsters - including the Green Dragon - were paid for opting out of the
triangle. Re-homed as an explicit per-monster `dropBonus:1.15` on exactly those 7. Nobody is worse
off, the engine loses a magic constant, and drop-rate identity becomes a data lever any monster can
carry. `MON-NEUT-1` measures all 7 at exactly 1.15 and asserts `goblin` did not acquire one.

**Files changed.** `src/data/monster-classes.js` (new), `src/data/monster-art.js` (new),
`src/data/monsters.js`, `src/legacy.js`, `src/main.js`, `src/core/combat.js`, `src/core/bounty.js`,
`src/core/botd.js`, `src/utils/data-integrity.js`, `src/features/smoke-test.js`,
`tests/run-smoke.mjs`, `supabase/migrations/2026-08-11-catalogue.generated.sql` (regenerated).
**Intentionally untouched:** `src/dungeons.js` KEY_DROPS (no live id renamed, so nothing broke;
adding sources is an economy change -> Designer), `src/data/glyphs.js` (new monsters fall through to
emoji, which is the existing last-resort fallback), `bosses.js` (Elderscale stays a raid boss - the
review book names it only to unify vocabulary, so it is NOT a 111th... it is not a MONSTERS row).

**Save migration.** No new persistent state. `MONSTER_ALIAS` ships empty-but-live (no live id was
renamed - deliberately, because the layer did not exist yet). `FAMILY_ALIAS` is NOT empty and runs on
every load: it folds `killsByFamily` so a veteran does not get a dead "Beast" row beside "Mammal".
Mythic held two monsters and an aggregate cannot be split - **ruled: fold Mythic into Demon**, which
keeps total kills exact at the cost of a small misattribution in one display-only stat.

**Performance.** `applyClassProfiles` is one O(n) pass over 111 rows at module load. No new
per-tick or per-frame work. `_monsterIcon` grew by 0 entries today (81 pending), so no new requests.

**Known limitations.** (1) The Edge Function MUST be redeployed before this ships or away combat on
the 80 new monsters pays nothing - it fails closed, so no time is confiscated, but the player earns
nothing. (2) 81 portraits are owed; they degrade to glyphs until then. (3) Collection-log completion
% drops for existing players (denominator 31 -> 111) - the accepted pre-wipe cost. (4) The element
axis is DATA now but no combat term reads it yet; that is the enchanting/elements work, sequenced
after this by Tyler's own ruling.

**Not done, per instructions:** no version bump, no push, no migration applied, no Edge deploy.

---

## b361 — "AWAY 0h" DURING LIVE PLAY, AND THE TRADE LEDGER (2026-08-16, Systems Engineer)

Two Tyler reports, one seam: **server events surfacing to the player.** Branch `agent-a8a3e731129bdbafc`.

### TASK 1 — THE SENTENCE WAS WRONG, THE MECHANICS WERE NOT

**Render sites found (all four, because "the toast" was only one of them):**
- `src/legacy.js` `applyServerEnvelope()` — the toast. **This was the reported site.**
- `src/features/home-dashboard.js` — the `While you were away` card + its `>= 0.1h` liveness gate.
- `src/legacy.js:~10755` — the welcome-back modal's row list (already keys on `_fresh` + a real span).
- `src/net/activity.js` — writes `source:'switch'`, the ONLY discriminator that existed.

**The defect.** Since b356–b360 a span settled WHILE ONLINE goes through the same envelope, the same
applier and the same `summaryFromAway` receipt as a genuine absence — by design, one payment path
(`live-settlement.md` §0). The only thing telling the two apart was `source === 'switch'`, which an
**accrue**-triggered settle never sets. So every live settle fell through to the absence branch and
claimed "Away 0h". Nothing about what is credited was wrong, or is changed.

**The signal chosen: THE CREDITED SPAN (`grantMs`), threshold 10 min. NOT `document.hidden`.**
Three reasons, in order of weight:
1. `grantMs` is **server-stated**; `document.hidden` is a client observation, and this whole module
   exists because a client observation is not authority.
2. **`document.hidden` cannot see the case that matters most.** The commonest real absence is closing
   the tab; a page that is not running never fires `visibilitychange`, so on the next boot there is no
   "was hidden" flag — only a document that has been visible since ms zero. A visibility rule would
   label an eight-hour night a "sync". That is the same bug pointed the other way, and **worse**:
   under-claiming a real night is a bigger lie than over-claiming ninety seconds.
3. It degrades honestly. A four-minute kettle break rendering "Synced — +N items" is still true;
   "Away 0h" on a live settle is not true of anything.

10 min is derived, not taste: §3.1 recommends a 90 s settle cadence, the rate gate allows 30/min, so
no legitimate settle is near it — and it is comfortably under the away card's own 0.1 h (6 min) gate,
so **the toast and the card now read the same classifier and cannot drift** (the b342 failure).
Death overrides the span, keeping b343's ruling verbatim.

**Second, structural fix:** the sentence was inline in `applyServerEnvelope`, reachable only with a
live envelope + session + server — i.e. **no test could read the string that was wrong.** It is now
`accrue.js#receiptSentence`, pure, and `SYNC-4` asserts the literal reported text.

### TASK 2 — THE TRADE LEDGER

**Data access path: an EXISTING RLS read. No new surface, nothing for Security to review.**
`2026-08-17-market-v2.sql` §2 already ships
`create policy "own sales readable" on public.market_sales for select using (auth.uid() = seller_user_id or auth.uid() = buyer_user_id)`
plus `grant select on public.market_sales to authenticated`. A plain PostgREST GET with an `or=` filter
reads exactly the caller's own rows on both sides. **The `or=` filter is bandwidth, not the boundary —
RLS is, and it holds with the filter deleted.** No RPC, no SECURITY DEFINER, no migration, no deploy.

**⚠ NO COUNTERPARTY NAME, AND THAT IS THE SERVER'S ANSWER, NOT AN OMISSION.** market-v2 carries no
denormalised name on `market_sales` (unlike `market_listings`, which keeps `seller_name`) — S17
specifically stripped this table's public read because it published both auth UUIDs and every player's
trade history. A name would need a new join/view or a definer function. The panel names the ITEM and
the GOLD and stays silent about who; `LEDGER-3` asserts no auth UUID reaches the DOM.

**Three states, and the middle one is load-bearing:** `unknown` (never read — say so) vs `ok`+empty
(genuinely no trades) vs populated. A failed read rendering "you have never traded" would be the client
asserting what it cannot know — the same absence-is-not-a-claim rule `applyEnvelopeState` follows.

### SELF-CRITIQUE THAT CHANGED THE WORK
- First draft of the sync toast duplicated the sentence logic in legacy.js. **Extracted** — an
  untestable sentence is how the bug shipped.
- First draft gave the ledger amounts a gold pill and a muted outlined pill. **Measured in a real
  browser: colour, background AND border were all overridden** by `#panel-market`'s Hearthlight sweep.
  I did not win the specificity war — direction is carried in words (`+`/`−`, "Sold"/"Bought"). Net
  new theme-fragile CSS: **zero**. Logged in CONFLICTS.md for the Art Director, with the one-line fix.
- The away card's gate now excludes `source:'switch'` receipts too. Deliberate — a switch is not an
  absence — and a behaviour change worth naming rather than burying.

### VERIFICATION
- `node tests/run-smoke.mjs` **771/771, three consecutive runs, 0 runtime errors, 0 console errors.**
  (Baseline 764; +7.) One run aborted on `ERR_MODULE_NOT_FOUND` when the shared `node_modules` was
  wiped mid-run by something outside this worktree — external, retried clean.
- **All 7 new tests mutation-proved**, 6 mutants: classifier→always-away, announce→always-true,
  salesSince→count purchases, unknown→renders-empty, goldDelta→always-net, sync→always-name-gold.
  Each turned exactly the intended tests red.
- **Runtime, real browser, real renderers:** live settle → `Synced — +13 items, +104 XP` (no "Away",
  no "+0 gold"); real night → full away receipt **+ ` · 2 listings sold · +340 gold`**; zero-value
  settle → **`null`, silent**; away card → `Your market stall: 2 listings sold · +340 gold.`; live
  settle draws NO card, an 8h night does. Console clean.
- **Layout: 4 combinations** (desktop 1440×900 + landscape phone 852×339) × (hearthlight + cozy-light).
  0 px document overflow, 0 overflowing rows even with a 1,200-qty / 342,000g row, tab selected-state
  distinguishable by border in both themes, 14.5 px floor respected. Screenshots reviewed.

### BLAST RADIUS / DEPENDENCIES
Touches the ONE receipt every welcome-back surface reads, so the classifier is deliberately additive:
every existing field keeps its meaning, `summaryFromAway` is unchanged, and every new function is pure
and fails open to the pre-b361 sentence if `HearthriseAccrual` never published. `market-history.js` is
imported eagerly (not lazily like the Supabase market backend) so its pure half exists in a build that
was never signed in; it reaches the backend through `window` at call time, so no Supabase build is a
hard dependency. Nothing in either task is consulted by a payment path.

**Save migration: NONE, by construction.** The ledger cache is module scope, never `G`. The
"since last seen" window is derived from the receipt the server already wrote
(`windowFrom`/`windowTo`, falling back to `at - awayMs`), so there is no new save field and no new
server state — a summary with its own watermark would be a second, drift-prone idea of "last here".

**Performance.** The ledger read is coalesced (one in-flight request), TTL 60 s, capped at 200 rows
server-side, and fires only from a market render or a receipt. It repaints the panel only while the
market is the active tab. No new per-tick or per-frame work.

### TECHNICAL DEBT
Paid down: one untestable inline sentence became a pure tested function; the away card and the toast
now share one classifier instead of two independently-drifting gates.
Added: none intentionally — no new persistent state, no new server surface, 3 new CSS rules (tabs
only), one new gold-site census row (declared, `false-positive`).

### KNOWN LIMITATIONS
1. **No counterparty name** — the server does not expose one (above). Not a client fix.
2. The ledger shows the last 200 rows and does not paginate. At 10× content that is a "load more",
   not a rewrite: the read already takes a `limit` and `market_sales_seller_idx (seller_user_id, at desc)`
   makes a keyset page free.
3. The away line counts **sales only**, not purchases — deliberate (a purchase was your own action),
   but it means a player who bought while away via a buy offer sees nothing. Buy offers have no server
   story at all yet (`MARKET_BUY_OFFERS` in gold-sites.js), so there is nothing to report.
4. `.mk-qty` renders ink instead of gold on the market screen in Hearthlight — **pre-existing**, found
   by this work, logged in CONFLICTS.md, Art Director's ruling.

**Not done, per instructions:** no version bump, no push, no migration, no deploy. Imports at `?v=360`.

---

## b372 — P0: THE HERO-SLOT SWITCH DUPLICATED THE CHARACTER (live FTUE finding)

**Root cause (confirmed in code, then reproduced in a real browser):** `switchSlot()` moves
`profile.activeSlot` and clears/replaces SAVE_KEY, then `switchSlotAsync` calls `location.reload()`.
The reload fires `pagehide` **while `window.G` is still the OUTGOING character**, and two listeners
write it: `legacy.js` pagehide -> `saveLocal()` (rewrites SAVE_KEY, undoing the clear) and
`net/sync.js` pagehide -> `snapshotIfDue(true,true)` (uploads it with the slot resolved LIVE, i.e.
onto the **target's** `game_saves` row). Boot then prefers the "newer" local clone over the target's
older cloud save and the next autosave cements it. Net effect per switch: one character cloned, one
character's save destroyed.

**Fix — a save QUIESCE LATCH, armed before the pointer moves, held through the reload.**
`multi-character.js` `beginQuiesce(outgoingSlot)` / `saveQuiesced()` / `quiescedOutgoingSlot()`.
`saveLocal` becomes a no-op while quiesced (the same shape as the b318 `__saveParked` gate);
`snapshotIfDue` refuses to start a new upload; `buildSnapshotRequest` addresses an already-in-flight
one to the **outgoing** slot. Nothing is lost: `switchSlotAsync` already does a synchronous
`saveLocal()` **and an awaited cloud flush** of the outgoing character before it swaps, and refuses to
swap at all if that flush times out. The latch **self-heals by age** (15s) so a reload that never
happens can never silently disable local saving.

**Second layer (the class, not the instance):** the save blob is now stamped `_saveSlot`
(`_`-prefixed -> never uploaded), and `loadLocal` **parks** (never deletes) a save stamped for a
different slot and boots as if there were no local save — cloud or fresh. Unstamped (pre-b372) saves
are never accused, so no existing player is parked on upgrade.

### LEARNINGS
- **A busy latch cleared in a promise tail cannot protect a teardown.** `_switching` is cleared in a
  `.then()` — a microtask, which runs *before* `unload`. Anything that must survive the navigation has
  to be a separate latch that the *new page* resets.
- **"Which slot is active" and "which character are these bytes" are two different questions.** Every
  cross-slot data-loss bug so far (b339, b342, b372) is the gap between them. `resolveActiveSlot()`
  answers the first; during a switch only the second is safe, which is why `ownerSlotForLiveG()` exists.
- **`switchSlot()` removes SAVE_KEY via raw `localStorage`, bypassing `HearthriseStorage`,** whose
  in-memory mirror therefore keeps a stale copy for the life of the page. Harmless today because a
  reload always follows — a real trap for any future no-reload switch. Logged as debt.
- The only way to observe the transition window from outside is a seam: `location.reload()` cannot be
  stubbed. Hence `switchSlotAsync(id, { duringTransition })`, and a browser-level guard that drives a
  REAL reload and reads what actually survived.

---

## 2026-08-23 — OPEN BETA at the front door (branch `agent-a4b1b5fffc2a6ed2a`, commit `653b0bf7`)

The invite code stops gating account creation. `src/net/account-gate.js` + `src/settings-page.js`
now put the code BELOW the credentials, optional, collapsed behind a `Have an invite code?`
disclosure; `src/beta-banner.js` copy switched. Suite **1003/1003** (999 + 4 new guards).

### HANDOFF (also in CONFLICTS.md)
The SERVER gate (`2026-08-23-beta-invite-gate.sql`) is untouched — `supabase/**` was out of lane.
Until it comes off, a codeless signup is refused. **Switch the server gate off FIRST, then ship
this build**; the old client always sends a code, so it survives a relaxed gate, while the reverse
order costs signups. The transitional copy exists either way.

### LEARNINGS
- **`null` vs `{}` vs `{invite_code:''}` is the whole change.** `auth.js signUp()` takes a
  no-metadata branch on a falsy third argument, so ONLY `null` produces a GoTrue body with no `data`
  key and therefore `raw_user_meta_data->>'invite_code'` = SQL NULL. `{invite_code:''}` satisfies
  every DOM assertion a test could write and still reaches the gate as a blank string. Proven by
  mutation: re-planting the old literal escapes the markup checks and is caught only by reading what
  left the client.
- **Removing a required field is not the same as making it optional.** A visible field labelled
  "Invite code" reads as a closed door regardless of the word "optional" beside it — which is why
  this is a disclosure and not an un-`required` input.
- **Making a pre-check conditional matters as much as making the field optional.** Left
  unconditional, `validateInvite('')` POSTs `p_code:''`, the RPC refuses it, and the NORMAL signup
  dies on a check for a thing it deliberately does not carry. Mutation M3 reproduces exactly that.
- **One opaque server error can have two causes, and only the client knows which.** GoTrue answers a
  refusing trigger with "Database error saving new user" whether or not a code was presented, so
  `humaniseAuthError` now takes `hadCode`. Translating without it blames the player for our rollout.
- **A guard whose premise the product retires should be AMENDED, not deleted.**
  `tests/beta-invite-gate.mjs` kept its whole server half (gate is AFTER INSERT, exactly-once, fails
  closed) and only re-pointed its client half. A gate that is switched off but still installed is one
  migration from being switched back on.
- Debt paid: the front door's Discord URL was written twice; it is now `DISCORD_INVITE` +
  `discordLink()`. Debt added: none. New seams `_wire` / `_humaniseAuthError` exist because the
  wall's markup was testable and its BEHAVIOUR was not.

---

## 2026-08-29 — b492 · KILL-GOAL XP: the phantom `combat` skill that never paid (security S7)
**Branch** `fix/kill-goal-xp-hitpoints` (worktree `worktrees/kill-goal-xp`, rebased onto `dce57d2f`)
**Commit** `aca6088f`

### THE DEFECT (pre-existing, live, invisible)
`hr_goal_rewards` priced the XP of `kill_any` / `kill_more` / `wk_kills` as skill id `'combat'`.
`combat` is not an `hr_skills` row — the table carries attack/strength/defense/hitpoints/ranged/
magic/prayer, and "combat level" is DERIVED from them. `hr_claim_goal`'s mint planner filters with
`exists (select 1 from hr_skills where skill_id = v_k)`, so all three grants went into `skipped_xp`
from the day the RPC shipped: **the XP component of every kill goal in the game has never been paid**,
while the quest modal went on printing it as part of the price. Client-side, `addXp('combat')`
mirrored the mistake and invented a phantom `G.skills.combat` that no settle ever confirmed.

### WHY IT SURVIVED — the lesson worth keeping
It was **documented**. §8 of `2026-08-23-modal-goal-claims.sql` raised a `NOTICE` naming it at apply
time, and `tests/modal-goal-claim.mjs` carried it in a `PHANTOM_XP_SKILL` exemption map with an owner
attached. Both were honest and both were useless: a notice in an apply log nobody reads is not a
control, and a declared defect keeps the build green by construction. **An exemption map with an
entry in it is a defect the team has agreed to keep.** Four builds, every player, silently short-paid.

### THE FIX (Designer ruling, final)
XP lands in **hitpoints**, RETUNED not translated: kill_any 50→**100**, kill_more 200→**300**,
wk_kills **1000** held. Gold/gems/targets/counters untouched. `hitpoints` is a real `hr_skills` row
AND a server-accrued skill (`skill-authority.js ALWAYS_COMBAT_XP_SKILLS`), so the credit lands in the
record the absolute envelope reconciles — it cannot evaporate on the next settle, which is the whole
reason a period reward is credited server-side.

### ANTI-MINT (hard rule, recorded)
**No conversion of any existing `G.skills.combat` into hitpoints, anywhere.** That number was never
server-authored; folding it in would mint RANKED XP (hitpoints feeds combat level and the
leaderboards) out of a client artefact. `2026-08-17-cutover-import.sql` already drops the key by name
and `tests/cutover-import.mjs` C7/C8 assert both that it never reaches `player_skills` and that the
drop is REPORTED. The only surviving reads were in `smoke-test.js` (save/restore scaffolding) and are
now gone. Ceiling for the record: **400 HP XP/day + 1,000/week**, structural (catalogue + once-guard).

### THE CLASS-KILL (three nets, all mutation-proven)
1. §GATE(b) promoted `raise notice` → `raise exception` on BOTH probes (xp-vs-`hr_skills`,
   items-vs-`hr_items`). An authored reward naming a non-skill/non-item now **fails the apply**.
2. `PHANTOM_XP_SKILL` **deleted**. New `C14b` grades every catalogued xp key against the **rebuilt
   `hr_skills` table** (a different source from the client's `SKILLS_DEF`, which BIND-PAY uses), with
   **no exemption list**. Two new mutations: `phantom_xp_skill_at_apply` (the database must refuse)
   and `phantom_xp_skill_past_the_gate` (the repo must still refuse with the database gate softened
   back to a notice — the exact configuration the defect lived in).
3. In-page `b224` asserts the claim MOVES `G.skills.hitpoints` by ≥ the authored 300 and never writes
   `G.skills.combat`. Mutation-proven: reverting the client row to `{combat:200}` turns the suite red
   with *"claiming a kill goal paid 0 hitpoints XP"*.

### THE ONE CARVE-OUT I DID NOT CLOSE (deliberate, named)
The items probe keeps exactly one exemption: `gold_500`/`small_bones`, the **open b464 repo⟷prod
drift** — and that row also fixtures §GATE(e) and C9 as the empty-reward case. Closing it means
fixing the row AND re-pointing two fixtures at a synthetic goal: a separate change with a separate
owner. So the carve-out is **staleness-checked** — if the row stops naming the phantom, GATE(b)
raises telling you to delete the exemption. It cannot outlive the drift it exists for.

### PRODUCTION DISCIPLINE
`2026-08-23-modal-goal-claims.sql` is **NOT re-applied** — it owns the table wholesale
(`delete` + refill) and would silently revert the live gold_500 hand-patch. The prod change is
`supabase/migrations/2026-09-01-kill-goal-xp-hitpoints.sql`: REVIEW ONLY, three rows, `xp` column
only, fail-closed on drift, idempotent (accepts the ruled shape so a repo rebuild still replays),
self-verifying (re-runs `hr_claim_goal`'s own `hr_skills` filter and asserts gold/gems did not move).
Registered in `tests/schema-apply-order.json` §order with a full note.

### LEARNINGS
- **A `raise notice` is documentation, not a gate.** If the condition is "this must never be
  authored", the only honest verb is `raise exception`. Everything else is a comment with a
  transaction id.
- **The side that SPENDS a catalogue is the side that must grade it.** Checking reward xp keys against
  the client's `SKILLS_DEF` only proved two client-side copies agree. `hr_claim_goal` spends
  `hr_skills`, so C14b reads `hr_skills` out of the rebuilt database. Two independent sources, either
  can catch the other.
- **A skipped component is safe for the server and unsafe for the player.** `skipped_xp` protects the
  economy and silently short-pays a price the modal already quoted. "The RPC handles it safely" was
  true and irrelevant.
- **Rule now recorded in three places so the two XP patterns cannot drift:** XP the CLIENT pays for
  something it OBSERVED IN THE MOMENT may style-route (`completeQuest` → `killXpRoute` — correct,
  left alone); XP the SERVER grants for a PERIOD objective names a CONSTANT skill id, because no
  style exists at claim time and the server may neither invent one nor trust a client-supplied one.
- Debt paid: one exemption map deleted, two `raise notice`s promoted to gates, a phantom's last two
  client reads removed. Debt added: one staleness-checked carve-out (the pre-existing b464 drift),
  and `b224` now also restores `G.playerMaxHp` because a REAL skill can level where the phantom could
  not.

### TEST RESULT (final, post-rebase onto `dce57d2f`, quiet machine)
`passed 1071/1071 · failed 0 · runtime errors 0 — All green` (exit 0; 1071 not 1070 because main's
session-tally integration added one test). Two earlier post-rebase attempts died at exit 127 mid-run
under concurrent-agent load (3 node.exe at 620MB/1.1GB/815MB + 27 chrome.exe) and flagged
`auth-resilience` + `icon-boot-order`; **both pass in the clean run**, confirming the documented
parallel-suite flake rather than a regression. Mutation proof of the new in-page assert: reverting the
client row to `{combat:200}` gives `1069/1070 failed 1` on exactly
*"claiming a kill goal paid 0 hitpoints XP, but the reward line promises 300."*

### HANDOFF
- **Coordinator** — apply `supabase/migrations/2026-09-01-kill-goal-xp-hitpoints.sql` to production
  via the Management API. It is fail-closed: if prod has drifted it raises `... has DRIFTED ...` and
  changes nothing. Client bump required (`src/legacy.js` changed).
- **Art Director (P4, pre-existing)** — `rewardSummaryHTML` (legacy.js ~20094) prints the RAW skill id
  in the modal's reward line (`300 hitpoints xp`) while `rewardSummary` (the claim toast) resolves it
  through `_rsSkill` → `SKILLS_DEF.name` (`300 Hitpoints XP`). Not introduced here — it printed
  `200 combat xp` before — but it is now the only place the fixed reward reads wrong. Fixing it
  changes rendered text on every goal row, so it belongs to a visual-gated pass, not this one.
## b492 — the property TIER is derived from the server rung, not residue alone (branch `fix/property-tier-derive`, commit `2b588db1`)

**Two live reports, ONE root** (Paione, 2026-08-29): "hire a worker and it disappears" +
"the problem with the planting in farm". Both are the same integer coming back 0.

### What was actually wrong
`G.homestead.tier` is a **RESIDUE** field — a self-only bag the server stores verbatim and
derives no authority from. Six systems read it through one function (`getTier`): farm-plot
count, worker slots, room prerequisites, offline-cap hours, the castle XP capstone, and the
next-upgrade price. When a residue save was lost — the rpc-gate window froze
`client_state_put` for five builds — the tier fell back to 0 and **nothing re-derived it**
from the rung the player had paid for. The server had `property:homestead = 1` and
`worker_hire = 1`; the client showed Wanderer's Camp, 2 plots and `Workers 1/0` beside a
worker the server owned.

### The rung was already on the wire
`hr_state_of` projects **every permanent `player_progress` row** in the top-level `progress`
array (permanent rows, `period_key = ''`, are read unfiltered). So the fix is **client-only**:
no migration, no server change, no security review. `src/net/property-record.js` is the read
side — the exact analogue of `rooms-record.js`, which already shapes `room:<id>` rows out of
that same array.

### Learnings worth keeping
- **A residue field that GATES capability is a bug waiting for a lost save.** Residue is the
  right home for "what have I already been shown"; it is the wrong sole home for "what have I
  bought". The test for a residue field is now: *if this value vanished, would the player lose
  an ability?* If yes it needs a server-derived floor. `heroSlotsUnlocked`, `unlockedRecipes`,
  `entitlements`, `ownedThemes`, `ownedCosmetics` and `renown.claimed` all deserve the same
  question — several already have server rows nobody reads. **This is a class, not a bug.**
- **max(server, residue) — never server-only.** `progress` is capped at 1000 rows with a
  `progress_truncated` flag, and a build predating a projection sends no array at all. Under
  server-only, every one of those DEMOTES a castle owner to a bedroll — the same bug from the
  other side, hitting players whose residue was fine. Absence is not a claim.
- **Separate OBSERVE from REPAIR and the ordering hazard disappears.** `notePropertyUnlocks`
  only ratchets a module cache, so it is safe to call from any path at any point in boot;
  `healPropertyTier` repairs at the READ. A heal written into G at envelope time would have
  been clobbered by the residue hydrate that follows it in `settle()` — the exact race class
  that produced this bug's neighbours all week. Repair-at-read cannot lose that race, and
  because `homestead` is residue the raised value uploads itself on the next save.
- **The idle-boot class is now three deep** (inventory b46x, crew b477, property b492). Any
  state hydrated ONLY from `applyEnvelopeState` is lost on an idle boot, because hr-accrue
  answers `{accrued:false}` and that function never runs. **Anything hydrated from an envelope
  needs a call site on the boot `hr_load` path too.** Worth a guard that enumerates them.
- **Two rows, two independent heals.** The crew cap is floored by `worker_hire` as well as by
  the tier, so a truncated `progress` that drops either row still heals the crew.
- **Found while there:** `getTier()` was unclamped, so a garbage residue tier made
  `TIERS[n].plots` a TypeError that would take the House *and* the farm down (the farm asks for
  the plot cap every render). Latent since b201; closed by clamping at the one read.

### Verification
Suite **1074/1074, 0 failures, 0 runtime errors** (clean-HEAD baseline 1070/1070 — exactly +4).
**Mutation-proven:** reverting ONLY the read site in `homestead.js` (module and observers left
in place) turns all four b492 tests red with the right diagnostics. Runtime proof in a real
booted client: House card goes Wanderer's Camp / 2 plots / `Workers 1/0` → Hearthside Homestead
/ 4 plots / `Workers 1/1`, the farm goes 2 tiles → 4 plantable, Kitchen + Garden unlock while
the Forge stays correctly locked, residue patch carries `{tier:1}` so the heal survives reload.
0 page errors. Desktop 1440x900 + mobile-landscape 922x423 both read clean.

---

## b497 · The attended auto-eat gate — the fix I was asked for was the bug (2026-08-30)

**Branch `fix/attended-eat-intent-gate` off `cb97ae17`. Zero behavioural change, on purpose.**

Asked to make `noteItemConsumed` always send the `eat` intent for an ATTENDED auto-eat, with
`inOfflineReplay()` excluding away — on the premise (from
`2026-09-04-auto-eat-at-creation.sql`'s header) that "the server's sim only eats during AWAY
accrual", so lane A's universal `auto_eat_enabled = true` would silence the intent and leave free
food.

**The premise is false.** Full reasoning in `CONFLICTS.md` (2026-08-30). The one line worth carrying
forward:

> `src/net/accrue.js decideSettle`: `if (!st.visible) return { settle: false, reason: 'hidden' }`

The 90-second settle loop runs **only while the tab is visible**. The periodic settle is therefore
an *attended-only* loop — away time is settled on return by a different trigger — and
`computeAccrual` has no away or presence input at all: `fx.autoEat()` is gated on `autoEatEnabled`
alone. Measured: a fresh 10-HP goblin fight with the flag on eats 2 meals over 60 s, 3 over 90 s,
each with the matching negative item delta; with it off the same window pays **0 kills and dies**.

So the settle already debits the attended meal, and the requested change is a double debit — item
loss, strictly worse than the restock it was meant to fix. `EAT-RESTOCK-6` block 2 already had
teeth against it (it goes red the moment the gate is dropped).

### The lesson, generalised

**"Away" and "the server computed it" are different questions, and the codebase has one predicate
for the first and none for the second.** `inOfflineReplay()` answers "is the client replaying an
absence" — a *client-side* latch. Whether the SERVER will state a debit for a window is a property
of the character's server columns (`auto_eat_enabled`), not of the client's latch or the wall clock.
Every time those two get conflated the result is a double-count or a double-debit; the combat-XP
watermark (`combat_xp_accrued_to`) exists because of exactly the same conflation on the XP side.
When a gate reads "am I away?", ask what it actually needs to know.

### What I shipped instead

- `tests/accrual-engine.mjs` — new `attendedSettleAutoEatGuard()`: the engine eats and debits at
  `ACCRUE_MIN_MS`, 90 s and 5 min, and the flag-off control at the same spans pays 0 kills / dies.
  Mutation-proven: an "away-only" condition on `fx.autoEat` turns it red while the pre-existing
  **12-hour** parity fixtures stay green — which is precisely the hole that let the premise survive.
- `src/features/smoke-test.js` — `EAT-RESTOCK-6` block **2b**: while the server owns the debit and
  the eat is ATTENDED, the client must still record the pending-consume HOLD. Mutation-proven: a
  return before `P.noteConsumed` is caught by this assertion **and nothing else in 1091 tests**.
  ("The server owns the debit" is a statement about the intent, never about the hold — the settle is
  up to ~90 s away and every envelope in between names the pre-eat count.)
- Comment corrections in `src/legacy.js` (the seam header + `_clientOwnsAutoEatDebit`) and
  `src/net/accrue.js` (the `clientOwnsAutoEatDebit` header, whose "0 rows on production" measurement
  b497 invalidates). Comment-only: `git diff` adds no executable line to either file.

### Handoff raised

`hr_set_auto_eat` has **zero client call sites**. After b497, `auto_eat_food` is NULL server-side for
every new character, so the engine eats `bestHealingFood` (the biggest healer in the bag) while the
client honours `G.foodSlot`. Counts converge; the two sides can drain different stacks. See
CONFLICTS.md — Systems owns the wiring, Designer owns the toggle question.

**Suite: 1091/1091, failed 0, runtime errors 0.**

---

## E1 — the arrow is spent on the swing (branch `fix/ammo-consumption`, rebased onto `61d3417a`)

**Paione, 2026-08-20 (board §8 P2): "crafted arrows/ammo craft fine but are never spent in combat."**

### What was actually true before I started
Most of this was already built, and finding that out first was worth more than any code I wrote.
`src/core/ammo.js` shipped in b357 — the whole arithmetic (`ammoPerShot`, the deterministic carry,
`consumablesPerHour`, `hoursOfSupply`, `dryAtMs`, `ammoDamageMult`), PURE, tested by three browser
guards, and consumed by nothing. Its own header said so in capitals: *"`simulateTick` does NOT yet
call `spendForSwings`. That wiring is design-doc item E1."* `docs/design/consumable-economy.md`
(1,282 lines, every number produced by running the real engine) had already ruled the model, and
`src/data/slot-ladders.js` / `stonecraft.js` / `library2-items.js` had already authored 21 ammo rows
against it.

So the bug was not "nobody designed this". It was **one missing call**, deliberately deferred because
`combat-sim.js` is vendored byte-for-byte into the Edge function and the author did not want a parity
failure with two candidate causes. That deferral was correct and it cost eleven days.

### Three defects I found in the seam while wiring it
The wiring itself is two lines. The value of the commit is in what wiring it surfaced:

1. **`AMMO_STYLES` answered two questions with one table**, and `spendForSwings` gated the SPEND on
   it — so `sword: false` meant melee never spends. A Dawnsteel Whetstone (+18 strB, v 990,
   `ammoPerShot: 0.02`) was a **permanent free stat**. R5's actual words are "melee's FLOOR is free;
   melee's CEILING is paid" — two questions, and the second table (`AMMO_SPEND_STYLES`) is what makes
   the second half sayable. **Lesson worth keeping: when a boolean table gates two different
   decisions, one of them is wrong and the tests will not know.**
2. **`spendForSwings.mult` restated the fail-soft rule** as `after > 0 ? 1 : AMMO_DRY_MULT` instead of
   asking `ammoDamageMult`, so it reported 0.25 for a melee run with an empty whetstone slot — a
   family that by ruling takes no penalty at all. It reached nothing today (the fight reads
   `startMult`), which is exactly how a latent wrong answer waits for its first consumer. Now one
   expression, asked twice.
3. **The mechanic is OPT-OUT and nobody had noticed.** `ammoDamageMult` cannot tell a loaded free
   tier-1 rung from an EMPTY slot, so an archer with no ammo at all fights at full strength.
   Measured on the real catalogue at Ranged 99 with a Duskwood Bow: supplied 69 maxHit, run dry 17,
   **no ammo equipped 58**. Not equipping is 3.4x better than running dry. Left shut behind a frozen
   `AMMO_EMPTY_SLOT_IS_DRY = false` because §14 owes the Art Director an empty-quiver indicator and
   shipping the cliff before the sign turns a correct mechanic into a support ticket.

### The one architectural decision that mattered
`readAmmo` needs the weapon FAMILY, and the obvious move was a new `ctx.weaponType` at every call
site. I derived it from `state.equipment.weapon` + `ctx.items` instead, with `ctx.weaponType` kept as
an explicit override for the projection surface.

**Why:** `simulateTick` has four callers (the live tick, the away accrual, the client's away replay,
and every fixture). A required new ctx key is a key one of those four can forget, and the failure mode
of forgetting it is SILENT — `undefined` becomes `'neutral'`, `styleSpendsAmmo('neutral')` is false,
and that caller quietly spends nothing. That is *this exact bug*, re-introduced through a different
door. A derivation cannot be forgotten. The drift risk (two readings of one catalogue field) is closed
by `AMMO-E7`, which walks every weapon in `ITEMS` and asserts `weaponTypeOf` agrees with
`equipmentStats().weaponType`.

Same reasoning drove keeping the spend **ctx-blind**: nothing in `simulateTick` or `ammo.js` reads
`ctx.away`, so AWAY-1 is true of the quiver for the same structural reason it is true of the XP —
there is one path, not two that agree.

### Where the fight's supply state lives, and why not on `state`
First draft accumulated `state.ammoSpent` for the span tally. Wrong: on the client `state` IS `G`, so
that is a new top-level G field, which is a save-allowlist question (b462/b466 strand class) for a
number that is only ever a per-span readout. It rides the tick RESULT instead (`r.supply`) and
`simulateSpan` folds it. The only field that *does* land in G is `ammoCarry`, which genuinely is
persistent progress — and it went into `RESIDUE_FIELDS`, not `NO_SYNC`.

### The gap I could not close in one commit, stated honestly
`player_state.ammo_carry` does not exist, and adding a delta key means replacing `hr_apply` verbatim
(~2,200 lines, the `2026-08-25-workers.sql` copy). The design doc's own sequencing note is explicit —
*"E1 should land as its own commit with its own parity re-verification, not bundled"* — so the engine
ships wired through the `tool_carry` self-configuring-null idiom (null ⇒ start empty, OMIT the key)
and the SQL is a spelled-out handoff.

I tried three ways to avoid the migration and each failed for a reason worth recording:
- **Ride `tool_carry`.** Dead: `hr_apply` validates every carry key against `public.hr_skills` and
  answers `unknown_skill`, which 409s the whole night. A prefixed key does not help.
- **Ride `player_state.fight`.** Rejected: the fight is VOIDED to `{}` whenever it ends, which is
  exactly when a carry must survive, and muddling the two facts is how the next author loses one.
- **Derive the fraction statelessly** from the swing's absolute instant. Rejected: the client's tick
  grid and the server's `credit.fromMs + i*tickMs` grid are out of phase, so parity would be
  approximate — and AWAY-1 is byte-identical or it is nothing.

**Cost of the gap, measured not guessed:** an integer `ammoPerShot` is exact either way (the carry
lands on 0 after every swing), so the REPORTED BUG is fully fixed today. Only whetstones (0.02) are
under-charged, and only while attended. `AMMO-E6` asserts both halves rather than describing them.

### Verification
`node tests/accrual-engine.mjs` GREEN, including the pre-existing AWAY-1 parity fixtures (unchanged
byte-for-byte — a no-ammo loadout takes the identity path through `applyAmmoMult`) plus eight new
`AMMO-E` blocks. `core-purity`, `mutation-safety`, `combat-xp-settle-split`, `artisan-accrual`,
`worker-accrual`, `live-settlement`, `goal-counters`, `kill-daily-credit`, `auto-eat-authority`,
`combat-style` all green. `bump-version.sh --check` green at 498. `pack-edge --check` 0 problems.

**Ten mutation proofs, each caught by NAMED assertions** (harness: the new `ammoGuardProblems()`
export, so a mutation run costs no network round trip):

| # | mutation | caught by |
|---|---|---|
| M1 | the pre-E1 engine (no spend at all) | 14 assertions across E1/E2/E3/E5/E6 |
| M2 | gate the spend on `needed` (the original one-table defect) | E5 (melee never spends) |
| M3 | drop `applyAmmoMult` (spend but never weaken) | E3 ("the dry span killed the same") |
| M4 | never propose `ammo_carry` | E6 |
| M5 | `weaponTypeOf` always `'neutral'` | 16 assertions |
| M6 | `supply.startMult` -> `supply.mult` at the call site | E1b (source) |
| M7 | `startMult` hardcoded to 1 | E1b + E3 |
| M8 | server `fx.removeItem` missing | E1/E2/E3 |
| M9 | client pending-consume hold dropped | E8 |
| M10 | `ammoCarry` stranded (not in RESIDUE_FIELDS) | E8 |

Two fixture-rule bugs in my OWN tests, caught by running them (TESTING.md instance 1 is real):
- the short-stack fixture asserted "running dry did not kill me" against an UNFED character, and
  every parity fixture in that file dies — so it was asserting a property of the fixture. Fed it, and
  added the CONTROL assertion that the supplied run survives, or the dry run proves nothing.
- the fed fixture then picked its food by `heals` sort and got `void_banquet`, which is
  `foodClass: 'buff'` and which `isAutoEatable` REFUSES. The character starved and the failure
  pointed at ammo. Now the food is chosen by the engine's own `bestHealingFood`.
- and the seam fixture's `fx.removeItem` only RECORDED, so the stack never emptied and the
  "next swing is weak" assertion passed for the wrong reason. Both real sinks decrement; so does it.

**Measured behaviour, 12 h fed span, maxed ranged vs slime, Duskwood Bow + Barbed Arrows:**

| | ticks | kills | arrows spent | dryMs | weakMs | meals |
|---|---|---|---|---|---|---|
| supplied | 20,454 | 17,462 | 20,454 | null | 0 | 6 |
| 5,113 arrows (1/4 night) | 20,454 | 13,668 | 5,113 | 10,798,656 | 32,400,192 | 16 |

20,454 is exactly the figure `consumable-economy.md` §4.2 publishes for a 12 h Rapid bow, derived
independently there. `dryMs` is `5113 x 2112` to the millisecond — the closed form `dryAtMs()` quotes
before the span begins. And the meals going 6 -> 16 is §3.4's predicted second-order effect
("running dry makes you eat more") showing up unprompted in a real run.

### Debt paid / added
**Paid:** the `ammoPerShot` field stopped being inert after eleven days; `spendForSwings.mult` stopped
being a second statement of the fail-soft rule; four stale "NOTHING CONSUMES THESE YET" headers in
`src/data/*` stopped being lies.
**Added:** one owed migration (spelled out in HANDOFFS), one dormant `AMMO_EMPTY_SLOT_IS_DRY` switch,
and the E3 pointer-model gap (now a `hr_equip` SQL concern, not a client one). All three are named,
measured, and pinned by tests that go red in a readable way when they are addressed.

### Post-review: the rebase, and two checks that were about themselves

Security returned GO with four conditions; three were mine. Rebased onto `61d3417a` (b499): every
CODE file auto-merged — only the two coordination markdowns collided, both tail-append conflicts. I
read main's full `src/legacy.js` delta rather than trusting the clean merge, because the coordinator
flagged it as a possible semantic neighbour. Verdict: five hunks, all at 8657+, mine at 6164 — no
line overlap, and no semantic one either. `noteItemConsumed` is UNCHANGED, and my sink passes
`{send:false}`, which returns before any auto-eat branch, so b499's `hr_set_auto_eat` wiring cannot
reach my path. The real neighbour is `renderModal`/`maybeShowWelcome` — the streak vocabulary moved
in exactly the renderer §10's away-card copy will land in. Nothing reads my `consumed`/`dryMs` fields
yet, so it is a handoff fact, not a conflict.

**THE LESSON, AND IT REPEATED ON THIS BRANCH.** Twice now a check I had just written turned out to be
about itself:

1. the dry-run fixture asserted "running out did not kill me" against an UNFED character, where every
   fixture in that file already dies;
2. the A1 coupling scanned `src/` for a marker token — including `src/core/ammo.js`, the file that
   DEFINES the marker and documents the coupling. The "flag flipped, no indicator" mutation passed
   GREEN. An unfalsifiable check that reads like a strong one.

Both were found by MUTATING, never by reading. The generalisation I want to carry: **a guard that
searches for evidence must be told where evidence may not come from**, and the first mutation to run
is always "make the thing the guard forbids, and watch it stay green." The fix in (2) was also the
correct rule independently — `src/core` is DOM-free by construction, so an indicator cannot honestly
live there — which is the tell that the exclusion was a missing invariant rather than a patch.

Also worth keeping: **the marker name is mine, the mechanism is theirs.** A cross-discipline coupling
only becomes enforceable if one side defines a cheap anchor the other can satisfy any way it likes.
Asserting on a CSS class would have been me designing the Art Director's indicator; asserting on a
token they must carry asks for evidence of the OUTCOME and leaves the implementation alone. And it is
an IMPLICATION, not a biconditional — the UI must be allowed to land first.
