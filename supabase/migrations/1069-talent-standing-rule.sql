-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1069-talent-standing-rule.sql — "SPEND AS SUGGESTED" AS A STANDING RULE: EVERY HERO'S NEW TALENT POINTS SPENT BY
--   THE SERVER AS THEY COME, RECRUITS ARRIVING SPENT, AND THE ONE PER-HERO SETTING. ALL BEHIND THE TALENTS SWITCH.
--   (lane/recruits-ammo-talents, backend-architect, 2026-11-23; docs/design/redesign/20-v030-the-roads.md section 3.3 "Spending Roads
--   points: Default 'Spend as suggested'. The standing rule. Recruits get it too"; 17-talent-tree.md sections 2 and 14; the first-hour
--   walk on the set: a recruit met a card for points it would spend the same way.)
--
-- STATUS: supabase/migration-notes/1069-talent-standing-rule.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): after 1064-roads-sample.sql (the two bodies it restates, PINNED in §0) and
--   1053-recruits.sql (the press whose Level write the rule sees). Applied as ONE transaction; never begin/commit here. Ends with §7.
-- EDGE: none (the engine already reads the `talents` section's nodes, hunt-settle.js memberInput; the section's new `auto` key is ignored
--   by every reader until the Talents tab shows it).
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- A point every Level (17 section 2). A player who wants the suggested road should never be asked about a point the server would spend
--   the same way, and a recruit should never arrive with a card for four (20 section 3.3). So the rule is a SERVER rule, not a client
--   loop: when a hero's Level rises, every point it has left is spent along the catalogue's suggested road for its worn weapon and plan,
--   exactly as the "Spend as suggested" press does (never a vow, then the open road). Viewed or not: the settle that credits the Level is
--   the write the rule rides, so a hunt with the browser closed spends the same points at the same moment as one watched.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- §1 player_state.talent_auto text, default 'party': the plan the standing rule spends for ('party' | 'solo'), NULL = off (the player
--    spends by hand; points bank). A server column (CLAUDE.md §6: no client-held gate), projected as `talents.auto`.
--    hero_talent_log.verb learns 'auto' (the setting's own journal row).
-- §2 hr_talent_walk(p_user, p_slot, p_plan) -> (n_spent, disc, lv), INTERNAL: THE ONE BODY of "Spend as suggested" (1064's loop, moved
--    here whole): the worn weapon's discipline (hr_hunt_weapon_of -> hr_talent_disciplines; none: nothing spent, disc null), the hero's
--    Level (hr_level_of), its nodes FOR UPDATE, the catalogue's suggested order for the plan, each step hr_talent_spend_problem, never a
--    vow, then the open road. Writes hero_talents only when it spent a point. The CALLER holds the hero's player_state row lock.
-- §3 hr_talent_spend_suggested(p_slot, p_plan, p_idem) RESTATED (1064's image pinned): the same verb, its walk now hr_talent_walk. Same
--    refusals, receipt, journal row and answer.
-- §4 THE STANDING RULE: trigger hr_talent_standing AFTER UPDATE OF level_xp ON player_state, WHEN the setting is on and the XP rose.
--    It spends only while hr_talent_rules.live, only when the Level rose (hr_char_level old < new), and journals one hero_talent_log row
--    ('suggested', meta.standing true, from_level) when it spent. A Level LOST (a death) spends and returns nothing. The rule can never
--    fail the write it rides: a fault inside it is caught, recorded (hr_record_rejection 'talent_standing' 'walk_failed') and the Level
--    lands without the spend; the next Level, or the press, spends what is left.
--    RECRUITS: hr_recruit_company (1053) writes each recruit's Level XP once, so each arrives with its points spent along ITS job's road,
--    the 'party' plan (the column's default), by this same rule, journalled per recruit. No body of 1053 moves.
-- §5 hr_talents_view RESTATED (1064's image pinned): the section adds `auto` (the plan or null). Still null while the switch is off.
-- §6 hr_talent_auto_set(p_slot, p_plan, p_idem) -> jsonb, authenticated. p_plan 'party' | 'solo' | null (off). Refuses talents_closed
--    while the switch is off; keyed before and under hr_hunt_lock (hr_intent_replay), rate-gated ('hunt'), settle-first (turning the rule
--    on spends at once, so no unpaid hunt window is replayed on a new build), journalled (hero_talent_log 'auto': the plan, the points it
--    spent, the plan it replaced). Turning it ON spends every point left now (the press and the rule in one). Answers { ok, auto, spent,
--    talents } and the hero's envelope (rule 11); the stored receipt a replayed key answers carries none.
-- ERRORS (all existing words): not_signed_in, bad_slot, bad_idem, bad_intent, talents_closed, rate_limited, settle_first, no_character,
--   intent_mismatch.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- Every writer of a build holds the hero's player_state row lock before it reads hero_talents: the verbs through hr_hunt_lock (advisory key,
--   then the row FOR UPDATE), the standing rule because it fires inside the UPDATE of that row. So a press, a reset and a settle's Level-up
--   are one order per hero, and the walk's FOR UPDATE on hero_talents is always taken second (no inversion). The setting verb is keyed
--   (player_intents) before and under the lock; a retry answers its first receipt and spends nothing. The rule needs no key: it fires once
--   per Level-raising write, and a replayed settle is refused by the settle's own key before it writes the Level.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- ONE new client verb, a SETTING: a plan word or null. It moves no gold, item or XP; it can only spend the hero's own points along the
--   catalogue's own road, each step the same check as a hand spend (hr_talent_spend_problem), never a vow. Nothing a client sends reaches
--   another player. The standing rule adds NO power: it spends points the hero already has, the way the press would. Dark while the switch
--   is off: the verb refuses and the rule returns before reading anything else. ON THE PRE-EA SECURITY LIST (13-security-list.md S-12).
--
-- ── COST (rows and bytes at 100x players) ────────────────────────────────────
-- One text column a hero (a few bytes; the default is a catalogue constant, no table rewrite). The rule's WHEN is two column comparisons
--   on every player_state update that names level_xp; its body runs only when the XP rose (most settles): one primary-key read of the
--   switch while it is off. While it is on and the Level rose (a few times a hero-day): two Level reads, the walk, one hero_talents upsert
--   and one log row. At 100x (8,000 heroes, a few Levels a day) under 40,000 log rows a day, about 8 MB before any prune; no ledger row.
--
-- ── REVERSIBILITY ────────────────────────────────────────────────────────────
-- Drop the trigger and hr_talent_standing; restate hr_talent_spend_suggested and hr_talents_view from 1064-roads-sample.sql; drop
--   hr_talent_auto_set (and its baseline row) and hr_talent_walk; put hero_talent_log's verb check back without 'auto' (after deleting the
--   'auto' rows); drop player_state.talent_auto. Builds spent by the rule stay spent (a reset returns them).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ───────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.hero_talents') is null or to_regclass('public.hero_talent_log') is null or to_regclass('public.hr_talent_rules') is null
     or to_regclass('public.hr_talent_suggest') is null or to_regclass('public.hr_talent_open') is null or to_regclass('public.hr_talent_disciplines') is null then
    raise exception 'PRECONDITION: the Roads first (1064-roads-sample.sql and its catalogue)'; end if;
  if to_regprocedure('public.hr_talent_spend_problem(jsonb,text,text,integer)') is null or to_regprocedure('public.hr_talent_spent(jsonb)') is null
     or to_regprocedure('public.hr_talent_points(integer)') is null or to_regprocedure('public.hr_talent_reset_quote(uuid,integer)') is null
     or to_regprocedure('public.hr_recruit_company(text[],uuid)') is null or to_regprocedure('public.hr_char_level(bigint)') is null
     or to_regprocedure('public.hr_level_of(uuid,integer)') is null or to_regprocedure('public.hr_hunt_weapon_of(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null or to_regprocedure('public.hr_settle_first_noted(text,uuid,integer)') is null
     or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null or to_regprocedure('public.hr_record_rejection(uuid,integer,text,text,jsonb,bigint)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing'; end if;
  -- THE PINS: the two bodies this file restates are the images 1064-roads-sample.sql wrote (md5 of prosrc, carriage returns removed)
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_talent_spend_suggested(integer,text,uuid)');
  if v_md5 is distinct from 'f935b94b9ad56fe01635e0bcfbaf7d1e' then
    raise exception 'PIN: hr_talent_spend_suggested is not 1064-roads-sample.sql''s image (md5 %): another file moved it; re-read and re-pin', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_talents_view(uuid,integer)');
  if v_md5 is distinct from 'b8b558f07ed6f2cd3a156f908544d851' then
    raise exception 'PIN: hr_talents_view is not 1064-roads-sample.sql''s image (md5 %): another file moved it; re-read and re-pin', v_md5; end if;
end $mig$;

-- ── §1 THE SETTING, AND THE JOURNAL'S NEW VERB ───────────────────────────────
alter table public.player_state add column if not exists talent_auto text default 'party';
alter table public.player_state drop constraint if exists player_state_talent_auto_ck;
alter table public.player_state add constraint player_state_talent_auto_ck check (talent_auto is null or talent_auto in ('party', 'solo'));
comment on column public.player_state.talent_auto is
  '1069-talent-standing-rule.sql: "Spend as suggested" as a standing rule, the plan it spends new Talent points for (party | solo); null = off. Written only by hr_talent_auto_set; read by the trigger hr_talent_standing and the talents section.';
alter table public.hero_talent_log drop constraint if exists hero_talent_log_verb_check;
alter table public.hero_talent_log add constraint hero_talent_log_verb_check
  check (verb in ('spend', 'suggested', 'build_save', 'build_delete', 'reset', 'auto'));

-- ── §2 THE WALK, ONE BODY ────────────────────────────────────────────────────
create or replace function public.hr_talent_walk(p_user uuid, p_slot integer, p_plan text,
                                                 out n_spent integer, out disc text, out lv integer)
language plpgsql set search_path = public, pg_catalog as $fn$
declare v_nodes jsonb; s record; v_open text;
begin
  -- ROADS (1069-talent-standing-rule.sql; 1064's "Spend as suggested" loop, moved here whole; src/core/talents.js spendSuggested): every
  -- point left, along the catalogue's suggested order for the worn weapon's discipline and the plan, NEVER a vow (17 section 2, R8), then
  -- the open road. Each step passes hr_talent_spend_problem. The caller holds the hero's player_state row lock.
  n_spent := 0;
  select d.discipline into disc from public.hr_talent_disciplines d where d.role_key = public.hr_hunt_weapon_of(p_user, p_slot);
  lv := greatest(1, coalesce(public.hr_level_of(p_user, p_slot), 1));
  if disc is null or p_plan is null then return; end if;
  v_nodes := coalesce((select t.nodes from public.hero_talents t where t.user_id = p_user and t.slot = p_slot for update), '{}'::jsonb);
  for s in select x.node_id, x.pick from public.hr_talent_suggest x where x.discipline = disc and x.plan = p_plan order by x.seq loop
    exit when public.hr_talent_spent(v_nodes) >= public.hr_talent_points(lv);
    if v_nodes ? s.node_id then continue; end if;
    if public.hr_talent_spend_problem(v_nodes, s.node_id, s.pick, lv) is null then
      v_nodes := v_nodes || jsonb_build_object(s.node_id, case when s.pick is null then 'true'::jsonb else to_jsonb(s.pick) end);
      n_spent := n_spent + 1;
    end if;
  end loop;
  select o.node_id into v_open from public.hr_talent_open o where o.discipline = disc;
  while v_open is not null and public.hr_talent_spent(v_nodes) < public.hr_talent_points(lv)
        and public.hr_talent_spend_problem(v_nodes, v_open, null, lv) is null loop
    v_nodes := v_nodes || jsonb_build_object(v_open, coalesce((v_nodes->>v_open)::int, 0) + 1);
    n_spent := n_spent + 1;
  end loop;
  if n_spent > 0 then
    insert into public.hero_talents as t (user_id, slot, nodes, spent, updated_at)
      values (p_user, p_slot, v_nodes, public.hr_talent_spent(v_nodes), now())
      on conflict (user_id, slot) do update set nodes = excluded.nodes, spent = excluded.spent, updated_at = excluded.updated_at;
  end if;
end $fn$;

-- ── §3 THE PRESS, ITS WALK NOW THE ONE BODY ──────────────────────────────────
create or replace function public.hr_talent_spend_suggested(p_slot integer, p_plan text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; w record; v_settle jsonb;
begin
  -- ROADS (1064-roads-sample.sql; src/core/talents.js spendSuggested): every point left, along the catalogue's suggested order for the worn
  -- weapon's discipline and the plan, NEVER a vow (17 section 2, R8), then the open road. Each step passes hr_talent_spend_problem.
  -- STANDING RULE (1069-talent-standing-rule.sql): the walk is hr_talent_walk, the one body the standing rule and the setting share.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection('talent_suggested', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('talent_suggested', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_plan is null or p_plan not in ('party', 'solo') then
    return public.hr_note_rejection('talent_suggested', p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  if not coalesce((select live from public.hr_talent_rules where id), false) then
    return public.hr_note_rejection('talent_suggested', p_slot, jsonb_build_object('ok', false, 'error', 'talents_closed')); end if;
  v_verb := 'talent_suggested:' || p_plan;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return v_r; end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_settle := public.hr_settle_first_noted('talent_suggested', v_uid, p_slot);
  if v_settle is not null then return v_settle; end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return v_r; end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection('talent_suggested', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  select * into w from public.hr_talent_walk(v_uid, p_slot, p_plan);
  if w.disc is null then return public.hr_note_rejection('talent_suggested', p_slot, jsonb_build_object('ok', false, 'error', 'no_weapon')); end if;
  insert into public.hero_talent_log (user_id, slot, verb, n, level, meta)
    values (v_uid, p_slot, 'suggested', w.n_spent, w.lv, jsonb_build_object('plan', p_plan, 'discipline', w.disc));
  v_r := jsonb_build_object('ok', true, 'spent', w.n_spent, 'talents', public.hr_talents_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  -- the answer carries the hero as the press left it (rule 11, tests/write-answers-state.mjs); the stored receipt a retry answers carries none
  return v_r || jsonb_build_object('envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;

-- ── §4 THE STANDING RULE ─────────────────────────────────────────────────────
create or replace function public.hr_talent_standing()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare w record; v_from int; v_to int; v_state text; v_msg text;
begin
  -- STANDING RULE (1069-talent-standing-rule.sql; 20 section 3.3, 17 section 14): a hero's Level rose and its setting is on (the trigger's
  -- WHEN), so every point it has left is spent along its suggested road, the press's own walk. Dark while the switch is off. It never fails
  -- the write it rides (a settle, the recruit press): a fault is recorded and the Level lands unspent.
  if not coalesce((select r.live from public.hr_talent_rules r where r.id), false) then return null; end if;
  v_from := public.hr_char_level(old.level_xp);
  v_to := public.hr_char_level(new.level_xp);
  if v_to <= v_from then return null; end if;
  begin
    select * into w from public.hr_talent_walk(new.user_id, new.slot, new.talent_auto);
    if w.n_spent > 0 then
      insert into public.hero_talent_log (user_id, slot, verb, n, level, meta)
        values (new.user_id, new.slot, 'suggested', w.n_spent, w.lv,
                jsonb_build_object('plan', new.talent_auto, 'discipline', w.disc, 'standing', true, 'from_level', v_from));
    end if;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    perform public.hr_record_rejection(new.user_id, new.slot, 'talent_standing', 'walk_failed',
      jsonb_build_object('sqlstate', v_state, 'message', left(v_msg, 200), 'from_level', v_from, 'to_level', v_to), 1);
  end;
  return null;
end $fn$;
drop trigger if exists hr_talent_standing on public.player_state;
create trigger hr_talent_standing after update of level_xp on public.player_state
  for each row when (new.talent_auto is not null and new.level_xp > old.level_xp)
  execute function public.hr_talent_standing();

-- ── §5 THE SECTION SAYS THE SETTING ──────────────────────────────────────────
create or replace function public.hr_talents_view(p_user uuid, p_slot integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare r public.hr_talent_rules%rowtype; v_lv int; v_nodes jsonb; v_auto text;
begin
  -- ROADS (1064-roads-sample.sql): the envelope section `talents`; null while the switch is off (so no settle grants a node and no hero
  -- pays an idle point) or for no hero. The engine reads `nodes` (hunt-settle.js memberInput); the card reads the rest.
  -- STANDING RULE (1069-talent-standing-rule.sql): `auto`, the plan "Spend as suggested" spends new points for, or null (off).
  select * into r from public.hr_talent_rules where id;
  if not found or not r.live then return null; end if;
  select ps.talent_auto into v_auto from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
  if not found then return null; end if;
  v_lv := greatest(1, coalesce(public.hr_level_of(p_user, p_slot), 1));
  v_nodes := coalesce((select t.nodes from public.hero_talents t where t.user_id = p_user and t.slot = p_slot), '{}'::jsonb);
  return jsonb_build_object(
    'live', true, 'level', v_lv, 'points', public.hr_talent_points(v_lv), 'spent', public.hr_talent_spent(v_nodes), 'nodes', v_nodes,
    'auto', v_auto,
    'borrowed', coalesce((select jsonb_agg(jsonb_build_object('move', o.borrow, 'opens_at', o.opens_at, 'open', o.opens_at is not null and v_lv >= o.opens_at)
                                           order by o.node_id)
                            from jsonb_each_text(v_nodes) e join public.hr_talent_options o on o.node_id = e.key and o.option_id = e.value
                           where o.borrow is not null), '[]'::jsonb),
    'vow_slots', (select count(*) from unnest(r.vow_slots) s where s <= v_lv),
    'builds', coalesce((select jsonb_object_agg(b.hunt_id, b.nodes) from public.hero_talent_builds b where b.user_id = p_user and b.slot = p_slot), '{}'::jsonb),
    'reset', public.hr_talent_reset_quote(p_user, p_slot));
end $fn$;

-- ── §6 THE SETTING'S VERB ────────────────────────────────────────────────────
create or replace function public.hr_talent_auto_set(p_slot integer, p_plan text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_was text; w record; v_settle jsonb;
begin
  -- STANDING RULE (1069-talent-standing-rule.sql): the hero's "Spend as suggested" setting: a plan word, or null (off). Turning it on
  -- spends every point left now along the same walk; the rule spends each new point as its Level comes.
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
  select * into w from public.hr_talent_walk(v_uid, p_slot, p_plan);
  insert into public.hero_talent_log (user_id, slot, verb, pick, n, level, meta)
    values (v_uid, p_slot, 'auto', p_plan, w.n_spent, w.lv, jsonb_build_object('was', v_was, 'discipline', w.disc));
  v_r := jsonb_build_object('ok', true, 'auto', p_plan, 'spent', w.n_spent, 'talents', public.hr_talents_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  -- the answer carries the hero as the setting left it (rule 11, tests/write-answers-state.mjs); the stored receipt a retry answers carries none
  return v_r || jsonb_build_object('envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;

-- ── §6b THE GRANTS (revoke before grant) ─────────────────────────────────────
do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_talent_walk(uuid,integer,text)', 'public.hr_talent_standing()', 'public.hr_talents_view(uuid,integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
  foreach v_sig in array array['public.hr_talent_spend_suggested(integer,text,uuid)', 'public.hr_talent_auto_set(integer,text,uuid)'] loop
    execute format('revoke execute on function %s from public, anon, service_role', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
  end loop;
end $mig$;
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note)
values ('hr_talent_auto_set', 'p_slot integer, p_plan text, p_idem uuid', 'authenticated',
        'added 1069-talent-standing-rule.sql (lane/recruits-ammo-talents): the hero''s "Spend as suggested" setting, a plan word (party, solo) or null (off); on spends every point left along the catalogue''s suggested road (hr_talent_walk, never a vow); keyed, settle-first, journalled in hero_talent_log; talents_closed while the switch is off; pre-EA Security list S-12')
on conflict (proname, identity_args, grantee) do update set note = excluded.note;

-- ── §7 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) CLOSED: with the switch off a Level-up spends nothing and writes nothing, the setting verb refuses talents_closed, the section is null.
-- (b) THE RULE: with the switch on (inside the probe) a new hero's Level 1 -> 6 spends its 5 points along its road, ONE log row
--     ('suggested', standing, from Level 1), and the build is exactly what the press makes for a twin hero (setting off) at Level 6.
-- (c) XP inside a Level spends nothing and writes no row; a Level LOST (a death) spends and returns nothing.
-- (d) NEVER A VOW: at Level 40 the rule has spent every point, none on a vow.
-- (e) THE SETTING: off (null) -> the section says null and a Level-up banks its point; on ('party') spends the banked points at once,
--     answers the envelope, journals one 'auto' row; the same key answers its receipt and spends nothing; a plan off the list bad_intent.
-- (f) RECRUITS: a one-hero Club account at Level 5 presses; each recruit arrives at Level 5 with hr_talent_points(5) spent along its OWN
--     job's road (party plan), journalled one standing row each; the first hero's own points were spent by its Level-ups.
-- (g) A FAULT NEVER FAILS THE LEVEL: with the catalogue's order made to fail (a planted bad row is impossible here, so the walk is
--     planted to raise), the Level still lands, no build is written, and the fault is recorded walk_failed.
-- (h) GRANTS: the setting and the press are the signed-in client's and on the baseline; the walk, the rule and the view no client's.
do $chk$
declare
  v_a  constant uuid := '000000c0-0000-4000-a000-0000001c6901';   -- the rule's hero (shield)
  v_b  constant uuid := '000000c0-0000-4000-a000-0000001c6902';   -- its twin, setting off, pressing the walk
  v_c  constant uuid := '000000c0-0000-4000-a000-0000001c6903';   -- a one-hero Club account that recruits
  v jsonb; v2 jsonb; v_role text; v_n int; v_nodes jsonb; r record;
  v_live constant boolean := (select live from public.hr_talent_rules where id);
  v_walk constant text := pg_get_functiondef('public.hr_talent_walk(uuid,integer,text)'::regprocedure);
begin
  begin
    insert into auth.users (id) values (v_a), (v_b), (v_c) on conflict (id) do nothing;
    insert into public.profiles (id) values (v_a), (v_b), (v_c) on conflict do nothing;
    insert into public.hr_access_allowlist (user_id, note)
      values (v_a, 'talent-standing §7 probe'), (v_b, 'talent-standing §7 probe'), (v_c, 'talent-standing §7 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    if (select talent_auto from public.player_state where user_id = v_a and slot = 0) is distinct from 'party' then
      raise exception 'VERIFY(a): a new hero''s setting is %, not the party plan', (select talent_auto from public.player_state where user_id = v_a and slot = 0); end if;

    -- (a) closed
    update public.hr_talent_rules set live = false where id;
    update public.player_state set level_xp = public.hr_char_xp_for_level(6) where user_id = v_a and slot = 0;
    delete from public.hr_rate_counters where user_id = v_a;
    if exists (select 1 from public.hero_talents where user_id = v_a) or exists (select 1 from public.hero_talent_log where user_id = v_a)
       or public.hr_talent_auto_set(0, 'party', '000000c0-0000-4000-a000-0000001c6910')->>'error' is distinct from 'talents_closed'
       or coalesce(public.hr_state_of(v_a, 0)->'talents', 'null'::jsonb) <> 'null'::jsonb then
      raise exception 'VERIFY(a): with the switch off a Level-up or the setting wrote, or the section shows'; end if;

    -- (b) the rule, with the switch on inside the probe: Level 1 -> 6
    update public.hr_talent_rules set live = true where id;
    update public.player_state set level_xp = 0 where user_id = v_a and slot = 0;
    update public.player_state set level_xp = public.hr_char_xp_for_level(6) where user_id = v_a and slot = 0;
    select nodes into v_nodes from public.hero_talents where user_id = v_a and slot = 0;
    if public.hr_talent_spent(v_nodes) is distinct from public.hr_talent_points(6)
       or (select count(*) from public.hero_talent_log where user_id = v_a) <> 1
       or not exists (select 1 from public.hero_talent_log where user_id = v_a and verb = 'suggested' and n = public.hr_talent_points(6)
                        and level = 6 and meta->>'standing' = 'true' and (meta->>'from_level')::int = 1 and meta->>'plan' = 'party') then
      raise exception 'VERIFY(b): a Level 1 -> 6 rise left % and the log %', v_nodes,
        (select jsonb_agg(to_jsonb(l) - 'id' - 'at') from public.hero_talent_log l where l.user_id = v_a); end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_create_character(0);
    update public.player_state set talent_auto = null where user_id = v_b and slot = 0;
    update public.player_state set level_xp = public.hr_char_xp_for_level(6) where user_id = v_b and slot = 0;
    if exists (select 1 from public.hero_talents where user_id = v_b) then raise exception 'VERIFY(b): a hero with the setting off was spent'; end if;
    delete from public.hr_rate_counters where user_id = v_b;
    v := public.hr_talent_spend_suggested(0, 'party', '000000c0-0000-4000-a000-0000001c6911');
    if coalesce(v->>'ok', '') <> 'true' or v->'talents'->'nodes' is distinct from v_nodes or (v->>'spent')::int <> public.hr_talent_points(6) then
      raise exception 'VERIFY(b): the press made % where the rule made %', v->'talents'->'nodes', v_nodes; end if;
    if v->'talents'->'auto' <> 'null'::jsonb or v->'envelope'->'talents'->'auto' <> 'null'::jsonb then
      raise exception 'VERIFY(b): the section reads auto % for a hero whose setting is off', v->'talents'->'auto'; end if;

    -- (c) XP inside a Level spends nothing; a Level lost returns nothing
    update public.player_state set level_xp = level_xp + 1 where user_id = v_a and slot = 0;
    update public.player_state set level_xp = public.hr_char_xp_for_level(5) where user_id = v_a and slot = 0;
    if (select count(*) from public.hero_talent_log where user_id = v_a) <> 1 or (select nodes from public.hero_talents where user_id = v_a) is distinct from v_nodes then
      raise exception 'VERIFY(c): XP inside a Level or a Level lost moved the build'; end if;

    -- (d) never a vow: Level 40
    update public.player_state set level_xp = public.hr_char_xp_for_level(40) where user_id = v_a and slot = 0;
    select nodes into v_nodes from public.hero_talents where user_id = v_a and slot = 0;
    if public.hr_talent_spent(v_nodes) <> public.hr_talent_points(40)
       or exists (select 1 from jsonb_object_keys(v_nodes) k join public.hr_talent_nodes x on x.id = k where x.kind = 'vow') then
      raise exception 'VERIFY(d): at Level 40 the rule left % spent of % (or took a vow)', public.hr_talent_spent(v_nodes), public.hr_talent_points(40); end if;

    -- (e) the setting
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_talent_auto_set(0, null, '000000c0-0000-4000-a000-0000001c6912');
    if coalesce(v->>'ok', '') <> 'true' or v->'auto' <> 'null'::jsonb or v->'envelope'->'talents'->'auto' <> 'null'::jsonb
       or (select talent_auto from public.player_state where user_id = v_a and slot = 0) is not null then
      raise exception 'VERIFY(e): the setting off answered %', v - 'envelope'; end if;
    update public.player_state set level_xp = public.hr_char_xp_for_level(42) where user_id = v_a and slot = 0;
    if (select spent from public.hero_talents where user_id = v_a and slot = 0) <> public.hr_talent_points(40) then
      raise exception 'VERIFY(e): with the setting off a Level-up spent'; end if;
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_talent_auto_set(0, 'party', '000000c0-0000-4000-a000-0000001c6913');
    if coalesce(v->>'ok', '') <> 'true' or (v->>'spent')::int <> public.hr_talent_points(42) - public.hr_talent_points(40)
       or v->>'auto' is distinct from 'party' or (v->'envelope'->'talents'->>'spent')::int <> public.hr_talent_points(42)
       or v->'envelope'->'talents'->>'auto' is distinct from 'party'
       or not exists (select 1 from public.hero_talent_log where user_id = v_a and verb = 'auto' and pick = 'party' and n = (v->>'spent')::int) then
      raise exception 'VERIFY(e): the setting on answered %', v - 'envelope'; end if;
    v2 := public.hr_talent_auto_set(0, 'party', '000000c0-0000-4000-a000-0000001c6913');
    if v2 ? 'envelope' or v2->'spent' is distinct from v->'spent' or (select count(*) from public.hero_talent_log where user_id = v_a and verb = 'auto') <> 2 then
      raise exception 'VERIFY(e): a replayed key answered %', v2; end if;
    v := public.hr_talent_auto_set(0, 'everyone', '000000c0-0000-4000-a000-0000001c6914');
    if v->>'error' is distinct from 'bad_intent' then raise exception 'VERIFY(e): a plan off the list answered %', v; end if;

    -- (f) recruits arrive spent, each along its own job's road
    perform set_config('request.jwt.claim.sub', v_c::text, true);
    v := public.hr_create_hero(0, 'Standprobe Ana', '{"head":0,"body":0,"legs":0,"feet":0}'::jsonb, gen_random_uuid(), 'club');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(f): the first hero answered %', v; end if;
    update public.player_state set level_xp = public.hr_char_xp_for_level((select at_level from public.hr_recruit_rules)) where user_id = v_c and slot = 0;
    v := public.hr_recruit_company(null, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(f): the press answered %', v; end if;
    for r in select ps.slot, public.hr_level_of(ps.user_id, ps.slot) as lv,
                    (select d.discipline from public.hr_talent_disciplines d where d.role_key = public.hr_hunt_weapon_of(ps.user_id, ps.slot)) as disc
               from public.player_state ps where ps.user_id = v_c order by ps.slot loop
      if coalesce((select spent from public.hero_talents where user_id = v_c and slot = r.slot), 0) <> public.hr_talent_points(r.lv)
         or (r.slot > 0 and not exists (select 1 from public.hero_talent_log l where l.user_id = v_c and l.slot = r.slot and l.verb = 'suggested'
                                          and l.meta->>'standing' = 'true' and l.meta->>'discipline' = r.disc and l.meta->>'plan' = 'party')) then
        raise exception 'VERIFY(f): hero % (%, Level %) arrived with % of % points spent', r.slot, r.disc, r.lv,
          (select spent from public.hero_talents where user_id = v_c and slot = r.slot), public.hr_talent_points(r.lv); end if;
      -- its build is its own road's: every node it owns is on its discipline's suggested order or its open road
      if exists (select 1 from public.hero_talents t, jsonb_object_keys(t.nodes) k where t.user_id = v_c and t.slot = r.slot
                   and not exists (select 1 from public.hr_talent_suggest x where x.discipline = r.disc and x.plan = 'party' and x.node_id = k)
                   and not exists (select 1 from public.hr_talent_open o where o.discipline = r.disc and o.node_id = k)) then
        raise exception 'VERIFY(f): hero % (%) owns a node off its own road', r.slot, r.disc; end if;
    end loop;
    if (select count(distinct (select d.discipline from public.hr_talent_disciplines d where d.role_key = public.hr_hunt_weapon_of(ps.user_id, ps.slot)))
          from public.player_state ps where ps.user_id = v_c) <> 4 then
      raise exception 'VERIFY(f) CONTROL: the company does not hold four roads, so (f) proved one road four times'; end if;

    -- (g) a fault never fails the Level: the walk planted to raise
    execute replace(v_walk, '  n_spent := 0;', '  raise exception ''planted walk fault'';');
    update public.player_state set level_xp = public.hr_char_xp_for_level(45) where user_id = v_a and slot = 0;
    if public.hr_level_of(v_a, 0) <> 45 or (select spent from public.hero_talents where user_id = v_a and slot = 0) <> public.hr_talent_points(42)
       or not exists (select 1 from public.hr_rejections x where x.user_id = v_a and x.intent = 'talent_standing' and x.code = 'walk_failed') then
      raise exception 'VERIFY(g): a faulting walk failed the Level, wrote a build, or went unrecorded'; end if;

    raise exception using errcode = 'HR869', message = 'talent-standing §7 complete - rolling back';
  exception when sqlstate 'HR869' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_a, v_b, v_c)) or (select live from public.hr_talent_rules where id) is distinct from v_live
     or pg_get_functiondef('public.hr_talent_walk(uuid,integer,text)'::regprocedure) is distinct from v_walk then
    raise exception 'VERIFY(h): §7 LEAKED a probe row, the switch or the planted walk'; end if;
  -- (h) grants
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_talent_walk(uuid,integer,text)', 'execute')
       or has_function_privilege(v_role, 'public.hr_talent_standing()', 'execute')
       or has_function_privilege(v_role, 'public.hr_talents_view(uuid,integer)', 'execute') then
      raise exception 'VERIFY(h): % reaches the walk, the rule or the view', v_role; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_talent_auto_set(integer,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_talent_auto_set(integer,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_talent_spend_suggested(integer,text,uuid)', 'execute')
     or not exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_talent_auto_set' and grantee = 'authenticated') then
    raise exception 'VERIFY(h): the setting is not exactly the signed-in client''s'; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.player_state'::regclass and tgname = 'hr_talent_standing' and tgenabled = 'O') then
    raise exception 'VERIFY(h): the standing rule is not armed on player_state'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'talent-standing: a Level-up spends every point left as suggested (never a vow), recruits arrive spent, the setting is a server column; dark while the switch is off; all green';
end $chk$;
