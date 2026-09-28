-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-28-buff-segment-from.sql — A BUFF SEGMENT CARRIES ITS OWN START.
--
-- STATUS: STAGED, NOT APPLIED - REVIEW ONLY. Security F3 of
-- docs/planning/SEC_ABSENCE_PRICED_AT_RETURN_2026-09-28.md. Touches the buff
-- clock, i.e. drop rate / gold find / XP on the ranked surfaces, so it moves only
-- on a Security GO and the Coordinator applies it. APPLY ORDER: after
-- 2026-09-28-settle-before-mutate.sql (tests/schema-apply-order.json).
-- THE EDGE MUST BE REDEPLOYED AT THE SAME CUT: src/core/buffs.js changes in the
-- same commit and reads the `from` this file starts writing.
--
-- ── THE DEFECT (verdict §3.2) ────────────────────────────────────────────────
-- A segment stored {type, magnitude, until, scale} and no start
-- (2026-09-13-buff-segments.sql: "no start field is stored"). The engine prices a
-- window [fromMs, now) with buffQueueFromServer(rows, fromMs), i.e.
-- remaining = until - fromMs, so a Feast eaten at the instant of RETURN looked
-- exactly like one that had been running since the player left: the whole ≤12 h
-- absence paid at the buff's magnitude, and the buff then still ran its full D.
-- A pure mint, 12-2,400 gold per return, repeatable, and an honest client eating
-- right after boot tripped it by accident.
--
-- ── THE RULE THIS FILE INSTALLS ─────────────────────────────────────────────
-- buff_apply stores `from` = the segment start it ALREADY computes
-- (buff-segments step 2: max(now, the latest until among live segments of this
-- type that are at least as strong)). A same-magnitude re-eat that EXTENDS its
-- twin keeps the twin's own start — the segment it lengthens began then, not at
-- its old end. hr_state_of projects `from` beside `until`. src/core/buffs.js
-- `buffQueueFromServer` treats a segment as not running before `from`: the time
-- before it is neither paid nor drained. ONE function for the live tick, the
-- world tick and away accrual, so AWAY-1 is untouched and AWAY-12 is not forked.
-- A row written before this file has no `from`; the engine reads it as
-- until - BUFF_MAX_UNTIL_MS (at most the hour hr_apply's own ceiling allowed),
-- never the whole night.
--
-- ── COST AT 100× PLAYERS ────────────────────────────────────────────────────
-- One more ~40-byte key per segment (worst case 72 segments ≈ 3 KB more on a
-- deliberately stacked character). No table, column, index or row. Written only
-- inside the UPDATE a buff_apply already performs.
--
-- RESTATEMENT-DEBT-ACK: hr_apply and hr_state_of are live-hash-tracked bodies
--   that are patched programmatically. Both anchors are asserted EXACTLY ONCE,
--   and each is the text of one key in one jsonb_build_object — the smallest
--   region this file can account for line by line.
-- ⚠ AFTER APPLYING: re-seed `node tests/live-hash-drift.mjs --live --write`, whys
--   from `--codediff` (Coordinator).
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED, ANCHORS EXACTLY ONCE ───────────────────
do $mig$
declare
  v_apply text; v_state text; v_n int;
  c_a constant text := $anc$        'until', to_jsonb(v_buff_until),
        'scale', to_jsonb(v_buff_scale)));$anc$;
  c_s constant text := $anc$               'scale', coalesce((e.v->>'scale')::numeric, 1),
               'remaining_ms', greatest(0, floor($anc$;
begin
  v_apply := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  v_state := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  if strpos(v_apply, 'c_buff_max_segments') = 0 or strpos(v_apply, 'v_buff_same') = 0 then
    raise exception 'hr_apply does not stack buff segments — apply 2026-09-13-buff-segments.sql first';
  end if;
  if strpos(v_apply, 'hr_require_settled') = 0 then
    raise exception 'hr_apply has no settle-before-mutate gate — apply 2026-09-28-settle-before-mutate.sql '
                    'first (a start stamped on a buff that can still be eaten over an unpaid window '
                    'closes the timing only for the engine, not for the eat)';
  end if;
  if strpos(v_apply, $q$'from', to_jsonb($q$) = 0 then
    v_n := (length(v_apply) - length(replace(v_apply, c_a, ''))) / length(c_a);
    if v_n <> 1 then
      raise exception 'hr_apply: the segment-build anchor appears % time(s), expected exactly 1', v_n; end if;
  end if;
  if strpos(v_state, $q$'from', e.v->>'from'$q$) = 0 then
    v_n := (length(v_state) - length(replace(v_state, c_s, ''))) / length(c_s);
    if v_n <> 1 then
      raise exception 'hr_state_of: the buffs projection anchor appears % time(s), expected exactly 1', v_n; end if;
  end if;
end $mig$;

-- ── 1. hr_apply — buff_apply STAMPS THE SEGMENT'S START ────────────────────
do $mig$
declare v_def text;
begin
  v_def := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, $q$'from', to_jsonb($q$) > 0 then
    raise notice 'hr_apply already stamps a buff segment start — patch skipped'; return; end if;
  v_def := replace(v_def,
    $anc$        'until', to_jsonb(v_buff_until),
        'scale', to_jsonb(v_buff_scale)));$anc$,
    $anc$        'until', to_jsonb(v_buff_until),
        'scale', to_jsonb(v_buff_scale),
        -- THE SEGMENT'S START (2026-09-28-buff-segment-from.sql, Security F3). The
        -- engine pays a segment only from here on: without it a Feast eaten at the
        -- instant of return priced the whole absence. A same-magnitude re-eat that
        -- extends its twin keeps the twin's start (the segment it lengthens began
        -- then); a twin written before this key existed starts at v_buff_now,
        -- which under-pays at most the settle-first residue, never over-pays.
        'from', to_jsonb(case when v_buff_same is not null
                              then least(v_buff_base,
                                         coalesce((v_buff_same->>'from')::timestamptz, v_buff_now))
                              else v_buff_base end)));$anc$);
  execute v_def;
  raise notice 'hr_apply patched: a buff segment stores its start';
end $mig$;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb)
  from anon, authenticated, service_role;
grant  execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;

-- ── 2. hr_state_of — PROJECT `from` BESIDE `until` ─────────────────────────
do $mig$
declare v_def text;
begin
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  if strpos(v_def, $q$'from', e.v->>'from'$q$) > 0 then
    raise notice 'hr_state_of already projects a buff segment start — patch skipped'; return; end if;
  v_def := replace(v_def,
    $anc$               'scale', coalesce((e.v->>'scale')::numeric, 1),
               'remaining_ms', greatest(0, floor($anc$,
    $anc$               'scale', coalesce((e.v->>'scale')::numeric, 1),
               -- THE SEGMENT'S START (2026-09-28-buff-segment-from.sql). The
               -- engine does not pay a segment before it; null on a row written
               -- before the key existed (the engine then assumes the earliest
               -- start the one-hour ceiling allows).
               'from', e.v->>'from',
               'remaining_ms', greatest(0, floor($anc$);
  execute v_def;
  raise notice 'hr_state_of patched: buff segments project their start';
end $mig$;
revoke execute on function public.hr_state_of(uuid, int) from public;
revoke execute on function public.hr_state_of(uuid, int) from anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 3. SELF-CHECK (§4) — (d) BY EXECUTION, ON A PROBE CHARACTER ────────────
-- Every arm drives a REAL buff_apply against a fabricated character inside a
-- subtransaction discarded by a sentinel raise (HR928), so the block is net-zero.
-- Segments are SEEDED so the fresh, queued-behind and twin cases are exact.
do $mig$
declare
  v_r jsonb; v_ver bigint; v_q jsonb; v_seg jsonb; v_env jsonb;
  v_item text; v_type text; v_mag numeric; v_strong timestamptz; v_twin_from timestamptz;
  v_uid constant uuid := '00000f3b-0000-4000-a000-000000000f3b';
  c_j   constant jsonb := '{"kind":"admin","intent":"buff-segment-from:probe"}'::jsonb;
begin
  -- (d0) THE TEXT. Both patches present; the grant posture unchanged.
  if strpos(pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure),
            $q$'from', to_jsonb(case when v_buff_same is not null$q$) = 0 then
    raise exception 'segment-from self-check (d0): hr_apply does not stamp `from`'; end if;
  if strpos(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure),
            $q$'from', e.v->>'from'$q$) = 0 then
    raise exception 'segment-from self-check (d0): hr_state_of does not project `from`'; end if;
  if has_function_privilege('authenticated', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_state_of(uuid,int)', 'execute') then
    raise exception 'segment-from self-check (d0): a client role can execute hr_apply / hr_state_of'; end if;

  begin
    select b.item_id, b.type, b.magnitude into v_item, v_type, v_mag
      from public.hr_item_buffs b order by b.duration_ms desc, b.item_id limit 1;
    if v_item is null then raise exception 'segment-from self-check: FIXTURE — no buff food'; end if;

    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to)
      values (v_uid, 0, 0, 0, 10, 10, 1, now())
      on conflict (user_id, slot) do update set version = 1, buffs = '[]'::jsonb;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, 0, v_item, 50)
      on conflict (user_id, slot, item_id) do update set qty = 50;

    -- (d1) AN EMPTY QUEUE: the segment starts NOW (the server's now()).
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                'items', jsonb_build_object(v_item, -1), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'segment-from self-check (d1): the consume was refused: %', v_r; end if;
    select buffs into v_q from public.player_state where user_id = v_uid and slot = 0;
    if jsonb_array_length(v_q) <> 1 or (v_q->0->>'from') is null
       or (v_q->0->>'from')::timestamptz <> now() then
      raise exception 'segment-from self-check (d1): a fresh segment did not store from = now(): %', v_q; end if;

    -- (d2) QUEUED BEHIND A STRONGER SEGMENT: from = the stronger one's until.
    v_strong := now() + interval '300 seconds';
    update public.player_state set buffs = jsonb_build_array(jsonb_build_object(
        'type', v_type, 'magnitude', v_mag + 10, 'until', to_jsonb(v_strong),
        'from', to_jsonb(now() - interval '30 seconds')))
      where user_id = v_uid and slot = 0;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                'items', jsonb_build_object(v_item, -1), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'segment-from self-check (d2): the consume was refused: %', v_r; end if;
    select e.v into v_seg
      from public.player_state ps, jsonb_array_elements(ps.buffs) e(v)
     where ps.user_id = v_uid and ps.slot = 0 and (e.v->>'magnitude')::numeric = v_mag;
    if v_seg is null or (v_seg->>'from')::timestamptz <> v_strong then
      raise exception 'segment-from self-check (d2): the queued segment did not start where the stronger '
                      'one ends (want %, got %)', v_strong, v_seg;
    end if;

    -- (d3) THE TWIN: a same-magnitude re-eat extends ONE segment and keeps its start.
    v_twin_from := now() - interval '45 seconds';
    update public.player_state set buffs = jsonb_build_array(jsonb_build_object(
        'type', v_type, 'magnitude', v_mag, 'until', to_jsonb(now() + interval '60 seconds'),
        'from', to_jsonb(v_twin_from)))
      where user_id = v_uid and slot = 0;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                'items', jsonb_build_object(v_item, -1), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'segment-from self-check (d3): the re-eat was refused: %', v_r; end if;
    select buffs into v_q from public.player_state where user_id = v_uid and slot = 0;
    if jsonb_array_length(v_q) <> 1 or (v_q->0->>'from')::timestamptz <> v_twin_from then
      raise exception 'segment-from self-check (d3): the extended twin lost its own start (want %, got %)',
                      v_twin_from, v_q;
    end if;

    -- (d4) THE PROJECTION carries the stored start, and null for a pre-key row.
    update public.player_state set buffs = v_q || jsonb_build_array(jsonb_build_object(
        'type', v_type, 'magnitude', v_mag + 1, 'until', to_jsonb(now() + interval '30 seconds')))
      where user_id = v_uid and slot = 0;
    v_env := public.hr_state_of(v_uid, 0);
    select e.v into v_seg from jsonb_array_elements(v_env->'buffs') e(v)
     where (e.v->>'magnitude')::numeric = v_mag;
    if v_seg is null or (v_seg->>'from')::timestamptz <> v_twin_from then
      raise exception 'segment-from self-check (d4): hr_state_of does not project the stored start: %',
                      v_env->'buffs';
    end if;
    select e.v into v_seg from jsonb_array_elements(v_env->'buffs') e(v)
     where (e.v->>'magnitude')::numeric = v_mag + 1;
    if v_seg is null or not (v_seg ? 'from') or jsonb_typeof(v_seg->'from') <> 'null' then
      raise exception 'segment-from self-check (d4): a pre-key row must project from = null: %', v_seg; end if;

    raise exception using errcode = 'HR928', message = 'buff-segment-from §3 complete — rolling back';
  exception when sqlstate 'HR928' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_intents where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'segment-from self-check: §3 LEAKED a probe row'; end if;

  raise notice 'buff-segment-from self-check PASSED: (d1) a fresh segment stores from = now(); (d2) a '
               'weaker one queued behind a stronger one stores from = the stronger one''s until; (d3) a '
               'same-magnitude re-eat keeps its twin''s start; (d4) hr_state_of projects the stored start '
               'and null for a pre-key row; no client role can execute either body';
end $mig$;
