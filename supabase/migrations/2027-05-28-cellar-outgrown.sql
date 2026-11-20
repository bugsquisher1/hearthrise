-- ════════════════════════════════════════════════════════════════════════
-- 2027-05-28-cellar-outgrown.sql — THE MILL CELLAR ENDS ITS HUNT AT LEVEL 5: THE DOOR REFUSES A HERO WHO HAS OUTGROWN A GROUND, AND THE
--   SETTLE PROVES THE END (lane/d-first-day-path, systems-engineer, 2026-11-19; the board's 2026-11-19 complete balance look, change 1:
--   on three of seven real accounts a first-day hero sat in the Mill Cellar 6 to 12 hours past it at a flat ~10k Level XP an hour).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA (CLAUDE.md §2):
--   applies on its passing §4. ON THE EA SECURITY LIST with the hunt doors: this file only narrows who enters, and adds an end that stops value.
-- ORDER: right AFTER 2027-05-28-cellar-outgrown-hunt-sessions-catalogue.generated.sql (END_ORDER's outgrown in hr_hunt_end_reasons and the
--   end_reason CHECK, hr_hunt_grounds.ends_at_level); §0 refuses without it.
--
-- ── THE NUMBER IS DATA (never a literal in a body here) ─────────────────────
-- src/data/hunt-grounds.js endsAtLevel (the Mill Cellar's 5, the Meadowbrook Thicket's floor) -> hr_hunt_grounds.ends_at_level
--   (tools/gen-hunt-sessions.mjs). A ground with none (every other one today) is untouched by every line below.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- The ENGINE decides the end (src/core/action-rules.js `outgrown`: the hero's Level, read off its Level XP at every boundary, at or over the
--   ground's endsAtLevel; src/core/combat-sim.js; one path, viewed or with the browser closed, the same boundary however the windows are cut).
--   A SCALED window (src/data/scaled-hunts.js: the ground played at its leader's Level) never ends this way.
-- hr_hunt_admit(p_user, p_slot, p_hunt) -> jsonb   ONE SPLICE (marker OUTGROWN), every other line verbatim: on a named ground, after its gate,
--   a hero whose Level (hr_level_of: player_state.level_xp, never a client value) stands at the ground's ends_at_level or over is refused
--   `outgrown` { hunt, level (the ground's ends_at_level) }, unless the hunt would play scaled (hr_hunt_scaled_at_door). It is THE door: every
--   way in asks it (hr_hunt_enter, hr_hunt_party_start, hr_hunt_restart, hr_hunt_change, a member's join, the party's ready line and listing).
-- hr_hunt_scaled_at_door(p_user, p_slot, p_hunt) -> int   NEW, owner-only: hr_scaled_hunt_of's rule (2027-03-21-scaled-hunts.sql) read at the
--   door, where no instance stands yet: the Level a hunt this seat enters would play at, scaled, or null. The leader is the seat's open party's,
--   else the seat; the scaled_hunts switch for the leader's account; the leader's banked hours on the ground with use on, at least a swing of
--   them; hr_scaled_level at the leader's Level (null under the ground's band top).
-- hr_hunt_settle_session(p_user, p_slot, p_session, p_delta) -> jsonb   ONE SPLICE (marker OUTGROWN) in its end proof: an `outgrown` end is
--   proven when the hero's Level stands at its ground's ends_at_level or over. hr_hunt_apply_member applies the window's Level XP (hr_apply)
--   before it calls this, so the Level read is the one the end was read at. Like `rule` and `no_fight`, the end can only stop value.
-- REFUSAL CODE (new): outgrown (src/data/refusal-words.js says it).
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- The door reads the Level under the caller's locks (hr_hunt_enter_for asks hr_hunt_enter_check after the character lock): a hero in town has
--   no settle running, so its Level cannot move under the read. The proof reads it inside the settle's own lock (hr_hunt_lock).
-- A second apply finds both post images (§0), splices nothing, restates the helper byte-identical, and §4 rolls back its probes.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- No new client verb, grant or write path. One door refuses MORE; one end is proven from the server's own Level. A forged `outgrown` end from
--   a compromised engine is refused unless the hero really stands at the Level, and even then only ends that hero's own hunt early.
--
-- ── COST (rows and bytes at 100x players) ────────────────────────────────────
-- No table, no row. Each door press: one hr_hunt_grounds primary-key read, and on a ground with ends_at_level one Level read (and at it or over,
--   the scale helper's party, switch and hours reads, a handful of primary-key lookups). Each settle that proposes `outgrown`: the same two reads.
--
-- EDGE: src/data/hunt-grounds.js and src/core/{action-rules,combat-sim}.js ride the hr-accrue bundle, so pack-edge --hash moves. Either order is
--   safe: an engine without the end proposes none (and the door refuses an outgrown hero anyway); an engine with it before this file's catalogue
--   is refused bad_end, so deploy the edge AFTER both files.
-- CLIENT: the Hunts list (src/shell/hunt-list.js: the band's top under endsAtLevel, never advised once outgrown), the end card's label and its
--   next ground press (src/hunt-view/summary-model.js, src/shell/back-in-town.js), the refusal's words. Until it ships, an old client's Enter
--   reads the refusal's general line; the server still refuses.
-- GUARDS: tests/cellar-outgrown.mjs (CO-DOOR, CO-PROOF, CO-SCALED, CO-IDEM on the replayed chain; CO-ENGINE both paths), tests/hunt-live.mjs
--   LV-OUTGROWN (the hunt viewed and with the browser closed).
-- REVERSIBLE: re-apply hr_hunt_admit from 2027-04-24-tower-climb.sql §4 and hr_hunt_settle_session through its §0 pin (0459c931, this file's
--   pre image) by removing the two spliced blocks; drop hr_hunt_scaled_at_door. The column and the end reason are the catalogue's.
-- WIPE: nothing new to wipe.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- Each spliced body is the image this file was written against (the replayed chain's as of 2027-05-28-cellar-outgrown-hunt-sessions-catalogue,
-- = production after v0.2.141: tests/live-hash-drift.baseline.json hr_hunt_admit 9677c2ee, hr_hunt_settle_session 2bb207cc) or this file's
-- own (a second apply): md5 of prosrc with carriage returns removed.
do $mig$
declare v_r record; v_md5 text;
begin
  if not exists (select 1 from public.hr_hunt_end_reasons where reason = 'outgrown' and resumes)
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_hunt_grounds' and column_name = 'ends_at_level') then
    raise exception 'PRECONDITION: apply 2027-05-28-cellar-outgrown-hunt-sessions-catalogue.generated.sql first (END_ORDER''s outgrown, hr_hunt_grounds.ends_at_level)'; end if;
  if to_regclass('public.player_scaled_hours') is null or to_regclass('public.hr_scaled_grounds') is null or to_regclass('public.hunt_parties') is null
     or to_regprocedure('public.hr_level_of(uuid,integer)') is null or to_regprocedure('public.hr_hunt_party_of(uuid,integer)') is null
     or to_regprocedure('public.hr_feature_on(text,uuid)') is null or to_regprocedure('public.hr_scaled_level(text,integer)') is null
     or to_regprocedure('public.hr_hunt_limit(text)') is null then
    raise exception 'PRECONDITION: a table or helper this file reads is missing'; end if;
  for v_r in select * from (values
    ('public.hr_hunt_admit(uuid,integer,text)', 'dce4a82e373c6521eb1605fa898f8f4d', 'bc37e6068b6078f26f7e4e586efc4d48'),
    ('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)', '0459c9314a5e332de735f529c17f81d6', '7b6b3171349ee3896a1a380ce0cd0852')) t(fn, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(v_r.fn);
    if v_md5 is null then raise exception 'PIN: % is missing', v_r.fn; end if;
    -- (or, for hr_hunt_settle_session, a LATER staged file's image: 1005-lever-horizon.sql splices it after this one, so a retried
    --  apply of the staged tail meets that image here; the OUTGROWN splice is already in it and is skipped)
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post
       and not (v_r.fn = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)' and v_md5 = '6e3a7682baf3d6d14c32fac1e65df663') then
      raise exception 'PIN: % is neither the image this file splices (%) nor its own (%): md5 % - another file moved it; re-pin', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE SCALE AT THE DOOR ─────────────────────────────────────────────────
create or replace function public.hr_hunt_scaled_at_door(p_user uuid, p_slot int, p_hunt text)
returns int language plpgsql stable set search_path = public, pg_catalog as $fn$
-- CELLAR-OUTGROWN (2027-05-28-cellar-outgrown.sql): the Level a hunt this seat enters on p_hunt would play at, SCALED, or null. The rule is
-- hr_scaled_hunt_of's (2027-03-21-scaled-hunts.sql), read at the door, where no instance stands yet: the scale is the leader's (the seat's
-- open party's leader, else the seat itself), behind the scaled_hunts switch for the leader's account, from the leader's banked hours on the
-- ground with use on (at least a swing of them), at the Level hr_scaled_level gives the leader's Level (null under the ground's band top).
declare v_party uuid; v_lu uuid := p_user; v_ls int := p_slot;
begin
  if p_user is null or p_slot is null or not exists (select 1 from public.hr_scaled_grounds g where g.hunt_id = p_hunt) then return null; end if;
  v_party := public.hr_hunt_party_of(p_user, p_slot);
  if v_party is not null then
    v_lu := null;
    select p.leader_user, p.leader_slot into v_lu, v_ls from public.hunt_parties p where p.id = v_party and p.closed_at is null;
    if v_lu is null then return null; end if;
  end if;
  if not public.hr_feature_on('scaled_hunts', v_lu) then return null; end if;
  if not exists (select 1 from public.player_scaled_hours h
                  where h.user_id = v_lu and h.slot = v_ls and h.hunt_id = p_hunt and h.use_on
                    and h.banked_ms >= coalesce(public.hr_hunt_limit('swing_interval_ms'), 2000)) then return null; end if;
  return public.hr_scaled_level(p_hunt, public.hr_level_of(v_lu, v_ls));
end $fn$;
revoke execute on function public.hr_hunt_scaled_at_door(uuid, int, text) from public, anon, authenticated, service_role;

-- ── §2 THE DOOR (hr_hunt_admit, one splice; a second apply finds the post image) ─
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_admit(uuid,integer,text)'::regprocedure), chr(13), '');
  if strpos(v_def, 'OUTGROWN') = 0 then
    v_old := $a$      return jsonb_build_object('ok', false, 'error', sqlerrm, 'hunt', p_hunt);
    end;
    return null;
  end if;$a$;
    v_new := $a$      return jsonb_build_object('ok', false, 'error', sqlerrm, 'hunt', p_hunt);
    end;
    -- OUTGROWN (2027-05-28-cellar-outgrown.sql; the board's 2026-11-19 complete balance look, change 1): a ground whose hunt ends at a Level
    -- (hr_hunt_grounds.ends_at_level, hunt-grounds.js endsAtLevel: the Mill Cellar's 5) is refused to a hero already at it or over, unless
    -- the hunt would play scaled (hr_hunt_scaled_at_door: its leader's banked hours, at the leader's Level). The engine ends a hunt the
    -- moment its hero reaches the Level (END_ORDER's outgrown), so a hunt let in here would end at its first swing.
    if exists (select 1 from public.hr_hunt_grounds g
                where g.hunt_id = p_hunt and g.ends_at_level is not null and public.hr_level_of(p_user, p_slot) >= g.ends_at_level)
       and public.hr_hunt_scaled_at_door(p_user, p_slot, p_hunt) is null then
      return jsonb_build_object('ok', false, 'error', 'outgrown', 'hunt', p_hunt,
                                'level', (select g.ends_at_level from public.hr_hunt_grounds g where g.hunt_id = p_hunt));
    end if;
    return null;
  end if;$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_admit: OUTGROWN anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- ── §3 THE PROOF (hr_hunt_settle_session, one splice; a second apply finds the post image) ─
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'OUTGROWN') = 0 then
    v_old := $a$      -- RULE (lane action-engine): one of the hero's own stop rules held (src/core/hunt/conditions.js);$a$;
    v_new := $a$      -- OUTGROWN (2027-05-28-cellar-outgrown.sql): the hero's Level stands at its ground's ends_at_level or over (the engine reads it off
      -- the hero's Level XP at every boundary). hr_hunt_apply_member applied this window's Level XP before this call, so it is the Level the
      -- end was read at. It can only stop value, never mint it.
      when 'outgrown' then exists (select 1 from public.hr_hunt_grounds g
                                    where g.hunt_id = v_s.hunt_id and g.ends_at_level is not null
                                      and public.hr_level_of(p_user, p_slot) >= g.ends_at_level)
$a$ || v_old;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_settle_session: OUTGROWN anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- ── §4 THE SELF-CHECK, BY EXECUTING IT (rolled back) ─────────────────────────
-- One solo probe hero through the real verbs: (a) one Level under the ground's ends_at_level the door admits it and the hunt opens;
-- (b) a window ending `outgrown` one XP under that Level is refused end_not_proven and moves nothing; (c) at the Level the same window ends
-- the session `outgrown`, an automatic end; (d) back in town at the Level, the door refuses it `outgrown` naming the Level, signed in
-- through hr_hunt_enter too, and nothing opens; (e) past the ground's band top with banked scaled hours and the switch on, the door admits
-- it (the hunt plays scaled); with the hours switched off, refused again; (f) each splice once, both bodies §0's post pins; owner-only helper.
do $$
declare
  v_a constant uuid := '000000c0-0000-4000-a000-0000c0e10001';
  k   text := '000000c0-0000-4000-a000-0000';
  v jsonb; v_g text; v_lv int; v_top int; v_s uuid; v_at timestamptz; v_t bigint; v_role text;
begin
  begin
    execute $f$
      create function pg_temp.hr_co_settle(p_inst uuid, p_swings bigint, p_reason text) returns jsonb
      language plpgsql set search_path = public, pg_catalog as $b$
      -- One instance window of p_swings swings, as the engine proposes it: its one member, no kill, no XP, ending p_reason.
      declare v_i public.hunt_instances%rowtype; v_s public.hunt_sessions%rowtype; v_t bigint; v_to timestamptz;
              v_eat timestamptz; v_mto timestamptz; v_ver bigint; v_s0 bigint; v_e jsonb;
      begin
        perform set_config('request.jwt.claim.sub', '', true);
        select * into v_i from public.hunt_instances where id = p_inst;
        select * into v_s from public.hunt_sessions where instance_id = p_inst and ended_at is null;
        v_t := public.hr_hunt_limit('swing_interval_ms');
        v_eat := v_s.settled_to + make_interval(secs => p_swings * v_t / 1000.0);
        v_mto := v_eat + interval '1 millisecond';
        v_to := v_i.settled_to + make_interval(secs => p_swings * v_t / 1000.0);
        v_s0 := public.hr_stamina_of(v_s.user_id, v_s.slot, v_s.settled_to);
        select version into v_ver from public.player_state where user_id = v_s.user_id and slot = v_s.slot;
        execute 'set local role hr_engine';
        v_e := public.hr_hunt_apply_instance(p_inst, v_i.world_swing,
          jsonb_build_object('to', v_to, 'world_swing', v_i.world_swing + p_swings, 'world', null),
          jsonb_build_array(jsonb_build_object('user', v_s.user_id, 'slot', v_s.slot, 'session', v_s.id,
            'version', v_ver, 'intent', gen_random_uuid(),
            'delta', jsonb_build_object('accrued_to', v_mto, 'level_xp', 0,
              'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
                'meta', jsonb_build_object('ms', p_swings * v_t, 'ticks', p_swings, 'kills', 0, 'mon', v_s.hunt_id, 'from', v_s.settled_to, 'to', v_mto))),
            'hunt', jsonb_build_object('swing_from', v_s.swing_index, 'swing_to', v_s.swing_index + p_swings, 'to', v_mto,
              'next_swing_at', v_mto, 'uses', '{}'::jsonb, 'paid_ms', p_swings * v_t, 'raw_xp', '{}'::jsonb,
              'hints', jsonb_build_object('slot_dry', '{}'::jsonb, 'rare_drop', '[]'::jsonb, 'death', '[]'::jsonb),
              'ended', jsonb_build_object('reason', p_reason, 'at', v_eat), 'buys', '{}'::jsonb, 'cover', '{}'::jsonb,
              'stamina', greatest(0, v_s0 - p_swings * v_t), 'death_xp', '[]'::jsonb, 'unit_id', null, 'tick_ms', v_t),
            'analyzer', null)), null, null);
        execute 'reset role';
        return v_e;
      end $b$ $f$;
    select g.hunt_id, g.ends_at_level, h.band_max into v_g, v_lv, v_top
      from public.hr_hunt_grounds g join public.hr_hunts h using (hunt_id) where g.ends_at_level is not null order by g.hunt_id limit 1;
    if v_g is null then raise exception 'VERIFY CANNOT RUN: no hunt ground carries ends_at_level'; end if;
    update public.hr_hunt_config set enabled = true where id;
    v_t := public.hr_hunt_limit('swing_interval_ms');
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    insert into auth.users (id) values (v_a) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_a, 'Probe Outgrown') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_a, 'cellar-outgrown §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY: hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_a and slot = 0;
    insert into public.social_presence (user_id, slot, seen_at) values (v_a, 0, now()) on conflict (user_id) do update set seen_at = now();

    -- (a) ONE LEVEL UNDER: admitted, the hunt opens.
    update public.player_state set level_xp = public.hr_char_xp_for_level(v_lv - 1) where user_id = v_a and slot = 0;
    if public.hr_hunt_admit(v_a, 0, v_g) is not null then raise exception 'VERIFY(a): the door refuses Level % on %: %', v_lv - 1, v_g, public.hr_hunt_admit(v_a, 0, v_g); end if;
    v := public.hr_hunt_enter(0, v_g, '[]'::jsonb, 0, null, (k || 'c0e10100')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): the enter at Level % answered %', v_lv - 1, v; end if;
    select id into v_s from public.hunt_sessions where user_id = v_a and slot = 0 and ended_at is null;
    v_at := date_trunc('second', now() - interval '20 minutes');
    update public.hunt_sessions set entered_at = v_at - interval '1 minute', hunt_from = v_at, settled_to = v_at, next_swing_at = v_at where id = v_s;
    update public.hunt_instances set settled_to = v_at, next_swing_at = v_at
     where id = (select instance_id from public.hunt_sessions where id = v_s);

    -- (b) ONE XP UNDER THE LEVEL: the end is not proven, nothing moves.
    update public.player_state set level_xp = public.hr_char_xp_for_level(v_lv) - 1 where user_id = v_a and slot = 0;
    v := pg_temp.hr_co_settle((select instance_id from public.hunt_sessions where id = v_s), 30, 'outgrown');
    if v->>'error' is distinct from 'end_not_proven' or (select ended_at from public.hunt_sessions where id = v_s) is not null
       or (select settled_to from public.hunt_sessions where id = v_s) <> v_at then
      raise exception 'VERIFY(b): an outgrown end one XP under Level % answered %', v_lv, v; end if;

    -- (c) AT THE LEVEL: the session ends outgrown, an automatic end.
    update public.player_state set level_xp = public.hr_char_xp_for_level(v_lv) where user_id = v_a and slot = 0;
    v := pg_temp.hr_co_settle((select instance_id from public.hunt_sessions where id = v_s), 30, 'outgrown');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): the honest outgrown end answered %', v; end if;
    if (select end_reason from public.hunt_sessions where id = v_s) is distinct from 'outgrown'
       or (select ended_at from public.hunt_sessions where id = v_s) is distinct from v_at + make_interval(secs => 30 * v_t / 1000.0) then
      raise exception 'VERIFY(c): the session ended % at %', (select end_reason from public.hunt_sessions where id = v_s),
        (select ended_at from public.hunt_sessions where id = v_s); end if;

    -- (d) BACK IN TOWN AT THE LEVEL: the door refuses it, by both doors, naming the Level, and nothing opens.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_a and slot = 0;
    v := public.hr_hunt_admit(v_a, 0, v_g);
    if v->>'error' is distinct from 'outgrown' or (v->>'level')::int is distinct from v_lv or v->>'hunt' is distinct from v_g then
      raise exception 'VERIFY(d): the door at Level % on % answered %', v_lv, v_g, v; end if;
    delete from public.hr_rate_counters where user_id = v_a;   -- the probe's own counters: its two presses come in one instant
    v := public.hr_hunt_enter(0, v_g, '[]'::jsonb, 0, null, (k || 'c0e10200')::uuid);
    if v->>'error' is distinct from 'outgrown' or exists (select 1 from public.hunt_sessions where user_id = v_a and slot = 0 and ended_at is null) then
      raise exception 'VERIFY(d): hr_hunt_enter at Level % on % answered % (or opened a hunt)', v_lv, v_g, v; end if;

    -- (e) SCALED: past the band's top, with banked hours on and the switch on, the door admits (the hunt plays at the hero's Level); hours off, refused.
    update public.player_state set level_xp = public.hr_char_xp_for_level(v_top + 1) where user_id = v_a and slot = 0;
    update public.hr_feature_switches set scope = 'everyone' where switch_id = 'scaled_hunts';
    insert into public.player_scaled_hours (user_id, slot, hunt_id, banked_ms, use_on, bought_ms)
      values (v_a, 0, v_g, 3600000, true, 3600000)
      on conflict (user_id, slot, hunt_id) do update set banked_ms = excluded.banked_ms, use_on = true, bought_ms = excluded.bought_ms;
    if public.hr_hunt_scaled_at_door(v_a, 0, v_g) is distinct from v_top + 1 then
      raise exception 'VERIFY(e) CANNOT RUN: % does not scale to Level % (hr_hunt_scaled_at_door %)', v_g, v_top + 1, public.hr_hunt_scaled_at_door(v_a, 0, v_g); end if;
    if public.hr_hunt_admit(v_a, 0, v_g) is not null then
      raise exception 'VERIFY(e): a scaled hunt on % at Level % is refused: %', v_g, v_top + 1, public.hr_hunt_admit(v_a, 0, v_g); end if;
    update public.player_scaled_hours set use_on = false where user_id = v_a and slot = 0 and hunt_id = v_g;
    if public.hr_hunt_admit(v_a, 0, v_g)->>'error' is distinct from 'outgrown' then
      raise exception 'VERIFY(e): with its hours off the door at Level % answered %', v_top + 1, public.hr_hunt_admit(v_a, 0, v_g); end if;
    raise exception using errcode = 'HRCOG', message = 'cellar-outgrown §4 complete - rolling back';
  exception when sqlstate 'HRCOG' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_a) or to_regprocedure('pg_temp.hr_co_settle(uuid,bigint,text)') is not null then
    raise exception 'VERIFY: §4 LEAKED a probe row or function'; end if;
  -- (f) EACH SPLICE ONCE, BOTH BODIES §0's POST PINS (so a second apply passes §0 and moves no body), THE HELPER OWNER-ONLY.
  if (select (length(prosrc) - length(replace(prosrc, 'OUTGROWN', ''))) / length('OUTGROWN')
        from pg_proc where oid = 'public.hr_hunt_admit(uuid,integer,text)'::regprocedure) <> 1
     or (select (length(prosrc) - length(replace(prosrc, 'OUTGROWN', ''))) / length('OUTGROWN')
        from pg_proc where oid = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure) <> 1 then
    raise exception 'VERIFY(f): a body carries the OUTGROWN splice other than once'; end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_admit(uuid,integer,text)'::regprocedure) is distinct from 'bc37e6068b6078f26f7e4e586efc4d48'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure)
          not in ('7b6b3171349ee3896a1a380ce0cd0852', '6e3a7682baf3d6d14c32fac1e65df663') then   -- (or 1005-lever-horizon.sql's, re-applied after it)
    raise exception 'VERIFY(f): the spliced bodies landed as % / %, not §0''s post pins',
      (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_admit(uuid,integer,text)'::regprocedure),
      (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure); end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_scaled_at_door(uuid,integer,text)', 'execute') then
      raise exception 'VERIFY(f): % can execute hr_hunt_scaled_at_door', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'cellar-outgrown: % ends at Level %: the door refuses a hero at it (unless scaled), and the settle proves the end from the Level it holds', v_g, v_lv;
end $$;
