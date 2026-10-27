-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — INNER FLAME REPLACES PRAYER; THE GREAT HEARTH BURNS NAMED FUELS
-- (lane/b-inner-flame, systems-engineer, 2026-10-27; Tyler 2026-10-25: "feed the
-- Hearth, raise your Inner Flame"; design: docs/planning/PRIORITY_BOARD.md "The
-- Hearth: Inner Flame replaces Prayer (2026-10-25)").
--
-- STATUS: STAGED, NOT APPLIED. Pre-EA rules (CLAUDE.md §2): applies on its passing
-- §6; a skill-XP and item surface (a named fuel is a tradeable item it consumes, and
-- the burst is skill XP) and a SHARED surface (the square's flame colour, a system
-- chat line): on the Steam EA Security review list.
-- RESTATEMENT-DEBT-ACK: hr_apply (the economy's single write path, 150k chars) takes ONE anchored edit in §2(e), its away-span XP list read from the catalogue instead of naming the old skill; restating the whole body for one literal is the larger risk (as skills-from-storage, gear-by-level and account-gold did).
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
-- Prayer + burying bones read as an OSRS lift (Tyler 10-25). The skill is now INNER
-- FLAME, trained by fuelling the Great Hearth in Havora's square. It keeps Prayer's
-- whole job: the HP and mana regeneration rate (hr_regen_permille, the diminishing
-- curve) and its place among the COMBAT skills a death costs (Tyler 10-25, asked
-- directly: it keeps death loss). No back-compat (CLAUDE.md §1): the key is renamed
-- in place, never aliased.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 THE RENAME, IN PLACE (one transaction, so no read ever sees half of it):
--    hr_skills 'prayer' -> 'inner_flame'; hr_start_skill_xp; every player_skills row
--    (the XP is kept, not reset: it is the same progress under its new name);
--    hr_hunt_limits prayer_regen_* -> flame_regen_*; the Shrine's room perk
--    prayerSpeed -> flameSpeed (hr_room_perks); the owl's req_skill (hr_unlock_offers,
--    a held companion row no generator rewrites); the Hearth's host skill
--    (hr_town_station_hosts); the bench rows bury_* / offer_* / ... -> fuel_<item>
--    (hr_activities) and every activity pointer naming one (player_state.active_id,
--    last_activity_id). The generated catalogues that follow this file
--    (2027-01-31-*.generated.sql) are full replaces that land the same rows plus the
--    new fuels: this file renames what already exists so nothing reads a dead key in
--    between. player_ledger is append-only history and keeps the old names.
-- §2 THE BODIES THAT NAMED THE SKILL, restated whole from the live chain (§0 pins
--    each pre-image): hr_vitals_of and hr_regen_permille (the regen rate reads Inner
--    Flame and the flame_regen_* limits; the parameter is renamed, so it is dropped
--    first), hr_renown_of (its old-model combat level reads the renamed skill; the
--    formula itself is the renown lane's), hr_hunt_apply_member (THE DEATH LOSS: the
--    combat skills a death costs are now the catalogue's `combat` rows, so a renamed or
--    new combat skill is priced with no body edit). (e) hr_apply: ONE anchored edit
--    (the ack above), the same catalogue read for its away-span XP sum.
--    NOT restated (legacy old-model bodies that also read attack/strength/hitpoints, a
--    model the core rebuild retired; no live caller reaches them): hr_bounty_combat_level,
--    hr_party_level, hr_dungeon_settle (dungeons paused), hr_lb_skills (the old
--    leaderboard list). They are on the dead-surfaces list in the lane report.
-- §3 THE HEARTH'S TABLES: hr_hearth_named and hr_hearth_rule (CATALOGUE: filled by
--    2027-01-31-hearth-catalogue.generated.sql from src/data/hearth.js, never by hand)
--    and hearth_flames (STATE: one row per named fuel burnt, the square's colour and
--    its queue; written ONLY by hr_hearth_burn).
-- §4 THE VERB AND THE READ:
--    hr_hearth_burn(p_slot, p_item, p_idem)  burn ONE named fuel (src/data/hearth.js
--      NAMED_FUELS) in the Great Hearth. Under the character lock: refused while
--      hunting, for an item that is not a named fuel (an everyday fuel is a bench run:
--      set_activity on fuel_<item>), with none in the bag, below its Inner Flame level,
--      past the per-hero UTC-day clamp, or when the square's colours are booked further
--      ahead than the rule allows. Then ONE hr_apply (the item -1, the catalogue's
--      Inner Flame XP, journalled kind 'craft', intent hearth_burn:<item>), ONE
--      hearth_flames row queued behind the last colour, ONE system chat line naming
--      the burner ("fed the Great Hearth a [[item:…]].", never for a quiet hero), and
--      the hero's body is set on a free Hearth fuel stand (hr_town_place 'visit').
--      Idempotent on p_idem (hr_intent_replay + hr_apply's key): a retry burns nothing
--      twice and queues nothing twice. 10/min (bucket hearth_burn).
--    hr_hearth_flame_of(p_map)  the colour burning now in that town, or null:
--      {flame, item, by (null for a quiet hero), from_ms, until_ms, now_ms, queued}.
--    hr_town_view RESTATED WHOLE (live b39c5eec, 2027-01-28-town-stands.sql): its answer
--      gains `hearth` (hr_hearth_flame_of(p_map)), so every viewer in the square sees a
--      colour within one town read of the burn. No other line moves.
--
-- ── ERROR TAXONOMY (hr_hearth_burn) ─────────────────────────────────────────
--   not_signed_in, bad_slot, bad_idem, rate_limited, intent_mismatch (a key reused for
--   another verb), no_character, hunting {hunt}, not_a_fuel, catalogue_missing,
--   no_item, flame_too_low {need, have}, hearth_limit {per_day}, hearth_busy {wait_s},
--   and any hr_apply refusal as hr_apply words it.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
--   ONE ORDER: the hero (hr_hunt_lock: advisory uid:slot, then its player_state row and
--   open session) -> the Hearth of the town ('hr:hearth:<map>' advisory) -> hr_apply
--   (re-takes the hero key it holds; touches no depot or purse on this delta) -> the town
--   (hr_town_place: its map lock, then the body row). Nothing takes the Hearth key and
--   then a hero lock, and town code locks no player_state row (2027-01-28-town-stands.sql),
--   so no cycle. Two burns in one town queue on the Hearth key: the second sees the
--   first's row and starts where it ends.
--
-- ── EXPOSURE (the EA Security review's surface) ─────────────────────────────
--   +1 client RPC (hr_hearth_burn: a slot, a catalogue id and a key; never an amount, an
--   XP figure, a colour or a time). The XP, the colour, the duration, the level gate and
--   the clamps are the server catalogue's (hr_hearth_named / hr_hearth_rule, generated);
--   the queue and every timestamp are now(). A forged call can only burn the caller's
--   own fuel from its own bag. SHARED: a colour others see and one chat line, both
--   written only here, bounded per hero per day (per_day) and per town (queue_s); the
--   line's name is stamped by hr_chat_name_authority from the session.
--
-- ── COST (100x players, ~4,400 accounts) ───────────────────────────────────
--   A named fuel is super-rare (one per 10-20 hours of a ground's hunting): hearth_flames
--   grows by a few rows an hour server-wide (~120 B each). hr_town_view gains one indexed
--   probe of hearth_flames (map, ends_at) per read: a top-1 of a handful of live rows.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   Drop hr_hearth_burn (+ its baseline row) and hr_hearth_flame_of, re-apply hr_town_view
--   from 2027-01-28-town-stands.sql, drop the three tables. The rename is a key rename:
--   reversing it is the same updates the other way (there is no back-compat to keep).
-- ORDER: after 2027-01-30-havora-yards.generated.sql; BEFORE the 2027-01-31-*.generated.sql
--   catalogues (items, room perks, bench inputs, hunt sessions, town stations, hearth). EDGE:
--   the hr-accrue bundle moves with this lane (src/data, src/core); deploy it AFTER this file
--   and the catalogues (the engine credits 'inner_flame', which hr_apply refuses until §1).
-- No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS — FAIL CLOSED ────────────────────────────────
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regclass('public.hr_skills') is null or to_regclass('public.player_skills') is null or to_regclass('public.hr_hunt_limits') is null
     or to_regclass('public.hr_room_perks') is null or to_regclass('public.hr_unlock_offers') is null
     or to_regclass('public.hr_town_station_hosts') is null or to_regclass('public.hr_activities') is null
     or to_regclass('public.chat_messages') is null or to_regclass('public.town_bodies') is null then
    raise exception 'PRECONDITION: the catalogue, the town stands and chat must exist (2027-01-28-town-stands.sql, 2027-01-30-havora-yards.generated.sql)'; end if;
  if to_regprocedure('public.hr_town_place(uuid,integer,text,text,text,timestamp with time zone,text,integer)') is null
     or to_regprocedure('public.hr_town_me(uuid,integer)') is null or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null
     or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_skill_level(text,bigint)') is null or to_regprocedure('public.hr_utc_day_start(timestamp with time zone)') is null then
    raise exception 'PRECONDITION: the helpers this file calls are absent'; end if;
  -- each restated body is EXACTLY its live image or this file's own post-image (a second apply)
  for v_r in select * from (values
    ('public.hr_vitals_of(uuid,integer)', '8145990ebba07dcf92536fc4b3a6967e', '4572cdfc29c9ad5926b36746fa11a6c0'),
    ('public.hr_renown_of(uuid,integer)', '45e723cbfa0d9339c04098b562b60018', '2b62783dbef7e393c3a173d9b234320b'),
    ('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', '6846956794889190e824cb0bab6e5463', '803d09f68551213fc531d8340f518c1b'),
    ('public.hr_town_view(integer,text,integer,integer,bigint,integer,integer)', 'b39c5eec778acc98cdfb453d0ad9e534', '63c646a861da8aa4be692a043f3269b4'),
    ('public.hr_apply(uuid,integer,bigint,uuid,jsonb)', '0a31806510e3aeb7e51184f42430237f', 'b7052e5b7c58afff1b318ca5ab97e81c')) t(fn, pre, post) loop
    select md5(prosrc) into v_md5 from pg_proc where oid = v_r.fn::regprocedure;
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither its live pre-image (%) nor this file''s image (%): md5 % - another file moved it', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
  -- the regen rate: the live one-argument body, or this file's (renamed parameter, same signature)
  select md5(prosrc) into v_md5 from pg_proc where oid = 'public.hr_regen_permille(integer)'::regprocedure;
  if v_md5 is distinct from 'cbe0f66975537c58c781ef1098e0ae9c' and v_md5 is distinct from 'db33bcc28bf3cb430f77463f47a2eb8b' then
    raise exception 'PIN: hr_regen_permille(integer) is neither its live image nor this file''s: md5 %', v_md5; end if;
end $mig$;

-- ── §1 THE RENAME, IN PLACE ──────────────────────────────────────────────────
-- the skill row first (hr_skill_level prices a combat skill by its catalogue `cat`)
insert into public.hr_skills (skill_id, name, cat) values ('inner_flame', 'Inner Flame', 'combat')
  on conflict (skill_id) do update set name = excluded.name, cat = excluded.cat;
update public.hr_start_skill_xp s set skill_id = 'inner_flame'
 where s.skill_id = 'prayer' and not exists (select 1 from public.hr_start_skill_xp x where x.skill_id = 'inner_flame');
delete from public.hr_start_skill_xp where skill_id = 'prayer';
-- every hero's progress, kept: the same XP under the skill's new name (no character can hold both: hr_apply refused
-- 'inner_flame' as an unknown skill until the row above)
update public.player_skills p set skill_id = 'inner_flame'
 where p.skill_id = 'prayer'
   and not exists (select 1 from public.player_skills q where q.user_id = p.user_id and q.slot = p.slot and q.skill_id = 'inner_flame');
do $mig$
begin
  if exists (select 1 from public.player_skills where skill_id = 'prayer') then
    raise exception 'RENAME: a hero holds both prayer and inner_flame rows; refusing to guess which is its progress'; end if;
end $mig$;
delete from public.hr_skills where skill_id = 'prayer';
-- the regen rate's limits (hr_regen_permille, restated below, reads the new keys)
update public.hr_hunt_limits l set key = replace(l.key, 'prayer_regen_', 'flame_regen_')
 where l.key in ('prayer_regen_k', 'prayer_regen_max_permille')
   and not exists (select 1 from public.hr_hunt_limits x where x.key = replace(l.key, 'prayer_regen_', 'flame_regen_'));
delete from public.hr_hunt_limits where key in ('prayer_regen_k', 'prayer_regen_max_permille');
-- the Shrine's speed perk (the edge's speedKeyFor('inner_flame') = 'flameSpeed')
update public.hr_room_perks set perks = (perks - 'prayerSpeed') || jsonb_build_object('flameSpeed', perks -> 'prayerSpeed')
 where perks ? 'prayerSpeed';
-- the held companion offer (the owl) the offer generator leaves alone
update public.hr_unlock_offers set req_skill = 'inner_flame' where req_skill = 'prayer';
-- the Great Hearth hosts the skill (hr_town_station_for: artisan inner_flame -> the hearth)
update public.hr_town_station_hosts h set skill = 'inner_flame'
 where h.skill = 'prayer'
   and not exists (select 1 from public.hr_town_station_hosts x where x.map_id = h.map_id and x.kind = h.kind and x.skill = 'inner_flame' and x.activity_id = h.activity_id);
delete from public.hr_town_station_hosts where skill = 'prayer';
-- the bench: every rite becomes the fuel it burns (src/data/hearth.js fuelRecipeId), and so does every pointer naming one
create temporary table hr_inner_flame_ids (old_id text primary key, new_id text not null) on commit drop;
insert into hr_inner_flame_ids (old_id, new_id) values
  ('bury_bones', 'fuel_bones'), ('bury_big', 'fuel_big_bones'), ('bury_dragon', 'fuel_dragon_bones'),
  ('bury_bone_chips', 'fuel_bone_chips'), ('consecrate_grave_dust', 'fuel_grave_dust'), ('offer_razor_claw', 'fuel_razor_claw'),
  ('scatter_vamp_dust', 'fuel_vamp_dust'), ('banish_demon_shard', 'fuel_demon_shard'), ('unbind_wraith_veil', 'fuel_wraith_veil'),
  ('consecrate_dragon_scale', 'fuel_dragon_scale'), ('release_lich_soul', 'fuel_lich_soul'), ('offer_ancient_claw', 'fuel_ancient_claw'),
  ('purge_void_chitin', 'fuel_void_chitin');
update public.hr_activities a set activity_id = m.new_id, req_skill = 'inner_flame'
  from hr_inner_flame_ids m
 where a.kind = 'artisan' and a.activity_id = m.old_id
   and not exists (select 1 from public.hr_activities x where x.kind = 'artisan' and x.activity_id = m.new_id);
delete from public.hr_activities a using hr_inner_flame_ids m where a.kind = 'artisan' and a.activity_id = m.old_id;
update public.hr_activities set req_skill = 'inner_flame' where req_skill = 'prayer';
update public.player_state ps set active_id = m.new_id from hr_inner_flame_ids m where ps.active_kind = 'artisan' and ps.active_id = m.old_id;
update public.player_state ps set last_activity_id = m.new_id from hr_inner_flame_ids m where ps.last_activity_kind = 'artisan' and ps.last_activity_id = m.old_id;

-- ── §2 THE BODIES THAT NAMED THE SKILL ──────────────────────────────────────
-- (a) hr_vitals_of: the regen rate reads Inner Flame.
CREATE OR REPLACE FUNCTION public.hr_vitals_of(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  with lv as (select public.hr_level_of(p_user, p_slot) as level),
       w as (select count(*) filter (where i.armour_weight = 'heavy')::int as heavy,
                    count(*) filter (where i.armour_weight = 'light')::int as light
               from public.player_equipment e join public.hr_items i on i.item_id = e.item_id
              where e.user_id = p_user and e.slot = p_slot),
       f as (select public.hr_skill_level('inner_flame', coalesce((select s.xp from public.player_skills s
                                                                    where s.user_id = p_user and s.slot = p_slot and s.skill_id = 'inner_flame'), 0)) as flame)
  select jsonb_build_object('level', lv.level, 'max_hp', public.hr_max_hp(lv.level, w.heavy),
                            'max_mana', public.hr_max_mana(lv.level, w.light), 'regen_pm', public.hr_regen_permille(f.flame))
    from lv, w, f
$function$;

-- (b) hr_regen_permille: the flame_regen_* limits; its parameter is renamed, so it is dropped and made again (owner-only,
--     re-revoked in §5). Its two callers (hr_vitals_of above, hr_hunt_section_view) call it positionally.
drop function if exists public.hr_regen_permille(integer);
CREATE FUNCTION public.hr_regen_permille(p_flame integer)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select 1000 + floor(public.hr_hunt_limit('flame_regen_max_permille')::bigint * p
                      / (p + public.hr_hunt_limit('flame_regen_k')))::int
    from (select greatest(1, coalesce(p_flame, 1))::bigint as p) x
$function$;

-- (c) hr_renown_of: the old-model combat level reads the renamed skill.
CREATE OR REPLACE FUNCTION public.hr_renown_of(p_user uuid, p_slot integer)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with ps as (
    select * from public.player_state
     where user_id = p_user and slot = coalesce(p_slot, 0)
  ),
  sk as (
    select skill_id, public.hr_level_from_xp(xp) as lv
      from public.player_skills
     where user_id = p_user and slot = coalesce(p_slot, 0)
  )
  select floor(
      -- totalLevel × 2 (sum of every skill level owned)
      coalesce((select sum(lv) from sk), 0)::float8 * 2::float8
      -- combatLevel × 2 (absent skills default to level 1, matching xp.levelOf)
    + public.hr_lb_combat_level(
        coalesce((select lv from sk where skill_id = 'attack'),    1),
        coalesce((select lv from sk where skill_id = 'strength'),  1),
        coalesce((select lv from sk where skill_id = 'defense'),   1),
        coalesce((select lv from sk where skill_id = 'hitpoints'), 1),
        coalesce((select lv from sk where skill_id = 'inner_flame'), 1),
        coalesce((select lv from sk where skill_id = 'ranged'),    1),
        coalesce((select lv from sk where skill_id = 'magic'),     1)
      )::float8 * 2::float8
      -- skill99 × 100 (each skill taken to 99)
    + (select count(*) from sk where lv >= 99)::float8 * 100::float8
      -- kill × 0.05 (lifetime aggregate; ev:kill_any == the stats.kills mirror)
      -- ⚠ R5: MINUS the client-credited part. hr_credit_kills adds to
      --   ev:kill_any and records the same delta under ev:kill_credited_any, so
      --   what remains is what the SERVER simulated. greatest(0, …) because the
      --   two rows are written by one statement pair but read independently.
    + greatest(0::bigint,
        coalesce((select value from public.player_progress
                   where user_id = p_user and slot = coalesce(p_slot, 0)
                     and kind = 'stat' and period_key = '' and key = 'ev:kill_any'), 0)
      - coalesce((select value from public.player_progress
                   where user_id = p_user and slot = coalesce(p_slot, 0)
                     and kind = 'stat' and period_key = '' and key = 'ev:kill_credited_any'), 0)
      )::float8
        * 0.05::float8
      -- bossKill × 5 (Slice 1 per-monster kills, filtered to is_boss monsters)
      -- ⚠ R5: PER MONSTER, minus that monster's credited count. The discount has
      --   to be per-id and not an aggregate, because only is_boss ids are scored
      --   here — subtracting a global credited total would let credits against a
      --   NON-boss target erase honest boss renown.
    + coalesce((select sum(greatest(0::bigint, pp.value - coalesce(cr.value, 0)))
                  from public.player_progress pp
                  join public.hr_activities a
                    on a.kind = 'combat' and a.is_boss
                   and a.activity_id = substring(pp.key from 17)
                  left join public.player_progress cr
                    on cr.user_id = pp.user_id and cr.slot = pp.slot
                   and cr.kind = 'stat' and cr.period_key = ''
                   and cr.key = 'ev:kill_credited:' || substring(pp.key from 17)
                 where pp.user_id = p_user and pp.slot = coalesce(p_slot, 0)
                   and pp.kind = 'stat' and pp.period_key = ''
                   and pp.key like 'ev:kill_monster:%'), 0)::float8 * 5::float8
      -- collection × 3 (Slice 2 shape: distinct looted items). No rows → 0.
    + (select count(*) from public.player_progress
        where user_id = p_user and slot = coalesce(p_slot, 0)
          and kind = 'stat' and period_key = '' and key like 'ev:loot:%'
          and value > 0)::float8 * 3::float8
      -- streakBest × 5 (Slice 3 shape: player_state.streak_days). Read via
      -- jsonb so this COMPILES AND RUNS whether or not the column exists yet;
      -- absent column → null → 0. ⚠ Slice 3 owns whether this is CURRENT or
      -- BEST streak; renown.js scores BEST. Flagged in the header.
    + coalesce((select (to_jsonb(ps.*)->>'streak_days')::float8 from ps), 0::float8) * 5::float8
      -- goldLog × 8 (only above 1,000 gold), from the server-owned ACCOUNT purse
      -- (2026-12-15-account-gold.sql: account_wallet.gold, the same on every hero of the account)
    + case when coalesce((select w.gold from public.account_wallet w where w.user_id = p_user), 0) > 1000
           then (ln((select w.gold from public.account_wallet w where w.user_id = p_user)::float8) / ln(10::float8) - 3::float8) * 8::float8
           else 0::float8 end
      -- questDone × 25 : NO SERVER MODEL → 0 (degraded, see header)
    + 0::float8
      -- bountyDone × 2 : NO SERVER MODEL → 0 (degraded, see header)
    + 0::float8
  )::bigint
$function$;

-- (d) hr_hunt_apply_member: THE DEATH LOSS. The combat skills a death costs come from the catalogue.
CREATE OR REPLACE FUNCTION public.hr_hunt_apply_member(p_instance uuid, p_user uuid, p_slot integer, p_session uuid, p_intent uuid, p_delta jsonb, p_hunt jsonb, p_analyzer jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- The combat skills a death costs (src/data/skills.js COMBAT_SKILLS: the catalogue's `combat` rows, so a renamed or new
  -- combat skill is priced with no body edit; 2027-01-31-inner-flame.sql); the Level is priced as `level`.
  c_xp_skills constant text[] := array(select k.skill_id from public.hr_skills k where k.cat = 'combat' order by k.skill_id);
  c_day_ms    constant bigint := 86400000;
  v_s     public.hunt_sessions%rowtype;
  v_ver   bigint;
  v_a     jsonb;
  v_h     jsonb;
  v_hunt  jsonb;
  v_to    timestamptz;
  v_dx    jsonb; v_nd int; v_el jsonb; v_k text; v_v jsonb;
  v_lost  jsonb := '{}'::jsonb; v_rate int;
  v_xp0   jsonb := '{}'::jsonb; v_ev0 bigint := 0;
  v_n bigint; v_cur bigint; v_lv int; v_lv0 int; v_fin int; v_fi int; v_r record;
  v_stam  jsonb; v_cap bigint; v_sat timestamptz; v_s0 bigint; v_e bigint;
  v_win bigint; v_paid bigint; v_nsw bigint; v_tick bigint;
  v_lx0 bigint; v_lxb bigint; v_base int; v_lvl int; v_xfloor bigint; v_vit jsonb; v_mana bigint; v_def bigint;
  v_buys jsonb; v_cost bigint := 0; v_units bigint := 0; v_items jsonb := '{}'::jsonb;
  v_price bigint; v_kind text; v_bk jsonb := '{}'::jsonb; v_day jsonb := '{}'::jsonb; v_ukind jsonb := '{}'::jsonb;
  v_cons int; v_off int; v_ammo_max int;
  v_gold_now bigint; v_cover jsonb; v_cgold bigint := 0; v_cunits bigint := 0; v_citems jsonb := '{}'::jsonb;
  v_unit bigint; v_avail bigint; v_supply jsonb; v_floor bigint;
  v_kills bigint; v_ground public.hr_hunt_grounds%rowtype; v_kmax bigint;
  v_dmax bigint; v_pass bigint;  -- DENSITY-BOUNDS: the catalogue's ceiling on any pick; what the ground presents at once
  v_vb_gold bigint; v_vb_xp bigint; v_vb_h bigint; v_vb_item text; v_magic bigint;
  v_unit_id int;
  v_bless jsonb;  -- the blessing hook's answer (hr_blessing_take, 2026-10-25-blessings.sql)
  v_loot  jsonb;  -- the loot filter's answer (hr_hunt_loot_rules, 2026-10-25-bag-rules.sql)
  v_end text; v_lk text; v_li text; v_home timestamptz; v_ok boolean;
begin
  if p_user is null or p_slot is null or p_session is null or p_intent is null
     or p_delta is null or jsonb_typeof(p_delta) <> 'object' or p_hunt is null or jsonb_typeof(p_hunt) <> 'object' then
    perform public.hr_reject('bad_arguments'); end if;
  -- (1) THE CHARACTER LOCK (hr_apply's key) and the session — of THIS instance.
  v_s := public.hr_hunt_lock(p_user, p_slot);
  if v_s.id is null or v_s.id <> p_session or v_s.instance_id <> p_instance then
    perform public.hr_reject('no_hunt', jsonb_build_object('session', p_session)); end if;
  -- (2a) THE STORED INDEX (a key that already landed falls through: hr_apply replays it).
  if jsonb_typeof(p_hunt->'swing_from') is distinct from 'number' or (p_hunt->>'swing_from') !~ '^[0-9]{1,15}$' then
    perform public.hr_reject('bad_swing'); end if;
  if (p_hunt->>'swing_from')::bigint <> v_s.swing_index
     and not exists (select 1 from public.player_intents i where i.user_id = p_user and i.intent_id = p_intent) then
    perform public.hr_reject('session_moved', jsonb_build_object('swing_index', v_s.swing_index)); end if;
  select version into v_ver from public.player_state where user_id = p_user and slot = p_slot;
  if v_ver is null then perform public.hr_reject('no_character'); end if;
  begin v_to := (p_hunt->>'to')::timestamptz;
  exception when others then perform public.hr_reject('bad_window'); end;
  if v_to is null then perform public.hr_reject('bad_window'); end if;

  -- (2b) THE PRICE OF THE DEATH, shape only: at most one death a settle (it ends the hunt),
  --      priced as `level` and the combat skills.
  v_dx := p_hunt->'death_xp';
  v_hunt := p_hunt - 'death_xp' - 'stamina' - 'buys' - 'cover' - 'unit_id' - 'tick_ms';
  v_nd := case when jsonb_typeof(p_delta->'deaths') = 'array' then jsonb_array_length(p_delta->'deaths') else 0 end;
  if v_dx is null and v_nd = 0 then v_dx := '[]'::jsonb; end if;
  if v_dx is null or jsonb_typeof(v_dx) <> 'array' or jsonb_array_length(v_dx) <> v_nd or v_nd > 1 then
    perform public.hr_reject('bad_death_xp'); end if;
  for v_el in select value from jsonb_array_elements(v_dx) loop
    if jsonb_typeof(v_el) <> 'object' then perform public.hr_reject('bad_death_xp'); end if;
    for v_k, v_v in select key, value from jsonb_each(v_el) loop
      if (v_k <> 'level' and v_k <> all (c_xp_skills)) or jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,12}$' then
        perform public.hr_reject('bad_death_xp'); end if;
      if (v_v #>> '{}')::bigint > 0 then
        v_lost := v_lost || jsonb_build_object(v_k, coalesce((v_lost->>v_k)::bigint, 0) + (v_v #>> '{}')::bigint);
      end if;
    end loop;
  end loop;
  if v_lost <> '{}'::jsonb then
    v_rate := public.hr_hunt_limit('death_xp_permille');
    v_base := public.hr_hunt_limit('death_xp_base');
    if v_rate is null or v_base is null then perform public.hr_reject('catalogue_missing'); end if;
  end if;
  -- (2c) THE STAMINA POOL, shape only; the start value is the DATABASE's.
  v_stam := p_hunt->'stamina';
  if v_stam is null or jsonb_typeof(v_stam) <> 'number' or (v_stam #>> '{}') !~ '^[0-9]{1,12}$' then
    perform public.hr_reject('bad_stamina'); end if;
  -- The cap over the window: premium_until only ever rises, so it is the
  -- larger of the caps at its two ends.
  v_cap := greatest(public.hr_stamina_cap(p_user, p_slot, v_s.settled_to), public.hr_stamina_cap(p_user, p_slot, v_to));
  if v_cap is null then perform public.hr_reject('catalogue_missing'); end if;
  select stamina_at, level_xp into v_sat, v_lx0 from public.player_state where user_id = p_user and slot = p_slot;
  if v_sat is not null and v_sat > v_s.settled_to then perform public.hr_reject('stamina_ahead'); end if;
  v_s0 := public.hr_stamina_of(p_user, p_slot, v_s.settled_to);
  -- (2d) THE STORE, shape only (re-priced and debited below).
  v_buys := coalesce(p_hunt->'buys', '{}'::jsonb);
  if jsonb_typeof(v_buys) <> 'object' or (select count(*) from jsonb_object_keys(v_buys)) > 20
     or exists (select 1 from jsonb_each(v_buys) x
                 where x.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number' or (x.value #>> '{}') !~ '^[0-9]{1,9}$') then
    perform public.hr_reject('bad_buys'); end if;
  v_cover := coalesce(p_hunt->'cover', '{}'::jsonb);
  if jsonb_typeof(v_cover) <> 'object' or (select count(*) from jsonb_object_keys(v_cover)) > 64
     or exists (select 1 from jsonb_each(v_cover) x
                 where x.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number' or (x.value #>> '{}') !~ '^[0-9]{1,9}$') then
    perform public.hr_reject('bad_cover'); end if;
  -- (2e) THE HERO'S UNIT and the analyzer tally, shape only.
  if p_hunt ? 'unit_id' and jsonb_typeof(p_hunt->'unit_id') <> 'null'
     and (jsonb_typeof(p_hunt->'unit_id') <> 'number' or (p_hunt->>'unit_id') !~ '^[0-9]{1,6}$') then
    perform public.hr_reject('bad_unit'); end if;
  v_unit_id := case when jsonb_typeof(p_hunt->'unit_id') = 'number' then (p_hunt->>'unit_id')::int end;
  if p_analyzer is not null and jsonb_typeof(p_analyzer) <> 'null'
     and (jsonb_typeof(p_analyzer) <> 'object'
          or exists (select 1 from jsonb_object_keys(p_analyzer) k where k not in ('dealt', 'taken', 'healed'))
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'dealt', '{}'::jsonb), array['byAbility', 'byElement'])
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'taken', '{}'::jsonb), array['byMonster', 'byElement'])
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'healed', '{}'::jsonb), array['bySource'])) then
    perform public.hr_reject('bad_analyzer'); end if;
  select * into v_ground from public.hr_hunt_grounds g where g.hunt_id = v_s.hunt_id;
  if not found then perform public.hr_reject('no_ground', jsonb_build_object('hunt', v_s.hunt_id)); end if;
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): what the ground can present at once is its as-built
  -- rows plus every pocket's pull at the density the SERVER froze for this instance when it opened
  -- (hunt_instances.density, hr_hunt_density_freeze; the engine plays exactly it, hr_hunt_instance_read).
  -- An instance opened before the freeze existed reads the catalogue's ceiling (density_max). Never a
  -- client or edge number, never today's action-set row.
  v_dmax := coalesce((select i.density from public.hunt_instances i where i.id = p_instance)::bigint,
                     public.hr_hunt_limit('density_max'));
  if v_dmax is null or v_dmax < 0 then perform public.hr_reject('catalogue_missing', jsonb_build_object('limit', 'density_max')); end if;
  v_pass := v_ground.spawns::bigint + v_ground.pockets::bigint * v_dmax;
  select coalesce(jsonb_object_agg(skill_id, xp), '{}'::jsonb) into v_xp0
    from public.player_skills where user_id = p_user and slot = p_slot and skill_id = any (c_xp_skills);
  select coalesce(max(id), 0) into v_ev0 from public.hunt_session_events where session_id = p_session;

  -- (3) THE VALUE HALF: hr_apply, every row it writes stamped with the session.
  perform set_config('hr.hunt_session', p_session::text, true);
  v_a := public.hr_apply(p_user, p_slot, v_ver, p_intent, p_delta);
  perform set_config('hr.hunt_session', '', true);
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    perform public.hr_reject(coalesce(v_a->>'error', 'apply_failed'), v_a);
  end if;
  if coalesce(v_a->>'replayed', 'false') = 'true' then
    return jsonb_build_object('ok', true, 'replayed', true);
  end if;

  -- (4) THE KILL BOUND: the kills THIS settle's stamped rows journal, held to
  --     what the ground presents at once (v_pass) times the respawns the window's time admits.
  v_win := floor(extract(epoch from (v_to - v_s.settled_to)) * 1000)::bigint;
  select coalesce(sum(case when jsonb_typeof(l.meta->'kills') = 'number' then (l.meta->>'kills')::numeric else 0 end), 0)::bigint
    into v_kills
    from public.player_ledger l
   where l.session_id = p_session and l.kind <> 'hunt'
     and l.id > coalesce((select t.ledger_hwm from public.hunt_session_tally t where t.session_id = p_session), 0)
     and l.at >= now() - interval '25 hours';
  v_kmax := v_pass * (greatest(v_win, 0) / v_ground.respawn_ms + 2);
  if v_kills > v_kmax then
    perform public.hr_reject('kills_over', jsonb_build_object('kills', v_kills, 'max', v_kmax, 'window_ms', v_win, 'pass', v_pass));
  end if;
  -- (4c) THE VALUE BOUND, against the ground's own monsters.
  v_vb_h := public.hr_hunt_limit('value_headroom');
  select coalesce(max(b.gold_max), 0), coalesce(max(b.xp_max), 0) into v_vb_gold, v_vb_xp
    from public.hr_hunt_kill_bounds b
   where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id);
  -- THE MAGIC BOUND reads the hero's OWN max mana (hr_vitals_of): a full pool, then its regen at the
  -- Inner Flame rate plus the most a drink every lane restores, every minute; x the largest ability
  -- multiplier (hr_hunt_abilities) on top of the per-mana rate.
  v_vit := public.hr_vitals_of(p_user, p_slot);
  v_mana := (v_vit->>'max_mana')::bigint;
  v_magic := ceil((v_mana + (greatest(v_win, 0) / 60000 + 1)
                   * (ceil(v_mana * public.hr_hunt_limit('mana_regen_pct_min') * (v_vit->>'regen_pm')::int / 100000.0)
                      + public.hr_hunt_limit('drink_mana_per_min_max')))
                  * public.hr_hunt_limit('magic_xp_permille') / 1000.0
                  * greatest(1000, coalesce(public.hr_hunt_limit('magic_xp_mult_max'), 1000)) / 1000.0)::bigint;
  -- THE DEFENSE BOUND: every swing interval of the window, every foe the ground can engage at once
  -- (what it presents at once, at most a full box twice over or the density ceiling), at the highest level it spawns, the block multiple.
  v_def := ceil((greatest(v_win, 0) / public.hr_hunt_limit('swing_interval_ms') + 1)
                * least(v_pass, greatest(v_dmax, 16))
                * coalesce((select max(public.hr_monster_level(sp.monster_id)) from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id), 0)
                * public.hr_hunt_limit('defense_xp_level_permille') / 1000.0 * public.hr_hunt_limit('block_mult'))::bigint;
  if jsonb_typeof(p_delta->'gold') = 'number' and (p_delta->>'gold')::numeric > v_kills * v_vb_gold * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'gold', 'gold', p_delta->'gold', 'kills', v_kills,
      'max', v_kills * v_vb_gold * v_vb_h)); end if;
  if jsonb_typeof(p_delta->'xp') = 'object'
     and (select coalesce(sum(greatest(0, (e.value #>> '{}')::numeric)), 0) from jsonb_each(p_delta->'xp') e
           where jsonb_typeof(e.value) = 'number') > ((v_kills + v_pass) * v_vb_xp + v_magic + v_def) * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'xp', 'kills', v_kills, 'pass', v_pass,
      'max', ((v_kills + v_pass) * v_vb_xp + v_magic + v_def) * v_vb_h)); end if;
  -- THE LEVEL XP BOUND (kills only): the journalled kills x the most one kill of the ground pays.
  if jsonb_typeof(p_delta->'level_xp') = 'number' and (p_delta->>'level_xp')::numeric > v_kills * v_vb_xp * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'level_xp', 'level_xp', p_delta->'level_xp', 'kills', v_kills,
      'max', v_kills * v_vb_xp * v_vb_h)); end if;
  if jsonb_typeof(p_delta->'items') = 'object' then
    select e.key into v_vb_item from jsonb_each(p_delta->'items') e
     where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric > 0
       and (e.value #>> '{}')::numeric > v_kills * coalesce((
             select max(coalesce((b.drops->>e.key)::numeric, 0)) from public.hr_hunt_kill_bounds b
              where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id)), 0)
     limit 1;
    if v_vb_item is not null then
      perform public.hr_reject('value_over', jsonb_build_object('what', 'item', 'item', left(v_vb_item, 64),
        'qty', p_delta->'items'->v_vb_item, 'kills', v_kills)); end if;
  end if;

  -- (5a) THE STAMINA POOL, RE-PROVED AND WRITTEN (before the session half,
  --      whose `stamina` end proof reads this row). Every swing of a hunt drains
  --      (there is no knockout to rest in): P = swings x interval, the window is
  --      P to the millisecond, and E = max(0, S0 − P) exactly; an empty pool walks
  --      no swing.
  if jsonb_typeof(p_hunt->'paid_ms') is distinct from 'number'
     or jsonb_typeof(p_hunt->'swing_to') is distinct from 'number'
     or (p_hunt->>'paid_ms')::numeric not between 0 and 1e12
     or (p_hunt->>'swing_to')::numeric not between 0 and 1e15 then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'shape')); end if;
  v_e    := (v_stam #>> '{}')::bigint;
  v_paid := (p_hunt->>'paid_ms')::numeric::bigint;
  v_nsw  := (p_hunt->>'swing_to')::numeric::bigint - v_s.swing_index;
  if v_win < 0 or v_nsw < 0 or v_paid > v_win or v_paid < v_win - 1 then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'window', 'window_ms', v_win, 'paid_ms', v_paid)); end if;
  v_tick := public.hr_hunt_limit('swing_interval_ms');
  if v_tick is null or v_tick <= 0 or v_paid <> v_nsw * v_tick then
    perform public.hr_reject('bad_clock', jsonb_build_object('paid_ms', v_paid, 'swings', v_nsw, 'interval_ms', v_tick)); end if;
  if v_e <> greatest(0, v_s0 - v_paid) then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'bound', 'from_ms', v_s0, 'ms', v_e, 'paid_ms', v_paid)); end if;
  if v_s0 <= 0 and v_nsw > 0 then perform public.hr_reject('end_missing', jsonb_build_object('reason', 'stamina')); end if;
  update public.player_state set stamina_ms = v_e, stamina_at = v_to where user_id = p_user and slot = p_slot;

  -- (5b) THE STORE: sell-to-cover first, then every store use, priced by the
  --      catalogue, under the hero's own setting, capped, debited, journalled.
  v_supply := public.hr_hunt_supply_of(p_user, p_slot, v_s.preset);
  v_floor := (v_supply->>'gold_floor')::bigint;
  if v_cover <> '{}'::jsonb then
    for v_k, v_v in select key, value from jsonb_each(v_cover) order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      select c.unit into v_unit from public.hr_hunt_cover_items c where c.item_id = v_k;
      if v_unit is null then perform public.hr_reject('not_coverable', jsonb_build_object('item', v_k)); end if;
      -- NOTHING SELLS A LOCKED ITEM (hook: hr_item_locked; hr_hunt_member_read never offers one).
      if public.hr_item_locked(p_user, p_slot, v_k) then perform public.hr_reject('item_locked', jsonb_build_object('item', v_k)); end if;
      select least(
               coalesce((select pi.qty from public.player_inventory pi where pi.user_id = p_user and pi.slot = p_slot and pi.item_id = v_k), 0),
               coalesce((select (t.loot->>v_k)::numeric from public.hunt_session_tally t where t.session_id = p_session), 0)::bigint
               + greatest(0, coalesce(case when jsonb_typeof(p_delta->'items'->v_k) = 'number' then (p_delta->'items'->>v_k)::numeric end, 0))::bigint
               - coalesce((select (t.covered->>v_k)::bigint from public.hunt_session_tally t where t.session_id = p_session), 0))
        into v_avail;
      if v_n > coalesce(v_avail, 0) then
        perform public.hr_reject('cover_over', jsonb_build_object('item', v_k, 'units', v_n, 'avail', v_avail)); end if;
      delete from public.player_inventory where user_id = p_user and slot = p_slot and item_id = v_k and qty = v_n;
      update public.player_inventory set qty = qty - v_n where user_id = p_user and slot = p_slot and item_id = v_k;
      v_citems := v_citems || jsonb_build_object(v_k, jsonb_build_object('qty', v_n, 'unit', v_unit));
      v_cgold := v_cgold + v_n * v_unit;
      v_cunits := v_cunits + v_n;
      v_unit := null; v_avail := null;
    end loop;
    if v_cgold > 0 then
      -- THE ACCOUNT PURSE (2026-12-15-account-gold.sql), locked by hr_hunt_apply_instance.
      v_gold_now := public.hr_purse_move(p_user, v_cgold, 0);
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id, purse)
        values (p_user, p_slot, 'hunt', 'vendor_cover', v_cgold, -v_cunits,
                jsonb_build_object('reason', 'vendor_cover', 'items', v_citems, 'gold', v_cgold), p_session, v_gold_now);
      update public.hunt_session_tally t
         set covered = public.hr_jsonb_add(t.covered, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                          from jsonb_each(v_citems) i)),
             cover_gold = t.cover_gold + v_cgold
       where t.session_id = p_session;
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'cover', v_to, jsonb_build_object('n', v_cunits, 'gold', v_cgold));
    end if;
    -- Loot is sold only to pay the store: a window that sold and bought nothing is refused.
    if v_buys = '{}'::jsonb then perform public.hr_reject('cover_unspent'); end if;
  end if;
  -- THE LOOT FILTER (hook: hr_hunt_loot_rules): sell / ignore on pickup, online or not, after cover.
  v_loot := public.hr_hunt_loot_rules(p_user, p_slot, p_session, p_intent, p_delta->'items', v_to);
  perform set_config('hr.hunt_session', '', true);
  v_cons := (select l.ms from public.hr_hunt_lanes l where l.lane = 'consumable' and l.active);
  v_off  := (select l.ms from public.hr_hunt_lanes l where l.lane = 'offense' and l.active);
  v_ammo_max := public.hr_hunt_limit('ability_ammo_max');
  if v_cons is null or v_off is null or v_ammo_max is null then perform public.hr_reject('catalogue_missing'); end if;
  -- Own uses per kind (the bag lines the session half will debit).
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_ukind from (
    select q.kind as k, sum((u.value #>> '{}')::bigint) as n
      from jsonb_each(case when jsonb_typeof(p_hunt->'uses') = 'object' then p_hunt->'uses' else '{}'::jsonb end) u
      join public.hr_hunt_supplies q on q.item_id = u.key
     where jsonb_typeof(u.value) = 'number' group by q.kind) a;
  if v_buys <> '{}'::jsonb then
    for v_k, v_v in select key, value from jsonb_each(v_buys) order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      select q.price, q.kind into v_price, v_kind from public.hr_hunt_basic_supplies q where q.basic_id = v_k;
      if v_price is null then perform public.hr_reject('not_for_sale', jsonb_build_object('item', v_k)); end if;
      -- THE STORE IS USED ONLY ON THE HERO'S OWN SETTING (spec §3.4 #5-7).
      if not (v_supply->>'supply_source' = 'store' or v_supply->>'on_empty' = 'switch') then
        perform public.hr_reject('store_off', jsonb_build_object('item', v_k)); end if;
      v_bk := v_bk || jsonb_build_object(v_kind, coalesce((v_bk->>v_kind)::bigint, 0) + v_n);
      v_items := v_items || jsonb_build_object(v_k, jsonb_build_object('qty', v_n, 'price', v_price));
      v_cost := v_cost + v_n * v_price;
      v_units := v_units + v_n;
      v_price := null; v_kind := null;
    end loop;
    select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_day from (
      select q.kind as k, sum((x.value->>'qty')::bigint) as n
        from public.player_ledger l, jsonb_each(case when jsonb_typeof(l.meta->'items') = 'object' then l.meta->'items' else '{}'::jsonb end) x
        join public.hr_hunt_basic_supplies q on q.basic_id = x.key
       where l.user_id = p_user and l.slot = p_slot and l.kind = 'hunt' and l.intent = 'supply_buy'
         and l.at >= public.hr_utc_day_start(now()) group by q.kind) a;
    -- PER UTC DAY: the food-and-drink lane's buys, and the shots, over 24 h.
    if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_day->>'heal')::bigint, 0)
         + coalesce((v_bk->>'mana')::bigint, 0) + coalesce((v_day->>'mana')::bigint, 0) > c_day_ms / v_cons + 1
       or coalesce((v_bk->>'ammo')::bigint, 0) + coalesce((v_day->>'ammo')::bigint, 0)
            > c_day_ms / v_tick + 1 + (c_day_ms / v_off + 1) * (v_ammo_max + 1) then
      perform public.hr_reject('too_many_buys', jsonb_build_object('why', 'day', 'bought', v_bk, 'today', v_day)); end if;
    -- THE STORE BILL IS PAID FROM THE ACCOUNT PURSE AFTER EVERY MEMBER'S CREDITS
    -- (2026-12-15-account-gold.sql). This member's bill rides back to hr_hunt_apply_instance
    -- (`_purse`, stripped there): once every member of the instance has applied, it debits
    -- each bill under the account's row lock (never below 0), journals its supply_buy row
    -- and holds each account to the lowest floor of its heroes that bought. Heroes of one
    -- account in one instance spend the ONE purse in time order (the engine shares it), so
    -- only that whole-window order can be re-proved; any member-by-member order could dip.
    if v_cost > 0 then
      update public.hunt_session_tally t
         set bought = public.hr_jsonb_add(t.bought, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                        from jsonb_each(v_items) i)),
             supply_gold = t.supply_gold + v_cost
       where t.session_id = p_session;
    end if;
  end if;
  -- PER WINDOW, OWN + STORE TOGETHER: food and drink share ONE lane (consumable,
  -- consumables.js laneMs); a shot or a rune is at most one a swing (the ranged
  -- basic) plus every ability cast's on the offense lane.
  if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_bk->>'mana')::bigint, 0) + coalesce((v_ukind->>'heal')::bigint, 0)
       + coalesce((v_ukind->>'mana')::bigint, 0) > v_win / v_cons + 1
     or coalesce((v_bk->>'ammo')::bigint, 0) + coalesce((v_ukind->>'ammo')::bigint, 0)
       > v_nsw + 1 + (v_win / v_off + 1) * (v_ammo_max + 1) then
    perform public.hr_reject('too_many_uses', jsonb_build_object('bought', v_bk, 'used', v_ukind, 'window_ms', v_win));
  end if;

  -- (5) THE SESSION HALF (2026-10-23-hunt-supply-ledger.sql).
  -- The session half's gold_out proof reads the purse less this window's own bill (paid later).
  perform set_config('hr.purse_pending', v_cost::text, true);
  v_h := public.hr_hunt_settle_session(p_user, p_slot, p_session, v_hunt);
  perform set_config('hr.purse_pending', '', true);
  if coalesce(v_h->>'ok', 'true') = 'false' then perform public.hr_reject(coalesce(v_h->>'error', 'hunt_settle_refused'), v_h); end if;
  -- STAMINA LOW: once per hunt, when the pool this window left is at or under the limits row.
  if v_e <= coalesce(public.hr_hunt_limit('stamina_low_min'), 0)::bigint * 60000
     and not exists (select 1 from public.hunt_session_events e where e.session_id = p_session and e.type = 'stamina_low') then
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      values (p_session, p_user, p_slot, 'stamina_low', v_to, jsonb_build_object('n', v_e / 60000));
  end if;

  -- BLESSINGS (hook: hr_blessing_take): the death keeps only the unprotected share of its
  -- loss (Level and skills); the tiers it used (held since before the window began) are used up.
  if v_nd > 0 then
    v_bless := public.hr_blessing_take(p_user, p_slot, p_session, v_dx, v_s.settled_to);
    if v_bless is not null then v_dx := v_bless->'dx'; v_lost := v_bless->'lost'; end if;
  end if;
  -- (6) THE PRICE OF THE DEATH, RE-CHECKED AND DEBITED (Tyler 2026-10-19, CORE_MODEL.md §6):
  --     the LEVEL loses at most death_xp_permille of its total XP (death_xp_base 0) or of
  --     its current Level's span (1), the debit never below the current Level's start;
  --     each combat skill loses at most the permille of its progress into its level.
  --     Bounds are read on the CURRENT values, which only grew since the death.
  if v_lost <> '{}'::jsonb then
    for v_k, v_n in select key, (value #>> '{}')::bigint from jsonb_each(v_lost) order by key loop
      if v_k = 'level' then
        select level_xp into v_cur from public.player_state where user_id = p_user and slot = p_slot for update;
        v_lvl := public.hr_char_level(v_cur);
        v_xfloor := public.hr_char_xp_for_level(v_lvl);
        v_lxb := case when v_base = 1 then public.hr_char_xp_for_level(v_lvl + 1) - v_xfloor else v_cur end;
        if v_n > floor(v_lxb * v_rate / 1000.0) or v_cur - v_n < v_xfloor then
          perform public.hr_reject('death_xp_over', jsonb_build_object('skill', 'level', 'level', v_lvl)); end if;
        update public.player_state set level_xp = level_xp - v_n where user_id = p_user and slot = p_slot;
        continue;
      end if;
      select xp into v_cur from public.player_skills where user_id = p_user and slot = p_slot and skill_id = v_k for update;
      if v_cur is null then perform public.hr_reject('bad_death_xp', jsonb_build_object('skill', v_k)); end if;
      v_lv := public.hr_skill_level(v_k, v_cur);
      v_xfloor := public.hr_skill_xp_for_level(v_k, v_lv);
      if v_n > floor((v_cur - v_xfloor) * v_rate / 1000.0) or v_cur - v_n < v_xfloor then
        perform public.hr_reject('death_xp_over', jsonb_build_object('skill', v_k, 'level', v_lv)); end if;
      update public.player_skills set xp = xp - v_n where user_id = p_user and slot = p_slot and skill_id = v_k;
    end loop;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
      values (p_user, p_slot, 'hunt', 'death_xp',
              jsonb_build_object('reason', 'death_xp', 'xp', v_lost, 'deaths', v_nd, 'permille', v_rate, 'base', v_base), p_session);
    for v_r in select e.id, e.data->>'skill' as sk, (e.data->>'level')::int as lv
                 from public.hunt_session_events e
                where e.session_id = p_session and e.id > v_ev0 and e.type = 'level_up' and v_lost ? (e.data->>'skill') loop
      if v_r.sk = 'level' then
        v_fin := public.hr_char_level((select level_xp from public.player_state where user_id = p_user and slot = p_slot));
        v_lv0 := public.hr_char_level(coalesce(v_lx0, 0));
      else
        v_fin := public.hr_skill_level(v_r.sk, (select xp from public.player_skills where user_id = p_user and slot = p_slot and skill_id = v_r.sk));
        v_lv0 := public.hr_skill_level(v_r.sk, coalesce((v_xp0->>v_r.sk)::bigint, 0));
      end if;
      if v_r.lv > v_fin then
        if v_fin > v_lv0 then update public.hunt_session_events set data = data || jsonb_build_object('level', v_fin) where id = v_r.id;
        else delete from public.hunt_session_events where id = v_r.id; end if;
      end if;
    end loop;
  end if;
  v_fi := 0;
  for v_r in select e.id from public.hunt_session_events e
              where e.session_id = p_session and e.id > v_ev0 and e.type = 'death' order by e.id loop
    v_el := coalesce(v_dx->v_fi, '{}'::jsonb);
    update public.hunt_session_events
       set data = data || jsonb_build_object('xp_lost', v_el, 'xp', (select coalesce(sum((x.value #>> '{}')::bigint), 0) from jsonb_each(v_el) x))
     where id = v_r.id;
    v_fi := v_fi + 1;
  end loop;

  -- (7) AN AUTOMATIC END RESUMES WHAT THE CHARACTER WAS DOING (after the walk home).
  v_end := v_h->>'ended';
  if v_end is not null and coalesce((select r.resumes from public.hr_hunt_end_reasons r where r.reason = v_end), false) then
    select ps.last_activity_kind, ps.last_activity_id into v_lk, v_li from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
    select h.ended_at + make_interval(secs => coalesce((select t.travel_s from public.hr_hunt_travel t where t.hunt_id = h.hunt_id), 0))
      into v_home from public.hunt_sessions h where h.id = p_session;
    v_ok := v_lk is not null and v_home is not null
      and exists (select 1 from public.hr_activities a where a.kind = v_lk and a.activity_id = v_li)
      and not exists (select 1 from public.hr_activities a
                       where a.kind = v_lk and a.activity_id = v_li and a.req_skill is not null and a.req_lv is not null
                         and coalesce((select public.hr_skill_level(a.req_skill, sk.xp) from public.player_skills sk
                                        where sk.user_id = p_user and sk.slot = p_slot and sk.skill_id = a.req_skill), 1) < a.req_lv)
      -- TUTORIAL-FACTS (2027-01-20-tutorial-facts.sql): a bench resumes only with the inputs for one action; else idle.
      and public.hr_resume_has_inputs(p_user, p_slot, v_lk, v_li);
    if v_ok then
      update public.player_state
         set active_kind = v_lk, active_id = v_li, active_since = v_home, accrued_to = v_home,
             fight = '{}'::jsonb, version = version + 1, updated_at = now()
       where user_id = p_user and slot = p_slot;
      insert into public.hr_return_anchor (user_id, slot, real_return_at, updated_at)
        values (p_user, p_slot, v_home, now())
        on conflict (user_id, slot) do update
          set real_return_at = greatest(public.hr_return_anchor.real_return_at, excluded.real_return_at), updated_at = now();
    end if;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
      values (p_user, p_slot, 'hunt', 'resume',
              jsonb_build_object('reason', v_end, 'resumed', v_ok, 'kind', v_lk, 'id', v_li, 'at', v_home), p_session);
    update public.hunt_session_events e
       set data = e.data || jsonb_build_object('resume', case when v_ok then jsonb_build_object('kind', v_lk, 'id', v_li, 'at', v_home) else null end)
     where e.session_id = p_session and e.id > v_ev0 and e.type = 'ended';
  end if;
  -- THE ANALYZER TALLY (display) and THE HERO'S UNIT (null once it has left).
  if p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' then
    update public.hunt_session_tally t
       set dealt = public.hr_hunt_tally_add(t.dealt, coalesce(p_analyzer->'dealt', '{}'::jsonb)),
           taken = public.hr_hunt_tally_add(t.taken, coalesce(p_analyzer->'taken', '{}'::jsonb)),
           healed = public.hr_hunt_tally_add(t.healed, coalesce(p_analyzer->'healed', '{}'::jsonb))
     where t.session_id = p_session;
  end if;
  update public.hunt_sessions set unit_id = case when ended_at is null then v_unit_id end where id = p_session;
  -- The debited (blessed) loss of the death travels back with the answer.
  return coalesce(v_h, '{}'::jsonb) || case when v_nd > 0 then jsonb_build_object('death_xp', v_dx) else '{}'::jsonb end
    -- THE BILL hr_hunt_apply_instance pays (and strips before any answer leaves it).
    || case when v_cost > 0 then jsonb_build_object('_purse', jsonb_build_object('cost', v_cost, 'units', v_units,
                                   'items', v_items, 'floor', v_floor)) else '{}'::jsonb end;
end $function$;

-- (e) hr_apply: ONE anchored edit (RESTATEMENT-DEBT-ACK above): the away-span's sim XP sums the catalogue's combat skills.
do $mig$
declare
  c_old constant text := 'where key = any(array[''melee'',''ranged'',''magic'',''defense'',''prayer''])))';
  c_new constant text := 'where key = any(array(select k.skill_id from public.hr_skills k where k.cat = ''combat''))))';
  v_def text;
begin
  v_def := pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure);
  if strpos(v_def, c_new) > 0 and strpos(v_def, c_old) = 0 then raise notice 'hr_apply: the away-span list already reads the catalogue'; return; end if;
  if array_length(string_to_array(v_def, c_old), 1) <> 2 then
    raise exception 'hr_apply: the away-span skill list is not exactly once in the live body - refusing to patch blind'; end if;
  execute replace(v_def, c_old, c_new);
end $mig$;

-- ── §3 THE HEARTH'S TABLES ──────────────────────────────────────────────────
-- CATALOGUE (2027-01-31-hearth-catalogue.generated.sql fills them from src/data/hearth.js; never by hand). No foreign key to
-- hr_items: its generated full replace deletes and re-inserts every item; the catalogue's self-check asserts each exists.
create table if not exists public.hr_hearth_named (
  item_id text primary key check (item_id ~ '^[a-z0-9_]{1,64}$'),
  xp      int  not null check (xp between 1 and 1000000),       -- the Inner Flame XP the burn PAYS (after the pacing dial)
  req_lv  int  not null check (req_lv between 1 and 500),       -- the Inner Flame level it needs
  flame   text not null check (flame ~ '^[a-z0-9_]{1,32}$'),    -- the colour the square burns (src/data/hearth.js FLAMES)
  secs    int  not null check (secs between 10 and 600)         -- for how long
);
create table if not exists public.hr_hearth_rule (
  id      boolean primary key default true check (id),
  per_day int not null check (per_day between 1 and 100),       -- named fuels one hero may burn a UTC day
  queue_s int not null check (queue_s between 60 and 3600)      -- how far ahead the square's colours may be booked
);
-- STATE: one row per named fuel burnt. Written ONLY by hr_hearth_burn; read by hr_hearth_flame_of.
create table if not exists public.hearth_flames (
  id         bigint generated always as identity primary key,
  map_id     text        not null check (map_id ~ '^[a-z0-9_]{1,40}$'),
  item_id    text        not null check (item_id ~ '^[a-z0-9_]{1,64}$'),
  flame      text        not null check (flame ~ '^[a-z0-9_]{1,32}$'),
  user_id    uuid        not null,
  slot       smallint    not null check (slot between 0 and 32),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  message_id uuid,                        -- the system chat line it posted (null for a quiet hero)
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
create index if not exists hearth_flames_town on public.hearth_flames (map_id, ends_at desc);
create index if not exists hearth_flames_hero on public.hearth_flames (user_id, slot, created_at desc);
comment on table public.hearth_flames is
  '2027-01-31-inner-flame.sql: one row per named fuel burnt in the Great Hearth: the colour the town''s square burns and when. '
  'Written only by hr_hearth_burn (definer); read by hr_hearth_flame_of.';
do $mig$
declare v_t text;
begin
  foreach v_t in array array['hr_hearth_named', 'hr_hearth_rule', 'hearth_flames'] loop
    execute format('alter table public.%I enable row level security', v_t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', v_t);
  end loop;
end $mig$;

-- ── §4 THE VERB AND THE READ ────────────────────────────────────────────────
-- The colour burning now in a town's square, or null.
create or replace function public.hr_hearth_flame_of(p_map text)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $fn$
  select jsonb_build_object(
           'flame', f.flame, 'item', f.item_id,
           'by', case when coalesce(ps.presence_quiet, false) then null else left(public.hr_character_name(f.user_id, f.slot), 24) end,
           'from_ms', floor(extract(epoch from f.starts_at) * 1000)::bigint,
           'until_ms', floor(extract(epoch from f.ends_at) * 1000)::bigint,
           'now_ms', floor(extract(epoch from now()) * 1000)::bigint,
           'queued', (select count(*)::int from public.hearth_flames q where q.map_id = p_map and q.starts_at > now()))
    from public.hearth_flames f
    left join public.player_state ps on ps.user_id = f.user_id and ps.slot = f.slot
   where f.map_id = p_map and f.starts_at <= now() and f.ends_at > now()
   order by f.starts_at desc
   limit 1
$fn$;

-- Burn ONE named fuel in the Great Hearth.
create or replace function public.hr_hearth_burn(p_slot int, p_item text, p_idem uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare
  c_per_min constant int := 10;
  v_uid   uuid := auth.uid();
  v_verb  text;
  v_r     jsonb;
  v_ver   bigint;
  v_hunt  text;
  v_fuel  public.hr_hearth_named%rowtype;
  v_rule  public.hr_hearth_rule%rowtype;
  v_have  bigint; v_lv int; v_n int;
  v_map   text;
  v_start timestamptz; v_end timestamptz;
  v_a     jsonb; v_quiet boolean; v_msg uuid; v_place jsonb; v_me jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_item is null or p_item !~ '^[a-z0-9_]{1,64}$' then
    return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'not_a_fuel')); end if;
  v_verb := 'hearth_burn:' || p_item;
  -- A RETRY of a decided key answers that decision (a burn already made answers ok and burns nothing again)
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('hearth_burn', p_slot, v_r); end if;
  if not public.hr_rate_ok(v_uid, 'hearth_burn', c_per_min, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- THE HERO: its lock, its row, its open hunt (the Hearth is in town)
  perform public.hr_hunt_lock(v_uid, p_slot);
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  select h.hunt_id into v_hunt from public.hunt_sessions h where h.user_id = v_uid and h.slot = p_slot and h.ended_at is null;
  if v_hunt is not null then
    return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'hunting', 'hunt', v_hunt)); end if;
  -- THE CATALOGUE: a named fuel, and the rule
  select * into v_fuel from public.hr_hearth_named where item_id = p_item;
  if not found then return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'not_a_fuel')); end if;
  select * into v_rule from public.hr_hearth_rule where id;
  v_map := (select m.map_id from public.hr_town_maps m where m.main);
  if not found or v_rule.id is null or v_map is null then
    return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  -- THE HERO HOLDS ONE, IN ITS BAG (the item menu is the bag's)
  select qty into v_have from public.player_inventory where user_id = v_uid and slot = p_slot and item_id = p_item;
  if coalesce(v_have, 0) < 1 then return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'no_item')); end if;
  -- ITS INNER FLAME, as the server holds it
  v_lv := public.hr_skill_level('inner_flame', coalesce((select s.xp from public.player_skills s
                                                          where s.user_id = v_uid and s.slot = p_slot and s.skill_id = 'inner_flame'), 0));
  if v_lv < v_fuel.req_lv then
    return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'flame_too_low', 'need', v_fuel.req_lv, 'have', v_lv)); end if;
  -- THE HERO'S DAY (the server's UTC day)
  select count(*) into v_n from public.hearth_flames f
   where f.user_id = v_uid and f.slot = p_slot and f.created_at >= public.hr_utc_day_start(now());
  if v_n >= v_rule.per_day then
    return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'hearth_limit', 'per_day', v_rule.per_day)); end if;
  -- THE TOWN'S HEARTH: one burn at a time per town; a colour queues behind the last one, up to queue_s ahead
  perform pg_advisory_xact_lock(hashtextextended('hr:hearth:' || v_map, 0));
  v_start := greatest(now(), coalesce((select max(f.ends_at) from public.hearth_flames f where f.map_id = v_map), now()));
  if v_start > now() + make_interval(secs => v_rule.queue_s) then
    return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'hearth_busy',
      'wait_s', ceil(extract(epoch from (v_start - now())) - v_rule.queue_s)::int)); end if;
  v_end := v_start + make_interval(secs => v_fuel.secs);
  -- THE BURN: the item and the XP, journalled, exactly once on this key
  v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
           'items', jsonb_build_object(p_item, -1),
           'xp', jsonb_build_object('inner_flame', v_fuel.xp),
           'journal', jsonb_build_object('kind', 'craft', 'intent', v_verb,
                                         'meta', jsonb_build_object('reason', 'hearth_named', 'flame', v_fuel.flame, 'secs', v_fuel.secs,
                                                                    'from', v_start, 'map', v_map))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    return public.hr_note_rejection('hearth_burn', p_slot, v_a || jsonb_build_object('ok', false)); end if;
  -- THE SQUARE: a system line naming the burner (never a quiet hero), then the colour
  select coalesce(ps.presence_quiet, false) into v_quiet from public.player_state ps where ps.user_id = v_uid and ps.slot = p_slot;
  if not v_quiet then
    v_msg := gen_random_uuid();
    -- from_name is stamped by hr_chat_name_authority (the character's name); the placeholder never shows
    insert into public.chat_messages (id, channel, from_id, from_name, from_slot, body)
    values (v_msg, 'system', v_uid, 'Adventurer', p_slot, 'fed the Great Hearth a [[item:' || p_item || ']].');
  end if;
  insert into public.hearth_flames (map_id, item_id, flame, user_id, slot, starts_at, ends_at, message_id)
  values (v_map, p_item, v_fuel.flame, v_uid, p_slot, v_start, v_end, v_msg);
  -- THE HERO WALKS TO THE FIRE: a free fuel stand (display presence; no output waits on it)
  if public.hr_flag_on('town_presence') then
    insert into public.town_seen as ts (user_id, slot, seen_at) values (v_uid, p_slot, now())
      on conflict (user_id, slot) do update set seen_at = excluded.seen_at;
    v_place := public.hr_town_place(v_uid, p_slot, v_map, 'hearth', 'visit');
    if v_place->>'ok' = 'true' then v_me := v_place->'me'; end if;
  end if;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'item', p_item, 'xp', v_fuel.xp,
    'flame', jsonb_build_object('flame', v_fuel.flame, 'from_ms', floor(extract(epoch from v_start) * 1000)::bigint,
                                'until_ms', floor(extract(epoch from v_end) * 1000)::bigint),
    'me', v_me);
end $fn$;

-- hr_town_view RESTATED WHOLE (§0 pins its image): + `hearth`, the colour its square burns now.
CREATE OR REPLACE FUNCTION public.hr_town_view(p_slot integer, p_map text, p_cx integer, p_cy integer, p_cursor bigint, p_pcx integer, p_pcy integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  c_slack      constant interval := interval '5 seconds';    -- commit order: a write stamped before this read's start
  c_full_after constant interval := interval '60 seconds';   -- an older cursor is answered whole
  c_per_min    constant int := 45;
  c_gone_max   constant int := 240;
  v_uid  uuid := auth.uid();
  v_slot int := coalesce(p_slot, -1);
  v_map  public.hr_town_maps%rowtype;
  v_now  timestamptz := now();
  v_me   jsonb; v_inst int;
  v_cur  timestamptz; v_since timestamptz; v_full boolean;
  v_hw int; v_hh int; v_cx int; v_cy int; v_px int; v_py int;
  v_mates uuid[]; v_friends uuid[]; v_blocked uuid[];
  v_pick jsonb; v_n int; v_walkers jsonb; v_gone jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_flag_on('town_presence') then return jsonb_build_object('ok', true, 'off', true); end if;
  if not public.hr_rate_ok(v_uid, 'town_view', c_per_min, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  select * into v_map from public.hr_town_maps where map_id = p_map;
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_map'); end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = v_uid and ps.slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if exists (select 1 from public.hunt_sessions h where h.user_id = v_uid and h.slot = v_slot and h.ended_at is null) then
    return jsonb_build_object('ok', false, 'error', 'hunting'); end if;
  -- THE VIEWER STANDS IN THE TOWN IT VIEWS: present (a read is a keepalive), its own pending changes, then a stand
  -- when it has none (rare: the map lock)
  insert into public.town_seen as ts (user_id, slot, seen_at) values (v_uid, v_slot, now())
    on conflict (user_id, slot) do update set seen_at = excluded.seen_at;
  perform public.hr_town_moves_settle(p_map, 4, v_uid, v_slot);
  if not exists (select 1 from public.town_bodies b where b.user_id = v_uid and b.slot = v_slot and b.map_id = p_map and b.station_id is not null) then
    perform public.hr_town_place_pointer(v_uid, v_slot, p_map);
  else
    perform public.hr_town_merge_party(v_uid, p_map);   -- a party stands together (a viewer joins its leader too)
  end if;
  v_me := public.hr_town_me(v_uid, v_slot);
  v_inst := (v_me->>'inst')::int;
  -- THE WINDOW: the view around the centre the client names (its own tile when it names none), plus the margin
  v_hw := ceil(v_map.view_w / 2.0)::int + v_map.margin;
  v_hh := ceil(v_map.view_h / 2.0)::int + v_map.margin;
  v_cx := least(greatest(coalesce(p_cx, (v_me->>'x')::int, v_map.w / 2), 0), v_map.w - 1);
  v_cy := least(greatest(coalesce(p_cy, (v_me->>'y')::int, v_map.h / 2), 0), v_map.h - 1);
  v_px := case when p_pcx is not null and p_pcy is not null then least(greatest(p_pcx, 0), v_map.w - 1) end;
  v_py := case when p_pcx is not null and p_pcy is not null then least(greatest(p_pcy, 0), v_map.h - 1) end;
  -- THE CURSOR: the last answer's server time; none, an old one or a future one is answered whole
  v_cur := case when p_cursor is null then null else to_timestamp(p_cursor / 1000000.0) end;
  v_full := v_cur is null or v_cur < v_now - c_full_after or v_cur > v_now + interval '1 second';
  v_since := case when v_full then null else v_cur - c_slack end;
  v_mates := array(select distinct m2.user_id from public.hunt_party_members m1
                     join public.hunt_parties p on p.id = m1.party_id and p.closed_at is null
                     join public.hunt_party_members m2 on m2.party_id = m1.party_id
                    where m1.user_id = v_uid and m2.user_id <> v_uid);
  v_friends := array(select case when f.user_lo = v_uid then f.user_hi else f.user_lo end
                       from public.friend_links f where f.user_lo = v_uid or f.user_hi = v_uid);
  -- blocked either way (hr_social_blocked's rule), once for the whole read
  v_blocked := array(select b.blocked_id from public.chat_blocks b where b.blocker_id = v_uid
                     union select b.blocker_id from public.chat_blocks b where b.blocked_id = v_uid);
  if v_inst is not null then
    -- ONE STATEMENT A PASS: the instance's bodies once (t: cheap columns), the CANDIDATES (c: in a whole answer all of
    -- them; in a delta those that changed, entered the area or whose presence ran out since the cursor), whether each
    -- candidate is SHOWN (s: holds its stand, not quiet, not blocked either way, admitted, live), then how many are shown
    -- in the area, the walkers to send (<= cap, own account, party, friends, then nearest) and the gone. A delta with
    -- more than the cap is answered WHOLE (a second pass): nothing is ever dropped from a delta.
    loop
      with t as materialized (
        select b.*,
               -- in the area: where it is OR where it walks to (a body walking in is read before it arrives)
               (b.x between v_cx - v_hw and v_cx + v_hw and b.y between v_cy - v_hh and v_cy + v_hh)
                 or (b.gx between v_cx - v_hw and v_cx + v_hw and b.gy between v_cy - v_hh and v_cy + v_hh) as inside,
               v_px is not null and ((b.x between v_px - v_hw and v_px + v_hw and b.y between v_py - v_hh and v_py + v_hh)
                 or (b.gx between v_px - v_hw and v_px + v_hw and b.gy between v_py - v_hh and v_py + v_hh)) as was_inside,
               case when b.user_id = v_uid then 0 when b.user_id = any (v_mates) then 1 when b.user_id = any (v_friends) then 2 else 3 end as rnk,
               (b.x - v_cx) * (b.x - v_cx) + (b.y - v_cy) * (b.y - v_cy) as d2
          from public.hr_town_bodies_at(p_map, v_inst, v_since) b
         where not (b.user_id = v_uid and b.slot = v_slot)
      ), s as materialized (
        select t.*,
               t.held and not t.quiet and not (t.user_id = any (v_blocked)) and public.hr_admitted(t.user_id)
                 and public.hr_town_live_of(t.kind, t.seen,
                       exists (select 1 from public.hunt_sessions h where h.user_id = t.user_id and h.slot = t.slot and h.ended_at is null)) as shown
          from t
         where v_since is null or t.changed > v_since or (t.inside and not t.was_inside)
            or (t.seen_until > v_since and t.seen_until <= v_now)
      )
      select (select count(*)::int from s where s.shown and s.inside),
             (select jsonb_agg(jsonb_build_object('id', w.user_id, 'slot', w.slot, 'x', w.x, 'y', w.y, 'gx', w.gx, 'gy', w.gy, 'dir', w.dir,
                                 'age_ms', greatest(0, floor(extract(epoch from (v_now - w.changed)) * 1000))::int,
                                 'station', w.station_id, 'work', w.why = 'work', 'ord', w.n))
                from (select s.*, row_number() over (order by s.rnk, s.d2, s.user_id, s.slot) n from s
                       where s.shown and s.inside order by s.rnk, s.d2, s.user_id, s.slot limit v_map.view_cap) w),
             (select jsonb_agg(jsonb_build_object('id', g.user_id, 'slot', g.slot) order by g.user_id, g.slot)
                from (select s.user_id, s.slot from s
                       where v_since is not null and not (s.shown and s.inside)
                         and (s.changed > v_since or (s.seen_until > v_since and s.seen_until <= v_now))
                       order by s.user_id, s.slot limit c_gone_max) g)
        into v_n, v_pick, v_gone;
      exit when v_since is null or v_n <= v_map.view_cap;
      v_full := true; v_since := null;
    end loop;
  end if;
  -- the others' pending changes, AFTER the read (the map lock is never held across it): seen on the next read
  perform public.hr_town_moves_settle(p_map, 20);
  -- THE LOOKS of the bodies this answer carries, re-read when older than 60 s (the helpers run for those rows only),
  -- then the walkers. Last: body rows are locked after the map lock, never before (§ CONCURRENCY).
  if v_pick is not null then
    -- SKIP LOCKED: two readers refreshing one look never wait on (or deadlock with) each other; the one that skipped
    -- sends the minute-old look, or reads it fresh when it has none
    update public.town_bodies b set look = public.hr_town_look(b.user_id, b.slot), look_at = v_now
     where (b.user_id, b.slot) in (
       select t.user_id, t.slot from public.town_bodies t
         join jsonb_to_recordset(v_pick) p(id uuid, slot int) on t.user_id = p.id and t.slot = p.slot
        where t.look is null or t.look_at < v_now - interval '60 seconds'
        order by t.user_id, t.slot
        for update of t skip locked);
    select jsonb_agg(jsonb_build_object('id', p.id, 'slot', p.slot) || coalesce(b.look, public.hr_town_look(p.id, p.slot))
                     || jsonb_build_object('x', p.x, 'y', p.y, 'gx', p.gx, 'gy', p.gy, 'dir', p.dir,
                                           'age_ms', p.age_ms, 'station', p.station, 'work', p.work) order by p.ord)
      into v_walkers
      from jsonb_to_recordset(v_pick) p(id uuid, slot int, x int, y int, gx int, gy int, dir text, age_ms int, station text, work boolean, ord int)
      join public.town_bodies b on b.user_id = p.id and b.slot = p.slot;
  end if;
  return jsonb_build_object('ok', true, 'map', p_map, 'inst', v_inst, 'cap', v_map.view_cap, 'full', v_full,
    'cursor', floor(extract(epoch from v_now) * 1000000)::bigint,
    'area', jsonb_build_array(greatest(v_cx - v_hw, 0), greatest(v_cy - v_hh, 0), least(v_cx + v_hw, v_map.w - 1), least(v_cy + v_hh, v_map.h - 1)),
    'walkers', coalesce(v_walkers, '[]'::jsonb), 'gone', coalesce(v_gone, '[]'::jsonb), 'me', v_me,
    'hearth', public.hr_hearth_flame_of(p_map));
end $function$;


-- ── §5 GRANTS AND THE BASELINE ──────────────────────────────────────────────
do $mig$
declare f text;
begin
  foreach f in array array['public.hr_hearth_flame_of(text)', 'public.hr_regen_permille(integer)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', f);
  end loop;
  revoke execute on function public.hr_hearth_burn(integer, text, uuid) from public, anon, service_role;
  grant  execute on function public.hr_hearth_burn(integer, text, uuid) to authenticated;
end $mig$;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_hearth_burn';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_hearth_burn', 'p_slot integer, p_item text, p_idem uuid', 'authenticated',
   'added 2027-01-31 (inner-flame): burn ONE named fuel from the caller''s own bag in the Great Hearth: the catalogue''s Inner Flame XP, '
   'the square''s colour queued (per hero per UTC day, per town queue_s), one system chat line; idempotent on the key; 10/min');

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $chk$
declare
  v_u   constant uuid := '000000c0-0000-4000-a000-0000f1a3e001';
  v_u2  constant uuid := '000000c0-0000-4000-a000-0000f1a3e002';
  v jsonb; v2 jsonb; v_txt text; v_xp0 bigint; v_xp1 bigint; v_n int; v_hi uuid; v_flame jsonb; v_map text;
  v_from timestamptz; v_until timestamptz;
begin
  -- (0) THE RENAME LANDED: no catalogue row, hero row or limit names the old skill, and no LIVE body does
  if exists (select 1 from public.hr_skills where skill_id = 'prayer')
     or not exists (select 1 from public.hr_skills where skill_id = 'inner_flame' and cat = 'combat')
     or exists (select 1 from public.player_skills where skill_id = 'prayer')
     or exists (select 1 from public.hr_hunt_limits where key like 'prayer%')
     or (select count(*) from public.hr_hunt_limits where key in ('flame_regen_k', 'flame_regen_max_permille')) <> 2
     or exists (select 1 from public.hr_room_perks where perks ? 'prayerSpeed')
     or exists (select 1 from public.hr_unlock_offers where req_skill = 'prayer')
     or exists (select 1 from public.hr_town_station_hosts where skill = 'prayer')
     or exists (select 1 from public.hr_activities where req_skill = 'prayer')
     or exists (select 1 from public.player_state ps where ps.active_kind = 'artisan' and ps.active_id ~ '^(bury|offer|consecrate|scatter|banish|unbind|release|purge)_') then
    raise exception 'inner-flame §6(0): a row still names Prayer or a rite'; end if;
  select string_agg(p.proname, ', ' order by p.proname) into v_txt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosrc ~ '''prayer'''
     and p.proname not in ('hr_bounty_combat_level', 'hr_party_level', 'hr_dungeon_settle', 'hr_lb_skills');
  if v_txt is not null then raise exception 'inner-flame §6(0): live bodies still name the skill ''prayer'': %', v_txt; end if;
  -- (1) THE DEATH LOSS covers Inner Flame: the death's skill list is the catalogue's combat rows, and hr_apply's away span reads the same
  if not (array(select k.skill_id from public.hr_skills k where k.cat = 'combat') @> array['inner_flame'])
     or (select prosrc from pg_proc where oid = 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure)
        !~ 'c_xp_skills constant text\[\] := array\(select k\.skill_id from public\.hr_skills k where k\.cat = ''combat'''
     or strpos((select prosrc from pg_proc where oid = 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure),
               'where key = any(array(select k.skill_id from public.hr_skills k where k.cat = ''combat''))))') = 0 then
    raise exception 'inner-flame §6(1): a death or an away span does not price Inner Flame'; end if;
  -- (2) THE REGEN RATE: Inner Flame L -> 1000 + floor(max x L / (L + k)), the flame_regen_* limits; L 1 at no XP
  if public.hr_regen_permille(1) <> 1000 + (public.hr_hunt_limit('flame_regen_max_permille') / (1 + public.hr_hunt_limit('flame_regen_k')))
     or public.hr_regen_permille(50) <> 1000 + floor(public.hr_hunt_limit('flame_regen_max_permille')::numeric * 50 / (50 + public.hr_hunt_limit('flame_regen_k')))::int then
    raise exception 'inner-flame §6(2): the regen rate does not read the flame limits'; end if;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u), (v_u2) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'inner-flame §6 probe'), (v_u2, 'inner-flame §6 probe') on conflict (user_id) do nothing;
    insert into public.hr_flags (key, enabled, note) values ('town_presence', true, 'inner-flame §6') on conflict (key) do update set enabled = true;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'inner-flame §6: hr_create_character refused: %', v; end if;
    -- (3) A NEW HERO starts with Inner Flame (the catalogue's start rows) and its vitals read it: XP for level 10 -> its regen
    if not exists (select 1 from public.player_skills where user_id = v_u and slot = 0 and skill_id = 'inner_flame')
       or exists (select 1 from public.player_skills where user_id = v_u and slot = 0 and skill_id = 'prayer') then
      raise exception 'inner-flame §6(3): a new hero does not start with Inner Flame'; end if;
    update public.player_skills set xp = (select min(c.xp) from public.hr_skill_curve c where c.level = 10)
     where user_id = v_u and slot = 0 and skill_id = 'inner_flame';
    if (public.hr_vitals_of(v_u, 0)->>'regen_pm')::int <> public.hr_regen_permille(10) then
      raise exception 'inner-flame §6(3): the vitals do not read Inner Flame 10: %', public.hr_vitals_of(v_u, 0); end if;
    -- (4) THE NAMED BURN, on probe catalogue rows (the generated hearth catalogue lands after this file)
    insert into public.hr_items (item_id, name, tradeable, value) values ('zz_probe_comb', 'Probe Comb', true, 1) on conflict (item_id) do nothing;
    delete from public.hr_hearth_named; delete from public.hr_hearth_rule;
    insert into public.hr_hearth_named (item_id, xp, req_lv, flame, secs) values ('zz_probe_comb', 585, 1, 'honey', 60);
    insert into public.hr_hearth_rule (id, per_day, queue_s) values (true, 3, 60);
    delete from public.hearth_flames;
    v_map := (select m.map_id from public.hr_town_maps m where m.main);
    -- (4a) the refusals: not a fuel (an everyday fuel is a bench run), none in the bag, a bad key
    v := public.hr_hearth_burn(0, 'bones', gen_random_uuid());
    if v->>'error' is distinct from 'not_a_fuel' then raise exception 'inner-flame §6(4a): bones answered %', v; end if;
    v := public.hr_hearth_burn(0, 'zz_probe_comb', gen_random_uuid());
    if v->>'error' is distinct from 'no_item' then raise exception 'inner-flame §6(4a): an empty bag answered %', v; end if;
    v := public.hr_hearth_burn(0, 'zz_probe_comb', null);
    if v->>'error' is distinct from 'bad_idem' then raise exception 'inner-flame §6(4a): no key answered %', v; end if;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, 'zz_probe_comb', 5)
      on conflict (user_id, slot, item_id) do update set qty = 5;
    -- (4b) hunting: the Hearth is in town
    v_hi := gen_random_uuid();
    insert into public.hunt_instances (id, hunt_id, settled_to, next_swing_at) values (v_hi, 'mill_cellar', now(), now());
    insert into public.hunt_sessions (id, user_id, slot, hunt_id, entered_at, hunt_from, settled_to, next_swing_at, instance_id)
      values (gen_random_uuid(), v_u, 0, 'mill_cellar', now(), now(), now(), now(), v_hi);
    v := public.hr_hearth_burn(0, 'zz_probe_comb', gen_random_uuid());
    if v->>'error' is distinct from 'hunting' or v->>'hunt' is distinct from 'mill_cellar' then raise exception 'inner-flame §6(4b): a hunting hero answered %', v; end if;
    delete from public.hunt_sessions where user_id = v_u and slot = 0 and ended_at is null;
    delete from public.hunt_instances where id = v_hi;
    -- (4c) below its level
    update public.hr_hearth_named set req_lv = 11;
    v := public.hr_hearth_burn(0, 'zz_probe_comb', gen_random_uuid());
    if v->>'error' is distinct from 'flame_too_low' or (v->>'need')::int <> 11 or (v->>'have')::int <> 10 then
      raise exception 'inner-flame §6(4c): Inner Flame 10 for a level-11 fuel answered %', v; end if;
    update public.hr_hearth_named set req_lv = 1;
    -- (4d) THE BURN: one item, the catalogue's XP, one craft row, one colour, one line, the body at the Hearth
    v_xp0 := (select xp from public.player_skills where user_id = v_u and slot = 0 and skill_id = 'inner_flame');
    v := public.hr_hearth_burn(0, 'zz_probe_comb', '000000c0-0000-4000-a000-0000f1a3e101');
    v_xp1 := (select xp from public.player_skills where user_id = v_u and slot = 0 and skill_id = 'inner_flame');
    if coalesce(v->>'ok', '') <> 'true' or v_xp1 - v_xp0 <> 585
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = 'zz_probe_comb') <> 4
       or (select count(*) from public.player_ledger l where l.user_id = v_u and l.slot = 0 and l.kind = 'craft' and l.intent = 'hearth_burn:zz_probe_comb') <> 1
       or (select count(*) from public.hearth_flames f where f.user_id = v_u and f.flame = 'honey' and f.map_id = v_map) <> 1
       or (select count(*) from public.chat_messages m where m.from_id = v_u and m.channel = 'system' and m.body = 'fed the Great Hearth a [[item:zz_probe_comb]].') <> 1
       or v->'me'->>'station' is distinct from 'hearth' then
      raise exception 'inner-flame §6(4d): the burn answered % (xp % -> %)', v, v_xp0, v_xp1; end if;
    v_flame := public.hr_hearth_flame_of(v_map);
    if v_flame->>'flame' is distinct from 'honey' or v_flame->>'item' is distinct from 'zz_probe_comb'
       or (v_flame->>'until_ms')::bigint - (v_flame->>'from_ms')::bigint <> 60000 then
      raise exception 'inner-flame §6(4d): the square burns %', v_flame; end if;
    -- (4e) A RETRY burns nothing twice and queues nothing twice
    v := public.hr_hearth_burn(0, 'zz_probe_comb', '000000c0-0000-4000-a000-0000f1a3e101');
    if coalesce(v->>'ok', '') <> 'true' or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = 'zz_probe_comb') <> 4
       or (select count(*) from public.hearth_flames f where f.user_id = v_u) <> 1 then
      raise exception 'inner-flame §6(4e): a retried key answered % and burnt again', v; end if;
    -- (4f) THE QUEUE: a second colour starts where the first ends; past queue_s ahead the Hearth is busy and says how long
    v := public.hr_hearth_burn(0, 'zz_probe_comb', gen_random_uuid());
    select starts_at into v_from from public.hearth_flames where user_id = v_u order by id desc limit 1;
    select ends_at into v_until from public.hearth_flames where user_id = v_u order by id asc limit 1;
    if coalesce(v->>'ok', '') <> 'true' or v_from <> v_until then raise exception 'inner-flame §6(4f): the second colour did not queue: %', v; end if;
    v := public.hr_hearth_burn(0, 'zz_probe_comb', gen_random_uuid());
    if v->>'error' is distinct from 'hearth_busy' or (v->>'wait_s')::int < 1 then raise exception 'inner-flame §6(4f): a full queue answered %', v; end if;
    -- (4g) THE HERO'S DAY: past per_day burns the Hearth says so (the queue is cleared so only the day can refuse)
    update public.hearth_flames set starts_at = now() - interval '2 hours', ends_at = now() - interval '1 hour' where user_id = v_u;
    v := public.hr_hearth_burn(0, 'zz_probe_comb', gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'inner-flame §6(4g): the third burn answered %', v; end if;
    v := public.hr_hearth_burn(0, 'zz_probe_comb', gen_random_uuid());
    if v->>'error' is distinct from 'hearth_limit' or (v->>'per_day')::int <> 3 then raise exception 'inner-flame §6(4g): a fourth burn answered %', v; end if;
    -- (5) THE TOWN READ carries the colour to another viewer in the square
    perform set_config('request.jwt.claim.sub', v_u2::text, true);
    v2 := public.hr_create_character(0);
    if coalesce(v2->>'ok', '') <> 'true' then raise exception 'inner-flame §6(5): the second hero was not made: %', v2; end if;
    v2 := public.hr_town_view(0, v_map, null, null, null, null, null);
    if coalesce(v2->>'ok', '') <> 'true' or v2->'hearth'->>'flame' is distinct from 'honey' then
      raise exception 'inner-flame §6(5): another viewer''s town read carries %', v2->'hearth'; end if;
    raise exception using errcode = 'HR931', message = 'inner-flame §6 complete - rolling back';
  exception when sqlstate 'HR931' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_u, v_u2)) or exists (select 1 from public.hr_items where item_id = 'zz_probe_comb') then
    raise exception 'inner-flame §6: LEAKED a probe row'; end if;
  -- (6) GRANTS: only the verb is the client's; the read and the regen rate are owner-only; the tables are no one's
  if has_function_privilege('anon', 'public.hr_hearth_burn(integer,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_hearth_burn(integer,text,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_hearth_flame_of(text)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_regen_permille(integer)', 'execute')
     or has_table_privilege('authenticated', 'public.hearth_flames', 'select')
     or has_table_privilege('authenticated', 'public.hr_hearth_named', 'select') then
    raise exception 'inner-flame §6(6): a grant is wrong'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'inner-flame: Prayer is Inner Flame everywhere live; a death prices it; the Hearth burns named fuels once, queued, clamped, journalled; all green';
end $chk$;
