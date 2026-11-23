-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1064-roads-sample.sql — THE ROADS SAMPLE ON THE SERVER: a hero's owned Talent nodes, spending a point, "Spend as
--   suggested", saved builds per hunt, the priced reset that moves the points, and the `talents` envelope section. ALL BEHIND THE SWITCH.
--   (lane/roads-sample, systems, 2026-11-23; docs/design/redesign/17-talent-tree.md v3 sections 2, 3, 11 and 14; 19-power-ledger.md L8.)
--
-- STATUS: supabase/migration-notes/1064-roads-sample.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): after 1063-level-costs.sql (whose reset verb it restates) and after
--   1064-roads-sample-catalogue.generated.sql (the catalogue it reads). Applied as ONE transaction by the apply tool; never begin/commit
--   here. Ends with its §4 self-check. EDGE: the hr-accrue whose settle reads the section (hunt-settle.js memberInput `_talents`); an
--   older engine ignores it, and while the switch is off the section is null, so either order is safe.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- The Roads (Tyler 2026-11-22: "I like it a lot") are the build system: a point every Level from 2, spent on a node that touches one the
--   hero owns. The client never authors a build (CLAUDE.md §1): it names a node and a pick, and the server checks it against the
--   catalogue (hr_talent_nodes, generated from src/data/talents.js) exactly as src/core/talents.js spendProblem does. The settle reads
--   the owned nodes from the envelope and the engine grants them (src/core/talents.js grantsOf), viewed or not.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 TABLES (RLS on, no policy, no client privilege):
--    hero_talents (user_id, slot, nodes jsonb, spent int, updated_at)   the hero's build: { nodeId: true | optionId | n } (an open road n)
--    hero_talent_builds (user_id, slot, hunt_id, nodes, saved_at)       a saved build per hunt (17 section 14: "applied at the Start")
--    hero_talent_log (id, user_id, slot, at, verb, node, pick, n, level, meta)  APPEND-ONLY journal: every spend, suggested walk, save, reset
-- §2 INTERNAL (owner-only): hr_talent_points(L), hr_talent_spent(nodes), hr_talent_spend_problem(nodes, node, pick, L) (the twin of
--    src/core/talents.js spendProblem: unknown_node, owned, not_reachable, bad_pick, not_offered (a town's or the crossing's pick whose
--    move has no opening Level: no measured value inside the bands, so the point would lend nothing), no_points, vow_level, vow_slots,
--    needs_crossroads, borrow_max), hr_talent_build_problem(nodes) (a whole saved build: every node, value, link, need, an unoffered
--    borrow, the borrow and vow counts),
--    hr_talents_view(user, slot) THE SECTION `talents` (hr_state_sections): null while hr_talent_rules.live is false, else
--    { live, level, points, spent, nodes, borrowed: [{ move, opens_at, open }], vow_slots, builds: { hunt: nodes }, reset: the quote }
-- §3 CLIENT VERBS (authenticated), each refusing talents_closed while the switch is off, keyed (hr_intent_replay before and under the
--    hero's lock), rate-gated ('hunt'), settle-first (no unpaid hunt window is replayed on a new build), journalled:
--    hr_talent_spend(p_slot, p_node, p_pick, p_idem)       one point on one node (an open road +1) -> { ok, talents }
--    hr_talent_spend_suggested(p_slot, p_plan, p_idem)     every point left along hr_talent_suggest for the worn weapon's discipline
--                                                           (hr_hunt_weapon_of -> hr_talent_disciplines) and plan, NEVER a vow (R8), then the open road
--    hr_talent_build_save(p_slot, p_hunt, p_nodes, p_idem)  a saved build for a hunt of hr_hunt_grounds, checked whole; p_nodes null deletes it
--    hr_talent_reset(p_slot, p_price, p_idem)               RESTATED from 1063-level-costs.sql (pinned): the same quote, price and journal,
--                                                           now refusing talents_closed, and it MOVES the points (the hero's nodes cleared)
-- ERRORS: not_signed_in, bad_slot, bad_idem, bad_intent, talents_closed, rate_limited, no_character, catalogue_missing, settle_first, the
--   spend problems above, no_weapon, unknown_hunt, too_many_builds, intent_mismatch, and the reset's (1063).
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- Every verb takes hr_hunt_lock (the settle's own per-hero lock), so a spend, a reset and a settle are one order per hero. A key is read
--   before the lock and again under it; the answer is stored under the key in the same transaction (player_intents), so a retry answers
--   the first decision and spends nothing. The build is re-read under the lock: a second press with a NEW key re-checks (owned, no_points).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- No value crosses to another player (a build is the hero's own power, read only by its own settle). No client number is used: a node id
--   and a pick are looked up in the catalogue (an unknown one is refused), the points are the server's Level (hr_level_of), the vow slots
--   and borrow opening Levels the catalogue's. The reset is the one gold sink here (1063's quote pattern, unchanged). A forged build cannot
--   reach the engine: hr_talents_view projects only rows this file wrote, and the engine re-validates (src/core/talents.js normalize).
--   ON THE PRE-EA SECURITY LIST (docs/design/redesign/13-security-list.md S-11).
--
-- ── COST (rows and bytes at 100x players) ────────────────────────────────────
-- One hero_talents row a hero (~2 KB at Level 300); a spend writes one row update, one log row and one intent row; "Spend as suggested"
--   one update and one log row whatever it spends. The section adds one primary-key read, one small scan of the hero's saved builds (at
--   most saved_builds_max) and one quote per hr_state_of, only while the switch is on. At 100x (8,000 heroes, a point a Level, a few
--   Levels a day) under 50,000 log rows a day, ~10 MB before any prune.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Restate hr_talent_reset from 1063-level-costs.sql and revoke it (dark again); drop the three verbs, the view and the internals; delete
--   the hr_state_sections row 'talents' and the baseline rows; drop the three tables. Nothing here moves gold but the reset (journalled).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.hr_talent_rules') is null or to_regclass('public.hr_talent_nodes') is null or to_regclass('public.hr_talent_options') is null
     or to_regclass('public.hr_talent_suggest') is null or to_regclass('public.hr_talent_open') is null or to_regclass('public.hr_talent_disciplines') is null then
    raise exception 'PRECONDITION: the Roads catalogue first (1064-roads-sample-catalogue.generated.sql)'; end if;
  if to_regclass('public.player_talent_resets') is null or to_regclass('public.hr_level_costs') is null or to_regclass('public.hr_hunt_grounds') is null
     or to_regclass('public.hr_state_sections') is null or to_regclass('public.hr_client_rpc_baseline') is null or to_regclass('public.player_intents') is null then
    raise exception 'PRECONDITION: a table this file reads is missing (1063-level-costs.sql, the hunts catalogue, the sections)'; end if;
  if to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_settle_first_noted(text,uuid,integer)') is null or to_regprocedure('public.hr_level_of(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_weapon_of(uuid,integer)') is null or to_regprocedure('public.hr_talent_reset_quote(uuid,integer)') is null
     or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing'; end if;
  -- THE PIN: the reset this file restates is the image 1063-level-costs.sql wrote (md5 of prosrc, carriage returns removed)
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_talent_reset(integer,bigint,uuid)');
  if v_md5 is distinct from '3cfeb99344194e3c3d0e52de65f31671' then
    raise exception 'PIN: hr_talent_reset is not 1063-level-costs.sql''s image (md5 %): another file moved it; re-read and re-pin', v_md5; end if;
end $mig$;

-- ── §1 THE TABLES ────────────────────────────────────────────────────────────
create table if not exists public.hero_talents (
  user_id    uuid        not null,
  slot       int         not null,
  nodes      jsonb       not null default '{}'::jsonb check (jsonb_typeof(nodes) = 'object'),
  spent      int         not null default 0 check (spent >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot),
  constraint hero_talents_char_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
create table if not exists public.hero_talent_builds (
  user_id  uuid        not null,
  slot     int         not null,
  hunt_id  text        not null check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  nodes    jsonb       not null check (jsonb_typeof(nodes) = 'object'),
  saved_at timestamptz not null default now(),
  primary key (user_id, slot, hunt_id),
  constraint hero_talent_builds_char_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
create table if not exists public.hero_talent_log (
  id      bigserial   primary key,
  user_id uuid        not null,
  slot    int         not null,
  at      timestamptz not null default now(),
  verb    text        not null check (verb in ('spend', 'suggested', 'build_save', 'build_delete', 'reset')),
  node    text,
  pick    text,
  n       int         not null default 0,
  level   int,
  meta    jsonb,
  constraint hero_talent_log_char_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
create index if not exists hero_talent_log_hero_at on public.hero_talent_log (user_id, slot, at);
do $mig$
declare v_t text;
begin
  foreach v_t in array array['hero_talents', 'hero_talent_builds', 'hero_talent_log'] loop
    execute format('alter table public.%I enable row level security', v_t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', v_t);
  end loop;
end $mig$;
revoke all on sequence public.hero_talent_log_id_seq from public, anon, authenticated, service_role;
comment on table public.hero_talents is '1064-roads-sample.sql: a hero''s owned Roads nodes. Written only by the Talents verbs.';
comment on table public.hero_talent_builds is '1064-roads-sample.sql: a hero''s saved build per hunt (17 section 14). Written only by hr_talent_build_save.';
comment on table public.hero_talent_log is '1064-roads-sample.sql: APPEND-ONLY journal of every Talents verb (spend, suggested, saves, reset).';

-- ── §2 THE RULES' TWINS (internal) ───────────────────────────────────────────
create or replace function public.hr_talent_points(p_level integer)
returns integer language sql stable set search_path = public, pg_catalog as $fn$
  -- ROADS (1064-roads-sample.sql; src/core/talents.js pointsAt): one point a Level from point_from
  select greatest(0, coalesce(p_level, 0) - (select point_from from public.hr_talent_rules where id) + 1)
$fn$;

create or replace function public.hr_talent_spent(p_nodes jsonb)
returns integer language sql stable set search_path = public, pg_catalog as $fn$
  -- ROADS (src/core/talents.js pointsSpent): an open road its count, every other node one
  select coalesce(sum(case when x.kind = 'open' and jsonb_typeof(e.value) = 'number' then (e.value #>> '{}')::int else 1 end), 0)::int
    from jsonb_each(coalesce(p_nodes, '{}'::jsonb)) e left join public.hr_talent_nodes x on x.id = e.key
$fn$;

create or replace function public.hr_talent_spend_problem(p_nodes jsonb, p_node text, p_pick text, p_level integer)
returns text language plpgsql stable set search_path = public, pg_catalog as $fn$
declare r public.hr_talent_rules%rowtype; n public.hr_talent_nodes%rowtype; v_borrow text; v_opens int; v_vows int;
begin
  -- ROADS (1064-roads-sample.sql): the twin of src/core/talents.js spendProblem, read from the generated catalogue
  select * into r from public.hr_talent_rules where id;
  if not found then return 'catalogue_missing'; end if;
  select * into n from public.hr_talent_nodes where id = p_node;
  if not found or n.kind = 'start' then return 'unknown_node'; end if;
  if n.kind <> 'open' and p_nodes ? p_node then return 'owned'; end if;
  if not exists (select 1 from unnest(n.after_ids) a join public.hr_talent_nodes x on x.id = a where x.kind = 'start' or p_nodes ? a) then
    return 'not_reachable'; end if;
  if n.kind in ('crossroads', 'border', 'hybrid', 'crossing', 'final', 'milepost') then
    select o.borrow, o.opens_at into v_borrow, v_opens from public.hr_talent_options o where o.node_id = p_node and o.option_id = p_pick;
    if not found then return 'bad_pick'; end if;
    -- a pick that lends a move with no opening Level (no measured V0 inside the bands: gen-talents writes opens_at null) lends nothing,
    -- so it is never bought (lane/roads-borrow-values; src/core/talents.js offered)
    if v_borrow is not null and v_opens is null then return 'not_offered'; end if;
  elsif p_pick is not null then return 'bad_pick';
  end if;
  if public.hr_talent_spent(p_nodes) + 1 > public.hr_talent_points(p_level) then return 'no_points'; end if;
  if n.kind = 'vow' then
    if coalesce(p_level, 0) < r.vow_slots[1] then return 'vow_level'; end if;
    select count(*) into v_vows from jsonb_object_keys(p_nodes) k join public.hr_talent_nodes x on x.id = k where x.kind = 'vow';
    if v_vows + 1 > (select count(*) from unnest(r.vow_slots) s where s <= p_level) then return 'vow_slots'; end if;
  end if;
  if n.needs is not null and exists (select 1 from unnest(n.needs) c where not exists (
       select 1 from jsonb_object_keys(p_nodes) k join public.hr_talent_nodes x on x.id = k where x.kind = 'crossroads' and x.country = c)) then
    return 'needs_crossroads'; end if;
  if v_borrow is not null and (select count(*) from jsonb_each_text(p_nodes) e
                                 join public.hr_talent_options o on o.node_id = e.key and o.option_id = e.value where o.borrow is not null) + 1 > r.max_borrowed then
    return 'borrow_max'; end if;
  return null;
end $fn$;

create or replace function public.hr_talent_build_problem(p_nodes jsonb)
returns text language plpgsql stable set search_path = public, pg_catalog as $fn$
declare r public.hr_talent_rules%rowtype; kv record; x public.hr_talent_nodes%rowtype;
begin
  -- ROADS (src/core/talents.js buildProblems without a Level): a saved build may run past the hero's Level (17 section 11), never off the map
  select * into r from public.hr_talent_rules where id;
  if not found then return 'catalogue_missing'; end if;
  if p_nodes is null or jsonb_typeof(p_nodes) <> 'object' or length(p_nodes::text) > 16384 then return 'bad_intent'; end if;
  for kv in select * from jsonb_each(p_nodes) loop
    select * into x from public.hr_talent_nodes where id = kv.key;
    if not found or x.kind = 'start' then return 'unknown_node'; end if;
    if x.kind = 'open' then
      if jsonb_typeof(kv.value) <> 'number' or (kv.value #>> '{}')::numeric not between 1 and 4000 or (kv.value #>> '{}')::numeric <> floor((kv.value #>> '{}')::numeric) then
        return 'bad_pick'; end if;
    elsif x.kind in ('crossroads', 'border', 'hybrid', 'crossing', 'final', 'milepost') then
      if jsonb_typeof(kv.value) <> 'string' or not exists (select 1 from public.hr_talent_options o where o.node_id = kv.key and o.option_id = kv.value #>> '{}') then
        return 'bad_pick'; end if;
      if exists (select 1 from public.hr_talent_options o where o.node_id = kv.key and o.option_id = kv.value #>> '{}'
                  and o.borrow is not null and o.opens_at is null) then
        return 'not_offered'; end if;
    elsif kv.value <> 'true'::jsonb then return 'bad_pick';
    end if;
    if not exists (select 1 from unnest(x.after_ids) a join public.hr_talent_nodes p on p.id = a where p.kind = 'start' or p_nodes ? a) then
      return 'not_reachable'; end if;
    if x.needs is not null and exists (select 1 from unnest(x.needs) c where not exists (
         select 1 from jsonb_object_keys(p_nodes) k join public.hr_talent_nodes y on y.id = k where y.kind = 'crossroads' and y.country = c)) then
      return 'needs_crossroads'; end if;
  end loop;
  if (select count(*) from jsonb_each_text(p_nodes) e join public.hr_talent_options o on o.node_id = e.key and o.option_id = e.value
       where o.borrow is not null) > r.max_borrowed then return 'borrow_max'; end if;
  if (select count(*) from jsonb_object_keys(p_nodes) k join public.hr_talent_nodes y on y.id = k where y.kind = 'vow') > cardinality(r.vow_slots) then
    return 'vow_slots'; end if;
  return null;
end $fn$;

create or replace function public.hr_talents_view(p_user uuid, p_slot integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare r public.hr_talent_rules%rowtype; v_lv int; v_nodes jsonb;
begin
  -- ROADS (1064-roads-sample.sql): the envelope section `talents`; null while the switch is off (so no settle grants a node and no hero
  -- pays an idle point) or for no hero. The engine reads `nodes` (hunt-settle.js memberInput); the card reads the rest.
  select * into r from public.hr_talent_rules where id;
  if not found or not r.live then return null; end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then return null; end if;
  v_lv := greatest(1, coalesce(public.hr_level_of(p_user, p_slot), 1));
  v_nodes := coalesce((select t.nodes from public.hero_talents t where t.user_id = p_user and t.slot = p_slot), '{}'::jsonb);
  return jsonb_build_object(
    'live', true, 'level', v_lv, 'points', public.hr_talent_points(v_lv), 'spent', public.hr_talent_spent(v_nodes), 'nodes', v_nodes,
    'borrowed', coalesce((select jsonb_agg(jsonb_build_object('move', o.borrow, 'opens_at', o.opens_at, 'open', o.opens_at is not null and v_lv >= o.opens_at)
                                           order by o.node_id)
                            from jsonb_each_text(v_nodes) e join public.hr_talent_options o on o.node_id = e.key and o.option_id = e.value
                           where o.borrow is not null), '[]'::jsonb),
    'vow_slots', (select count(*) from unnest(r.vow_slots) s where s <= v_lv),
    'builds', coalesce((select jsonb_object_agg(b.hunt_id, b.nodes) from public.hero_talent_builds b where b.user_id = p_user and b.slot = p_slot), '{}'::jsonb),
    'reset', public.hr_talent_reset_quote(p_user, p_slot));
end $fn$;
insert into public.hr_state_sections (key, fn, note) values
  ('talents', 'hr_talents_view', '1064-roads-sample.sql: the Roads build (owned nodes, points, borrowed moves, saved builds, the reset quote); null while the switch is off')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §3 THE VERBS ─────────────────────────────────────────────────────────────
create or replace function public.hr_talent_spend(p_slot integer, p_node text, p_pick text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_lv int; v_nodes jsonb; v_why text; v_kind text; v_settle jsonb;
begin
  -- ROADS (1064-roads-sample.sql): one point on one node, checked against the catalogue under the hero's lock
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection('talent_spend', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('talent_spend', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_node is null or p_node !~ '^[a-z_][a-z_0-9.]{0,63}$' or (p_pick is not null and p_pick !~ '^[a-z_]{1,48}$') then
    return public.hr_note_rejection('talent_spend', p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  if not coalesce((select live from public.hr_talent_rules where id), false) then
    return public.hr_note_rejection('talent_spend', p_slot, jsonb_build_object('ok', false, 'error', 'talents_closed')); end if;
  v_verb := 'talent_spend:' || p_node || ':' || coalesce(p_pick, '');
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return v_r; end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_settle := public.hr_settle_first_noted('talent_spend', v_uid, p_slot);
  if v_settle is not null then return v_settle; end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return v_r; end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection('talent_spend', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  v_lv := greatest(1, coalesce(public.hr_level_of(v_uid, p_slot), 1));
  v_nodes := coalesce((select nodes from public.hero_talents where user_id = v_uid and slot = p_slot for update), '{}'::jsonb);
  v_why := public.hr_talent_spend_problem(v_nodes, p_node, p_pick, v_lv);
  if v_why is not null then
    return public.hr_note_rejection('talent_spend', p_slot, jsonb_build_object('ok', false, 'error', v_why, 'node', p_node)); end if;
  select kind into v_kind from public.hr_talent_nodes where id = p_node;
  v_nodes := v_nodes || jsonb_build_object(p_node, case when v_kind = 'open' then to_jsonb(coalesce((v_nodes->>p_node)::int, 0) + 1)
                                                     when p_pick is not null then to_jsonb(p_pick) else 'true'::jsonb end);
  insert into public.hero_talents as t (user_id, slot, nodes, spent, updated_at)
    values (v_uid, p_slot, v_nodes, public.hr_talent_spent(v_nodes), now())
    on conflict (user_id, slot) do update set nodes = excluded.nodes, spent = excluded.spent, updated_at = excluded.updated_at;
  insert into public.hero_talent_log (user_id, slot, verb, node, pick, n, level) values (v_uid, p_slot, 'spend', p_node, p_pick, 1, v_lv);
  v_r := jsonb_build_object('ok', true, 'talents', public.hr_talents_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  -- the answer carries the hero as the press left it (rule 11, tests/write-answers-state.mjs); the stored receipt a retry answers carries none
  return v_r || jsonb_build_object('envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;

create or replace function public.hr_talent_spend_suggested(p_slot integer, p_plan text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_lv int; v_nodes jsonb; v_disc text; s record; v_open text; v_n int := 0; v_settle jsonb;
begin
  -- ROADS (1064-roads-sample.sql; src/core/talents.js spendSuggested): every point left, along the catalogue's suggested order for the worn
  -- weapon's discipline and the plan, NEVER a vow (17 section 2, R8), then the open road. Each step passes hr_talent_spend_problem.
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
  select d.discipline into v_disc from public.hr_talent_disciplines d where d.role_key = public.hr_hunt_weapon_of(v_uid, p_slot);
  if v_disc is null then return public.hr_note_rejection('talent_suggested', p_slot, jsonb_build_object('ok', false, 'error', 'no_weapon')); end if;
  v_lv := greatest(1, coalesce(public.hr_level_of(v_uid, p_slot), 1));
  v_nodes := coalesce((select nodes from public.hero_talents where user_id = v_uid and slot = p_slot for update), '{}'::jsonb);
  for s in select x.node_id, x.pick from public.hr_talent_suggest x where x.discipline = v_disc and x.plan = p_plan order by x.seq loop
    exit when public.hr_talent_spent(v_nodes) >= public.hr_talent_points(v_lv);
    if v_nodes ? s.node_id then continue; end if;
    if public.hr_talent_spend_problem(v_nodes, s.node_id, s.pick, v_lv) is null then
      v_nodes := v_nodes || jsonb_build_object(s.node_id, case when s.pick is null then 'true'::jsonb else to_jsonb(s.pick) end);
      v_n := v_n + 1;
    end if;
  end loop;
  select o.node_id into v_open from public.hr_talent_open o where o.discipline = v_disc;
  while v_open is not null and public.hr_talent_spent(v_nodes) < public.hr_talent_points(v_lv)
        and public.hr_talent_spend_problem(v_nodes, v_open, null, v_lv) is null loop
    v_nodes := v_nodes || jsonb_build_object(v_open, coalesce((v_nodes->>v_open)::int, 0) + 1);
    v_n := v_n + 1;
  end loop;
  insert into public.hero_talents as t (user_id, slot, nodes, spent, updated_at)
    values (v_uid, p_slot, v_nodes, public.hr_talent_spent(v_nodes), now())
    on conflict (user_id, slot) do update set nodes = excluded.nodes, spent = excluded.spent, updated_at = excluded.updated_at;
  insert into public.hero_talent_log (user_id, slot, verb, n, level, meta)
    values (v_uid, p_slot, 'suggested', v_n, v_lv, jsonb_build_object('plan', p_plan, 'discipline', v_disc));
  v_r := jsonb_build_object('ok', true, 'spent', v_n, 'talents', public.hr_talents_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  -- the answer carries the hero as the press left it (rule 11, tests/write-answers-state.mjs); the stored receipt a retry answers carries none
  return v_r || jsonb_build_object('envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;

create or replace function public.hr_talent_build_save(p_slot integer, p_hunt text, p_nodes jsonb, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_why text; v_max int;
begin
  -- ROADS (1064-roads-sample.sql; 17 sections 11 and 14): a saved build for a hunt, checked whole against the catalogue (every node, value,
  -- link, need, the borrow and vow counts); past the hero's Level is allowed (a plan), off the map never. p_nodes null deletes it.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection('talent_build', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('talent_build', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_hunt is null or p_hunt !~ '^[a-z0-9_]{1,64}$' then return public.hr_note_rejection('talent_build', p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  if not coalesce((select live from public.hr_talent_rules where id), false) then
    return public.hr_note_rejection('talent_build', p_slot, jsonb_build_object('ok', false, 'error', 'talents_closed')); end if;
  if not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = p_hunt) then
    return public.hr_note_rejection('talent_build', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_hunt')); end if;
  if p_nodes is not null then
    v_why := public.hr_talent_build_problem(p_nodes);
    if v_why is not null then return public.hr_note_rejection('talent_build', p_slot, jsonb_build_object('ok', false, 'error', v_why)); end if;
  end if;
  v_verb := 'talent_build:' || p_hunt || ':' || coalesce(md5(p_nodes::text), 'delete');
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return v_r; end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return v_r; end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection('talent_build', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if p_nodes is null then
    delete from public.hero_talent_builds where user_id = v_uid and slot = p_slot and hunt_id = p_hunt;
    insert into public.hero_talent_log (user_id, slot, verb, node) values (v_uid, p_slot, 'build_delete', p_hunt);
  else
    select saved_builds_max into v_max from public.hr_talent_rules where id;
    if not exists (select 1 from public.hero_talent_builds where user_id = v_uid and slot = p_slot and hunt_id = p_hunt)
       and (select count(*) from public.hero_talent_builds where user_id = v_uid and slot = p_slot) >= v_max then
      return public.hr_note_rejection('talent_build', p_slot, jsonb_build_object('ok', false, 'error', 'too_many_builds')); end if;
    insert into public.hero_talent_builds as b (user_id, slot, hunt_id, nodes, saved_at) values (v_uid, p_slot, p_hunt, p_nodes, now())
      on conflict (user_id, slot, hunt_id) do update set nodes = excluded.nodes, saved_at = excluded.saved_at;
    insert into public.hero_talent_log (user_id, slot, verb, node, n, meta)
      values (v_uid, p_slot, 'build_save', p_hunt, public.hr_talent_spent(p_nodes), jsonb_build_object('nodes', p_nodes));
  end if;
  v_r := jsonb_build_object('ok', true, 'talents', public.hr_talents_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  -- the answer carries the hero as the press left it (rule 11, tests/write-answers-state.mjs); the stored receipt a retry answers carries none
  return v_r || jsonb_build_object('envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;

create or replace function public.hr_talent_reset(p_slot integer, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_q jsonb; v_ver bigint; v_a jsonb; v_price bigint; v_free text; v_back int;
begin
  -- LEVEL-COSTS (1063-level-costs.sql): a reset is priced by the server's quote under the hero's lock and charged once.
  -- ROADS (1064-roads-sample.sql): refused while the Talents switch is off; it MOVES the points: the hero's nodes are cleared (every point
  -- back to spend), journalled in hero_talent_log with the points it returned. Saved builds stay (a plan is free).
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('talent_reset', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('talent_reset', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_price is null or p_price < 0 or p_price > 1000000000000000 then
    return public.hr_note_rejection('talent_reset', p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  if not coalesce((select live from public.hr_talent_rules where id), false) then
    return public.hr_note_rejection('talent_reset', p_slot, jsonb_build_object('ok', false, 'error', 'talents_closed')); end if;
  v_verb := case when p_price = 0 then 'talent_reset:free' else 'talent_reset:paid:' || p_price end;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('talent_reset', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_r := public.hr_settle_first_noted('talent_reset', v_uid, p_slot);
  if v_r is not null then return v_r; end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('talent_reset', p_slot, v_r); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection('talent_reset', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  v_q := public.hr_talent_reset_quote(v_uid, p_slot);
  if v_q is null then return public.hr_note_rejection('talent_reset', p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  if not (v_q->>'available')::boolean then
    return public.hr_note_rejection('talent_reset', p_slot, jsonb_build_object('ok', false, 'error', v_q->>'why', 'talent_reset', v_q)); end if;
  v_price := (v_q->>'price')::bigint;
  v_free := v_q->>'free';
  if v_price <> p_price then
    return public.hr_note_rejection('talent_reset', p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'talent_reset', v_q)); end if;
  if v_price > 0 then
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object('gold', -v_price,
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'talent_reset', 'n', (v_q->>'paid_today')::int + 1,
                                                                      'level', (v_q->>'level')::int))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      return public.hr_note_rejection('talent_reset', p_slot, v_a || jsonb_build_object('ok', false)); end if;
    if coalesce(v_a->>'replayed', 'false') = 'true' then return jsonb_build_object('ok', true, 'replayed', true); end if;
  else
    insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
      values (v_uid, p_slot, 'shop', v_verb, 0, jsonb_build_object('reason', 'talent_reset', 'free', v_free, 'level', (v_q->>'level')::int));
  end if;
  insert into public.player_talent_resets as r (user_id, slot, resets, last_at) values (v_uid, p_slot, 1, now())
    on conflict (user_id, slot) do update set resets = r.resets + 1, last_at = excluded.last_at;
  -- THE MOVE: every point back
  v_back := coalesce((select spent from public.hero_talents where user_id = v_uid and slot = p_slot), 0);
  delete from public.hero_talents where user_id = v_uid and slot = p_slot;
  insert into public.hero_talent_log (user_id, slot, verb, n, level, meta)
    values (v_uid, p_slot, 'reset', v_back, (v_q->>'level')::int, jsonb_build_object('price', v_price, 'free', v_free));
  v_r := jsonb_build_object('ok', true, 'gold', -v_price, 'free', v_free, 'talent_reset', public.hr_talent_reset_quote(v_uid, p_slot),
                            'talents', public.hr_talents_view(v_uid, p_slot));
  if v_price = 0 then
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
      values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  end if;
  return v_r || jsonb_build_object('envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;

-- ── §3b THE GRANTS ───────────────────────────────────────────────────────────
do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_talent_points(integer)', 'public.hr_talent_spent(jsonb)', 'public.hr_talent_spend_problem(jsonb,text,text,integer)',
                               'public.hr_talent_build_problem(jsonb)', 'public.hr_talents_view(uuid,integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
  foreach v_sig in array array['public.hr_talent_spend(integer,text,text,uuid)', 'public.hr_talent_spend_suggested(integer,text,uuid)',
                               'public.hr_talent_build_save(integer,text,jsonb,uuid)', 'public.hr_talent_reset(integer,bigint,uuid)'] loop
    execute format('revoke execute on function %s from public, anon, service_role', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
  end loop;
end $mig$;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated'
  and proname in ('hr_talent_spend', 'hr_talent_spend_suggested', 'hr_talent_build_save', 'hr_talent_reset');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_talent_spend', 'p_slot integer, p_node text, p_pick text, p_idem uuid', 'authenticated',
   'added 1064-roads-sample.sql (lane/roads-sample): one Talent point on one Roads node, checked against the generated catalogue (path, pick, points by the server''s Level, vow slots, a hybrid''s crossroads, borrow count); keyed, settle-first, journalled in hero_talent_log; talents_closed while the switch is off; pre-EA Security list S-11'),
  ('hr_talent_spend_suggested', 'p_slot integer, p_plan text, p_idem uuid', 'authenticated',
   'added 1064-roads-sample.sql (lane/roads-sample): every point left along the catalogue''s suggested order for the worn weapon''s discipline, never a vow, then the open road; each step the spend''s own check; talents_closed while the switch is off; pre-EA Security list S-11'),
  ('hr_talent_build_save', 'p_slot integer, p_hunt text, p_nodes jsonb, p_idem uuid', 'authenticated',
   'added 1064-roads-sample.sql (lane/roads-sample): a saved build per hunt, checked whole against the catalogue (nodes, values, links, needs, borrow and vow counts), at most saved_builds_max a hero; p_nodes null deletes; never applied here; pre-EA Security list S-11'),
  ('hr_talent_reset', 'p_slot integer, p_price bigint, p_idem uuid', 'authenticated',
   'opened 1064-roads-sample.sql (lane/roads-sample; priced in 1063-level-costs.sql): the priced Talent reset, now moving the points (the hero''s nodes cleared); p_price only compared with the server''s quote; talents_closed while the switch is off; pre-EA Security list S-9 and S-11');

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) CLOSED: with the switch off the section is null and every verb refuses talents_closed, nothing written.
-- (b) THE PATH: with the switch on (inside the probe) a Level 6 hero spends the first stone off the Great Hearth; a stone past an unowned
--     one is not_reachable; a crossroads with a made-up pick bad_pick; a vow under Level 30 vow_level; past the points no_points; an
--     unknown node unknown_node; a town pick whose move has no opening Level (planted) not_offered; each refused spend writes nothing.
--     The same key answers the same receipt and spends nothing.
-- (c) THE TWIN: hr_talent_spend_problem agrees with the generated catalogue's suggested order at every step (each legal at its Level).
-- (d) SPEND AS SUGGESTED: a Level 40 hero's every point is spent, along the order for its discipline, never a vow; the log has one row.
-- (e) SAVED BUILDS: a whole build saves for a hunt of the catalogue; a floating node is not_reachable, a town pick that lends nothing
--     not_offered, an unknown hunt unknown_hunt; null deletes it; the section lists it.
-- (f) THE RESET MOVES THE POINTS: the first reset is free and clears the build (log 'reset' with the points back); the section reads 0 spent.
-- (g) GRANTS: the four verbs are the signed-in client's and in the baseline, the internals no client's, the section is the view;
--     grant hygiene is quiet.
do $chk$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-0000001c0064';
  v jsonb; v_role text; v_n int; s record; v_b jsonb := '{}'::jsonb; v_disc text;
  v_live constant boolean := (select live from public.hr_talent_rules where id);
begin
  -- (a) closed: the catalogue as generated (live false while the sample is dark)
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'roads-sample §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    -- this probe spends by hand: on a chain that already holds 1069-talent-standing-rule.sql (an operator's second apply) its standing
    -- rule would spend each Level's points by itself, so the probe hero's setting is off (the column is absent on the first apply; plpgsql
    -- resolves a statement's columns when it first runs, so the branch not taken there never reads it)
    if exists (select 1 from pg_attribute where attrelid = 'public.player_state'::regclass and attname = 'talent_auto' and not attisdropped) then
      update public.player_state set talent_auto = null where user_id = v_u and slot = 0;
    end if;
    update public.hr_talent_rules set live = false where id;
    if public.hr_state_of(v_u, 0) ? 'talents' and public.hr_state_of(v_u, 0)->'talents' <> 'null'::jsonb then
      raise exception 'VERIFY(a): the closed section is %', public.hr_state_of(v_u, 0)->'talents'; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    if public.hr_talent_spend(0, 'challenge.r1', null, '000000c0-0000-4000-a000-0000001c6401')->>'error' is distinct from 'talents_closed'
       or public.hr_talent_spend_suggested(0, 'party', '000000c0-0000-4000-a000-0000001c6402')->>'error' is distinct from 'talents_closed'
       or public.hr_talent_build_save(0, (select hunt_id from public.hr_hunt_grounds order by hunt_id limit 1), '{}'::jsonb, '000000c0-0000-4000-a000-0000001c6403')->>'error' is distinct from 'talents_closed'
       or public.hr_talent_reset(0, 0, '000000c0-0000-4000-a000-0000001c6404')->>'error' is distinct from 'talents_closed'
       or exists (select 1 from public.hero_talents where user_id = v_u) or exists (select 1 from public.hero_talent_log where user_id = v_u) then
      raise exception 'VERIFY(a): a closed verb answered or wrote'; end if;
    -- (b) the path, with the switch on inside the probe
    update public.hr_talent_rules set live = true where id;
    update public.player_state set level_xp = public.hr_char_xp_for_level(6) where user_id = v_u and slot = 0;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_talent_spend(0, 'challenge.r2', null, '000000c0-0000-4000-a000-0000001c6410');
    if v->>'error' is distinct from 'not_reachable' then raise exception 'VERIFY(b): a stone past an unowned one answered %', v; end if;
    v := public.hr_talent_spend(0, 'no.such', null, '000000c0-0000-4000-a000-0000001c6411');
    if v->>'error' is distinct from 'unknown_node' then raise exception 'VERIFY(b): an unknown node answered %', v; end if;
    v := public.hr_talent_spend(0, 'challenge.r1', null, '000000c0-0000-4000-a000-0000001c6412');
    if coalesce(v->>'ok', '') <> 'true' or (v->'talents'->>'spent')::int <> 1 or v->'talents'->'nodes' <> '{"challenge.r1": true}'::jsonb then
      raise exception 'VERIFY(b): the first stone answered %', v; end if;
    v := public.hr_talent_spend(0, 'challenge.r1', null, '000000c0-0000-4000-a000-0000001c6412');
    if (select spent from public.hero_talents where user_id = v_u) <> 1 or (select count(*) from public.hero_talent_log where user_id = v_u) <> 1 then
      raise exception 'VERIFY(b): a replayed key spent again'; end if;
    v := public.hr_talent_spend(0, 'challenge.r1', null, '000000c0-0000-4000-a000-0000001c6413');
    if v->>'error' is distinct from 'owned' then raise exception 'VERIFY(b): a stone bought twice answered %', v; end if;
    perform public.hr_talent_spend(0, 'challenge.r2', null, '000000c0-0000-4000-a000-0000001c6414');
    perform public.hr_talent_spend(0, 'challenge.r3', null, '000000c0-0000-4000-a000-0000001c6415');
    v := public.hr_talent_spend(0, 'challenge.x1', 'no_such', '000000c0-0000-4000-a000-0000001c6416');
    if v->>'error' is distinct from 'bad_pick' then raise exception 'VERIFY(b): a made-up pick answered %', v; end if;
    v := public.hr_talent_spend(0, 'challenge.x1', 'long_hold', '000000c0-0000-4000-a000-0000001c6417');
    if coalesce(v->>'ok', '') <> 'true' or v->'talents'->'nodes'->>'challenge.x1' <> 'long_hold' then raise exception 'VERIFY(b): crossroads I answered %', v; end if;
    v := public.hr_talent_spend(0, 'vow.last_stand', null, '000000c0-0000-4000-a000-0000001c6418');
    if v->>'error' is distinct from 'vow_level' then raise exception 'VERIFY(b): a vow at Level 6 answered %', v; end if;
    perform public.hr_talent_spend(0, 'challenge.w1', null, '000000c0-0000-4000-a000-0000001c6419');
    v := public.hr_talent_spend(0, 'challenge.r4', null, '000000c0-0000-4000-a000-0000001c641a');
    if v->>'error' is distinct from 'no_points' or (select spent from public.hero_talents where user_id = v_u) <> 5 then
      raise exception 'VERIFY(b): a sixth point at Level 6 answered %', v; end if;
    -- a town pick that lends nothing (planted: Shelter's opening Level taken away, as gen-talents writes an unmeasured move) is refused
    -- not_offered and writes nothing; it is asked before the points, so the hero's full purse does not hide it
    update public.hr_talent_options set opens_at = null where node_id = 'border.shield_restoration.town' and option_id = 'use_shelter';
    v := public.hr_talent_spend(0, 'border.shield_restoration.town', 'use_shelter', '000000c0-0000-4000-a000-0000001c641b');
    if v->>'error' is distinct from 'not_offered' or (select spent from public.hero_talents where user_id = v_u) <> 5
       or (select count(*) from public.hero_talent_log where user_id = v_u) <> 5 then
      raise exception 'VERIFY(b): a town pick that lends nothing answered %', v; end if;
    -- (c) the twin agrees with the generated order, every step legal at the Level that holds its points
    for v_disc in select distinct discipline from public.hr_talent_suggest loop
      v_b := '{}'::jsonb; v_n := 0;
      for s in select node_id, pick from public.hr_talent_suggest where discipline = v_disc and plan = 'party' order by seq loop
        v_n := v_n + 1;
        if public.hr_talent_spend_problem(v_b, s.node_id, s.pick, v_n + 1) is not null then
          raise exception 'VERIFY(c): % step % (%): %', v_disc, v_n, s.node_id, public.hr_talent_spend_problem(v_b, s.node_id, s.pick, v_n + 1); end if;
        v_b := v_b || jsonb_build_object(s.node_id, case when s.pick is null then 'true'::jsonb else to_jsonb(s.pick) end);
      end loop;
    end loop;
    -- (d) spend as suggested at Level 40
    delete from public.hero_talents where user_id = v_u;
    update public.player_state set level_xp = public.hr_char_xp_for_level(40) where user_id = v_u and slot = 0;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_talent_spend_suggested(0, 'party', '000000c0-0000-4000-a000-0000001c6420');
    if coalesce(v->>'ok', '') <> 'true' then
      if v->>'error' = 'no_weapon' then raise notice 'roads-sample §4 (d): the start kit names no discipline; the walk is checked by (c)';
      else raise exception 'VERIFY(d): spend as suggested answered %', v; end if;
    elsif (v->'talents'->>'spent')::int <> public.hr_talent_points(40)
       or exists (select 1 from jsonb_object_keys(v->'talents'->'nodes') k join public.hr_talent_nodes x on x.id = k where x.kind = 'vow')
       or (select count(*) from public.hero_talent_log where user_id = v_u and verb = 'suggested') <> 1 then
      raise exception 'VERIFY(d): the suggested walk left %', v->'talents'; end if;
    -- (e) saved builds
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_talent_build_save(0, (select hunt_id from public.hr_hunt_grounds order by hunt_id limit 1),
                                     '{"challenge.r1": true, "challenge.r2": true, "challenge.r3": true, "challenge.x1": "hard_challenge"}'::jsonb,
                                     '000000c0-0000-4000-a000-0000001c6430');
    if coalesce(v->>'ok', '') <> 'true' or jsonb_typeof(v->'talents'->'builds') <> 'object'
       or (select count(*) from public.hero_talent_builds where user_id = v_u) <> 1 then raise exception 'VERIFY(e): a whole build answered %', v; end if;
    v := public.hr_talent_build_save(0, (select hunt_id from public.hr_hunt_grounds order by hunt_id limit 1), '{"shelter.x2": "long_shelter"}'::jsonb,
                                     '000000c0-0000-4000-a000-0000001c6431');
    if v->>'error' is distinct from 'not_reachable' then raise exception 'VERIFY(e): a floating node answered %', v; end if;
    v := public.hr_talent_build_save(0, (select hunt_id from public.hr_hunt_grounds order by hunt_id limit 1),
                                     '{"challenge.r1": true, "challenge.r2": true, "challenge.r3": true, "challenge.x1": "long_hold", "border.shield_restoration.town": "use_shelter"}'::jsonb,
                                     '000000c0-0000-4000-a000-0000001c6434');
    if v->>'error' is distinct from 'not_offered' then raise exception 'VERIFY(e): a saved town pick that lends nothing answered %', v; end if;
    v := public.hr_talent_build_save(0, 'no_such_hunt', '{}'::jsonb, '000000c0-0000-4000-a000-0000001c6432');
    if v->>'error' is distinct from 'unknown_hunt' then raise exception 'VERIFY(e): an unknown hunt answered %', v; end if;
    v := public.hr_talent_build_save(0, (select hunt_id from public.hr_hunt_grounds order by hunt_id limit 1), null, '000000c0-0000-4000-a000-0000001c6433');
    if coalesce(v->>'ok', '') <> 'true' or exists (select 1 from public.hero_talent_builds where user_id = v_u) then raise exception 'VERIFY(e): a delete answered %', v; end if;
    -- (f) the reset moves the points
    insert into public.hero_talents as t (user_id, slot, nodes, spent) values (v_u, 0, '{"challenge.r1": true, "challenge.r2": true}'::jsonb, 2)
      on conflict (user_id, slot) do update set nodes = excluded.nodes, spent = excluded.spent;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_talent_reset(0, 0, '000000c0-0000-4000-a000-0000001c6440');
    if coalesce(v->>'ok', '') <> 'true' or v->>'free' is distinct from 'first' or exists (select 1 from public.hero_talents where user_id = v_u)
       or (v->'talents'->>'spent')::int <> 0 or (select n from public.hero_talent_log where user_id = v_u and verb = 'reset') <> 2 then
      raise exception 'VERIFY(f): the first reset answered %', v; end if;
    raise exception using errcode = 'HR864', message = 'roads-sample §4 complete - rolling back';
  exception when sqlstate 'HR864' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or (select live from public.hr_talent_rules where id) is distinct from v_live then
    raise exception 'VERIFY(g): §4 LEAKED a probe row or the switch'; end if;
  -- (g) grants
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_talents_view(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_talent_spend_problem(jsonb,text,text,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_talent_build_problem(jsonb)', 'execute')
       or has_table_privilege(v_role, 'public.hero_talents', 'select,insert,update,delete')
       or has_table_privilege(v_role, 'public.hero_talent_log', 'select,insert,update,delete')
       or has_table_privilege(v_role, 'public.hero_talent_builds', 'select,insert,update,delete') then
      raise exception 'VERIFY(g): % reaches an internal or a table', v_role; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_talent_spend(integer,text,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_talent_spend(integer,text,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_talent_spend_suggested(integer,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_talent_build_save(integer,text,jsonb,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_talent_reset(integer,bigint,uuid)', 'execute')
     or (select count(*) from public.hr_client_rpc_baseline where grantee = 'authenticated'
          and proname in ('hr_talent_spend', 'hr_talent_spend_suggested', 'hr_talent_build_save', 'hr_talent_reset')) <> 4 then
    raise exception 'VERIFY(g): the four verbs are not exactly the signed-in client''s'; end if;
  if (select fn from public.hr_state_sections where key = 'talents') is distinct from 'hr_talents_view' then
    raise exception 'VERIFY(g): the talents section is not the view'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'roads-sample: the switch off closes every verb; the path, the twin, the suggested walk, saved builds and the reset hold; all green';
end $chk$;
