# RULING — away-time accrual (locked 2026-08-11, Game Designer)

Binding input to the server-side accrual engine (Phase C of the server-authority
program). Supersedes the behaviour of `processOfflineCombat`, which is being
deleted along with the second combat loop.

## The ruling in one line

**Away time pays 1.00×.** The away/active difference is *which bonus channels are
in scope*, never a rate discount, and never a second code path.

## The resolver contract

```
ctx = { away: bool, atMs: <server timestamp of this segment> }

permanent (gear, set, perks, renown, clan, property, castle) → ALWAYS
crit                                                         → ALWAYS (gear-sourced only when away)
bossOfTheDay(ctx.atMs)                                       → ALWAYS (segment-resolved)
blessing / world event                                       → only when !ctx.away
timed consumable buff                                        → only when !ctx.away; FROZEN when away
AWAY_RATE_MULT                                               → 1.00
```

`simulate*(ctx)` is called with `away:true` for accrual and `away:false` for the
live tick. **The same function, or it drifts again.** `AWAY_RATE_MULT` exists as a
named dial but is 1.00; changing it requires a fresh day-model recompute, not feel.

## Specific rulings

| Question | Ruling |
|---|---|
| Crits away? | **YES** (was: no). Crit is gear — a permanent property. Omitting it was a hidden, gear-scaled penalty (~7.5% typical, up to 30% at the 0.60 cap). Excludes the `damage_crit` food buff. `G.stats.crits` must increment away. |
| Food / consumable buffs away? | **NO — and they do not drain.** A timed buff is **frozen**: it neither pays nor ticks down. Applies to all of `BUFFS_DEF`. Does **not** consume food. Healing auto-eat during away combat **stays** (survival, not a buff). |
| Boss of the Day away? | **YES, full value**, resolved **per UTC-day segment** of the absence (max two segments at a 12h cap). Rationale: BotD is a *targeting decision made before leaving*, not a passive lift. Values unchanged: daily ×1.5 drops / ×1.25 combat XP; weekly ×2.0 / ×1.5. |
| Blessings / world events away? | **NO.** Stay presence-gated (b227, Tyler's explicit direction). |
| One formula or two? | **One.** Context flag, not a second loop. |
| Offline cap | **Survives, unchanged, becomes server-authoritative.** Keep b307 **per-absence** semantics (do NOT resurrect the daily bucket). 12h base · 16h Offline+ · plus renown/property (+1…+4h) and clan (+1…+2h). Server form: `grantMs = min(now() - server_last_seen, capMs)`; client clock never read. |

## RULING 2 — which hours of an over-cap absence are credited (locked 2026-08-15)

The cap behaviour is unchanged: the payout caps and **the character keeps
running**. What changes is *which* hours are paid.

**The credited window is `[W, W + grantMs]`, where `W = max(accrued_to,
active_since)` — the FIRST cap-hours after the player left, never the last
cap-hours before they came back.**

Why it is not cosmetic:

1. **It was an exploit.** The Boss of the Day is resolved per UTC-day *segment*
   of the credited window. Anchored to the RETURN instant, the player selects
   which days pay by choosing when to open the tab — an 18h absence begun at
   22:00 UTC can be landed wholly on the next day's ×1.5-drop boss. BotD pays
   away because it is *a targeting decision made before leaving*; it must
   therefore resolve from the departure instant.
2. **It forfeited timed consumables.** A 10-minute buff eaten on the way out is
   alive for minutes 0–10 *of the absence*. Credit the last twelve hours of an
   eighteen-hour absence and it pays zero. It now pays exactly 10 minutes.

Three rules travel with it, and each is load-bearing:

- **`accrued_to` still stamps `now()`, NOT `W + grantMs`.** The forfeited tail
  *is* the cap. Advancing only to the paid instant would let a 40h absence be
  collected as four 12h instalments (`accrual.js`, the note above `accrued_to`).
- **The buff clock crosses the WHOLE absence.** The credited window pays; the
  uncredited remainder is spent at zero payout, so returning timers agree with
  the wall clock. Which side of the window the unpaid part falls on is *derived*
  from the window, not assumed.
- **One definition, both sides.** `src/core/away.js creditWindow` — the server
  accrual engine imports it, the client reaches it through core-bridge. An
  uncapped absence is byte-identical either way (`W + grantMs === now`).

Regression coverage: `AWAY-22` / `AWAY-23` (client, through the real
`processOffline`) and `creditWindowGuard` in `tests/accrual-engine.mjs`
(server, with the return-anchored window computed as an in-test control).

## Bugs the ruling also fixes (away loop omissions, all → apply away)

1. **Kill XP was never granted away at all** — `killMonster` grants `m.xp`; the away
   loop granted only per-damage XP. **~21% of all combat XP, missing**, worse at
   higher tiers. Larger than the crit gap.
2. `HearthriseDropLog.recordKill` — collection log under-reports every overnight.
3. `updateDaily('kill_any')` — "Slay 10 monsters" made **zero** progress overnight.
4. `updateQuest('kill_any' / 'kill_monster')` — same.
5. `HearthriseFarm.rollKillDeed` — Farmer's Deeds never dropped away.
6. `G.stats.deaths` never increments **anywhere** — fix in both paths.

These are base rewards, not bonuses. Their omission was five copies of one
copy-paste gap — the argument for the one-formula mandate.

## Live exploit closed by the buff rule

Eat a 10-minute buff → close the tab → collect **12 hours** of drop-rate-buffed
gathering → return with the buff still showing 10:00. Cause: buffs reach the away
replay via `getBonus`, but the buff clock is a `setInterval` that only runs in a
live tab. Freezing buffs closes it.

## Net effect

Away combat ≈ **+30% XP** (21% kill XP + ~7.5% crits, compounding), plus featured-boss
drops, plus dailies/quests/collection/deeds that currently silently fail. Away
gathering marginally slower (no food buffs). **The 57.2-day first-99 floor
(`pacing-overhaul.md` §A.2) is computed at 0% bonuses and is untouched.**

## Player-facing honesty (part of the ruling, not a follow-up)

1. Welcome-back summary carries `{blessed:false, buffsPaused:true, crits:N, featuredMs:N, capped:bool}` so no renderer can invent a bonus that wasn't applied. Copy: *"8h 12m away at the base rate — blessings and food buffs pay while you play."* Plus *"· 8h on the Boss of the Day (+50% drops)"* when it applied.
2. Away combat reports crits: *"142 kills · 21 crits"*.
3. A paused buff renders as **paused** with its time preserved — not ticking, not silently paid.
4. The Boss-of-the-Day card must state that it pays while away.
5. Any away-earnings preview computed with `away:true` so it can never quote a blessing/buff-inflated rate.

## Balance risk flagged to Systems

**Confirm the 0.95 chance cap in `src/core/drops.js rollDropTable` is applied AFTER
`dropMult × featuredMult`, not before**, and that guaranteed drops remain unscaled.
A weekly BotD (×2.0 drops, 12h/day) on a tier-6+ boss with a high-value tradeable
is a real market faucet — needs a QA assertion, not a design change.

## Required regression coverage

1. **Parity test (the contract):** same seeded fight through `away=false` and
   `away=true` with blessings/consumables off → XP, gold, kills, drops **identical**.
2. Away kill grants `m.xp`.
3. Away rolls crits; `stats.crits` increments; excludes `damage_crit` buff.
4. BotD applies away; an absence crossing a UTC boundary pays each segment its own day's boss.
5. A 10-min buff after a 12h away grant: still 10 min, contributed 0, consumed 0 food.
6. Blessings still contribute 0 away (b227 latch test stays green).
7. Away kills feed drop log, dailies, quests, `rollKillDeed`; away death increments `stats.deaths`.
8. Cap: 18h absence at 12h cap grants exactly 12h; a second absence same day starts fresh (b307).
