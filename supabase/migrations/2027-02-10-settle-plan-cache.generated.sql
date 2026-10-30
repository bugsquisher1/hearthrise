-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE SETTLE'S HELPERS KEEP THEIR PLANS  (GENERATED — DO NOT EDIT)
--
--   Written by tools/gen-plan-cache.mjs from the replayed chain (the pre-images below). Any hand edit FAILS
--   `node tools/gen-plan-cache.mjs --check`. lane/c-settle-cost-2, backend-architect, 2026-10-30.
--   STAGED. Game CLOSED: applies on its passing §2 (CLAUDE.md §2), one file via the Coordinator's apply tool,
--   never inside begin/commit, never 00:00-00:10 UTC.
--   digest: 4ad09409a54752bd68c4db75a9a2c374376adab5c7a5aa396c5077f7d7953460
--   53 functions.
--
-- ── WHY (measured, not guessed) ─────────────────────────────────────────────
-- Production is PostgreSQL 17. A LANGUAGE sql function with a SET clause is never inlined, and 17 parses, rewrites and
-- plans its body again for every statement execution that calls it; 18 (PGlite, the replay) caches that plan, which
-- is why no replay measurement ever showed it. Live, read-only, 2026-10-30: five one-line helpers 0.8 ms, hr_vitals_of
-- 2.25 ms a call (inlined by hand into one query: 1.1 ms), hr_home_view's body 1.6 ms of planning alone. On a local
-- PostgreSQL 17 replay of this chain (tools/pg-replay.mjs), a watched 4-hero settle calls these 53 functions
-- about 3,000 times; the same body as plpgsql costs 2-7x less a call wherever its caller runs it as its own statement
-- (hr_renown_of 2.70 -> 0.64 ms, hr_hunt_weapon_of 0.40 -> 0.05, hr_skill_level 0.18 -> 0.07) and the same per row of
-- one statement. The before/after of the whole settle is in the lane report.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 Each function below keeps its name, arguments, return type, volatility, SECURITY DEFINER, STRICT, PARALLEL, COST
--    and SET clauses (owner and grants are kept by CREATE OR REPLACE); only its LANGUAGE moves, sql -> plpgsql, and
--    its body is the SQL pre-image VERBATIM inside
--        #variable_conflict use_column     (a column and a parameter of one name: the column, as in a SQL function)
--        return (select hr_q.v from ( <pre-image> ) as hr_q(v) limit 1);
--    — the first row of the one column, or NULL with none: a scalar SQL function's own contract. No caller changes.
-- §2 The executed self-check: every function is plpgsql with exactly the pinned body and kept properties, and answers
--    exactly what its SQL pre-image answers, as TEXT (byte for byte), over probe inputs drawn from the database the
--    file is applied to — on production every character there is, every hunt session's id, every limit, flag, skill
--    and monster key; on the replay a probe hero. The pre-images run as pg_temp copies, rolled back with the probe.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
--   No row moves. CREATE OR REPLACE takes each function's lock for the instant it swaps; a statement already running
--   keeps the plan it started with. A second apply finds every post-image (§0 accepts it) and rewrites the same text.
--
-- ── SECURITY SURFACE (for the EA review: CLAUDE.md §3.7) ─────────────────────
--   NONE ADDED. No function changes who may call it (grants kept), whose rights it runs with (SECURITY DEFINER kept),
--   or the search_path it runs under (SET kept: no new function_search_path_mutable finding). The bodies are the
--   pre-images' own SQL.
--
-- ── COST ────────────────────────────────────────────────────────────────────
--   Rows/bytes: none. Memory: each backend keeps the cached plans of these bodies (a few hundred KB at most).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   Each pre-image is in this file (§2's pg_temp copies, verbatim): restate it under its own name to undo. No data.
--
-- ORDER: after 2027-02-10-party-instance-reset.sql (and 2027-02-10-pg-net-vacuum.sql where it is placed); before
--   2027-02-10-settle-reads.sql. EDGE: none for this file. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS — FAIL CLOSED ────────────────────────────────
-- Each function is its measured pre-image (this tool read it) or this file's own post-image (a second apply).
do $pin$
declare r record; v_md5 text; v_lang text;
begin
  for r in select * from (values
    ('public.hr_account_property_tier(uuid)', '25f5628bfe703c8281995b7860ee1d3f', '1ebcf2b9d6b472066d140d6ee4c387ee'),
    ('public.hr_account_view(uuid,integer)', 'a2aa727d201d6cf6e04930d800fb9543', 'a3021f48b07e8c0847979e8a14d5000b'),
    ('public.hr_bag_rules_view(uuid,integer)', '1b7e07b77137966c8c93ce926ef272f9', '9eaac916e78a119a766ae4c98271e509'),
    ('public.hr_bench_run_view(uuid,integer)', '98e0228c21501b69c564903eeea7b843', '3cc273accf7e98464f8fca1770dce683'),
    ('public.hr_blessing_price(integer,integer)', 'd1d049228b923367fae7b3944d1d70e3', '2f218f3971f24cb68c223711c54684b5'),
    ('public.hr_blessings_view(uuid,integer)', '55e33e47af67fa03459f6f3c9f636078', 'e672ab17056929ed17bfdf445ac93a82'),
    ('public.hr_character_name(uuid,integer)', '5b8a48c3c87aa642cd04c21de06ef864', '059e305c3b74fc4c196372ed51d08613'),
    ('public.hr_character_name_view(uuid,integer)', 'a60cb40546c77753ef345697797bbd11', 'a4a5d783eb4e24c1fd66ccf178e2d156'),
    ('public.hr_death_log_view(uuid,integer)', '5082be0374d9eaff31f59cbf666aa5eb', '950094fdab0f4c665e26a289bf5bf61f'),
    ('public.hr_depot_cap(uuid)', '0174f75e35b34bcdee75ecf96eb21f6d', '1180679abaa09da84294b714309d8ce6'),
    ('public.hr_dungeon_cooldowns(uuid,integer)', '82d63835c3f0be53a15882298e27b0ef', 'ac1df9f760a395b79db564f516851a5b'),
    ('public.hr_farm_plot_cap(uuid)', 'a6587ff991c1ab77715221881e73ddf5', '485b11f6f274489585960cc932898271'),
    ('public.hr_farm_plot_level(uuid)', '17ad42dbf99281da61e017206912d4fb', 'e5812a61c21c55bbe381e5564c144605'),
    ('public.hr_flag_on(text)', 'c619fb98a752971ed4b578ee999a8064', 'e4fc4d20f7bfaa3df8c2fdac688bee21'),
    ('public.hr_gem_unlocks_of(uuid,integer)', '90460bfce570c4aa13a71dec21f9a7c4', '6cf041fe40ebef4c508557c99dd68398'),
    ('public.hr_hero_slots_of(uuid)', '30e26fc6de1aaf5868c6e0a3235b09e7', 'cdbf9edeff38abe5ee8aea82aa394322'),
    ('public.hr_home_view(uuid,integer)', '386162db2973d7d524c0b2825efd3b9e', '02a0ebb7b7b4f3dd4de45cc84276aac1'),
    ('public.hr_hunt_analyzer_view(uuid,integer)', '31764fe06c39dcf94efce5334b372eeb', '08a8fe8399e668920ac8d2aad79525d0'),
    ('public.hr_hunt_bests_view(uuid,integer)', '756ffab0428455fb99b20aa1a36cf96d', '63a0fda740e1143f7a62b4be7095ecb7'),
    ('public.hr_hunt_density_view(uuid,integer)', '2bf4fbef1dfdab3cce4a96da29b03f5a', '96dedf92ab611b8e593a6c055abe1543'),
    ('public.hr_hunt_limit(text)', 'c320e5f37069cf26f8cdeb4338db9644', '5d5dac60c606d93e4047b1cff2550952'),
    ('public.hr_hunt_party_of(uuid,integer)', '94941bf5f1e8b1b2b033d01933e4b6c8', '169977bfd7f2b8e8fad257fb36c72f4a'),
    ('public.hr_hunt_presets_view(uuid,integer)', '81f9baf49d7d5ac19fe13770d7b21ec6', '80167dba911a1d5dbc20813bd01d64a3'),
    ('public.hr_hunt_role_default(text,text[])', 'e8c7374aecc6612e06446c289d3a5dd3', '31d7a3c80faca7cb082953b32d5cf6dc'),
    ('public.hr_hunt_setup_view(uuid,integer)', '6ceac8abcda63afb31afdb0f52265d85', '4426cfef02eda83502d0ae9c45399b94'),
    ('public.hr_hunt_supply_of(uuid,integer,integer)', '293fed4a24dd59d86cd4f1263616f4cd', '2b4f22e5717a828da1f9b65069177983'),
    ('public.hr_hunt_view(uuid)', 'dbca94279b409132729b9bf2c32b35da', 'e1337c1b1e2922d1a2dba8dbfa8f683c'),
    ('public.hr_hunt_weapon_of(uuid,integer)', '502cccd2357f5c711c97b7bb1b274cba', 'b6d3d2061794a73ed730c3d136f8e60f'),
    ('public.hr_level_block(bigint)', '9bf9662b2ade0c6ed69d2a0fad875e99', '65ef901ed37aedd87488d1c2701ca94b'),
    ('public.hr_level_from_xp(bigint)', '16e2d20bc2514f091846e673fcff0e54', 'db9d93abfe7598cc1e079ee9754c482b'),
    ('public.hr_level_of(uuid,integer)', '00b47d0d5d06eefd389ff061d90bd45b', '8f64a66cac32b3fabeddc9db3a0cd853'),
    ('public.hr_login_view(uuid,integer)', '2d5e00e8abc81d4f9e11d5c5341543c4', '6809b0885556aacf5ce7607acde19627'),
    ('public.hr_max_hp(integer,integer)', '16f88c49cb59f23dd1b2a65f6d286172', '85cf3ea83d223ab68a068a4b15d02a0f'),
    ('public.hr_max_mana(integer,integer)', '61e1eeb9704e45cdae8c7582c62910dd', '2183d528fcdadcc27f880239fdd211c1'),
    ('public.hr_monster_level(text)', '57a5dbd6d9ab89492fc52390aee701ee', '89141b7df53cb29226fe1a12194fb8eb'),
    ('public.hr_outfit_owned(uuid,integer)', '3049b756b34355969355d2514047e860', 'aeefd7b1ea41a80660d37b7c0288a1d0'),
    ('public.hr_party_away(uuid,integer,timestamp with time zone)', 'c9c3ca6fe45a87fc7cbe1cf051ef995b', 'fa5b13ca8f83b169727673060d3a79aa'),
    ('public.hr_party_invites_view(uuid,integer)', '6be8f9a7857df5098d2e30e1e3817f0f', 'b92c5e44f6c6e47c28f05f3a13e12dc5'),
    ('public.hr_party_seek_view(uuid,integer)', '91772d58761b7e324fda316991019458', '3e62b982cd7df3e1a91ffde3217f5794'),
    ('public.hr_premium_active(uuid,integer,timestamp with time zone)', 'fc3930c936fd0ab70e8e26033e8edb02', '1b7f1250d24c246a29df1f3d38e27399'),
    ('public.hr_premium_until(uuid,integer)', 'd9755164bb43d724cca8ce9203f6417e', '90a711aec206cd2d90d31f944846a920'),
    ('public.hr_premium_view(uuid,integer)', 'ac7de9672554f03912e8d7cf197856b1', 'ef621cdc2bb0c4532679c629a065d142'),
    ('public.hr_recipes_of(uuid,integer)', 'a4512846a8c11ba1ae360ce63e9cf073', 'b3ad733081f12ffffdd5a19a00732fab'),
    ('public.hr_regen_permille(integer)', 'db33bcc28bf3cb430f77463f47a2eb8b', '7f7791b55addaf3b09580260a43499c1'),
    ('public.hr_renown_of(uuid,integer)', '2b62783dbef7e393c3a173d9b234320b', '11df531e2fad58c647fd247436983c2a'),
    ('public.hr_seed(uuid,integer,text)', 'f24b938460dccf8c89b224698914730f', '8929662285421a05404597fb192e19a1'),
    ('public.hr_skill_level(text,bigint)', '0ba1199ed385dfec277c7677006e5733', '052678f95f2e9c16005a5dd91e17435b'),
    ('public.hr_social_party_view(uuid,integer)', '9cd89c0e32eeeb4d5a9ced5d23b1acb9', '3cf0aea3da0f2dcfb40188e9e10b3a76'),
    ('public.hr_stamina_cap(uuid,integer,timestamp with time zone)', '69bb68c8b4bb7360ebb77bf99360e30f', 'e339b7e0bf315f66af0fd9babfea4fe8'),
    ('public.hr_storage_room_used(uuid)', 'b84e03502c85d4a977b47c194317f5d2', 'cb49db6d03a4de18bb36751d1bc42114'),
    ('public.hr_tally_section(uuid,integer)', '052d83be775b88ab18e05a5100433442', '24867820796f1fdcc0074e1d70935f55'),
    ('public.hr_total_level(uuid,integer)', '8577710143af7ab3006a003f507c9f03', 'c18da03cbc435ed2ea3594505ee1f018'),
    ('public.hr_vitals_of(uuid,integer)', '4572cdfc29c9ad5926b36746fa11a6c0', 'ee12af9d6bcb4a0264bdc4ac3a4508e1')
  ) as t(sig, pre, post) loop
    if to_regprocedure(r.sig) is null then raise exception 'PRECONDITION: % is absent', r.sig; end if;
    select md5(replace(p.prosrc, chr(13), '')), l.lanname into v_md5, v_lang
      from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = to_regprocedure(r.sig);
    if not ((v_lang = 'sql' and v_md5 = r.pre) or (v_lang = 'plpgsql' and v_md5 = r.post)) then
      raise exception 'PIN: % is neither its pre-image (sql %) nor this file''s post-image (plpgsql %): % % - another file moved it; re-run tools/gen-plan-cache.mjs',
        r.sig, r.pre, r.post, v_lang, v_md5;
    end if;
  end loop;
end $pin$;

-- ── §1 THE SAME BODIES, PLANNED ONCE PER BACKEND ─────────────────────────────
create or replace function public.hr_account_property_tier(p_user uuid)
 returns integer
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select coalesce(max(pp.value), 0)::int
    from public.player_progress pp
    join public.hr_unlocks u on u.unlock_id = pp.key and u.progress_kind = pp.kind
   where pp.user_id = p_user and pp.period_key = '' and u.namespace = 'property'
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_account_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select jsonb_build_object(
    'max_concurrent', public.hr_hunt_limit('max_concurrent'),
    -- every slot the catalogue holds, plus slot 0 (free, never in the catalogue)
    'hero_slots_max', (select coalesce(max(c.slot_id), 0) + 1 from public.hr_hero_slots c),
    -- the next slot this account can buy: the lowest unowned, priced, non-starter row
    'hero_slot_offer', (
      select jsonb_build_object('slot_id', c.slot_id, 'cost_gold', c.cost_gold)
        from public.hr_hero_slots c
       where not c.starter and c.cost_gold > 0
         and not (public.hr_hero_slots_of(p_user) @> to_jsonb(c.slot_id))
       order by c.slot_id
       limit 1))
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_bag_rules_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select jsonb_build_object(
    'locked', coalesce((select jsonb_agg(r.item_id order by r.item_id) from public.player_item_rules r
                         where r.user_id = p_user and r.slot = p_slot and r.locked), '[]'::jsonb),
    'loot', coalesce((select jsonb_object_agg(r.item_id, r.loot_rule) from public.player_item_rules r
                       where r.user_id = p_user and r.slot = p_slot and r.loot_rule <> 'keep'), '{}'::jsonb),
    'restock', coalesce((select jsonb_object_agg(r.item_id, r.restock) from public.player_item_rules r
                          where r.user_id = p_user and r.slot = p_slot and r.restock > 0), '{}'::jsonb))
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_bench_run_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  -- The column as stored: only the artisan engine reads it (accrual.js accrueArtisan), and the
  -- Work window shows it on a bench row only.
  select jsonb_build_object('left', ps.active_left)
    from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_blessing_price(p_tier integer, p_level integer)
 returns bigint
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select case when p_level < r.free_until_level then 0
              else t.base::bigint + t.per_level::bigint * (p_level - r.free_until_level) end
    from public.hr_blessing_tiers t, public.hr_blessing_rule r
   where t.tier = p_tier and r.id
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_blessings_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  with lv as (select greatest(1, coalesce(public.hr_level_of(p_user, p_slot), 1)) as level)
  select jsonb_build_object(
    'held', coalesce((select jsonb_agg(b.tier order by b.tier) from public.player_blessings b where b.user_id = p_user and b.slot = p_slot), '[]'::jsonb),
    'permille', coalesce((select max(t.permille) from public.player_blessings b join public.hr_blessing_tiers t on t.tier = b.tier
                           where b.user_id = p_user and b.slot = p_slot), 0),
    'free_until', (select r.free_until_level from public.hr_blessing_rule r where r.id),
    'tiers', coalesce((select jsonb_agg(jsonb_build_object('tier', t.tier, 'permille', t.permille,
                                                           'price', public.hr_blessing_price(t.tier, lv.level),
                                                           'held', exists (select 1 from public.player_blessings b
                                                                            where b.user_id = p_user and b.slot = p_slot and b.tier = t.tier))
                                         order by t.tier)
                         from public.hr_blessing_tiers t, lv), '[]'::jsonb))
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_character_name(p_user uuid, p_slot integer)
 returns text
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select coalesce(
    (select n.name from public.character_names n where n.user_id = p_user and n.slot = p_slot),
    (select case when p_slot = 0 then pr.display_name else pr.display_name || ' (' || (p_slot + 1) || ')' end
       from public.profiles pr where pr.id = p_user and pr.display_name is not null),
    'Adventurer')
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_character_name_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select to_jsonb(public.hr_character_name(p_user, p_slot))
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_death_log_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  -- DEATH-POPUP (2026-11-07-death-popup-blessing.sql): each row names its session and what its Blessing kept.
  -- `saved` is read from the ledger, which is pruned at retain_days: only a death of the last 30 days carries
  -- the key (null = no Blessing was used); an older one omits it rather than claim none was used. The ledger
  -- row is written by the settle that priced the death, at or after the death and within its window.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'at', d.at, 'hunt', d.hunt_id, 'session', d.session_id, 'monster', nullif(d.data->>'monster', ''),
           'xp', case when d.data ? 'xp' then (d.data->>'xp')::bigint end,
           'xp_lost', case when jsonb_typeof(d.data->'xp_lost') = 'object' then d.data->'xp_lost' end)
         || case when d.at > now() - interval '30 days' then jsonb_build_object('saved',
              (select case when jsonb_typeof(l.meta->'saved') = 'object' then l.meta->'saved' end
                 from public.player_ledger l
                where l.session_id = d.session_id and l.user_id = p_user and l.slot = p_slot
                  and l.intent = 'blessing_used' and l.at >= d.at and l.at < d.at + interval '2 days'
                order by l.id limit 1)) else '{}'::jsonb end
         order by d.at desc, d.id desc), '[]'::jsonb)
    from (select e.id, e.at, e.data, h.hunt_id, h.id as session_id
            from public.hunt_sessions h
            join public.hunt_session_events e on e.session_id = h.id and e.type = 'death'
           where h.user_id = p_user and h.slot = p_slot
           order by e.at desc, e.id desc
           limit 30) d
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_depot_cap(p_user uuid)
 returns integer
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select (select base_stacks from public.hr_depot_config where only_row)
       + coalesce((select sum(c.stacks) from public.account_storage_chests a
                     join public.hr_storage_chests c on c.chest_id = a.chest_id
                    where a.user_id = p_user), 0)::int
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_dungeon_cooldowns(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select coalesce(jsonb_object_agg(w.dungeon_id, w.modes), '{}'::jsonb)
    from (
      select l.dungeon_id,
             jsonb_object_agg(m.mode, to_jsonb(l.last_at + make_interval(secs => d.cooldown_s / m.divisor)))
               filter (where l.last_at + make_interval(secs => d.cooldown_s / m.divisor) > now()) as modes
        from (select meta->>'dungeon' as dungeon_id, max(at) as last_at
                from public.player_ledger
               where user_id = p_user
                 and slot = coalesce(p_slot, 0)
                 and kind = 'dungeon'
                 -- TIME-BOUNDED (Security S-3, measured 6.9 ms/envelope unbounded on
                 -- the heaviest live character): a settle older than the LONGEST
                 -- cooldown in the catalogue can never produce an active window, so
                 -- reading it is pure cost. Keeps hr_state_of's extra work
                 -- proportional to recent play instead of to lifetime history, and
                 -- lets the partial index serve the range directly.
                 and at > now() - make_interval(secs =>
                       (select max(cooldown_s) from public.hr_dungeons))
                 and coalesce(meta->>'op', 'settle') = 'settle'
                 and public.hr_dungeon_cooldown_divisor(meta->>'mode') is not null
               group by 1) l
        join public.hr_dungeons d on d.dungeon_id = l.dungeon_id
        cross join lateral (select e.key as mode, (e.value #>> '{}')::int as divisor
                              from jsonb_each(public.hr_dungeon_cooldown_modes()) e) m
       where d.cooldown_s > 0 and m.divisor > 0
       group by l.dungeon_id
    ) w
   where w.modes is not null
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_farm_plot_cap(p_user uuid)
 returns integer
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_temp
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  with lv as (
    select coalesce(max(level) filter (where unlock_id like 'property:%'), 0)::int as tier,
           coalesce(max(level) filter (where unlock_id = 'room:garden'), 0)::int as garden
      from public.hr_unlock_levels(p_user, null)
  )
  select (lv.tier + 1) * 2
       + coalesce((select (rp.perks->>'farmPlots')::int
                     from public.hr_room_perks rp
                    where rp.room_id = 'garden'
                      and rp.level = least(lv.garden,
                            (select max(level) from public.hr_room_perks where room_id = 'garden'))), 0)
    from lv
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_farm_plot_level(p_user uuid)
 returns integer
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_temp
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select coalesce((select plot_level from public.account_farm where user_id = p_user), 1)
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_flag_on(p_key text)
 returns boolean
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select coalesce((select enabled from public.hr_flags where key = p_key), false)
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_gem_unlocks_of(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select coalesce(jsonb_agg(q.id order by q.id), '[]'::jsonb) from (
    select g.unlock_id as id
      from public.hr_gem_unlocks g
     where g.free
    union
    select g.unlock_id
      from public.hr_gem_unlocks g
      join public.player_progress pp
        on  pp.user_id = p_user
        and pp.kind = 'flag' and pp.period_key = ''
        and pp.key = g.unlock_id
        and pp.value > 0
  ) q
  -- p_slot is context, not a filter (see the ⚠ above). Referenced here so the
  -- argument cannot be dropped by accident and so a reader who greps for it
  -- lands on the explanation rather than concluding it was forgotten.
  where p_user is not null and coalesce(p_slot, 0) >= 0
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_hero_slots_of(p_user uuid)
 returns jsonb
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select coalesce(jsonb_agg(q.s order by q.s), '[]'::jsonb) from (
    select 0 as s
    union
    -- CLAUSE (0) THE STARTER SLOTS — every account owns them (Tyler 2026-10-17: two to start).
    select c.slot_id
      from public.hr_hero_slots c
     where c.starter
    union
    -- CLAUSE (1) GRANDFATHER — an existing character IS ownership.
    select ps.slot
      from public.player_state ps
     where ps.user_id = p_user and ps.slot > 0
    union
    -- CLAUSE (2) BOUGHT — the flag row hr_buy_hero_slot writes, read through the catalogue.
    select c.slot_id
      from public.hr_hero_slots c
      join public.player_progress pp
        on  pp.user_id = p_user and pp.slot = 0
        and pp.kind = 'flag' and pp.period_key = ''
        and pp.key = 'character_slot:' || c.slot_id
        and pp.value > 0
    union
    -- CLAUSE (3) WAIVED — no slot is waived since 2026-10-23; kept so a waiver is data again.
    select c.slot_id
      from public.hr_hero_slots c
     where c.premium_waived
       and exists (select 1 from public.player_progress e
                    where e.user_id = p_user and e.slot = 0
                      and e.kind = 'flag' and e.period_key = ''
                      and e.key = 'entitlement:hearthHall' and e.value > 0)
  ) q
  where p_user is not null
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_home_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  /* 2026-11-29-house-home.sql: the account's home as the server prices it. Only
     SELLABLE offers (refusal is null) appear, so the window can never show a
     price the server would not charge. Names are the catalogue's
     ('Kitchen — Hearthstone': the room before the dash, the rung after it). */
  with lv as (
    select l.unlock_id, l.level from public.hr_unlock_levels(p_user, p_slot) l),
  t as (select public.hr_account_property_tier(p_user) as tier),
  o as (
    select x.*, u.namespace from public.hr_unlock_offers x
      join public.hr_unlocks u on u.unlock_id = x.unlock_id
     where x.refusal is null and u.namespace in ('room', 'property')),
  r as (
    select o.unlock_id, coalesce(max(lv.level), 0)::int as level, count(*)::int as rungs
      from o left join lv on lv.unlock_id = o.unlock_id
     where o.namespace = 'room' group by o.unlock_id)
  select jsonb_build_object(
    'tier', (select tier from t),
    'tiers', coalesce((select jsonb_agg(jsonb_build_object('offer', o.offer_id, 'name', o.name, 'tier', o.value,
        'gold', o.gold, 'items', o.items, 'need', o.req_property_tier, 'owned', o.value <= (select tier from t))
        order by o.value) from o where o.namespace = 'property'), '[]'::jsonb),
    'rooms', coalesce((select jsonb_agg(jsonb_build_object(
        'room', substring(r.unlock_id from 6),
        'name', (select split_part(o.name, ' — ', 1) from o where o.unlock_id = r.unlock_id order by o.value limit 1),
        'level', r.level, 'rungs', r.rungs,
        'opens', (select o.req_property_tier from o where o.unlock_id = r.unlock_id order by o.value limit 1),
        'rung_name', (select split_part(o.name, ' — ', 2) from o where o.unlock_id = r.unlock_id and o.value = r.level),
        'next', (select jsonb_build_object('offer', o.offer_id, 'name', split_part(o.name, ' — ', 2), 'rung', o.value,
                   'gold', o.gold, 'items', o.items, 'need', o.req_property_tier, 'item', o.req_item)
                   from o where o.unlock_id = r.unlock_id and o.value > r.level order by o.value limit 1))
        order by (select o.req_property_tier from o where o.unlock_id = r.unlock_id order by o.value limit 1), r.unlock_id)
        from r), '[]'::jsonb))
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_hunt_analyzer_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select case when public.hr_premium_active(p_user, p_slot, now())
              then (select case when a is null then null else jsonb_build_object('tier', 'premium') || a end
                      from public.hr_hunt_analyzer_of(p_user, p_slot, null) a)
              else public.hr_hunt_analyzer_basic(public.hr_hunt_analyzer_of(p_user, p_slot, null)) end
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_hunt_bests_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  -- BESTS-SUPPLY (2026-12-06-hunt-bests-supply.sql): each mode also carries supply_h, the xp_h run's store gold an hour.
  select jsonb_build_object(
    'min_ms', (extract(epoch from public.hr_hunt_best_min()) * 1000)::bigint,
    'grounds', coalesce((select jsonb_object_agg(g.hunt_id, g.modes)
                           from (select b.hunt_id, jsonb_object_agg(b.mode, jsonb_build_object('xp_h', b.xp_h, 'balance_h', b.balance_h,
                                                                                                'supply_h', b.supply_h)) as modes
                                   from public.hunt_bests b
                                  where b.user_id = p_user and b.slot = p_slot
                                  group by b.hunt_id) g), '{}'::jsonb))
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_hunt_density_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  -- DENSITY-HOME (2026-11-17-hunt-density-home.sql): one character's picks, { <hunt_id>: pick }.
  select coalesce((select jsonb_object_agg(d.hunt_id, d.density order by d.hunt_id)
                     from public.hunt_density d where d.user_id = p_user and d.slot = p_slot), '{}'::jsonb)
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_hunt_limit(p_key text)
 returns integer
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select value from public.hr_hunt_limits where key = p_key
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_hunt_party_of(p_user uuid, p_slot integer)
 returns uuid
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select m.party_id from public.hunt_party_members m join public.hunt_parties p on p.id = m.party_id
   where m.user_id = p_user and m.slot = p_slot and p.closed_at is null
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_hunt_presets_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select coalesce((select jsonb_agg(jsonb_build_object('preset', p.preset, 'name', p.name, 'action_set', p.action_set,
                                                       'gear', p.gear, 'restock', p.restock) order by p.preset)
                     from public.player_hunt_presets p where p.user_id = p_user and p.slot = p_slot), '[]'::jsonb)
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_hunt_role_default(p_role text, p_party text[])
 returns jsonb
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  -- TOWN-DEFAULTS (2027-01-25-town-defaults.sql): src/core/hunt/roles.js defaultSettings(role, party) as option keys,
  -- from its generated table: alone, with a Melee seat, or without one (the hero's own role always counted). The
  -- generator (tools/gen-catalogues.mjs) proves this rule against the engine for every party up to PARTY.maxSize + 1.
  with d as (select public.hr_hunt_role_defaults() as j),
       p as (select case when p_role = any (coalesce(p_party, '{}'::text[])) then array_remove(p_party, null)
                         else array_remove(coalesce(p_party, '{}'::text[]), null) || p_role end as roles)
  select d.j->p_role->(case when cardinality(p.roles) <= 1 then 'solo'
                            when exists (select 1 from unnest(p.roles) r where coalesce((d.j->r->>'melee')::boolean, false)) then 'party'
                            else 'party_nomelee' end)
    from d, p
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_hunt_setup_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  -- SETUP-PER-GROUND (2026-12-05-hunt-setup-per-ground.sql): { <hunt_id>: the setup last entered on }, a set that
  -- still exists only (set 0 always does), so the picker never pre-picks a deleted setup.
  select coalesce((select jsonb_object_agg(d.hunt_id, d.preset order by d.hunt_id)
                     from public.hunt_density d
                    where d.user_id = p_user and d.slot = p_slot and d.preset is not null
                      and (d.preset = 0 or exists (select 1 from public.player_action_sets a
                                                    where a.user_id = d.user_id and a.slot = d.slot and a.preset = d.preset))),
                  '{}'::jsonb)
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_hunt_supply_of(p_user uuid, p_slot integer, p_preset integer)
 returns jsonb
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select jsonb_build_object(
    'supply_source', coalesce(a.options->>'supply_source', 'mine'),
    'on_empty', coalesce(a.options->>'on_empty', 'switch'),
    'gold_floor', coalesce((a.options->>'gold_floor')::bigint, public.hr_hunt_limit('gold_floor_default')::bigint, 0))
    from (select 1) one
    left join public.player_action_sets a on a.user_id = p_user and a.slot = p_slot and a.preset = p_preset
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_hunt_view(p_session uuid)
 returns jsonb
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  -- DENSITY-HOME (2026-11-17-hunt-density-home.sql): `forfeit`, the session ended by the refused-window rule.
  -- FORFEIT-DURABLE (2026-11-20-hunt-forfeit-durable.sql): read from the session row (hr_hunt_forfeit sets it;
  -- its CHECK keeps it to an ended `server`/`left` session), never from the pruned ledger.
  select jsonb_build_object(
    'id', s.id, 'hunt', s.hunt_id, 'prev', s.prev_session_id, 'preset', s.preset,
    'hours_limit', s.hours_limit,
    'entered_at', s.entered_at, 'hunt_from', s.hunt_from, 'settled_to', s.settled_to,
    'instance', s.instance_id, 'unit', s.unit_id, 'seat', s.seat,
    'leave_at', s.leave_at, 'change_at', s.change_at, 'change_to', s.change_to,
    'ended_at', s.ended_at, 'end_reason', s.end_reason,
    'forfeit', s.forfeit,
    -- LEAVE-TOGETHER (2026-12-18-party-leave-together.sql): a cascade end names the member whose own end at the same
    -- instant sent this hero home (its death for party_member_died), from the server's rows; else null.
    'end_by', case when s.end_reason in ('party_member_died', 'party_member_left') then (
      select public.hr_character_name(o.user_id, o.slot) from public.hunt_sessions o
       where o.instance_id = s.instance_id and o.id <> s.id and o.ended_at = s.ended_at
         and o.end_reason not in ('party_member_died', 'party_member_left')
       order by (o.end_reason = 'died') = (s.end_reason = 'party_member_died') desc, o.seat, o.id limit 1) end,
    'home_at',
    case when s.ended_at is not null then s.ended_at + make_interval(secs => coalesce(
      (select travel_s from public.hr_hunt_travel t where t.hunt_id = s.hunt_id), 0)) end,
    'seen_event_id', s.seen_event_id, 'version', s.version,
    'phase', case when s.ended_at is not null then 'ended'
                  when s.leave_at is not null or s.change_at is not null then 'leaving'
                  when now() < s.hunt_from then 'walking' else 'hunting' end,
    'bag', coalesce((select jsonb_agg(jsonb_build_object('item', b.item_id, 'loaded', b.qty_loaded,
                       'left', b.qty_left, 'essential', b.essential) order by b.item_id)
                     from public.hunt_bag b where b.session_id = s.id), '[]'::jsonb),
    'tally', (select jsonb_build_object('kills', t.kills, 'xp', t.xp, 'coins', t.coins, 'loot', t.loot,
                       'supplies', t.supplies, 'deaths', t.deaths, 'paid_ms', t.paid_ms,
                       'bought', t.bought, 'supply_gold', t.supply_gold)
              from public.hunt_session_tally t where t.session_id = s.id))
  from public.hunt_sessions s where s.id = p_session
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_hunt_weapon_of(p_user uuid, p_slot integer)
 returns text
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  -- SPELL-ROLES (2027-01-13-spell-roles.sql): the weapon's key (hr_hunt_weapons; unarmed = neutral), turned into its
  -- shield arm (hr_hunt_weapon_roles.with_shield) when the shield slot holds a shield (hr_hunt_shields).
  with k as (
    select coalesce((select w.weapon_type from public.player_equipment pe
                       join public.hr_hunt_weapons w on w.item_id = pe.item_id
                      where pe.user_id = p_user and pe.slot = p_slot and pe.equip_slot = 'weapon'), 'neutral') as t)
  select coalesce((select r.with_shield from k
                     join public.hr_hunt_weapon_roles r on r.weapon_type = k.t and r.with_shield is not null
                     join public.player_equipment pe on pe.user_id = p_user and pe.slot = p_slot and pe.equip_slot = 'shield'
                     join public.hr_hunt_shields s on s.item_id = pe.item_id), (select k.t from k))
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_level_block(p_xp bigint)
 returns jsonb
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select jsonb_build_object('xp', x, 'level', lv,
           'into', x - public.hr_char_xp_for_level(lv),
           'need', public.hr_char_xp_for_level(lv + 1) - public.hr_char_xp_for_level(lv))
    from (select greatest(0, coalesce(p_xp, 0)) as x, public.hr_char_level(p_xp) as lv) a
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_level_from_xp(p_xp bigint)
 returns integer
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select coalesce((select max(level) from public.hr_xp_table
                    where xp <= greatest(0, coalesce(p_xp, 0))), 1)
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_level_of(p_user uuid, p_slot integer)
 returns integer
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select public.hr_char_level(coalesce((select ps.level_xp from public.player_state ps
                                         where ps.user_id = p_user and ps.slot = p_slot), 0))
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_login_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select jsonb_build_object(
    'premium', public.hr_premium_active(p_user, p_slot, now()),
    'days', ps.login_days,
    'claimed_today', exists (select 1 from public.player_progress pp where pp.user_id = p_user and pp.slot = p_slot
                              and pp.kind = 'daily' and pp.key = 'login'
                              and pp.period_key = public.hr_utc_day_key(now()) and pp.state = 'claimed'),
    'reward', (select jsonb_build_object('item', r.item_id, 'qty', r.qty) from public.hr_premium_login_reward r where r.id))
    from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_max_hp(p_level integer, p_heavy integer)
 returns integer
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select floor((public.hr_hunt_limit('hp_base')::bigint + public.hr_hunt_limit('hp_per_level')::bigint * (greatest(1, coalesce(p_level, 1)) - 1))
               * (1000 + floor(public.hr_hunt_limit('heavy_hp_permille')::bigint * greatest(0, coalesce(p_heavy, 0)) / public.hr_hunt_limit('armour_slots')))
               / 1000)::int
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_max_mana(p_level integer, p_light integer)
 returns integer
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select floor((public.hr_hunt_limit('mana_base')::bigint + public.hr_hunt_limit('mana_per_level')::bigint * (greatest(1, coalesce(p_level, 1)) - 1))
               * (1000 + floor(public.hr_hunt_limit('light_mana_permille')::bigint * greatest(0, coalesce(p_light, 0)) / public.hr_hunt_limit('armour_slots')))
               / 1000)::int
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_monster_level(p_monster text)
 returns integer
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select coalesce((select a.level from public.hr_activities a where a.kind = 'combat' and a.activity_id = p_monster), 0)
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_outfit_owned(p_user uuid, p_slot integer)
 returns text[]
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select coalesce(array_agg(o.outfit_id order by o.sort), '{}')
    from public.hr_outfits o
   where not o.premium or public.hr_premium_active(p_user, p_slot, now())
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_party_away(p_user uuid, p_slot integer, p_joined timestamp with time zone)
 returns boolean
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select not exists (select 1 from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null)
     and public.hr_party_last_seen(p_user, p_joined) <= now() - public.hr_party_away_after()
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_party_invites_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select coalesce((select jsonb_agg(x.j order by x.created_at desc, x.id) from (
    select i.id, i.created_at, jsonb_build_object('id', i.id, 'party', i.party_id, 'hunt', p.hunt_id,
                                                  'from', public.hr_character_name(i.from_user, i.from_slot)) as j
      from public.hunt_party_invites i join public.hunt_parties p on p.id = i.party_id and p.closed_at is null
     where i.to_user = p_user and i.to_slot = p_slot and i.created_at > now() - public.hr_party_invite_ttl()
     order by i.created_at desc, i.id limit 16) x), '[]'::jsonb)
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_party_seek_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  -- PARTY-FINDER (2026-12-07-party-finder.sql): this hero's own seek, { hunt, left_ms }, or null.
  select (select jsonb_build_object('hunt', s.hunt_id,
                                    'left_ms', greatest(0, floor(extract(epoch from (s.expires_at - now())) * 1000))::bigint)
            from public.party_seekers s
           where s.user_id = p_user and s.slot = p_slot and s.expires_at > now())
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_premium_active(p_user uuid, p_slot integer, p_at timestamp with time zone)
 returns boolean
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  -- BETA-PREMIUM (2026-12-17-beta-premium.sql): every premium decision goes through here or
  -- hr_premium_until; nothing else reads the column or the switch.
  select coalesce(public.hr_premium_until(p_user, p_slot) > coalesce(p_at, now()), false)
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_premium_until(p_user uuid, p_slot integer)
 returns timestamp with time zone
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  -- BETA-PREMIUM (2026-12-17-beta-premium.sql): THE ONLY READER of the beta switch and of
  -- player_state.premium_until. While hr_flags `beta_premium` is on, every character is premium
  -- with no end (+infinity); otherwise its own premium_until (null = free). No row = no character = null.
  select case when public.hr_flag_on('beta_premium') then 'infinity'::timestamptz else ps.premium_until end
    from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_premium_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  -- BETA-PREMIUM (2026-12-17-beta-premium.sql): active and perks through hr_premium_active.
  select jsonb_build_object(
    'until', ps.premium_until,
    'active', a.prem,
    'stamina_max_ms', public.hr_stamina_cap(p_user, p_slot, now()),
    'perks', jsonb_build_object('analyzer', a.prem, 'outfits', a.prem, 'login', a.prem))
    from public.player_state ps
    cross join lateral (select public.hr_premium_active(p_user, p_slot, now()) as prem) a
   where ps.user_id = p_user and ps.slot = p_slot
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_recipes_of(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select coalesce(jsonb_object_agg(substring(pp.key from 8), true), '{}'::jsonb)
    from public.player_progress pp
    join public.hr_unlocks u
      on  u.unlock_id = pp.key
      and u.namespace = 'recipe'
      and u.progress_kind = pp.kind
   where pp.user_id = p_user
     and pp.slot    = coalesce(p_slot, 0)
     and pp.period_key = ''
     and pp.value  > 0
     and p_user is not null
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_regen_permille(p_flame integer)
 returns integer
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select 1000 + floor(public.hr_hunt_limit('flame_regen_max_permille')::bigint * p
                      / (p + public.hr_hunt_limit('flame_regen_k')))::int
    from (select greatest(1, coalesce(p_flame, 1))::bigint as p) x
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_renown_of(p_user uuid, p_slot integer)
 returns bigint
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_temp
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

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
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_seed(p_user uuid, p_slot integer, p_label text)
 returns bigint
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select (('x' || encode(substring(
            sha256((select secret from public.hr_server_secrets where name = 'prng')
                   || convert_to(coalesce(p_user::text,'') || ':' || coalesce(p_slot,0)::text
                                 || ':' || coalesce(p_label,''), 'utf8'))
            from 1 for 8), 'hex'))::bit(64))::bigint
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_skill_level(p_skill text, p_xp bigint)
 returns integer
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select case when exists (select 1 from public.hr_skills k where k.skill_id = p_skill and k.cat = 'combat')
              then coalesce((select max(c.level) from public.hr_skill_curve c where c.xp <= greatest(0, coalesce(p_xp, 0))), 1)
              else public.hr_level_from_xp(p_xp) end
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_social_party_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  -- SOCIAL-PASS: each seat by its own hero's name.
  select coalesce((select jsonb_agg(jsonb_build_object('seat', m.seat, 'user', m.user_id, 'slot', m.slot,
                                                       'name', left(public.hr_character_name(m.user_id, m.slot), 24)) order by m.seat)
                     from public.hunt_party_members m
                    where m.party_id = public.hr_hunt_party_of(p_user, p_slot)), '[]'::jsonb)
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_stamina_cap(p_user uuid, p_slot integer, p_at timestamp with time zone)
 returns bigint
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select (case when public.hr_premium_active(p_user, p_slot, p_at)
               then public.hr_hunt_limit('stamina_premium_min') else public.hr_hunt_limit('stamina_free_min') end)::bigint * 60000
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_storage_room_used(p_user uuid)
 returns integer
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select count(*)::int from (
    select b.item_id from public.account_bank b where b.user_id = p_user
    union
    select l.item_id from public.market_listings l where l.user_id = p_user) k
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_tally_section(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  -- TALLY (2026-12-23-tally-tasks.sql)
  select jsonb_build_object(
    'held', coalesce((select jsonb_agg(jsonb_build_object('place', t.place, 'task', t.task_id, 'hunt', c.hunt_id,
                        'monster', c.monster_id, 'kills', t.kills, 'target', t.target, 'keep', t.keep,
                        'done', t.done_at is not null, 'done_at', t.done_at, 'wait', t.wait) order by t.place)
                        from public.hero_tally_tasks t join public.hr_tally_tasks c on c.task_id = t.task_id
                       where t.user_id = p_user and t.slot = p_slot), '[]'::jsonb),
    'paid_today', (select count(*) from public.hero_tally_claims k
                    where k.user_id = p_user and k.slot = p_slot and k.day = (now() at time zone 'UTC')::date),
    'per_day', cfg.paid_per_day,
    'held_max', cfg.held_max,
    'weight', (select h.weight from public.hero_tally h where h.user_id = p_user and h.slot = p_slot),
    'order', to_jsonb(coalesce((select nullif(h.slot_order, '{}'::text[]) from public.hero_tally h
                                 where h.user_id = p_user and h.slot = p_slot), cfg.slot_order)),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('claim', k.id, 'at', k.at, 'task', k.task_id, 'gold', k.gold,
                          'item', k.item_id, 'qty', k.qty, 'pick', k.pick) order by k.at desc)
                          from (select * from public.hero_tally_claims k
                                 where k.user_id = p_user and k.slot = p_slot and k.at > now() - interval '24 hours'
                                 order by k.at desc limit 3) k), '[]'::jsonb),
    'day_ends_at', date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' + interval '1 day')
    from public.hr_tally_config cfg where cfg.only_row
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_total_level(p_user uuid, p_slot integer)
 returns integer
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select coalesce(sum(public.hr_skill_level(skill_id, xp)), 0)::int
    from public.player_skills where user_id = p_user and slot = p_slot
  ) as hr_q(v) limit 1);
end
$plc$;

create or replace function public.hr_vitals_of(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

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
  ) as hr_q(v) limit 1);
end
$plc$;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED; the probe hero and the pg_temp pre-images roll back ──────────
-- Fails on the pre-image (every function still sql) and on any body, property or answer that moved.
do $check$
declare
  c_probe constant uuid := '000000d6-0000-4000-a000-00005e77c0de';
  r record; v jsonb; v_n int; v_ex text; v_total int := 0;
begin
  -- (a) THE SHAPE: plpgsql, the pinned body, every kept property.
  for r in select * from (values
    ('public.hr_account_property_tier(uuid)', '1ebcf2b9d6b472066d140d6ee4c387ee', 's', true, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_account_view(uuid,integer)', 'a3021f48b07e8c0847979e8a14d5000b', 's', true, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_bag_rules_view(uuid,integer)', '9eaac916e78a119a766ae4c98271e509', 's', true, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_bench_run_view(uuid,integer)', '3cc273accf7e98464f8fca1770dce683', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_blessing_price(integer,integer)', '2f218f3971f24cb68c223711c54684b5', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_blessings_view(uuid,integer)', 'e672ab17056929ed17bfdf445ac93a82', 's', true, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_character_name(uuid,integer)', '059e305c3b74fc4c196372ed51d08613', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_character_name_view(uuid,integer)', 'a4a5d783eb4e24c1fd66ccf178e2d156', 's', true, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_death_log_view(uuid,integer)', '950094fdab0f4c665e26a289bf5bf61f', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_depot_cap(uuid)', '1180679abaa09da84294b714309d8ce6', 's', true, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_dungeon_cooldowns(uuid,integer)', 'ac1df9f760a395b79db564f516851a5b', 's', true, false, 'u', '["search_path=public"]'),
    ('public.hr_farm_plot_cap(uuid)', '485b11f6f274489585960cc932898271', 's', true, false, 'u', '["search_path=public, pg_temp"]'),
    ('public.hr_farm_plot_level(uuid)', 'e5812a61c21c55bbe381e5564c144605', 's', true, false, 'u', '["search_path=public, pg_temp"]'),
    ('public.hr_flag_on(text)', 'e4fc4d20f7bfaa3df8c2fdac688bee21', 's', true, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_gem_unlocks_of(uuid,integer)', '6cf041fe40ebef4c508557c99dd68398', 's', false, false, 'u', '["search_path=public"]'),
    ('public.hr_hero_slots_of(uuid)', 'cdbf9edeff38abe5ee8aea82aa394322', 's', false, false, 'u', '["search_path=public"]'),
    ('public.hr_home_view(uuid,integer)', '02a0ebb7b7b4f3dd4de45cc84276aac1', 's', true, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_hunt_analyzer_view(uuid,integer)', '08a8fe8399e668920ac8d2aad79525d0', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_hunt_bests_view(uuid,integer)', '63a0fda740e1143f7a62b4be7095ecb7', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_hunt_density_view(uuid,integer)', '96dedf92ab611b8e593a6c055abe1543', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_hunt_limit(text)', '5d5dac60c606d93e4047b1cff2550952', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_hunt_party_of(uuid,integer)', '169977bfd7f2b8e8fad257fb36c72f4a', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_hunt_presets_view(uuid,integer)', '80167dba911a1d5dbc20813bd01d64a3', 's', true, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_hunt_role_default(text,text[])', '31d7a3c80faca7cb082953b32d5cf6dc', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_hunt_setup_view(uuid,integer)', '4426cfef02eda83502d0ae9c45399b94', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_hunt_supply_of(uuid,integer,integer)', '2b4f22e5717a828da1f9b65069177983', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_hunt_view(uuid)', 'e1337c1b1e2922d1a2dba8dbfa8f683c', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_hunt_weapon_of(uuid,integer)', 'b6d3d2061794a73ed730c3d136f8e60f', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_level_block(bigint)', '65ef901ed37aedd87488d1c2701ca94b', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_level_from_xp(bigint)', 'db9d93abfe7598cc1e079ee9754c482b', 's', false, false, 'u', '["search_path=public"]'),
    ('public.hr_level_of(uuid,integer)', '8f64a66cac32b3fabeddc9db3a0cd853', 's', true, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_login_view(uuid,integer)', '6809b0885556aacf5ce7607acde19627', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_max_hp(integer,integer)', '85cf3ea83d223ab68a068a4b15d02a0f', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_max_mana(integer,integer)', '2183d528fcdadcc27f880239fdd211c1', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_monster_level(text)', '89141b7df53cb29226fe1a12194fb8eb', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_outfit_owned(uuid,integer)', 'aeefd7b1ea41a80660d37b7c0288a1d0', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_party_away(uuid,integer,timestamp with time zone)', 'fa5b13ca8f83b169727673060d3a79aa', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_party_invites_view(uuid,integer)', 'b92c5e44f6c6e47c28f05f3a13e12dc5', 's', true, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_party_seek_view(uuid,integer)', '3e62b982cd7df3e1a91ffde3217f5794', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_premium_active(uuid,integer,timestamp with time zone)', '1b7f1250d24c246a29df1f3d38e27399', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_premium_until(uuid,integer)', '90a711aec206cd2d90d31f944846a920', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_premium_view(uuid,integer)', 'ef621cdc2bb0c4532679c629a065d142', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_recipes_of(uuid,integer)', 'b3ad733081f12ffffdd5a19a00732fab', 's', false, false, 'u', '["search_path=public"]'),
    ('public.hr_regen_permille(integer)', '7f7791b55addaf3b09580260a43499c1', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_renown_of(uuid,integer)', '11df531e2fad58c647fd247436983c2a', 's', true, false, 'u', '["search_path=public, pg_temp"]'),
    ('public.hr_seed(uuid,integer,text)', '8929662285421a05404597fb192e19a1', 's', true, false, 'u', '["search_path=public"]'),
    ('public.hr_skill_level(text,bigint)', '052678f95f2e9c16005a5dd91e17435b', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_social_party_view(uuid,integer)', '3cf0aea3da0f2dcfb40188e9e10b3a76', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_stamina_cap(uuid,integer,timestamp with time zone)', 'e339b7e0bf315f66af0fd9babfea4fe8', 's', false, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_storage_room_used(uuid)', 'cb49db6d03a4de18bb36751d1bc42114', 's', true, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_tally_section(uuid,integer)', '24867820796f1fdcc0074e1d70935f55', 's', true, false, 'u', '["search_path=public, pg_catalog"]'),
    ('public.hr_total_level(uuid,integer)', 'c18da03cbc435ed2ea3594505ee1f018', 's', true, false, 'u', '["search_path=public"]'),
    ('public.hr_vitals_of(uuid,integer)', 'ee12af9d6bcb4a0264bdc4ac3a4508e1', 's', true, false, 'u', '["search_path=public, pg_catalog"]')
  ) as t(sig, post, vol, secdef, isstrict, par, cfg) loop
    if not exists (select 1 from pg_proc p join pg_language l on l.oid = p.prolang
                    where p.oid = to_regprocedure(r.sig) and l.lanname = 'plpgsql' and md5(replace(p.prosrc, chr(13), '')) = r.post
                      and p.provolatile = r.vol and p.prosecdef = r.secdef and p.proisstrict = r.isstrict and p.proparallel = r.par
                      and coalesce(to_jsonb(p.proconfig)::text, 'null') = coalesce(r.cfg::jsonb::text, 'null')) then
      raise exception 'plan-cache §2(a): % is not this file''s plpgsql image with its properties kept', r.sig;
    end if;
  end loop;

  begin
    -- A PROBE HERO, so the replay (no characters yet) exercises every (uuid, integer) body; production adds its own.
    insert into auth.users (id) values (c_probe) on conflict (id) do nothing;
    if to_regclass('public.hr_access_allowlist') is not null then
      insert into public.hr_access_allowlist (user_id, note) values (c_probe, 'plan-cache §2 probe') on conflict (user_id) do nothing;
    end if;
    perform set_config('request.jwt.claim.sub', c_probe::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'plan-cache §2-harness: hr_create_character refused: %', v; end if;
    perform set_config('request.jwt.claim.sub', '', true);

    -- (b) THE ANSWERS: each function against its SQL pre-image (a pg_temp copy), as text, over the probe inputs.

    execute $pre$create or replace function pg_temp.hrpc_hr_account_property_tier(p_user uuid)
 returns integer
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select coalesce(max(pp.value), 0)::int
    from public.player_progress pp
    join public.hr_unlocks u on u.unlock_id = pp.key and u.progress_kind = pp.kind
   where pp.user_id = p_user and pp.period_key = '' and u.namespace = 'property'
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'))) as example
            from (select x from (select user_id from public.player_state union select id from (select id from public.hunt_sessions order by entered_at desc limit 200) s
           union select '00000000-0000-0000-0000-000000000000'::uuid) t(x)) p0(x)
           where public.hr_account_property_tier(p0.x)::text is distinct from pg_temp.hrpc_hr_account_property_tier(p0.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_account_property_tier answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_account_view(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select jsonb_build_object(
    'max_concurrent', public.hr_hunt_limit('max_concurrent'),
    -- every slot the catalogue holds, plus slot 0 (free, never in the catalogue)
    'hero_slots_max', (select coalesce(max(c.slot_id), 0) + 1 from public.hr_hero_slots c),
    -- the next slot this account can buy: the lowest unowned, priced, non-starter row
    'hero_slot_offer', (
      select jsonb_build_object('slot_id', c.slot_id, 'cost_gold', c.cost_gold)
        from public.hr_hero_slots c
       where not c.starter and c.cost_gold > 0
         and not (public.hr_hero_slots_of(p_user) @> to_jsonb(c.slot_id))
       order by c.slot_id
       limit 1))
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_account_view(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_account_view(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_account_view answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_bag_rules_view(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select jsonb_build_object(
    'locked', coalesce((select jsonb_agg(r.item_id order by r.item_id) from public.player_item_rules r
                         where r.user_id = p_user and r.slot = p_slot and r.locked), '[]'::jsonb),
    'loot', coalesce((select jsonb_object_agg(r.item_id, r.loot_rule) from public.player_item_rules r
                       where r.user_id = p_user and r.slot = p_slot and r.loot_rule <> 'keep'), '{}'::jsonb),
    'restock', coalesce((select jsonb_object_agg(r.item_id, r.restock) from public.player_item_rules r
                          where r.user_id = p_user and r.slot = p_slot and r.restock > 0), '{}'::jsonb))
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_bag_rules_view(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_bag_rules_view(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_bag_rules_view answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_bench_run_view(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  -- The column as stored: only the artisan engine reads it (accrual.js accrueArtisan), and the
  -- Work window shows it on a bench row only.
  select jsonb_build_object('left', ps.active_left)
    from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_bench_run_view(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_bench_run_view(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_bench_run_view answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_blessing_price(p_tier integer, p_level integer)
 returns bigint
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select case when p_level < r.free_until_level then 0
              else t.base::bigint + t.per_level::bigint * (p_level - r.free_until_level) end
    from public.hr_blessing_tiers t, public.hr_blessing_rule r
   where t.tier = p_tier and r.id
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'), coalesce(p1.x::text, 'null'))) as example
            from (select x from unnest(array[null, -1, 0, 1, 2, 3, 4, 5, 9, 10, 15, 20, 30, 45, 50, 60, 75, 99, 100, 120, 150, 1000]::int[]) x) p0(x) cross join (select x from unnest(array[null, -1, 0, 1, 2, 3, 4, 5, 9, 10, 15, 20, 30, 45, 50, 60, 75, 99, 100, 120, 150, 1000]::int[]) x) p1(x)
           where public.hr_blessing_price(p0.x, p1.x)::text is distinct from pg_temp.hrpc_hr_blessing_price(p0.x, p1.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_blessing_price answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_blessings_view(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  with lv as (select greatest(1, coalesce(public.hr_level_of(p_user, p_slot), 1)) as level)
  select jsonb_build_object(
    'held', coalesce((select jsonb_agg(b.tier order by b.tier) from public.player_blessings b where b.user_id = p_user and b.slot = p_slot), '[]'::jsonb),
    'permille', coalesce((select max(t.permille) from public.player_blessings b join public.hr_blessing_tiers t on t.tier = b.tier
                           where b.user_id = p_user and b.slot = p_slot), 0),
    'free_until', (select r.free_until_level from public.hr_blessing_rule r where r.id),
    'tiers', coalesce((select jsonb_agg(jsonb_build_object('tier', t.tier, 'permille', t.permille,
                                                           'price', public.hr_blessing_price(t.tier, lv.level),
                                                           'held', exists (select 1 from public.player_blessings b
                                                                            where b.user_id = p_user and b.slot = p_slot and b.tier = t.tier))
                                         order by t.tier)
                         from public.hr_blessing_tiers t, lv), '[]'::jsonb))
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_blessings_view(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_blessings_view(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_blessings_view answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_character_name(p_user uuid, p_slot integer)
 returns text
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select coalesce(
    (select n.name from public.character_names n where n.user_id = p_user and n.slot = p_slot),
    (select case when p_slot = 0 then pr.display_name else pr.display_name || ' (' || (p_slot + 1) || ')' end
       from public.profiles pr where pr.id = p_user and pr.display_name is not null),
    'Adventurer')
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_character_name(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_character_name(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_character_name answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_character_name_view(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select to_jsonb(public.hr_character_name(p_user, p_slot))
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_character_name_view(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_character_name_view(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_character_name_view answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_death_log_view(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  -- DEATH-POPUP (2026-11-07-death-popup-blessing.sql): each row names its session and what its Blessing kept.
  -- `saved` is read from the ledger, which is pruned at retain_days: only a death of the last 30 days carries
  -- the key (null = no Blessing was used); an older one omits it rather than claim none was used. The ledger
  -- row is written by the settle that priced the death, at or after the death and within its window.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'at', d.at, 'hunt', d.hunt_id, 'session', d.session_id, 'monster', nullif(d.data->>'monster', ''),
           'xp', case when d.data ? 'xp' then (d.data->>'xp')::bigint end,
           'xp_lost', case when jsonb_typeof(d.data->'xp_lost') = 'object' then d.data->'xp_lost' end)
         || case when d.at > now() - interval '30 days' then jsonb_build_object('saved',
              (select case when jsonb_typeof(l.meta->'saved') = 'object' then l.meta->'saved' end
                 from public.player_ledger l
                where l.session_id = d.session_id and l.user_id = p_user and l.slot = p_slot
                  and l.intent = 'blessing_used' and l.at >= d.at and l.at < d.at + interval '2 days'
                order by l.id limit 1)) else '{}'::jsonb end
         order by d.at desc, d.id desc), '[]'::jsonb)
    from (select e.id, e.at, e.data, h.hunt_id, h.id as session_id
            from public.hunt_sessions h
            join public.hunt_session_events e on e.session_id = h.id and e.type = 'death'
           where h.user_id = p_user and h.slot = p_slot
           order by e.at desc, e.id desc
           limit 30) d
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_death_log_view(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_death_log_view(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_death_log_view answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_depot_cap(p_user uuid)
 returns integer
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select (select base_stacks from public.hr_depot_config where only_row)
       + coalesce((select sum(c.stacks) from public.account_storage_chests a
                     join public.hr_storage_chests c on c.chest_id = a.chest_id
                    where a.user_id = p_user), 0)::int
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'))) as example
            from (select x from (select user_id from public.player_state union select id from (select id from public.hunt_sessions order by entered_at desc limit 200) s
           union select '00000000-0000-0000-0000-000000000000'::uuid) t(x)) p0(x)
           where public.hr_depot_cap(p0.x)::text is distinct from pg_temp.hrpc_hr_depot_cap(p0.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_depot_cap answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_dungeon_cooldowns(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public
as $sqlpre$
  select coalesce(jsonb_object_agg(w.dungeon_id, w.modes), '{}'::jsonb)
    from (
      select l.dungeon_id,
             jsonb_object_agg(m.mode, to_jsonb(l.last_at + make_interval(secs => d.cooldown_s / m.divisor)))
               filter (where l.last_at + make_interval(secs => d.cooldown_s / m.divisor) > now()) as modes
        from (select meta->>'dungeon' as dungeon_id, max(at) as last_at
                from public.player_ledger
               where user_id = p_user
                 and slot = coalesce(p_slot, 0)
                 and kind = 'dungeon'
                 -- TIME-BOUNDED (Security S-3, measured 6.9 ms/envelope unbounded on
                 -- the heaviest live character): a settle older than the LONGEST
                 -- cooldown in the catalogue can never produce an active window, so
                 -- reading it is pure cost. Keeps hr_state_of's extra work
                 -- proportional to recent play instead of to lifetime history, and
                 -- lets the partial index serve the range directly.
                 and at > now() - make_interval(secs =>
                       (select max(cooldown_s) from public.hr_dungeons))
                 and coalesce(meta->>'op', 'settle') = 'settle'
                 and public.hr_dungeon_cooldown_divisor(meta->>'mode') is not null
               group by 1) l
        join public.hr_dungeons d on d.dungeon_id = l.dungeon_id
        cross join lateral (select e.key as mode, (e.value #>> '{}')::int as divisor
                              from jsonb_each(public.hr_dungeon_cooldown_modes()) e) m
       where d.cooldown_s > 0 and m.divisor > 0
       group by l.dungeon_id
    ) w
   where w.modes is not null
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_dungeon_cooldowns(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_dungeon_cooldowns(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_dungeon_cooldowns answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_farm_plot_cap(p_user uuid)
 returns integer
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_temp
as $sqlpre$
  with lv as (
    select coalesce(max(level) filter (where unlock_id like 'property:%'), 0)::int as tier,
           coalesce(max(level) filter (where unlock_id = 'room:garden'), 0)::int as garden
      from public.hr_unlock_levels(p_user, null)
  )
  select (lv.tier + 1) * 2
       + coalesce((select (rp.perks->>'farmPlots')::int
                     from public.hr_room_perks rp
                    where rp.room_id = 'garden'
                      and rp.level = least(lv.garden,
                            (select max(level) from public.hr_room_perks where room_id = 'garden'))), 0)
    from lv
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'))) as example
            from (select x from (select user_id from public.player_state union select id from (select id from public.hunt_sessions order by entered_at desc limit 200) s
           union select '00000000-0000-0000-0000-000000000000'::uuid) t(x)) p0(x)
           where public.hr_farm_plot_cap(p0.x)::text is distinct from pg_temp.hrpc_hr_farm_plot_cap(p0.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_farm_plot_cap answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_farm_plot_level(p_user uuid)
 returns integer
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_temp
as $sqlpre$
  select coalesce((select plot_level from public.account_farm where user_id = p_user), 1)
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'))) as example
            from (select x from (select user_id from public.player_state union select id from (select id from public.hunt_sessions order by entered_at desc limit 200) s
           union select '00000000-0000-0000-0000-000000000000'::uuid) t(x)) p0(x)
           where public.hr_farm_plot_level(p0.x)::text is distinct from pg_temp.hrpc_hr_farm_plot_level(p0.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_farm_plot_level answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_flag_on(p_key text)
 returns boolean
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select coalesce((select enabled from public.hr_flags where key = p_key), false)
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'))) as example
            from (select x from (select key from public.hr_hunt_limits union select key from public.hr_flags union select skill_id from public.hr_skills
           union select activity_id from (select activity_id from public.hr_activities where kind = 'combat' order by activity_id limit 60) a
           union select unnest(array[null, '', 'nope', 'melee', 'ranger', 'mage', 'healer', 'tank', 'accrue:probe'])) t(x)) p0(x)
           where public.hr_flag_on(p0.x)::text is distinct from pg_temp.hrpc_hr_flag_on(p0.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_flag_on answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_gem_unlocks_of(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public
as $sqlpre$
  select coalesce(jsonb_agg(q.id order by q.id), '[]'::jsonb) from (
    select g.unlock_id as id
      from public.hr_gem_unlocks g
     where g.free
    union
    select g.unlock_id
      from public.hr_gem_unlocks g
      join public.player_progress pp
        on  pp.user_id = p_user
        and pp.kind = 'flag' and pp.period_key = ''
        and pp.key = g.unlock_id
        and pp.value > 0
  ) q
  -- p_slot is context, not a filter (see the ⚠ above). Referenced here so the
  -- argument cannot be dropped by accident and so a reader who greps for it
  -- lands on the explanation rather than concluding it was forgotten.
  where p_user is not null and coalesce(p_slot, 0) >= 0;
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_gem_unlocks_of(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_gem_unlocks_of(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_gem_unlocks_of answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_hero_slots_of(p_user uuid)
 returns jsonb
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public
as $sqlpre$
  select coalesce(jsonb_agg(q.s order by q.s), '[]'::jsonb) from (
    select 0 as s
    union
    -- CLAUSE (0) THE STARTER SLOTS — every account owns them (Tyler 2026-10-17: two to start).
    select c.slot_id
      from public.hr_hero_slots c
     where c.starter
    union
    -- CLAUSE (1) GRANDFATHER — an existing character IS ownership.
    select ps.slot
      from public.player_state ps
     where ps.user_id = p_user and ps.slot > 0
    union
    -- CLAUSE (2) BOUGHT — the flag row hr_buy_hero_slot writes, read through the catalogue.
    select c.slot_id
      from public.hr_hero_slots c
      join public.player_progress pp
        on  pp.user_id = p_user and pp.slot = 0
        and pp.kind = 'flag' and pp.period_key = ''
        and pp.key = 'character_slot:' || c.slot_id
        and pp.value > 0
    union
    -- CLAUSE (3) WAIVED — no slot is waived since 2026-10-23; kept so a waiver is data again.
    select c.slot_id
      from public.hr_hero_slots c
     where c.premium_waived
       and exists (select 1 from public.player_progress e
                    where e.user_id = p_user and e.slot = 0
                      and e.kind = 'flag' and e.period_key = ''
                      and e.key = 'entitlement:hearthHall' and e.value > 0)
  ) q
  where p_user is not null;
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'))) as example
            from (select x from (select user_id from public.player_state union select id from (select id from public.hunt_sessions order by entered_at desc limit 200) s
           union select '00000000-0000-0000-0000-000000000000'::uuid) t(x)) p0(x)
           where public.hr_hero_slots_of(p0.x)::text is distinct from pg_temp.hrpc_hr_hero_slots_of(p0.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_hero_slots_of answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_home_view(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  /* 2026-11-29-house-home.sql: the account's home as the server prices it. Only
     SELLABLE offers (refusal is null) appear, so the window can never show a
     price the server would not charge. Names are the catalogue's
     ('Kitchen — Hearthstone': the room before the dash, the rung after it). */
  with lv as (
    select l.unlock_id, l.level from public.hr_unlock_levels(p_user, p_slot) l),
  t as (select public.hr_account_property_tier(p_user) as tier),
  o as (
    select x.*, u.namespace from public.hr_unlock_offers x
      join public.hr_unlocks u on u.unlock_id = x.unlock_id
     where x.refusal is null and u.namespace in ('room', 'property')),
  r as (
    select o.unlock_id, coalesce(max(lv.level), 0)::int as level, count(*)::int as rungs
      from o left join lv on lv.unlock_id = o.unlock_id
     where o.namespace = 'room' group by o.unlock_id)
  select jsonb_build_object(
    'tier', (select tier from t),
    'tiers', coalesce((select jsonb_agg(jsonb_build_object('offer', o.offer_id, 'name', o.name, 'tier', o.value,
        'gold', o.gold, 'items', o.items, 'need', o.req_property_tier, 'owned', o.value <= (select tier from t))
        order by o.value) from o where o.namespace = 'property'), '[]'::jsonb),
    'rooms', coalesce((select jsonb_agg(jsonb_build_object(
        'room', substring(r.unlock_id from 6),
        'name', (select split_part(o.name, ' — ', 1) from o where o.unlock_id = r.unlock_id order by o.value limit 1),
        'level', r.level, 'rungs', r.rungs,
        'opens', (select o.req_property_tier from o where o.unlock_id = r.unlock_id order by o.value limit 1),
        'rung_name', (select split_part(o.name, ' — ', 2) from o where o.unlock_id = r.unlock_id and o.value = r.level),
        'next', (select jsonb_build_object('offer', o.offer_id, 'name', split_part(o.name, ' — ', 2), 'rung', o.value,
                   'gold', o.gold, 'items', o.items, 'need', o.req_property_tier, 'item', o.req_item)
                   from o where o.unlock_id = r.unlock_id and o.value > r.level order by o.value limit 1))
        order by (select o.req_property_tier from o where o.unlock_id = r.unlock_id order by o.value limit 1), r.unlock_id)
        from r), '[]'::jsonb))
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_home_view(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_home_view(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_home_view answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_hunt_analyzer_view(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select case when public.hr_premium_active(p_user, p_slot, now())
              then (select case when a is null then null else jsonb_build_object('tier', 'premium') || a end
                      from public.hr_hunt_analyzer_of(p_user, p_slot, null) a)
              else public.hr_hunt_analyzer_basic(public.hr_hunt_analyzer_of(p_user, p_slot, null)) end
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_hunt_analyzer_view(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_hunt_analyzer_view(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_hunt_analyzer_view answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_hunt_bests_view(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  -- BESTS-SUPPLY (2026-12-06-hunt-bests-supply.sql): each mode also carries supply_h, the xp_h run's store gold an hour.
  select jsonb_build_object(
    'min_ms', (extract(epoch from public.hr_hunt_best_min()) * 1000)::bigint,
    'grounds', coalesce((select jsonb_object_agg(g.hunt_id, g.modes)
                           from (select b.hunt_id, jsonb_object_agg(b.mode, jsonb_build_object('xp_h', b.xp_h, 'balance_h', b.balance_h,
                                                                                                'supply_h', b.supply_h)) as modes
                                   from public.hunt_bests b
                                  where b.user_id = p_user and b.slot = p_slot
                                  group by b.hunt_id) g), '{}'::jsonb))
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_hunt_bests_view(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_hunt_bests_view(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_hunt_bests_view answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_hunt_density_view(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  -- DENSITY-HOME (2026-11-17-hunt-density-home.sql): one character's picks, { <hunt_id>: pick }.
  select coalesce((select jsonb_object_agg(d.hunt_id, d.density order by d.hunt_id)
                     from public.hunt_density d where d.user_id = p_user and d.slot = p_slot), '{}'::jsonb)
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_hunt_density_view(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_hunt_density_view(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_hunt_density_view answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_hunt_limit(p_key text)
 returns integer
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select value from public.hr_hunt_limits where key = p_key
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'))) as example
            from (select x from (select key from public.hr_hunt_limits union select key from public.hr_flags union select skill_id from public.hr_skills
           union select activity_id from (select activity_id from public.hr_activities where kind = 'combat' order by activity_id limit 60) a
           union select unnest(array[null, '', 'nope', 'melee', 'ranger', 'mage', 'healer', 'tank', 'accrue:probe'])) t(x)) p0(x)
           where public.hr_hunt_limit(p0.x)::text is distinct from pg_temp.hrpc_hr_hunt_limit(p0.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_hunt_limit answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_hunt_party_of(p_user uuid, p_slot integer)
 returns uuid
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select m.party_id from public.hunt_party_members m join public.hunt_parties p on p.id = m.party_id
   where m.user_id = p_user and m.slot = p_slot and p.closed_at is null
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_hunt_party_of(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_hunt_party_of(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_hunt_party_of answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_hunt_presets_view(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select coalesce((select jsonb_agg(jsonb_build_object('preset', p.preset, 'name', p.name, 'action_set', p.action_set,
                                                       'gear', p.gear, 'restock', p.restock) order by p.preset)
                     from public.player_hunt_presets p where p.user_id = p_user and p.slot = p_slot), '[]'::jsonb)
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_hunt_presets_view(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_hunt_presets_view(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_hunt_presets_view answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_hunt_role_default(p_role text, p_party text[])
 returns jsonb
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  -- TOWN-DEFAULTS (2027-01-25-town-defaults.sql): src/core/hunt/roles.js defaultSettings(role, party) as option keys,
  -- from its generated table: alone, with a Melee seat, or without one (the hero's own role always counted). The
  -- generator (tools/gen-catalogues.mjs) proves this rule against the engine for every party up to PARTY.maxSize + 1.
  with d as (select public.hr_hunt_role_defaults() as j),
       p as (select case when p_role = any (coalesce(p_party, '{}'::text[])) then array_remove(p_party, null)
                         else array_remove(coalesce(p_party, '{}'::text[]), null) || p_role end as roles)
  select d.j->p_role->(case when cardinality(p.roles) <= 1 then 'solo'
                            when exists (select 1 from unnest(p.roles) r where coalesce((d.j->r->>'melee')::boolean, false)) then 'party'
                            else 'party_nomelee' end)
    from d, p
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'), coalesce(p1.x::text, 'null'))) as example
            from (select x from (select key from public.hr_hunt_limits union select key from public.hr_flags union select skill_id from public.hr_skills
           union select activity_id from (select activity_id from public.hr_activities where kind = 'combat' order by activity_id limit 60) a
           union select unnest(array[null, '', 'nope', 'melee', 'ranger', 'mage', 'healer', 'tank', 'accrue:probe'])) t(x)) p0(x) cross join (select x::text[] from unnest(array[null, '{}', '{melee}', '{ranger}', '{mage,healer}', '{melee,ranger,mage,healer}', '{healer,healer}']) x) p1(x)
           where public.hr_hunt_role_default(p0.x, p1.x)::text is distinct from pg_temp.hrpc_hr_hunt_role_default(p0.x, p1.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_hunt_role_default answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_hunt_setup_view(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  -- SETUP-PER-GROUND (2026-12-05-hunt-setup-per-ground.sql): { <hunt_id>: the setup last entered on }, a set that
  -- still exists only (set 0 always does), so the picker never pre-picks a deleted setup.
  select coalesce((select jsonb_object_agg(d.hunt_id, d.preset order by d.hunt_id)
                     from public.hunt_density d
                    where d.user_id = p_user and d.slot = p_slot and d.preset is not null
                      and (d.preset = 0 or exists (select 1 from public.player_action_sets a
                                                    where a.user_id = d.user_id and a.slot = d.slot and a.preset = d.preset))),
                  '{}'::jsonb)
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_hunt_setup_view(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_hunt_setup_view(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_hunt_setup_view answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_hunt_supply_of(p_user uuid, p_slot integer, p_preset integer)
 returns jsonb
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select jsonb_build_object(
    'supply_source', coalesce(a.options->>'supply_source', 'mine'),
    'on_empty', coalesce(a.options->>'on_empty', 'switch'),
    'gold_floor', coalesce((a.options->>'gold_floor')::bigint, public.hr_hunt_limit('gold_floor_default')::bigint, 0))
    from (select 1) one
    left join public.player_action_sets a on a.user_id = p_user and a.slot = p_slot and a.preset = p_preset
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'), coalesce(p2.x::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2) cross join (select x from unnest(array[null, -1, 0, 1, 2, 3, 4, 5, 9, 10, 15, 20, 30, 45, 50, 60, 75, 99, 100, 120, 150, 1000]::int[]) x) p2(x)
           where public.hr_hunt_supply_of(w.a1, w.a2, p2.x)::text is distinct from pg_temp.hrpc_hr_hunt_supply_of(w.a1, w.a2, p2.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_hunt_supply_of answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_hunt_view(p_session uuid)
 returns jsonb
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  -- DENSITY-HOME (2026-11-17-hunt-density-home.sql): `forfeit`, the session ended by the refused-window rule.
  -- FORFEIT-DURABLE (2026-11-20-hunt-forfeit-durable.sql): read from the session row (hr_hunt_forfeit sets it;
  -- its CHECK keeps it to an ended `server`/`left` session), never from the pruned ledger.
  select jsonb_build_object(
    'id', s.id, 'hunt', s.hunt_id, 'prev', s.prev_session_id, 'preset', s.preset,
    'hours_limit', s.hours_limit,
    'entered_at', s.entered_at, 'hunt_from', s.hunt_from, 'settled_to', s.settled_to,
    'instance', s.instance_id, 'unit', s.unit_id, 'seat', s.seat,
    'leave_at', s.leave_at, 'change_at', s.change_at, 'change_to', s.change_to,
    'ended_at', s.ended_at, 'end_reason', s.end_reason,
    'forfeit', s.forfeit,
    -- LEAVE-TOGETHER (2026-12-18-party-leave-together.sql): a cascade end names the member whose own end at the same
    -- instant sent this hero home (its death for party_member_died), from the server's rows; else null.
    'end_by', case when s.end_reason in ('party_member_died', 'party_member_left') then (
      select public.hr_character_name(o.user_id, o.slot) from public.hunt_sessions o
       where o.instance_id = s.instance_id and o.id <> s.id and o.ended_at = s.ended_at
         and o.end_reason not in ('party_member_died', 'party_member_left')
       order by (o.end_reason = 'died') = (s.end_reason = 'party_member_died') desc, o.seat, o.id limit 1) end,
    'home_at',
    case when s.ended_at is not null then s.ended_at + make_interval(secs => coalesce(
      (select travel_s from public.hr_hunt_travel t where t.hunt_id = s.hunt_id), 0)) end,
    'seen_event_id', s.seen_event_id, 'version', s.version,
    'phase', case when s.ended_at is not null then 'ended'
                  when s.leave_at is not null or s.change_at is not null then 'leaving'
                  when now() < s.hunt_from then 'walking' else 'hunting' end,
    'bag', coalesce((select jsonb_agg(jsonb_build_object('item', b.item_id, 'loaded', b.qty_loaded,
                       'left', b.qty_left, 'essential', b.essential) order by b.item_id)
                     from public.hunt_bag b where b.session_id = s.id), '[]'::jsonb),
    'tally', (select jsonb_build_object('kills', t.kills, 'xp', t.xp, 'coins', t.coins, 'loot', t.loot,
                       'supplies', t.supplies, 'deaths', t.deaths, 'paid_ms', t.paid_ms,
                       'bought', t.bought, 'supply_gold', t.supply_gold)
              from public.hunt_session_tally t where t.session_id = s.id))
  from public.hunt_sessions s where s.id = p_session
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'))) as example
            from (select x from (select user_id from public.player_state union select id from (select id from public.hunt_sessions order by entered_at desc limit 200) s
           union select '00000000-0000-0000-0000-000000000000'::uuid) t(x)) p0(x)
           where public.hr_hunt_view(p0.x)::text is distinct from pg_temp.hrpc_hr_hunt_view(p0.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_hunt_view answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_hunt_weapon_of(p_user uuid, p_slot integer)
 returns text
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  -- SPELL-ROLES (2027-01-13-spell-roles.sql): the weapon's key (hr_hunt_weapons; unarmed = neutral), turned into its
  -- shield arm (hr_hunt_weapon_roles.with_shield) when the shield slot holds a shield (hr_hunt_shields).
  with k as (
    select coalesce((select w.weapon_type from public.player_equipment pe
                       join public.hr_hunt_weapons w on w.item_id = pe.item_id
                      where pe.user_id = p_user and pe.slot = p_slot and pe.equip_slot = 'weapon'), 'neutral') as t)
  select coalesce((select r.with_shield from k
                     join public.hr_hunt_weapon_roles r on r.weapon_type = k.t and r.with_shield is not null
                     join public.player_equipment pe on pe.user_id = p_user and pe.slot = p_slot and pe.equip_slot = 'shield'
                     join public.hr_hunt_shields s on s.item_id = pe.item_id), (select k.t from k))
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_hunt_weapon_of(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_hunt_weapon_of(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_hunt_weapon_of answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_level_block(p_xp bigint)
 returns jsonb
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select jsonb_build_object('xp', x, 'level', lv,
           'into', x - public.hr_char_xp_for_level(lv),
           'need', public.hr_char_xp_for_level(lv + 1) - public.hr_char_xp_for_level(lv))
    from (select greatest(0, coalesce(p_xp, 0)) as x, public.hr_char_level(p_xp) as lv) a
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'))) as example
            from (select x from (select unnest(array[null, -5, 0, 1, 50, 83, 100, 1000, 5000, 13363, 123456, 1210421, 13034431, 200000000]::bigint[])
           union select level_xp from public.player_state) t(x)) p0(x)
           where public.hr_level_block(p0.x)::text is distinct from pg_temp.hrpc_hr_level_block(p0.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_level_block answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_level_from_xp(p_xp bigint)
 returns integer
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public
as $sqlpre$
  select coalesce((select max(level) from public.hr_xp_table
                    where xp <= greatest(0, coalesce(p_xp, 0))), 1)
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'))) as example
            from (select x from (select unnest(array[null, -5, 0, 1, 50, 83, 100, 1000, 5000, 13363, 123456, 1210421, 13034431, 200000000]::bigint[])
           union select level_xp from public.player_state) t(x)) p0(x)
           where public.hr_level_from_xp(p0.x)::text is distinct from pg_temp.hrpc_hr_level_from_xp(p0.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_level_from_xp answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_level_of(p_user uuid, p_slot integer)
 returns integer
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select public.hr_char_level(coalesce((select ps.level_xp from public.player_state ps
                                         where ps.user_id = p_user and ps.slot = p_slot), 0))
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_level_of(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_level_of(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_level_of answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_login_view(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select jsonb_build_object(
    'premium', public.hr_premium_active(p_user, p_slot, now()),
    'days', ps.login_days,
    'claimed_today', exists (select 1 from public.player_progress pp where pp.user_id = p_user and pp.slot = p_slot
                              and pp.kind = 'daily' and pp.key = 'login'
                              and pp.period_key = public.hr_utc_day_key(now()) and pp.state = 'claimed'),
    'reward', (select jsonb_build_object('item', r.item_id, 'qty', r.qty) from public.hr_premium_login_reward r where r.id))
    from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_login_view(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_login_view(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_login_view answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_max_hp(p_level integer, p_heavy integer)
 returns integer
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select floor((public.hr_hunt_limit('hp_base')::bigint + public.hr_hunt_limit('hp_per_level')::bigint * (greatest(1, coalesce(p_level, 1)) - 1))
               * (1000 + floor(public.hr_hunt_limit('heavy_hp_permille')::bigint * greatest(0, coalesce(p_heavy, 0)) / public.hr_hunt_limit('armour_slots')))
               / 1000)::int
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'), coalesce(p1.x::text, 'null'))) as example
            from (select x from unnest(array[null, -1, 0, 1, 2, 3, 4, 5, 9, 10, 15, 20, 30, 45, 50, 60, 75, 99, 100, 120, 150, 1000]::int[]) x) p0(x) cross join (select x from unnest(array[null, -1, 0, 1, 2, 3, 4, 5, 9, 10, 15, 20, 30, 45, 50, 60, 75, 99, 100, 120, 150, 1000]::int[]) x) p1(x)
           where public.hr_max_hp(p0.x, p1.x)::text is distinct from pg_temp.hrpc_hr_max_hp(p0.x, p1.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_max_hp answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_max_mana(p_level integer, p_light integer)
 returns integer
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select floor((public.hr_hunt_limit('mana_base')::bigint + public.hr_hunt_limit('mana_per_level')::bigint * (greatest(1, coalesce(p_level, 1)) - 1))
               * (1000 + floor(public.hr_hunt_limit('light_mana_permille')::bigint * greatest(0, coalesce(p_light, 0)) / public.hr_hunt_limit('armour_slots')))
               / 1000)::int
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'), coalesce(p1.x::text, 'null'))) as example
            from (select x from unnest(array[null, -1, 0, 1, 2, 3, 4, 5, 9, 10, 15, 20, 30, 45, 50, 60, 75, 99, 100, 120, 150, 1000]::int[]) x) p0(x) cross join (select x from unnest(array[null, -1, 0, 1, 2, 3, 4, 5, 9, 10, 15, 20, 30, 45, 50, 60, 75, 99, 100, 120, 150, 1000]::int[]) x) p1(x)
           where public.hr_max_mana(p0.x, p1.x)::text is distinct from pg_temp.hrpc_hr_max_mana(p0.x, p1.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_max_mana answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_monster_level(p_monster text)
 returns integer
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select coalesce((select a.level from public.hr_activities a where a.kind = 'combat' and a.activity_id = p_monster), 0)
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'))) as example
            from (select x from (select key from public.hr_hunt_limits union select key from public.hr_flags union select skill_id from public.hr_skills
           union select activity_id from (select activity_id from public.hr_activities where kind = 'combat' order by activity_id limit 60) a
           union select unnest(array[null, '', 'nope', 'melee', 'ranger', 'mage', 'healer', 'tank', 'accrue:probe'])) t(x)) p0(x)
           where public.hr_monster_level(p0.x)::text is distinct from pg_temp.hrpc_hr_monster_level(p0.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_monster_level answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_outfit_owned(p_user uuid, p_slot integer)
 returns text[]
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select coalesce(array_agg(o.outfit_id order by o.sort), '{}')
    from public.hr_outfits o
   where not o.premium or public.hr_premium_active(p_user, p_slot, now())
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_outfit_owned(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_outfit_owned(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_outfit_owned answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_party_away(p_user uuid, p_slot integer, p_joined timestamp with time zone)
 returns boolean
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select not exists (select 1 from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null)
     and public.hr_party_last_seen(p_user, p_joined) <= now() - public.hr_party_away_after()
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'), coalesce(p2.x::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2) cross join (select x from unnest(array[now(), now() - interval '1 day', now() + interval '1 day', null]::timestamptz[]) x) p2(x)
           where public.hr_party_away(w.a1, w.a2, p2.x)::text is distinct from pg_temp.hrpc_hr_party_away(w.a1, w.a2, p2.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_party_away answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_party_invites_view(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select coalesce((select jsonb_agg(x.j order by x.created_at desc, x.id) from (
    select i.id, i.created_at, jsonb_build_object('id', i.id, 'party', i.party_id, 'hunt', p.hunt_id,
                                                  'from', public.hr_character_name(i.from_user, i.from_slot)) as j
      from public.hunt_party_invites i join public.hunt_parties p on p.id = i.party_id and p.closed_at is null
     where i.to_user = p_user and i.to_slot = p_slot and i.created_at > now() - public.hr_party_invite_ttl()
     order by i.created_at desc, i.id limit 16) x), '[]'::jsonb)
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_party_invites_view(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_party_invites_view(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_party_invites_view answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_party_seek_view(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  -- PARTY-FINDER (2026-12-07-party-finder.sql): this hero's own seek, { hunt, left_ms }, or null.
  select (select jsonb_build_object('hunt', s.hunt_id,
                                    'left_ms', greatest(0, floor(extract(epoch from (s.expires_at - now())) * 1000))::bigint)
            from public.party_seekers s
           where s.user_id = p_user and s.slot = p_slot and s.expires_at > now())
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_party_seek_view(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_party_seek_view(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_party_seek_view answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_premium_active(p_user uuid, p_slot integer, p_at timestamp with time zone)
 returns boolean
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  -- BETA-PREMIUM (2026-12-17-beta-premium.sql): every premium decision goes through here or
  -- hr_premium_until; nothing else reads the column or the switch.
  select coalesce(public.hr_premium_until(p_user, p_slot) > coalesce(p_at, now()), false)
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'), coalesce(p2.x::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2) cross join (select x from unnest(array[now(), now() - interval '1 day', now() + interval '1 day', null]::timestamptz[]) x) p2(x)
           where public.hr_premium_active(w.a1, w.a2, p2.x)::text is distinct from pg_temp.hrpc_hr_premium_active(w.a1, w.a2, p2.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_premium_active answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_premium_until(p_user uuid, p_slot integer)
 returns timestamp with time zone
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  -- BETA-PREMIUM (2026-12-17-beta-premium.sql): THE ONLY READER of the beta switch and of
  -- player_state.premium_until. While hr_flags `beta_premium` is on, every character is premium
  -- with no end (+infinity); otherwise its own premium_until (null = free). No row = no character = null.
  select case when public.hr_flag_on('beta_premium') then 'infinity'::timestamptz else ps.premium_until end
    from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_premium_until(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_premium_until(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_premium_until answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_premium_view(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  -- BETA-PREMIUM (2026-12-17-beta-premium.sql): active and perks through hr_premium_active.
  select jsonb_build_object(
    'until', ps.premium_until,
    'active', a.prem,
    'stamina_max_ms', public.hr_stamina_cap(p_user, p_slot, now()),
    'perks', jsonb_build_object('analyzer', a.prem, 'outfits', a.prem, 'login', a.prem))
    from public.player_state ps
    cross join lateral (select public.hr_premium_active(p_user, p_slot, now()) as prem) a
   where ps.user_id = p_user and ps.slot = p_slot
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_premium_view(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_premium_view(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_premium_view answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_recipes_of(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public
as $sqlpre$
  select coalesce(jsonb_object_agg(substring(pp.key from 8), true), '{}'::jsonb)
    from public.player_progress pp
    join public.hr_unlocks u
      on  u.unlock_id = pp.key
      and u.namespace = 'recipe'
      and u.progress_kind = pp.kind
   where pp.user_id = p_user
     and pp.slot    = coalesce(p_slot, 0)
     and pp.period_key = ''
     and pp.value  > 0
     and p_user is not null;
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_recipes_of(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_recipes_of(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_recipes_of answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_regen_permille(p_flame integer)
 returns integer
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select 1000 + floor(public.hr_hunt_limit('flame_regen_max_permille')::bigint * p
                      / (p + public.hr_hunt_limit('flame_regen_k')))::int
    from (select greatest(1, coalesce(p_flame, 1))::bigint as p) x
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'))) as example
            from (select x from unnest(array[null, -1, 0, 1, 2, 3, 4, 5, 9, 10, 15, 20, 30, 45, 50, 60, 75, 99, 100, 120, 150, 1000]::int[]) x) p0(x)
           where public.hr_regen_permille(p0.x)::text is distinct from pg_temp.hrpc_hr_regen_permille(p0.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_regen_permille answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_renown_of(p_user uuid, p_slot integer)
 returns bigint
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_temp
as $sqlpre$
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
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_renown_of(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_renown_of(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_renown_of answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_seed(p_user uuid, p_slot integer, p_label text)
 returns bigint
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public
as $sqlpre$
  select (('x' || encode(substring(
            sha256((select secret from public.hr_server_secrets where name = 'prng')
                   || convert_to(coalesce(p_user::text,'') || ':' || coalesce(p_slot,0)::text
                                 || ':' || coalesce(p_label,''), 'utf8'))
            from 1 for 8), 'hex'))::bit(64))::bigint
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'), coalesce(p2.x::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2) cross join (select x from (select key from public.hr_hunt_limits union select key from public.hr_flags union select skill_id from public.hr_skills
           union select activity_id from (select activity_id from public.hr_activities where kind = 'combat' order by activity_id limit 60) a
           union select unnest(array[null, '', 'nope', 'melee', 'ranger', 'mage', 'healer', 'tank', 'accrue:probe'])) t(x)) p2(x)
           where public.hr_seed(w.a1, w.a2, p2.x)::text is distinct from pg_temp.hrpc_hr_seed(w.a1, w.a2, p2.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_seed answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_skill_level(p_skill text, p_xp bigint)
 returns integer
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select case when exists (select 1 from public.hr_skills k where k.skill_id = p_skill and k.cat = 'combat')
              then coalesce((select max(c.level) from public.hr_skill_curve c where c.xp <= greatest(0, coalesce(p_xp, 0))), 1)
              else public.hr_level_from_xp(p_xp) end
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'), coalesce(p1.x::text, 'null'))) as example
            from (select x from (select key from public.hr_hunt_limits union select key from public.hr_flags union select skill_id from public.hr_skills
           union select activity_id from (select activity_id from public.hr_activities where kind = 'combat' order by activity_id limit 60) a
           union select unnest(array[null, '', 'nope', 'melee', 'ranger', 'mage', 'healer', 'tank', 'accrue:probe'])) t(x)) p0(x) cross join (select x from (select unnest(array[null, -5, 0, 1, 50, 83, 100, 1000, 5000, 13363, 123456, 1210421, 13034431, 200000000]::bigint[])
           union select level_xp from public.player_state) t(x)) p1(x)
           where public.hr_skill_level(p0.x, p1.x)::text is distinct from pg_temp.hrpc_hr_skill_level(p0.x, p1.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_skill_level answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_social_party_view(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  -- SOCIAL-PASS: each seat by its own hero's name.
  select coalesce((select jsonb_agg(jsonb_build_object('seat', m.seat, 'user', m.user_id, 'slot', m.slot,
                                                       'name', left(public.hr_character_name(m.user_id, m.slot), 24)) order by m.seat)
                     from public.hunt_party_members m
                    where m.party_id = public.hr_hunt_party_of(p_user, p_slot)), '[]'::jsonb)
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_social_party_view(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_social_party_view(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_social_party_view answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_stamina_cap(p_user uuid, p_slot integer, p_at timestamp with time zone)
 returns bigint
 language sql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select (case when public.hr_premium_active(p_user, p_slot, p_at)
               then public.hr_hunt_limit('stamina_premium_min') else public.hr_hunt_limit('stamina_free_min') end)::bigint * 60000
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'), coalesce(p2.x::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2) cross join (select x from unnest(array[now(), now() - interval '1 day', now() + interval '1 day', null]::timestamptz[]) x) p2(x)
           where public.hr_stamina_cap(w.a1, w.a2, p2.x)::text is distinct from pg_temp.hrpc_hr_stamina_cap(w.a1, w.a2, p2.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_stamina_cap answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_storage_room_used(p_user uuid)
 returns integer
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  select count(*)::int from (
    select b.item_id from public.account_bank b where b.user_id = p_user
    union
    select l.item_id from public.market_listings l where l.user_id = p_user) k
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(p0.x::text, 'null'))) as example
            from (select x from (select user_id from public.player_state union select id from (select id from public.hunt_sessions order by entered_at desc limit 200) s
           union select '00000000-0000-0000-0000-000000000000'::uuid) t(x)) p0(x)
           where public.hr_storage_room_used(p0.x)::text is distinct from pg_temp.hrpc_hr_storage_room_used(p0.x)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_storage_room_used answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_tally_section(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
  -- TALLY (2026-12-23-tally-tasks.sql)
  select jsonb_build_object(
    'held', coalesce((select jsonb_agg(jsonb_build_object('place', t.place, 'task', t.task_id, 'hunt', c.hunt_id,
                        'monster', c.monster_id, 'kills', t.kills, 'target', t.target, 'keep', t.keep,
                        'done', t.done_at is not null, 'done_at', t.done_at, 'wait', t.wait) order by t.place)
                        from public.hero_tally_tasks t join public.hr_tally_tasks c on c.task_id = t.task_id
                       where t.user_id = p_user and t.slot = p_slot), '[]'::jsonb),
    'paid_today', (select count(*) from public.hero_tally_claims k
                    where k.user_id = p_user and k.slot = p_slot and k.day = (now() at time zone 'UTC')::date),
    'per_day', cfg.paid_per_day,
    'held_max', cfg.held_max,
    'weight', (select h.weight from public.hero_tally h where h.user_id = p_user and h.slot = p_slot),
    'order', to_jsonb(coalesce((select nullif(h.slot_order, '{}'::text[]) from public.hero_tally h
                                 where h.user_id = p_user and h.slot = p_slot), cfg.slot_order)),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('claim', k.id, 'at', k.at, 'task', k.task_id, 'gold', k.gold,
                          'item', k.item_id, 'qty', k.qty, 'pick', k.pick) order by k.at desc)
                          from (select * from public.hero_tally_claims k
                                 where k.user_id = p_user and k.slot = p_slot and k.at > now() - interval '24 hours'
                                 order by k.at desc limit 3) k), '[]'::jsonb),
    'day_ends_at', date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' + interval '1 day')
    from public.hr_tally_config cfg where cfg.only_row
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_tally_section(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_tally_section(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_tally_section answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_total_level(p_user uuid, p_slot integer)
 returns integer
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public
as $sqlpre$
  select coalesce(sum(public.hr_skill_level(skill_id, xp)), 0)::int
    from public.player_skills where user_id = p_user and slot = p_slot
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_total_level(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_total_level(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_total_level answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    execute $pre$create or replace function pg_temp.hrpc_hr_vitals_of(p_user uuid, p_slot integer)
 returns jsonb
 language sql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $sqlpre$
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
$sqlpre$$pre$;
    execute $probe$select count(*)::int as n, min(concat_ws(' / ', coalesce(w.a1::text, 'null'), coalesce(w.a2::text, 'null'))) as example
            from (select user_id, slot from public.player_state union all select '00000000-0000-0000-0000-000000000000'::uuid, 0) w(a1, a2)
           where public.hr_vitals_of(w.a1, w.a2)::text is distinct from pg_temp.hrpc_hr_vitals_of(w.a1, w.a2)::text$probe$ into v_n, v_ex;
    if v_n <> 0 then raise exception 'plan-cache §2(b): hr_vitals_of answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;

    if v_total <> 53 then raise exception 'plan-cache §2(b)-harness: % of 53 functions probed', v_total; end if;
    raise exception 'plan-cache §2: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'plan-cache §2: ok' then raise; end if;
  end;
end $check$;
