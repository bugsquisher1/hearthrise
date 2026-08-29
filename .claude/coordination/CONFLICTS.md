# CONFLICTS

_Open conflicts — code, design, asset, gameplay, architecture, integration. **Never silently resolve a meaningful conflict.** Log it, route it to the owners, resolve with evidence, then move it to Resolved._

### 2026-08-29 — b493 SHIP BLOCKER: kill-goal XP (design) breaks K10's forgery bound (security) — QA → Systems Engineer + Game Designer
**P1. Semantic conflict between two branches that were each green in isolation. Still OPEN — this is not the `?v=` bug, and fixing that did not fix this.**

Two integrated branches hold incompatible models of the same surface:

- **`2026-09-01-kill-goal-xp-hitpoints.sql`** (integrate `aca6088f`, designer-ruled) re-prices every
  kill goal from `xp:{combat:N}` to `xp:{hitpoints:N}` — 100/300/1000.
- **`2026-09-01-kill-daily-credit.sql` + `tests/kill-daily-credit.mjs` K10** (integrate `4fac7beb`,
  security-reviewed) concluded the change was safe *because* a forged/inflated kill counter reached
  **gold only**. That held only because `combat` is not a row in `hr_skills`, so `hr_claim_goal`
  routed the reward to `skipped_xp` and no `player_skills` row moved.

`hitpoints` **is** a row in `hr_skills`. So the reward is no longer skipped — it is minted:

```
✗ K10: a kill-goal claim moved player_skills by 300 XP.
      The review concluded a forged kill counter reaches gold only; an XP path changes that.
✗ K10: the kill-goal reward no longer reports combat XP in skipped_xp — either the reward was
      re-priced or it is being minted somewhere: {}
```

Why it matters: hitpoints feeds **combat level and the leaderboards**, so an inflated kill counter
now converts into a RANKED value instead of gold. The XP branch's own header anticipated the
neighbouring risk ("folding an existing `G.skills.combat` into `player_skills.hitpoints` would mint
RANKED XP") and correctly refused a backfill — but the *claim* path was not re-examined, and K10's
first assertion (`'combat' is now a row in hr_skills`) does not fire because the reward moved to a
different key rather than the key becoming a skill. K10's 2nd/3rd assertions caught it.

**Not resolvable in the QA lane** — it is a design-vs-security decision, and both positions are
defensible. Options for the owners, in the order I'd rank them:
1. Gate the kill-goal XP on the SERVER's own kill evidence (`hr_kill_credit_log`) rather than the
   client-influenced daily counter — keeps the designer's ruling and closes the bound.
2. Clamp + journal the XP so the reachable amount is bounded and reversible, and re-take the verdict.
3. Revert kill goals to gold-only (loses the designer's ruling; last resort).

Whatever is chosen, K10's prose must be updated in the same commit — it currently describes a world
where kill goals pay `xp:{combat:N}`.

**Repro:** `node tests/run-smoke.mjs` on `main` @ b493 → "Kill → daily-goal credit guard — FAILED",
two ✗ under K10. Present in the pre-fix baseline log too, so it is independent of the cache-buster fix.

---

### 2026-08-23 — OPEN BETA: the CLIENT is codeless-optional BEFORE the SERVER is (Systems → Coordinator)
Branch `agent-a4b1b5fffc2a6ed2a`. **Semantic conflict, not a git one.**

This branch makes the invite code OPTIONAL on both signup surfaces. The server's gate — the
AFTER INSERT trigger + auth hook in `supabase/migrations/2026-08-23-beta-invite-gate.sql` — is
UNCHANGED and still refuses a codeless signup. I did not touch `supabase/**` (out of my lane, and
out of scope for the task as given).

So between deploying this build and switching that gate off, **every codeless signup is refused.**
That window is handled rather than ignored: `humaniseAuthError(err, creating, hadCode)` now says
_"Sign-ups are still switching over to open beta. Try again in a minute — or add an invite code if
you have one."_ instead of blaming a code the player never typed. Transitional copy, but correct
either way, so nothing has to be un-shipped once the gate comes off.

**Ordering that avoids the window entirely: switch the SERVER gate off FIRST, then ship this build.**
The old client always sends a code, so it keeps working against a gate that no longer requires one.
The reverse order is the one that costs signups.

**What the server must accept** — exact shapes, read off the real submit handler under test:
- with a code → `POST /auth/v1/signup {email, password, data:{invite_code:"ABC-123"}}`
- without → `POST /auth/v1/signup {email, password}` — **no `data` key at all**, so
  `raw_user_meta_data->>'invite_code'` is SQL **NULL**, never `''`. A gate that only special-cases
  `''` will refuse the normal case.

**`tests/beta-invite-gate.mjs` was AMENDED, not gutted.** Its server half is untouched and still
asserts the gate is AFTER INSERT, exactly-once, and fails closed. Its client half now asserts
"a code travels when given, and NOTHING travels when not" — the old "a code always travels"
assertions had become the opposite of the product. **Do not delete the server half when the gate is
switched off:** a dormant gate that can be switched back on is worth more than one nobody can prove
still works.

### 2026-08-17 - CROSS-VERB COUPLING - `equip` (changes weapon) must clear `enchant.weapon` on BOTH sides (Systems -> Server agent)
**ELEMENTS v1.** `G.enchant.weapon` is bound to the WEAPON, not the player: whenever the item in the
weapon slot changes, the enchant is void. The client already reflects this — `clearEnchantOnWeaponChange`
is called from every path that writes `G.equipment.weapon` (`equipItem`, `unequip`, `unequipSlotInv`),
and `equipmentStats` belt-and-braces refuses to stamp `eq.element` unless the weapon slot actually holds
a `type:'weapon'` item. **The SERVER must do the same:** the `equip` verb, when it changes the weapon
slot's item, must clear its own `state.enchant.weapon`, and the envelope it returns must carry the
cleared `enchant` so the client applier (`applyEnvelopeState`, which now authors `G.enchant` from
`state.enchant`) reflects it. A same-item re-equip is a no-op and must NOT clear the enchant.
If the server does not clear on weapon-change, a player keeps a +15% element on a weapon that no longer
carries the rune until the next real enchant — a small but real over-credit. Client guard makes it
inert locally; the durable fix is server-side. **Owner: the Edge `enchant`/`equip` agent.**

### 2026-08-17 - HANDOFF - the vendored core changed; hr-accrue must repack + redeploy (Systems -> Server agent)
`src/core/combat.js` (the `weaknessInfo` element factor + `equipmentStats` 3rd arg) and the new
`src/core/elements.js` are vendored into `supabase/functions/hr-accrue`. The smoke preflight
`deployedPayloadGuard` now reports a payload-digest drift (informational, non-fatal — the suite is
still 0 failures). When the server builds the `enchant` verb it must: (1) call
`equipmentStats(equipment, items, enchant)` with the player's authored enchant at its two accrual
sites (`accrual.js` weakness + rolls) so away combat pays the element — the signature is
backward-compatible (a missing 3rd arg stamps no element); (2) author `state.enchant.weapon` from
`runeElement(rune, ITEMS)` (element name only, never a magnitude); (3) repack with
`node tools/pack-edge.mjs hr-accrue --out <dir>` and redeploy. Contract for the client intent is in
`src/net/enchant.js`'s header (verb body `{verb:'enchant',slot,intentId,enchant:{slot:'weapon',rune}}`;
refusal codes `insufficient_item`/`wrong_slot`/`unknown_item`/`rate_limited`; collectsFirst).

### 2026-08-17 - SEMANTIC - The accrual envelope writes `playerHp`, which `events.js` declares NO_SYNC (Designer -> Systems)
**This is a real disagreement between two modules about who owns HP, and it produced a shipped
player-facing bug.** `src/net/events.js` has said since it was written that `playerHp` /
`playerMaxHp` are `NO_SYNC` - *"in-flight combat - belongs to the device you are fighting on"*. The
snapshot honours that. `applyEnvelopeState` in `src/net/accrue.js` never did: it wrote the server's
hp unconditionally.

**Measured consequence (LIVE-AUDIT-2026-08-17, FTUE run 2):** a brand-new player died to the first
slime and respawned at **2/10 HP**, then re-entered combat and died again. Nothing in the combat
rules produces a 2 - `resolveDeath` full-heals and always has. The client resolved the death and
healed to 10/10; an envelope for a window that ended *before* that death then landed and wrote the
server's mid-fight hp over the respawn.

**What I did (b373, client-side floor only):** an envelope may RAISE hp freely, and may lower it
only while a fight is actually in flight (`G.activeMonster`). With no active monster there is
nothing hitting the player, and the server itself agrees - `accrual.js` sets the activity pointer to
idle in the same delta as a death. No economy exposure: hp is not tradeable, rankable or
contributable, away combat runs with `activeMonster` set (full server authority preserved), and the
refusal is recorded as `written.hpRefused` so the drift counter still sees it.

**What SYSTEMS owns, and why the floor is not the fix.** The envelope already computes
`summary.died`. The correct end state is that it says so, and reports POST-RESPAWN hp, so the two
sides never disagree in the first place. Please do not let the client guard become the reason that
never happens - and if you would rather delete the guard once the envelope is honest, do; the b373
test "an idle player cannot be wounded by a server envelope" documents the property either way.

### 2026-08-17 - DEPLOY COUPLING - A UI feature cannot cheaply touch `src/core/combat-sim.js` (Designer -> Systems, FYI)
While building the death sheet I added a single field (`monsterId`) to the info object
`resolveDeath` hands `fx.onDeath`. It turned the suite's **Edge payload guard** red: that file is
packed into hr-accrue, so one changed byte - including a comment - demands a coordinated Edge
redeploy before the client can ship. I reverted it and read `state.activeMonster` from the client
instead (legal: `onDeath` fires before the caller stops the fight; asserted by a b373 test).
**Not a complaint about the guard - it is doing its job.** Flagging it because it is a
non-obvious cost that will bite the next person who adds a "harmless" field to a core sim, and it is
worth knowing that a purely presentational need can force a server deploy.


### 2026-08-16 · CSS · The `#panel-market` theme sweep owns every colour on the market screen (Systems → Art Director)
**Found while building the b361 trade-ledger panel, by measurement in a real browser rather than by
reading the sheets.** `src/styles/art-direction.css` carries

    body[data-theme="hearthlight"] #panel-market :not(.shops-tabs, .bb-board, .sc-scene, .sc-counter,
      .iap-card, .hr-cs, .hr-room, …) { color: var(--ink); … }

with **no escape hatch**. Its sibling rule (`body[data-theme="hearthlight"] .panel.active span:not(…)`)
does ship four — `[class*="gold"|"pill"|"chip"|"badge"]` — but the `#panel-market` form does not, and
an id beats anything `audit-overrides.css` can reasonably write. Measured consequence:

- `.mk-qty` asks for `color: var(--gold-2)` and renders `var(--ink)` in Hearthlight. **Every gold badge
  on the market screen has silently lost its gold** — the `×10` quantity pills, the ledger amounts, all
  of them. This is pre-existing and predates b361.
- I tried three ways to distinguish "money in" from "money out" on the ledger (colour, then background,
  then border). **All three were overridden.** Verified by computed style, not assumed.

**What I did, deliberately:** nothing. I did NOT win the specificity war. Escalating a component rule to
out-rank a theme sweep is exactly how the cozy-light override stack got built and what the b214 audit is
still paying down, and it would have left a rule that breaks the day the sweep is narrowed. The ledger
carries direction in WORDS instead — an explicit `+`/`−` on the amount and "Sold"/"Bought" leading the
meta line — which is legible in both themes, under the sweep, and to a player who cannot distinguish the
two colours at all. The block therefore added **zero theme-fragile CSS**.

**Art Director owns the ruling.** The cheap fix is to give the `#panel-market` form the same four
`:not([class*=…])` opt-outs its `.panel.active span` sibling already has; that restores gold to every
market badge in one line and I would then re-add the two-tone ledger amount. Not doing it unilaterally:
it repaints a whole screen in one theme, which is your call and not mine.

## Conflict types to watch
- **Code:** two agents editing overlapping lines/files.
- **Semantic (the dangerous kind — no git conflict):** two agents holding incompatible models of how a system should behave. Example: Game Designer says "cooking should improve combat effectiveness"; Systems says "cooking currently only modifies XP." No merge conflict, but a real design/system conflict. Flag it.
- **Design:** competing player-experience goals.
- **Asset:** style/consistency disagreements.
- **Architecture:** competing structural approaches.
- **Integration:** a change that breaks another verified change on merge.

## Open

### 2026-08-16 · events-donations spec · THREE ROUTED FLAGS (Game Designer → Systems/Backend), pre-build
From `docs/design/events-donations-and-voting.md` (The Kindling/The Beacon — AWAITING TYLER'S REVIEW-BOOK APPROVAL; nothing builds until then). Whoever implements must honour:
1. **Fuse re-split.** The `getBonus('allXP') ≤ 0.60` assertion was written against PERMANENT power; donation-boosted blessings can put 0.17 on one key and break it. Ruling: `BLESSING_KEY_CAP = 0.12` (UI-visible, never a silent clamp) and the assertion splits into `permanent ≤ 0.60` / `calendar ≤ 0.12`. First-99 floor holds (~55.7d vs ≥54 gate) even at ceiling.
2. **Do NOT move `utcWeekKey`.** It is Thursday-aligned and consumed by raids/quests. The Beacon gets its own `beaconWeekKey` (Monday 03:00 UTC reset = Sunday night in all four US zones year-round).
3. **Away rule.** The donation boost mutates the blessing's own bonus map — it must NEVER get its own channel, or it silently starts paying away (`AWAY_SCOPE.blessing=false` is the rule). Spec test #7 is the tripwire.
Also: retiring the muster chest removes ~7,500g + 10 gems/player/day of faucet while adding a sink — Systems must check the gem side (cosmetic access rate) before launch; designer ruled measure-a-week-then-adjust rather than pre-compensate.

### 2026-08-15 · b343 · SEMANTIC — away combat now pays a new character's first night (Systems → Game Designer)
Tyler removed the away-combat gate ("get rid of the license shit it's way too confusing"). Design should hold the real numbers, not read them off a changelog. **Measured, 400 seeds, live engine**, a fresh character (10 HP, bronze sword, no Auto-Eat, empty food slot) left on Slime for eight hours:

| | before b343 | after b343 |
|---|---|---|
| outcome | span not simulated | **dies 100% of the time**, after **59.4s** (median 57.6s) |
| kills | 0 | **4.49** (median 4, range 1–9) |
| XP | 0 | **84.1** total (style + Hitpoints) |
| gold | 0 | **~10** (median) |

84 XP against `pacing-overhaul.md`'s 13,034,431-XP first-99 is **0.00065%** — the pacing floor does not move. **Auto-Eat is still the real gate on AFK combat**: without the trait nobody eats while you are away, so the night is over in a minute. That was always true and the licence was a second lock on it.

**Two authored payouts are now reachable during an absence** and were not before, because a declined span was never simulated: `first_blood` (Defeat 5 monsters → 150g + 5 turnip seeds) completes at ~46% of first nights, and `hundred_kills` (1,500 combat XP) can complete for a player parked at 95+ kills. Both are **one-time per character** and both are minutes of attended play away, so neither is a faucet — but they are new value entering during the server-authority rebuild and Design should say yes rather than have it assumed.

### ✅ 2026-08-15 · BLOCKER — RESOLVED IN b347 (Systems). The gather/artisan replay has a timeline; the held branch is unblocked. Full record under Resolved. Original text kept below because the measurement in it is the before-half of the fix.

### 2026-08-15 · BLOCKER (code + semantic) — the away buff rule is landed in CORE only; the gather/artisan replay in `legacy.js` must land before this ships (Systems → whoever holds `src/legacy.js`)

Branch `agent-a06ecbcee310aa2c7`. `AWAY_SCOPE.buff` is now `true` (Tyler, 2026-08-14: personal buffs pay away, server-wide blessings do not). That flag is a property of the SCOPE TABLE, so it opens for every away caller at once — but only one of them can honour the other half of the rule.

- **away COMBAT** — `src/core/combat-sim.js simulateSpan` owns a timeline (it already segments by UTC day for the Boss of the Day). It drives the buff clock per tick, so a buff expires at the right instant. **Correct, measured, tested (AWAY-5 / AWAY-15).**
- **away GATHER / ARTISAN** — `legacy.js processOffline` computes `ticks = floor(spanMs / offlineIntervalMs())` and runs that many identical actions. A flat single-rate loop: the interval is derived ONCE before the first action and nothing advances a clock inside it. It therefore **pays a buff for the whole absence and drains none of it.**

**Measured exposure** (shipped food catalogue — magnitudes 1–5, durations 2–20 min): a `gather_speed` buff eaten immediately before logging off applies its speed term to the entire night (max **+4%**, via the one-shot `activityIntervalMs()` read); an `all_xp` buff applies to every action of the night (max **+5%**). Bounded, deliberate to trigger, and still the b326 exploit in miniature.

**Second, player-facing half of the same defect:** `legacy.js` line ~1399 computes `buffsPaused` for the non-combat branch as "did they hold a buff", and `src/features/home-dashboard.js:565` prints "your buffs were paused" off it. On a gather night that copy is now a lie in both directions — nothing was paused, and it paid all night.

**The fix is in `legacy.js`, not in core:** split the gather/artisan replay at the buff-expiry boundary — run `min(buffRemainingMs, spanMs)` of ticks with the buff live, call `advanceBuffClock` for that slice, re-derive `offlineIntervalMs()`, then run the remainder. Same shape `simulateSpan` uses, one level up. Then drop `buffsPaused` from the non-combat summary. **Do NOT "fix" it by closing `AWAY_SCOPE.buff` again** — that reverts a stated design rule to work around a loop that should have had a timeline all along. The full note is at the foot of `src/core/away.js`.

Also stale and now wrong in `legacy.js` (comments + one player-facing string, all untouched because another agent holds the file): the `getBuffBonuses` header (~14220), `advanceBuffClock`'s drain-rules comment (~14328), `buffFrozen()` and its copy *"freezes entirely while you are away"* (~14454–14490), and the `buffsPaused` doc block (~1390).

### 2026-08-15 · FINDING (no change made) — the offline cap does NOT stop the character; it caps the payout and shifts the window to the END of the absence (Systems → Coordinator / whoever owns the cap)

Tyler's rule: *"after that player's 'max offline time' is reached, their character stops all activity."* **Measured behaviour today is the other one.** Driving the real `processOffline()` with a stubbed cap and `document.hidden` forced false:

| scenario | absence | cap | PAID | `capped` | activity still running on return | sim window |
|---|---|---|---|---|---|---|
| gathering | 3h | 1h | 1h | true | **yes** (`activeSkill: woodcutting`) | n/a |
| combat | 3h | 1h | 1h | true | **yes** (`activeMonster: slime`) | now−1h → now |
| combat | 18h | 12h | 12h | true | **yes** | now−12h → now |

So today: **(a)** the payout is capped and the activity is still running when the player returns — not **(b)** the character stops at the cap and returns idle.

There is a second, less obvious half nobody has stated: `simulateAwayCombat` sets `fromMs = now − paidMs`, so the credited window is the **LAST** `cap` hours before returning, not the **FIRST** `cap` hours after leaving. An 18-hour absence is simulated as "idle for 6 hours, then fought for 12". Under Tyler's rule it should be "fought for 12, then stopped". The amount paid is identical either way; **which UTC day's Boss of the Day is credited is not** — a long absence is currently credited against the wrong day's boss. It also decides which instant a held buff's remaining time maps onto.

Reported, not changed — the cap is Tyler's call and it interacts with in-flight work elsewhere.

### 2026-08-14 · b342 · SEMANTIC — every proc pet just got HALVED to its declared rate (Systems → Game Designer)
Companion procs were applying **twice per trigger** — measured, in the real client: 2 applications, 2 toasts and 1.0 pet XP (a utility pet earns 0.5) on each of kill / combatHit / gather / cook. Two identical hook sets, one in `src/legacy.js` block 31 and one in `src/features/companions.js`, both wrapping `killMonster` / `combatTick` / `addItem`. The legacy copy is deleted (b228's fix, one layer up).

**This is a correctness fix that lands as a live NERF**, and Design should know the numbers rather than read them off a changelog:
- A Raccoon's advertised "20% on kill" was really **36%** (1 − 0.8²). Every proc pet was ~2× its declared rate. The power budget was never told, so the census figures for companions have been understating real pet value since the hooks were written.
- Companion **XP** was also double: every pet levelled at 2× the intended rate, so live beta pets are roughly twice the level their playtime earns.
- Companion **drop** rolls were double: Wolf Pup's 1% was really 1.99% per kill (2 independent rolls; the unlock itself was self-limiting).
- `G.stats.cropsHarvested` moved **+2 per harvest**, so the Bunny quest ("harvest 100 crops") completed at **50** and the weekly `wk_harvest` ("Harvest 120 crops") at **60**. Both now cost what they say.
- The pet-impact panel (`HearthrisePetSession`) only ever heard from the ESM copy, so it was reporting **exactly half** of what pets really paid. It is now accurate — which will read to players as pets "getting better at reporting" in the same build they get worse at paying.

**No balance VALUE was changed** — `src/data/companions.js` is untouched. If Design wants the effective rates restored, that is a data edit to `proc.chance` and it should be made deliberately, with the budget re-run. **→ Game Designer to rule on whether the declared rates are the intended rates.**

### 2026-08-11 · b330 · SERVER GAP — leadership has no read for its own outstanding invitations (Systems → whoever next owns the membership SQL)
`2026-08-11-clan-membership-authority.sql` shipped `clan_invites_list()` for the **invitee** only, and `clan_invites` deliberately has **no client SELECT policy**. So a leader can send an invitation and revoke one, but the server offers no way to ask *"who have we invited?"* — which the panel needs before it can draw a Withdraw button beside a name.

I did **not** invent a client-side list and I did **not** add a policy to `clan_invites` (a readable invite table is a readable list of who is being courted, and the migration is explicit that the RPCs are the only door). The panel derives the answer from **`clan_ledger`**, which is `for select using (true)` and which every membership RPC journals to (`invite` / `invite_revoke` / `join_invite` / `join` / `kick`): the newest row per user decides, and an `invite` row older than the server's 7-day TTL has lapsed. That is complete rather than a guess — but it is a **derivation of server state on the client**, which is the shape this project has decided against everywhere else.

**The honest fix is a `clan_invites_outstanding()` RPC** (leadership-only, `hr_clan_may_admit`, rate bucket `clan_invites_list`, returning `{user_id, display_name, invited_by, created_at, expires_at}`). When it lands, delete `outstandingInvites()` in `src/features/clans.js` and call it instead — the panel consumes an array of the same shape, so it is a one-function swap. A stale derived entry costs nothing today: revoking it answers `revoked: 0`, which the transport already reports as *"There was no invitation left to withdraw."*

**Also noted, not acted on:** the migration has no **decline** path. An invitee can accept or let it lapse. The inbox therefore draws Accept only and says what happens if you do nothing — a Decline button would be a control that cannot do what it says. If Design wants decline, it needs `clan_invite_decline(p_clan_id)` (sets `revoked_at`, journals `invite_decline`). **→ Game Designer to rule, Systems/SQL to build.**

### 2026-08-09 · b228 rebase applied — three of the batch below are RESOLVED, two new items open (Systems)
**Resolved by `agent-rebase` (b228):** items 1, 3, 4, 5 and most of 6 of the batch below. The fuse moved to `src/features/power-budget.js` as the final wrapper; `smoke-test.js`'s offline-latch test already asserted through `bonusFor` (pre-clamp) so it did NOT break structurally — it gained an explicit second assertion that the clamp is not what makes the two nights equal, so the latch keeps doing the latch's job; the `farmYield` flooring fix, the companion key-name fix and the ranged/magic `combatXP` fix all landed inside the rebase commit; `CASTLE_TOTAL_CAP` is deleted rather than enforced (a cap that a later wrapper escapes cannot be given a real job — the real job moved to power-budget.js). Item 7 was already shipped: Workshop and Shrine were at +2/4/6/8/10 when this branch read them.

**Still open from that batch, unchanged: item 2** (Designer must point `homestead-deepening.md` §H2/H3/H4, `clan-overhaul.md` §8.1/8.2/8.4 and `pacing-overhaul.md` A.4 at `bonus-rebase.md`), and the **`hearthScale()` inertness** half of item 6 — `registerBuffScaler` still has no live caller, so the Tavern's +40% duration / +10% magnitude has still never applied. It is rebased and correct; it is not wired. **→ Systems, next pass.**

**NEW · 1 · SUPERSEDED SPEC LINE (Designer ↔ Tyler).** `bonus-rebase.md` §4.3 lists the renown weights (`14 / 900 / 0.5`) as **unchanged — "pacing, not bonuses"**. Tyler's directive of the same day overrides it: *"It also seems to be going way too fast."* Every `W` weight came down (`totalLevel` 14→2, `kill` .5→.05, …); the twelve **thresholds are frozen** and now pinned by a test, because `min` is compared against the `renownHigh` ratchet — lowering a weight can never demote anyone, but raising a threshold demotes everybody at once. **→ Designer:** the pacing appendix and §4.3 need the amendment.

**NEW · 2 · DEFERRED BY SYSTEMS, DELIBERATELY — the L5 batch-capacity rungs.** §5.3 converts the three Keystone L5 benches to "one action produces five". Systems did **not** build it, and the reason is not effort: batching converts an artisan skill's bottleneck from TIME to MATERIALS, which is roughly a **5× move on artisan XP/hour** and directly reverses §5.2's own stated consequence ("the artisan block collapses onto its no-perks column, ≈18–19 months"). That is a pacing decision with the product owner's name on it, not a magnitude Systems may pick while applying a magnitude spec — and §5.5 already schedules it for b229. The rungs are not dead in the meantime (they pay +10% speed and an 8% proc, honestly stated), but the Keystone price is still thin. **→ Game Designer:** name the batch size, and say whether the Shrine's specced bulk-bury of 10 is the same mechanic or a different one. Systems builds it once that number exists.

### 2026-08-09 · Bonus-rebase batch (Game Designer — full detail in `docs/design/bonus-rebase.md` §6)
1. **ARCHITECTURE · the fuse cannot police a chain it sits in the middle of.** `getBonus` is a base function plus **six additive wrappers**; the fuse lives at layer 4 (`clan-seat-ui.js:297`) and reduces only the castle's own contribution, so companions, food buffs, the muster aura and the whole blessing calendar are unpoliced. **Ruling: move the budget to a final `src/features/power-budget.js` wrapper installed last**, applying `permanent ≤ 0.20` / `temporary ≤ 0.15` / `total ≤ 0.30` per key. Needs permanent and temporary to be separately accumulable. **→ Systems, ruling required before b228 builds.**
2. **SUPERSEDES · `homestead-deepening.md` §H2/§H3/§H4 and `clan-overhaul.md` §8.1/§8.2/§8.4 are replaced** by `bonus-rebase.md` §2.2/§3. The `allXP ≤ 0.60` fuse, the artisan `≤ 0.85` clamp, the `restedXp ≤ 0.50` clamp (item 2 of the homestead batch below) and the +52%/+25% ceilings are all retired. `pacing-overhaul.md` A.4's boost columns (+20/+33/+52%) no longer describe anything. **→ Designer, next touch of each doc.**
3. **TEST BREAKS STRUCTURALLY:** `smoke-test.js:8746` forces a synthetic all-keys blessing of 0.50 and asserts `bonusFor('allXP') === 1.0`. A final clamp caps that at 0.30. The offline-replay latch it guards is load-bearing and must keep being guarded — assert pre-clamp, or bring the synthetic magnitudes into legal range. **→ Systems + QA.**
4. **UNBUDGETED INCREASES that must land INSIDE the rebase commit, not after it:** (a) the `farmYield` flooring fix (`legacy.js:2390` floors the total, so Scarecrow 0.1, Bunny 0.10, Squirrel 0.15, Carrot Stew 0.15 and Roasted Pumpkin 0.05 have all paid **zero** since launch); (b) the companion key-name fix — `xpB`, `goldBonus`, `prayerXp` are misspellings of `allXP`, `goldFind`, `prayerSpeed`, so Fox, Lichling, Raccoon, Owl and Grave Wisp pay nothing. **→ Systems.**
5. **P1 · LIVE:** `combatXP` is applied only to attack/strength/defense/hitpoints (`legacy.js:1508`) — the Trophy Room, the Watchtower, War Drums and Hunter's Moon pay **nothing** to ranged and magic. Pre-existing, orthogonal to the rebase. **→ Systems.**
6. **INERT:** `hearthScale()` (`clan-seat.js:256`) advertises +40% buff duration / +20% magnitude at Tavern 10 but `registerBuffScaler` has no live caller — it has never applied. Also `CASTLE_TOTAL_CAP` (`clan-seat-ui.js:126`) is declared and enforced against nothing, and Frostfin Supper's `defense` buff is a silent no-op (`items.js:159` vs `BUFFS_DEF`). **→ Systems.**
7. **P1 · IN FLIGHT:** the `agent-homestead` provisional retuned six rooms and missed two — **Workshop and Shrine are still at +10/25/50/50/60** while the Forge is at +2/4/6/8/10. Must land in the same commit. **→ homestead agent.**

### 2026-08-08 · QA attack-pass routed findings (full repros in agents/qa-engineer.md — read them there)
- **P2 → Systems:** welcome-back modal reports HALF the offline yield actually granted (display recomputes a stale 0.5x model; render `G.lastOfflineSummary` instead).
- **P2 → Systems:** multi-tab = silent last-writer-wins save destruction (no lock, no storage listener).
- **P3 → Systems:** `processOffline()` not idempotent (latent); naive lastSeen fix blanks the welcome-back modal — see the rested-XP watermark pattern.
- **P3 → Systems:** one unknown `cropId` kills the whole Farm page (renderers unguarded; `isReady()` already defends it).
- **P3 → Designer:** renaming leaves open market listings under the old seller name (re-render from identity vs immutable-ledger — a ruling).

### 2026-08-08 · Homestead-deepening batch (Game Designer — details in `docs/design/homestead-deepening.md` §9)
1. **P1 · LIVE DEAD CONTENT (independent of any spec):** `farm-progression.js TIERS` stops unlocking crops at Pumpkin, *including at MAX plot level*, but b215 added **Goldenroot (farming 62), Emberfruit (75), Moonbloom (88)** to `CROPS`. `canPlantCrop()` is a hard gate in `plantCrop`, the seed picker and auto-replant → **three crops, three seed items and two cooking recipes (Goldenroot Roast, Moonbloom Elixir) are unreachable at every plot level.** Farming's last 37 levels have nothing to plant. Five-line data fix; blocks the Garden ladder but should ship regardless. **Owner: whoever holds `farm-progression.js` next.**
2. **SEMANTIC · `restedXp` is now claimed by BOTH pillars.** Homestead Library L4/L5 and castle Tavern Common Room both grant potency, and `getBonus` **sums**. Unclamped, a clanned player with a maxed Library reaches 100% potency = double XP on 80 banked charges. **Ruling: clamp `restedXp ≤ 0.50` aggregate — two roads, one ceiling.** Whichever pillar ships first lands the clamp.
3. **CORRECTION · `clan-overhaul.md` §8.3's allXP arithmetic is four points low.** Stated post-re-scope ceiling +47%; actual is **+52%** (it omits the homestead property capstone, `getBonus` `isCastle() → +0.05`). The `≤0.60` fuse still holds but the headroom is 8 points, not 13. **No system in either pillar may add a new `allXP` source.**
4. **DESIGN LAW (applies to the castle too):** extra-output perks (`yield_*`, `craftSave`) must fire only when `!ITEMS[recipe.output].type` — materials, never equipment. The vendor pays full item `v`, so a 20% extra-output roll on endgame armour prints six figures per craft.
5. **BROKEN PERK:** the Scarecrow plot-building grants `farmYield: 0.1` and `harvestPlot` **floors** the total — it has contributed nothing since launch whenever the Garden's bonus is an integer. Same class as the Cellar's dead storage perk.
6. **DEAD UI:** six ghost keys in the House bonus display (`legacy.js:5092`) — `noBurn`, `craftSave`, `kitDrop`, `farmYieldPct`, `hearthXP`, `storage`. The spec revives `craftSave` and deletes `storage`; the other four should be **removed from the display list**, not invented into mechanics.
7. **ASSET DEPENDENCY:** 8 room illustrations (lit / ghosted / locked) + 3 Phase-3 rooms, in the same "Forge & Stone" language as the castle view. The two pillars' art must be produced together or the twins will not look like twins.

### 2026-08-08 · Hunt ratification batch (Game Designer — rulings recorded in the specs)
1. **SYSTEMIC ECONOMY (flagged, not fixed):** vendoring pays the full item `v` (`invSellOne`), so every high-tier craft is a gold faucet — Dawnsteel Platebody turns 21,000g of bars into 108,000g; the Hunt-forged one turns 34,800g into 270,000g. The Hunt is not the marginal offender (weekly-rate-limited inputs), but the craft-to-vendor margin should be priced deliberately rather than inherited from `tier.value`'s 2.77× step. **Owner: Systems.**
2. **ECONOMY INTEGRITY (one question, not three patches):** a signed-out session derives its muster/raid windows from the **local clock**, so a clock-rolled guest can re-claim the solo floor band; the solo-raid claim flag has the same shape (P3). The real question is whether a locally-earned save is trusted when it first syncs on sign-in. **Owner: Systems.**
3. **CADENCE:** the Hunt week rolls **Thursday 00:00 UTC** (epoch weekday) while castle upkeep rolls **Sunday 00:00 UTC**. Two reset clocks in one clan pillar. Target state is one clan week boundary; changing it now truncates a live raid week, so it is a follow-up, not a Wave-3b reversal.

### 2026-08-08 · Clan-castle v2 batch (Game Designer, filed by Coordinator — details in clan-overhaul.md §15)
1. **SEMANTIC:** clan `level` cannot gate the castle — `clan_contribute` is `10000 × 4^(level−1)` → level 10 = 655,360,000 gold. Progression moved to **Standing**; `level` demoted to cosmetic. `clans.js` L17-19 comment documents a third, also-wrong ladder.
2. **SEMANTIC → taxonomy:** four new castle goods need a **"Castle Stores"** artisan lane (`ITEMS[out].tag === 'castle'`) or the uncategorized-is-empty regression test breaks on the commit that adds them. Land the lane WITH the items.
3. **DEPENDENCY:** `goldFind` getBonus key is declared but never read — Treasury perk is a broken promise until Systems wires it (Wave 3).
4. **DEPENDENCY:** Tavern Hearth needs a buff duration/magnitude multiplier seam in the engine.
5. **DEPENDENCY:** Rested XP is a new engine seam — touches `processOffline`, the XP grant path, and the fragile `snapshotG` allowlist. Handle with care (offline double-pay history).
6. **INTEGRATION:** Muster and castle Labour BOTH wrap `updateDaily` — each wrapper needs its own idempotency flag or double-count/double-wrap bugs follow.
7. **DESIGN (recorded, deliberate):** Tavern-10 Feast at Last Call ≈ +65% allXP for 4h — the ceremony peak, inside the stated power budget.
8. **LIMITATION (wording discipline):** `clan_deposit` cannot verify item possession. Castle economy is server-authoritative for currency/gates/rewards/rate, CLIENT-TRUSTED for possession (clamped + audited). Never describe it as fully server-authoritative.

### 2026-08-08 · SEQUENCING · #14/#15 and #16 must ship together (Game Designer)
`world-event-cadence.md` §7.2 moves the raid card out of `#panel-dungeons` into the new Events panel — if the Hunt (#16) lands in a different wave, its card sits in a panel with no nav entry (the exact bug #14 fixes). Wave planning constraint.

### 2026-08-08 · DEPENDENCY · perk-stacking re-scope must land WITH Hunt chests (Game Designer)
A simultaneous +57% allXP stack would invalidate Hunt reward tuning — land clan-perk re-scope + Hunt in the same wave.

### 2026-08-08 · DEPENDENCY · six new boss signature materials need recipes at ship (Game Designer)
Else they join the recipe-less vendor-trash list (items 26–31). Route into b215 armour tiers when #16 ships.

### 2026-08-08 · DEPENDENCY · `serverSkewMs` (server-time offset) needed for topbar countdown (Game Designer → Systems)
No current equivalent exists; without it a wrong device clock makes Join appear broken. Build with #15.

### 2026-08-08 · SEMANTIC · Perk stacking power budget (Game Designer → Systems Engineer)
Homestead + renown + clan-level + proposed clan-wings all funnel `getBonus`; `allXP` could stack to ~+57%. Designer recommends re-scoping clan auto-level `PERKS` to baseline-only + a per-key soft cap, landed **with** the wings (clan-overhaul §7). Systems must rule on the cap mechanism before Wave 3 builds the wings.

### 2026-08-08 · DEPENDENCY · `raidPower` getBonus key (Game Designer → Systems Engineer)
Clan-overhaul spec introduces a new `getBonus('raidPower')` that `src/features/raids.js simulateStrike` must consume (clan-overhaul §4.3). Wave 3.

### 2026-08-08 · DEPENDENCY · `snapshot.renown` for leaderboards (Game Designer → Systems Engineer)
Flagship Throne board needs `renown` written into the client save snapshot on save (leaderboards §3.2). Touches the fragile `snapshotG` allowlist — Systems change. Wave 3.


### 2026-08-16 · DEPENDENCY · bane gear needs the monster `family` re-point (Systems → Monster workstream)
`src/core/bane.js` normalises `monster.class || monster.family` against the eleven Library-1 classes and
carries a `CLASS_ALIAS` for the legacy six (Beast→Mammal, Goblinoid→Humanoid, Arcane→Human).
**`Mythic` is deliberately unmapped** — it covers both `lesser_demon` (→Demon) and `dragon` (→Dragon) in the
live table, so any guess makes one of the two bane weapons fire at the wrong thing. Consequence today:
**Dragonrib Bow (ITEM-NEW-03) is inert** until `dragon.family` becomes `'Dragon'`. The other four bane
weapons work now. Nothing breaks either way — an unmapped family yields NO bane, which is the strict
direction. Verified: `weaknessInfo(dragon@Mythic)` → 1.00; `weaknessInfo(dragon@Dragon)` → 1.68.
Monster workstream: an explicit `class:` field wins over `family:` if you would rather not overload it.

### 2026-08-16 · DEPENDENCY · the `pendingSkill` handshake (Systems → Skills workstream)
34 ITEM-PLAN rows (7 bound runes · 7 whetstones · 3 stone raws + 3 blocks + 3 rune blanks · ashlar ·
vaultstone · 9 phase-two elementals · 6 artisan tools) landed as ITEM ROWS ONLY, each carrying
`pendingSkill: 'stonemason' | 'runecrafting' | 'fletching'`. **No recipe produces any of them** — those
are yours. The b243 reachability guard exempts an item only while its `pendingSkill` is absent from
`SKILLS_DEF`, and **B356-4 fails the build the moment you add the skill row** unless the item has a real
faucet. That is the handshake: add the skill and the recipes in one commit and both guards go quiet.
Ids/stats/values/levels are taken verbatim from `consumable-economy.md` §6.2/§6.3/§8.2/§9.5/§11.3 — do not
re-derive them. One rename applied per the review book: `rune_of_blight` → `rune_of_poison`.

### 2026-08-16 · SEMANTIC · two approved items shipped WITHOUT their signature mechanic (Systems → Designer)
Everything whose effect has no engine landed unobtainable (see `src/data/item-effects.js`). **Two did not**,
and the Designer should re-read the call at integration:
- **Watchknight Shell** (ITEM-NEW-33) — ships as honest plate T5 with the derived set bonus; its
  "damage taken while away" identity is declared `away_mitigation` and dormant. Held back it would strand
  `deathsteel_bar`, which is the only thing closing the `death_steel` orphan (ITEM-NEW-43's whole purpose).
- **Quiet Coat** (ITEM-NEW-34) — ships as honest cloth T6; `first_strike_deny` is dormant (there is no
  first-strike model at all). Held back it strands `voidchitin_weave`, which is the only thing closing
  `void_chitin` + `hell_ember` + `war_crown` (ITEM-NEW-44).
Neither description promises the unshipped effect. If the Designer would rather they wait for their
mechanic, remove the two recipes and the guard will re-classify them automatically.

### 2026-08-16 · DEPENDENCY · hr-accrue REDEPLOY required (Systems → Coordinator)
`src/core/combat.js` + `src/core/bane.js` + `src/data/*` are vendored into the Edge payload, so the payload
guard is correctly RED: `the deployed hr-accrue reports payload 122e57cf… but this repo packs to 886e8268…`.
Bane reads through `equipmentStats` → `weaknessInfo`, which accrual.js already calls at every site
(accrual.js:686/1203/1479, :950), so away accrual gets it for free — **but only after the redeploy.**

## Resolved

### 2026-08-15 · BLOCKER · the away buff rule reached only one of three away callers — RESOLVED in b347 (Systems)
**Was:** `AWAY_SCOPE.buff` opened for every away caller at once, but only `simulateSpan` owned a timeline. `processOffline`'s gather and artisan branches ran `ticks = floor(spanMs / offlineIntervalMs())` with the interval derived once — so a buff paid the whole absence and drained none of it.

**Measured, real engine, 8h away on woodcutting Normal Tree, one 10-minute consumable eaten on the way out:**

| | control (no buff) | `gather_speed +4%` | `all_xp +5%` |
|---|---|---|---|
| BEFORE — actions | 6,000 | **6,250 (+250)** | 6,000 |
| BEFORE — woodcutting XP | 30,000 | 31,250 | **36,000 (+20.0%)** |
| BEFORE — buff drained | — | **0 of 600,000 ms** | **0 of 600,000 ms** |
| AFTER — actions | 6,000 | **6,005 (+5)** | 6,000 |
| AFTER — woodcutting XP | 30,000 | 30,025 | **30,125 (+0.417%)** |
| AFTER — buff drained | — | **600,000 ms, expired + pruned** | **600,000 ms, expired + pruned** |

So the consumable bought **50× the actions** and **48× the XP** it had earned, and came back reading a full 10:00 — repeatable every night, forever. It now buys exactly the slice it was alive for and is spent.

**Fix:** `replayAwaySpan` in `legacy.js` (beside `offlineIntervalMs`) — the span is split at buff-expiry boundaries, the interval is re-derived per slice, the sub-tick remainder carries across, and `advanceBuffClock` (the ONE clock) is called per slice. The boundary function is `nextBuffExpiryMs` in `src/core/buffs.js`, beside `activeBuffs` so it applies the same liveness rule. Same shape as `utcDaySegments`; NO second mechanism. `AWAY_SCOPE.buff` stayed `true`.
**Also fixed:** the non-combat `buffsPaused` expression (was "did they hold a buff", a lie in both directions on a gather night) and four stale comment blocks + one player-facing string that described the freeze that no longer exists.
**Guards:** `AWAY-16` (drives the real `processOffline`; 4 mutations RED) and `AWAY-17` (the boundary oracle; 3 mutations RED). In all seven, `AWAY-1 PARITY` and `AWAY-5` stayed GREEN — which is precisely why a combat test could never have caught this.

### 2026-08-08 · SEMANTIC · Auto-eat vs foodClass split — RESOLVED in b220 (Game Designer)
**Was:** cooking taxonomy adds `foodClass: 'healing' | 'buff'` and auto-eat must draw from `'healing'` only, but fish-line Provisions carry incidental combat buffs, so the line was unclear.
**Ruling (taxonomy §5.4):** the fish line KEEPS its buffs — `foodClass` governs what the *engine* may spend, not what stats an item has. Stripping +12% damage from Cooked Shark would be a combat-balance change smuggled in under a UI task, and it isn't needed: `maybeAutoEat()` heals and decrements, it never calls `applyBuff()`, so auto-eating a Provision grants no hidden power. Buffs are applied only by the deliberate Eat action.
**Evidence that settled it:** the real defect was auto-eat's *selection*, which preferred items with no `buff` field — and since every cooked food has one, that meant raw ingredients: it picked Raw Shrimp (3 HP) over Cooked Shark (42 HP), then fell through to a Void Banquet once raws ran out. Now the pool is exactly Provisions and the pick is the best heal. Verified in-browser: with only Feasts in the bag at 8/100 HP `maybeAutoEat()` returns false and consumes nothing; with Provisions present it eats Cooked Shark (HP 8→50) and leaves the Void Banquet stack at 3. Regression tests: `b168/b220: auto-eat draws from Provisions, preserves Feasts` and `b220: auto-eat never consumes buff food`.



### 2026-08-16 - SEMANTIC - Monster portrait folder: `painted/` vs `hearthfire/` (Systems -> Art/Asset)
**The disagreement, surfaced rather than silently resolved.** `docs/design/monster-art-prompts.md` §0
states new portraits land in `assets/icons-bundle/painted/monsters/` and says "no new subfolders".
The shipped art pilot (branch `worktree-agent-a4e0fed55ec269eca`, commit `04ba415`) put them in
`assets/icons-bundle/hearthfire/`. Both are shipped folders, so neither is wrong - but the
81-portrait batch cannot be generated against two answers.
**What I did:** followed the pilot (`hearthfire/`), because that is what exists on disk and it keeps
the retired-direction `painted/` set visibly separate while batch M0 regenerates it. The choice is
ONE constant - `HEARTHFIRE_DIR` in `src/data/monster-art.js`. Changing it re-points all 81 and the
preflight re-verifies. **Art Director owns the ruling; say the word and it is a one-line change.**

### 2026-08-16 - CODE - Pilot art wiring overlaps branch `worktree-agent-a4e0fed55ec269eca`
That branch adds `assets/icons-bundle/hearthfire/monsters/{barn_rat,elk_king,grim_reaper,hellhound,winter_wolf}.png`
(processed to 256x256) and parks three of them on borrowed live ids - `hellhound -> lesser_demon`,
`grim_reaper -> wraith`, `elk_king -> bear` - marked PILOT PREVIEW ONLY.
**Those three ids now EXIST.** `src/data/monster-art.js` binds each portrait to the monster it
actually depicts and gives `lesser_demon` / `wraith` / `bear` their own files back, so **the parks are
gone by construction**. On merge: take that branch's PNG bytes (this branch carries only the
unprocessed 1024px sources under `assets/art-pilot/`, which I deliberately did NOT ship - 1.2 MB
each), then add those five ids to `SHIPPED` in `monster-art.js`. `monsterArtPreflight` in
`tests/run-smoke.mjs` fails the build if that second step is forgotten, so the merge cannot half-land.

---

## [Systems Engineer → Art Director] companions.js proc/panel text below the 14.5px font floor (worker-settlement branch)

While wiring the hired-worker client to the server RPCs I surfaced a latent font-floor
violation in `src/features/companions.js` (Art-domain visual surface):

- `showProc()` (~L280) rendered the proc toast at `font-size:13.5px` — below the project's
  14.5px HARD floor. It slipped past the b227 document scan only because the toast is
  short-lived; once my new async worker test shifted suite timing, b227 caught the toast
  mid-life (`div @ 13.5px "🦊 __b420proc__"`) **deterministically**. I fixed THIS one line to
  `calc(14.5px * var(--ui-scale, 1))` (the form the rest of the UI + workers.js use) to
  unblock the suite — a clear floor violation, minimal + safe. Please confirm the visual is fine.
- Still unfixed (I did NOT touch your panel markup): the Companion panel at L589–L590 also
  uses `font-size:13.5px` (the XP line and the proc-description line). Same floor violation;
  b227 doesn't catch them today only because the panel isn't open at scan time. Recommend the
  same `calc(14.5px * var(--ui-scale,1))` conversion.
- Also noted, NOT changed: the proc toast bg/ink are hardcoded colours (`rgba(127,154,79,.95)`
  / `#0f1320`), not theme tokens — the color HARD RULE. Yours to convert when you next touch it.

Separately: the toast relies on `setTimeout(()=>el.remove(),1700)`, which the headless page
throttles so the toast can outlive its intended 1.7s. Not fixed here; a cheap hardening would
be to also drive removal off the `animationend` event. Flagging, not acting.

---

## 2026-08-29 — SYSTEMS → BACKEND (combat-XP credit lane) · a SECOND faucet now writes `player_skills.hitpoints`

Not a code conflict (no shared file — my touch is `hr_goal_rewards` rows + the goal RPC's gate), but a
**semantic** one your faucet audit should know about, filed rather than assumed.

b492 re-points the kill goals' XP from the phantom skill `'combat'` (never paid — not an `hr_skills`
row, so `hr_claim_goal` dropped it into `skipped_xp`) to **`hitpoints`**, at the Designer's retune:
kill_any **100**, kill_more **300**, wk_kills **1000**.

**What that means for your lane:** `player_skills.hitpoints` now has two server-side writers —
`hr_credit_combat_xp` (yours, elapsed-time-clamped by `hr_combat_xp_cap`) and `hr_claim_goal` (the
period-reward path). They are independent and **additive by design**: a goal reward is a bonus on top
of the XP the kills themselves already paid, and neither consumes the other's budget.

- Your `hr_combat_xp_cap` is an **elapsed-time physical-max** on the credit you accept, so a goal
  claim does not eat into it and it does not restrict the goal. I read it that way; **correct me if
  the clamp is ever re-expressed as a cap on the skill TOTAL** — at that point the two channels would
  start fighting and a legitimate goal claim could be clamped away as forged combat XP.
- The new ceiling to carry in the faucet total: **400 hitpoints XP/day + 1,000/week**, structural
  (server catalogue + `player_progress` once-guard), not budgeted.
- **`hitpoints` is ranked** (it feeds combat level and the leaderboards), which is why I did NOT
  migrate any legacy `G.skills.combat` value into it. That number was never server-authored;
  converting it would have minted ranked XP from a client artefact. `2026-08-17-cutover-import.sql`
  drops the key by name and `tests/cutover-import.mjs` C7/C8 assert it — **please keep it dropped.**

Nothing of yours needs to change today. Flagging so the number appears in your audit rather than
surprising it.
