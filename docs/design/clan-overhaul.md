# Clan Overhaul — "Build the Castle Together"

**Backlog #10 · P1 (big) · Owner: Game Designer + Systems + Art · Wave 3**
**Author: Game Designer · 2026-08-08 · Status: SPEC (buildable blueprint, no code changed)**

---

## 1. The problem, stated plainly

Play the clan panel today (`src/features/clans.js` → `renderClanSection`) and you get: a name, a level number, a treasury progress bar, one number box to dump gold into, a flat list of passive perks, and a roster. That is a **bank account with a chat channel**. There is no place, no fantasy, no shared project you can *see* growing, and nothing for a member to *do* on behalf of the clan beyond wiring gold once.

A clan in an OSRS-scale social idle-RPG should be the answer to *"why do I keep logging in with these people?"* The answer is: **we are building a castle, and it isn't finished.** Every member's grind visibly raises a wall. This spec turns the treasury account into a castle you build, defend, and rise through together.

## 2. The fantasy

You don't "join a clan." You **swear to a hold** that starts as a muddy **Camp** and, through the collective grind of its members, becomes a **Keep → Fortress → Citadel → Castle**. The main panel is the **castle itself** — you watch wings get built, banners get raised, the raid boss get dragged down. Detail and management live behind clean **modals** so the panel is always a *place*, never a form.

This deliberately mirrors the personal homestead ladder (`ROOMS` in `src/legacy.js` — Kitchen/Forge/Library/Trophy, each 3 tiers, each granting a `getBonus` key). The homestead is *your* house; **the castle is the clan's homestead** — same proven mechanic, but shared, server-authoritative, and social.

---

## 3. What exists today (ground truth)

| Piece | Where | State |
|---|---|---|
| `clans` table: `id, name, created_by, level, treasury, upgrades jsonb, castle_tier int` | `supabase/schema.sql` §4 | **`upgrades` and `castle_tier` columns EXIST and are never read or written.** This is the hook. |
| `clan_members`: `role (leader/officer/member), contributed` | schema §4 | Live. Roles defined but **only `leader` is ever assigned**; no promote/demote/kick. |
| `clan_contribute(p_clan_id, p_amount)` RPC | schema §4 | Banks gold → treasury, auto-levels (10k×4ⁿ, cap Lv10), caps 10M/call. Server-authoritative. Keep. |
| Auto-level `PERKS` ladder Lv2–Lv10 (allXP/gather/artisan/offline) | `clans.js` `PERKS` | Passive, flows through `getBonus`. **Keep, but re-scope** (see §7). |
| `renderClanSection` | `clans.js` | Treasury bar + one contribute box + perk list + roster. To be rebuilt as the castle panel + modals. |
| Clan raids | `raids.js` + schema §4b | Weekly shared boss, 250k HP pool, `raid_strike` RPC. Surfaced in Dungeons, not the clan panel. |
| `clan_leaderboard` view | schema §5 | `level, treasury, castle_tier, members`. |

**Key finding:** the schema was built *forward-looking* — `upgrades jsonb` and `castle_tier int` are already there waiting. The overhaul needs **no destructive migration** of the clans table; it fills columns that already exist and adds one objectives table.

---

## 4. The castle upgrade tree (the core new system)

### 4.1 Two kinds of progression, kept distinct

- **Clan Level (existing, automatic):** rises purely from treasury gold banked via `clan_contribute`. Gates the tree (a prerequisite gate) and keeps a small always-on perk. *No agency — it just happens as gold flows in.*
- **Castle Wings (NEW, chosen):** officers **spend treasury** to build/upgrade specific wings. This is the agency layer — a clan decides *"raid power first, or artisan speed first?"* Each wing tier grants a **clan-wide perk** through `getBonus`, exactly like homestead `ROOMS`.

Keeping these distinct is deliberate: level = the shared grind's heartbeat; wings = the shared *strategy*. One is a bar that fills; the other is a build order the leadership argues about in clan chat. That argument is retention.

### 4.2 `castle_tier` — the Great Hall (the spine)

`castle_tier` (0→5) is the Great Hall level. It is the **master gate**: every other wing can be upgraded only up to the Great Hall's tier. Upgrading the Great Hall is the clan's big collective milestone and drives the **visible silhouette** on the panel and the **member cap**.

| `castle_tier` | Name | Member cap | Unlocks | Treasury cost | Clan Level req |
|---|---|---|---|---|---|
| 0 | **Camp** | 10 | founding state | — | 1 |
| 1 | **Palisade** | 15 | wings tier 1 | 25,000 | 2 |
| 2 | **Keep** | 25 | wings tier 2, 2nd objective slot | 120,000 | 4 |
| 3 | **Fortress** | 40 | wings tier 3, officer promote/kick | 500,000 | 6 |
| 4 | **Citadel** | 60 | wings tier 4, 3rd objective slot | 2,000,000 | 8 |
| 5 | **Castle** | 100 | wings tier 5, castle banner cosmetic | 8,000,000 | 10 |

Member cap is enforced server-side on join (see §8). Numbers assume gold-only treasury (see §6) and are tuned so a small active clan reaches Keep in a week or two and Castle is a long-horizon guild goal — the OSRS "we're a real clan now" moment.

### 4.3 The wings

Each wing has 5 tiers (gated by `castle_tier`). Perk values are **per-tier cumulative** and use **already-wired `getBonus` keys** so nothing here is a broken promise. Costs are treasury gold.

| Wing | `getBonus` key(s) | Per-tier perk (T1→T5) | Fantasy | Cost T1→T5 (gold) |
|---|---|---|---|---|
| **War Room** | `raidPower`* | +4% / +8% / +12% / +16% / +20% raid strike damage | drag bosses down faster | 40k / 160k / 500k / 1.5M / 4M |
| **Training Yard** | `combatXP` | +2% / +4% / +6% / +8% / +10% combat XP | knights drill in the yard | 30k / 120k / 400k / 1.2M / 3M |
| **Artisan Guildhall** | `cookSpeed`,`smithSpeed`,`craftSpeed` | +2% / +4% / +6% / +8% / +10% artisan speed | forges & kitchens ring | 30k / 120k / 400k / 1.2M / 3M |
| **Gatherers' Lodge** | `gatherSpeed` | +2% / +4% / +6% / +8% / +10% gather speed | woodsmen & miners of the hold | 30k / 120k / 400k / 1.2M / 3M |
| **Treasury Vault** | `offlineHours`, `goldFind` | +1h/+2h/+3h/+4h/+5h offline cap **and** +2%…+10% gold find | deep coffers | 50k / 200k / 600k / 1.8M / 5M |
| **Scholar's Tower** | `allXP` | +1% / +2% / +3% / +4% / +5% all XP | the hold's library | 60k / 240k / 700k / 2M / 6M |

\* **`raidPower` is a NEW `getBonus` key** → hand-off to Systems (§10). `raids.js simulateStrike` must multiply its total by `1 + getBonus('raidPower')`. Every other key already exists and already flows.

### 4.4 Data shape for `upgrades jsonb`

```jsonc
// clans.upgrades — read client-side by a new perksFromUpgrades(), fed into getBonus
{
  "war_room": 3,          // wing id → tier owned (0 = not built, omitted = 0)
  "training_yard": 2,
  "artisan_guildhall": 1,
  "gatherers_lodge": 0,
  "treasury_vault": 2,
  "scholars_tower": 1
}
```

`castle_tier` stays its own integer column (drives cap + silhouette + gate). This is a pure additive read/write on columns that already exist.

---

## 5. Clan growth tasks (objectives) — the reason members *act*

Contributing gold is one action. It gets stale. **Objectives** give every member a way to push the castle forward *through the gameplay they already do*, and give the clan a shared weekly heartbeat.

### 5.1 Model

- The clan has **1–3 active weekly objectives** (slot count from `castle_tier`: 1 at Camp, 2 at Keep, 3 at Citadel).
- Objectives are **collective counters** — every member's progress pools into one bar.
- They **rotate weekly** (UTC week key, reuse `HearthriseWorldEvents.utcWeekKey()` — same clock as raids).
- Completing one pays **treasury gold + a member-claimable reward** (each contributor claims once, like the raid chest pattern in `raids.js claim()`).

### 5.2 The objective pool (rotates 3/week from this list)

| Objective | Target (scales w/ member count) | Reward on completion |
|---|---|---|
| **Full Coffers** — bank gold to the treasury | 250,000 × (members/10) | +50k treasury bonus + 15 gems each |
| **The Great Hunt** — clan monster kills | 5,000 kills | +40k treasury + 20 gems each |
| **Stock the Larder** — cook any food | 3,000 items | +30k treasury + roasted-feast buff item each |
| **Raise the Walls** — gather logs/ore/fish | 40,000 nodes | +30k treasury + 15 gems each |
| **Break the Siege** — raid boss damage | 500,000 damage | +60k treasury + 30 gems each |
| **Masters of the Craft** — smith/craft items | 1,500 items | +40k treasury + 20 gems each |

Rewards are **gems, never Hearth Tokens** (Final Directive: tokens are IAP-only, never PvE-minted). Treasury bonuses accelerate the level/tier grind, closing the loop back into the castle.

### 5.3 Why this works

An objective converts *"I'm cooking anyway"* into *"I'm cooking for the clan, and the bar is at 2,847/3,000."* It makes idle activity social without adding a chore. Progress is server-counted from events the game already fires (see §8), so there is no new grind — only new *meaning* for the existing grind.

---

## 6. Economy & the treasury sink

- **Treasury = the primary gold sink for the mid/late game.** Gold in → via `clan_contribute` (existing, capped, server-authoritative). Gold out → **spent on wings** (new `clan_upgrade` RPC deducts from treasury).
- **v1 is gold-only.** Do **not** build a shared material store for launch — it needs inventory-authority the beta doesn't have yet (see the `buy_listing` "soft-beta limitation" note in schema §3). Wings cost gold; objectives reward gold + gems. This keeps the whole loop inside the one sink Supabase already governs.
- **Stretch (post-beta):** a "Clan Storehouse" where members donate bars/logs and high wings cost materials — flag to Systems as **needs server inventory authority first.**

### Anti-exploit (must hold at launch)
1. **All mutations are `SECURITY DEFINER` RPCs** with a membership check (`clan_upgrade`, `clan_objective_progress`, `clan_set_role`, `clan_kick`) — never client `PATCH` on `clans`/`clan_members` for level/treasury/upgrades. Tighten RLS so clients cannot `UPDATE` `clans.treasury/level/upgrades/castle_tier` or `clan_members.role/contributed` directly (today only `contribute`/join/leave paths are covered — the new columns need lockdown).
2. **`clan_upgrade` validates**: caller is `leader`/`officer`, wing id is real, next tier ≤ `castle_tier`, clan level ≥ req, treasury ≥ cost, then deducts atomically under row lock and writes `upgrades`/`castle_tier` in one statement. Reject otherwise. No negative, no skipping tiers.
3. **Objective progress is server-incremented only**, from trusted events, and **clamped** — a client cannot POST "I cooked 3,000 items." Increment via `clan_objective_progress(p_clan_id, p_obj, p_delta)` with `p_delta` bounded per call (e.g. ≤ 200) and rate-limited; the honest client batches its real deltas. This mirrors the `raid_strike` server-clamp philosophy (damage ≤ 50k/strike).
4. **Reward claims are idempotent** — one row per (clan, week, objective, user) with `claimed boolean`, flipped via a conditional update exactly like `raid_contributions` claims. No double-pay.
5. **Member cap** enforced inside the join RPC, not the client.

---

## 7. Conflict: perk stacking (FLAG for Systems)

Perks now come from **four** stacking sources, all funnelling through `getBonus`:
`homestead ROOMS` + `renown getPerks` + `clan auto-level PERKS` + **`clan castle wings` (new)**.

Left unmanaged, `allXP` alone could reach: Library +20% + Renown +22% + clan auto-level +10% + Scholar's Tower +5% = **+57% all XP**, before food/event buffs. That is runaway.

**Recommendation (Game Designer):** to avoid double-paying the same fantasy, **re-scope the existing auto-level `PERKS` ladder** so level grants *only* the small "membership" baseline (offline cap + a token +XP), and move the *meaningful* multipliers to the **chosen wings**. Concretely: strip `allXP`/`gatherSpeed`/artisan values out of the Lv2–Lv10 `PERKS` array (keep the Lv10 castle-banner cosmetic + modest offline), because those bonuses are now earned deliberately via wings. This preserves total power budget instead of adding a whole new stacking layer on top of the old one.

Additionally, ask Systems to consider a **per-key soft cap** in `getBonus` (e.g. `allXP` clamped to a sane ceiling) so no future content can trivially break economy pacing. **This is a semantic conflict, not a code conflict — raise in `CONFLICTS.md` before implementation.**

---

## 8. Server work (hand-off to Systems)

New/changed Supabase objects (additive; nothing destructive):

```sql
-- 8.1 Lock down the columns the overhaul writes (RLS: block direct client UPDATE
--     of treasury/level/upgrades/castle_tier and clan_members.role/contributed).

-- 8.2 clan_upgrade(p_clan_id uuid, p_wing text) → jsonb
--     role check (leader/officer) · tier ≤ castle_tier · level ≥ req ·
--     treasury ≥ cost · atomic deduct + write upgrades/castle_tier.

-- 8.3 clan_objectives (clan_id, week_key, obj_id, target, progress, primary key ...)
--     + clan_objective_claims (clan_id, week_key, obj_id, user_id, claimed)
--     + clan_objective_progress(p_clan_id, p_obj, p_delta)  -- membership check, delta-clamped
--     + clan_objective_claim(p_clan_id, p_week, p_obj)       -- idempotent, like raid claim

-- 8.4 clan_set_role(p_clan_id, p_user, p_role) + clan_kick(p_clan_id, p_user)
--     leader-only (officers may kick members but not officers).

-- 8.5 join RPC / policy: enforce member cap = cap_for(castle_tier).

-- 8.6 clan_leaderboard view: add sum(clan objective completions) or castle_tier
--     surfacing (already has castle_tier) for the leaderboards spec.
```

**Client event hooks** for objective progress (call `clan_objective_progress` batched, e.g. every 30s, from existing counters): kills (combat resolve), cooks/smiths/crafts (`startArtisan` completion), gather nodes (skill tick), raid damage (already in `raid_strike` — can double-write), gold banked (`clan_contribute` return).

---

## 9. UI: the panel vs the modals (Art + Systems)

**Principle: the main clan panel is a PLACE. Everything you *manage* is a modal.** This is exactly the note in the backlog ("use MODALS to keep the page clean") and matches the existing modal pattern already in the codebase (renown ladder modal `hr-rn-scrim` in `renown.js`; daily-login `hr-dl-scrim`). Reuse that scrim/overlay pattern — do not invent a new one.

### Main panel (`social-panel`, rebuilt `renderClanSection`)
- **Castle header:** clan name, `castle_tier` name (Camp…Castle), member count / cap, clan level bar (treasury → next level).
- **The castle view (Art):** a single illustrated castle silhouette where built wings are *lit / present* and unbuilt wings are *ghosted*. This is the "watch it grow" payoff. Ghosted → built is the dopamine. (Art Director owns the asset; no emoji — "Forge & Stone".)
- **This week strip:** raid boss HP bar (pulled from `raids.js clanStatus`) + the top objective's progress bar. One glance = "what does my clan need right now."
- **Three buttons only:** `[Manage Castle]` `[Objectives]` `[Roster]`. Plus a compact `[Contribute]`.

### Modals
| Modal | Contents | Who acts |
|---|---|---|
| **Manage Castle** | The wing tree: each wing = current tier, next-tier perk + cost, `[Upgrade]`. Great Hall at top. | Officers/leader upgrade; members view |
| **Objectives** | 1–3 weekly bars, contributors list, `[Claim]` when done | All members |
| **Roster** | Members, role, lifetime contribution, `[Promote]`/`[Kick]` | Leader/officer |
| **Contribute / Treasury** | Contribute-gold input (existing flow) + recent treasury events | All members |

Everything currently crammed into the flat panel moves into a modal, leaving the panel to *be the castle*.

---

## 10. Hand-offs summary

- **Systems:** items §8 (RPCs, RLS lockdown, objectives tables, cap enforcement, event hooks), the **`raidPower` new `getBonus` key**, and the **perk-stacking re-scope + soft-cap** decision (§7 — `CONFLICTS.md`).
- **Art:** the castle silhouette with lit/ghosted wings (§9), reusing the existing scrim modal styling; no emoji.
- **Game Designer (me):** owns the tuning tables (§4.2, §4.3, §5.2) and will re-tune once Systems confirms treasury flow rates against live economy data.

## 11. Build order (fits Wave 3)
1. RLS lockdown + `clan_upgrade` RPC + `perksFromUpgrades()` client read → wings work end-to-end (smallest shippable castle).
2. Panel rebuild + Manage Castle modal (Art castle view can land as a styled placeholder first, real asset after).
3. Objectives tables + RPCs + client event hooks + Objectives modal.
4. Roster roles (promote/kick) + member cap.
5. Perk re-scope (§7) landed *with* wings so total power budget never spikes.

Each step is independently shippable and testable (add smoke coverage per `CLAUDE.md`: an E2E that founds a clan, upgrades a wing off a seeded treasury, and asserts the perk reaches `getBonus`).
