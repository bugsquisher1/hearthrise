-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — LEVEL XP AND TRAINING XP APART IN EVERY PER-HOUR FIGURE. STAGED,
-- NOT APPLIED (lane/b-xp-split, game-designer, 2026-10-22). Game CLOSED: applies
-- on its passing §3; Security reviews it in the reopen gate.
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
-- Tyler 2026-10-22 (two party heroes with identical Level XP read different "XP
-- per hour"): "divvy up level exp vs training exp, so it's clear what's
-- happening". The analyzer's per_hour.xp summed the WHOLE tally map: the Level's
-- XP plus every combat skill's (Melee, Ranged, Magic, Defense), which differ by
-- use. The hunt picker's personal best (hunt_bests.xp_h, 2026-11-04-hunt-bests.sql)
-- folded that same sum.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 hr_hunt_stats_of RESTATED WHOLE from 2026-11-06-hunt-analyzer-min-window.sql
--    (§0 md5-pinned to the landed 2cc45f39be89339bee0c8906df6fdd4f, new image
--    a2937abe16ef2593c4bb4b29f3736e40). ONE change, in per_hour: `xp` and `raw_xp`
--    are the LEVEL's (the tally key level); NEW `training_xp` is every other key
--    together (the combat skills). Totals (the xp / raw_xp maps), the rate window,
--    the Level and skill blocks: unchanged. The basic subset
--    (hr_hunt_analyzer_basic, 2026-11-04 image) passes per_hour.xp only, so a free
--    character reads Level XP per hour and no training figure (training XP is the
--    premium analyzer's Training tab, Tyler 2026-10-22).
-- §2 hunt_bests RE-FOLDED: every row is deleted and every finished session of
--    hr_hunt_best_min() or more folds again through hr_hunt_best_fold, which now
--    reads Level XP per hour. Needed because the fold keeps greatest(): a best that
--    counted training XP would never be beaten by an honest Level figure. The rows
--    are a display aggregate of server tallies (no value, nothing gates on them);
--    a best whose session hr_hunt_open_session already pruned (beyond the last 20
--    a character keeps) is not re-made. The table went live 2026-10-21.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Read-only figures and a display aggregate: no value moves; no grant, table,
-- signature or client RPC changes.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_hunt_stats_of from 2026-11-06-hunt-analyzer-min-window.sql, then
-- delete from hunt_bests and run 2026-11-04-hunt-bests.sql §4's backfill.
-- ORDER: after 2026-11-09-armour-class-catalogue.generated.sql (last in the chain).
-- No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.hunt_bests') is null or to_regprocedure('public.hr_hunt_best_fold(uuid)') is null then
    raise exception 'PRECONDITION: apply 2026-11-04-hunt-bests.sql first'; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_hunt_stats_of(uuid[],numeric,uuid,integer)');
  if v_md5 is null then raise exception 'PRECONDITION: hr_hunt_stats_of is absent (apply 2026-10-23-hunt-analyzer-v2.sql)'; end if;
  -- the 11-06 landed pre-image, or this file's own image (a second apply is a no-op restate)
  if v_md5 <> '2cc45f39be89339bee0c8906df6fdd4f' and v_md5 <> 'a2937abe16ef2593c4bb4b29f3736e40' then
    raise exception 'PIN: hr_hunt_stats_of is neither the 11-06 pre-image (2cc45f39...) nor this file''s (a2937abe16ef2593c4bb4b29f3736e40) - md5 %: another file moved it', v_md5; end if;
end $mig$;

-- ── §1 THE READ ──────────────────────────────────────────────────────────────
create or replace function public.hr_hunt_stats_of(p_sessions uuid[], p_wall_h numeric, p_user uuid, p_slot int)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare
  v_kills bigint; v_coins bigint; v_loot_v bigint; v_store bigint; v_gold bigint;
  v_xp jsonb; v_raw jsonb; v_loot jsonb; v_own jsonb; v_bought jsonb;
  v_dealt jsonb := '{}'::jsonb; v_taken jsonb := '{}'::jsonb; v_healed jsonb := '{}'::jsonb;
  v_t record; v_eta jsonb;
  v_lgain numeric; v_lcur bigint; v_lvl jsonb;
  -- THE RATE WINDOW: no rate (per_hour, eta_h) until 10 minutes of wall time.
  v_rated boolean := p_wall_h * 60 >= 10;
begin
  select coalesce(sum(t.kills), 0), coalesce(sum(t.coins), 0), coalesce(sum(t.supply_gold), 0)
    into v_kills, v_coins, v_store
    from public.hunt_session_tally t where t.session_id = any (p_sessions);
  v_xp := '{}'::jsonb; v_raw := '{}'::jsonb; v_loot := '{}'::jsonb; v_own := '{}'::jsonb; v_bought := '{}'::jsonb;
  for v_t in select * from public.hunt_session_tally t where t.session_id = any (p_sessions) order by t.session_id loop
    v_xp := public.hr_jsonb_add(v_xp, v_t.xp); v_raw := public.hr_jsonb_add(v_raw, v_t.raw_xp);
    v_loot := public.hr_jsonb_add(v_loot, v_t.loot); v_own := public.hr_jsonb_add(v_own, v_t.supplies);
    v_bought := public.hr_jsonb_add(v_bought, v_t.bought);
    v_dealt := public.hr_hunt_tally_add(v_dealt, v_t.dealt); v_taken := public.hr_hunt_tally_add(v_taken, v_t.taken);
    v_healed := public.hr_hunt_tally_add(v_healed, v_t.healed);
  end loop;
  select coalesce(sum(floor(l.value::numeric) * v.unit), 0)::bigint into v_loot_v
    from jsonb_each_text(v_loot) l join public.hr_hunt_vendor_value v on v.item_id = l.key;
  v_gold := v_coins + v_loot_v;
  -- Next-level ETA for the hero's own skills (the party has no level).
  if p_user is not null then
    select coalesce(jsonb_object_agg(x.key, jsonb_build_object('xp', x.gain, 'per_hour',
             case when v_rated then round(x.gain / p_wall_h) end,
             'level', public.hr_level_from_xp(coalesce(ps.xp, 0)),
             'eta_h', case when v_rated and x.gain > 0 then round(greatest(0,
                 coalesce((select xt.xp from public.hr_xp_table xt
                            where xt.level = public.hr_level_from_xp(coalesce(ps.xp, 0)) + 1), 0) - coalesce(ps.xp, 0))
                 / (x.gain / p_wall_h), 2) end)), '{}'::jsonb)
      into v_eta
      from (select key, value::numeric as gain from jsonb_each_text(v_xp) where key <> 'level') x
      left join public.player_skills ps on ps.user_id = p_user and ps.slot = p_slot and ps.skill_id = x.key;
    -- THE CHARACTER LEVEL's own read (Level is not a skill: the tally carries its XP under `level`).
    -- eta_h = the XP to the next Level / this session's Level XP an hour; NULL (never 0) with no gain
    -- or no wall time. The need is the server's level curve at the server's own level_xp.
    v_lgain := coalesce((v_xp->>'level')::numeric, 0);
    select ps.level_xp into v_lcur from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
    v_lvl := jsonb_build_object('xp', v_lgain,
             'per_hour', case when v_rated then round(v_lgain / p_wall_h) end,
             'eta_h', case when v_rated and v_lgain > 0 and v_lcur is not null then greatest(0.0001, round(
                 (public.hr_char_xp_for_level(public.hr_char_level(v_lcur) + 1) - v_lcur)::numeric / (v_lgain / p_wall_h), 4)) end);
  end if;
  return jsonb_build_object(
    'kills', v_kills, 'xp', v_xp, 'raw_xp', v_raw,
    'gold', v_gold, 'gold_basis', 'vendor_value', 'coins', v_coins, 'loot_value', v_loot_v, 'loot', v_loot,
    -- WASTE IS THE STORE'S GOLD: an own stack is already owned (spec §3.6 #4).
    'waste', v_store, 'balance', v_gold - v_store,
    'supplies', jsonb_build_object('own', v_own, 'store', v_bought, 'store_gold', v_store),
    'dealt', v_dealt, 'taken', v_taken, 'healed', v_healed,
    'per_hour', case when v_rated then jsonb_build_object(
        'gold', round(v_gold / p_wall_h), 'waste', round(v_store / p_wall_h), 'balance', round((v_gold - v_store) / p_wall_h),
        'kills', round(v_kills / p_wall_h, 1),
        -- LEVEL XP AND TRAINING XP APART (2026-11-10-hunt-xp-split.sql): xp and raw_xp are the Level's
        -- (the tally key level), training_xp the combat skills' together (every other key).
        'xp', round(coalesce((v_xp->>'level')::numeric, 0) / p_wall_h),
        'raw_xp', round(coalesce((v_raw->>'level')::numeric, 0) / p_wall_h),
        'training_xp', round(coalesce((select sum(value::numeric) from jsonb_each_text(v_xp) where key <> 'level'), 0) / p_wall_h)) end)
    || case when p_user is not null then jsonb_build_object('skills', coalesce(v_eta, '{}'::jsonb), 'level', v_lvl) else '{}'::jsonb end;
end $$;
revoke execute on function public.hr_hunt_stats_of(uuid[], numeric, uuid, int) from public, anon, authenticated, service_role;

-- ── §2 THE BESTS, RE-FOLDED ON LEVEL XP PER HOUR (idempotent: the same sessions fold to the same rows) ──
do $mig$
declare v_id uuid;
begin
  delete from public.hunt_bests;
  for v_id in select h.id from public.hunt_sessions h
               where h.ended_at is not null and h.ended_at - h.entered_at >= public.hr_hunt_best_min()
               order by h.ended_at, h.id loop
    perform public.hr_hunt_best_fold(v_id);
  end loop;
end $mig$;

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_uid  constant uuid := '000000c0-0000-0000-0000-00005e1a0110';
  v      jsonb;
  v_sid  uuid;
  v_role text;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'hunt-xp-split §3 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    -- The real end path: the deferred trigger, fired here at once instead of at the probe's (never reached) commit.
    set constraints public.hr_hunt_best_on_end immediate;
    -- two wall hours: 600 Level XP (raw 500), 300 Melee and 100 Defense XP
    v_sid := public.hr_hunt_new_session(v_uid, 0, 'mill_cellar', null, 0, null);
    update public.hunt_sessions set entered_at = now() - interval '2 hours' where id = v_sid;
    update public.hunt_session_tally set kills = 5, xp = '{"level": 600, "melee": 300, "defense": 100}'::jsonb,
      raw_xp = '{"level": 500, "melee": 300, "defense": 100}'::jsonb where session_id = v_sid;
    v := public.hr_hunt_analyzer_of(v_uid, 0, v_sid);
    -- (a) per hour: Level XP 300, raw Level XP 250, training XP 200; the totals map untouched
    if (v->'hero'->'per_hour'->>'xp')::numeric <> 300 or (v->'hero'->'per_hour'->>'raw_xp')::numeric <> 250
       or (v->'hero'->'per_hour'->>'training_xp')::numeric <> 200
       or v->'hero'->'xp' <> '{"level": 600, "melee": 300, "defense": 100}'::jsonb then
      raise exception 'VERIFY(a): the hero per hour is %, xp %', v->'hero'->'per_hour', v->'hero'->'xp'; end if;
    -- (b) the party block splits the same way; the Level block is unchanged
    if (v->'party'->'per_hour'->>'xp')::numeric <> 300 or (v->'party'->'per_hour'->>'training_xp')::numeric <> 200
       or (v->'hero'->'level'->>'per_hour')::numeric <> 300 then
      raise exception 'VERIFY(b): party per hour %, Level block %', v->'party'->'per_hour', v->'hero'->'level'; end if;
    -- (c) a free character's basic subset: Level XP per hour, no training or raw figure
    v := public.hr_hunt_analyzer_basic(v);
    if (v->'hero'->'per_hour'->>'xp')::numeric <> 300 or v->'hero'->'per_hour' ? 'training_xp' or v->'hero'->'per_hour' ? 'raw_xp' then
      raise exception 'VERIFY(c): the basic per hour is %', v->'hero'->'per_hour'; end if;
    -- (d) the personal best folds Level XP per hour, never the training sum
    update public.hunt_sessions set ended_at = now(), end_reason = 'left' where id = v_sid;
    if not exists (select 1 from public.hunt_bests where user_id = v_uid and hunt_id = 'mill_cellar' and mode = 'solo' and xp_h = 300) then
      raise exception 'VERIFY(d): the best is %', (select jsonb_agg(to_jsonb(b)) from public.hunt_bests b where user_id = v_uid); end if;
    -- (e) a session with training XP and no kills: Level XP 0 an hour, training read
    v_sid := public.hr_hunt_new_session(v_uid, 0, 'mill_cellar', null, 0, null);
    update public.hunt_sessions set entered_at = now() - interval '1 hour' where id = v_sid;
    update public.hunt_session_tally set xp = '{"defense": 50}'::jsonb where session_id = v_sid;
    v := public.hr_hunt_analyzer_of(v_uid, 0, v_sid)->'hero'->'per_hour';
    if (v->>'xp')::numeric <> 0 or (v->>'training_xp')::numeric <> 50 or (v->>'raw_xp')::numeric <> 0 then
      raise exception 'VERIFY(e): a session with no Level XP read %', v; end if;
    raise exception using errcode = 'HR877', message = 'hunt-xp-split §3 complete - rolling back';
  exception when sqlstate 'HR877' then
    null;
  end;
  set constraints public.hr_hunt_best_on_end deferred;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid) or exists (select 1 from auth.users where id = v_uid)
     or exists (select 1 from public.hunt_bests where user_id = v_uid) then
    raise exception 'VERIFY(f): §3 LEAKED a probe row'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_stats_of(uuid[],numeric,uuid,integer)', 'execute') then
      raise exception 'VERIFY(f): % reaches hr_hunt_stats_of', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'hunt-xp-split: per_hour xp and raw_xp are Level XP, training_xp the combat skills, the bests re-folded on Level XP; all green';
end $$;
