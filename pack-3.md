# Content pack 3: 3. Ledger of Firsts: the collection log grows from 4 rungs to 11

VERDICT (security/systems pre-review): GO-WITH-CHANGES | class C

## PLAYER VALUE
Today the collection log pays at 10 monsters and then not again until all 108. With this pack, discovering new monsters and new drops pays gold every few hours of progress, and the log always shows the next rung.

## THE CORRECTED LANE BRIEF (execute this)
LANE lane/c-ledger-of-firsts: Collection log grows from 4 rungs to 11. This is lane C (money: credits gold) with an edge half and a client half. Security verdict: GO-WITH-CHANGES. Every item below is a condition of that verdict; none is optional.

BASE
- Branch from the origin/set/b554 tip. smoke.yml, ci-shape, schema-apply-order and schema-drift baselines have all moved there.
- Merge pack 1 (Lucky Finds) into this branch once it lands in the set.
- Before reporting, merge the set (or next) into this branch yourself and resolve every conflict. JSON baselines are regenerated only by their own tools.
- No git stash.
- FALLBACK: if pack 1 is not in the set when everything else is green, remove collect125 from all three places (catalogue, client rows, SQL arm), ship 10 rungs, and say so in the report.

ROWS (src/data/collection-milestones.js COLLECTION_MILESTONES; the client label is in quotes; new rows omit gems):
Monsters:
- hunter10: 10, 2000 g, 'Novice Hunter' (existing)
- hunter25: 25, 4000 g, 'Journeyman Hunter'
- hunter40: 40, 8000 g, 'Tracker'
- hunter60: 60, 15000 g, 'Beastwise'
- hunter85: 85, 25000 g, 'Warden of the Wilds'
- hunterAll: MONSTER_TOTAL (108), 50000 g + 25 gems, 'Bestiary Master' (existing)
Items:
- collect25: 25, 1000 g, 'Magpie'
- collect50: 50, 5000 g, 'Collector' (existing)
- collect75: 75, 10000 g, 'Curator'
- collect100: 100, 15000 g + 15 gems, 'Hoarder' (existing)
- collect125: 125, 30000 g, 'Keeper of Rarities'

1) SERVER: NEW supabase/migrations/2026-09-27-ledger-of-firsts.sql (STAGED; never apply it yourself)
- §0, fail closed if any of these is missing: hr_claim_milestone(text,int), hr_claim_milestone__ungated(text,int), hr_bestiary_of(uuid,int), hr_collection_of(uuid,int), hr_note_rejection(text,int,jsonb).
- §1: `create or replace function public.hr_claim_milestone__ungated(p_milestone_id text, p_slot int)`. Copy the 2026-08-22-collection-claim.sql §4 body VERBATIM (production carries exactly that body, measured 2026-09-26). Replace only the CASE, with 11 arms in the existing one-line shape: `when '<id>' then v_domain := '<d>'; v_thresh := <n>; v_gold := <g>; v_gems := <m>;`. Then run `revoke execute on function public.hr_claim_milestone__ungated(text, int) from public, anon, authenticated, service_role;`.
- Do NOT touch the wrapper hr_claim_milestone. Its live body routes through hr_note_rejection, and copying 2026-08-22 §5 would delete the refusal journal.
- Do NOT touch hr_rpc_gate, player_ledger_kind_check or hr_client_rpc_baseline.
- Do NOT use pg_get_functiondef or prosrc anywhere. A body read-back makes live-hash-drift's `pin` rule track the function, and that baseline is Coordinator-only.
- §4 self-check: run everything by EXECUTION inside one discarded subtransaction (the 2026-08-22 §6 gate(c) shape, HR8xx errcode) with a synthetic uid.
  (a) Grants: __ungated is NOT executable by authenticated, anon or service_role. The wrapper IS executable by authenticated and NOT by anon.
  (b) The whole catalogue: build a VALUES table of the 11 expected (id, domain, threshold, gold, gems). For each domain, walk ascending thresholds:
    - seed distinct rows up to threshold-1 (kind 'stat', period '', keys ev:kill_monster:m<i> or ev:loot:i<i>); the claim must return 'incomplete' with goal = threshold;
    - seed up to threshold; the claim must be ok, with the player_state gold delta == gold and the gems delta == gems exactly;
    - a replay must return 'already_claimed' with the balance unchanged.
  (c) Distinct discriminator: two item ids with qty 40 and 12 → collect25 returns 'incomplete' with have = 2.
  (d) The wrapper: `public.hr_claim_milestone('no_such_milestone', slot)` returns 'unknown_milestone' AND an hr_rejections row exists for the uid.
  (e) Collection ledger rows == the number of ok claims.
  (f) hr_assert_grant_hygiene(false) reports no unapproved and no ungated client RPCs.
  After the subtransaction, a zero-leak check across player_state, player_ledger, player_progress, hr_rejections and auth.users. The whole file must be idempotent.
- tests/schema-apply-order.json: append the file to `order` after 2026-09-26-party-view-volatile.sql (and after pack 1's files, if any). Add an `_order_notes` entry saying: STAGED, NOT APPLIED, Security GO REQUIRED (credits gold); restates __ungated only; 11 arms; +93,000 gold per slot; 0 new gems; wrapper, gate and grants untouched; apply BEFORE the edge deploy and the client push; no live-hash re-measure owed.

2) EDGE: supabase/functions/hr-accrue/index.ts
- The server's collection count is on no envelope today.
- In the read transaction that already reads hr_bestiary_of (about line 700), add its own savepoint: `select count(*)::int as n from public.hr_collection_of(${user}::uuid, ${slot}::int)`. Use the verified user only, never a body field. hr_engine already has EXECUTE on it and it is on the allowlist (verified live).
- Error 42883, and only 42883, degrades to null. Any other error propagates.
- Emit `collection: { found: n }` at every site that spreads `bestiary` (about lines 1293, 1319, 1496, 1512). Omit the key when the value is null.
- Test: extend tests/trophy-wire-shape.mjs, or add tests/collection-wire-shape.mjs and register it in smoke.yml. Cover the present-key shape, omission on 42883, and propagation of any other error.
- Report the output of `node tools/pack-edge.mjs hr-accrue --hash`.

3) CLIENT
- src/features/collection-log.js:
  - MILESTONES become data: `{id, label, domain:'monsters'|'items', goal:n, reward:{gold[,gems]}}`. hunterAll gets goal 108. One function decides earned; delete the per-row test functions.
  - Earned reads ONLY server counts. Monsters = the number of keys in G._bestiaryTrophies.killsByMonster. Items = G._collectionServer.found, mirrored from the `collection` block. If a mirror is absent the count is 0 and nothing is claimable.
  - G.bestiary and G.collection only draw the grid. They never gate a rung.
  - Claimed = G.collectionLog.claimed merged with the envelope's `progress` rows that have kind 'collection', period '' and a key that is a MILESTONES id.
  - Export noteServerCounts(res) and noteServerClaims(progress).
  - open(): per domain, render the claimable rungs as today, PLUS the next unearned rung as a line '<label>: <have>/<goal> monsters|combat drops' with its reward and no button.
  - The two-phase claim and the refusal copy stay unchanged.
- src/net/accrue.js: call the two exports, each in its own try. Put the counts call next to hrNoteServerTrophies (about line 1000) and the claims call next to HearthriseDaily.markServerClaim (about line 3614).
- src/features/home-dashboard.js (about line 1699, the Collection-log tile): show 'Claim ready' when any rung is claimable, else 'Next: <label> <have>/<goal>', from the same server counts.
- Tokens only, no emoji, no hardcoded colours.

4) GUARD: tests/collection-renown-claim-drift.mjs
- The chain-end SQL is the LAST file in schema-apply-order.json `order` that contains `create or replace function public.hr_claim_milestone__ungated`. A CONTROL fails if there is none.
- Client rows are parsed as data. id, domain, goal, gold and gems are checked in both directions against the catalogue AND the SQL arms.
- Row count == the size of the catalogue (remove the hard-coded 4). hunterAll goal == MONSTER_TOTAL == the number of monsters in monsters.js.
- Within each domain, thresholds AND gold strictly increase.
- Every id outside the original four has gems 0.
- Reachability: every items threshold <= the size of the union of MONSTERS[*].drops ids; every monsters threshold <= MONSTER_TOTAL.
- Add a real --selftest. Today the flag is ignored and exits 0. Each of these mutations must turn it RED:
  - drop the hunter40 SQL arm;
  - hunter40 gold 9000 in the client rows only;
  - hunter40 goal 45 in the client rows only (today's guard passes a client-only threshold change);
  - collect75 domain changed to monsters in the client rows only;
  - collect125 = 141;
  - collect75 gems 5;
  - an older file picked as the chain end.
- Register `--selftest` in .github/workflows/smoke.yml and regenerate tests/ci-shape.baseline.json with its own tool.

5) IN-PAGE: src/features/smoke/companions-claims-and-renown.js
- LEDGER-1: the server mirror has 25 monsters (fed by a hrNoteServerTrophies stub body) while G.bestiary holds 40. hunter25 is claimable and hunter40 is NOT. A stubbed {ok:true, gold:4000} marks it claimed; a replay shows the already_claimed copy.
- LEDGER-2: G.collection holds 30 ids and the server found = 10. collect25 is NOT claimable and the next-rung line reads 10/25. With found = 25 it is claimable.
- LEDGER-3: a server progress row {kind:'collection', key:'hunter25', period:'', state:'claimed'} with the residue unclaimed → hunter25 is not claimable.
- LEDGER-4: no mirror → zero claimable rungs.
- Re-seed the existing hunter10 tests through the server mirror: this file around lines 319-451 and src/features/smoke/hunt-raids-and-screens.js around lines 544-590.
- Show that each new test FAILS when the gate is pointed back at G.bestiary or G.collection.

GATES (report exit codes you saw, not expectations):
- collection-renown-claim-drift, plain and --selftest.
- node tests/schema-drift.mjs: the chain replays and a second apply is byte-identical.
- apply-order-honesty.
- node tests/live-hash-drift.mjs (credential-free). It must be green. If it names hr_claim_milestone*, you read a body back; remove that. Never edit its baseline.
- restore-census: no change expected.
- no-client-copy-of-projection.
- The wire-shape test.
- node tools/lane-done.mjs: green; paste its last line.
Do NOT run the in-page suite locally, do NOT apply the migration, and do NOT deploy.

SHIP ORDER (Coordinator):
- Security GO on the SQL file.
- Apply it with tools/apply-migration.mjs.
- Edge deploy, then confirm the live payload_sha256 equals the pack-edge hash.
- The client ships at the daily cut. Visual gate on the Collection log modal and the Home tile, desktop and 922x423.
- Flip the stale 2026-08-22-collection-claim.sql note to APPLIED (production carries it).

NOT IN THIS LANE:
- (a) The bounty-cycle bestiary mint. hr_accept_bounty__ungated accepts any in-tier target, and the bounty branch of hr_credit_kills__ungated has no active_id check. That is a separate lane C. Until it lands, this is a bounded, journalled residual. Detection query: count(distinct target) > 6 per character per day from hr_kill_credit_log where not free.
- (b) Retiring the collectionLog residue.
- (c) Projecting item ids for the log grid.

ESTIMATE: about 3.5 h.

## THE DESIGNER'S ORIGINAL SPEC (rows, rates, tests; the brief above wins where they differ)
### contents
WHAT CHANGES: seven gold-only rungs added to COLLECTION_MILESTONES, beside the four existing ones. Each reward is about 1.2-1.5 h of income at the tier where the rung is reached (measured coins: T1 ~1k/h, T3 ~6.5k/h, T4 ~11k/h, T5 ~20k/h, T6 ~30k/h). New rungs pay 0 gems: no new premium-currency faucet.

MONSTERS domain (distinct monsters killed, from hr_bestiary_of):
- hunter10: 10, 2,000 g (existing)
- NEW hunter25 'Journeyman Hunter': 25, 4,000 g. T1's 14 monsters plus 11 of T2.
- NEW hunter40 'Tracker': 40, 8,000 g
- NEW hunter60 'Beastwise': 60, 15,000 g
- NEW hunter85 'Warden of the Wilds': 85, 25,000 g
- hunterAll: 108, 50,000 g + 25 gems (existing)

ITEMS domain (distinct combat drops, from hr_collection_of over ev:loot:%):
- NEW collect25 'Magpie': 25, 1,000 g. Reachable inside T1, which has 28 distinct drops.
- collect50: 5,000 g (existing)
- NEW collect75 'Curator': 75, 10,000 g
- collect100: 15,000 g + 15 gems (existing)
- NEW collect125 'Keeper of Rarities': 125, 30,000 g. There are 113 distinct drops today and 140 after pack 1, so this rung is the Lucky Finds long chase.

ECONOMY: +93,000 gold lifetime per character slot, one-off and once-guarded. That is 2.2% of the game's 4.23M of one-off gold sinks.

SERVER HALF: a new migration restates hr_claim_milestone__ungated with the 11 CASE arms and nothing else. The DISTINCT re-derivation, the once-guard, the ledger row and the revoke/grant are unchanged. The function is not in the live-hash baseline, so no re-measure is owed.

CLIENT HALF: seven rows in src/features/collection-log.js MILESTONES, in the existing {id, label, test, reward} shape.

DEPLOY ORDER: apply before the client push. Otherwise the client offers a rung the server answers with unknown_milestone, which is the browser-vs-server P1 class.
### files
src/data/collection-milestones.js; src/features/collection-log.js (MILESTONES rows at lines 41-44 only); NEW supabase/migrations/2026-09-27-ledger-of-firsts.sql (body restatement plus a §4 self-check); tests/collection-renown-claim-drift.mjs (read the NEWEST migration that defines hr_claim_milestone__ungated instead of the hard-coded 2026-08-22 file; add reachability and monotonicity checks); src/features/smoke/companions-claims-and-renown.js (LEDGER-1..2)
### tests
NODE collection-renown-claim-drift, extended:
- all 11 arms are bound across the module, the collection-log rows and the chain-end SQL;
- within each domain, thresholds AND gold strictly increase;
- every new rung has gems = 0;
- REACHABILITY: every items threshold <= distinct drop ids across MONSTERS (140 with pack 1), and every monsters threshold <= MONSTER_TOTAL.
--selftest mutations that must each turn it RED: drop the hunter40 SQL arm; set hunter40 gold to 9,000 in collection-log.js only; set collect125 to 141; give collect75 gems:5.

IN-PAGE:
- LEDGER-1: seed 25 distinct bestiary kills. hunter25 is claimable and hunter40 is not. A stubbed server credit {ok:true, gold:4000} marks it claimed; the replay shows the already_claimed copy.
- LEDGER-2: seed 25 distinct collection items. collect25 is claimable.

MIGRATION §4, executed on a synthetic user inside a discarded subtransaction (the existing gate(c) pattern):
- hunter25 with 24 distinct is refused as incomplete;
- with 25 it credits exactly 4,000 gold and 0 gems;
- a replay is refused;
- an unknown id is refused as unknown_milestone;
- collect125's threshold is 125.

Also run schema-drift replay, apply-order-honesty and lane-done.
### reviewer problems fixed by the brief
- 1. P1 class (the browser shows a claim the server refuses). CONFIRMED against live data (read-only query, 2026-09-26). The client decides whether an items rung is earned from its own count. collection-log.js:145 getStats counts G.collection across all ITEMS, which is filled by the client's addItem and by reconcileHeld from the bag (gathered, crafted and bought items all count). The server counts only distinct combat drops (hr_collection_of = ev:loot:%). On live, 2 of the 4 characters holding 25+ distinct items have fewer than 25 combat drops, and 2 characters holding 75+ items have fewer than 75. Those players would see 'Magpie' and 'Curator' with a Claim button and get 'incomplete' back. No value moves; only the player's own screen is affected. Fix: the edge projects the server's collection count and the items rungs are gated on it. Existing tests would not catch this because they seed G.collection.
- 2. Same class, monsters domain. CONFIRMED by reading the code. The monster rungs read G.bestiary, a client-written residue of attended kills that runs ahead of the server; collection-log.js's own header says the server realises 60-99% fewer kills. The server's own per-monster kills already arrive on every settle and are mirrored into G._bestiaryTrophies.killsByMonster (src/render/bestiary-trophies.js). Adding 4 more monster rungs on the residue multiplies the refusals. Fix: count the keys of the server mirror. The existing tests seed G.bestiary (companions-claims-and-renown.js ~319-451, hunt-raids-and-screens.js ~544-590) and must be re-seeded through the mirror.
- 3. PLAUSIBLE, not executed: there is no dev branch, and creating one would break the budget freeze. The live function bodies were read. The distinct-monster count can be raised without fighting. hr_accept_bounty__ungated accepts any catalogued target inside the character's combat-unlocked tier, because the board is client-generated and a new accept replaces the old one. The bounty branch of hr_credit_kills__ungated then writes ev:kill_monster:<target> = baseline + physics cap. Neither live body mentions active_id. The not-in-combat cap only requires active_kind='combat', so fighting slimes satisfies it for any target. Trigger: stay in combat with a slime, then repeat accept(target_i), wait min_kill_ms, credit_kills(target_i, 1). At 12 accepts/min that is about 87 distinct T1-T5 rows in roughly 8 minutes at combat level 55. This pack's gain for such a forger is hunter25/40/60/85 = 52,000 gold per slot, once. The same path already exposes hunterAll (50,000 gold + 25 gems at combat level 70) and ranked renown on live today. Blast radius: the forger's own balance, which can reach the economy through the market; bounded and one-off. It is journalled (target rows in hr_kill_credit_log, and a milestone_claim ledger row carrying 'have'). Detection query: count(distinct target) > 6 per character per day from hr_kill_credit_log where not free — 0 rows live. Accepted as a residual for this pack. The fix is its own lane C: the bounty-branch credit must require player_state.active_id = p_target, or the board must be server-derived.
- 4. CONFIRMED: the player value is not delivered. The brief promises 'the log always shows the next rung', but open() at collection-log.js:505 renders only claimable() rungs, so seven new rows add no next-rung line. Live (read-only) shows 0 milestone claims ever: 0 kind='collection' progress rows, 0 collection ledger rows, and 0 hr_rejections for hr_claim_milestone. Meanwhile 2 characters are server-eligible for hunter10 and 1 for collect50, so players are not finding the surface. Fix: a next-rung line per domain in the log, plus the Home Collection-log tile line that FEATURE_SLATE §5 asked for (home-dashboard.js ~1699).
- 5. CONFIRMED by a mutation in a scratch copy: the drift guard does not check thresholds or domains. It checks only gold and gems per client row. Changing hunter10's client gate from 10 to 11 still passed: exit 0. It also hard-codes rows.length === 4 and the 2026-08-22 SQL file, and it ignores --selftest (ran the normal body, exit 0). The chain end must be the LAST file in tests/schema-apply-order.json `order`, not a filename sort. Fix: turn the client rows into data {id, label, domain, goal, reward}, check them against the other two copies in both directions, and add a real --selftest registered in smoke.yml.
- 6. CONFIRMED live: the production wrapper hr_claim_milestone is `hr_note_rejection('hr_claim_milestone', p_slot, __ungated(...))`, spliced in by the 2026-09-12 rejections journal. Restating the wrapper from 2026-08-22 §5 would silently delete the refusal journal. The migration must restate __ungated only, verify the wrapper by executing it (an unknown-id call writes an hr_rejections row), and never use pg_get_functiondef. Reading a body back triggers live-hash-drift's `pin` rule, and the baseline is Coordinator-only. Without a read-back, 2 restatements stay under the 3-restatement chain rule, so the brief's 'no re-measure owed' holds. The live __ungated body matches the repo's 2026-08-22 body exactly (read 2026-09-26).
- 7. CONFIRMED, low severity: whether a rung counts as claimed comes from the client residue G.collectionLog.claimed. The server's claim rows (kind='collection') are already in hr_state_of's progress array (2026-09-22-state-of-trophy-prefix S8 asserts 'hunter10' is there). A lost residue therefore re-offers a paid rung, and the server answers already_claimed, which self-heals. Fix: merge the server rows into the claimed set, following the HearthriseDaily.markServerClaim pattern.
- 8. CONFIRMED live: the deployment record is wrong. The tests/schema-apply-order.json note for 2026-08-22-collection-claim.sql says 'STAGED, NOT APPLIED', but production carries hr_claim_milestone and __ungated with the repo body. The Coordinator should flip the note.
- 9. Scope and files. Class C is correct because the pack credits gold. The named files exist, and MILESTONES are at lines 41-44. The brief is missing these files: supabase/functions/hr-accrue/index.ts (items count projection; hr_engine already holds EXECUTE on hr_collection_of and it is on the allowlist, verified live), src/net/accrue.js (the settle hook), src/features/home-dashboard.js, src/features/smoke/hunt-raids-and-screens.js, tests/schema-apply-order.json, smoke.yml plus ci-shape, and a wire-shape test. Nothing is owed for restore-census (no table), catalogue-literal-drift (it covers hr_items, hr_item_slots and hr_activities only), icons, or MONSTER_TOTAL (108 = monsters.js, 108 = hr_bounty_monsters live). The counts in the brief check out: T1 has 14 monsters and 28 drops, T1+T2 have 30 monsters, 113 drops exist today. The estimate is about 3.5 h, not 1.5 h. Nothing in set/b554 (Vigour, party-view, tap targets) touches collection-log, the milestone catalogue or hr_claim_milestone. The shared-file conflicts are smoke.yml, ci-shape, schema-apply-order and schema-drift baselines, so the lane must branch from the set/b554 tip. collect125 cannot be reached until pack 1 lands (113 < 125).
- 10. Balance is OK. Gold and thresholds rise strictly within each domain. Next to the existing hunter10 2k, collect50 5k, collect100 15k+15 gems and hunterAll 50k+25 gems, the ladder totals 165k gold, against renown's 1.603M (knight 2k at 2,200 renown, baron 5k+25 gems, viscount 10k, count 20k+50 gems). No new gems. The per-tier income figures (T1 1k/h ... T6 30k/h) have no source anywhere in docs; they look plausible from monster gp, but the lane should cite them. Note that collect100 today needs T6, because T1-T5 give only 97 distinct drops.
