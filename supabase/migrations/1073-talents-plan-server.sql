-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1073-talents-plan-server.sql — A ROADS PLAN PAYS ON THE SERVER: THE STANDING RULE WALKS THE HERO'S SAVED BUILD
--   FOR ITS PLANNED HUNT FIRST (BROWSER CLOSED OR NOT), AND "SPEND ON PLAN" IS ONE KEYED PRESS. ALL BEHIND THE TALENTS SWITCH.
--   (lane/talents-plan-server, backend-architect, 2026-11-27; docs/design/redesign/17-talent-tree.md sections 2, 11 and 14 "Spending a
--   point every Level: Spend as suggested or a saved plan's order, as a standing rule"; HANDOFFS lane/r-ui-roads-2 item 2.)
--
-- STATUS: supabase/migration-notes/1073-talents-plan-server.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): after 1069-talent-standing-rule.sql (the three bodies it restates, PINNED
--   in §0) and 1051-company-start.sql (hr_hero_ground_of, the plan's ground, read and never restated). Applied as ONE transaction by the
--   apply tool; never begin/commit here. Ends with its §4 self-check.
-- EDGE: none. The engine reads the `talents` section's `nodes` (hunt-settle.js memberInput) as before; the section's new `plan_hunt` key
--   is read only by the client (src/session/company-sections.js planGroundOf).
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- A saved build (hr_talent_build_save, 1064) is the player's plan for a ground, but the server's standing rule (1069) walked only the
--   catalogue's suggested road, so a plan paid only while the player pressed Spend on plan, one hr_talent_spend a point, which a long plan
--   runs into the 30-a-minute gate on. The plan is a decision the server already holds, so the server pays it: as each Level comes (the
--   settle that credits the Level is the write the rule rides, viewed or not), and in one press when the player asks.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- THE PLAN: the hero's saved build (hero_talent_builds) for the ground its plan sends it to, hr_hero_ground_of (1051: the plan's ground
--   when set after its last hunt, else its last hunt's that is not a training ground). The section projects that ground as `plan_hunt`,
--   so the client draws, saves and pays the same build the server walks (src/session/company-sections.js planGroundOf reads it first).
-- THE ORDER (a saved build keeps none, so the server defines it): EACH POINT GOES TO THE FIRST PLANNED NODE IN MAP ORDER THAT THE SPEND'S
--   OWN CHECK TAKES. Map order is the catalogue's seq (src/data/talents.js row order; gen-talents asserts every link names an earlier seq, so
--   a node always comes after the one it leaves). It is the client's nextPlanStep (src/core/talent-route.js) pressed until the points run
--   out, so the map's "next step" is the step the server pays. Held means: a plain or choice node owned (at ANY pick: the hero's own choice
--   stands, the plan never re-picks it), an open road at its planned count. Each step is hr_talent_spend_problem at hr_level_of, the check a
--   hand spend gets. The one way an EARLIER planned node opens after a later buy is a hybrid's needed crossroads (`needs`), so after buying a
--   crossroads the walk goes back to the earliest node it passed for needs_crossroads (the same first-in-map-order rule, no second pass).
-- VOWS: the standing rule NEVER takes a vow (17 section 2, R8), a planned one included: it walks past it. Spend on plan is the player's own
--   press of the player's own plan, so it takes a planned vow once its slot is open (as a hand spend of the same node would).
--
-- §1 hero_talent_log.verb learns 'plan' (Spend on plan's journal row).
-- §2 INTERNAL (owner-only):
--    hr_talent_plan_steps(p_nodes, p_draft, p_level, p_vows) -> (built, n_spent, steps, why), STABLE, writes nothing: THE ONE PLAN ORDER.
--      built the build after the walk, n_spent the points it spent, steps [[node, pick], ...] in buying order (an open road once a point),
--      why null when nothing the walk may pay is left unpaid, 'no_points' when it ended on its points, else the spend problem of the
--      earliest planned node it could not buy (a vow's Level or slot, the borrow count).
--    hr_talent_plan_walk(p_user, p_slot, p_vows) -> (n_spent, hunt, lv, why, steps): the hero's plan ground and its saved build, the
--      hero's Level and nodes FOR UPDATE, the order above; writes hero_talents only when it spent. hunt null = no plan (no ground, or no
--      build saved for it). The CALLER holds the hero's player_state row lock.
-- §3 THE STANDING RULE, RESTATED (1069's images pinned): hr_talent_standing (the trigger) and hr_talent_auto_set (the setting turned on)
--      walk the plan first (never a vow), then hr_talent_walk (the suggested road, then the open road, 1069 unchanged). Their one journal row
--      each adds meta.plan_hunt and meta.plan_n (the points the plan took) when a plan exists. hr_talent_spend_suggested (the "Spend as
--      suggested" press) is NOT restated: it walks the suggested road, as it says.
-- §4 hr_talents_view RESTATED (1069's image pinned): the section adds `plan_hunt` (hr_hero_ground_of, or null). Still null while the
--      switch is off.
-- §5 hr_talent_spend_plan(p_slot, p_hunt, p_idem) -> jsonb, authenticated. p_hunt is the ground the screen shows the plan for, only
--      COMPARED with the server's (plan_changed when it moved: another tab changed the plan). Refuses talents_closed while the switch is off;
--      keyed before and under hr_hunt_lock (hr_intent_replay), rate-gated ('hunt'), settle-first (no unpaid hunt window is replayed on a new
--      build). Pays every planned node it can now, in the order above, vows included, never past the points; ONE journal row (hero_talent_log
--      'plan': the ground in `node`, n, Level, meta.steps). Answers { ok, spent, talents } and the hero's envelope (rule 11); the stored
--      receipt a replayed key answers carries none. Nothing to pay is a refusal that says why.
-- ERRORS: not_signed_in, bad_slot, bad_idem, bad_intent, talents_closed, rate_limited, settle_first, no_character, intent_mismatch,
--   plan_changed (p_hunt is not the server's plan ground; the answer names the server's), no_plan (no build saved for that ground),
--   plan_done (every planned node held), no_points, and the spend problems (vow_level, vow_slots, borrow_max, needs_crossroads, ...).
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- Every writer of a build holds the hero's player_state row lock before it reads hero_talents (1069's order, unchanged): the press through
--   hr_hunt_lock, the standing rule because it fires inside the UPDATE of that row. A save (hr_talent_build_save) also takes hr_hunt_lock,
--   so a plan cannot change under a walk, and a press, a reset, a save and a settle's Level-up are one order per hero. The press is keyed
--   (player_intents) before and under the lock: a retry answers its first receipt and spends nothing; a second press with a NEW key re-reads
--   the build under the lock and pays only what is still unpaid. The rule needs no key: it fires once per Level-raising write, and a
--   replayed settle is refused by the settle's own key before it writes the Level.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- ONE new client verb. It names a slot, a ground word (compared, never used to choose the build: the server reads its own ground) and a
--   key. It moves no gold, item or XP and adds no power: it spends the hero's own points on the hero's own saved build, each step the hand
--   spend's own check (hr_talent_spend_problem), so it can do nothing N hr_talent_spend presses could not, in one rate-gate tick instead of N.
--   The build it walks was checked whole when saved (hr_talent_build_problem) and is checked again node by node here. The standing rule's
--   restatement adds only the plan walk, which never takes a vow. Nothing crosses to another player. ON THE PRE-EA SECURITY LIST
--   (docs/design/redesign/13-security-list.md S-25).
--
-- ── COST (rows and bytes at 100x players) ────────────────────────────────────
-- No new table or column. The press writes one hero_talents update, one log row (meta.steps, ~30 bytes a point) and one intent row, where
--   the client loop wrote N of each. The rule adds, per Level-up with the setting on, two primary-key reads (the plan ground's hero_plans
--   row, the latest hunt_sessions row) and one hero_talent_builds read; no extra row (its one log row carries plan_hunt and plan_n). The
--   section adds the same ground read per hr_state_of, only while the switch is on (hr_hero_ground_of is a SET-clause SQL function, the
--   class tests/settle-budget.mjs SB-3 watches, like hr_talent_points and hr_talent_spent the view already calls: the switch's arming lane
--   restates the three together through tools/gen-plan-cache.mjs). At 100x (8,000 heroes) no row count moves; the press's rows replace the
--   client loop's.
--
-- ── REVERSIBILITY ────────────────────────────────────────────────────────────
-- Restate hr_talent_standing, hr_talent_auto_set and hr_talents_view from 1069-talent-standing-rule.sql; drop hr_talent_spend_plan (and
--   its baseline row), hr_talent_plan_walk and hr_talent_plan_steps; put hero_talent_log's verb check back without 'plan' (after deleting
--   the 'plan' rows). Builds the plan paid stay spent (a reset returns them).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ───────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.hero_talents') is null or to_regclass('public.hero_talent_builds') is null or to_regclass('public.hero_talent_log') is null
     or to_regclass('public.hr_talent_rules') is null or to_regclass('public.hr_talent_nodes') is null or to_regclass('public.hero_plans') is null then
    raise exception 'PRECONDITION: the Roads (1064-roads-sample.sql, its catalogue, 1069-talent-standing-rule.sql) and the company plan (1051) first'; end if;
  if to_regprocedure('public.hr_talent_spend_problem(jsonb,text,text,integer)') is null or to_regprocedure('public.hr_talent_spent(jsonb)') is null
     or to_regprocedure('public.hr_talent_points(integer)') is null or to_regprocedure('public.hr_talent_walk(uuid,integer,text)') is null
     or to_regprocedure('public.hr_talent_reset_quote(uuid,integer)') is null or to_regprocedure('public.hr_hero_ground_of(uuid,integer)') is null
     or to_regprocedure('public.hr_char_level(bigint)') is null or to_regprocedure('public.hr_level_of(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null or to_regprocedure('public.hr_settle_first_noted(text,uuid,integer)') is null
     or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null or to_regprocedure('public.hr_record_rejection(uuid,integer,text,text,jsonb,bigint)') is null
     or to_regprocedure('public.hr_state_of(uuid,integer)') is null or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing'; end if;
  -- THE PINS: the three bodies this file restates are the images 1069-talent-standing-rule.sql wrote (md5 of prosrc, carriage returns removed)
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_talent_standing()');
  if v_md5 is distinct from '7021ad6f2ff17fb7fd0bc3198b998e25' then
    raise exception 'PIN: hr_talent_standing is not 1069-talent-standing-rule.sql''s image (md5 %): another file moved it; re-read and re-pin', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_talent_auto_set(integer,text,uuid)');
  if v_md5 is distinct from '9c30f59c85dd3088f29831c7d585db27' then
    raise exception 'PIN: hr_talent_auto_set is not 1069-talent-standing-rule.sql''s image (md5 %): another file moved it; re-read and re-pin', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_talents_view(uuid,integer)');
  if v_md5 is distinct from '5fcd70304b38702e9e5c598f3ac295b6' then
    raise exception 'PIN: hr_talents_view is not 1069-talent-standing-rule.sql''s image (md5 %): another file moved it; re-read and re-pin', v_md5; end if;
end $mig$;

-- ── §1 THE JOURNAL'S NEW VERB ────────────────────────────────────────────────
alter table public.hero_talent_log drop constraint if exists hero_talent_log_verb_check;
alter table public.hero_talent_log add constraint hero_talent_log_verb_check
  check (verb in ('spend', 'suggested', 'build_save', 'build_delete', 'reset', 'auto', 'plan'));

-- ── §2 THE PLAN'S ORDER, ONE BODY ────────────────────────────────────────────
create or replace function public.hr_talent_plan_steps(p_nodes jsonb, p_draft jsonb, p_level integer, p_vows boolean,
                                                       out built jsonb, out n_spent integer, out steps jsonb, out why text)
language plpgsql stable set search_path = public, pg_catalog as $fn$
declare
  v_ids text[]; v_kinds text[]; v_want jsonb[]; v_i int := 1; v_back int; v_why_at int; v_pts int; v_spent int; v_why text; v_pick text;
begin
  -- TALENTS PLAN (1073-talents-plan-server.sql): each point to the FIRST planned node in map order (hr_talent_nodes.seq) that the spend's
  -- own check takes; src/core/talent-route.js nextPlanStep pressed until the points run out. Pure: reads the catalogue, writes nothing.
  built := coalesce(p_nodes, '{}'::jsonb); n_spent := 0; steps := '[]'::jsonb; why := null;
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' then return; end if;
  select array_agg(x.id order by x.seq), array_agg(x.kind order by x.seq), array_agg(d.value order by x.seq)
    into v_ids, v_kinds, v_want
    from jsonb_each(p_draft) d join public.hr_talent_nodes x on x.id = d.key and x.kind <> 'start';
  v_pts := public.hr_talent_points(p_level);
  v_spent := public.hr_talent_spent(built);
  while v_i <= coalesce(cardinality(v_ids), 0) loop
    -- HELD: an open road at its planned count; any other node owned, at any pick (the hero's own choice stands)
    if v_kinds[v_i] = 'open' then
      if jsonb_typeof(v_want[v_i]) <> 'number'
         or coalesce((built->>v_ids[v_i])::int, 0) >= (v_want[v_i] #>> '{}')::numeric then v_i := v_i + 1; continue; end if;
    elsif built ? v_ids[v_i] then v_i := v_i + 1; continue;
    end if;
    -- THE STANDING RULE NEVER TAKES A VOW (17 section 2, R8): it walks past one, and the player takes it
    if v_kinds[v_i] = 'vow' and not p_vows then v_i := v_i + 1; continue; end if;
    if v_spent >= v_pts then why := 'no_points'; exit; end if;
    v_pick := case when v_kinds[v_i] in ('crossroads', 'border', 'hybrid', 'crossing', 'final', 'milepost') and jsonb_typeof(v_want[v_i]) = 'string'
                   then v_want[v_i] #>> '{}' end;
    v_why := public.hr_talent_spend_problem(built, v_ids[v_i], v_pick, p_level);
    if v_why is null then
      built := built || jsonb_build_object(v_ids[v_i], case when v_kinds[v_i] = 'open' then to_jsonb(coalesce((built->>v_ids[v_i])::int, 0) + 1)
                                                             when v_pick is not null then to_jsonb(v_pick) else 'true'::jsonb end);
      n_spent := n_spent + 1;
      v_spent := v_spent + 1;
      steps := steps || jsonb_build_array(jsonb_build_array(v_ids[v_i], v_pick));
      -- a crossroads can open a hybrid passed earlier (its `needs`): back to the earliest one, so the next point is still the first in map order
      if v_kinds[v_i] = 'crossroads' and v_back is not null then
        if v_why_at is not null and v_why_at >= v_back then why := null; v_why_at := null; end if;
        v_i := v_back; v_back := null;
      elsif v_kinds[v_i] <> 'open' then v_i := v_i + 1;
      end if;
    else
      if v_why_at is null then why := v_why; v_why_at := v_i; end if;
      if v_why = 'needs_crossroads' and v_back is null then v_back := v_i; end if;
      v_i := v_i + 1;
    end if;
  end loop;
end $fn$;

create or replace function public.hr_talent_plan_walk(p_user uuid, p_slot integer, p_vows boolean,
                                                      out n_spent integer, out hunt text, out lv integer, out why text, out steps jsonb)
language plpgsql set search_path = public, pg_catalog as $fn$
declare v_draft jsonb; v_nodes jsonb; s record;
begin
  -- TALENTS PLAN (1073-talents-plan-server.sql): the hero's saved build for the ground its plan sends it to (hr_hero_ground_of), walked in
  -- hr_talent_plan_steps' order. hunt null = no plan. The CALLER holds the hero's player_state row lock (hr_hunt_lock, or the trigger's row).
  n_spent := 0; steps := '[]'::jsonb; why := null;
  hunt := public.hr_hero_ground_of(p_user, p_slot);
  lv := greatest(1, coalesce(public.hr_level_of(p_user, p_slot), 1));
  if hunt is not null then
    select b.nodes into v_draft from public.hero_talent_builds b where b.user_id = p_user and b.slot = p_slot and b.hunt_id = hunt;
  end if;
  if v_draft is null then hunt := null; return; end if;
  v_nodes := coalesce((select t.nodes from public.hero_talents t where t.user_id = p_user and t.slot = p_slot for update), '{}'::jsonb);
  select * into s from public.hr_talent_plan_steps(v_nodes, v_draft, lv, p_vows);
  n_spent := s.n_spent; why := s.why; steps := s.steps;
  if n_spent > 0 then
    insert into public.hero_talents as t (user_id, slot, nodes, spent, updated_at)
      values (p_user, p_slot, s.built, public.hr_talent_spent(s.built), now())
      on conflict (user_id, slot) do update set nodes = excluded.nodes, spent = excluded.spent, updated_at = excluded.updated_at;
  end if;
end $fn$;

-- ── §3 THE STANDING RULE WALKS THE PLAN FIRST ────────────────────────────────
create or replace function public.hr_talent_standing()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare w record; v_pn int; v_ph text; v_from int; v_to int; v_state text; v_msg text;
begin
  -- STANDING RULE (1069-talent-standing-rule.sql; 20 section 3.3, 17 section 14): a hero's Level rose and its setting is on (the trigger's
  -- WHEN), so every point it has left is spent along its suggested road, the press's own walk. Dark while the switch is off. It never fails
  -- the write it rides (a settle, the recruit press): a fault is recorded and the Level lands unspent.
  -- TALENTS PLAN (1073-talents-plan-server.sql): the hero's saved plan for its planned hunt first, in map order, never a vow; then the road.
  if not coalesce((select r.live from public.hr_talent_rules r where r.id), false) then return null; end if;
  v_from := public.hr_char_level(old.level_xp);
  v_to := public.hr_char_level(new.level_xp);
  if v_to <= v_from then return null; end if;
  begin
    select p.n_spent, p.hunt into v_pn, v_ph from public.hr_talent_plan_walk(new.user_id, new.slot, false) p;
    select * into w from public.hr_talent_walk(new.user_id, new.slot, new.talent_auto);
    if v_pn + w.n_spent > 0 then
      insert into public.hero_talent_log (user_id, slot, verb, n, level, meta)
        values (new.user_id, new.slot, 'suggested', v_pn + w.n_spent, w.lv,
                jsonb_build_object('plan', new.talent_auto, 'discipline', w.disc, 'standing', true, 'from_level', v_from)
                || case when v_ph is not null then jsonb_build_object('plan_hunt', v_ph, 'plan_n', v_pn) else '{}'::jsonb end);
    end if;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    perform public.hr_record_rejection(new.user_id, new.slot, 'talent_standing', 'walk_failed',
      jsonb_build_object('sqlstate', v_state, 'message', left(v_msg, 200), 'from_level', v_from, 'to_level', v_to), 1);
  end;
  return null;
end $fn$;

create or replace function public.hr_talent_auto_set(p_slot integer, p_plan text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_was text; w record; v_settle jsonb; v_pn int := 0; v_ph text;
begin
  -- STANDING RULE (1069-talent-standing-rule.sql): the hero's "Spend as suggested" setting: a plan word, or null (off). Turning it on
  -- spends every point left now along the same walk; the rule spends each new point as its Level comes.
  -- TALENTS PLAN (1073-talents-plan-server.sql): on, the walk is the rule's: the saved plan for the planned hunt first (never a vow), then the road.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection('talent_auto', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('talent_auto', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_plan is not null and p_plan not in ('party', 'solo') then
    return public.hr_note_rejection('talent_auto', p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  if not coalesce((select live from public.hr_talent_rules where id), false) then
    return public.hr_note_rejection('talent_auto', p_slot, jsonb_build_object('ok', false, 'error', 'talents_closed')); end if;
  v_verb := 'talent_auto:' || coalesce(p_plan, 'off');
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return v_r; end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_settle := public.hr_settle_first_noted('talent_auto', v_uid, p_slot);
  if v_settle is not null then return v_settle; end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return v_r; end if;
  select talent_auto into v_was from public.player_state where user_id = v_uid and slot = p_slot;
  if not found then
    return public.hr_note_rejection('talent_auto', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  update public.player_state set talent_auto = p_plan where user_id = v_uid and slot = p_slot and talent_auto is distinct from p_plan;
  if p_plan is not null then
    select p.n_spent, p.hunt into v_pn, v_ph from public.hr_talent_plan_walk(v_uid, p_slot, false) p;
  end if;
  select * into w from public.hr_talent_walk(v_uid, p_slot, p_plan);
  insert into public.hero_talent_log (user_id, slot, verb, pick, n, level, meta)
    values (v_uid, p_slot, 'auto', p_plan, v_pn + w.n_spent, w.lv, jsonb_build_object('was', v_was, 'discipline', w.disc)
            || case when v_ph is not null then jsonb_build_object('plan_hunt', v_ph, 'plan_n', v_pn) else '{}'::jsonb end);
  v_r := jsonb_build_object('ok', true, 'auto', p_plan, 'spent', v_pn + w.n_spent, 'talents', public.hr_talents_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  -- the answer carries the hero as the setting left it (rule 11, tests/write-answers-state.mjs); the stored receipt a retry answers carries none
  return v_r || jsonb_build_object('envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;

-- ── §4 THE SECTION SAYS THE PLAN'S GROUND ────────────────────────────────────
create or replace function public.hr_talents_view(p_user uuid, p_slot integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare r public.hr_talent_rules%rowtype; v_lv int; v_nodes jsonb; v_auto text;
begin
  -- ROADS (1064-roads-sample.sql): the envelope section `talents`; null while the switch is off (so no settle grants a node and no hero
  -- pays an idle point) or for no hero. The engine reads `nodes` (hunt-settle.js memberInput); the card reads the rest.
  -- STANDING RULE (1069-talent-standing-rule.sql): `auto`, the plan "Spend as suggested" spends new points for, or null (off).
  -- TALENTS PLAN (1073-talents-plan-server.sql): `plan_hunt`, the ground whose saved build the rule and Spend on plan walk (hr_hero_ground_of).
  select * into r from public.hr_talent_rules where id;
  if not found or not r.live then return null; end if;
  select ps.talent_auto into v_auto from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
  if not found then return null; end if;
  v_lv := greatest(1, coalesce(public.hr_level_of(p_user, p_slot), 1));
  v_nodes := coalesce((select t.nodes from public.hero_talents t where t.user_id = p_user and t.slot = p_slot), '{}'::jsonb);
  return jsonb_build_object(
    'live', true, 'level', v_lv, 'points', public.hr_talent_points(v_lv), 'spent', public.hr_talent_spent(v_nodes), 'nodes', v_nodes,
    'auto', v_auto,
    'plan_hunt', public.hr_hero_ground_of(p_user, p_slot),
    'borrowed', coalesce((select jsonb_agg(jsonb_build_object('move', o.borrow, 'opens_at', o.opens_at, 'open', o.opens_at is not null and v_lv >= o.opens_at)
                                           order by o.node_id)
                            from jsonb_each_text(v_nodes) e join public.hr_talent_options o on o.node_id = e.key and o.option_id = e.value
                           where o.borrow is not null), '[]'::jsonb),
    'vow_slots', (select count(*) from unnest(r.vow_slots) s where s <= v_lv),
    'builds', coalesce((select jsonb_object_agg(b.hunt_id, b.nodes) from public.hero_talent_builds b where b.user_id = p_user and b.slot = p_slot), '{}'::jsonb),
    'reset', public.hr_talent_reset_quote(p_user, p_slot));
end $fn$;

-- ── §5 SPEND ON PLAN, ONE PRESS ──────────────────────────────────────────────
create or replace function public.hr_talent_spend_plan(p_slot integer, p_hunt text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_settle jsonb; v_ground text; p record;
begin
  -- TALENTS PLAN (1073-talents-plan-server.sql): every point the hero's saved plan for its planned hunt can take now, in map order (vows
  -- included: the player's own press), under the hero's lock; one journal row, one answer with the envelope.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection('talent_plan', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('talent_plan', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_hunt is null or p_hunt !~ '^[a-z0-9_]{1,64}$' then
    return public.hr_note_rejection('talent_plan', p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  if not coalesce((select live from public.hr_talent_rules where id), false) then
    return public.hr_note_rejection('talent_plan', p_slot, jsonb_build_object('ok', false, 'error', 'talents_closed')); end if;
  v_verb := 'talent_plan:' || p_hunt;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return v_r; end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_settle := public.hr_settle_first_noted('talent_plan', v_uid, p_slot);
  if v_settle is not null then return v_settle; end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return v_r; end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection('talent_plan', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- the plan the screen showed must still be the server's: its ground is compared, never used to choose the build
  v_ground := public.hr_hero_ground_of(v_uid, p_slot);
  if v_ground is distinct from p_hunt then
    return public.hr_note_rejection('talent_plan', p_slot, jsonb_build_object('ok', false, 'error', 'plan_changed', 'plan_hunt', v_ground)); end if;
  select * into p from public.hr_talent_plan_walk(v_uid, p_slot, true);
  if p.hunt is null then
    return public.hr_note_rejection('talent_plan', p_slot, jsonb_build_object('ok', false, 'error', 'no_plan', 'plan_hunt', v_ground)); end if;
  if p.n_spent = 0 then
    if p.why is null then
      return public.hr_note_rejection('talent_plan', p_slot, jsonb_build_object('ok', false, 'error', 'plan_done', 'plan_hunt', v_ground)); end if;
    return public.hr_note_rejection('talent_plan', p_slot, jsonb_build_object('ok', false, 'error', p.why, 'plan_hunt', v_ground));
  end if;
  insert into public.hero_talent_log (user_id, slot, verb, node, n, level, meta)
    values (v_uid, p_slot, 'plan', p.hunt, p.n_spent, p.lv, jsonb_build_object('steps', p.steps, 'stopped', p.why));
  v_r := jsonb_build_object('ok', true, 'spent', p.n_spent, 'talents', public.hr_talents_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  -- the answer carries the hero as the press left it (rule 11, tests/write-answers-state.mjs); the stored receipt a retry answers carries none
  return v_r || jsonb_build_object('envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;

-- ── §5b THE GRANTS (revoke before grant) ─────────────────────────────────────
do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_talent_plan_steps(jsonb,jsonb,integer,boolean)', 'public.hr_talent_plan_walk(uuid,integer,boolean)',
                               'public.hr_talent_standing()', 'public.hr_talents_view(uuid,integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
  foreach v_sig in array array['public.hr_talent_auto_set(integer,text,uuid)', 'public.hr_talent_spend_plan(integer,text,uuid)'] loop
    execute format('revoke execute on function %s from public, anon, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
    execute format('grant execute on function %s to authenticated', v_sig);
  end loop;
end $mig$;
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note)
values ('hr_talent_spend_plan', 'p_slot integer, p_hunt text, p_idem uuid', 'authenticated',
        'added 1073-talents-plan-server.sql (lane/talents-plan-server): Spend on plan, every point the hero''s saved build for its planned hunt can take now, in map order, each step the hand spend''s own check (vows included, the player''s press); p_hunt only compared with the server''s plan ground (plan_changed); keyed, settle-first, one hero_talent_log row (plan); talents_closed while the switch is off; pre-EA Security list S-25')
on conflict (proname, identity_args, grantee) do update set note = excluded.note;
update public.hr_client_rpc_baseline
   set note = 'added 1069-talent-standing-rule.sql (lane/recruits-ammo-talents): the hero''s "Spend as suggested" setting, a plan word (party, solo) or null (off); on spends every point left, the saved plan for the planned hunt first (1073, never a vow) then the catalogue''s suggested road (hr_talent_walk, never a vow); keyed, settle-first, journalled in hero_talent_log; talents_closed while the switch is off; pre-EA Security list S-12 and S-25'
 where proname = 'hr_talent_auto_set' and grantee = 'authenticated';

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) CLOSED: with the switch off the press refuses talents_closed and writes nothing.
-- (b) THE PRESS: a hero with the setting off (points bank) and a plan for its planned hunt (the section names that ground as plan_hunt,
--     hr_hero_ground_of's): another ground is plan_changed; at Level 8 ONE press pays 7 points, exactly the plan's first 7 in map order
--     (its choices at their planned picks), never the vow; one 'plan' log row with those steps; the envelope answers; the same key answers
--     its receipt and spends nothing; no point left is no_points. At Level 29 the press pays the plan's crossroads II, waystone and open
--     road (to its planned count 2) and stops there; again at 29 the planned vow answers vow_level; at Level 30 the press takes it; then
--     plan_done; the plan deleted, no_plan.
-- (c) THE STANDING RULE: a hero with the setting on and a plan that leaves the suggested road (Mend's stones before the Challenge): Level
--     1 -> 6 pays the plan's five, not the road's; Level 6 -> 31 pays the plan's next four, walks past its vow, then the suggested road
--     for the rest; each rise one 'suggested' row naming plan_hunt and plan_n. The setting off banks two Levels' points; turning it on
--     pays them on the plan's two new stones, one 'auto' row naming plan_hunt and plan_n.
-- (d) THE ORDER (hr_talent_plan_steps): a crossroads planted late in map order opens a hybrid passed before it, and the hybrid is the next
--     point (the first in map order); a choice the hero holds at another pick stands (the plan pays on past it, never re-picks it).
-- (e) GRANTS: the press and the setting are the signed-in client's and in the baseline; the order, the walk, the rule and the view no client's.
do $chk$
declare
  v_u  constant uuid := '000000c0-0000-4000-a000-0000001c7301';   -- the press's hero, setting off
  v_t  constant uuid := '000000c0-0000-4000-a000-0000001c7302';   -- the standing rule's hero, setting on
  v jsonb; v2 jsonb; v_role text; v_ground text; s record;
  v_live constant boolean := (select live from public.hr_talent_rules where id);
  v_seq  constant int := (select seq from public.hr_talent_nodes where id = 'greater_mend.x1');
  v_press constant jsonb := '{"challenge.r1": true, "challenge.r2": true, "challenge.r3": true, "challenge.x1": "long_hold", "challenge.w1": true,
                              "challenge.r4": true, "challenge.r5": true, "challenge.x2": "mended", "challenge.w2": true, "challenge.open": 2,
                              "vow.hold_fast": true}';
  v_rule  constant jsonb := '{"mend.r1": true, "mend.r2": true, "mend.r3": true, "mend.x1": "steady_mend", "mend.w1": true,
                              "challenge.r1": true, "challenge.r2": true, "challenge.r3": true, "challenge.x1": "hard_challenge", "vow.hold_fast": true}';
begin
  begin
    insert into auth.users (id) values (v_u), (v_t) on conflict (id) do nothing;
    insert into public.profiles (id) values (v_u), (v_t) on conflict do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'talents-plan §6 probe'), (v_t, 'talents-plan §6 probe') on conflict (user_id) do nothing;
    v_ground := (select g.hunt_id from public.hr_hunt_grounds g where not exists (select 1 from public.hr_training_grounds t where t.hunt_id = g.hunt_id)
                  order by g.hunt_id limit 1);
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    update public.player_state set talent_auto = null where user_id = v_u and slot = 0;

    -- (a) closed
    update public.hr_talent_rules set live = false where id;
    delete from public.hr_rate_counters where user_id = v_u;
    if public.hr_talent_spend_plan(0, v_ground, '000000c0-0000-4000-a000-0000001c7310')->>'error' is distinct from 'talents_closed'
       or exists (select 1 from public.hero_talents where user_id = v_u) or exists (select 1 from public.hero_talent_log where user_id = v_u) then
      raise exception 'VERIFY(a): the closed press answered or wrote'; end if;

    -- (b) the press, lit inside the probe
    update public.hr_talent_rules set live = true where id;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hero_plan_set(0, v_ground, '000000c0-0000-4000-a000-0000001c7311');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): the plan''s ground answered %', v; end if;
    if public.hr_talents_view(v_u, 0)->>'plan_hunt' is distinct from v_ground or public.hr_hero_ground_of(v_u, 0) is distinct from v_ground then
      raise exception 'VERIFY(b): the section names plan_hunt % for the ground %', public.hr_talents_view(v_u, 0)->'plan_hunt', v_ground; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_talent_build_save(0, v_ground, v_press, '000000c0-0000-4000-a000-0000001c7312');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): the plan''s save answered %', v; end if;
    update public.player_state set level_xp = public.hr_char_xp_for_level(8) where user_id = v_u and slot = 0;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_talent_spend_plan(0, 'no_such_ground', '000000c0-0000-4000-a000-0000001c7313');
    if v->>'error' is distinct from 'plan_changed' or v->>'plan_hunt' is distinct from v_ground or exists (select 1 from public.hero_talents where user_id = v_u) then
      raise exception 'VERIFY(b): another ground answered %', v; end if;
    v := public.hr_talent_spend_plan(0, v_ground, '000000c0-0000-4000-a000-0000001c7314');
    if coalesce(v->>'ok', '') <> 'true' or (v->>'spent')::int <> 7 or (v->'talents'->>'spent')::int <> 7
       or v->'talents'->'nodes' <> '{"challenge.r1": true, "challenge.r2": true, "challenge.r3": true, "challenge.x1": "long_hold", "challenge.w1": true,
                                     "challenge.r4": true, "challenge.r5": true}'::jsonb
       or (v->'envelope'->'talents'->>'spent')::int is distinct from 7 then
      raise exception 'VERIFY(b): the press at Level 8 answered %', v - 'envelope'; end if;
    if (select count(*) from public.hero_talent_log where user_id = v_u and verb = 'plan') <> 1
       or not exists (select 1 from public.hero_talent_log where user_id = v_u and verb = 'plan' and node = v_ground and n = 7 and level = 8
                        and meta->'steps'->0 = '["challenge.r1", null]'::jsonb and meta->'steps'->3 = '["challenge.x1", "long_hold"]'::jsonb
                        and jsonb_array_length(meta->'steps') = 7)
       or exists (select 1 from public.hero_talent_log where user_id = v_u and verb = 'spend') then
      raise exception 'VERIFY(b): the press journalled %', (select jsonb_agg(to_jsonb(l) - 'id' - 'at') from public.hero_talent_log l where l.user_id = v_u); end if;
    v2 := public.hr_talent_spend_plan(0, v_ground, '000000c0-0000-4000-a000-0000001c7314');
    if v2 ? 'envelope' or v2->'spent' is distinct from v->'spent' or (select count(*) from public.hero_talent_log where user_id = v_u and verb = 'plan') <> 1 then
      raise exception 'VERIFY(b): a replayed key answered %', v2; end if;
    v := public.hr_talent_spend_plan(0, v_ground, '000000c0-0000-4000-a000-0000001c7315');
    if v->>'error' is distinct from 'no_points' then raise exception 'VERIFY(b): a press with no point left answered %', v; end if;
    update public.player_state set level_xp = public.hr_char_xp_for_level(29) where user_id = v_u and slot = 0;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_talent_spend_plan(0, v_ground, '000000c0-0000-4000-a000-0000001c7316');
    if coalesce(v->>'ok', '') <> 'true' or (v->>'spent')::int <> 4 or v->'talents'->'nodes'->'challenge.open' <> '2'::jsonb
       or v->'talents'->'nodes'->>'challenge.x2' is distinct from 'mended' or v->'talents'->'nodes' ? 'vow.hold_fast' then
      raise exception 'VERIFY(b): the press at Level 29 answered %', v - 'envelope'; end if;
    v := public.hr_talent_spend_plan(0, v_ground, '000000c0-0000-4000-a000-0000001c7317');
    if v->>'error' is distinct from 'vow_level' then raise exception 'VERIFY(b): the plan''s vow at Level 29 answered %', v; end if;
    update public.player_state set level_xp = public.hr_char_xp_for_level(30) where user_id = v_u and slot = 0;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_talent_spend_plan(0, v_ground, '000000c0-0000-4000-a000-0000001c7318');
    if coalesce(v->>'ok', '') <> 'true' or (v->>'spent')::int <> 1 or not v->'talents'->'nodes' ? 'vow.hold_fast' then
      raise exception 'VERIFY(b): the press at Level 30 answered %', v - 'envelope'; end if;
    v := public.hr_talent_spend_plan(0, v_ground, '000000c0-0000-4000-a000-0000001c7319');
    if v->>'error' is distinct from 'plan_done' then raise exception 'VERIFY(b): a paid plan answered %', v; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    perform public.hr_talent_build_save(0, v_ground, null, '000000c0-0000-4000-a000-0000001c731a');
    v := public.hr_talent_spend_plan(0, v_ground, '000000c0-0000-4000-a000-0000001c731b');
    if v->>'error' is distinct from 'no_plan' then raise exception 'VERIFY(b): no plan answered %', v; end if;

    -- (c) the standing rule walks the plan first, never its vow
    perform set_config('request.jwt.claim.sub', v_t::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' or (select talent_auto from public.player_state where user_id = v_t and slot = 0) is distinct from 'party' then
      raise exception 'VERIFY(c): the rule''s hero answered %', v; end if;
    delete from public.hr_rate_counters where user_id = v_t;
    perform public.hr_hero_plan_set(0, v_ground, '000000c0-0000-4000-a000-0000001c7320');
    v := public.hr_talent_build_save(0, v_ground, v_rule, '000000c0-0000-4000-a000-0000001c7321');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): the plan''s save answered %', v; end if;
    update public.player_state set level_xp = public.hr_char_xp_for_level(6) where user_id = v_t and slot = 0;
    if (select nodes from public.hero_talents where user_id = v_t and slot = 0)
         is distinct from '{"mend.r1": true, "mend.r2": true, "mend.r3": true, "mend.x1": "steady_mend", "mend.w1": true}'::jsonb
       or not exists (select 1 from public.hero_talent_log where user_id = v_t and verb = 'suggested' and n = 5 and meta->>'standing' = 'true'
                        and meta->>'plan_hunt' = v_ground and (meta->>'plan_n')::int = 5) then
      raise exception 'VERIFY(c): Level 1 -> 6 left % and the log %', (select nodes from public.hero_talents where user_id = v_t),
        (select jsonb_agg(to_jsonb(l) - 'id' - 'at') from public.hero_talent_log l where l.user_id = v_t); end if;
    update public.player_state set level_xp = public.hr_char_xp_for_level(31) where user_id = v_t and slot = 0;
    if (select spent from public.hero_talents where user_id = v_t and slot = 0) <> public.hr_talent_points(31)
       or (select nodes->>'challenge.x1' from public.hero_talents where user_id = v_t and slot = 0) is distinct from 'hard_challenge'
       or (select nodes ? 'vow.hold_fast' from public.hero_talents where user_id = v_t and slot = 0)
       or not exists (select 1 from public.hero_talent_log where user_id = v_t and verb = 'suggested' and (meta->>'from_level')::int = 6
                        and n = public.hr_talent_points(31) - 5 and (meta->>'plan_n')::int = 4) then
      raise exception 'VERIFY(c): Level 6 -> 31 left % and the log %', (select nodes from public.hero_talents where user_id = v_t),
        (select jsonb_agg(to_jsonb(l) - 'id' - 'at') from public.hero_talent_log l where l.user_id = v_t); end if;
    delete from public.hr_rate_counters where user_id = v_t;
    perform public.hr_talent_auto_set(0, null, '000000c0-0000-4000-a000-0000001c7322');
    update public.player_state set level_xp = public.hr_char_xp_for_level(33) where user_id = v_t and slot = 0;
    if (select spent from public.hero_talents where user_id = v_t and slot = 0) <> public.hr_talent_points(31) then
      raise exception 'VERIFY(c): with the setting off a Level-up spent'; end if;
    delete from public.hr_rate_counters where user_id = v_t;
    perform public.hr_talent_build_save(0, v_ground, v_rule || '{"mend.r4": true, "mend.r5": true}'::jsonb, '000000c0-0000-4000-a000-0000001c7323');
    delete from public.hr_rate_counters where user_id = v_t;
    v := public.hr_talent_auto_set(0, 'party', '000000c0-0000-4000-a000-0000001c7324');
    if coalesce(v->>'ok', '') <> 'true' or (v->>'spent')::int <> 2 or not v->'talents'->'nodes' ? 'mend.r4' or not v->'talents'->'nodes' ? 'mend.r5'
       or not exists (select 1 from public.hero_talent_log where user_id = v_t and verb = 'auto' and pick = 'party' and n = 2
                        and meta->>'plan_hunt' = v_ground and (meta->>'plan_n')::int = 2) then
      raise exception 'VERIFY(c): the setting on answered %', v - 'envelope'; end if;

    -- (d) the order: a crossroads planted late in map order opens a hybrid passed before it
    update public.hr_talent_nodes set seq = 100000 where id = 'greater_mend.x1';
    select * into s from public.hr_talent_plan_steps('{}'::jsonb,
      '{"challenge.r1": true, "challenge.r2": true, "challenge.r3": true, "challenge.x1": "long_hold", "greater_mend.r1": true, "greater_mend.r2": true,
        "greater_mend.r3": true, "greater_mend.x1": "light_mending", "border.shield_restoration.town": "use_shelter",
        "border.shield_restoration.x": "healing_shelter"}'::jsonb, 11, false);
    if s.n_spent <> 10 or s.why is not null
       or s.steps->8 <> '["greater_mend.x1", "light_mending"]'::jsonb or s.steps->9 <> '["border.shield_restoration.x", "healing_shelter"]'::jsonb then
      raise exception 'VERIFY(d): the late crossroads left % (%, why %)', s.steps, s.n_spent, s.why; end if;
    select * into s from public.hr_talent_plan_steps('{"challenge.r1": true, "challenge.r2": true, "challenge.r3": true, "challenge.x1": "guarding_challenge"}'::jsonb,
      '{"challenge.r1": true, "challenge.r2": true, "challenge.r3": true, "challenge.x1": "long_hold", "challenge.w1": true}'::jsonb, 11, false);
    if s.n_spent <> 1 or s.built->>'challenge.x1' <> 'guarding_challenge' or s.steps <> '[["challenge.w1", null]]'::jsonb or s.why is not null then
      raise exception 'VERIFY(d): a choice held at another pick gave % (%)', s.steps, s.built; end if;

    raise exception using errcode = 'HR873', message = 'talents-plan §6 complete - rolling back';
  exception when sqlstate 'HR873' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_u, v_t)) or (select live from public.hr_talent_rules where id) is distinct from v_live
     or (select seq from public.hr_talent_nodes where id = 'greater_mend.x1') is distinct from v_seq then
    raise exception 'VERIFY(e): §6 LEAKED a probe row, the switch or the planted order'; end if;
  -- (e) grants
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_talent_plan_steps(jsonb,jsonb,integer,boolean)', 'execute')
       or has_function_privilege(v_role, 'public.hr_talent_plan_walk(uuid,integer,boolean)', 'execute')
       or has_function_privilege(v_role, 'public.hr_talent_standing()', 'execute')
       or has_function_privilege(v_role, 'public.hr_talents_view(uuid,integer)', 'execute') then
      raise exception 'VERIFY(e): % reaches the order, the walk, the rule or the view', v_role; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_talent_spend_plan(integer,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_talent_spend_plan(integer,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_talent_auto_set(integer,text,uuid)', 'execute')
     or (select count(*) from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_talent_spend_plan', 'hr_talent_auto_set')) <> 2 then
    raise exception 'VERIFY(e): the press and the setting are not exactly the signed-in client''s'; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.player_state'::regclass and tgname = 'hr_talent_standing' and tgenabled = 'O') then
    raise exception 'VERIFY(e): the standing rule is not armed on player_state'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'talents-plan: the standing rule pays the saved plan first (never its vow), Spend on plan is one keyed press in map order; dark while the switch is off; all green';
end $chk$;
