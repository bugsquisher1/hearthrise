# Hearthrise — Feature Slate

**Maintained** beside `PRIORITY_BOARD.md` (board = in flight; slate = what to build next). Owner:
Game Designer. _Revised 2026-09-07 from a played pass on b518 — new-player boot, the tour, 13
screens; server halves read in code._


## The ranking — score = (retention × payment intent) ÷ cost in lane-B days

| # | Feature | Loop | R | P | Cost | Score |
|---|---|---|---|---|---|---|
| 1 | **First Light** | first 30 min | 5 | 4 | 0.5 | **40** |
| 2 | **The Hearthfind** | weekly · social | 4 | 5 | 1 | **20** |
| 3 | **Set the Night** | nightly | 4 | 3 | 1 | **12** |
| 4 | **The Wandering Champion** | first 30 min | 4 | 4 | 1.5 | **10.7** |
| 5 | **The Ledger of Firsts** | weekly | 3 | 3 | 1 | **9** |
| 6 | **The Larder** | nightly | 3 | 3 | 1.5 | **6** |

**Why #1 is #1.** Everything below it multiplies a player who is still here. The game already ships a
five-quest first-day chain — Gather 15 → Cook 5 → Defeat 5 → Harvest 6 → 100 kills, all
server-credited through `hr_claim_quest` — and **a new player cannot see one of them** (fix #1 below).
They get "Kill 60 monsters / Gather 120 resources / Cook 12 items" instead: ~45 minutes before a
first reward lands. First Light costs half a day, ships content that already exists and is already
server-authoritative, and makes minute five a ladder whose last rung switches the idle pillar on.


## 1 · First Light — the first day, made visible

**Promise:** "Your first day has five steps; the last one keeps your fights going while you sleep."

**Server authority.** No engine work. One row in `QUEST_DEFS` + `QUEST_REWARDS`
(`src/data/goal-catalogue.js`): `first_light`, the capstone, granting **Auto-Eat I** — paid by
`hr_claim_quest` in the same transaction as its gold (as `first_cook`'s shrimp are), writing the
`hr_auto_eat_tier` column and a `player_ledger` row. Clamp: one claim per quest id per character,
already enforced. The 15-Marks purchase stays.

**Client surface.** Home (`home-dashboard.js`): a pinned **"Your first day"** card above "Next up",
shown only while a chain quest is open — five rows, current step lit, each deep-linking through
`HearthriseQuestNav.destination`. Tokens only. **Test:** fresh `G` → five rows, row 1 `gatherer`;
`updateQuest('gather',15)` → row 1 claimable, row 2 lit. **Regression:** chain complete ⇒ card absent.
**Play-gate:** new live account → chop 15, cook 5, claim each, reload; progress holds. **Must NOT:**
grant Auto-Eat I client-side; hide the Marks route; re-order "Next up" for veterans; be sellable.

## 2 · The Hearthfind — the super-rare drop moment

**Promise:** "Once in a very long while the realm stops what it is doing to look at what you found."
The screenshot, the Discord post, the reason a player tells a friend. `DROP_BAND_MAX.rare` is **5%**
and the rarest shipped drop 0.5%: there is no such thing as a rare drop here yet.

**Server authority.** `hearthfind:true` items plus a `HEARTHFIND_TABLE` row per source (monster /
node / crop) carrying `oneIn` in the 5,000–50,000 band. The roll lives in the drop step of
`combat-sim.js` / `skill-sim.js` — the one engine the live tick and `hr-accrue` both run — seeded from
server RNG. `hr_apply` writes the item, a `player_ledger` row (`kind:'hearthfind'`) and a row in a new
public-read, RPC-insert-only `world_finds` table. Clamps: **≤3 per character per UTC day**, one
broadcast per 60 s, a per-source `oneIn` floor in the migration's §4 self-check.

**Client surface.** A reveal on Combat/Skills (item plate at `--rr-glow`, the odds it beat, how many
have ever found it); one line in the existing `global` chat channel (`src/chat.js`, Realtime, live
today); a Collection-log row; a "copy card" PNG button. **Composition goes to the Art Director.**

**Test:** force the seeded RNG → ledger row, `world_finds` row, reveal, collection entry.
**Both-path:** a find inside an away span returns on the receipt and reveals on return. **Guard:** no
hearthfind row mints `hearth_token`/`muster_seal`. **Play-gate:** A forces a find, B sees the global
line unreloaded. **Must NOT:** be purchasable or boostable by anything paid; be client-rolled;
broadcast what the ledger did not journal.

## 3 · Set the Night — the return ritual

**Promise:** "Before you close the tab the game tells you how far your food carries you; the morning
tells you how right it was."

Today the return is `welcome-overlay` — *"Welcome back, adventurer"* and a **Continue** button. The
away card beneath is scrupulously honest (deaths, recovery, dry-out, base rate) and entirely passive:
no decision in the ritual. Two welcome modals exist and the suppression does not suppress
(`legacy.js:14583`) — **ruling: v2 retires, b341 survives.** The 30-minute floor stands.

**Server authority.** `hr_night_forecast`, read-only: for the *currently declared* activity, expected
kills/actions over the next 8 h, food or ammo consumed, and the dry-out hour — `estimateSurvival` +
`ammo.js` `dryAtMs` evaluated server-side. No writes; the rate gate is the only clamp.

**Client surface.** A "Tonight" strip on Home's "Right now" card naming the shortfall ("~8 h of
Goblins ≈ 240 kills · 96 food · you have 40 — dries out at 3 h"); on return the modal leads with
**what you set** beside **what you got**, then one **Claim the night** button; a three-day
**Homecoming** streak on the daily-login rail paying +1 h offline cap.

**Test:** the strip equals `estimateSurvival`; after an 8 h sim the set/got pair equals the receipt.
**Both-path:** attended switch-off and away. **Play-gate:** 20 food → close → return → forecast and
receipt dry-out agree. **Must NOT:** author the forecast client-side; re-sim a completed night; gate
the claim behind anything purchasable.

## 4 · The Wandering Champion — a boss in hour two

**Promise:** "Something worth fighting turns up while you are still learning to fight."

A new player's Combat rail is four grey cards — Boss of the Day (45), Weekly Boss (60), Dungeon (25),
Clan Raid (locked) — and Events is six locked dungeons. Measured, Combat 25 is ~24,000 combat XP ≈
**260 goblin kills ≈ 1.5–2 h of fighting**: the gate is fine. Missing is any event inside it.

**Server authority.** A `CHAMPIONS` data table (`src/data/monsters.js` shape, `champion:true`) whose
stats generate from the **server-side** combat level at spawn; from Combat 8, 4 h cooldown, keyed to
`hr_server_now`'s UTC hour so everyone on that hour meets the same champion. Loot rolls in the same
engine and guarantees **1× Bone Key** on a first kill, so the Crypt key precedes its gate. Clamp: one
credited kill per cooldown window, enforced against a `champion_kills` row and ledger-journalled.
**No dungeon level gate moves.**

**Client surface.** The Champion takes the rail's top slot under Combat 25; every locked card below
gains a distance line ("Combat 12 / 25 — about 140 kills"). **Test:** at Combat 8 the card is live and
the locked cards state their distance; kill it → one Bone Key, one ledger row, refusal inside
cooldown. **Play-gate:** reach Combat 8 live, kill it, carry the key into the Crypt at 25. **Must
NOT:** lower a dungeon gate; let the client choose the champion or its tier; drop anything a level-1
character cannot otherwise reach.

## 5 · The Ledger of Firsts — a collection log with rungs

**Promise:** "Every first you have had is written down, and the book pays you for filling it."
`COLLECTION_MILESTONES` has **four** rows (10 monsters, all 108, 50 items, 100 items): rungs 2 and 3
are separated by the whole game.

**Server authority.** Rows only: extend `src/data/collection-milestones.js` to ~18 rungs across
`monsters`, `items` and two new domains, `crops` and `recipes`, projected from the `ev:harvest:%` and
`ev:cooked:%` ledger events. `hr_claim_milestone` re-derives every count server-side and the drift
guard binds module ↔ client rows ↔ SQL: a catalogue edit and a regenerate.

**Client surface.** The two new domains, plus a "next rung" line on Home's Collection-log tile (today
a bare "0%"). **Test:** drift guard extended, one claim per domain. **Play-gate:** claim the first
crop rung, reload, it holds. **Must NOT:** pay a rung the server cannot re-derive.




## 6 · The Larder — crops that matter

**Promise:** "The food you grow is why your homestead is stronger than someone else's." Every crop
already has a cooking recipe, so the dead end is motivational: the output is one more heal in a game
where the kit's `cooked_shrimp` heals 8. Crops need a sink that is not the food slot.

**Server authority.** (a) A **Preserves** lane under Cooking (`ARTISAN_RECIPES.cooking`, `preserve_*`)
turning 5 of a crop into one stackable tradeable jar — a real market good with a real faucet, and the
cheapest honest answer to the market's empty shelves. (b) A Kitchen rung, **Larder**, bought through
`hr_unlock_buy` (`room.kitchen.<rung>`), paid in *crops*, granting a server-owned `larderYield` via
`hr_perks_of` → `makeBonus` — the path `noBurn` takes, so a forged client Larder buys nothing.

**Client surface.** A "what it's for" line per crop on Farm; the Larder rung and its cost in House →
Rooms → Kitchen. **Test:** the reachability guard covers every new input; a rung test asserts the
client cannot write it. **Play-gate:** plant → harvest → preserve → list → buy on a second account.
**Must NOT:** pay a crop buff away without draining it (`AWAY_SCOPE.buff`); out-mint the vendor.


## Top 5 existing-feature fixes met while playing

**1 · P1 — the five-quest first-day chain is invisible.** Home shows one milestone and the skill
candidate wins the 0%-vs-0% tie (`profile-launchpad.js`: skills first, strict `>`); the "QUESTS"
modal holds only Daily/Weekly. _Repro:_ fresh account → "Next up" = *Attack Lv 1 → 2* + 3 dailies,
while `G.quests.filter(q=>!q.done).length === 5`.

**2 · P1 — the tour teaches two rules the game no longer has.** *"nobody does it for you yet"* and
*"A fight ends when you fall"*, against Recovery Rule rev.2; it never names the Bounty Board, where
Auto-Eat I is. _Repro:_ fresh boot → the tour, steps 4 and 6 vs `src/core/away.js`.

**3 · P2 — the away card still says cooking does not pay away.** `home-dashboard.js:695`, on a b388
comment b431 falsified. _Repro:_ return idle → empty-night note vs `artisan-sim.js:554`.

**4 · P2 — kit and property disagree on farm plots.** `START_CURRENCY.farmPlots = 4`; Wanderer's Camp
is 2, and `farmhand` was tuned against 2. _Repro:_ `start-kit.js` vs `homestead.js TIERS[0]`.

**5 · P3 — the first screen sells four locked gem slots and a dead button.** "Your heroes", slots 2–5
at 200/500/900/1,500 gems above the fold, slot 2 on a disabled *"Checking…"*. _Repro:_ boot.

Fixes 1–3 are single-file copy/selection changes for lane A, ahead of any slate item. Fix 4 is a
ruling for Systems (**the property tier wins; the kit constant becomes derived**). Fix 5 goes to the
Art Director as a placement call.
