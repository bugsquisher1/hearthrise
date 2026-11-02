-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-20-party-leader-starts.sql — ONLY THE LEADER STARTS A PARTY'S HUNT: A SEATED MEMBER CANNOT
--   OPEN THE PARTY'S GROUND WHEN NOBODY IS ON IT (lane/c-beta-server, backend-architect, 2026-11-01;
--   rulings: "In a party the LEADER chooses the hunt settings", Tyler 2026-10-20).
--
-- STATUS: STAGED. Pre-EA: applies on its passing §2, one file via the Coordinator's apply tool, never
-- inside begin/commit, never 00:00–00:10 UTC. On the EA Security list. EDGE: none. CLIENT: none needed
-- (the client already blocks the press; src/data/refusal-words.js already words `not_party_leader`).
-- ORDER: no object in common with any staged file.
--
-- THE HOLE. hr_hunt_party_start refuses a member `not_leader`, but hr_hunt_enter, the client's own enter
-- verb, only asks hr_hunt_enter_check, which admits a member whenever the ground is the party's. A party
-- keeps its ground after a hunt ends, so with no seat hunting a member could reopen the instance alone,
-- on that ground, and its density froze from there: the hunt started without the leader.
--
-- THE CONTRACT. hr_hunt_enter RESTATED (2026-10-27-core-bodies.sql, every other line kept). Under the
-- party row's lock (the first lock hr_hunt_enter_for takes, and it takes it again in this transaction):
--   a seat that is NOT the leader, asking for its party's ground, with NO open session on the instance
--     -> { ok:false, error:'not_party_leader' }, noted as a rejection, nothing written.
-- Unchanged: the leader enters; a member goes back into a hunt the party is on (any open session on the
-- instance, a leaving one included, until it has ended); a member asking for ANOTHER ground, or in a
-- ground-less party, still answers party_hunt_mismatch from hr_hunt_enter_check; a hero in no party.
-- hr_hunt_enter_for stays unguarded on purpose: hr_hunt_party_start marches every seat through it, and
-- hr_hunt_restart already refuses a seated hero `party_hunt`.
--
-- CONCURRENCY. A Start holds the same row lock: a member's enter waits, then finds the open sessions and
-- is judged by the check as before. A refusal writes no intent row, so a retried key is judged again.
-- COST: one primary-key row lock and one index probe of hunt_sessions on a seated hero's enter.
-- REVERSIBLE: re-apply hr_hunt_enter from 2026-10-27-core-bodies.sql (prosrc md5 dfab19ab).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 THE BODY RESTATED IS THE ONE LIVE ────────────────────────────────────
do $mig$
declare v_src text;
begin
  select md5(replace(p.prosrc, chr(13), '')) into v_src from pg_proc p
   where p.oid = to_regprocedure('public.hr_hunt_enter(integer,text,jsonb,integer,integer,uuid)');
  if v_src is null or v_src not in ('dfab19abfc34cead3636d16230a15f52', '98b15ea24cf86852d0ff371b35ceb9b2') then
    raise exception 'PRECONDITION: hr_hunt_enter prosrc md5 is %, expected the live dfab19ab or this file''s. Re-cut this file.', v_src; end if;
end $mig$;

-- ── §1 THE VERB ─────────────────────────────────────────────────────────────
create or replace function public.hr_hunt_enter(p_slot integer, p_hunt text, p_bag jsonb, p_preset integer, p_hours integer, p_idem uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_catalog'
as $function$
declare
  c_verb constant text := 'hunt_enter';
  v_uid  uuid := auth.uid();
  v_r    jsonb;
  v_party uuid;
  v_p    public.hunt_parties%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- PARTY-LEADER-STARTS (2027-02-20-party-leader-starts.sql): a member joins a hunt the party is on; only the leader starts one.
  v_party := public.hr_hunt_party_of(v_uid, p_slot);
  if v_party is not null then
    select * into v_p from public.hunt_parties where id = v_party for update;
    if v_p.closed_at is null and v_p.hunt_id is not distinct from p_hunt
       and not (v_p.leader_user = v_uid and v_p.leader_slot = p_slot)
       and not exists (select 1 from public.hunt_sessions h where h.instance_id = v_party and h.ended_at is null) then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_party_leader')); end if;
  end if;
  v_r := public.hr_hunt_enter_for(v_uid, p_slot, p_hunt, p_bag, p_preset, p_hours);
  if coalesce(v_r->>'ok', 'false') <> 'true' then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  v_r := jsonb_build_object('ok', true, 'session', v_r->'session', 'version', v_r->'version',
                            'below_range', coalesce((v_r->>'below_range')::boolean, false));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $function$;

revoke execute on function public.hr_hunt_enter(integer, text, jsonb, integer, integer, uuid) from public;
revoke execute on function public.hr_hunt_enter(integer, text, jsonb, integer, integer, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_enter(integer, text, jsonb, integer, integer, uuid) to authenticated;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ─────
do $$
declare
  c_a constant uuid := '000000d5-0000-4000-a000-00007f0c0a01';   -- the leader
  c_b constant uuid := '000000d5-0000-4000-a000-00007f0c0a02';   -- a seated member
  k   constant text := '000000d5-0000-4000-b000-0000';
  v jsonb; v_pid uuid; v_hunt text; v_other text; v_s text; v_n int := 0;
begin
  -- (a) the shape: a signed-in client asks, nobody else; the body is this file's; hygiene STRICT is green.
  if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.oid = 'public.hr_hunt_enter(integer,text,jsonb,integer,integer,uuid)'::regprocedure)
     <> '98b15ea24cf86852d0ff371b35ceb9b2' then
    raise exception 'party-leader-starts §2(a): the installed body is not this file''s'; end if;
  if has_function_privilege('anon', 'public.hr_hunt_enter(integer,text,jsonb,integer,integer,uuid)', 'execute')
     or has_function_privilege('service_role', 'public.hr_hunt_enter(integer,text,jsonb,integer,integer,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_hunt_enter(integer,text,jsonb,integer,integer,uuid)', 'execute') then
    raise exception 'party-leader-starts §2(a): the grants are wrong'; end if;
  perform public.hr_assert_grant_hygiene(true);

  begin
    update public.hr_hunt_config set enabled = true where id;
    select g.hunt_id into v_hunt from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id
     order by coalesce(h.band_min, 0), g.hunt_id limit 1;
    select hunt_id into v_other from public.hr_hunt_grounds where hunt_id <> v_hunt order by hunt_id limit 1;
    if v_hunt is null then raise exception 'party-leader-starts §2-harness: no ground'; end if;
    foreach v_s in array array[c_a::text, c_b::text] loop
      insert into auth.users (id) values (v_s::uuid) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_s::uuid, 'party-leader-starts §2 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_s, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'party-leader-starts §2-harness: hr_create_character refused: %', v; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', '', true);
    v_pid := public.hr_party_open(c_a, 0);
    perform public.hr_party_seat_into(v_pid, c_b, 0);
    update public.hunt_parties set hunt_id = v_hunt where id = v_pid;

    -- (b) ★ NOBODY ON THE GROUND: the member is refused, by name, and nothing is written.
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, (k || '00000a01')::uuid);
    if v->>'error' is distinct from 'not_party_leader' then raise exception 'party-leader-starts §2(b): the member answered %', v; end if;
    if exists (select 1 from public.hunt_sessions where instance_id = v_pid) then
      raise exception 'party-leader-starts §2(b): a refused member opened a session'; end if;

    -- (c) another ground, or no party ground: the check's own answer, unchanged.
    if v_other is not null then
      v := public.hr_hunt_enter(0, v_other, '[]'::jsonb, 0, null, (k || '00000a02')::uuid);
      if v->>'error' is distinct from 'party_hunt_mismatch' then raise exception 'party-leader-starts §2(c): another ground answered %', v; end if;
    end if;

    -- (d) THE LEADER STARTS.
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, (k || '00000a03')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-leader-starts §2(d): the leader was refused: %', v; end if;

    -- (e) ★ THE PARTY IS ON IT: the member goes in, onto the same instance.
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, (k || '00000a04')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-leader-starts §2(e): the member could not join the hunt: %', v; end if;
    select count(*) into v_n from public.hunt_sessions where instance_id = v_pid and ended_at is null;
    if v_n <> 2 then raise exception 'party-leader-starts §2(e): % seats on the instance, want 2', v_n; end if;

    raise exception using errcode = 'HRL20', message = 'party-leader-starts §2 complete - rolling back';
  exception when sqlstate 'HRL20' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from auth.users where id in (c_a, c_b)) then raise exception 'party-leader-starts §2: LEAKED a probe row'; end if;
  raise notice 'party-leader-starts: a member joins a hunt the party is on; only the leader starts one; all green';
end $$;
