# SEC — the absence is priced at the state that exists at return (2026-09-28)

Security-engineer verdict. Read-only review of `origin/set/b559` (a97ce24). No DB access from this
sandbox; the production numbers are the Coordinator's 2026-09-28 read-only status pass, quoted.

## Verdict

| | |
|---|---|
| **Severity** | **P1.** Value moves wrongly: the economy and the ranked XP surfaces get pay priced from a window's *future* state. It is repeatable, the API can reach it, and an honest client trips it (the production row below). |
| **Why not P0** | No dupe, no forged value, no transfer between players. Output is bounded by the 12 h cap, per-key buff caps and the speed fuse. |
| **Beta-blocker?** | The literal wording of §1 ("a forged client value cannot cross") is **not** violated, because every input is a real server value. The *purpose* of §1 **is** violated: server-owned ranked and market values are computed from the wrong window. **NO-GO** on any leaderboard or season reward payout, and on arming world-tick PAY for any cohort that keeps the old return settle, until F1+F2 land. The live build does not have to be pulled. |
| **Worse than reported** | The tool finding is real. It is not the largest case, though. **Consumable buffs eaten at return are paid over the whole absence** (§3.2). That is a pure mint, costs 12–2,400 gold, and repeats on every return. |
| **Fix** | **Settle-before-mutate.** Every write that moves a priceable input first closes the open window at the old state: edge `collectsFirst` (F1), backed by a DB `settle_first` precondition (F2). Buff segments also carry their start instant (F3). The world tick's per-window pricing is the correct contract. |

## 1. What the settle reads, and when (Q1)

The return settle is the `accrue` verb. It reads the character **as it is at the instant of the request**
and prices the entire credit window with it:

* `supabase/functions/hr-accrue/index.ts:657-667` — `hr_rate_gate`, then `hr_state_of(user,slot)` and `now()`,
  inside the request's own transaction. No state is read "as of `accrued_to`".
* `index.ts:955/964` — `hr_perks_of` (room rungs, plot buildings, property tier) is read the same way, now.
* `index.ts:1031-1045` — `computeAccrual({...engineInputsFromEnvelope(env, nowMs), perks, bestiaryKills, …})`.
* `accrual.js:1485-1500` — the window is `creditWindow({watermarkMs: payFromMs, activeSinceMs, nowMs, grantMs})`
  (`src/core/away.js:331`): the first `grantMs` after `max(accrued_to, active_since)`. **Every tick in that window
  sees the same now-state.**

Per input (the gather branch is `accrueGather`, `accrual.js:3477`; combat is `accrual.js:1535-1790`; artisan is `accrual.js:3827`):

| Input | Where the engine reads it | Moved before the settle by | Moves pre-settle? |
|---|---|---|---|
| **Gather tool tier** (speed, double-yield, xpB) | the bag, not equipment: `bestTool(skill, inventory, equipment)` `src/core/tools.js:18-31`, `gatherIntervalMs` `src/core/skill-sim.js:193-199`, bag copy `accrual.js:3506-3514` | `claim_reward` (`intents.js:419`), `shop_buy` (403), `market_buy`/`market_cancel` (466-467), `quartermaster_buy` (566), `dungeon_settle` (552), direct RPCs `hr_claim_quest/goal/daily/milestone/rank` | **YES** (the production case) |
| **Consumable buffs** | `buffQueueFromServer(inp.buffs, credit.fromMs)` `accrual.js:1678/3534/3894` → `remainingAtMs = until − fromMs` `src/core/buffs.js:122-128,151-164` | `eat` (`intents.js:532`, `collectsFirst:false`) → `hr_apply buff_apply`, `until = start + D` (`2026-09-13-consumable-buffs.sql:58-59`, segments with **no stored start**, `2026-09-13-buff-segments.sql:17-19`) | **YES** |
| **Permanent perks** (room rung, toolshed/watchtower, castle) | `bonusFor(inp.perks, …)` `accrual.js:1787/3501/3850`, `src/core/perks.js:75-86` | `unlock_buy` (`intents.js:435`, commit in `hr_unlock_buy`, which does not touch `accrued_to`) | **YES** |
| **Auto-eat settings** | `engineInputsFromEnvelope` `envelope.js:224-228` | `hr_set_auto_eat` (client-direct, `2026-08-15-auto-eat.sql:199,327`), trait purchase | **YES** |
| **Food / ammo / artisan materials** (supply) | the live bag the sim drains: `accrual.js:1680-1737` (ammo, auto-eat), artisan bag bound (`index.ts` ladder note) | every item-granting verb above, plus `market_buy` | **YES** (supply, not rate) |
| Charm / trophy rank | `bestiaryKills` → `charmIndex`/`trophyIndex` `accrual.js:1554-1563` | `hr_credit_kills` (client-direct) | yes, small |
| Weapon / armour / ammo slot | `equipment` | `equip`, **`collectsFirst:true`** (`intents.js:498`, rationale 469-497: "fight naked all night, equip BiS, settle") | closed |
| Enchant | `enchant` | `enchant`, **`collectsFirst:true`** (`intents.js:512`) | closed |
| Combat style / activity | pointer | `set_activity`, **`collectsFirst:true`** (384); style re-pricing is pinned by `tests/combat-style.mjs:165` | closed |
| Combat XP levels | `skills` | `hr_credit_combat_xp`, refused `settle_first` when `accrued_to` > 180 s stale (`2026-09-09-combat-xp-settle-first.sql:62,189`) | closed |
| Gather level | `levelOf` gates only, no speed term (`src/core/progression.js:85`) | — | no effect |
| Clan perks, companion bonus | **not priced by the server** (`perks.js:425-438`) | — | n/a |

**The order of operations.** The server enforces **none**. Each verb is a separate request that reads
`hr_state_of` at its own `now()` (`index.ts:339-392` dispatch). Nothing requires the first request after an
absence to be the `accrue`. On the client, the only settle-first latch is `awaySettleClosed`
(`src/net/accrue.js:526-531`), and it gates the combat-XP credit alone. Claims, eats and purchases are not held
behind it. Exploitation needs no client at all: a JWT and `curl` can post `claim_reward` / `eat` / `market_buy`
and then post `accrue` whenever convenient. A second tab or a reload race only adds more ways to do the same
thing. Delaying the settle costs nothing, because Ruling 2 credits the *first* 12 h after leaving whenever the
settle eventually fires. **The world tick does not protect anyone yet.** In SHADOW it advances only
`shadow_accrued_to` and never `player_state.accrued_to` (`2026-09-23-world-tick-shadow-state-chain.sql` header).

**Production evidence (Coordinator status pass, quoted).** Gather interval 2026-09-26 17:45Z → 2026-09-27
01:00:19Z (7.25 h). At 00:58:34Z quest `road_forge` was claimed. It grants `iron_pickaxe`
(`src/data/goal-catalogue.js:107`). At 01:00:19Z the settle priced all 7.25 h at 11.52 s, 1.04 ore and 40 XP.
The tick priced 17:45→00:58 at 12.80 s and flipped only at `player_state.version` 2048
(`tick-contract.js:376-382` re-seeds from truth when the version moves). The two answers differ by **+13.5 %
ore**. This matches the model: no tool → iron is `speedClamp(0.10)` = ×0.90 interval and `toolDouble` 0.04,
so 1/0.9 × 1.04 = **+15.6 %** theoretical. The other six usable intervals agree within −0.47 %, so the engines
themselves are at parity. The defect is the *input time*, not the arithmetic.

## 2. Exploit value (Q2)

Worst case per return, over the 12 h cap (`ACCRUE_MAX_SPAN_MS` 24 h, clamped by `hr_offline_cap_ms`):

| Movable input | Worst-case gain per return | Repeatable? | Sev |
|---|---|---|---|
| **Consumable buffs** (eat at return) | The whole ≤12 h window runs at +1…+5 % on each buffed key: `drop_rate` +5 (Hunter's Feast, 420 g), `gold_find` +5 (Lich Soul Soup, 1,100 g), `combat_xp` +4, `all_xp` +5, `damage` +4, `damage_crit` +5, `gather_speed` +4. Types stack across keys. **The buff then still runs its full D after return**, because `until` is untouched. Combat night: ≈ +5 % drops, +5 % gold, +4–9 % XP, plus more kills from damage/crit, for ≈ 2–5 k gold. Gather night: +4.2 % ore, +9 % XP. | **Yes.** Every return, every slot, and no honest play produces the result: a 15-min food never buys 12 h. This is a pure mint, and an honest client eating right after boot triggers it by accident. | **P1** |
| **Gather tool** (claim / buy / self-market at return) | No tool → Dawnsteel (`items.js:438`, speed .35, double .14): 1/0.65 × 1.14 = **+75 % ore and XP for the night**, and up to ≈ +100 % when perks already sit at +0.20 (fuse 0.70, `pacing.js:29,34`). Iron case measured at +13.5 %. | **Yes, and it multiplies.** The tool is durable and never consumed. `hr_market_buy` refuses a self-buy only when user **and** slot match (`2026-08-17-market-v2.sql:1245`), so one tool passes between a player's 5 slots for free. Each slot relists it, returns, buys it back and settles its whole absence at the tool's rate. Only one tool is ever paid for. | **P1** |
| Permanent perk rung (`unlock_buy`) | One rung's delta over the window: +2 % toolshed / watchtower / castle `allXP`, room rungs similar. The permanent layer caps at +20 %. | One-shot per rung per slot | P2 |
| Auto-eat (`hr_set_auto_eat`) + food bought at return | Recovers the night an unfed character loses: "−63 % to −99 % of the night" (`envelope.js:224`). The food is consumed. | Yes, but it is supply *forgiveness*: bounded by food the player pays for | P2 |
| Ammo / artisan materials bought at return | A ranged or bench night that was bound by supply becomes full-length. The inputs are consumed. It pays no more than a fully-stocked player would get, but it moves time and market timing. | Yes (forgiveness) | P2 |
| Charm / trophy rank via `hr_credit_kills` | One charm-rank step of drop multiplier over the window | Rare | P3 |

"Equip the good tool, return, settle, swap back" does **not** apply to weapons or armour, because `equip` collects
first. It **does** apply to the gather tool, because the tool is resolved from the *bag*. "Alternate two
characters" is the self-market loop in the tool row.

## 3. The contract (Q3)

**The world tick's per-window pricing is correct.** Each window is priced at the state that existed during it.
That is what live play produces, and AWAY-1 means away pays what attended play would have paid. The tick
already behaves this way: it reads `hr_state_of` on each fire (`tick.js:765`, window ≤ one flush, `tick.js:800`)
and drops its carried shadow when the version moves (`tick-contract.js:376-382`). The return settle must
produce the same answer, meaning each movable input takes its value at `accrued_to` for the whole
`[accrued_to, now)`.

### 3.1 Why settle-before-mutate and not a stored snapshot

The brief proposes snapshotting the priceable inputs into the watermark row. I reviewed it and rejected it as
the primary fix:

* The priceable inputs include **the bag** (tools, food, ammo, artisan materials). A snapshot would have to
  hold the bag, or a hand-derived "pricing basis" for each engine. That is a second representation of the
  character that the engine would read instead of `hr_state_of`: AWAY-12's "second path" in data form, and a
  source of drift.
* `hr_tick_ownership.shadow_state` cannot serve as the basis. It is shadow-only, covers only the ticked cohort,
  and is discarded on any version move by design.
* Settle-before-mutate gives the **same answer with no new state**. If no priceable input can change while an
  unpaid window is open, then "state now" equals "state at `accrued_to`" for the whole window. This is the
  mechanism `equip`, `enchant` and `set_activity` already use (`intents.js:469-512`), and the one
  `2026-09-09-combat-xp-settle-first.sql` already uses at the DB layer.
* It converges with the tick. Once a cohort is ticked in PAY mode, `accrued_to` is never more than one flush
  (90 s) stale, so the precondition passes without an extra settle.

### 3.2 The buff defect is structural as well as a timing issue

A buff segment stores `{type, magnitude, until}` and **no start** (`buff-segments.sql:17-19`). The engine
therefore cannot tell a segment eaten at the last instant of the window from one that was running at its
start. The rule "a Feast eaten on the way out pays the first ten minutes" (`buffs.js:34-37`) is only right for
a buff that already existed at `fromMs`. F1 closes the timing. F3 makes the engine correct no matter which
caller runs first.

## 4. The fix (Q4)

| # | Lane | Change | Files |
|---|---|---|---|
| **F1** | edge (touches money, so it needs its own Security review; no DB change) | Flip `collectsFirst:true` on every verb that can add a priceable input: `eat`, `claim_reward`, `shop_buy`, `market_buy`, `market_cancel`, `quartermaster_buy`, `unlock_buy`, `dungeon_settle` (also `vendor_sell` / `market_list`, so that removing a tool pays the old rate and does not under-pay). Each module calls `collectCurrentWindow` (`set-activity.js:805`) and commits at the version the collect returns. The fail-closed `COLLECT_REQUIRED` stubs in `unlock-buy.js:174` and `dungeon-settle.js:106` become the real collect. **Party fence:** `party-fence.js:87` refuses every `collectsFirst` verb with `party_hunt_running`. Flipping these rows would block shopping during a party hunt, so the fence needs a second class. *Stamping* verbs are refused. *Settle-before-mutate* verbs skip the collect, because `hr_party_tick_settle` already prices partied members per window. | `supabase/functions/hr-accrue/{intents,eat,claim-reward,shop-buy,market,quartermaster-buy,unlock-buy,dungeon-settle,party-fence}.js` |
| **F2** | C | `2026-09-28-settle-before-mutate.sql`: new `hr_require_settled(p_user,p_slot)`. When `active_kind` is payable and `now() − accrued_to > 180 s` (`c_settle_first_ms`, mirrored from 2026-09-09), it raises `settle_first` and writes nothing. It is called at the head of every client-direct RPC that moves a priceable input: `hr_claim_quest/goal/daily/milestone/rank`, `hr_set_auto_eat`, `hr_credit_kills`, `hr_farm_harvest` (only if a crop is a food), and the edge-committed `hr_unlock_buy`, `hr_market_buy/cancel`, `hr_quartermaster_buy`, `hr_dungeon_settle`. `hr_apply` gets a one-anchor patch: a delta that does **not** carry `accrued_to`/`activity`/`equip`/`enchant` but does carry `buff_apply` or a positive `items` entry is refused `settle_first` on a stale row. F1's ordering then holds as a DB property even against a stale or compromised engine. The settle itself carries `accrued_to` and is exempt. | migration + a `hr_client_rpc_baseline` re-check (`hr_assert_grant_hygiene`) + a live-hash re-seed by the Coordinator |
| **F3** | C + core | `2026-09-28-buff-segment-from.sql`: `buff_apply` stores `from` (the segment start it already computes: `max(N, queued-behind until)`, buff-segments step 2) and `hr_state_of` projects it. `buffQueueFromServer` (`src/core/buffs.js:151`) treats a segment as not started before `from`: time before `from` is not drained and not paid. There is one function for the client and the server, so AWAY-1 is untouched and AWAY-12 is not forked. A row without `from` reads as `from = until − BUFF_MAX_UNTIL_MS` clamped to `≥ fromMs` (it pays at most 1 h, never the whole night). | migration + `src/core/buffs.js` + the `?v=` bump |

Residue after F1+F2: at most 180 s at the new state, only through a client-direct RPC on an unticked character.
That is P3 and below what the combat-XP rule already accepts. The client needs no change for correctness: a 409
`settle_first` is answered by `awaitSettleRaceClear()` and a retry (`accrue.js:545-565`). The boot should also
stop showing claim/shop controls until the first settle answers (the same latch, widened), so honest players
never see the refusal.

**Cost at scale:** one extra pooled transaction per purchase, eat or claim, and only when the window is
non-trivial. `collectCurrentWindow` already declines to write a sub-minute window that produced nothing. That
volume is lower than the `equip` path, which has shipped since b366.

### 4.1 Proofs required before GO

**§4 self-checks** (executed SQL, measured, in F2/F3):
(a) stale row + `hr_claim_quest` → raises `settle_first`; inventory, gold and ledger unchanged.
(b) fresh row (< 180 s) → admitted.
(c) `hr_apply` with a non-stamping `items:+1` / `buff_apply` delta on a stale row → refused; the same delta with `accrued_to` → admitted.
(d) `buff_apply` writes `from` = the computed segment start, including the queued-behind case.
(e) `hr_assert_grant_hygiene` is unchanged.
(f) `accrued_to` is unmoved across a refused call.

**Tests.** A new `tests/absence-priced-at-return.mjs` (PGlite + the edge modules, in the shape of
`tests/activity-intent.mjs`), at production shape (gather, 12.80 s base, `accrued_to = now − 7.25 h`):

* **R1:** `claim_reward road_forge` then `accrue` gives an ore/XP delta **byte-identical** to `accrue` then `claim_reward`.
* **R2:** `eat hunters_feast` then settle a combat night gives drops equal to settle-then-eat. The live buff keeps its full D afterwards.
* **R3:** a cross-slot `market_buy` of a tool, then `accrue`, pays the no-tool rate.
* **R4 (a mid-absence swap must count):** in the `tests/world-tick-parity.mjs` harness, a real version bump grants the tool at t = 3 h. Windows before it pay 12.80 s and windows after it pay 11.52 s, and the fold differs from the no-swap fold by the modelled +15.6 % × (4.25 / 7.25). A new claim, **P5**, requires the accrue settle and the tick fold to agree within ±0.5 % on this fixture.
* **R5:** a client-direct RPC on a stale row → `settle_first`, nothing written.
* **R6** (in `tests/buff-queue.mjs`): a segment with `from = nowMs` pays nothing in `[fromMs, nowMs)`.

**Mutation proofs:**
* `--mutate flipCollect` (the `claim_reward` row back to `false`) turns R1 red.
* `--mutate noFrom` (`from` ignored) turns R2 and R6 red.
* `--mutate staleMs12h` turns R5 red.
* `tests/activity-intent.mjs` A19 is extended to the new rows.

**Detection (read-only, for the Coordinator):** in `player_ledger`, find `claim`/`eat`/`shop`/`market` rows
followed within 10 min by an `accrue` with `ms > 3,600,000` for the same (user, slot). The count, and the
settle-vs-tick delta on those intervals, sizes what has already been paid. Remediation is a design decision,
not an admin grant (§2: player state is never fabricated).

## 5. Sequencing

1. **F1 first, alone.** It is edge-only and closes the whole API-reachable surface for `eat` and every edge verb, including all of the buff mint. It follows lane A's clock but still needs a Security review of the diff, because it touches money.
2. **F2 and F3 go through lane C**, with the apply before the client/core half ships.
3. Arming world-tick PAY for gather is **not** blocked by this finding. For the ticked cohort it closes the class structurally. The **accrue-settle path must not be relied on for ranked payouts** until F1 and F2 are live.

*security-engineer, 2026-09-28. Read-only; nothing applied, deployed or written to production.*
