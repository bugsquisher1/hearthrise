-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE CHARACTER WINDOW'S SERVER HALF (lane character-window,
-- 2026-10-18). STAGED. Game CLOSED: applies on its passing §6 (CLAUDE.md §2,
-- Tyler 10-17); Security reviews it in the reopen gate. Nothing here moves
-- gold, items, XP or a ranked value.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   §1 OUTFITS ARE PER-CHARACTER SERVER DATA (cosmetic). hr_outfits is the
--      catalogue (src/data/outfits.js: id, premium, the colour regions its art
--      masks define); hr_outfit_dyes the dye list (src/data/outfits.js DYES,
--      each a colour of the world palette). player_outfits holds what each
--      character wears and its region colours. OWNERSHIP IS THE SERVER'S: a
--      free outfit is everyone's; a premium one is owned while the character's
--      premium is active (hr_premium_active; PREMIUM_PERKS.outfits). A lapsed
--      premium outfit is not shown as worn (the view answers null: the role's
--      own look) and is kept, so renewing restores it.
--   §2 hr_outfit_set(slot, outfit, colors, idem) — THE ONE WRITE: an outfit
--      the character owns (or null: the role's own look), colours only for the
--      outfit's own regions, each a dye index. Rate-gated (`hunt`, with the
--      other character-setup writes), idempotent (player_intents).
--   §3 THE DEATH LOG: every fall the server keeps (the `fall` events of the
--      hunts hr_hunt_new_session retains, `sessions_kept`), newest first, with
--      where, what felled the hero and the XP the fall cost (the settle's
--      stated price). A view over existing rows; no new table.
--   §4 THE CHARACTER SHEET. The combat numbers are the hunt engine's own
--      snapshot (supabase/functions/hr-accrue/character-sheet.js, over
--      accrual.js heroSnapshot), written by the engine's `sheet` verb into
--      hr_character_sheets COMPARE-AND-SET against hr_character_sheet_inputs —
--      the md5 of every input it depends on (skill levels, the worn set, the
--      combat style, the active buffs, the perk stack). The view projects a
--      stored sheet only while that fingerprint is current (`fresh`), so a
--      sheet is never shown for a loadout the character no longer has. Beside
--      it, what SQL owns outright: the combat level, max HP, and the bestiary
--      completion (distinct monsters slain over the combat catalogue).
--   §5 THREE ENVELOPE SECTIONS, as hr_state_sections rows (architecture
--      contracts X7; no hr_state_of body edit): `outfit`, `death_log`,
--      `character_sheet`.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- An outfit a player could forge would be a premium look for free: closed by
-- the ownership check against the server's premium column. A colour value is
-- an index into a server table, bounded; a region key must be the outfit's.
-- The sheet table has no client grant and its only writer is hr_engine; a
-- forged sheet would be a wrong DISPLAY number, never an input: no fight,
-- price or gate reads hr_character_sheets.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Delete the three hr_state_sections rows; drop hr_outfit_set, the views, the
-- inputs/put functions and the four tables. hr_state_of is untouched.
--
-- ORDER: after 2026-10-24-hunterall-119.sql (the section registry, premium,
-- the hunt session events) and 2026-10-25-outfits-catalogue.generated.sql (the
-- outfit catalogue). No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_state_sections') is null
     or to_regprocedure('public.hr_state_sections_of(uuid,integer)') is null then
    raise exception 'PRECONDITION: no section registry — apply 2026-10-23-character-premium.sql first'; end if;
  if to_regprocedure('public.hr_premium_active(uuid,integer,timestamp with time zone)') is null then
    raise exception 'PRECONDITION: hr_premium_active is absent (2026-10-23-character-premium.sql)'; end if;
  if to_regprocedure('public.hr_bounty_combat_level(uuid,integer)') is null
     or to_regprocedure('public.hr_bestiary_of(uuid,integer)') is null
     or to_regprocedure('public.hr_perks_of(uuid,integer)') is null
     or to_regprocedure('public.hr_level_from_xp(bigint)') is null then
    raise exception 'PRECONDITION: hr_bounty_combat_level / hr_bestiary_of / hr_perks_of / hr_level_from_xp is absent'; end if;
  if to_regclass('public.hunt_session_events') is null or to_regclass('public.hunt_sessions') is null then
    raise exception 'PRECONDITION: no hunt sessions (2026-10-21-hunt-sessions.sql)'; end if;
  if to_regprocedure('public.hr_rpc_gate(text)') is null
     or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null
     or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null then
    raise exception 'PRECONDITION: hr_rpc_gate / hr_intent_replay / hr_note_rejection is absent'; end if;
  if to_regclass('public.hr_outfits') is null or to_regclass('public.hr_outfit_dyes') is null
     or not exists (select 1 from public.hr_outfits) then
    raise exception 'PRECONDITION: no outfit catalogue — apply 2026-10-25-outfits-catalogue.generated.sql first'; end if;
  if exists (select 1 from public.hr_state_sections where key in ('outfit', 'death_log', 'character_sheet')
              and fn not in ('hr_outfit_view', 'hr_death_log_view', 'hr_character_sheet_view')) then
    raise exception 'PRECONDITION: a section key this file registers is taken by another view'; end if;
end $mig$;

-- ── §1 OUTFITS: THE CATALOGUE, THE DYES, WHAT EACH CHARACTER WEARS ───────────
-- The catalogue (hr_outfits, hr_outfit_dyes) is GENERATED from src/data/outfits.js
-- and the --dye-N tokens by tools/gen-outfits.mjs (--check) into
-- 2026-10-25-outfits-catalogue.generated.sql, which applies BEFORE this file.
create table if not exists public.player_outfits (
  user_id    uuid not null,
  slot       int  not null,
  outfit_id  text references public.hr_outfits (outfit_id) on delete set null,
  colors     jsonb not null default '{}'::jsonb check (jsonb_typeof(colors) = 'object' and octet_length(colors::text) <= 256),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot),
  constraint player_outfits_char_fk foreign key (user_id, slot)
    references public.player_state (user_id, slot) on delete cascade
);
alter table public.player_outfits enable row level security;
revoke all on public.player_outfits from public, anon, authenticated, service_role;
grant select on public.player_outfits to authenticated;
drop policy if exists player_outfits_own_read on public.player_outfits;
create policy player_outfits_own_read on public.player_outfits for select to authenticated using (user_id = auth.uid());

-- The outfits this character owns: every free one, and the premium ones while premium is active.
create or replace function public.hr_outfit_owned(p_user uuid, p_slot int)
returns text[] language sql stable set search_path = public, pg_catalog as $$
  select coalesce(array_agg(o.outfit_id order by o.sort), '{}')
    from public.hr_outfits o
   where not o.premium or public.hr_premium_active(p_user, p_slot, now())
$$;

-- The `outfit` section: { worn, colors, owned }. A worn outfit no longer owned reads null.
create or replace function public.hr_outfit_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare v_owned text[] := public.hr_outfit_owned(p_user, p_slot); v_po public.player_outfits%rowtype;
begin
  select * into v_po from public.player_outfits where user_id = p_user and slot = p_slot;
  if v_po.outfit_id is not null and not (v_po.outfit_id = any (v_owned)) then v_po.outfit_id := null; end if;
  return jsonb_build_object(
    'worn', v_po.outfit_id,
    'colors', case when v_po.outfit_id is null then '{}'::jsonb else coalesce(v_po.colors, '{}'::jsonb) end,
    'owned', to_jsonb(v_owned));
end $$;

-- ── §2a hr_rpc_gate RESTATED WHOLE, + the `outfit` bucket ───────────────────
-- Pinned: the restatement runs only over the chain-end body (2026-10-21-hunt-
-- sessions.sql, md5 below), so a bucket another file added meanwhile is
-- refused, never clobbered. A body that already IS this restatement is a no-op.
do $mig$
declare v_md5 text; v_src text;
begin
  select md5(replace(prosrc, chr(13), '')), prosrc into v_md5, v_src from pg_proc where oid = 'public.hr_rpc_gate(text)'::regprocedure;
  if v_md5 <> '724b4e34309e06f3a585b262aa59a74a' and strpos(v_src, 'when ''outfit'' then') = 0 then
    raise exception 'hr_rpc_gate is not the body this file restates (md5 %) — a bucket was added since 2026-10-21-hunt-sessions.sql; restate from that body instead', v_md5;
  end if;
end $mig$;

CREATE OR REPLACE FUNCTION public.hr_rpc_gate(p_bucket text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  c_unkeyed_limit constant int := 600;
  v_uid    uuid := auth.uid();
  v_limit  int;
  v_window constant interval := interval '1 minute';
  v_weight bigint;
  v_ip     text;
  v_bucket text;
  v_key    uuid;
begin
  -- CLOSED MODE (2026-10-21-closed-mode.sql): a signed-in caller who is not
  -- admitted is refused hr_closed (HTTP 403) before any bucket is spent.
  perform public.hr_access_check();
  case p_bucket
    when 'clan_seat_read', 'clan_vote_read', 'hr_leaderboard',
         'hr_rally_pledge_state', 'hr_display_name_available', 'hr_server_now',
         'clan_invites_list',
         'hr_goal_state'
      then v_limit := 120;
    when 'buy_listing', 'clan_board_claim', 'clan_board_progress', 'clan_contribute',
         'clan_deposit', 'clan_feast_deposit', 'clan_rested_grant', 'clan_vote_cast',
         'clan_work_complete', 'clan_work_labour', 'clan_work_supply',
         'raid_claim', 'raid_strike',
         'world_event_absence_claim', 'world_event_claim', 'world_event_contribute',
         'world_event_join', 'world_event_pledge', 'world_event_pledge_settle',
         'farm_plant', 'farm_harvest', 'farm_water',
         'worker_hire', 'worker_assign',
         'bank_move',
         'hr_credit_kills', 'hr_credit_combat_xp',
         'client_state_put'
      then v_limit := 60;
    when 'hr_set_style'
      then v_limit := 30;
    when 'bug_report_submit', 'claim_beta_invite', 'claim_display_name',
         'clan_board_roll', 'clan_feast_call', 'clan_hunt_declare', 'clan_tier_up',
         'clan_vice_set', 'clan_vote_close', 'clan_vote_open', 'clan_work_post',
         'clan_create', 'clan_join', 'clan_leave', 'clan_kick',
         'clan_invite', 'clan_invite_revoke', 'clan_join_policy_set',
         'hr_claim_quest', 'hr_claim_daily', 'hr_claim_milestone', 'hr_claim_rank',
         'hr_accept_bounty', 'hr_claim_bounty',
         'hr_bounty_spend',
         'hr_trait_buy', 'hr_claim_goal'
      then v_limit := 12;
    when 'beta_invite_check'
      then v_limit := 20;
    when 'hr_buy_hero_slot' then v_limit := 12;
    when 'hr_heartbeat' then v_limit := 6;
    when 'hr_town_of' then v_limit := 30;
    when 'hr_set_presence_quiet' then v_limit := 4;
    when 'hr_world_finds_of' then v_limit := 6;
    when 'hr_buy_gem_unlock' then v_limit := 12;
    when 'hr_recipe_learn' then v_limit := 12;
    when 'hr_vigour_refill' then v_limit := 6;
    when 'party' then v_limit := 12;
    when 'party_hunt_view' then v_limit := 20;
    when 'hr_claim_discord_gift' then v_limit := 6;
    when 'hr_tally_state' then v_limit := 120;
    -- HUNT SESSIONS (2026-10-21-hunt-sessions.sql): every session / bag /
    -- action-bar write shares `hunt`; a manual press is `hunt_use` (one per
    -- second is the action bar's own buff cooldown); the Analyzer and the read
    -- cursor are `hunt_read`.
    when 'hunt' then v_limit := 30;
    when 'hunt_use' then v_limit := 60;
    when 'hunt_read' then v_limit := 60;
    -- THE CHARACTER WINDOW (2026-10-25-character-sheet.sql): the outfit save.
    when 'outfit' then v_limit := 20;
    else return false;
  end case;

  if v_uid is not null then
    v_key    := v_uid;
    v_bucket := 'rpc:' || p_bucket;
  else
    v_ip := public.hr_request_ip();
    if v_ip is not null then
      v_key    := md5('anon-ip:' || v_ip)::uuid;
      v_bucket := 'rpc:anon:' || p_bucket;
    else
      v_key    := md5('anon-unkeyed')::uuid;
      v_bucket := 'rpc:anon-unkeyed:' || p_bucket;
      v_limit  := c_unkeyed_limit;
    end if;
  end if;

  if public.hr_rate_ok(v_key, v_bucket, v_limit, v_window) then
    return true;
  end if;

  v_weight := public.hr_rate_sample_weight(
                public.hr_rate_over(v_key, v_bucket) - v_limit);
  if v_weight > 0 then
    perform public.hr_record_rejection(v_key, 0,
      case when v_uid is null then 'anon:' || p_bucket else p_bucket end,
      'rate_limited',
      jsonb_build_object('limit', v_limit, 'per', v_window::text, 'gate', 'rpc',
                         'anon', v_uid is null), v_weight);
  end if;
  return false;
end $function$;
revoke execute on function public.hr_rpc_gate(text) from public;
revoke execute on function public.hr_rpc_gate(text) from anon, authenticated, service_role;

-- ── §2 THE ONE OUTFIT WRITE ──────────────────────────────────────────────────
create or replace function public.hr_outfit_set(p_slot int, p_outfit text, p_colors jsonb, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'outfit_set';
  v_uid  uuid := auth.uid();
  v_r    jsonb;
  v_o    public.hr_outfits%rowtype;
  v_k    text;
  v_v    jsonb;
  v_cols jsonb := coalesce(p_colors, '{}'::jsonb);
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('outfit') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if jsonb_typeof(v_cols) <> 'object' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_colors')); end if;
  if p_outfit is not null then
    select * into v_o from public.hr_outfits where outfit_id = p_outfit;
    if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_outfit')); end if;
    if not (p_outfit = any (public.hr_outfit_owned(v_uid, p_slot))) then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_owned', 'premium', v_o.premium)); end if;
  elsif v_cols <> '{}'::jsonb then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_colors')); end if;
  for v_k, v_v in select key, value from jsonb_each(v_cols) loop
    if not (v_k = any (v_o.regions)) then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_region', 'field', left(v_k, 32))); end if;
    if jsonb_typeof(v_v) <> 'number' or not exists (select 1 from public.hr_outfit_dyes d where d.idx::numeric = (v_v #>> '{}')::numeric) then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_dye', 'field', left(v_k, 32))); end if;
  end loop;
  insert into public.player_outfits (user_id, slot, outfit_id, colors, updated_at)
    values (v_uid, p_slot, p_outfit, v_cols, now())
  on conflict (user_id, slot) do update set outfit_id = excluded.outfit_id, colors = excluded.colors, updated_at = now();
  v_r := jsonb_build_object('ok', true, 'outfit', public.hr_outfit_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- ── §3 THE DEATH LOG ─────────────────────────────────────────────────────────
-- Newest first, at most the falls of the hunts the character keeps, capped at 30.
create or replace function public.hr_death_log_view(p_user uuid, p_slot int)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'at', d.at, 'hunt', d.hunt_id, 'monster', nullif(d.data->>'monster', ''),
           'xp', case when d.data ? 'xp' then (d.data->>'xp')::bigint end,
           'xp_lost', case when jsonb_typeof(d.data->'xp_lost') = 'object' then d.data->'xp_lost' end)
         order by d.at desc, d.id desc), '[]'::jsonb)
    from (select e.id, e.at, e.data, h.hunt_id
            from public.hunt_sessions h
            join public.hunt_session_events e on e.session_id = h.id and e.type = 'fall'
           where h.user_id = p_user and h.slot = p_slot
           order by e.at desc, e.id desc
           limit 30) d
$$;

-- ── §4 THE CHARACTER SHEET ───────────────────────────────────────────────────
create table if not exists public.hr_character_sheets (
  user_id     uuid not null,
  slot        int  not null,
  inputs_md5  text not null check (inputs_md5 ~ '^[0-9a-f]{32}$'),
  engine_version text not null check (engine_version ~ '^([0-9a-f]{64}|unpacked)$'),
  sheet       jsonb not null check (jsonb_typeof(sheet) = 'object' and octet_length(sheet::text) <= 2048),
  computed_at timestamptz not null default now(),
  primary key (user_id, slot),
  constraint hr_character_sheets_char_fk foreign key (user_id, slot)
    references public.player_state (user_id, slot) on delete cascade
);
alter table public.hr_character_sheets enable row level security;
revoke all on public.hr_character_sheets from public, anon, authenticated, service_role;

-- THE ENGINE THE LATEST SHEET WAS COMPUTED BY (the edge payload hash,
-- supabase/functions/hr-accrue/payload-hash.js). Every put records its engine;
-- a sheet computed by any other engine is not fresh, so a deploy (an engine
-- change, an item or role row) retires every older sheet at its first put.
create table if not exists public.hr_character_sheet_engine (
  id      boolean primary key default true check (id),
  version text not null check (version ~ '^([0-9a-f]{64}|unpacked)$'),
  at      timestamptz not null default now()
);
alter table public.hr_character_sheet_engine enable row level security;
revoke all on public.hr_character_sheet_engine from public, anon, authenticated, service_role;

-- A sheet's stamp: its inputs' fingerprint under the engine that computed it.
create or replace function public.hr_character_sheet_stamp(p_inputs text, p_version text)
returns text language sql immutable set search_path = public, pg_catalog as $$
  select md5(coalesce(p_inputs, '') || ':' || coalesce(p_version, ''))
$$;

-- The fingerprint of every input the engine's sheet reads (character-sheet.js characterSheetOf).
create or replace function public.hr_character_sheet_inputs(p_user uuid, p_slot int)
returns text language sql stable security definer set search_path = public, pg_catalog as $$
  select md5(jsonb_build_object(
    'skills', coalesce((select jsonb_object_agg(s.skill_id, public.hr_level_from_xp(s.xp))
                          from public.player_skills s where s.user_id = p_user and s.slot = p_slot), '{}'::jsonb),
    'equipment', coalesce((select jsonb_object_agg(q.equip_slot, q.item_id)
                             from public.player_equipment q where q.user_id = p_user and q.slot = p_slot), '{}'::jsonb),
    'style', coalesce((select ps.combat_style from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot), '{}'::jsonb),
    'buffs', coalesce((select jsonb_agg(jsonb_build_object('type', b.v->>'type', 'magnitude', b.v->'magnitude', 'until', b.v->>'until')
                                        order by b.v->>'until', b.v->>'type')
                         from public.player_state ps, jsonb_array_elements(coalesce(ps.buffs, '[]'::jsonb)) b(v)
                        where ps.user_id = p_user and ps.slot = p_slot
                          and (b.v->>'until')::timestamptz > now()
                          and (b.v->>'from' is null or (b.v->>'from')::timestamptz <= now())), '[]'::jsonb),
    'perks', public.hr_perks_of(p_user, p_slot) - 'sources')::text)
$$;

-- THE ONE WRITER (hr_engine). Records the calling engine; stores the engine's
-- sheet only when the inputs it was computed from are still current, stamped
-- with that engine; answers the character's envelope.
create or replace function public.hr_character_sheet_put(p_user uuid, p_slot int, p_inputs text, p_version text, p_sheet jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if p_user is null or p_slot is null then return jsonb_build_object('ok', false, 'error', 'bad_args'); end if;
  if p_version is null or p_version !~ '^([0-9a-f]{64}|unpacked)$' then return jsonb_build_object('ok', false, 'error', 'bad_version'); end if;
  if not exists (select 1 from public.player_state where user_id = p_user and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if p_sheet is null or jsonb_typeof(p_sheet) <> 'object' or octet_length(p_sheet::text) > 2048 then
    return jsonb_build_object('ok', false, 'error', 'bad_sheet'); end if;
  insert into public.hr_character_sheet_engine (id, version, at) values (true, p_version, now())
    on conflict (id) do update set version = excluded.version, at = now()
    where public.hr_character_sheet_engine.version is distinct from excluded.version;
  if p_inputs is not null and p_inputs = public.hr_character_sheet_inputs(p_user, p_slot) then
    insert into public.hr_character_sheets (user_id, slot, inputs_md5, engine_version, sheet, computed_at)
      values (p_user, p_slot, public.hr_character_sheet_stamp(p_inputs, p_version), p_version, p_sheet, now())
    on conflict (user_id, slot) do update set inputs_md5 = excluded.inputs_md5, engine_version = excluded.engine_version,
      sheet = excluded.sheet, computed_at = now();
  end if;
  return public.hr_state_of(p_user, p_slot);
end $$;

-- The `character_sheet` section. `combat` is the engine's sheet while fresh, else
-- null: fresh = computed by the latest engine, over the inputs as they are now.
create or replace function public.hr_character_sheet_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare v_cs public.hr_character_sheets%rowtype; v_fresh boolean := false; v_engine text;
begin
  select * into v_cs from public.hr_character_sheets where user_id = p_user and slot = p_slot;
  if found then
    select e.version into v_engine from public.hr_character_sheet_engine e where e.id;
    v_fresh := v_cs.engine_version = v_engine
      and v_cs.inputs_md5 = public.hr_character_sheet_stamp(public.hr_character_sheet_inputs(p_user, p_slot), v_engine);
  end if;
  return jsonb_build_object(
    'level', public.hr_bounty_combat_level(p_user, p_slot),
    'max_hp', (select ps.max_hp from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot),
    'bestiary', jsonb_build_object(
      'slain', (select count(*) from public.hr_bestiary_of(p_user, p_slot) b
                 where exists (select 1 from public.hr_activities a where a.kind = 'combat' and a.activity_id = b.monster_id)),
      'total', (select count(*) from public.hr_activities a where a.kind = 'combat')),
    'fresh', v_fresh,
    'combat', case when v_fresh then v_cs.sheet end,
    'computed_at', case when v_fresh then v_cs.computed_at end);
end $$;

-- ── §5 GRANTS (exact, revoke first) AND THE SECTION ROWS ─────────────────────
do $mig$
declare f text; r text;
begin
  foreach f in array array[
    'public.hr_outfit_owned(uuid, int)', 'public.hr_outfit_view(uuid, int)', 'public.hr_outfit_set(int, text, jsonb, uuid)',
    'public.hr_death_log_view(uuid, int)', 'public.hr_character_sheet_inputs(uuid, int)',
    'public.hr_character_sheet_put(uuid, int, text, text, jsonb)', 'public.hr_character_sheet_view(uuid, int)',
    'public.hr_character_sheet_stamp(text, text)'] loop
    execute format('revoke execute on function %s from public', f);
    foreach r in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = r) then execute format('revoke execute on function %s from %I', f, r); end if;
    end loop;
  end loop;
end $mig$;
grant execute on function public.hr_outfit_set(int, text, jsonb, uuid) to authenticated;
grant execute on function public.hr_character_sheet_inputs(uuid, int) to hr_engine;
grant execute on function public.hr_character_sheet_put(uuid, int, text, text, jsonb) to hr_engine;

delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_outfit_set';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_outfit_set', 'p_slot integer, p_outfit text, p_colors jsonb, p_idem uuid', 'authenticated',
   'added 2026-10-25 (character window): wear an owned outfit with dye indices per region; cosmetic, no value; rate bucket outfit');

insert into public.hr_state_sections (key, fn, note) values
  ('outfit', 'hr_outfit_view', '2026-10-25-character-sheet.sql: the worn outfit (owned or null), its region dyes, the owned list'),
  ('death_log', 'hr_death_log_view', '2026-10-25-character-sheet.sql: the kept falls, newest first: where, by what, the XP price'),
  ('character_sheet', 'hr_character_sheet_view', '2026-10-25-character-sheet.sql: combat level, max HP, bestiary completion, the engine sheet while fresh')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §5b THE DETECTOR LEARNS THE TWO ENGINE ENTRIES (link 20) ─────────────────
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
  v_ops_reach     jsonb;   -- T-5: the pg_net sink hr_ops reachable by a client/engine role
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
    -- ── ADDED 2026-10-25 — THE CHARACTER SHEET (lane character-window) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Each claim re-derived:
    --
    -- read-only (STABLE): the md5 of the character's skill levels, worn set,
    -- combat style, active buffs and hr_perks_of — values hr_state_of and
    -- hr_perks_of already answer the engine. Target (p_user, p_slot), the
    -- hr_state_of pair.
    'hr_character_sheet_inputs(uuid,integer)',
    -- SELF-VALIDATING: writes ONE display row (hr_character_sheets) for the
    -- (p_user, p_slot) the engine already reads, only when the fingerprint it
    -- is handed equals the current one, stamped with the calling engine's
    -- payload hash, bounded (an object, <= 2 KB). No fight,
    -- price, gate or other player reads the row; it moves no value. Answers
    -- hr_state_of, which the engine already holds.
    'hr_character_sheet_put(uuid,integer,text,text,jsonb)',
    -- ── ADDED 2026-10-23 — THE INSTANCE SETTLE (lane S1, HUNT_SCREEN_SPEC §1.3) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Each claim re-derived:
    --
    -- read-only (STABLE): the instance the caller's OPEN session hunts in — its
    -- clock, world, the keyed-seed secret hr_seed(null, 0, 'hunt:' || instance)
    -- — and every OPEN member's session and hr_state_of. Its target argument is
    -- (p_user, p_slot), the hr_state_of pair; the members it adds are characters
    -- the engine already reads and settles (it holds hr_state_of / hr_apply).
    'hr_hunt_instance_read(uuid,integer)',
    -- SELF-VALIDATING, the hr_apply claim: under the instance lock and its
    -- world_swing CAS, with the member set held to the instance's open sessions,
    -- it CALLS hr_apply (every invariant of each member's value half, under that
    -- member's character lock) and the session applier (swing CAS, window, bag,
    -- per-lane use caps, falls journalled, every end re-proved), plus the kill
    -- bound, the value bound, the store's catalogue prices, the stamina bound
    -- and the world's shape and byte bound — in ONE subtransaction; a refusal
    -- anywhere rolls every member back. It pays nothing hr_apply would refuse.
    'hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)',
    -- ── ADDED 2026-10-22 — THE HUNT SETTLE (ruling HR-2026-10-14, lane C2) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Each claim re-derived:
    --
    -- read-only: the id of the character's OPEN session or null. Same target
    -- argument as hr_state_of (p_user, p_slot), one indexed row.
    'hr_hunt_open_of(uuid,integer)',
    -- read-only (STABLE): one open session — clock, bag, action bar — and the
    -- session secret hr_seed(user, slot, 'hunt:' || id), i.e. a value the
    -- engine could already ask hr_seed for. Accepts no target the engine is
    -- not already authorised for (the hr_apply/hr_state_of pair).
    'hr_hunt_engine_read(uuid,integer)',
    -- SELF-VALIDATING, the hr_apply claim: it CALLS hr_apply (which re-checks
    -- every invariant of the value half under its own version CAS) and
    -- hr_hunt_settle_session (swing CAS, window, bag, use caps, presses only
    -- shrink, falls journalled, every end re-proved), in ONE subtransaction —
    -- a refusal in either half rolls both back. Its own writes are the press
    -- (validated as hr_hunt_use validates one) and a buff queue admitted only
    -- when this window's bag uses paid for every new segment. It pays nothing
    -- hr_apply would refuse.
    'hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
    -- NOT READ-ONLY, bounded: the CLOSED-MODE answer for a refused edge call
    -- (Security, closed-mode review item 4). Asked only after hr_rate_gate
    -- refused (p_user, p_slot) — the pair the engine already passes it. It
    -- reads hr_admitted for that user and, when not admitted, writes ONE
    -- hr_rejections aggregate upsert (code 'closed') for that user; it moves
    -- no value and names no other target.
    'hr_engine_closed(uuid,integer,text)',
    -- ── ADDED 2026-10-10 — THE PRESENCE HORIZON (Game Designer ruling on B1) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list.
    --
    -- NOT READ-ONLY, and the claim rests on SELF-VALIDATING: the caller names
    -- only (p_user, p_slot), the pair it already passes to hr_state_of. The
    -- answer is hr_offline_cap_ms bounded by the character's own
    -- hr_return_anchor; its ONE write is a forfeit of an absence whose horizon
    -- is spent and past, made THROUGH hr_apply (version CAS, journalled
    -- intent horizon_forfeit, key derived from the anchor) and moving only
    -- accrued_to forward to now(). It can pay nothing: no gold, no item, no XP.
    'hr_accrue_cap_ms(uuid,integer)',
    -- ── ADDED 2026-10-06 — THE SHADOW PARITY PROBE (Security ruling 1) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- READ-ONLY (STABLE): the fetch returns ONE open probe row of ONE
    -- character, and only to the holder the ROSTER leased that character to,
    -- inside the lease. Its payload is a snapshot the engine itself built from
    -- hr_state_of, which hr_engine already reads for any character it names.
    -- NO NEW TARGET: (p_user, p_slot) is the pair the engine already passes to
    -- hr_state_of and hr_tick_settle.
    'hr_tick_probe_fetch(text,uuid,integer,text)',
    -- NOT READ-ONLY, and the claim rests on its WRITE TARGET: its only write
    -- is the operator table the probe owns (RLS forced, no policy, no client
    -- or engine grant, classified operational + player_value_exempt). It
    -- writes no player_state, no ledger, no inventory, no hr_tick_ownership
    -- (it takes no row lock either), no shadow row and no frame — proved by
    -- execution over EVERY user table's transaction tuple counters in its
    -- migration's p3. SELF-VALIDATING: the caller names a holder, a character
    -- and a window, and the window must be the character's journalled SHADOW
    -- CHAIN HEAD under a lease the roster stamped — so it can only measure a
    -- span the fence actually tiled, never invent one, and an armed channel
    -- cannot reach it at all. Nothing reads its rows to decide a number a
    -- player can spend, rank or trade. NO NEW TARGET.
    'hr_tick_probe_commit(text,uuid,integer,text,timestamp with time zone,timestamp with time zone,text,bigint,jsonb,jsonb)',
    -- ── ADDED 2026-09-23 — THE PARTY FENCE AND ITS PREDICATE (M8 S2) ────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- ⚠ hr_party_tick_settle IS NOT READ-ONLY, and the claim rests on
    -- SELF-VALIDATING, re-derived rather than carried across from
    -- hr_tick_settle's entry. It is the world tick's ONE door to player value
    -- for a PARTY, and its whole caller-supplied surface is a holder name, a
    -- party id, a window [from,to), an idempotency uuid and an array of 1..4
    -- member objects — every one of which is CHECKED AGAINST THE DATABASE
    -- before a value moves:
    --   * THE LEASE, at party grain. The caller must name a party the ROSTER
    --     handed it, in its own holder name, inside the lease window.
    --     hr_party_roster is executable by `hr_tick` and by NOTHING ELSE, and
    --     hr_engine is asserted NOT to hold it, so a settling role
    --     structurally cannot stamp its own lease.
    --   * THE PARTY LOCK, taken FIRST, which is what serialises a settle
    --     against a join, a leave and a kick.
    --   * THE WATERMARK CAS, the PARTY's, computed once under that lock and
    --     byte-identical in every term to hr_tick_settle's own.
    --   * INVARIANT 8, PER MEMBER: `player_state.accrued_to` must EQUAL the
    --     party watermark. An inequality either way is a broken invariant and
    --     the whole call is refused — there is no branch that reconciles.
    --   * THE LIVE MEMBER SET, re-counted UNDER THE LOCK and asserted equal to
    --     the declared set with no member named twice. A subset is a partial
    --     settle, which pays some members a split computed from all of them —
    --     a mint, and the one defect that cannot be recovered after the fact.
    --   * THE DECLARED WINDOW IS BOUND TO THE PAID ONE per member
    --     (`delta->>'accrued_to' = p_window_to`), and the delta's top-level
    --     key set is asserted to be a solo combat settle's, so attribution
    --     cannot ride in the delta and no unknown key can reach hr_apply.
    --   * AND THEN hr_apply RE-VALIDATES EVERY INVARIANT regardless of caller.
    --     It is the only money writer; this function computes and fences and
    --     never moves a value except through it, once per member, inside ONE
    --     transaction whose savepoint rolls the whole fan-out back if any
    --     member cannot be paid.
    -- NO NEW TARGET: the members it names are (user, slot) pairs the engine
    -- already passes to hr_apply and hr_state_of. The holder of hr_apply can
    -- already WRITE any character it names; this is strictly NARROWER.
    --
    -- ⚠ hr_partied IS READ-ONLY, which is the strongest form an entry here can
    -- take: `stable sql`, one EXISTS over party_member joined to party_hunt,
    -- no row written, so it cannot be replayed into a gain. NO NEW TARGET —
    -- (p_user, p_slot), the same pair again. WHY THE ENGINE NEEDS IT: it is
    -- invariant 8's fence at the intent door. A partied character's own
    -- `accrue` is refused `party_settle_required` and every other
    -- collectsFirst verb `party_hunt_running`, because the timing of an
    -- ordinary client intent would otherwise re-price a window three other
    -- players are paid from — CLAUDE.md §1's target property failing by timing
    -- rather than by number. No client role holds it: a client-callable
    -- membership predicate is an oracle it can sweep.
    'hr_party_tick_settle(text,uuid,timestamp with time zone,timestamp with time zone,uuid,jsonb)',
    'hr_partied(uuid,integer)',
    -- ── ADDED 2026-09-22 — THE HUNT'S TWO READS (M6) ───────────────────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- ⚠ BOTH ARE READ-ONLY, WHICH IS THE WHOLE CLAIM, and it is the strongest
    -- form an entry on this list can take: neither writes a row, so neither can
    -- be replayed into a gain, and a forged call returns another shape of data
    -- the caller can already reach. Both are asserted STABLE and both are
    -- asserted free of INSERT/UPDATE/DELETE by their own migrations' section-4
    -- gates, which run at apply time and refuse to install a body that grew a
    -- write.
    --
    -- NO NEW TARGET. Each takes (p_user, p_slot) — the SAME pair the engine
    -- already passes to hr_state_of and hr_apply, both of which it already
    -- holds. The holder of hr_apply can already WRITE any character it names;
    -- these are strictly NARROWER than what it already has, and they exist so
    -- the ONE envelope the client renders carries the hunt readout rather than
    -- the browser growing a second read of its own (HUNT_ANALYZER_UI.md §6).
    --
    -- WHY THE ENGINE NEEDS THEM: hr_state_of calls both, and hr_state_of is
    -- itself engine-only. They are granted to hr_engine ONLY — no client role
    -- holds either, which tests/hunt-analyzer.mjs A5 and the vigour guard both
    -- assert by executing has_function_privilege rather than by reading a grant
    -- line.
    'hr_hunt_analyzer(uuid,integer)',
    'hr_vigour_of(uuid,integer)',
    -- ── ADDED 2026-09-22 — THE BESTIARY TROPHY PAIR ─────────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8/9:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- read-only (STABLE) projection of the CLAIMED trophy rows for ONE
    -- character: kind='collection', period_key='', key like 'trophy:%'. It
    -- writes nothing and calls nothing that writes. SELF-VALIDATING: the row
    -- set is bounded STRUCTURALLY by the key prefix and by (user, slot) — there
    -- is no parameter through which a caller can widen it. WHY THE ENGINE NEEDS
    -- IT: 2026-09-22-state-of-trophy-prefix.sql removed the trophy population
    -- from hr_state_of's generic envelope (it would breach the 1000-row cap and
    -- silently truncate a player's quest state), so this is now the ONLY door
    -- to it — the same position hr_bestiary_of and hr_collection_of are in.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of.
    'hr_trophy_of(uuid,integer)',
    -- NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a MONSTER ID
    -- (validated against hr_activities kind='combat', the generated,
    -- client-unwritable catalogue), a STAGE (bounded 1..4 against the server's
    -- own ladder) and an idempotency uuid. THERE IS NO KILL-COUNT PARAMETER —
    -- the threshold is judged against a counter the function reads itself from
    -- player_progress, under the SAME advisory lock hr_apply takes — so a
    -- forged count is not refused, it is unrepresentable.
    -- ⚠ AND IT MINTS NOTHING: no gold, no gems, no items, no XP, no multiplier.
    -- It writes ONE flag row (value 1, on conflict do nothing, so a replay is a
    -- refusal) and ONE zero-valued ledger row. The trophy's power is DERIVED
    -- from the kill counters on every read (src/core/trophies.js) and is
    -- already on before this is called, so there is no value here for a forged
    -- or replayed call to move — which is why the CLAUDE.md §1 target property
    -- holds by construction rather than by a clamp. Measured, not asserted:
    -- the migration's §5(e) compares gold/gems/xp/inventory AND accrued_to
    -- across a real claim. NO NEW TARGET: p_user again.
    'hr_trophy_claim(uuid,integer,text,integer,text)',
    -- ── ADDED 2026-09-21 — THE WORLD TICK'S ONE DOOR ───────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8/9:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived.
    -- hr_tick_settle is the FENCE in front of hr_apply for the world tick, and
    -- it is the ONLY route the tick has to player value: the roster WITHDREW
    -- the tick's raw hr_apply grant and this function replaced it. Its whole
    -- caller-supplied surface is a holder name, a (user, slot, channel), a
    -- version, a window [from,to), an idempotency uuid and a delta — and every
    -- one of those is CHECKED AGAINST THE DATABASE before a value moves:
    --   * THE LEASE. The caller must name a character the ROSTER handed it, in
    --     its own holder name, inside the lease window. hr_tick_roster is
    --     executable by `hr_tick` and by NOTHING ELSE, and hr_engine is
    --     asserted NOT to hold it (fence e19), so a settling role structurally
    --     cannot stamp its own lease. "Choose whose world ticks" is closed one
    --     level deeper than a grant.
    --   * THE WATERMARK CAS, under `select ... for update` on player_state
    --     taken BEFORE any comparison: a window at or after the settled mark is
    --     accepted, a window behind it is refused whatever its version and
    --     whatever its key. This holds against a client accrue, a client
    --     collect, a second tick process and a replay of the same call.
    --   * THE DECLARED WINDOW IS BOUND TO THE PAID ONE
    --     (`p_delta->>'accrued_to' = p_window_to`), so a caller cannot name
    --     ten seconds and hand over an hour.
    --   * THE VERSION, and then hr_apply re-validates every invariant regardless
    --     of caller — ONE call site, after every check, no tick-specific clamp
    --     and no fast path.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. The holder of hr_apply can already WRITE any
    -- character it names; this is strictly NARROWER than what it already has.
    -- WHY THE ENGINE NEEDS IT: hr_apply's impersonation seam tests
    -- `v_role = 'hr_engine'` literally, so the tick cannot reach hr_apply as
    -- `hr_tick` at all (S-1, proved by execution); the edge arrives as
    -- hr_engine and this is the door it knocks on. Granted to hr_engine ONLY —
    -- fence e18c asserts `hr_tick` does NOT hold it, because that would be
    -- a door that cannot open and would journal a forgery alert every fire.
    -- ── RESTATED 2026-09-23 — THE TENTH ARGUMENT (M3 shadow-state chain) ─
    -- A REPLACEMENT, not an insertion: this chain's first, and the removed
    -- line is declared in tests/run-sql-tests.mjs PART 1f-ii. The entry is
    -- keyed on `regprocedure`, so a signature change is a DIFFERENT string
    -- and the old one now names a function that does not exist — reported
    -- under `lost` while the real door raises
    -- `engine_execute_outside_allowlist` on the nightly cron every night.
    --
    -- ⚠ THE CLAIM IS UNCHANGED, AND IT IS RE-DERIVED RATHER THAN CARRIED.
    -- The tenth argument is `p_shadow_state jsonb`, and it is the ONLY
    -- caller-supplied value on this function that is neither checked against
    -- the database nor handed to hr_apply. It does not need to be, because it
    -- cannot reach player value at all:
    --   * IT IS WRITTEN ONLY ON THE SHADOW BRANCH, the branch with no
    --     hr_apply call in it, under the same row lock as the watermark it
    --     chains. On the ARMED branch a non-null one is REFUSED
    --     (`shadow_state_while_armed`) before hr_apply is reached — never
    --     ignored, because a carrier silently dropped on the branch that pays
    --     is how a stale proposal would be believed.
    --   * IT IS STORED VERBATIM AND READ BACK BY THE SAME ROLE that wrote it,
    --     into `hr_tick_ownership.shadow_state` — a column on an operator
    --     table that no client role can read or write, bounded by its own
    --     CHECK constraint, and CLEARED together with `shadow_accrued_to`
    --     the moment an armed settle succeeds.
    --   * NOTHING READS IT TO DECIDE A NUMBER A PLAYER CAN SPEND. Its only
    --     consumer is the next SHADOW window, whose entire output is
    --     `hr_tick_shadow` — classified `operational` +
    --     `player_value_exempt` in tests/restore-census.baseline.json on
    --     exactly the basis that losing every row of it costs a measurement
    --     and not a progression.
    -- NO NEW TARGET: p_user is still the parameter the engine already passes
    -- to hr_apply and hr_state_of, and every other check of the fence — the
    -- lease, the watermark CAS under `for update`, the declared-window
    -- binding, the version — is untouched and runs in the same order.
    'hr_tick_settle(text,uuid,integer,text,bigint,timestamp with time zone,timestamp with time zone,uuid,jsonb,jsonb)',
    -- ── ADDED 2026-09-11 — THE QUARTERMASTER SPEND WRITER ───────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a version, an
    -- idempotency uuid, and an OFFER ID (a primary key in the generated,
    -- client-unwritable hr_qm_offers). No item, no qty, no price and no scrip
    -- amount cross. The PRICE and the ITEM come from hr_qm_offers; the scrip
    -- balance is the character's OWN player_state row read under the SAME advisory
    -- lock hr_apply takes; the debit is bounded by that balance
    -- (insufficient_scrip). NO NEW TARGET: p_user is the parameter the engine
    -- already passes to hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT:
    -- dungeon scrip is server-of-record and its SPEND (the Quartermaster) must be
    -- one server transaction with the item grant, or the b372 half-undo returns —
    -- and NO other RPC debits player_state.dungeon_scrip, so without this the only
    -- writer of the spend is the client.
    'hr_quartermaster_buy(uuid,integer,bigint,uuid,text)',
    -- ── ADDED 2026-09-10 — THE DUNGEON SETTLE WRITER ───────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a version, an
    -- idempotency uuid, a DUNGEON ID (a primary key in the generated,
    -- client-unwritable hr_dungeons), a MODE (auto|manual|scavenger), and a
    -- p_quality CLAMPED server-side to [0,1] that scales SELF-ONLY scrip and
    -- touches NO loot. No item, no qty, no chance, no price and no timestamp
    -- cross. Every number it writes comes from hr_dungeons / hr_dungeon_loot or
    -- the character's OWN row read under the SAME advisory lock hr_apply takes;
    -- loot is rolled by the server hr_seed PRNG (never a client value); the entry
    -- KEY is debited from the caller's own player_inventory (the load-bearing
    -- gate); the cooldown and the per-day scrip cap read now() and the
    -- append-only ledger. NO NEW TARGET: p_user is the parameter the engine
    -- already passes to hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT:
    -- dungeon scrip + run loot are server-of-record (dungeon-settlement.md
    -- §1/§2) and NO other RPC writes player_state.dungeon_scrip, so without this
    -- the only writer of the currency is the client.
    'hr_dungeon_settle(uuid,integer,bigint,uuid,text,text,numeric)',
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

  -- (9) T-5 — hr_ops STAYS A SINK (2026-09-28). hr_ops holds the operator-only
  --     routines that read net._http_response, a table PUBLIC can read and our
  --     roles cannot revoke. Keeping hr_ops out of PostgREST's exposed list is
  --     half the property; the other half is that no client or engine role can
  --     USE the schema, CREATE in it, or EXECUTE anything in it — reachability
  --     is the arming condition. tests/pg-net-queue-unreachable.mjs Q-5 guards
  --     the repo; this asks the CATALOGUE, so a grant typed in the dashboard, by
  --     support or by a platform migration is a finding by the next nightly run.
  --     The roles are the six the sink was built against — PUBLIC, anon,
  --     authenticated, service_role, hr_engine, hr_tick — and the two LOGIN
  --     roles those are reached through before SET ROLE: authenticator
  --     (PostgREST) and hr_engine_login (the edge); both are NOINHERIT, so only
  --     a DIRECT grant to them reads here (Security, 2026-09-28). Superusers
  --     and pg_read_all_data (USAGE on every schema, no EXECUTE) are the owner
  --     class and are out of scope by construction. A role that does not
  --     exist is skipped (this file must stand alone), and so is a database
  --     with no hr_ops at all: no sink, nothing to reach. prokind is NOT
  --     filtered — a procedure or an aggregate in hr_ops is reachable too.
  if exists (select 1 from pg_namespace where nspname = 'hr_ops') then
    select coalesce(jsonb_agg(x.g order by x.g), '[]'::jsonb) into v_ops_reach from (
      select 'schema:' || r.role || ':' || pv as g
        from (values ('public'),('anon'),('authenticated'),('service_role'),('hr_engine'),('hr_tick'),
                     ('authenticator'),('hr_engine_login')) r(role)
        cross join unnest(array['USAGE','CREATE']) pv
       where (r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role))
         and has_schema_privilege(r.role, 'hr_ops', pv)
      union all
      select p.oid::regprocedure::text || ':' || r.role
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('public'),('anon'),('authenticated'),('service_role'),('hr_engine'),('hr_tick'),
                     ('authenticator'),('hr_engine_login')) r(role)
       where n.nspname = 'hr_ops'
         and (r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role))
         and has_function_privilege(r.role, p.oid, 'execute')) x;
  else
    v_ops_reach := '[]'::jsonb;
  end if;

  v_report := jsonb_build_object(
    'public_execute_functions',        v_public_exec,
    'unapproved_client_rpcs',          v_unapproved,
    'baseline_rows_no_longer_live',    v_lost,
    'client_truncate_grants',          v_client_trunc,
    'owners_without_failclosed_defacl',v_defacl_open,
    'platform_schema_defacls_open',    v_platform,
    'engine_execute_outside_allowlist',v_engine_extra,
    'engine_table_privileges',         v_engine_tables,
    'hr_ops_reachable',                v_ops_reach,
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
                or jsonb_array_length(v_ops_reach) > 0
                or jsonb_array_length(v_ungated) > 0) then
    raise exception 'GRANT HYGIENE FAILED: %', v_report::text;
  end if;
  return v_report;
end $$;
-- ⟦/DERIVED hr_assert_grant_hygiene⟧
revoke execute on function public.hr_assert_grant_hygiene(boolean) from public, anon, authenticated, service_role;

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_uid  constant uuid := '000000c0-0000-0000-0000-0000c4a5e001';
  v      jsonb;
  v_fp   text;
  v_role text;
  v_keys text[];
  v_sid  uuid;
begin
  -- (a) PRIVILEGES: the write is authenticated only; the internals nobody's but the engine's.
  if not has_function_privilege('authenticated', 'public.hr_outfit_set(integer,text,jsonb,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_outfit_set(integer,text,jsonb,uuid)', 'execute') then
    raise exception 'VERIFY(a): hr_outfit_set grants are wrong'; end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_character_sheet_put(uuid,integer,text,text,jsonb)', 'execute')
       or has_function_privilege(v_role, 'public.hr_character_sheet_inputs(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_character_sheet_view(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_outfit_view(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_death_log_view(uuid,integer)', 'execute') then
      raise exception 'VERIFY(a): % reaches a character-sheet internal', v_role; end if;
    if has_table_privilege(v_role, 'public.hr_character_sheets', 'select,insert,update,delete')
       or has_table_privilege(v_role, 'public.player_outfits', 'insert,update,delete') then
      raise exception 'VERIFY(a): % can touch hr_character_sheets / write player_outfits', v_role; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('player_outfits', 'hr_character_sheets')
              and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')) then
    raise exception 'VERIFY(a): a client write policy exists'; end if;
  if not has_function_privilege('hr_engine', 'public.hr_character_sheet_put(uuid,integer,text,text,jsonb)', 'execute') then
    raise exception 'VERIFY(a): hr_engine cannot write the sheet'; end if;
  -- (b) EXECUTED as a probe character, rolled back.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'character-sheet §6 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): hr_create_character refused: %', v; end if;
    -- the envelope carries the three sections; no hand-written key shadows them.
    v := public.hr_state_of(v_uid, 0);
    if v->'outfit' is null or v->'death_log' is null or v->'character_sheet' is null then
      raise exception 'VERIFY(b): the envelope misses a section: %', jsonb_build_object('o', v->'outfit', 'd', v->'death_log', 'c', v->'character_sheet'); end if;
    select array_agg(s.key) into v_keys from public.hr_state_sections s
     where v->s.key is distinct from public.hr_state_sections_of(v_uid, 0)->s.key;
    if v_keys is not null then raise exception 'VERIFY(b): section(s) % are shadowed', v_keys; end if;
    -- a fresh character: free outfits owned, nothing worn, no sheet, no falls.
    if v->'outfit'->'worn' <> 'null'::jsonb or (v->'outfit'->'owned') ? 'witch' or not (v->'outfit'->'owned') ? 'knight' then
      raise exception 'VERIFY(b): a free character''s outfit section is wrong: %', v->'outfit'; end if;
    if (v->'character_sheet'->>'fresh')::boolean or v->'character_sheet'->'combat' <> 'null'::jsonb
       or (v->'character_sheet'->'bestiary'->>'total')::int < 1 or jsonb_array_length(v->'death_log') <> 0 then
      raise exception 'VERIFY(b): a fresh character''s sheet / death log is wrong: %', v->'character_sheet'; end if;
    -- (c) THE OUTFIT WRITE: owned only, regions only, dyes only, idempotent.
    v := public.hr_outfit_set(0, 'witch', '{}'::jsonb, gen_random_uuid());
    if v->>'error' is distinct from 'not_owned' then raise exception 'VERIFY(c): a premium outfit was worn without premium: %', v; end if;
    v := public.hr_outfit_set(0, 'knight', '{"hat": 1}'::jsonb, gen_random_uuid());
    if v->>'error' is distinct from 'bad_region' then raise exception 'VERIFY(c): a region the outfit lacks was accepted: %', v; end if;
    v := public.hr_outfit_set(0, 'nope', '{}'::jsonb, gen_random_uuid());
    if v->>'error' is distinct from 'unknown_outfit' then raise exception 'VERIFY(c): an unknown outfit was accepted: %', v; end if;
    v := public.hr_outfit_set(0, 'knight', '{}'::jsonb, gen_random_uuid());
    if (v->>'ok')::boolean is not true or v->'outfit'->>'worn' <> 'knight' then raise exception 'VERIFY(c): a free outfit was refused: %', v; end if;
    perform public.hr_premium_grant(v_uid, 0, now() + interval '1 day', 'character-sheet probe');
    v := public.hr_outfit_set(0, 'witch', '{"hat": 6, "robe": 99}'::jsonb, gen_random_uuid());
    if v->>'error' is distinct from 'bad_dye' then raise exception 'VERIFY(c): a dye outside the list was accepted: %', v; end if;
    v := public.hr_outfit_set(0, 'witch', '{"hat": 6, "trim": 8}'::jsonb, '00000000-0000-4000-8000-0000c4a5e0aa');
    if v->'outfit'->>'worn' <> 'witch' or (v->'outfit'->'colors'->>'hat')::int <> 6 then raise exception 'VERIFY(c): a premium outfit was refused with premium: %', v; end if;
    v := public.hr_outfit_set(0, 'knight', '{}'::jsonb, '00000000-0000-4000-8000-0000c4a5e0aa');
    if (select outfit_id from public.player_outfits where user_id = v_uid and slot = 0) <> 'witch' then
      raise exception 'VERIFY(c): a replayed key wrote again'; end if;
    -- a lapsed premium outfit reads null (the role's own look), and is kept.
    update public.player_state set premium_until = now() - interval '1 minute' where user_id = v_uid and slot = 0;
    if public.hr_outfit_view(v_uid, 0)->'worn' <> 'null'::jsonb
       or (select outfit_id from public.player_outfits where user_id = v_uid and slot = 0) <> 'witch' then
      raise exception 'VERIFY(c): a lapsed premium outfit is still shown, or was dropped'; end if;
    -- (d) THE SHEET IS COMPARE-AND-SET: a stale fingerprint writes nothing; a current one is fresh until an input moves.
    v := public.hr_character_sheet_put(v_uid, 0, md5('stale'), 'unpacked', '{"damage": {"min": 1, "max": 9}}'::jsonb);
    if (v->'character_sheet'->>'fresh')::boolean or exists (select 1 from public.hr_character_sheets where user_id = v_uid) then
      raise exception 'VERIFY(d): a sheet from stale inputs was stored'; end if;
    v_fp := public.hr_character_sheet_inputs(v_uid, 0);
    v := public.hr_character_sheet_put(v_uid, 0, v_fp, 'unpacked', '{"damage": {"min": 1, "max": 9}}'::jsonb);
    if not (v->'character_sheet'->>'fresh')::boolean or (v->'character_sheet'->'combat'->'damage'->>'max')::int <> 9 then
      raise exception 'VERIFY(d): a current sheet is not projected: %', v->'character_sheet'; end if;
    -- A NEW ENGINE (a deploy: another payload hash) retires every older sheet at its first put,
    -- even one that wrote nothing; the old engine coming back makes the sheet fresh again.
    perform public.hr_character_sheet_put(v_uid, 0, md5('stale'), repeat('a', 64), '{}'::jsonb);
    if (public.hr_character_sheet_view(v_uid, 0)->>'fresh')::boolean then
      raise exception 'VERIFY(d): a sheet from the previous engine stayed fresh after a deploy'; end if;
    perform public.hr_character_sheet_put(v_uid, 0, md5('stale'), 'unpacked', '{}'::jsonb);
    if not (public.hr_character_sheet_view(v_uid, 0)->>'fresh')::boolean then
      raise exception 'VERIFY(d): the stamp is not md5(inputs || : || engine)'; end if;
    v := public.hr_character_sheet_put(v_uid, 0, v_fp, 'not-a-version', '{}'::jsonb);
    if v->>'error' is distinct from 'bad_version' then raise exception 'VERIFY(d): a malformed engine version was taken: %', v; end if;
    insert into public.player_skills (user_id, slot, skill_id, xp) values (v_uid, 0, 'attack', 100000)
      on conflict (user_id, slot, skill_id) do update set xp = public.player_skills.xp + 100000;
    if (public.hr_character_sheet_view(v_uid, 0)->>'fresh')::boolean then
      raise exception 'VERIFY(d): a sheet stayed fresh after a level moved'; end if;
    v_fp := public.hr_character_sheet_inputs(v_uid, 0);
    delete from public.player_equipment where user_id = v_uid and slot = 0;
    insert into public.player_equipment (user_id, slot, equip_slot, item_id)
      select v_uid, 0, s.equip_slot, s.item_id from public.hr_item_slots s order by s.item_id, s.equip_slot limit 1;
    if public.hr_character_sheet_inputs(v_uid, 0) = v_fp then raise exception 'VERIFY(d): the worn set is not an input'; end if;
    -- (e) THE DEATH LOG reads the kept falls, newest first.
    insert into public.hunt_sessions (user_id, slot, hunt_id, falls_limit, entered_at, hunt_from, settled_to, next_swing_at, ended_at, end_reason)
      values (v_uid, 0, (select h.hunt_id from public.hr_hunts h order by h.hunt_id limit 1), 3, now() - interval '1 hour', now() - interval '1 hour', now(), now(), now(), 'falls') returning id into v_sid;
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data) values
      (v_sid, v_uid, 0, 'fall', now() - interval '30 minutes', '{"monster": "rat", "xp": 12, "xp_lost": {"attack": 12}}'),
      (v_sid, v_uid, 0, 'fall', now() - interval '10 minutes', '{"monster": "rat_king", "xp": 0}'),
      (v_sid, v_uid, 0, 'level_up', now(), '{"skill": "attack", "level": 2}');
    v := public.hr_death_log_view(v_uid, 0);
    if jsonb_array_length(v) <> 2 or v->0->>'monster' <> 'rat_king' or (v->1->>'xp')::int <> 12 or v->1->>'hunt' is null then
      raise exception 'VERIFY(e): the death log is wrong: %', v; end if;
    raise exception using errcode = 'HR857', message = 'character-sheet §6 complete - rolling back';
  exception when sqlstate 'HR857' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid) or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'VERIFY(f): §6 LEAKED a probe row'; end if;
  if exists (select 1 from public.hr_state_sections s where to_regprocedure('public.' || s.fn || '(uuid,integer)') is null) then
    raise exception 'VERIFY(f): a section names no (uuid, integer) view'; end if;
  if strpos((select prosrc from pg_proc where oid = 'public.hr_outfit_set(integer,text,jsonb,uuid)'::regprocedure), 'hr_rpc_gate(''outfit'')') = 0
     or strpos((select prosrc from pg_proc where oid = 'public.hr_rpc_gate(text)'::regprocedure), 'when ''outfit'' then v_limit := 20;') = 0 then
    raise exception 'VERIFY(f): the outfit save is not on its own rate bucket'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'character-sheet: outfits per character (owned server-side), one write; death log; engine sheet compare-and-set; three sections registered; all green';
end $$;
