# Dungeon reward settlement — the server-authority contract

**Status:** DESIGN + first-increment spike. Nothing here is applied. No client code changed.
**Authority:** `CLAUDE.md` → "Server authority (locked 2026-08-10)" and `docs/design/server-authority.md`.
Where anything here conflicts with those, they win.
**Predecessor:** systems-engineer branch `fix/dungeon-rooms-persistence-class` (commit a4bf9ffc, merged) —
the guard `tests/inventory-mint-census.mjs` (4) BLOB-RETIRE PERSISTENCE section named the five owed
lanes. This document is the server contract for those lanes. Do not re-derive the diagnosis; it is in
`.claude/coordination/agents/systems-engineer.md` §"The gained, then gone on reload dungeon class".

---

## 0. The finding that shapes everything

Queried live (`nezapsylztqbbwuwembx`, read-only, 2026-09-02):

```
select item_id, count(distinct user_id) holders, sum(qty)
  from public.player_inventory
 where item_id in ('dungeon_scrip','bone_key','goblin_seal','arcane_tome',
                   'obsidian_sigil','void_fragment','dragonsbane_key');
→ 0 rows.
```

**The entire dungeon reward economy persists NOTHING on the server today.** Scrip, keys and run loot
are minted only client-side (`src/dungeons.js` `awardDungeonScrip` / `trySpawnKeyDrop` / `awardLoot` /
`buyFromQuartermaster`; `src/dungeon-scavenger.js` per-node loot). Under `src/net/capstone.js`
`BLOB_RETIRED = true` (LIVE), `loadLocal()` skips the save blob and rebuilds `G.inventory` **only** from
the server envelope — so every reload wipes the client-minted rewards, exactly as the three P1 reports
describe (scrip → 0, keys vanish, "forge unbuilds").

Two consequences drive the whole design:

1. **This is greenfield.** There is nothing to migrate, no amnesty, no back-compat. Build it correctly.
2. **The key is the entry gate.** `hr_dungeon_settle` consumes the run's key from `player_inventory`.
   Keys exist nowhere server-side today, so **key drops must become server-settled BEFORE the settle
   RPC can require a key** — otherwise the settle refuses every run for lack of a server-held key. This
   ordering is a hard constraint, not a preference (§5).

---

## 1. Scrip's home — DECIDED: `player_state.dungeon_scrip bigint`

A column on `player_state`, mirroring `marks` byte-for-byte in shape and lifecycle. **Not an inventory
item.** Rationale:

* Scrip is a **fungible currency spent at one shop** (the Quartermaster), never equipped, never
  stacked as loot, never traded. `marks` is the exact same shape — a bounty currency spent at a shop —
  and it already lives as `player_state.marks bigint default 0`, credited by `hr_claim_bounty`,
  projected in `hr_state_of`, spent by `hr_bounty_spend` (`2026-08-26-marks-record.sql`,
  `2026-08-23-bounty.sql`). Copy that precedent; do not invent a second currency model.
* As an inventory item scrip would (a) fragment the item model — a currency in the bag beside logs and
  swords — the exact objection the systems engineer raised and I concur with; (b) inherit bank-cap and
  stacking semantics that are meaningless for currency; (c) have to be classified "ownable" in
  `item-authority.js`, which then pulls it into the inventory absolute-replace flip.
* A **client-side residue mirror for scrip is REJECTED** (systems-engineer ruling, upheld here):
  residue is client-authored and stored verbatim, so a residue scrip balance is forgeable via devtools
  — re-authoring a currency the server-authority program spent months removing.

`hr_state_of` is a **generated** body (`2026-08-26-marks-record.sql` §1 header: "GENERATED. Do not
hand-edit"). Projecting `dungeon_scrip` is therefore a regenerate-and-replace of `hr_state_of` via the
derive tool that owns it, adding one line beside `'marks', v_st.marks` — a full-body replacement that
**must be branch-verified**, not hand-edited into production.

---

## 2. Intent A — `hr_dungeon_settle` (scrip + run loot)

The template is `world_event_claim__ungated` (`2026-08-20-muster-chest-items.sql`): a SECURITY DEFINER
RPC that server-rolls a reward, credits items into `player_inventory` and a currency onto
`player_state`, once, in one transaction, journalled and replay-safe, with a self-verifying commit gate.

### Signature

```
hr_dungeon_settle(
  p_user      uuid,     -- honoured only when the caller's role GUC = 'hr_engine' (§the identity seam)
  p_slot      int,
  p_version   bigint,   -- optimistic concurrency; a missing/stale version is version_conflict
  p_intent_id uuid,     -- client idempotency key
  p_dungeon_id text,    -- a key into the SERVER catalogue hr_dungeons; the client names nothing else material
  p_mode      text,     -- 'auto' | 'manual' | 'scavenger' — decides cooldown handling only
  p_quality   numeric   -- client-reported clear fraction; CLAMPED to [0,1] server-side (see anti-forgery)
) returns jsonb  -- the hr_state_of envelope + {settled:{dungeon,mode,scrip,items,key_spent}}
```

Engine-only, exactly like `hr_unlock_buy`: `revoke execute … from public, anon, authenticated,
service_role; grant execute … to hr_engine`. The client sends an intent to the Edge function; the Edge
function is the only caller. The migration asserts the ACL with the enumerated-role probe
(`2026-08-16-unlock-buy.sql` §3(a)).

### What it validates server-side (each because something breaks without it)

| Check | Source of truth | Error |
|---|---|---|
| identity seam | `role` GUC = `hr_engine` → honour `p_user`; else `auth.uid()`, refuse impersonation | `forbidden_impersonation` |
| dungeon exists + is sellable-as-a-run | `hr_dungeons` (GENERATED from `src/data`) | `unknown_dungeon` |
| combat level ≥ `req_lv` | derived from `player_skills` server-side (never a client level) | `level_locked` |
| optimistic version | `player_state.version` under `for update` | `version_conflict` |
| **key present + consumed** | `player_inventory[cost_key]` ≥ 1, debited under `for update` | `insufficient_item` |
| cooldown (mode='auto' only) | `now()` vs last `kind='dungeon',meta.mode='auto'` ledger row for this (user,slot,dungeon) + `cooldown_s` | `on_cooldown` |
| per-day scrip cap (blast radius) | `sum(meta.scrip)` from `player_ledger` this UTC day | `daily_cap` |
| loot roll | server RNG `hr_seed(user,slot,'dungeon:'||id||':'||ledger_seq)`; table `hr_dungeon_loot` (GENERATED) | — |

Then, in ONE protected block (all-or-nothing, `hr_reject` → `HR000` → handler rolls back, the
`hr_unlock_buy` shape):

* debit the key (`insufficient_item` if absent — this is the load-bearing gate that makes a run cost a
  real server-held key);
* roll each loot row with the seeded PRNG; credit survivors into `player_inventory` (additive upsert,
  the muster-chest idiom at `2026-08-20-muster-chest-items.sql:228`); BoP items only — the market
  already excludes them;
* `scrip := round( max(5, req_lv * 0.6) * clamp(p_quality,0,1) )` credited to
  `player_state.dungeon_scrip` (the `awardDungeonScrip` formula, now server-owned);
* bump `version`; **do NOT touch `accrued_to`** (a run is not an activity change — the `hr_unlock_buy`
  rule at §1(h): stamping it would confiscate the buyer's elapsed accrual window);
* journal ONE row `kind='dungeon'` (add to `player_ledger_kind_check`), `meta = {dungeon, mode,
  quality, key_spent, scrip, items}`. `qty_in`/`gold_in`/`xp_in` = 0 explicit (a fixed server-owned
  reward, not client-driven inflow — kept OUT of the accrual daily budget, like the muster credit).

Idempotency: claim `player_intents(user_id,intent_id)` under the same advisory lock hr_apply takes;
intent string `'dungeon_settle:'||p_dungeon_id||':'||p_mode`; a reused key with a different string is
`intent_mismatch`; a replay returns the original envelope with `replayed:true`
(`2026-08-16-unlock-buy.sql` §1(4), `2026-09-03-intent-mismatch-class.sql`).

### The cooldown, and the b288 lesson

b288 ("reload-free-runs") was a **client** cooldown (`G.dungeons.lastRun[id] = Date.now()`) that a
reload reset. Server-side the limiter must be real and read from `now()` + the append-only ledger, never
a stored counter a client can influence:

* **auto** — the per-dungeon `cooldown_s` (from `d.cooldownH`), enforced against the last auto-mode
  `dungeon` ledger row. This closes the reload bypass.
* **manual / scavenger** — the current design DELIBERATELY has no cooldown (`src/dungeon-scavenger.js`
  L528, `src/dungeons.js` L534: "Manual runs ignore the auto-run cooldown"). Its server-side limiter is
  the **key consumption** (a manual run costs a real server-held key — `src/dungeons.js` L939 b214 fix)
  plus the **per-day scrip cap**. So "enforce on BOTH modes" is honoured as: auto = server cooldown;
  manual = server key-debit + per-day cap. If the designer wants a manual cooldown too, it is one added
  `on_cooldown` branch — flagged, not assumed.

### Anti-forgery argument

A forged client value cannot mint scrip, loot or keys, and nothing crosses to another player:

* **`p_quality` is the only client-authored number, and it is clamped to [0,1] and only scales
  SELF-ONLY BoP rewards.** A player who always claims a perfect clear gains at most the top of a fixed
  band on their own account. This is the `clan_deposit` posture ("server-authoritative for currency,
  gates, rewards and rate; client-trusted for the one thing that cannot be verified, CLAMPED and
  AUDITED") — acceptable here specifically because the entire dungeon reward set is BoP / self-only:
  loot ids are `bop:true` or EXCLUDED in `item-authority.js`, scrip is self-only, keys are BoP. **The
  target property from CLAUDE.md — "a forged client value cannot cross into another player's economy or
  ranking" — holds: there is no cross-player surface.** (⚠ SECURITY MUST RULE on the clamped-quality
  posture before this ships. The alternative that removes the client value entirely is a **fixed
  per-clear reward** — the mini-game becomes pure flavour with no mechanical payout difference; cleaner
  server-authority, but a balance/design change that belongs to the Game Designer. Present both.)
* **Everything else is server-owned:** the loot ids and rates and the scrip rate come from generated
  catalogues the client cannot name or price; the key is debited from server inventory (no run without
  a real server key); the cooldown and per-day cap read `now()` and the ledger; the PRNG is
  `hr_seed`-salted with the 256-bit server secret so the next roll is not computable in devtools (the
  S20 rule). A forged `p_dungeon_id` → `unknown_dungeon`; a forged `p_mode` → treated as manual (no
  cooldown gift) or rejected `bad_mode`.

---

## 3. Intent B — server-side key drops (fold into combat accrual; NO new RPC)

Keys drop today from `trySpawnKeyDrop`, a `window.killMonster` **wrapper** (`src/dungeons.js` L992) that
is NOT in `MONSTERS[m].drops` and NOT in `src/core/combat-sim.js`. Every other combat drop flows
`resolveKill` → `rollDropTable(m.drops,{rng:ctx.rng})` → `fx.addItem` → accrual → `hr_apply` items delta
→ `player_inventory` (verified: `wolf_pelt` and every ordinary drop settle server-side). Keys are the
sole exception, which is why they persist nowhere.

**The fold:** move the `KEY_DROPS` table into the monster drop model as BoP drop-table rows
(`src/data/monsters.js` `m.drops`, or a parallel `src/data` key-drop lane that `rollDropTable` reads),
and DELETE `trySpawnKeyDrop` + its `killMonster` wrapper. Then:

* keys roll with the seeded session PRNG on every kill, live AND away, through the one combat loop
  (`combat-sim.js` — the `AWAY-1` parity guard already asserts a seeded kill is byte-identical either
  way, and will now cover keys too);
* the accrual engine settles them into `player_inventory` with zero new RPC and zero currency question;
* they inherit `bop:true`, so the market already refuses them.

Anti-forgery: keys become ordinary server-rolled combat drops — rate and eligibility from the drop
table, RNG from the server seed, settlement through `hr_apply`'s re-validation. **This is the hard
prerequisite for §2's key consumption.** Rates (0.025–0.30 by monster/tier) are a Game-Designer sign-off
on a data row, not new code.

Residue home for keys is **rejected** for the durable design: it is forgeable (client-authored residue)
and throwaway (the settle RPC consumes from `player_inventory`, not residue, so a residue key would have
to be migrated out the day settlement lands — a fork). It is discussed only as an interim in §6.

---

## 4. Intent C — `quartermaster_buy` (spend scrip for keys / blueprints / weapons)

Shape is `hr_unlock_buy` (`2026-08-16-unlock-buy.sql`) with two swaps: the currency is **scrip** not
gold, and the grant is an **item** into `player_inventory` not a progress rung.

### Signature

```
quartermaster_buy(
  p_user uuid, p_slot int, p_version bigint, p_intent_id uuid,
  p_offer_id text     -- a primary key into hr_qm_offers (GENERATED from src/data QM_STOCK)
) returns jsonb
```

Engine-only ACL, same probe. `hr_qm_offers(offer_id text pk, item_id text, scrip_cost bigint)` generated
from `QM_STOCK` (moved to `src/data`), world-readable, client-unwritable, drift-guarded by
`tools/gen-catalogues.mjs --check`.

Validates: version; scrip balance ≥ `scrip_cost` read from `player_state.dungeon_scrip` under
`for update` (`insufficient_scrip`); bank cap for the granted item (`bank_full`); per-day clamp from the
ledger. Then, in the protected block: debit `dungeon_scrip`, credit `player_inventory[item_id] += 1`
(additive upsert), bump version, journal ONE `kind='dungeon'` row with signed scrip in `meta`.
`accrued_to` untouched. Idempotency string `'qm_buy:'||p_offer_id`.

This is the fix for the b372 half-undo bug the QM comment describes (`src/dungeons.js` L240): today
neither leg (scrip out, item in) is known to the server, and the settle envelope reverts them by
different rules. Once both legs are one server transaction the whole trade stands-or-reverts atomically
and the `pendingItemSpends` item-ledger (`src/net/item-ledger.js`) drains itself.

Anti-forgery: the whole client surface is one offer id (a PK lookup in a generated, unwritable table);
price and item are server-owned; scrip is server-owned; the item is BoP/self-only. No run, no scrip, no
purchase.

---

## 5. Dependency order (a hard graph, not a wishlist)

```
(1) player_state.dungeon_scrip column + hr_state_of regen        [SERVER]  inert until a writer exists
(2) key-drop fold into m.drops + delete trySpawnKeyDrop          [DATA+EDGE+CLIENT]  keys become server-settled
(3) src/data extraction: DUNGEONS loot/reqLv/cooldown/scrip-rate  [DATA]   + QM_STOCK → src/data
    + generators (hr_dungeons, hr_dungeon_loot, hr_qm_offers) + drift guards
(4) hr_dungeon_settle migration (reads (1),(3); consumes keys from (2))    [SERVER]
(5) quartermaster_buy migration (reads (1),(3))                            [SERVER]
(6) client wiring: run paths call hr_dungeon_settle; QM calls             [CLIENT — Systems Engineer]
    quartermaster_buy; read scrip from envelope; DELETE the client
    scrip/key/loot/QM mints; drop the census BLOB_RETIRE_UNSAFE_LANES entries as each lands
```

(2) MUST precede (4): the settle consumes a key from `player_inventory`, and keys exist nowhere
server-side until the fold ships. (1) is inert on its own (no reader/writer), so it is the safest first
apply but does nothing for a player until (4)+(6). Every server step is a review-only migration that
Security signs off and the Coordinator applies on a branch first (never `apply_migration` to prod
unproven).

---

## 6. The interim question (bleeding-stop), assessed honestly

The dungeon reward economy persists **nothing** today, so the pillar is already broken on reload for
every player who uses it. Options:

* **(A) Ship the real settlement, sliced (§5).** The proper fix. Not one build — it is (1)–(6), with
  (2) and (6) crossing into Data/Edge/Client (Systems Engineer + Game Designer). Correct, non-throwaway,
  but not "one build tonight".
* **(B) Honestly gate the dungeon reward GRANT until settlement lands** (client-only, one build,
  Systems Engineer). Show the runs, but disable the reward mint with a plain "dungeon rewards are being
  rebuilt — coming back soon" state, so a player does not invest a run into loot that will vanish. Since
  the rewards vanish 100% on reload today, this is HONEST, not a regression — it stops offering a
  vanishing reward (CLAUDE.md: better to not offer a reward than offer one that vanishes). UX cost: a
  live pillar visibly goes quiet. **Recommended stopgap** while (A) lands.
* **(C) Residue home for keys only.** Fast, stops key-loss (residue persists). Rejected: forgeable
  (client-authored), throwaway (must migrate out when §2/§4 land), and it fixes only 1 of 3 bugs while
  setting the precedent the program has been removing. Present for completeness; do not build.

**Recommendation:** (B) as the immediate stopgap (stops the bleeding without forging a currency or
creating throwaway state), in parallel with (A) as the real fix. Reject (C).

---

## 7. The Forge (bug #1) — a DIFFERENT root cause, decoupled

Live evidence (`hr_rejections`, read-only): `room.forge.1` is refused **`prereq_property_tier`**
`{have:1, need:2}` — 9 distinct users, 36 occurrences. The forge is gated behind property tier 2
(Farmstead). The Farmstead upgrade (`property.farmstead`) is itself refused **`insufficient_item`** — 21
occurrences, 9 users, latest detail `{have:3, need:4, item_id:'wolf_pelt'}`. One affected player holds
`copper_ore: 713` (abundantly settled — copper_ore is NOT the problem) but `wolf_pelt: 3` (needs 4) and
**zero** `property`/`room` progress rows.

So the forge is **not** the phantom-copper_ore variant and **not** a distinct `hr_unlock_buy` bug —
`hr_unlock_buy` is behaving correctly. The chain is:

1. The Farmstead (tier 2) upgrade costs a COMBAT-DROP material (`wolf_pelt ×4`, plus cooked food). Homestead
   (tier 1) settled because its cost is gather products (`normal_log`, `copper_ore`) which settle
   reliably; tier 2 fails because combat drops settle with a small divergence (client-predicted drops +
   companion `doubleDrop` mint an extra the server does not settle — the accepted ~2-3% residual), so the
   server has 3 wolf_pelt where the client shows 4.
2. `src/features/homestead.js:316` does `G.homestead.tier++` **optimistically, before** the server
   confirms, and the `buyUnlock('property.farmstead')` promise's rejection is **swallowed**
   (`.catch(function(){})`, L319). `getTier()` = `max(server rung, residue)`, so the client believes it
   is tier 2 and lets the player attempt the forge.
3. The forge purchase is then correctly refused `prereq_property_tier` server-side, and on reload the
   forge/tier-2 is gone because it never settled.

**Fix (two layers, both OUTSIDE this settlement program):**
* **Client (Systems Engineer, immediate, non-throwaway):** do not advance `G.homestead.tier` until the
  server confirms the `property.*` purchase; surface the rejection ("Farmstead needs 1 more wolf pelt")
  instead of swallowing it. This makes the failure honest and stops the phantom-tier state — the forge
  stops "unbuilding" because the client stops pretending it was built. Mirror the same fix on
  `upgradeRoom` (`src/legacy.js:9165`) for the room rung.
* **Deep (inventory-authority program, separate):** close the combat-drop client/server divergence so a
  purchase requiring an exact combat-drop count cannot fail server-side while the client shows it
  affordable. Out of scope here; named so it is not re-discovered from a report.

---

## 8. Error taxonomy (additions)

Machine codes only, merged into the envelope, `hr_record_rejection`-logged at `normal` severity (these
are honest client/server divergences or catalogue facts, not forgeries):

```
dungeon:  unknown_dungeon · level_locked · on_cooldown · bad_mode · daily_cap
          (+ shared: version_conflict, insufficient_item [the key], no_character,
           intent_mismatch, intent_in_flight, rate_limited, bank_full)
quartermaster: unknown_offer · insufficient_scrip · bank_full · daily_cap
```

---

## 9. Verification status — READ before trusting the SQL sketches above

| Verified how | What |
|---|---|
| Live read-only SELECT (Management API) | 0 scrip/key rows in `player_inventory` (§0); the forge/property rejection census (§7); one affected player's inventory (`copper_ore:713, wolf_pelt:3`, no property rows); `player_state` has no `dungeon_scrip` column; `player_state.marks` shape |
| Source inspection against LIVE templates | signatures/validation/ledger shapes copied from `clan_deposit`, `hr_unlock_buy`, `world_event_claim__ungated`, `hr_state_of`/`marks` — all live and previously proven |
| **NOT done** | No SQL executed on a branch (prod is read-only for this spike; a Supabase branch was not authorised and `node_modules` in this workspace is degraded to 4 entries, so the node/SQL test runners cannot run). Every RPC body is a **contract sketch**, not proven code. The merge gate for each server step is: author the migration → Security review → Coordinator applies on a Supabase branch → self-verifying `do $$` gate green → merge. |

The scrip-column slice is the smallest safe first apply, but it is NOT trivial: `hr_state_of` is a
generated body, so projecting `dungeon_scrip` is a full-body regenerate-and-replace that must be
branch-verified. It is also inert until the client reads it (step 6), so it does not stop the bleeding
alone. That is why the honest first deliverable is this contract, not a half-applied migration.
