-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-26-timberline.sql
--
-- ONE DATA CLOSURE, NO FUNCTION BODY, NO GRANT, NO NEW OBJECT, NO VALUE MOVED:
--
--   §1 FIVE new `hr_activities` rows — `gather`/woodcutting stands at req
--      22/38/52/68/82 (hollow_oak_tree, weeping_willow_tree, maple_grove,
--      elder_yew_tree, ancient_runewood_tree). Each yields an EXISTING log
--      (oak/willow/maple/yew/runewood), so no hr_items row, no slot pair and
--      no recipe moves.
--
-- "Timberline" — game-designer ruling, content pack 2.
--
-- ── THE HOLE THIS CLOSES ───────────────────────────────────────────────────
--   Woodcutting was the one gathering skill with a new tree only every 15
--   levels (1/15/30/45/60/75/90). With the stands every req gap is 7 or 8. The
--   longest stretch with no new stand goes from 104 h to 61 h in 60-75 (68->75)
--   and from 377 h to 244 h in 75-90 (82->90). Time to 99: 1,098 h -> 1,066 h.
--
-- ── WHAT THE SERVER NEEDS, AND WHAT IT DOES NOT ────────────────────────────
--   hr_activities   hr_apply's activity arm refuses an id with no row
--                   (`unknown_activity`) and re-checks req_skill/req_lv against
--                   SERVER xp (`activity_locked`); hr_worker_assign gates crews
--                   on the same req_lv (`level_too_low`). These five rows are
--                   the ONLY server-side level gate for the stands.
--
-- ⚠ `xp`, `ms` AND YIELD ARE NOT IN THIS DATABASE, AND ARE NOT ASSERTED HERE.
--   They reach the server through the EDGE PAYLOAD, which imports
--   src/data/gathering.js (supabase/functions/hr-accrue/catalogue.js ->
--   GATHER_NODES). Do NOT hand-copy them into SQL: an XP copy here is a FAUCET.
--   The xp/ms half is pinned by the in-page ladder guards (strictly-faster paced
--   xp/s, full-tier +6%, first three rungs [1,1], T1:T7 < 5:1) and TIMBERLINE-1..4.
--   PACED guard series, floor(xp x 0.39) / pacedActionMs(ms):
--     oak 1.2500 -> hollow 1.4881 -> willow 1.7045 -> weeping 1.8382
--     -> maple 2.0536 -> grove 2.2866 -> yew 2.5000 -> elder 2.7778
--     -> runewood 3.0435 -> ancient 3.3299 -> duskwood 3.7019
--   Every step clears +7.8%; every req gap is 7 or 8.
--
-- ── THE ECONOMY HALF, MEASURED (paced ms, 20% raw vendor bid) ──────────────
--   g/h:  oak 2,250 -> HOLLOW 2,143; willow 3,273 -> WEEPING 3,971 -> maple
--         7,714 -> GROVE 8,780 < yew 9,000 -> ELDER 12,500 < runewood 18,783
--         -> ANCIENT 26,557 < duskwood 39,808.
--   logs/h: hollow 536, weeping 496, grove 549, elder 312.5, ancient 276.6.
--   Every new node's items/h, xp/h and g/h is BELOW the current table maximum
--   (normal_tree 750 items/h; duskwood 13,327 xp/h and 39,808 g/h), so the
--   hr_apply per-call clamps and hr_day_budget headroom are unchanged.
--   All five logs are tradeable: each row is a new XP source and a new source
--   of an existing tradeable log, bounded by those clamps and journalled.
--   WORKERS: hr_worker_assign reads the same req_lv, so crews may be put on the
--   stands. Crew yield rises in the same proportion as a player's (+39% yew,
--   +41% runewood logs/h at those levels), still bounded by crew caps and
--   hr_day_budget. The largest paced ms is 19,520, so WORKER_MAX_ACC_MS
--   (900,000) is untouched.
--   HEARTHFIND is untouched (normal_tree, yew_tree, duskwood_tree keep their
--   rows; a node without a hearthfind row draws no RNG, so seeded replays stay
--   byte-identical). Filed for the game designer: yew_tree (worldroot_seed) is
--   now outpaced on XP and logs from WC 68 instead of 75.
--
-- ── WHY A PATCH FILE AND NOT JUST THE REGENERATED CATALOGUE ────────────────
-- 2026-08-11-catalogue.generated.sql (same branch, regenerated: 508 activities
-- was 503, 538 items unchanged) carries these rows durably but DELETEs and
-- re-INSERTs whole tables. This file moves exactly 5 rows, is idempotent, and
-- is the ONE file to apply; the regenerated catalogue is a chain record, not
-- re-applied. §2 asserts the ruled values from RESTATED literals, so the two
-- records cannot drift apart in silence.
--
-- ⚠ ORDER: apply -> hr-accrue redeploy -> client push. Every mis-order fails
--   CLOSED: client first = the realm answers `unknown_activity` (a dead tile);
--   edge behind the rows = an away window on a new stand is refused
--   `unknown_node`. No corruption, no value moved, in any order.
--
-- REVERSIBILITY (net-zero, no value to claw back — every log a player cut is a
-- log that already existed in the economy):
--   delete from public.hr_activities where kind = 'gather' and activity_id in
--     ('hollow_oak_tree','weeping_willow_tree','maple_grove','elder_yew_tree',
--      'ancient_runewood_tree');
-- A character left pointing at a deleted stand is not stranded: hr_apply
-- refuses the next declaration and accrual refuses to pay rather than throwing.
-- ════════════════════════════════════════════════════════════════════════

-- ONE block, no begin/commit (CLAUDE.md §2 — tools/apply-migration.mjs sends
-- the file as one batch). One block so the hr_items count captured in §0 is the
-- same variable §2 compares at the end; a raise anywhere reverts §1.
do $$
declare
  v_missing text;
  v_rows    int;
  v_items0  bigint;
  v_items1  bigint;
  v_bad     text;
  v_r       jsonb;
  v_ver     bigint;
  v_n       int;
  v_xp51    bigint;
  v_xp52    bigint;
  v_uid     constant uuid := '00000000-0000-4000-8000-0000b5550002';
  c_j       constant jsonb := '{"kind":"admin","intent":"timberline-probe"}'::jsonb;
  -- kind · activity_id · req_skill · req_lv. NO xp/ms/qty (see header).
  v_acts constant jsonb := '[
    ["gather", "hollow_oak_tree",       "woodcutting", 22],
    ["gather", "weeping_willow_tree",   "woodcutting", 38],
    ["gather", "maple_grove",           "woodcutting", 52],
    ["gather", "elder_yew_tree",        "woodcutting", 68],
    ["gather", "ancient_runewood_tree", "woodcutting", 82]
  ]'::jsonb;
begin
  -- ── 0. PRECONDITIONS (fail closed) ───────────────────────────────────────
  if to_regclass('public.hr_activities') is null then
    raise exception '§0: public.hr_activities is missing — apply '
                    '2026-08-11-catalogue.generated.sql first';
  end if;
  if not exists (select 1 from public.hr_skills where skill_id = 'woodcutting') then
    raise exception '§0: hr_skills has no `woodcutting` row — apply '
                    '2026-08-11-catalogue.generated.sql first';
  end if;
  select string_agg(x, ', ' order by x) into v_missing
    from unnest(array['oak_log','willow_log','maple_log','yew_log','runewood_log']) x
   where not exists (select 1 from public.hr_items where item_id = x);
  if v_missing is not null then
    raise exception '§0: a stand yields %, which is not a catalogue item — the log '
                    'it pays would name nothing', v_missing;
  end if;
  select count(*) into v_items0 from public.hr_items;

  -- ── 1. FIVE ACTIVITY ROWS ────────────────────────────────────────────────
  -- max_hp/is_boss are RESTATED (not defaulted) because the catalogue's own
  -- self-check asserts a non-combat row carries neither.
  insert into public.hr_activities (kind, activity_id, req_skill, req_lv, max_hp, is_boss)
  select r.kind, r.activity_id, r.req_skill, r.req_lv, null, false
    from jsonb_array_elements(v_acts) e
    cross join lateral (select e->>0 as kind, e->>1 as activity_id,
                               e->>2 as req_skill, (e->>3)::int as req_lv) r
      on conflict (kind, activity_id) do update
         set req_skill = excluded.req_skill, req_lv = excluded.req_lv,
             max_hp = excluded.max_hp, is_boss = excluded.is_boss
       where public.hr_activities.req_skill is distinct from excluded.req_skill
          or public.hr_activities.req_lv    is distinct from excluded.req_lv
          or public.hr_activities.max_hp    is distinct from excluded.max_hp
          or public.hr_activities.is_boss   is distinct from excluded.is_boss;
  get diagnostics v_rows = row_count;
  raise notice 'timberline §1: % of 5 activity rows moved (0 on a re-apply)', v_rows;

  -- ── 2. SELF-VERIFYING COMMIT GATE (§4) ───────────────────────────────────
  -- Every claim is proved by EXECUTING it. The row-writing probes run in a
  -- subtransaction discarded by the HR812 sentinel, so this is net-zero on
  -- production ("player state is never fabricated"): no probe row survives.

  -- (a) THE FIVE ROWS, restated literally (not read from v_acts) so a
  --     hand-edit that dropped a row from §1 cannot also silence its check.
  select count(*),
         string_agg(a.activity_id || '=' || coalesce(a.req_skill,'NULL') || '/'
                      || coalesce(a.req_lv::text,'NULL')
                      || ' (want ' || x.req_skill || '/' || x.req_lv || ')', ', '
                    order by a.activity_id)
           filter (where a.req_skill is distinct from x.req_skill
                      or a.req_lv is distinct from x.req_lv
                      or a.max_hp is not null or a.is_boss)
    into v_n, v_bad
    from (values
      ('gather','hollow_oak_tree','woodcutting',22),
      ('gather','weeping_willow_tree','woodcutting',38),
      ('gather','maple_grove','woodcutting',52),
      ('gather','elder_yew_tree','woodcutting',68),
      ('gather','ancient_runewood_tree','woodcutting',82)
    ) as x(kind, activity_id, req_skill, req_lv)
    join public.hr_activities a on a.kind = x.kind and a.activity_id = x.activity_id;
  if v_n <> 5 then
    raise exception 'GATE(a) CONTROL: hr_activities holds % of the 5 new stands — every missing '
                    'one is a tile the client offers and the realm answers unknown_activity for',
                    v_n;
  end if;
  if v_bad is not null then
    raise exception 'GATE(a): a Timberline stand did not land as ruled: %', v_bad;
  end if;

  -- (b) THE WOODCUTTING BENCH: 12 stands, none ungated, one per level.
  --     Asserted over the WHOLE bench because this file inserts into the middle.
  select string_agg(activity_id, ', ' order by activity_id) into v_bad
    from public.hr_activities
   where kind = 'gather' and req_skill = 'woodcutting' and req_lv is null;
  if v_bad is not null then
    raise exception 'GATE(b): a woodcutting node has a NULL req_lv (%) — hr_apply short-circuits '
                    'its gate on NULL, so that node is ungated', v_bad;
  end if;
  select count(*) into v_n from (
    select req_lv from public.hr_activities
     where kind = 'gather' and req_skill = 'woodcutting'
     group by req_lv having count(*) > 1) d;
  if v_n > 0 then
    raise exception 'GATE(b): % woodcutting level(s) carry more than one node — the ladder is '
                    'no longer one rung per level', v_n;
  end if;
  select count(*) into v_n from public.hr_activities
   where kind = 'gather' and req_skill = 'woodcutting';
  if v_n <> 12 then
    raise exception 'GATE(b): the woodcutting bench holds % nodes, the ruling leaves 12 (7 shipped '
                    '+ 5 new). Another count means a stand moved without the ladder being re-read',
                    v_n;
  end if;

  -- (c) NO ITEM MOVED. Compared against the count captured in §0, not a
  --     literal, so a pack that lands items first does not make this raise.
  select count(*) into v_items1 from public.hr_items;
  if v_items1 <> v_items0 then
    raise exception 'GATE(c): hr_items went from % to % rows — this file must add no item',
      v_items0, v_items1;
  end if;

  -- (d) EXECUTED: hr_apply REFUSES A WOODCUTTING-51 CHARACTER `maple_grove`
  --     (req 52) AND ACCEPTS IT AT 52. Before §1 the same call answers
  --     `unknown_activity` (refused for the WRONG reason); after a mis-typed
  --     req_lv it would answer `ok` at 51.
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'GATE(d) CANNOT RUN: hr_create_character missing — apply '
                    '2026-08-14-character-bootstrap.sql first';
  end if;
  select xp into v_xp51 from public.hr_xp_table where level = 51;
  select xp into v_xp52 from public.hr_xp_table where level = 52;
  if v_xp51 is null or v_xp52 is null or v_xp52 <= v_xp51 then
    raise exception 'GATE(d) CANNOT RUN: hr_xp_table has no usable 51/52 rungs (%/%)',
      v_xp51, v_xp52;
  end if;
  begin  -- ── SUBTRANSACTION ──────────────────────────────────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then
      raise exception 'GATE(d): no probe character: %', v_r; end if;

    -- Woodcutting 51: one level short of Maple Grove.
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_uid, 0, 'woodcutting', v_xp51)
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    if public.hr_level_from_xp(v_xp51) <> 51 then
      raise exception 'GATE(d) CANNOT RUN: % xp is level %, not 51',
        v_xp51, public.hr_level_from_xp(v_xp51);
    end if;

    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('activity',
               jsonb_build_object('kind','gather','id','maple_grove','restart',true),
               'journal', c_j));
    if v_r->>'error' is distinct from 'activity_locked' then
      raise exception 'GATE(d): Woodcutting 51 declaring maple_grove answered % — it must be '
                      'activity_locked. `unknown_activity` means §1 did not land; `ok` means '
                      'the stand is off its ruled level and the rung is free', v_r;
    end if;
    if (select active_kind from public.player_state where user_id = v_uid and slot = 0) <> 'idle'
       or (select active_id from public.player_state where user_id = v_uid and slot = 0)
            is not distinct from 'maple_grove' then
      raise exception 'GATE(d): the refused declaration still moved player_state.active_*';
    end if;

    -- POSITIVE CONTROL #1 — same character, same verb, the OLD rung it HAS the
    -- level for (`maple_tree`, req 45). Without this a build that broke gather
    -- declarations outright would "pass" the refusal and prove nothing.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('activity',
               jsonb_build_object('kind','gather','id','maple_tree','restart',true),
               'journal', c_j));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(d) CONTROL: Woodcutting 51 was refused maple_tree (req 45) — % — so '
                      'gather declarations are broken and the refusal measured nothing', v_r;
    end if;

    -- POSITIVE CONTROL #2 — ONE level is the whole difference.
    update public.player_skills set xp = v_xp52
     where user_id = v_uid and slot = 0 and skill_id = 'woodcutting';
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('activity',
               jsonb_build_object('kind','gather','id','maple_grove','restart',true),
               'journal', c_j));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(d) CONTROL: Woodcutting 52 was still refused maple_grove (%) — the '
                      'stand is gated ABOVE its ruled level and the rung is unreachable', v_r;
    end if;
    if (select active_id from public.player_state where user_id = v_uid and slot = 0)
         is distinct from 'maple_grove' then
      raise exception 'GATE(d) CONTROL: the accepted declaration did not become the live pointer';
    end if;

    raise exception using errcode = 'HR812',
      message = 'timberline §2 complete — rolling back';
  exception when sqlstate 'HR812' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- ROLLBACK PROOF. Without this the file seeds a character into production as
  -- a side effect of verifying itself, which CLAUDE.md §2 forbids outright.
  if exists (select 1 from public.player_state       where user_id = v_uid)
     or exists (select 1 from public.player_skills    where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_equipment where user_id = v_uid)
     or exists (select 1 from public.player_progress  where user_id = v_uid)
     or exists (select 1 from public.player_intents   where user_id = v_uid)
     or exists (select 1 from public.player_ledger    where user_id = v_uid)
     or exists (select 1 from public.hr_rejections    where user_id = v_uid)
     or exists (select 1 from auth.users              where id = v_uid) then
    raise exception 'GATE: §2 LEAKED a probe row';
  end if;

  raise notice 'timberline: 5 stands (woodcutting 12 rungs, one per level, none ungated), '
               'hr_items unchanged at %, hr_apply refuses Woodcutting 51 the level-52 '
               'Maple Grove, accepts maple_tree at 51 and Maple Grove at 52 — all green',
               v_items1;
end $$;
