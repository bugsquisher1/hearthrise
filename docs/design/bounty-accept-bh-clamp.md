# SA-048 — the bounty-accept difficulty clamp

Migration: `supabase/migrations/2026-09-12-bounty-accept-bh-clamp.sql` (STAGED, review-only).
Guard: `tests/bounty-accept-bh-clamp.mjs`.
Status: staged, not applied. Re-staged 2026-09-05 after a Security NO-GO removed a
false-premise board-tier clamp; this is the difficulty-only fix. The Coordinator
applies after a focused Security re-review.

> **Redirect (2026-09-05).** The first draft of this file added TWO clamps — a
> board-**tier** clamp and a **difficulty** clamp. Security proved by execution
> that the board-tier clamp was built on a false premise and would only lock
> honest players out; it is **removed**. The migration now adds ONE function and
> makes ONE behavioural change: the difficulty clamp. The corrected forgeable
> ranked gain is **1.3×** (not the "~40×" the first draft claimed — that figure
> was an artifact of the false premise).

---

## The exploit — what it actually is

b504 armed Bounty-Hunter XP: `hr_claim_bounty` now credits `player_skills`
(`skill_id='bountyHunter'`) server-side, in the same transaction as the gold and
Marks. That made the bounty board a **ranked** surface — `bountyHunter` feeds
`hr_lb_skills` and `hr_total_level`.

`hr_accept_bounty__ungated` gates the target's **tier** by the **server combat
level only**:

```
v_cl      := hr_bounty_combat_level(auth.uid(), v_slot);
v_maxtier := hr_bounty_unlocked_tier(v_cl);
if v_tier > v_maxtier then ... 'tier_locked' end if;
```

There is **no Bounty-Hunter-level gate**. The single forgeable ranked value that
crosses into the ranked column is the **difficulty**: slot 1 of the board is
always `easy`, slot 2 `normal`, and slot 3 is `hard` *only once the Bounty-Hunter
level unlocks `streak`* (BH ≥ 15). `elite` is never board-generated and is already
refused at the accept. So a **BH-1** player calling the RPC directly with
`difficulty='hard'` buys the `hard/normal = 1.3/1.0 = 1.3×` XP multiplier on the
ranked `bountyHunter` skill without the board ever having offered it.

That 1.3× is the **entire** forgeable ranked gain — a client value (`difficulty`)
crossing straight into a ranked column, which is the exact class the
server-authority program refuses. It is the easy/normal/hard residual the
2026-08-23 elite-refusal header explicitly deferred "to that follow-up"; this is
that follow-up.

## Why there is NO board-tier clamp (the false premise, proven false)

The first draft also clamped the target **tier** to a Bounty-Hunter board-tier
ladder, on the premise — stated in `src/core/bounty.js`'s own
`boardTierForBountyLevel` docstring — that *"the board posts min(combat tier,
board tier)"*. **That premise is false, and Security proved it by execution:**

- **`generateBountyBoard` (`src/core/bounty.js`) computes `tier =
  unlockedTier(combatLevel)` — COMBAT LEVEL ONLY.** There is no `min` with
  `boardTierForBountyLevel` anywhere in board generation; `bountyLevel` feeds only
  `unlockedTypes` (the type/difficulty ladder), never the tier.
- **`boardTierForBountyLevel` is reachable only via
  `window.getUnlockedBountyTier` (`legacy.js`), which has ZERO call sites — it is
  dead code.** (Note: a *different*, combat-based `getUnlockedBountyTier` at
  `legacy.js:4616` is the one actually used; the board-tier `window.` variant
  overwrites the global but is never called.) The docstring describes an intention
  that was never wired.
- **Driving the real generator:** CL70/BH1 → the board posts `maxTier 6`;
  CL70/BH20 → still `6`. Board depth does **not** move with the Bounty-Hunter
  level.

The pre-existing combat gate (`v_maxtier := hr_bounty_unlocked_tier(v_cl)`)
therefore already blocks a tier above the combat level — **exactly** the depth the
board offers. A board-tier clamp would close **no** gap. What it *would* do is
refuse an honest CL70/BH1 player the tier-6 contracts their own board legitimately
shows them, producing a **dead bounty**: adopted locally via
`hrAdoptAcceptedBounty`, no server row, the board blocked while it is "active",
and Marks charged to abandon it at BH ≥ 10. That is an honest lockout — 1 live
character (combat tier 4, BH-1) on apply, and most players going forward. So the
board-tier clamp is **gone**, and the migration's §3(b) asserts no
`hr_bounty_board_tier_for_level` reference ever creeps back into the accept body.

## The fix — difficulty clamp only

`hr_bounty_difficulty_unlocked(p_difficulty, v_bh_lvl)`:
`easy`/`normal` always board-legal, `hard` only at BH ≥ 15, `elite`/unknown/null
→ false. A forged over-level difficulty is refused `difficulty_locked`. (`elite`
remains refused earlier too — `bad_difficulty` — so this is defence in depth.)

```
v_bh_lvl := hr_level_from_xp(coalesce(player_skills.bountyHunter.xp, 0));  -- absent -> level 1 (fail closed)
if not hr_bounty_difficulty_unlocked(p_difficulty, v_bh_lvl) then ... 'difficulty_locked' end if;
-- COMBAT-LEVEL GATE below is restated verbatim — tier stays combat-only.
```

`v_bh_lvl` fail-closes to level 1 (0 xp) when the `bountyHunter` row is absent, so
a missing read defaults to the shallowest difficulty (`easy`/`normal` only), never
`hard`. The lookup is a new **IMMUTABLE** function, revoked from
`public`/`anon`/`authenticated`/`service_role` — an internal of a `SECURITY
DEFINER` body, reached without a grant. **The tier gate is left exactly as it was
(combat only).**

## The difficulty ladder — measured, not guessed

The board is generated by `src/core/bounty.js generateBountyBoard` (the
dual-runtime function `legacy.js` delegates to via
`CK.bounty.generateBountyBoard`), whose slot difficulties are hardcoded:

- slot 1: `makeBounty('cull', m1, 'easy', c)` — **always `easy`**
- slot 2: `makeBounty(..., m2, 'normal', c)` — **`normal`**
- slot 3: `makeBounty(..., m3, types.indexOf('streak') >= 0 ? 'hard' : 'normal', c)`
  — **`hard` only when `streak` is unlocked**

and `unlockedTypes(lv)` pushes `'streak'` at `lv >= 15`. So the board can offer:

| Bounty-Hunter level | difficulties the board posts |
|---|---|
| BH < 15 | `easy`, `normal` |
| BH ≥ 15 | `easy`, `normal`, `hard` |
| any | never `elite` |

`window.getBountyDifficultyUnlocks` in `legacy.js` (`hard: lv >= 50`, `elite: lv
>= 75`) is **display-only** — it drives the "Unlocks" strip (`renderBountyTab`),
not board generation. Binding the SQL to it would have **locked honest BH-15..49
players out of the `hard` slot their board actually offers**. The SQL is bound by
value to `generateBountyBoard`/`unlockedTypes`, and `tests/bounty-accept-bh-clamp.mjs`
AC-6 **re-derives the `hard` threshold from `unlockedTypes`** so a future change to
the streak unlock fails the guard rather than shipping a client/server mismatch.

## `hr_bounty_reward` scales XP with difficulty (measured)

Measured on production 2026-09-05 (`hr_bounty_reward(tier,'cull',diff)`):

| tier | easy | normal | hard | elite |
|---|---|---|---|---|
| 1 | 38 | **45** | **59** | 79 |
| 6 | 935 | **1100** | **1430** | 1925 |

The XP column carries the same `0.85 / 1.0 / 1.3 / 1.75` `BOUNTY_DIFFICULTY_MULT`
ladder that prices gold and Marks. So the difficulty clamp is **ranked-critical**,
not merely gold/Marks cleanup: a forged `hard` at BH < 15 buys the **1.3×** XP
multiplier (`hard 59 / normal 45` at tier 1, `1430 / 1100` at tier 6) on the
ranked skill. Because the target tier is honestly combat-gated, that multiplier is
**all** that is forgeable — hence 1.3×, not 40×.

## Honest play is unchanged

The client only ever sends what the board generated, and the board never posts a
difficulty harder than the ladder allows, so every honest `(tier, difficulty)`
pair still passes. Structurally, the splice adds **only** the BH read and one
`difficulty_locked` refusal branch; the COMBAT-LEVEL GATE below it is **restated
verbatim**, and the success `return jsonb_build_object('ok', true, ...)` (with its
`required` clamp, the b497 difficulty-scaled range, the first-contract floor, and
the reward) is **byte-for-byte untouched**. `tests/bounty-accept-bh-clamp.mjs`
proves this two ways:

- **AC-4 (anti-lockout):** an honest combat-99 / BH-1 caller is ALLOWED a tier-6
  `normal` contract — the exact case the removed clamp would have broken. Green.
- **AC-8:** the chain is replayed a second time stopping **before** this migration
  (`upTo: 2026-09-11-bounty-hunter-xp.sql`), the same honest accept is driven, and
  the two envelopes are asserted identical.

## The anchors spliced on

Two guarded, exactly-once, CR-tolerant anchors in the **live** body (raw
`pg_get_functiondef`, verified 1 hit each on production 2026-09-05):

1. the `v_maxtier` declaration —
   ```
     v_maxtier  int;
   ```
   → adds `  v_bh_lvl   int;` beneath it.

2. the COMBAT-LEVEL GATE block —
   ```
     -- COMBAT-LEVEL GATE: the target's tier must be unlocked by the SERVER combat level.
     v_cl := public.hr_bounty_combat_level(auth.uid(), v_slot);
     v_maxtier := public.hr_bounty_unlocked_tier(v_cl);
     if v_tier > v_maxtier then
       return jsonb_build_object('ok', false, 'error', 'tier_locked',
         'tier', v_tier, 'unlocked_tier', v_maxtier, 'combat_level', v_cl);
     end if;
   ```
   → replaced with the BH read + difficulty gate, followed by the **same
   COMBAT-LEVEL GATE block restated verbatim** (so the tier gate is unchanged).

`proacl` is captured before the `create or replace` and asserted byte-identical
after (the ACL must not move). §2 raises rather than patching if either anchor
count is not exactly 1 — never a template restatement (the body has five authors;
a restatement reverts whichever ran last, the b484–b487 "everything refuses"
class).

## Reversibility

The pre-patch body is **pinned**: raw `pg_get_functiondef` md5
`211639b00b2dd5c1890a751c3b7fe6c4`, raw len `4902` (production 2026-09-05). Gate
the revert on the **raw** md5, not a normalised one: the live body carries no CRs,
so a CR-strip does not reproduce the normalised value and the raw pin is the
reliable check.

Revert with **one targeted `create or replace`** back to that exact body, then
drop the one new function — **NOT** a file re-apply (re-applying
`2026-08-23-bounty.sql` restates `hr_rpc_gate` with a stale bucket case = the
game-wide "everything rate_limited" outage; re-applying
`2026-09-04-bounty-difficulty-count.sql` would double-refuse its own splice):

```sql
begin;

-- 1. restore the pinned pre-patch accept body (verbatim, below).
CREATE OR REPLACE FUNCTION public.hr_accept_bounty__ungated(p_slot integer, p_bounty_id text, p_target text, p_type text, p_difficulty text, p_required bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_slot     int := coalesce(p_slot, 0);
  v_tier     int;
  v_cl       int;
  v_maxtier  int;
  v_kmin     bigint; v_kmax bigint;
  v_req      bigint;
  v_gold     bigint; v_marks int; v_xp int;
  v_baseline bigint;
  v_first    boolean;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;
  -- ONLY 'cull' is server-verifiable (see header). proof/weapon/streak refused.
  if p_type is distinct from 'cull' then
    return jsonb_build_object('ok', false, 'error', 'type_not_server_verifiable', 'type', p_type);
  end if;
  -- ⚠ 'elite' is REFUSED at the server (Security ruling 2026-08-23): elite is never
  -- board-generated and is gated only by the client-owned Bounty-Hunter level, so every
  -- 'elite' reaching the server is forged — and it scales tradeable gold up to 1.75×.
  -- Durable fix (tracked): server-own the difficulty (server-derived board seed OR
  -- server-owned BH level with difficulty<=unlocked). The easy/normal/hard residual
  -- (<=1.53x) is a bounded, self-only, journalled residual accepted with that follow-up.
  if p_difficulty not in ('easy','normal','hard') then
    return jsonb_build_object('ok', false, 'error', 'bad_difficulty', 'difficulty', p_difficulty);
  end if;

  select tier into v_tier from public.hr_bounty_monsters where monster_id = p_target;
  if v_tier is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_monster', 'target', p_target);
  end if;

  -- COMBAT-LEVEL GATE: the target's tier must be unlocked by the SERVER combat level.
  v_cl := public.hr_bounty_combat_level(auth.uid(), v_slot);
  v_maxtier := public.hr_bounty_unlocked_tier(v_cl);
  if v_tier > v_maxtier then
    return jsonb_build_object('ok', false, 'error', 'tier_locked',
      'tier', v_tier, 'unlocked_tier', v_maxtier, 'combat_level', v_cl);
  end if;

  -- b497 DESIGNER RULING: the DIFFICULTY scales the kill count, so the range
  -- the server clamps into is the one the client drew from. A tier-only range
  -- here would silently raise an honest 72-kill EASY contract to 80.
  select kmin, kmax into v_kmin, v_kmax
    from public.hr_bounty_kill_range(v_tier, p_difficulty);
  -- FAIL CLOSED. No row (unknown difficulty) or a null bound (unknown tier)
  -- used to fall through least/greatest into a NOT NULL violation — a 500 that
  -- reads as "the server is down". A machine code is the honest answer.
  if v_kmin is null or v_kmax is null then
    return jsonb_build_object('ok', false, 'error', 'bad_difficulty',
      'difficulty', p_difficulty, 'tier', v_tier);
  end if;
  -- THE FIRST-CONTRACT FLOOR. Tier 1 only, floor only — see the header for why
  -- kmax must NOT move with it.
  v_first := (v_tier = 1) and public.hr_bounty_first_contract(auth.uid(), v_slot);
  if v_first then
    -- SCALED TOO. The board's first slot is always EASY, so an unscaled floor
    -- of 15 would raise the client's honest round(15*0.9)=14 to 15.
    select kmin into v_kmin from public.hr_bounty_first_contract_range(p_difficulty);
  end if;
  v_req := least(v_kmax, greatest(v_kmin, coalesce(p_required, v_kmin)));

  select gold, marks, xp into v_gold, v_marks, v_xp
    from public.hr_bounty_reward(v_tier, 'cull', p_difficulty);

  v_baseline := public.hr_bounty_kills(auth.uid(), v_slot, p_target);

  -- Upsert: accepting a new bounty REPLACES any prior active one (and resets the
  -- baseline). One row per character; the client enforces "finish/abandon first".
  insert into public.active_bounty
    (user_id, slot, bounty_id, b_type, difficulty, target, tier, required, baseline,
     gold_reward, marks_reward, xp_reward, accepted_at)
  values
    (auth.uid(), v_slot, coalesce(p_bounty_id,''), 'cull', p_difficulty, p_target, v_tier, v_req,
     v_baseline, v_gold, v_marks, v_xp, now())
  on conflict (user_id, slot) do update set
    bounty_id=excluded.bounty_id, b_type=excluded.b_type, difficulty=excluded.difficulty,
    target=excluded.target, tier=excluded.tier, required=excluded.required,
    baseline=excluded.baseline, gold_reward=excluded.gold_reward,
    marks_reward=excluded.marks_reward, xp_reward=excluded.xp_reward, accepted_at=now();

  return jsonb_build_object('ok', true, 'bounty_id', coalesce(p_bounty_id,''),
    'target', p_target, 'tier', v_tier, 'required', v_req, 'baseline', v_baseline,
    'gold', v_gold, 'marks', v_marks, 'xp', v_xp, 'slot', v_slot, 'first_contract', v_first);
end $function$;

-- 2. drop the one lookup this file added.
drop function if exists public.hr_bounty_difficulty_unlocked(text, integer);

commit;
```

Then verify `md5(pg_get_functiondef('public.hr_accept_bounty__ungated(int,text,text,text,text,bigint)'::regprocedure))`
is back to the raw `211639b00b2dd5c1890a751c3b7fe6c4`. `create or replace`
preserves `proacl`, so no grant moves. After apply **or** revert, re-pin:
`node tests/live-hash-drift.mjs --live --write`.

## Cost at 100× players

Zero rows, zero bytes. One IMMUTABLE constant lookup and one indexed
`player_skills` read (pk `(user_id, slot, skill_id)`) per **accept** — a rare,
one-row-per-character gesture. No new index, write, or journal entry.

## What was verified vs assumed

- **Verified on production 2026-09-05 (measured by Security):** the board tier is
  `unlockedTier(combatLevel)` (combat only) — CL70/BH1 and CL70/BH20 both post
  maxTier 6; `boardTierForBountyLevel` has zero call sites (dead code); the pinned
  raw md5/len (`211639b0`/4902); the `hr_bounty_reward` XP scaling table.
- **Verified on a PGlite replay chain (this re-stage):** the migration applies and
  its §3 rolled-back probe fires — `hard` at BH-1 is `difficulty_locked`, an
  honest tier-6 `normal` at BH-1 is **ALLOWED** (the anti-lockout), and honest
  `hard` at BH-15 is allowed; the guard is green (AC-2, AC-4..AC-8) and all 8
  mutations (four base + four gate-blind) are caught; `--selftest` proves the
  gate-blind twins are caught by the guard's own assertions (AC-2/AC-5/AC-6) after
  the migration's §3 is short-circuited.
- **Re-pinned (this re-stage):** the replay hash of `hr_accept_bounty__ungated`
  moved to the difficulty-only body (re-seeded via
  `node tests/live-hash-drift.mjs --write --no-live`); the live hash
  `7170f2a2bace93ffcab7e8e4883f9455` (norm_len 4654) is unchanged (production is
  untouched), and the baseline records `live != replay` on purpose as the "staged,
  not shipped" signal. `schema-drift.baseline.json` now lists exactly one new
  function (`hr_bounty_difficulty_unlocked`).
- **Assumed (not run against production — this is STAGED):** the migration's
  behaviour on the *live* body. It is guarded by §0 (fails closed unless the
  installed body is the difficulty-count body) and §2's exactly-once anchor count,
  both pre-checked against the live `pg_get_functiondef`.
- **Out of scope / Security's call:** the final "can this be exploited" verdict,
  and the client half (`legacy.js` should surface `difficulty_locked` on a
  refusal, but the client already only sends board-generated contracts, so no
  client change is required for honest play).
