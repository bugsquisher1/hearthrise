-- tests/fixtures/inner-flame-slice-shim.sql — NOT A MIGRATION.
--
-- A chain CUT BEFORE 2027-01-31 (the 2026-08 slice of tests/activity-intent.mjs,
-- the replay up to its own file in tests/skills-from-storage.mjs) runs TODAY's
-- hr-accrue modules and client against an older catalogue. Since Inner Flame
-- replaced Prayer (2027-01-31-inner-flame.sql §1) the engine credits 'inner_flame',
-- the client reads that key from the envelope, and the Great Hearth's bench rows are
-- fuel_<item>; the older catalogue still says 'prayer' and bury_*, so hr_apply would
-- refuse the skill and the switch the activity. This states §1's rename for hr_skills,
-- player_skills and hr_activities (the same old -> new ids as §1), and nothing more.
-- The real rename, its self-check and every restated body run on the full chain
-- (tests/inner-flame.mjs, tests/hunt-sessions-settle.mjs, tests/schema-drift.mjs).
insert into public.hr_skills (skill_id, name, cat) values ('inner_flame', 'Inner Flame', 'combat')
  on conflict (skill_id) do update set name = excluded.name, cat = excluded.cat;
update public.player_skills set skill_id = 'inner_flame' where skill_id = 'prayer';
delete from public.hr_skills where skill_id = 'prayer';
update public.hr_activities a set activity_id = m.new_id, req_skill = 'inner_flame'
  from (values ('bury_bones', 'fuel_bones'), ('bury_big', 'fuel_big_bones'), ('bury_dragon', 'fuel_dragon_bones'),
               ('bury_bone_chips', 'fuel_bone_chips'), ('consecrate_grave_dust', 'fuel_grave_dust'),
               ('offer_razor_claw', 'fuel_razor_claw'), ('scatter_vamp_dust', 'fuel_vamp_dust'),
               ('banish_demon_shard', 'fuel_demon_shard'), ('unbind_wraith_veil', 'fuel_wraith_veil'),
               ('consecrate_dragon_scale', 'fuel_dragon_scale'), ('release_lich_soul', 'fuel_lich_soul'),
               ('offer_ancient_claw', 'fuel_ancient_claw'), ('purge_void_chitin', 'fuel_void_chitin')) as m(old_id, new_id)
 where a.kind = 'artisan' and a.activity_id = m.old_id;
update public.hr_activities set req_skill = 'inner_flame' where req_skill = 'prayer';
