-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — "LEAVE IF ANYONE LEAVES THE HUNT OR DIES" (lane
-- b-party-leave-together, systems-engineer, 2026-10-22; Tyler 2026-10-22, final).
-- STAGED, NOT APPLIED. Game CLOSED: applies on its passing §4. A PARTY / HUNT
-- ECONOMY surface (it ends hunts): in the reopen Security review.
--
-- ── THE RULING ───────────────────────────────────────────────────────────────
-- Every hero, own heroes and strangers alike, has ONE box, "Leave if anyone
-- leaves the hunt or dies". DEFAULT ON, REMEMBERED per hero on the server
-- (reloads, sign-outs, new parties, new hunts); only that hero's player changes
-- it. When any OTHER member's party hunt ends for any reason, every member with
-- the box ticked is first settled (its owed window credited) and then ends
-- `party_member_left` (`party_member_died` after a death) and goes home; the
-- party stays together. Nobody can end another hero's hunt except through that
-- hero's own box. Leave hunt is unchanged; there is no "whole party" button.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 player_state.party_leave_together boolean NOT NULL DEFAULT true (per hero:
--    (user_id, slot)). Written ONLY by §2.
-- §2 hr_party_leave_together_set(p_slot integer, p_on boolean, p_idem uuid), the
--    caller's OWN hero (auth.uid(), p_slot; there is no target argument, so no
--    caller can reach another hero's box). Refuses: not_signed_in, bad_slot,
--    bad_idem, bad_value (p_on null), rate_limited (hr_rpc_gate 'party', 12 a
--    minute), no_character. Idempotent on p_idem, journalled in player_intents
--    (intent `party_leave_together`), as every party setting. Allowed anywhere,
--    hunting included (the next settle reads it). Answers { ok, leave_together,
--    party } (party: hr_hunt_party_view). Moves no gold, item or XP. Client
--    baseline row added.
-- §3 FOUR ANCHORED SPLICES (each anchor matches once or the file raises; nothing
--    else in any body moves; every body md5 pinned in §0):
--    (a) hr_hunt_party_view (the 2026-12-08-party-hold.sql image) gains
--        `leave_together`: THIS hero's own box (the viewer's; no other member's
--        is projected), the `party` section the party panel reads.
--    (b) hr_hunt_instance_read (the 2026-12-11-hunt-deploy-no-forfeit.sql image):
--        each member carries `leave_together`, the engine's input
--        (hunt-settle.js memberInput -> hunt-spawn.js heroSetup leaveTogether).
--    (c) hr_hunt_settle_session (the 2026-11-07-store-by-slot.sql image): the
--        two cascade ends are proven from server state: `party_member_died`
--        (restated) and `party_member_left` (new) hold only when THIS hero's box
--        is ticked and its instance holds another member. The end can only stop
--        value, never mint it; an unticked hero's cascade end is refused
--        end_not_proven.
--    (d) hr_hunt_view (the 2026-11-20-hunt-forfeit-durable.sql image) gains
--        `end_by`: for a cascade end, the name of the member whose own end at the
--        same instant sent this hero home (its death for party_member_died), from
--        the server's rows; null otherwise (the client says "A party member").
-- THE CASCADE IS THE ENGINE'S (src/core/combat-sim.js cascadeFrom), inside the
--    ONE instance settle every end goes through (player door and tick alike):
--    a member's OWN end at a boundary (left, changed, stamina, hours, rule,
--    gold, supplies, server) or its death in a swing flags every other member
--    standing in the world with the box ticked; each ends at its own next
--    boundary (the same instant: the world steps in lockstep), paid for every
--    swing up to it in the SAME settle (the value half lands before the end:
--    hr_hunt_apply_member applies hr_apply, then hr_hunt_settle_session closes).
--    A cascade end is never a trigger (no loop between ticked heroes). A forfeit
--    (hr_hunt_forfeit) already ends every member of its instance. The database
--    never ends a session on its own here: this file adds no SQL-side close.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
-- The set writes one column of the caller's own player_state row (the row lock
-- hr_apply takes). The engine reads the box once per settle; a box changed
-- between that read and the commit makes a cascade end the commit refuses
-- (end_not_proven, counted once, reset by the next landed settle, which reads
-- the new value): no value moves either way.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- One authenticated RPC writing one boolean on the caller's own hero. It can
-- only make the caller's OWN hero go home with its party (or not). A hero's box
-- never ends anyone else's hunt; a cascade end needs the hero's own server-side
-- box and another member of its instance. The live horizon (2026-10-31) still
-- holds: a Leave lands at or after the last swing any viewer was shown, so a
-- ticked hero cannot use a partner's Leave to step around a death it saw.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_hunt_party_view's 2026-12-08 image, hr_hunt_instance_read's
-- 2026-12-11 image, hr_hunt_settle_session's 2026-11-07 image and hr_hunt_view's
-- 2026-11-20 image (each this file's §3 anchor reversed); drop
-- hr_party_leave_together_set and its baseline row; drop the column.
-- ORDER: after 2026-12-11-hunt-deploy-no-forfeit.sql (it splices that file's
-- engine read), after the 12-14..12-17 files (12-14 shared-farm APPLIED; any of
-- 12-15 account-gold / 12-16 own-drinks-settle that restates a body pinned in §0
-- lands first and this file is re-pinned to its image), and right after
-- 2026-12-18-hunt-sessions-catalogue.generated.sql (END_ORDER's
-- `party_member_left`, which §0 requires). EDGE: hr-accrue
-- redeploys with this lane (combat-sim.js, action-rules.js, hunt-spawn.js,
-- member.js, hunt-settle.js); safe in either order: an engine reading a server
-- without `leave_together` treats every box as off (no cascade end proposed),
-- and this file under the old engine proves its `party_member_died` (every box
-- defaults on). Proof: tests/hunt-sessions-settle.mjs PARTY-LEAVE* (+ mutants).
-- No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_src text;
begin
  if not exists (select 1 from public.hr_hunt_end_reasons where reason = 'party_member_left')
     or not exists (select 1 from public.hr_hunt_end_reasons where reason = 'party_member_died') then
    raise exception 'PRECONDITION: apply 2026-12-18-hunt-sessions-catalogue.generated.sql first (END_ORDER''s party_member_left)'; end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_hunt_party_view(uuid,integer)'::regprocedure;
  if md5(v_src) <> 'e6d923becbd6ce9aaa8025b4bfde3dae' and strpos(v_src, 'LEAVE-TOGETHER') = 0 then
    raise exception 'PIN: hr_hunt_party_view is neither 2026-12-08-party-hold.sql''s image (e6d923be...) nor this file''s (md5 %)', md5(v_src); end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure;
  if md5(v_src) <> '3d609ccfd94bc06556ca0f4d89e7fad8' and strpos(v_src, 'LEAVE-TOGETHER') = 0 then
    raise exception 'PIN: hr_hunt_instance_read is neither 2026-12-11-hunt-deploy-no-forfeit.sql''s image (3d609ccf...) nor this file''s (md5 %)', md5(v_src); end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure;
  if md5(v_src) <> 'd457034c7b81d082ee3c2ecc522d2764' and strpos(v_src, 'LEAVE-TOGETHER') = 0 then
    raise exception 'PIN: hr_hunt_settle_session is neither 2026-11-07-store-by-slot.sql''s image (d457034c...) nor this file''s (md5 %)', md5(v_src); end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_hunt_view(uuid)'::regprocedure;
  if md5(v_src) <> '47f89f03cba945eb5e9766414995dbc8' and strpos(v_src, 'LEAVE-TOGETHER') = 0 then
    raise exception 'PIN: hr_hunt_view is neither 2026-11-20-hunt-forfeit-durable.sql''s image (47f89f03...) nor this file''s (md5 %)', md5(v_src); end if;
end $mig$;

-- ── §1 THE BOX ───────────────────────────────────────────────────────────────
alter table public.player_state add column if not exists party_leave_together boolean not null default true;
comment on column public.player_state.party_leave_together is
  '2026-12-18-party-leave-together.sql: this hero''s "Leave if anyone leaves the hunt or dies" (Tyler 2026-10-22), default on. '
  'Written only by the hero''s own hr_party_leave_together_set. Read by the engine (hr_hunt_instance_read members[].leave_together), '
  'the cascade-end proof (hr_hunt_settle_session) and the party panel (hr_hunt_party_view leave_together).';

-- ── §2 THE INTENT ────────────────────────────────────────────────────────────
create or replace function public.hr_party_leave_together_set(p_slot integer, p_on boolean, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'party_leave_together';
  v_uid uuid := auth.uid(); v_r jsonb;
begin
  -- LEAVE-TOGETHER (2026-12-18-party-leave-together.sql): the caller's OWN hero's box; no argument names anyone else.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_on is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_value')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  update public.player_state set party_leave_together = p_on where user_id = v_uid and slot = p_slot;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  v_r := jsonb_build_object('ok', true, 'leave_together', p_on, 'party', public.hr_hunt_party_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
revoke execute on function public.hr_party_leave_together_set(int, boolean, uuid) from public;
revoke execute on function public.hr_party_leave_together_set(int, boolean, uuid) from anon, service_role, hr_engine, hr_tick;
grant  execute on function public.hr_party_leave_together_set(int, boolean, uuid) to authenticated;

-- (a second apply keeps the row as it is, approved_at included)
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_party_leave_together_set'
   and identity_args <> 'p_slot integer, p_on boolean, p_idem uuid';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note)
select 'hr_party_leave_together_set', 'p_slot integer, p_on boolean, p_idem uuid', 'authenticated',
       'added 2026-12-18: the caller''s own hero''s "Leave if anyone leaves the hunt or dies" box; moves no value'
 where not exists (select 1 from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_party_leave_together_set');

-- ── §3 FOUR ANCHORED SPLICES ─────────────────────────────────────────────────
do $mig$
declare v_def text; v_n int; v_old text; v_new text;
begin
  -- (a) the party view: the viewer's own box
  v_def := replace(pg_get_functiondef('public.hr_hunt_party_view(uuid,integer)'::regprocedure), chr(13), '');
  if strpos(v_def, 'LEAVE-TOGETHER') = 0 then
    v_old := $a$'hold_seat', v_p.hold_seat);$a$;
    v_new := $a$'hold_seat', v_p.hold_seat,
    -- LEAVE-TOGETHER (2026-12-18-party-leave-together.sql): THIS hero's own "Leave if anyone leaves the hunt or dies".
    'leave_together', (select ps.party_leave_together from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot));$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_party_view: LEAVE-TOGETHER anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
  -- (b) the engine's read: every member's box
  v_def := replace(pg_get_functiondef('public.hr_hunt_instance_read(uuid,integer)'::regprocedure), chr(13), '');
  if strpos(v_def, 'LEAVE-TOGETHER') = 0 then
    v_old := $a$'user', h.user_id, 'slot', h.slot, 'seat', h.seat, 'unit_id', h.unit_id,$a$;
    v_new := $a$'user', h.user_id, 'slot', h.slot, 'seat', h.seat, 'unit_id', h.unit_id,
                 -- LEAVE-TOGETHER (2026-12-18-party-leave-together.sql): the member's own box (combat-sim.js cascadeFrom).
                 'leave_together', (select ps.party_leave_together from public.player_state ps where ps.user_id = h.user_id and ps.slot = h.slot),$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_instance_read: LEAVE-TOGETHER anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
  -- (c) the settle: a cascade end only through the hero's own box
  v_def := replace(pg_get_functiondef('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'LEAVE-TOGETHER') = 0 then
    v_old := $a$      -- PARTY_MEMBER_DIED: another member of this instance died, which ends the whole party's hunt;
      -- provable only as "the instance holds another member": the end can only stop value, never mint it.
      when 'party_member_died' then exists (select 1 from public.hunt_sessions o
                                             where o.instance_id = v_s.instance_id and o.id <> v_s.id)$a$;
    v_new := $a$      -- LEAVE-TOGETHER (2026-12-18-party-leave-together.sql): another member's end (its death:
      -- party_member_died; any other: party_member_left) sends THIS hero home only through its own box
      -- (player_state.party_leave_together, written only by its own hr_party_leave_together_set) and only in an
      -- instance that holds another member: the end can only stop value, never mint it.
      when 'party_member_died' then coalesce((select ps.party_leave_together from public.player_state ps
                                               where ps.user_id = p_user and ps.slot = p_slot), false)
                                    and exists (select 1 from public.hunt_sessions o
                                                 where o.instance_id = v_s.instance_id and o.id <> v_s.id)
      when 'party_member_left' then coalesce((select ps.party_leave_together from public.player_state ps
                                               where ps.user_id = p_user and ps.slot = p_slot), false)
                                    and exists (select 1 from public.hunt_sessions o
                                                 where o.instance_id = v_s.instance_id and o.id <> v_s.id)$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_settle_session: LEAVE-TOGETHER anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
  -- (d) the session view: who sent this hero home
  v_def := replace(pg_get_functiondef('public.hr_hunt_view(uuid)'::regprocedure), chr(13), '');
  if strpos(v_def, 'LEAVE-TOGETHER') = 0 then
    v_old := $a$'forfeit', s.forfeit,$a$;
    v_new := $a$'forfeit', s.forfeit,
    -- LEAVE-TOGETHER (2026-12-18-party-leave-together.sql): a cascade end names the member whose own end at the same
    -- instant sent this hero home (its death for party_member_died), from the server's rows; else null.
    'end_by', case when s.end_reason in ('party_member_died', 'party_member_left') then (
      select public.hr_character_name(o.user_id, o.slot) from public.hunt_sessions o
       where o.instance_id = s.instance_id and o.id <> s.id and o.ended_at = s.ended_at
         and o.end_reason not in ('party_member_died', 'party_member_left')
       order by (o.end_reason = 'died') = (s.end_reason = 'party_member_died') desc, o.seat, o.id limit 1) end,$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_view: LEAVE-TOGETHER anchor matched % times (need 1): the body moved', v_n; end if;
    -- CREATE OR REPLACE keeps every function's grants; none moves here.
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- A party of A0 (leader, slot 0), A1 (A's own second hero) and B (a stranger), its windows committed through
-- hr_hunt_apply_instance itself as the engine proposes them: (0) the default is ON for every hero, on the party
-- view, the engine read and a NEW party; (a) the intent: own hero only, refusals, idempotent, journalled,
-- rate-gated; (b) B unticks; it stays unticked across a new party and a new hunt; (c) A0 leaves: A1 (ticked) is
-- settled and ends party_member_left at A0's boundary, B (unticked) hunts on; B claiming the cascade is refused
-- end_not_proven; the database ends nobody on its own (no loop); end_by names A0; (d) B settles on alone;
-- (e) a death cascades: the party starts again together (boxes as set), A0 dies, A1 ends party_member_died,
-- B's claim is refused, B hunts on; (f) the grants and the splices, each once.
do $$
declare
  v_a  constant uuid := '000000c0-0000-4000-a000-00005ea70001';
  v_b  constant uuid := '000000c0-0000-4000-a000-00005ea70002';
  v_u  uuid[] := array['000000c0-0000-4000-a000-00005ea70001', '000000c0-0000-4000-a000-00005ea70002']::uuid[];
  k    text := '000000c0-0000-4000-a000-0000';
  v_g  text; v jsonb; v_pid uuid; v_i int; v_t bigint; v_kk bigint;
  v_sa0 uuid; v_sa1 uuid; v_sb uuid; v_at timestamptz; v_lat timestamptz; v_lx bigint; v_role text;
begin
  begin
    execute $f$
      create function pg_temp.hr_plt_settle(p_inst uuid, p_swings bigint, p_ends jsonb) returns jsonb
      language plpgsql set search_path = public, pg_catalog as $b$
      -- One instance window of p_swings swings, as the engine proposes it: every open member, one kill and one Level XP
      -- each; a member named in p_ends ({ "<user>:<slot>": { reason, swings, died } }) ends after its `swings`.
      declare v_i public.hunt_instances%rowtype; v_s public.hunt_sessions%rowtype; v_t bigint; v_to timestamptz;
              v_m jsonb := '[]'::jsonb; v_e jsonb; v_k bigint; v_mto timestamptz; v_end jsonb; v_s0 bigint; v_ver bigint;
              v_delta jsonb; v_died boolean; v_eat timestamptz;
      begin
        -- the engine settles with no player signed in
        perform set_config('request.jwt.claim.sub', '', true);
        select * into v_i from public.hunt_instances where id = p_inst;
        v_t := public.hr_hunt_limit('swing_interval_ms');
        v_to := v_i.settled_to + make_interval(secs => p_swings * v_t / 1000.0);
        for v_s in select * from public.hunt_sessions where instance_id = p_inst and ended_at is null order by user_id, slot loop
          v_e := p_ends -> (v_s.user_id::text || ':' || v_s.slot::text);
          v_k := coalesce((v_e->>'swings')::bigint, p_swings);
          v_died := coalesce((v_e->>'died')::boolean, false);
          v_eat := v_s.settled_to + make_interval(secs => v_k * v_t / 1000.0);
          v_mto := case when v_e is null then v_to else v_eat + interval '1 millisecond' end;
          v_end := case when v_e is null then null else jsonb_build_object('reason', v_e->>'reason', 'at', v_eat) end;
          v_s0 := public.hr_stamina_of(v_s.user_id, v_s.slot, v_s.settled_to);
          select version into v_ver from public.player_state where user_id = v_s.user_id and slot = v_s.slot;
          v_delta := jsonb_build_object('accrued_to', v_mto, 'level_xp', 1,
            'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
              'meta', jsonb_build_object('ms', v_k * v_t, 'ticks', v_k, 'kills', 1, 'mon', v_s.hunt_id, 'from', v_s.settled_to, 'to', v_mto)));
          if v_died then
            v_delta := v_delta || jsonb_build_object('deaths', jsonb_build_array(jsonb_build_object(
              'monster', 'rat', 'deaths_today', 1, 'deaths_lifetime', 1, 'food_in_bag', false)));
          end if;
          v_m := v_m || jsonb_build_array(jsonb_build_object('user', v_s.user_id, 'slot', v_s.slot, 'session', v_s.id,
            'version', v_ver, 'intent', gen_random_uuid(), 'delta', v_delta,
            'hunt', jsonb_build_object('swing_from', v_s.swing_index, 'swing_to', v_s.swing_index + v_k, 'to', v_mto,
              'next_swing_at', v_mto, 'uses', '{}'::jsonb, 'paid_ms', v_k * v_t, 'raw_xp', '{}'::jsonb,
              'hints', jsonb_build_object('slot_dry', '{}'::jsonb, 'rare_drop', '[]'::jsonb,
                'death', case when v_died then jsonb_build_array(floor(extract(epoch from v_eat) * 1000)::bigint - v_t / 2) else '[]'::jsonb end),
              'ended', v_end, 'buys', '{}'::jsonb, 'cover', '{}'::jsonb, 'stamina', greatest(0, v_s0 - v_k * v_t),
              'death_xp', case when v_died then '[{}]'::jsonb else '[]'::jsonb end, 'unit_id', null, 'tick_ms', v_t),
            'analyzer', null));
        end loop;
        -- as the engine (hr_hunt_apply_instance is hr_engine's alone; it acts for every member of the instance)
        execute 'set local role hr_engine';
        v_e := public.hr_hunt_apply_instance(p_inst, v_i.world_swing,
          jsonb_build_object('to', v_to, 'world_swing', v_i.world_swing + p_swings, 'world', null), v_m, null, null);
        execute 'reset role';
        return v_e;
      end $b$ $f$;
    select g.hunt_id into v_g from public.hr_hunt_grounds g join public.hr_hunts h using (hunt_id) order by h.band_min, g.hunt_id limit 1;
    update public.hr_hunt_config set enabled = true where id;
    v_t := public.hr_hunt_limit('swing_interval_ms');
    for v_i in 1 .. 2 loop
      perform set_config('request.jwt.claim.sub', v_u[v_i]::text, true);
      insert into auth.users (id) values (v_u[v_i]) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_u[v_i], 'Probe Leave ' || chr(64 + v_i))
        on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (v_u[v_i], 'party-leave-together §4 probe') on conflict (user_id) do nothing;
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(0): hr_create_character refused: %', v; end if;
      update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u[v_i] and slot = 0;
      insert into public.social_presence (user_id, slot, seen_at) values (v_u[v_i], 0, now()) on conflict (user_id) do update set seen_at = now();
    end loop;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_create_character(1);
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_a and slot = 1;

    -- (0) THE DEFAULT IS ON, for every new hero, before any party.
    if exists (select 1 from public.player_state where user_id = any (v_u) and party_leave_together is distinct from true)
       or (select count(*) from public.player_state where user_id = any (v_u)) <> 3 then
      raise exception 'VERIFY(0): a new hero''s box is not on'; end if;
    v := public.hr_hunt_party_invite_own(0, 1, (k || '5ea70100')::uuid);
    v_pid := public.hr_hunt_party_of(v_a, 0);
    v := public.hr_hunt_party_invite(0, 'Probe Leave B', (k || '5ea70101')::uuid);
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_hunt_party_accept(0, (public.hr_state_of(v_b, 0)->'party_invites'->0->>'id')::uuid, (k || '5ea70102')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v_pid is null then raise exception 'VERIFY(0): the party did not form: %', v; end if;
    if public.hr_hunt_party_view(v_b, 0)->'leave_together' is distinct from 'true'::jsonb
       or public.hr_state_of(v_a, 1)->'party'->'leave_together' is distinct from 'true'::jsonb then
      raise exception 'VERIFY(0): the party view reads %', public.hr_hunt_party_view(v_b, 0)->'leave_together'; end if;

    -- (a) THE INTENT: refusals first, nothing written by any of them.
    delete from public.hr_rate_counters where user_id = any (v_u);
    perform set_config('request.jwt.claim.sub', '', true);
    v := public.hr_party_leave_together_set(0, false, (k || '5ea70110')::uuid);
    if v->>'error' is distinct from 'not_signed_in' then raise exception 'VERIFY(a): a signed-out call answered %', v; end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_party_leave_together_set(6, false, (k || '5ea70111')::uuid);
    if v->>'error' is distinct from 'bad_slot' then raise exception 'VERIFY(a): slot 6 answered %', v; end if;
    v := public.hr_party_leave_together_set(0, null, (k || '5ea70112')::uuid);
    if v->>'error' is distinct from 'bad_value' then raise exception 'VERIFY(a): a null box answered %', v; end if;
    v := public.hr_party_leave_together_set(0, false, null);
    if v->>'error' is distinct from 'bad_idem' then raise exception 'VERIFY(a): no key answered %', v; end if;
    v := public.hr_party_leave_together_set(3, false, (k || '5ea70113')::uuid);
    if v->>'error' is distinct from 'no_character' then raise exception 'VERIFY(a): an empty slot answered %', v; end if;
    if exists (select 1 from public.player_state where user_id = any (v_u) and not party_leave_together) then
      raise exception 'VERIFY(a): a refusal wrote a box'; end if;
    -- (b) B UNTICKS its own hero: only B's box moves (no argument reaches A's heroes); the same key replays.
    v := public.hr_party_leave_together_set(0, false, (k || '5ea70114')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v->'leave_together' is distinct from 'false'::jsonb
       or v->'party'->'leave_together' is distinct from 'false'::jsonb
       or (select party_leave_together from public.player_state where user_id = v_b and slot = 0)
       or not (select party_leave_together from public.player_state where user_id = v_a and slot = 0)
       or not (select party_leave_together from public.player_state where user_id = v_a and slot = 1) then
      raise exception 'VERIFY(b): B''s untick answered % (A''s boxes must not move)', v; end if;
    v := public.hr_party_leave_together_set(0, true, (k || '5ea70114')::uuid);
    if v->'leave_together' is distinct from 'false'::jsonb or (select party_leave_together from public.player_state where user_id = v_b and slot = 0) then
      raise exception 'VERIFY(b): a replayed key moved the box: %', v; end if;
    if (select count(*) from public.player_intents where user_id = v_b and intent = 'party_leave_together') <> 1 then
      raise exception 'VERIFY(b): the set is not journalled once'; end if;
    -- the party bucket: 12 a minute, the 13th refused rate_limited and nothing written.
    delete from public.hr_rate_counters where user_id = any (v_u);
    for v_i in 1 .. 12 loop
      v := public.hr_party_leave_together_set(0, false, gen_random_uuid());
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): set % of 12 answered %', v_i, v; end if;
    end loop;
    v := public.hr_party_leave_together_set(0, true, gen_random_uuid());
    if v->>'error' is distinct from 'rate_limited' or (select party_leave_together from public.player_state where user_id = v_b and slot = 0) then
      raise exception 'VERIFY(a): the 13th set in a minute answered %', v; end if;
    delete from public.hr_rate_counters where user_id = any (v_u);
    -- REMEMBERED ACROSS A NEW PARTY: B leaves (in town) and is invited into the party again; A's boxes stay on.
    v := public.hr_hunt_party_leave(0, (k || '5ea70115')::uuid);
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_hunt_party_invite(0, 'Probe Leave B', (k || '5ea70116')::uuid);
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_hunt_party_accept(0, (public.hr_state_of(v_b, 0)->'party_invites'->0->>'id')::uuid, (k || '5ea70117')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or public.hr_hunt_party_view(v_b, 0)->'leave_together' is distinct from 'false'::jsonb
       or public.hr_hunt_party_view(v_a, 0)->'leave_together' is distinct from 'true'::jsonb then
      raise exception 'VERIFY(b): the boxes in the new party read B % / A %', public.hr_hunt_party_view(v_b, 0)->'leave_together',
        public.hr_hunt_party_view(v_a, 0)->'leave_together'; end if;

    -- THE HUNT: the leader starts it; the engine's read carries every member's box.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_hunt_party_start(0, v_g, (k || '5ea70120')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): the start answered %', v; end if;
    select id into v_sa0 from public.hunt_sessions where user_id = v_a and slot = 0 and ended_at is null;
    select id into v_sa1 from public.hunt_sessions where user_id = v_a and slot = 1 and ended_at is null;
    select id into v_sb  from public.hunt_sessions where user_id = v_b and slot = 0 and ended_at is null;
    if v_sa0 is null or v_sa1 is null or v_sb is null
       or (select count(distinct instance_id) from public.hunt_sessions where id in (v_sa0, v_sa1, v_sb)) <> 1 then
      raise exception 'VERIFY(c): the party is not one instance'; end if;
    if (select string_agg((m->>'leave_together'), ',' order by m->>'user', m->>'slot')
          from jsonb_array_elements(public.hr_hunt_instance_read(v_b, 0)->'members') m) <> 'true,true,false' then
      raise exception 'VERIFY(c): the engine reads the boxes %', public.hr_hunt_instance_read(v_b, 0)->'members'; end if;
    v_at := date_trunc('second', now() - interval '10 minutes');
    update public.hunt_sessions set entered_at = v_at - interval '1 minute', hunt_from = v_at, settled_to = v_at, next_swing_at = v_at
     where instance_id = v_pid and ended_at is null;
    update public.hunt_instances set settled_to = v_at, next_swing_at = v_at where id = v_pid;
    -- (c) A0 LEAVES. The live horizon puts its end at or after now; every member walks the same swings to it.
    v := public.hr_hunt_leave(0, (k || '5ea70121')::uuid);
    select leave_at into v_lat from public.hunt_sessions where id = v_sa0;
    v_kk := ceil(extract(epoch from (v_lat - v_at)) * 1000 / v_t)::bigint;
    -- B (unticked) claiming the cascade is refused, and the refusal moves nothing.
    v := pg_temp.hr_plt_settle(v_pid, v_kk, jsonb_build_object(v_a::text || ':0', jsonb_build_object('reason', 'left'),
           v_a::text || ':1', jsonb_build_object('reason', 'party_member_left'), v_b::text || ':0', jsonb_build_object('reason', 'party_member_left')));
    if v->>'error' is distinct from 'end_not_proven' or (select settled_to from public.hunt_instances where id = v_pid) <> v_at
       or exists (select 1 from public.hunt_sessions where id in (v_sa0, v_sa1, v_sb) and ended_at is not null) then
      raise exception 'VERIFY(c): an unticked hero''s cascade end answered %', v; end if;
    select level_xp into v_lx from public.player_state where user_id = v_a and slot = 1;
    -- the honest window: A0 left, A1 (ticked) ends party_member_left at A0's boundary, B hunts on.
    v := pg_temp.hr_plt_settle(v_pid, v_kk, jsonb_build_object(v_a::text || ':0', jsonb_build_object('reason', 'left'),
           v_a::text || ':1', jsonb_build_object('reason', 'party_member_left')));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): the leave window answered %', v; end if;
    if (select end_reason from public.hunt_sessions where id = v_sa0) is distinct from 'left'
       or (select end_reason from public.hunt_sessions where id = v_sa1) is distinct from 'party_member_left'
       or (select ended_at from public.hunt_sessions where id = v_sa1) is distinct from (select ended_at from public.hunt_sessions where id = v_sa0)
       or (select ended_at from public.hunt_sessions where id = v_sb) is not null then
      raise exception 'VERIFY(c): the ends are A0 % / A1 % / B open %', (select end_reason from public.hunt_sessions where id = v_sa0),
        (select end_reason from public.hunt_sessions where id = v_sa1), (select ended_at is null from public.hunt_sessions where id = v_sb); end if;
    -- SETTLED FIRST: A1's owed window up to its end is credited in the same commit (its kill, its Level XP, its
    -- accrue row through the end instant), and its session is settled through the end.
    if (select level_xp from public.player_state where user_id = v_a and slot = 1) <> v_lx + 1
       or (select kills from public.hunt_session_tally where session_id = v_sa1) <> 1
       or not exists (select 1 from public.player_ledger l where l.session_id = v_sa1 and l.kind = 'combat' and l.intent = 'accrue'
                        and (l.meta->>'to')::timestamptz = (select ended_at from public.hunt_sessions where id = v_sa1) + interval '1 millisecond')
       or (select settled_to from public.hunt_sessions where id = v_sa1) <> (select ended_at from public.hunt_sessions where id = v_sa1) + interval '1 millisecond' then
      raise exception 'VERIFY(c): the cascaded hero was not settled before it ended'; end if;
    -- WHO SENT IT HOME: A1's session names A0; A0's own end names nobody.
    if public.hr_hunt_view(v_sa1)->>'end_by' is distinct from 'Probe Leave A' or public.hr_hunt_view(v_sa0)->'end_by' <> 'null'::jsonb then
      raise exception 'VERIFY(c): end_by reads % / %', public.hr_hunt_view(v_sa1)->'end_by', public.hr_hunt_view(v_sa0)->'end_by'; end if;
    -- NO LOOP, NO SQL-SIDE CASCADE: the database ended exactly the two the window named; closing a session ends no other.
    if (select count(*) from public.hunt_sessions where instance_id = v_pid and ended_at is not null) <> 2 then
      raise exception 'VERIFY(c): the database ended % sessions', (select count(*) from public.hunt_sessions where instance_id = v_pid and ended_at is not null); end if;
    -- (d) B, UNTICKED, HUNTS ON alone.
    v := pg_temp.hr_plt_settle(v_pid, 5, '{}'::jsonb);
    if coalesce(v->>'ok', '') <> 'true' or (select ended_at from public.hunt_sessions where id = v_sb) is not null
       or (select kills from public.hunt_session_tally where session_id = v_sb) <> 2 then
      raise exception 'VERIFY(d): B''s window alone answered %', v; end if;
    -- B leaves too (alone: nobody to cascade to), and everyone is back in town.
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_hunt_leave(0, (k || '5ea70130')::uuid);
    select leave_at into v_lat from public.hunt_sessions where id = v_sb;
    v := pg_temp.hr_plt_settle(v_pid, ceil(extract(epoch from (v_lat - (select settled_to from public.hunt_sessions where id = v_sb))) * 1000 / v_t)::bigint,
           jsonb_build_object(v_b::text || ':0', jsonb_build_object('reason', 'left')));
    if coalesce(v->>'ok', '') <> 'true' or (select end_reason from public.hunt_sessions where id = v_sb) is distinct from 'left' then
      raise exception 'VERIFY(d): B''s leave answered %', v; end if;

    -- (e) START AGAIN TOGETHER, the boxes as set (A on, B off), then a DEATH cascades to A1 only.
    update public.player_state set active_kind = 'idle', active_id = null where user_id = any (v_u);
    update public.social_presence set seen_at = now() where user_id = any (v_u);
    delete from public.hr_rate_counters where user_id = any (v_u);
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_hunt_party_start(0, v_g, (k || '5ea70140')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(e): the second start answered %', v; end if;
    if (select string_agg((m->>'leave_together'), ',' order by m->>'user', m->>'slot')
          from jsonb_array_elements(public.hr_hunt_instance_read(v_a, 0)->'members') m) <> 'true,true,false'
       or public.hr_hunt_party_view(v_b, 0)->'leave_together' is distinct from 'false'::jsonb then
      raise exception 'VERIFY(e): the boxes after starting again read %', public.hr_hunt_instance_read(v_a, 0)->'members'; end if;
    select id into v_sa0 from public.hunt_sessions where user_id = v_a and slot = 0 and ended_at is null;
    select id into v_sa1 from public.hunt_sessions where user_id = v_a and slot = 1 and ended_at is null;
    select id into v_sb  from public.hunt_sessions where user_id = v_b and slot = 0 and ended_at is null;
    v_at := date_trunc('second', now() - interval '5 minutes');
    update public.hunt_sessions set entered_at = v_at - interval '1 minute', hunt_from = v_at, settled_to = v_at, next_swing_at = v_at
     where instance_id = v_pid and ended_at is null;
    update public.hunt_instances set settled_to = v_at, next_swing_at = v_at where id = v_pid;
    -- the probe's clock moved back, so its stamina is measured from the hunt's (backdated) start
    update public.player_state set stamina_at = v_at where user_id = any (v_u);
    v := pg_temp.hr_plt_settle(v_pid, 5, jsonb_build_object(v_a::text || ':0', jsonb_build_object('reason', 'died', 'died', true),
           v_a::text || ':1', jsonb_build_object('reason', 'party_member_died'), v_b::text || ':0', jsonb_build_object('reason', 'party_member_died')));
    if v->>'error' is distinct from 'end_not_proven' or exists (select 1 from public.hunt_sessions where id in (v_sa0, v_sa1, v_sb) and ended_at is not null) then
      raise exception 'VERIFY(e): an unticked hero''s party_member_died answered %', v; end if;
    v := pg_temp.hr_plt_settle(v_pid, 5, jsonb_build_object(v_a::text || ':0', jsonb_build_object('reason', 'died', 'died', true),
           v_a::text || ':1', jsonb_build_object('reason', 'party_member_died')));
    if coalesce(v->>'ok', '') <> 'true'
       or (select end_reason from public.hunt_sessions where id = v_sa0) is distinct from 'died'
       or (select end_reason from public.hunt_sessions where id = v_sa1) is distinct from 'party_member_died'
       or (select ended_at from public.hunt_sessions where id = v_sb) is not null
       or public.hr_hunt_view(v_sa1)->>'end_by' is distinct from 'Probe Leave A' then
      raise exception 'VERIFY(e): the death window answered % (A0 %, A1 %, B open %)', v, (select end_reason from public.hunt_sessions where id = v_sa0),
        (select end_reason from public.hunt_sessions where id = v_sa1), (select ended_at is null from public.hunt_sessions where id = v_sb); end if;

    -- (f) THE GRANTS.
    if not has_function_privilege('authenticated', 'public.hr_party_leave_together_set(integer,boolean,uuid)', 'execute')
       or has_function_privilege('anon', 'public.hr_party_leave_together_set(integer,boolean,uuid)', 'execute')
       or has_function_privilege('service_role', 'public.hr_party_leave_together_set(integer,boolean,uuid)', 'execute')
       or not exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_party_leave_together_set' and grantee = 'authenticated')
       or has_function_privilege('authenticated', 'public.hr_hunt_instance_read(uuid,integer)', 'execute')
       or not has_function_privilege('hr_engine', 'public.hr_hunt_instance_read(uuid,integer)', 'execute') then
      raise exception 'VERIFY(f): a grant is wrong'; end if;
    raise exception using errcode = 'HRPLT', message = 'party-leave-together §4 complete - rolling back';
  exception when sqlstate 'HRPLT' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = any (v_u)) or to_regprocedure('pg_temp.hr_plt_settle(uuid,bigint,jsonb)') is not null then
    raise exception 'VERIFY: §4 LEAKED a probe row or function'; end if;
  -- (f) EACH SPLICE ONCE (a second apply of this file moves no body).
  foreach v_role in array array['public.hr_hunt_party_view(uuid,integer)', 'public.hr_hunt_instance_read(uuid,integer)',
                                'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)', 'public.hr_hunt_view(uuid)'] loop
    if (select (length(prosrc) - length(replace(prosrc, 'LEAVE-TOGETHER', ''))) / length('LEAVE-TOGETHER')
          from pg_proc where oid = v_role::regprocedure) <> 1 then
      raise exception 'VERIFY(f): % carries the LEAVE-TOGETHER splice other than once', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'party-leave-together: default on and remembered; own hero only; a leave and a death send only ticked heroes home, settled first; unticked heroes hunt on; no loop; all green';
end $$;
