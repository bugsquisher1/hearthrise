# Security ruling — world tick: parity method, clock, §7a, flush, per-channel arm

**Reviewer:** security-engineer (veto authority) · **Date:** 2026-10-05 · **Mode:** read-only (no production writes, no applies)
**Inputs:** backend-architect production read 2026-10-05 15:20 UTC (scratchpad `world-tick-path-2026-10-05.md`);
`WORLD_TICK_DESIGN.md` §7, §7a, §11, §16.6; `SEC_WORLD_TICK_M1_2026-09-21.md` (8c gather bar);
`SEC_WORLD_TICK_M3_2026-09-22.md` (8c combat bar, the 24 h span ruling, S-14); `SEC_WORLD_TICK_TOKEN_2026-09-23.md` (R-T1, T-2, d11);
`SEC_PUSH_CHANNEL_M5_2026-09-23.md` (T4, W1–W3).

**Verified by me, read-only, production 2026-10-05:** `hr_tick_config` = enabled, shadow (one global flag), channels `{combat,gather}`,
flush 90 s, frame_push false, frame_keys `{state,skills,buffs,place}`; ownership = gather slot 2 / combat slot 1, both owned.
The two post-fix ledger rows the architect cites exist and are clean: gather `2026-09-29 16:14:10` ms 35,922,875 (9.98 h),
ticks 3118, `capped=false`, no `att`; combat `2026-09-29 16:12:35` ms 35,921,686, ticks 241, kills 79, `capped=false`, no `att`.
`net.http_request_queue` is SELECT-able by `anon` and `authenticated` (the R-T1 replay precondition; known, re-confirmed).

## Verdicts

| # | Question | Ruling |
|---|---|---|
| 1 | Server-side PROBE + shadow-chain admission toward M2/M4 parity | **YES, WITH CONDITIONS** (below). One real-return anchor per channel stays mandatory. |
| 1a | Kills EXACT (M3 8c rule 3) | **WITHDRAWN — my role's bar was wrong.** Kills are RNG-driven and resample under any decomposition; replaced by a band + direction test. Applies to the human-return 8c read as well. |
| 2 | Pre-e545713b gather intervals | **Do not count, for any field.** The clock restarts at e545713b. The 09-29 9.98 h interval qualifies as the gather **anchor**, not as a probe. |
| 3 | §7a before combat arms (M4) | **Full ABSOLUTE flip NOT required for M4. A narrower condition IS required** (no inventory push + assignment-reconcile of every stack the tick can lower). The full flip stays required before any inventory-bearing frame (M5 inventory push). |
| 4 | `flush_seconds` < 60 for M5 | **ALLOWED, floor 30 s, under five conditions** (below). Not allowed by config edit alone. |
| 5 | Per-channel arming before gather arms | **CONFIRMED REQUIRED.** `shadow = false` on today's schema would arm combat; that is a BLOCK. |

---

## 1. The probe method

### Why I accept it

The 24 h roster property I ruled on 2026-09-22 ("I will not have it relaxed") existed for one reason: past
24 h, *the comparison against the accrue ledger* manufactures a ~4× artefact, because the accrue path forfeits
the tail beyond the offline cap. A probe does not compare against the ledger. It compares the tick's
decomposition against a one-span `computeAccrual` over the same span, from the same stored input, so the
cap artefact cannot enter it. The reason for the fence does not apply to the probe; the fence itself stays
in force everywhere it still has a reason (armed mode, and every ledger pairing).

What a probe can see: the decomposition — fold, RULE-1 alignment, carry/checkpoint continuity, recovery
resumes, seed labelling, starvation. That is the class that has actually broken in production (the combat
−14.5 % tick loss was found by exactly this comparison).

What a probe **cannot** see, by construction: a defect in the tick's *input assembly*. The probe reads the
same input the tick read, so an input the tick omits, the probe also omits. The 2026-09-28 `hr_perks_of`
miss (XP −2.56 % in every interval) is the proof: a probe would have been green through it. That class is
what the **real-return anchor** is for, and why one per channel is not negotiable. F2 `hr_require_settled`
and M1f's single envelope map close the *absence-priced-at-return* half of that class by design; they do
not close "the tick forgot a read", which C1's source-derived key parity covers statically and the anchor
covers at runtime.

### Finding that changes the bar — kills are not decomposition-invariant (CONFIRMED by execution)

M3's 8c rule 3 ("`ate`, `kills`, `deaths`, `hp`, `consec_falls`: EXACT — not perturbed by a re-seed")
is **false for kills**, and therefore the architect's "kills 68/79 fails the EXACT rule" fails a rule a
correct engine also fails. `combat-sim.js:406/440` roll every swing from `ctx.rng`, and §11 gives every
window its own seed label. Measured today by instrumenting a scratch copy of
`tests/world-tick-combat-parity.mjs` (one-call span vs the 2.4 s-window chain, 10 min, repo fixtures,
unmodified engine; `ticks one/windows · kills one/windows · ate · deaths`):

| fixture | ticks | kills | ate | deaths |
|---|---|---|---|---|
| goblin grind | 250 / 250 | **179 / 171** | 0 / 0 | 0 / 0 |
| auto-eat, bag empties | **167 / 156** | **88 / 73** | 8 / 8 | 3 / 3 |
| seven falls deep | 4 / 4 | 0 / 0 | 0 / 0 | 1 / 1 |
| opens knocked out | 195 / 195 | 131 / 131 | 0 / 0 | 0 / 0 |
| bow vs rat | 284 / 284 | **219 / 214** | 0 / 0 | 0 / 0 |
| three falls, pulls back | **22 / 21** | 1 / 1 | 0 / 0 | 3 / 3 |
| nine combat inputs | **87 / 90** | **19 / 25** | 8 / 8 | 1 / 1 |

Two facts follow. (a) With **zero deaths, ticks are exact** in every fixture — time accounting carries no
RNG, so it can be held exact. (b) Once a death lands, the knockout clock starts at an RNG-decided instant,
so ticks and kills both resample. The production combat interval had 9 deaths; −14.5 % ticks is larger than
anything above but one interval cannot distinguish a per-resume alignment defect from noise. The probe set
can, and that is what the direction test below is for. COMBAT-PARITY-RC stays warranted.

### Acceptance bar (per character, per channel, every number read per probe AND in aggregate — never across characters)

**Eligibility of a probe span** — discard (and count the discard) if any of: a real settle, set-activity,
or any accepted intent bumped `player_state.version` inside the span; any shadow-row gap or overlap inside
the span (8b break); shadow coverage < 99 % of the span; the span crosses a pack-hash change. If more than
**20 %** of probes in the read are discarded, the read is not readable — report, do not average.

**Payload pin.** Every counted probe and the anchor must be on the live `payload_sha256` being armed.
Any edge deploy restarts the probe count. (Anchor carry-over: see the anchor rule.)

**GATHER (M2):**
- **≥ 6 eligible probes totalling ≥ 24 h**, on the current payload.
- Per probe: `|Δticks| ≤ 1` and `|Δqty| ≤` one action's yield (the P-G2 tail), `xp` and `gold` consistent with
  that same ≤ 1 action. Anything beyond one action interval in one probe is a defect, not noise.
- Aggregate: `qty`, `gold`, `xp` within **±0.5 %** (M1's "expected" becomes the bar, because the probe
  removes every confound M1's ±2 % ceiling was absorbing). Any RNG-bearing gather drop: band ±10 % aggregate
  and no starvation (a row reached ≥ 2× by the one-span set and 0× by the windows set is a defect).

**COMBAT (M4):**
- **≥ 12 eligible probes totalling ≥ 48 h**, on the current payload. Twelve, not six: combat is a resampled
  stream at ~8 kills/h on this cohort, and the direction test needs the count.
- **Non-vacuity:** the probe set must contain ≥ 2 probes with `ate > 0` and ≥ 2 with `deaths > 0`
  (M3's cohort rule: a span that never eats or dies proves nothing about the inputs that broke).
- **Probes with zero deaths on both sides: `ticks` EXACT.**
- `deaths`, `ate`: per probe `|Δ| ≤ 1`; aggregate within ±10 %; a zero on one side against non-zero on the
  other in any probe is a defect.
- `ticks` (death-bearing probes), `kills`, `gold`, `xp`: aggregate within **±10 %**.
- **Direction test (the real bar):** for each of `ticks`, `kills`, `gold`, `xp`, count probes with Δ < 0
  and Δ > 0 (ties excluded); **red if either side has ≤ 2** of ≥ 12 (two-sided sign test, p ≈ 0.04).
  A per-resume alignment loss is one-signed; noise is not.
- Starvation: as gather, over all rare rows (`LUCKY_IDS`).
- `recovering_until` parseable on every death-bearing row (unchanged from M3).

**Calibration and teeth (before the first production read counts):** the probe comparator ships with
(i) a fixture arm running the same comparator over a **4 h** span on the C6 fixtures, all green against this
bar, and (ii) `--mutate` proofs that the comparator goes **red** under `fixedSeed`, `shiftWindow`,
`noAutoEat`, `freeHeal`, `skipFoodDebit`, and a new **recovery-resume misalignment** mutant (the
COMBAT-PARITY-RC hypothesis). A comparator that has never been red is not a bar.

**Anchor (one per channel, mandatory):** a real return, `meta.capped` not true, no `meta.att`, ≥ 99 %
shadow coverage, ≥ 4 h paid, read with the existing span-fenced 8c pairing. Gather: ±2 % qty/gold/xp
(M1 bar). Combat: ±10 % ticks/kills/gold/xp, deaths/ate `|Δ| ≤ 1`, and **`ate > 0`** in the interval
(the 09-29 combat interval had ate 0/0 and could not anchor even after the fix). An anchor stays valid
across a later deploy only if the pack diff touches none of that channel's input-assembly or engine
files (`envelope.js`, the engine-input block of `index.ts`, `tick-shadow.js`, `tick-contract.js`,
`tick-gather.js`/`tick-combat.js`, `accrual.js`, any `src/core/**` they import) — shown by file diff in
the GO request; otherwise retake it.

### What the probe must NOT be allowed to write or do

1. **Nothing but its own rows.** One insert per probe into `hr_tick_shadow` flagged `probe = true` (or a
   dedicated `hr_tick_probe` table). No write to `player_state` (no `accrued_to`, no `shadow_accrued_to`,
   no `version`), `player_ledger`, inventory/bank, `hr_tick_ownership`, `hr_kill_credit_log`, bestiary,
   leaderboards, `hr_rejections`, or the frame/Realtime path. Executed self-check: a probe run moves zero
   rows in each of those (row counts and `player_state` hash before/after), with a mutation that makes
   the probe advance `shadow_accrued_to` going red.
2. **It never advances or reseeds the shadow chain.** It reads the stored checkpoint at `t0` and computes;
   the next real window must be byte-identical with and without the probe having run (test).
3. **Probe rows are excluded by predicate from 8a/8b/8c and from every armed-path read** — pinned by a
   `world-tick-ledger-meta`-style executed query, so a probe row can never be summed as a settled window.
4. **Input is the snapshot at `t0`, not a re-read at `t1`**, and the seed label is the tick's own label for
   the span start. No client value enters (none can: the tick reads `hr_state_of`).
5. It may run in armed mode only as a read-only canary under rules 1–3; it never feeds a settle.

### Shadow-chain admission — conditions

- **SHADOW channels only.** Once a channel is armed (Q5), admission for that channel is the raw
  `ps.accrued_to > now() − c_max_span` fence, unchanged. Self-check: with the channel armed, a character
  whose raw `accrued_to` is 25 h old and whose `shadow_accrued_to = now()` gets **zero** roster rows
  (the S-14 arm, kept), and a mutation that lets the shadow branch apply to an armed channel goes red.
- **Cohort only:** characters with an `owned` ownership row; never "every active character".
- **Bounded:** shadow-chain admission ends 7 days after the raw `accrued_to` (a forgotten QA character
  does not shadow forever) — and the end is **loud**: a `hr_tick_cron_log` outcome or counter, not a
  silent drop (S-14's finding, which this admission otherwise fixes).
- **Ledger pairing keeps its fence.** No shadow row older than raw-settle + 24 h may ever be summed into
  an 8c ledger pairing; those rows are probe material only.

---

## 2. Clock for gather

**Restart at e545713b, all fields.** Three reasons. (1) Parity is a property of a payload, and e545713b
changed the tick's input assembly (`hr_perks_of`); whether no live perk touches yield is an assertion I
will not take for an arm. (2) Keeping the seven "clean" pre-fix intervals after removing the defective one
is post-hoc selection on the outcome. (3) Under the probe method the restart costs ~24 h. Pre-fix
intervals may be cited as supporting evidence; they count toward nothing.
The 09-29 16:14 interval (9.98 h, verified clean above) **is the gather anchor** if the PROBE/TICK-MODE
deploy leaves the gather input/engine files untouched (anchor rule); otherwise retake one.

---

## 3. §7a and the combat arm

§7a's hazard is a `Math.max` merge fold meeting a server value that went **down**. Arming combat makes the
server lower stacks the client does not know about: auto-eat food and ammo debited by the tick. Increases
are display-safe under `Math.max` (the server value wins); decreases are not — a woken or backgrounded tab
merges a poll envelope and keeps the food the tick ate, which is "client shows X, server refuses" and a
P1 class-kill (CLAUDE.md §6). Blast radius is self-only (market/listing paths read server inventory),
so this is a correctness gate, not an economy hole — but it is still a gate.

**Required before M4 (in place of the full flip):**
1. `frame_keys` contains no inventory/bank/consumable key while combat is armed, enforced by a CHECK or
   self-check, not by convention.
2. **TICK-DEBIT-RECEIPT becomes mandatory:** every stack the tick can lower (food, ammo, any consumable the
   combat engine spends) is reconciled by **assignment** from the envelope, never `Math.max`, on every
   envelope. Shipped with both-path tests (CLAUDE.md §4): ATTENDED (tab open, tick settles while
   backgrounded, poll envelope arrives → server count shown) and AWAY (cold boot after a tick debit), each
   failing without the fix.
3. The attended fence (§16.6) applied and verified — it is what keeps the tick off a live-attended tab.

The full ABSOLUTE flip plus the monotonic frame gate remain required, unchanged, before **any**
inventory-bearing frame is pushed (M5 inventory) — §7a stands for that.

---

## 4. `flush_seconds` below 60

R-T1 below 60 s is bounded, not zero: a verbatim replay (any `anon`/`authenticated` reader of
`net.http_request_queue`, ≤ 60 s) can settle one window early — never twice (watermark CAS), never for an
unleased character, never backwards, and total value stays a function of elapsed time. The seed is mixed
with a server secret (§11), so an early boundary is a blind resample, not a choosable re-roll. I accept that
residual for M5 at **≥ 30 s** on these conditions:

1. **Per-call clamps re-audited.** At 30 s the tick makes 3× the `hr_apply` calls per character-day. Every
   clamp that bounds tick value (progress ops, hearthfind, death rows, any per-apply cap) must be shown to
   be time-proportional or ledger/per-day based — a per-call clamp is a per-day ceiling that triples. List
   them with file/line in the M5 GO request.
2. **X-5 re-executed at the chosen value**: replay settles at most one early window, no double pay, time
   conserved — `world-tick-double-pay.mjs` and the token tests green at that flush, `--mutate` red with the
   fence bypassed.
3. The `d11` NOTICE is acknowledged in the flip runbook, and R-T1's text is restated at the chosen value.
4. Reliability re-signs the row/ledger arithmetic (M-6) and Realtime volume at the chosen flush under the
   budget freeze (T4: no spend).
5. **Gather arm first, at 90 s.** The flush change is its own config write with its own read-back, never
   bundled with an arm; parity is not re-read on a flush change mid-measurement (a flush change restarts
   the probe count, like a deploy).

---

## 5. Per-channel arming

**Required.** Today `shadow` is one global flag; `shadow = false` arms combat, which is blocked on M3, the
§16.6 fence and §7a. `array_remove(channels, 'combat')` to work around it is refused too: it stops the
combat shadow that M3/M4 are measuring. TICK-MODE must provide:

1. One authority: `armed_channels text[]` (or equivalent) replacing, not shadowing, the global flag's
   meaning — two flags that can disagree are the browser-vs-server class pointed at the operator.
2. CHECK `armed_channels <@ channels`, NULL-element-safe (S-5: a NULL element passes a naive CHECK).
3. The fence reads the per-channel mode under the same lock as the lease; the shadow-chain admission keys
   on the per-channel mode.
4. Executed self-check: with gather armed and combat not, a combat window writes **zero** `player_ledger`
   rows and gather writes exactly one per settled window; mutation (combat treated as armed) goes red.
5. A one-statement master kill that de-arms every channel (today's switch (4)) still exists and is tested.

---

## Residual risks accepted

Probe parity is blind to input-assembly defects between anchors (bounded by C1 source-derived key parity
and the payload-pinned anchor). R-T1 replay at flush < 60 s shifts a boundary by ≤ 60 s (blind resample, no
value). Pre-flip, the client may still show a stale *higher* non-consumable stack from a client-rolled
attended drop — pre-existing, self-only, not widened by the tick. **Trigger to re-open:** a probe green
while an anchor is red; any deploy touching input assembly without a fresh anchor; flush < 30 s; any
inventory key added to `frame_keys` before the flip.
