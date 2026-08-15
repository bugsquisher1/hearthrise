# `unlock_buy` — buying a permanent capability (intent #5)

Status: **staged, not applied.** b354. Owner: Backend Architect.
Companions: `supabase/migrations/2026-08-16-unlock-offers.generated.sql`,
`supabase/migrations/2026-08-16-unlock-buy.sql`,
`supabase/functions/hr-accrue/{unlock-catalogue,unlock-buy}.js`,
`tools/gen-unlock-offers.mjs`, `tests/unlock-buy.mjs`.

This closes §9(2) of `2026-08-16-artisan-progress-model.sql` — "the room write path
does not exist, deliberately" — and therefore removes the second of the two
conditions §9(3) puts on making `'artisan'` payable.

---

## 1. The central design problem

`hr_apply` **cannot express an unlock grant, by design.** Its progress block merges
`value = value + add`, so a rung bought twice would read as the rung above: the 2,000g
Iron Stove for 1,000 gold. `'unlock'` is therefore absent from its delta allowlist, and
the artisan model's §0 asserts that absence as a *biconditional* — `'flag'` must be in
the list (the accrual engine has to be able to grant a recipe scroll it rolled itself),
`'unlock'` must not.

So the verb needs a write path that keeps `hr_apply`'s invariants — idempotency key,
version check, ledger, per-day clamp, all-or-nothing rollback — while writing a row
`hr_apply` will not.

### Option (b), widening `hr_apply` — REJECTED

Three reasons, in descending order of weight:

1. **It reopens the hole.** A MAX-merging branch in `hr_apply` is reachable from every
   delta the accrual engine proposes. Today the engine *structurally* cannot climb a
   rung; after (b) it can, and the only thing stopping it is a code path somebody must
   keep correct.
2. **It deletes the strongest static statement in the program.** §0's biconditional is
   a positive *and* a negative claim about one list — the strongest shape a source scan
   can take. (b) makes it unwritable.
3. **Last-toucher churn.** It would make this file the fifth link of the `hr_apply`
   derivation chain and the new last toucher of the most dangerous body in the repo,
   for a feature that writes one row.

### Option (a), a dedicated engine-only RPC — CHOSEN

`hr_unlock_buy(p_user, p_slot, p_version, p_intent_id, p_offer_id)`:
`SECURITY DEFINER`, `hr_engine`-only, gold debit + item debit + `GREATEST` merge +
journal in one transaction. `hr_apply` is untouched: the migration does not
`create or replace` it, `hr_state_of`, `hr_perks_of` or `hr_rate_gate`, and §0 asserts
their terms instead.

The engine's capability grows by exactly one verb whose entire caller-supplied surface
is **one offer id**.

---

## 2. The second decision: the price is a table, not an argument

`shop_buy` sends `gold: -(price × qty)`; the Edge Function computes the price from
`src/data/shops.js`. That is right for an item purchase, because `hr_apply` re-validates
the invariant that matters (the balance may not go negative), so an over-cheap price is
an Edge bug bounded by the ledger.

It is **not** right for a permanent capability. The invariants here are the rung ladder,
monotonicity, the ceiling and the prerequisites — and a caller that also supplied the
price would own three of the four numbers in the transaction. So:

* `hr_unlock_buy` takes an **offer id** and reads price, grant, rung and both
  prerequisites out of `public.hr_unlock_offers`;
* that table is **generated** by `tools/gen-unlock-offers.mjs`, which **imports the Edge
  module's own eligibility predicate** (`unlock-catalogue.js`) rather than restating it,
  so the sellable set is one statement read twice;
* `node tools/gen-unlock-offers.mjs --check` is a preflight in `tests/run-smoke.mjs`.

**This is the 2026-08-15 architecture ruling applied, not bent.** "Rules → JavaScript,
bookkeeping → a database function." A price and a prerequisite edge say what a purchase
*costs* and *requires*, never what a rung *does*. The 0.25 `noBurn` is still in
`src/data/perks.js` and still read by `src/core/perks.js` on both sides. Not one game
magnitude is copied into SQL.

---

## 3. The prerequisites, and why they could not live in the Edge Function

The client gates a room rung on more than its ladder (`src/legacy.js` `upgradeRoom` /
`roomRungGate`):

| gate | source | where it is enforced now |
|---|---|---|
| rung ladder (rung *n* needs *n−1*) | `hr_unlocks.rungs` (generated) | SQL, `rung_skipped` |
| ceiling / monotonic / storage kind | `hr_unlocks` + the `player_progress_unlock_guard` trigger | SQL, independently of this verb |
| room needs property tier ≥ *t* | `homestead.js` `TIERS[i].rooms` + the rung's own `tier` | SQL, `prereq_property_tier` |
| property tier *k* needs tier *k−1* | derived (`k−1`) | SQL, `prereq_property_tier` |
| rungs 2–3 consume a dungeon blueprint | `ITEMS[x].unlocks === '<room>.<rung>'` | SQL, `prereq_item`, and it is **consumed** |

The first two are catalogue-expressible. The last three are in **classic scripts** that
neither ESM nor Deno can import — which is why `src/data/shops.js` and `src/data/perks.js`
exist as generated copies at all. They are extracted by the generator into
`hr_unlock_offers.req_property_tier` / `req_item` and enforced in SQL against the
character's own server-side state, under the same advisory lock as the gold debit.

That is the better outcome, not a workaround: **the Edge Function never sees a
prerequisite, so it cannot forget one.**

The property tier is derived exactly the way `hr_perks_of` derives it — `max` over the
`property` namespace — rather than from a column somebody keeps in step. A second
definition of "what tier is this player" is a second answer.

---

## 4. What is sellable, and what is refused by name

93 authored offers grant an unlock. **45 are sellable** (40 room rungs + 5 property
tiers); 48 are refused **by name with the reason attached**, because a player told "no
such offer" about a real purchase files a bug against the wrong system.

The predicate is on the offer's **shape**, so an offer that *grows* a condition falls out
of the sellable set by construction:

* any field this verb does not implement → `unimplemented_field:<field>`
  (`reqSkill`, `reqLv`, `period`, `authority`, `note`)
* any cost that is not gold + items → `unpayable_cost:currency:gems` etc.
* a zero gold price → `non_positive_price` (a free permanent capability)
* more than one grant line → `multi_line_grant`
* a namespace outside `{room, property}` → `namespace_unsupported:<ns>`

The namespace allowlist is a **decision per namespace**, recorded in
`unlock-catalogue.js` with its reason. `plot` and `worker` are excluded because their cap
is the property tier's `plots`/`workers`, which no server catalogue carries — a cap that
is not enforced is not a cap. `farm_plot_tier` is priced in deeds and gated by
`PLOT_TIERS`. `recipe` is *earned*, not sold. `trait:auto_eat` already has an applied,
live RPC and a second writer for one row is how two rules disagree about one fact.

---

## 5. The contract

```
hr_unlock_buy(p_user uuid, p_slot int, p_version bigint, p_intent_id uuid, p_offer_id text)
  → jsonb   -- hr_state_of's envelope on success, {ok:false, error, …detail} on refusal
```

`revoke ... from public, anon, authenticated, service_role` then
`grant execute ... to hr_engine`. Asserted, role by role, in §3 of the migration.

### Error taxonomy

| code | meaning | state |
|---|---|---|
| `unknown_offer` | no such offer, or not an unlock offer | nothing read |
| `offer_unsupported` | real offer this build cannot sell; carries `reason` | nothing read |
| `rate_limited` | the `apply` budget (240/min), shared with `hr_apply` | nothing written |
| `no_character` | no row in this slot | — |
| `version_conflict` | the caller's read is stale. **The key is released.** | rolled back |
| `intent_mismatch` | that key was claimed for a different offer/rung/slot | nothing written |
| `intent_in_flight` | the key is claimed and undecided | nothing written |
| `already_owned` | the rung is held. A refusal, never a silent no-op | rolled back |
| `rung_skipped` | not the next rung on the catalogue's ladder | rolled back |
| `prereq_property_tier` | carries `have` / `need` | rolled back |
| `prereq_item` | the blueprint is not in the bag | rolled back |
| `insufficient_gold` / `insufficient_item` | computed under the lock | rolled back |
| `unlock_daily_cap` | 20 permanent unlocks per character per UTC day | rolled back |
| `bad_unlock_write` | the storage guard refused the row — an engine bug, with its sqlstate | rolled back |

The Edge layer adds only `missing_intent_id`, `bad_offer` and the two offer codes; the
rest are the function's own, returned verbatim, exactly as `hr_apply`'s are. A second
taxonomy that agrees today is two taxonomies.

---

## 6. Concurrency and idempotency

The sequence is `hr_apply`'s, statement for statement where the two do the same job — a
second writer that invented its own concurrency story would be a second concurrency
story:

1. identity seam (`role` GUC; `hr_engine` may name a user, nobody else may);
2. rate gate on the **`apply` budget**, not a new namespace — a second writer with its
   own 240/min would double a compromised engine's reachable write rate;
3. `pg_advisory_xact_lock` on **the same key** `hr_apply` takes
   (`hashtextextended(user:slot)`), so a purchase and an accrual cannot interleave on one
   character;
4. idempotency claim in `player_intents`, slot-scoped, `intent_mismatch` on a collision;
   the name is `unlock_buy:<offer>:<rung>` so anything that changes what the write *does*
   is in the compared string;
5. protected block: `select ... for update`, mandatory version check, catalogue read,
   prerequisites, debits, `GREATEST` merge, one journal row;
6. decision recorded under the key **outside** the block so it survives a rejection —
   and **released on `version_conflict`** (b346's rule: a stale read is not a decision
   about the delta, and storing it would lock that key out for up to 25 hours).

Never a read-modify-write across a network hop: the Edge Function reads *nothing* it then
writes. It reads the version for the optimistic check, and the version is re-checked under
the lock.

**Not verified:** true concurrency. PGlite is one backend, so the advisory lock is
exercised and contended by nothing. The version-conflict path is driven directly instead.
A real race needs `tools/race-test.mjs` against a multi-connection database — recommended
before the client seam ships.

---

## 7. Why the daily budget is *not* called, and what is clamped instead

`hr_day_budget_check` is a ceiling on **gross inflow**. This transaction has none in any
dimension: gold is negative, items are negative, xp is absent. A call whose result can
never be non-null is decoration.

What is clamped is the thing a rate limit does not bound: **20 unlock purchases per
character per UTC day**, counted from the **append-only ledger** (the `clan_deposit`
pattern — a counter is a second source of truth that can be reset). Derivation: 45
sellable offers exist in the whole game and each is once-per-character *forever*, so the
lifetime ceiling for an honest character is 45. A day with 20 is not play.

---

## 8. Journal volume at 100× players

**One row per successful purchase, none per refusal.** A character can ever buy 45
unlocks; at 600 players that is a lifetime ceiling of ~27,000 rows across the whole game,
against `player_ledger`'s existing accrual traffic. `meta` is five small keys.

This is deliberately the opposite of the `game_events` failure (1.6M rows / 229 MB from
six players in four days): purchases are journalled because they are **value transfers**,
and refusals are not, because they are events. `hr_record_rejection` already aggregates
rejections per (character, code, day), and the rate-limit record is *sampled*.

---

## 9. Exploit surface delta

**Closed.** A permanent unlock now has exactly one server-side writer. Before this, the
only writer of `G.rooms` was the client.

**Opened, and bounded:** one more engine-executable function. Its whole caller-supplied
surface is a primary key in a generated, client-unwritable table; every number it writes
comes from that table or from the character's own locked row; the row it writes is
policed a second time by the `player_progress_unlock_guard` trigger; and it is clamped
per call and per day. That claim is re-derived in full in the engine allowlist entry
(§4 of the migration) — this is the **first writer** added to that list since `hr_apply`,
so it is admitted on *self-validating*, not on *read-only*.

**Still open, by decision:** the client is still the only writer of its own `G.rooms`.
Until the room screen calls this verb, a player who buys a Kitchen in today's client has
no server row. That is unchanged by this work and is why the `'artisan'` flip is safe
only post-wipe (after the wipe no character owns a room, so both sides agree by
construction from an empty state) or with cooking excluded until the client seam lands.

---

## 10. Reversibility

```sql
drop function public.hr_unlock_buy(uuid,int,bigint,uuid,text);
-- and re-apply 2026-08-16-engine-allowlist-claim-perks.sql to restore the
-- eleven-entry engine allowlist.
```

No table is altered, no policy is written, no existing body is replaced except the
detector's — which is derived and whose predecessor restores it exactly. Rows already
written are ordinary `player_progress` unlock rows and are read by `hr_unlock_levels`
whether the function exists or not. `hr_unlock_offers` is additive and refilled wholesale
on re-run.

---

## 11. Tests

`tests/unlock-buy.mjs` — real PGlite, the whole migration chain replayed from
`schema-apply-order.json` (so both new migrations' self-verifying blocks execute on every
suite run), the real Edge module bytes behind one injected `exec` running as `hr_engine`:

* **U1/U1b** the SQL catalogue and the Edge catalogue sell the identical set; the
  eligibility predicate is driven with nine synthetic offers (it has nothing live to
  reject, so without this it would be unobservable);
* **U2/U3** a real purchase through `runUnlockBuy` lands, takes the gold *and* the
  materials, and reaches `hr_perks_of`;
* **U9b** rung 3 is bought and the **real `simulateArtisanSpan`** burns **0** — with the
  same seeded, supply-limited span burning >0 without the server rung (the control);
* **U4** double buy → `already_owned`, gold measured unmoved, rung measured unchanged
  (the GREATEST-vs-`+=` arm);
* **U5** rung skip → `rung_skipped`; **U6** replay exactly-once + `intent_mismatch` on a
  reused key; **U7** stale version → `version_conflict` **and the key is released**, with
  a narrowness control; **U8** both prerequisites, each with a passing control and the
  blueprint measured as consumed; **U9** poverty + 22 hostile offer bodies (prototype
  walkers, SQL injection, whitespace, 500 chars); **U10** the journal; **U11** source
  properties nothing else can see (no `::jsonb` parameter, no `hr_apply` call site, no
  price arithmetic); **U12/U13** registry/parser agreement and zero statements on a
  malformed call.

`node tests/unlock-buy.mjs --selftest`: **16/16 mutations caught**, including the
`GREATEST`-vs-`+=` arm. Registered in `tests/run-smoke.mjs` as a guard plus a generator
preflight, and in `tests/run-sql-tests.mjs` PART 1f-ii as the third link of the
`hr_assert_grant_hygiene` chain.

---

## 11b. Security review conditions (2026-08-16) — what changed

Sign-off with conditions. The four this branch owns are closed:

**C1 — the catalogue lockdown was three verbs short.** Both generators emitted
`revoke insert, update, delete`, which does not take the TRUNCATE/REFERENCES/TRIGGER the
platform default ACL also grants — and TRUNCATE bypasses RLS entirely, so the read-only
policy is not a backstop for it. Both now emit `revoke all ... from public, anon,
authenticated, service_role`, and `tests/schema-replay.mjs`'s scaffold was widened from
`grant select, insert, update, delete` to `grant all` so the replay can *see* the class
at all. RED before the fix, with the widened scaffold: `2026-08-16-unlock-buy.sql failed
to apply: 3 client write grants on hr_unlock_offers` (my own §3(d), which would have
raised on production). GREEN after. Regression-guarded by the `catalogue_partial_revoke`
mutation.

**C3 — the detector could not see a dead client write grant.** New file
`2026-08-16-client-write-grant-sweep.sql`, link **3** of the derivation chain and the
first that *replaces* lines (four, declared in PART 1f-ii). It revokes the six catalogues
Security named, and widens check (4) to report **a client write grant on a table with RLS
on and NO write policy at all** — a grant nothing intends to use.

*Deviation from the literal condition, flagged deliberately:* "any INSERT/UPDATE/DELETE
held by anon/authenticated/PUBLIC/service_role on any public relation" cannot be strict.
Measured on the replay: 40 tables carry client write grants and **27** are in the
no-policy class, not six — the other 21 (`clan_*`, `world_event_*`, `raid_*`,
`maintenance_*`, `display_names`, `leaderboard_meta`) are written only by `SECURITY
DEFINER` RPCs. `service_role` holds everything on everything by platform default. So the
check is structural, `service_role` is out of scope (stated in the file), and the 21 are
recorded in a new `hr_client_write_baseline` — which makes each one a claim someone must
justify and anything **new** fatal. A follow-up sweep of the 21 is recommended and named
in §7 of that file; it needs each writer confirmed one at a time.

Evidence: migration §5 has a mutation arm (a fresh RLS-on, policy-less table with an
`authenticated INSERT` grant must be **named** and **fatal**, and a baselined one must
not be); test **U14** reproduces the grants on all six live tables, requires the detector
to name each, requires strict mode to fail, then revokes and requires them to vanish.
Mutations `sweep_not_applied` and `detector_still_narrow` are RED.

**C4 — the receipt is the server's.** `hr_unlock_buy` now returns
`charged: {offer, name, unlock, rung, gold, items, blueprint}` and `unlock-buy.js` builds
the receipt from it, never from `UNLOCK_OFFERS`; absent `charged` → `null` (fail closed).
Test **U15** moves the price **in the table only** so the Edge copy is provably wrong, and
requires the receipt to match what was charged. RED under `receipt_price_from_edge`:
*"the receipt says -2500 while the server took 6821."*

**C5(a) — partial item debit.** Test **U16** starves one line of a three-line offer and
asserts `insufficient_item`, gold unmoved, **every other line restored**, blueprint not
consumed, rung not granted. The first draft starved the *first* key and the S2 mutation
SLIPPED — `jsonb_each_text` walks stored key order, so nothing had been debited yet. It
now starves the **last** line; `partial_debit_not_rolled_back` (the refusal `return`s
instead of raising) is RED: *"willow_log went 120 -> 80 on a refused purchase."*

**C5(b) — two price sources proven equal.** `gen-unlock-offers.mjs` now asserts, per room
rung, that `ROOMS[id].levels[n-1].cost` equals the offer's gold + item lines, and dies
naming the disagreement. Both objects are in one process exactly once — at generation.

**F8 (diagnostics)** — the namespace test moved before the field allowlist, so
`dungeon.*` reports `namespace_unsupported:dungeon_run` rather than
`unimplemented_field:reqSkill`, which read as "we could sell this once skill gates land"
and was false. Refusal *set* unchanged; the generated file's digest moved with the
reasons.

**C3a (ratified-with-changes, 2026-08-16) — the baseline no longer seeds itself.**
Revision 1 seeded `hr_client_write_baseline` from live reality, which is a tripwire that
disarms itself twice over: anything entering the class before the apply was absorbed
silently, and because the file is safe-to-re-run, every re-run re-absorbed whatever had
arrived since. The mechanism is live, not hypothetical — Supabase's default ACL puts
every new RLS-on, write-policy-less table into the class automatically.

Now: the 21 tables are a `c_expected constant text[][]` of 42 (table, grantee) pairs; the
seed comes **only** from that list; a class member reality holds that the list does not
name is a **RAISE**; a listed member absent from reality is a **WARNING** ("the list
should shrink — delete the pair and the grant together"). The class predicate is computed
**once** into `v_class` so the raise and the seed cannot drift, and an empty class is
itself fatal (a blind check on a database with 21 known members is not a clean bill).

Measured, in both directions:
- **Before** (self-seeding): mutation `class_member_absorbed` creates a table in the class
  immediately before the seed — it was **absorbed silently and the whole suite stayed
  green**. That is the finding, reproduced.
- **After**: the same mutation is RED — *"C3a: REFUSING TO BASELINE SOMETHING NOBODY
  REVIEWED … c3a_absorbed_probe:authenticated … Do not widen the list to make this stop."*
- **U14** additionally asserts, on the clean replay, that the declared baseline and the
  live class are **set-equal in both directions**, and that none of the six swept
  catalogues was baselined instead of fixed.

`receipt_on_replay` re-anchored: the receipt's field reads are now optional-chained, so
deleting the guard produces a running build and the mutation fails on the **named
assertion** (*"a REPLAYED purchase reported a receipt for a transfer this invocation did
not make"*) instead of a `TypeError`. The comment in `unlock-buy.js` says why the `?.` is
there, so nobody "tidies" it away.

Suite after all of it: **723/723, 0 runtime errors**; `unlock-buy --selftest` **22/22**;
`run-sql-tests` static green with the 3-link chain and its declared removals;
`schema-drift` clean against the re-baselined fingerprint.

## 12. Known limitations

1. **True concurrency is not executed** (see §6).
2. **The client seam does not exist.** `unlock_buy` is reachable from the wire and
   nothing calls it. That is the Systems Engineer's, and it is what makes the
   `'artisan'` flip safe outside a wipe.
3. **Four namespaces stay client-owned** (§4). Extending the verb to any of them means
   extending the *generated prerequisite columns* first, not widening the predicate.
4. **The blast-radius numbers are engineering, not balance** — 20 unlocks/day/character.
   The Game Designer owns them if they ever bind.
5. **Nothing here has run against production.** Everything above was verified on PGlite
   (real PostgreSQL, in process) via the repo's own replay; no migration was applied and
   no function was deployed.
