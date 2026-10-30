-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — A PARTY INSTANCE STARTS EVERY HUNT OVER, AND A REFUSAL THE WORLD
-- CAUSES ENDS THE WHOLE PARTY AT ONCE (lane c-party-instance-reset,
-- backend-architect, 2026-10-30; reports #60 and #73).
-- STAGED. Pre-EA (CLAUDE.md §2): applies on its passing §5, one file via the
-- Coordinator's apply tool, never inside begin/commit, never 00:00–00:10 UTC. On the
-- EA Security list (it decides when a party's hunt is ended by the server).
-- DB-ONLY: no hr-accrue change (pack-edge --hash unmoved), no client change.
--
-- ── ROOT CAUSE ──────────────────────────────────────────────────────────────
-- #60 (P1, live). A party's instance IS its party id, reused for every hunt the party
--   starts. hr_hunt_enter_for (2027-01-19-play-cap.sql, "No open session: the instance
--   restarts") reset hunt_id, world and the two clocks, but not `density`, which
--   hr_hunt_density_freeze writes only `where density is null`. So a party played its
--   FIRST hunt's density on every later hunt and ground until it disbanded (live:
--   82888d29 frozen at 3; d8a49fd1 played Mosslight at 8 with the leader's pick 4;
--   ca19cf1e at 12 on Wickstead from a Sewer pick). THE CLASS, every column of
--   hunt_instances: per hunt and reset at the restart = hunt_id, world, settled_to,
--   next_swing_at, density, refusals; kept on purpose = id, kind, created_at, version
--   (the CAS counter) and world_swing (the seed index, counts forward: a restarted
--   world never replays a swing; tests/hunt-sessions-settle.mjs PARTY-RESTART).
--   `refusals` was the second stale one: a dead hunt's strikes shortened the next
--   hunt's fuse. §5(a) fails on any new column until it is classified here.
-- #73. A refusal the SHARED world causes (live: value_over on raw_bear_meat, the
--   Mosslight spawn-row gap 2027-02-10-drop-bounds fixed) is raised inside the first
--   member's half (hr_hunt_apply_instance `v_cur`), so 2027-01-22-party-settle-
--   isolation §3 counted it on that SEAT: the seats forfeited one at a time, six
--   fires each, and no window in between paid anyone (the commit is all-or-nothing).
--
-- ── THE FIX (the contract) ──────────────────────────────────────────────────
-- §1 hr_hunt_enter_for RESTATED WHOLE (from 2027-01-19-play-cap.sql, every other line
--    kept): the restart UPDATE also sets density = null, refusals = 0. The session it
--    opens next fires hr_hunt_density_freeze, which freezes the leader's pick for THIS
--    ground (hr_hunt_density_pick); a member who joins an open hunt keeps the frozen
--    value. The engine reads it through hr_hunt_instance_read (unchanged).
-- §2 hr_hunt_density_freeze RESTATED (from 2026-11-17-hunt-density-home.sql): body
--    unchanged, its comment no longer says "nothing writes it again".
-- §3 hr_hunt_settle_refused RESTATED WHOLE (from 2027-01-22-party-settle-isolation.sql):
--    a WORLD code is counted on the INSTANCE even when the answer names a member, is
--    recorded on that member, and the sixth in a row ends EVERY open seat at once
--    through hr_hunt_forfeit (each `server`, or `left` if its Leave was pending; the
--    same code; the same boundary, the instance's last accepted one; one window_forfeit
--    row each, gold 0). Every other code naming a member stays that seat's, unchanged.
--    THE WORLD CODES (every refusal hr_hunt_apply_member raises, read 2026-10-30 from the
--    live bodies; a world code reads only the ground catalogue, the instance's frozen
--    density and the engine's own output, never a state its member can move):
--      catalogue_missing  a hr_hunt_limits / hr_hunt_lanes / stamina-cap row is absent
--      kills_over         the engine's kills vs the ground's pass x respawns
--      no_ground          the session's ground has no hr_hunt_grounds row
--      value_over         gold / XP / Level XP / an item vs the ground's kill bounds
--    PER SEAT (the member's own state or its own engine half): cover_over, cover_unspent,
--    not_coverable, item_locked, store_off, not_for_sale, gold_short, too_many_buys,
--    too_many_uses, stamina_ahead, bad_stamina, bad_clock, end_missing, death_xp_over,
--    session_moved, no_hunt, no_character, the bad_* shapes, and every hr_apply code
--    (daily_budget, *_clamp, bank_full, unknown_*). An UNKNOWN code is a seat's: it
--    fails toward isolation.
-- §4 grants (nothing new; every body owner-only); §5 the executed self-check.
--
-- ── DESIGN RULING (Coordinator 2026-10-30, per Tyler 2026-10-22: the box "sends home
--    every member ... for any reason") ─────────────────────────────────────────
-- An instance-level forfeit ends the hunt for EVERY seat: the world itself is refused,
-- so there is no one left to hunt it. This does not contradict 2027-01-22-party-settle-
-- isolation's intent, which is that ONE member's OWN failure must not end the others
-- (Security threat #7): a world code cannot be produced by a member's state, so it
-- gives a griefer nothing; own-state codes still end only their seat, and still send
-- nobody home. Recorded resolved in .claude/coordination/CONFLICTS.md.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- No new lock, no new order, no new verb. §1's UPDATE runs where it ran: under the party
-- row lock, the character lock and the instance row lock (`for update`) hr_hunt_enter_for
-- already takes, and only when no session of the instance is open, so no settle can be
-- reading the instance (the settle holds the same row lock). The freeze trigger fires in
-- the same transaction, on the session row it inserts, so no reader ever sees the null.
-- §3 runs inside hr_hunt_apply_instance's transaction under the instance lock and every
-- member's character lock, as before; hr_hunt_forfeit re-takes them (re-entrant). Intent
-- keys and replays are untouched.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- §1 shrinks it: the bound (hr_hunt_apply_member's v_dmax) and the engine now read the
-- leader's pick for the ground actually hunted, never an older, larger one (ca19cf1e's
-- 12 sat above Wickstead's ceiling of 8, widening its kill bound). §3: a world forfeit
-- ends partners' hunts, unpaid for the refused window (it was never payable). A member
-- cannot produce a world code by its own actions: catalogue rows are server-only, the
-- density is frozen by the server, and kills / gold / items are the engine's output.
-- FOR THE EA REVIEW: value_over's XP bound also reads the member's OWN max mana
-- (hr_vitals_of: Level, gear, Inner Flame); confirm no mid-hunt action can lower it
-- between the edge's read and the commit (if one can, move what='xp' to per seat).
-- No new client grant, RPC or policy.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply 2027-01-19-play-cap.sql §5's hr_hunt_enter_for, 2026-11-17's
-- hr_hunt_density_freeze and 2027-01-22's hr_hunt_settle_refused (their pins accept
-- their own images only, so run those three statements by hand). No column, row or
-- player value is touched either way; an instance restarted under this file keeps the
-- density it froze (the right one) until its next restart.
-- ORDER: after 2027-02-10-drop-bounds-hunt-sessions-catalogue.generated.sql. No
-- begin/commit. No cron.* write.
-- COST (100x players): none per tick. A party start writes the same one instance row;
-- a world refusal writes the instance row instead of a seat row; a world forfeit writes
-- one window_forfeit row per seat (as a last-seat forfeit did). Zero new tables/rows.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ───────────────────────────────────────────
do $mig$
declare r record; v_md5 text;
begin
  if to_regprocedure('public.hr_hunt_forfeit(uuid,text,jsonb)') is null
     or to_regprocedure('public.hr_hunt_forfeit_seat(uuid,uuid,text,jsonb,integer)') is null
     or to_regprocedure('public.hr_hunt_density_pick(uuid,uuid,integer)') is null
     or to_regprocedure('public.hr_play_lock_for(uuid)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hunt_sessions' and column_name = 'refusals')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hunt_instances' and column_name = 'density') then
    raise exception 'PRECONDITION: the party-isolation (2027-01-22) and play-cap (2027-01-19) chain is absent'; end if;
  -- Each body is the live image (measured read-only 2026-10-30, equal to the replay chain's) or this file's own
  -- post-image (a second apply); anything else moved it, and this file is re-derived.
  for r in select * from (values
    ('public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)', '672f2c82323d65517061f800cd6a67e0', 'dc7e7616c6c4edc5a50da6c518625c08', '2027-01-19-play-cap.sql'),
    ('public.hr_hunt_density_freeze()', 'c8bd3772001b273ae2baa3ac36dac5da', 'ac085d75ed88706dd372928c197b0125', '2026-11-17-hunt-density-home.sql'),
    ('public.hr_hunt_settle_refused(uuid,bigint,jsonb,jsonb)', '6febe1260afd4997a805cc18fd17c230', 'a2eb50c33d0db665d7f31584c33a1668', '2027-01-22-party-settle-isolation.sql')
  ) p(sig, pre, post, src) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(r.sig);
    if v_md5 is null then raise exception 'PIN: % is missing', r.sig; end if;
    if v_md5 is distinct from r.pre and v_md5 is distinct from r.post then
      raise exception 'PIN: % is neither %''s image (%) nor this file''s (%) - md5 %: another file moved it; re-derive',
        r.sig, r.src, left(r.pre, 8), left(r.post, 8), v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE RESTART STARTS EVERY PER-HUNT COLUMN OVER (#60) ──────────────────
create or replace function public.hr_hunt_enter_for(p_uid uuid, p_slot integer, p_hunt text, p_bag jsonb, p_preset integer, p_hours integer)
returns jsonb language plpgsql
set search_path = public, pg_catalog as $function$
declare
  -- PARTY-FLOW (2026-10-28-party-flow.sql): a ground-less party matches no hunt; a restarted instance takes the new ground.
  -- TOWN-YIELDS (2026-10-30-town-activity-yields.sql): a town activity yields to the hunt instead of refusing it.
  -- SETUP-PER-GROUND (2026-12-05-hunt-setup-per-ground.sql): the locks first, then ONE predicate
  -- (hr_hunt_enter_check, the party view's seat readiness asks the same), and nothing is written before it answers;
  -- the set the session opened on is remembered for the ground (hunt_density.preset).
  -- PLAY-CAP (2027-01-19-play-cap.sql): the account's and the network's play locks before the predicate, then the cap
  -- (hr_play_refusal) on a hero not playing yet; the pointer's trigger (hr_play_cap_guard) stamps its network.
  -- PARTY-INSTANCE-RESET (2027-02-10-party-instance-reset.sql): a restarted party instance starts every per-hunt column
  -- over (#60), its density and its strike count included.
  v_uid  uuid := p_uid;
  v_r    jsonb;
  v_st   public.player_state%rowtype;
  v_line jsonb; v_item text; v_qty bigint; v_ess boolean;
  v_id uuid;
  v_party uuid; v_p public.hunt_parties%rowtype; v_seat int := 0;
  v_i    public.hunt_instances%rowtype;
  v_from timestamptz; v_tick bigint;
  v_net  bytea;
begin
  if v_uid is null or p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_bag is null then p_bag := '[]'::jsonb; end if;

  -- THE LOCKS (order: the party row, the character, the bag's stock rows), then the one predicate.
  v_party := public.hr_hunt_party_of(v_uid, p_slot);
  if v_party is not null then
    select * into v_p from public.hunt_parties where id = v_party for update;
    select m.seat into v_seat from public.hunt_party_members m where m.party_id = v_party and m.user_id = v_uid and m.slot = p_slot;
  end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if jsonb_typeof(p_bag) = 'array' then
    perform 1 from public.player_inventory pi
     where pi.user_id = v_uid and pi.slot = p_slot
       and pi.item_id in (select l->>'item' from jsonb_array_elements(p_bag) l where jsonb_typeof(l) = 'object')
     order by pi.item_id for update;
  end if;
  -- THE PLAY CAP'S LOCKS (2027-01-19-play-cap.sql): the account's, then its network's (hr_play_lock_for), after the
  -- character's and before any count is read, so a second start on this account or this network waits here until
  -- this one commits, then counts it.
  v_net := public.hr_play_lock_for(v_uid);
  v_r := public.hr_hunt_enter_check(v_uid, p_slot, p_hunt, p_bag, p_preset, p_hours);
  if v_r is not null then return v_r; end if;
  -- THE PLAY CAP (Tyler 2026-10-17: "Up to 4 characters can play AT ONCE, free. A 4-per-hashed-IP concurrent cap is
  -- mandatory"): a hero not playing yet enters only beside fewer than the cap other playing heroes of its account and
  -- of its network. One already playing (a town activity, which yields below) adds nobody and is never refused here.
  if not public.hr_playing(v_uid, p_slot) then
    v_r := public.hr_play_refusal(v_uid, p_slot, v_net);
    if v_r is not null then return v_r; end if;
  end if;
  select * into v_st from public.player_state where user_id = v_uid and slot = p_slot;

  -- A TOWN ACTIVITY YIELDS TO THE HUNT (live v0.2.11): gathering, an artisan run or training stops here and the
  -- hunt pointer replaces it (hr_hunt_point below); it is journalled with the instant it was last settled to.
  if v_st.active_kind in ('gather', 'artisan', 'training') then
    insert into public.player_ledger (user_id, slot, kind, intent, meta)
      values (v_uid, p_slot, 'hunt', 'activity_yield',
              jsonb_build_object('kind', v_st.active_kind, 'id', v_st.active_id, 'settled_to', v_st.accrued_to, 'hunt', p_hunt));
  end if;

  -- THE ARRIVAL: after the walk; a party member's on the instance's boundaries.
  -- NEVER BEFORE THE STAMINA STAMP (2026-10-28): the last session's settle may have
  -- run to the swing boundary just past its leave (stamina_at = that window's end),
  -- and with no walk (travel_s 0) a hunt entered within that swing would open BEHIND
  -- it: every settle of it would refuse stamina_ahead, forever.
  v_from := greatest(date_trunc('milliseconds', now() + make_interval(secs => (select travel_s from public.hr_hunt_travel where hunt_id = p_hunt))),
                     v_st.stamina_at);
  if v_party is not null then
    v_tick := public.hr_hunt_limit('swing_interval_ms');
    select * into v_i from public.hunt_instances where id = v_party for update;
    if not found then
      insert into public.hunt_instances (id, hunt_id, kind, settled_to, next_swing_at)
        values (v_party, p_hunt, 'party', v_from, v_from);
    elsif not exists (select 1 from public.hunt_sessions h where h.instance_id = v_party and h.ended_at is null) then
      -- No open session: the instance restarts its clock here, on the party's ground of this start, with
      -- no world (the swing counter and the version keep counting forward). PARTY-INSTANCE-RESET: every per-hunt
      -- column starts over with it: no density (the session opened below fires hr_hunt_density_freeze, which freezes
      -- the leader's pick for THIS ground) and no strikes (a dead hunt's refusals never shorten this one's fuse).
      update public.hunt_instances set hunt_id = p_hunt, world = null, settled_to = v_from, next_swing_at = v_from,
                                       density = null, refusals = 0, version = version + 1
       where id = v_party;
    else
      v_from := v_i.next_swing_at + make_interval(secs => ceil(greatest(0, extract(epoch from (v_from - v_i.next_swing_at)) * 1000)
                                                               / v_tick) * v_tick / 1000.0);
    end if;
  end if;
  v_id := public.hr_hunt_open_session(v_uid, p_slot, p_hunt, null, p_preset, p_hours, v_party, v_from, coalesce(v_seat, 0));
  for v_line in select value from jsonb_array_elements(p_bag) loop
    v_item := v_line->>'item'; v_qty := (v_line->>'qty')::bigint;
    v_ess := coalesce((v_line->>'essential')::boolean, (select essential from public.hr_hunt_supplies where item_id = v_item));
    update public.player_inventory set qty = qty - v_qty
     where user_id = v_uid and slot = p_slot and item_id = v_item and qty > v_qty;
    if not found then
      delete from public.player_inventory where user_id = v_uid and slot = p_slot and item_id = v_item and qty = v_qty;
      -- The stock was proved under its row lock: a line that matches neither is a broken invariant, never a free load.
      if not found then raise exception 'hr_hunt_enter_for: the stock of % moved under its lock', v_item; end if;
    end if;
    insert into public.hunt_bag (session_id, user_id, slot, item_id, qty_loaded, qty_left, essential)
      values (v_id, v_uid, p_slot, v_item, v_qty, v_qty, v_ess);
    perform public.hr_hunt_ledger_pair(v_uid, p_slot, null, v_id, v_item, v_qty, 'hunt_pack');
  end loop;
  perform public.hr_hunt_point(v_uid, p_slot, p_hunt);
  update public.hunt_sessions set version = version + 1 where id = v_id;
  -- THE SETUP THIS GROUND WAS ENTERED ON (A #2): the set the session opened on, beside the ground's density pick.
  insert into public.hunt_density as d (user_id, slot, hunt_id, density, preset, updated_at)
    values (v_uid, p_slot, p_hunt, 0, (select h.preset from public.hunt_sessions h where h.id = v_id), now())
    on conflict (user_id, slot, hunt_id) do update set preset = excluded.preset, updated_at = now();

  -- THE FLOOR IS A WARNING (Tyler 2026-10-18; 2026-10-25-hunt-floor-warning.sql): admitted under
  -- band[0] within the margin, the answer says so and the picker warns.
  return jsonb_build_object('ok', true, 'session_id', v_id, 'session', public.hr_hunt_view(v_id),
                            'version', (select version from public.player_state where user_id = v_uid and slot = p_slot),
                            'below_range', public.hr_hunt_below_range(v_uid, p_slot, p_hunt));
end $function$;

-- ── §2 THE FREEZE, ONCE PER HUNT ────────────────────────────────────────────
create or replace function public.hr_hunt_density_freeze()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  -- DENSITY-HOME (2026-11-17-hunt-density-home.sql): the instance's first session writes its density.
  -- PARTY-INSTANCE-RESET (2027-02-10-party-instance-reset.sql): the first session OF EACH HUNT. A party instance's
  -- restart (hr_hunt_enter_for) clears it, so the party's next hunt freezes the leader's pick for its own ground; a
  -- member who joins an open hunt keeps the frozen value. Nothing else writes it.
  update public.hunt_instances
     set density = public.hr_hunt_density_pick(new.instance_id, new.user_id, new.slot)
   where id = new.instance_id and density is null;
  return null;
end $$;

-- ── §3 A REFUSAL THE WORLD CAUSES IS THE INSTANCE'S (#73) ───────────────────
create or replace function public.hr_hunt_settle_refused(p_instance uuid, p_world_from bigint, p_first jsonb, p_answer jsonb)
returns jsonb language plpgsql set search_path = public, pg_catalog as $$
declare
  -- A fuse, not a balance figure: a lost race never repeats six times; a window
  -- the bounds refuse does, every fire (the engine is deterministic).
  c_forfeit_after constant int := 6;
  -- PARTY-INSTANCE-RESET (2027-02-10-party-instance-reset.sql): the refusals the SHARED world causes. Each reads only
  -- the ground's catalogue, the instance's frozen density and the engine's own output, never a state a member can
  -- move, so the member whose half trips it first is not its cause: every member's half would trip it in turn.
  c_world constant text[] := array['catalogue_missing', 'kills_over', 'no_ground', 'value_over'];
  v_n int;
  v_ans jsonb := coalesce(p_answer, '{}'::jsonb) - 'member';
  v_who jsonb := p_first;
  v_mid uuid;
  v_seat public.hunt_sessions%rowtype;
  v_forfeit jsonb;
begin
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql).
  -- PARTY-ISOLATION (2027-01-22-party-settle-isolation.sql): an answer naming the MEMBER whose own half raised it (set
  -- only by hr_hunt_apply_instance) is counted on that open seat of this instance, never on the instance, so one
  -- member's own state can never end another hero's hunt; the sixth in a row ends that seat alone, or the instance
  -- when it is the last one hunting. An answer naming none is the instance's, counted as before.
  -- PARTY-INSTANCE-RESET (2027-02-10-party-instance-reset.sql, #73): a WORLD code (c_world) is the instance's even when
  -- it names a member: counted on the instance, recorded on the member whose half tripped it, and the sixth in a row
  -- ends EVERY open seat at once (hr_hunt_forfeit: the same code at the same boundary; the world itself is refused, so
  -- nobody is left to hunt it). Any other code naming a member stays that seat's; an unknown one too (toward isolation).
  if jsonb_typeof(p_answer->'member') = 'object'
     and coalesce(p_answer->'member'->>'session', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_mid := (p_answer->'member'->>'session')::uuid;
    if coalesce(p_answer->>'error', '') = any (c_world) then
      select jsonb_build_object('user', h.user_id, 'slot', h.slot) into v_who
        from public.hunt_sessions h where h.id = v_mid and h.instance_id = p_instance and h.ended_at is null;
      v_who := coalesce(v_who, p_first);
    else
      update public.hunt_sessions set refusals = refusals + 1
       where id = v_mid and instance_id = p_instance and ended_at is null
      returning * into v_seat;
    end if;
  end if;
  if v_seat.id is not null then
    v_n := v_seat.refusals;
    v_who := jsonb_build_object('user', v_seat.user_id, 'slot', v_seat.slot);
    v_ans := v_ans || jsonb_build_object('seat', v_seat.seat);
  else
    update public.hunt_instances set refusals = refusals + 1 where id = p_instance returning refusals into v_n;
    if v_n is null then return v_ans; end if;
  end if;
  if coalesce(v_who->>'user', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and coalesce(v_who->>'slot', '') ~ '^[0-9]{1,2}$' then
    perform public.hr_record_rejection((v_who->>'user')::uuid, (v_who->>'slot')::int, 'hunt_settle',
      coalesce(v_ans->>'error', 'apply_failed'),
      jsonb_build_object('instance', p_instance, 'world_swing', p_world_from, 'refusals', v_n,
                         'counted', case when v_seat.id is null then 'instance' else 'seat' end, 'detail', v_ans->'detail'), 1);
  end if;
  if v_n >= c_forfeit_after then
    if v_seat.id is not null and exists (select 1 from public.hunt_sessions h
                                          where h.instance_id = p_instance and h.ended_at is null and h.id <> v_seat.id) then
      v_forfeit := public.hr_hunt_forfeit_seat(p_instance, v_seat.id, v_ans->>'error', v_ans->'detail', v_n);
      update public.hunt_instances set version = version + 1 where id = p_instance;
    else
      v_forfeit := public.hr_hunt_forfeit(p_instance, v_ans->>'error', v_ans->'detail');
    end if;
    return v_ans || jsonb_build_object('refusals', v_n, 'forfeit', v_forfeit);
  end if;
  return v_ans || jsonb_build_object('refusals', v_n);
end $$;

-- ── §4 GRANTS: revoke-then-grant; nothing reaches a client or the engine ────
do $grants$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)', 'public.hr_hunt_density_freeze()',
                               'public.hr_hunt_settle_refused(uuid,bigint,jsonb,jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then
        execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
end $grants$;

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
-- Fails on the pre-images: (b) the old restart keeps density 3 and the dead hunt's strikes; (c) the old count puts a
-- world code on member A's seat, so its sixth ends A alone and B hunts on. The engine-level races, both doors (the tick
-- = browser closed, the player's settle = hunt viewed), are tests/hunt-sessions-settle.mjs PARTY-WORLD and
-- tests/party-flow.mjs PF-RESTART (the real party Start, twice).
do $$
declare
  c_a    constant uuid := '000000d7-0000-4000-a000-0000a1050001';   -- the leader (first in (user, slot) order)
  c_b    constant uuid := '000000d7-0000-4000-a000-0000a1050002';   -- its partner
  -- THE CLASS: every hunt_instances column, classified. A new column fails here until this file (or its successor)
  -- says whether a party's restart resets it.
  c_reset constant text[] := array['density', 'hunt_id', 'next_swing_at', 'refusals', 'settled_to', 'world'];
  c_kept  constant text[] := array['created_at', 'id', 'kind', 'version', 'world_swing'];
  v      jsonb;
  v_sig  text;
  v_hunt text;
  v_pick int;
  v_pid  uuid;
  v_sa   uuid; v_sb uuid;
  v_at   timestamptz;
  v_ws   bigint;
  v_cols text[];
  i      int;
begin
  -- (a) THE SHAPE: each body is this file's image, owner-only; the restart names every reset column; every column of
  --     hunt_instances is classified.
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)'::regprocedure) <> 'dc7e7616c6c4edc5a50da6c518625c08'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_density_freeze()'::regprocedure) <> 'ac085d75ed88706dd372928c197b0125'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_settle_refused(uuid,bigint,jsonb,jsonb)'::regprocedure) <> 'a2eb50c33d0db665d7f31584c33a1668' then
    raise exception 'party-instance-reset §5(a): a body is not this file''s image'; end if;
  foreach v_sig in array array['hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)', 'hr_hunt_density_freeze()',
                               'hr_hunt_settle_refused(uuid,bigint,jsonb,jsonb)'] loop
    if has_function_privilege('anon', ('public.' || v_sig)::regprocedure, 'execute')
       or has_function_privilege('authenticated', ('public.' || v_sig)::regprocedure, 'execute')
       or has_function_privilege('service_role', ('public.' || v_sig)::regprocedure, 'execute')
       or (exists (select 1 from pg_roles where rolname = 'hr_engine') and has_function_privilege('hr_engine', ('public.' || v_sig)::regprocedure, 'execute'))
       or (exists (select 1 from pg_roles where rolname = 'hr_tick') and has_function_privilege('hr_tick', ('public.' || v_sig)::regprocedure, 'execute'))
       or exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                   where p.oid = ('public.' || v_sig)::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'party-instance-reset §5(a): % is reachable by a client or the engine', v_sig; end if;
  end loop;
  select array_agg(column_name::text order by column_name) into v_cols
    from information_schema.columns where table_schema = 'public' and table_name = 'hunt_instances';
  if v_cols is distinct from (select array_agg(c order by c) from unnest(c_reset || c_kept) c) then
    raise exception 'party-instance-reset §5(a): hunt_instances has columns % - classify each as reset at a party''s restart or kept', v_cols; end if;

  begin
    -- THE PROBE: two admitted heroes in one party, hunts on, the lowest ground; the leader picks 3 there.
    update public.hr_hunt_config set enabled = true where id;
    select g.hunt_id into v_hunt from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id
     order by coalesce(h.band_min, 0), g.hunt_id limit 1;
    select least(coalesce(public.hr_hunt_limit('density_max'), 0)::int, coalesce((select max(m) from unnest(g.density_max) m), 0), 8)
      into v_pick from public.hr_hunt_grounds g where g.hunt_id = v_hunt;
    if v_hunt is null or coalesce(v_pick, 0) < 4 then
      raise exception 'party-instance-reset §5-harness: no ground, or its density ceiling % is under 4', v_pick; end if;
    foreach v_sig in array array[c_a::text, c_b::text] loop
      insert into auth.users (id) values (v_sig::uuid) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_sig::uuid, 'party-instance-reset §5 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_sig, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'party-instance-reset §5-harness: hr_create_character refused: %', v; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', '', true);
    v_pid := public.hr_party_open(c_a, 0);
    perform public.hr_party_seat_into(v_pid, c_b, 0);
    update public.hunt_parties set hunt_id = v_hunt where id = v_pid;
    insert into public.hunt_density (user_id, slot, hunt_id, density, updated_at) values (c_a, 0, v_hunt, 3, now())
      on conflict (user_id, slot, hunt_id) do update set density = excluded.density;

    -- (b) #60: THE FIRST HUNT freezes the leader's 3; a member joining the open hunt keeps it even after the pick moves.
    v := public.hr_hunt_enter_for(c_a, 0, v_hunt, '[]'::jsonb, 0, null);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-instance-reset §5-harness: the leader''s first start refused: %', v; end if;
    v_sa := (v->>'session_id')::uuid;
    insert into public.hunt_density (user_id, slot, hunt_id, density, updated_at) values (c_a, 0, v_hunt, v_pick, now())
      on conflict (user_id, slot, hunt_id) do update set density = excluded.density;
    v := public.hr_hunt_enter_for(c_b, 0, v_hunt, '[]'::jsonb, 0, null);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-instance-reset §5-harness: the member''s first start refused: %', v; end if;
    v_sb := (v->>'session_id')::uuid;
    if (select density from public.hunt_instances where id = v_pid) is distinct from 3
       or (select count(*) from public.hunt_sessions where instance_id = v_pid and ended_at is null) <> 2 then
      raise exception 'party-instance-reset §5(b): the first hunt froze density % for % seats, want 3 for 2',
        (select density from public.hunt_instances where id = v_pid),
        (select count(*) from public.hunt_sessions where instance_id = v_pid and ended_at is null); end if;
    -- The hunt ends with strikes on the instance (a refused window, then Leave); the leader now picks v_pick.
    update public.hunt_instances set refusals = 4 where id = v_pid;
    perform public.hr_hunt_close(v_sa, 'left', now(), true);
    perform public.hr_hunt_close(v_sb, 'left', now(), true);
    update public.player_state set active_kind = 'idle', active_id = null where user_id in (c_a, c_b) and slot = 0;
    select world_swing into v_ws from public.hunt_instances where id = v_pid;
    -- THE RESTART: the same instance, a new hunt.
    v := public.hr_hunt_enter_for(c_a, 0, v_hunt, '[]'::jsonb, 0, null);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-instance-reset §5-harness: the leader''s restart refused: %', v; end if;
    v_sa := (v->>'session_id')::uuid;
    v := public.hr_hunt_enter_for(c_b, 0, v_hunt, '[]'::jsonb, 0, null);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-instance-reset §5-harness: the member''s restart refused: %', v; end if;
    v_sb := (v->>'session_id')::uuid;
    if (select density from public.hunt_instances where id = v_pid) is distinct from v_pick
       or (select refusals from public.hunt_instances where id = v_pid) <> 0
       or (select world from public.hunt_instances where id = v_pid) is not null
       or (select world_swing from public.hunt_instances where id = v_pid) is distinct from v_ws
       or (select hunt_id from public.hunt_instances where id = v_pid) is distinct from v_hunt then
      raise exception 'party-instance-reset §5(b): the restarted instance holds % (want density %, refusals 0, no world, swing %)',
        (select jsonb_build_object('density', density, 'refusals', refusals, 'world', world is not null, 'world_swing', world_swing)
           from public.hunt_instances where id = v_pid), v_pick, v_ws; end if;

    -- (c) #73: A WORLD CODE named on A, six in a row: counted on the instance, never on a seat; the sixth ends BOTH
    --     at the instance's last accepted boundary, the same reason, one window_forfeit row each.
    select settled_to, world_swing into v_at, v_ws from public.hunt_instances where id = v_pid;
    for i in 1 .. 6 loop
      v := public.hr_hunt_settle_refused(v_pid, v_ws, jsonb_build_object('user', c_a, 'slot', 0),
             jsonb_build_object('ok', false, 'error', 'value_over', 'detail', jsonb_build_object('what', 'item'),
                                'member', jsonb_build_object('user', c_a, 'slot', 0, 'session', v_sa)));
      if (v->>'refusals')::int is distinct from i or v ? 'seat' or v ? 'member' or (i < 6 and v ? 'forfeit')
         or exists (select 1 from public.hunt_sessions where id in (v_sa, v_sb) and refusals <> 0) then
        raise exception 'party-instance-reset §5(c): world refusal % answered % (seats %)', i, v,
          (select jsonb_agg(refusals) from public.hunt_sessions where id in (v_sa, v_sb)); end if;
    end loop;
    if (v->'forfeit'->>'sessions')::int is distinct from 2
       or (select count(*) from public.hunt_sessions where id in (v_sa, v_sb)
            and ended_at = v_at and end_reason = 'server' and forfeit) <> 2
       or (select count(*) from public.player_ledger where session_id in (v_sa, v_sb) and kind = 'hunt' and intent = 'window_forfeit'
            and coalesce(gold, 0) = 0 and meta->>'code' = 'value_over' and (meta->>'refusals')::int = 6) <> 2
       or (select count(distinct session_id) from public.player_ledger where session_id in (v_sa, v_sb) and intent = 'window_forfeit') <> 2
       or (select refusals from public.hunt_instances where id = v_pid) <> 0 then
      raise exception 'party-instance-reset §5(c): the sixth world refusal did not end every seat at once: % / %', v,
        (select jsonb_agg(jsonb_build_object('end', end_reason, 'at', ended_at, 'forfeit', forfeit)) from public.hunt_sessions where id in (v_sa, v_sb)); end if;

    -- (d) AN OWN-STATE CODE stays the seat's (2027-01-22 unchanged): the party starts again (a restart: strikes 0),
    --     A's cover_over six times ends A alone; B hunts on; the instance is never charged.
    update public.player_state set active_kind = 'idle', active_id = null where user_id in (c_a, c_b) and slot = 0;
    v := public.hr_hunt_enter_for(c_a, 0, v_hunt, '[]'::jsonb, 0, null);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-instance-reset §5-harness: the third start refused: %', v; end if;
    v_sa := (v->>'session_id')::uuid;
    v := public.hr_hunt_enter_for(c_b, 0, v_hunt, '[]'::jsonb, 0, null);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-instance-reset §5-harness: the third member start refused: %', v; end if;
    v_sb := (v->>'session_id')::uuid;
    for i in 1 .. 6 loop
      v := public.hr_hunt_settle_refused(v_pid, v_ws, jsonb_build_object('user', c_a, 'slot', 0),
             jsonb_build_object('ok', false, 'error', 'cover_over', 'member', jsonb_build_object('user', c_a, 'slot', 0, 'session', v_sa)));
      if (v->>'refusals')::int is distinct from i or (v->>'seat')::int is distinct from 0
         or (select refusals from public.hunt_instances where id = v_pid) <> 0 then
        raise exception 'party-instance-reset §5(d): own-state refusal % answered % (instance %)', i, v,
          (select refusals from public.hunt_instances where id = v_pid); end if;
    end loop;
    if (v->'forfeit'->>'sessions')::int is distinct from 1
       or (select forfeit from public.hunt_sessions where id = v_sa) is distinct from true
       or (select ended_at from public.hunt_sessions where id = v_sb) is not null
       or (select refusals from public.hunt_sessions where id = v_sb) <> 0 then
      raise exception 'party-instance-reset §5(d): the own-state forfeit reached the partner or missed the culprit: %', v; end if;

    raise exception 'party-instance-reset §5: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'party-instance-reset §5: ok' then raise; end if;
  end;
end $$;
