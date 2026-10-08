-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-08-renown-throne-room.sql — A PRESTIGE SINK NEVER COSTS PRESTIGE.
--
-- ⚠ STAGED, NOT APPLIED. RANKED SURFACE (renown → renown_high → ranks, perks):
--   Security GO before the Coordinator applies it (tools/apply-migration.mjs).
--   Apply AFTER 2026-10-08-throne-room.sql (§0 refuses otherwise).
--
-- THE DEFECT (Security residual on lane econ-crew-and-sink, 2026-10-08):
-- hr_renown_of scores goldLog × 8 on HELD gold. Furnishing the Throne Room
-- moves gold out of player_state.gold, so buying the whole room LOWERED the
-- live renown of a 300M-gold castle owner from 101 to 94. A prestige sink that
-- costs prestige is a sink nobody should buy.
--
-- THE RULING (Game Designer): Throne Room spend counts as held gold in the
-- renown formula. The goldLog input becomes held gold + the catalogue price of
-- every piece the SERVER says the character owns. A purchase moves gold 1:1
-- between the two, so the term is unchanged by buying — never lower, never a
-- mint (§4 asserts equality, both ways).
--
-- WHAT IS RESTATED: hr_renown_of from 2026-09-02-renown-kill-faucet.sql,
-- VERBATIM except (1) two CTEs `tr`/`gw` and (2) the goldLog term reading
-- `gw.g` instead of `ps.gold`. The kill discounts (R5), every weight and the
-- two declared zeroes are untouched — diff two hunks, not a function.
-- No client input enters: the rung is player_progress (written only by
-- hr_unlock_buy), the prices are hr_unlock_offers (a generated catalogue).
-- ACL unchanged: engine-only.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS ─────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.hr_renown_of(uuid,int)') is null then
    raise exception 'hr_renown_of is absent — apply 2026-09-02-renown-kill-faucet.sql first';
  end if;
  if position('ev:kill_credited_any' in pg_get_functiondef('public.hr_renown_of(uuid,int)'::regprocedure)) = 0 then
    raise exception 'the live hr_renown_of lacks the R5 kill discount — this restatement is from '
                    '2026-09-02-renown-kill-faucet.sql and must not land on an older body';
  end if;
  if (select count(*) from public.hr_unlock_offers where source = 'gen-throne-room') <> 30 then
    raise exception 'the Throne Room catalogue is absent — apply 2026-10-08-throne-room.sql first';
  end if;
end $$;

-- ── 1. hr_renown_of — 2026-09-02 body, goldLog reads held + Throne Room gold ─
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
  ),
  -- 2026-10-08: the gold FURNISHED INTO THE THRONE ROOM, priced from the
  -- server's own catalogue (hr_unlock_offers, source gen-throne-room) up to the
  -- server's own rung (player_progress unlock 'throne_room'). 0 with no rung.
  tr as (
    select coalesce(sum(o.gold), 0)::float8 as spent
      from public.hr_unlock_offers o
     where o.source = 'gen-throne-room' and o.unlock_id = 'throne_room'
       and o.refusal is null
       and o.value <= coalesce((select pp.value from public.player_progress pp
                                 where pp.user_id = p_user and pp.slot = coalesce(p_slot, 0)
                                   and pp.kind = 'unlock' and pp.key = 'throne_room'
                                   and pp.period_key = ''), 0)
  ),
  -- goldLog's input: HELD gold + Throne Room gold. Buying a piece moves gold
  -- from one to the other 1:1, so a prestige sink can never cost prestige.
  gw as (
    select coalesce((select gold from ps), 0)::float8 + (select spent from tr) as g
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
      -- ⚠ R5: MINUS the client-credited part. hr_credit_kills adds to
      --   ev:kill_any and records the same delta under ev:kill_credited_any, so
      --   what remains is what the SERVER simulated. greatest(0, …) because the
      --   two rows are written by one statement pair but read independently.
    + greatest(0::bigint,
        coalesce((select value from public.player_progress
                   where user_id = p_user and slot = coalesce(p_slot, 0)
                     and kind = 'stat' and period_key = '' and key = 'ev:kill_any'), 0)
      - coalesce((select value from public.player_progress
                   where user_id = p_user and slot = coalesce(p_slot, 0)
                     and kind = 'stat' and period_key = '' and key = 'ev:kill_credited_any'), 0)
      )::float8
        * 0.05::float8
      -- bossKill × 5 (Slice 1 per-monster kills, filtered to is_boss monsters)
      -- ⚠ R5: PER MONSTER, minus that monster's credited count. The discount has
      --   to be per-id and not an aggregate, because only is_boss ids are scored
      --   here — subtracting a global credited total would let credits against a
      --   NON-boss target erase honest boss renown.
    + coalesce((select sum(greatest(0::bigint, pp.value - coalesce(cr.value, 0)))
                  from public.player_progress pp
                  join public.hr_activities a
                    on a.kind = 'combat' and a.is_boss
                   and a.activity_id = substring(pp.key from 17)
                  left join public.player_progress cr
                    on cr.user_id = pp.user_id and cr.slot = pp.slot
                   and cr.kind = 'stat' and cr.period_key = ''
                   and cr.key = 'ev:kill_credited:' || substring(pp.key from 17)
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
      -- PLUS the gold furnished into the Throne Room (2026-10-08, cte gw)
    + case when (select g from gw) > 1000
           then (ln((select g from gw)) / ln(10::float8) - 3::float8) * 8::float8
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

-- ── 2. §4 SELF-CHECK — executed, rolled back, zero residue ───────────────
do $$
declare
  v_uid  uuid := '00000000-0000-4000-8000-0000000c4a18';
  v_r    jsonb; v_ver bigint; v_n int;
  v_r0 bigint; v_prev bigint; v_cur bigint; v_ctl bigint;
begin
  -- (a) still engine-only, and the R5 discount survived the restatement.
  if has_function_privilege('authenticated', 'public.hr_renown_of(uuid,int)', 'execute')
     or has_function_privilege('anon', 'public.hr_renown_of(uuid,int)', 'execute')
     or has_function_privilege('service_role', 'public.hr_renown_of(uuid,int)', 'execute')
     or not has_function_privilege('hr_engine', 'public.hr_renown_of(uuid,int)', 'execute') then
    raise exception 'renown-throne §4(a): hr_renown_of ACL moved';
  end if;
  if position('ev:kill_credited_any' in pg_get_functiondef('public.hr_renown_of(uuid,int)'::regprocedure)) = 0
     or position('ev:kill_credited:' in pg_get_functiondef('public.hr_renown_of(uuid,int)'::regprocedure)) = 0 then
    raise exception 'renown-throne §4(a): the R5 kill discount was lost in the restatement';
  end if;

  begin
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if coalesce(v_r->>'ok', v_r->>'created', 'false') <> 'true' then
      raise exception 'renown-throne §4: no probe character: %', v_r;
    end if;
    update public.player_state set gold = 300000000 where user_id = v_uid and slot = 0;
    insert into public.player_progress (user_id, slot, kind, key, period_key, value)
      values (v_uid, 0, 'unlock', 'property:castle', '', 5);
    v_r0 := public.hr_renown_of(v_uid, 0);

    -- (c) CONTROL — the goldLog term is LIVE: the same character holding 1M
    --     instead of 300M scores lower (8 x log10(300) ≈ 19.8 renown). Without
    --     this, (b) would also pass on a formula that simply stopped scoring gold.
    update public.player_state set gold = 1000000 where user_id = v_uid and slot = 0;
    v_ctl := public.hr_renown_of(v_uid, 0);
    if not (v_ctl < v_r0 - 15) then
      raise exception 'renown-throne §4(c): 300M -> 1M held moved renown only % -> % — the goldLog term is dead', v_r0, v_ctl;
    end if;
    update public.player_state set gold = 300000000 where user_id = v_uid and slot = 0;

    -- (b) THE RULING: buying the WHOLE room, piece by piece, never lowers renown
    --     at any step, and ends exactly where it started (no mint either).
    v_prev := v_r0;
    for v_n in 1..30 loop
      select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
      v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), 'throne_room.' || v_n);
      if coalesce(v_r->>'ok', 'false') <> 'true' then
        raise exception 'renown-throne §4(b): throne_room.% refused (%)', v_n, v_r;
      end if;
      v_cur := public.hr_renown_of(v_uid, 0);
      if v_cur < v_prev then
        raise exception 'renown-throne §4(b): furnishing piece % LOWERED renown % -> %', v_n, v_prev, v_cur;
      end if;
      v_prev := v_cur;
    end loop;
    if v_cur <> v_r0 then
      raise exception 'renown-throne §4(b): the full room moved renown % -> % (expected unchanged)', v_r0, v_cur;
    end if;

    raise exception using errcode = 'HRB20', message = 'renown-throne §4 complete — rolling back';
  exception when sqlstate 'HRB20' then
    null;
  end;

  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'renown-throne §4 LEAKED a probe row';
  end if;
  raise notice 'RENOWN x THRONE ROOM OK — buying all 30 pieces never lowers renown and leaves it '
               'exactly unchanged; a plain gold debit still lowers it; R5 discount and ACL intact.';
end $$;
