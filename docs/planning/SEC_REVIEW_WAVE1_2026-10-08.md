# Security review — wave 1 (2026-10-08)

Reviewer: security-engineer (veto, CLAUDE.md §2). Read-only. Nothing was applied anywhere.
Branches: A `lane/c-client-authored-rewards` @f621a4dd (the item-5 push had not landed by the time of this review), B `lane/c-craft-anchor` @59c9f3bf, C `lane/content-holes` @21896497.

Evidence: every staged migration replays via `tests/schema-drift.mjs` (exit 0 on A, B and C). The §4 self-checks are real: four mutations each turned the replay red. Lone Hunt threshold 0 → `VERIFY(a)`. Pet client-claim refusal removed → `VERIFY(c)`. Pet daily cap removed → `VERIFY(f)`. Muster credited-kill discount removed → `VERIFY(c) 5580 points`. Every branch guard and selftest exits 0, except B `tools/econ-sim.mjs --selftest`, which exits 1.

| Item | Verdict | Required change (file:line) | Sev |
|---|---|---|---|
| A1 Lone Hunt chest | GO-WITH-CHANGES | `2026-10-10-lone-hunt-weekly-chest.sql:111`: subtract `sum(applied)` from `hr_kill_credit_log where free` for the hunt week. Raise the `hr_kill_credit_prune` floor (`2026-09-01-kill-daily-credit.sql:465`) to 8 days so the log still covers the week. Add a §4 case where 300 credited bounty-free kills are refused. Today a scripted client reaches 300 with no fighting (10,000/day free-credit ceiling). | Med |
| A2 Server pet roll | GO | Strictly better than today. Accepted residual: the attended top-up `n` is client-claimed but physics-capped. The depth-14 waiver is accepted ONCE. Condition: hr_apply gets no further anchored patch before the slice-7 restatement. `patch-chain-guard` accepts any ACK, so enforce this with a per-function depth ceiling. Nit: the grant is journalled as `kind='admin'` (pet-roll-server.sql:273). | Low |
| A3 Muster from server deltas | GO | none. Kills count as bestiary minus `ev:kill_credited`, and the bounty-free branch never writes the bestiary. The 2-arg RPC is dropped and the baseline swapped; grant hygiene is asserted. Residual: a player can time a settle into the window (cap 6,000/player). | — |
| A4 hundred_kills XP | GO | none. One award per (user, slot), ever. Skill routing follows only the player's own `hr_set_style` choice over server tables, at most 1,500 XP. The gate shares the accepted road_hunt residual. | — |
| A5 Dungeon scrip | NO-GO (pending push) | At f621a4dd the "pay only on a server-confirmed clear" ruling is not implemented. A failed manual run still pays full `scrip_base`. Re-review the push. | High |
| A6 Login ×3, gems flat | GO | none. The streak is derived on the server; this only lowers payouts. Needs the edge deploy. | — |
| A7 Weekly bars | GO | none. Display only; the client's local progress was removed. | — |
| B Craft anchor | GO-WITH-CHANGES | (1) The branch's own CI step `tools/econ-sim.mjs --selftest` is RED. Root cause: `src/core/vendor.js:151` caches results on the ITEMS object, so the selftest's in-place `ITEMS[PLANT]` (`tools/econ-sim.mjs:661`) is never priced. (2) `tests/vendor-shop-arbitrage.mjs:155` must add a buy-inputs-from-a-shop, craft, vendor-sell loop property. CONFIRMED on main: `deepbind_earth` pays 58 g for 49 g of shop `rune_blank`. B closes it, but nothing guards it. Rounding, cycles, no-input recipes and `constructor`/`__proto__` (bid 0) are clean, and no server sell path uses the old price. | Med |
| C Content holes | GO-WITH-CHANGES | (1) Apply only together with or after B. On its own, C adds vendor multipliers of ×2.44 (ember kiteshield), ×2.57 (dawn kiteshield), ×2.52 (elderscale aegis) and a `deepbind_air` shop loop; merged with B, every recipe is ≤1.5× with zero loops. (2) `tests/generated-frozen.mjs:57` `--pin` silently re-pins an EDITED applied file. CONFIRMED: edited `2026-08-11-catalogue.generated.sql` → GF-1 red → `--pin` → green. Refuse to overwrite an existing pin. | Med |

## Cross-cutting
- C's specific questions:
  - The only keyed delete is `hr_start_inventory(carrot_seed)`. Catalogue foreign keys cascade only to other catalogue tables, and `item-identity` blocks item-id deletion.
  - The egg hatch is server-consumed (`egg_consumed`); the client only mirrors it.
  - The deltas replay byte-identically.
  - LOW, Designer's call: the whetstone display names shift one tier (`copper_whetstone` is now named "Iron Whetstone").
- Pre-existing, not introduced here: bind-on-pickup quartermaster weapons sell to the vendor at full book value, so scrip converts to gold at up to 162 g/scrip (`dragonfang_pike`). A5's scrip rate feeds this directly.
- A and C conflict in `tests/schema-apply-order.json` and `tools/gen-raid-boss-rewards.mjs`. The authoring lane must merge, and the deltas must stay last.

## RE-VERIFY (2026-10-08, second pass)

Covers B `a5eecbfd`, C `60da1fd4` (contains B a5eecbfd) and A `026781cd` (contains C 11aa9993, i.e. B 59c9f3bf, NOT B final). A merged with C 60da1fd4 is conflict-free (tree `fd836c33`). That tree is green on every guard below, so B final reaches A only through that merge, which has not happened yet.

| Item | Verdict | Evidence (exit codes seen) |
|---|---|---|
| B craft anchor | GO | econ-sim `--selftest` 0. gold-intents 0, and its `--selftest` catches 29/29 mutants. vendor-shop-arbitrage 0, with 0 buy→craft→sell loops; its selftest flags the earth_rune loop by name under pre-anchor bids. Mutants: ignoring gearRate → RED (dawn_sword 2875 → 2875). Stale cache (`if (!hit)`) → RED (planted faucet invisible). Daily budget bypassed for `vendor_sell` only (tool-carry.sql:989) → G15 RED "39,000,000-gold sale was ACCEPTED". Neither rewritten test was weakened. Every bind-on-pickup scrip item bids 0, maul included. |
| A1 Lone Hunt | GO | Removing the bounty-free subtraction → §4 RED. Prune floor 8 days covers the 7-day week plus the 24h grace. |
| A2 pets | GO | PATCH-6 caps `hr_apply` at 14; its `--selftest` 0. |
| A4 item 4 self-check | GO, not a loosening | Dropping "family row names a known item" is inert, because a row for a nonexistent item matches no equipment. The new check runs in the reverse direction (every catalogued weapon has a family) and is stronger. combat-style F binds the table to items.js both ways: a `marowbone_maul` typo → RED. |
| A5 dungeon scrip | GO | Only `auto` pays; manual and scavenger pay 0. "Confirmed" here means the server's own level, cooldown and key gates; there is no fight simulation. Removing the mode check → §4 GATE(b) RED. |
| C content holes | GO | `--pin` now refuses to replace a pin (my bypass repro exits 1, registry unchanged). No arbitrage loops. Deltas replay byte-identically. schema-drift 0. |

**FINAL (Coordinator's last heads).** A `f369c785` has tree `fd836c33`, the exact tree tested above. It contains B `a5eecbfd` and C `60da1fd4`, which are the heads covered here. `pack-edge --hash` on that tree = `7c66432265fe…9b9aea2f`, which matches.

**Apply order: one change.** `schema-apply-order.json` lists kill-credit-prune-8d AFTER lone-hunt, but that file's own header says "apply BEFORE (or with) the lone-hunt file". Apply it FIRST. Correct order, one file per call: kill-credit-prune-8d → dungeon-scrip-fixed-by-mode → quest-combat-xp → lone-hunt-weekly-chest → muster-server-points → pet-roll-server → content-holes → catalogue.delta → dungeon-catalogue.delta → farm-catalogues.delta (deltas last). Run all ten outside 04:40 UTC (prune cron) and outside 00:00–00:10.

Residual accepted for the first hunt week: credit-log rows older than 2 days were already pruned, so bounty-free credits from before that are not subtracted. That is at most one chest per account.

**Edge: one deploy at `7c664322…` covers A + B + C**, but it must go AFTER all ten applies. The engine vendors C's new items and drops; proposing them to an hr_apply whose `hr_items` lacks them would refuse settles. The pet-roll and dungeon halves are safe in either order. After the deploy comes the client cut.
