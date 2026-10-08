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
