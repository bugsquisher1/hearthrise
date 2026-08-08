# Clan Boss Events — The Tiered Hunt

**Backlog #16 · P2 (big) · Owner: Game Designer + Systems · Wave 3**
**Author: Game Designer · 2026-08-08 · Status: SPEC (buildable blueprint, no code changed)**
**Tyler's direction (binding):** a clan analogue of world events — clans fight **tiered group bosses**.
**Reads with:** `docs/design/clan-overhaul.md` (#10) and `docs/design/world-event-cadence.md` (#15/#14). This is the third leg of one Wave-3 package, not a bolt-on.
**Amended 2026-08-08 for clan-overhaul v2** — §10 reconciles this spec with the source design doc's *Siege*, and §3.3/§5.4 gain the War Room and blueprint interlocks. Read §10 first if you are here from the castle spec.

---

## 1. Recommendation up front: **extend the weekly raid, do not build a parallel system**

Build **one** clan boss loop: the existing weekly raid, generalised into a **tiered ladder the clan chooses to fight**. Do not ship "clan boss events" alongside "clan raids".

Three reasons, in order of weight:

1. **There is only one attention budget.** A clan member has one strike-shaped click per day. Two weekly clan-boss loops would split that click, and both would feel undersubscribed — which is exactly how a small clan dies.
2. **The infrastructure already exists and is the right shape.** `raids.js` + `schema.sql` §4b give a shared HP pool, an atomic server-clamped decrement, a per-member contribution ledger, and an idempotent claim. A tiered boss event needs precisely those four things.
3. **The castle overhaul already assumes one loop.** `clan-overhaul.md` §4.3 defines the **War Room** wing granting `raidPower` (+4%…+20% strike damage). That perk only makes sense if there is a single raid loop for it to buff. Two loops would make it either half-useful or double-dipping.

So: the weekly raid **is** the clan boss event. What changes is that it becomes **tiered, scaled to the clan, and actually winnable** — because today it is none of those things.

---

## 2. What exists today, and the arithmetic that condemns it

### 2.1 Ground truth

| Piece | Where | Value |
|---|---|---|
| Bosses | `raids.js:26-39` | 3, rotating weekly by `FNV1a('hr-raid-' + weekKey)` |
| Clan pool | `raids.js:40` | `CLAN_POOL_HP = 250,000` — **flat, regardless of clan size** |
| Solo pool | `raids.js:41` | `SOLO_POOL_HP = 30,000` |
| Entry | `raids.js:42` | `REQ_COMBAT_LV = 30` |
| Strike | `raids.js:73-85` | 120 ticks of real `getPlayerCombatRolls`, clamped to `[10, 50000]` |
| Rate limit | `raids.js:93` | 1 strike per UTC day — **checked only in local `G.raids.lastStrikeDay`** |
| Server RPC | `schema.sql:377-405` | clamps damage to 50,000, decrements the pool, ledgers contribution |
| Claim | `raids.js:149-175` | conditional PATCH on `raid_contributions … claimed=eq.false`; **any contributor gets the full chest** |
| Surfaced in | `raids.js:179` | `#panel-dungeons` — a panel with no navigation entry (see `world-event-cadence.md` §7.1) |

### 2.2 Expected strike damage, derived from the real combat formulas

`legacy.js:863-890`: `accuracy = clamp(0.55 + ((accLvl + accBonus) − bossDef) × 0.01, 0.15, 0.95)`, `maxHit = floor(dmgLvl × 0.35 + strBonus × 0.6 + 2) − floor(bossDef × 0.03)`, weakness match multiplies accuracy ×1.15 and damage ×1.20 (`legacy.js:50`). `simulateStrike` runs 120 ticks; expected damage per landed hit ≈ `maxHit / 2`.

Against a def-55 boss, weakness matched:

| Player band | Atk/Str lvl | Equip bonus | accuracy | maxHit | **Expected strike** |
|---|---|---|---|---|---|
| Entry (CL 30-45) | 40 | +25 / +20 | 0.75 | 32 | **~1,200** |
| Mid (CL 46-60) | 55 | +45 / +45 | 0.95 | 56 | **~2,900** |
| High (CL 61-75) | 72 | +60 / +75 | 0.95 | 85 | **~4,800** |
| Endgame (CL 76-90) | 88 | +80 / +100 | 0.95 | 109 | **~6,300** |
| Max (CL 90+) | 99 | +100 / +130 | 0.95 | 135 | **~8,000** |

### 2.3 Therefore

- **The clan raid is unwinnable for a normal clan.** A 10-member mid-level clan at *perfect* attendance produces `10 × 7 × 2,900 = 203,000` against a 250,000 pool. At a realistic 5 strikes each it is 145,000 — **58%**. The pool has never been downed and no chest has ever been claimed. The feature has been shipped and invisible since b209.
- **The solo raid is unwinnable below CL 61.** `30,000 / 7` requires 4,286 per strike. Entry players manage 8,400 in a whole week (28%); mid players 20,300 (68%). Only high/endgame players ever finish.
- **My own standing backlog note was half right.** I logged "solo raid pool one-tap chest (30k HP vs 50k clamp)". The 50,000 clamp is ~6× the best *honest* strike, so a one-tap is only reachable by a tampered client — it is a security hole, not a balance one. The real balance bug is the opposite: **honest players cannot finish either pool.** Correcting the record.
- **The flat pool is the root cause.** One number cannot serve a 3-person clan and a 60-person clan. Scaling the pool to the clan is the single change that makes the content exist.

### 2.4 Three live exploits found while reading (flag to Systems — these are in production now)

1. **P1 — the once-per-day strike limit is client-side only.** `raids.js:93` checks `G.raids.lastStrikeDay`; `raid_strike` (`schema.sql:377`) has **no day check at all**. A tampered save or a replayed request can strike unlimited times per day, bounded only by the 50,000 damage clamp. The limit must move into the RPC.
2. **P2 — chest-hopping.** `claim()` pays the **full** chest to anyone with a contribution row, and `clan_members` has open join/leave policies (`schema.sql:288-293`). Join a clan whose pool is nearly dead → strike once → claim full chest → leave → repeat. Fix: the claim RPC must require `clan_members.joined_at < clan_raids.declared_at`.
3. **P3 — solo claim is purely local.** `st.claimed[wk]` lives in the save; editing it re-grants the chest. Low impact (solo rewards are local anyway) but it should be noted rather than discovered later.

---

## 3. The design: **The Hunt**

A clan **declares a Hunt** each week — choosing which tier of boss to face. The pool scales to the roster at declaration. Every member strikes once a day. When the boss falls, everyone who genuinely fought claims a chest scaled to what they actually did.

### 3.1 Why *declaring* a tier is the core mechanic

A flat difficulty forces one number to fit every clan. Letting the clan pick makes difficulty a **decision the leadership argues about in clan chat** — exactly the retention argument that `clan-overhaul.md` §4.1 makes for the wing build order. A 6-person Keep clan declares Tier II and clears it. A 40-person Citadel declares Tier IV and sweats. Both had a good week.

Declaration is officer/leader-only, once per UTC week, and locks for the week.

**The undeclared week — Designer ruling, 2026-08-08 (ratified as implemented).** The spec did not say what happens when nobody declares. Systems ruled that officers own the first `c_grace_days = 3` UTC days of the week and, after that, the next member's strike auto-founds a **Tier I** Hunt at the live roster size (`raid_strike`, `2026-08-08-hunt.sql`). **Ratified, and 3 days is the right number** — it is exactly the largest window that still leaves a majority of the week (4 of 7 days) to actually kill the thing, which is what the §3.3 pool tuning assumes (~5 of 7 days of attendance). Two days would let one member's impatience overrule a leadership that is merely asleep; four would hand the roster a week it cannot finish.

Three properties of the rule that must not drift:
- **Tier I, never higher.** The auto-founded Hunt is the floor tier every clan qualifies for, so the fallback can never pick a tier the roster cannot clear or one the officers would not have chosen. Declaration remains the *upgrade* decision — that is what keeps it a decision.
- **The refusal is free.** The "no Hunt yet" check runs *before* the one-strike-per-day gate, so a member who tries on day 1 loses nothing.
- **The day index is week-aligned by construction.** `v_dow = (date − epoch) % 7` and `hr_utc_week_key = (date − epoch) / 7` share one epoch, so day 0 is always the first day of the Hunt week. Do not "fix" `v_dow` to an ISO weekday — that would silently slide the grace window off the week boundary.

*Flagged, not reversed:* the Hunt week rolls **Thursday 00:00 UTC** (the epoch's own weekday) while castle upkeep rolls **Sunday 00:00 UTC** (`hr_last_upkeep_boundary`). Two reset clocks inside one clan pillar is a player-facing confusion. Target state is a single clan week boundary; changing it now would truncate a live raid week, so it is a follow-up for Systems, not a Wave-3b reversal.

### 3.2 The pool scales with the roster — which makes freeloaders visible

```
pool_hp = TIER_BASE + TIER_PER_MEMBER × members_at_declaration
```

`members_at_declaration` is snapshotted server-side when the Hunt is declared.

This one formula does three jobs at once:
- **It matches difficulty to clan size** without a difficulty slider.
- **Alt-stuffing becomes self-defeating.** Every alt raises the pool by `TIER_PER_MEMBER` and contributes only what it can actually strike. Stuffing makes your own clan's boss harder.
- **Freeloaders become a visible cost.** A member who never strikes still raised the pool. That is a real reason for officers to use the promote/kick tools from `clan-overhaul.md` §9 — and it is what ties #16 and #10 into one system instead of two features that happen to share a table.

### 3.3 The tier ladder

Tier availability is gated by `castle_tier` (the Great Hall, `clan-overhaul.md` §5) **and by the War Room building level** (`clan-overhaul.md` §7). Pool values are tuned against the measured strike table in §2.2, targeting a kill when ~70% of the roster strikes ~5 of 7 days.

```
max_hunt_tier = min( castle_tier , 1 + floor(war_room_level / 3) )
```

**Clan `level` is no longer a gate.** `clan-overhaul.md` v2 §2.3 found that `clan_contribute`'s ×4 ladder puts clan level 10 at 655,360,000 gold — an unreachable number that would have frozen the Hunt at Tier I forever. The castle's **Standing** currency and the War Room replace it.

| Tier | Hunt name | `castle_tier` req | War Room lvl req | Expected member CL | `TIER_BASE` | `TIER_PER_MEMBER` | Pool @ n=10 |
|---|---|---|---|---|---|---|---|
| **I** | **Warband Hunt** | 1 (Wayside Camp) | 0 | 30-45 | 5,000 | 3,000 | 35,000 |
| **II** | **Keep Hunt** | 2 (Palisade) | 3 | 46-60 | 15,000 | 7,500 | 90,000 |
| **III** | **Fortress Hunt** | 3 (Timber Hold) | 6 | 61-75 | 30,000 | 12,500 | 155,000 |
| **IV** | **Citadel Hunt** | 4 (Stone Bailey) | 9 | 76-90 | 50,000 | 16,000 | 210,000 |
| **V** | **Crown Hunt** | 5 (Fortified Keep) | 12 *(Phase C)* | 90+ | 80,000 | 21,000 | 290,000 |

Tier names for `castle_tier` follow clan-overhaul v2 §5 (Wayside Camp → Palisade → Timber Hold → Stone Bailey → Fortified Keep); the Hunt names are unchanged. War Room level 12 requires castle tier 6, so **Tier V is Phase C content** — Phase A tops out at the Citadel Hunt.

**The reciprocal gate:** castle tiers 4 and 5 each require a **Hunt clear at the matching tier within the last 4 weeks** (§10.2). So the Hunt is not optional content bolted to the side of the castle — it is load-bearing in both directions.

Worked check, Tier II, 10 mid members: pool 90,000; expected weekly output `10 × 5 × 2,900 × 0.7 = 101,500` → **downed with ~11% headroom.** Tier V, 40 max-level members: pool 920,000; expected `40 × 5 × 8,000 × 0.7 = 1,120,000` → downed with ~18% headroom. Every tier is a real fight that a committed clan wins.

For reference, today's flat 250,000 sits between Tier III and Tier IV — i.e. **the shipped raid is tuned for a 25-person endgame clan and has been served to everyone.**

### 3.4 The bosses

The three existing bosses are kept verbatim (they are good, and they are already original IP). Three new ones extend the ladder. Each tier rotates weekly within its own boss set, by `FNV1a('hr-hunt-' + tier + '-' + weekKey)`.

| Tier | Boss | `def` | Weak to | Signature material | Flavour |
|---|---|---|---|---|---|
| I-II | **The Emberclad Tyrant** *(exists)* | 55 | hammer | `slagheart_core` | A furnace given a crown. Its slag-armor weeps molten iron. |
| I-II | **The Hollow Regent** *(exists)* | 48 | magic | `hollow_sigil` | A king who outlived his own bones. The crown remembers. |
| II-III | **The Maw Below** *(exists)* | 62 | ranged | `abyssal_pearl` | The lake was never empty. It was waiting. |
| III-IV | **The Sunken Choir** *(new)* | 70 | magic | `choirbone` | Nine drowned cantors beneath the ice, holding one note. It has not changed in six hundred years. |
| IV-V | **Warden of the Long Dark** *(new)* | 78 | hammer | `warden_seal` | It was set to guard a door. The door is gone. It still guards. |
| V | **The Crownless Wyrm** *(new)* | 88 | ranged | `wyrm_gilding` | It ate the king who named it, and took nothing else. |

**Signature materials are the top of the crafting ladder, not vendor trash.** My standing backlog records ~25 tier-3-6 combat drops with no recipe. These six must ship *with* recipes in the b215 armour tiers — a boss material with no use is worse than no drop at all, because it teaches the player that boss loot is meaningless. **Hard requirement, not a nice-to-have.**

### 3.4a The Hunt-forged kit — Designer ruling, 2026-08-08

Systems proposed and shipped six pieces one rung above Dawnsteel (b223, `src/data/items.js` + `src/data/recipes.js`). Audited against `gear-tiers.js` and the no-solo-reach positioning. **Ratified with one correction.**

**Stats — ratified as authored.** Every piece continues its own `ARMOUR_SLOTS.def` curve at the same step Dawnsteel takes over Emberforged, checked slot by slot:

| Piece | Slot | Dawnsteel | Hunt-forged | Step | Ember→Dawn step |
|---|---|---|---|---|---|
| Hollow Regent Helm | helmet | 44 | 59 | 1.34× | 1.33× |
| Slagheart Platebody | body | 90 | 120 | 1.33× | 1.32× |
| Abyssal Greaves | pants | 64 | 85 | 1.33× | 1.33× |
| Choirbone Gauntlets | gloves | 23 | 31 | 1.35× | 1.35× |
| Warden's Girdle | belt | 30 | 40 | 1.33× | 1.36× |
| Wyrmgilt Mantle | cape | — | 14 def / 6 atk | new rung | — |

The ladder stays one line. `rarity:'unique'`, `tier:8` and the flat 2.5× value multiple are also ratified — 2.5× is *below* the ladder's own value step (`tier.value` moves 130 → 360, i.e. 2.77×), so the kit is priced conservatively rather than inflated.

**Correction — the level gates were inverted, and are re-ruled.** Generated Dawnsteel recipes require `88 + slot.lvOff`: gauntlets 89, boots 90, belt 91, helm 93, legs 96, body 98. Three of the six Hunt-forged pieces unlocked *below* the Dawnsteel piece they replace, and one tied — a player at Smithing 95 could forge the best platebody in the game but not the second-best. That is a broken ladder, not a shortcut. Corrected to sit strictly above the rung beneath:

| Recipe | Dawnsteel rung | Was | **Now** |
|---|---|---|---|
| `forge_choirbone_gauntlets` | 89 | 90 | **90** (already correct) |
| `forge_warden_girdle` | 91 | 91 *(tie)* | **92** |
| `forge_regent_helm` | 93 | 92 *(inverted)* | **94** |
| `forge_abyssal_greaves` | 96 | 93 *(inverted)* | **97** |
| `forge_slagheart_platebody` | 98 | 95 *(inverted)* | **99** |
| `craft_wyrmgilt_mantle` | — (top crafting recipe is the Dawnsteel Rod at 94) | 95 | **95** (correct) |

The headline band therefore becomes **Smithing 90-99, Crafting 95**, not 90-95. Putting the single best armour piece in the game at Smithing 99 is deliberate: it is the one recipe that requires both a maxed skill *and* a clan that downs Hunt bosses, which is exactly what the two north-star pillars are supposed to mean when they meet.

**The missing boots are deliberate — ratified.** Six signature materials buy six pieces, and the sixth goes to the cape rather than a boots rung. The cape slot has had two entries since launch (Traveler Cape `defB 1`, Alpha Cloak `defB 5`); a Wyrmgilt Mantle at `defB 14 / atkB 6` gives it its first endgame rung, which is worth more than a boots piece that would have been a +10 defence footnote. Consequence, stated so nobody "fixes" it later: **Dawnsteel Boots remain best-in-slot forever, and that is the point** — the Hunt crowns your smithing, it does not replace it.

**Tradeability — ruled.** Nothing enforces `bop` on the market today, and the kit is not marked BoP, so it is tradeable. That is **kept**: a solo player buying a Hunt-forged piece is paying a clan for the clan's work, which is a good reason for clans to hunt and a large honest gold sink. The spec's positioning is corrected from *"solo play cannot reach"* to **"solo play cannot earn"** — the only route for a soloist is the market, at a price a clan sets.

**Flagged to Systems, not fixed here (systemic, pre-existing):** vendoring pays the full item `v` (`invSellOne`), so every high-tier craft is a gold faucet — a Dawnsteel Platebody turns 21,000g of bars into 108,000g, and the Hunt-forged one turns 34,800g into 270,000g. The Hunt is not the marginal offender (its inputs are weekly-rate-limited; ore gathering is not), but the arbitrage should be priced deliberately rather than inherited from the value curve.

### 3.5 The solo Hunt, fixed

Solo players keep a scaled personal pool so the content is never a locked door, but it must be neither one-tappable nor impossible.

**`solo_pool = clamp(5 × your first strike of the week, 20,000, 200,000)`**, set on the first strike and frozen for the week.

The pool calibrates to the player's actual measured power, so it always takes 5-6 strikes — a genuine weekly loop at every level, from CL 30 to CL 99. `SOLO_POOL_HP` becomes obsolete. Solo has **no tiers** (tiers are the clan's reward for being a clan) and keeps the existing **0.4× chest**, which is the social pull. Strike clamp for solo is `pool × 0.25`, so a one-tap is arithmetically impossible.

---

## 4. Cadence — how this sits against everything else

Clan bosses are the **weekly** heartbeat. World events are the **daily** heartbeat. They must never demand the same click.

| Loop | Cadence | The click | Where |
|---|---|---|---|
| Daily login reward | daily | claim | Home |
| Daily tasks (×3) | daily | passive | Home |
| **World-event muster** | **2 slots/day, join 1** | join + rally | Events / topbar |
| **Clan Hunt strike** | **1/day** | strike | Events / clan panel |
| Clan Hunt declaration | 1/week, officers | declare | clan panel |
| Clan objectives (#10 §5) | weekly | passive | clan panel |
| Weekly quests | weekly | passive | Home |

Two deliberate clicks per day, everything else passive. That is the right density for an idle game.

### 4.1 No scheduled rally window — and why that is the right call

The obvious move is a fixed "rally hour" so the clan fights together. **Reject it.** A clan's members span every timezone; `world-event-cadence.md` §3.3 only makes fixed slots work by pairing them 12h apart *and* letting you skip one. A clan cannot skip its own clan. Any fixed hour permanently excludes part of the roster, which is the opposite of what a clan feature is for.

Get the social moment without the clock instead:

- **The Faltering.** When the pool drops below 10%, every member gets a toast and a clan-chat system line: *"The Emberclad Tyrant is faltering — 8% remains."* People convene because the boss is nearly dead, not because a calendar said so. Naturally distributed across timezones.
- **The Killing Blow.** Whoever lands it is named in clan chat and on the clan panel for the week. One line of text; disproportionate social value.
- **First Blood.** The first striker each week is named. Gives early-timezone members something that is theirs.

`clan_raids.downed_at` already exists, so The Killing Blow is nearly free.

---

## 5. Contribution and rewards

### 5.1 The problem being fixed

`grantReward(boss, 1.0)` (`raids.js:134-147`) pays the **full chest** to anyone with a contribution row. One 10-damage strike out of a 250,000 pool earns the same as a member who struck seven times. That is the freeload hole, and combined with open join/leave it is the chest-hopping exploit in §2.4.

### 5.2 Bands measured against the median, not against the pool

An absolute percentage band punishes members of large clans (in a 40-person clan the average member is 2.5% of the pool; in a 10-person clan, 10%). Band against the clan's **median contributor** instead — size-independent and directly anti-freeload:

| Band | Condition | Share |
|---|---|---|
| **Champion of the Hunt** | ≥ 150% of median | **1.3×** + signature-drop roll |
| **Full share** | ≥ 60% of median | **1.0×** |
| **Partisan's share** | ≥ 20% of median **and** ≥ 2 strikes | **0.6×** |
| No chest | below that, or < 2 strikes | — |

- **Minimum 2 strikes for any chest.** This alone kills the one-tap.
- **The median is computed only over members with ≥ 3 strikes**, so a swarm of one-strike alts cannot depress it to farm the Champion band.
- Bands, not a linear share, because a linear split would punish lower-geared members for owning worse gear — and a clan needs its newer members to feel welcome. Anyone who genuinely turned up gets a full share.

### 5.3 Partial credit — no all-or-nothing cliff

If the boss is not downed by the week's end, qualifying contributors still claim:

```
chest × band × min(0.6, total_damage / pool_hp)
```

claimable in a 24-hour grace window after the week rolls. An idle game cannot punish a clan for one bad week of attendance; but the kill is still clearly better (full value **plus** the signature drop), so it remains the goal.

### 5.4 Chest by tier (full share, ×band)

*Amended: §10.4 adds a **clan Standing** column to this table — the Hunt's permanent contribution to the castle. Standing is paid flat, once per kill, not per claimer.*

| Tier | Gold | Gems | Materials | Signature drop on kill |
|---|---|---|---|---|
| **I** Warband | 7,000 | 12 | 4× tier-2/3 mats | — |
| **II** Keep | 14,000 | 20 | 6× tier-3/4 mats | 15% (Champion only) |
| **III** Fortress | 28,000 | 30 | 8× tier-4/5 mats | 25% |
| **IV** Citadel | 50,000 | 45 | 10× tier-5/6 mats | 40% |
| **V** Crown | 90,000 | 60 | 12× tier-6 mats | **guaranteed** |
| *Solo Lone Hunt* | 2,800 | 5 | 2× tier-2 mats | — |

Tier II sits deliberately at today's shipped chest (`raids.js`: 10-14k gold, 25-30 gems), so the existing tuning stays the anchor and the ladder extends in both directions from a known point.

Economy sanity: a Tier V Champion earns 117,000 gold and 78 gems per week. Gems ≈ 340/month for a member of a fully-built Castle clan (8,000,000 treasury — the longest goal in the game), against 500-1,000 gem cosmetic prices (`legacy.js:312-316`) and a 250-gem $4.99 starter pack. That is the ceiling of the entire game, gated behind the hardest collective achievement in it. Correct.

**No Hearth Tokens at any tier or band.** (Final Directive: IAP-only, never PvE-minted.)

### 5.5 Anti-freeload / anti-alt-stuffing, consolidated

| Vector | Defence |
|---|---|
| One-tap chest | ≥ 2 strikes required; solo clamp = 25% of pool |
| Freeloading | median-banded shares; freeloaders also raised the pool at declaration |
| Alt-stuffing the roster | each alt adds `TIER_PER_MEMBER` to the pool; rewards are personal, so stuffing only costs the stuffer's clan |
| Alt-stuffing the median | median computed over members with ≥ 3 strikes only |
| Chest-hopping between clans | claim RPC requires `clan_members.joined_at < clan_raids.declared_at` |
| Unlimited strikes (live P1) | day-key check moves into `raid_strike` |
| Damage forgery | clamp = `max(5,000, floor(pool_hp × 0.10))` — self-scaling, so no single strike can ever do more than a tenth of any boss |
| Solo claim replay | move the solo claim flag into the cloud save's server-validated section, or accept it as local-only and document |

---

## 6. Where it lives (UI)

Two surfaces, one system:

- **Events panel** (created by `world-event-cadence.md` §7.2): the Hunt card — boss art, tier, HP bar, `Strike (1/day)` / `Claim`, and your contribution vs the median. This is the *action* surface, and it replaces the raid card's current home in `#panel-dungeons`, a panel with no nav entry.
- **Clan castle panel** (`clan-overhaul.md` §9): the Hunt appears in the "This week" strip alongside the top objective — boss, HP bar, and a `Declare the Hunt` control for officers when none is declared. This is the *status* surface: "what does my clan need right now."

Both read the same state; neither duplicates the other's controls.

**Art hand-off:** six boss portraits in "Forge & Stone", no emoji. The three new bosses need original art; the three existing ones currently render as text glyphs (`☲ ♔ ◎`) which is honest but flat for the game's flagship group content.

---

## 7. Server work (hand-off to Systems)

Additive. `clan_raids` gains columns; the client-side PATCH claim is replaced by an RPC because band maths and the anti-hop check cannot live on the client.

```sql
-- 7.1 alter clan_raids: tier int not null default 1,
--     declared_at timestamptz, declared_by uuid,
--     members_at_declare int not null default 0

-- 7.2 clan_hunt_declare(p_clan_id uuid, p_tier int) -> jsonb
--     leader/officer only · once per week_key · p_tier <= tier_for(castle_tier)
--     and clan level >= tier req · snapshot member count · compute and store
--     pool_hp = TIER_BASE + TIER_PER_MEMBER * members · set declared_at

-- 7.3 raid_strike: add the per-day guard that is missing today (P1 in §2.4).
--     Track (clan_id, week_key, user_id, last_strike_day, strikes) on
--     raid_contributions; reject a second strike on the same UTC day.
--     Replace the flat 50000 clamp with max(5000, floor(pool_hp * 0.10)).

-- 7.4 clan_raid_claim(p_clan_id uuid, p_week text) -> jsonb
--     Replaces the client PATCH. Server-side:
--       · require clan_members.joined_at < clan_raids.declared_at   (anti chest-hop)
--       · require strikes >= 2
--       · median over contributors with strikes >= 3 -> band
--       · downed ? full : partial = min(0.6, damage_total/pool_hp)
--       · idempotent flip of claimed
--       · RETURN the reward; the client must not compute it

-- 7.5 RLS: block direct client UPDATE of clan_raids.* and of
--     raid_contributions.damage/strikes. Claims go through 7.4 only.
--     (raid_contributions currently allows a self-UPDATE — schema.sql:369-371.)
```

**Client work:** `simulateStrike` must multiply its total by `1 + getBonus('raidPower')` (the new key from `clan-overhaul.md` §4.3 — otherwise the War Room wing buffs nothing); the Hunt card in the Events panel; the declare control in the clan panel; The Faltering / Killing Blow / First Blood notifications via the existing clan chat channel.

---

## 8. Test coverage required (per `CLAUDE.md`)

1. **Regression — a second strike the same day is refused by the server**, not just by local state (§2.4 P1).
2. **Regression — a one-strike contributor gets no chest**; a two-strike contributor gets Partisan's share.
3. **Regression — chest-hop blocked**: join after `declared_at`, strike twice, claim → refused.
4. **Pool scaling**: declare Tier II at n=5 and n=25, assert `pool_hp` = 52,500 and 202,500.
5. **Tier gating**: a `castle_tier` 1 clan declaring Tier III → refused.
6. **Band maths**: seed contributions of 100/500/1000/5000 (all with ≥3 strikes). The median is 750, so the assertions are **no chest / Full / Full / Champion** — 100 is 13% of the median, below §5.2's 20% Partisan floor. Add 150 (exactly 20% → Partisan) and 300 (40% → Partisan) so the floor itself is pinned, not just inferred.

> **Designer ruling, 2026-08-08 (ratified).** This test case originally read *"Partisan/Full/Full/Champion"*, which contradicted §5.2's own 20%-of-median floor. **§5.2 is normative and stands unchanged** — the floor is the whole point of the band (a contributor at 13% of the median did not turn up, and paying them 0.6× would reopen the freeload hole §5.1 exists to close). §8.6 was the arithmetic error and is corrected above. The implementation (`raids.js` `BANDS` = 1.5/0.6/0.2 → 1.3×/1.0×/0.6×, and `raid_claim`'s identical ladder in `2026-08-08-hunt.sql`) matches §5.2 exactly and is ratified as shipped; `smoke-test.js` already pins both the floor and the two edge rungs.
7. **Partial credit**: 40% of a pool at week end → chest × 0.4; 90% → chest × 0.6 (capped).
8. **Solo pool calibration**: first strike of 1,200 → pool 20,000 (floor); first strike of 8,000 → pool 40,000; assert no single strike can exceed 25% of it.
9. **`raidPower` reaches the strike**: seed a War Room tier, assert `simulateStrike` output rises proportionally.

---

## 9. Cross-spec dependencies and conflicts (for `CONFLICTS.md`)

1. ~~**`clan-overhaul.md` §5.2 needs re-tuning.**~~ **RESOLVED in clan-overhaul v2 §9.2.** The objective *"Break the Siege — 500,000 raid damage"* was written against the flat 250,000 pool; against a Tier I pool of 35,000 it asked for fifteen bosses. It is now the **Tavern Board's weekly task**, targeted at `1.5 × the declared Hunt's pool_hp`, computed at declaration. Weekly clan objectives as a separate system no longer exist — the Board absorbed them.
2. **`raidPower` is a new `getBonus` key** (`clan-overhaul.md` v2 §7) that `raids.js simulateStrike` must consume. Already flagged; restated because the tier ladder's climbability depends on it. In v2 it comes from the **War Room building** (+1%/lvl → +10% at L10), not a "wing".
3. **The perk-stacking re-scope** (`clan-overhaul.md` v2 §8.3) must land in the same wave. Hunt rewards are sized against current income; a simultaneous +72% `allXP` stack would invalidate the tuning in §5.4. (v2 recomputed the unmanaged ceiling as **+72%**, not +57% — v1 omitted the Great Hall's own contribution.)
4. **The Events panel is a shared dependency.** `world-event-cadence.md` §7.2 moves the raid card out of `#panel-dungeons`. If #15/#14 and #16 ship in different waves, the Hunt card lands in a panel that no longer has a nav entry — the exact bug #14 exists to fix. **Ship them together.**
5. **The three live exploits in §2.4 are in production today** and are independent of this spec. They should be fixed on their own schedule if Wave 3 slips — particularly the P1 unlimited-strike hole.
6. **Signature materials require recipes.** Six new boss materials must land with b215-armour-tier recipes in the same commit, or they become the 35th through 40th recipe-less vendor-trash drops. *(Recount: `clan-overhaul.md` v2 §4.4 measured the live orphan set at **34**, not ~25, and routed all 34 into castle demands. Adding six unrouted boss materials would immediately reopen a problem that spec just closed — so the six either get armour recipes or get a castle route. Either is acceptable; neither is optional.)*
7. **The War Room is a Phase-A castle building** (`clan-overhaul.md` v2 §7). Without it the Hunt has no declaration surface and no tier ceiling above I. **#16 cannot ship before castle buildings exist.**
8. **`clan_raids.downed_at` is now read by the castle**, for the tier-4/5 blueprint gate (§10.2). It exists today; it must not be dropped or reset by any Hunt migration.

---

## 10. The Siege, reconciled — one combat pillar, not two

Tyler's source design doc ("The Clan Seat") specifies a **weekly Siege**: waves of attackers assault the castle Walls over a 60-minute window, defenders take four live roles (Wall Crew, Tower Crew, Sally Force, Quartermaster), and clearing it drops the **Blueprints that gate Castle Tiers**. That is a second weekly clan-combat loop competing with the Hunt for the same one strike-shaped click per day.

**Ruling: the Hunt is the clan's combat pillar. The Siege is absorbed into it — as a gate, a modifier and a name — and is never a parallel system.**

### 10.1 Why the Hunt wins the collision

1. **There is no live shared combat instance.** `simulateStrike` (`raids.js:73-85`) runs 120 ticks of `getPlayerCombatRolls` *offline, for one player*. Four synchronous defender roles need a real-time server-side fight that does not exist and is not on any roadmap. Shipping the roles as UI over an offline simulation would be a fake, and the Final Directive forbids fakes.
2. **A 60-minute fixed window excludes part of every roster.** §4.1 already settled this for rallies: world events survive fixed slots by pairing them 12h apart and letting you skip one — *a clan cannot skip its own clan.*
3. **One attention budget.** Two weekly clan-boss loops would both feel undersubscribed, which is how a small clan dies (§1).

### 10.2 What survives, translated

| Source-doc Siege element | Hearthrise translation | Phase |
|---|---|---|
| **Blueprints gate Castle Tiers** | **Castle tiers 4 and 5 require a Hunt clear at the matching tier within the last 4 weeks** — Tier II for the Stone Bailey, Tier III for the Fortified Keep. `clan_raids.downed_at` already exists, so the gate costs one `where` clause. The Hunt becomes **mandatory but never scheduled** — exactly the property §4.1 argued for. | **A** |
| Waves assault the Walls | The **Hold the Gate** modifier, attached by the declaring officer. Each UTC day the Hunt lives, the boss removes `siege_damage` from the castle's **Bulwark** pool. If the Bulwark empties before the boss does, the hold drops to **Strained** for one week — reusing `clan-overhaul.md` §10's existing upkeep state rather than inventing a punishment. Reward for holding: **chest × 1.35**. | **B** (needs the Walls district) |
| Wall / Tower / Sally / Quartermaster roles | **Rejected.** §10.1. | — |
| Curtain Walls, Gatehouse, Watchtowers, Barbican | Walls-district buildings: raise the Bulwark pool, reduce `siege_damage`. | **B** |
| "Spoils of War" research (+25% siege materials) | Archives research branch. | **B** |
| Relics for Legendary Benches | Rejected with stations (`clan-overhaul.md` v2 §14.5). | — |

The word **Siege** survives as the modifier's name, so nothing of the flavour is lost: *a Hunt with Hold the Gate attached is the Siege.*

### 10.3 The interlock, stated once

- **War Room level** sets the Hunt tier ceiling (§3.3). A clan that never builds it is stuck on Tier I Hunts, and therefore stuck at castle tier 3.
- **`raidPower`** from the War Room multiplies `simulateStrike` (§7 client work). Without it the building buffs nothing.
- **Hunt chests pay Standing** into the castle (§10.4), and **castle tiers 4-5 require Hunt kills** (§10.2). The loop closes in both directions — which is what makes this one system rather than two features sharing a table.
- The **Tavern Board's weekly task** is the Hunt damage objective, at `1.5 × pool_hp` (`clan-overhaul.md` v2 §9.2).
- The **Faltering / Killing Blow / First Blood** lines (§4.1) post to clan chat and to the castle panel's "This week" strip.

### 10.4 Hunt chests pay Standing

One column added to the §5.4 chest table. Standing is the clan-pooled, never-decaying castle currency (`clan-overhaul.md` v2 §3), so this is the Hunt's permanent contribution to the hold:

| Tier | Gold | Gems | Materials | **Clan Standing (per kill, flat)** |
|---|---|---|---|---|
| **I** Warband | 7,000 | 12 | 4× tier-2/3 mats | **1,200** |
| **II** Keep | 14,000 | 20 | 6× tier-3/4 mats | **3,000** |
| **III** Fortress | 28,000 | 30 | 8× tier-4/5 mats | **7,000** |
| **IV** Citadel | 50,000 | 45 | 10× tier-5/6 mats | **15,000** |
| **V** Crown | 90,000 | 60 | 12× tier-6 mats | **32,000** |
| *Solo Lone Hunt* | 2,800 | 5 | 2× tier-2 mats | — |

Standing is **flat per kill, not per contributor** — it is the hold's achievement, not a payout, so it cannot be farmed by stuffing the roster (which also raises the pool, §3.2). A partial-credit week (§5.3) pays Standing × the same `min(0.6, damage/pool_hp)` factor.

Sanity check against `clan-overhaul.md` v2 §5.1: an active 10-member clan generates ~20,000 Standing/week, of which a Tier II kill is 3,000 — **15%.** Meaningful, and nowhere near enough to skip the economy. Correct weighting: the Hunt is a gate and a bonus, never the main road.

### 10.5 Extra server work created by this section

```sql
-- 10.5a clan_hunt_declare (§7.2) gains p_hold_gate boolean default false (Phase B)
--       and validates p_tier <= least(castle_tier, 1 + floor(war_room_level / 3)),
--       reading war_room_level from clans.upgrades->>'war_room'.

-- 10.5b clan_raid_claim (§7.4): when the boss is downed, additionally
--         update public.clans set standing = standing + tier_standing(tier)
--       exactly ONCE per (clan_id, week_key). Guard on a new
--         clan_raids.standing_paid boolean not null default false
--       flipped in the same statement — never per claimer, or a 40-member
--       clan pays itself 40× the Standing for one kill.

-- 10.5c clan_tier_up (clan-overhaul v2 §12.2) reads:
--         exists (select 1 from public.clan_raids
--                  where clan_id = p_clan_id and tier >= v_required
--                    and downed_at > now() - interval '28 days')
```

Test coverage to add to §8: **(10)** a downed Tier II Hunt pays 3,000 Standing once, not once per claimer; **(11)** a castle tier-4 attempt with no Hunt clear in 28 days is refused; **(12)** a Tier III declaration at War Room level 5 is refused, and allowed at 6.

---

## 11. Hand-offs

- **Systems:** §7 and §10.5 in full; the P1 day-guard is the highest-priority item on this page and is independent of everything else.
- **Art Director:** six boss portraits, the Hunt card in the Events panel, the "This week" strip in the clan castle panel. No emoji.
- **Game Designer (me):** owns `TIER_BASE` / `TIER_PER_MEMBER` (§3.3), the band thresholds (§5.2), the chest table (§5.4) and the Standing column (§10.4). First re-tune after one full week of live Hunt data. If clans are clearing too early the lever is `TIER_PER_MEMBER`, not the chest — difficulty should scale with the clan, and reward should stay predictable.
