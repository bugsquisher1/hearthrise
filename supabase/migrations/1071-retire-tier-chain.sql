-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1071-retire-tier-chain.sql — THE TIER CHAIN AND THE SCALED HUNTS LEAVE THE SERVER: every ground plays the
--   Danger scale's step, the stance picker is the one choice of how hard a hunt is (lane/retire-tier-chain, systems-engineer,
--   2026-11-26; docs/design/redesign/12-targets.md 8.4 item 4, Tyler 2026-11-24: "scaled hunts leave for the scale, the tier picker
--   for the stance picker"; 27-formula-overhaul M-5).
--
-- STATUS: supabase/migration-notes/1071-retire-tier-chain.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
-- EDGE: the hr-accrue of lane/retire-tier-chain (it sends no `scale` claim and reads no options.tier or `scale`). Either order is safe:
--   an older engine finds no `tier` and no `scale` in the instance read and plays the ground's rows (its "a database before that file"
--   path), and the newer engine never sends a scale claim, which this file stops accepting.
-- CLIENT: the build without the tier picker and the scale pane (this lane). An older page that presses a tier or buys scaled hours gets
--   PostgREST's "no such function", said in words (refusal-words.js), and nothing else moves.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- DROPPED, CLIENT VERBS (off hr_client_rpc_baseline and the Game Master's door list hr_gm_wall_allow):
--   hr_hunt_tier_set(int,text,text,uuid)               the tier picked per ground (2027-02-27-hunt-tiers.sql)
--   hr_scaled_hunt_switch(int,text,boolean,uuid)       a scaled hunt's switch (2027-03-21-scaled-hunts.sql)
--   hr_scaled_hunt_buy(int,text,int,bigint,uuid)       scaled hours bought with gold (2027-04-19-key-under-lock.sql): A GOLD PURCHASE
-- DROPPED, SECTIONS: `hunt_tier` (hr_hunt_tier_view) and `scaled_hunts` (hr_scaled_hunts_view).
-- DROPPED, INTERNAL: hr_hunt_tier_pick, hr_hunt_tier_open and hr_hunt_tier_stamp (and their two triggers on hunt_sessions),
--   hr_scaled_hunt_of, hr_scaled_level, hr_scaled_hours_today, hr_hunt_scaled_at_door, hr_scaled_hours_hold (and its two triggers).
-- DROPPED, TABLES: hr_ground_tiers, hr_scaled_grounds, hr_scaled_kill_bounds, hr_scaled_hunt_rule, player_scaled_hours,
--   hunt_scale_holds (1053-lever-gates.sql). COLUMNS: hunt_density.tier, hunt_instances.tier, hunt_instances.scale_level,
--   hunt_sessions.tier, hunt_session_tally.scaled_ms. THE SWITCH ROW: hr_feature_switches 'scaled_hunts'.
-- RESTATED WHOLE: hr_hunt_density_freeze, the instance's first session freezes pull 0 (the ground as built; on the scale the step sets
--   the pull, hr_danger_freeze). RESTATED BY ANCHORED SPLICES (one site each, the rest of each body byte for byte as the chain left it):
--   hr_hunt_instance_read    no `tier`, `scale`, `scale_level` keys; a member's options carry no `tier`
--   hr_hunt_party_view       no `leader_tiers`
--   hr_hunt_view             no session `tier`
--   hr_carry_on_plan_of      no hero `tier`
--   hr_hunt_admit            an outgrown ground refuses with no scaled door
--   hr_hunt_apply_instance   no `scale` claim key, no scale re-proof, no scale_level write, no hours debit
--   hr_hunt_apply_member     the value, defense and item bounds lose their scaled widening; no scaled_ms on the tally
--   hr_hunt_best_fold        no scaled run to skip
--
-- ── PLAYER STATE THIS FILE DROPS, BY DESIGN (CLAUDE.md section 1: no progress protection; say it in the release note) ─────────
--   player_scaled_hours: hours bought with gold and not yet hunted (production, read only 2026-11-26: one account, 0.96 h of the 1 h it
--   bought). hunt_density.tier: every hero's saved tier pick (19 harder picks). hunt_sessions.tier: the tier an ended hunt ran at (the
--   summary no longer names it). No refund is built: a grant is a player-state edit, Tyler's call (CLAUDE.md section 2).
--
-- ── WHAT CROSSES TO ANOTHER PLAYER (CLAUDE.md §1) ─────────────────────────────
--   Less than before: a party member's view no longer carries its leader's tier picks.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
--   -3 client verbs, one of them a gold purchase. The settle's kill, item and defense bounds only narrow (no scaled roster can widen
--   them), and a settle carrying a `scale` key is refused bad_settle like any other unknown key. No new grant, no new verb.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
--   DDL in one transaction: the column drops take ACCESS EXCLUSIVE on hunt_density, hunt_instances, hunt_sessions and
--   hunt_session_tally for the length of the apply (a settle in flight waits, as for any migration touching them).
--
-- ── COST ────────────────────────────────────────────────────────────────────
--   Every settle read loses hr_scaled_hunt_of (a ground probe and a leader read); every member commit loses two scaled-bound joins and
--   the scaled tally insert; every hunt start loses the tier pick's four-table join; the envelope loses two sections.
--
-- REVERSIBLE: restore the pre-apply daily backup (the bought hours and the picks are gone with their tables and columns), or re-apply
--   2027-02-27-hunt-tiers.sql, 2027-05-24-session-tier-open.sql, the scaled-hunts chain (2027-03-21 to 2027-05-28, 1053) and the
--   splices' pre images (pinned in §0).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- md5 of prosrc with carriage returns removed: the image this file was written against (the replayed chain on set/v0.2.144), or its own.
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regclass('public.hunt_instances') is null or to_regclass('public.hr_client_rpc_baseline') is null
     or to_regclass('public.hr_state_sections') is null or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null
     or to_regclass('public.hr_danger_grounds') is null then
    raise exception 'PRECONDITION: the hunt chain, the RPC baseline, the envelope sections or the Danger scale are missing'; end if;
  for v_r in select * from (values
    ('public.hr_hunt_density_freeze()', '022927b62a7d6264ddb6bf783f6324b2', 'TBD-FREEZE'),
    ('public.hr_hunt_instance_read(uuid,integer)', '3097347b88e3a5187f2f12cf0d7fbcae', 'TBD-READ'),
    ('public.hr_hunt_party_view(uuid,integer)', 'c88adbee1f77556025bfea0ddf2c6c11', 'TBD-PARTY'),
    ('public.hr_hunt_view(uuid)', '32668b16635573452a939532e2c9ec9f', 'TBD-VIEW'),
    ('public.hr_carry_on_plan_of(uuid,integer[])', '87d33106294d561a8bf955f9496cd784', 'TBD-CARRY'),
    ('public.hr_hunt_admit(uuid,integer,text)', 'bc37e6068b6078f26f7e4e586efc4d48', 'TBD-ADMIT'),
    ('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)', '3a6748518733987584b75e42e1d204d5', 'TBD-INST'),
    ('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', '209f8462d94db3fc386a12980342f2e8', 'TBD-MEMBER'),
    ('public.hr_hunt_best_fold(uuid)', 'b8a8da109b268ed62848d52073d6dbd9', 'TBD-BEST')) t(fn, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(v_r.fn);
    if v_md5 is null then raise exception 'PIN: % is missing', v_r.fn; end if;
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither the image this file was written against (%) nor its own (%): md5 % - another file moved it; re-pin',
        v_r.fn, v_r.pre, v_r.post, v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE READERS, ONE ANCHORED SPLICE A SITE ───────────────────────────────
-- Each anchor and its replacement are dollar-quoted, so the text a body holds after the splice is written here verbatim. A second apply
-- finds every replacement already in place (its post pin, §0) and the anchor gone, and moves nothing.
do $mig$
declare v_r record; v_def text; v_n int;
begin
  for v_r in select * from (values
    -- THE FREEZE: pull 0, no tier
    ('public.hr_hunt_density_freeze()',
     $a$declare v_tier text; v_size int;
begin
  -- HUNT-TIERS (2027-02-27-hunt-tiers.sql): the instance's first session writes its tier and that tier's pull for the seats it opens with; nothing writes them again.
  -- Normal's pull is 0, the ground as it stands (hunt-grounds.js densityFor: as built alone, its partyPull in a party).
$a$,
     $b$begin
  -- RETIRE-TIER-CHAIN (1071-retire-tier-chain.sql): the instance's first session freezes the pull it opens with, 0: the ground as built (no
  -- tier picks one; on the Danger scale the step sets the pull, hr_danger_freeze). Nothing writes it again.
$b$),
    ('public.hr_hunt_density_freeze()',
     $a$  v_tier := public.hr_hunt_tier_pick(new.instance_id, new.user_id, new.slot);
  v_size := greatest(1, least(4, (select count(*) from public.hunt_party_members m where m.party_id = new.instance_id)::int));
  update public.hunt_instances i
     set tier = v_tier,
         density = coalesce((select t.pull[v_size] from public.hr_ground_tiers t where t.hunt_id = i.hunt_id and t.tier = v_tier), 0)
   where i.id = new.instance_id and i.density is null;$a$,
     $b$  update public.hunt_instances i set density = 0 where i.id = new.instance_id and i.density is null;$b$),
    -- THE INSTANCE READ: no tier, no scale
    ('public.hr_hunt_instance_read(uuid,integer)',
     $a$  -- HUNT-TIERS (2027-02-27-hunt-tiers.sql): every member plays the tier frozen on the instance too (options.tier), beside the pull it froze with it.
$a$,
     $b$  -- RETIRE-TIER-CHAIN (1071-retire-tier-chain.sql): no tier and no scale; off the Danger scale a member plays the ground's rows as written.
$b$),
    ('public.hr_hunt_instance_read(uuid,integer)',
     $a$      'density', v_i.density,
      'tier', v_i.tier,
$a$,
     $b$      'density', v_i.density,
$b$),
    ('public.hr_hunt_instance_read(uuid,integer)',
     $a$      -- SCALED-HUNTS (2027-03-21-scaled-hunts.sql): the server's own scale of the next window (hr_scaled_hunt_of: { level, banked_ms,
      -- user, slot } of the leader, or null) and the Level the stored world was built on (the engine restarts a world built on another).
      'scale', public.hr_scaled_hunt_of(v_i.id), 'scale_level', v_i.scale_level,
$a$,
     $b$$b$),
    ('public.hr_hunt_instance_read(uuid,integer)',
     $a$jsonb_build_object('density', v_i.density, 'tier', coalesce(v_i.tier, 'normal'))$a$,
     $b$jsonb_build_object('density', v_i.density)$b$),
    -- THE PARTY VIEW: no leader_tiers
    ('public.hr_hunt_party_view(uuid,integer)',
     $a$  -- HUNT-TIERS (2027-02-27-hunt-tiers.sql): `leader_tiers`, the leader's tier picked per ground (hunt_density.tier)
  -- every seat's picker shows read-only; it replaces `leader_densities`, the dial is gone.
$a$,
     $b$  -- RETIRE-TIER-CHAIN (1071-retire-tier-chain.sql): no `leader_tiers`; a member reads its leader's Risk (the `danger` section).
$b$),
    ('public.hr_hunt_party_view(uuid,integer)',
     $a$  v_ltier jsonb;
$a$,
     $b$$b$),
    ('public.hr_hunt_party_view(uuid,integer)',
     $a$      v_lseat := v_r.seat;
      -- the leader's picks per ground, as hr_hunt_tier_pick freezes them on a party instance
      v_ltier := public.hr_hunt_tier_view(v_r.user_id, v_r.slot)->'picks';
$a$,
     $b$      v_lseat := v_r.seat;
$b$),
    ('public.hr_hunt_party_view(uuid,integer)',
     $a$    'leader_tiers', coalesce(v_ltier, '{}'::jsonb),
$a$,
     $b$$b$),
    -- THE HUNT VIEW: no session tier
    ('public.hr_hunt_view(uuid)',
     $a$    -- ENDED-TIER (2027-03-16-ended-hunt-tier.sql): the tier an ended session ran at; null while open (hunt_tier.playing says it then)
    'tier', s.tier,
$a$,
     $b$$b$),
    -- THE CARRY-ON PLAN: no hero tier
    ('public.hr_carry_on_plan_of(uuid,integer[])',
     $a$      'tier', coalesce((select d.tier from public.hunt_density d
                         where d.user_id = coalesce(v_p.leader_user, p_uid) and d.slot = coalesce(v_p.leader_slot, v_st.slot)
                           and d.hunt_id = v_hunt), 'normal'),
$a$,
     $b$$b$),
    -- THE OUTGROWN DOOR: no scaled way in
    ('public.hr_hunt_admit(uuid,integer,text)',
     $a$    -- (hr_hunt_grounds.ends_at_level, hunt-grounds.js endsAtLevel: the Mill Cellar's 5) is refused to a hero already at it or over, unless
    -- the hunt would play scaled (hr_hunt_scaled_at_door: its leader's banked hours, at the leader's Level). The engine ends a hunt the
    -- moment its hero reaches the Level (END_ORDER's outgrown), so a hunt let in here would end at its first swing.
    if exists (select 1 from public.hr_hunt_grounds g
                where g.hunt_id = p_hunt and g.ends_at_level is not null and public.hr_level_of(p_user, p_slot) >= g.ends_at_level)
       and public.hr_hunt_scaled_at_door(p_user, p_slot, p_hunt) is null then$a$,
     $b$    -- (hr_hunt_grounds.ends_at_level, hunt-grounds.js endsAtLevel: the Mill Cellar's 5) is refused to a hero already at it or over
    -- (RETIRE-TIER-CHAIN, 1071: no scaled hunt lets one in). The engine ends a hunt the moment its hero reaches the Level (END_ORDER's
    -- outgrown), so a hunt let in here would end at its first swing.
    if exists (select 1 from public.hr_hunt_grounds g
                where g.hunt_id = p_hunt and g.ends_at_level is not null and public.hr_level_of(p_user, p_slot) >= g.ends_at_level) then$b$),
    -- THE INSTANCE COMMIT: no scale claim, re-proof, write or debit
    ('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)',
     $a$  v_scale int;            -- SCALED-HUNTS: the Level this window played (null: the ground's own), proved before any member lands
  v_sc    jsonb;          -- SCALED-HUNTS: the server's own scale of the instance (hr_scaled_hunt_of)
  v_sms   bigint := 0;    -- SCALED-HUNTS: the hours this window spends, in ms: its world swings x the swing
$a$,
     $b$$b$),
    ('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)',
     $a$  -- SCALED-HUNTS (2027-03-21-scaled-hunts.sql): `scale` { level } is the Level the edge says the window played, a CLAIM (4) re-proves.
  if exists (select 1 from jsonb_object_keys(p_settle) k where k not in ('to', 'world_swing', 'world', 'scale'))$a$,
     $b$  -- RETIRE-TIER-CHAIN (1071-retire-tier-chain.sql): no `scale` claim; a window carrying one is refused like any unknown key.
  if exists (select 1 from jsonb_object_keys(p_settle) k where k not in ('to', 'world_swing', 'world'))$b$),
    ('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)',
     $a$    -- SCALED-HUNTS: THE SCALE THIS WINDOW PLAYED, re-proved against the server's own rule before any member lands (each member's kill
    --   bound reads it): a claim stands only if the instance's leader has the switch on, hours banked and a Level that scales the ground
    --   to exactly that Level (hr_scaled_hunt_of), and the window's world swings fit in those hours. No claim is the ground's own rows,
    --   which spend nothing. The Level the stored world is built on is written here.
    v_scale := null;
    if p_settle ? 'scale' and jsonb_typeof(p_settle->'scale') <> 'null' then
      if jsonb_typeof(p_settle->'scale') <> 'object' or exists (select 1 from jsonb_object_keys(p_settle->'scale') k where k <> 'level')
         or jsonb_typeof(p_settle->'scale'->'level') is distinct from 'number' or (p_settle->'scale'->>'level') !~ '^[0-9]{1,4}$' then
        perform public.hr_reject('bad_scale'); end if;
      v_sc := public.hr_scaled_hunt_of(p_instance);
      if v_sc is null or (v_sc->>'level')::int <> (p_settle->'scale'->>'level')::int then
        perform public.hr_reject('scale_moved', jsonb_build_object('claim', p_settle->'scale', 'level', v_sc->'level')); end if;
      v_scale := (v_sc->>'level')::int;
      v_sms := (v_wsw - v_i.world_swing) * v_tick;
      if v_sms > (v_sc->>'banked_ms')::bigint then
        perform public.hr_reject('scale_over', jsonb_build_object('ms', v_sms, 'banked_ms', (v_sc->>'banked_ms')::bigint)); end if;
    end if;
    update public.hunt_instances set scale_level = v_scale where id = p_instance and scale_level is distinct from v_scale;
$a$,
     $b$$b$),
    ('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)',
     $a$    -- SCALED-HUNTS: THE HOURS SPENT, from the leader's bank, under every member's lock and purse taken above (a purchase takes its
    --   hero's lock, then the purse, then this row: the same order). They tick down only while the party is in the spawn: the window's
    --   world swings, never town or travel. Refused, never clamped, if the bank no longer holds them.
    if v_scale is not null and v_sms > 0 then
      update public.player_scaled_hours h
         set banked_ms = h.banked_ms - v_sms, spent_ms = h.spent_ms + v_sms, updated_at = now()
       where h.user_id = (v_sc->>'user')::uuid and h.slot = (v_sc->>'slot')::int and h.hunt_id = v_i.hunt_id and h.banked_ms >= v_sms;
      if not found then perform public.hr_reject('scale_over', jsonb_build_object('ms', v_sms)); end if;
    end if;
$a$,
     $b$$b$),
    -- THE MEMBER COMMIT: the bounds lose their scaled widening; no scaled span on the tally
    ('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)',
     $a$  -- SCALED-HUNTS (2027-03-21-scaled-hunts.sql): a window the commit proved scaled (hunt_instances.scale_level, written by
  -- hr_hunt_apply_instance before any member lands) is bounded by its scaled roster's most a kill pays as well (hr_scaled_kill_bounds).
  select greatest(v_vb_gold, coalesce(max(b.gold_max), 0)), greatest(v_vb_xp, coalesce(max(b.xp_max), 0)) into v_vb_gold, v_vb_xp
    from public.hunt_instances i join public.hr_scaled_kill_bounds b on b.hunt_id = i.hunt_id and b.level = i.scale_level
   where i.id = p_instance;
$a$,
     $b$$b$),
    ('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)',
     $a$                * greatest(coalesce((select max(public.hr_monster_level(sp.monster_id)) from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id), 0),
                           coalesce((select b.level_max from public.hunt_instances i join public.hr_scaled_kill_bounds b
                                       on b.hunt_id = i.hunt_id and b.level = i.scale_level where i.id = p_instance), 0),
$a$,
     $b$                * greatest(coalesce((select max(public.hr_monster_level(sp.monster_id)) from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id), 0),
$b$),
    ('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)',
     $a$              where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id)), 0)
           -- SCALED-LOOT (2027-05-17-scaled-loot.sql): a window the commit proved scaled rolls each row ceil(loot_pm / 1000) times
           * coalesce((select ceil(b.loot_pm / 1000.0) from public.hunt_instances i join public.hr_scaled_kill_bounds b
                        on b.hunt_id = i.hunt_id and b.level = i.scale_level where i.id = p_instance), 1)
$a$,
     $b$              where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id)), 0)
$b$),
    ('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)',
     $a$  -- SCALED-BEST (2027-05-17-scaled-best.sql): a window the commit proved scaled (hunt_instances.scale_level, written by
  --   hr_hunt_apply_instance before any member lands) keeps its span on THIS session's tally, so its personal best is never folded
  --   (hr_hunt_best_fold): a scaled run is not the ground's own.
  if exists (select 1 from public.hunt_instances i where i.id = p_instance and i.scale_level is not null) then
    insert into public.hunt_session_tally as t (session_id, user_id, slot, scaled_ms) values (p_session, p_user, p_slot, greatest(v_win, 1))
      on conflict (session_id) do update set scaled_ms = t.scaled_ms + excluded.scaled_ms;
  end if;
$a$,
     $b$$b$),
    -- THE BEST: no scaled run to skip
    ('public.hr_hunt_best_fold(uuid)',
     $a$  -- SCALED-BEST (2027-05-17-scaled-best.sql): a run that played any scaled window is not the ground's own: no best from it.
  if coalesce((select t.scaled_ms from public.hunt_session_tally t where t.session_id = p_session), 0) > 0 then return; end if;
$a$,
     $b$$b$)) t(fn, find, repl) loop
    v_def := replace(pg_get_functiondef(v_r.fn::regprocedure), chr(13), '');
    v_n := (length(v_def) - length(replace(v_def, v_r.find, ''))) / length(v_r.find);
    -- a second apply: the anchor is gone (and the replacement, when it says something, is in place)
    if v_n = 0 and (v_r.repl = '' or strpos(v_def, v_r.repl) > 0) then continue; end if;
    if v_n <> 1 then raise exception 'SPLICE: % holds its anchor % times, want 1: %', v_r.fn, v_n, left(v_r.find, 80); end if;
    execute replace(v_def, v_r.find, v_r.repl);
  end loop;
end $mig$;

-- ── §2 THE VERBS, THE SECTIONS AND THE INTERNALS GO ──────────────────────────
delete from public.hr_client_rpc_baseline where proname in ('hr_hunt_tier_set', 'hr_scaled_hunt_switch', 'hr_scaled_hunt_buy');
do $mig$
begin
  if to_regclass('public.hr_gm_wall_allow') is not null then
    delete from public.hr_gm_wall_allow where rpc in ('hr_hunt_tier_set', 'hr_scaled_hunt_switch', 'hr_scaled_hunt_buy');
  end if;
end $mig$;
delete from public.hr_state_sections where key in ('hunt_tier', 'scaled_hunts');
delete from public.hr_feature_switches where switch_id = 'scaled_hunts';
drop trigger if exists hr_hunt_tier_open on public.hunt_sessions;
drop trigger if exists hr_hunt_tier_stamp on public.hunt_sessions;
drop trigger if exists hr_scaled_hours_hold_ins on public.player_scaled_hours;
drop trigger if exists hr_scaled_hours_hold_upd on public.player_scaled_hours;
drop function if exists public.hr_hunt_tier_set(integer, text, text, uuid);
drop function if exists public.hr_scaled_hunt_switch(integer, text, boolean, uuid);
drop function if exists public.hr_scaled_hunt_buy(integer, text, integer, bigint, uuid);
drop function if exists public.hr_hunt_tier_view(uuid, integer);
drop function if exists public.hr_scaled_hunts_view(uuid, integer);
drop function if exists public.hr_hunt_tier_pick(uuid, uuid, integer);
drop function if exists public.hr_hunt_tier_open();
drop function if exists public.hr_hunt_tier_stamp();
drop function if exists public.hr_hunt_scaled_at_door(uuid, integer, text);
drop function if exists public.hr_scaled_hours_hold();
drop function if exists public.hr_scaled_hunt_of(uuid);
drop function if exists public.hr_scaled_hours_today(uuid, integer);
drop function if exists public.hr_scaled_level(text, integer);

-- ── §3 THE TABLES AND COLUMNS GO ─────────────────────────────────────────────
drop table if exists public.hunt_scale_holds;
drop table if exists public.player_scaled_hours;
drop table if exists public.hr_scaled_kill_bounds;
drop table if exists public.hr_scaled_grounds;
drop table if exists public.hr_scaled_hunt_rule;
drop table if exists public.hr_ground_tiers;
alter table public.hunt_density drop column if exists tier;
alter table public.hunt_instances drop column if exists tier;
alter table public.hunt_instances drop column if exists scale_level;
alter table public.hunt_sessions drop column if exists tier;
alter table public.hunt_session_tally drop column if exists scaled_ms;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
-- (a) THE SHAPE: every dropped name is gone (functions, triggers, tables, columns, baseline rows, door list, sections, the switch);
--     no public body names a dropped thing; the RPC surface agrees with the baseline.
-- (b) THE PATH THAT STAYS: a Level 60 hero enters a ground on the Danger scale. The instance freezes pull 0 and the default stance; the
--     engine's read carries no tier and no scale, a member's options no tier; the envelope carries no hunt_tier or scaled_hunts section;
--     the party view no leader_tiers; the hunt view no session tier; the carry-on plan no hero tier.
-- (c) THE OUTGROWN DOOR STILL REFUSES: the same hero at the Mill Cellar (its hunt ends at Level 5) is refused `outgrown`.
-- (d) A SETTLE CARRYING A SCALE CLAIM IS REFUSED: hr_hunt_apply_instance answers bad_settle for a `scale` key, with nothing written.
do $chk$
declare
  c_u    constant uuid := '00000107-1000-4000-a000-000000000001';
  k      constant text := '00000107-1000-4000-a000-0000';
  v jsonb; v_iid uuid; v_sid uuid; v_sig text; v_bad text; v_ground text; v_read jsonb;
begin
  -- (a)
  foreach v_sig in array array['public.hr_hunt_tier_set(integer,text,text,uuid)', 'public.hr_scaled_hunt_switch(integer,text,boolean,uuid)',
      'public.hr_scaled_hunt_buy(integer,text,integer,bigint,uuid)', 'public.hr_hunt_tier_view(uuid,integer)', 'public.hr_scaled_hunts_view(uuid,integer)',
      'public.hr_hunt_tier_pick(uuid,uuid,integer)', 'public.hr_hunt_tier_open()', 'public.hr_hunt_tier_stamp()',
      'public.hr_hunt_scaled_at_door(uuid,integer,text)', 'public.hr_scaled_hours_hold()', 'public.hr_scaled_hunt_of(uuid)',
      'public.hr_scaled_hours_today(uuid,integer)', 'public.hr_scaled_level(text,integer)'] loop
    if to_regprocedure(v_sig) is not null then raise exception 'retire-tier-chain §4(a): % still exists', v_sig; end if;
  end loop;
  foreach v_sig in array array['public.hunt_scale_holds', 'public.player_scaled_hours', 'public.hr_scaled_kill_bounds', 'public.hr_scaled_grounds',
      'public.hr_scaled_hunt_rule', 'public.hr_ground_tiers'] loop
    if to_regclass(v_sig) is not null then raise exception 'retire-tier-chain §4(a): % still exists', v_sig; end if;
  end loop;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
               and ((table_name in ('hunt_density', 'hunt_instances', 'hunt_sessions') and column_name = 'tier')
                 or (table_name = 'hunt_instances' and column_name = 'scale_level') or (table_name = 'hunt_session_tally' and column_name = 'scaled_ms'))) then
    raise exception 'retire-tier-chain §4(a): a tier or scale column is still there'; end if;
  if exists (select 1 from pg_trigger where not tgisinternal
               and tgname in ('hr_hunt_tier_open', 'hr_hunt_tier_stamp', 'hr_scaled_hours_hold_ins', 'hr_scaled_hours_hold_upd')) then
    raise exception 'retire-tier-chain §4(a): a tier or scale trigger is still armed'; end if;
  if exists (select 1 from public.hr_client_rpc_baseline where proname in ('hr_hunt_tier_set', 'hr_scaled_hunt_switch', 'hr_scaled_hunt_buy')) then
    raise exception 'retire-tier-chain §4(a): a dropped verb is still on hr_client_rpc_baseline'; end if;
  if to_regclass('public.hr_gm_wall_allow') is not null and exists (select 1 from public.hr_gm_wall_allow
       where rpc in ('hr_hunt_tier_set', 'hr_scaled_hunt_switch', 'hr_scaled_hunt_buy')) then
    raise exception 'retire-tier-chain §4(a): a dropped verb is still on the Game Master''s door list'; end if;
  if exists (select 1 from public.hr_state_sections where key in ('hunt_tier', 'scaled_hunts') or fn ~ '^hr_(hunt_tier|scaled)_') then
    raise exception 'retire-tier-chain §4(a): a tier or scale section is still in the envelope'; end if;
  if exists (select 1 from public.hr_feature_switches where switch_id = 'scaled_hunts') then
    raise exception 'retire-tier-chain §4(a): the scaled_hunts switch is still a row'; end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prosrc ~ 'hr_scaled_|player_scaled_hours|hunt_scale_holds|hr_ground_tiers|hr_hunt_tier_|scale_level|scaled_ms|leader_tiers|hr_hunt_scaled_at_door';
  if v_bad is not null then raise exception 'retire-tier-chain §4(a): a body still names the tier chain or the scaled hunts: %', v_bad; end if;
  perform public.hr_assert_grant_hygiene(true);

  select g.hunt_id into v_ground from public.hr_danger_grounds g join public.hr_hunt_grounds h on h.hunt_id = g.hunt_id
   where h.ends_at_level is null order by g.hunt_id limit 1;
  if v_ground is null then raise exception 'retire-tier-chain §4-harness: no ground on the Danger scale without an exit Level'; end if;
  begin
    -- (b)
    update public.hr_hunt_config set enabled = true where id;
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (c_u, 'Probe Tierless') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'retire-tier-chain §4 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'retire-tier-chain §4-harness: hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null, level_xp = public.hr_char_xp_for_level(60) where user_id = c_u and slot = 0;
    delete from public.hr_rate_counters where user_id = c_u;
    v := public.hr_hunt_enter(0, v_ground, '[]'::jsonb, 0, null, (k || '00000b01')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'retire-tier-chain §4(b): entering % answered %', v_ground, v; end if;
    select h.id, h.instance_id into v_sid, v_iid from public.hunt_sessions h where h.user_id = c_u and h.slot = 0 and h.ended_at is null;
    if (select density from public.hunt_instances where id = v_iid) is distinct from 0 then
      raise exception 'retire-tier-chain §4(b): the instance froze pull %, not the ground as built', (select density from public.hunt_instances where id = v_iid); end if;
    if (select risk from public.hunt_instances where id = v_iid) is null then
      raise exception 'retire-tier-chain §4(b): a ground on the scale froze no stance'; end if;
    v_read := public.hr_hunt_instance_read(c_u, 0);
    if v_read->'instance' ?| array['tier', 'scale', 'scale_level'] or v_read->'members'->0->'session'->'options' ? 'tier'
       or coalesce(v_read->'members'->0->'session'->'options'->>'risk', '') = '' then
      raise exception 'retire-tier-chain §4(b): the engine reads instance % and options %', v_read->'instance' - 'secret', v_read->'members'->0->'session'->'options'; end if;
    v := public.hr_state_of(c_u, 0);
    if v ?| array['hunt_tier', 'scaled_hunts'] then raise exception 'retire-tier-chain §4(b): the envelope still carries a tier or scale section'; end if;
    if public.hr_hunt_party_view(c_u, 0) ? 'leader_tiers' then raise exception 'retire-tier-chain §4(b): the party view still says leader_tiers'; end if;
    if public.hr_hunt_view(c_u) ? 'tier' or coalesce(public.hr_hunt_view(c_u)->'session', '{}'::jsonb) ? 'tier' then
      raise exception 'retire-tier-chain §4(b): the hunt view still names a tier'; end if;
    if exists (select 1 from jsonb_array_elements(coalesce(public.hr_carry_on_plan_of(c_u, array[0])->'heroes', '[]'::jsonb)) e where e.value ? 'tier') then
      raise exception 'retire-tier-chain §4(b): the carry-on plan still names a tier'; end if;
    -- (d) a scale claim is an unknown key, refused with nothing written
    begin
      v := public.hr_hunt_apply_instance(v_iid, 0, jsonb_build_object('to', now(), 'world_swing', 0, 'world', null, 'scale', jsonb_build_object('level', 20)),
        jsonb_build_array(jsonb_build_object('user', c_u, 'slot', 0)), c_u, 0);
      if coalesce(v->>'error', '') <> 'bad_settle' then raise exception 'retire-tier-chain §4(d): a scale claim answered %', v; end if;
    exception when sqlstate 'HR000' then
      if sqlerrm not in ('bad_settle') then raise exception 'retire-tier-chain §4(d): a scale claim raised %', sqlerrm; end if;
    end;
    perform public.hr_hunt_close(v_sid, 'left', now(), true);
    update public.player_state set active_kind = 'idle', active_id = null where user_id = c_u and slot = 0;
    -- (c)
    delete from public.hr_rate_counters where user_id = c_u;
    v := public.hr_hunt_enter(0, 'mill_cellar', '[]'::jsonb, 0, null, (k || '00000c01')::uuid);
    if v->>'error' is distinct from 'outgrown' then raise exception 'retire-tier-chain §4(c): a Level 60 hero at the Cellar answered %', v; end if;
    raise exception using errcode = 'HR897', message = 'retire-tier-chain §4 complete - rolling back';
  exception when sqlstate 'HR897' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = c_u) then raise exception 'retire-tier-chain §4: LEAKED a probe row'; end if;
  raise notice 'retire-tier-chain: the tier chain and the scaled hunts are gone from the server; a hunt freezes pull 0 and its stance; all green';
end $chk$;
