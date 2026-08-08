# Game Designer — running log

_Your private journal. Newest at top. Team-wide items also go to `DISCOVERIES.md` / `HANDOFFS.md`._

## Standing knowledge
- Play as a NEW player; hunt dead moments ("what now? / why does this matter?"). Smallest strong fix, then re-play to verify.
- North star: online-only social idle-RPG, all skills to 99 (`src/data/gear-tiers.js`), renown + daily login + collection log = retention pillars.
- No pay-to-win (Season Pass removed); Hearth Token is IAP-only, never PvE-minted. Coordinate economy changes with Systems.

## Standing backlog (open design questions)
- Cellar +500 storage perk feeds nothing.
- Solo raid pool one-tap weekly chest (30k HP vs 50k strike clamp).
- "Harvest 25 crops" daily harsh for 2-plot camp starters.
- `deaths` stat never increments.
- Only 2 real bosses; ~25 tier-3–6 drops are recipe-less vendor trash — route into b215 armour tiers (top content investment).

## Log
### 2026-08-08 · Wave 1 — design specs (#13, #15+#14, #16)
Three more buildable specs in `docs/design/`, no game code touched. Grounded in `farm-progression.js`, `auto-actions.js`, `homestead.js`, `world-events.js`, `raids.js`, `clans.js`, `dungeons.js`, `nav-consolidation.js`, `home-dashboard.js`, `schema.sql`, and the farm/daily/combat/topbar code in `legacy.js`.

- **farming-watering.md** — watering becomes a **2h growth window at 2× rate**; the window mechanic self-caps the benefit at exactly −50% (`W ≤ hours/4`), so no extra cooldown or charge counter is needed. Key finding: watering is a **mandatory gate** today (`elapsed>=hours && p.watered`, no timeout) so **auto-replant is a trap** — it plants dry and the plot stalls forever; a dry plot also renders no % and no bar, so the stall is invisible. One derivation function `growthHours()` with a `min(bonus, elapsed)` clamp makes 2× a hard invariant. Migration: `watered:true → waterings:[plantedAt]` (strictly better), `watered:false → []` (un-sticks every stalled plot). Also fixes "Harvest 25 crops" — the daily pool entries are factories evaluated at generation time, so goal becomes `max(10, 3 × farmPlotCap())`.
- **world-event-cadence.md** — today's "world events" are a **passive `getBonus` wrapper**, not joinable, so #15 is a new activity layer. Two layers, one name: the ambient **Blessing** (all day, everyone — the fairness valve) + the **Muster** (45 min, 2 slots/day, join 1). Fixed UTC **01:00 / 13:00** — 12h apart means every inhabited offset gets ≥1 slot in 09:00-23:00 local, and since you can only join once, one convenient slot is *sufficient*. The two slots derive different events, so once/day becomes a **choice**, not a restriction. Join enforced by PK `(day_key, user_id)`; server re-derives liveness from `now()`. Topbar pill in 7 states (no "you missed it" state). Discoverability: the Dungeons nav button is **injected then CSS-hidden** (`theme-cozy.css:268-271`), absent from mobile entirely, and the clan raid card lives inside that hidden panel → restore one top-level **Events** destination.
- **clan-boss-events.md** — **extend the weekly raid, don't build a parallel loop.** Derived expected strike damage from the real combat formulas (~1,200 entry → ~8,000 max): the flat 250k clan pool is **unwinnable** for a normal 10-person mid clan even at perfect attendance (203k), and the 30k solo pool is unwinnable below CL61. Fix = `pool = TIER_BASE + TIER_PER_MEMBER × members_at_declaration` across a 5-tier ladder gated by `castle_tier`, so freeloaders/alts *raise the pool* and become a visible cost. Rewards banded against the **median contributor** (size-independent), min 2 strikes, partial credit up to 0.6×. No scheduled rally window (timezones) — social moment via The Faltering / Killing Blow / First Blood. Corrected my own backlog note: the solo "one-tap" is a tamper hole, not a balance one; the real bug is the opposite.

**Live exploits found in production while reading `raids.js`/`schema.sql`:**
- **P1** — the 1-strike-per-day limit is client-side only (`G.raids.lastStrikeDay`); `raid_strike` has no day check. Unlimited strikes from a tampered save.
- **P2** — chest-hopping: `claim()` pays the full chest to any contributor and join/leave is open, so you can join a near-dead clan pool, strike once, claim, leave, repeat.
- **P3** — solo claim flag `st.claimed[wk]` is local-only; a save edit re-grants.

### 2026-08-08 · Wave 0 — design specs (#10/#11/#12)
Wrote three buildable specs in `docs/design/` (no game code touched). Grounded in actual source: read `clans.js`, `renown.js`, `raids.js`, `schema.sql`, `recipes.js`, `items.js`, `gear-tiers.js`, `skills.js`, `renderSocial`/`renderArtisanActivities`/`ROOMS` in `legacy.js`.
- **clan-overhaul.md** — castle-progression fantasy. Key finding: `clans.upgrades jsonb` + `castle_tier int` columns already exist in schema, UNUSED → clean hook, no destructive migration. Castle = shared homestead (mirror `ROOMS`). Great Hall (`castle_tier` 0-5, member cap + gate) + 6 buyable wings (perks via existing getBonus keys, one NEW key `raidPower`). Weekly collective objectives (server-counted). Panel = a PLACE; management in modals (reuse `hr-rn-scrim` pattern). Gold-only treasury sink for v1.
- **leaderboards.md** — always-show-your-rank + nearby rivals (fixes #1 demotivator); Throne/Renown flagship board (needs `snapshot.renown` surfaced); per-skill ×15; boss/raid; Climbers monthly season; matview `leaderboard_ranked` for scale; cosmetic titles + gems (no tokens).
- **crafting-cooking-taxonomy.md** — categories DERIVED from existing fields (no hand-tagging 135 recipes). Smithing: Smelting/Weapons/Armour/Tools. Crafting: Sawmill/Weapons/Armour/Jewellery/Tools/Ammunition. Cooking split via new `foodClass` flag: Provisions (13 healing) vs Feasts & Draughts (14 buff/drink) — full item→class table delivered. Sub-tabs (reuse `data-lb`/`data-house` pattern).

**Semantic conflicts flagged for CONFLICTS.md (Systems):**
1. Perk stacking — homestead+renown+clan-level+clan-wings all funnel getBonus; allXP could hit ~+57%. Recommend re-scoping the clan auto-level PERKS to baseline-only + a per-key soft cap. (clan-overhaul §7)
2. `raidPower` is a new getBonus key raids.js must consume. (clan-overhaul §4.3)
3. Auto-eat must filter to `foodClass:'healing'`; fish-line incidental combat buffs blur heal/buff line — balance call I own. (taxonomy §5.4)
4. Leaderboards need `snapshot.renown` written client-side on save. (leaderboards §3.2)

### 2026-08-08 · bootstrap
Domain seeded. No active task.
