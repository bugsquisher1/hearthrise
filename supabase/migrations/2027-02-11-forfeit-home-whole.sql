-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-11-forfeit-home-whole.sql — A FORFEIT COMES HOME FULL TOO
--   (lane/c-beta-capacity, reliability-engineer, 2026-10-31).
--
-- STATUS: STAGED. The Coordinator applies (tools/apply-migration.mjs, one file,
-- never inside begin/commit, never 00:00-00:10 UTC). Pre-EA: applies on its
-- passing §2; on the EA Security list (writes player_state.hp; moves no value).
-- EDGE: none. CLIENT: none.
--
-- ── THE BUG ─────────────────────────────────────────────────────────────────
-- v0.2.72 (lane/a-town-heal, combat-sim.js endMember) sends every hunt end home
-- at full HP: the ENGINE writes delta.hp = max. A forfeit (six refused windows,
-- hr_hunt_forfeit_seat) ends the hunt WITHOUT the engine: nothing of the pending
-- window is credited, hr_hunt_close sends the bag home and points the hero at
-- town, and player_state.hp stays what the last landed window left. The hero
-- stands in town hurt, and member.js starts the next hunt from that stored HP.
--
-- ── THE FIX ─────────────────────────────────────────────────────────────────
-- §1 hr_hunt_close, when it sends the hero home (p_return_bag: true on every end;
-- false only for hr_hunt_swap, whose hero stays in the hunt), writes max HP by the
-- server's own hr_vitals_of. Mana is not stored anywhere: a hero in town reads
-- full mana and enters every hunt full (hr_vitals_of max_mana), so there is no
-- second column to write. On an engine end the write is the value the engine
-- already wrote; one hr_vitals_of (~2 ms) per hunt END, never per settle.
-- The version bump is hr_hunt_point's, in the same statement group, so the next
-- envelope carries both.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-run the pre-image (§0's md5 38b1542e, 2026-10-23-hunt-world-state.sql's body).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS — FAIL CLOSED ──────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc
   where oid = to_regprocedure('public.hr_hunt_close(uuid,text,timestamp with time zone,boolean)');
  if v_md5 is null then raise exception 'PRECONDITION: hr_hunt_close is absent'; end if;
  if v_md5 <> '38b1542edf4c9112f2b2c27d8039fd82'
     and position('FORFEIT-HOME-WHOLE' in (select prosrc from pg_proc where oid = 'public.hr_hunt_close(uuid,text,timestamp with time zone,boolean)'::regprocedure)) = 0 then
    raise exception 'PIN: hr_hunt_close is neither its live image (38b1542e...) nor this file''s - md5 %', v_md5;
  end if;
  if to_regprocedure('public.hr_vitals_of(uuid,integer)') is null then
    raise exception 'PRECONDITION: hr_vitals_of is absent';
  end if;
end $mig$;

-- ── §1 hr_hunt_close ────────────────────────────────────────────────────────
create or replace function public.hr_hunt_close(p_session uuid, p_reason text, p_at timestamptz, p_return_bag boolean)
returns void language plpgsql set search_path = public, pg_catalog as $$
declare v_s public.hunt_sessions%rowtype; v_b record;
begin
  select * into v_s from public.hunt_sessions where id = p_session for update;
  if not found or v_s.ended_at is not null then return; end if;
  if p_return_bag then
    for v_b in select item_id, qty_left from public.hunt_bag where session_id = p_session and qty_left > 0 order by item_id loop
      insert into public.player_inventory as pi (user_id, slot, item_id, qty)
        values (v_s.user_id, v_s.slot, v_b.item_id, v_b.qty_left)
        on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
      perform public.hr_hunt_ledger_pair(v_s.user_id, v_s.slot, p_session, null, v_b.item_id, v_b.qty_left, 'hunt_return');
    end loop;
    update public.hunt_bag set qty_left = 0 where session_id = p_session and qty_left > 0;
  end if;
  update public.hunt_sessions
     set ended_at = greatest(p_at, entered_at), end_reason = p_reason, unit_id = null,
         leave_at = null, change_at = null, change_to = null, version = version + 1
   where id = p_session;
  insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
  values (p_session, v_s.user_id, v_s.slot, 'ended', greatest(p_at, v_s.entered_at), jsonb_build_object('reason', p_reason));
  if p_return_bag then
    -- FORFEIT-HOME-WHOLE (2027-02-11-forfeit-home-whole.sql): every end comes home at full HP (v0.2.72's rule). An
    -- engine end already wrote it; a forfeit has no engine, so this is the write. Mana is never stored (full in town).
    update public.player_state
       set hp = (public.hr_vitals_of(v_s.user_id, v_s.slot) ->> 'max_hp')::int
     where user_id = v_s.user_id and slot = v_s.slot;
    perform public.hr_hunt_point(v_s.user_id, v_s.slot, null);
  end if;
end $$;
revoke execute on function public.hr_hunt_close(uuid, text, timestamptz, boolean) from public, anon, authenticated, service_role;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ─────────
do $mig$
declare
  v_src text;
begin
  select regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src from pg_proc
   where oid = 'public.hr_hunt_close(uuid,text,timestamp with time zone,boolean)'::regprocedure;
  -- v1 the heal runs only when the hero goes home, and before the pointer moves.
  if position('if p_return_bag then' in v_src) = 0
     or position('max_hp' in v_src) = 0
     or position('max_hp' in v_src) > position('hr_hunt_point' in v_src) then
    raise exception 'forfeit-home-whole §2 v1: hr_hunt_close does not write max HP before it sends the hero home';
  end if;
  -- v2 hr_hunt_swap (the one caller that stays in the hunt) still closes without sending home.
  if position('hr_hunt_close(p_session, ''changed'', p_at, false)' in
       (select prosrc from pg_proc where oid = 'public.hr_hunt_swap(uuid,timestamp with time zone)'::regprocedure)) = 0 then
    raise exception 'forfeit-home-whole §2 v2: hr_hunt_swap no longer closes with p_return_bag false: a swap would heal mid-hunt';
  end if;
  -- v3 no client reaches it.
  if has_function_privilege('authenticated', 'public.hr_hunt_close(uuid,text,timestamp with time zone,boolean)', 'execute')
     or has_function_privilege('anon', 'public.hr_hunt_close(uuid,text,timestamp with time zone,boolean)', 'execute') then
    raise exception 'forfeit-home-whole §2 v3: a client role can execute hr_hunt_close';
  end if;
end $mig$;
