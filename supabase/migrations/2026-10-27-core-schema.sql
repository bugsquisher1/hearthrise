-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE CORE REBUILD, PART 1 OF 3: THE SCHEMA
-- (docs/design/CORE_MODEL.md; Tyler 2026-10-19 "Rebuild the core (death, Level
-- vs skills, skill list, Prayer), delete the old-model leftovers, wipe
-- characters"). STAGED (lane/c-core-rebuild). Game CLOSED: applies on its
-- passing §4; Security reviews every core surface at the reopen gate.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 THE LEVEL: player_state.level_xp (bigint >= 0): the character's Level XP,
--    from kills only, credited by hr_apply (delta.level_xp, 2026-10-27-core-bodies.sql).
-- §2 THE RETIRED SKILLS: Attack, Strength and Hitpoints rows leave player_skills
--    (Melee replaces the first two; there is no Hitpoints skill). Characters
--    are wiped by 2026-10-27-core-wipe.sql anyway; this runs first so the
--    catalogue's skill list replaces cleanly.
-- §3 THE OLD MODEL, DELETED OUTRIGHT (no back-compat, closed game):
--    · the knockout: player_state.recovering_until / consec_falls, hunt_sessions
--      falls / falls_limit / down, hunt_session_tally.down_ms, hr_rest;
--    · max HP stored and raised by Hitpoints: player_state.max_hp,
--      hr_start_kit.max_hp, the hr_player_skills_max_hp trigger and
--      hr_sync_max_hp / hr_max_hp_for (max HP is DERIVED: hr_vitals_of);
--    · the OSRS combat styles: player_state.combat_style, hr_combat_styles,
--      hr_set_style(_ungated);
--    · the old client combat-XP door: hr_credit_combat_xp(_ungated),
--      hr_combat_xp_cap;
--    · the pre-instance party hunt that read the knockout columns:
--      hr_party_hunt_start, hr_party_view, hr_party_hunt_view,
--      hr_party_tick_settle (no client or cron calls any of them; the other
--      dormant M8 party verbs read none of the dropped columns and are left to
--      the dormant-surface lane).
--    Every dropped client RPC leaves hr_client_rpc_baseline in the same file.
--    The rows a later CHECK would refuse are rewritten to the new names first
--    (end_reason 'falls' -> 'died', event 'fall' -> 'death'): they are wiped by
--    the last file, and must not block the catalogue's CHECKs in between.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Shrinks it: four client RPCs and two engine functions are gone. level_xp has
-- no client grant (player_state never had one) and only hr_apply writes it.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Not reversible as data (the wipe follows); as schema, re-apply the files that
-- created each object (2026-09-06-recovering-until.sql, 2026-09-06-max-hp-
-- tracks-hitpoints.sql, 2026-08-24-combat-style.sql, 2026-08-31-combat-xp-
-- credit.sql, the M8 party files) and the 2026-10-25 bodies.
-- ORDER: first of the core files; before 2026-10-27-core-catalogue.generated.sql.
-- No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.player_state') is null or to_regclass('public.player_skills') is null
     or to_regclass('public.hunt_sessions') is null or to_regclass('public.hunt_session_tally') is null
     or to_regclass('public.hunt_session_events') is null or to_regclass('public.hr_start_kit') is null
     or to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'PRECONDITION: the player state, the hunt sessions, the start kit or the client RPC baseline is absent';
  end if;
end $mig$;

-- ── §1 THE LEVEL ─────────────────────────────────────────────────────────────
alter table public.player_state add column if not exists level_xp bigint not null default 0;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.player_state'::regclass and conname = 'player_state_level_xp_ck') then
    alter table public.player_state add constraint player_state_level_xp_ck check (level_xp >= 0);
  end if;
end $mig$;
comment on column public.player_state.level_xp is
  '2026-10-27 core rebuild: the character''s Level XP, from kills only (CORE_MODEL.md §2). Written only by hr_apply; Level, max HP and max mana are derived from it (hr_char_level, hr_vitals_of).';

-- ── §2 THE RETIRED SKILLS ────────────────────────────────────────────────────
delete from public.player_skills where skill_id in ('attack', 'strength', 'hitpoints');
-- "Defeat 100 monsters" paid 1,500 Hitpoints XP (2026-10-10-quest-xp-absence-pay.sql). Its XP moves to
-- Defense, the combat skill every role trains (any hero in armour); Level cannot be granted by a claim
-- (kills only, hr_apply refuses level_xp outside a hunt). PROVISIONAL, flagged to the designer.
insert into public.hr_quest_rewards (quest_id, xp) values
  ('hundred_kills', '{"defense": 1500}')
on conflict (quest_id) do update set xp = excluded.xp;

-- ── §3 THE OLD MODEL ─────────────────────────────────────────────────────────
-- Max HP stored and raised by Hitpoints.
drop trigger if exists hr_player_skills_max_hp on public.player_skills;
drop function if exists public.hr_player_skills_max_hp();
drop function if exists public.hr_sync_max_hp(uuid, integer);
drop function if exists public.hr_max_hp_for(uuid, integer);
-- The knockout's rest verb, the OSRS styles, the old combat-XP door.
drop function if exists public.hr_rest(integer, uuid);
drop function if exists public.hr_set_style(text, text, integer, uuid);
drop function if exists public.hr_set_style__ungated(text, text, integer, uuid);
drop function if exists public.hr_credit_combat_xp(integer, jsonb, text);
drop function if exists public.hr_credit_combat_xp__ungated(integer, jsonb, text);
drop function if exists public.hr_combat_xp_cap(integer, bigint);
drop table if exists public.hr_combat_styles;
-- The pre-instance party hunt (read the knockout columns).
drop function if exists public.hr_party_hunt_start(integer, text, text, jsonb, uuid);
drop function if exists public.hr_party_view(uuid);
drop function if exists public.hr_party_hunt_view(integer);
drop function if exists public.hr_party_tick_settle(text, uuid, timestamp with time zone, timestamp with time zone, uuid, jsonb);
delete from public.hr_client_rpc_baseline
 where proname in ('hr_rest', 'hr_set_style', 'hr_credit_combat_xp', 'hr_party_hunt_start', 'hr_party_view', 'hr_party_hunt_view');

-- The columns.
alter table public.player_state drop column if exists recovering_until;
alter table public.player_state drop column if exists consec_falls;
alter table public.player_state drop column if exists combat_style;
alter table public.player_state drop column if exists max_hp;
alter table public.hr_start_kit drop column if exists max_hp;
-- The two generated CHECKs are re-added by 2026-10-27-hunt-sessions-catalogue.generated.sql (END_ORDER,
-- EVENT_COPY); dropped here so the rows can move to the new names in between. Only the OLD constraint
-- (it still names 'falls' / 'fall') is dropped, so a second apply leaves the catalogue's new one alone.
do $drop$
begin
  if exists (select 1 from pg_constraint c where c.conrelid = 'public.hunt_sessions'::regclass
              and c.conname = 'hunt_sessions_end_reason_check' and pg_get_constraintdef(c.oid) like '%''falls''%') then
    alter table public.hunt_sessions drop constraint hunt_sessions_end_reason_check;
  end if;
  if exists (select 1 from pg_constraint c where c.conrelid = 'public.hunt_session_events'::regclass
              and c.conname = 'hunt_session_events_type_check' and pg_get_constraintdef(c.oid) like '%''fall''::%') then
    alter table public.hunt_session_events drop constraint hunt_session_events_type_check;
  end if;
end $drop$;
update public.hunt_sessions set end_reason = 'died' where end_reason = 'falls';
alter table public.hunt_sessions drop column if exists falls;
alter table public.hunt_sessions drop column if exists falls_limit;
alter table public.hunt_sessions drop column if exists down;
alter table public.hunt_session_tally drop column if exists down_ms;
update public.hunt_session_events set type = 'death' where type = 'fall';

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED ────────────────────────────────────
do $mig$
declare v_bad text;
begin
  -- (a) The Level column, non-negative, no client privilege on its table.
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_state'
                  and column_name = 'level_xp' and data_type = 'bigint' and is_nullable = 'NO') then
    raise exception 'SELF-CHECK: player_state.level_xp is missing or nullable'; end if;
  if has_table_privilege('authenticated', 'public.player_state', 'update') or has_table_privilege('anon', 'public.player_state', 'update') then
    raise exception 'SELF-CHECK: a client role may UPDATE player_state (level_xp would be forgeable)'; end if;
  -- (b) Every old-model column is gone.
  select string_agg(table_name || '.' || column_name, ', ') into v_bad from information_schema.columns
   where table_schema = 'public' and (table_name, column_name) in (
     ('player_state', 'recovering_until'), ('player_state', 'consec_falls'), ('player_state', 'combat_style'),
     ('player_state', 'max_hp'), ('hr_start_kit', 'max_hp'), ('hunt_sessions', 'falls'),
     ('hunt_sessions', 'falls_limit'), ('hunt_sessions', 'down'), ('hunt_session_tally', 'down_ms'));
  if v_bad is not null then raise exception 'SELF-CHECK: old-model columns survive: %', v_bad; end if;
  -- (c) Every old-model function is gone, and no baseline row names one.
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('hr_player_skills_max_hp', 'hr_sync_max_hp', 'hr_max_hp_for', 'hr_rest',
     'hr_set_style', 'hr_set_style__ungated', 'hr_credit_combat_xp', 'hr_credit_combat_xp__ungated', 'hr_combat_xp_cap',
     'hr_party_hunt_start', 'hr_party_view', 'hr_party_hunt_view', 'hr_party_tick_settle');
  if v_bad is not null then raise exception 'SELF-CHECK: old-model functions survive: %', v_bad; end if;
  if exists (select 1 from public.hr_client_rpc_baseline
              where proname in ('hr_rest', 'hr_set_style', 'hr_credit_combat_xp', 'hr_party_hunt_start', 'hr_party_view', 'hr_party_hunt_view')) then
    raise exception 'SELF-CHECK: the client RPC baseline still names a dropped verb'; end if;
  -- (d) No retired skill row, no retired end reason or event left to block a CHECK.
  if exists (select 1 from public.player_skills where skill_id in ('attack', 'strength', 'hitpoints'))
     or exists (select 1 from public.hunt_sessions where end_reason = 'falls')
     or exists (select 1 from public.hunt_session_events where type = 'fall') then
    raise exception 'SELF-CHECK: a retired skill row, end reason or event survives'; end if;
end $mig$;
