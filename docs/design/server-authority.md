# Server Authority — the foundation design

**Status:** design for review. Nothing here has been applied. No client code has been changed.
**Authority:** `CLAUDE.md` → "Server authority (locked 2026-08-10)". Where anything in this
document conflicts with that section, that section wins.
**Companion schema files:**
`supabase/migrations/2026-08-11-player-state.sql`,
`supabase/migrations/2026-08-11-apply-engine.sql`,
`supabase/migrations/2026-08-11-market-v2.sql`.

---

## 0. The three constraints that shape everything

1. **Multiplayer-only, online-only.** A live connection is required to play. There is no
   offline-capable client and no local simulation to reconcile.
2. **No client-authored values, ever.** The client sends intents and renders what comes back.
3. **The beta is wiped at cutover.** No migration, no amnesty, no back-compat.

Constraint 1 is the one that makes this tractable. The hard part of a server-authoritative
idle game is normally the *dual simulation*: the client keeps playing while disconnected, the
server has its own view, and someone has to reconcile two divergent histories. That problem is
now deleted by decree. There is exactly one simulation, it runs on the server, and the client
is a renderer with a prediction layer.

Constraint 3 deletes the second-hardest part. We are not hardening a live economy; we are
building the right one next to it and throwing the old one away.

**What "offline progression" means now:** the server stores the active activity plus a server
timestamp. On return, the server computes elapsed × server-known level/gear/caps and grants the
result. The player's device is never consulted about anything, including what time it is.

---

## 1. The server data model

Full DDL is in `supabase/migrations/2026-08-11-player-state.sql`. The shape and the reasoning:

| Table | Holds | Why not a jsonb blob |
|---|---|---|
| `player_state` | gold, gems, hearth_tokens, hp/max_hp, the activity pointer, bank_cap, `version` | It is the row every write locks; it must be small and constrained |
| `player_skills` | `(skill_id, xp)` — **XP only, never level** | Level is derived by `hr_level_from_xp`; two representations of one fact drift |
| `player_inventory` | `(item_id, qty)` per row, `qty > 0`, zero rows deleted | Per-item rows give a real constraint, a real index, and make the bank cap `count(*)` instead of an honour system. Same reasoning as `clan_stores` (`2026-08-08-clan-seat.sql:261`) |
| `player_equipment` | `(equip_slot, item_id)` | Adding a slot is a data edit, not DDL |
| `player_farm` | `(plot_idx, crop_id, planted_at, watered_at)` | **No `ready` flag and no stored growth.** Readiness is derived from `now()`. A stored flag needs a cron, and a cron is a second clock |
| `player_progress` | quests, dailies, bounties, stats, collections, flags — one generic `(kind, key, period_key) → value` | One table beats six near-identical ones; `period_key` makes daily/weekly resets free |
| `player_ledger` | append-only journal of every mutation | Enforced append-only by an immutability trigger, not by convention |

**The activity pointer is the whole idle game in four columns:**
`active_kind` · `active_id` · `active_since` · `accrued_to`.
Elapsed time is *always* `now() - accrued_to`, and `collect` advances `accrued_to` **in the same
transaction that pays**. That is what makes double-collect structurally impossible rather than
defended against.

### RLS posture

Every player table gets **exactly one policy: `SELECT` where `auth.uid() = user_id`.** There is
no INSERT, UPDATE, DELETE or `for all` policy on any of them, and the table-level write grants
are additionally revoked from `authenticated`/`anon`. PostgREST will serve a read and refuse
every write with a 42501 no matter what the client sends.

This is copied straight from the pattern that already works in this codebase — the Clan Seat
tables (`2026-08-08-clan-seat.sql:356-370`) and `raid_contributions`
(`schema.sql:400-404`, where the old "own contribution claim" UPDATE policy *was* the exploit).
Each of the three new migrations ends with a `pg_policies` assertion that fails the migration if
a write policy is ever reintroduced.

### What this closes, concretely

`game_saves.snapshot` is a client-authored blob holding gold, inventory, every skill's XP,
equipment and farm state. `schema.sql:33` grants the owner `for all` on it. `G.gold = 1e12` →
autosave → done. The leaderboard view (`schema.sql:586`) reads `total_level` and `gold` straight
out of that blob, which is why CLAUDE.md save-invariant #6 documents leaderboard scores as
self-forgeable. With `hr_total_level()` derived from `player_skills`, **that limitation is
closed rather than documented.**

---

## 2. The intent protocol

The client's entire write surface is a list of named intents. Each is a single call, validated
against server state, returning the new state.

### Where each one runs, and why

Two execution environments, split along the line each is actually good at.

* **Postgres RPC (`SECURITY DEFINER`)** — for anything whose correctness is a *transaction*
  question: a race between two players, an atomic value transfer, a ledger-read budget.
  Postgres already gives us row locks, `for update skip locked`, and a real transaction. These
  intents need almost no game data, so PL/pgSQL costs us nothing.
* **Supabase Edge Function (Deno)** — for anything whose correctness is a *game rules* question:
  yields, XP, drop tables, tool bonuses, farm growth, combat resolution. These need
  `src/data/*.js`, and those files are pure ESM that import cleanly in both Node and Deno. Deno
  can import the **exact same file the browser imports**. Re-expressing 400 items, 7 tree rungs,
  60+ recipes and 40 monsters in PL/pgSQL would create a second copy of the game — and this
  codebase has already been burned by exactly that (see the `unifyObject` header at
  `src/main.js:36-50`: an ESM/legacy data double-copy that silently split the dataset and meant
  authored content never reached the engine).

| Intent | Where | Validates | Returns |
|---|---|---|---|
| `create_character(slot)` | RPC | slot free, slot ≤ 5 | new state |
| `load(slot)` | RPC (`hr_load`) | own row | full state + `version` + **server `now()`** |
| `start_activity(kind, id)` | Edge | catalogue id exists, skill level ≥ req, inputs present (artisan), monster unlocked (combat) | collects the *previous* activity first, then sets the pointer |
| `collect()` | Edge | — | accrued rewards; advances `accrued_to` |
| `stop_activity()` | Edge | — | collect + set idle |
| `craft(recipe, n)` | Edge | recipe exists, level, inputs owned | delta |
| `equip(item, slot)` / `unequip(slot)` | Edge | owned, slot legal, `reqSkill`/`reqLv` met (`legacy.js:3909 gearWieldReq`, `:3918 canWield`) | delta |
| `eat(item)` | Edge | owned, `heals` | new hp |
| `plant(plot, seed)` / `water(plot)` / `harvest(plot)` | Edge → RPC farm block | plot empty/occupied, seed owned, ready | delta; `planted_at = now()` server-side |
| `buy_shop(item, n)` / `sell_vendor(item, n)` | Edge | shop catalogue price, gold, ownership | delta |
| `market_list / market_cancel / market_buy` | **RPC** | escrow, funds, race | receipt |
| `clan_deposit / clan_withdraw / clan_contribute` | **RPC** (exists) | membership, clamps, ledger budget | as today |
| `raid_strike / raid_claim` | **RPC** (exists) | day gate, week key, claim ledger | as today |
| `claim_quest / claim_daily` | Edge | progress met, not already claimed | delta |
| `verify_iap(receipt)` | Edge (its own function, own RPC) | platform receipt | hearth_tokens |

Everything in the "exists" rows already follows this model — the Clan Seat, raids and world
events were built server-authoritative from the start. **The market and the save blob are the
only two surfaces that never got the treatment,** which is the honest scope statement.

### Return shape

Every intent returns the same envelope, so the client has one code path:

```
{ ok: true,  version, now, state, skills, inventory, equipment, farm, progress, total_level,
  events: [ … ] }          // events = what to *show* (level-ups, rare drops, burns)
{ ok: false, error: '<machine_code>', … }
```

`events` is the only new concept: the server tells the client what happened in narrative terms
so the client does not have to diff two state snapshots to know it should play a level-up
animation. Errors are machine codes (`insufficient_gold`, `not_tradeable`, `version_conflict`),
never prose — prose is the client's job and is already localised in `notify()`.

### The commit point (this is the load-bearing design decision)

An Edge Function that reads state, computes in JS, then writes back has a read-modify-write race
and no transaction around it. So **Edge Functions never write tables.** They compute a *proposed
delta* and hand it to `hr_apply()` (`2026-08-11-apply-engine.sql`), one RPC that, in one
transaction:

1. takes a per-character advisory lock,
2. refuses a stale `version` (optimistic concurrency),
3. **re-validates** every invariant the delta could break — unknown item id, resulting negative
   quantity, negative gold, bank cap, per-call clamps,
4. applies, 5. journals, 6. bumps `version`, returns the new state via `hr_load`.

So the Edge Function decides *what should happen* (needs the data files); Postgres decides
*whether it may* (needs a transaction). Neither trusts the client.

`hr_apply` is **not granted to `authenticated`** — it is service-role only, and the migration
asserts that. If the browser could call it, the browser could author its own delta and the
clamps would become the game's rules instead of its blast radius.

The clamps in step 3 are *not balance*. They are the blast radius if an Edge Function is ever
wrong or compromised, exactly as the clamps in `clan_deposit` are
(`2026-08-08-clan-seat.sql:522-534` states this explicitly). Any rejection is an incident, not a
tuning problem.

There is **no `hearth_tokens` key in the delta shape at all.** The bond is minted by one path
(IAP verification, its own RPC). "Never mintable in PvE" is expressed as an absence rather than
a promise.

---

## 3. The accrual engine

### What is stored

Only the four activity columns. No queue, no tick log, no "pending rewards" table. The activity
pointer plus the server clock is a complete description of what the player is owed.

### `collect()` — the algorithm

```
lock character (advisory) → read state
elapsed_ms = now() - accrued_to                       // server clock only
elapsed_ms = min(elapsed_ms, offline_cap_ms(state))   // cap read from server state
interval_ms = action_interval(kind, id, skills, equipment, bonuses)   // shared JS
ticks       = floor(elapsed_ms / interval_ms)
delta       = simulate(ticks, kind, id, state)        // shared JS, seeded RNG
hr_apply(slot, version, delta ∪ {accrued_to:'now'})   // pays and advances together
```

Four properties fall out of that shape:

* **Double-collect is impossible** — payment and watermark advance in one transaction.
* **A clock jump grants nothing** — `now()` is the database's clock; the client's is never read.
  This kills the entire class of exploit that CLAUDE.md save-invariant #5 currently defends
  against with a client-side watermark.
* **The cap is real** — `offline_cap_ms` is read from server state (house upgrades, premium),
  not from `G`.
* **Rates are the server's** — level, gear and bonuses come from `player_skills` /
  `player_equipment`, so a forged local level buys nothing.

**RNG.** `simulate` must be deterministic and replayable for dispute resolution, so it takes a
seed derived server-side (`hash(user_id, slot, accrued_to)`) rather than calling `Math.random()`.
The current code uses `Math.random()` throughout (`legacy.js:1613 rand`, `:2821 combatTick`,
`:2878 killMonster` drop rolls). Threading a seeded PRNG through the extracted core is a small,
mechanical change and is the single behaviour change the extraction requires.

### Farming — the wall-clock case

Farming is the only system whose progress is wall-clock rather than action-count, which makes it
both the easiest to server-own and the most obviously broken today (the client owns
`plantedAt`). No accrual loop is needed:

```
ready(plot) ⇔ now() >= planted_at + growth_ms(crop, watered_at is not null)
```

`growth_ms` already lives in exactly one pure place — `src/features/farm-progression.js`
(`HearthriseFarm.growthHours()`), **361 lines with zero DOM references**, which the tick, the
offline catch-up and every renderer already read. That module ports to Deno essentially as-is.
`plant` and `water` stamp `now()` inside `hr_apply` (see its farm block); harvest checks
readiness against `now()`. Three lines of SQL close the whole farming exploit.

### Daily caps

Every cap is read from an append-only ledger rather than a stored counter, which is the
`clan_deposit` budget pattern (`2026-08-08-clan-seat.sql:579-589`): one fewer counter to reset,
and it is auditable by construction. `player_ledger` already carries `at`, `kind` and `intent`,
so "how much did this account gain today" is one indexed query.

### §3.4 The single-source-of-truth rule for game data

**Game data is authored once, in `src/data/*.js`. Nothing else may author it.**

Two consumers, two mechanisms:

* **JS logic (client renderer + Deno Edge Functions)** imports the file directly. Zero
  duplication — literally the same bytes. Verified: `src/data/items.js` imports cleanly in Node
  today (400 items, 15 `bop`, 385 tradeable).
* **Postgres**, where the database itself must enforce a rule it cannot import JS for
  (`hr_items.tradeable` for the market allowlist, `hr_equip_slots`, the shop catalogue), gets a
  **generated** seed file. Generated, never hand-edited, by `tools/gen-catalogues.mjs`, with a
  `--check` mode wired into `tests/run-smoke.mjs` as a preflight. **Drift fails the build.**

The Clan Seat's `hr_castle_items` (`2026-08-08-clan-seat.sql:154-195`) is hand-maintained today
and has **no drift guard** — it is seeded "from `src/data/items.js`" by comment only. That is an
existing latent hole and the generator should absorb it in the same pass.

---

## 4. Logic reuse — what ports, what gets rewritten

I read the engine rather than estimating. The finding is better than expected, and it is
specific.

### 4.1 The accrual engine already exists

`processOffline()` (`legacy.js:1073-1207`) is *already* the shape the server needs. It:

* computes elapsed from a watermark, caps it, converts to ticks,
* **replays the exact same action functions the live loop uses** — `doSkillAction(true)`
  (`:3098`), `window.doArtisanAction(…, {silent:true})` (`:9372`), `processOfflineCombat(hrs)`
  (`:1220`),
* runs the whole thing inside `withOfflineReplay()` (`:2033`), a depth-counted latch that
  disables presence-gated bonuses so the replay is paid at the base rate.

That is not a parallel implementation to be reconciled — it is one implementation with a
`silent` flag. **The server accrual engine is this loop with `G` swapped for a server state
object and the `notify`/`render` calls removed.** That single fact removes most of the risk from
the highest-risk workstream.

### 4.2 Ports cleanly (pure or trivially purifiable)

| Logic | Location | Note |
|---|---|---|
| XP curve | `legacy.js:24` `XP_TABLE`, `:39` `levelFromXp`, `:50` `xpForLevel`, `:52/:53` | Pure. Already mirrored in `hr_xp_for_level` with 3 anchor assertions |
| Farm growth | `src/features/farm-progression.js` (361 ln) | **0 DOM refs.** Ports as-is |
| Tool bonuses | `src/features/tools.js` (62 ln) | **0 DOM refs** |
| Power budget clamp | `src/features/power-budget.js` (226 ln) | 1 DOM ref |
| Combat rolls | `legacy.js:1509` `getPlayerCombatRolls`, `:1562` `getArmorSetBonus`, `:1575` `getMonsterCombatRolls`, `:1582` `getEquipmentStats`, `:1588` `getWeaknessInfo` | Pure arithmetic over `G.equipment` + `ITEMS`. Parameterise the state object |
| Derived levels | `:1602-1612` `getLevel`/`getTotalLevel`/`getCombatLevel` | Pure |
| Pacing + rates | `:1921` `pacedXp`, `:1929` `pacedActionMs`, `:1940` `actionRate`, `:1665` `speedClamp` | Pure |
| Gold find | `:1728` `goldFindMult`, `:1731` `applyGoldFind` | Pure |
| Rested XP | `:1790` `restedQuantum`, `:1806` `restedCap`, `:1821` `accrueRestedXp`, `:1834` `spendRestedCharge` | Pure over `G` + a clock — the clock becomes `now()` |
| Drop banding | `:118` `dropBand` | Pure |
| Bounty generation | `:2301-2553` | Pure over `G` + a daily seed; the panel at `:2561` is separate |
| All content tables | `src/data/*.js` | Already pure ESM, already imported by `src/main.js` |

### 4.3 Mixed — arithmetic is pure, side effects are interleaved at the leaf

These are the *interesting* ones, and they share one pattern: the maths is clean, but the
mutation of `G` and the calls to `notify()` / `refreshAll()` / `renderX()` sit inline.

* `addXp` (`:2160-2204`) — the whole grant computation is pure; then it writes `G.skills[sk]`
  and, on level-up, calls `notify()` + `refreshAll()` + `HearthriseAuto.maybeStopTraining()`.
* `doSkillAction` (`:3098-3140`) — node lookup, level gate, `rand()` yield, the deterministic
  tool-carry (`G._toolCarry`, a nice piece of design: fractional carry rather than RNG,
  *specifically so the offline replay is byte-identical*), `addItem`, `addXp`; then
  `retimeActivity()` + `renderSkillDetail()` + `updateTopbar()` guarded behind `if(!silent)`.
* `doArtisanAction` (`:9372-9410`) — consume, produce, XP, counters; two render calls at the end.
* `combatTick` (`:2821-2877`) / `killMonster` (`:2878-2955`) — accuracy/max-hit/crit rolls, drop
  table walk, style-routed XP; interleaved with `G.combatLog.push()`, `notify()`,
  `renderCombat()`, `updateTopbar()`.

**Extraction pattern:** replace the free variable `G` with a passed-in state object, and replace
each side-effect call with a push onto an `events[]` array that the intent envelope returns. The
`silent` flag that already exists in three of these four is the seam — it marks exactly the
lines to remove. This is mechanical, not a rewrite, and it is testable against the existing
suite because the arithmetic does not change.

### 4.4 Must be rewritten server-side (do not port)

* **The timer loops** — `armSkillTimers` (`:2987`), `_armArtisanTimers` (`legacy.js:9351`),
  `startFarmTicker` (`:3199`), `resumeActiveActivity` (`:3002`), `retimeActivity` (`:3038`).
  These are `setInterval` machinery whose entire purpose is driving the UI at 100 ms. The server
  has no loop: it computes `ticks` once at `collect`. **Deleting these is a simplification, not
  a port.**
* **Everything from `notify` (`:3383`) onward** — ~11,500 of `legacy.js`'s 15,050 lines are
  renderers, modals, tab machinery and event binding. They stay on the client, unchanged in
  purpose; they change only in that they read server state instead of `G`.
* **Presence/blessing gating** (`:2019` `sessionOnline`, `:2038` `blessingsApply`, and the
  `withOfflineReplay` latch) — this is an elaborate answer to "is the player really here?" that
  exists *only because the client was the authority*. Online-only makes it trivial: the server
  knows whether a session is live. **Delete, do not port.** Same for the `offlineBudget`
  watermark machinery (`:993-1072`), replaced by `accrued_to`.
* **`snapshotG` / `saveLocal` / `loadLocal` / `decideRestore`** and the entire b305 stress
  battery's subject matter — the cloud-save conflict-resolution program becomes unnecessary when
  there is only one copy of the state. This is the largest single deletion available.

### 4.5 Honest risk

The mixed category (4.3) is roughly 600–900 lines of genuinely load-bearing simulation with a
decade of balance decisions annotated in comments. It ports, but every extraction must be proved
equivalent — the existing 540-test suite covers a lot of it, and the extraction should be done
**with the client still calling the extracted module**, so the suite proves equivalence *before*
the server ever calls it. That ordering is not optional.

---

## 5. Market v2

Detailed in `2026-08-11-market-v2.sql`. The headline: once the server owns gold and inventory,
the market gets *simpler*, not more complex.

* Escrow is a real `DELETE` from `player_inventory` — so there is no "possession check" to
  write, and no way to list what you do not own.
* The seller is **paid directly into `player_state.gold` at sale time**, online or not. That
  deletes `collect_sales`, the `collected` flag, and the row-level UPDATE policy at
  `schema.sql:212` that let a seller PATCH `gold_total` upward before collecting.
* `seller_name` is written by the server from `profiles.display_name` (kept in step with the
  unique-name registry by `2026-08-08-unique-names.sql`). Impersonation closed.
* `for all` on `market_listings` (`schema.sql:169`) is replaced by SELECT-only + RPCs, so
  post-listing qty/price mutation is gone.
* **No price cap is included, deliberately.** Gold can no longer be conjured, so an absurd
  listing can only move gold someone earned. A cap may still be wanted as an anti-scam UX rail —
  that is a Game Designer call, and shipping it as a *security* control would misrepresent what
  it does. `hr_market_config` is the place for it if Design wants one.
* `market_sales` becomes public and append-only, so the 7-day price chart
  (`src/market.js:118 getStats7d`) can read real market data instead of each player's private
  `localStorage`, where today every player sees a different chart.

The same treatment applies to `chat_messages.from_name` (`schema.sql:101`, client free text): a
BEFORE trigger overwrites it from `profiles`. That is a four-line change and should ride along.

---

## 6. Cutover plan

Strangler-fig by domain, with the wipe removing the hard constraint. The repo stays shippable at
every step.

* **Phase 0 — seams, no behaviour change.** Extract §4.2 and §4.3 into `src/shared/` and have
  the *existing client* call the extracted modules. The 540-test suite is the equivalence proof.
  Nothing server-side yet; the live beta is unaffected. **This is the phase that de-risks
  everything after it, and it can start immediately.**
* **Phase 1 — server foundation on a branch.** Apply the three migrations to a Supabase branch.
  Build the catalogue generator + drift guard. Write the Deno accrual engine importing
  `src/shared/` and `src/data/`. Prove it against the suite's own scenarios.
* **Phase 2 — one domain end-to-end: gathering.** `start_activity('gather', …)` + `collect` +
  `hr_load`. The client renders server state for the gathering screen only; everything else
  still runs on `G`. **Dual-state is acceptable here precisely because the beta is disposable.**
* **Phase 3 — remaining domains, one at a time:** artisan → inventory/equipment → combat →
  farm → quests. Each domain's client code stops reading `G` for that domain.
* **Phase 4 — economy.** Market v2, then re-point clan deposit / raid contribution at
  `player_inventory` so `clan_deposit`'s documented "CLIENT-TRUSTED for item possession"
  limitation (`2026-08-08-clan-seat.sql:32-46`) is finally closed. It closes for free.
* **Phase 5 — online-only.** Connection-required boot, reconnect UX, the prediction/reconcile
  layer. Delete the offline machinery (§4.4).
* **Phase 6 — cutover.** Wipe. Drop `game_saves`, the old market RPC, and `snapshotG`. Every
  account starts fresh on server state.

**Ordering rule:** never move authority for a domain before that domain's logic has been
extracted and proven by the suite. Phase 0 gates everything.

---

## 7. Costed workstreams

Engineer-days, one engineer, ordered by dependency. Confidence is my estimate of the estimate.

| # | Workstream | Days | Confidence | Notes |
|---|---|---|---|---|
| A | Extract shared sim core into `src/shared/`, client still calling it (Phase 0) | **12** | Medium | 4.2 is nearly free; 4.3 is the real work. Seeded-PRNG threading included |
| B | Server data model + apply engine + catalogue generator + drift guards | **8** | High | Schema is written; this is applying, testing on a branch, and the generator |
| C | Accrual engine Edge Function (gather / artisan / combat / farm) | **12** | Medium | Mirrors `processOffline`, which already exists |
| D | Intent surface — ~25 intents, validation, envelope, error codes | **15** | Medium | Mostly repetitive once 2–3 exist |
| E | Client rewire: read server state, send intents, prediction + reconcile | **20** | **Low** | Touches `legacy.js` almost everywhere. Biggest and least certain |
| F | Market v2 + re-point clan/raid at real inventory | **6** | High | SQL written; client rewire is small |
| G | Online-only: connection-required boot, reconnect UX, latency handling | **8** | Medium | Also where the *player experience* risk lives |
| H | Test infrastructure: server-side suite, drift guards, load test | **7** | Medium | Non-optional; the current suite cannot see the server |
| I | Cutover: wipe, seed, retire `game_saves`/`snapshotG`, delete offline machinery | **4** | High | Large net deletion |
| | **Total** | **≈ 92 days** | | ≈ 4.5 months at one engineer |

Deletions partly offset this: §4.4 removes the offline budget machinery, the presence/blessing
gating, the timer loops, `snapshotG`/`decideRestore` and the b305 conflict-resolution battery —
plausibly 1,500–2,500 lines of the most defect-dense code in the repo.

**If the timeline needs compressing,** the honest lever is scope, not speed: A → B → F → C
(gathering only) gets a genuinely unforgeable *economy* in ~30 days while combat and quests stay
client-computed but **unmonetizable** (they can no longer reach the market, because the market
reads `player_inventory`). That is a defensible intermediate state and I would recommend it as
the first shippable milestone.

---

## 8. Known limitations and open questions

1. **Latency becomes a design problem.** Today every click is instant because the client
   decides. After cutover, a craft is a round trip. The prediction layer (WS-E/G) is what keeps
   the game feeling like an idle game rather than a form submission. This is the biggest
   *player-facing* risk in the program and it is not a systems problem alone — it needs the Art
   Director and Game Designer.
2. **Online-only excludes players.** A commute, a plane, a bad connection = cannot play. That is
   Tyler's explicit, locked decision and I am recording the cost, not disputing it.
3. **Edge Function cold starts** add latency to the first intent after idle. Mitigation: put the
   hot path (`collect`, `start_activity`) behind a warm function or, if it proves painful, move
   `collect` into PL/pgSQL for gathering only, where the maths is small enough not to duplicate
   meaningfully.
4. **`hr_castle_items` has no drift guard today** and is hand-seeded. The generator should
   absorb it (§3.4).
5. **Cost.** Every action becomes a database write. An idle game with N concurrent players and a
   3-second tick would be brutal — but the accrual model means the server writes **once per
   collect**, not once per tick, so the write rate is ~1 per player per session plus one per
   explicit intent. This is the reason the accrual model is the right one and a tick-loop server
   is not. It should still be load-tested (WS-H) before cutover, not after.
6. **Nothing here has been executed.** No migration has been applied, no Edge Function exists.
   Everything in §1–§5 is verified by reading, not by running. The branch apply in WS-B is the
   first real proof.
