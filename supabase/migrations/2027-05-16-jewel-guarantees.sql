-- ════════════════════════════════════════════════════════════════════════
-- 2027-05-16-jewel-guarantees.sql — CRAFTED JEWELRY'S GUARANTEE LAYER, DARK: THE SWITCH ITS JOBS SIT BEHIND (lane/d-jewelry-2b,
--   systems-engineer, 2026-11-18; rescued from lane/c-crafted-jewelry fa3b3b93b. Tyler 2026-11-14: high-end jewelry comes from crafting,
--   "and i really want that to be RNG", "with some items that can guarantee some things"; the designer's board section 2026-11-15 (d)).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies
-- on its passing §4. ON THE EA SECURITY LIST with the rolls (a paid-for-nothing chance on a tradeable item: the Steam/legal review).
-- REPLACES lane/c-crafted-jewelry's three 2027-04-24 files (jewel-guarantees.sql, jewel-jobs-catalogue, jewel-guarantees-bench-inputs),
--   never merged and never applied: they built on one Crafting jewelry bench, which the jewelry sample removed (all jewelry is Smithing,
--   Tyler 2026-11-18). Their `jewel_jobs` section and its two tables (hr_jewel_jobs, hr_jewel_odds) are NOT rebuilt: the bench's odds are
--   the catalogue's table at the hero's SERVER level (src/session/jewelry-sections.js rollOddsOf, as every rolled job reads them since
--   v0.2.140), and the one thing the client needs from the server here, whether the switch is on, is the `features` section's.
-- EDGE: the guarantee jobs and their roll ship in the hr-accrue bundle (src/data/jewelry.js, src/core/artisan.js), and its set_activity
--   refuses a switched job for an account the switch is off for (supabase/functions/hr-accrue/set-activity.js switchedOn). Deploy with it.
-- CLIENT: the bench offers a guarantee job only where `features` lists jewel_guarantees (jewelry-sections.js jobShown).
-- APPLY ORDER: after 2027-05-16-jewel-guarantees-items-catalogue.generated.sql (the three jobs in hr_activities) and its bench-inputs file.
--
-- ── THE SWITCH ───────────────────────────────────────────────────────────────
-- hr_feature_switches 'jewel_guarantees', scope OFF on first apply (a re-apply never moves a scope the Coordinator set since). The three
--   guarantee jobs (a Crown Shard, the Rat King's Crown, both, set in a Banded Signet on the Smithing bench) are real for an account it is
--   on for and for nobody else: `features` leaves it out, the bench hides them, and hr-accrue's set_activity answers activity_unsupported
--   {switch}. Moving it is the Coordinator's tiny dated migration (2027-03-21-feature-switches.sql "HOW A SWITCH MOVES"): 'accounts' with
--   the QA and GM accounts to play it, then 'testers', then 'everyone'. The itemization plan's phase 2 does not arm it.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- None new from a client: no verb, no grant, no section. The switch gates a door, never a number. A guarantee job moves no gold (a rolled
--   job pays no bench tax: src/data/bench-tax.js benchTaxed), spends a plain piece and its boss drops whole, and makes only catalogue rows.
--
-- COST: one row in a table of a handful; `features` already reads every switch row each envelope.
-- REVERSIBILITY: delete the switch row (a missing row is off). Items made stay made (the wipe takes them).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_feature_switches') is null or to_regprocedure('public.hr_feature_on(text,uuid)') is null
     or to_regprocedure('public.hr_features_view(uuid,integer)') is null then
    raise exception 'PRECONDITION: apply 2027-03-21-feature-switches.sql first'; end if;
  if not exists (select 1 from public.hr_activities a where a.kind = 'artisan' and a.activity_id = 'set_crown_shard_banded_signet' and a.req_skill = 'smithing')
     or not (public.hr_bench_inputs() ? 'set_crown_shard_banded_signet') then
    raise exception 'PRECONDITION: apply 2027-05-16-jewel-guarantees-items-catalogue.generated.sql and its bench-inputs file first'; end if;
end $mig$;

-- ── §1 THE SWITCH, OFF ───────────────────────────────────────────────────────
insert into public.hr_feature_switches (switch_id, scope, note) values
  ('jewel_guarantees', 'off', '2027-05-16-jewel-guarantees.sql: crafted jewelry''s guarantee jobs on each piece''s bench (a boss gem fixes a perk, a boss Trophy fixes Hallmarked: src/data/jewelry.js JEWEL_GUARANTEES). Off: unlisted in features, hidden at the bench, refused by set_activity. Dark until played.')
  on conflict (switch_id) do nothing;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED on probe accounts, every probe rolled back ─────────────────────
do $chk$
declare
  c_in  constant uuid := '00000000-0000-4000-c000-1e3e1a000011';
  c_out constant uuid := '00000000-0000-4000-c000-1e3e1a000012';
  v_scope text; v_accounts uuid[]; v_role text;
begin
  -- (a) THE SWITCH ROW IS THERE (off on a first apply; a re-apply keeps whatever scope the Coordinator set since).
  select f.scope, f.accounts into v_scope, v_accounts from public.hr_feature_switches f where f.switch_id = 'jewel_guarantees';
  if v_scope is null then raise exception 'jewel-guarantees §4(a): the switch row is missing'; end if;
  -- (b) THE JOBS ARE REAL ACTIVITIES on the Banded Signet's bench, Smithing from 15, each with its inputs for a resume.
  if (select count(*) from public.hr_activities a where a.kind = 'artisan' and a.req_skill = 'smithing' and a.req_lv = 15
       and a.activity_id in ('set_crown_shard_banded_signet', 'set_rat_kings_crown_banded_signet', 'set_crown_shard_rat_kings_crown_banded_signet')) <> 3
     or (public.hr_bench_inputs()->'set_crown_shard_rat_kings_crown_banded_signet')
        is distinct from '{"banded_signet": 1, "crown_shard": 1, "rat_kings_crown": 1}'::jsonb then
    raise exception 'jewel-guarantees §4(b): the three guarantee jobs are not Smithing 15 activities with their inputs'; end if;
  begin
    -- (c) OFF: no account reads it on, and `features` lists it for nobody.
    update public.hr_feature_switches set scope = 'off', accounts = '{}' where switch_id = 'jewel_guarantees';
    if public.hr_feature_on('jewel_guarantees', c_in) or public.hr_features_view(c_in, 0) ? 'jewel_guarantees' then
      raise exception 'jewel-guarantees §4(c): the switch reads on while off'; end if;
    -- (d) ON FOR ONE ACCOUNT: that account reads it on and `features` lists it; another account stays dark.
    update public.hr_feature_switches set scope = 'accounts', accounts = array[c_in] where switch_id = 'jewel_guarantees';
    if not public.hr_feature_on('jewel_guarantees', c_in) or not (public.hr_features_view(c_in, 0) ? 'jewel_guarantees')
       or public.hr_feature_on('jewel_guarantees', c_out) or public.hr_features_view(c_out, 0) ? 'jewel_guarantees' then
      raise exception 'jewel-guarantees §4(d): on for one account reads % / % and % / %', public.hr_feature_on('jewel_guarantees', c_in),
        public.hr_features_view(c_in, 0), public.hr_feature_on('jewel_guarantees', c_out), public.hr_features_view(c_out, 0); end if;
    raise exception using errcode = 'HRJ99', message = 'jewel-guarantees §4 complete - rolling back';
  exception when sqlstate 'HRJ99' then
    null;
  end;
  if not exists (select 1 from public.hr_feature_switches f where f.switch_id = 'jewel_guarantees' and f.scope = v_scope and f.accounts = v_accounts) then
    raise exception 'jewel-guarantees §4: the probe moved the switch'; end if;
  -- (e) THE GRANTS: the switch table stays the owner's alone.
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.hr_feature_switches', 'insert,update,delete') then
      raise exception 'jewel-guarantees §4(e): % can write the switches', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'jewel-guarantees §4 OK: the switch % on apply, the three jobs Smithing 15 with their inputs, dark then lit for one account only, the grants', v_scope;
end $chk$;
