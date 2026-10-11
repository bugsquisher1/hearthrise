-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-17-bestiary-target.sql — A BOUNTY KILL MUST BE A KILL OF THE TARGET.
--
-- Security finding (PLAUSIBLE from a code read; REPRODUCED on the PGlite
-- replay by tests/bestiary-target.mjs --repro before this file existed):
--
--   F1  hr_accept_bounty accepted ANY catalogued monster as the target — the
--       14 tier-6 bosses the board never posts (and, with lane w0f, the five
--       field champions) included.
--   F2  hr_credit_kills priced the bounty branch's cap window as "time since
--       accept that player_state said COMBAT" — combat against ANY monster.
--       So: fight goblins, accept a contract on monster X, credit X. The
--       bestiary row stat 'ev:kill_monster:X' rises at X's physical cap for
--       every minute spent on goblins. That row is what hunterAll grades
--       (every monster slain: 50,000 gold + 25 gems, once), what renown reads
--       (its credited-kill discount subtracts the credit from the RANKED
--       score but not from the bestiary count), and what the contract turns
--       in on. Every one of the 108 monsters was reachable.
--
-- THE FIX, AT THE SOURCE (server only; no client half, no signature moves):
--   §1  public.hr_bounty_board_monsters — the ALLOWLIST of monsters the board
--       can post: src/data/monsters.js rows with neither `boss` nor
--       `champion` (src/core/bounty.js pickBountyMonster's filter). 94 rows.
--       Read-only to every client. Drift-guarded both ways by
--       tests/bestiary-target.mjs (D1 data parity, D2 2,000 seeded boards).
--       An allowlist, so a monster a later content file adds to
--       hr_bounty_monsters is NOT board-eligible until it is ruled so here:
--       fail closed.
--   §2  active_bounty.fight_ms / fight_mark — the contract's accumulated
--       server-observed time fighting ITS target. Lives on the contract row
--       (locked FOR UPDATE by the credit, deleted with the contract), so the
--       2-day hr_kill_credit_log prune can never reset a long contract.
--   §3  hr_accept_bounty__ungated: refuses `not_board_eligible` after the
--       catalogue gate. ONE inserted block; every other line is the chain-end
--       body (2026-10-04-bounty-abandon-server-fee.sql) byte-for-byte.
--   §4  hr_credit_kills__ungated, bounty branch only: the cap window is
--       fight_ms, which grows ONLY while player_state says combat ON THIS
--       TARGET (active_kind = 'combat' and active_id = target), measured from
--       the latest of accept / the switch onto this fight (active_since) / the
--       recovery line / the previous on-target credit. A credit while fighting
--       something else with no target time to spend is `off_target`: credit
--       zero, no log row, idempotency key not consumed, one value-free ledger
--       row per character per UTC day. Earned target time stays creditable
--       after a switch (the stock client's hold-retry). The bounty-free branch
--       (daily goal counter only; never the bestiary) is byte-unchanged.
--       Restated from the chain-end body (2026-08-30 + 2026-09-01 + the
--       2026-09-02 renown and 2026-09-06 recovery/not-in-combat splices);
--       every other line is byte-for-byte.
--
-- THE AWAY HALF NEEDS NO CHANGE, AND THE GUARD PROVES IT RATHER THAN SAYS
-- IT: the edge engine (supabase/functions/hr-accrue/accrual.js) prices the
-- server pointer's monster only — computeAccrual has no bounty input — so a
-- settle can write 'ev:kill_monster:<id>' for the monster being fought and no
-- other. tests/bestiary-target.mjs A1/A2 drive the shipped engine both ways.
--
-- CONCURRENCY: unchanged locks. The credit holds the per-character advisory
-- lock 'hr_credit_kills:<uid>' and the active_bounty row FOR UPDATE, so the
-- fight_ms read-modify-write is serialised; accept holds hr_apply's
-- per-character key. Idempotency: a replayed key returns the stored receipt
-- before any of this runs; an off_target refusal records no key.
--
-- LIMITATIONS (stated, all in the under-credit direction):
--   • Target time between the last on-target credit and a switch away is not
--     counted (<= one 15 s client cadence per fight run). The away settle still
--     pays those kills from the server sim.
--   • A contract in flight at apply starts with fight_ms 0: target time before
--     a switch made before the apply is not carried. A contract fought
--     continuously since accept loses nothing (the run starts at accept).
--   • A party hunt points every member's player_state at the party's monster,
--     so party fights on the target accrue. A dungeon fight does not move the
--     pointer, so attended dungeon kills do not top up a field contract — the
--     dungeon settle pays its own counters.
--
-- APPLY ORDER: after set/b566's last file. Independent of lane w0f
-- (2026-10-16-w0f-fun-content.sql): w0f upserts its champions into
-- hr_bounty_monsters, not into this allowlist, so they are refused either
-- order. Independent of lane w0c.
--
-- REVERT (targeted, never a file re-apply): restate both bodies from
-- 2026-10-04-bounty-abandon-server-fee.sql §2b and the chain-end
-- hr_credit_kills__ungated (pg_get_functiondef before this file), then
-- `drop table public.hr_bounty_board_monsters` and drop the two active_bounty
-- columns. No data moves on apply; nothing to restore.
--
-- No begin/commit (CLAUDE.md §2 — tools/apply-migration.mjs sends one batch).
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. THE BOARD ALLOWLIST ─────────────────────────────────────────────────
create table if not exists public.hr_bounty_board_monsters (
  monster_id text primary key check (monster_id ~ '^[a-z0-9_]{1,64}$')
);
alter table public.hr_bounty_board_monsters enable row level security;
drop policy if exists hr_bounty_board_monsters_sel on public.hr_bounty_board_monsters;
create policy hr_bounty_board_monsters_sel on public.hr_bounty_board_monsters for select using (true);
revoke all on public.hr_bounty_board_monsters from public, anon, authenticated, service_role;
grant select on public.hr_bounty_board_monsters to anon, authenticated, service_role;

-- GENERATED LIST — `node tests/bestiary-target.mjs` (D1) fails when it differs
-- from src/data/monsters.js filtered by !boss && !champion. Re-apply converges
-- (insert the missing, delete the extra); a second apply moves nothing.
do $$
declare
  v_ids text[] := array[
    'adept', 'air_elemental', 'ancient_bear', 'archmage', 'astrologer', 'bandit_lord',
    'barrow_knight', 'bear', 'bog_vine', 'carnivorous_plant', 'carrion_swarm', 'cave_wyrm',
    'centipede', 'chained_demon', 'clay_golem', 'conjurer', 'cutpurse', 'cyclops',
    'dark_wizard', 'death_knight', 'deserter', 'dire_wolf', 'drake', 'drowned_dead',
    'dryad', 'earth_elemental', 'fire_devil', 'fire_elemental', 'frost_giant', 'fury',
    'gargoyle', 'ghoul', 'giant_bat', 'giant_boar', 'giant_spider', 'gnoll',
    'goblin', 'goblin_brute', 'goblin_warlord', 'grave_banshee', 'hellhound', 'hive_wasp',
    'hobgoblin', 'ice_elemental', 'imp', 'kobold', 'lesser_demon', 'locust_swarm',
    'lynx', 'magma_elemental', 'mammoth', 'mandrake', 'minotaur', 'mountain_ram',
    'mountain_troll', 'nightmare', 'ogre', 'ooze', 'panther', 'plague_swarm',
    'rat', 'revenant', 'rock_troll', 'salamander', 'scarecrow', 'shadow_creeper',
    'shrieker', 'skeleton', 'slime', 'small_wolf', 'stag', 'starhusk',
    'stone_golem', 'storm_elemental', 'the_silence', 'vampire_bride', 'venom_spider', 'void_mote',
    'void_parasite', 'war_king', 'warband_captain', 'warlock', 'watchknight', 'water_elemental',
    'weak_skeleton', 'wight', 'wild_boar', 'winter_wolf', 'witchs_apprentice', 'wolf',
    'wraith', 'wyrmling', 'wyvern', 'zombie'
  ];
  v_n int;
begin
  delete from public.hr_bounty_board_monsters where monster_id <> all (v_ids);
  insert into public.hr_bounty_board_monsters (monster_id)
    select unnest(v_ids) on conflict (monster_id) do nothing;
  select count(*) into v_n from public.hr_bounty_board_monsters;
  if v_n <> 94 then raise exception '§1: hr_bounty_board_monsters holds % rows, expected 94', v_n; end if;
end $$;

-- ── 2. THE CONTRACT'S TARGET-FIGHT CLOCK ───────────────────────────────────
alter table public.active_bounty add column if not exists fight_ms bigint not null default 0;
alter table public.active_bounty add column if not exists fight_mark timestamptz;
do $$ begin
  alter table public.active_bounty add constraint active_bounty_fight_ms_chk check (fight_ms >= 0);
exception when duplicate_object then null; end $$;

-- ── 3. hr_accept_bounty__ungated — ONLY A BOARD-ELIGIBLE TARGET ────────────
-- Signature, volatility, SECURITY DEFINER and search_path unchanged;
-- `create or replace` keeps proacl and the revoke below re-asserts it.
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
  v_bh_lvl   int;
  v_kmin     bigint; v_kmax bigint;
  v_req      bigint;
  v_gold     bigint; v_marks int; v_xp int;
  v_baseline bigint;
  v_first    boolean;
  v_held     text;
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
  -- 2026-10-17 BESTIARY TARGET (Security): ONLY A MONSTER THE BOARD CAN POST.
  -- generateBountyBoard (src/core/bounty.js pickBountyMonster) never offers a
  -- boss or a field champion, so a contract on one is forged by construction.
  -- hr_bounty_board_monsters is that allowlist, generated from
  -- src/data/monsters.js and drift-guarded (tests/bestiary-target.mjs). An
  -- ALLOWLIST, so a monster added to hr_bounty_monsters by a later content file
  -- is refused until it is ruled board-eligible: fail closed.
  if not exists (select 1 from public.hr_bounty_board_monsters where monster_id = p_target) then
    return jsonb_build_object('ok', false, 'error', 'not_board_eligible', 'target', p_target);
  end if;

  -- SA-048 BH-LEVEL READ. The Bounty-Hunter level the SERVER owns
  -- (player_skills.bountyHunter.xp -> hr_level_from_xp). Absent row -> 0 xp -> level 1:
  -- FAIL CLOSED to the shallowest difficulty, never 'hard' because a read missed.
  v_bh_lvl := public.hr_level_from_xp(coalesce((
    select xp from public.player_skills
     where user_id = auth.uid() and slot = v_slot and skill_id = 'bountyHunter'), 0));

  -- SA-048 DIFFICULTY GATE. The board posts 'hard' only once 'streak' unlocks
  -- (BH>=15, generateBountyBoard slot 3); easy/normal are always board-legal and
  -- 'elite' is refused above. A forged 'hard' at BH<15 buys the 1.3x difficulty
  -- multiplier on the now-RANKED bountyHunter skill. This is the ONLY forgeable ranked
  -- gain: the target TIER is honestly gated by the combat level below (the board offers
  -- exactly unlockedTier(combatLevel); there is no board-tier min to enforce).
  if not public.hr_bounty_difficulty_unlocked(p_difficulty, v_bh_lvl) then
    return jsonb_build_object('ok', false, 'error', 'difficulty_locked',
      'difficulty', p_difficulty, 'bounty_level', v_bh_lvl);
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

  -- 2026-10-04 (Security, P2): ONE CONTRACT AT A TIME, ENFORCED HERE. This was
  -- an upsert that REPLACED an active contract, so "accept over the old one" was
  -- an abandon that skipped hr_bounty_spend: no fee, no bounty_abandon ledger
  -- row. Now a held contract is REFUSED (bounty_active) and the only ways a
  -- contract ends are claim (hr_claim_bounty) and abandon (hr_bounty_spend).
  -- The per-character advisory lock (hr_apply's key; abandon takes it too) plus
  -- FOR UPDATE on the row make check-then-insert atomic against a racing accept
  -- or abandon; the insert carries NO on-conflict arm, so a row that appeared
  -- anyway raises instead of being silently replaced.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || v_slot::text, 0));
  select bounty_id into v_held from public.active_bounty
    where user_id = auth.uid() and slot = v_slot for update;
  if found then
    perform public.hr_record_rejection(auth.uid(), v_slot, 'hr_accept_bounty', 'bounty_active',
      jsonb_build_object('target', left(coalesce(p_target, ''), 32)), 1);
    return jsonb_build_object('ok', false, 'error', 'bounty_active',
      'bounty_id', v_held, 'slot', v_slot);
  end if;
  insert into public.active_bounty
    (user_id, slot, bounty_id, b_type, difficulty, target, tier, required, baseline,
     gold_reward, marks_reward, xp_reward, accepted_at)
  values
    (auth.uid(), v_slot, coalesce(p_bounty_id,''), 'cull', p_difficulty, p_target, v_tier, v_req,
     v_baseline, v_gold, v_marks, v_xp, now());

  return jsonb_build_object('ok', true, 'bounty_id', coalesce(p_bounty_id,''),
    'target', p_target, 'tier', v_tier, 'required', v_req, 'baseline', v_baseline,
    'gold', v_gold, 'marks', v_marks, 'xp', v_xp, 'slot', v_slot, 'first_contract', v_first);
end $function$;

revoke execute on function public.hr_accept_bounty__ungated(int, text, text, text, text, bigint)
  from public, anon, authenticated, service_role;

-- ── 4. hr_credit_kills__ungated — THE FIGHT MUST BE THE TARGET'S ───────────
-- Signature, volatility, SECURITY DEFINER and search_path unchanged.
CREATE OR REPLACE FUNCTION public.hr_credit_kills__ungated(p_slot integer, p_target text, p_claimed bigint, p_idem text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- The bounty-free elapsed window CEILING. The honest client cadence is 60 s;
  -- 10 minutes is generous slack for a backlogged flush and is the fuse against a
  -- pathological anchor (a pruned log AND a stale accrued_to). It is not balance.
  c_free_window_ms constant bigint := 600000;
  -- The per-character per-UTC-day BOUNTY-FREE credit ceiling, read from the
  -- append-only log (the clan_deposit budget pattern). 10,000 is 100x the largest
  -- target any reader of this row grades (wk_kills = 100; the largest per-day one
  -- is hr_claim_daily's daily_kill_big = 60), so it cannot throttle an honest
  -- player. It is a FUSE, not the control — the control is the once-per-period
  -- claim guard in hr_claim_goal / hr_claim_daily. See the header.
  c_kill_day_budget constant bigint := 10000;
  -- A recorded-claim sanity ceiling. Does NOT change credit (the physical cap
  -- binds far below); it keeps the log and the forgery journal from storing an
  -- attacker-chosen 9e18. The UNCLAMPED value is still journalled as
  -- `claimed_raw` (Security C6) — clamping the number a forger chose would erase
  -- the magnitude of the attempt, which is the one thing the signal is for.
  c_max_claim       constant bigint := 1000000;
  v_uid       uuid := auth.uid();
  v_slot      int  := coalesce(p_slot, 0);
  v_ab        public.active_bounty%rowtype;
  v_free      boolean;
  v_hp        int;
  v_dmg_lvl   int;
  v_elapsed   bigint;
  v_cap       bigint;
  v_claimed_raw bigint := greatest(0, coalesce(p_claimed, 0));
  v_claimed   bigint := least(greatest(0, coalesce(p_claimed, 0)), c_max_claim);
  v_credit    bigint;
  v_current   bigint;
  v_target_val bigint;
  v_applied   bigint;
  v_prior     public.hr_kill_credit_log%rowtype;
  v_progress  bigint;
  v_day       text := public.hr_utc_day_key(now());
  v_anchor    timestamptz;
  v_accrued   timestamptz;
  v_active_kind text;
  v_used_today bigint := 0;
  v_kills_now bigint;        -- lifetime stat/'ev:kill_any' NOW
  v_kills_prev bigint;       -- …and at this character's previous bounty-free credit TODAY
  v_settle_delta bigint := 0;
  v_consumed  bigint := 0;   -- the part of that delta the flooring actually used
  v_kills_mark bigint;       -- the watermark this call records (prev + consumed)
  -- SECURITY F1 - THE RECOVERY FLOOR. The character's absolute knockout
  -- instant, read from the SERVER row under this function's own advisory lock.
  -- NULL is the ordinary value ("on their feet") and must change nothing.
  v_recovering timestamptz;
  v_ko_used_today bigint := 0;
  -- SECURITY F1 - THE NOT-IN-COMBAT CAP. `v_combat_end` is the last instant the
  -- SERVER agrees this character was fighting: now() while the pointer says
  -- combat, and the switch instant (player_state.active_since) once it does not.
  v_active_since timestamptz;
  v_combat_end timestamptz;
  -- 2026-10-17 BESTIARY TARGET (Security). The fight that buys bounty credit
  -- must be against the bounty's OWN monster, by the server's pointer.
  v_active_id  text;
  v_on_target  boolean := false;
  v_fight      bigint  := 0;
  v_run_from   timestamptz;
  v_nic_used_today bigint := 0;
  v_out       jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_idem is null or length(p_idem) not between 1 and 64 then
    return jsonb_build_object('ok', false, 'error', 'bad_idem');
  end if;
  if p_target is null or p_target !~ '^[a-z0-9_]{1,64}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_target');
  end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- Serialize concurrent credits for this character (idempotency read + write,
  -- and the anchor read + the log append that advances it).
  perform pg_advisory_xact_lock(hashtextextended('hr_credit_kills:' || v_uid::text, v_slot));

  -- IDEMPOTENCY: a replay of the same key returns the stored result, no re-apply.
  select * into v_prior from public.hr_kill_credit_log
    where user_id = v_uid and slot = v_slot and idem = p_idem;
  if found then
    return jsonb_build_object('ok', true, 'replay', true, 'target', v_prior.target,
      'credited', v_prior.applied, 'credit', v_prior.credit, 'cap', v_prior.cap,
      'claimed', v_prior.claimed, 'bounty', not v_prior.free, 'slot', v_slot);
  end if;

  -- THE BRANCH IS A SERVER FACT. An active bounty for THIS target supplies
  -- accepted_at (the cap window), the baseline (new-kills anchor) and required.
  -- Its ABSENCE is no longer a refusal: it selects the bounty-free branch, which
  -- credits the DAILY goal counter and nothing else.
  select * into v_ab from public.active_bounty
    where user_id = v_uid and slot = v_slot and target = p_target for update;
  v_free := (v_ab.user_id is null);

  -- THE MONSTER CATALOGUE GATE — both branches. p_target can never be a phantom.
  select hp into v_hp from public.hr_bounty_monsters where monster_id = p_target;
  if v_hp is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_monster', 'target', p_target);
  end if;

  -- Damage LEVEL = the greatest of the SERVER-owned strength/ranged/magic levels
  -- (whichever family the player would use is the most generous, safe direction).
  v_dmg_lvl := greatest(1,
    public.hr_level_from_xp(coalesce((select xp from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='strength'),0)),
    public.hr_level_from_xp(coalesce((select xp from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='ranged'),0)),
    public.hr_level_from_xp(coalesce((select xp from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='magic'),0)));

  -- SECURITY F1 - THE RECOVERY FLOOR (the attended half of the Recovery Rule).
  -- A death INTERRUPTS a run; while `recovering_until` runs, the away path
  -- (accrual.js + combat-sim.js simulateSpan) pays nothing and set-activity.js
  -- refuses to start a fight. This verb is the OTHER door into the same
  -- counters - and the one the RANKED surfaces read (stat ev:kill_monster:* and
  -- 'kills' are graded by hr_renown_of; daily ev:kill_any is PAID by
  -- hr_claim_daily) - so it must obey the same line or a modified client simply
  -- keeps reporting kills through the knockout and is paid at the physical cap.
  -- No `for update`: this verb never writes player_state, and the per-character
  -- advisory lock above already serialises it against its own concurrent calls.
  -- ONE point read serves BOTH arms: the recovery line and the activity pointer
  -- that the not-in-combat cap needs. v_active_kind is re-read by the
  -- bounty-free branch below from the same row; the values are identical and the
  -- second read costs nothing that was not already being spent.
  select recovering_until, active_kind, active_since, active_id
    into v_recovering, v_active_kind, v_active_since, v_active_id
    from public.player_state where user_id = v_uid and slot = v_slot;

  if v_recovering is not null and now() < v_recovering then
    -- CREDIT ZERO, WRITE NOTHING, ADVANCE NOTHING. Returning here leaves the
    -- bounty-free anchor (max(created_at) over hr_kill_credit_log) exactly where
    -- it was, which is what the 1c floor then relies on: the anchor is stale by
    -- the whole knockout, and only the floor stops it paying for it afterwards.
    -- The idempotency key is NOT recorded, so the same key retried after the
    -- window succeeds - the correct posture for a refusal whose answer is a
    -- function of the clock.
    if v_free then
      select coalesce(sum(applied), 0) into v_ko_used_today from public.hr_kill_credit_log
        where user_id = v_uid and slot = v_slot and free
          and created_at >= public.hr_utc_day_start(now());
    end if;

    -- THE AUDIT SIGNAL, RATE-BOUNDED TO ONE ROW PER CHARACTER PER UTC DAY (the
    -- daily_kill_settle_absorbed idiom). The stock client never calls this verb
    -- while knocked out, so a row here is a tell worth being able to grep by
    -- intent - but a 64-minute knockout at the 60 s cadence would file ~64 rows
    -- per fall, and journal rule 6 exists because game_events reached 1.6M rows
    -- from six players by writing per tick. One named row says "go look".
    if not exists (select 1 from public.player_ledger
                    where user_id = v_uid and slot = v_slot
                      and intent = 'kill_credit_while_recovering'
                      and at >= public.hr_utc_day_start(now())) then
      insert into public.player_ledger
        (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
      values
        (v_uid, v_slot, 'bounty', 'kill_credit_while_recovering', 0, 0, 0, 0, 0,
         jsonb_build_object('claimed', v_claimed, 'claimed_raw', v_claimed_raw,
           'target', p_target, 'free', v_free, 'day', v_day,
           'recovering_until', v_recovering,
           'remaining_ms', floor(extract(epoch from (v_recovering - now())) * 1000)::bigint));
    end if;

    -- The NORMAL receipt shape with every credited quantity ZERO, plus the named
    -- reason. The bounty branch keeps `progress`/`required` because the client
    -- keys its server-confirmed bar on the PRESENCE of a numeric progress; the
    -- bounty-free branch keeps its day fields for the same reason.
    v_out := jsonb_build_object('ok', true, 'target', p_target, 'credited', 0,
      'credit', 0, 'claimed', v_claimed, 'cap', 0, 'throttled', false,
      'bounty', not v_free, 'day', v_day, 'slot', v_slot,
      'reason', 'recovering', 'recovering_until', v_recovering);
    if v_free then
      v_out := v_out || jsonb_build_object('day_used', v_ko_used_today,
                                           'day_budget', c_kill_day_budget,
                                           'settle_delta', 0, 'consumed', 0, 'owed', 0);
    else
      v_out := v_out || jsonb_build_object(
        'progress', greatest(0, public.hr_bounty_kills(v_uid, v_slot, p_target) - v_ab.baseline),
        'required', v_ab.required);
    end if;
    return v_out;
  end if;

  -- SECURITY F1 - THE NOT-IN-COMBAT CAP. The END of every window this verb
  -- prices. `active_since` is the switch instant (set-activity.js sends
  -- `restart:true` on every transition and hr_apply stamps active_since = now()
  -- on that flag), so once the pointer is not 'combat' it is the moment the
  -- character stopped fighting. A flush that covers time BEFORE the switch still
  -- pays in full; time AFTER it never does.
  --   coalesce(.., 'epoch') is FAIL-CLOSED and it is the house rule (accrual.js
  --   SKIP.NO_ACTIVE_SINCE refuses to price a pointer with no active_since): a
  --   row that cannot say when the character stopped fighting does not get to
  --   bill for the ambiguity. 'epoch' rather than '-infinity' so the difference
  --   stays a finite bigint.
  --   least(.., now()) so a future active_since can only ever SHORTEN the
  --   window. Like the recovery floor, this arm cannot become a faucet.
  v_combat_end := case when v_active_kind is distinct from 'combat'
                       then least(now(), coalesce(v_active_since, 'epoch'::timestamptz))
                       else now() end;

  -- SERVER CLOCK ONLY.
  if v_free then
    -- The window is (last bounty-free credit .. now], floored at the settle
    -- watermark and ceilinged at c_free_window_ms. Flooring at accrued_to is the
    -- CONDITION-2 property: a settle that just ran (accrued_to = now) makes this
    -- window ~0, so a credit racing behind the settle cannot re-credit a window
    -- the span-sim already stamped onto the same daily row.
    -- NO `for update`: this verb never writes player_state (see the header).
    select accrued_to, active_kind into v_accrued, v_active_kind
      from public.player_state where user_id = v_uid and slot = v_slot;
    select max(created_at) into v_anchor from public.hr_kill_credit_log
      where user_id = v_uid and slot = v_slot and free;
    v_anchor := greatest(coalesce(v_anchor, v_accrued), v_accrued);
    -- SECURITY F1 - THE RECOVERY FLOOR. The window may not start before the
    -- character was back on their feet. A knockout that ended thirty seconds ago
    -- leaves the log anchor an hour stale (the KO short-circuit above wrote no
    -- row), and without this line that whole hour would be creditable the
    -- instant they stand up. greatest() so it can only ever SHORTEN the window;
    -- least(.., now()) so a future line cannot make the window negative.
    v_anchor := greatest(v_anchor, least(coalesce(v_recovering, v_anchor), now()));
    -- SECURITY F1 - THE NOT-IN-COMBAT CAP: the window ENDS when the server
    -- says the character stopped fighting, not at now().
    v_elapsed := least(c_free_window_ms,
                       greatest(0, floor(extract(epoch from (v_combat_end - v_anchor)) * 1000)::bigint));
  else
    -- SECURITY F1 - THE RECOVERY FLOOR. A bounty's cap window runs from
    -- accepted_at; a knockout inside it is time the character could not have
    -- fought, so the window starts again when they got up.
    -- SECURITY F1 - THE NOT-IN-COMBAT CAP ends the same window at the switch.
    -- greatest(0, ..) is new and deliberate: with an end-cap the difference CAN
    -- be negative, and a negative elapsed has no business travelling into a cap
    -- or a journal.
    --
    -- 2026-10-17 BESTIARY TARGET (Security, PLAUSIBLE -> reproduced on the
    -- replay). The window above was "time since accept that the pointer said
    -- COMBAT" - against ANY monster. A player fighting goblins could accept a
    -- contract on any other monster and have its counter (the bestiary row
    -- ev:kill_monster:<target>, read by hunterAll and renown) topped up at that
    -- monster's physical cap for every minute spent on goblins.
    -- The cap window is now the ACCUMULATED time the server's pointer was
    -- combat ON THIS TARGET since accept, carried on the contract row itself
    -- (active_bounty.fight_ms / fight_mark, locked FOR UPDATE above, deleted
    -- with the contract - never pruned out from under a long contract):
    --   on target : add (now - run_from), run_from = the latest of accept, the
    --               switch onto this fight (active_since; NULL fails closed to
    --               now), the recovery line, and the previous on-target credit
    --               (fight_mark) so no interval is counted twice;
    --   off target: add nothing. Fight time already earned stays creditable
    --               (the stock client's hold-retry after a switch), and no
    --               amount of time on another monster buys this one a kill.
    -- The time between the last on-target credit and a switch away is not
    -- counted (<= one 15 s client cadence per run): under-credit, the safe
    -- direction; the away settle still pays those kills from the server sim.
    -- The NOT-IN-COMBAT CAP still ends the window (v_combat_end is now() only
    -- while the pointer says combat, and on target it does); off target the
    -- run is empty by construction (run_from = combat_end).
    v_on_target := (v_active_kind = 'combat' and v_active_id = p_target);
    v_run_from := case when v_on_target
                       then greatest(v_ab.accepted_at,
                             coalesce(v_active_since, now()),
                             least(coalesce(v_recovering, v_ab.accepted_at), now()),
                             coalesce(v_ab.fight_mark, v_ab.accepted_at))
                       else v_combat_end end;
    -- This call's increment of target-fight time...
    v_elapsed := greatest(0, floor(extract(epoch from (v_combat_end -
      v_run_from)) * 1000)::bigint);
    -- ...on top of what the contract has already earned. The cap prices the SUM.
    v_fight := greatest(0, coalesce(v_ab.fight_ms, 0)) + v_elapsed;
    if v_on_target then
      update public.active_bounty set fight_ms = v_fight, fight_mark = now()
       where user_id = v_uid and slot = v_slot;
    end if;
    v_elapsed := v_fight;
  end if;

  -- SECURITY F1 - THE NOT-IN-COMBAT CAP: CREDIT ZERO, WRITE NOTHING. The
  -- whole reported window falls after the server's own switch out of combat, so
  -- there is no span left to price. LIVE EVIDENCE, 2026-09-06 11:41:38 UTC: 40
  -- combat XP paid over elapsed 52742 ms with active_kind 'idle' and
  -- kind_mismatch true - journalled as a tell and paid anyway. This is the arm
  -- that stops paying it. The second conjunct is what keeps an ordinary
  -- zero-length window (a settle that just ran while the player IS fighting)
  -- reporting as an ordinary zero credit rather than a named refusal.
  if v_elapsed <= 0 and v_active_kind is distinct from 'combat' then
    if v_free then
      select coalesce(sum(applied), 0) into v_nic_used_today from public.hr_kill_credit_log
        where user_id = v_uid and slot = v_slot and free
          and created_at >= public.hr_utc_day_start(now());
    end if;

    -- ONE VALUE-FREE LEDGER ROW PER CHARACTER PER UTC DAY (journal rule 6). The
    -- stock client can legitimately fire one flush just after a switch, so this
    -- is not by itself proof of forgery - it is the named, greppable "go look",
    -- and a RUN of them is the tell 2026-08-31 described. kind_mismatch is kept
    -- so the existing queries over that field still find these.
    if not exists (select 1 from public.player_ledger
                    where user_id = v_uid and slot = v_slot
                      and intent = 'kill_credit_not_in_combat'
                      and at >= public.hr_utc_day_start(now())) then
      insert into public.player_ledger
        (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
      values
        (v_uid, v_slot, 'bounty', 'kill_credit_not_in_combat', 0, 0, 0, 0, 0,
         jsonb_build_object('claimed', v_claimed, 'claimed_raw', v_claimed_raw,
           'target', p_target, 'free', v_free, 'day', v_day,
           'active_kind', v_active_kind, 'kind_mismatch', true,
           'active_since', v_active_since, 'combat_end', v_combat_end,
           'elapsed_ms', v_elapsed));
    end if;

    v_out := jsonb_build_object('ok', true, 'target', p_target, 'credited', 0,
      'credit', 0, 'claimed', v_claimed, 'cap', 0, 'throttled', false,
      'bounty', not v_free, 'day', v_day, 'slot', v_slot,
      'reason', 'not_in_combat', 'active_kind', v_active_kind);
    if v_free then
      v_out := v_out || jsonb_build_object('day_used', v_nic_used_today,
                                           'day_budget', c_kill_day_budget,
                                           'settle_delta', 0, 'consumed', 0, 'owed', 0);
    else
      v_out := v_out || jsonb_build_object(
        'progress', greatest(0, public.hr_bounty_kills(v_uid, v_slot, p_target) - v_ab.baseline),
        'required', v_ab.required);
    end if;
    return v_out;
  end if;

  -- 2026-10-17 BESTIARY TARGET: CREDIT ZERO, WRITE NOTHING. A bounty credit
  -- while the server's pointer is fighting a DIFFERENT monster, with no fight
  -- time on this target to spend. Same posture as not_in_combat above: no log
  -- row (the idempotency key is not consumed, so a retry once the player is on
  -- the target succeeds), the normal receipt shape, a named reason, and ONE
  -- value-free ledger row per character per UTC day (journal rule 6).
  if not v_free and not v_on_target and v_elapsed <= 0 then
    if not exists (select 1 from public.player_ledger
                    where user_id = v_uid and slot = v_slot
                      and intent = 'kill_credit_off_target'
                      and at >= public.hr_utc_day_start(now())) then
      insert into public.player_ledger
        (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
      values
        (v_uid, v_slot, 'bounty', 'kill_credit_off_target', 0, 0, 0, 0, 0,
         jsonb_build_object('claimed', v_claimed, 'claimed_raw', v_claimed_raw,
           'target', p_target, 'day', v_day,
           'active_kind', v_active_kind, 'active_id', left(coalesce(v_active_id, ''), 64)));
    end if;
    return jsonb_build_object('ok', true, 'target', p_target, 'credited', 0,
      'credit', 0, 'claimed', v_claimed, 'cap', 0, 'throttled', false,
      'bounty', true, 'day', v_day, 'slot', v_slot,
      'reason', 'off_target', 'active_kind', v_active_kind,
      'progress', greatest(0, public.hr_bounty_kills(v_uid, v_slot, p_target) - v_ab.baseline),
      'required', v_ab.required, 'fight_ms', 0);
  end if;

  v_cap := public.hr_bounty_kill_cap(v_hp, v_dmg_lvl, v_elapsed);
  v_credit := least(v_claimed, greatest(0, v_cap));

  if v_free then
    -- THE PER-UTC-DAY CEILING, summed from the append-only log (bounty-free rows
    -- only — a bounty turn-in must not eat this budget). A replay does not re-sum:
    -- it returned above.
    select coalesce(sum(applied), 0) into v_used_today from public.hr_kill_credit_log
      where user_id = v_uid and slot = v_slot and free
        and created_at >= public.hr_utc_day_start(now());
    v_credit := least(v_credit, greatest(0, c_kill_day_budget - v_used_today));

    /* ── THE ANTI-DOUBLE-COUNT, and it is the load-bearing line of this branch ──
       The accrued_to floor above stops a credit paying for a window a settle has
       ALREADY covered. It does NOT stop the NEXT settle covering a window this
       credit already paid: hr_apply/accrual.js re-simulates [accrued_to, now] in
       full and stamps its own sim-kills onto the SAME daily row, and it has no
       kill watermark to clamp against (unlike combat XP, which got
       combat_xp_accrued_to and an edge change). Left additive, the daily counter
       would read settle_sim + observed for the same seconds — a paying counter
       reading up to ~1.4x attended truth. That is a mint, small but real, and the
       brief forbids it.

       The BOUNTY branch never had this problem because its v_applied is a
       SHORTFALL against a counter (the bestiary row) the settle also feeds, so the
       settle's contribution cancels. This gives the bounty-free branch the same
       cancellation, against the one row that is the settle's exact twin of the
       daily counter: src/core/goals.js goalProgressOps writes daily 'ev:kill_any'
       and lifetime stat 'ev:kill_any' from the SAME counts() in the same delta, so
       the growth of the lifetime row since our last bounty-free credit IS the
       number the settle put on the daily row in that window. Subtract it, and what
       lands is exactly the part of the player's observation the settle missed:

           daily += credit - settle_delta      (floored at 0)
           daily total = settle_delta + (credit - settle_delta) = observed

       The bounty branch does write the lifetime row, so a mixed session
       over-subtracts — bounded by one call's credit, and it under-credits, which
       is the safe direction. A first-ever bounty-free credit has no predecessor,
       so coalesce makes its delta 0 rather than its whole lifetime count.

       ⚠ CONCURRENCY, stated rather than assumed. hr_apply takes a DIFFERENT lock
       (player_state), so a settle may commit between this read and the next call.
       If it commits AFTER this read, this call under-reads the delta and
       over-credits by that settle's contribution ONCE — and the NEXT call reads the
       larger lifetime value and subtracts the same amount again, cancelling it. The
       error is bounded by one settle's kills and self-corrects rather than
       compounding, because the reference is an ABSOLUTE row value re-read every
       call, not a running total this function maintains. */
    select coalesce(max(value), 0) into v_kills_now from public.player_progress
      where user_id = v_uid and slot = v_slot
        and kind = 'stat' and key = 'ev:kill_any' and period_key = '';
    /* ⚠ SCOPED TO THE UTC DAY (Security C1, part 2 — my addition to their fix).
       The watermark corrects DOUBLE-COUNTING ON ONE DAILY ROW. Once the day rolls
       over, yesterday's settle contribution sits on yesterday's row and has nothing
       to do with today's, so an un-consumed remainder must NOT be carried across
       midnight. Without this scope the debt from one away night (hundreds of
       sim-kills, none of them subtractable because the credits are far smaller)
       would silently swallow the NEXT day's attended credits and re-create the
       exact "goal never completes" defect this file exists to remove — one day
       later and much harder to trace.

       ⚠ THE COST OF THE SCOPE, STATED. (An earlier revision of this comment said
       "stated below" and then stated it nowhere — a promise of a limitation is
       worse than no claim at all, because a reviewer stops looking.)
         RESIDUAL = at most ONE settle's contribution, once per character per UTC
         day, left UN-SUBTRACTED. It arises only when a settle lands between
         midnight and that day's first bounty-free credit: the day's first credit
         has no predecessor row, so its delta is 0 by construction and that one
         settle's kills go undiscounted. It is BOUNDED (one settle, not a day's
         worth), it CANNOT COMPOUND (the next call measures from the mark this one
         records), it is SELF-ONLY, and the payout it could accelerate is
         CLAIM-GUARDED once per period by hr_claim_goal / hr_claim_daily. In
         practice it is ~0: a player's first credit of a day follows their first
         kill, and the settle before it covered a window in which they were not
         fighting. */
    /* ⚠ max(), NOT "the newest row's value". The watermark is MONOTONE by
       construction (mark = prev + consumed, consumed >= 0), so its current value
       IS its maximum — and reading it as a maximum is immune to the ordering trap
       an ordered lookup carries. GATE(f6) caught that trap on the first draft of
       this very fix: `order by created_at desc, idem desc` breaks ties on the
       IDEM string, and a zero-claim call (which records prev + 0) sorts above the
       crediting call that advanced the watermark whenever their timestamps are
       equal, so the delta was measured against a stale mark and the credit
       over-subtracted (160 credited read as 124). created_at ties are rare in
       production and routine in a fixture — which is exactly the class of bug
       that ships. A maximum has no tiebreak to get wrong. */
    select max(kills_stat) into v_kills_prev from public.hr_kill_credit_log
      where user_id = v_uid and slot = v_slot and free and kills_stat is not null
        and created_at >= public.hr_utc_day_start(now());
    v_settle_delta := greatest(0, v_kills_now - coalesce(v_kills_prev, v_kills_now));
    v_applied := greatest(0, v_credit - v_settle_delta);
    /* ⚠ CONSUME ONLY WHAT THE SUBTRACTION ACTUALLY USED (Security C1 — S1, and it
       was a REAL over-count, reproduced: credit(C) → settle → credit(0) three times
       read 156 against 120 observed, growing linearly with the rounds).
       The first draft advanced the watermark to v_kills_now unconditionally. When
       `v_credit - v_settle_delta` floors at 0 the surplus of the delta is never
       subtracted from anything — but marking the watermark at v_kills_now declared
       it spent, permanently FORGIVING it, so the next credit saw delta 0 and landed
       in full on top of a settle contribution that was already on the row. A
       zero-claim call was therefore a "clear the debt" button.
       The watermark now advances by exactly `least(delta, credit)` — the portion the
       flooring consumed — and the remainder stays owed against the next credit of
       the SAME day. A credit of 0 consumes nothing and forgives nothing. */
    v_consumed   := least(v_settle_delta, v_credit);
    v_kills_mark := coalesce(v_kills_prev, v_kills_now) + v_consumed;
    v_target_val := null;
  else
    -- TOP UP the target counter to (baseline + credit); never lower it, never
    -- double-count what the settle already credited. UNCHANGED from 2026-08-30.
    v_current := public.hr_bounty_kills(v_uid, v_slot, p_target);
    v_target_val := v_ab.baseline + v_credit;
    v_applied := greatest(0, v_target_val - v_current);
  end if;

  if v_applied > 0 then
    if not v_free then
      -- ── BOUNTY BRANCH ONLY: the LIFETIME keys. These are read by
      --    hr_claim_quest (a paying quest) and hr_renown_of (a RANKED score), so
      --    they stay behind the active-bounty gate. See the header.
      insert into public.player_progress as p (user_id, slot, kind, key, period_key, value, state)
        values (v_uid, v_slot, 'stat', 'ev:kill_monster:' || p_target, '', v_target_val, 'active')
        on conflict (user_id, slot, kind, key, period_key)
          do update set value = greatest(p.value, excluded.value), updated_at = now();
      -- The aggregate + Hero-screen counters, additive by the delta actually applied
      -- (the SAME keys the away path writes). Adding only the shortfall keeps these
      -- ~correct against a settle that already credited the away-undercount.
      insert into public.player_progress as p (user_id, slot, kind, key, period_key, value, state)
        values (v_uid, v_slot, 'stat', 'ev:kill_any', '', v_applied, 'active')
        on conflict (user_id, slot, kind, key, period_key)
          do update set value = p.value + v_applied, updated_at = now();
      insert into public.player_progress as p (user_id, slot, kind, key, period_key, value, state)
        values (v_uid, v_slot, 'stat', 'kills', '', v_applied, 'active')
        on conflict (user_id, slot, kind, key, period_key)
          do update set value = p.value + v_applied, updated_at = now();

      -- ── THE RENOWN DISCOUNT COUNTERS (R5) ───────────────────────────
      -- The SAME v_applied, recorded so hr_renown_of can subtract the part
      -- of the kill counters a CLIENT supplied. Bounty branch only, which is
      -- the only branch that writes the renown-bearing rows at all. These are
      -- permanent rows (period_key = ''), so hr_progress_prune never sweeps
      -- them: a pruned discount would silently re-open the faucet.
      insert into public.player_progress as p (user_id, slot, kind, key, period_key, value, state)
        values (v_uid, v_slot, 'stat', 'ev:kill_credited:' || p_target, '', v_applied, 'active')
        on conflict (user_id, slot, kind, key, period_key)
          do update set value = p.value + v_applied, updated_at = now();
      insert into public.player_progress as p (user_id, slot, kind, key, period_key, value, state)
        values (v_uid, v_slot, 'stat', 'ev:kill_credited_any', '', v_applied, 'active')
        on conflict (user_id, slot, kind, key, period_key)
          do update set value = p.value + v_applied, updated_at = now();
    end if;

    -- ── BOTH BRANCHES: THE DAILY GOAL COUNTER (the fix). Same key contract as
    --    src/core/goals.js: kind='daily', key='ev:<type>', period = the day the
    --    player is LOOKING AT (server now()), additive, state 'active'. This one
    --    row feeds kill_any (10), kill_more (30) AND wk_kills (100) — the weekly
    --    is a SUM of daily rows over hr_goal_week_days, so there is no weekly twin
    --    to write.
    --    FAIL CLOSED on an empty day key: period_key='' is the PERMANENT
    --    population, which hr_progress_prune never sweeps. Under-credit rather
    --    than file an unsweepable row.
    if coalesce(v_day, '') <> '' then
      insert into public.player_progress as p (user_id, slot, kind, key, period_key, value, state)
        values (v_uid, v_slot, 'daily', 'ev:kill_any', v_day, v_applied, 'active')
        on conflict (user_id, slot, kind, key, period_key)
          do update set value = p.value + v_applied, updated_at = now();
    end if;
  end if;

  -- IDEMPOTENCY RECORD (once per key). Written on EVERY non-replay call, so it is
  -- also what advances the bounty-free anchor — a zero-credit call still closes
  -- its window, which is the safe direction.
  insert into public.hr_kill_credit_log (user_id, slot, idem, target, claimed, credit, cap, applied, free, kills_stat)
    values (v_uid, v_slot, p_idem, p_target, v_claimed, v_credit, v_cap, v_applied, v_free,
            case when v_free then v_kills_mark else null end);

  -- FORGERY SIGNAL: a claim the cap (or the day ceiling) threw away. An honest
  -- player never reaches 1.3x the physical maximum. AGGREGATE, never per-kill.
  if v_credit < v_claimed then
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
      values (v_uid, v_slot, 'bounty', 'kill_credit_throttled:' || p_target,
        0, 0, 0, 0, 0,
        jsonb_build_object('claimed', v_claimed, 'claimed_raw', v_claimed_raw,
          'credit', v_credit, 'cap', v_cap,
          'elapsed_ms', v_elapsed, 'dmg_level', v_dmg_lvl, 'hp', v_hp, 'target', p_target,
          'free', v_free, 'day_used', v_used_today,
          -- Non-blocking audit signal: the server-known activity at credit time. A
          -- credit while active_kind is not 'combat' is plausible on a final
          -- post-fight flush; a RUN of them is a forgery tell.
          'active_kind', v_active_kind,
          'kind_mismatch', (v_free and v_active_kind is distinct from 'combat'),
          'on_target', (v_free or v_on_target)));
  end if;

  /* ── THE ABSORBED SIGNAL (Security C5) ────────────────────────────────────
     The throttle journal above cannot see the S1 shape: the abusive call carries
     p_claimed = 0, so `v_credit < v_claimed` is false and NOTHING was recorded —
     the very ordering that used to forgive the subtraction left no trace at all.
     A bounty-free call whose settle delta EXCEEDS what it may credit now leaves a
     named row, so the pattern is greppable by intent rather than reconstructible
     from the credit log.
     ⚠ RATE-BOUNDED to at most one row per character per UTC day, because this is
     also the ordinary shape of an honest return from an away night (the span-sim
     legitimately out-paces the next small credit) and a row per call at the 60 s
     client cadence is precisely the game_events mistake. The per-call detail is
     already in hr_kill_credit_log (claimed / credit / applied / kills_stat); this
     row is the named flag that says "go look". */
  if v_free and v_settle_delta > v_credit
     and not exists (select 1 from public.player_ledger
                      where user_id = v_uid and slot = v_slot
                        and intent = 'daily_kill_settle_absorbed'
                        and at >= public.hr_utc_day_start(now())) then
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
      values (v_uid, v_slot, 'bounty', 'daily_kill_settle_absorbed',
        0, 0, 0, 0, 0,
        jsonb_build_object('day_key', v_day, 'claimed', v_claimed, 'credit', v_credit,
          'settle_delta', v_settle_delta, 'consumed', v_consumed,
          'owed', v_settle_delta - v_consumed,
          'kills_prev', v_kills_prev, 'kills_now', v_kills_now, 'kills_mark', v_kills_mark,
          'zero_claim', (v_claimed = 0),
          'active_kind', v_active_kind,
          'kind_mismatch', (v_active_kind is distinct from 'combat')));
  end if;

  v_out := jsonb_build_object('ok', true, 'target', p_target, 'credited', v_applied,
    'credit', v_credit, 'claimed', v_claimed, 'cap', v_cap,
    'throttled', v_credit < v_claimed, 'bounty', not v_free, 'day', v_day, 'slot', v_slot);
  if v_free then
    -- `settle_delta` is surfaced so a support question about "my daily moved less
    -- than I killed" is answerable from the receipt rather than from a theory.
    v_out := v_out || jsonb_build_object('day_used', v_used_today + v_applied,
                                         'day_budget', c_kill_day_budget,
                                         'settle_delta', v_settle_delta,
                                         'consumed', v_consumed,
                                         'owed', v_settle_delta - v_consumed);
  else
    -- progress/required exist only when there IS a bounty to have progress
    -- against. The client keys its "server-confirmed" bar on the PRESENCE of a
    -- numeric `progress`, so the bounty-free branch must not supply one.
    v_progress := v_target_val - v_ab.baseline;
    v_out := v_out || jsonb_build_object('progress', greatest(0, v_progress),
                                         'required', v_ab.required,
                                         'on_target', v_on_target,
                                         'fight_ms', v_fight);
  end if;
  return v_out;
end $function$;

revoke execute on function public.hr_credit_kills__ungated(int, text, bigint, text)
  from public, anon, authenticated, service_role;

-- ── 5. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) — EXECUTED ─────────────────
do $$
declare
  v        jsonb;
  v_h      jsonb;
  v_role   text;
  v_src    text;
  v_boss   text;
  v_x      text;
  v_uid    constant uuid := '000000c0-0000-0000-0000-0000be57a7e1';
begin
  -- (a) THE ALLOWLIST: 94 ids, every one catalogued, no hr_activities boss.
  if (select count(*) from public.hr_bounty_board_monsters) <> 94 then
    raise exception 'GATE(a): hr_bounty_board_monsters does not hold 94 rows'; end if;
  if exists (select 1 from public.hr_bounty_board_monsters b
              where not exists (select 1 from public.hr_bounty_monsters m where m.monster_id = b.monster_id)) then
    raise exception 'GATE(a): an allowlisted id is not in hr_bounty_monsters'; end if;
  if exists (select 1 from public.hr_bounty_board_monsters b
               join public.hr_activities a on a.kind = 'combat' and a.activity_id = b.monster_id and a.is_boss) then
    raise exception 'GATE(a): a boss (hr_activities.is_boss) is board-eligible'; end if;

  -- (b) NO CLIENT WRITES THE ALLOWLIST OR THE CONTRACT CLOCK; THE BODIES ARE
  --     CALLABLE BY NO CLIENT ROLE.
  if not (select relrowsecurity from pg_class where oid = 'public.hr_bounty_board_monsters'::regclass) then
    raise exception 'GATE(b): RLS is off on hr_bounty_board_monsters'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_bounty_board_monsters'
              and cmd <> 'SELECT') then
    raise exception 'GATE(b): a non-SELECT policy exists on hr_bounty_board_monsters'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.hr_bounty_board_monsters', 'insert,update,delete,truncate')
       or has_table_privilege(v_role, 'public.active_bounty', 'insert,update,delete,truncate')
       or has_table_privilege(v_role, 'public.player_state', 'insert,update,delete,truncate') then
      raise exception 'GATE(b): % can write a table the fence reads', v_role; end if;
  end loop;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_accept_bounty__ungated(int,text,text,text,text,bigint)', 'execute')
       or has_function_privilege(v_role, 'public.hr_credit_kills__ungated(int,text,bigint,text)', 'execute') then
      raise exception 'GATE(b): % can call an UNGATED body', v_role; end if;
  end loop;
  v_src := replace(pg_get_functiondef('public.hr_credit_kills__ungated(int,text,bigint,text)'::regprocedure), chr(13), '');
  if position('v_active_id = p_target' in v_src) = 0 or position('''off_target''' in v_src) = 0 then
    raise exception 'GATE(b): hr_credit_kills__ungated lost its target fence'; end if;

  select a.activity_id into v_boss from public.hr_activities a
   where a.kind = 'combat' and a.is_boss
     and exists (select 1 from public.hr_bounty_monsters m where m.monster_id = a.activity_id)
   order by 1 limit 1;
  select b.monster_id into v_x from public.hr_bounty_board_monsters b
    join public.hr_bounty_monsters m using (monster_id)
   where m.tier = 1 and b.monster_id <> 'goblin' order by 1 limit 1;
  if v_boss is null or v_x is null then
    raise exception 'GATE CANNOT RUN: no catalogued boss (%) or no tier-1 non-goblin board monster (%)', v_boss, v_x; end if;

  begin  -- ── SUBTRANSACTION: every probe row is discarded at HR963 ───────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    -- The probe has been fighting GOBLINS for an hour.
    insert into public.player_state (user_id, slot, gold, gems, marks, version,
                                     active_kind, active_id, active_since, accrued_to)
      values (v_uid, 0, 0, 0, 0, 1, 'combat', 'goblin', now() - interval '1 hour', now());

    -- (c1) F1: a boss is refused, nothing is written; an eligible target is accepted.
    v := public.hr_accept_bounty__ungated(0, 'bt-boss', v_boss, 'cull', 'normal', 50);
    if coalesce(v->>'error', '') <> 'not_board_eligible'
       or exists (select 1 from public.active_bounty where user_id = v_uid) then
      raise exception 'GATE(c1): accepting the boss % answered % (or wrote a contract)', v_boss, v; end if;
    v := public.hr_accept_bounty__ungated(0, 'bt-x', v_x, 'cull', 'normal', 50);
    if coalesce(v->>'ok', '') <> 'true' then
      raise exception 'GATE(c1) CONTROL: accepting board monster % answered %', v_x, v; end if;
    update public.active_bounty set accepted_at = now() - interval '1 hour' where user_id = v_uid;

    -- (c2) F2, THE FORGE: an hour on goblins buys X nothing. No bestiary row,
    --      no log row, one off-target ledger row.
    v := public.hr_credit_kills__ungated(0, v_x, 50, 'bt-forge-1');
    if coalesce(v->>'reason', '') <> 'off_target' or (v->>'credited')::bigint <> 0
       or public.hr_bounty_kills(v_uid, 0, v_x) <> 0
       or exists (select 1 from public.hr_kill_credit_log where user_id = v_uid)
       or (select count(*) from public.player_ledger where user_id = v_uid and intent = 'kill_credit_off_target') <> 1 then
      raise exception 'GATE(c2): an off-target credit on % answered % (bestiary %)', v_x, v,
        public.hr_bounty_kills(v_uid, 0, v_x); end if;

    -- (c3) THE LATE SWITCH: pointing at X only NOW buys nothing for the hour on goblins.
    update public.player_state set active_id = v_x, active_since = now() where user_id = v_uid;
    v := public.hr_credit_kills__ungated(0, v_x, 50, 'bt-switch-1');
    if (v->>'credited')::bigint <> 0 or public.hr_bounty_kills(v_uid, 0, v_x) <> 0 then
      raise exception 'GATE(c3): a switch onto % at credit time was paid the goblin hour: %', v_x, v; end if;

    -- (c4) HONEST: an hour ON X (fixture: the switch and the clock backdated) pays.
    update public.player_state set active_since = now() - interval '1 hour' where user_id = v_uid;
    update public.active_bounty set fight_ms = 0, fight_mark = null where user_id = v_uid;
    v := public.hr_credit_kills__ungated(0, v_x, 5, 'bt-honest-1');
    if (v->>'credited')::bigint <> 5 or public.hr_bounty_kills(v_uid, 0, v_x) <> 5
       or (v->>'fight_ms')::bigint <> 3600000
       or (select fight_ms from public.active_bounty where user_id = v_uid) <> 3600000 then
      raise exception 'GATE(c4): an hour on % answered % (bestiary %)', v_x, v, public.hr_bounty_kills(v_uid, 0, v_x); end if;

    -- (c5) EARNED TIME SURVIVES A SWITCH (hold-retry), AND DOES NOT GROW.
    update public.player_state set active_id = 'goblin', active_since = now() where user_id = v_uid;
    v := public.hr_credit_kills__ungated(0, v_x, 9, 'bt-retry-1');
    if (v->>'credited')::bigint <> 4 or public.hr_bounty_kills(v_uid, 0, v_x) <> 9
       or (select fight_ms from public.active_bounty where user_id = v_uid) <> 3600000 then
      raise exception 'GATE(c5): a hold-retry after a switch answered % (fight_ms %)', v,
        (select fight_ms from public.active_bounty where user_id = v_uid); end if;

    raise exception using errcode = 'HR963', message = 'bestiary-target §5 complete - rolling back';
  exception when sqlstate 'HR963' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- (z) NOTHING LEAKED.
  if exists (select 1 from public.player_state       where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.player_ledger   where user_id = v_uid)
     or exists (select 1 from public.active_bounty   where user_id = v_uid)
     or exists (select 1 from public.hr_kill_credit_log where user_id = v_uid)
     or exists (select 1 from public.hr_rejections   where user_id = v_uid)
     or exists (select 1 from auth.users             where id = v_uid) then
    raise exception 'GATE(z): §5 LEAKED a probe row'; end if;

  -- (y) THE DETECTOR IS GREEN, strict, on whatever body is live.
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    v_h := public.hr_assert_grant_hygiene(true);
    if v_h is null
       or jsonb_array_length(coalesce(v_h->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_h->'ungated_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_h->'engine_execute_outside_allowlist', '[]'::jsonb)) <> 0 then
      raise exception 'GATE(y): hr_assert_grant_hygiene is RED after this file: %', v_h; end if;
  end if;

  raise notice 'bestiary-target: 94-row board allowlist, client-read-only; ungated bodies callable by no client; '
               'EXECUTED - boss contract refused, board contract accepted, an hour on goblins credits X zero '
               '(off_target, no row, journalled once), a late switch credits zero, an hour on X credits, earned '
               'time survives a switch without growing; detector green - net zero';
end $$;
