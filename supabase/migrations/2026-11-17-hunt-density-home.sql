-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — DENSITY HAS ITS OWN HOME: THE HERO'S PICK PER GROUND (lane
-- c-density-home, systems-engineer, 2026-10-22). STAGED, NOT APPLIED. Game
-- CLOSED: applies on its passing §7; part of the reopen review.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- Rulings H4 (Tyler 2026-10-20) and the presets designer's 2026-10-22 note:
-- density (how many monsters one pull brings) is chosen with the hunt on the
-- picker and REMEMBERED PER GROUND; in a party the leader chooses and the
-- members see it read-only; it is NOT an action-set setting. It lived in
-- player_action_sets.options (one pick per preset, carried to every ground),
-- so changing a setup changed the density and a pick on one ground moved
-- every other. The hunt cards already ask per ground ("Density: Set by
-- Fingerguns: 8 each").
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 hunt_density                 NEW. One row per (character, ground): the pick,
--    0 (as built) .. the ground's hr_hunt_grounds.density_max (largest party
--    size; 2026-11-17-hunt-sessions-catalogue.generated.sql, from hunt-grounds.js
--    densityFor). No row = 0. Server-only: RLS on, NO policy, no client grant
--    (stricter than own-rows: the client reads it only through the envelope);
--    FK to player_state, on delete cascade.
-- §2 hr_hunt_density_view(user, slot)  NEW, internal: { <hunt_id>: pick } of one
--    character, the `hunt_density` envelope section and the party's leader picks.
--    hr_hunt_density_set(p_slot, p_hunt, p_density, p_idem)  NEW client intent:
--    the caller's own row only (auth.uid()), keyed (intent replay), rate-gated
--    ('hunt'); refuses an unknown or groundless hunt (bad_hunt), a pick outside
--    0..that ground's max (bad_density, with min/max: refused, never clamped),
--    a member of a party it does not lead (not_leader), no character.
-- §3 hr_hunt_density_pick(instance, user, slot) RESTATED with one argument less
--    (the preset is no longer an input; the 4-argument 2026-11-16 one is dropped)
--    and hr_hunt_density_freeze RESTATED to call it: the instance's ground's pick
--    of the party LEADER (a party instance) or the hero, clamped to that ground's
--    density_max and the catalogue ceiling. Frozen once at hunt start, as before.
-- §4 FOUR BODIES RESTATED WHOLE (no body patching; §0 md5-pins each landed image
--    or this file's DENSITY-HOME marker):
--    hr_action_set_options   the 2026-11-01 `not_leader` density branch goes: with
--                            no catalogue row, `density` is refused as bad_option.
--    hr_hunt_settings_view   the `density` key goes (it read the option row).
--    hr_hunt_party_view      `leader_density` (one int read off the leader's preset)
--                            becomes `leader_densities` { <hunt_id>: pick }.
--    hr_hunt_view            the session gains `forfeit`: it ended by the refused-window
--                            rule (hr_hunt_forfeit's `window_forfeit` ledger row), so the
--                            hunt-end card says why in plain words, not "by the server".
-- §5 the `hunt_density` section and the client baseline row.
-- §6 ONCE: today's picks move home. Each character's stored density (its lowest
--    preset holding one; the picker wrote the active preset, 0 out of a hunt) is
--    written for EVERY ground, clamped to that ground's max (one pick played on
--    every ground until now, so nothing a tester picked changes); then `density`
--    leaves every action set (no back-compat: CLAUDE.md §1). A second apply finds
--    no density key and moves nothing.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
-- A pick is one INSERT .. ON CONFLICT DO UPDATE on its primary key: two sets of one
-- ground serialise on that row, the last commit wins. The freeze reads the row
-- once inside the session insert, as before; a pick changed mid-hunt plays from
-- the next hunt (the instance's density never moves).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- The intent writes only the caller's own (user, slot) row, a whole number the
-- server bounds by its own catalogue; nothing else reads it but the freeze, which
-- clamps again, and the settle's kill bound grows only with the FROZEN value
-- (2026-11-16-hunt-density-bounds.sql). It moves no value. A party member cannot
-- set the party's pull (not_leader; the freeze reads the leader's row). The
-- leader's picks reach only its own party's seats (the party view's caller is in
-- that party), the same exposure as the 11-01 `leader_density`.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- At most (grounds) rows per character: 4 today, ~40 at 10x content, 12 B of
-- payload each. Read: one PK-prefix scan per envelope and per party view.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_action_set_options and hr_hunt_party_view from
-- 2026-11-01-party-leader-density.sql / 2026-11-04-party-outfits.sql,
-- hr_hunt_settings_view from 2026-10-28-consume-defaults.sql, and the 2026-11-16
-- pick and freeze (with the 11-06 catalogue's density option row); delete the
-- section and baseline rows; drop the table, the view and the intent. The moved
-- picks are not copied back (the game wipes at EA).
-- ORDER: after 2026-11-17-hunt-sessions-catalogue.generated.sql (density_max, no
-- density option), itself after 2026-11-16-hunt-density-bounds.sql. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- The pins: the whitespace-normalised pg_get_functiondef md5 of each landed body
-- (tests/live-hash-drift.baseline.json's measure), or this file's own (a re-apply).
do $mig$
declare v_def text; v_src text;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_hunt_grounds'
                    and column_name = 'density_max')
     or exists (select 1 from public.hr_hunt_grounds where density_max is null)
     or exists (select 1 from public.hr_hunt_set_options where opt = 'density')
     or to_regprocedure('public.hr_hunt_party_of(uuid,integer)') is null or to_regclass('public.hr_state_sections') is null then
    raise exception 'PRECONDITION: apply 2026-11-17-hunt-sessions-catalogue.generated.sql first (density_max on every ground, no density option)'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_action_set_options(integer,integer,jsonb,uuid)'::regprocedure;
  v_def := md5(regexp_replace(pg_get_functiondef('public.hr_action_set_options(integer,integer,jsonb,uuid)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_def <> 'cb39f11a35d8f262753972791c52850a' and strpos(v_src, 'DENSITY-HOME') = 0 then
    raise exception 'PIN: hr_action_set_options is neither the party-leader image (cb39f11a...) nor this file''s (md5 %)', v_def; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_settings_view(uuid,integer)'::regprocedure;
  v_def := md5(regexp_replace(pg_get_functiondef('public.hr_hunt_settings_view(uuid,integer)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_def <> '95adfbbd7417328bfa496de0c60c7077' and strpos(v_src, 'DENSITY-HOME') = 0 then
    raise exception 'PIN: hr_hunt_settings_view is neither the consume-defaults image (95adfbbd...) nor this file''s (md5 %)', v_def; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_party_view(uuid,integer)'::regprocedure;
  v_def := md5(regexp_replace(pg_get_functiondef('public.hr_hunt_party_view(uuid,integer)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_def <> '32282ccd97db15ede9258aad98fe8823' and strpos(v_src, 'DENSITY-HOME') = 0 then
    raise exception 'PIN: hr_hunt_party_view is neither the party-outfits image (32282ccd...) nor this file''s (md5 %)', v_def; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_density_freeze()'::regprocedure;
  if md5(v_src) <> '6948151527ac5c27fc5927a75a00a5d7' and strpos(v_src, 'DENSITY-HOME') = 0 then
    raise exception 'PIN: hr_hunt_density_freeze is neither the density-bounds image (69481515...) nor this file''s (md5 %)', md5(v_src); end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_view(uuid)'::regprocedure;
  v_def := md5(regexp_replace(pg_get_functiondef('public.hr_hunt_view(uuid)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_def <> '4a86aacf0117eae193a8f54596d2ca0d' and strpos(v_src, 'DENSITY-HOME') = 0 then
    raise exception 'PIN: hr_hunt_view is neither the core-bodies image (4a86aacf...) nor this file''s (md5 %)', v_def; end if;
  if to_regclass('public.player_ledger_session') is null then
    raise exception 'PIN: player_ledger_session (session_id, id) is missing: the forfeit read would scan the ledger'; end if;
end $mig$;

-- ── §1 THE PICK PER GROUND ───────────────────────────────────────────────────
create table if not exists public.hunt_density (
  user_id    uuid not null,
  slot       int  not null,
  hunt_id    text not null check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  density    int  not null check (density >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot, hunt_id),
  constraint hunt_density_char_fk foreign key (user_id, slot)
    references public.player_state (user_id, slot) on delete cascade
);
alter table public.hunt_density enable row level security;
revoke all on public.hunt_density from public, anon, authenticated, service_role;
comment on table public.hunt_density is
  '2026-11-17-hunt-density-home.sql: each character''s monster-density pick per hunt ground (rulings H4: chosen with the '
  'hunt, remembered per ground, the party leader''s in a party; not an action-set setting). 0 = as built; no row = 0. '
  'Written only by hr_hunt_density_set (bounded by hr_hunt_grounds.density_max); read by hr_hunt_density_pick (frozen on '
  'the instance at hunt start) and hr_hunt_density_view (the hunt_density section, the party''s leader_densities). '
  'RLS on, no policy, no client grant.';

-- ── §2 THE VIEW AND THE INTENT ───────────────────────────────────────────────
create or replace function public.hr_hunt_density_view(p_user uuid, p_slot int)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  -- DENSITY-HOME (2026-11-17-hunt-density-home.sql): one character's picks, { <hunt_id>: pick }.
  select coalesce((select jsonb_object_agg(d.hunt_id, d.density order by d.hunt_id)
                     from public.hunt_density d where d.user_id = p_user and d.slot = p_slot), '{}'::jsonb)
$$;
revoke execute on function public.hr_hunt_density_view(uuid, int) from public, anon, authenticated, service_role;

create or replace function public.hr_hunt_density_set(p_slot int, p_hunt text, p_density int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_density_set';
  v_uid  uuid := auth.uid();
  v_r    jsonb;
  v_max  int;
  v_pid  uuid;
begin
  -- DENSITY-HOME (2026-11-17-hunt-density-home.sql): the caller's pick on one ground, refused never clamped.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- The ground's most, for the largest party (the array never falls as the party grows; densityFor clamps per size).
  select (select max(m) from unnest(g.density_max) m) into v_max
    from public.hr_hunt_grounds g where g.hunt_id = p_hunt;
  if v_max is null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_hunt')); end if;
  if p_density is null or p_density < 0 or p_density > v_max then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_density', 'min', 0, 'max', v_max)); end if;
  -- THE LEADER CHOOSES THE HUNT SETTINGS (Tyler 2026-10-20): in a party only the leader picks (the freeze reads its row).
  v_pid := public.hr_hunt_party_of(v_uid, p_slot);
  if v_pid is not null and not exists (select 1 from public.hunt_parties p where p.id = v_pid
                                        and p.leader_user = v_uid and p.leader_slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_leader')); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  insert into public.hunt_density as d (user_id, slot, hunt_id, density, updated_at)
    values (v_uid, p_slot, p_hunt, p_density, now())
    on conflict (user_id, slot, hunt_id) do update set density = excluded.density, updated_at = now();
  v_r := jsonb_build_object('ok', true, 'hunt', p_hunt, 'density', p_density);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
revoke execute on function public.hr_hunt_density_set(int, text, int, uuid) from public;
revoke execute on function public.hr_hunt_density_set(int, text, int, uuid) from anon, service_role, hr_engine, hr_tick;
grant  execute on function public.hr_hunt_density_set(int, text, int, uuid) to authenticated;

-- ── §3 THE PICK THE INSTANCE FREEZES ─────────────────────────────────────────
-- The instance's ground's pick of the party LEADER (a party instance's id is its
-- party's) or the opening hero, clamped to the ground's max and the ceiling.
create or replace function public.hr_hunt_density_pick(p_instance uuid, p_user uuid, p_slot int)
returns int language sql stable set search_path = public, pg_catalog as $$
  -- DENSITY-HOME (2026-11-17-hunt-density-home.sql): the per-ground pick (hunt_density), the leader's in a party.
  select coalesce((
    select greatest(0, least(coalesce(public.hr_hunt_limit('density_max'), 0)::int,
                             coalesce((select max(m) from unnest(g.density_max) m), 0),
                             coalesce(d.density, 0)))
      from public.hunt_instances i
      join public.hr_hunt_grounds g on g.hunt_id = i.hunt_id
      left join public.hunt_parties p on p.id = i.id and p.closed_at is null
      left join public.hunt_density d on d.user_id = coalesce(p.leader_user, p_user)
                                     and d.slot = coalesce(p.leader_slot, p_slot) and d.hunt_id = i.hunt_id
     where i.id = p_instance), 0)
$$;
revoke execute on function public.hr_hunt_density_pick(uuid, uuid, int) from public;
revoke execute on function public.hr_hunt_density_pick(uuid, uuid, int) from anon, authenticated, service_role, hr_engine, hr_tick;

create or replace function public.hr_hunt_density_freeze()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  -- DENSITY-HOME (2026-11-17-hunt-density-home.sql): the instance's first session writes its density; nothing writes it again.
  update public.hunt_instances
     set density = public.hr_hunt_density_pick(new.instance_id, new.user_id, new.slot)
   where id = new.instance_id and density is null;
  return null;
end $$;
revoke execute on function public.hr_hunt_density_freeze() from public;
revoke execute on function public.hr_hunt_density_freeze() from anon, authenticated, service_role, hr_engine, hr_tick;
-- The 2026-11-16 pick read the action set's preset; nothing calls it now.
drop function if exists public.hr_hunt_density_pick(uuid, uuid, int, int);

-- ── §4 THE FOUR BODIES ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_action_set_options(p_slot integer, p_preset integer, p_opts jsonb, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  c_verb constant text := 'action_set_options';
  c_slack_ms constant bigint := 20000;
  v_uid  uuid := auth.uid();
  v_r    jsonb;
  v_s    public.hunt_sessions%rowtype;
  v_k    text;
  v_v    jsonb;
  v_o    public.hr_hunt_set_options%rowtype;
  v_set  jsonb := '{}'::jsonb;
  v_del  text[] := '{}';
  v_bar  jsonb := null;
begin
  -- DENSITY-HOME (2026-11-17-hunt-density-home.sql): density is no option (hunt_density, hr_hunt_density_set);
  -- a `density` key is refused as bad_option by the catalogue like any unknown key.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_preset is null or p_preset < 0 or p_preset >= public.hr_hunt_limit('presets') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset')); end if;
  if p_opts is null or jsonb_typeof(p_opts) <> 'object' or p_opts = '{}'::jsonb then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_options')); end if;
  for v_k in select jsonb_object_keys(p_opts) loop
    v_v := p_opts->v_k;
    -- THE THREE KEYS THAT ARE NOT OPTION ROWS, each through its own check.
    if v_k = 'slots' then
      v_r := public.hr_hunt_bar_check(case when jsonb_typeof(v_v) = 'null' then '[]'::jsonb else v_v end);
      if not (v_r->>'ok')::boolean then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
      v_bar := v_r->'slots';
      continue;
    elsif v_k = 'stop_rules' or v_k = 'grounds' then
      if jsonb_typeof(v_v) = 'null' then v_del := v_del || v_k; continue; end if;
      v_r := case v_k when 'stop_rules' then public.hr_hunt_stop_rules_check(v_v) else public.hr_hunt_grounds_check(v_v) end;
      if not (v_r->>'ok')::boolean then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
      v_set := v_set || jsonb_build_object(v_k, case v_k when 'stop_rules' then v_r->'rules' else v_r->'grounds' end);
      continue;
    end if;
    select * into v_o from public.hr_hunt_set_options o where o.opt = v_k;
    if not found then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_option',
        'option', left(v_k, 64))); end if;
    if jsonb_typeof(v_v) = 'null' then v_del := v_del || v_k; continue; end if;
    if v_o.kind = 'target' then
      if jsonb_typeof(v_v) <> 'string' or not exists (select 1 from public.hr_hunt_target_modes m where m.mode = v_v #>> '{}') then
        return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_target_mode')); end if;
    elsif v_o.kind = 'limit' then
      if jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}')::numeric <> trunc((v_v #>> '{}')::numeric)
         or (v_v #>> '{}')::numeric < public.hr_hunt_limit(v_o.limit_key || '_min')
         or (v_v #>> '{}')::numeric > public.hr_hunt_limit(v_o.limit_key || '_max') then
        return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_' || v_k,
          'min', public.hr_hunt_limit(v_o.limit_key || '_min'), 'max', public.hr_hunt_limit(v_o.limit_key || '_max'))); end if;
      v_v := to_jsonb((v_v #>> '{}')::numeric::bigint);
    elsif v_o.kind = 'bool' then
      if jsonb_typeof(v_v) <> 'boolean' then
        return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_' || v_k)); end if;
    else
      if jsonb_typeof(v_v) <> 'string' or not ((v_v #>> '{}') = any (v_o.vals)) then
        return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_' || v_k,
          'allowed', to_jsonb(v_o.vals))); end if;
    end if;
    v_set := v_set || jsonb_build_object(v_k, v_v);
  end loop;
  if octet_length(v_set::text) > 2048 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_options', 'why', 'too_large')); end if;

  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if v_s.id is not null and v_s.preset = p_preset and public.hr_hunt_gap_ms(v_s) > c_slack_ms then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'settle_first',
      'unsettled_ms', public.hr_hunt_gap_ms(v_s))); end if;
  insert into public.player_action_sets as a (user_id, slot, preset, name, slots, options, updated_at)
    values (v_uid, p_slot, p_preset, 'Preset ' || (p_preset + 1), coalesce(v_bar, '[]'::jsonb), (v_set - v_del), now())
    on conflict (user_id, slot, preset) do update
      set options = (a.options - v_del) || v_set, slots = coalesce(v_bar, a.slots), updated_at = now();
  select jsonb_build_object('ok', true, 'preset', p_preset, 'options', a.options, 'slots', a.slots) into v_r
    from public.player_action_sets a where a.user_id = v_uid and a.slot = p_slot and a.preset = p_preset;
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $function$;

CREATE OR REPLACE FUNCTION public.hr_hunt_settings_view(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  s       public.hunt_sessions%rowtype;
  a       public.player_action_sets%rowtype;
  i       public.hunt_instances%rowtype;
  v_shape public.hr_hunt_world_shape%rowtype;
  v_preset int;
  v_opt   jsonb;
  v_wj    jsonb;
  v_uf    jsonb;
  v_me    jsonb;
  v_unit  jsonb := '{}'::jsonb;
  v_role  text;
  v_disc  text;
  v_list  jsonb := '[]'::jsonb;
  v_def   jsonb;
  v_d     jsonb;
  v_pos   int;
  v_slots jsonb := '[]'::jsonb;
  v_e     jsonb;
  v_presets jsonb;
  v_eff   jsonb := '{}'::jsonb;
  v_o     record;
  v_val   jsonb;
  v_ab    public.hr_hunt_abilities%rowtype;
begin
  -- DENSITY-HOME (2026-11-17-hunt-density-home.sql): no `density` key; the pick per ground is the hunt_density section.
  select * into s from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null
   order by h.entered_at desc limit 1;
  v_preset := coalesce(s.preset, 0);
  select * into a from public.player_action_sets x where x.user_id = p_user and x.slot = p_slot and x.preset = v_preset;
  v_opt := coalesce(a.options, '{}'::jsonb);
  -- The hunting hero's unit: its role and the settings the engine runs it on.
  if s.id is not null and s.unit_id is not null then
    select * into i from public.hunt_instances where id = s.instance_id;
    select * into v_shape from public.hr_hunt_world_shape where id;
    begin
      v_wj := i.world::jsonb;
    exception when others then
      v_wj := null;
    end;
    if v_wj is not null and jsonb_typeof(v_wj) = 'object' and v_shape.id and jsonb_typeof(v_wj->'u') = 'array'
       and (v_wj->>'v') = v_shape.version::text and (v_wj->>'s') = v_shape.shape::text then
      v_uf := v_shape.fields->'unit';
      select e into v_me from jsonb_array_elements(v_wj->'u') e
       where e->>((v_uf->>'side')::int) = 'hero' and (e->>((v_uf->>'id')::int))::int = s.unit_id limit 1;
      if v_me is not null then
        v_role := v_me->>((v_uf->>'role')::int);
        v_unit := jsonb_build_object('distance', v_me->((v_uf->>'dist')::int), 'chase', v_me->((v_uf->>'chase')::int),
                                     'target_mode', v_me->((v_uf->>'tmode')::int), 'stance', v_me->((v_uf->>'stance')::int));
      end if;
    end if;
  end if;
  -- Not hunting: the role the worn weapon gives (a staff's pick kept when it allows it).
  if v_role is null or v_role = '' then
    select case when v_opt->>'role' = any (w.roles) then v_opt->>'role' else w.roles[1] end into v_role
      from public.hr_hunt_weapon_roles w where w.weapon_type = public.hr_hunt_weapon_of(p_user, p_slot);
  end if;
  for v_o in select o.opt, o.dflt from public.hr_hunt_set_options o order by o.opt loop
    v_val := coalesce(v_opt->v_o.opt, v_unit->v_o.opt, v_o.dflt);
    v_eff := v_eff || jsonb_build_object(v_o.opt, v_val);
  end loop;
  select r.discipline into v_disc from public.hr_hunt_roles r where r.role = v_role;
  -- THE BAR: the stored slots (an invalid row reads as an empty tablet), then the defaults.
  for v_e in select value from jsonb_array_elements(case when jsonb_typeof(a.slots) = 'array' then a.slots else '[]'::jsonb end) loop
    v_d := public.hr_hunt_slot_check(v_e);
    v_list := v_list || jsonb_build_array(case when (v_d->>'ok')::boolean then v_d->'slot' else 'null'::jsonb end);
  end loop;
  v_def := '[]'::jsonb;
  if not exists (select 1 from jsonb_array_elements(v_list) e join public.hr_hunt_abilities ab on ab.ability_id = e->'action'->>'id'
                  where e->'action'->>'type' = 'ability' and v_disc = any (ab.disciplines)) then
    select coalesce(jsonb_agg(r.slot order by r.ord), '[]'::jsonb) into v_def from public.hr_hunt_role_rules r where r.role = v_role;
  end if;
  if not exists (select 1 from jsonb_array_elements(v_list) e where e->'action'->>'type' = 'consume') then
    -- EAT-AT BEFORE DRINK-AT (2026-10-28): food and drink always fire under ONE 2 s
    -- cooldown, so a drink first would take every cooldown while mana stays low.
    v_def := v_def || jsonb_build_array(
      jsonb_build_object('id', 'd_food', 'action', jsonb_build_object('type', 'consume', 'id', 'food'), 'join', 'and',
        'conditions', jsonb_build_array(jsonb_build_object('metric', 'self_hp_pct', 'op', 'lt', 'value', v_eff->'food_below_pct'))),
      jsonb_build_object('id', 'd_drink', 'action', jsonb_build_object('type', 'consume', 'id', 'drink'), 'join', 'and',
        'conditions', jsonb_build_array(jsonb_build_object('metric', 'self_mana_pct', 'op', 'lt', 'value', v_eff->'drink_below_pct'))));
  end if;
  for v_d in select value from jsonb_array_elements(v_def) loop
    select min(n - 1) into v_pos from jsonb_array_elements(v_list) with ordinality x(e, n) where jsonb_typeof(x.e) = 'null';
    if v_pos is null then v_list := v_list || jsonb_build_array(v_d);
    else v_list := jsonb_set(v_list, array[v_pos::text], v_d); end if;
  end loop;
  -- The display fields: an ability's mana and whether it can fire (active, of the discipline,
  -- its rune held); an item's count in the inventory.
  for v_e in select value from jsonb_array_elements(v_list) loop
    if jsonb_typeof(v_e) = 'null' then v_slots := v_slots || jsonb_build_array(v_e); continue; end if;
    if v_e->'action'->>'type' = 'ability' then
      select * into v_ab from public.hr_hunt_abilities ab where ab.ability_id = v_e->'action'->>'id';
      v_slots := v_slots || jsonb_build_array(v_e || jsonb_build_object('mana', v_ab.mana,
        'usable', coalesce(v_ab.active, false) and v_disc = any (v_ab.disciplines) and (v_ab.rune is null or exists (
          select 1 from public.player_inventory pi where pi.user_id = p_user and pi.slot = p_slot and pi.item_id = v_ab.rune and pi.qty > 0))));
    else
      v_slots := v_slots || jsonb_build_array(v_e || jsonb_build_object('usable', true,
        'count', (select coalesce(sum(pi.qty), 0) from public.player_inventory pi
                   where pi.user_id = p_user and pi.slot = p_slot and pi.item_id = v_e->'action'->>'id')));
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('preset', x.preset, 'name', x.name, 'grounds', coalesce(x.options->'grounds', '[]'::jsonb))
           order by x.preset), '[]'::jsonb) into v_presets
    from public.player_action_sets x where x.user_id = p_user and x.slot = p_slot;
  if not exists (select 1 from jsonb_array_elements(v_presets) e where (e->>'preset')::int = v_preset) then
    v_presets := v_presets || jsonb_build_array(jsonb_build_object('preset', v_preset, 'name', 'Preset ' || (v_preset + 1), 'grounds', '[]'::jsonb));
  end if;
  return jsonb_build_object(
    'preset', v_preset, 'presets', v_presets, 'role', v_role,
    'target_mode', v_eff->'target_mode', 'stance', v_eff->'stance', 'distance', v_eff->'distance', 'chase', v_eff->'chase',
    'food_pct', v_eff->'food_below_pct', 'drink_pct', v_eff->'drink_below_pct',
    'supply_source', v_eff->'supply_source', 'on_empty', v_eff->'on_empty', 'action_set', v_eff->'action_set',
    'gold_floor', v_eff->'gold_floor',
    'gather_share', v_eff->'gather_share', 'gather_inert', true,
    'stop_rules', coalesce(v_opt->'stop_rules', '[]'::jsonb), 'grounds', coalesce(v_opt->'grounds', '[]'::jsonb),
    'slots', v_slots,
    'bar', coalesce(a.slots, '[]'::jsonb), 'options', v_opt);
end $function$;

CREATE OR REPLACE FUNCTION public.hr_hunt_party_view(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- PARTY-FLOW (2026-10-28-party-flow.sql): each member row says whether it is away and how long its seat is kept.
  -- DENSITY-HOME (2026-11-17-hunt-density-home.sql): `leader_densities`, the leader's pick per ground (hunt_density)
  -- every seat's picker shows read-only; it replaces 2026-11-01's one `leader_density`.
  -- HERO-LOOKS (2026-11-04-party-outfits.sql): each member row carries the outfit its character wears (public, as in town).
  v_pid   uuid := public.hr_hunt_party_of(p_user, p_slot);
  v_p     public.hunt_parties%rowtype;
  v_own   public.hunt_sessions%rowtype;
  v_inst  uuid;
  v_shape public.hr_hunt_world_shape%rowtype;
  v_wj    jsonb;
  v_uf    jsonb;
  v_vit   jsonb := '{}'::jsonb;
  v_lead  int;
  v_self  int;
  v_sseat int;
  v_lseat int;
  v_mem   jsonb := '[]'::jsonb;
  v_r     record;
  v_u     jsonb;
  v_id    int;
  v_t     int;
  v_v     jsonb;
  v_secs  numeric;
  v_away  boolean;
  v_ldens jsonb;
begin
  select * into v_own from public.hunt_sessions h
   where h.user_id = p_user and h.slot = p_slot and h.ended_at is null order by h.entered_at desc limit 1;
  if v_pid is null and v_own.id is null then return null; end if;
  if v_pid is not null then
    select * into v_p from public.hunt_parties where id = v_pid;
    v_inst := v_pid;
  else
    v_inst := v_own.instance_id;
  end if;

  -- The pose's hero vitals by unit id, and which heroes a living monster is on.
  select * into v_shape from public.hr_hunt_world_shape where id;
  begin
    select i.world::jsonb into v_wj from public.hunt_instances i where i.id = v_inst;
  exception when others then
    v_wj := null;
  end;
  if v_wj is not null and jsonb_typeof(v_wj) = 'object' and v_shape.id
     and (v_wj->>'v') = v_shape.version::text and (v_wj->>'s') = v_shape.shape::text then
    v_uf := v_shape.fields->'unit';
    if jsonb_typeof(v_wj->'w'->((v_shape.fields->'world'->>'leader')::int)) = 'number' then
      v_lead := (v_wj->'w'->>((v_shape.fields->'world'->>'leader')::int))::int;
    end if;
    for v_u in select e from jsonb_array_elements(case when jsonb_typeof(v_wj->'u') = 'array' then v_wj->'u' else '[]'::jsonb end) e loop
      v_id := (v_u->>((v_uf->>'id')::int))::int;
      if v_u->>((v_uf->>'side')::int) = 'hero' then
        v_v := jsonb_build_object(
          'hp', v_u->((v_uf->>'hp')::int), 'hp_max', v_u->((v_uf->>'maxHp')::int),
          'mana', v_u->((v_uf->>'mana')::int), 'mana_max', v_u->((v_uf->>'maxMana')::int),
          'eating', jsonb_typeof(v_u->((v_uf->>'otHp')::int)) = 'array',
          'drinking', jsonb_typeof(v_u->((v_uf->>'otMana')::int)) = 'array');
        v_vit := v_vit || jsonb_build_object(v_id::text, coalesce(v_vit->(v_id::text), '{}'::jsonb) || v_v);
      elsif (v_u->>((v_uf->>'alive')::int)) = 'true' and jsonb_typeof(v_u->((v_uf->>'target')::int)) = 'number' then
        v_t := (v_u->>((v_uf->>'target')::int))::int;
        v_vit := v_vit || jsonb_build_object(v_t::text, coalesce(v_vit->(v_t::text), '{}'::jsonb) || jsonb_build_object('aggro', true));
      end if;
    end loop;
  end if;

  for v_r in
    select m.user_id, m.slot, m.seat::int as seat, m.weapon_type as weapon, h.id as sid, h.unit_id, h.preset,
           h.hunt_from, h.settled_to, m.joined_at
      from public.hunt_party_members m
      left join public.hunt_sessions h on h.user_id = m.user_id and h.slot = m.slot and h.ended_at is null and h.instance_id = v_pid
     where v_pid is not null and m.party_id = v_pid
    union all
    select p_user, p_slot, 0, public.hr_hunt_weapon_of(p_user, p_slot), v_own.id, v_own.unit_id, v_own.preset,
           v_own.hunt_from, v_own.settled_to, null::timestamptz
     where v_pid is null
     order by 3
  loop
    v_v := case when v_r.unit_id is not null then coalesce(v_vit->(v_r.unit_id::text), '{}'::jsonb) else '{}'::jsonb end;
    v_secs := greatest(0, extract(epoch from (v_r.settled_to - v_r.hunt_from)));
    v_away := v_pid is not null and public.hr_party_away(v_r.user_id, v_r.slot, v_r.joined_at);
    select jsonb_build_object(
        'unit', v_r.unit_id, 'seat', v_r.seat, 'hunting', v_r.sid is not null,
        'name', public.hr_character_name(v_r.user_id, v_r.slot),
        'level', public.hr_level_of(v_r.user_id, v_r.slot),
        'weapon', v_r.weapon,
        'role_pick', (select a.options->>'role' from public.player_action_sets a
                       where a.user_id = v_r.user_id and a.slot = v_r.slot and a.preset = coalesce(v_r.preset, 0)),
        'hp', case when v_r.sid is not null then coalesce(v_v->'hp', to_jsonb(ps.hp)) end,
        'hp_max', case when v_r.sid is not null then coalesce(v_v->'hp_max', to_jsonb(public.hr_vitals_of(v_r.user_id, v_r.slot)->'max_hp')) end,
        'mana', v_v->'mana', 'mana_max', v_v->'mana_max',
        'dealt', case when v_r.sid is not null then coalesce((t.dealt->>'total')::bigint, 0) end,
        'healed', case when v_r.sid is not null then coalesce((t.healed->>'total')::bigint, 0) end,
        'dps', case when v_r.sid is not null and v_secs > 0 then round(coalesce((t.dealt->>'total')::numeric, 0) / v_secs, 1) end,
        'hps', case when v_r.sid is not null and v_secs > 0 then round(coalesce((t.healed->>'total')::numeric, 0) / v_secs, 1) end,
        'eating', coalesce((v_v->>'eating')::boolean, false),
        'drinking', coalesce((v_v->>'drinking')::boolean, false), 'aggro', coalesce((v_v->>'aggro')::boolean, false),
        'away', v_away,
        -- THE OUTFIT the character chose (player_outfits, written only by hr_outfit_set), null when none or no
        -- longer owned (a lapsed premium outfit): the same look hr_town_walkers shows of it in town.
        'outfit', case when po.outfit_id is not null and po.outfit_id = any (public.hr_outfit_owned(v_r.user_id, v_r.slot))
                       then jsonb_build_object('id', po.outfit_id, 'colors', coalesce(po.colors, '{}'::jsonb)) end,
        'seat_ms', case when v_away then greatest(0, floor(extract(epoch from (public.hr_party_last_seen(v_r.user_id, v_r.joined_at)
                                                                        + public.hr_party_seat_keep() - now())) * 1000))::bigint end)
      into v_u
      from public.player_state ps
      left join public.hunt_session_tally t on t.session_id = v_r.sid
      left join public.player_outfits po on po.user_id = v_r.user_id and po.slot = v_r.slot
     where ps.user_id = v_r.user_id and ps.slot = v_r.slot;
    if v_u is not null then v_mem := v_mem || jsonb_build_array(v_u); end if;
    if v_r.user_id = p_user and v_r.slot = p_slot then v_self := v_r.unit_id; v_sseat := v_r.seat; end if;
    if v_pid is null or (v_r.user_id = v_p.leader_user and v_r.slot = v_p.leader_slot) then
      v_lseat := v_r.seat;
      -- the leader's picks per ground, as hr_hunt_density_pick freezes them on a party instance
      v_ldens := public.hr_hunt_density_view(v_r.user_id, v_r.slot);
    end if;
  end loop;

  -- The leader: the pose's pull leader, else the party leader's unit, else (solo) self.
  if v_lead is null then
    v_lead := case when v_pid is null then v_self
                   else (select h.unit_id from public.hunt_sessions h
                          where h.user_id = v_p.leader_user and h.slot = v_p.leader_slot and h.ended_at is null
                            and h.instance_id = v_pid) end;
  end if;
  return jsonb_build_object(
    'id', v_pid, 'hunt', coalesce(v_p.hunt_id, v_own.hunt_id),
    'max', coalesce(v_p.max_size::int, 1),
    'open', v_pid is not null and jsonb_array_length(v_mem) < v_p.max_size,
    'leader', v_lead, 'self', v_self, 'leader_seat', v_lseat, 'self_seat', v_sseat, 'members', v_mem,
    'listed', coalesce(v_p.listed, false), 'leader_densities', coalesce(v_ldens, '{}'::jsonb));
end $function$;

CREATE OR REPLACE FUNCTION public.hr_hunt_view(p_session uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  -- DENSITY-HOME (2026-11-17-hunt-density-home.sql): `forfeit`, the session ended by the refused-window rule
  -- (hr_hunt_forfeit: its `window_forfeit` ledger row; only a `server` or `left` end can carry one).
  select jsonb_build_object(
    'id', s.id, 'hunt', s.hunt_id, 'prev', s.prev_session_id, 'preset', s.preset,
    'hours_limit', s.hours_limit,
    'entered_at', s.entered_at, 'hunt_from', s.hunt_from, 'settled_to', s.settled_to,
    'instance', s.instance_id, 'unit', s.unit_id, 'seat', s.seat,
    'leave_at', s.leave_at, 'change_at', s.change_at, 'change_to', s.change_to,
    'ended_at', s.ended_at, 'end_reason', s.end_reason,
    'forfeit', s.ended_at is not null and s.end_reason in ('server', 'left') and exists (
      select 1 from public.player_ledger l where l.session_id = s.id and l.kind = 'hunt' and l.intent = 'window_forfeit'),
    'home_at',
    case when s.ended_at is not null then s.ended_at + make_interval(secs => coalesce(
      (select travel_s from public.hr_hunt_travel t where t.hunt_id = s.hunt_id), 0)) end,
    'seen_event_id', s.seen_event_id, 'version', s.version,
    'phase', case when s.ended_at is not null then 'ended'
                  when s.leave_at is not null or s.change_at is not null then 'leaving'
                  when now() < s.hunt_from then 'walking' else 'hunting' end,
    'bag', coalesce((select jsonb_agg(jsonb_build_object('item', b.item_id, 'loaded', b.qty_loaded,
                       'left', b.qty_left, 'essential', b.essential) order by b.item_id)
                     from public.hunt_bag b where b.session_id = s.id), '[]'::jsonb),
    'tally', (select jsonb_build_object('kills', t.kills, 'xp', t.xp, 'coins', t.coins, 'loot', t.loot,
                       'supplies', t.supplies, 'deaths', t.deaths, 'paid_ms', t.paid_ms,
                       'bought', t.bought, 'supply_gold', t.supply_gold)
              from public.hunt_session_tally t where t.session_id = s.id))
  from public.hunt_sessions s where s.id = p_session
$function$;

-- ── §5 THE `hunt_density` SECTION AND THE CLIENT SURFACE ─────────────────────
insert into public.hr_state_sections (key, fn, note) values
  ('hunt_density', 'hr_hunt_density_view', '2026-11-17-hunt-density-home.sql: this hero''s monster-density pick per ground, { <hunt_id>: pick } (no key = 0, as built)')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_hunt_density_set';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_hunt_density_set', 'p_slot integer, p_hunt text, p_density integer, p_idem uuid', 'authenticated',
   'added 2026-11-17: the caller''s own monster-density pick on one hunt ground, 0..that ground''s catalogued max, refused not clamped; the party leader''s only in a party; moves no value');

-- ── §6 TODAY'S PICKS MOVE HOME, ONCE ─────────────────────────────────────────
insert into public.hunt_density (user_id, slot, hunt_id, density)
select a.user_id, a.slot, g.hunt_id, least(a.pick, (select max(m) from unnest(g.density_max) m))
  from (select distinct on (x.user_id, x.slot) x.user_id, x.slot, (x.options->>'density')::int as pick
          from public.player_action_sets x
          join public.player_state ps on ps.user_id = x.user_id and ps.slot = x.slot
         where jsonb_typeof(x.options->'density') = 'number' and (x.options->>'density') ~ '^[0-9]{1,4}$'
           and (x.options->>'density')::int > 0
         order by x.user_id, x.slot, x.preset) a
 cross join public.hr_hunt_grounds g
on conflict (user_id, slot, hunt_id) do nothing;
update public.player_action_sets set options = options - 'density' where options ? 'density';

-- ── §7 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) a pick per ground persists and reads back, a replayed key moves nothing; (b) a pick
-- over the ground's max, under 0 or on a groundless hunt is refused and moves nothing;
-- (c) another player's picks never mix: each writes and reads only its own; (d) changing a
-- setup no longer changes the density (density is no option; the instance keeps its frozen
-- pick); (e) a party plays its LEADER's pick, a member may not set one and sees the leader's;
-- (f) the settings section has no density; the move left no action-set density.
do $$
declare
  v_a     constant uuid := '000000c0-0000-4000-a000-00000de50001';   -- the hero, later the party leader
  v_b     constant uuid := '000000c0-0000-4000-a000-00000de50002';   -- another player, later its member
  v_pid   constant uuid := '000000c0-0000-4000-a000-00000de5000f';   -- the party (and its instance)
  v_k     constant uuid := '000000c0-0000-4000-a000-00000de500a1';   -- one intent key, sent twice
  v_small text := 'mill_cellar';      -- max 8 at every party size
  v_big   text := 'millrace_sewer';   -- max 12 for a party of four
  v_mx    int;
  v_train text := (select t.hunt_id from public.hr_hunt_travel t where t.training order by t.hunt_id limit 1);
  v       jsonb;
  v_c     jsonb;
  v_sid   uuid;
  v_inst  uuid;
  v_i     int;
  v_role  text;
begin
  select (select max(m) from unnest(g.density_max) m) into v_mx from public.hr_hunt_grounds g where g.hunt_id = v_big;
  if (select (select max(m) from unnest(g.density_max) m) from public.hr_hunt_grounds g where g.hunt_id = v_small) is distinct from 8
     or v_mx is null or v_mx <= 8 or v_train is null then
    raise exception 'VERIFY: the probe grounds moved (% max 8, % max over 8, a training hunt): %, %, %',
      v_small, v_big, (select density_max from public.hr_hunt_grounds where hunt_id = v_small), v_mx, v_train; end if;
  begin
    for v_i in 1 .. 2 loop
      perform set_config('request.jwt.claim.sub', (array[v_a, v_b])[v_i]::text, true);
      insert into auth.users (id) values ((array[v_a, v_b])[v_i]) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values ((array[v_a, v_b])[v_i], 'density-home §7 probe')
        on conflict (user_id) do nothing;
      v := public.hr_create_character(0);
      if coalesce(v->>'created', v->>'ok', '') <> 'true' then raise exception 'VERIFY: hr_create_character refused: %', v; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_create_character(1);   -- A's second hero: a pick is per character, not per account
    if coalesce(v->>'created', v->>'ok', '') <> 'true' then raise exception 'VERIFY: hr_create_character(1) refused: %', v; end if;

    -- (a) A PICK PER GROUND PERSISTS: two grounds, two numbers; a change moves only its own ground.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    if public.hr_hunt_density_view(v_a, 0) <> '{}'::jsonb then raise exception 'VERIFY(a): a new hero has picks: %', public.hr_hunt_density_view(v_a, 0); end if;
    v := public.hr_hunt_density_set(0, v_small, 6, gen_random_uuid());
    if v is distinct from jsonb_build_object('ok', true, 'hunt', v_small, 'density', 6) then raise exception 'VERIFY(a): the pick answered %', v; end if;
    v := public.hr_hunt_density_set(0, v_big, 10, gen_random_uuid());
    v := public.hr_hunt_density_set(0, v_small, 3, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or public.hr_hunt_density_view(v_a, 0) <> jsonb_build_object(v_small, 3, v_big, 10)
       or public.hr_state_of(v_a, 0)->'hunt_density' is distinct from jsonb_build_object(v_small, 3, v_big, 10) then
      raise exception 'VERIFY(a): the picks read back % (section %)', public.hr_hunt_density_view(v_a, 0), public.hr_state_of(v_a, 0)->'hunt_density'; end if;
    -- one key sent twice is one decision: the second send replays the first answer and writes nothing
    v := public.hr_hunt_density_set(0, v_small, 5, v_k);
    v_c := public.hr_hunt_density_set(0, v_small, 7, v_k);
    if v_c is distinct from v or (select density from public.hunt_density where user_id = v_a and slot = 0 and hunt_id = v_small) <> 5 then
      raise exception 'VERIFY(a): a replayed key answered % and left %', v_c,
        (select density from public.hunt_density where user_id = v_a and slot = 0 and hunt_id = v_small); end if;
    v := public.hr_hunt_density_set(0, v_small, 6, gen_random_uuid());

    -- (b) OVER THE GROUND'S MAX, UNDER 0, NO NUMBER, NO GROUND: refused by name, nothing moves.
    v := public.hr_hunt_density_set(0, v_small, 9, gen_random_uuid());
    if v is distinct from jsonb_build_object('ok', false, 'error', 'bad_density', 'min', 0, 'max', 8) then
      raise exception 'VERIFY(b): 9 on a max-8 ground answered %', v; end if;
    v := public.hr_hunt_density_set(0, v_big, v_mx, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): the ground''s own max % was refused: %', v_mx, v; end if;
    foreach v in array array[public.hr_hunt_density_set(0, v_big, v_mx + 1, gen_random_uuid()),
                             public.hr_hunt_density_set(0, v_small, -1, gen_random_uuid()),
                             public.hr_hunt_density_set(0, v_small, null, gen_random_uuid())] loop
      if v->>'error' is distinct from 'bad_density' then raise exception 'VERIFY(b): an out-of-range pick answered %', v; end if;
    end loop;
    foreach v in array array[public.hr_hunt_density_set(0, 'nowhere_at_all', 1, gen_random_uuid()),
                             public.hr_hunt_density_set(0, v_train, 1, gen_random_uuid()),
                             public.hr_hunt_density_set(0, null, 1, gen_random_uuid())] loop
      if v->>'error' is distinct from 'bad_hunt' then raise exception 'VERIFY(b): a groundless hunt answered %', v; end if;
    end loop;
    if public.hr_hunt_density_set(0, v_small, 1, null)->>'error' is distinct from 'bad_idem'
       or public.hr_hunt_density_set(2, v_small, 1, gen_random_uuid())->>'error' is distinct from 'no_character' then
      raise exception 'VERIFY(b): a keyless or characterless pick was not refused'; end if;
    if public.hr_hunt_density_view(v_a, 0) <> jsonb_build_object(v_small, 6, v_big, v_mx)
       or exists (select 1 from public.hunt_density where user_id = v_a and slot <> 0) then
      raise exception 'VERIFY(b): a refusal moved the picks: %', public.hr_hunt_density_view(v_a, 0); end if;

    -- (c) ANOTHER HERO, ANOTHER PLAYER: A's second hero and B each pick their own; A's first never moves.
    v := public.hr_hunt_density_set(1, v_small, 4, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or public.hr_hunt_density_view(v_a, 1) <> jsonb_build_object(v_small, 4)
       or public.hr_hunt_density_view(v_a, 0) <> jsonb_build_object(v_small, 6, v_big, v_mx) then
      raise exception 'VERIFY(c): A''s second hero''s pick: slot 1 %, slot 0 %', public.hr_hunt_density_view(v_a, 1), public.hr_hunt_density_view(v_a, 0); end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    if public.hr_hunt_density_view(v_b, 0) <> '{}'::jsonb or public.hr_state_of(v_b, 0)->'hunt_density' <> '{}'::jsonb then
      raise exception 'VERIFY(c): B reads %', public.hr_state_of(v_b, 0)->'hunt_density'; end if;
    v := public.hr_hunt_density_set(0, v_big, 3, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or public.hr_hunt_density_view(v_b, 0) <> jsonb_build_object(v_big, 3)
       or public.hr_hunt_density_view(v_a, 0) <> jsonb_build_object(v_small, 6, v_big, v_mx) then
      raise exception 'VERIFY(c): B''s pick reached A or missed B: A %, B %', public.hr_hunt_density_view(v_a, 0), public.hr_hunt_density_view(v_b, 0); end if;

    -- (d) A SETUP IS NO DENSITY: the option is refused by name, a setup change moves neither the
    --     pick nor the frozen instance, and a pick changed mid-hunt waits for the next hunt.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_action_set_options(0, 0, '{"density": 4}'::jsonb, gen_random_uuid());
    if v->>'error' is distinct from 'bad_option' or v->>'option' is distinct from 'density' then
      raise exception 'VERIFY(d): a density option answered %', v; end if;
    v_sid := public.hr_hunt_new_session(v_a, 0, v_small, null, 0, null);
    select instance_id into v_inst from public.hunt_sessions where id = v_sid;
    if (select density from public.hunt_instances where id = v_inst) is distinct from 6 then
      raise exception 'VERIFY(d): the hunt froze density % (the pick is 6)', (select density from public.hunt_instances where id = v_inst); end if;
    v := public.hr_action_set_options(0, 0, '{"chase": true}'::jsonb, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): the setup change was refused: %', v; end if;
    v := public.hr_hunt_density_set(0, v_small, 2, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or (select density from public.hunt_instances where id = v_inst) is distinct from 6
       or (public.hr_hunt_instance_read(v_a, 0)->'members'->0->'session'->'options'->>'density') is distinct from '6'
       or public.hr_hunt_density_view(v_a, 0)->>v_small is distinct from '2' then
      raise exception 'VERIFY(d): a setup or pick change moved the running hunt: instance %, engine read %',
        (select density from public.hunt_instances where id = v_inst),
        public.hr_hunt_instance_read(v_a, 0)->'members'->0->'session'->'options'; end if;
    -- (d') THE FORFEIT IS NAMED: a `server` end reads forfeit only with its window_forfeit ledger row.
    update public.hunt_sessions set ended_at = now(), end_reason = 'server' where id = v_sid;
    if (public.hr_hunt_view(v_sid)->>'forfeit') is distinct from 'false' then
      raise exception 'VERIFY(d''): a plain server end reads forfeit %', public.hr_hunt_view(v_sid)->'forfeit'; end if;
    insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id)
      values (v_a, 0, 'hunt', 'window_forfeit', 0, 0, jsonb_build_object('reason', 'window_forfeit', 'end', 'server'), v_sid);
    if (public.hr_hunt_view(v_sid)->>'forfeit') is distinct from 'true'
       or (public.hr_hunt_section_view(v_a, 0)->'session'->>'forfeit') is distinct from 'true' then
      raise exception 'VERIFY(d''): a forfeited hunt reads forfeit % (section %)', public.hr_hunt_view(v_sid)->'forfeit',
        public.hr_hunt_section_view(v_a, 0)->'session'->'forfeit'; end if;

    -- (e) A PARTY PLAYS ITS LEADER'S PICK: A leads, B sits; B (whose own sewer pick is 3) opens the
    --     instance first and it freezes A's; B may not pick and reads A's picks.
    insert into public.hunt_parties (id, hunt_id, leader_user, leader_slot, max_size) values (v_pid, v_big, v_a, 0, 4);
    for v_i in 1 .. 2 loop
      insert into public.hunt_party_members (party_id, user_id, slot, seat, weapon_type)
        values (v_pid, (array[v_a, v_b])[v_i], 0, v_i - 1, public.hr_hunt_weapon_of((array[v_a, v_b])[v_i], 0));
    end loop;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_hunt_density_set(0, v_big, 1, gen_random_uuid());
    if v is distinct from jsonb_build_object('ok', false, 'error', 'not_leader') or public.hr_hunt_density_view(v_b, 0)->>v_big <> '3' then
      raise exception 'VERIFY(e): a member''s pick answered % (its row %)', v, public.hr_hunt_density_view(v_b, 0); end if;
    if public.hr_hunt_party_view(v_b, 0)->'leader_densities' is distinct from public.hr_hunt_density_view(v_a, 0)
       or public.hr_hunt_party_view(v_b, 0) ? 'leader_density' then
      raise exception 'VERIFY(e): the member reads the leader''s picks as %', public.hr_hunt_party_view(v_b, 0)->'leader_densities'; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_hunt_density_set(0, v_big, v_mx - 1, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(e): the leader''s pick was refused: %', v; end if;
    insert into public.hunt_instances (id, hunt_id, kind, settled_to, next_swing_at) values (v_pid, v_big, 'party', now(), now());
    perform public.hr_hunt_open_session(v_b, 0, v_big, null, 0, null, v_pid, now(), 1);
    if (select density from public.hunt_instances where id = v_pid) is distinct from v_mx - 1
       or public.hr_hunt_density_pick(v_pid, v_b, 0) is distinct from v_mx - 1 then
      raise exception 'VERIFY(e): the party instance froze % (leader % , member 3)', (select density from public.hunt_instances where id = v_pid), v_mx - 1; end if;

    -- (f) THE SETTINGS SECTION HAS NO DENSITY.
    if public.hr_hunt_settings_view(v_a, 0) ? 'density' then raise exception 'VERIFY(f): hunt_settings still names a density'; end if;
    raise exception using errcode = 'HRD17', message = 'density-home §7 complete - rolling back';
  exception when sqlstate 'HRD17' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_a, v_b)) or exists (select 1 from public.hunt_density where user_id in (v_a, v_b))
     or exists (select 1 from public.hunt_parties where id = v_pid) or exists (select 1 from public.hunt_instances where id = v_pid) then
    raise exception 'VERIFY: §7 LEAKED a probe row'; end if;
  -- (f) the move left no density on any action set.
  if exists (select 1 from public.player_action_sets where options ? 'density') then
    raise exception 'VERIFY(f): an action set still holds a density'; end if;
  -- (g) THE GRANTS: the table is server-only; the intent is the signed-in player's; the rest the owner's.
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hunt_density')
     or not (select relrowsecurity from pg_class where oid = 'public.hunt_density'::regclass) then
    raise exception 'VERIFY(g): hunt_density carries a policy or has RLS off'; end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(v_role, 'public.hunt_density', 'select,insert,update,delete,truncate') then
      raise exception 'VERIFY(g): % holds a privilege on hunt_density', v_role; end if;
    if has_function_privilege(v_role, 'public.hr_hunt_density_view(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_density_pick(uuid,uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_density_freeze()', 'execute') then
      raise exception 'VERIFY(g): % reaches a density internal', v_role; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_hunt_density_set(integer,text,integer,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_hunt_density_set(integer,text,integer,uuid)', 'execute') then
    raise exception 'VERIFY(g): hr_hunt_density_set is not the signed-in player''s alone'; end if;
  if to_regprocedure('public.hr_hunt_density_pick(uuid,uuid,integer,integer)') is not null then
    raise exception 'VERIFY(g): the preset-reading pick survived'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'density-home: a pick per ground persists, refused over the ground''s max, never another player''s; a setup is no density; a party plays its leader''s pick; all green';
end $$;
