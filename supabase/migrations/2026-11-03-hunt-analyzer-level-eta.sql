-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE HUNT ANALYZER READS THE CHARACTER LEVEL'S ETA (tracker r44:
-- "Next level in" showed 00:00:00 forever). STAGED (lane/a-analyzer-next-level,
-- 2026-11-03). Game CLOSED: applies on its passing §4; Security reviews it in
-- the reopen gate.
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
-- The client's "Next level in" took the MINIMUM `eta_h` over the hero's SKILLS.
-- The server floors a skill's eta at 0 once the skill is maxed or overshot
-- (greatest(0, next - xp)), so the minimum was always 0. "Level" is not a skill
-- (CORE_MODEL.md §1: kills only, endless); its Level XP is already tallied under
-- the key `level` (the hunt fold, from the ledger meta `lx`), but
-- hr_hunt_stats_of ran that key through the SKILL maths too: a bogus entry in
-- `skills` (the capped skill table at xp 0).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- hr_hunt_stats_of RESTATED WHOLE from 2026-10-23-hunt-analyzer-v2.sql (§0
-- md5-pinned), HERO only (p_user not null, as `skills`):
--   `level`: { xp, per_hour, eta_h } — this session's Level XP (the tally's
--     `level`), per wall hour, and the hours to the next Level at that rate:
--     (hr_char_xp_for_level(hr_char_level(level_xp) + 1) - level_xp) / per_hour,
--     read from the server's own level curve and player_state.level_xp. eta_h is
--     NULL (never 0) with no Level XP this session or no wall time; the Level is
--     endless, so there is no cap branch. A real, tiny ETA is floored at 0.0001 h,
--     never 0.
--   `skills`: unchanged for every real skill; the Level's tally key no longer
--     enters it (it was never a skill).
-- Everything else in the stats object is byte-for-byte the v2 read. The BASIC
-- subset (2026-10-26-hunt-analyzer-basic.sql) is an allowlist and does not name
-- `level`, so a free character does not read it (premium, as the old ETA).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Read-only: the caller's own session tally and own level_xp; display numbers
-- computed by the server. No value moves; no table, row, grant or signature changes.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_hunt_stats_of from 2026-10-23-hunt-analyzer-v2.sql.
-- ORDER: after 2026-11-02-shop-no-supplies.sql (last in the chain; needs the core
-- rebuild's hr_char_level / hr_char_xp_for_level). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regprocedure('public.hr_char_level(bigint)') is null or to_regprocedure('public.hr_char_xp_for_level(integer)') is null
     or to_regclass('public.hunt_session_tally') is null or to_regclass('public.player_state') is null then
    raise exception 'PRECONDITION: apply 2026-10-27-core-bodies.sql first (the Level curve)'; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_hunt_stats_of(uuid[],numeric,uuid,integer)');
  if v_md5 is null then raise exception 'PRECONDITION: hr_hunt_stats_of is absent (apply 2026-10-23-hunt-analyzer-v2.sql)'; end if;
  -- the v2 pre-image, or this file's own image (a second apply is a no-op restate)
  if v_md5 <> 'fa378ecd58ec1bbfa8cde575dee30407' and v_md5 <> '03aa7bab04a1b5fa5725b2f773dd2c1d' then
    raise exception 'PIN: hr_hunt_stats_of is neither the v2 pre-image (fa378ecd...) nor this file''s (03aa7bab04a1b5fa5725b2f773dd2c1d) - md5 %: another file moved it', v_md5; end if;
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
             case when p_wall_h > 0 then round(x.gain / p_wall_h) end,
             'level', public.hr_level_from_xp(coalesce(ps.xp, 0)),
             'eta_h', case when p_wall_h > 0 and x.gain > 0 then round(greatest(0,
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
             'per_hour', case when p_wall_h > 0 then round(v_lgain / p_wall_h) end,
             'eta_h', case when p_wall_h > 0 and v_lgain > 0 and v_lcur is not null then greatest(0.0001, round(
                 (public.hr_char_xp_for_level(public.hr_char_level(v_lcur) + 1) - v_lcur)::numeric / (v_lgain / p_wall_h), 4)) end);
  end if;
  return jsonb_build_object(
    'kills', v_kills, 'xp', v_xp, 'raw_xp', v_raw,
    'gold', v_gold, 'gold_basis', 'vendor_value', 'coins', v_coins, 'loot_value', v_loot_v, 'loot', v_loot,
    -- WASTE IS THE STORE'S GOLD: an own stack is already owned (spec §3.6 #4).
    'waste', v_store, 'balance', v_gold - v_store,
    'supplies', jsonb_build_object('own', v_own, 'store', v_bought, 'store_gold', v_store),
    'dealt', v_dealt, 'taken', v_taken, 'healed', v_healed,
    'per_hour', case when p_wall_h > 0 then jsonb_build_object(
        'gold', round(v_gold / p_wall_h), 'waste', round(v_store / p_wall_h), 'balance', round((v_gold - v_store) / p_wall_h),
        'kills', round(v_kills / p_wall_h, 1),
        'xp', round(coalesce((select sum(value::numeric) from jsonb_each_text(v_xp)), 0) / p_wall_h),
        'raw_xp', round(coalesce((select sum(value::numeric) from jsonb_each_text(v_raw)), 0) / p_wall_h)) end)
    || case when p_user is not null then jsonb_build_object('skills', coalesce(v_eta, '{}'::jsonb), 'level', v_lvl) else '{}'::jsonb end;
end $$;
revoke execute on function public.hr_hunt_stats_of(uuid[], numeric, uuid, int) from public, anon, authenticated, service_role;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_uid  constant uuid := '000000c0-0000-0000-0000-00005e1a0027';
  v      jsonb;
  v_sid  uuid;
  v_role text;
  v_need bigint;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'hunt-analyzer-level-eta §2 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    v_sid := public.hr_hunt_new_session(v_uid, 0, 'mill_cellar', null, 0, null);
    -- two wall hours in (now() is fixed inside this transaction); level_xp 1000; the session tallied 600 Level XP
    -- and 300 Melee XP on a skill already past its table (its eta floors at 0: the old, untouched skill maths)
    update public.hunt_sessions set entered_at = now() - interval '2 hours' where id = v_sid;
    update public.player_state set level_xp = 1000 where user_id = v_uid and slot = 0;
    v_need := public.hr_char_xp_for_level(public.hr_char_level(1000) + 1) - 1000;
    update public.hunt_session_tally set kills = 5, xp = jsonb_build_object('level', 600, 'melee', 300) where session_id = v_sid;
    insert into public.player_skills (user_id, slot, skill_id, xp) values (v_uid, 0, 'melee', 999999999)
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    v := public.hr_hunt_analyzer_of(v_uid, 0, null)->'hero';
    -- (a) a session WITH Level XP: eta_h > 0 and = need / (600 / 2 h), read from the server's curve
    if (v->'level'->>'xp')::numeric <> 600 or (v->'level'->>'per_hour')::numeric <> 300
       or (v->'level'->>'eta_h') is null or (v->'level'->>'eta_h')::numeric <= 0 then
      raise exception 'VERIFY(a): a session with Level XP did not read a positive Level eta: %', v->'level'; end if;
    if abs((v->'level'->>'eta_h')::numeric - round(v_need / 300.0, 4)) > 0.0002 then
      raise exception 'VERIFY(a): eta_h % is not the need % over 300 an hour', v->'level'->>'eta_h', v_need; end if;
    -- (b) SKILLS UNCHANGED: the maxed skill still floors at 0; the Level's tally key is not a skill
    if (v->'skills'->'melee'->>'eta_h')::numeric is distinct from 0.0 or (v->'skills'->'melee'->>'xp')::numeric <> 300
       or v->'skills' ? 'level' then
      raise exception 'VERIFY(b): the skills block moved: %', v->'skills'; end if;
    -- (c) a session with NO Level XP: eta_h is NULL, never 0; xp 0
    update public.hunt_session_tally set xp = jsonb_build_object('melee', 300) where session_id = v_sid;
    v := public.hr_hunt_analyzer_of(v_uid, 0, null)->'hero';
    if not (v->'level' ? 'eta_h') or jsonb_typeof(v->'level'->'eta_h') <> 'null' or (v->'level'->>'xp')::numeric <> 0 then
      raise exception 'VERIFY(c): a session with no Level XP read %', v->'level'; end if;
    -- (d) the party block carries no Level read; a free character's section stays the basic block (no `level`), premium's has it
    if public.hr_hunt_analyzer_of(v_uid, 0, null)->'party' ? 'level' then raise exception 'VERIFY(d): the party block carries a Level read'; end if;
    update public.hunt_session_tally set xp = jsonb_build_object('level', 600) where session_id = v_sid;
    if public.hr_hunt_analyzer_view(v_uid, 0)->'hero' ? 'level' then raise exception 'VERIFY(d): a free character reads the Level eta'; end if;
    perform public.hr_premium_grant(v_uid, 0, now() + interval '1 day', 'probe');
    if (public.hr_hunt_analyzer_view(v_uid, 0)->'hero'->'level'->>'eta_h')::numeric is null then
      raise exception 'VERIFY(d): a premium character''s section lacks the Level eta'; end if;
    raise exception using errcode = 'HR861', message = 'hunt-analyzer-level-eta §2 complete - rolling back';
  exception when sqlstate 'HR861' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid) or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'VERIFY(e): §2 LEAKED a probe row'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_stats_of(uuid[],numeric,uuid,integer)', 'execute') then
      raise exception 'VERIFY(e): % reaches hr_hunt_stats_of', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'hunt-analyzer-level-eta: the Level''s own eta (null with no gain, never 0); skills unchanged; all green';
end $$;
