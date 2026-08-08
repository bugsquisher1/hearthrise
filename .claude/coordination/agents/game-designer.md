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
