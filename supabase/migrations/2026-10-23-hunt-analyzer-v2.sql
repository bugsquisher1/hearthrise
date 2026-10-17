-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE HUNT ANALYZER, v2: SERVER-SIDE SESSION STATS (lane S1;
-- HUNT_SCREEN_SPEC §3.6, §1.5 `hunt_analyzer`; Tyler 2026-10-15/16/17).
-- STAGED. Game CLOSED: applies on its passing §4; Security reviews it in the
-- reopen gate.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- THE SERVER RECORDS EVERY SESSION STAT FOR EVERY CHARACTER (spec §3.6 #1, #5):
--   hunt_session_tally gains `dealt` {total, byAbility, byElement}, `taken`
--   {total, byMonster, byElement} and `healed` {total, bySource}: the window's
--   tally of the hero's world events (src/core/hunt/tally.js, the edge), folded
--   by the member applier (2026-10-23-hunt-world-state.sql) with
--   hr_hunt_tally_add. DISPLAY numbers only, bounded in shape and size
--   (hr_hunt_tally_ok). Every VALUE number the analyzer shows — kills, XP, coins,
--   loot, own and store supplies, the store's gold — is the C1/S1 fold of the
--   session's own LEDGER rows (supply_own / supply_buy / the accrue rows), never
--   an edge claim. It survives a closed tab and away time: it is a table.
-- ONLY A PREMIUM CHARACTER READS IT (Tyler 2026-10-17): hr_hunt_analyzer
--   (authenticated, unchanged signature) refuses premium_required for a free
--   character, and the `hunt_analyzer` envelope section is NULL for one (a null
--   REPLACES the client's copy, spec §1.5). The party panel's DPS / HPS reads
--   the `party` section, not this one (spec §5 #16), so free characters keep it.
-- THE READ (v2): the session's time, kills, XP / raw XP and each skill's next-
--   level ETA, gold (coins + loot at vendor value), waste (the STORE's gold:
--   own supplies cost nothing, spec §3.6 #4), balance, each per hour; supplies
--   own vs store; loot; dealt / taken / healed — for the HERO and for the PARTY
--   (the sum over the sessions of the same instance that overlap this one; a
--   solo hunt's party is itself).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Read-only (the fold moves no value; the read returns the caller's own rows
-- and aggregates of their instance's). Peers' per-hero rows are not returned.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_hunt_analyzer from 2026-10-21-hunt-sessions.sql (+ the settle
-- file's §4c edit); drop hr_hunt_tally_add / hr_hunt_tally_ok /
-- hr_hunt_analyzer_view and the section row. The three columns may stay.
-- ORDER: after 2026-10-23-hunt-supply-ledger.sql. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_premium_active(uuid,integer,timestamp with time zone)') is null
     or to_regclass('public.hr_state_sections') is null
     or to_regprocedure('public.hr_hunt_supply_of(uuid,integer,integer)') is null then
    raise exception 'PRECONDITION: apply 2026-10-23-character-premium.sql and 2026-10-23-hunt-supply-ledger.sql first';
  end if;
end $mig$;

-- ── §1 THE THREE DISPLAY COLUMNS ─────────────────────────────────────────────
alter table public.hunt_session_tally add column if not exists dealt  jsonb not null default '{}'::jsonb;
alter table public.hunt_session_tally add column if not exists taken  jsonb not null default '{}'::jsonb;
alter table public.hunt_session_tally add column if not exists healed jsonb not null default '{}'::jsonb;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'hunt_session_tally_analyzer_ck'
                   and conrelid = 'public.hunt_session_tally'::regclass) then
    alter table public.hunt_session_tally add constraint hunt_session_tally_analyzer_ck
      check (jsonb_typeof(dealt) = 'object' and jsonb_typeof(taken) = 'object' and jsonb_typeof(healed) = 'object'
             and octet_length(dealt::text) + octet_length(taken::text) + octet_length(healed::text) <= 8192);
  end if;
end $mig$;

-- Is `p` a tally part: { total: n, <map>: { key: n } … } with whole n >= 0,
-- at most 32 keys a map and keys [a-z0-9_]{1,64}? The shape tally.js emits.
create or replace function public.hr_hunt_tally_ok(p jsonb, p_maps text[])
returns boolean language sql immutable set search_path = public, pg_catalog as $$
  select p is not null and jsonb_typeof(p) = 'object'
     and not exists (select 1 from jsonb_object_keys(p) k where k <> 'total' and k <> all (p_maps))
     and (not (p ? 'total') or (jsonb_typeof(p->'total') = 'number' and (p->>'total') ~ '^[0-9]{1,12}$'))
     and not exists (select 1 from unnest(p_maps) m
                      where p ? m and (jsonb_typeof(p->m) <> 'object'
                        or (select count(*) from jsonb_object_keys(p->m)) > 32
                        or exists (select 1 from jsonb_each(p->m) e
                                    where e.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(e.value) <> 'number'
                                       or (e.value #>> '{}') !~ '^[0-9]{1,12}$')))
$$;
-- Two tally parts, added key by key one level down.
create or replace function public.hr_hunt_tally_add(p_a jsonb, p_b jsonb)
returns jsonb language sql immutable set search_path = public, pg_catalog as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
    select k, case when every(jsonb_typeof(x) = 'number')
                   then to_jsonb(sum((x #>> '{}')::numeric) filter (where jsonb_typeof(x) = 'number'))
                   else public.hr_jsonb_add(
                          (array_agg(x) filter (where jsonb_typeof(x) = 'object'))[1],
                          (array_agg(x) filter (where jsonb_typeof(x) = 'object'))[2]) end as v
      from (select key as k, value as x from jsonb_each(coalesce(p_a, '{}'::jsonb))
            union all
            select key, value from jsonb_each(coalesce(p_b, '{}'::jsonb))) u
     group by k) t
$$;
revoke execute on function public.hr_hunt_tally_add(jsonb, jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.hr_hunt_tally_ok(jsonb, text[]) from public, anon, authenticated, service_role;

-- ── §2 THE READ, v2 ──────────────────────────────────────────────────────────
-- The stats of one session row set: the shared shape for the hero and the party.
create or replace function public.hr_hunt_stats_of(p_sessions uuid[], p_wall_h numeric, p_user uuid, p_slot int)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare
  v_kills bigint; v_coins bigint; v_loot_v bigint; v_store bigint; v_gold bigint;
  v_xp jsonb; v_raw jsonb; v_loot jsonb; v_own jsonb; v_bought jsonb;
  v_dealt jsonb := '{}'::jsonb; v_taken jsonb := '{}'::jsonb; v_healed jsonb := '{}'::jsonb;
  v_t record; v_eta jsonb;
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
      from (select key, value::numeric as gain from jsonb_each_text(v_xp)) x
      left join public.player_skills ps on ps.user_id = p_user and ps.slot = p_slot and ps.skill_id = x.key;
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
    || case when p_user is not null then jsonb_build_object('skills', coalesce(v_eta, '{}'::jsonb)) else '{}'::jsonb end;
end $$;
revoke execute on function public.hr_hunt_stats_of(uuid[], numeric, uuid, int) from public, anon, authenticated, service_role;

-- The analyzer of (user, slot, session): null session = the newest.
create or replace function public.hr_hunt_analyzer_of(p_user uuid, p_slot int, p_session uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_s public.hunt_sessions%rowtype;
  v_wall_h numeric; v_hunt_h numeric;
  v_party uuid[];
begin
  select * into v_s from public.hunt_sessions s
   where s.user_id = p_user and s.slot = p_slot and (p_session is null or s.id = p_session)
   order by s.entered_at desc, s.id limit 1;
  if not found then return null; end if;
  v_wall_h := greatest(extract(epoch from (coalesce(v_s.ended_at, now()) - v_s.entered_at)) / 3600.0, 0);
  v_hunt_h := greatest(extract(epoch from (least(coalesce(v_s.ended_at, v_s.settled_to), v_s.settled_to) - v_s.hunt_from)) / 3600.0, 0);
  -- THE PARTY: every session of this instance whose hunt overlaps this one.
  select array_agg(h.id order by h.id) into v_party from public.hunt_sessions h
   where h.instance_id = v_s.instance_id
     and h.entered_at <= coalesce(v_s.ended_at, now())
     and coalesce(h.ended_at, now()) >= v_s.entered_at;
  return jsonb_build_object(
    'session', public.hr_hunt_view(v_s.id),
    'wall_ms', floor(v_wall_h * 3600000)::bigint, 'hunt_ms', floor(v_hunt_h * 3600000)::bigint,
    'hero', public.hr_hunt_stats_of(array[v_s.id], v_wall_h, p_user, p_slot),
    'party', public.hr_hunt_stats_of(coalesce(v_party, array[v_s.id]), v_wall_h, null, null)
             || jsonb_build_object('heroes', coalesce(array_length(v_party, 1), 1)),
    'bag', coalesce((select jsonb_agg(jsonb_build_object('item', b.item_id, 'loaded', b.qty_loaded, 'left', b.qty_left,
             'used', b.qty_loaded - b.qty_left, 'essential', b.essential, 'value', coalesce(v.unit, 0),
             'lasts_h', case when v_s.ended_at is null and v_hunt_h > 0 and b.qty_loaded > b.qty_left
                             then round(b.qty_left / ((b.qty_loaded - b.qty_left) / v_hunt_h), 2) end)
             order by b.item_id)
           from public.hunt_bag b left join public.hr_hunt_vendor_value v on v.item_id = b.item_id
          where b.session_id = v_s.id), '[]'::jsonb),
    'unseen', (select count(*) from public.hunt_session_events e where e.session_id = v_s.id and e.id > v_s.seen_event_id),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'session', e.session_id, 'type', e.type,
                          'at', e.at, 'data', e.data) order by e.id)
                        from (select x.* from public.hunt_sessions h join public.hunt_session_events x on x.session_id = h.id
                               where h.user_id = p_user and h.slot = p_slot
                               order by x.id desc limit 50) e), '[]'::jsonb));
end $$;
revoke execute on function public.hr_hunt_analyzer_of(uuid, int, uuid) from public, anon, authenticated, service_role;

-- THE CLIENT VERB (unchanged signature and grants): premium-gated.
create or replace function public.hr_hunt_analyzer(p_slot int, p_session uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid uuid := auth.uid();
  v_a   jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('hunt_read') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  -- ONLY A PREMIUM CHARACTER SEES THE ANALYZER (Tyler 2026-10-17); the server records it regardless.
  if not public.hr_premium_active(v_uid, p_slot, now()) then
    return public.hr_note_rejection('hunt_analyzer', p_slot, jsonb_build_object('ok', false, 'error', 'premium_required')); end if;
  v_a := public.hr_hunt_analyzer_of(v_uid, p_slot, p_session);
  if v_a is null then return jsonb_build_object('ok', false, 'error', 'no_hunt'); end if;
  return jsonb_build_object('ok', true) || v_a;
end $$;
revoke execute on function public.hr_hunt_analyzer(int, uuid) from public;
revoke execute on function public.hr_hunt_analyzer(int, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_analyzer(int, uuid) to authenticated;
update public.hr_client_rpc_baseline
   set note = 'restated 2026-10-23 (lane S1, analyzer v2): premium characters only (premium_required); hero and party session stats from the ledger fold; read-only'
 where proname = 'hr_hunt_analyzer' and grantee = 'authenticated';

-- ── §3 THE `hunt_analyzer` SECTION: null for a free character or no hunt ────
create or replace function public.hr_hunt_analyzer_view(p_user uuid, p_slot int)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  select case when public.hr_premium_active(p_user, p_slot, now()) then public.hr_hunt_analyzer_of(p_user, p_slot, null) end
$$;
revoke execute on function public.hr_hunt_analyzer_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('hunt_analyzer', 'hr_hunt_analyzer_view', '2026-10-23-hunt-analyzer-v2.sql: the newest session''s stats, hero and party; NULL for a free character')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_uid constant uuid := '000000c0-0000-0000-0000-00005e1a0004';
  v     jsonb;
  v_sid uuid;
  v_role text;
begin
  -- (a) the tally parts: add and shape.
  v := public.hr_hunt_tally_add('{"total":3,"byAbility":{"basic":2,"cleave":1}}'::jsonb, '{"total":4,"byAbility":{"basic":4}}'::jsonb);
  if v <> '{"total":7,"byAbility":{"basic":6,"cleave":1}}'::jsonb then raise exception 'VERIFY(a): tally add is %', v; end if;
  if not public.hr_hunt_tally_ok('{"total":3,"byAbility":{"basic":3}}'::jsonb, array['byAbility', 'byElement'])
     or public.hr_hunt_tally_ok('{"total":-1}'::jsonb, array['byAbility'])
     or public.hr_hunt_tally_ok('{"total":1,"evil":{"x":1}}'::jsonb, array['byAbility'])
     or public.hr_hunt_tally_ok('{"byAbility":{"Bad Key":1}}'::jsonb, array['byAbility']) then
    raise exception 'VERIFY(a): hr_hunt_tally_ok admits or refuses the wrong shape'; end if;
  -- (b) EXECUTED: a free character reads nothing; a premium one reads hero + party.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'hunt-analyzer-v2 §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): hr_create_character refused: %', v; end if;
    v_sid := public.hr_hunt_new_session(v_uid, 0, 'mill_cellar', null, 0, 3, null);
    update public.hunt_session_tally set kills = 5, coins = 40, supply_gold = 12, supplies = '{"cooked_shrimp": 3}'::jsonb,
           bought = '{"basic_bread": 2}'::jsonb, dealt = '{"total": 90, "byAbility": {"basic": 90}}'::jsonb
     where session_id = v_sid;
    v := public.hr_hunt_analyzer(0, null);
    if v->>'error' is distinct from 'premium_required' then raise exception 'VERIFY(b): a free character read the analyzer: %', v; end if;
    if public.hr_state_of(v_uid, 0)->'hunt_analyzer' <> 'null'::jsonb then
      raise exception 'VERIFY(b): a free character''s envelope carries an analyzer'; end if;
    perform public.hr_premium_grant(v_uid, 0, now() + interval '1 day', 'probe');
    v := public.hr_hunt_analyzer(0, null);
    if coalesce(v->>'ok', '') <> 'true' or (v->'hero'->>'kills')::int <> 5 or (v->'hero'->>'waste')::int <> 12
       or v->'hero'->'supplies'->'own' <> '{"cooked_shrimp": 3}'::jsonb or v->'hero'->'supplies'->'store' <> '{"basic_bread": 2}'::jsonb
       or (v->'hero'->'dealt'->>'total')::int <> 90 or (v->'party'->>'kills')::int <> 5 or (v->'party'->>'heroes')::int <> 1 then
      raise exception 'VERIFY(b): the premium analyzer read is %', v; end if;
    if public.hr_state_of(v_uid, 0)->'hunt_analyzer'->'hero'->>'kills' <> '5' then
      raise exception 'VERIFY(b): the premium envelope does not carry the analyzer'; end if;
    raise exception using errcode = 'HR859', message = 'hunt-analyzer-v2 §4 complete - rolling back';
  exception when sqlstate 'HR859' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid) or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'VERIFY(c): §4 LEAKED a probe row'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_analyzer_of(uuid,integer,uuid)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_analyzer_view(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_stats_of(uuid[],numeric,uuid,integer)', 'execute')
       or has_table_privilege(v_role, 'public.hunt_session_tally', 'insert,update,delete') then
      raise exception 'VERIFY(c): % reaches an analyzer internal or writes the tally', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'hunt-analyzer-v2: every stat recorded for every character, read by premium characters only, hero + party from the ledger fold; all green';
end $$;
