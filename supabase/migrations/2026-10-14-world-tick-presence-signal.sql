-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-14-world-tick-presence-signal.sql — "REAL RETURN" MEANS ACTIVE
--   PRESENCE: THE AUTHENTICATED HEARTBEAT MOVES THE PRESENCE ANCHOR.
--
-- STATUS: STAGED, NOT APPLIED — REVIEW ONLY. Lane C: Security GO, then the
-- Coordinator applies (tools/apply-migration.mjs, one file, never inside
-- begin/commit, never 00:00–00:10 UTC). DB-ONLY: no edge half, no client half
-- (the client already beats every 25 s while the tab is visible —
-- src/net/town.js TOWN_POLL_MS / heartbeat(), started at boot).
-- CHAIN POSITION: after 2026-10-10-world-tick-presence-horizon.sql (whose
-- hr_return_anchor this file feeds) and after every set/b566 file. Independent
-- of 2026-10-14-world-tick-m4-party-horizon.sql in both directions: neither
-- restates a body the other reads (this file restates NOTHING; it adds one
-- trigger function and one trigger).
--
-- WHY (Game Designer precondition B3, needed before parties widen and for M4):
--   The presence horizon stamps R (hr_return_anchor.real_return_at) only when a
--   NON-tick settle moves player_state.accrued_to. A PARTIED online player's
--   own accrue is refused `party_settle_required`, so nothing ever stamps R for
--   them, and M4's party fence drops them from their hunt once per cap while
--   they are actively playing. Any online solo character whose settles are all
--   the tick's (accrue answers below_min_span, moves nothing) is parked the same
--   way. "Last real return" must mean "last seen present".
--
-- THE RULE, IN ONE SENTENCE: a stamped heartbeat (hr_heartbeat, auth.uid()'s
-- own row, server clock, 20 s floor, 6/min bucket) raises R to now() — but only
-- when doing so cannot pay any time past the CURRENT horizon:
--
--     stamp  iff  anchor exists  and  now() > R
--                 and  now() <= greatest(accrued_to, R + cap)
--
--   cap = hr_offline_cap_ms(user, slot), the ONE cap source the tick's (8d),
--   hr_accrue_cap_ms and M4's (3c)/(8d)/(10) all read. Every reader of R is
--   unchanged: they read hr_return_anchor and nothing else, so R stays the one
--   source of truth and the horizon is still R + cap.
--
-- WHY THAT CONDITION IS EXACTLY "NO BACK PAY". Every payer pays contiguously
-- from accrued_to. After a stamp the unpaid span [accrued_to, now()] becomes
-- payable under the new horizon now() + cap. The part of that span lying past
-- the OLD horizon is now() - greatest(accrued_to, R + cap) when positive — so
-- the stamp is allowed exactly when that is zero. Inside the horizon a stamp
-- only says "the absence ended here" (what an accrue at now() would say,
-- without paying anything itself); outside it, the character's budget for the
-- absence is already spent and the gap belongs to nobody.
--   · ONLINE, beating every 25 s: R tracks now(), so R + cap is always ~cap
--     ahead — a partied or tick-settled player is never dropped/parked.
--   · OFFLINE: no beats, R stays at the last presence, the tick parks it (solo)
--     or M4 drops it (party) at R + cap. Unchanged.
--   · RETURNING AFTER THE HORIZON: the beat does NOT move R (the gap past the
--     old horizon would otherwise be paid). The return is settled exactly as
--     today: the client's accrue reads hr_accrue_cap_ms, which forfeits the spent
--     absence (accrued_to -> now(), journalled horizon_forfeit), the existing
--     stamp trigger moves R to now(), the horizon_log row for the OLD anchor no
--     longer names the current anchor, so the character is unparked (the due
--     roster's parked test is "row for the CURRENT anchor"). From then on every
--     beat carries R. No back pay past the cap, by construction.
--     A partied member past the horizon is dropped by M4 (unpartied), and the
--     same accrue path returns them.
--   · NO ANCHOR: the beat creates none (a heartbeat is never an anchor factory;
--     the first real settle stamps it, as today). Fails closed.
--   · RAISE-ONLY: R is never lowered (an anchor up to 60 s ahead, from a settle
--     window's skew, is left alone).
--
-- ── SECURITY ARGUMENT ───────────────────────────────────────────────────────
--   · IDENTITY: the trigger fires on the row hr_heartbeat__ungated updates,
--     which is `where user_id = auth.uid() and slot = p_slot` — the JWT's own
--     row. hr_heartbeat takes no user and no time (asserted in §4 k1). The
--     trigger writes only (NEW.user_id, NEW.slot). A beat for another uid moves
--     nothing (§4 s5).
--   · CLOCK: the stamp is now(), never NEW.last_seen_at. Even a future writer of
--     last_seen_at that trusted a client time could not move R past the server
--     clock (§4 s5b, a forged last_seen_at a day ahead stamps now()).
--   · THE ONLY WRITER: authenticated holds no UPDATE on player_state, and the
--     only function body that SETs last_seen_at is hr_heartbeat__ungated
--     (§4 k1, by catalogue). The trigger function is executable by no role.
--   · RATE: hr_heartbeat's hr_rpc_gate bucket (hr_rate_ok, 6/min per uid) and
--     its 20 s floor (a throttled beat writes nothing, so it stamps nothing):
--     at most one anchor write per 20 s per character.
--   · THE ACCEPTED RESIDUAL, STATED EXACTLY: a script holding the player's own
--     session that keeps calling hr_heartbeat keeps that character "present".
--     That is precisely the online-idle case — a player who leaves the tab
--     visible and walks away is paid the same. It cannot pay more than an
--     online player is paid, cannot reach another player's anchor, cannot move
--     R past the server clock, and cannot revive an absence past its horizon.
--   · TICK: a world-tick transaction (hr.frame_origin = 'tick') never stamps,
--     the same marker the accrued_to stamp honours. The tick never writes
--     last_seen_at; the guard is defence in depth and the paying-less direction.
--   · No new grant, no new client surface, no new table, no restated body.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
--   The trigger runs inside the heartbeat's UPDATE of player_state, i.e. under
--   that row's lock — the same lock every other anchor writer (the accrued_to
--   stamp) holds and every horizon reader ((8d), M4 (3c)/(8d)/(10)) takes
--   before reading the anchor. So the horizon cannot move under a judgement,
--   and NEW.accrued_to is the committed mark. The heartbeat still bumps no
--   version (town-presence §11(h)); the anchor is not part of the envelope.
--
-- ── COST (100x players) ─────────────────────────────────────────────────────
--   Per STAMPED beat (<= 1 per 20 s per online character): one pk read of
--   hr_return_anchor, at most one hr_offline_cap_ms (one clan join; skipped when
--   accrued_to >= now()), one pk UPDATE. Throttled beats do not write
--   last_seen_at, so the WHEN clause skips them entirely. Nothing per tick.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
--   One SECURITY DEFINER trigger function, executable by no role. It can only
--   raise the caller's own anchor to the server clock, inside the horizon. The
--   direction it moves is "the tick may keep paying an online player", which
--   is the designed rule; it can never create budget for time past a spent
--   horizon (§4 s3).
--
-- KNOWN LIMITATIONS
--   · A hidden tab does not beat (town.js: "a background tab is not a person"),
--     so a player who backgrounds the game for longer than their cap is
--     treated as absent. By design.
--   · Player intents other than accrue do not stamp. The beat is the presence
--     signal; an intent from a visible tab is always accompanied by beats.
--   · The partied RETURN-after-horizon path is M4's drop + the accrue forfeit;
--     it is exercised by M4's guard, not here (M4 is not in this chain).
--
-- REVERSIBILITY: drop trigger hr_return_anchor_seen on public.player_state;
-- drop function public.hr_return_anchor_presence(). R then moves only on
-- non-tick settles again (the 2026-10-10 behaviour). Re-applying this file is
-- a no-op (create or replace + drop-if-exists/create of the same trigger).
--
-- ⚠ AFTER APPLYING: live-hash-drift wants hr_return_anchor_presence (new;
--   why: "presence signal: heartbeat raises the return anchor inside the
--   horizon"). restore-census: no new table.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS — FAIL CLOSED ──────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_return_anchor') is null
     or to_regprocedure('public.hr_return_anchor_stamp()') is null
     or to_regprocedure('public.hr_offline_cap_ms(uuid,integer)') is null
     or to_regprocedure('public.hr_heartbeat(integer)') is null
     or to_regprocedure('public.hr_heartbeat__ungated(integer)') is null then
    raise exception 'PRECONDITION: hr_return_anchor / hr_return_anchor_stamp / hr_offline_cap_ms / hr_heartbeat(__ungated) absent — apply 2026-10-10-world-tick-presence-horizon.sql and the town-presence chain first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'player_state'
                    and column_name = 'last_seen_at') then
    raise exception 'PRECONDITION: player_state.last_seen_at is absent';
  end if;
  -- The identity argument rests on the heartbeat writing ONLY the JWT's own row
  -- with the server clock. Assert the exact write, not a marker.
  if (select count(*) from pg_proc p
       where p.oid = 'public.hr_heartbeat__ungated(integer)'::regprocedure
         and position(E'update public.player_state\n     set last_seen_at = v_now\n   where user_id = v_uid and slot = v_slot;'
                       in replace(p.prosrc, chr(13), '')) > 0
         and position('v_uid    uuid := auth.uid();' in p.prosrc) > 0
         and position('v_now    timestamptz := now();' in p.prosrc) > 0) <> 1 then
    raise exception 'PRECONDITION: hr_heartbeat__ungated no longer writes last_seen_at = now() on (auth.uid(), p_slot) only — re-read the identity argument before applying';
  end if;
end $mig$;

-- ── §1 THE PRESENCE STAMP ───────────────────────────────────────────────────
create or replace function public.hr_return_anchor_presence()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_catalog'
as $$
declare
  -- THE SERVER CLOCK. Never NEW.last_seen_at: the anchor's time does not come
  -- from a column any writer chose.
  v_now    timestamptz := now();
  v_anchor timestamptz;
  v_cap    bigint;
begin
  -- THE WORLD TICK IS NOT PRESENCE (the marker the accrued_to stamp honours).
  if coalesce(current_setting('hr.frame_origin', true), '') = 'tick' then
    return null;
  end if;
  -- Read under the player_state row lock the firing UPDATE holds — the lock
  -- every anchor writer holds and every horizon reader takes first.
  select a.real_return_at into v_anchor from public.hr_return_anchor a
   where a.user_id = new.user_id and a.slot = new.slot;
  -- NO ANCHOR: never created here (the first real settle stamps it).
  -- RAISE-ONLY: an anchor at or ahead of now() is left alone.
  if v_anchor is null or v_now <= v_anchor then
    return null;
  end if;
  -- NO BACK PAY: the unpaid span [accrued_to, now()] must lie inside the
  -- current horizon, i.e. now() <= greatest(accrued_to, R + cap).
  if new.accrued_to is null or v_now > new.accrued_to then
    v_cap := coalesce(public.hr_offline_cap_ms(new.user_id, new.slot), 0);
    if v_cap <= 0 or v_now > v_anchor + v_cap * interval '1 millisecond' then
      return null;
    end if;
  end if;
  update public.hr_return_anchor
     set real_return_at = v_now, updated_at = v_now
   where user_id = new.user_id and slot = new.slot;
  return null;
end $$;
comment on function public.hr_return_anchor_presence() is
  '2026-10-14 (presence signal, Game Designer precondition B3). AFTER UPDATE OF '
  'last_seen_at trigger on player_state (hr_heartbeat is the only writer): raises '
  'hr_return_anchor.real_return_at to now() for the beating character when the '
  'anchor exists, is behind now(), and now() <= greatest(accrued_to, anchor + '
  'hr_offline_cap_ms) — so presence keeps the horizon ahead and never pays time '
  'past a spent one. Skipped in the world tick. Executable by no role.';

drop trigger if exists hr_return_anchor_seen on public.player_state;
create trigger hr_return_anchor_seen
  after update of last_seen_at on public.player_state
  for each row when (old.last_seen_at is distinct from new.last_seen_at)
  execute function public.hr_return_anchor_presence();

-- ── §2 GRANTS (revoke first; nothing is granted) ────────────────────────────
revoke execute on function public.hr_return_anchor_presence() from public;
revoke execute on function public.hr_return_anchor_presence()
  from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §4 SELF-CHECK — EXECUTED (CLAUDE.md §4) ─────────────────────────────────
-- One transaction, so now() is fixed: elapsed time is simulated by moving the
-- stored instants BACK (anchor, mark, last_seen_at) in a write marked as the
-- tick (so the fixture itself is never presence), and the rate bucket is
-- cleared per simulated step. Beats go through the CLIENT verb hr_heartbeat as
-- `authenticated` with the JWT sub set, exactly as PostgREST calls it.
--   k0  the installed body is this file's; the trigger is on last_seen_at
--   k1  hr_heartbeat has one overload taking only p_slot (no user, no time);
--       authenticated cannot UPDATE player_state; the only body that SETs
--       last_seen_at is hr_heartbeat__ungated; the stamp reaches no role
--   s1  ★ PARTIED ONLINE, beats only, 20 h in 2 h steps, accrue never called:
--       never past R + cap (M4's drop/rejoin predicate); its twin with no
--       beats crosses at the first step past its cap
--   s2  ★ SOLO ONLINE, tick-settled: a beat moves R and the armed window that
--       ends past the OLD horizon pays; its silent twin is refused
--       past_horizon and journalled (parked)
--   s3  ★ RESUME AFTER PARKING (20 h, tick paid to R + cap): the beat does NOT
--       move R and the parked window is still refused (no back pay); the
--       return's cap read forfeits the gap, R -> now(), no horizon_log row for
--       the current anchor (unparked), the next window pays; a later beat
--       still carries R; the absence was paid exactly the cap
--   s4  no anchor -> none created; an anchor ahead of now() is not lowered;
--       a throttled beat (20 s floor) and a rate-limited beat stamp nothing
--   s5  a beat from A moves nothing of B's; a forged last_seen_at a day ahead
--       stamps the SERVER clock
do $$
declare
  c_h    constant text := 'hr1014p-selfcheck';
  v_pon  uuid := '00000000-0000-4000-8000-0000000e8001';
  v_poff uuid := '00000000-0000-4000-8000-0000000e8002';
  v_son  uuid := '00000000-0000-4000-8000-0000000e8003';
  v_soff uuid := '00000000-0000-4000-8000-0000000e8004';
  v_pk   uuid := '00000000-0000-4000-8000-0000000e8005';
  v_na   uuid := '00000000-0000-4000-8000-0000000e8006';
  v_b    uuid := '00000000-0000-4000-8000-0000000e8007';
  v_gact text;  v_cact text;  v_party uuid;
  v_cap  bigint;
  v_now  timestamptz := now();
  v_r0   timestamptz;
  v_t    timestamptz;
  v_a    timestamptz;
  v_v    bigint;
  v_r    jsonb;
  v_c    bigint;
  v_l0   bigint;
  v_cross int;
  v_cfg_en boolean; v_cfg_ch text[]; v_cfg_ar text[];
  r      record;
begin
  begin
    -- ── k0
    if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
         where p.oid = 'public.hr_return_anchor_presence()'::regprocedure)
         <> '97144f1463ded795d2e411a93c8c7a96' then
      raise exception 'k0: the installed hr_return_anchor_presence is not the one this file states';
    end if;
    if not exists (select 1 from pg_trigger t
                    where t.tgrelid = 'public.player_state'::regclass and t.tgname = 'hr_return_anchor_seen'
                      and t.tgfoid = 'public.hr_return_anchor_presence()'::regprocedure and t.tgenabled = 'O'
                      and pg_get_triggerdef(t.oid) ~ 'AFTER UPDATE OF last_seen_at ON public\.player_state FOR EACH ROW WHEN \(\(old\.last_seen_at IS DISTINCT FROM new\.last_seen_at\)\)') then
      raise exception 'k0b: trigger hr_return_anchor_seen is missing, disabled or not AFTER UPDATE OF last_seen_at';
    end if;

    -- ── k1
    if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'hr_heartbeat') <> 1
       or (select pg_get_function_identity_arguments(p.oid) from pg_proc p
            where p.oid = 'public.hr_heartbeat(integer)'::regprocedure) <> 'p_slot integer' then
      raise exception 'k1a: hr_heartbeat must have ONE overload taking only p_slot (no user, no time)';
    end if;
    if has_table_privilege('authenticated', 'public.player_state', 'update')
       or has_column_privilege('authenticated', 'public.player_state', 'last_seen_at', 'update') then
      raise exception 'k1b: authenticated can UPDATE player_state.last_seen_at directly';
    end if;
    if (select string_agg(p.oid::regprocedure::text, ',' order by 1) from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prosrc ~* 'set\s+last_seen_at\s*=')
       is distinct from 'hr_heartbeat__ungated(integer)' then
      raise exception 'k1c: a body other than hr_heartbeat__ungated SETs last_seen_at — it would be a presence signal';
    end if;
    for r in select c.role from (values ('public'), ('anon'), ('authenticated'), ('service_role'),
                                        ('hr_engine'), ('hr_tick')) c(role) loop
      if (r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role))
         and has_function_privilege(r.role, 'public.hr_return_anchor_presence()', 'execute') then
        raise exception 'k1d: % holds EXECUTE on hr_return_anchor_presence', r.role;
      end if;
    end loop;

    -- ── fixture
    select enabled, channels, armed_channels into v_cfg_en, v_cfg_ch, v_cfg_ar from public.hr_tick_config where id;
    if not found then raise exception 'k-fixture: hr_tick_config has no row'; end if;
    update public.hr_tick_config
       set enabled = true, channels = array['combat','gather','artisan'], armed_channels = array['gather'] where id;
    select activity_id into v_gact from public.hr_activities where kind = 'gather' order by activity_id limit 1;
    select activity_id into v_cact from public.hr_activities where kind = 'combat' order by activity_id limit 1;
    insert into auth.users (id) values (v_pon), (v_poff), (v_son), (v_soff), (v_pk), (v_na), (v_b)
      on conflict do nothing;
    v_cap := public.hr_offline_cap_ms(v_pon, 0);
    if coalesce(v_cap, 0) < 6 * 3600000 or v_cap > 19 * 3600000 then
      raise exception 'k-fixture: cap % ms; the arms need 6 h <= cap < 19 h', v_cap;
    end if;
    -- Everyone starts PRESENT now (the insert trigger stamps R = accrued_to).
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                     accrued_to, active_kind, active_id, active_since)
    select u, 0, 0, 0, 10, 10, 1, v_now - interval '10 seconds', 'gather', v_gact, '2000-01-01 00:00:00+00'
      from unnest(array[v_pon, v_poff, v_son, v_soff, v_pk, v_na, v_b]) u;
    insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
    select u, 0, 'gather', true, c_h, now() + interval '5 minutes'
      from unnest(array[v_son, v_soff, v_pk]) u;
    insert into public.party (leader_user, leader_slot) values (v_pon, 0) returning id into v_party;
    insert into public.party_member (party_id, user_id, slot, role, joined_at)
      values (v_party, v_pon, 0, 'leader', v_now - interval '1 hour'),
             (v_party, v_poff, 0, 'member', v_now - interval '1 hour');
    insert into public.party_hunt (party_id, active_id, accrued_to) values (v_party, v_cact, v_now);
    if not (public.hr_partied(v_pon, 0) and public.hr_partied(v_poff, 0)) then
      raise exception 'k-fixture: the two party members do not read partied';
    end if;

    -- ── s1 PARTIED ONLINE, beats only, 20 h in ten 2 h steps. Both last seen
    --    exactly now(), so the silent twin crosses at the first step with
    --    2 h x step > cap.
    perform set_config('hr.frame_origin', 'tick', true);
    update public.hr_return_anchor set real_return_at = v_now where user_id in (v_pon, v_poff) and slot = 0;
    perform set_config('hr.frame_origin', '', true);
    v_cross := 0;
    for i in 1..10 loop
      -- Two hours pass: every stored instant moves back 2 h; the party paid
      -- both members up to 10 s ago (a tick write: not presence).
      perform set_config('hr.frame_origin', 'tick', true);
      update public.hr_return_anchor set real_return_at = real_return_at - interval '2 hours'
       where user_id in (v_pon, v_poff) and slot = 0;
      update public.player_state
         set accrued_to = v_now - interval '10 seconds',
             last_seen_at = case when user_id = v_pon then v_now - interval '2 hours' else null end
       where user_id in (v_pon, v_poff) and slot = 0;
      perform set_config('hr.frame_origin', '', true);
      delete from public.hr_rate_counters where user_id = v_pon;
      -- PON beats (the client verb, as the client calls it). POFF is silent.
      perform set_config('request.jwt.claim.sub', v_pon::text, true);
      set local role authenticated;
      v_r := public.hr_heartbeat(0);
      reset role;
      perform set_config('request.jwt.claim.sub', '', true);
      if coalesce((v_r->>'stamped')::boolean, false) is not true then
        raise exception 's1a: step % — the partied player''s beat did not stamp: %', i, v_r;
      end if;
      -- M4's drop / rejoin predicate: now() > R + cap.
      select a.real_return_at into v_a from public.hr_return_anchor a where a.user_id = v_pon and a.slot = 0;
      if v_now > v_a + v_cap * interval '1 millisecond' or v_a <> v_now then
        raise exception 's1b: step % — the beating partied player is past their horizon (R %)', i, v_a;
      end if;
      select a.real_return_at into v_a from public.hr_return_anchor a where a.user_id = v_poff and a.slot = 0;
      if v_cross = 0 and v_now > v_a + v_cap * interval '1 millisecond' then v_cross := i; end if;
    end loop;
    if v_cross <> (v_cap / 7200000)::int + 1 then
      raise exception 's1c: the silent partied twin crossed at step %, not at the first step past its cap', v_cross;
    end if;
    if not public.hr_partied(v_pon, 0) then
      raise exception 's1d: the beating member is no longer partied (the arm must not have used accrue)';
    end if;

    -- ── s2 SOLO ONLINE, tick-settled: the old horizon is 30 s away.
    perform set_config('hr.frame_origin', 'tick', true);
    update public.hr_return_anchor
       set real_return_at = v_now - v_cap * interval '1 millisecond' + interval '30 seconds'
     where user_id in (v_son, v_soff) and slot = 0;
    update public.player_state set accrued_to = v_now - interval '60 seconds'
     where user_id in (v_son, v_soff) and slot = 0;
    perform set_config('hr.frame_origin', '', true);
    perform set_config('request.jwt.claim.sub', v_son::text, true);
    set local role authenticated;
    v_r := public.hr_heartbeat(0);
    reset role;
    perform set_config('request.jwt.claim.sub', '', true);
    for r in select u, ('00000000-0000-4000-8000-0000000e81' || lpad(n::text, 2, '0'))::uuid as k
               from unnest(array[v_son, v_soff]) with ordinality x(u, n) loop
      select version into v_v from public.player_state where user_id = r.u and slot = 0;
      set local role hr_engine;
      v_r := public.hr_tick_settle(c_h, r.u, 0, 'gather', v_v, v_now - interval '60 seconds',
               v_now + interval '50 seconds', r.k,
               jsonb_build_object('accrued_to', to_jsonb(v_now + interval '50 seconds'),
                 'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                   'meta', jsonb_build_object('src', 'tick', 'ticks', 1))));
      reset role;
      perform set_config('hr.frame_origin', '', true);
      if r.u = v_son and coalesce((v_r->>'ok')::boolean, false) is not true then
        raise exception 's2a: the beating solo player''s window past the OLD horizon was not paid: %', v_r;
      end if;
      if r.u = v_soff and (v_r->>'error' is distinct from 'past_horizon'
           or (select count(*) from public.hr_tick_horizon_log where user_id = v_soff) <> 1) then
        raise exception 's2b: the silent twin was not refused past_horizon and parked once: %', v_r;
      end if;
    end loop;

    -- ── s3 RESUME AFTER PARKING: 20 h away, tick paid to R + cap, parked.
    v_r0 := v_now - interval '20 hours';
    v_t  := v_r0 + v_cap * interval '1 millisecond';
    perform set_config('hr.frame_origin', 'tick', true);
    update public.hr_return_anchor set real_return_at = v_r0 where user_id = v_pk and slot = 0;
    update public.player_state set accrued_to = v_t, last_seen_at = v_r0 where user_id = v_pk and slot = 0;
    perform set_config('hr.frame_origin', '', true);
    select version into v_v from public.player_state where user_id = v_pk and slot = 0;
    set local role hr_engine;
    v_r := public.hr_tick_settle(c_h, v_pk, 0, 'gather', v_v, v_t, v_t + interval '90 seconds',
             '00000000-0000-4000-8000-0000000e8201',
             jsonb_build_object('accrued_to', to_jsonb(v_t + interval '90 seconds'),
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'tick', 'ticks', 1))));
    reset role;
    perform set_config('hr.frame_origin', '', true);
    if v_r->>'error' is distinct from 'past_horizon'
       or not exists (select 1 from public.hr_tick_horizon_log where user_id = v_pk and anchor_at = v_r0) then
      raise exception 's3a: fixture — the 20 h absence did not park at R + cap: %', v_r;
    end if;
    -- The player is back: the beat stamps last_seen_at but NOT the anchor.
    select count(*) into v_l0 from public.player_ledger where user_id = v_pk;
    perform set_config('request.jwt.claim.sub', v_pk::text, true);
    set local role authenticated;
    v_r := public.hr_heartbeat(0);
    reset role;
    perform set_config('request.jwt.claim.sub', '', true);
    if coalesce((v_r->>'stamped')::boolean, false) is not true
       or (select real_return_at from public.hr_return_anchor where user_id = v_pk and slot = 0) <> v_r0 then
      raise exception 's3b: a beat AFTER the horizon moved the anchor (the gap past R + cap would be paid): %', v_r;
    end if;
    select version into v_v from public.player_state where user_id = v_pk and slot = 0;
    set local role hr_engine;
    v_r := public.hr_tick_settle(c_h, v_pk, 0, 'gather', v_v, v_t, v_t + interval '90 seconds',
             '00000000-0000-4000-8000-0000000e8202',
             jsonb_build_object('accrued_to', to_jsonb(v_t + interval '90 seconds'),
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'tick', 'ticks', 1))));
    reset role;
    perform set_config('hr.frame_origin', '', true);
    if v_r->>'error' is distinct from 'past_horizon'
       or (select count(*) from public.player_ledger where user_id = v_pk) <> v_l0 then
      raise exception 's3c: after the beat the parked window paid (back pay past the cap): %', v_r;
    end if;
    -- The return's cap read (the client's accrue, as the edge reads it).
    set local role hr_engine;
    v_c := public.hr_accrue_cap_ms(v_pk, 0);
    reset role;
    if v_c <> 1
       or (select accrued_to from public.player_state where user_id = v_pk and slot = 0) <> v_now
       or (select real_return_at from public.hr_return_anchor where user_id = v_pk and slot = 0) <> v_now
       or exists (select 1 from public.hr_tick_horizon_log l
                   join public.hr_return_anchor a on a.user_id = l.user_id and a.slot = l.slot
                                                 and a.real_return_at = l.anchor_at
                   where l.user_id = v_pk)
       or (select (meta->>'forfeit_ms')::bigint from public.player_ledger
            where user_id = v_pk and intent = 'horizon_forfeit')
          <> floor(extract(epoch from (v_now - v_t)) * 1000)::bigint then
      raise exception 's3d: the return did not forfeit the gap, move R to now() and unpark (read %)', v_c;
    end if;
    -- Unparked: the next window (from now) pays; and presence keeps carrying R.
    select version into v_v from public.player_state where user_id = v_pk and slot = 0;
    set local role hr_engine;
    v_r := public.hr_tick_settle(c_h, v_pk, 0, 'gather', v_v, v_now, v_now + interval '50 seconds',
             '00000000-0000-4000-8000-0000000e8203',
             jsonb_build_object('accrued_to', to_jsonb(v_now + interval '50 seconds'),
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'tick', 'ticks', 1))));
    reset role;
    perform set_config('hr.frame_origin', '', true);
    if coalesce((v_r->>'ok')::boolean, false) is not true then
      raise exception 's3e: the unparked character''s next window did not pay: %', v_r;
    end if;
    perform set_config('hr.frame_origin', 'tick', true);
    update public.hr_return_anchor set real_return_at = v_now - interval '1 hour' where user_id = v_pk and slot = 0;
    update public.player_state set last_seen_at = v_now - interval '1 hour' where user_id = v_pk and slot = 0;
    perform set_config('hr.frame_origin', '', true);
    delete from public.hr_rate_counters where user_id = v_pk;
    perform set_config('request.jwt.claim.sub', v_pk::text, true);
    set local role authenticated;
    v_r := public.hr_heartbeat(0);
    reset role;
    perform set_config('request.jwt.claim.sub', '', true);
    if (select real_return_at from public.hr_return_anchor where user_id = v_pk and slot = 0) <> v_now then
      raise exception 's3f: after the return a beat no longer carries the anchor';
    end if;

    -- ── s4 no anchor; ahead of now(); throttled; rate-limited.
    delete from public.hr_return_anchor where user_id = v_na;
    perform set_config('request.jwt.claim.sub', v_na::text, true);
    set local role authenticated;
    v_r := public.hr_heartbeat(0);
    reset role;
    perform set_config('request.jwt.claim.sub', '', true);
    if coalesce((v_r->>'stamped')::boolean, false) is not true
       or exists (select 1 from public.hr_return_anchor where user_id = v_na) then
      raise exception 's4a: a beat created an anchor (only a real settle may): %', v_r;
    end if;
    perform set_config('hr.frame_origin', 'tick', true);
    insert into public.hr_return_anchor (user_id, slot, real_return_at) values (v_na, 0, v_now + interval '40 seconds');
    update public.player_state set last_seen_at = v_now - interval '1 hour' where user_id = v_na and slot = 0;
    perform set_config('hr.frame_origin', '', true);
    perform set_config('request.jwt.claim.sub', v_na::text, true);
    set local role authenticated;
    v_r := public.hr_heartbeat(0);
    reset role;
    perform set_config('request.jwt.claim.sub', '', true);
    if (select real_return_at from public.hr_return_anchor where user_id = v_na) <> v_now + interval '40 seconds' then
      raise exception 's4b: a beat LOWERED an anchor that was ahead of now()';
    end if;
    -- Throttled (20 s floor): last_seen_at is now(), R is moved back by hand.
    perform set_config('hr.frame_origin', 'tick', true);
    update public.hr_return_anchor set real_return_at = v_now - interval '1 hour' where user_id = v_na;
    perform set_config('hr.frame_origin', '', true);
    perform set_config('request.jwt.claim.sub', v_na::text, true);
    set local role authenticated;
    v_r := public.hr_heartbeat(0);
    reset role;
    perform set_config('request.jwt.claim.sub', '', true);
    if coalesce((v_r->>'throttled')::boolean, false) is not true
       or (select real_return_at from public.hr_return_anchor where user_id = v_na) <> v_now - interval '1 hour' then
      raise exception 's4c: a THROTTLED beat moved the anchor: %', v_r;
    end if;
    -- Rate-limited (6/min bucket): exhaust it, then a beat past the floor.
    for i in 1..6 loop
      perform set_config('request.jwt.claim.sub', v_na::text, true);
      set local role authenticated;
      perform public.hr_heartbeat(0);
      reset role;
      perform set_config('request.jwt.claim.sub', '', true);
    end loop;
    perform set_config('hr.frame_origin', 'tick', true);
    update public.player_state set last_seen_at = v_now - interval '1 hour' where user_id = v_na and slot = 0;
    perform set_config('hr.frame_origin', '', true);
    perform set_config('request.jwt.claim.sub', v_na::text, true);
    set local role authenticated;
    v_r := public.hr_heartbeat(0);
    reset role;
    perform set_config('request.jwt.claim.sub', '', true);
    if v_r->>'error' is distinct from 'rate_limited'
       or (select real_return_at from public.hr_return_anchor where user_id = v_na) <> v_now - interval '1 hour' then
      raise exception 's4d: a RATE-LIMITED beat moved the anchor: %', v_r;
    end if;

    -- ── s5 another uid; a forged clock.
    perform set_config('hr.frame_origin', 'tick', true);
    update public.hr_return_anchor set real_return_at = v_now - interval '1 hour' where user_id in (v_son, v_b) and slot = 0;
    update public.player_state set last_seen_at = v_now - interval '1 hour' where user_id = v_son and slot = 0;
    perform set_config('hr.frame_origin', '', true);
    delete from public.hr_rate_counters where user_id = v_son;
    perform set_config('request.jwt.claim.sub', v_son::text, true);
    set local role authenticated;
    v_r := public.hr_heartbeat(0);
    reset role;
    perform set_config('request.jwt.claim.sub', '', true);
    if (select real_return_at from public.hr_return_anchor where user_id = v_son) <> v_now
       or (select real_return_at from public.hr_return_anchor where user_id = v_b) <> v_now - interval '1 hour' then
      raise exception 's5a: a beat from A did not move A''s anchor, or moved B''s';
    end if;
    update public.player_state set last_seen_at = v_now + interval '1 day' where user_id = v_b and slot = 0;
    if (select real_return_at from public.hr_return_anchor where user_id = v_b) <> v_now then
      raise exception 's5b: a forged last_seen_at a day ahead did not stamp the SERVER clock';
    end if;

    update public.hr_tick_config set armed_channels = v_cfg_ar, enabled = v_cfg_en, channels = v_cfg_ch where id;
    raise exception 'HR1014P_ROLLBACK_OK';
  exception when others then
    if sqlerrm <> 'HR1014P_ROLLBACK_OK' then raise; end if;
  end;
  raise notice 'world-tick-presence-signal: EXECUTED — a partied player who only beats is never past their horizon '
               'over 20 h (their silent twin crosses at the cap); a beating tick-settled solo player is paid past the '
               'old horizon while the silent twin parks; a beat after a spent horizon moves nothing and the return '
               'forfeits the gap and unparks; no anchor is created, none lowered; throttled and rate-limited beats '
               'stamp nothing; one uid only; the server clock only — all green';
end $$;
