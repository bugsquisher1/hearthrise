# LANE BRIEF — lane/cook-collect-toast (Lane A, client-only, P2)

## 0. Base, branch, hard rules
- BASE: `origin/main` at the SHA the Coordinator names in the routine prompt (b557 and b558 ship before this lane; do NOT assume 3879e05a). `git fetch origin && git checkout -b lane/cook-collect-toast <SHA>`.
- Read `src/build-info.js` `BUILD.cache` on that base (b556: `src/build-info.js:17` = 556; on origin/release/b557 and origin/set/b558 it is 557). Any NEW import you add under `src/**` carries `?v=<that number>`. This fix needs NO new import (the helper lives in the same file as its consumer), so the only `?v=` you should ever touch is none.
- Never: deploy, touch the DB, run `bump-version.sh <n>` (lane-done runs `./bump-version.sh --check`, which is read-only and fine), `git stash`, edit `tests/live-hash-drift.baseline.json`, commit `docs/reports/visual-qa/findings.json` or any report/summary file.
- Commits ≤ 8 lines, last line exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit and push early (`git push -u origin lane/cook-collect-toast`), then keep pushing.
- Every "green" you write is gated on an exit code you observed (`echo $?` after the command), never on expectation.

## 1. Player symptom
After a stretch of cooking or plank-sawing, the switch toast says "Collected 4m — +0 gold, +9723 XP, +0 items"; an unattended sync says "Synced — +9723 XP" with no items; the away toast and the Home away card say "+0 items"; the welcome-back modal omits its "Items found" row. After smithing the toast and card print "+-900 items". A combat night under-reports loot by every dish and arrow it used. Inventory is server-applied and correct; only the receipt text lies, which is the §6 "browser says one thing, server another" class.

## 2. Verified root cause (confirm it FIRST, stop if it does not hold)
`summaryFromAway` (src/net/accrue.js:5237-5247) reduces the server's SIGNED item map to a NET sum at :5240-5241:
```
const items = a.items && typeof a.items === 'object'
  ? Object.keys(a.items).reduce((s, k) => s + (Number(a.items[k]) || 0), 0) : 0;
```
and stores it as `gainedItems` (:5247). The engine writes every consumed input as a NEGATIVE entry in the same map as the output: artisan `removeItem` (supabase/functions/hr-accrue/accrual.js:3949-3958) → `itemDelta[id] -= take`; the signed contract is stated at accrual.js:4029-4036 ("Gains are the output (and burnt_food); the negatives are every input the night consumed") and combat's at :2623-2627; the map lands in `summary.items` at :4224. Gathering never debits (:3661 `if (n <= 0) continue;`), which is why gather receipts are correct.

Three routes carry that map to the toast unchanged:
1. Switch collect: set-activity.js:1069-1070 `items: out.summary.items` → activity.js:501 `awayFromCollected` (`items: c.items`, :519) → activity.js:884 `summaryFromAway(awayFromCollected(collected), env)`.
2. Away/sync settle: index.ts:1733 `items: out.summary.items` → summaryFromAway.
3. Boot/reload restore (skeptic addition): `reconcileAwayReceipt` (accrue.js:5189-5232) passes `player_state.last_away_receipt` through `summaryFromAway(stored, res)` at :5206; the stored map is signed on purpose (away-receipt.js:80-86 `mapOf`: "`items` stays SIGNED", :122 `items: mapOf(s.items)`). So the wrong count survives every reload until the next away night.

Readers of `gainedItems` (all inherit the bug, none needs its own edit): `receiptCredit` :5449-5456 (and `any`); `receiptSentence` switch :5765-5768, sync :5774-5778 (`c.items > 0` hides the part), death :5819-5822, away :5829-5830; `receiptNotice.announce` :5640-5646 (a debit-heavy unattended sync is wrongly SILENT today); src/features/home-dashboard.js:614 (`num()` at :427 is `(n|0).toLocaleString()`, so it prints "+-900 items"); src/legacy.js:13376 "Items found" (`> 0`, row dropped; b558: :13325), :7324 #dash-active offline line (display:none on live; b558: :7314), :2165-2166 fallback sentence; src/features/session-tally.js:77 `drops: Math.max(0, …)` → 0 Drops/h for artisan sessions (:183 label).

Ruled out: no key mismatch (receipt has one `items` map, no `output`); no per-kind filter; not timing (activity.js:852 applies the envelope before :884 builds the summary; legacy.js:2087 before the toast). The inventory reconcile reads the sign correctly on the away/sync path (`consumedKeysOf` accrue.js:1345-1354, used at :4856) — but NOT on the switch path: `envelopeOf` (activity.js:403-416) builds the envelope without an `away` key, so the reconcile never sees `collected.items`. That is a separate root (see §7).

MEASURED (read-only node probe, real `summaryFromAway`/`receiptSentence`/`awayFromCollected`, exit 0, no window shim):
- cook {shrimp:-937, cooked_shrimp:864, burnt_food:73}: gainedItems 0 → "Collected 4m — +0 gold, +9723 XP, +0 items" / "Synced — +9723 XP" / "⏰ Away 8h — the server credited +0 items, +9723 XP, +0 gold".
- cook maxed {shrimp:-937, cooked_shrimp:937}: 0 → same shape with +10307 XP.
- smith {bronze_bar:-900, normal_plank:-900, bronze_axe:900}: -900 → "+-900 items" on switch AND away.
- combat {goblin_ear:102, bones:211, cooked_shrimp:-103, goblin_seal:2, bronze_sword:11}: 223, but 326 units entered the bag.
- gather {normal_log:750}: 750 (control, correct).

CONFIRM STEP (mandatory, ~1 min): on your base, run this probe from a scratch file OUTSIDE the repo (do not commit it):
```
import { pathToFileURL } from 'node:url';
const A = await import(pathToFileURL(process.cwd()+'/src/net/accrue.js').href);
const M = await import(pathToFileURL(process.cwd()+'/src/net/activity.js').href);
const s = A.summaryFromAway(M.awayFromCollected({ ms:240000, xp:{cooking:10307}, items:{shrimp:-937,cooked_shrimp:937}, levelUps:[] }), {version:1}); s.source='switch';
console.log(s.gainedItems, A.receiptSentence(s,{spanLabel:()=>'4m'})); process.exit(0);
```
Expected on the base: `0 Collected 4m — +0 gold, +10307 XP, +0 items`. If it prints +937, the mechanism does not hold on your base: STOP, report, do not code. (Node import of these two modules exits cleanly WITHOUT a `globalThis.window` shim; WITH the shim the process hangs — measured exit 124 at 15 s. Never shim window; end with `process.exit(0)`.)

Line-number note for your base: every accrue.js line cited up to :5830 and all activity.js/home-dashboard.js/session-tally.js lines are identical on b556, b557 and b558. b558 rewrites `showReplacementSheet` (accrue.js:6326-6356) to `.hr-sheet`, so `window.HearthriseAccrual = {` moves :6438→:6439 and the `equippedCount, unaccountedEquipped, consumedKeysOf,` publication line moves :6473→:6474. legacy.js moves :7324→:7314 and :13376→:13325. Grep, do not trust numbers.

## 3. Class list — fixed by the ONE seam in §4 (verify each after the fix)
| # | Site | Symptom today |
|---|---|---|
| 1 | accrue.js:5240-5241 summaryFromAway | THE ROOT: nets the signed map |
| 2 | accrue.js:5765-5768 switch sentence | "+0 items" (cook/craft), "+-900 items" (smith) |
| 3 | accrue.js:5774-5778 sync sentence | items part dropped entirely |
| 4 | accrue.js:5819-5822 death sentence | items omitted when debits cancel drops |
| 5 | accrue.js:5829-5830 away sentence | "+0 items" / "+-N items" |
| 6 | accrue.js:5449-5456 receiptCredit.items + `any` | under-states; drives #7 |
| 7 | accrue.js:5640-5646 receiptNotice.announce | debit-heavy unattended sync wrongly silent (announce half of the same root) |
| 8 | accrue.js:5189-5232 reconcileAwayReceipt | boot restore of last_away_receipt re-nets the signed stored map → wrong Home card/modal after every reload |
| 9 | home-dashboard.js:614 awayCardHtml | "+-900 items" (num keeps the sign; `if (off.gainedItems)` true for negatives) |
| 10 | legacy.js:13376 (b558 :13325) "Items found" | row dropped on every artisan night |
| 11 | session-tally.js:77 receiptGains.drops | 0 Drops/h for artisan; combat under by food |
| 12 | legacy.js:7324 (b558 :7314) and :2165-2166 | same text; hidden / fallback-only |
NOT this class (do not touch): dungeon loot (src/net/dungeon-settle.js:229-236, own positive-only path); farm harvest (no receipt toast); gather (positive-only map; the control case).

## 4. Fix design — ONE seam, client-only, toast/receipt text only, NOT LANE C
Fence, stated: `supabase/functions/hr-accrue/**` imports only `src/core` (33 imports) and `src/data` (18); `src/net` appears there only in comments. So no pack-edge hash change, no edge deploy, no migration, no Security GO. Nothing gates on `gainedItems`: `creditServerAwayKills` reads kills only (legacy.js:2066); `receiptNotice.announce` only decides whether a toast shows; `lastOfflineSummary` is display state rebuilt from the envelope. hr_apply's receipt check is signed and per-entry (supabase/migrations/2026-09-14-hr-apply-restatement.sql:1712-1716) and is untouched.

(1) `src/net/accrue.js`, immediately after `consumedKeysOf` (:1345-1354): add a pure exported helper
```
export function itemMovesOf(items) {
  const out = { gained: 0, usedIds: new Set() };
  if (!items || typeof items !== 'object' || Array.isArray(items)) return out;
  for (const k of Object.keys(items)) {
    const n = Number(items[k]);
    if (!Number.isFinite(n) || n === 0) continue;
    if (n < 0) out.usedIds.add(k); else out.gained += n;
  }
  return out;
}
```
Docblock ≤ 4 lines, no build number in it (CR-2/CR-3). `gained` = units the server put in the bag (the engine's own contract, accrual.js:4029-4030); `usedIds` = ids with a negative entry (same predicate as consumedKeysOf :1350-1351).

(2) `consumedKeysOf` (:1345-1354) stays BYTE-IDENTICAL in this lane. Both skeptics: it feeds `omissionIsZero` at accrue.js:4856-4865, the predicate that can zero/delete an omitted item on the merge path — the one inventory-write seam this "text-only" lane must not touch. Test (g) below pins that the two readings agree.

(3) `summaryFromAway` :5240-5241 becomes
```
const items = itemMovesOf(a.items).gained;
```
(two lines → one; net −1 code line in accrue.js). That single change fixes class rows 2-12.

(4) Publish it: add `itemMovesOf` to the `window.HearthriseAccrual` object on the `equippedCount, unaccountedEquipped, consumedKeysOf,` line (:6473 on b556/b557, :6474 on b558 — grep for the line). The smoke test consumes `A.itemMovesOf`, which is a token in another file, so `tests/dead-exports.mjs` (rule (a)-(e) at its :12-40) stays green.

(5) NOT in this commit: `collectedOf` (activity.js:490-494) still uses `sum(c.items)`; there is no visible effect because `Number(c.ms) > 0` at :494 also passes and every server receipt states `ms` (set-activity.js:1070). It moves to the hardening branch (§6) with its own unit pin. Do not claim a test for it here.

Expected diff: accrue.js ≈ +12/−2 lines, one smoke test block, nothing else. legacy.js: 0 lines (the monolith ratchet has ~0 headroom on b558: baseline 19074 vs measured 19073-19074 physical lines; on b556 19186 vs 19172).

## 5. Regression tests (same commit as the fix)
File: `src/features/smoke/monsters-inventory-and-brand.js`, insert directly after `SYNC-4` (the `tryRun('SYNC-4: …')` block ending at :5377; same line on b558). Shape: `() => tryRun('RECEIPT-ITEMS-1: …', () => { const A = window.HearthriseAccrual, M = window.HearthriseActivity; … })`. `awayFromCollected` and `collectedOf` are published on `window.HearthriseActivity` (activity.js:1273, :1281); `reconcileAwayReceipt` and `__resetAwayReceipt` on `window.HearthriseAccrual` (:6519, :5606). `HearthriseHome.__awayCardHtml` is the card seam (home-dashboard.js:1871; b558 :1872).

Fixtures (engine-MEASURED maps):
- COOK_MAX = {shrimp:-937, cooked_shrimp:937}, xp {cooking:10307}  ← the exact-sentence pin
- COOK_BURN = {shrimp:-937, cooked_shrimp:864, burnt_food:73}, xp {cooking:9723}
- SMITH = {bronze_bar:-900, normal_plank:-900, bronze_axe:900}, xp {smithing:13500}
- COMBAT = {goblin_ear:102, bones:211, cooked_shrimp:-103, goblin_seal:2, bronze_sword:11}
- GATHER = {normal_log:750}

Assertions (RED on base / GREEN after):
(a) ATTENDED switch (the reported path): `s = A.summaryFromAway(M.awayFromCollected({ms:240000, xp:{cooking:10307}, items:COOK_MAX, levelUps:[]}), {version:1}); s.source='switch'` → `A.receiptSentence(s,{spanLabel:()=>'4m'}) === 'Collected 4m — +0 gold, +10307 XP, +937 items'`. RED: '+0 items'.
(b) ATTENDED-but-unwatched sync: `A.summaryFromAway({grantMs:90000, xp:{cooking:10307}, items:COOK_MAX},{version:1})` (the span is read from `grantMs` only, :5239; an `awayMs` input is ignored) → `A.receiptSentence(sync) === 'Synced — +937 items, +10307 XP'`. RED: 'Synced — +10307 XP'.
(c) AWAY: `A.summaryFromAway({grantMs:8*3600000, xp:{cooking:10307}, items:COOK_MAX},{version:2})` → `'⏰ Away 8h — the server credited +937 items, +10307 XP, +0 gold'`. RED: '+0 items'.
(d) SMITH: `gainedItems === 900`; switch sentence `'Collected 4m — +0 gold, +13500 XP, +900 items'`; `A.receiptSentence(away)` and `window.HearthriseHome.__awayCardHtml(away)` contain no `'+-'`. RED: -900 / '+-900 items'.
(e) COMBAT: `A.summaryFromAway({grantMs:8*3600000, items:COMBAT, xp:{attack:500}}).gainedItems === 326`. RED: 223.
(f) CONTROL: GATHER → 750, green before and after (non-vacuity).
(g) ONE CONVENTION: `[...A.consumedKeysOf({away:{items:SMITH}})].sort()` deep-equals `['bronze_bar','normal_plank']` and `[...A.itemMovesOf(SMITH).usedIds].sort()` equals the same; same for COOK_MAX → ['shrimp'].
(h) ANNOUNCE HALF: `A.receiptSentence(A.summaryFromAway({grantMs:90000, xp:{}, items:COOK_MAX},{}))` → `'Synced — +937 items'`. RED: null (credit.any false → silent).
(i) RESTORED RECEIPT (both paths of route 3): `const G = {}; const r = A.reconcileAwayReceipt(G, {state:{last_away_receipt:{grantMs:8*3600000, awayMs:8*3600000, at:Date.now()-60000, gold:0, xp:{smithing:13500}, items:SMITH, kills:0}}})`; assert `r.gainedItems === 900 && G.lastOfflineSummary.gainedItems === 900 && r.restored === true`; then `A.__resetAwayReceipt()` in a `finally` (it fills the module holder at :5231; tear it down, §4). RED: -900.
(j) BURN MAP, property-only (do NOT pin the sentence — the burnt_food copy ruling is the Game Designer's, see §8): `const g = A.itemMovesOf(COOK_BURN).gained; assert(g >= 864 && g !== 0)`; and `String(A.receiptSentence(sw)).indexOf('+-') === -1`. RED: 0.

Existing tests stay green: record-seam-and-hydration.js:2211/2312 ({rat_tail:3} → 3) and :6209 ({…:3} → 3) are positive-only maps; the consumedKeysOf blocks at monsters-inventory-and-brand.js:4540-4605 and :4826-4842 are untouched because consumedKeysOf is untouched.

Node-level RED/GREEN loop (fast, no browser, use it while iterating): the §2 probe extended with the fixtures above. It is your proof for the commit message; the in-page run is the record.

MUTATION PROOF (run each, quote results in the commit message, then revert):
- M1: restore the signed reduce at :5240-5241 → (a)(b)(c)(d)(e)(h)(i)(j) RED, (f)(g) green.
- M2: flip `n < 0` to `n > 0` in itemMovesOf → (a)-(e),(h),(i),(j) RED AND (g) RED (the two readings now disagree). Because consumedKeysOf is untouched, the existing consumedKeysOf tests stay green under M2; (g) is the pin that catches it.

## 6. Hardening — SECOND branch `lane/cook-collect-toast-hardening`, parallel, never blocks the fix
`tests/receipt-item-count.mjs` (node-only, no browser, no network): drive `computeAccrual` (import from `../supabase/functions/hr-accrue/accrual.js`, `PAYABLE_KINDS` at accrual.js:722 = ['combat','gather','artisan']) for one cook, one smith, one craft recipe from `ARTISAN_RECIPES`, one gather node, and combat with auto-eat, using the fixture pattern of tests/artisan-accrual.mjs:113-137 (imports :43-68: ITEMS, MONSTERS, ARTISAN_RECIPES from src/data; GATHER_NODES/ARTISAN_RECIPES_ALL from hr-accrue/catalogue.js). Assert, for both receipt shapes — switch (set-activity.js:1068-1085 via `awayFromCollected`) and away (index.ts:1731-1733) — that `summaryFromAway({…, items: out.summary.items}).gainedItems === Σ positive(out.summary.items)`. Compare against `out.summary.items`, NOT the merged delta: `mergeWorkers` (index.ts:1144-1151) folds crew items into the applied delta but index.ts:1452/1486/1733 leave them out of the receipt (§7), and comparing to the delta would go red on that separate root. Carry `--selftest` that swaps in a signed-sum translator and must go RED on cook/smith/craft/combat and green on gather; the flag must change the exit path (guard-hygiene NON-VACUITY, tests/guard-hygiene.mjs:51-56). Import precedent for src/net/accrue.js in node: tests/away-receipt-journal.mjs:466. Never shim `window`; end with `process.exit(0)`. Register plain + `--selftest` in `.github/workflows/smoke.yml` under the client-guards job (pattern: smoke.yml:2675-2678 `node tests/no-new-prediction.mjs` / `--selftest`; b558's additions at the same job are the current style), then `node tests/ci-shape.mjs --write` to regenerate `tests/ci-shape.baseline.json` (its own tool; never hand-edit), and confirm `node tests/guard-hygiene.mjs` exit 0. Also on this branch: `collectedOf` (activity.js:490-492) → `itemMovesOf(c.items).gained`, added to the existing `from './accrue.js?v=<base>'` block (:78-84), with a unit pin in the same node guard: `collectedOf({collected:{ms:0, items:{a:-5,b:5}}})` returns the receipt after (gained 5) and null before.

## 7. NOT this lane — file separately, do not bundle
- CREW HAUL under-count (edge, own lane A): index.ts:1452/1486 `withAwayReceipt(mergeAux(out.delta), out)` and :1733 `items: out.summary.items` omit the crew items `mergeWorkers` folds in (:1144-1151); only the crew-only settle reports them (:1310). Fix = build `away.items`/`awayReceiptFor` from the merged delta; needs pack-edge + deploy + payload_sha256 verify; must prove the stored receipt stays within the 64-key/2 KB cap (away-receipt.js:62). After this lane the toast still under-counts by the crew haul.
- SWITCH-PATH RECONCILE BLINDNESS (Systems, separate root): `envelopeOf` (activity.js:403-416) carries no `away`, so `consumedKeysOf` (:4856) never sees a switch collect's debits. Likely masked by local `removeItem` in `doArtisanAction` (legacy.js ~15069) while the absolute-inventory arm is staged off.
- mapOf 64-key cap before zero-drop (away-receipt.js:80-86): a >64-id night's restored card can differ from the live toast. Edge, low probability.
- COPY (Game Designer): home-dashboard.js:866-872 (b558 :875) attributes a cooking night to "gathering or crafting" and its comment "cooking/farming do not bank" is stale (`benchPayable('cooking')` is true, src/core/artisan-sim.js:592); burnt printed twice once `gained` counts burnt_food (home-dashboard.js:614-615; legacy.js:13376+13380, b558 :13325+:13331; :7324); "Items found" and "Drops/h" (session-tally.js:183) now include crafted output and no longer subtract eaten food/ammo, and no surface has a "food eaten" row.

## 8. Constraints that bite
- `src/legacy.js`: touch 0 lines (MONO-1 ceiling has ~0 headroom on b558). New code goes in src/net/accrue.js only (it is where the seam is); nothing in src/render or src/features is needed.
- CR-1 (tests/comment-ratio-ratchet.mjs): accrue.js is pinned at ratio 1.526 (baseline: comment 2635 / code 1727); allowance = base.comment + 1.526 × max(0, code gained) (`commentAllowance`, ratchet :207-210). Your net code change is ≈ +8 lines → ≈ +12 comment lines of room. Keep the helper's docblock ≤ 4 lines. No `b\d{3}` in any new comment (CR-2/CR-3). monsters-inventory-and-brand.js is also pinned: keep the test's prose to a few lines. Check with `node tests/comment-ratio-ratchet.mjs --report` before committing.
- test-file-ratchet: +1% band on smoke CODE lines corpus-wide (tests/test-file-ratchet.mjs:55-62); one test block is well inside it.
- PRED-4 (tests/no-new-prediction.mjs:33-36, :270-276): no new exported `reconcile*` name in src/net. `itemMovesOf` is fine.
- dead-exports: `itemMovesOf` must be referenced outside accrue.js (the smoke test's `A.itemMovesOf` is that reference).
- No CSS, no `@media`, no colours, no `?v=` outside src/**. No new file under src/.
- Screenshots: NO rendered surface changes shape (the sentence templates are unchanged; only the number moves), so no `qa/cook-collect-toast` push is required. If you change ANY visible copy, push PNGs only, at 1280x800 and 922x423 of the toast and the Home away card, to `qa/cook-collect-toast` (never to the lane branch), and say so in the report.

## 9. Gates (quote the exit code of each)
1. §2 confirm probe on the base → prints 0 / '+0 items' (else STOP).
2. Fix + test committed; node loop proves (a)-(j) GREEN; M1, M2 RED as listed; revert mutations; commit message carries the mutation lines.
3. `node tools/lane-done.mjs` → exit 0. It runs bump-version --check, monolith/comment/test-file ratchets, patch-chain, no-client-xp-mint, property-gate-census, dead-exports, dead-css, window-globals-exist, no-duplicate-toplevel-fns, token-single-source, css-literal-ratchet, breakpoint-guard, no-client-copy-of-projection, no-new-prediction, utc-midnight-replay, settle-carry-defer (+--mutate), ledger-rollup (+--mutate), ci-shape, guard-hygiene, snapshot-allowlist --selftest (tools/lane-done.mjs:7-67). PGlite steps need only node_modules (`@electric-sql/pglite` in package.json:52), no network. Any RED: read the guard's own first lines, fix the cause; never loosen a guard.
4. `HR_CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/run-smoke.mjs` once (run-smoke.mjs:2083 reads HR_CHROME; the harness sets `window.__HR_TEST_HARNESS__=true` itself, :888). Supabase and Google Fonts are unreachable in the clone: list every ✗ by name and classify each as ENVIRONMENTAL (Supabase/fonts/network) or REAL. RECEIPT-ITEMS-1 must be ✓. Report the in-page result as "run in the cloud, Supabase unreachable, N environmental reds named" — never as "green" if any ✗ exists. The Coordinator's GitHub run is the record.
5. Push. Open no PR unless the routine says to.

## 10. Final report format (in the routine's final message; no files)
Table first: item → status (done / red / not run) → evidence (command + exit code, or ✗ name + classification). Then ≤ 3 sentences. Then the Change Contract fields (.claude/coordination/PROFESSIONAL_STANDARD.md:44-51): Agent/Branch/Purpose; Files changed + intentionally untouched (name consumedKeysOf, collectedOf, legacy.js as untouched); Dependencies/conflicts (state that b557/b558 only shift accrue.js publication line and legacy.js lines, no semantic conflict); Test results (smoke ✓/✗ counts, lane-done exit code, M1/M2 outcomes); Runtime verification (node probe before/after, verbatim sentences); Known limitations (crew haul, switch-path reconcile blindness, burnt copy pending Game Designer, in-page suite ran without Supabase, UNPLAYED); Commit SHAs for lane/cook-collect-toast and, if started, lane/cook-collect-toast-hardening. End with the three Game Designer questions from §7 as one line each. Say "pushed, unplayed"; never "shipped".