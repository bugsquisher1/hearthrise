-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-07-frame-emit-online-only.sql
-- STAGED, NOT APPLIED. Lane C: Security reviews this file before the
-- Coordinator applies it (CLAUDE.md §2). Agents never apply it.
--
-- TWO BLOCKERS ON `frame_push = true`, FROM RELIABILITY
-- (docs/planning/REL_M5_FLIP_2026-10-06.md, origin/rel/m5-flip 9465b98c).
--
-- ── (1) F4c: A TICK FRAME FOR A CHARACTER NOBODY IS WATCHING ──────────────
-- hr_apply emits one frame per accepted write (2026-09-23-frame-emit-from-apply
-- .sql). Once the world tick is armed, that includes every rostered character
-- the tick pays, online or not: 30 d × 86,400 s / 90 s flush = 28,800 frames
-- per character-month, sent to a topic with no subscriber. The Free Realtime
-- quota (2 M messages/month) is spent at ~69 rostered characters.
--
-- THE CHANGE: a frame from a TICK-originated hr_apply is sent only when the
-- character has a live window, read from player_state.last_seen_at. That column
-- is stamped with now() by hr_heartbeat (2026-09-13-town-presence.sql §6),
-- which the client already calls every 25 s while the tab is visible
-- (src/net/town.js TOWN_POLL_MS). TTL 75 s, which is three beats. Every other
-- origin (an HTTP intent, a client RPC, another player's market buy) keeps
-- today's behaviour and is not gated.
--
--   · NEW      hr_frame_wanted(uuid,int): the gate. Not a tick: always true.
--              A tick: true only if last_seen_at is in (now() - 75 s, now() + 60 s].
--   · RESTATED hr_frame_send(uuid,int,jsonb): the 2026-09-23 body with ONE
--              added line, the gate, after the kill switch and before the send.
--   · PATCHED  hr_tick_settle and hr_party_tick_settle: ONE line each, right
--              after the identity check:
--                  perform set_config('hr.frame_origin', 'tick', true);
--              This is the only way a tick transaction is marked. It is
--              transaction-local and the edge runs one settle per transaction
--              (supabase/functions/hr-accrue/index.ts execTick: sql.begin per
--              statement), so it covers every hr_apply the settle reaches,
--              including each member of a party fan-out.
--
-- WHY THE GATE CANNOT BE USED TO GAIN ANYTHING (the security surface):
--   · last_seen_at is server-stamped. hr_heartbeat takes no user and no time.
--     It writes now() to the caller's own row only, and it is rate-gated
--     (6/min) with a 20 s floor. A client cannot stamp another player's row.
--   · The gate can only DROP a frame. It never adds one, and it is read after
--     hr_apply has computed, clamped, written and journalled the value.
--     A frame is a copy of a committed fact. The 90 s settle poll heals any
--     dropped frame.
--   · The origin marker can only be set by a tick settle or by the owner.
--     Clients cannot set a GUC through PostgREST RPC. A forged marker would
--     only suppress the forger's own frames.
--   · A bot that heartbeats around the clock gets what an online player gets:
--     frames on its own topic. That costs quota, not value, and the per-user
--     rate gate bounds it.
--   §9 v7 below proves the last point by execution: a character paid online
--   and offline gets the same gold, the same version step and the same
--   number of ledger rows.
--
-- FAILURE DIRECTIONS. Every unknown means "no frame":
--   missing row, NULL last_seen_at, a timestamp from the future, an error in
--   the gate (hr_frame_send's own handler catches it). If a NEW tick entry
--   point forgets the marker, its frames go out ungated, which costs quota but
--   moves no value. Two checks catch that: §9 v1 (catalog, at apply) and
--   tests/frame-origin-marker.mjs (every later file, on every push).
--
-- ── THE QUOTA, RECOMPUTED (30-day month, messages SENT) ────────────────────
-- Inputs: tick 40 frames per character-hour at flush 90 s [D]. HTTP 142.5
-- accepted writes per ONLINE character-hour [M, Reliability: 285 writes/h over
-- 2 chars]. f = fraction of rostered characters online.
--   before = N·28,800 + N·f·102,600     after = N·f·(28,800 + 102,600)
--
--     N     f    before (tick + http)   after (tick + http)   tick part after
--    50   20%      2.47 M                1.31 M                0.29 M
--    50   25%      2.72 M                1.64 M                0.36 M
--   200   20%      9.86 M                5.26 M                1.15 M
--   200   25%     10.89 M                6.57 M                1.44 M
--  1000   20%     49.32 M               26.28 M                5.76 M
--  1000   25%     54.45 M               32.85 M                7.20 M
--
-- This cuts tick frames by 75–80 %. For tick frames alone, the 69-character
-- wall moves to ~347 characters at f = 20 % (~278 at 25 %). With HTTP frames
-- counted as well, the wall moves from ~40 to ~76 characters at f = 20 %.
-- The HTTP rate is one measurement of 2 characters playing actively, so treat
-- it as an upper bound. It does NOT get a 200-character beta under the 2 M
-- Free quota. With the gate in place, HTTP-originated frames are ~78 %
-- of what is left, and nearly all of them are self-frames: the caller already
-- gets the same envelope in its HTTP response. The next lever is to stop
-- self-frames (an edge-side origin marker, 'http_self'; this gate already
-- reads the origin). That leaves 200 @ 20 % at 1.15 M sent, or 2.3 M if
-- delivery also counts. That is a separate change and the brief kept HTTP
-- unchanged, so it is not made here.
--
-- ── (2) W2/W3: A STANDING SLOT-HEALTH DETECTOR ─────────────────────────────
-- Nothing in the repo read pg_replication_slots (REL W2: FAIL, detector).
--   · NEW hr_slot_health_judge(jsonb,jsonb,boolean): PURE. It gets the slots
--         and the publications and returns {ok, alarms[]}. Alarms:
--           no_pgoutput_slot        critical  0 slots with plugin = 'pgoutput'
--           slot_not_reserved       critical  any wal_status other than 'reserved'
--           safe_wal_low            critical  safe_wal_size < 384 MB
--           safe_wal_unknown        warn      safe_wal_size NULL (the 512 MB keep
--                                             size the budget rests on is gone)
--           frames_unpublished      critical  realtime.messages not in
--                                             supabase_realtime_messages_publication
--           frames_double_published critical  realtime.messages, or FOR ALL
--                                             TABLES, in any OTHER publication
--         W3 CORRECTED: the old standing read expected "EXACTLY ONE publication
--         row". That has been wrong since 2026-09-06: supabase_realtime carries
--         public.chat_messages on purpose (2026-09-06-realtime-publication-trim
--         .sql). The property that matters is that FRAME ROWS are in exactly
--         one publication. What else supabase_realtime carries is
--         tests/realtime-cost.mjs's business, an equality with the client's
--         subscriptions, and is not restated here.
--   · NEW hr_slot_health(): SELECT-only and STABLE. Reads pg_replication_slots
--         and pg_publication*, then calls the judge. Executable by the owner and,
--         where it exists, by supabase_read_only_user, so tools/vitals.mjs can
--         call it through the management endpoint without restating the rule.
--   · NEW hr_slot_health_alert(): the cron body. It files one
--         maintenance_alerts row per alarm code per UTC hour, deduped by `ref`,
--         and writes nothing when the slots are healthy (no per-run row).
--   · CRON hr-slot-health, every 5 min.
--
-- ── NOTHING HERE MOVES VALUE ───────────────────────────────────────────────
-- No table, no column, no client grant (hr_client_rpc_baseline unchanged), no
-- edge half, no client half, no ?v= bump. `frame_push` is written only inside
-- the rolled-back self-check, and it is restored explicitly and read back.
--
-- ── AFTER APPLYING (Coordinator; CLAUDE.md §2) ─────────────────────────────
-- tests/live-hash-drift.mjs is red with THREE entries. This was measured
-- on this branch, credential-free, before the apply (exit 1):
--   RED  untracked  hr_party_tick_settle   (the §3b patch makes the sweep track it)
--   RED  replay     hr_frame_send          (§2 restated: the gate line)
--   RED  replay     hr_tick_settle         (§3a: the marker line)
-- All three come from this file and all three are deliberate. Re-seed with
-- `--live --write` and write THREE whys from `--codediff`. The restore-census
-- replay half is already re-pinned on this branch with the new cron job
-- hr-slot-health. Its production half wants that job after the apply. Flip
-- this file's apply-order note to APPLIED.
--
-- ── REVERSIBLE ─────────────────────────────────────────────────────────────
--   `update public.hr_tick_config set frame_push = false;` still stops every
--   frame. To undo only the gate, re-apply §2 of
--   2026-09-23-frame-emit-from-apply.sql (hr_frame_send without the gate).
--   With that body nothing reads the marker, so the two one-line patches have
--   no effect. `select cron.unschedule('hr-slot-health');` removes the
--   detector's schedule. Re-applying THIS file changes nothing: §3 recognises
--   bodies it has already patched.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PREFLIGHT ────────────────────────────────────────────────────────────
-- A lock_timeout and NOT a statement_timeout (the 2026-09-23 F7 ruling). §3
-- re-creates hr_tick_settle and hr_party_tick_settle, and §9 writes the
-- hr_tick_config singleton, which the tick driver updates on every fire. Both
-- locks are held until commit. Three seconds turns a queue into a clean,
-- atomic failure. On 55P03: nothing has landed, so re-run in a quieter minute
-- (not 00:00–00:10 UTC, not 22:00 UTC).
set local lock_timeout = '3s';

do $$
begin
  if to_regprocedure('public.hr_frame_send(uuid,integer,jsonb)') is null
     or to_regprocedure('public.hr_frame_payload(jsonb,text[])') is null
     or to_regprocedure('public.hr_frame_topic(uuid,integer)') is null then
    raise exception 'run 2026-09-23-frame-emit-from-apply.sql first: the emitter this file gates is missing';
  end if;
  -- The two settle bodies this file splices into are the ones the arm-guards
  -- file installs (per-channel arming, the C1 fence). Spelled the way that
  -- file's own precondition is spelled, so a refused chain names its cause.
  if to_regprocedure('public.hr_tick_settle(text,uuid,integer,text,bigint,timestamp with time zone,timestamp with time zone,uuid,jsonb,jsonb)') is null
     or to_regprocedure('public.hr_party_tick_settle(text,uuid,timestamp with time zone,timestamp with time zone,uuid,jsonb)') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'hr_tick_config'
                       and column_name = 'armed_channels') then
    raise exception 'PRECONDITION: 2026-10-06-world-tick-arm-guards.sql is not applied.';
  end if;
  if position('fenced_24h' in pg_get_functiondef(
       'public.hr_tick_settle(text,uuid,integer,text,bigint,timestamp with time zone,timestamp with time zone,uuid,jsonb,jsonb)'::regprocedure)) = 0 then
    raise exception 'PRECONDITION: 2026-10-06-world-tick-arm-guards.sql is not applied.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'player_state'
                    and column_name = 'last_seen_at') then
    raise exception 'run 2026-09-13-town-presence.sql first: player_state.last_seen_at is the online signal';
  end if;
  if to_regprocedure('public.hr_heartbeat(integer)') is null then
    raise exception 'hr_heartbeat is missing: nothing would ever stamp last_seen_at, so no tick frame would ever be sent';
  end if;
  if to_regclass('public.maintenance_alerts') is null then
    raise exception 'run 2026-08-11-telemetry-retention.sql first: maintenance_alerts is where the slot detector files';
  end if;
end $$;

-- ── §1 THE GATE ─────────────────────────────────────────────────────────────
-- STABLE, SECURITY INVOKER. It is called only from hr_frame_send, which is
-- SECURITY DEFINER, so it runs as the owner there. Nobody else can execute it
-- (§5). One GUC read for every non-tick frame. For a tick frame it also does one
-- primary-key read of a row hr_apply already holds locked.
create or replace function public.hr_frame_wanted(p_user uuid, p_slot int)
returns boolean language plpgsql stable set search_path = public as $fn$
declare
  -- THREE HEARTBEATS. The client beats every 25 s while the tab is visible
  -- (src/net/town.js TOWN_POLL_MS) and the server floor is 20 s, so a live
  -- window is never more than ~25 s stale. 75 s allows one lost beat plus
  -- jitter. A hidden tab stops beating and stops getting tick frames within
  -- 75 s. That is the saving, and the 90 s settle poll covers the gap.
  c_ttl  constant interval := interval '75 seconds';
  v_seen timestamptz;
begin
  -- NOT A TICK: unchanged. An HTTP caller is online by definition and gets the
  -- frame exactly as before this file.
  if coalesce(current_setting('hr.frame_origin', true), '') <> 'tick' then
    return true;
  end if;
  select ps.last_seen_at into v_seen
    from public.player_state ps
   where ps.user_id = p_user and ps.slot = p_slot;
  -- FAIL CLOSED, BECAUSE A FRAME IS ONLY A COPY. No row, never seen, stale, or
  -- a stamp from the future all mean "nobody is watching". The only writer of
  -- this column is now(), so a future stamp is garbage, not a person.
  return v_seen is not null
     and v_seen >  now() - c_ttl
     and v_seen <= now() + interval '60 seconds';
end $fn$;

-- ── §2 THE EMITTER, RESTATED WITH THE GATE ─────────────────────────────────
-- Byte-for-byte the 2026-09-23 §2 body plus ONE statement: the gate, after the
-- kill switch and the transport check and before the payload is built. The
-- gate is inside the same exception block, so a failure in it is a dropped
-- frame and never a rolled-back payment.
create or replace function public.hr_frame_send(p_user uuid, p_slot int, p_env jsonb)
returns void language plpgsql volatile security definer set search_path = public as $fn$
declare
  v_cfg public.hr_tick_config%rowtype;
  v_msg jsonb;
begin
  /* ⚠ THE WHOLE BODY IS INSIDE ONE exception BLOCK, AND THAT IS THE POINT.
     hr_apply has already computed, clamped and journalled the value by the time
     this is called; the frame is a COPY of a fact the database already holds.
     Realtime absent, a payload over the broadcast limit, a permission change, a
     partition that is not there — each degrades to "no frame", which WORLD_TICK_DESIGN.md §7.2's
     key-level replace heals on the next frame and which the 90 s poll heals
     regardless. It may never degrade to a rolled-back payment. */
  begin
    -- FAIL CLOSED. A missing row, an unreadable table or a NULL reads as "off".
    select * into v_cfg from public.hr_tick_config where id limit 1;
    if not found or not coalesce(v_cfg.frame_push, false) then return; end if;

    -- NO REALTIME, NO FRAME. Absent in the repo's PGlite replay and possibly on
    -- a restored database; neither is an error here.
    if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then return; end if;

    -- NOBODY WATCHING, NO FRAME (2026-10-07-frame-emit-online-only.sql). A
    -- tick-originated write for a character with no live window is not sent.
    -- Every other origin passes unchanged. Read after the value is committed,
    -- so it can drop a frame and can never change a payment.
    if not public.hr_frame_wanted(p_user, p_slot) then return; end if;

    v_msg := public.hr_frame_payload(p_env, v_cfg.frame_keys);
    if v_msg is null then return; end if;

    perform realtime.send(v_msg, 'frame', public.hr_frame_topic(p_user, p_slot), true);
  exception when others then
    raise warning 'hr_frame_send: frame % for %/% not sent (%) — the write is committed anyway',
      p_env->>'version', p_user, p_slot, sqlerrm;
  end;
end $fn$;

-- ── §3 THE MARKER: ONE ANCHORED LINE IN EACH TICK SETTLE ───────────────────
-- Inserted right after the identity check. That is before any early return, so
-- the marker is set for every settle that gets past the role check. It is
-- anchored on that check's exact text, which must match EXACTLY ONCE, and it
-- raises instead of patching blind. A body that already has the marker is
-- skipped, so a second apply changes nothing. CR is stripped first because
-- production stores bodies applied from a CRLF checkout.
do $$
declare
  c_anchor constant text := $a$    raise exception 'hr_tick_settle: not callable by %', v_role using errcode = '42501';
  end if;
$a$;
  c_add    constant text := $a$
  -- ── (0b) THIS TRANSACTION IS THE WORLD TICK. Transaction-local, read only
  --         by hr_frame_wanted, and it can only SUPPRESS a frame for a
  --         character with no live window (2026-10-07-frame-emit-online-only.sql).
  perform set_config('hr.frame_origin', 'tick', true);
$a$;
  v_def  text;
  v_hits int;
begin
  v_def := replace(pg_get_functiondef(
    'public.hr_tick_settle(text,uuid,integer,text,bigint,timestamp with time zone,timestamp with time zone,uuid,jsonb,jsonb)'::regprocedure),
    chr(13), '');
  if position($m$set_config('hr.frame_origin', 'tick', true)$m$ in v_def) > 0 then
    raise notice 'frame-emit-online-only: hr_tick_settle already carries the tick marker; §3a is a no-op';
    return;
  end if;
  v_hits := (length(v_def) - length(replace(v_def, c_anchor, ''))) / length(c_anchor);
  if v_hits <> 1 then
    raise exception '§3a: the hr_tick_settle anchor matched % time(s), not once. Re-cut it against '
                    'pg_get_functiondef before re-running', v_hits;
  end if;
  execute replace(v_def, c_anchor, c_anchor || c_add);
end $$;

do $$
declare
  c_anchor constant text := $a$    raise exception 'hr_party_tick_settle: not callable by %', v_role using errcode = '42501';
  end if;
$a$;
  c_add    constant text := $a$
  -- ── (0b) THIS TRANSACTION IS THE WORLD TICK. Transaction-local, read only
  --         by hr_frame_wanted, and it can only SUPPRESS a frame for a member
  --         with no live window (2026-10-07-frame-emit-online-only.sql).
  perform set_config('hr.frame_origin', 'tick', true);
$a$;
  v_def  text;
  v_hits int;
begin
  v_def := replace(pg_get_functiondef(
    'public.hr_party_tick_settle(text,uuid,timestamp with time zone,timestamp with time zone,uuid,jsonb)'::regprocedure),
    chr(13), '');
  if position($m$set_config('hr.frame_origin', 'tick', true)$m$ in v_def) > 0 then
    raise notice 'frame-emit-online-only: hr_party_tick_settle already carries the tick marker; §3b is a no-op';
    return;
  end if;
  v_hits := (length(v_def) - length(replace(v_def, c_anchor, ''))) / length(c_anchor);
  if v_hits <> 1 then
    raise exception '§3b: the hr_party_tick_settle anchor matched % time(s), not once. Re-cut it '
                    'against pg_get_functiondef before re-running', v_hits;
  end if;
  execute replace(v_def, c_anchor, c_anchor || c_add);
end $$;

-- ── §4 THE SLOT-HEALTH DETECTOR (W2, W3) ───────────────────────────────────
-- PURE. Gets the facts and returns the verdict, so §9 can run every alarm on
-- fixtures instead of waiting for production to break.
create or replace function public.hr_slot_health_judge(p_slots jsonb, p_pubs jsonb, p_realtime boolean)
returns jsonb language plpgsql immutable set search_path = public, pg_catalog as $fn$
declare
  -- 384 MB: Reliability's W2 line. It is 75 % of max_slot_wal_keep_size =
  -- 512 MB, so this fires with a quarter of the budget left and before
  -- Postgres invalidates the slot.
  c_min_safe constant numeric := 384 * 1048576;
  c_frames   constant text    := 'supabase_realtime_messages_publication';
  v_alarms   jsonb   := '[]'::jsonb;
  v_s        jsonb;
  v_slots    int     := 0;
  v_pgout    int     := 0;
  v_min_safe numeric;
  v_frame_pubs text[];
begin
  for v_s in select e from jsonb_array_elements(coalesce(p_slots, '[]'::jsonb)) e loop
    v_slots := v_slots + 1;
    if v_s->>'plugin' = 'pgoutput' then v_pgout := v_pgout + 1; end if;
    if coalesce(v_s->>'wal_status', '') <> 'reserved' then
      v_alarms := v_alarms || jsonb_build_object('code', 'slot_not_reserved', 'severity', 'critical',
        'slot', v_s->>'slot', 'wal_status', v_s->>'wal_status');
    end if;
    if jsonb_typeof(v_s->'safe_wal_size') is distinct from 'number' then
      v_alarms := v_alarms || jsonb_build_object('code', 'safe_wal_unknown', 'severity', 'warn',
        'slot', v_s->>'slot');
    elsif (v_s->>'safe_wal_size')::numeric < c_min_safe then
      v_alarms := v_alarms || jsonb_build_object('code', 'safe_wal_low', 'severity', 'critical',
        'slot', v_s->>'slot', 'safe_mb', round((v_s->>'safe_wal_size')::numeric / 1048576));
    end if;
    if jsonb_typeof(v_s->'safe_wal_size') = 'number' then
      v_min_safe := least(coalesce(v_min_safe, (v_s->>'safe_wal_size')::numeric),
                          (v_s->>'safe_wal_size')::numeric);
    end if;
  end loop;
  -- ABSENCE IS A SILENT STOP, NOT "NO LAG". Zero pgoutput slots means nothing is
  -- decoding realtime.messages and every frame is written to nobody.
  if v_pgout = 0 then
    v_alarms := v_alarms || jsonb_build_object('code', 'no_pgoutput_slot', 'severity', 'critical',
      'slots', v_slots);
  end if;

  -- W3: FRAME ROWS ARE IN EXACTLY ONE PUBLICATION. A FOR ALL TABLES publication
  -- contains realtime.messages too, so it counts.
  if coalesce(p_realtime, false) then
    select coalesce(array_agg(distinct x.pub order by x.pub), '{}'::text[]) into v_frame_pubs
      from (select e->>'pubname' as pub
              from jsonb_array_elements(coalesce(p_pubs, '[]'::jsonb)) e
             where coalesce((e->>'all_tables')::boolean, false)
                or (e->>'schema' = 'realtime' and e->>'rel' = 'messages')) x;
    if not (c_frames = any (v_frame_pubs)) then
      v_alarms := v_alarms || jsonb_build_object('code', 'frames_unpublished', 'severity', 'critical',
        'expected', c_frames);
    end if;
    if exists (select 1 from unnest(v_frame_pubs) p where p <> c_frames) then
      v_alarms := v_alarms || jsonb_build_object('code', 'frames_double_published', 'severity', 'critical',
        'publications', to_jsonb(v_frame_pubs));
    end if;
  end if;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_alarms) = 0,
    'alarms', v_alarms,
    'slots', v_slots,
    'pgoutput_slots', v_pgout,
    'min_safe_mb', round(v_min_safe / 1048576),
    'realtime', coalesce(p_realtime, false));
end $fn$;

-- SELECT-ONLY. Reads two catalogs that every role can already read.
create or replace function public.hr_slot_health()
returns jsonb language sql stable set search_path = pg_catalog, public as $fn$
  select public.hr_slot_health_judge(
    coalesce((select jsonb_agg(jsonb_build_object(
                'slot', s.slot_name, 'plugin', s.plugin, 'active', s.active,
                'wal_status', s.wal_status, 'safe_wal_size', s.safe_wal_size,
                'retained_bytes', pg_wal_lsn_diff(pg_current_wal_lsn(), s.restart_lsn))
              order by s.slot_name)
                from pg_replication_slots s), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
                'pubname', p.pubname, 'all_tables', p.puballtables,
                'schema', n.nspname, 'rel', c.relname)
              order by p.pubname, n.nspname, c.relname)
                from pg_publication p
                left join pg_publication_rel r on r.prpubid = p.oid
                left join pg_class c on c.oid = r.prrelid
                left join pg_namespace n on n.oid = c.relnamespace), '[]'::jsonb),
    to_regclass('realtime.messages') is not null)
  || jsonb_build_object('at', now())
$fn$;

-- THE CRON BODY. Writes ONLY when something is wrong: one row per alarm code
-- per UTC hour, deduped by maintenance_alerts.ref. A healthy run writes nothing,
-- so 288 runs a day leave no rows (law 6: aggregates, never per-tick).
create or replace function public.hr_slot_health_alert()
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare
  v_h     jsonb := public.hr_slot_health();
  v_a     jsonb;
  v_n     int := 0;
  v_one   int;
begin
  if coalesce((v_h->>'ok')::boolean, false) then
    return v_h || jsonb_build_object('filed', 0);
  end if;
  for v_a in select e from jsonb_array_elements(coalesce(v_h->'alarms', '[]'::jsonb)) e loop
    insert into public.maintenance_alerts (source, ref, severity, message, detail)
    values ('telemetry',
            'slot-health:' || (v_a->>'code') || ':'
              || to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24'),
            case when v_a->>'severity' in ('info', 'warn', 'critical') then v_a->>'severity' else 'critical' end,
            'realtime replication slot health: ' || (v_a->>'code'),
            v_h)
    on conflict (ref) do nothing;
    get diagnostics v_one = row_count;
    v_n := v_n + v_one;
  end loop;
  return v_h || jsonb_build_object('filed', v_n);
end $fn$;

do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron absent — schedule by hand: '
                 'select cron.schedule(''hr-slot-health'', ''*/5 * * * *'', '
                 '''select public.hr_slot_health_alert()'')';
  else
    perform public.hr_cron_ensure('hr-slot-health', '*/5 * * * *',
      'select public.hr_slot_health_alert()');
  end if;
end $$;

-- ── §5 GRANTS — revoke from PUBLIC first (CLAUDE.md §2) ─────────────────────
-- No client role and no engine role can execute any of the four. hr_frame_send
-- reaches hr_frame_wanted as the owner. The cron job runs as the owner. The
-- read-only role gets the two READS only, never the alert writer.
revoke execute on function public.hr_frame_wanted(uuid, int) from public;
revoke execute on function public.hr_frame_wanted(uuid, int) from anon, authenticated, service_role;
revoke execute on function public.hr_frame_send(uuid, int, jsonb) from public;
revoke execute on function public.hr_frame_send(uuid, int, jsonb) from anon, authenticated, service_role;
revoke execute on function public.hr_slot_health_judge(jsonb, jsonb, boolean) from public;
revoke execute on function public.hr_slot_health_judge(jsonb, jsonb, boolean) from anon, authenticated, service_role;
revoke execute on function public.hr_slot_health() from public;
revoke execute on function public.hr_slot_health() from anon, authenticated, service_role;
revoke execute on function public.hr_slot_health_alert() from public;
revoke execute on function public.hr_slot_health_alert() from anon, authenticated, service_role;
do $$
declare v_role text;
begin
  foreach v_role in array array['hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke execute on function public.hr_frame_wanted(uuid, int) from %I', v_role);
      execute format('revoke execute on function public.hr_frame_send(uuid, int, jsonb) from %I', v_role);
      execute format('revoke execute on function public.hr_slot_health_judge(jsonb, jsonb, boolean) from %I', v_role);
      execute format('revoke execute on function public.hr_slot_health() from %I', v_role);
      execute format('revoke execute on function public.hr_slot_health_alert() from %I', v_role);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'supabase_read_only_user') then
    execute 'grant execute on function public.hr_slot_health() to supabase_read_only_user';
    execute 'grant execute on function public.hr_slot_health_judge(jsonb, jsonb, boolean) to supabase_read_only_user';
  end if;
end $$;

-- ── §9 SELF-CHECK — EXECUTED (CLAUDE.md §4) ─────────────────────────────────
-- PROBE ROWS ONLY: every player row this block writes is keyed on v_u, a uuid
-- gen_random_uuid() does not mint. The whole block is rolled back by a
-- sentinel. The four hr_tick_config fields it writes (enabled, channels,
-- armed_channels, frame_push) are captured before the first write, restored
-- explicitly and read back (v10), so a rollback that did not happen still
-- leaves nothing armed. Where the realtime schema is ABSENT (the PGlite replay)
-- a probe transport is installed and explicitly dropped. That means the frame
-- arms EXECUTE in CI and not only on the apply.
--
--   v0  catalog: hr_frame_send consults the gate BEFORE realtime.send; no role
--       a request can arrive as may execute any of the new functions, and
--       hr_assert_grant_hygiene(true) passes STRICT
--   v1  catalog: EVERY public function named *tick* that calls hr_apply sets
--       the marker before its first hr_apply (positive control: both settles)
--   v2  the gate's truth table: any non-tick origin → true; tick → NULL, 10 min,
--       76 s, future → false; 74 s and now → true; no row → false
--   v3  executed: a REFUSED party settle still marks its transaction
--   v4  ★ OFFLINE TICK → NO FRAME (and it paid)
--   v5  STALE heartbeat (10 min) → NO FRAME
--   v6  ★ heartbeat → ONLINE TICK → ONE FRAME
--   v7  ★ A FORGED HEARTBEAT ADDS NO VALUE: the heartbeat moves nothing but
--       last_seen_at, cannot stamp another user's row, and the online settle
--       paid exactly what the offline one did (gold, version step, ledger rows)
--   v8  ★ HTTP → FRAME, even for a character never seen
--   v9  the kill switch still dominates: frame_push false → online tick, no frame
--   s1  the slot judge on fixtures: healthy, each alarm, the 384 MB boundary,
--       and W3 CORRECTED: chat_messages in supabase_realtime is HEALTHY
--   s2  hr_slot_health() runs here and returns the judge's shape
--   s3  the alert writer files one row per code per hour and dedupes a re-run
--   s4  the two reads are STABLE/IMMUTABLE and the judge is not VOLATILE
--   v10 restore + read back
do $$
declare
  v_u      uuid := '00000000-0000-4000-8000-0000000f1007';
  v_o      uuid := '00000000-0000-4000-8000-0000000f2007';
  v_act    text;
  v_t0     timestamptz := date_trunc('second', now()) - interval '20 minutes';
  v_t1     timestamptz := date_trunc('second', now()) - interval '16 minutes';
  v_t2     timestamptz := date_trunc('second', now()) - interval '12 minutes';
  v_t3     timestamptz := date_trunc('second', now()) - interval '8 minutes';
  v_t4     timestamptz := date_trunc('second', now()) - interval '4 minutes';
  v_r      jsonb;
  v_h      jsonb;
  v_txt    text;
  v_n      int;
  v_v      bigint;
  v_g      bigint;
  v_l      int;
  v_dv_off bigint;
  v_dg_off bigint;
  v_dl_off int;
  v_row    jsonb;
  v_row2   jsonb;
  v_topic  text;
  v_rt     text := 'absent';   -- 'probe' | 'live' | 'absent'
  v_frames int;
  v_cfg_en boolean;
  v_cfg_ch text[];
  v_cfg_ar text[];
  v_cfg_fp boolean;
  v_chk_en boolean;
  v_chk_ch text[];
  v_chk_ar text[];
  v_chk_fp boolean;
  c_mark   constant text := $m$set_config('hr.frame_origin', 'tick', true)$m$;
begin
  begin
    -- ── v0: THE GATE IS ON THE PATH, AND IN FRONT OF THE SEND ──────────────
    v_txt := replace(pg_get_functiondef('public.hr_frame_send(uuid,integer,jsonb)'::regprocedure), chr(13), '');
    if position('public.hr_frame_wanted(p_user, p_slot)' in v_txt) = 0 then
      raise exception 'v0: hr_frame_send does not consult hr_frame_wanted, so every tick frame goes out';
    end if;
    if position('public.hr_frame_wanted(p_user, p_slot)' in v_txt) > position('perform realtime.send(' in v_txt) then
      raise exception 'v0b: hr_frame_send consults the gate AFTER it sends';
    end if;
    foreach v_txt in array array['public', 'anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
      continue when v_txt <> 'public' and not exists (select 1 from pg_roles where rolname = v_txt);
      if has_function_privilege(v_txt, 'public.hr_frame_wanted(uuid,integer)', 'EXECUTE')
         or has_function_privilege(v_txt, 'public.hr_frame_send(uuid,integer,jsonb)', 'EXECUTE')
         or has_function_privilege(v_txt, 'public.hr_slot_health_judge(jsonb,jsonb,boolean)', 'EXECUTE')
         or has_function_privilege(v_txt, 'public.hr_slot_health()', 'EXECUTE')
         or has_function_privilege(v_txt, 'public.hr_slot_health_alert()', 'EXECUTE') then
        raise exception 'v0c: % can EXECUTE one of the frame-gate / slot-health functions', v_txt;
      end if;
    end loop;
    -- …and the detector agrees, STRICT: no client-executable function outside
    -- hr_client_rpc_baseline, no PUBLIC execute, no engine grant outside its
    -- allowlist. This file adds no client RPC, so the baseline is unchanged.
    perform public.hr_assert_grant_hygiene(true);

    -- ── v1: EVERY TICK WRITER MARKS ITS TRANSACTION ───────────────────────
    select string_agg(p.oid::regprocedure::text, ', ') into v_txt
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like '%tick%'
       and position('public.hr_apply(' in p.prosrc) > 0
       and (position(c_mark in p.prosrc) = 0
            or position(c_mark in p.prosrc) > position('public.hr_apply(' in p.prosrc));
    if v_txt is not null then
      raise exception 'v1: these tick writers reach hr_apply without first marking the transaction, '
                      'so their frames go out to offline characters: %', v_txt;
    end if;
    select count(*) into v_n
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('hr_tick_settle', 'hr_party_tick_settle')
       and position(c_mark in p.prosrc) > 0;
    if v_n <> 2 then
      raise exception 'v1b: % of the two tick settles carry the marker. Without both, v1 above '
                      'proved nothing', v_n;
    end if;

    -- ── the probe character. Not partied. Gathering, with a settled watermark
    --    inside the 24 h fence, so an ARMED gather settle reaches hr_apply.
    select activity_id into v_act from public.hr_activities where kind = 'gather' order by activity_id limit 1;
    if v_act is null then
      raise exception 'v-fixture: hr_activities has no gather row, so no armed settle can be driven';
    end if;
    insert into auth.users (id) values (v_u), (v_o) on conflict do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                     accrued_to, active_kind, active_id, active_since)
    values (v_u, 0, 1000, 0, 10, 10, 1, v_t0, 'gather', v_act, v_t0 - interval '1 hour');
    insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
    values (v_u, 0, 'gather', true, 'hr1007-selfcheck', now() + interval '5 minutes');
    v_topic := public.hr_frame_topic(v_u, 0);

    -- ── v2: THE GATE'S TRUTH TABLE ────────────────────────────────────────
    perform set_config('hr.frame_origin', '', true);
    if not public.hr_frame_wanted(v_u, 0) then
      raise exception 'v2a: a NON-tick frame for a never-seen character was suppressed. HTTP frames must be unchanged';
    end if;
    if not public.hr_frame_wanted(v_o, 0) then
      raise exception 'v2b: a NON-tick frame for a character with no row was suppressed';
    end if;
    perform set_config('hr.frame_origin', 'tick', true);
    if public.hr_frame_wanted(v_u, 0) then
      raise exception 'v2c: a tick frame for a character that has NEVER heartbeat was wanted';
    end if;
    if public.hr_frame_wanted(v_o, 0) then
      raise exception 'v2d: a tick frame for a character with no row was wanted';
    end if;
    update public.player_state set last_seen_at = now() - interval '10 minutes' where user_id = v_u and slot = 0;
    if public.hr_frame_wanted(v_u, 0) then raise exception 'v2e: a 10-minute-old heartbeat counted as online'; end if;
    update public.player_state set last_seen_at = now() - interval '76 seconds' where user_id = v_u and slot = 0;
    if public.hr_frame_wanted(v_u, 0) then raise exception 'v2f: a 76 s old heartbeat counted as online (TTL is 75 s)'; end if;
    update public.player_state set last_seen_at = now() - interval '74 seconds' where user_id = v_u and slot = 0;
    if not public.hr_frame_wanted(v_u, 0) then raise exception 'v2g: a 74 s old heartbeat counted as OFFLINE (TTL is 75 s)'; end if;
    update public.player_state set last_seen_at = now() where user_id = v_u and slot = 0;
    if not public.hr_frame_wanted(v_u, 0) then raise exception 'v2h: a heartbeat stamped now() counted as offline'; end if;
    update public.player_state set last_seen_at = now() + interval '10 minutes' where user_id = v_u and slot = 0;
    if public.hr_frame_wanted(v_u, 0) then raise exception 'v2i: a heartbeat from the FUTURE counted as online'; end if;
    update public.player_state set last_seen_at = null where user_id = v_u and slot = 0;

    -- ── v3: A REFUSED PARTY SETTLE STILL MARKS ITS TRANSACTION. Executed:
    --        bad arguments return before any lock, but after the marker.
    perform set_config('hr.frame_origin', '', true);
    set local role hr_engine;
    v_r := public.hr_party_tick_settle('hr1007-selfcheck', null, v_t0, v_t1, null, '[]'::jsonb);
    reset role;
    if coalesce((v_r->>'ok')::boolean, true) then
      raise exception 'v3a: the probe party settle was not refused (%)', v_r;
    end if;
    if coalesce(current_setting('hr.frame_origin', true), '') <> 'tick' then
      raise exception 'v3: hr_party_tick_settle did not mark its transaction, so a party fan-out '
                      'pushes a frame to every offline member';
    end if;
    perform set_config('hr.frame_origin', '', true);

    -- ── THE CONFIG: captured BEFORE the first write, restored at v10.
    select enabled, channels, armed_channels, frame_push
      into v_cfg_en, v_cfg_ch, v_cfg_ar, v_cfg_fp
      from public.hr_tick_config where id;
    if not found then
      raise exception 'v-fixture: hr_tick_config has no row, so no tick settle can be driven';
    end if;
    update public.hr_tick_config
       set enabled = true,
           channels = (select array_agg(distinct c order by c)
                         from unnest(channels || array['gather']) c),
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
        perform realtime.send(jsonb_build_object('t', 'hr1007-control'), 'hr1007-control',
                              'hr1007-control:' || v_u::text, true);
        select count(*) into v_n from realtime.messages where topic = 'hr1007-control:' || v_u::text;
      exception when others then
        v_n := -1;
      end;
      if v_n > 1 then
        raise exception 'v-transport: the control send counted back % rows: this transport '
                        'duplicates, and every frame count below would be wrong', v_n;
      end if;
      if v_n = 1 then v_rt := 'live'; end if;
    end if;
    if v_rt = 'absent' then
      raise notice 'v4-v9 FRAME COUNTS SKIPPED: realtime.messages does not round-trip from this '
                   'session. The payments and v7 still run';
    elsif exists (select 1 from realtime.messages where topic = v_topic) then
      raise exception 'v-transport: the probe topic already carries rows before the first settle';
    end if;

    -- ── v4: ★ OFFLINE TICK → NO FRAME ★ (and the settle PAID) ─────────────
    select version, gold into v_v, v_g from public.player_state where user_id = v_u and slot = 0;
    select count(*) into v_l from public.player_ledger where user_id = v_u;
    set local role hr_engine;
    v_r := public.hr_tick_settle('hr1007-selfcheck', v_u, 0, 'gather', v_v, v_t0, v_t1,
             '00000000-0000-4000-8000-0000000f1a07',
             jsonb_build_object('gold', 13, 'accrued_to', to_jsonb(v_t1),
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'tick', 'qty', 1, 'ticks', 1))));
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) is not true or v_r->>'mode' is distinct from 'armed' then
      raise exception 'v4a: the OFFLINE armed settle did not pay (%). A refusal emits nothing, so '
                      'the zero below would be a property nothing measured', v_r;
    end if;
    select version - v_v, gold - v_g into v_dv_off, v_dg_off
      from public.player_state where user_id = v_u and slot = 0;
    select count(*) - v_l into v_dl_off from public.player_ledger where user_id = v_u;
    if v_dv_off <> 1 or v_dg_off <> 13 or v_dl_off < 1 then
      raise exception 'v4b: the offline settle moved version +%, gold +%, ledger +% (expected +1, +13, >=1)',
                      v_dv_off, v_dg_off, v_dl_off;
    end if;
    -- (v7 compares against the SECOND offline settle, v5, not this one: a
    --  character's first payment can journal a one-off row of its own, e.g.
    --  a ledger-of-firsts fact, and that is not what v7 is about.)
    if v_rt <> 'absent' then
      select count(*) into v_frames from realtime.messages where topic = v_topic;
      if v_frames <> 0 then
        raise exception 'v4: an OFFLINE character''s tick settle sent % frame(s). This is the 28,800 '
                        'frames per character-month the Free quota cannot carry', v_frames;
      end if;
    end if;

    -- ── v5: A STALE HEARTBEAT (10 min) → NO FRAME ─────────────────────────
    update public.player_state set last_seen_at = now() - interval '10 minutes' where user_id = v_u and slot = 0;
    select version, gold into v_v, v_g from public.player_state where user_id = v_u and slot = 0;
    select count(*) into v_l from public.player_ledger where user_id = v_u;
    set local role hr_engine;
    v_r := public.hr_tick_settle('hr1007-selfcheck', v_u, 0, 'gather', v_v, v_t1, v_t2,
             '00000000-0000-4000-8000-0000000f1b07',
             jsonb_build_object('gold', 13, 'accrued_to', to_jsonb(v_t2),
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'tick', 'qty', 1, 'ticks', 1))));
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) is not true then
      raise exception 'v5a: the stale-heartbeat settle did not pay (%)', v_r;
    end if;
    select version - v_v, gold - v_g into v_dv_off, v_dg_off
      from public.player_state where user_id = v_u and slot = 0;
    select count(*) - v_l into v_dl_off from public.player_ledger where user_id = v_u;
    if v_rt <> 'absent' then
      select count(*) into v_frames from realtime.messages where topic = v_topic;
      if v_frames <> 0 then
        raise exception 'v5: a character last seen 10 minutes ago was sent % tick frame(s)', v_frames;
      end if;
    end if;

    -- ── v7 (first half): A HEARTBEAT MOVES NOTHING BUT last_seen_at, AND ONLY
    --    ON THE CALLER'S OWN ROW. Driven through hr_heartbeat exactly as the
    --    client calls it.
    select to_jsonb(ps) - 'last_seen_at' into v_row from public.player_state ps where user_id = v_u and slot = 0;
    select count(*) into v_l from public.player_ledger where user_id = v_u;
    perform set_config('request.jwt.claim.sub', v_o::text, true);
    v_r := public.hr_heartbeat(0);
    if coalesce(v_r->>'error', '') <> 'no_character' then
      raise exception 'v7a: a heartbeat from a user with no character was not refused no_character (%)', v_r;
    end if;
    if (select last_seen_at from public.player_state where user_id = v_u and slot = 0)
       is distinct from now() - interval '10 minutes' then
      raise exception 'v7b: user B''s heartbeat moved user A''s last_seen_at, so anyone could make '
                      'anyone look online';
    end if;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    v_r := public.hr_heartbeat(0);
    perform set_config('request.jwt.claim.sub', '', true);
    if coalesce(v_r->>'stamped', '') <> 'true' then
      raise exception 'v7c: the probe heartbeat did not stamp (%)', v_r;
    end if;
    select to_jsonb(ps) - 'last_seen_at' into v_row2 from public.player_state ps where user_id = v_u and slot = 0;
    if v_row2 is distinct from v_row then
      raise exception 'v7d: a heartbeat changed player_state beyond last_seen_at: % -> %', v_row, v_row2;
    end if;
    select count(*) - v_l into v_n from public.player_ledger where user_id = v_u;
    if v_n <> 0 then
      raise exception 'v7e: a heartbeat journalled % ledger row(s)', v_n;
    end if;
    if (select last_seen_at from public.player_state where user_id = v_u and slot = 0) is distinct from now() then
      raise exception 'v7f: the heartbeat stamp is not the server clock';
    end if;

    -- ── v6: ★ ONLINE TICK → EXACTLY ONE FRAME ★ ────────────────────────────
    select version, gold into v_v, v_g from public.player_state where user_id = v_u and slot = 0;
    select count(*) into v_l from public.player_ledger where user_id = v_u;
    set local role hr_engine;
    v_r := public.hr_tick_settle('hr1007-selfcheck', v_u, 0, 'gather', v_v, v_t2, v_t3,
             '00000000-0000-4000-8000-0000000f1c07',
             jsonb_build_object('gold', 13, 'accrued_to', to_jsonb(v_t3),
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'tick', 'qty', 1, 'ticks', 1))));
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) is not true or v_r->>'mode' is distinct from 'armed' then
      raise exception 'v6a: the ONLINE armed settle did not pay (%)', v_r;
    end if;
    if v_rt <> 'absent' then
      select count(*) into v_frames from realtime.messages where topic = v_topic;
      if v_frames <> 1 then
        raise exception 'v6: an ONLINE character''s tick settle sent % frame(s), expected exactly 1. '
                        'The push channel would be dark for the players it exists for', v_frames;
      end if;
      if (select (payload->>'frame')::bigint from realtime.messages where topic = v_topic)
         is distinct from (v_r->>'version')::bigint then
        raise exception 'v6b: the online frame does not carry the version hr_apply wrote';
      end if;
    end if;

    -- ── v7 (second half): ★ ONLINE PAYS EXACTLY WHAT OFFLINE PAID ★ ───────
    select version - v_v, gold - v_g into v_v, v_g from public.player_state where user_id = v_u and slot = 0;
    select count(*) - v_l into v_n from public.player_ledger where user_id = v_u;
    if v_v <> v_dv_off or v_g <> v_dg_off or v_n <> v_dl_off then
      raise exception 'v7: the same delta paid differently ONLINE (version +%, gold +%, ledger +%) than '
                      'OFFLINE (+%, +%, +%). A heartbeat must never be worth anything',
                      v_v, v_g, v_n, v_dv_off, v_dg_off, v_dl_off;
    end if;

    -- ── v8: ★ HTTP → FRAME, EVEN FOR A CHARACTER NEVER SEEN ★ ──────────────
    perform set_config('hr.frame_origin', '', true);
    update public.player_state set last_seen_at = null where user_id = v_u and slot = 0;
    select version into v_v from public.player_state where user_id = v_u and slot = 0;
    set local role hr_engine;
    v_r := public.hr_apply(v_u, 0, v_v, '00000000-0000-4000-8000-0000000f1d07',
             jsonb_build_object('gold', 13,
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'selfcheck-http', 'qty', 1))));
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) is not true then
      raise exception 'v8a: the probe HTTP apply was refused (%)', v_r;
    end if;
    if v_rt <> 'absent' then
      select count(*) into v_frames from realtime.messages where topic = v_topic;
      if v_frames <> 2 then
        raise exception 'v8: an HTTP-originated write left the topic at % frame(s), expected 2. HTTP '
                        'envelopes must go out exactly as before this file', v_frames;
      end if;
    end if;

    -- ── v9: THE KILL SWITCH STILL DOMINATES ───────────────────────────────
    update public.hr_tick_config set frame_push = false where id;
    update public.player_state set last_seen_at = now() where user_id = v_u and slot = 0;
    select version into v_v from public.player_state where user_id = v_u and slot = 0;
    set local role hr_engine;
    v_r := public.hr_tick_settle('hr1007-selfcheck', v_u, 0, 'gather', v_v, v_t3, v_t4,
             '00000000-0000-4000-8000-0000000f1e07',
             jsonb_build_object('gold', 13, 'accrued_to', to_jsonb(v_t4),
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'tick', 'qty', 1, 'ticks', 1))));
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) is not true then
      raise exception 'v9a: the kill-switch settle did not pay (%)', v_r;
    end if;
    if v_rt <> 'absent' then
      select count(*) into v_frames from realtime.messages where topic = v_topic;
      if v_frames <> 2 then
        raise exception 'v9: frame_push = false and an online tick still sent a frame (topic at %)', v_frames;
      end if;
    end if;
    perform set_config('hr.frame_origin', '', true);

    -- ── s1: THE SLOT JUDGE, EVERY ALARM, ON FIXTURES ──────────────────────
    v_row := '[{"slot":"rt","plugin":"pgoutput","wal_status":"reserved","safe_wal_size":535822336},
               {"slot":"x","plugin":"wal2json","wal_status":"reserved","safe_wal_size":535822336}]';
    -- W3 CORRECTED: frames in their own publication AND chat_messages in
    -- supabase_realtime is the healthy production shape, not an alarm.
    v_row2 := '[{"pubname":"supabase_realtime","all_tables":false,"schema":"public","rel":"chat_messages"},
                {"pubname":"supabase_realtime_messages_publication","all_tables":false,"schema":"realtime","rel":"messages"}]';
    v_h := public.hr_slot_health_judge(v_row, v_row2, true);
    if coalesce((v_h->>'ok')::boolean, false) is not true then
      raise exception 's1a: the HEALTHY production shape (2 reserved slots, 511 MB safe, chat_messages '
                      'in supabase_realtime) raised %', v_h->'alarms';
    end if;
    v_h := public.hr_slot_health_judge(
      '[{"slot":"x","plugin":"wal2json","wal_status":"reserved","safe_wal_size":535822336}]', v_row2, true);
    if not (v_h->'alarms') @> '[{"code":"no_pgoutput_slot"}]' then
      raise exception 's1b: zero pgoutput slots was not flagged: %', v_h;
    end if;
    v_h := public.hr_slot_health_judge('[]', v_row2, true);
    if not (v_h->'alarms') @> '[{"code":"no_pgoutput_slot"}]' then
      raise exception 's1c: NO slots at all was not flagged: %', v_h;
    end if;
    v_h := public.hr_slot_health_judge(
      '[{"slot":"rt","plugin":"pgoutput","wal_status":"extended","safe_wal_size":535822336}]', v_row2, true);
    if not (v_h->'alarms') @> '[{"code":"slot_not_reserved"}]' then
      raise exception 's1d: a slot in wal_status extended was not flagged: %', v_h;
    end if;
    v_h := public.hr_slot_health_judge(
      '[{"slot":"rt","plugin":"pgoutput","wal_status":"reserved","safe_wal_size":402653183}]', v_row2, true);
    if not (v_h->'alarms') @> '[{"code":"safe_wal_low"}]' then
      raise exception 's1e: safe_wal_size one byte under 384 MB was not flagged: %', v_h;
    end if;
    v_h := public.hr_slot_health_judge(
      '[{"slot":"rt","plugin":"pgoutput","wal_status":"reserved","safe_wal_size":402653184}]', v_row2, true);
    if coalesce((v_h->>'ok')::boolean, false) is not true then
      raise exception 's1f: safe_wal_size of exactly 384 MB was flagged (the line is < 384 MB): %', v_h;
    end if;
    v_h := public.hr_slot_health_judge(
      '[{"slot":"rt","plugin":"pgoutput","wal_status":"reserved","safe_wal_size":null}]', v_row2, true);
    if not (v_h->'alarms') @> '[{"code":"safe_wal_unknown"}]' then
      raise exception 's1g: an unknown safe_wal_size was not flagged: %', v_h;
    end if;
    v_h := public.hr_slot_health_judge(v_row,
      '[{"pubname":"supabase_realtime","all_tables":false,"schema":"public","rel":"chat_messages"}]', true);
    if not (v_h->'alarms') @> '[{"code":"frames_unpublished"}]' then
      raise exception 's1h: frame rows in NO publication were not flagged: %', v_h;
    end if;
    v_h := public.hr_slot_health_judge(v_row,
      '[{"pubname":"supabase_realtime","all_tables":false,"schema":"realtime","rel":"messages"},
        {"pubname":"supabase_realtime_messages_publication","all_tables":false,"schema":"realtime","rel":"messages"}]', true);
    if not (v_h->'alarms') @> '[{"code":"frames_double_published"}]' then
      raise exception 's1i: frame rows in TWO publications were not flagged: %', v_h;
    end if;
    v_h := public.hr_slot_health_judge(v_row,
      '[{"pubname":"everything","all_tables":true,"schema":null,"rel":null},
        {"pubname":"supabase_realtime_messages_publication","all_tables":false,"schema":"realtime","rel":"messages"}]', true);
    if not (v_h->'alarms') @> '[{"code":"frames_double_published"}]' then
      raise exception 's1j: a FOR ALL TABLES publication was not flagged as a second frame publication: %', v_h;
    end if;
    v_h := public.hr_slot_health_judge(v_row, '[]', false);
    if coalesce((v_h->>'ok')::boolean, false) is not true then
      raise exception 's1k: with no realtime schema the publication arm judged anyway: %', v_h;
    end if;

    -- ── s2: THE READ RUNS HERE AND HAS THE JUDGE'S SHAPE ──────────────────
    v_h := public.hr_slot_health();
    if not (v_h ? 'ok' and v_h ? 'alarms' and v_h ? 'pgoutput_slots' and v_h ? 'at') then
      raise exception 's2: hr_slot_health() returned %', v_h;
    end if;

    -- ── s3: THE ALERT WRITER FILES ONCE PER CODE PER HOUR ─────────────────
    v_r := public.hr_slot_health_alert();
    if coalesce((v_r->>'ok')::boolean, false) then
      if (v_r->>'filed')::int <> 0 then
        raise exception 's3a: a HEALTHY read filed % alert row(s)', v_r->>'filed';
      end if;
    else
      -- Every alarm code has this hour's row, whether this call filed it or
      -- an earlier run in the same hour did.
      select string_agg(a->>'code', ', ') into v_txt
        from jsonb_array_elements(v_r->'alarms') a
       where not exists (select 1 from public.maintenance_alerts m
                          where m.ref = 'slot-health:' || (a->>'code') || ':'
                                        || to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24'));
      if v_txt is not null then
        raise exception 's3b: an UNHEALTHY read left no alert row for: %', v_txt;
      end if;
      v_r := public.hr_slot_health_alert();
      if (v_r->>'filed')::int <> 0 then
        raise exception 's3c: a second run in the same hour filed % more row(s); the ref does not dedupe',
                        v_r->>'filed';
      end if;
    end if;

    -- ── s4: THE DETECTOR IS SELECT-ONLY ───────────────────────────────────
    if (select provolatile from pg_proc where oid = 'public.hr_slot_health()'::regprocedure) <> 's'
       or (select provolatile from pg_proc
            where oid = 'public.hr_slot_health_judge(jsonb,jsonb,boolean)'::regprocedure) <> 'i' then
      raise exception 's4: hr_slot_health must be STABLE and its judge IMMUTABLE';
    end if;
    -- POSIX classes only: a backslash class in a literal is read differently
    -- by PGlite and production (tests/live-hash-drift.mjs §NORMALISATION).
    if lower((select prosrc from pg_proc where oid = 'public.hr_slot_health()'::regprocedure))
       ~ '(insert|update|delete|truncate)[[:space:]]' then
      raise exception 's4b: hr_slot_health() writes';
    end if;

    -- ── v10: RESTORE, EXPLICITLY, AND READ BACK ───────────────────────────
    update public.hr_tick_config set armed_channels = '{}'::text[] where id;
    update public.hr_tick_config
       set channels = v_cfg_ch, enabled = v_cfg_en, frame_push = v_cfg_fp where id;
    update public.hr_tick_config set armed_channels = v_cfg_ar where id;
    select enabled, channels, armed_channels, frame_push
      into v_chk_en, v_chk_ch, v_chk_ar, v_chk_fp
      from public.hr_tick_config where id;
    if v_chk_en is distinct from v_cfg_en or v_chk_ch is distinct from v_cfg_ch
       or v_chk_ar is distinct from v_cfg_ar or v_chk_fp is distinct from v_cfg_fp then
      raise exception 'v10: hr_tick_config was NOT restored (enabled % -> %, channels % -> %, armed % -> %, '
                      'frame_push % -> %)', v_cfg_en, v_chk_en, v_cfg_ch, v_chk_ch, v_cfg_ar, v_chk_ar,
                      v_cfg_fp, v_chk_fp;
    end if;
    if v_rt = 'probe' then
      drop schema realtime cascade;
      if to_regnamespace('realtime') is not null then
        raise exception 'v10b: the probe realtime schema survived its own drop';
      end if;
    end if;

    raise exception 'HR1007_ROLLBACK_OK';
  exception
    when others then
      if sqlerrm <> 'HR1007_ROLLBACK_OK' then raise; end if;
  end;
  raise notice 'frame-emit-online-only self-check PASSED (v0-v10, s1-s4); probe rows rolled back';
end $$;
