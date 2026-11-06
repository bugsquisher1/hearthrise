-- ════════════════════════════════════════════════════════════════════════
-- 2027-03-16-ended-hunt-tier.sql — AN ENDED HUNT KEEPS THE TIER IT RAN AT (lane/c-small-1106, systems-engineer, 2026-11-06; found by lane/a-polish-1105).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on its passing §4.
-- Not on the money list: one display field, no value moves. EDGE: none (the engine never reads hunt_sessions.tier; the settle's answer carries
-- hr_hunt_view whole, so the field rides it). CLIENT: the Hunt summary and its Earlier hunts list read `session.tier`, after this applies (before it,
-- the key is absent and the card names the ground alone, as today).
--
-- THE BUG. The summary named "Wickstead", not "Wickstead · Dangerous": hr_hunt_view carries the session's instance id and never its tier, and
-- hunt_tier.playing is null once the hunt ends. The instance's own tier is no answer for an ended session: a party's instance is the party's id and is
-- re-frozen (hunt, tier, pull) at the party's next start (2027-02-10-party-instance-reset.sql), so it would name the NEXT hunt's tier.
--
-- §1 hunt_sessions.tier NEW, nullable: the tier the session ran at, written once as it ends, from its instance's frozen tier (2027-02-27-hunt-tiers.sql).
--    While a session is open its instance can't restart (a restart needs no open session on it), so that read is this session's own. Null while open
--    (hunt_tier.playing says it then) and on a session that ended before this file.
-- §2 hr_hunt_tier_stamp() + trigger hr_hunt_tier_stamp, BEFORE UPDATE OF ended_at, WHEN the session is ending: every end path (a settle, a Leave, a
--    party's cascade, a forfeit, a Game Master's stop) sets ended_at, so none of them is restated.
-- §3 hr_hunt_view, ONE SPLICE: `tier`, the session row's.
--
-- COST: the trigger's WHEN reads only the row, so a settle's update of an open session runs no body; an ending runs one primary-key probe of
-- hunt_instances. Rows: one short text per ended session, on a table the character wipe already clears. No grant, no client verb, no section.
-- REVERSIBILITY: drop the trigger and its function; re-apply hr_hunt_view as 2027-03-12-boss-call.sql left it; drop the column. No player value.
-- ORDER: after 2027-03-12-boss-call.sql (its CALL-OUT splice is in the body this splices) and 2027-02-27-hunt-tiers.sql; no object in common with any later
-- file. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if not exists (select 1 from pg_attribute where attrelid = 'public.hunt_instances'::regclass and attname = 'tier' and not attisdropped) then
    raise exception 'PRECONDITION: apply 2027-02-27-hunt-tiers.sql first (hunt_instances.tier)'; end if;
  if strpos((select prosrc from pg_proc where oid = to_regprocedure('public.hr_hunt_view(uuid)')), 'CALL-OUT') = 0 then
    raise exception 'PRECONDITION: apply 2027-03-12-boss-call.sql first (hr_hunt_view''s CALL-OUT splice)'; end if;
end $mig$;

-- ── §1 THE COLUMN ────────────────────────────────────────────────────────────
alter table public.hunt_sessions add column if not exists tier text;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.hunt_sessions'::regclass and conname = 'hunt_sessions_tier_ck') then
    alter table public.hunt_sessions add constraint hunt_sessions_tier_ck check (tier is null or tier in ('normal', 'dangerous', 'deadly')); end if;
end $mig$;
comment on column public.hunt_sessions.tier is
  '2027-03-16-ended-hunt-tier.sql: the tier this session ran at, stamped from its instance as it ends (hr_hunt_tier_stamp); null while open (hunt_tier.playing) and on sessions ended before the stamp. Display only.';

-- ── §2 THE STAMP ─────────────────────────────────────────────────────────────
create or replace function public.hr_hunt_tier_stamp()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  -- ENDED-TIER (2027-03-16-ended-hunt-tier.sql): the instance's frozen tier is this session's while it is open; it is kept as it ends.
  new.tier := (select i.tier from public.hunt_instances i where i.id = new.instance_id);
  return new;
end $$;
revoke execute on function public.hr_hunt_tier_stamp() from public, anon, authenticated, service_role;
drop trigger if exists hr_hunt_tier_stamp on public.hunt_sessions;
create trigger hr_hunt_tier_stamp before update of ended_at on public.hunt_sessions
  for each row when (old.ended_at is null and new.ended_at is not null)
  execute function public.hr_hunt_tier_stamp();

-- ── §3 THE VIEW CARRIES IT ───────────────────────────────────────────────────
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_view(uuid)'::regprocedure), chr(13), '');
  if strpos(v_def, 'ENDED-TIER') = 0 then
    v_old := $a$    'forfeit', s.forfeit,
$a$;
    v_new := v_old || $a$    -- ENDED-TIER (2027-03-16-ended-hunt-tier.sql): the tier an ended session ran at; null while open (hunt_tier.playing says it then)
    'tier', s.tier,
$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_view: ENDED-TIER anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $chk$
declare
  v_u      constant uuid := '000000c0-0000-4000-a000-00007e100001';
  k        text := '000000c0-0000-4000-a000-0000';
  c_ground constant text := 'mosslight_glade';
  c_plain  constant text := 'mill_cellar';
  v        jsonb;
  v_sid    uuid;
  v_iid    uuid;
begin
  begin
    update public.hr_hunt_config set enabled = true where id;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Probe Ended Tier') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'ended-hunt-tier §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'ended-hunt-tier §4: hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    v := public.hr_hunt_tier_set(0, c_ground, 'dangerous', (k || '7e100011')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'ended-hunt-tier §4: the pick answered %', v; end if;
    -- (a) an open session: its instance froze the tier, its own row holds none yet, and the view says null
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_enter(0, c_ground, '[]'::jsonb, 0, null, (k || '7e100012')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'ended-hunt-tier §4(a): entering answered %', v; end if;
    select h.id, h.instance_id into v_sid, v_iid from public.hunt_sessions h where h.user_id = v_u and h.slot = 0 and h.ended_at is null;
    if (select tier from public.hunt_instances where id = v_iid) is distinct from 'dangerous' then raise exception 'ended-hunt-tier §4(a): the instance froze %', (select tier from public.hunt_instances where id = v_iid); end if;
    if (select tier from public.hunt_sessions where id = v_sid) is not null or not (public.hr_hunt_view(v_sid) ? 'tier') or public.hr_hunt_view(v_sid)->>'tier' is not null then
      raise exception 'ended-hunt-tier §4(a): an open session reads %', public.hr_hunt_view(v_sid)->'tier'; end if;
    -- (b) it ends: the row keeps Dangerous, and so do the view and the hunt section's session
    perform public.hr_hunt_close(v_sid, 'left', now(), true);
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    if (select tier from public.hunt_sessions where id = v_sid) is distinct from 'dangerous' or public.hr_hunt_view(v_sid)->>'tier' is distinct from 'dangerous' then
      raise exception 'ended-hunt-tier §4(b): the ended session reads %', public.hr_hunt_view(v_sid)->'tier'; end if;
    if public.hr_state_of(v_u, 0)->'hunt'->'session'->>'tier' is distinct from 'dangerous' then
      raise exception 'ended-hunt-tier §4(b): the hunt section reads %', public.hr_state_of(v_u, 0)->'hunt'->'session'->'tier'; end if;
    -- (c) the instance re-frozen after the end (a party's next start) moves nothing on the ended row
    update public.hunt_instances set tier = 'deadly' where id = v_iid;
    if public.hr_hunt_view(v_sid)->>'tier' is distinct from 'dangerous' then raise exception 'ended-hunt-tier §4(c): the ended session follows its instance'; end if;
    -- (d) the stamp runs once: a later write to the ended row keeps it
    update public.hunt_sessions set ended_at = ended_at where id = v_sid;
    if (select tier from public.hunt_sessions where id = v_sid) is distinct from 'dangerous' then raise exception 'ended-hunt-tier §4(d): a later write restamped the ended row'; end if;
    -- (e) a plain ground ends Normal
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_enter(0, c_plain, '[]'::jsonb, 0, null, (k || '7e100013')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'ended-hunt-tier §4(e): entering the plain ground answered %', v; end if;
    select h.id into v_sid from public.hunt_sessions h where h.user_id = v_u and h.slot = 0 and h.ended_at is null;
    perform public.hr_hunt_close(v_sid, 'left', now(), true);
    if public.hr_hunt_view(v_sid)->>'tier' is distinct from 'normal' then raise exception 'ended-hunt-tier §4(e): the plain ground ended at %', public.hr_hunt_view(v_sid)->'tier'; end if;
    raise exception using errcode = 'HR941', message = 'ended-hunt-tier §4 complete - rolling back';
  exception when sqlstate 'HR941' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from auth.users where id = v_u) then
    raise exception 'ended-hunt-tier §4: LEAKED a probe row'; end if;
  -- (f) no client reaches the stamp, and the trigger fires only on an ending
  if has_function_privilege('authenticated', 'public.hr_hunt_tier_stamp()', 'execute') then raise exception 'ended-hunt-tier §4(f): a client reaches the stamp'; end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.hunt_sessions'::regclass and t.tgname = 'hr_hunt_tier_stamp' and t.tgenabled = 'O'
                 and pg_get_triggerdef(t.oid) like '%BEFORE UPDATE OF ended_at ON public.hunt_sessions FOR EACH ROW WHEN (%old.ended_at IS NULL) AND (new.ended_at IS NOT NULL)%') then
    raise exception 'ended-hunt-tier §4(f): the trigger is missing or fires on more than an ending: %',
      (select pg_get_triggerdef(t.oid) from pg_trigger t where t.tgrelid = 'public.hunt_sessions'::regclass and t.tgname = 'hr_hunt_tier_stamp'); end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'ended-hunt-tier: an ended session keeps the tier it ran at, through the view and the section, whatever its instance does next; all green';
end $chk$;
