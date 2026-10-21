-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE DEATH POPUP READS ITS HUNT AND ITS BLESSING FROM THE SERVER
-- (lane b-death-equip-online, systems-engineer, 2026-10-21). STAGED, NOT APPLIED.
-- Game CLOSED: applies on its passing §3; part of the reopen review.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- Tyler 2026-10-19: a death opens a centred popup with what killed the hero, the
-- XP lost and what a Blessing saved. The death row (hr_death_log_view, the
-- `death_log` section of every envelope) already carries the killer and the XP
-- the settle debited, but not WHICH hunt session it ended (the popup must match
-- the death to the hunt section that says `died`), nor what a Blessing kept:
-- that lives only in the ledger row hr_blessing_take writes for the session
-- (player_ledger intent 'blessing_used', meta.saved, session_id).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- hr_death_log_view RESTATED WHOLE from 2026-10-27-core-bodies.sql (§0 pins its
-- image), adding two keys to each row, nothing removed:
--   session  the hunt session the death ended (hunt_sessions.id)
--   saved    the XP the session's Blessing kept, { level|skill: xp }, read from
--            the 'blessing_used' ledger row of that session (index
--            player_ledger_session); null when no Blessing was used
-- Still the caller's own rows only (it is a section view: no grant, called by
-- hr_state_sections_of for the owner), still the newest 30.
--
-- ── EXPOSURE ─────────────────────────────────────────────────────────────────
-- None new: the owner's own session id (already in the `hunt` section) and the
-- owner's own ledger figures (already readable to the owner under the ledger's
-- own-read policy). No grant moves. Moves no value.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_death_log_view from 2026-10-27-core-bodies.sql.
-- ORDER: after 2026-11-04-party-outfits.sql (last in the chain; no object in
-- common with it). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
-- The body 2026-10-27-core-bodies.sql leaves (whitespace-normalised
-- pg_get_functiondef md5, measured on the replay 2026-10-21), or this file's own.
do $mig$
declare v_def text; v_src text;
begin
  if to_regprocedure('public.hr_death_log_view(uuid,integer)') is null then
    raise exception 'PIN: hr_death_log_view(uuid, int) is missing'; end if;
  if to_regclass('public.player_ledger_session') is null then
    raise exception 'PIN: player_ledger_session (session_id, id) is missing: the Blessing read would scan the ledger'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_blessing_take(uuid,integer,uuid,jsonb,timestamp with time zone)'::regprocedure;
  if strpos(v_src, 'values (p_user, p_slot, ''hunt'', ''blessing_used'',') = 0 or strpos(v_src, '''saved'', v_saved), p_session);') = 0 then
    raise exception 'PIN: hr_blessing_take no longer journals {saved} under intent blessing_used with the session: re-derive the read'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_death_log_view(uuid,integer)'::regprocedure;
  v_def := md5(regexp_replace(pg_get_functiondef('public.hr_death_log_view(uuid,integer)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_def <> 'b65256bcc60cab9e8c51e1aa7882eb62' and strpos(v_src, 'DEATH-POPUP') = 0 then
    raise exception 'PIN: hr_death_log_view is neither the core-bodies image (b65256bc...) nor this file''s (md5 %)', v_def; end if;
end $mig$;

-- ── §1 THE BODY ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_death_log_view(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  -- DEATH-POPUP (2026-11-07-death-popup-blessing.sql): each row names its session and what its Blessing kept.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'at', d.at, 'hunt', d.hunt_id, 'session', d.session_id, 'monster', nullif(d.data->>'monster', ''),
           'xp', case when d.data ? 'xp' then (d.data->>'xp')::bigint end,
           'xp_lost', case when jsonb_typeof(d.data->'xp_lost') = 'object' then d.data->'xp_lost' end,
           'saved', (select case when jsonb_typeof(l.meta->'saved') = 'object' then l.meta->'saved' end
                       from public.player_ledger l
                      where l.session_id = d.session_id and l.user_id = p_user and l.slot = p_slot
                        and l.intent = 'blessing_used'
                      order by l.id limit 1))
         order by d.at desc, d.id desc), '[]'::jsonb)
    from (select e.id, e.at, e.data, h.hunt_id, h.id as session_id
            from public.hunt_sessions h
            join public.hunt_session_events e on e.session_id = h.id and e.type = 'death'
           where h.user_id = p_user and h.slot = p_slot
           order by e.at desc, e.id desc
           limit 30) d
$function$;

-- Exact grants, as 2026-10-25-character-sheet.sql §5 set them: a section internal, no client role.
do $mig$
declare r text;
begin
  execute 'revoke execute on function public.hr_death_log_view(uuid, int) from public';
  foreach r in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function public.hr_death_log_view(uuid, int) from %I', r); end if;
  end loop;
end $mig$;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_uid constant uuid := '000000c0-0000-0000-0000-0000de4d0b01';
  v jsonb; v_s1 uuid; v_s2 uuid; v_role text;
begin
  begin
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'death-popup §2 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' then raise exception 'VERIFY(a): the probe character was not made'; end if;
    -- Two ended hunts, each with one death; the newer one used a Blessing.
    insert into public.hunt_sessions (user_id, slot, hunt_id, entered_at, hunt_from, settled_to, next_swing_at, ended_at, end_reason)
      values (v_uid, 0, 'deathpopupprobe', now() - interval '2 hours', now() - interval '2 hours', now() - interval '90 minutes', now(), now() - interval '90 minutes', 'died')
      returning id into v_s1;
    insert into public.hunt_sessions (user_id, slot, hunt_id, entered_at, hunt_from, settled_to, next_swing_at, ended_at, end_reason)
      values (v_uid, 0, 'deathpopupprobe', now() - interval '1 hour', now() - interval '1 hour', now() - interval '5 minutes', now(), now() - interval '5 minutes', 'died')
      returning id into v_s2;
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data) values
      (v_s1, v_uid, 0, 'death', now() - interval '90 minutes', '{"monster": "rat", "xp": 40, "xp_lost": {"level": 30, "melee": 10}}'),
      (v_s2, v_uid, 0, 'death', now() - interval '5 minutes', '{"monster": "rat_king", "xp": 3, "xp_lost": {"level": 3}}');
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id) values
      (v_uid, 0, 'hunt', 'blessing_used', '{"reason": "blessing_used", "tiers": [1], "permille": 950, "saved": {"level": 57}}', v_s2);
    v := public.hr_death_log_view(v_uid, 0);
    -- (a) newest first; each row names its session; the Blessing's saving rides its own death only.
    if jsonb_array_length(v) <> 2 or v->0->>'monster' <> 'rat_king' or (v->0->>'session')::uuid <> v_s2 or (v->1->>'session')::uuid <> v_s1 then
      raise exception 'VERIFY(a): the rows or their sessions are wrong: %', v; end if;
    if v->0->'saved' <> '{"level": 57}'::jsonb or jsonb_typeof(v->1->'saved') <> 'null' then
      raise exception 'VERIFY(a): the Blessing''s saving is wrong: % / %', v->0->'saved', v->1->'saved'; end if;
    -- (b) the existing keys are unchanged.
    if (v->1->>'xp')::int <> 40 or v->1->'xp_lost' <> '{"level": 30, "melee": 10}'::jsonb or v->0->>'hunt' <> 'deathpopupprobe' then
      raise exception 'VERIFY(b): an existing key moved: %', v->1; end if;
    -- (c) another character's Blessing row on the same session id never reads as this one's.
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id) values
      (v_uid, 1, 'hunt', 'blessing_used', '{"saved": {"level": 1}}', v_s1);
    if jsonb_typeof(public.hr_death_log_view(v_uid, 0)->1->'saved') <> 'null' then
      raise exception 'VERIFY(c): another slot''s Blessing was read as this death''s'; end if;
    -- (d) the envelope's section carries the new keys.
    v := public.hr_state_of(v_uid, 0);
    if (v->'death_log'->0->>'session')::uuid is distinct from v_s2 or v->'death_log'->0->'saved' <> '{"level": 57}'::jsonb then
      raise exception 'VERIFY(d): the death_log section misses the new keys: %', v->'death_log'->0; end if;
    raise exception using errcode = 'HR891', message = 'death-popup §2 complete - rolling back';
  exception when sqlstate 'HR891' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid) or exists (select 1 from public.hunt_sessions where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid) then
    raise exception 'VERIFY(e): §2 LEAKED a probe row'; end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_death_log_view(uuid,integer)', 'execute') then
      raise exception 'VERIFY(e): % reaches hr_death_log_view', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'death-popup: each death names its session and what its Blessing kept; owner-only; all green';
end $$;
