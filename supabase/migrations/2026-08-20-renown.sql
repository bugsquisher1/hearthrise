-- ════════════════════════════════════════════════════════════════════════
-- 2026-08-20-renown.sql — THE SERVER-DERIVED RENOWN SCORE + THE PERK WIRING.
-- Slice 4 of the live-progress programme (docs/design/live-settlement.md).
--
-- Backend Architect, 2026-08-20. STAGED, NOT APPLIED (the Coordinator applies).
--
-- ⚠ SECURITY GATE (carry-forward from Slice 1's review): renown is a RANKABLE
--   surface — a forged input crosses into rankings. Its score therefore derives
--   ONLY from server-owned player_skills / player_progress / player_state rows
--   read by THIS engine-side projection. NO client-submitted count/total/score
--   reaches it, ever. This file MUST go back to the Security Engineer before it
--   is applied.
--
-- ── WHAT SHIPS ───────────────────────────────────────────────────────────
-- (1) `hr_renown_of(user, slot)` — a read-only projection returning the integer
--     renown score, computing src/features/renown.js `effectiveRenown` ENTIRELY
--     from server rows so the client's prediction reconciles to it.
-- (2) `hr_perks_of` re-defined to feed the previously-`0` `renownAllXp` channel
--     (src/core/perks.js §5) from that score — closing the perks.js under-payment.
--
-- The bestiary WRITE (Slice 1) and the aggregate `ev:kill_any` / `kills` writes
-- already land through hr_apply's `stat` allowlist. This file adds only READS.
--
-- ── WHICH OF renown.js's 10 TERMS ARE SERVER-DERIVED, AND HOW ─────────────
--   totalLevel  ×2    hr_total_level  (sum of levelFromXp over player_skills)   LIVE
--   combatLevel ×2    hr_lb_combat_level(7 derived levels)                      LIVE
--   skill99     ×100  count(player_skills where level >= 99)                    LIVE
--   kill        ×0.05 player_progress stat:ev:kill_any (== stats.kills mirror)  LIVE
--   bossKill    ×5    Σ ev:kill_monster:<id> JOIN hr_activities is_boss         LIVE (Slice 1)
--   collection  ×3    count(distinct ev:loot:<item> > 0)                        Slice 2 shape*
--   streakBest  ×5    player_state.streak_days                                  Slice 3 shape*
--   goldLog     ×8    (log10(gold)-3) for gold > 1000, from player_state.gold   LIVE
--   questDone   ×25   ── NO SERVER PROGRESS MODEL ── DEGRADED TO 0 (see below)  BLOCKED
--   bountyDone  ×2    ── NO SERVER PROGRESS MODEL ── DEGRADED TO 0 (see below)  BLOCKED
--
--   * collection (ev:loot:%) and streak (player_state.streak_days) belong to
--     Slices 2 and 3, building in parallel. This file reads them by the SAME
--     key/column shapes those slices use, so they light up the day those slices
--     merge. Until then: no ev:loot rows → collection contributes 0; and
--     streak_days is read via `to_jsonb(row)->>'streak_days'` so the function
--     COMPILES AND RUNS whether or not the column exists yet (self-configuring,
--     exactly the tool_carry / hr_unlock_levels pattern) — an absent column
--     reads as 0, never an error inside an accrual.
--
-- ── ⚠ TWO TERMS DEGRADE TO 0 SERVER-SIDE, AND THIS IS A DELIBERATE ────────
--   `questDone` and `bountyDone` have NO server progress model in ANY of Slices
--   1–3 (quests/dailies/bounties are the same gap accrual.js and b349 name). Per
--   the slice ruling, a term that cannot be server-derived is degraded to 0
--   rather than trusted from the client — the SECURITY property beats fidelity.
--   Consequence: for a player who has completed quests/bounties, the SERVER
--   renown is LOWER than the client's ratcheted score, so `renownAllXp` pays
--   slightly LESS than the client shows. Under-payment is the safe direction
--   (src/core/perks.js §5), and the rank/title the player SEES is still the
--   client's until the claim RPC (the follow-up) makes rank server-authoritative.
--   Unblocks with the quest/daily/bounty progress models.
--
-- ── ⚠ TWO KNOWN FIDELITY LIMITATIONS, flagged not hidden ─────────────────
--   · WEIGHTS + RANK THRESHOLDS ARE A SECOND COPY of src/features/renown.js game
--     data (the `W` table and the RANKS `min`/allXP ladder). renown.js is a
--     classic-script IIFE that is not ESM-importable, so it cannot yet be read
--     by a generator the way src/data/*.js is. This is the data double-copy the
--     repo is wary of; it is bounded (10 weights + 4 allXP thresholds), it is
--     asserted behaviourally below, and the FOLLOW-UP is to extract renown.js's
--     W + RANKS into a pure ESM module and generate these numbers with a drift
--     guard (as hr_activities.max_hp is generated). Recorded so it is scheduled
--     debt, not discovered debt.
--   · THE RATCHET IS NOT SERVER-SIDE. renown.js `effectiveRenown` holds a
--     high-water mark (`renownHigh`) so a weight change never demotes a player.
--     The server computes the LIVE score with no high-water column, so a term
--     that momentarily reads low (e.g. a not-yet-merged slice) pays a lower
--     renownAllXp for that read. Safe for the perk channel (bounded, capped,
--     under-pay). The claim RPC follow-up needs its own server high-water.
--
-- ── SECURITY POSTURE — MIRRORS hr_bestiary_of / hr_perks_of EXACTLY ───────
-- SECURITY DEFINER, executable by `hr_engine` ONLY, revoked from
-- public/anon/authenticated/service_role. No client RPC in this architecture.
--
-- REVERSIBILITY: `drop function public.hr_renown_of(uuid,int)` and re-apply the
-- b349 perk-channel body (renownAllXp back to 0). Additive, reads only.
--
-- APPLY AFTER: 2026-08-11-player-state.sql, 2026-08-11-catalogue.generated.sql
--   (needs hr_activities.is_boss), 2026-08-15-perk-channel.sql (redefines
--   hr_perks_of), 2026-08-18-leaderboard-server-source.sql (hr_lb_combat_level).
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — fail CLOSED ───────────────────────────────────────
do $$
begin
  if to_regclass('public.player_progress') is null then
    raise exception 'player_progress is missing — apply 2026-08-11-player-state.sql first';
  end if;
  if to_regprocedure('public.hr_total_level(uuid,int)') is null then
    raise exception 'hr_total_level is missing — apply 2026-08-11-player-state.sql first';
  end if;
  if to_regprocedure('public.hr_level_from_xp(bigint)') is null then
    raise exception 'hr_level_from_xp is missing — apply 2026-08-11-player-state.sql first';
  end if;
  if to_regprocedure('public.hr_lb_combat_level(int,int,int,int,int,int,int)') is null then
    raise exception 'hr_lb_combat_level is missing — apply 2026-08-18-leaderboard-server-source.sql first';
  end if;
  if to_regprocedure('public.hr_perks_of(uuid,int)') is null then
    raise exception 'hr_perks_of is missing — apply 2026-08-15-perk-channel.sql first';
  end if;
  -- The boss flag is the ONLY server source of the bossKill term. If it is
  -- absent the join would silently zero the term for everyone, so refuse rather
  -- than install a half-scored projection.
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='hr_activities' and column_name='is_boss'
  ) then
    raise exception 'hr_activities.is_boss is missing — regenerate + apply 2026-08-11-catalogue.generated.sql first';
  end if;
end $$;

-- ── 1. THE PROJECTION ────────────────────────────────────────────────────
-- Returns the integer renown score. floor() at the very end mirrors renown.js
-- computeRenown's `Math.floor(r)`. float8 throughout so the arithmetic is the
-- same IEEE754 double the client uses (the hr_lb_combat_level precedent).
create or replace function public.hr_renown_of(p_user uuid, p_slot int)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $body$
  with ps as (
    select * from public.player_state
     where user_id = p_user and slot = coalesce(p_slot, 0)
  ),
  sk as (
    select skill_id, public.hr_level_from_xp(xp) as lv
      from public.player_skills
     where user_id = p_user and slot = coalesce(p_slot, 0)
  )
  select floor(
      -- totalLevel × 2 (sum of every skill level owned)
      coalesce((select sum(lv) from sk), 0)::float8 * 2::float8
      -- combatLevel × 2 (absent skills default to level 1, matching xp.levelOf)
    + public.hr_lb_combat_level(
        coalesce((select lv from sk where skill_id = 'attack'),    1),
        coalesce((select lv from sk where skill_id = 'strength'),  1),
        coalesce((select lv from sk where skill_id = 'defense'),   1),
        coalesce((select lv from sk where skill_id = 'hitpoints'), 1),
        coalesce((select lv from sk where skill_id = 'prayer'),    1),
        coalesce((select lv from sk where skill_id = 'ranged'),    1),
        coalesce((select lv from sk where skill_id = 'magic'),     1)
      )::float8 * 2::float8
      -- skill99 × 100 (each skill taken to 99)
    + (select count(*) from sk where lv >= 99)::float8 * 100::float8
      -- kill × 0.05 (lifetime aggregate; ev:kill_any == the stats.kills mirror)
    + coalesce((select value from public.player_progress
                 where user_id = p_user and slot = coalesce(p_slot, 0)
                   and kind = 'stat' and period_key = '' and key = 'ev:kill_any'), 0)::float8
        * 0.05::float8
      -- bossKill × 5 (Slice 1 per-monster kills, filtered to is_boss monsters)
    + coalesce((select sum(pp.value)
                  from public.player_progress pp
                  join public.hr_activities a
                    on a.kind = 'combat' and a.is_boss
                   and a.activity_id = substring(pp.key from 17)
                 where pp.user_id = p_user and pp.slot = coalesce(p_slot, 0)
                   and pp.kind = 'stat' and pp.period_key = ''
                   and pp.key like 'ev:kill_monster:%'), 0)::float8 * 5::float8
      -- collection × 3 (Slice 2 shape: distinct looted items). No rows → 0.
    + (select count(*) from public.player_progress
        where user_id = p_user and slot = coalesce(p_slot, 0)
          and kind = 'stat' and period_key = '' and key like 'ev:loot:%'
          and value > 0)::float8 * 3::float8
      -- streakBest × 5 (Slice 3 shape: player_state.streak_days). Read via
      -- jsonb so this COMPILES AND RUNS whether or not the column exists yet;
      -- absent column → null → 0. ⚠ Slice 3 owns whether this is CURRENT or
      -- BEST streak; renown.js scores BEST. Flagged in the header.
    + coalesce((select (to_jsonb(ps.*)->>'streak_days')::float8 from ps), 0::float8) * 5::float8
      -- goldLog × 8 (only above 1,000 gold), from server-owned player_state.gold
    + case when coalesce((select gold from ps), 0) > 1000
           then (ln((select gold from ps)::float8) / ln(10::float8) - 3::float8) * 8::float8
           else 0::float8 end
      -- questDone × 25 : NO SERVER MODEL → 0 (degraded, see header)
    + 0::float8
      -- bountyDone × 2 : NO SERVER MODEL → 0 (degraded, see header)
    + 0::float8
  )::bigint
$body$;

revoke execute on function public.hr_renown_of(uuid, int)
  from public, anon, authenticated, service_role;
grant execute on function public.hr_renown_of(uuid, int) to hr_engine;

-- ── 2. WIRE THE PERK CHANNEL — hr_perks_of feeds renownAllXp from the score ─
-- Identical to the b349 body EXCEPT the renown channel: `renownAllXp` is now
-- the cumulative allXP for the ranks the server-derived score has reached, and
-- `sources.renown` reports `derived:hr_renown_of` instead of `blocked:…`.
--
-- ⚠ The four thresholds/steps below are the allXP-granting ranks of
--   src/features/renown.js RANKS (squire 900, baron 4500, duke 32000,
--   highking 120000 — each +0.01 allXP). A SECOND COPY of that game data (the
--   header's first fidelity limitation). src/core/perks.js `normalisePerkState`
--   clamps the result to PERMANENT_CAP, so a drift here cannot exceed the fuse.
create or replace function public.hr_perks_of(p_user uuid, p_slot int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rooms jsonb;
  v_plots jsonb;
  v_tier  int;
  v_renown bigint;
  v_renown_allxp float8;
begin
  if p_user is null or p_slot is null then
    return jsonb_build_object('ok', false, 'error', 'bad_args');
  end if;

  if not exists (
    select 1 from public.player_state ps
     where ps.user_id = p_user and ps.slot = p_slot
  ) then
    return jsonb_build_object('ok', false, 'error', 'no_character');
  end if;

  select
    coalesce(jsonb_object_agg(substring(u.unlock_id from 6), u.level)
               filter (where u.unlock_id like 'room:%'), '{}'::jsonb),
    coalesce(jsonb_object_agg(substring(u.unlock_id from 6), u.level)
               filter (where u.unlock_id like 'plot:%'), '{}'::jsonb),
    coalesce(max(u.level) filter (where u.unlock_id like 'property:%'), 0)
    into v_rooms, v_plots, v_tier
    from public.hr_unlock_levels(p_user, p_slot) u;

  -- THE RENOWN CHANNEL — server-derived, never from the client.
  v_renown := public.hr_renown_of(p_user, p_slot);
  v_renown_allxp :=
      case when v_renown >= 900    then 0.01::float8 else 0::float8 end   -- squire
    + case when v_renown >= 4500   then 0.01::float8 else 0::float8 end   -- baron
    + case when v_renown >= 32000  then 0.01::float8 else 0::float8 end   -- duke
    + case when v_renown >= 120000 then 0.01::float8 else 0::float8 end;  -- highking

  return jsonb_build_object(
    'ok', true,
    'rooms', coalesce(v_rooms, '{}'::jsonb),
    'plots', coalesce(v_plots, '{}'::jsonb),
    'propertyTier', coalesce(v_tier, 0),
    'renownAllXp', v_renown_allxp,
    'clanPerks', '{}'::jsonb,
    'castle', null,
    'sources', jsonb_build_object(
      'rooms',      'hr_unlock_levels',
      'plots',      'hr_unlock_levels',
      'property',   'hr_unlock_levels',
      'renown',     'derived:hr_renown_of',
      'clan',       'derivable:contributes_zero',
      'castle',     'blocked:perk_table_client_side',
      'companions', 'blocked:no_server_pet_model')
  );
end $$;

revoke execute on function public.hr_perks_of(uuid, int) from public;
revoke execute on function public.hr_perks_of(uuid, int)
  from anon, authenticated, service_role;
grant execute on function public.hr_perks_of(uuid, int) to hr_engine;

-- ── 3. SELF-VERIFYING BLOCK — RENOWN-1 ───────────────────────────────────
-- Every load-bearing property, EXECUTED with a control. The score is a pure
-- function of server aggregates: mutating a skill / bestiary-boss / aggregate-
-- kill / collection input MOVES it, and there is NO client input path.
do $$
declare
  v_uid uuid := '00000000-0000-4000-c000-b3571a1c4444';
  v_base bigint; v_s bigint; v_p jsonb;
  v_has_streak boolean;
begin
  -- (a) NOT CLIENT-EXECUTABLE. hr_engine only, like hr_bestiary_of / hr_perks_of.
  if has_function_privilege('authenticated', to_regprocedure('public.hr_renown_of(uuid,int)'), 'execute')
     or has_function_privilege('anon', to_regprocedure('public.hr_renown_of(uuid,int)'), 'execute')
     or has_function_privilege('service_role', to_regprocedure('public.hr_renown_of(uuid,int)'), 'execute') then
    raise exception 'hr_renown_of is client-executable — a rankable score reachable off the engine path';
  end if;
  if not has_function_privilege('hr_engine', to_regprocedure('public.hr_renown_of(uuid,int)'), 'execute') then
    raise exception 'hr_renown_of is not executable by hr_engine — the perk channel cannot read it';
  end if;

  -- (b) NO CLIENT WRITE SURFACE on any input table. A client that could write
  --     player_progress / player_skills / player_state could forge the score.
  if exists (select 1 from pg_policies
              where schemaname='public'
                and tablename in ('player_progress','player_skills','player_state')
                and cmd <> 'SELECT') then
    raise exception 'a renown input table grew a non-SELECT policy — the score is client-forgeable';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public'
                and table_name in ('player_progress','player_skills','player_state')
                and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
                and privilege_type <> 'SELECT') then
    raise exception 'a client write grant exists on a renown input table — the score is client-forgeable';
  end if;

  -- (c) BEHAVIOUR — seed a character and prove the score responds to each
  --     server aggregate. All contributions integer (gold=0, no streak) so the
  --     expected total is exact.
  insert into auth.users (id) values (v_uid) on conflict do nothing;
  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  perform public.hr_create_character(0);
  delete from public.player_progress where user_id = v_uid;

  -- Base character: 14 skills at level 1 + hitpoints level 10 = totalLevel 24,
  -- combatLevel 3 (from 1/1/1/10/1/1/1). Score = 24*2 + 3*2 = 54.
  v_base := public.hr_renown_of(v_uid, 0);
  if v_base <> 54 then
    raise exception 'RENOWN-1(base): fresh character scored %, expected 54 (24 total-lv ×2 + 3 combat-lv ×2)', v_base;
  end if;

  -- + bossKill: 2 dragon kills (boss) and 7 slime kills (NOT boss). Only the
  --   boss counts: +2×5 = 10. The slime row is the DISCRIMINATING control.
  insert into public.player_progress (user_id, slot, kind, key, period_key, value, state) values
    (v_uid, 0, 'stat', 'ev:kill_monster:dragon', '', 2, 'active'),
    (v_uid, 0, 'stat', 'ev:kill_monster:slime',  '', 7, 'active');
  v_s := public.hr_renown_of(v_uid, 0);
  if v_s <> 54 + 10 then
    raise exception 'RENOWN-1(boss): scored %, expected 64 (base 54 + 2 boss kills ×5). '
                    'A non-zero delta from the slime rows means the is_boss filter leaked.', v_s;
  end if;

  -- + kill aggregate: ev:kill_any = 100 → +100×0.05 = 5.
  insert into public.player_progress (user_id, slot, kind, key, period_key, value, state)
    values (v_uid, 0, 'stat', 'ev:kill_any', '', 100, 'active');
  v_s := public.hr_renown_of(v_uid, 0);
  if v_s <> 69 then
    raise exception 'RENOWN-1(kill): scored %, expected 69 (64 + 100 kills ×0.05)', v_s;
  end if;

  -- + collection: two DISTINCT looted items (Slice 2 shape) → +2×3 = 6.
  insert into public.player_progress (user_id, slot, kind, key, period_key, value, state) values
    (v_uid, 0, 'stat', 'ev:loot:oak_log', '', 40, 'active'),
    (v_uid, 0, 'stat', 'ev:loot:coal',    '', 12, 'active');
  v_s := public.hr_renown_of(v_uid, 0);
  if v_s <> 75 then
    raise exception 'RENOWN-1(collection): scored %, expected 75 (69 + 2 distinct loots ×3). '
                    'Note it is DISTINCT ITEMS, not loot count — 52 loots must add 6, not 156.', v_s;
  end if;

  -- + a skill to 99 moves the score (skill99 ×100 AND its 99 levels ×2).
  update public.player_skills set xp = public.hr_xp_for_level(99)
   where user_id = v_uid and slot = 0 and skill_id = 'woodcutting';
  v_s := public.hr_renown_of(v_uid, 0);
  --   woodcutting went 1→99: totalLevel +98 (×2 = +196), skill99 +1 (×100).
  if v_s <> 75 + 196 + 100 then
    raise exception 'RENOWN-1(skill99): scored %, expected % (a 99 adds its levels ×2 AND +100)',
      v_s, 75 + 196 + 100;
  end if;

  -- streak (Slice 3): only testable if the column has merged. Either way the
  -- function must not error — the self-configuring read is asserted by the fact
  -- that every call above already ran without the column present.
  select exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='player_state'
                    and column_name='streak_days') into v_has_streak;
  if v_has_streak then
    execute format('update public.player_state set streak_days = 4 where user_id = %L and slot = 0', v_uid);
    v_s := public.hr_renown_of(v_uid, 0);
    if v_s <> 371 + 20 then
      raise exception 'RENOWN-1(streak): scored % with streak_days=4, expected % (+4×5)', v_s, 371 + 20;
    end if;
  else
    raise notice 'RENOWN-1(streak): player_state.streak_days not merged yet — self-configuring read returned 0, no error (correct).';
  end if;

  -- (d) THE PERK WIRING — hr_perks_of now feeds renownAllXp FROM this score,
  --     not from a client value. Push the score past the squire threshold (900)
  --     and assert +0.01 allXP appears; the score right now is 371 (or 391),
  --     below 900, so renownAllXp must be 0 first — the control.
  v_p := public.hr_perks_of(v_uid, 0);
  if (v_p->>'renownAllXp')::float8 <> 0 then
    raise exception 'RENOWN-1(perk control): renownAllXp is % below rank Squire — expected 0', v_p->>'renownAllXp';
  end if;
  if v_p->'sources'->>'renown' <> 'derived:hr_renown_of' then
    raise exception 'RENOWN-1(perk source): sources.renown reads % — expected derived:hr_renown_of', v_p->'sources'->>'renown';
  end if;
  -- Take four more skills to 99 to clear Squire (900). 5×99 skills ≈ totalLevel
  -- 24+5×98 = 514 → 514×2=1028 + combat 6 + skill99 5×100=500 ... well past 900.
  update public.player_skills set xp = public.hr_xp_for_level(99)
   where user_id = v_uid and slot = 0
     and skill_id in ('mining','fishing','crafting','smithing');
  v_s := public.hr_renown_of(v_uid, 0);
  if v_s < 900 then
    raise exception 'RENOWN-1(perk setup): score % did not clear Squire (900)', v_s;
  end if;
  v_p := public.hr_perks_of(v_uid, 0);
  if (v_p->>'renownAllXp')::float8 <> 0.01 then
    raise exception 'RENOWN-1(perk): renownAllXp is % at rank Squire — expected 0.01 (the derived channel is not wired)',
      v_p->>'renownAllXp';
  end if;

  delete from public.player_progress where user_id = v_uid;
  delete from public.player_skills   where user_id = v_uid;
  delete from public.player_state    where user_id = v_uid;
  delete from auth.users             where id = v_uid;
  raise notice 'RENOWN-1 PASSED: hr_engine-only projection; no client write surface; score is a pure '
               'function of skills/bestiary-boss/kills/collection (each mutation moved it, controls held); '
               'hr_perks_of feeds renownAllXp from the score at the Squire threshold.';
end $$;
