-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-09-frame-self-echo.sql
-- STAGED, NOT APPLIED. Lane C: Security reviews this file before the
-- Coordinator applies it (CLAUDE.md §2). Agents never apply it.
--
-- A PLAYER'S OWN HTTP WRITE IS NOT PUSHED BACK TO THAT PLAYER.
--
-- ── THE MEASUREMENT (10-06, 2026-10-07-frame-emit-online-only.sql header) ──
-- At 200 rostered characters, 20 % online, with tick frames already sent only
-- to a live window, frames come to 5.26 M a month. 4.10 M of them (78 %) are
-- HTTP-originated, and nearly all of those are the echo of the caller's OWN
-- write: hr_apply emits one frame per accepted write, the caller's browser
-- already applied the same envelope from its HTTP response, and the frame
-- carries nothing the response did not. That echo is the whole of the gap
-- between 5.26 M and the ~1.15 M the tick needs.
--
-- ── WHERE THE MARKER LIVES, AND WHY THERE ────────────────────────────────
-- The edge sets ONE transaction-local GUC on every player-path transaction,
--     select set_config('hr.frame_self', '<verified jwt sub>:<slot>', true);
-- (supabase/functions/hr-accrue/frame-self.js + index.ts), and the emit gate
-- hr_frame_wanted suppresses a non-tick frame ONLY when ALL of these hold:
--   (a) the transaction is not a tick (hr.frame_origin <> 'tick'). The tick
--       branch is checked FIRST and is byte-for-byte the 10-07 rule, so no
--       self marker can ever touch a world-tick frame;
--   (b) the marker names EXACTLY the frame's (user, slot). A write the caller
--       causes to ANOTHER character in the same transaction (a market sale's
--       seller, a party member) carries a different (user, slot) and is sent;
--   (c) the caller is the ENGINE: the `role` GUC is hr_engine, the same
--       secondary identity test hr_apply uses to trust p_user at all
--       (2026-09-14-hr-apply-restatement.sql step 1). An owner session, a
--       migration, and every PostgREST role are never honoured;
--   (d) the request carries NO JWT claim GUC. PostgREST sets
--       request.jwt.claims (and the legacy request.jwt.claim.sub) on every
--       client request, so a client-reachable context ignores the marker
--       even if some future RPC ever let a client name a GUC.
-- Every unknown (malformed claims, an error in the gate) means SEND.
--
-- WHY NOT THE OTHER PLACE (the DB deriving "own intent" on its own): the
-- database cannot tell who caused a write. hr_apply's p_user is the character
-- written, not the requester, and one HTTP transaction can write to several
-- characters (market proceeds, party fan-out). Only the edge holds the
-- verified requester, and it already passes that identity to hr_apply as
-- p_user under the same hr_engine trust. Deriving "self" from p_user alone
-- would suppress a seller's or a party member's frame. Binding the marker to
-- (user, slot) and to the engine role keeps the rule exact. At scale it costs
-- one GUC read on the emit path (no row read, no lock): the gate's non-tick
-- branch is O(1) and is reached only after hr_apply has written.
--
-- ZERO CLIENT TRUST. The marker is not a client value: the edge takes the
-- user from the verified JWT (verifyJwt), never from the body, and the slot
-- from the same parsed slot hr_apply is called with. A forged marker in a
-- client context is ignored by (c) and (d), and even a marker the engine set
-- can only silence frames addressed to the requester's own (user, slot) —
-- frames that carry nothing the requester did not just receive over HTTP.
--
-- WHAT A SUPPRESSED FRAME COSTS IF THE HTTP RESPONSE IS LOST: the client heals
-- (src/net/accrue.js requestGapHeal → record.js requestRecord, the existing
-- hr_load projection read). It heals on an intent or accrue request that ended
-- without an envelope, on a pushed frame whose version jumps past the floor,
-- and on a settle-poll answer whose version is above the floor.
--
--   · RESTATED hr_frame_wanted(uuid,int): the 10-07 body with the self-echo
--              branch after the tick branch. Signature, volatility, owner
--              and grants unchanged.
--
-- ── NOTHING HERE MOVES VALUE ───────────────────────────────────────────────
-- No table, no column, no client grant (hr_client_rpc_baseline unchanged).
-- The gate can only DROP a frame, after the value is computed, clamped,
-- written and journalled. §9 e1 proves by execution that the suppressed write
-- paid exactly what an unsuppressed one pays.
--
-- ── AFTER APPLYING (Coordinator; CLAUDE.md §2) ─────────────────────────────
-- tests/live-hash-drift.mjs is red with ONE entry, measured on this branch,
-- credential-free, before the apply (exit 1): `RED untracked hr_frame_wanted`
-- (§1 is its second restatement, so the sweep now tracks it). Re-seed with
-- `--live --write` and write the why from `--codediff`. No new table,
-- so restore-census is a no-op. Flip this file's apply-order note to APPLIED.
-- The edge half (frame-self.js) is inert until this file is applied: the
-- 10-07 gate does not read hr.frame_self. This file is inert until the edge
-- half is deployed: nothing sets hr.frame_self. Either order is safe.
--
-- ── REVERSIBLE ─────────────────────────────────────────────────────────────
-- `update public.hr_tick_config set frame_push = false;` still stops every
-- frame. To undo only this file, re-apply §1 of
-- 2026-10-07-frame-emit-online-only.sql (hr_frame_wanted without the self
-- branch). Re-applying THIS file is byte-identical (create or replace).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PREFLIGHT ────────────────────────────────────────────────────────────
-- §9 writes the hr_tick_config singleton, which the tick driver updates on
-- every fire; a queue there becomes a clean failure. On 55P03 nothing has
-- landed: re-run in a quieter minute (not 00:00–00:10 UTC, not 22:00 UTC).
set local lock_timeout = '3s';

do $$
begin
  if to_regprocedure('public.hr_frame_wanted(uuid,integer)') is null
     or to_regprocedure('public.hr_frame_send(uuid,integer,jsonb)') is null then
    raise exception 'run 2026-10-07-frame-emit-online-only.sql first: the gate this file extends is missing';
  end if;
  if position('public.hr_frame_wanted(p_user, p_slot)' in
       pg_get_functiondef('public.hr_frame_send(uuid,integer,jsonb)'::regprocedure)) = 0 then
    raise exception 'PRECONDITION: hr_frame_send does not consult hr_frame_wanted, so this gate would never be read';
  end if;
  if to_regprocedure('public.hr_tick_settle(text,uuid,integer,text,bigint,timestamp with time zone,timestamp with time zone,uuid,jsonb,jsonb)') is null then
    raise exception 'PRECONDITION: hr_tick_settle is missing; the tick-wins property cannot be executed';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'hr_engine') then
    raise exception 'PRECONDITION: role hr_engine is missing; the marker is bound to it';
  end if;
end $$;

-- ── §1 THE GATE, RESTATED WITH THE SELF-ECHO BRANCH ────────────────────────
-- STABLE, SECURITY INVOKER, called only from hr_frame_send (SECURITY DEFINER).
create or replace function public.hr_frame_wanted(p_user uuid, p_slot int)
returns boolean language plpgsql stable set search_path = public as $fn$
declare
  -- THREE HEARTBEATS (2026-10-07-frame-emit-online-only.sql §1, unchanged).
  c_ttl  constant interval := interval '75 seconds';
  v_seen timestamptz;
  v_self text;
  v_role text;
begin
  -- ── (1) A TICK. Checked FIRST, and unchanged: a tick frame goes to a live
  --        window and to nobody else. No self marker is read on this branch,
  --        so a player's own write can never silence a world-tick settle.
  if coalesce(current_setting('hr.frame_origin', true), '') = 'tick' then
    select ps.last_seen_at into v_seen
      from public.player_state ps
     where ps.user_id = p_user and ps.slot = p_slot;
    return v_seen is not null
       and v_seen >  now() - c_ttl
       and v_seen <= now() + interval '60 seconds';
  end if;

  -- ── (2) NOT A TICK. The echo of the caller's OWN write is not sent: the
  --        caller already holds this envelope from its HTTP response
  --        (2026-10-09-frame-self-echo.sql). Every other frame is sent.
  v_self := coalesce(current_setting('hr.frame_self', true), '');
  if v_self = '' or p_user is null or p_slot is null then return true; end if;
  -- (b) EXACTLY this character. A write to anyone else is someone else's news.
  if lower(v_self) <> p_user::text || ':' || p_slot::text then return true; end if;
  -- (c) ONLY THE ENGINE. The same identity test hr_apply trusts p_user on.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role is distinct from 'hr_engine' then return true; end if;
  -- (d) NEVER A CLIENT REQUEST. PostgREST stamps the JWT on every request.
  if nullif(current_setting('request.jwt.claims', true), '') is not null
     or nullif(current_setting('request.jwt.claim.sub', true), '') is not null then
    return true;
  end if;
  return false;
end $fn$;

-- ── §5 GRANTS — revoke from PUBLIC first (CLAUDE.md §2) ─────────────────────
-- create or replace keeps the ACL; restated so a fresh database is the same.
revoke execute on function public.hr_frame_wanted(uuid, int) from public;
revoke execute on function public.hr_frame_wanted(uuid, int) from anon, authenticated, service_role;
do $$
declare v_r text;
begin
  foreach v_r in array array['hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = v_r) then
      execute format('revoke execute on function public.hr_frame_wanted(uuid, int) from %I', v_r);
    end if;
  end loop;
end $$;

-- ── §9 SELF-CHECK — EXECUTED (CLAUDE.md §4) ─────────────────────────────────
-- PROBE ROWS ONLY: every player row written here is keyed on v_u / v_o, uuids
-- gen_random_uuid() does not mint. The whole block is rolled back by a
-- sentinel. hr_tick_config (enabled, channels, armed_channels, frame_push) is
-- captured before the first write, restored explicitly and read back (r1).
-- Where the realtime schema is ABSENT (the PGlite replay) a probe transport is
-- installed and dropped, so the frame counts EXECUTE in CI too.
--
--   c0  catalog: hr_frame_send consults the gate before realtime.send; the
--       gate's tick branch comes before its self branch; no request role can
--       execute it; hr_assert_grant_hygiene(true) passes STRICT
--   c1  owner context: every marker shape is ignored (role is not hr_engine)
--   e1  ★ OWN HTTP WRITE → NO FRAME to the own topic, and it PAID (+13 gold,
--       version +1, ledger rows) exactly like the unmarked control e0
--   e0  control: the same write without the marker → ONE frame
--   e2  ★ another character written in the SAME marked transaction → its frame
--       is sent (the marker silences only the requester)
--   e3  same user, OTHER slot → frame sent
--   e4  ★ WORLD-TICK SETTLE for the same character, online, marker still set
--       in the transaction → ONE frame (tick wins)
--   e5  ★ FORGED: the marker in a PostgREST-shaped request (JWT claims set),
--       naming the probe → frame sent; and the legacy claim.sub shape too
--   e6  malformed / upper-case markers: upper-case is the same identity
--       (suppressed), garbage is not (sent)
--   r1  restore + read back
do $$
declare
  v_u      uuid := '00000000-0000-4000-8000-0000000f5e01';
  v_o      uuid := '00000000-0000-4000-8000-0000000f5e02';
  v_act    text;
  v_t0     timestamptz := date_trunc('second', now()) - interval '20 minutes';
  v_t1     timestamptz := date_trunc('second', now()) - interval '16 minutes';
  v_r      jsonb;
  v_txt    text;
  v_n      int;
  v_v      bigint;
  v_g      bigint;
  v_l      int;
  v_dv     bigint;
  v_dg     bigint;
  v_dl     int;
  v_topic  text;
  v_topic1 text;
  v_topico text;
  v_rt     text := 'absent';   -- 'probe' | 'live' | 'absent'
  v_cfg_en boolean;
  v_cfg_ch text[];
  v_cfg_ar text[];
  v_cfg_fp boolean;
  v_chk_en boolean;
  v_chk_ch text[];
  v_chk_ar text[];
  v_chk_fp boolean;
  v_mark   text;
  v_seq    int := 0;
begin
  begin
    -- ── c0: THE GATE IS ON THE PATH, TICK FIRST ──────────────────────────
    v_txt := replace(pg_get_functiondef('public.hr_frame_send(uuid,integer,jsonb)'::regprocedure), chr(13), '');
    if position('public.hr_frame_wanted(p_user, p_slot)' in v_txt) = 0
       or position('public.hr_frame_wanted(p_user, p_slot)' in v_txt) > position('perform realtime.send(' in v_txt) then
      raise exception 'c0a: hr_frame_send does not consult hr_frame_wanted before it sends';
    end if;
    v_txt := replace(pg_get_functiondef('public.hr_frame_wanted(uuid,integer)'::regprocedure), chr(13), '');
    if position($m$current_setting('hr.frame_origin', true)$m$ in v_txt) = 0
       or position($m$current_setting('hr.frame_self', true)$m$ in v_txt) = 0
       or position($m$current_setting('hr.frame_origin', true)$m$ in v_txt)
          > position($m$current_setting('hr.frame_self', true)$m$ in v_txt) then
      raise exception 'c0b: hr_frame_wanted must read the tick origin BEFORE the self marker, so no '
                      'self marker can reach a tick frame';
    end if;
    foreach v_txt in array array['public', 'anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
      continue when v_txt <> 'public' and not exists (select 1 from pg_roles where rolname = v_txt);
      if has_function_privilege(v_txt, 'public.hr_frame_wanted(uuid,integer)', 'EXECUTE') then
        raise exception 'c0c: % can EXECUTE hr_frame_wanted', v_txt;
      end if;
    end loop;
    perform public.hr_assert_grant_hygiene(true);

    -- ── c1: OWNER CONTEXT IGNORES EVERY MARKER ───────────────────────────
    perform set_config('hr.frame_origin', '', true);
    foreach v_mark in array array[v_u::text || ':0', upper(v_u::text) || ':0', 'garbage', ''] loop
      perform set_config('hr.frame_self', v_mark, true);
      if not public.hr_frame_wanted(v_u, 0) then
        raise exception 'c1: the owner/migration context honoured the self marker %; only the engine may', v_mark;
      end if;
    end loop;
    perform set_config('hr.frame_self', '', true);

    -- ── FIXTURE. Two probe characters; v_u has slot 0 and slot 1. ─────────
    select activity_id into v_act from public.hr_activities where kind = 'gather' order by activity_id limit 1;
    if v_act is null then
      raise exception 'fixture: hr_activities has no gather row, so no armed settle can be driven';
    end if;
    insert into auth.users (id) values (v_u), (v_o) on conflict do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                     accrued_to, active_kind, active_id, active_since)
    values (v_u, 0, 1000, 0, 10, 10, 1, v_t0, 'gather', v_act, v_t0 - interval '1 hour'),
           (v_u, 1, 1000, 0, 10, 10, 1, v_t0, 'idle', null, null),
           (v_o, 0, 1000, 0, 10, 10, 1, v_t0, 'idle', null, null);
    insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
    values (v_u, 0, 'gather', true, 'hr1009-selfcheck', now() + interval '5 minutes');
    v_topic  := public.hr_frame_topic(v_u, 0);
    v_topic1 := public.hr_frame_topic(v_u, 1);
    v_topico := public.hr_frame_topic(v_o, 0);

    -- ── THE CONFIG: captured BEFORE the first write, restored at r1.
    select enabled, channels, armed_channels, frame_push
      into v_cfg_en, v_cfg_ch, v_cfg_ar, v_cfg_fp
      from public.hr_tick_config where id;
    if not found then
      raise exception 'fixture: hr_tick_config has no row, so no tick settle can be driven';
    end if;
    update public.hr_tick_config
       set enabled = true,
           channels = (select array_agg(distinct c order by c) from unnest(channels || array['gather']) c),
           frame_push = true
     where id;
    update public.hr_tick_config set armed_channels = array['gather'] where id;

    -- ── THE TRANSPORT. Probe where absent; a live one only after a control.
    if to_regnamespace('realtime') is null then
      create schema realtime;
      create table realtime.messages (
        id bigserial primary key, topic text not null, event text, payload jsonb,
        private boolean, inserted_at timestamptz not null default now());
      create function realtime.send(jsonb, text, text, boolean default true)
        returns void language sql as
        'insert into realtime.messages (topic, event, payload, private) values ($3, $2, $1, $4)';
      v_rt := 'probe';
    elsif to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null
          and to_regclass('realtime.messages') is not null then
      begin
        perform realtime.send(jsonb_build_object('t', 'hr1009-control'), 'hr1009-control',
                              'hr1009-control:' || v_u::text, true);
        select count(*) into v_n from realtime.messages where topic = 'hr1009-control:' || v_u::text;
      exception when others then
        v_n := -1;
      end;
      if v_n > 1 then
        raise exception 'transport: the control send counted back % rows; every count below would be wrong', v_n;
      end if;
      if v_n = 1 then v_rt := 'live'; end if;
    end if;
    if v_rt = 'absent' then
      raise exception 'transport: realtime.messages does not round-trip from this session, so the '
                      'self-echo property would be asserted on nothing. Apply where realtime works';
    end if;
    if exists (select 1 from realtime.messages where topic in (v_topic, v_topic1, v_topico)) then
      raise exception 'transport: a probe topic already carries rows before the first write';
    end if;

    -- ── WARM-UP. A character's FIRST payment can journal a one-off row of its
    --    own (a ledger-of-firsts fact), so e0 and e1 compare the second and
    --    third payments, never the first. Unmarked: it is frame #1.
    perform set_config('hr.frame_self', '', true);
    select version into v_v from public.player_state where user_id = v_u and slot = 0;
    set local role hr_engine;
    v_r := public.hr_apply(v_u, 0, v_v, '00000000-0000-4000-8000-0000000f5a00',
             jsonb_build_object('gold', 13,
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'selfcheck-http', 'qty', 1))));
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) is not true then
      raise exception 'warm-up: the first probe apply was refused (%)', v_r;
    end if;

    -- ── e0: CONTROL. Unmarked engine write → ONE frame, and what it paid.
    select version, gold into v_v, v_g from public.player_state where user_id = v_u and slot = 0;
    select count(*) into v_l from public.player_ledger where user_id = v_u;
    set local role hr_engine;
    v_r := public.hr_apply(v_u, 0, v_v, '00000000-0000-4000-8000-0000000f5a01',
             jsonb_build_object('gold', 13,
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'selfcheck-http', 'qty', 1))));
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) is not true then
      raise exception 'e0a: the control HTTP apply was refused (%)', v_r;
    end if;
    select version - v_v, gold - v_g into v_dv, v_dg from public.player_state where user_id = v_u and slot = 0;
    select count(*) - v_l into v_dl from public.player_ledger where user_id = v_u;
    select count(*) into v_n from realtime.messages where topic = v_topic;
    if v_n <> 2 then
      raise exception 'e0: an UNMARKED engine write sent % frame(s), expected 2 (warm-up + control). The control is broken, '
                      'so e1''s zero would prove nothing', v_n;
    end if;

    -- ── e1: ★ OWN HTTP WRITE → NO FRAME, AND IT PAID THE SAME ★ ───────────
    perform set_config('hr.frame_self', v_u::text || ':0', true);
    select version, gold into v_v, v_g from public.player_state where user_id = v_u and slot = 0;
    select count(*) into v_l from public.player_ledger where user_id = v_u;
    set local role hr_engine;
    v_r := public.hr_apply(v_u, 0, v_v, '00000000-0000-4000-8000-0000000f5a02',
             jsonb_build_object('gold', 13,
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'selfcheck-http', 'qty', 1))));
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) is not true then
      raise exception 'e1a: the marked HTTP apply was refused (%)', v_r;
    end if;
    select count(*) into v_n from realtime.messages where topic = v_topic;
    if v_n <> 2 then
      raise exception 'e1: the caller''s OWN write was pushed back to the caller (topic at %, expected 2). '
                      'This is the 78 %% of the frame budget this file exists to remove', v_n;
    end if;
    if (select version - v_v from public.player_state where user_id = v_u and slot = 0) <> v_dv
       or (select gold - v_g from public.player_state where user_id = v_u and slot = 0) <> v_dg
       or (select count(*) - v_l from public.player_ledger where user_id = v_u) <> v_dl then
      raise exception 'e1b: the suppressed write paid differently from the unsuppressed control '
                      '(control: version +%, gold +%, ledger +%). A frame is only a copy', v_dv, v_dg, v_dl;
    end if;

    -- ── e2: ★ ANOTHER CHARACTER IN THE SAME MARKED TRANSACTION → SENT ★ ───
    select version into v_v from public.player_state where user_id = v_o and slot = 0;
    set local role hr_engine;
    v_r := public.hr_apply(v_o, 0, v_v, '00000000-0000-4000-8000-0000000f5a03',
             jsonb_build_object('gold', 13,
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'selfcheck-http', 'qty', 1))));
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) is not true then
      raise exception 'e2a: the cross-character apply was refused (%)', v_r;
    end if;
    select count(*) into v_n from realtime.messages where topic = v_topico;
    if v_n <> 1 then
      raise exception 'e2: a write to ANOTHER character inside the requester''s transaction sent % frame(s), '
                      'expected 1. The marker silenced someone else''s news', v_n;
    end if;

    -- ── e3: SAME USER, OTHER SLOT → SENT ─────────────────────────────────
    select version into v_v from public.player_state where user_id = v_u and slot = 1;
    set local role hr_engine;
    v_r := public.hr_apply(v_u, 1, v_v, '00000000-0000-4000-8000-0000000f5a04',
             jsonb_build_object('gold', 13,
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'selfcheck-http', 'qty', 1))));
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) is not true then
      raise exception 'e3a: the slot-1 apply was refused (%)', v_r;
    end if;
    select count(*) into v_n from realtime.messages where topic = v_topic1;
    if v_n <> 1 then
      raise exception 'e3: a write to the requester''s OTHER slot sent % frame(s), expected 1', v_n;
    end if;

    -- ── e4: ★ WORLD-TICK SETTLE, ONLINE, MARKER STILL SET → ONE FRAME ★ ───
    update public.player_state set last_seen_at = now() where user_id = v_u and slot = 0;
    select version into v_v from public.player_state where user_id = v_u and slot = 0;
    set local role hr_engine;
    v_r := public.hr_tick_settle('hr1009-selfcheck', v_u, 0, 'gather', v_v, v_t0, v_t1,
             '00000000-0000-4000-8000-0000000f5b01',
             jsonb_build_object('gold', 13, 'accrued_to', to_jsonb(v_t1),
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'tick', 'qty', 1, 'ticks', 1))));
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) is not true or v_r->>'mode' is distinct from 'armed' then
      raise exception 'e4a: the online armed tick settle did not pay (%). A refusal emits nothing, so '
                      'the count below would measure nothing', v_r;
    end if;
    if current_setting('hr.frame_self', true) is distinct from v_u::text || ':0' then
      raise exception 'e4b: the marker was not still set when the tick settled; e4 proved nothing';
    end if;
    select count(*) into v_n from realtime.messages where topic = v_topic;
    if v_n <> 3 then
      raise exception 'e4: a WORLD-TICK settle for the requester was not pushed (topic at %, expected 3). '
                      'A self marker silenced a tick frame', v_n;
    end if;
    perform set_config('hr.frame_origin', '', true);

    -- ── e5: ★ FORGED IN A CLIENT-SHAPED REQUEST → SENT ★ ─────────────────
    --    The marker names the probe, the role is hr_engine, and the JWT claim
    --    GUC PostgREST stamps on every request is present: ignored.
    perform set_config('hr.frame_self', v_u::text || ':0', true);
    foreach v_mark in array array['claims', 'claim.sub'] loop
      v_seq := v_seq + 1;
      if v_mark = 'claims' then
        perform set_config('request.jwt.claims', jsonb_build_object('sub', v_u, 'role', 'authenticated')::text, true);
      else
        perform set_config('request.jwt.claim.sub', v_u::text, true);
      end if;
      select version into v_v from public.player_state where user_id = v_u and slot = 0;
      select count(*) into v_n from realtime.messages where topic = v_topic;
      set local role hr_engine;
      v_r := public.hr_apply(v_u, 0, v_v, ('00000000-0000-4000-8000-0000000f5c0' || v_seq)::uuid,
               jsonb_build_object('gold', 13,
                 'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                   'meta', jsonb_build_object('src', 'selfcheck-http', 'qty', 1))));
      reset role;
      perform set_config('request.jwt.claims', '', true);
      perform set_config('request.jwt.claim.sub', '', true);
      if coalesce((v_r->>'ok')::boolean, false) is not true then
        raise exception 'e5a: the client-shaped apply (%) was refused (%)', v_mark, v_r;
      end if;
      if (select count(*) from realtime.messages where topic = v_topic) <> v_n + 1 then
        raise exception 'e5: a self marker inside a client-shaped request (%) suppressed a frame. A client '
                        'context must never be able to silence anything', v_mark;
      end if;
    end loop;

    -- ── e6: MARKER SPELLINGS. Upper-case is the same identity; garbage is not.
    foreach v_mark in array array[upper(v_u::text) || ':0', v_u::text || ':00', v_u::text, 'x'] loop
      v_seq := v_seq + 1;
      perform set_config('hr.frame_self', v_mark, true);
      select version into v_v from public.player_state where user_id = v_u and slot = 0;
      select count(*) into v_n from realtime.messages where topic = v_topic;
      set local role hr_engine;
      v_r := public.hr_apply(v_u, 0, v_v, ('00000000-0000-4000-8000-0000000f5c' || lpad(v_seq::text, 2, '0'))::uuid,
               jsonb_build_object('gold', 13,
                 'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                   'meta', jsonb_build_object('src', 'selfcheck-http', 'qty', 1))));
      reset role;
      if coalesce((v_r->>'ok')::boolean, false) is not true then
        raise exception 'e6a: the apply under marker % was refused (%)', v_mark, v_r;
      end if;
      select count(*) - v_n into v_n from realtime.messages where topic = v_topic;
      if v_mark = upper(v_u::text) || ':0' and v_n <> 0 then
        raise exception 'e6: the upper-case spelling of the requester''s own marker sent a frame';
      elsif v_mark <> upper(v_u::text) || ':0' and v_n <> 1 then
        raise exception 'e6: the marker % (not this character) suppressed its frame', v_mark;
      end if;
    end loop;
    perform set_config('hr.frame_self', '', true);

    -- ── r1: RESTORE, EXPLICITLY, AND READ BACK ───────────────────────────
    update public.hr_tick_config set armed_channels = '{}'::text[] where id;
    update public.hr_tick_config
       set channels = v_cfg_ch, enabled = v_cfg_en, frame_push = v_cfg_fp where id;
    update public.hr_tick_config set armed_channels = v_cfg_ar where id;
    select enabled, channels, armed_channels, frame_push
      into v_chk_en, v_chk_ch, v_chk_ar, v_chk_fp
      from public.hr_tick_config where id;
    if v_chk_en is distinct from v_cfg_en or v_chk_ch is distinct from v_cfg_ch
       or v_chk_ar is distinct from v_cfg_ar or v_chk_fp is distinct from v_cfg_fp then
      raise exception 'r1: hr_tick_config was NOT restored';
    end if;
    if v_rt = 'probe' then
      drop schema realtime cascade;
      if to_regnamespace('realtime') is not null then
        raise exception 'r1b: the probe realtime schema survived its own drop';
      end if;
    end if;

    raise exception 'HR1009_ROLLBACK_OK';
  exception
    when others then
      if sqlerrm <> 'HR1009_ROLLBACK_OK' then raise; end if;
  end;
  raise notice 'frame-self-echo self-check PASSED (c0-c1, e0-e6, r1); probe rows rolled back';
end $$;
