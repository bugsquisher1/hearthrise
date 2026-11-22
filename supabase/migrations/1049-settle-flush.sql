-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1049-settle-flush.sql — EVERY LEVER COUNTS FROM WHAT AN UNSAVED CONFIRM CAN HAVE SHOWN
--   (lane/c-settle-flush FB-4 second half, reliability-engineer, 2026-11-22; 30-plan L12 "confirm in the edge, save at the flush",
--   study 48 section 3; build plan 13 FB-4).
--
-- STATUS: supabase/migration-notes/1049-settle-flush.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base (after 1005-lever-horizon.sql,
--   whose hr_hunt_seed_horizon it restates, and 2026-10-31-live-horizon.sql, whose hr_hunt_live_horizon_at it restates).
--   Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- THE FLUSH (supabase/functions/hr-accrue/hunt-settle.js flushDue). A viewed hunt's poll used to SAVE every 16 s (a read, the engine,
--   hr_hunt_apply_instance and the asker's projection). Now the poll of a browser running its prediction says `confirm`, and the
--   edge runs the engine and answers the check (the world it reached, its hash, the next 16 combat seeds) without saving, until the
--   window reaches the world tick's 90 s flush or holds a death, a Level, an end, a pending leave or a rare drop (those save at once).
-- THE HOLE IT OPENS. Every mid-hunt lever counts from the SEED HORIZON: the instant past every combat swing an answer can have
--   shown. Until now that was the SAVED clock plus the look-ahead (hr_hunt_seed_horizon: settled_to / next_swing_at + 32 s;
--   hr_hunt_live_horizon_at: greatest(now(), settled_to + 32 s)), right while every answer was a save. Under the flush an unsaved
--   confirm shows seeds up to ~90 s past the save, so a Blessing bought for a death the browser can already see (hr_blessing_buy,
--   bought_at = the old horizon, behind the death), a leave or change sent before it (leave_at / change_at = the old horizon), a
--   bar, option or setup change (its hold `until` = the old horizon) would each act on swings already shown, once any door saved
--   between the lever and the death (a forced save is the player's to make: any settle-first verb, or an ask without `confirm`).
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- THE CONFIRM HORIZON RULE. An unsaved confirm's seeds start at the world it reached: its next swing, under its read's now() plus
--   one swing (the engine steps the instance clock a swing at a time to the window's end, accrue-hunt.js settledTo), and run 16
--   swings on, so every blow they can show lands before (its read's now() + one swing) + 32 s. Every answer reaches the player
--   before any lever it informs is sent, so a lever's now() is later than that read's. Hence, with a hunt open:
--     horizon = greatest(every saved point, now() + 2 s) + 32 s        (2 s: src/core/combat.js tickMs; 32 s: liveSeeds 16 x 2 s)
--   NO WRITE PER CONFIRM: the bound is the clock's, so the confirm records nothing (the first lane's design recorded each confirm's
--   reach with an hr_hunt_confirm update and one more engine grant: ~225 row updates a watched hour, removed). The price: a lever
--   pulled on a hunt nobody is viewing waits up to 34 s where it waited up to 32 s past its save.
--   hr_hunt_seed_horizon(session)        RESTATED: greatest(s.settled_to, s.next_swing_at, i.settled_to, i.next_swing_at,
--                                         now() + 2 s) + 32 s. Read by hr_hunt_lever_at (a Blessing's bought_at) and
--                                         hr_hunt_setup_hold (a bar, option, setup or First target change's hold `until`).
--   hr_hunt_live_horizon_at(settled_to)  RESTATED: greatest(now() + 2 s, settled_to) + 32 s. Read by hr_hunt_close_at (a leave,
--                                         the GM's stop), hr_hunt_change and hr_hunt_party_kick.
--   A walking hero (its next swing in the future) keeps next_swing_at + 32 s: no seed is shown before the hunt begins.
-- THE REST OF THE CLASS ("spend against what the browser has already seen"), each checked:
--   a purchase, a meal, a market gesture, an equip   edge verbs that settle first (intents.js collectsFirst): their collect is a
--                                         save (never `confirm`), so they price the saved hunt. Unchanged.
--   a carry-in, a hunt use, a setup save or apply, a bar or option edit on the playing set   refuse settle_first past 20 s
--                                         (hr_hunt_gap_ms): the client's catch-up asks a SAVE first (src/session/catch-up.js;
--                                         hunt-ask.js: never `confirm`), then the lever lands on a fresh clock, its hold or effect
--                                         counted from this horizon. Unchanged in what it can reach (the carry-in's at-once bag
--                                         line is 1005's named open item for the Early Access review).
--   a Blessing, a leave, a hunt change, a kick, the GM's stop, a bar / option / setup / First target hold   THIS FILE.
--   a stamina refill                      buys hunting time, never a fight's outcome; it reads the saved purse. Unchanged.
--   gold the unsaved window spent or sold for   never sent (the confirm answers no number, hunt-settle.js confirmed), so nothing a
--                                         purchase, a gate or another player reads comes from it; a purse another hero moved is
--                                         re-read by the save (gold_short), as before.
--   LEFT OPEN, NAMED (no horizon and no slack gate, so each acts from the SAVED clock: under the flush up to ~90 s back over swings
--     the prediction already played, where it was up to 16 s): the leader's hold seat (hr_party_hold_set, 1005's named item) and the
--     scaled-hunt switch and hour buy (hr_scaled_hunt_switch / _buy: the world restarts at the saved clock). The fix is the slack gate
--     (settle_first past 20 s) with their client calls (src/session/party-intents.js, scaled-hunts.js) routed through the catch-up
--     link; for the Early Access review. Leave-together moves no past swing (every end saves at once).
-- A BACKLOG IS NOT REPLAYED UNDER A NEW SETUP. A lever on a hunt the tick left minutes behind used to hold the old setup only to the
--   saved clock + 32 s and play the new one over the rest of the backlog (time already past); it now holds to the clock's horizon.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- Two STABLE SQL helpers, restated whole; every caller already reads them under the character lock. A second apply finds both at
-- their post pins (§0) and restates the same text: byte-identical (tests/schema-drift.mjs).
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- CLOSES the death dodge the flush would open, by Blessing, leave, change, kick and every held setup lever (tests/hunt-sessions-
--   settle.mjs FLUSH-HORIZON, both paths). No new client verb, grant, table or write path; both helpers stay owner-only.
--
-- ── COST (rows and bytes at 100x players) ────────────────────────────────────
-- None stored. Each lever reads now() once more. The flush itself (the edge) saves a viewed hunt about every 90 s instead of every
--   16 s: tests/per-player-cost.mjs krell4_L80_deadly_watched measures it.
-- EDGE: hunt-settle.js flushDue / confirmed, request.js readConfirm, index.ts (the hunter's accrue passes `confirm`; the secret
--   HR_HUNT_FLUSH=off turns the flush off without a deploy). Apply this file BEFORE the edge deploy: an edge that confirms without
--   saving over the old horizon is the hole above. CLIENT: hunt-ask.js
--   (askBody's `confirm`), character-session.js, live-link.js confirming(); a client before them never says `confirm` and saves as before.
-- REVERSIBLE: restate both helpers from 1005-lever-horizon.sql §1 and 2026-10-31-live-horizon.sql §1 (§0 pins the pre images), and
--   only after the edge stops honouring `confirm` (else the hole above opens).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- Each body is the image this file was written against (the replayed chain on set/v0.2.144) or this file's own (a second apply):
-- md5 of prosrc with carriage returns removed.
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regprocedure('public.hr_hunt_lever_at(uuid,integer)') is null or to_regprocedure('public.hr_hunt_close_at(uuid)') is null
     or to_regprocedure('public.hr_hunt_setup_hold()') is null then
    raise exception 'PRECONDITION: a lever-horizon reader this file serves is missing (1005-lever-horizon.sql, 2027-05-20-yard-stop.sql)'; end if;
  for v_r in select * from (values
    ('public.hr_hunt_seed_horizon(uuid)', 'd5f7e5bff631a9fca1845be4739d36c2', '9ac9212234343e5f5e6d53bfa37fbcf3'),
    ('public.hr_hunt_live_horizon_at(timestamp with time zone)', 'a857fba35a9e8a97139c7d79c5afe4a1', '78d553a8b5ea78d1420d9c875ac2a360')) t(fn, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(v_r.fn);
    if v_md5 is null then raise exception 'PIN: % is missing', v_r.fn; end if;
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither the image this file was written against (%) nor its own (%): md5 % - another file moved it; re-pin', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE TWO HORIZONS, BOUNDED BY THE CLOCK AS WELL AS THE SAVE ─────────────
create or replace function public.hr_hunt_seed_horizon(p_session uuid)
returns timestamptz language sql stable set search_path = public, pg_catalog as $fn$
  -- SETTLE-FLUSH (1049-settle-flush.sql) over LEVER-HORIZON (1005): the instant past every combat swing an answer can have shown for
  -- this session's hunt. A saved answer shows the 16 seeds past the instance's (or the session's) settled point and next swing; an
  -- unsaved confirm (hunt-settle.js flushDue) shows them past the world it reached, whose next swing is under its read's now() + one
  -- 2 s swing, and reached the player before any lever it informs was sent. So: the later of the saved points and now() + one swing,
  -- plus the look-ahead, liveSeeds (16) x the 2 s swing (src/data/hunt-tuning.js). The 16th seed is the swing at next swing + 30 s.
  select greatest(s.settled_to, s.next_swing_at, i.settled_to, i.next_swing_at, now() + make_interval(secs => 2000 / 1000.0))
         + make_interval(secs => 32000 / 1000.0)
    from public.hunt_sessions s left join public.hunt_instances i on i.id = s.instance_id
   where s.id = p_session
$fn$;
revoke execute on function public.hr_hunt_seed_horizon(uuid) from public, anon, authenticated, service_role;

create or replace function public.hr_hunt_live_horizon_at(p_settled_to timestamptz)
returns timestamptz language sql stable set search_path = public, pg_catalog as $$
  -- SETTLE-FLUSH (1049-settle-flush.sql): the last combat swing an answer can show, the saved clock's or an unsaved confirm's (its
  -- read's now() + one 2 s swing), plus the look-ahead, liveSeeds (16) x the 2 s swing. A leave, change or kick lands no earlier.
  select greatest(now() + make_interval(secs => 2000 / 1000.0), p_settled_to) + make_interval(secs => 32000 / 1000.0)
$$;
revoke execute on function public.hr_hunt_live_horizon_at(timestamptz) from public, anon, authenticated, service_role;

-- ── §4 THE SELF-CHECK, BY EXECUTING IT (rolled back) ─────────────────────────
-- One probe hero through the real verbs, its hunt SAVED 40 minutes ago (as a viewed hunt stands between flushes, at its extreme):
-- (a) the seed horizon is the clock's: now() + 34 s (the saved one, 40 minutes back + 32 s, would cut every seed shown since);
-- (b) a hero still walking in keeps its next swing + 32 s (no seed is shown before the hunt begins);
-- (c) a Blessing bought counts from now() + 34 s; (d) a stance change holds the old setup until now() + 34 s, and the window
--     starting at the saved clock still plays it; (e) a fresh save 5 s ago (inside the 20 s slack) still holds to now() + 34 s,
--     past its own settled point + 32 s; (f) a leave lands at now() + 34 s;
-- (g) both helpers owner-only, at their post pins (a second apply passes §0 and moves no body).
do $$
declare
  v_a constant uuid := '000000c0-0000-4000-a000-0000f1a50001';
  k   text := '000000c0-0000-4000-a000-0000';
  v jsonb; v_g text := 'mill_cellar'; v_s uuid; v_i uuid; v_at timestamptz; v_want timestamptz; v_role text;
  v_row public.hunt_sessions%rowtype;
begin
  begin
    update public.hr_hunt_config set enabled = true where id;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    insert into auth.users (id) values (v_a) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_a, 'Probe Flush') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_a, 'settle-flush §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY: hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null, level_xp = 0 where user_id = v_a and slot = 0;
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_hunt_enter(0, v_g, '[]'::jsonb, 0, null, (k || 'f1a50100')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY: the enter answered %', v; end if;
    select id, instance_id into v_s, v_i from public.hunt_sessions where user_id = v_a and slot = 0 and ended_at is null;
    v_want := now() + interval '34 seconds';

    -- (b) WALKING IN: the next swing five minutes out.
    update public.hunt_sessions set hunt_from = now() + interval '5 minutes', settled_to = now() + interval '5 minutes',
                                    next_swing_at = now() + interval '5 minutes' where id = v_s;
    update public.hunt_instances set settled_to = now() + interval '5 minutes', next_swing_at = now() + interval '5 minutes' where id = v_i;
    if public.hr_hunt_seed_horizon(v_s) is distinct from now() + interval '5 minutes 32 seconds' then
      raise exception 'VERIFY(b): a hero walking in (next swing +5 min) has its seed horizon at %', public.hr_hunt_seed_horizon(v_s); end if;

    -- (a) SAVED 40 MINUTES AGO, at a whole second.
    v_at := date_trunc('second', now() - interval '40 minutes');
    update public.hunt_sessions set entered_at = v_at - interval '1 minute', hunt_from = v_at, settled_to = v_at, next_swing_at = v_at where id = v_s;
    update public.hunt_instances set settled_to = v_at, next_swing_at = v_at where id = v_i;
    if public.hr_hunt_seed_horizon(v_s) is distinct from v_want then
      raise exception 'VERIFY(a): the seed horizon of a hunt saved at % reads % (want the clock''s %)', v_at, public.hr_hunt_seed_horizon(v_s), v_want; end if;
    if public.hr_hunt_live_horizon_at(v_at) is distinct from v_want then
      raise exception 'VERIFY(a): the live horizon of a hunt saved at % reads % (want %)', v_at, public.hr_hunt_live_horizon_at(v_at), v_want; end if;

    -- (c) A BLESSING on the stale save.
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_blessing_buy(0, 1, public.hr_blessing_price(1, greatest(1, coalesce(public.hr_level_of(v_a, 0), 1))), (k || 'f1a50200')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): the Blessing answered %', v; end if;
    if (select bought_at from public.player_blessings where user_id = v_a and slot = 0 and tier = 1) is distinct from v_want then
      raise exception 'VERIFY(c): a Blessing bought on a hunt saved 40 minutes ago counts from %, not %',
        (select bought_at from public.player_blessings where user_id = v_a and slot = 0 and tier = 1), v_want; end if;

    -- (e) A FRESH SAVE, 5 s ago (inside the 20 s slack every bar edit checks): the hold still reaches the clock's horizon.
    update public.hunt_sessions set settled_to = now() - interval '5 seconds', next_swing_at = now() - interval '5 seconds' where id = v_s;
    update public.hunt_instances set settled_to = now() - interval '5 seconds', next_swing_at = now() - interval '5 seconds' where id = v_i;
    if public.hr_hunt_seed_horizon(v_s) is distinct from v_want then
      raise exception 'VERIFY(e): a hunt saved 5 s ago has its seed horizon at % (want %, past the save + 32 s)', public.hr_hunt_seed_horizon(v_s), v_want; end if;
    -- (d) THE STANCE: one hold, until the clock's horizon, the old setup; the window starting at the saved clock plays it.
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_action_set_options(0, 0, '{"stance": "defensive"}'::jsonb, (k || 'f1a50300')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): the mid-hunt stance answered %', v; end if;
    if (select count(*) from public.hunt_setup_holds where session_id = v_s) <> 1
       or (select until from public.hunt_setup_holds where session_id = v_s) is distinct from v_want
       or (select setup->'options' from public.hunt_setup_holds where session_id = v_s) ? 'stance' then
      raise exception 'VERIFY(d): the holds after the stance: % (want one until %, with no stance)',
        (select jsonb_agg(jsonb_build_object('until', until, 'options', setup->'options')) from public.hunt_setup_holds where session_id = v_s), v_want; end if;
    select * into v_row from public.hunt_sessions where id = v_s;
    if public.hr_hunt_member_read(v_row)->'options' ? 'stance' then
      raise exception 'VERIFY(d): the window starting at the saved clock plays the new stance inside the horizon'; end if;

    -- (f) A LEAVE lands at the clock's horizon (hunt_sessions keeps leave_at to the millisecond: 2026-10-22-hunt-sessions-settle.sql's trigger).
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_hunt_leave(0, (k || 'f1a50400')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(f): the leave answered %', v; end if;
    if (select leave_at from public.hunt_sessions where id = v_s) is distinct from date_trunc('milliseconds', v_want) then
      raise exception 'VERIFY(f): a leave on a hunt saved 5 s ago lands at % (want %)', (select leave_at from public.hunt_sessions where id = v_s), date_trunc('milliseconds', v_want); end if;
    raise exception using errcode = 'HRFL1', message = 'settle-flush §4 complete - rolling back';
  exception when sqlstate 'HRFL1' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_a) or exists (select 1 from public.player_blessings where user_id = v_a) then
    raise exception 'VERIFY: §4 LEAKED a probe row'; end if;
  -- (g) OWNER-ONLY, AND EACH BODY AT ITS POST PIN.
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      if has_function_privilege(v_role, 'public.hr_hunt_seed_horizon(uuid)', 'execute')
         or has_function_privilege(v_role, 'public.hr_hunt_live_horizon_at(timestamp with time zone)', 'execute') then
        raise exception 'VERIFY(g): % may execute a horizon helper', v_role; end if;
    end if;
  end loop;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_seed_horizon(uuid)'::regprocedure) is distinct from '9ac9212234343e5f5e6d53bfa37fbcf3'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_live_horizon_at(timestamp with time zone)'::regprocedure) is distinct from '78d553a8b5ea78d1420d9c875ac2a360' then
    raise exception 'VERIFY(g): a horizon landed off its post pin: seed %, live %',
      (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_seed_horizon(uuid)'::regprocedure),
      (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_live_horizon_at(timestamp with time zone)'::regprocedure); end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'settle-flush: a Blessing, a leave, a change, a kick and every held setup lever count from the clock''s seed horizon (now + 34 s) as well as the save''s';
end $$;
