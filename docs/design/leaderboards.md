# Leaderboards Enhancement

**Backlog #11 · P2 · Owner: Game Designer + Art · (Systems support) · Wave 3**
**Author: Game Designer · 2026-08-08 · Status: SPEC (buildable blueprint, no code changed)**

---

## 1. What exists today (ground truth)

- **Views:** `leaderboard` (per-player: `user_id, name, total_level, combat_level, gold, clan_id, clan_name, saved_at`, ordered by `total_level desc`) and `clan_leaderboard` (`id, name, level, treasury, castle_tier, members`) — `supabase/schema.sql` §5, built over `game_saves.snapshot`.
- **Client:** `NetClient.leaderboard(mode)` in `clans.js` fetches top **15** for one of three modes — `total_level` / `combat_level` / `gold`. `renderSocial` (`legacy.js` ~2299) paints `lb-row`s with a rank badge (gold/silver/bronze for ranks 1–3) and columns Lv / CL / gold. `setLbMode('total'|'combat'|'gold')` swaps modes.

**Gaps that make it feel thin:**
1. **Top 15 only, and only if you're in it.** A player ranked #400 sees strangers and *never sees their own rank* — the single most demotivating thing a leaderboard can do. There is no "you are #412" line.
2. **Three boards.** No per-skill boards (the whole "skills to 99" fantasy has no leaderboard), no **Renown/Throne board** (the game's own meta-spine — "Rise to the Throne" — is absent from the one screen built to show off rank), no boss/raid board, no seasonal board.
3. **No stakes.** Ranking earns nothing. A leaderboard with no reward is a spectator sport.
4. **Scale-blind.** `order ... limit 15` over a growing table is fine at 15 rows but the "your rank" and per-skill needs will hammer the DB unless designed for it.

---

## 2. Design goals

1. **Every player sees themselves, always** — rank, and the handful of rivals directly above them (the "I can catch #411 tonight" hook).
2. **Surface the meta-spine** — Renown/Throne rank is the *flagship* board, because it's the destination the whole game funnels into (`renown.js`).
3. **Celebrate the "to 99" fantasy** — a board per skill.
4. **Give ranking stakes** — cosmetic titles + modest, economy-safe rewards.
5. **Scale to 10k+ players** without a full-table scan per view.

---

## 3. The boards

### 3.1 Individual boards

| Board | Sort key | Source | Notes |
|---|---|---|---|
| **Throne / Renown** ★flagship | Renown score | `renown.js computeRenown` | Show the player's **rank title** (Peasant…High King) beside the number — this *is* "Rise to the Throne." |
| **Total Level** | `total_level` | existing view | keep |
| **Combat Level** | `combat_level` | existing view | keep |
| **Wealth** | `gold` | existing view | keep; rename "Gold" → "Wealth" for tone |
| **Per-skill × 15** | that skill's XP | `snapshot->'skills'->>'<skill>'` | one board each: Attack, Strength, Defense, Hitpoints, Prayer, Magic, Ranged, Woodcutting, Mining, Fishing, Farming, Cooking, Crafting, Smithing, Bounty Hunter (the 15 in `SKILLS_DEF`) |
| **Bosses** | total boss kills | `snapshot->'bestiary'` summed over `MONSTERS[id].boss` | mirrors the boss-kill term already computed in `renown.js` |
| **Raid Damage (weekly)** | sum(damage) this week | `raid_contributions` | resets with the raid week; ties the raid system into competition |

### 3.2 Clan boards

| Board | Sort key | Source |
|---|---|---|
| **Clan Power** | `castle_tier` then `treasury` | `clan_leaderboard` (already carries `castle_tier`) |
| **Clan Renown** (stretch) | sum of members' renown | needs an aggregate — defer if costly |
| **Clan Raid Damage (weekly)** | sum(damage) per clan | `raid_contributions` grouped by clan |

**Renown must become a stored, queryable field.** Today it's computed client-side only. Recommendation: the client already uploads `snapshot`; have it write `snapshot.renown` (the integer `computeRenown` result) on save, then expose it in the view as `(snapshot->>'renown')::bigint`. This is the smallest change that makes the flagship board possible without server-side scoring logic. **Hand-off to Systems.**

### 3.3 Renders / groupings (Art + Systems)

Because there are now ~24 boards, they must be **grouped, not listed flat** (same lesson as the crafting taxonomy spec):
- **Two-level selector:** a category row `[Throne] [Overall] [Skills] [Combat] [Clans]`, and within **Skills** a compact skill picker (icons from `SKILLS_DEF`). This keeps the top-level to five choices while exposing everything.
- Reuse the existing `lb-row` styling; add one persistent **"your rank" row** pinned below the top-N list (styled like the `you` row already in `renderSocial`).

---

## 4. What the player sees (the layout)

```
┌ LEADERBOARDS ─────────────────────────────┐
│ [Throne] [Overall] [Skills] [Combat] [Clans]   ← category
│  (Skills →)  ⚔ 💪 🛡 ❤ 🙏 🔮 🏹 🪓 ⛏ 🎣 🌾 🍳 🔨 🔩 🎯  ← board
│                                            │
│  1  👑 Aldric        the King    142,300   │  ← top N (25)
│  2  Brenna           a Duke       98,110   │
│  3  Cael             a Prince     71,400   │
│  ...                                       │
│  25 Rowan            a Baron       5,900   │
│  ─────────────────────────────────────    │
│  411 rivalAbove      a Serf          640   │  ← nearby (rank-1)
│ ▸412 YOU             a Serf          602   │  ← always shown, highlighted
│  413 rivalBelow      a Peasant       380   │  ← nearby (rank+1)
│                                            │
│  🏆 Top 25 this season → Champion's Laurel │  ← reward banner
└────────────────────────────────────────────┘
```

- **Top N = 25** (up from 15) — enough to feel like an honor roll.
- **Always-visible self block:** your rank plus the rival directly above and below. This is the retention core: a concrete, catchable target every session.
- On the Throne board, the third column is the **rank title**, not a raw number, so the board reads as a social hierarchy.

---

## 5. Stakes: rewards for ranking

Modest, economy-safe (Final Directive: **no pay-to-win, no PvE-minted Hearth Tokens**). Rewards are prestige-first.

| Tier | Reward |
|---|---|
| **Rank #1 on any board** | a **named title** by your name (e.g. "Grandmaster Smith", "the Throne") for as long as you hold it |
| **Top 3** | a cosmetic laurel/frame on your avatar (Art) |
| **Top 25 (seasonal, see §6)** | one-time claim of gems (scaled by rank) + a seasonal cosmetic |
| **Personal best** | a small renown nudge when you set a new all-time rank on a board (feeds the meta-spine) |

Titles/frames are **cosmetic and server-verified on claim** — the board rank is read server-side at claim time, never trusted from the client. Gems only; never tokens.

---

## 6. Seasons

- **All-time boards stay** (Total Level, per-skill, Combat, Wealth, Throne) — long-horizon prestige.
- **Add one seasonal board: "Climbers"** — a monthly (UTC-month) **Renown gained this season** board. Because it measures *delta*, a new player can top it without years of grind, which keeps the competition alive for everyone (the classic OSRS "monthly comp" energy).
  - Store a per-user `renown_at_season_start` snapshot; season score = current renown − that value.
  - At month rollover: award Top 25 climbers, reset the baseline.
- **Weekly boards** (Raid Damage) already reset via the raid week key — reuse `HearthriseWorldEvents.utcWeekKey()`.

Seasons are the answer to "the top of the all-time board is unreachable, why bother" — there's always a fresh race.

---

## 7. Data & performance (hand-off to Systems)

At 10k+ players, `order by X desc limit 25` per board is fine (indexed), but **"your rank"** and **per-skill** need care:

1. **"Your rank" without a full scan:** `select count(*) from leaderboard where <key> > :myKey` is O(rows) each call. At beta scale it's acceptable; at 10k+, precompute. **Recommendation:** a **materialized view `leaderboard_ranked`** with `rank() over (order by total_level desc)` (and companion columns for each key), refreshed every ~5 min by a cron/`pg_cron` job or an edge function. Then "your rank" is a single indexed row read, "nearby" is a `where rank between :r-1 and :r+1`, and "top N" is `where rank <= 25`.
2. **Per-skill boards:** the skill XP lives in `snapshot->'skills'`. Two options — (a) generated columns per skill on `game_saves` (like the existing `total_level` generated column, schema §0), indexed; or (b) a `leaderboard_skills` materialized view extracting all 15. Prefer **(a)** for the handful of hot skills and **(b)** rolled into the refresh job for completeness. Index every sort key.
3. **Renown board:** requires `snapshot.renown` to be written client-side on save (see §3.2), then a generated/extracted column + index.
4. **Weekly/seasonal:** raid-damage board queries `raid_contributions` (already indexed by pk); the Climbers baseline is one small table `renown_season (user_id, season_key, baseline)`.
5. **Refresh cadence:** boards do **not** need to be real-time. A 5-minute-stale honor roll is completely fine and slashes DB load. Show a "updated Xm ago" stamp (the view already carries `saved_at`).

**Net new server objects:** `leaderboard_ranked` (matview + refresh), per-skill generated columns or `leaderboard_skills` matview, `snapshot.renown` surfaced, `renown_season` table + rollover job, clan raid-damage aggregate. All additive.

---

## 8. Build order (Wave 3)

1. **"Your rank + nearby" on the existing three boards** — highest value per effort; fixes the #1 demotivator with a count query (matview can come later). Ship first.
2. **Throne/Renown board** — needs `snapshot.renown` surfaced; the flagship.
3. **Category+skill selector UI** (Art) + per-skill boards over generated columns.
4. **Rewards/titles** (server-verified claim) + **Climbers season**.
5. **`leaderboard_ranked` matview** when player count justifies it (swap the count-query rank for the matview read behind the same client API).

Add smoke coverage (`CLAUDE.md`): seed multiple saves, assert top-N ordering, assert the signed-in player's "your rank" row appears even when outside top N, assert per-skill sort matches the snapshot.

## 9. Hand-offs
- **Systems:** §3.2 (`snapshot.renown`), all of §7 (matview, generated columns, season table + job, aggregates), server-verified reward claims.
- **Art:** the category/skill selector, the pinned self+rivals block, laurel/frame cosmetics for top ranks (no emoji, "Forge & Stone").
- **Game Designer (me):** owns board list, reward tiers, season cadence; re-tunes reward gem amounts against economy once live.
