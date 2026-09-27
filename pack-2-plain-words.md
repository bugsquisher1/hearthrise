# 2. Plain Words: Vigour, dungeons and the Hearth Codex vol. II

VERDICT: GO-WITH-CHANGES | class A: true | est 1.5 h

PLAYER VALUE: Vigour went live and quarters hunting pay, but players cannot see when it resets. The dry line says only 'until the day turns (UTC)', which is 7 pm in Chicago. The Codex still lists Vigour as 'not live for players' (codex.js:15).

The dungeon result screen tells a lie: 'Reward multiplier 2.0x' and 'loot scales with boss HP' (src/dungeons.js:719, :846, :887). The server rolls the chest unscaled and scales only scrip, capped at 1.0 (2026-09-10-dungeon-settle.sql:349-353, :414-416).

The Boss of the Day row hides the numbers that make it worth choosing.

This pack puts the reset in the player's own clock with a countdown, adds four week-one Codex entries whose every sentence is bound to the engine, and makes the dungeon and Boss of the Day screens say what the server actually pays.

PROBLEMS TO FIX IN THIS LANE (each is a condition):
- P1 | CONFIRMED in source | new Security finding SEC-VIG-A1. This is lane C, not this pack. Vigour is not applied on the attended path. The attended top-up loot context (lootCtx.weakness, supabase/functions/hr-accrue/accrual.js:2451) has no vigMult fold; the span context has one at :2298. Attended combat XP is credited live by hr_credit_combat_xp. No migration that touches hr_credit_combat_xp__ungated reads Vigour, and the settle scales only the XP earned after combat_xp_accrued_to (:1993-2005, :2585-2588). So a player who is out of Vigour and keeps the tab open still gets full-rate top-up loot and full combat XP. Only gold is scaled. Blast radius: supply of tradeable loot on the Market plus XP rankings. It is bounded by the attended kill cap and needs no forgery. No test catches it: my prototype both-path bind is RED on c3ac50ec. Fix (lane C, Security GO, edge deploy): fold vigMult into lootCtx.weakness, and make the attended XP credit pay at the Vigour rate. Add a guard in tests/vigour.mjs that is RED when either attended path pays in full while dry. Effect on this pack: the Codex may NOT say 'pays only a small share' without scoping it. The pack's vigourDry bind checks only half the sentence.
- P1 class (section 6) | CONFIRMED in source | The pack skips src/dungeon-scavenger.js because 'the phrase is not there'. That file has the worse lie. When armed, the Scavenger result screen shows the client's own Math.random rolls (:435-440) as 'Loot brought home' (:570-582). The Claim toast counts them too (:590). The server's settle result is never rendered. Crypt of Bones is a scavenger dungeon, and its Manual Run is the first run most players meet. Also: the Auto-Run title 'base rewards' (src/dungeons.js:714) implies manual pays more, but auto settles at quality 1 (:519), so manual pays the same or less. The :719 title must also match the mode: scavenger scrip scales with boss HP, not phases. Fix: render window.dungeonSettleRowHtml(verdict) when armed, as the pack does for manual runs.
- CONFIRMED | Part D copies an overclaim. The Boss of the Day XP bonus scales KILL XP only: killXpRoute receives feat.xpMult (src/core/combat-sim.js:197) and hitXpRoute does not (:426). So 'combat XP x1.25' is false, and so are the existing Boss of the Day cards (src/features/boss-of-the-day.js:203-205, :304-305). The drop multiplier scales drop CHANCE, capped at 0.95, and guaranteed rows are untouched (src/core/drops.js:49-53). 'Loot x1.5' reads as quantity. DAILY_POOL and WEEKLY_POOL share 7 ids: I measured 3 days a year where the daily and weekly boss are the same monster. On those days the engine pays WEEKLY (botd.js:145), so a daily row printing DAILY_BONUS understates, and the Codex line 'each week another' is false. Fix: read HearthriseBossOfDay.killBonuses(id) and say 'drop odds' and 'kill XP'.
- CONFIRMED | Guard breakage the pack does not list. As specified, the Vigour clock turns an existing regression RED: src/features/smoke/hunt-raids-and-screens.js:4503 requires every digit in the bar to be a meter field, and '7:00 PM' and '3h 12m' are not. It also breaks :4512 (/Tired — hunts pay/), and it makes :4521 (!/Tired/) pass even when the bug is present. The easy 'fix' is loosening a guard, which CLAUDE.md section 2 forbids. Required instead: the clock lives in one .hunt-vigour-clock[data-renew-at] element whose value is checked against the server's day_key. The numbers check excludes only that element, and a mutation proof shows the check still bites.
- CONFIRMED | The clock is computed from nowMs, not from the server. Between 00:00 UTC and the next envelope, the meter still says dry while the clock already counts down to the NEXT midnight (23h59m). That is the browser disagreeing with the server. hr_vigour_of already sends day_key in the form '2026-9-27' (2026-09-25-vigour-price-by-level.sql:254). Fix: renew time = Date.UTC(day_key) + 1 day, and show 'renewing' once it has passed. Separately, a per-minute countdown inside the diffed rail repaint rebuilds the Refill button once a minute (src/render/hunt-panel.js:396-398), which can swallow a tap. Keep the countdown out of the rail.
- CONFIRMED | The dry line says 'or until you buy a refill' unconditionally, and the chip title says 'refills are on the Fight screen'. Both are false when refills_left is 0. Show them only when the server's for-sale condition holds.
- Four Codex claims are false or bound too weakly. (a) dungeonRest: 'the settle writes dungeon_cooldowns' is wrong. The cooldown is derived from the ledger (2026-09-12-dungeon-cooldown.sql:282, :361), and hr_dungeon_settle is patched in code, so chainEndBody only sees the 09-10 body. (b) dungeonChest binds to a COMMENT ('NOT scaled by any client value') instead of code. Its copy check would also match the comment at src/dungeons.js:843. (c) vigourDry reads 09-22, but the chain-end body is in 09-25. (d) 'you are told at once' is false: an away find is announced on return, and world-tick settles send no events (SEC_HUNTS residual). The selftest clone() does not copy hunt or botd, so mutations leak between arms.
- Files the pack misses: src/net/vigour.js:90 (named in the contents but not in the file list); src/features/boss-of-the-day.js (same overclaim class); src/features/smoke/rooms-items-and-economy.js (where the dungeon tests live). The in-page name 'CODEX-11' collides with the static guard's CODEX-n rule IDs.
- Base drift: origin/set/b559 is now c3ac50ec, not 05fba6a3. companion-procs-authority landed and added 77 lines to hunt-raids-and-screens.js. At c3ac50ec, codex-claims exits 0 (20 entries, 27 binds) and pack-edge --hash = 184a155a…114f. None of the named files is in the edge bundle. No file overlaps with the six b559 lanes. The only shared-file risk is another b4 pack adding Codex entries (codex.js and codex-claims.mjs have one writer at a time).

---

LANE: lane/content-b4-2-plain-words. Branch from origin/set/b559 at the SHA the Coordinator names. It is c3ac50ec today, not 05fba6a3. src/build-info.js carries cache 558 there, so any src/** import you add is ?v=558 (none are expected). Class A: no migration, no edge deploy, no src/core or packed src/data edits, nothing under supabase/**. Do not deploy, push main, bump, edit CHANGELOG, commit docs/reports/visual-qa/findings.json, or touch tests/live-hash-drift.baseline.json. No git stash.

WHY: Vigour's reset time is invisible. The dungeon result screens show rewards the server never pays. The Boss of the Day rows overstate their bonus. The Codex lacks four week-one entries. Every number shown must come from the server's projection or a packed rule constant, and a value that is not known yet shows as pending, never 0.

COMMIT 1 — Dungeon result truth (P1 class, section 6). Keep it self-contained so the Coordinator can merge this SHA alone.
- src/dungeons.js:714, Auto-Run title: 'Auto-run · full Dungeon Scrip; the chest is rolled by the realm · then the dungeon rests ' + d.cooldownH + 'h'.
- src/dungeons.js:719, title by mode:
  - scavenger: 'Scavenger run · you play it by hand; Dungeon Scrip grows with the boss HP you take down; the chest is rolled by the realm'
  - manual: 'Manual run · you play every phase by hand; Dungeon Scrip grows with the phases you clear; the chest is rolled by the realm'
- src/dungeons.js:887: replace the 'Reward multiplier' div with '<div class="drm-mult">Dungeon Scrip is paid for the phases you clear; the chest is rolled by the realm.</div>'.
- src/dungeon-scavenger.js:
  - Extract a pure window.scavengerSummaryHtml({armed, victory, takenPct, bossName, verdict, awarded}).
  - Armed: the rewards block is <div id="scv-spoils"> + window.dungeonSettleRowHtml(verdict). The sub line is "You took down N% of the boss's HP — Dungeon Scrip grows with it; the chest is rolled by the realm." It names no item from `awarded`.
  - The settle .then repaints #scv-spoils with dungeonSettleRowHtml(v) for settled, replayed or refused.
  - The Claim toast, when armed, says 'Cleared <boss>' only on a settled or replayed verdict, with no count (the same shape as dungeons.js:902-903).
  - The in-run roll list (:451, :480), when armed, shows 'Boss HP taken: N%' and no item names.
  - The dormant path stays byte-identical.
  - Do not touch any addItem or removeItem call: inventory-mint-census pins them.
- Test DGN-TRUTH-1, in src/features/smoke/rooms-items-and-economy.js beside DGN-SETTLE, ≤20 code lines, no G seeds. Call scavengerSummaryHtml armed with verdict {outcome:'settled', body:{settled:{items:{bone_key:2}, scrip:9}}} and awarded [{id:'big_bones', qty:5}]. It must contain the bone_key name, '+2' and '9 Dungeon Scrip', and must NOT contain the big_bones name. With verdict null it must contain 'Settling with the server' and no big_bones.
- RED proof: revert the armed branch to render `awarded` and the test goes RED. State that in the commit message.

COMMIT 2 — Vigour clock.
- src/render/hunt-panel.js, new pure function inside the IIFE: vigourRenewText(dayKey, nowMs).
  - Parse /^(\d{4})-(\d{1,2})-(\d{1,2})$/. No match returns null.
  - atMs = Date.UTC(y, m-1, d+1).
  - now = nowMs if finite, else Date.now(). The caller passes window.HearthriseMuster.now() when that is a function.
  - local = toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}) inside try/catch; null on failure.
  - stale = now >= atMs.
  - left = stale ? null : dur(atMs - now).
  - Returns {atMs, local, left, stale}. Export it as window.vigourRenewText.
- Add one predicate, vigourForSale(v): refills_left > 0 and next_refill_gold is finite and refill_min is finite. Use it for the existing Refill control as well.
- Clock element: <span class="hunt-vigour-clock" data-renew-at="atMs">. It is the only place in the block allowed to print a number that is not a meter field. The rail never prints `left`.
- Dry line (replaces :185-187):
  - Base text: 'Out of Vigour — hunts pay ×{dry_mult} until midnight UTC'. If dry_mult is not finite, use 'reduced rates' instead of '×{dry_mult}'.
  - Then the clock span containing ' — {local} your time'. Omit it when there is no day_key or no local time.
  - Then ', or until you buy a refill.' when vigourForSale is true, otherwise '.'.
  - Then ' Gathering, cooking and crafting still pay in full.'
  - When stale, the clock text is instead: ' — the day has turned; fresh Vigour arrives with the next settle'.
  - Then <button type="button" class="btn btn-sm" data-codex="vigour">What is Vigour?</button>.
- Meter label when not dry and not stale: append a clock span with ' · renews {local}'.
- Chip title when dry: 'Out of Vigour — hunts pay ×{dry_mult} until midnight UTC ({local} your time, {left} from now). Gathering still pays in full.' Append ' Refills are on the Fight screen.' only when vigourForSale is true. Use the stale wording when stale.
- Chip title when not dry: 'Hunting time left today at the full rate. It renews at midnight UTC ({local} your time).'
- Everything goes through esc().
- wireRefill's delegated listener also handles [data-codex]: call window.HearthriseCodex.open(id).
- No new CSS.
- src/net/vigour.js:90 becomes: 'No more refills today. They come back at midnight UTC.'
- Existing tests in src/features/smoke/hunt-raids-and-screens.js:
  - :4512 asserts /Out of Vigour — hunts pay ×0\.25 until midnight UTC/.
  - :4521 asserts !/Out of Vigour/ on the block text.
  - :4503 (the numbers-only arm) checks the block text with .hunt-vigour-clock removed, and adds: clock data-renew-at === Date.UTC(parsed meter.day_key) + 86400000.
  - Mutation proof in the commit message: planting num(budget_min - spent_min) into the label makes the arm RED; setting data-renew-at from Date.now() makes the provenance assertion RED.
- New tests (≤20 code lines each, no G seeds; reuse METER, rig and drain):
  - VIGOUR-CLOCK-1:
    - vigourRenewText('2026-9-27', Date.UTC(2026,8,27,20,48)) gives atMs === Date.UTC(2026,8,28), left '3h 12m', stale false, and a non-empty local.
    - ('2026-9-26', Date.UTC(2026,8,27,0,5)) is stale with left null.
    - ('nope', now) returns null.
  - VIGOUR-CLOCK-2: build a dry meter whose day_key is today's key (HearthriseCore.botd.utcDayKey(Date.now())) and refills_left 0.
    - The dry line says 'midnight UTC' and does not mention buying a refill.
    - data-renew-at moves by exactly 86400000 when day_key moves forward one day.
    - The chip title has no 'Refills are on the Fight screen'.
  - CODEX-VIGOUR-1: paint a dry block, click [data-codex="vigour"], await the dynamic import. Assert #codex-modal.show and #cx-vigour[open]. Call close() in finally.

COMMIT 3 — Hearth Codex vol. II (src/data/codex.js + tests/codex-claims.mjs).
- Header lines 15-16 become: 'Deliberately absent (not live for players): Rested XP, Hunts, Hearth Tokens, Rooms. Field Salvage has no entry yet. Vigour states its away rate only: the attended top-up loot and the live combat-XP credit do not read Vigour yet (Security SEC-VIG-A1, 2026-09-27).'
- New entries. I checked each for 80-320 characters, no digits and no number words.
- vigour — 'fighting', {tab:'combat'}, claims [[0,'vigourBudget'],[1,'vigourDryAway'],[2,'vigourScope']]. Text: 'Vigour is your daily allowance of hunting at the full rate, and it renews at midnight UTC. Past it a hunt carries on, and while you are away it pays only a small share of its usual rate. Gathering, cooking and crafting never spend Vigour, and refills are sold for gold on the Fight screen.'
- dungeons — 'fighting', {tab:'events'}, claims [[0,'dungeonKeys'],[1,'dungeonChest'],[1,'deeds'],[2,'dungeonRest']]. Text: "A dungeon is a short run behind a locked door that opens only with its own key, spent from your bag when the run is settled. Its chest is rolled by the realm, whatever your score, and it can hold room blueprints, rare boss gear and Farmer's Deeds. After a run each dungeon rests for a while before it opens again."
- boss-of-the-day — 'fighting', {tab:'combat'}, claims [[0,'botdPools'],[1,'botdBonus']]. Text: 'Each day the realm names a Boss of the Day, and each week a Weekly Boss. While featured, that monster drops its loot more often and gives more experience for each kill, watching or away, and the Weekly Boss gives the most.'
- lucky-finds — 'records', {opener:'openBestiary'}, claims [[0,'luckyRows'],[1,'luckySilence']]. Text: 'A few hunting spots hide a lucky find, a named piece of gear that turns up only once in a very long while. The realm rolls it on every kill at that spot, watching or away, and never with the dice in your own browser.'
- loadWorld gains hunt (src/core/hunt.js) and botd (src/core/botd.js), imported read-only. selftest clone() also copies hunt:{...base.hunt} and botd:{...base.botd}.
- Binds. Strip comments from JS and SQL first. SQL is read at the chain end.
  - vigourBudget:
    - VIGOUR_FLOOR_MIN > 0.
    - fnBody('hr_vigour_of') has 'v_day text := public.hr_utc_day_key(now())' and 'period_key = v_day'.
    - fnBody('hr_utc_day_key') has "at time zone 'utc'".
  - vigourDryAway:
    - 0 < VIGOUR_DRY_MULT < 1.
    - vigourSplit({spentMin:60, budgetMin:60, windowMs:3600000}) gives dryMs 3600000 and fullMs 0.
    - accrualJs folds vigMult into ctx.weakness dropMult, into xpDelta (Math.floor(raw * vigMult)) and into goldDelta.
  - vigourScope:
    - Every vigMult, vigourMult( and vigourCharge( sits after 'const accruer = KIND_ACCRUERS[inp.activeKind];'.
    - The accrueGather and accrueArtisan bodies contain no /vig/i.
    - fnBody('hr_vigour_refill__ungated') contains 'insufficient_gold'.
    - src/features/vigour-mount.js contains getElementById('fs-manage').
  - dungeonKeys:
    - Every src/data/dungeons.js cost.key is in ITEMS.
    - Every row of the generated catalogue has a cost_key.
    - The 09-10 settle has 'v_key := v_dun.cost_key' and the qty decrement.
    - startManualRun debits the key only inside if(!_dsArmed()).
  - dungeonChest:
    - The hr_dungeon_settle body has exactly one p_quality, inside 'v_q := least(greatest(coalesce(p_quality, 1), 0), 1)'.
    - Its loot loop reads 'from public.hr_dungeon_loot' and 'hr_seed('.
    - The catalogue has _blueprint_, farm_deed, and at least one row with chance ≤ 0.1 whose item has a slot.
    - No string literal in src/dungeons.js or src/dungeon-scavenger.js matches /Reward multiplier|scales with boss HP|base rewards/i.
  - dungeonRest:
    - Every catalogue cooldown_s > 0.
    - The apply order includes 2026-09-12-dungeon-cooldown.sql.
    - hr_dungeon_cooldown_modes gives auto, manual and scavenger positive divisors.
  - botdPools:
    - DAILY_POOL and WEEKLY_POOL are subsets of MONSTERS.
    - packNames includes vendor/core/botd.js.
    - botdFor(t) gives a non-null daily and weekly for 14 consecutive days.
  - botdBonus:
    - Both multipliers > 1, and weekly > daily on both fields.
    - AWAY_SCOPE.botd === true.
    - combatSimJs has 'killXpRoute(ctx.style, m.xp, feat.xpMult)' and 'hitXpRoute(ctx.style, pDmg)'.
    - accrualJs has 'lootCtx.botd = {'.
    - src/core/combat-xp-cap.js imports WEEKLY_BONUS.
  - luckyRows:
    - At least one lucky row, and every lucky ch < 0.005.
    - Every lucky item has ITEMS[id].slot.
    - packNames includes vendor/data/monsters.js.
  - luckySilence: src/features/lucky-finds.js references COMBAT_FX and 'rare_drop'.
- Do not name any bind 'luckyRowsExist': selftest arm M8 relies on that name being absent.
- New selftest arms, each must be CAUGHT under its named bind:
  - M11: VIGOUR_DRY_MULT = 1 → CODEX-6 [vigourDryAway].
  - M12: plant "'Reward multiplier: '" into src/dungeons.js → CODEX-6 [dungeonChest].
  - M13: change 'hitXpRoute(ctx.style, pDmg)' to 'hitXpRoute(ctx.style, pDmg * feat.xpMult)' → CODEX-6 [botdBonus].
- I prototyped these binds read-only on c3ac50ec. All hold except dungeonChest, which is RED on the dungeon copy until commit 1 lands (that is its RED-before).

COMMIT 4 — Boss rows say what the engine pays.
- src/features/combat-screens.js:833 and :844, unlocked meta: const b = B.killBonuses(id), then `drop odds ×${b.dropMult} · kill XP ×${b.xpMult} · away too`. Add no comment lines (CR-1).
- src/features/boss-of-the-day.js:203-205 and :304-305: use killBonuses(featuredId() or weeklyId()) and write '+N% drop odds · +M% kill XP while featured' ('this week' on the weekly card).
- Test BOTD-ROW-1 in hunt-raids-and-screens.js: stub window.getCombatLevel = () => 999 and restore it in finally.
  - The CS._destinations() rows 'Boss of the Day' and 'Weekly Boss' have meta === the string built from HearthriseBossOfDay.killBonuses(id).
  - The meta does not match /combat XP|Loot ×/.
  - After HearthriseBossOfDay.render(), .botd-bonus contains 'kill XP'.
  - RED-before: the old meta 'bonus drops & XP while featured'.

GATES (read and report each real exit code):
1. node tests/codex-claims.mjs → 0 ('24 entries').
2. node tests/codex-claims.mjs --selftest → 0, 13 arms CAUGHT.
3. node tools/pack-edge.mjs hr-accrue --hash → exactly 184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f.
4. node tests/inventory-mint-census.mjs and node tests/dungeon-key-drops.mjs → 0.
5. git diff --name-only <base>..HEAD lists only: src/render/hunt-panel.js, src/net/vigour.js, src/data/codex.js, tests/codex-claims.mjs, src/dungeons.js, src/dungeon-scavenger.js, src/features/combat-screens.js, src/features/boss-of-the-day.js, src/features/smoke/hunt-raids-and-screens.js, src/features/smoke/rooms-items-and-economy.js.
6. node tests/run-smoke.mjs --only for each new test name, and read the ✓ lines. This run exits non-zero by design and is evidence, not a gate.
7. Merge the latest origin/set/b559 into the branch yourself and resolve any conflict here.
8. node tools/lane-done.mjs → paste its last line; it must be 'lane-done: all green.'
9. Proof PNGs at 1280x800 and 922x423, only when the Coordinator says the machine is free: Fight rail dry and not dry, War Table boss rows, Scavenger summary, Codex entries. Commit them only to the separate branch qa/content-b4-2-plain-words.

REPORT: one table and at most three sentences. Give the commit 1 SHA separately.

NOT THIS LANE: SEC-VIG-A1, the Vigour bypass on the attended path, goes to lane C with Security.
