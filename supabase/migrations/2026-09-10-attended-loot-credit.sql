-- 2026-09-10-attended-loot-credit.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. ⚠⚠⚠
-- ⚠ SECURITY REVIEW REQUIRED before apply. It installs ONE read-only projection
--   and records it on the hr_engine capability allowlist, and the value it
--   projects becomes an input to the ONE writer of loot and gold. It grants
--   nothing to any client role, writes no table, and takes no client argument —
--   but it moves a TRADEABLE surface, so the verdict is Security's.
--   The Coordinator applies it by hand as part of a coordinated deploy.
--
--   APPLY AFTER: 2026-08-30-bounty-kill-credit.sql (hr_kill_credit_log),
--   2026-09-01-kill-daily-credit.sql (its `free` + `kills_stat` columns) and
--   2026-08-20-live-progress-engine-allow.sql (link 6 of HR_GRANT_HYGIENE_CHAIN,
--   this file's base). §0 fails closed if any of them is absent.
--
--   ⚠⚠ APPLY THIS FILE IN ONE TRANSACTION. `begin;` <this file> `commit;`
--      SECURITY CONDITION, 2026-09-04, amended by measurement. `create or
--      replace function` lands with a DEFAULT ACL and §1b's revoke is the NEXT
--      statement, so applied statement-by-statement in autocommit there is a
--      window — however short — in which `hr_attended_kills` is callable by
--      somebody it must never be callable by. WHO, exactly, depends on the
--      applier, and the honest answer is `service_role`, not `anon`:
--        MEASURED on nezapsylztqbbwuwembx 2026-09-04, in a rolled-back probe —
--        the apply path's `current_user` is `postgres`, and `pg_default_acl` for
--        FUNCTIONS in `public` created by postgres is
--        `{postgres=X/postgres, service_role=X/postgres}`. A fresh function
--        therefore reads anon=false, authenticated=false, service_role=TRUE. The
--        built-in EXECUTE-to-PUBLIC default is REPLACED by that entry, so the
--        production window exposes the service role and no client role.
--      THE GATE STAYS, for two reasons that are not hypothetical: functions
--      created by `supabase_admin` in `public` DO get
--      `{postgres,anon,authenticated,service_role}=X` (same query, same
--      database), and PGlite — the replay every guard in this repo runs on — has
--      no pg_default_acl entry at all and so falls back to the built-in
--      PUBLIC=X. It is SECURITY DEFINER and takes `p_user`, so in that window a
--      caller could read ANY player's kill credits. The file carries no `begin;` of its own
--      because both appliers already wrap it (tests/schema-replay.mjs:248 does
--      `begin; <file> commit;`, and the Coordinator's execute_sql path sends the
--      whole file as one simple query, which Postgres runs as one implicit
--      transaction) — a nested `begin` inside those would commit early and warn.
--      §1c REFUSES THE APPLY if it finds itself outside a transaction, so this
--      is enforced rather than requested.
--
--   DEPLOY ORDER: SQL FIRST, EDGE SECOND. The Edge degrades on 42883 and ONLY
--   42883 (index.ts + set-activity.js, three rungs each), so the two are safe in
--   either order — but forward is SQL first, because an applied migration with
--   an old payload simply pays what yesterday paid.
--
--   ⚠ AFTER APPLYING: hr_assert_grant_hygiene IS A LIVE-HASH-TRACKED body and
--     this file MOVES its hash (link 7 inserts one allowlist entry). Run
--         node tests/live-hash-drift.mjs --live --write
--     and let the diff be the deploy record. NO OTHER tracked body moves —
--     hr_credit_kills__ungated, hr_apply, hr_state_of, hr_rate_gate and
--     hr_perks_of are read and fingerprinted here, never restated.
--   ⚠ AND RE-BASELINE THE SCHEMA: this adds exactly one function
--     (hr_attended_kills(p_user uuid, p_slot integer,
--      p_upto timestamp with time zone)) —
--         node tests/schema-drift.mjs --write
--     is already committed with this change; nothing else moved.
--
--   ⚠ DO NOT APPLY IN THE FIRST FIVE MINUTES OF A UTC DAY. Not this file's
--     defect, but it is in this file's apply path.
--     2026-09-01-kill-daily-credit.sql's GATE(f5) backdates its fixture row with
--     `created_at = now() - interval '5 minutes'` (line 1185) and then reads the
--     watermark scoped to `created_at >= hr_utc_day_start(now())`. Inside the
--     first five minutes of a day the backdated row is in YESTERDAY, the read
--     returns NULL, the settle delta floors to 0 and the migration REFUSES:
--       GATE(f5): the settle delta read 0 (expected 12)
--     Its own GATE(f4) already carries the guard —
--       greatest(public.hr_utc_day_start(now()), now() - interval '5 minutes')
--     — and f5 did not inherit it. BOUNDARY MEASURED during this file's
--     verification, not inferred: green 23:5x, RED at 00:00:28Z / 00:01:26Z /
--     00:02:35Z / 00:03:13Z / 00:04:25Z, green again 00:05:34Z — the window is
--     exactly [00:00, 00:05). Reproduced with none of this change present. It
--     makes an APPLY fail, never a payment wrong.
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE DEFECT — MEASURED ON PRODUCTION, 2026-09-04, NOT RECONSTRUCTED
-- ══════════════════════════════════════════════════════════════════════════
-- A 169-second ATTENDED goblin session on the QA account (0a47ba77, slot 2):
--
--   hr_kill_credit_log     4 rows, sum(credit) = 15, NOT ONE THROTTLED
--                          (caps 19 / 132 / 130 / 45 against claims 1 / 5 / 6 / 3)
--   player_ledger #13175   kind='combat' intent='accrue'
--                          meta.kills = 9, qty_in = 16, gold_in = 55
--                          meta.ate  = 8, delta.i.shrimp = -8
--   client showed          26 units, and ate 7 x cooked_shrimp
--
-- The settle re-simulates [accrued_to, now] as an UNATTENDED span, so an
-- attended window is priced by a DIFFERENT, SMALLER fight. Units per kill agree
-- (server 1.78, client 1.73) — the entire loot shortfall is the KILL shortfall:
--
--   26 - 16 = 10 units = (15 - 9) kills x 1.73 units/kill
--
-- 38% of a three-minute session's drops confiscated on reload, with the correct
-- kill count sitting in the server's own append-only log the whole time. That is
-- what players report as "items I got in combat disappear".
--
-- The food half of that incident is worse than "not debited": the server ate 8
-- RAW shrimp (heals 3, the first_cook input) while the client ate 7 COOKED shrimp
-- (heals 8), because auto_eat_food is NULL and the two sides chose independently
-- over divergent bags. The client's seven came back; eight the player believed
-- they owned were destroyed.
-- ⚠ THIS FILE DOES NOT ADDRESS THE FOOD HALF, and neither does the Edge change
--   that ships with it. The first draft suppressed the settle's food debit over a
--   window it believed was attended; the Security review of 2026-09-04 measured
--   that gate (player_state.combat_xp_accrued_to, which hr_credit_combat_xp
--   advances to now() for ANY authenticated caller, including one posting an
--   EMPTY xp map) as a free-food faucet — 826 units of tradeable food over a
--   ten-hour span, with no journal entry — and the half was CUT. The settle
--   remains the sole food debiter. See docs/design/attended-loot-credit.md §3.4
--   for the successor design (a projection over the `eat` LEDGER rows, so a
--   suppression must be BACKED by a destroyed unit rather than asserted).
--
-- ── WHAT THIS FILE ADDS ────────────────────────────────────────────────────
-- ONE function. hr_attended_kills(user, slot) projects the kills the server has
-- ALREADY accepted and clamped since `accrued_to`, so the settle can top up the
-- loot for the kills its own simulation missed. The engine change lives in
-- supabase/functions/hr-accrue/accrual.js; the contract is
-- docs/design/attended-loot-credit.md. Read that before this.
--
-- ── WHAT IT DOES **NOT** DO — the containment, stated up front ──────────────
--   · It grants NOTHING to anon / authenticated / service_role.
--   · It creates NO client-reachable verb. The client's write surface is
--     unchanged: hr_credit_kills, exactly as reviewed on 2026-08-30 and
--     2026-09-01, whose body this file does NOT restate (§0b fingerprints it).
--   · It writes no table, no row, no policy and no existing grant.
--   · It does not touch hr_apply, hr_state_of, hr_rate_gate or hr_perks_of.
--   · The ONLY live body it moves is hr_assert_grant_hygiene(boolean), via
--     tools/derive-grant-hygiene.mjs link 7 — an INSERTION at the head of
--     c_engine_allow, zero declared removals.
--
-- ── WHY THE READ IS A FUNCTION AND NOT A QUERY ─────────────────────────────
-- hr_engine holds ZERO table privileges — asserted by check (7)/(S9) of the
-- nightly detector — so it cannot SELECT hr_kill_credit_log. That is the design
-- working, not an obstacle: every engine read is a named, reviewed projection
-- for ONE character, and this one joins hr_state_of / hr_perks_of /
-- hr_bestiary_of / hr_collection_of / hr_renown_of on exactly the same terms.
--
-- ── THE CLAIM THE ALLOWLIST ENTRY MAKES (re-derived, as the list demands) ───
-- 2026-08-11-grant-hygiene.sql's own comment on c_engine_allow: "Adding an entry
-- is a CLAIM: read-only or self-validating, and it accepts no target the caller
-- is not already authorised for."
--   READ-ONLY        `language sql`, `stable`. Three CTEs and a jsonb_build_object.
--                    No PL/pgSQL body through which a later edit could smuggle a
--                    write without the language keyword changing — the same
--                    strongest-available shape link 6's three projections use.
--   SELF-VALIDATING  Fixed-shape output with its own per-call ceilings
--                    (c_max_kills, c_max_targets). Every value it returns was
--                    written by hr_credit_kills, which had already clamped it to
--                    a physical maximum against the SERVER clock and journalled
--                    every throttle. It re-clamps anyway: a projection that trusts
--                    its own table is a projection that stops being a control the
--                    day something else learns to write that table.
--   NO NEW TARGET    (p_user, p_slot) — the exact pair the engine already hands
--                    hr_apply and hr_state_of. The holder of hr_apply can already
--                    WRITE any character it names; this lets it READ one integer
--                    per monster for one of them.
--
-- ── THE WINDOW IS (accrued_to, now] AND THAT IS THE WHOLE DOUBLE-PAY GUARD ──
-- No new watermark, no consumed flag, no write-back. `accrued_to` is advanced by
-- hr_apply in the SAME transaction that pays (design §3), so a credit row falls
-- inside the window EXACTLY ONCE — structurally, for the same reason
-- double-collect is impossible. A settle that refuses advances nothing and the
-- rows stay pending for the next one. A watermark that has to be marked consumed
-- is a watermark that can be marked consumed WITHOUT paying; this one cannot.
--
-- ── WHAT BOUNDS THE FAUCET (the question to attack in review) ──────────────
-- ⚠ RESTATED 2026-09-04 (Security condition F5). An earlier draft of this block
--   claimed FOUR bounds and the formula `min(attended, cap) - sim`. Both were
--   wrong by the time the file shipped: Security's C8 measured two of the four
--   as INERT, and the formula gained a third ceiling. What is written below is
--   what the code does. Do not restore the four-bound list.
--
-- THE SHIPPED FORMULA, exactly (accrual.js §5a):
--
--     attTopUp = max(0, min(attClaimed, attCap, attSim * ATTENDED_MAX_FIDELITY)
--                       - attSim)
--
--   so a window's TOTAL is `max(sim, min(claimed, cap, sim * 3))` — never
--   `sim + claimed`. A forged count COMPETES with the server's own simulation
--   instead of adding to it, and `sim = 0` pays ZERO by arithmetic rather than
--   by a special case.
--
-- TWO BOUNDS BIND (C8's framing). Neither is new client-reachable surface.
--   1. THE ENGINE RE-CAPS, from THIS player's server-owned gear — `attCap`.
--      hr_bounty_kill_cap (the cap that let the row into the log) assumes a
--      600 ms swing floor and BEST-IN-SLOT max hit, because item combat stats are
--      not server-side — ~130 goblin kills/min. Fine for a COUNTER behind a
--      once-per-period claim guard; far too loose for a TRADEABLE item faucet.
--      accrual.js `attendedKillCap` re-derives it with `deriveTickMs(equipment,
--      items, style)` and `playerRolls(m).maxHit`, at 1.3x the physical maximum
--      (ATTENDED_HEADROOM_NUM/DEN, the SAME 1.3 the SQL cap uses). MEASURED,
--      both fixtures:
--         fresh char / 169 s : SQL 365  engine 22  away-sim 7   honest 15
--         maxed      /  90 s : SQL 195  engine 48  away-sim 27
--      16.6x / 4.1x tighter than the SQL cap; 1.47x headroom over the honest
--      attended rate.
--   2. THE SIM-RELATIVE CEILING — `attSim * ATTENDED_MAX_FIDELITY`. Bound 1 is
--      physics-from-gear and says NOTHING about survival: a maxed character in a
--      bronze sword pointed at `the_silence` simulates 0 kills and caps at
--      5,200, which without this pays ~2.27M gold/day. See the constant in
--      accrual.js for why it is 3 (1.7 measured x 1.3 ruled, rounded up) and
--      tests/attended-loot-credit.mjs A6 for the by-value AND derived pins.
--
-- TWO DO NOT BIND, and are listed only so nobody counts them again:
--   3. hr_apply's per-call clamps and the per-UTC-day budget. ⚠ READ THE RIGHT
--      FILE: the live budget is 25M gold / 70M item units / 120M XP / 5,000 gems
--      per character-day, set by 2026-08-16-day-budget-artisan.sql, which
--      SUPERSEDES the 1M qty and 40M xp in 2026-08-11-daily-budget.sql. An
--      earlier draft of this header quoted the superseded 1M and understated the
--      unit headroom by 70x. Verified live 2026-09-04:
--      `select public.hr_day_budget_limits()` = {gold 25000000, qty 70000000,
--      xp 120000000, gems 5000}. Measured inert — see THE COMPOSITE BOUND.
--   4. This function's own per-call ceilings (5000 kills, 8 targets). They fuse
--      a pathological LOG, not a forger.
--
-- ── THE COMPOSITE BOUND — MEASURED, and it is the honest answer ──────────
-- The two live ceilings compose as a min(), so the real bound on a forger is
--
--     min(1.3 x this character's PHYSICAL-MAX kill rate,  3 x the AWAY-SIM rate)
--
-- and the GEAR cap is the one that usually binds: measured on the shipping
-- engine over 1,944 combinations (every monster x {full best-in-slot, bronze
-- sword, bare-handed} x {maxed, fresh} x {60 s, 1 h, 12 h} settle cadence), the
-- gear cap bound 802 of the 1,111 paying combinations and the fidelity ceiling
-- the other 306. WORST CASE REACHED, per character-day:
--
--     gold    4,301,068  = 17.20% of the 25,000,000 gold budget  (grim_reaper,
--                          maxed + full BIS, 12 h cadence)  = 2.32x the away rate
--                          the same character earns honestly
--     units     133,920  =  0.19% of the 70,000,000 qty budget  (wolf, maxed +
--                          bronze sword, 60 s cadence)     = 2.74x honest
--
-- ✓ AND THE GEAR MODEL IS THE WORST ONE, NOT MERELY A PLAUSIBLE ONE. The first
--   sweep scored equipment on atkB+strB only, which ignores defB and spdB — both
--   of which could in principle raise the bound (defence lifts survival, so it
--   lifts `sim` and therefore the 3x ceiling; a faster weapon lowers tickMs, so
--   it lifts the gear cap). RE-MEASURED with four loadout models — offence-only,
--   armour-by-defB, a mixed score, and a speed-weapon build — across seven
--   monsters and two cadences. OFFENCE-ONLY IS THE WORST: 4,301,068 gold/day
--   against 4,236,828 (defence-first), 4,233,374 (mixed) and 2,955,044 (speed
--   weapon). Defence buys the forger nothing here because every model already
--   survives (`died = false` in all 56 runs, on a deep food stack), and the
--   heavier armour's slower tick costs more cap than the survival is worth. The
--   figure above is therefore a MAXIMUM, not a lower bound.
--
-- GOLD IS THE ONE THAT MATTERS. Against the qty budget the top-up is noise; the
-- gold budget retains 5.8x headroom over the worst forged case and 13.2x over
-- the best HONEST away day this engine can produce (1,912,200 gold, maxed + full
-- BIS on grim_reaper). Both are well clear — but note that
-- 2026-08-11-daily-budget.sql's own header quotes an "honest max/day" of
-- 1,049,186 gold and a 23.8x headroom, and that calibration predates both this
-- change and the current gear tier. It is a fuse, not a control; it should not
-- be the thing that discovers the drift.
--
-- ⚠ HOW THIS COMPARES TO THE SECURITY REVIEW OF 2026-09-04, which recorded
--   1,533,780 gold/day (6.14%) and 120,060 units/day (12.01%). TWO differences,
--   and they point opposite ways:
--     · GOLD: 17.20% here against 6.14% there — a factor of 2.80 HIGHER. The gap
--       is gear: the review's sweep does not appear to have included a full
--       best-in-slot loadout on an apex boss, which is exactly the character who
--       would run this. The number above is the one to attack.
--     · UNITS: both 12.01% and this file's own earlier 13.39% were computed
--       against a budget of 1,000,000, which 2026-08-16-day-budget-artisan.sql
--       superseded with 70,000,000 (verified live). The true figure is 0.19%.
--   Both sweeps are on the shipping engine and both are reproducible.
--
-- THE RESIDUAL, STATED SO IT CAN BE ATTACKED — it is NOT zero. An attacker
-- looping hr_credit_kills makes the settle pay loot at up to the composite bound
-- above for THEIR OWN character. It is self-only, journalled and reversible. The
-- multiple exists because the away sim UNDER-REALISES DAMAGE relative to the
-- live client by ~1.7x — systematic, not variance, and visible in the production
-- row itself (70 ticks / 9 sim kills = 1.9 dmg/swing against the client's 15
-- kills = 3.2 dmg/swing on the identical character). Tightening the cap to close
-- it would throttle honest attended play, so the honest close is span-sim
-- fidelity, tracked separately. What ships HERE is detectability: meta.att =
-- {claimed, cap, sim, top} on every accrue row makes claimed/sim the forgery
-- signal (honest play clusters near the fidelity ratio; a forger runs the claim
-- to the cap), one aggregate on a row that already exists. Asserted BY VALUE on
-- both fixtures in tests/attended-loot-credit.mjs A6, so loosening the cap
-- re-opens this review by name rather than by judgement.
--
-- ── LEDGER VOLUME (the game_events lesson) ─────────────────────────────────
-- ZERO new rows. The top-up folds into the delta the settle already sends and
-- the ledger row it already writes — meta gains `att` (four integers) and
-- `ate_free` (one). ~40 bytes on a row that is already ~300. Nothing here is per
-- kill; game_events reached 1.6M rows / 229 MB from six players in four days by
-- being per kill.
--
-- ── REVERSIBILITY ──────────────────────────────────────────────────────────
--   drop function public.hr_attended_kills(uuid,int,timestamptz);
--   \i supabase/migrations/2026-08-20-live-progress-engine-allow.sql
-- The second restores link 6's detector body, which is this file's unmodified
-- base. No table, column, policy, row or existing grant is touched, so there is
-- nothing else to undo. The Edge then degrades on 42883 and pays what it paid
-- yesterday.
--
-- SAFE TO RE-RUN — §1 distinguishes a no-op re-run from a live detector body
-- this file was not derived from, and refuses the second.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.player_state') is null then
    raise exception 'player_state missing';
  end if;
  if to_regclass('public.hr_kill_credit_log') is null then
    raise exception 'hr_kill_credit_log missing — apply 2026-08-30-bounty-kill-credit.sql first';
  end if;
  -- The `free` + `kills_stat` columns arrive with the daily-credit file. This
  -- function does not READ them, but their absence means the log is the
  -- pre-2026-09-01 shape, in which a bounty-free credit was REFUSED — so the
  -- window would only ever contain bounty rows and the top-up would silently
  -- cover a fraction of attended play. Refusing is the honest answer.
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'hr_kill_credit_log'
                    and column_name = 'free') then
    raise exception 'hr_kill_credit_log.free missing — apply 2026-09-01-kill-daily-credit.sql first';
  end if;
  if to_regprocedure('public.hr_credit_kills(integer,text,bigint,text)') is null then
    raise exception 'hr_credit_kills not found — apply 2026-08-30-bounty-kill-credit.sql first';
  end if;
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'hr_assert_grant_hygiene(boolean) missing — apply the chain up to '
                    '2026-08-20-live-progress-engine-allow.sql first. §2 restates it to record '
                    'ONE allowlist entry; it is not a substitute for the detector.';
  end if;
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'hr_client_rpc_baseline is missing — apply 2026-08-11-grant-hygiene.sql first; '
                    'check (2) of the body installed here reads it';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'hr_engine') then
    raise exception 'role hr_engine is missing — apply 2026-08-11-apply-engine.sql first';
  end if;
end $$;

-- ── 0b. THE BASELINE FINGERPRINT — hr_credit_kills IS **NOT** RESTATED ──────
-- This file depends on hr_credit_kills's semantics (its cap, its idempotency,
-- its per-day ceiling, its settle-delta subtraction) and restates NONE of them.
-- The b484–b487 wave was caused by later migrations restating a body from a
-- stale template, so the dependency is asserted as a FINGERPRINT rather than
-- carried as a copy: if the live body is not the reviewed one, this file refuses
-- rather than installing a projection whose bound was derived from something
-- else.
--
-- ⚠ `[[:space:]]+`, NEVER `'\s+'`. The two runtimes disagree on backslash
--   classes under standard_conforming_strings — measured: the same expression
--   normalises whitespace on production and eats every letter `s` under PGlite —
--   and a fingerprint gate that fires differently in the harness than on
--   production is worse than no gate.
-- ⚠ REPORTED, NOT ENFORCED, and that is deliberate. The hash pins the body this
--   file's BOUND was derived from; a Designer re-tune of the day ceiling would
--   move it without touching a single property this file depends on. Refusing
--   there would make the next reader delete the check. It RAISES on a missing
--   function and WARNS on a moved one, naming the digest to re-review against.
do $$
declare
  v_src  text;
  v_norm text;
  v_md5  text;
  -- The reviewed 2026-09-01 body (kill-daily-credit §0b's successor). Measured
  -- on production 2026-09-04 with the same normalisation.
  c_expect constant text := 'UNPINNED';
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_credit_kills__ungated';
  if v_src is null then
    raise exception 'hr_credit_kills__ungated is missing — the attended top-up''s entire input '
                    'comes from the log that verb writes. Apply 2026-08-30-bounty-kill-credit.sql '
                    'and 2026-09-01-kill-daily-credit.sql first.';
  end if;
  v_norm := regexp_replace(v_src, '[[:space:]]+', ' ', 'g');
  v_md5  := md5(v_norm);
  -- The four properties this file's bound actually rests on, checked by TERM
  -- rather than by digest, because a term scan says WHICH property is missing.
  if position('hr_bounty_kill_cap' in v_src) = 0 then
    raise exception 'REFUSING: the live hr_credit_kills__ungated does not call hr_bounty_kill_cap. '
                    'Every count this file projects would then be unclamped client input.';
  end if;
  if position('hr_kill_credit_log' in v_src) = 0 then
    raise exception 'REFUSING: the live hr_credit_kills__ungated does not write hr_kill_credit_log, '
                    'so the window this file reads would be empty or fed by something else.';
  end if;
  if position('pg_advisory_xact_lock' in v_src) = 0 then
    raise exception 'REFUSING: the live hr_credit_kills__ungated takes no advisory lock, so its own '
                    'idempotency read+write races and the log this file trusts is not serialised.';
  end if;
  if c_expect <> 'UNPINNED' and v_md5 <> c_expect then
    raise warning 'hr_credit_kills__ungated has MOVED since this file was reviewed (md5 % vs %, '
                  'normalised length %). The four terms above still hold, so this installs — but '
                  're-read docs/design/attended-loot-credit.md''s bound against the new body.',
                  v_md5, c_expect, length(v_norm);
  else
    raise notice 'hr_credit_kills__ungated fingerprint: md5 % (normalised length %)',
                 v_md5, length(v_norm);
  end if;
end $$;

-- ── 1. hr_attended_kills — the READ. `stable sql`, one character. ──────────
-- ⚠ IT TAKES NO CLIENT ARGUMENT. `p_user` and `p_slot` are supplied by the
--   engine from the VERIFIED JWT subject and the slot the caller already owns —
--   the same pair it hands hr_apply and hr_state_of. There is no count, no
--   monster and no window, because every one of those would be a value crossing
--   from a client into a payout.
-- ⚠ `p_upto` IS THE ONE ADDITIONAL ARGUMENT AND IT CANNOT INCREASE A PAYMENT.
--   SECURITY CONDITION C6, 2026-09-04. The engine advances `accrued_to` to the
--   `now()` IT READ IN THE STATE TRANSACTION, and it calls this function from a
--   LATER transaction — so a window bounded only below by `accrued_to` projects
--   credit rows that landed in the gap between the two, pays them, and then
--   projects them AGAIN on the next settle because they are still newer than the
--   watermark. `(accrued_to, now]` is the whole double-pay guard, and without an
--   upper bound stated by the caller the two ends do not describe the same
--   instant. `p_upto` is that instant: `hr_state_of`'s own `now()`, a SERVER
--   value read out of Postgres in the same call, never a request field.
--   ⚠ AND IT IS CLAMPED — `least(p_upto, now())`. A caller that passed a forged
--     FUTURE timestamp gets `now()`; a caller that passed a past one gets a
--     SMALLER window, i.e. an UNDER-payment. So the worst a wrong `p_upto` can
--     do is pay less than a two-argument version would have. That property is
--     what keeps "no client argument" true in substance, and GATE(e6) executes
--     it. NULL is also `now()` — `least` ignores NULLs.
-- ⚠ EVERY OTHER BOUND IS INSIDE THE QUERY, not in the caller. A projection whose
--   ceilings live in its consumer is a projection with no ceilings the day it
--   gains a second consumer.
create or replace function public.hr_attended_kills(p_user uuid, p_slot int,
                                                   p_upto timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with s as (
    select accrued_to
      from public.player_state
     where user_id = p_user and slot = coalesce(p_slot, 0)
  ),
  -- THE WINDOW: (accrued_to, p_upto]. `accrued_to` advances in the same
  -- transaction that pays and `p_upto` IS the instant it advances to, so a row is
  -- inside it exactly once. `credit` — never `claimed`:
  -- `claimed` is the number the client sent and `credit` is what hr_bounty_kill_cap
  -- allowed. Reading `claimed` here would hand the engine unclamped client input
  -- through a table, which is the same defect with an extra hop.
  w as (
    select l.target,
           least(sum(l.credit), 5000::bigint) as k,
           min(l.created_at)                  as lo,
           max(l.created_at)                  as hi
      from public.hr_kill_credit_log l, s
     where l.user_id = p_user
       and l.slot    = coalesce(p_slot, 0)
       and l.credit  > 0
       and l.created_at > s.accrued_to
       -- SECURITY C6. The upper edge, clamped so it can only ever SHRINK the
       -- window: see the header. Without it, a credit row committed between the
       -- engine's state read and this read is paid now AND still newer than the
       -- watermark on the next settle.
       and l.created_at <= least(p_upto, now())
     group by l.target
     -- A DETERMINISTIC, BOUNDED SET. `order by` + `limit` rather than a bare cap
     -- so that which targets survive is a fact about the data and not about the
     -- plan: the biggest contributors first, ties broken by id. A combat pointer
     -- names ONE monster, so this can only bind on a log that is already wrong.
     order by sum(l.credit) desc, l.target
     limit 8
  ),
  a as (
    select coalesce(jsonb_object_agg(target, k), '{}'::jsonb) as kills,
           coalesce(sum(k), 0)                                as total,
           min(lo)                                            as lo,
           max(hi)                                            as hi
      from w
  )
  select case
    when not exists (select 1 from s)
      then jsonb_build_object('ok', false, 'error', 'no_character')
    else jsonb_build_object(
      'ok',    true,
      'kills', a.kills,
      'total', a.total,
      -- NULL when the window is empty, which the engine reads as "no attended
      -- sub-window" and therefore no top-up. Stated as
      -- a null rather than as now(), because a defaulted instant is a window
      -- somebody was never measured to be present for.
      'from',  a.lo,
      'to',    a.hi)
  end
  from a;
$$;

-- ── 1b. GRANTS — REVOKE BEFORE GRANT ───────────────────────────────────────
-- `create or replace` PRESERVES an existing ACL, so a re-run must re-revoke or a
-- grant made by hand between runs would survive. PUBLIC first, then every client
-- role by name — `revoke ... from public` alone does not remove a grant made
-- directly to a role.
revoke execute on function public.hr_attended_kills(uuid, int, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.hr_attended_kills(uuid, int, timestamptz) to hr_engine;

comment on function public.hr_attended_kills(uuid, int, timestamptz) is
  'READ-ONLY. The attended kill credits hr_credit_kills has accepted in '
  '(player_state.accrued_to, least(p_upto, now())], per target, capped. p_upto is the '
  'engine''s own hr_state_of now() and is clamped, so it can only shrink the window. '
  'hr_engine only — it is an input to the settle''s loot top-up. '
  'See docs/design/attended-loot-credit.md.';

-- ── 1c. REFUSE AN AUTOCOMMIT APPLY ─────────────────────────────────────────
-- SECURITY CONDITION, 2026-09-04 (wording corrected by measurement the same
-- day). §1 creates the function with a DEFAULT ACL and §1b revokes it. Those are
-- two statements, so an applier that does not wrap the file leaves a window in
-- which a SECURITY DEFINER function taking `p_user` is callable by a role that
-- must never call it — i.e. a caller can read any player's kill credits.
--
-- WHICH ROLE, MEASURED rather than assumed (rolled-back probe on
-- nezapsylztqbbwuwembx, 2026-09-04):
--   · PRODUCTION apply path. current_user = `postgres`; pg_default_acl for
--     functions in `public` created by postgres is
--     `{postgres=X/postgres, service_role=X/postgres}`. A fresh function reads
--     anon=false, authenticated=false, SERVICE_ROLE=TRUE. So the real production
--     window is `service_role`, NOT `anon` — narrower than the original wording
--     claimed, and still a role this function must not be reachable from.
--   · A `supabase_admin` apply. Its default ACL in `public` IS
--     `{postgres,anon,authenticated,service_role}=X` — the anon window is real
--     on that path.
--   · PGlite (tests/schema-replay.mjs). No pg_default_acl row at all, so the
--     BUILT-IN default applies and the function is born EXECUTE to PUBLIC.
-- Two of the three paths hand it to a client role, so the gate is not
-- decoration on any of them. It is closed here because "short" is not a property
-- anybody measured and a privileged function born reachable is the class this
-- repo's nightly detector exists for.
--
-- ⚠ AND THIS IS WHY §1b ENUMERATES THE ROLES BY NAME. `revoke ... from public`
--   alone removes only the built-in PUBLIC grant; a `service_role=X` or
--   `anon=X` grant that arrived from pg_default_acl is a grant TO A NAMED ROLE
--   and survives it untouched. The `from public, anon, authenticated,
--   service_role` list in §1b is load-bearing on every one of the three paths
--   above — do not shorten it.
--
-- HOW IT KNOWS. `pg_current_xact_id_if_assigned()` is non-null once the current
-- transaction has WRITTEN something. §1's `create or replace function` writes
-- pg_proc. So:
--   · inside a transaction (or one implicit multi-statement one) §1's xid is
--     still ours and this reads NON-NULL — pass;
--   · in autocommit §1 committed and went away, and this read-only block has
--     assigned no xid of its own — NULL, and the apply is refused before the
--     rest of the file runs.
-- ⚠ NOT `statement_timestamp() <> now()`. MEASURED on nezapsylztqbbwuwembx
--   2026-09-04: a multi-statement simple query has ONE statement_timestamp for
--   the whole message, so that test reads "autocommit" even inside an explicit
--   `begin; … commit;`. It was written, executed, and rejected on the result.
do $$
begin
  if pg_current_xact_id_if_assigned() is null then
    raise exception 'PRECONDITION: this file is being applied in AUTOCOMMIT. §1 creates '
                    'hr_attended_kills with a DEFAULT ACL and §1b revokes it one statement '
                    'later, so an unwrapped apply leaves a SECURITY DEFINER function that takes '
                    'p_user callable by service_role (a postgres apply, measured) or by anon (a '
                    'supabase_admin apply, and PGlite). Re-run as: begin; <this file> commit;';
  end if;
end $$;

-- ── 2. THE DETECTOR — link 7 of HR_GRANT_HYGIENE_CHAIN ─────────────────────
-- The grant above is correct by design and would otherwise make the NIGHTLY
-- detector raise `engine_execute_outside_allowlist`. There are three ways to
-- stop that and only one is a fix:
--   (a) revoke the grant        — the engine cannot read the log; this change is inert
--   (b) widen/delete check (7)  — DELETES THE CONTROL
--   (c) record the entry with a justification that re-derives the claim — this file
-- §2's body is EXTRACTED from 2026-08-20-live-progress-engine-allow.sql's (link
-- 6, the body production runs) by tools/derive-grant-hygiene.mjs and patched at
-- ONE anchor: an INSERTION at the head of c_engine_allow. Insertions only, so
-- this link's declared-removals list in tests/run-sql-tests.mjs PART 1f-ii is
-- EMPTY — the strongest form that check can take.
--
-- ⚠ DO NOT HAND-EDIT THE DERIVED BLOCK. Run:
--     node tools/derive-grant-hygiene.mjs --write
--   and `--check` is a preflight in tests/run-smoke.mjs.
--
-- §1 of the derivation's own guard (below, in §2a) refuses to install on a live
-- detector body this file was not derived from, by SET COMPARISON on the live
-- allowlist rather than by term scan — so applying this file can neither delete
-- a reviewed capability nor silently overwrite a hand edit.

-- ── 2a. REFUSE TO REPLACE A BODY THIS FILE DID NOT COME FROM ───────────────
do $$
declare
  v_src   text;
  v_len   int;
  v_arr   text;
  v_live  text[];
  v_e     text;
  -- link 6's list (the base) plus this file's one entry.
  c_base constant text[] := array[
    'hr_bestiary_of(uuid,integer)',
    'hr_collection_of(uuid,integer)',
    'hr_renown_of(uuid,integer)',
    'hr_market_list(uuid,integer,bigint,uuid,text,bigint,bigint)',
    'hr_market_cancel(uuid,integer,bigint,uuid,uuid)',
    'hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint)',
    'hr_unlock_buy(uuid,integer,bigint,uuid,text)',
    'hr_claim_lookup(uuid,integer,text,text)',
    'hr_perks_of(uuid,integer)',
    'hr_apply(uuid,integer,bigint,uuid,jsonb)',
    'hr_state_of(uuid,integer)',
    'hr_seed(uuid,integer,text)',
    'hr_total_level(uuid,integer)',
    'hr_level_from_xp(bigint)',
    'hr_xp_for_level(integer)',
    'hr_offline_cap_ms(uuid,integer)',
    'hr_rate_gate(uuid,integer,text)'
  ];
  c_added constant text[] := array['hr_attended_kills(uuid,integer,timestamp with time zone)'];
begin
  select prosrc, length(prosrc) into v_src, v_len
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_assert_grant_hygiene';

  v_arr := substring(v_src from 'c_engine_allow constant text\[\] := array\[(.*?)\];');
  if v_arr is null then
    raise exception 'REFUSING TO REPLACE hr_assert_grant_hygiene: the live body (% chars) has no '
                    '`c_engine_allow constant text[] := array[…];` declaration, so it is not the '
                    'body this file was derived from. Re-derive from whatever is actually running '
                    '(node tools/derive-grant-hygiene.mjs --report).', coalesce(v_len, 0);
  end if;

  select array_agg(m[1] order by m[1]) into v_live
    from regexp_matches(v_arr, '''([a-z][a-z0-9_]*\([a-z0-9_, ]*\))''', 'g') m;

  -- TWO CONTROLS BEFORE ANY VERDICT, because a text scan fails in BOTH
  -- directions. Positive: an entry no engine allowlist can lack. Negative: a
  -- sentinel that appears in no body at all.
  if v_live is null or not ('hr_apply(uuid,integer,bigint,uuid,jsonb)' = any (v_live)) then
    raise exception 'THE ALLOWLIST SCAN IS BLIND (positive control): hr_apply is not among the % '
                    'entries parsed out of the live c_engine_allow, and hr_apply is THE writer. '
                    'Fix the parse, do not delete the check.', coalesce(array_length(v_live, 1), 0);
  end if;
  if 'hr__grant_hygiene_negative_control(uuid)' = any (v_live) then
    raise exception 'THE ALLOWLIST SCAN CANNOT SEE FAILURE (negative control): a sentinel that '
                    'appears in no allowlist MATCHED, so the parse is matching everything.';
  end if;

  -- (a) Nothing this file would DELETE.
  foreach v_e in array v_live loop
    if not (v_e = any (c_base) or v_e = any (c_added)) then
      raise exception 'REFUSING TO REPLACE hr_assert_grant_hygiene: the live engine allowlist '
                      'carries "%", which the body in this file does NOT. Applying it would '
                      'silently DELETE that reviewed capability. Add the entry to '
                      'tools/derive-grant-hygiene.mjs and re-derive.', v_e;
    end if;
  end loop;

  -- (b) Everything link 6's list had is still there.
  foreach v_e in array c_base loop
    if not (v_e = any (v_live)) then
      raise exception 'REFUSING TO REPLACE hr_assert_grant_hygiene: the live engine allowlist is '
                      'MISSING the base entry "%". This file''s body was derived from '
                      '2026-08-20-live-progress-engine-allow.sql (link 6); the live body is not '
                      'that one. Re-derive rather than overwrite.', v_e;
    end if;
  end loop;

  if 'hr_attended_kills(uuid,integer,timestamp with time zone)' = any (v_live) then
    raise notice 'hr_attended_kills is already recorded — this is a no-op re-run of §2.';
  end if;
end $$;

-- ⟦DERIVED hr_assert_grant_hygiene — tools/derive-grant-hygiene.mjs, do not hand-edit⟧
create or replace function public.hr_assert_grant_hygiene(p_strict boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_public_exec   jsonb;   -- D1 + D3: PUBLIC holds EXECUTE (functions AND procedures)
  v_unapproved    jsonb;   -- D2: client-executable but not in the baseline
  v_lost          jsonb;   -- baseline rows whose function is gone (reported)
  v_client_trunc  jsonb;   -- TRUNCATE/REFERENCES/TRIGGER on any relation
  v_defacl_open   jsonb;   -- D4: owners with no fail-closed GLOBAL default ACL
  v_platform      jsonb;   -- residual, reported only
  v_engine_extra  jsonb;   -- S9: hr_engine EXECUTE outside its allowlist
  v_engine_tables jsonb;   -- S9: hr_engine holding any table privilege
  v_ungated       jsonb;   -- A9: client-callable SECURITY DEFINER with no rate gate
  v_report jsonb;

  -- ══════════════════════════════════════════════════════════════════════
  -- S9 — THE hr_engine CAPABILITY PIN, MOVED HERE (Security, 2026-08-11)
  -- ──────────────────────────────────────────────────────────────────────
  -- It used to live in 2026-08-11-market-v2.sql §9(i), which is three defects
  -- at once and the reason it is now here:
  --
  --   1. IT DOES NOT RUN. market-v2 is UNAPPLIED and cannot be applied until
  --      the server owns gold and inventory. A pin inside an unapplied
  --      migration is a comment. hr_assert_grant_hygiene runs at every apply
  --      AND nightly via pg_cron, and its failures surface as maintenance_alerts.
  --   2. IT MATCHED ON `proname`. `p.proname <> all (array[...])` accepts ANY
  --      overload of an approved name — `hr_seed(text)` added next to
  --      `hr_seed(uuid,int,text)` would pass silently. Keyed on
  --      `p.oid::regprocedure::text` an overload is a different string and is
  --      therefore a finding, which is the correct answer.
  --   3. IT FILTERED `prokind = 'f'`. A PROCEDURE was invisible to it — exactly
  --      defect D1 that this file's own rewrite was written to fix, reproduced
  --      one section later.
  --
  -- ⚠ EVERY ENTRY CARRIES A ONE-LINE JUSTIFICATION. In the old list only entry
  --   8 did, which meant the first seven were "bounded and fine" by tradition.
  --   Adding an entry is a CLAIM: read-only or self-validating, and it accepts
  --   no target the caller is not already authorised for. Re-derive that for
  --   the whole list every time it changes.
  c_engine_allow constant text[] := array[
    -- ── ADDED 2026-09-10 — THE ATTENDED KILL LEDGER PROJECTION ──────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1, 2, 5 and
    -- 6: it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- READ-ONLY: `language sql`, `stable` — three CTEs over hr_kill_credit_log
    -- and player_state and a jsonb_build_object. No PL/pgSQL body through which a
    -- later edit could smuggle a write without the language keyword changing,
    -- which is the same strongest-available shape the three link-6 projections
    -- carry. The authoring migration's GATE(b) asserts that shape rather than
    -- describing it.
    -- SELF-VALIDATING: fixed output, its own per-target and per-key ceilings, and
    -- it sums `credit` (what hr_bounty_kill_cap allowed) and never `claimed`
    -- (what the client sent). GATE(e2) executes that distinction.
    -- NO NEW TARGET: (p_user, p_slot) — the exact pair the engine already hands
    -- hr_apply and hr_state_of. The holder of hr_apply can already WRITE any
    -- character it names; this lets it READ one integer per monster for one of
    -- them, out of a table hr_engine holds no privilege on (GATE(c)). The third
    -- argument, p_upto, is the engine's own hr_state_of now() and is CLAMPED with
    -- least(p_upto, now()), so it can only ever SHRINK the projected window —
    -- Security condition C6, executed by that migration's GATE(e6).
    -- WHY THE ENGINE NEEDS IT: the settle is the ONE writer of loot and gold, and
    -- it priced attended windows by re-simulating them as unattended — measured
    -- 9 kills against 15 the server had already accepted, i.e. 38% of a session's
    -- drops confiscated. See docs/design/attended-loot-credit.md.
    'hr_attended_kills(uuid,integer,timestamp with time zone)',
    -- ── ADDED 2026-08-20 — THE THREE LIVE-PROGRESS READ PROJECTIONS ─────
    -- At the HEAD again, an INSERTION, for the same reason as links 1, 2 and 5:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- All three are READ-ONLY (`stable sql`) dedicated projections for ONE
    -- character, added by 2026-08-20-bestiary.sql / 2026-08-21-collection.sql /
    -- 2026-08-20-renown.sql. hr_state_of stopped serving the ev:kill_monster:%
    -- and ev:loot:% populations (2026-08-21-streak-state.sql) because together
    -- they approach its 1000-row envelope cap, so the engine reads them through
    -- these instead. SELF-VALIDATING and NO NEW TARGET, the same claim
    -- hr_state_of / hr_perks_of make: each takes (p_user, p_slot) — the exact
    -- pair the engine already passes to hr_apply and hr_state_of — reads a
    -- STRICT SUBSET of what hr_state_of's envelope used to carry, writes nothing,
    -- calls nothing that writes, and exposes no target the holder of hr_apply
    -- could not already reach.
    'hr_bestiary_of(uuid,integer)',
    'hr_collection_of(uuid,integer)',
    'hr_renown_of(uuid,integer)',
    -- ── ADDED 2026-08-17 — THE THREE MARKET WRITERS ─────────────────────
    -- At the HEAD, an insertion, for the same reason as links 1 and 2: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ THE LARGEST SINGLE WIDENING SINCE hr_apply: three writers at once, and
    -- ONE OF THEM MOVES VALUE BETWEEN TWO PLAYERS. The c_engine_allow claim is
    -- "read-only or SELF-VALIDATING, and it accepts no target the caller is not
    -- already authorised for". None of these is read-only, so the whole claim
    -- rests on the other two clauses, re-derived rather than asserted:
    --
    --   SELF-VALIDATING. The entire caller-supplied surface of the three is a
    --   character slot, an idempotency uuid, a version, and then: an ITEM ID +
    --   COUNT + ASK (list), a LISTING ID (cancel), a LISTING ID + COUNT (buy).
    --   No price crosses on a buy — ask_each is read off the listing row under
    --   its own lock — no timestamp, no name, no fee rate, no counterparty. The
    --   item must be `tradeable` in the generated, client-unwritable hr_items;
    --   the tax rate and every ceiling come from hr_market_config; the seller
    --   name is derived from profiles; every clock is now(). Each function
    --   re-reads its listing FOR UPDATE and re-validates under hr_apply's own
    --   advisory lock, refuses a stale version, and is clamped per call (a gross
    --   ceiling) AND per DAY (list churn; gold sent; gold received) from the
    --   append-only ledger — the dimension a rate limit does not bound.
    --
    --   THE TARGET CLAUSE, STATED HONESTLY (Security M2). The earlier draft
    --   claimed "the engine cannot select a victim". That is FALSE and is the
    --   correction: the engine holds hr_market_list(p_user, …) for ANY user, so a
    --   compromised engine can open a listing FOR a victim it names and then
    --   settle it to itself with hr_market_buy — it can choose both sides of a
    --   trade. What admits these three is therefore NOT "no victim" but BOUNDED
    --   BLAST RADIUS: every path is a CONSERVED transfer of TRADEABLE items
    --   (buyer -gross, seller +net, tax burned — nothing minted, nothing an
    --   honest player did not already own), the item must be `tradeable` in the
    --   client-unwritable hr_items, BOTH SIDES ARE JOURNALLED (transfer +
    --   self_trade in meta), and the flows are CLAMPED PER DAY off the
    --   append-only ledger on three dimensions the engine cannot widen: escrowed
    --   item quantity (list), gold sent (buy) and gold received (buy).
    --   ⚠ THOSE CLAMPS ARE THE MARKET'S OWN, NOT hr_day_budget_check. A market
    --   transfer is conserved, so it is deliberately absent from the mint
    --   budget's qty dimension — charging a sale to the seller's daily inflow
    --   would let a stranger drain their accrual (the griefing vector in
    --   hr_market_buy's header). So the item-drain and gold-move ceilings live
    --   here and only here. p_user is the parameter the engine already passes to
    --   hr_apply.
    --
    --   WHY THE ENGINE NEEDS THEM: hr_apply is single-character by construction
    --   — one lock, one version, one journal target — so a delta shape that
    --   could move a second player's gold would be the most dangerous key in the
    --   engine's vocabulary. Without these three, the only writer of a
    --   cross-player transfer is the client, which is the hole this whole
    --   program was opened to close.
    'hr_market_list(uuid,integer,bigint,uuid,text,bigint,bigint)',
    'hr_market_cancel(uuid,integer,bigint,uuid,uuid)',
    'hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint)',
    -- ── ADDED 2026-08-16 — THE FIRST WRITER ADDED SINCE hr_apply ────────
    -- At the HEAD again, and for the same reason as the link above: an
    -- insertion removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim is made on the OTHER clause. It writes
    -- one player_progress unlock row, one player_state gold/version update and
    -- one player_ledger row. SELF-VALIDATING is what admits it, and concretely:
    -- its whole caller-supplied surface is ONE OFFER ID (a primary key in the
    -- generated, client-unwritable hr_unlock_offers) — no price, no quantity,
    -- no item, no rung, no timestamp; every number it writes comes from that
    -- table or from the character's own row read under the SAME advisory lock
    -- hr_apply takes; the row it writes is independently policed by the
    -- player_progress_unlock_guard trigger, which refuses an off-ladder rung, a
    -- regression and a mis-filed kind whatever this function proposes; and it
    -- is clamped per call (one rung) and per DAY (20 unlocks, counted from the
    -- append-only ledger), which is the dimension a rate limit does not bound.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT: hr_apply structurally
    -- cannot write a level ('unlock' is deliberately absent from its delta
    -- allowlist), so without this the only writer of a permanent capability is
    -- the client.
    'hr_unlock_buy(uuid,integer,bigint,uuid,text)',
    -- ── ADDED 2026-08-16 — TWO REVIEWED ENGINE READS ────────────────────
    -- At the HEAD, not appended: this array is DERIVED from
    -- 2026-08-11-grant-hygiene.sql by tools/derive-grant-hygiene.mjs, and an
    -- append would have to rewrite the previous last entry to add a comma —
    -- a MODIFIED line. An insertion removes nothing, which is why this chain's
    -- declared-removals list in PART 1f-ii is empty. Position carries no
    -- meaning here: check (7) tests membership with `<> all (...)`.
    --
    -- read-only (STABLE, and 2026-08-16-claim-reward.sql §4 asserts the
    -- declaration rather than trusting it) claim lookup for ONE character.
    -- SELF-VALIDATING in the dimension that matters: the period keys it reads
    -- are the server's own hr_utc_day_key(now()), never an argument, so the
    -- row set is structurally bounded to '' + today + yesterday and no call
    -- can widen it into a history scan. It adds NO TARGET the engine could
    -- not already reach — the engine already holds hr_apply(uuid,…) and
    -- hr_state_of(uuid,int), both of which take the same p_user — so this is
    -- strictly a narrower read of data hr_state_of's envelope is the peer of.
    'hr_claim_lookup(uuid,integer,text,text)',
    -- read-only permanent-capability read for one character: rooms, plots,
    -- property tier and unlocked recipes. Writes nothing and calls nothing
    -- that writes. On the list for the same reason hr_offline_cap_ms is —
    -- a perk multiplies a whole night's grant, so the engine must be TOLD its
    -- capabilities rather than compute them. Same target argument as above:
    -- p_user is a parameter the engine already passes to hr_apply.
    'hr_perks_of(uuid,integer)',
    -- the only writer; bounded by its own re-validation, which is the design
    'hr_apply(uuid,integer,bigint,uuid,jsonb)',
    -- returns the post-write envelope for one character the engine was told to act for
    'hr_state_of(uuid,integer)',
    -- the accrual PRNG seed; returns a hash, never the 256-bit server secret
    'hr_seed(uuid,integer,text)',
    -- derived leaderboard value; read-only, one character
    'hr_total_level(uuid,integer)',
    -- pure function of its argument
    'hr_level_from_xp(bigint)',
    -- pure function of its argument
    'hr_xp_for_level(integer)',
    -- read-only, one integer, bounded at 24h by its own ceiling; on the list because
    -- capMs multiplies a whole night's grant, so the engine must not own its own cap
    'hr_offline_cap_ms(uuid,integer)',
    -- writes one UNLOGGED counter row for the user it was handed; on the list because
    -- the alternative, granting hr_rate_ok, lets the caller name its own limit
    'hr_rate_gate(uuid,integer,text)'
  ];
begin
  -- (1) PUBLIC=EXECUTE, asked directly.
  --     `proacl is null` is NOT "no grants" — it means the ACL is the hardwired
  --     acldefault('f', owner), which contains PUBLIC=X. That is the exact
  --     state a `create function` with no revoke lands in, so it is the single
  --     most important row of this whole function.
  select coalesce(jsonb_agg(format('%s(%s)', p.proname,
                                   pg_get_function_identity_arguments(p.oid))
                            order by p.proname), '[]'::jsonb)
    into v_public_exec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p')
     and (p.proacl is null or p.proacl::text ~ '(\{|,)=[a-zA-Z*]*X');

  -- (2) Client-executable and NOT approved. Covers anon and authenticated, and
  --     covers procedures, and covers a new overload of an approved name.
  select coalesce(jsonb_agg(format('%s(%s) → %s', x.proname, x.identity_args, x.grantee)
                            order by x.proname, x.grantee), '[]'::jsonb)
    into v_unapproved
    from (
      select p.proname, pg_get_function_identity_arguments(p.oid) as identity_args, g.grantee
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'),('authenticated')) g(grantee)
       where n.nspname = 'public' and p.prokind in ('f','p')
         and has_function_privilege(g.grantee, p.oid, 'execute')
    ) x
   where not exists (select 1 from public.hr_client_rpc_baseline b
                      where b.proname = x.proname and b.identity_args = x.identity_args
                        and b.grantee = x.grantee);

  -- (3) An approved RPC that is no longer reachable. Not a security failure —
  --     a BROKEN FEATURE — so it is reported, loudly, and never fatal.
  select coalesce(jsonb_agg(format('%s(%s) → %s', b.proname, b.identity_args, b.grantee)
                            order by b.proname), '[]'::jsonb)
    into v_lost
    from public.hr_client_rpc_baseline b
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = b.proname
        and pg_get_function_identity_arguments(p.oid) = b.identity_args
        and has_function_privilege(b.grantee, p.oid, 'execute'));

  -- (4) TRUNCATE bypasses row-level security entirely, so RLS is not a backstop
  --     for it. No client ever needs TRUNCATE, REFERENCES or TRIGGER.
  --     b354 (Security C3) — WIDENED, and the second half is the interesting
  --     one. A client WRITE grant on a table that has RLS ON and NO WRITE
  --     POLICY AT ALL is a grant nothing intends to use: the only thing between
  --     it and the table is row-level security, and one `create policy` — or
  --     one `alter table ... disable row level security` typed during an
  --     incident — turns it into a client-writable table. Security found six of
  --     them live (hr_castle_*, hr_hunt_*): pure content catalogues carrying
  --     anon/authenticated INSERT/UPDATE/DELETE.
  --     WHY IT IS A BASELINE AND NOT A BAN: 21 further tables were in this class
  --     when the check was written (clan_*, world_event_*, raid_*, maintenance_*,
  --     display_names, leaderboard_meta) — all written only by SECURITY DEFINER
  --     RPCs, all dead grants, and none of them safe to sweep in the same change
  --     that introduced the detector. They are RECORDED in
  --     hr_client_write_baseline, which makes each one a claim somebody has to
  --     justify, and makes anything NEW fatal.
  --     service_role is deliberately NOT in the grantee list: Supabase's platform
  --     default grants it every privilege on every table in public, so including
  --     it would report all 40-odd tables and the check could never be strict.
  --     That is a platform posture and a separate program; stated here so its
  --     absence is a decision rather than an oversight.
  --     b350 (Security batch 5) — THE DETECTOR TAKEOVER. This query no longer
  --     reads information_schema.role_table_grants, which reports SQL-standard
  --     privileges ONLY: it cannot see MAINTAIN (the PG17 VACUUM/ANALYZE/CLUSTER/
  --     REINDEX/REFRESH privilege) and it OMITS materialized views entirely. Both
  --     are exactly where dead client write grants hid — 28 MAINTAIN pairs and the
  --     leaderboard_ranked matview were invisible to every nightly run.
  --     has_table_privilege over pg_class sees the full PG17 vocabulary AND every
  --     relkind. Two arms, the same meaning check (4) has always had:
  --       ARM 1 — a verb NO CLIENT EVER NEEDS, on ANY relation (table, partition
  --               or MATVIEW): TRUNCATE, REFERENCES, TRIGGER, and now MAINTAIN. A
  --               write policy is no defence against any of these, so the grant is
  --               a finding wherever it lives.
  --       ARM 2 — INSERT/UPDATE/DELETE on a table with RLS ON and NO write policy,
  --               minus hr_client_write_baseline. Unchanged. Matviews carry no RLS
  --               and cannot be written through any path, so an i/u/d bit on one is
  --               inert and deliberately NOT arm 2's business.
  --     PUBLIC is not enumerated separately: a grant to PUBLIC makes
  --     has_table_privilege true for anon AND authenticated, so it surfaces under
  --     both without a third grantee.
  select coalesce(jsonb_agg(distinct x.g order by x.g), '[]'::jsonb) into v_client_trunc from (
    select c.relname || ':' || gg || ':' || pv as g
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','m')
       and has_table_privilege(gg, c.oid, pv)
    union all
    select c.relname || ':' || gg || ':' || pv
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['INSERT','UPDATE','DELETE']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
       and c.relrowsecurity
       and has_table_privilege(gg, c.oid, pv)
       and not exists (select 1 from pg_policies pp
                        where pp.schemaname = 'public' and pp.tablename = c.relname
                          and pp.cmd in ('INSERT','UPDATE','DELETE','ALL'))
       and not exists (select 1 from public.hr_client_write_baseline bl
                        where bl.table_name = c.relname and bl.grantee = gg)
  ) x;

  -- (5) D4 — THE POSITIVE ASSERTION. For every role that owns a function in
  --     public there must be a GLOBAL default-ACL row (defaclnamespace = 0)
  --     for functions, and it must grant EXECUTE to none of PUBLIC / anon /
  --     authenticated. Only a GLOBAL row replaces acldefault(); a schema-scoped
  --     one can only ADD to it, which is why the 2026-08-10 attempt at this
  --     changed nothing. Absence of the row IS the finding.
  select coalesce(jsonb_agg(r.rolname order by r.rolname), '[]'::jsonb)
    into v_defacl_open
    from (select distinct p.proowner from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind in ('f','p')) o
    join pg_roles r on r.oid = o.proowner
   where not exists (
     select 1 from pg_default_acl d
      where d.defaclrole = o.proowner
        and d.defaclnamespace = 0
        and d.defaclobjtype = 'f'
        and not exists (
          select 1 from aclexplode(d.defaclacl) a
          left join pg_roles rr on rr.oid = a.grantee   -- grantee 0 = PUBLIC
           where a.privilege_type = 'EXECUTE'
             and (a.grantee = 0 or rr.rolname in ('anon','authenticated'))));

  -- (6) Residual: platform-owned SCHEMA default ACLs we genuinely cannot edit
  --     (supabase_admin). Reported so the residual stays visible. This is the
  --     check revision 1 mistook for the real one — kept, demoted, labelled.
  select coalesce(jsonb_agg(d.defaclrole::regrole::text || ':' || n.nspname
                            order by d.defaclrole::regrole::text), '[]'::jsonb)
    into v_platform
    from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
   where n.nspname = 'public' and d.defaclobjtype = 'f'
     and d.defaclacl::text ~ '(anon|authenticated)=[a-zA-Z*]*X';

  -- (7) S9 — hr_engine's EXECUTE surface, keyed on the FULL SIGNATURE and with
  --     no prokind filter, so an overload and a procedure are both visible.
  --     Skipped silently if the role does not exist: this file must stand alone
  --     on a database that has not had the server-authority bundle applied.
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
      into v_engine_extra
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f','p')
       and has_function_privilege('hr_engine', p.oid, 'execute')
       and p.oid::regprocedure::text <> all (c_engine_allow);
    -- "Zero table privileges" is the other half of the capability claim, and
    -- column grants are invisible to role_table_grants, so both are asked.
    select coalesce(jsonb_agg(x.g order by x.g), '[]'::jsonb) into v_engine_tables from (
      select table_name || ':' || privilege_type as g
        from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'hr_engine'
      union all
      select table_name || '.' || column_name || ':' || privilege_type
        from information_schema.role_column_grants
       where table_schema = 'public' and grantee = 'hr_engine') x;
  else
    v_engine_extra  := '[]'::jsonb;
    v_engine_tables := '[]'::jsonb;
  end if;

  -- (8) A9 — every client-callable SECURITY DEFINER function must reference a
  --     rate gate. This is the RUNTIME twin of the static lint in
  --     tests/run-sql-tests.mjs, and it exists for one specific reason: the A9
  --     retrofit in 2026-08-11-authenticated-surface-lockdown.sql installs thin
  --     wrappers over renamed `__ungated` bodies, so RE-APPLYING an older
  --     migration that `create or replace`s a wrapped name would silently
  --     replace the wrapper with the ungated body and delete the gate. A repo
  --     lint cannot see that; this can, within a day.
  --     Matching on prosrc is deliberately crude — it proves the gate is
  --     MENTIONED, not that it is reached. It catches the whole class this is
  --     written for (a body that has never heard of a gate) and nothing subtler.
  select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
    into v_ungated
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p') and p.prosecdef
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'))
     and p.prosrc !~ 'hr_rpc_gate|hr_rate_gate|hr_rate_ok';

  v_report := jsonb_build_object(
    'public_execute_functions',        v_public_exec,
    'unapproved_client_rpcs',          v_unapproved,
    'baseline_rows_no_longer_live',    v_lost,
    'client_truncate_grants',          v_client_trunc,
    'owners_without_failclosed_defacl',v_defacl_open,
    'platform_schema_defacls_open',    v_platform,
    'engine_execute_outside_allowlist',v_engine_extra,
    'engine_table_privileges',         v_engine_tables,
    'ungated_client_rpcs',             v_ungated);

  if jsonb_array_length(v_lost) > 0 then
    raise warning 'GRANT HYGIENE: % approved client RPC(s) are no longer reachable — %',
      jsonb_array_length(v_lost), v_lost::text;
  end if;

  if p_strict and (jsonb_array_length(v_public_exec) > 0
                or jsonb_array_length(v_unapproved) > 0
                or jsonb_array_length(v_client_trunc) > 0
                or jsonb_array_length(v_defacl_open) > 0
                or jsonb_array_length(v_engine_extra) > 0
                or jsonb_array_length(v_engine_tables) > 0
                or jsonb_array_length(v_ungated) > 0) then
    raise exception 'GRANT HYGIENE FAILED: %', v_report::text;
  end if;
  return v_report;
end $$;
-- ⟦/DERIVED hr_assert_grant_hygiene⟧

-- ── 2b. THE DETECTOR'S OWN GRANTS — revoke from PUBLIC, grant nothing ──────
-- `create or replace` PRESERVES the existing ACL, so on a database that already
-- ran grant-hygiene this is belt-and-braces. It is restated anyway, for link 6's
-- reason: the thing that would catch its absence is the detector's OWN check
-- (1), and a detector that arrives PUBLIC-executable for one migration is a
-- detector an attacker can read the allowlist out of. There is no `grant` line
-- for it, by design — this file adds it no capability.
revoke execute on function public.hr_assert_grant_hygiene(boolean)
  from public, anon, authenticated, service_role;

-- ── 3. SELF-VERIFYING COMMIT GATE ──────────────────────────────────────────
-- Every property this file is load-bearing for, asserted against the database it
-- just installed into. The EXECUTED arm runs inside a subtransaction that is
-- ALWAYS discarded, so the gate leaves zero residue.
do $$
declare
  v_uid   uuid;
  v_res   jsonb;
  v_n     int;
begin
  -- (a) NOT CLIENT-EXECUTABLE. The whole containment in three lines.
  if has_function_privilege('anon', 'public.hr_attended_kills(uuid,int,timestamptz)', 'execute') then
    raise exception 'GATE(a): hr_attended_kills is executable by anon';
  end if;
  if has_function_privilege('authenticated', 'public.hr_attended_kills(uuid,int,timestamptz)', 'execute') then
    raise exception 'GATE(a): hr_attended_kills is executable by authenticated — it would hand a '
                    'player the exact window their own settle is about to price';
  end if;
  if has_function_privilege('service_role', 'public.hr_attended_kills(uuid,int,timestamptz)', 'execute') then
    raise exception 'GATE(a): hr_attended_kills is executable by service_role';
  end if;
  if not has_function_privilege('hr_engine', 'public.hr_attended_kills(uuid,int,timestamptz)', 'execute') then
    raise exception 'GATE(a): hr_engine CANNOT execute hr_attended_kills — the whole change is inert';
  end if;

  -- (b) READ-ONLY BY LANGUAGE, not by inspection. `sql` + `stable` is the claim
  --     the allowlist entry makes; asserting it here is what stops a later edit
  --     turning the projection into a writer while the justification still says
  --     "stable sql".
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_language l on l.oid = p.prolang
     where n.nspname = 'public' and p.proname = 'hr_attended_kills'
       and l.lanname = 'sql' and p.provolatile = 's' and p.prosecdef
  ) then
    raise exception 'GATE(b): hr_attended_kills is not `language sql stable security definer` — '
                    'the c_engine_allow claim rests on exactly that shape';
  end if;

  -- (c) THE ENGINE HOLDS NO TABLE PRIVILEGE ON THE LOG IT NOW READS THROUGH.
  --     If it did, the projection's ceilings would be optional.
  if has_table_privilege('hr_engine', 'public.hr_kill_credit_log', 'select') then
    raise exception 'GATE(c): hr_engine holds SELECT on hr_kill_credit_log directly — the '
                    'projection''s clamps are then bypassable and the allowlist claim is false';
  end if;

  -- (d) RECORDED ON THE ALLOWLIST. A grant the detector will raise on every
  --     night is a grant somebody will "fix" by revoking it.
  if position('hr_attended_kills(uuid,integer,timestamp with time zone)' in
              (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'hr_assert_grant_hygiene')) = 0 then
    raise exception 'GATE(d): hr_attended_kills is granted to hr_engine but NOT recorded in '
                    'c_engine_allow. Run `node tools/derive-grant-hygiene.mjs --write` and '
                    're-apply §2 — do not revoke the grant and do not widen check (7).';
  end if;

  -- (e) EXECUTED BEHAVIOUR, in a subtransaction that is always discarded.
  begin
    v_uid := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email)
      values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              'attended-gate-' || v_uid::text || '@probe.invalid');
    insert into public.player_state (user_id, slot, accrued_to)
      values (v_uid, 0, now() - interval '10 minutes')
      on conflict (user_id, slot) do update set accrued_to = excluded.accrued_to;

    -- (e1) An empty log projects an EMPTY window, not a defaulted one.
    v_res := public.hr_attended_kills(v_uid, 0, now());
    if coalesce(v_res->>'ok', '') <> 'true' or v_res->'kills' <> '{}'::jsonb
       or (v_res->>'total')::bigint <> 0 or v_res->'from' <> 'null'::jsonb then
      raise exception 'GATE(e1): empty log did not project an empty window: %', v_res;
    end if;

    -- (e2) Rows INSIDE the window are summed on `credit`, never on `claimed`.
    insert into public.hr_kill_credit_log
      (user_id, slot, idem, target, claimed, credit, cap, applied, created_at)
    values (v_uid, 0, 'gate-1', 'goblin', 999999, 5, 5, 5, now() - interval '5 minutes'),
           (v_uid, 0, 'gate-2', 'goblin', 999999, 4, 4, 4, now() - interval '4 minutes');
    v_res := public.hr_attended_kills(v_uid, 0, now());
    if (v_res->'kills'->>'goblin')::bigint <> 9 then
      raise exception 'GATE(e2): expected 9 (the sum of CREDIT), got % — if this reads 1999998 the '
                      'projection is summing `claimed`, i.e. unclamped client input through a '
                      'table. %', v_res->'kills'->>'goblin', v_res;
    end if;

    -- (e3) THE DOUBLE-PAY GUARD, EXECUTED. Advancing accrued_to (which hr_apply
    --      does in the same transaction that pays) empties the window. This is
    --      the property that replaces a consumed-flag; it has to be run, not
    --      reasoned about.
    update public.player_state set accrued_to = now() where user_id = v_uid and slot = 0;
    v_res := public.hr_attended_kills(v_uid, 0, now());
    if v_res->'kills' <> '{}'::jsonb then
      raise exception 'GATE(e3): the window did not close when accrued_to advanced — the settle '
                      'would pay the same credit rows on every accrual: %', v_res;
    end if;

    -- (e4) SCOPED TO (user, slot). A row on slot 1 is not a slot-0 window.
    update public.player_state set accrued_to = now() - interval '10 minutes'
      where user_id = v_uid and slot = 0;
    insert into public.hr_kill_credit_log
      (user_id, slot, idem, target, claimed, credit, cap, applied, created_at)
    values (v_uid, 1, 'gate-3', 'slime', 50, 50, 50, 50, now() - interval '1 minute');
    v_res := public.hr_attended_kills(v_uid, 0, now());
    if v_res->'kills' ? 'slime' then
      raise exception 'GATE(e4): a slot-1 credit leaked into the slot-0 window: %', v_res;
    end if;

    -- (e5) THE PER-CALL CEILINGS. A pathological log cannot hand the engine an
    --      unbounded number or an unbounded key set.
    insert into public.hr_kill_credit_log
      (user_id, slot, idem, target, claimed, credit, cap, applied, created_at)
    -- Written as integer literals, never `9e18`: that is a float8 in Postgres and
    -- an insert into a bigint column raises 42804, which would make this gate
    -- fail for a reason that has nothing to do with the property under test.
    values (v_uid, 0, 'gate-big', 'wolf', 9000000000000000000, 9000000000,
            9000000000000000000, 9000000000, now() - interval '2 minutes');
    v_res := public.hr_attended_kills(v_uid, 0, now());
    if (v_res->'kills'->>'wolf')::bigint <> 5000 then
      raise exception 'GATE(e5): the per-target ceiling did not bind: %', v_res->'kills'->>'wolf';
    end if;
    select count(*) into v_n from jsonb_object_keys(v_res->'kills');
    if v_n > 8 then
      raise exception 'GATE(e5): more than 8 targets projected (%)', v_n;
    end if;

    -- (e6) SECURITY C6 — THE UPPER BOUND, AND ITS CLAMP, EXECUTED.
    --      Two properties in one block, because half of this is decoration:
    --        · a row NEWER than p_upto is not projected — that is the half that
    --          closes the double-pay (the engine pays what it projects and
    --          advances `accrued_to` to p_upto, so anything above p_upto would be
    --          paid now and projected again next time); and
    --        · a p_upto in the FUTURE cannot widen the window past now(), which
    --          is the property that makes the third argument incapable of
    --          increasing a payment no matter who supplies it.
    delete from public.hr_kill_credit_log where user_id = v_uid;
    update public.player_state set accrued_to = now() - interval '10 minutes'
      where user_id = v_uid and slot = 0;
    insert into public.hr_kill_credit_log
      (user_id, slot, idem, target, claimed, credit, cap, applied, created_at)
    values (v_uid, 0, 'gate-past',   'goblin', 7, 7, 7, 7, now() - interval '5 minutes'),
           (v_uid, 0, 'gate-future', 'goblin', 11, 11, 11, 11, now() + interval '5 minutes');

    v_res := public.hr_attended_kills(v_uid, 0, now() - interval '1 minute');
    if (v_res->'kills'->>'goblin')::bigint <> 7 then
      raise exception 'GATE(e6): p_upto did not bound the window — expected 7 (the one row below '
                      'it), got %. A credit row above the instant the watermark advances to is '
                      'paid now and projected AGAIN next settle.', v_res->'kills'->>'goblin';
    end if;

    v_res := public.hr_attended_kills(v_uid, 0, now() + interval '1 hour');
    if (v_res->'kills'->>'goblin')::bigint <> 7 then
      raise exception 'GATE(e6): a FUTURE p_upto widened the window past now() (got %). '
                      '`least(p_upto, now())` is what makes the third argument unable to '
                      'increase a payment.', v_res->'kills'->>'goblin';
    end if;

    v_res := public.hr_attended_kills(v_uid, 0, null);
    if (v_res->'kills'->>'goblin')::bigint <> 7 then
      raise exception 'GATE(e6): a NULL p_upto did not fall back to now() (got %)',
                      v_res->'kills'->>'goblin';
    end if;

    raise exception using errcode = 'HR900', message = 'gate ok — discarding';
  exception
    when sqlstate 'HR900' then null;    -- the subtransaction rolls back; nothing persists
  end;

  -- (f) ZERO RESIDUE. The discarded subtransaction must have left nothing.
  if exists (select 1 from public.hr_kill_credit_log where idem like 'gate-%') then
    raise exception 'GATE(f): the gate leaked hr_kill_credit_log rows';
  end if;

  raise notice 'attended-loot-credit: all gates pass';
end $$;
