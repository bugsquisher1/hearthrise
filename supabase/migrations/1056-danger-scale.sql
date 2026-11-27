-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1056-danger-scale.sql — THE DANGER SCALE ON THE SERVER: the stance a plan names, frozen with its start step on
--   the hunt's instance, re-proved and bounded at every settle (lane/v1-climb wave 1, backend-architect, 2026-11-22;
--   docs/design/redesign/02-architecture.md package 3 and section 11, 04-math-strategy.md sections 5 and 7, 05-roadmap.md stage 6 wave 1).
--
-- STATUS: supabase/migration-notes/1056-danger-scale.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): after 1054 (the world shape with the scale's fields) and 1055 (the scale's
--   catalogue, hr_danger_*), and after 1053-hunt-report.sql and 1053-lever-gates.sql, whose hr_hunt_apply_member and hr_hunt_instance_read
--   images it splices (§0 pins both), and it splices hr_hunt_apply_instance as the history left it (§0b pins it). Applied as ONE
--   transaction by the apply tool; never begin/commit here. Ends with its §6 self-check.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- The engine has played the scale since probe V1 (src/core/hunt/danger.js: one step, the climb and the fall back, pulls on readiness), but
-- only a plan in a test named a stance. A player's hunt reaches it only when the SERVER names the stance and the start step, freezes both
-- like the tier, and bounds what a window on the scale may pay. The client sends one intent (the stance) and renders the server's step.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- COLUMNS
--   hero_plans.risk        text | null   the plan's stance (hr_danger_stances), null = none: the hunt plays its tier (the tier path is unchanged)
--   hunt_instances.risk    text | null   the stance the instance FROZE at its first session (null = a tier hunt); never written again
--   hunt_instances.danger  int  | null   the step the hunt opened at (frozen with it)
--   hunt_instances.danger_top int | null the highest step the server has accepted from a stored world of this instance (hr_danger_bound)
--   hunt_sessions.risk_end / danger_end  the stance and step the hunt stood at as the session ended (a death settles the stance: the report)
--   hunt_density.danger_held int | null  the step this hero last held on this ground (stamped as each scale session ends)
-- VERB (client): hr_hunt_risk_set(p_slot int, p_risk text, p_idem uuid) -> { ok, risk, envelope } | { ok:false, error }
--   p_risk: a stance id, or 'none' (the plan names none). Errors: not_signed_in, bad_slot, bad_idem, bad_risk (no such stance: refused,
--   never clamped), rate_limited, not_leader (a party member that does not lead it: the leader's stance is the party's), no_character.
--   Keyed (hr_intent_replay), rate-gated ('hunt'), under the hero's hunt lock. Writes the caller's own hero_plans.risk only (never
--   updated_at: the plan's ground reads that clock). Mid-hunt it is allowed and plays from the NEXT hunt: the open hunt keeps what it froze.
-- FREEZE (trigger hr_danger_freeze, AFTER INSERT ON hunt_sessions, fires before hr_hunt_density_freeze by name, on the instance's first
--   session only: density is null then, and a party's restart nulls it again): the party leader's stance (a solo hero's own), only on a
--   ground of hr_danger_grounds (open hunting grounds only: tools/gen-danger.mjs refuses a yard, the Tower, a hall or a call); the start =
--   greatest(0, least over the heroes seated at the open (hunt_party_members, or the opener) of hunt_density.danger_held (0 for none)
--   - hr_danger_rules.start_margin). A stance the catalogue does not hold, or a ground without a row, freezes null: the tier path.
-- READ (hr_hunt_instance_read, spliced): every member's options carry risk and danger from the instance (null on a tier hunt), overlaid
--   last, so no stored option can name a stance (hr_action_set_options refuses an unknown key anyway: bad_option).
-- SETTLE (hr_hunt_apply_instance and hr_hunt_apply_member, spliced; hr_danger_of, hr_danger_prove, hr_danger_bound):
--   (a) the kill bound (each member): a ground on the scale presents at most pull_max a pocket, and a cleared pack stands again after respawn_ms;
--   (b) THE WINDOW'S WORLD is proved ONCE, by hr_hunt_apply_instance before any member lands (hr_danger_prove), against THIS window's
--       climb: the world the settle carries (the one it stores), never the one stored before it. Its stance is the frozen one or a safer
--       (rank never rises; a world off the scale on a frozen instance plays the tier and gets the tier's bounds), its step inside 0..step_max
--       and at most the window's climb over the highest step accepted before (danger_top: every stored world was proved by the settle that
--       stored it, so the window opened at or under it; a climb is clean_run CLEARED pulls, each followed by a regroup of regroup_ms:
--       climb_max x (window / (clean_run x regroup_ms) + 1), the window the INSTANCE's, never a member's own span); refused danger_risk /
--       danger_step / danger_climb (hr_reject: the whole commit rolls back, counted on the instance: the world is every seat's). A settle that
--       carries no world (every seat's hunt ended in it) proves no step and keeps the ceiling. (lane/danger-bound-fix, 2026-11-22: this file
--       first proved the stored world, the PREVIOUS window's, against the current window's climb, so a short window after a long honest
--       climb was refused and the last window's world was stored unproved.)
--   (c) the value bound follows the step (each member, hr_danger_bound, from what (b) proved: this settle's hr.danger_window, naming the
--       instance; a member without it is refused danger_unproved): XP a kill up to the row bound x (1 + powerStep)^(the highest step the
--       window can have stood at: the ceiling before it plus its climb) x the ground's share_pm_max, and a Level XP kill up to
--       hr_danger_level_xp_max at the hero's Level (and the two under it); coin a kill up to the row's x coin_pm_max. Each only ever WIDENS
--       the tier bound (greatest): honest play on the tier path is bounded as before.
-- END (trigger hr_danger_end_stamp, BEFORE UPDATE OF ended_at): a scale session's risk_end / danger_end from the stored world (a world
--   (b) proved when its settle stored it), and the hero's hunt_density.danger_held on that ground (one PK upsert a session end).
-- SECTION `danger` (hr_danger_view): { risk: the plan's stance | null, held: { hunt: step }, playing: null | { hunt, from (the frozen
--   stance), risk (the stance now), start, step, cool } }, every number the server's (the stored world, the frozen columns).
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- The verb takes the party row (FOR UPDATE) and the hero's hunt lock before it writes, as hr_hero_plan_set does, and is keyed: a replay
-- answers the first result. The freeze writes the instance row inside the session insert's transaction, guarded by density is null (the
-- first session's), so a party's second to fourth seats never re-freeze. The proof runs once a settle inside hr_hunt_apply_instance,
-- under the instance's lock (FOR UPDATE) and after its world-swing CAS (a replayed commit lands nothing), and raises danger_top only
-- upward; every member's bound then reads that one proof (hr.danger_window, transaction-local, set before the member loop and cleared
-- after it; a refusal's rollback restores it), so the members of one instance are bounded by the same window. The end stamp is a BEFORE
-- trigger on the row being ended: no second statement on it.
-- A second apply finds both spliced bodies at their post pins (§0) and every object restated as it stands: byte-identical (schema-drift).
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- ONE new client verb, writing one of the catalogue's words on the caller's own plan row; it moves no value. The stance can change a
-- hunt's pay only through the freeze (server-read, server-catalogue) and only from the next hunt: no mid-hunt lever exists, so no seed
-- horizon rule is needed (1052/1053's levers are unchanged). What a window on the scale may pay is bounded by the server's own numbers
-- (the frozen stance, the catalogue, the hero's Level from its own row); the step of every world the engine proposes is proved against the
-- step the server accepted before, before it is stored, so no unproved step reaches a held step or the next hunt's start. Farming by
-- breaking off (kill, fall back, re-kill) pays nothing twice: the engine keeps a broken-off pack's dead down until its normal respawn (src/core/hunt/pull-cycle.js fitPull, danger.js packDown; tests/hunt-core/danger.mjs `down`).
-- Nothing crosses to another player: no shared surface, no ranking, no trade.
--
-- ── COST (rows and bytes at 100x players) ────────────────────────────────────
-- No new table (three catalogue tables are 1055's). One plan column, three instance columns, two session columns, one density column.
-- A settle on the scale parses the world it carries once (~10-40 KB of JSON, ~0.1 ms, hr_danger_prove) and reads two catalogue rows, and
-- each member reads two more; it writes danger_top only when the step rises past the highest yet. A tier settle adds two PK reads of its
-- instance's risk (the proof, each member's hr_danger_of). A session end on the scale adds one PK upsert. The section adds one PK read,
-- one PK-prefix scan and, while hunting on the scale, one world parse an envelope. At 100x (~60k sessions a month) ~60k upserts a month, no growth beyond one int per hero-ground.
--
-- EDGE: the engine half (src/core/hunt/danger.js and its readers) rides the hr-accrue deployed after 1054. This file over the old engine is
--   safe: no world on the scale exists before an engine that opens one, and a frozen stance on the old engine (which reads options.risk
--   too since probe V1) plays V1's pay, bounded here. REVERSIBLE: drop the two triggers, the verb, the section row and its function, the
--   helpers; restate hr_hunt_instance_read, hr_hunt_apply_member and hr_hunt_apply_instance from their pre images (§0 pins them; this
--   file's lines are marked DANGER-SCALE); the columns may stay (null is the tier path).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- Each spliced body is the image this file was written against (the replayed chain on lane/v1-climb, set/v0.2.144) or this file's own
-- (a second apply): md5 of prosrc with carriage returns removed.
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regclass('public.hr_danger_rules') is null or to_regclass('public.hr_danger_stances') is null or to_regclass('public.hr_danger_grounds') is null
     or to_regprocedure('public.hr_danger_level_xp_max(integer)') is null then
    raise exception 'PRECONDITION: apply 1055-danger-scale-danger-catalogue.generated.sql first'; end if;
  if to_regclass('public.hero_plans') is null then raise exception 'PRECONDITION: apply 1051-company-start.sql first (hero_plans)'; end if;
  if not exists (select 1 from public.hr_hunt_world_shape w where w.id and w.fields->'world' ? 'danger' and w.fields->'world' ? 'risk') then
    raise exception 'PRECONDITION: apply 1054-danger-scale-hunt-sessions-catalogue.generated.sql first (the world shape)'; end if;
  for v_r in select * from (values
    ('public.hr_hunt_instance_read(uuid,integer)', '01b65ee3b44238d75fefb3aaedca260d', '3097347b88e3a5187f2f12cf0d7fbcae'),
    ('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', '309c695dc4dfc41d7cf0effe5f9b1dd1', 'bdf1e6f5d5bf7266b64b82b2b9f7e5c1')) t(fn, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(v_r.fn);
    if v_md5 is null then raise exception 'PIN: % is missing', v_r.fn; end if;
    -- A RETRY AFTER 1062-store-step.sql finds hr_hunt_apply_member at 1062's image (restated whole with this file's DANGER-SCALE lines
    -- in it, its store priced at the buyer's step): the splices below find their marker and move nothing. AFTER 1071-trait-pieces.sql,
    -- the instance read at 1071's image (restated whole with this file's DANGER-SCALE overlay in it, plus the worn pieces): the same.
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post
       and not (v_r.fn = 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)' and v_md5 = '209f8462d94db3fc386a12980342f2e8')
       and not (v_r.fn = 'public.hr_hunt_instance_read(uuid,integer)' and v_md5 in ('fc3028f121261dd3b7a15476c5164c40', '06fa5411752cbb0a3d481fe1e8420cfc')) then
      raise exception 'PIN: % is neither the image this file was written against (%) nor its own (%): md5 % - another file moved it; re-pin', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §0b THE SETTLE'S PIN (lane/danger-bound-fix): hr_hunt_apply_instance as the replayed chain holds it before this file (the applied
-- history's image: no staged file moves it), or this file's own (a second apply).
do $mig$
declare v_md5 text;
begin
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)');
  if v_md5 is null then raise exception 'PIN: hr_hunt_apply_instance is missing'; end if;
  -- (or, a retry after 1071-trait-pieces.sql, 1071's image: restated whole with this file's two splices in it, plus the land; its
  -- splices below find their marker and move nothing; or, after 1074-inner-flame-luck.sql, 1071's image with 1074's three splices)
  if v_md5 is distinct from '1b940aa14719f1ea5693a870799d93b6' and v_md5 is distinct from '3a6748518733987584b75e42e1d204d5'
     and v_md5 is distinct from '6c70ab34d2a622207521a56706d55dd3' and v_md5 is distinct from '41259ab36eac5e6c8fd60f8cc2aafa5e' then
    raise exception 'PIN: hr_hunt_apply_instance is neither the image this file was written against (1b940aa1...) nor its own (3a6748518733987584b75e42e1d204d5): md5 % - another file moved it; re-pin', v_md5;
  end if;
end $mig$;

-- ── §1 THE COLUMNS ───────────────────────────────────────────────────────────
alter table public.hero_plans add column if not exists risk text;
alter table public.hunt_instances add column if not exists risk text;
alter table public.hunt_instances add column if not exists danger int;
alter table public.hunt_instances add column if not exists danger_top int;
alter table public.hunt_sessions add column if not exists risk_end text;
alter table public.hunt_sessions add column if not exists danger_end int;
alter table public.hunt_density add column if not exists danger_held int;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'hero_plans_risk_ck' and conrelid = 'public.hero_plans'::regclass) then
    alter table public.hero_plans add constraint hero_plans_risk_ck check (risk is null or risk ~ '^[a-z0-9_]{1,64}$'); end if;
  if not exists (select 1 from pg_constraint where conname = 'hunt_instances_danger_ck' and conrelid = 'public.hunt_instances'::regclass) then
    alter table public.hunt_instances add constraint hunt_instances_danger_ck check ((risk is null and danger is null and danger_top is null)
      or (risk ~ '^[a-z0-9_]{1,64}$' and danger >= 0 and danger_top >= danger)); end if;
  if not exists (select 1 from pg_constraint where conname = 'hunt_sessions_danger_end_ck' and conrelid = 'public.hunt_sessions'::regclass) then
    alter table public.hunt_sessions add constraint hunt_sessions_danger_end_ck check ((risk_end is null) = (danger_end is null) and (danger_end is null or danger_end >= 0)); end if;
  if not exists (select 1 from pg_constraint where conname = 'hunt_density_danger_held_ck' and conrelid = 'public.hunt_density'::regclass) then
    alter table public.hunt_density add constraint hunt_density_danger_held_ck check (danger_held is null or danger_held >= 0); end if;
end $mig$;
comment on column public.hero_plans.risk is '1056-danger-scale.sql: the plan''s risk stance (hr_danger_stances), null = none (the tier path). Written only by hr_hunt_risk_set; read by hr_danger_freeze.';
comment on column public.hunt_instances.risk is '1056-danger-scale.sql: the stance this instance froze at its first session (hr_danger_freeze), null = a tier hunt. The engine reads it as options.risk (hr_hunt_instance_read).';
comment on column public.hunt_instances.danger is '1056-danger-scale.sql: the Danger step the hunt opened at (hr_danger_freeze), frozen with the stance.';
comment on column public.hunt_instances.danger_top is '1056-danger-scale.sql: the highest step the server has accepted from this instance''s stored world (hr_danger_bound); only rises.';
comment on column public.hunt_sessions.risk_end is '1056-danger-scale.sql: the stance the hunt stood at as this session ended (a death settles it safer), null off the scale.';
comment on column public.hunt_sessions.danger_end is '1056-danger-scale.sql: the Danger step the hunt stood at as this session ended, null off the scale.';
comment on column public.hunt_density.danger_held is '1056-danger-scale.sql: the Danger step this hero last held on this ground (hr_danger_end_stamp); the next hunt opens a margin under the party''s lowest.';

-- ── §2 THE HELPERS (internal) ───────────────────────────────────────────────
-- The scale's three world fields of a stored world, when it is of the catalogue's shape; null otherwise (a world of another shape
-- restarts in the engine: decodeStored).
create or replace function public.hr_danger_world(p_world text)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $fn$
declare v_w jsonb; v_s public.hr_hunt_world_shape%rowtype; v_f jsonb;
begin
  -- DANGER-SCALE (1056-danger-scale.sql)
  if p_world is null then return null; end if;
  begin v_w := p_world::jsonb; exception when others then return null; end;
  select * into v_s from public.hr_hunt_world_shape w where w.id;
  if not found or jsonb_typeof(v_w) <> 'object' or (v_w->>'v') is distinct from v_s.version::text or (v_w->>'s') is distinct from v_s.shape::text
     or jsonb_typeof(v_w->'w') <> 'array' then return null; end if;
  v_f := v_s.fields->'world';
  if not (v_f ? 'risk' and v_f ? 'danger' and v_f ? 'cool') then return null; end if;
  return jsonb_build_object('risk', v_w->'w'->>((v_f->>'risk')::int), 'step', v_w->'w'->((v_f->>'danger')::int), 'cool', v_w->'w'->((v_f->>'cool')::int));
end $fn$;

-- What a settle of instance p_instance plays the scale with (null off it): its pull ceiling and its respawn.
create or replace function public.hr_danger_of(p_instance uuid)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $fn$
declare v_risk text;
begin
  -- DANGER-SCALE (1056-danger-scale.sql)
  select i.risk into v_risk from public.hunt_instances i where i.id = p_instance;
  if v_risk is null then return null; end if;
  return (select jsonb_build_object('pull_max', r.pull_max, 'respawn_ms', r.respawn_ms) from public.hr_danger_rules r where r.id);
end $fn$;

-- THE WINDOW'S WORLD ON THE SCALE, PROVED (hr_hunt_apply_instance, ONCE a settle, under the instance's lock, before any member lands):
-- p_world is the world THIS settle carries (the one it stores; null when it carries none), p_window_ms THIS window (the instance's).
-- Raises (hr_reject) on a world the server cannot accept and raises danger_top to the step it accepts. Null when the instance froze no
-- stance (a tier hunt); { instance, tier: true } when the window's world plays the tier; else { instance, step, top, hi }: the step
-- proved, the ceiling after it, and the highest step any monster of this window can have stood at (what hr_danger_bound prices a kill at).
create or replace function public.hr_danger_prove(p_instance uuid, p_world text, p_window_ms bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_i  public.hunt_instances%rowtype;
  v_r  public.hr_danger_rules%rowtype;
  v_w  jsonb;
  v_step int; v_top int; v_climb int;
begin
  -- DANGER-SCALE (1056-danger-scale.sql; lane/danger-bound-fix: the world this window ends on, against this window's climb)
  select * into v_i from public.hunt_instances i where i.id = p_instance;
  if not found or v_i.risk is null then return null; end if;
  select * into v_r from public.hr_danger_rules r where r.id;
  if not found then perform public.hr_reject('catalogue_missing', jsonb_build_object('what', 'hr_danger_rules')); end if;
  if not exists (select 1 from public.hr_danger_grounds g where g.hunt_id = v_i.hunt_id) then
    perform public.hr_reject('catalogue_missing', jsonb_build_object('what', 'hr_danger_grounds', 'hunt', v_i.hunt_id)); end if;
  -- the highest step accepted before this window: every stored world was proved by the settle that stored it (the frozen start before
  -- the first), so the window opened at or under it
  v_top := coalesce(v_i.danger_top, v_i.danger, 0);
  -- THE MOST A WINDOW CAN CLIMB: a climb is clean_run CLEARED pulls (danger.js pullEnds), each followed by a regroup of at least regroup_ms
  -- (pull-cycle.js), so at most window / (clean_run x regroup_ms) + 1 climbs of at most climb_max steps (the first may use a run carried in)
  v_climb := v_r.climb_max * (greatest(p_window_ms, 0) / (v_r.clean_run * v_r.regroup_ms) + 1)::int;
  v_step := v_top;
  v_w := public.hr_danger_world(p_world);
  if v_w is not null then
    -- a world off the scale on a frozen instance (a scaled window, a restart) plays the tier: the tier's bounds
    if coalesce(v_w->>'risk', '') = '' then return jsonb_build_object('instance', p_instance, 'tier', true); end if;
    if not exists (select 1 from public.hr_danger_stances s join public.hr_danger_stances f on f.risk = v_i.risk
                    where s.risk = v_w->>'risk' and s.rank <= f.rank) then
      perform public.hr_reject('danger_risk', jsonb_build_object('frozen', v_i.risk, 'world', v_w->'risk')); end if;
    if jsonb_typeof(v_w->'step') <> 'number' or (v_w->>'step')::numeric <> floor((v_w->>'step')::numeric)
       or (v_w->>'step')::numeric < 0 or (v_w->>'step')::numeric > v_r.step_max then
      perform public.hr_reject('danger_step', jsonb_build_object('step', v_w->'step', 'max', v_r.step_max)); end if;
    v_step := (v_w->>'step')::int;
    if v_step > v_top + v_climb then
      perform public.hr_reject('danger_climb', jsonb_build_object('step', v_step, 'top', v_top, 'window_ms', p_window_ms, 'climb', v_climb)); end if;
    if v_step > v_top then
      update public.hunt_instances set danger_top = v_step where id = p_instance and coalesce(danger_top, -1) < v_step;
    end if;
  end if;
  -- the highest step any monster of this window can have stood at: the ceiling it opened under, climbed at most the window's climb
  return jsonb_build_object('instance', p_instance, 'step', v_step, 'top', greatest(v_top, v_step), 'hi', least(v_r.step_max, v_top + v_climb));
end $fn$;

-- THE BOUND OF A WINDOW ON THE SCALE (hr_hunt_apply_member, after hr_apply and the kill bound): what one kill of this window may pay THIS
-- member, from the window's world as hr_hunt_apply_instance proved it before any member landed (hr_danger_prove, read from this settle's
-- hr.danger_window, which must name this instance: anything else is refused danger_unproved). Null when the window's world plays the tier.
-- p_window_ms (the member's own span, shorter for a hero seated mid-window) is not read: the climb is the instance window's, proved once.
create or replace function public.hr_danger_bound(p_instance uuid, p_user uuid, p_slot int, p_window_ms bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_p  jsonb;
  v_r  public.hr_danger_rules%rowtype;
  v_g  public.hr_danger_grounds%rowtype;
  v_lv int; v_xp bigint;
begin
  -- DANGER-SCALE (1056-danger-scale.sql)
  begin v_p := nullif(current_setting('hr.danger_window', true), '')::jsonb; exception when others then v_p := null; end;
  if v_p is null or v_p->>'instance' is distinct from p_instance::text then
    perform public.hr_reject('danger_unproved', jsonb_build_object('instance', p_instance)); end if;
  if v_p ? 'tier' then return null; end if;
  select * into v_r from public.hr_danger_rules r where r.id;
  if not found then perform public.hr_reject('catalogue_missing', jsonb_build_object('what', 'hr_danger_rules')); end if;
  select g.* into v_g from public.hunt_instances i join public.hr_danger_grounds g on g.hunt_id = i.hunt_id where i.id = p_instance;
  if not found then perform public.hr_reject('catalogue_missing', jsonb_build_object('what', 'hr_danger_grounds', 'instance', p_instance)); end if;
  v_lv := public.hr_char_level((select ps.level_xp from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot));
  v_xp := greatest(public.hr_danger_level_xp_max(v_lv), public.hr_danger_level_xp_max(greatest(1, v_lv - 1)),
                   public.hr_danger_level_xp_max(greatest(1, v_lv - 2)));
  return jsonb_build_object('step', (v_p->>'step')::int, 'top', (v_p->>'top')::int,
    'hp_pm', ceil(1000 * power(1 + v_r.power_step_ppm / 1000000.0, (v_p->>'hi')::int) * v_g.share_pm_max / 1000.0),
    'coin_pm', v_g.coin_pm_max, 'level_xp_max', v_xp);
end $fn$;

revoke execute on function public.hr_danger_world(text) from public, anon, authenticated, service_role;
revoke execute on function public.hr_danger_of(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.hr_danger_prove(uuid, text, bigint) from public, anon, authenticated, service_role;
revoke execute on function public.hr_danger_bound(uuid, uuid, int, bigint) from public, anon, authenticated, service_role;

-- ── §3 THE VERB AND THE SECTION ──────────────────────────────────────────────
create or replace function public.hr_hunt_risk_set(p_slot int, p_risk text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare c_verb constant text := 'hunt_risk_set'; v_uid uuid := auth.uid(); v_r jsonb; v_party uuid; v_risk text;
begin
  -- DANGER-SCALE (1056-danger-scale.sql): the caller's plan's stance, refused never clamped; the leader's in a party; plays from the next hunt.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_risk is null or (p_risk <> 'none' and not exists (select 1 from public.hr_danger_stances s where s.risk = p_risk)) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_risk')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_party := public.hr_hunt_party_of(v_uid, p_slot);
  if v_party is not null then perform 1 from public.hunt_parties where id = v_party for update; end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- THE LEADER CHOOSES THE HUNT SETTINGS (Tyler 2026-10-20): in a party only the leader's stance is read by the freeze.
  if v_party is not null and not exists (select 1 from public.hunt_parties p where p.id = v_party and p.leader_user = v_uid and p.leader_slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_leader')); end if;
  v_risk := nullif(p_risk, 'none');
  -- (never updated_at: hr_hero_ground_of reads that clock for the plan's ground)
  insert into public.hero_plans as hp (user_id, slot, risk) values (v_uid, p_slot, v_risk)
    on conflict (user_id, slot) do update set risk = excluded.risk;
  update public.player_state set version = version + 1, updated_at = now() where user_id = v_uid and slot = p_slot;
  v_r := jsonb_build_object('ok', true, 'risk', v_risk);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r || jsonb_build_object('envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;
revoke execute on function public.hr_hunt_risk_set(int, text, uuid) from public;
revoke execute on function public.hr_hunt_risk_set(int, text, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_risk_set(int, text, uuid) to authenticated;
do $mig$
begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then revoke execute on function public.hr_hunt_risk_set(int, text, uuid) from hr_engine; end if;
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then revoke execute on function public.hr_hunt_risk_set(int, text, uuid) from hr_tick; end if;
end $mig$;

create or replace function public.hr_danger_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_i public.hunt_instances%rowtype; v_w jsonb; v_play jsonb;
begin
  -- DANGER-SCALE (1056-danger-scale.sql): the `danger` section. Every number the server's: the plan's stance, each ground's held step,
  -- and while hunting on the scale the frozen stance and start with the stored world's stance, step and cool-down.
  select i.* into v_i from public.hunt_sessions h join public.hunt_instances i on i.id = h.instance_id
   where h.user_id = p_user and h.slot = p_slot and h.ended_at is null limit 1;
  if found and v_i.risk is not null then
    v_w := public.hr_danger_world(v_i.world);
    v_play := jsonb_build_object('hunt', v_i.hunt_id, 'from', v_i.risk, 'start', v_i.danger,
      'risk', coalesce(nullif(v_w->>'risk', ''), v_i.risk),
      'step', coalesce(case when jsonb_typeof(v_w->'step') = 'number' then (v_w->>'step')::int end, v_i.danger),
      'cool', coalesce(case when jsonb_typeof(v_w->'cool') = 'number' then (v_w->>'cool')::int end, 0));
  end if;
  return jsonb_build_object(
    'risk', (select hp.risk from public.hero_plans hp where hp.user_id = p_user and hp.slot = p_slot),
    'held', coalesce((select jsonb_object_agg(d.hunt_id, d.danger_held order by d.hunt_id) from public.hunt_density d
                       where d.user_id = p_user and d.slot = p_slot and d.danger_held is not null), '{}'::jsonb),
    'playing', v_play);
end $fn$;
revoke execute on function public.hr_danger_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('danger', 'hr_danger_view', '1056-danger-scale.sql: this hero''s Danger scale, { risk: the plan''s stance | null, held: { <hunt_id>: step }, playing: null | { hunt, from, risk, start, step, cool } }')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_hunt_risk_set';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_hunt_risk_set', 'p_slot integer, p_risk text, p_idem uuid', 'authenticated',
   'added 1056-danger-scale.sql: the caller''s own plan stance, a catalogue word or none, refused not clamped; the party leader''s only in a party; plays from the next hunt; moves no value');

-- ── §4 THE FREEZE AND THE END STAMP ──────────────────────────────────────────
create or replace function public.hr_danger_freeze()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_i public.hunt_instances%rowtype; v_lu uuid; v_ls int; v_risk text; v_start int; v_margin int;
begin
  -- DANGER-SCALE (1056-danger-scale.sql): the instance's first session (density still null: hr_hunt_density_freeze fires after this one,
  -- by name) freezes the leader's stance and the start step; nothing writes them again until a restart nulls density.
  select * into v_i from public.hunt_instances where id = new.instance_id;
  if not found or v_i.density is not null then return null; end if;
  select p.leader_user, p.leader_slot into v_lu, v_ls from public.hunt_parties p where p.id = new.instance_id and p.closed_at is null;
  select hp.risk into v_risk from public.hero_plans hp where hp.user_id = coalesce(v_lu, new.user_id) and hp.slot = coalesce(v_ls, new.slot);
  if v_risk is null or not exists (select 1 from public.hr_danger_stances s where s.risk = v_risk)
     or not exists (select 1 from public.hr_danger_grounds g where g.hunt_id = v_i.hunt_id) then
    if v_i.risk is not null then update public.hunt_instances set risk = null, danger = null, danger_top = null where id = new.instance_id; end if;
    return null;
  end if;
  select r.start_margin into v_margin from public.hr_danger_rules r where r.id;
  select greatest(0, coalesce(min(coalesce(d.danger_held, 0)), 0) - coalesce(v_margin, 0)) into v_start
    from (select m.user_id, m.slot from public.hunt_party_members m where m.party_id = new.instance_id
          union select new.user_id, new.slot) s
    left join public.hunt_density d on d.user_id = s.user_id and d.slot = s.slot and d.hunt_id = v_i.hunt_id;
  update public.hunt_instances set risk = v_risk, danger = v_start, danger_top = v_start where id = new.instance_id;
  return null;
end $fn$;
revoke execute on function public.hr_danger_freeze() from public, anon, authenticated, service_role;
drop trigger if exists hr_danger_freeze on public.hunt_sessions;
create trigger hr_danger_freeze after insert on public.hunt_sessions for each row execute function public.hr_danger_freeze();

create or replace function public.hr_danger_end_stamp()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_i public.hunt_instances%rowtype; v_w jsonb; v_step int;
begin
  -- DANGER-SCALE (1056-danger-scale.sql): a session on the scale ends with the stance and step its hunt stood at, and the hero's held step there.
  select * into v_i from public.hunt_instances where id = new.instance_id;
  if not found or v_i.risk is null then return new; end if;
  v_w := public.hr_danger_world(v_i.world);
  v_step := coalesce(case when jsonb_typeof(v_w->'step') = 'number' then (v_w->>'step')::int end, v_i.danger, 0);
  new.risk_end := coalesce(nullif(v_w->>'risk', ''), v_i.risk);
  new.danger_end := greatest(0, v_step);
  insert into public.hunt_density as d (user_id, slot, hunt_id, density, danger_held, updated_at)
    values (new.user_id, new.slot, v_i.hunt_id, 0, greatest(0, v_step), now())
    on conflict (user_id, slot, hunt_id) do update set danger_held = excluded.danger_held;
  return new;
end $fn$;
revoke execute on function public.hr_danger_end_stamp() from public, anon, authenticated, service_role;
drop trigger if exists hr_danger_end_stamp on public.hunt_sessions;
create trigger hr_danger_end_stamp before update of ended_at on public.hunt_sessions for each row
  when (old.ended_at is null and new.ended_at is not null) execute function public.hr_danger_end_stamp();
do $mig$
begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke execute on function public.hr_danger_world(text) from hr_engine; revoke execute on function public.hr_danger_of(uuid) from hr_engine;
    revoke execute on function public.hr_danger_bound(uuid, uuid, int, bigint) from hr_engine; revoke execute on function public.hr_danger_view(uuid, int) from hr_engine;
    revoke execute on function public.hr_danger_freeze() from hr_engine; revoke execute on function public.hr_danger_end_stamp() from hr_engine;
    revoke execute on function public.hr_danger_prove(uuid, text, bigint) from hr_engine; end if;
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then
    revoke execute on function public.hr_danger_world(text) from hr_tick; revoke execute on function public.hr_danger_of(uuid) from hr_tick;
    revoke execute on function public.hr_danger_bound(uuid, uuid, int, bigint) from hr_tick; revoke execute on function public.hr_danger_view(uuid, int) from hr_tick;
    revoke execute on function public.hr_danger_freeze() from hr_tick; revoke execute on function public.hr_danger_end_stamp() from hr_tick;
    revoke execute on function public.hr_danger_prove(uuid, text, bigint) from hr_tick; end if;
end $mig$;

-- ── §5 THE SPLICES: hr_hunt_instance_read (one anchor), hr_hunt_apply_member (three anchors) and hr_hunt_apply_instance (two) ─────────
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_instance_read(uuid,integer)'::regprocedure), chr(13), '');
  if strpos(v_def, 'DANGER-SCALE') = 0 then
    v_old := $a$jsonb_build_object('density', v_i.density, 'tier', coalesce(v_i.tier, 'normal'))) end,$a$;
    v_new := $a$jsonb_build_object('density', v_i.density, 'tier', coalesce(v_i.tier, 'normal'))
                                   -- DANGER-SCALE (1056-danger-scale.sql): the stance and start step the instance froze, null on a tier hunt (overlaid last)
                                   || jsonb_build_object('risk', v_i.risk, 'danger', v_i.danger)) end,$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_instance_read: DANGER-SCALE overlay anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;

  v_def := replace(pg_get_functiondef('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'DANGER-SCALE') = 0 then
    v_old := $a$  v_dmax bigint; v_pass bigint;$a$;
    v_new := $a$  v_dz jsonb;  -- DANGER-SCALE (1056-danger-scale.sql): the scale's bound inputs, null off it
  v_dmax bigint; v_pass bigint;$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_apply_member: DANGER-SCALE declare anchor matched % times (need 1): the body moved', v_n; end if;
    v_def := replace(v_def, v_old, v_new);
    v_old := $a$  v_pass := v_ground.spawns::bigint + v_ground.pockets::bigint * v_dmax;
$a$;
    v_new := $a$  v_pass := v_ground.spawns::bigint + v_ground.pockets::bigint * v_dmax;
  -- DANGER-SCALE (1056-danger-scale.sql): a hunt on the scale presents its step's pull (at most a full box a pocket), and a cleared pack
  -- stands again after the scale's short wait; null off the scale, and nothing moves.
  v_dz := public.hr_danger_of(p_instance);
  if v_dz is not null then
    v_pass := v_ground.spawns::bigint + v_ground.pockets::bigint * greatest(v_dmax, (v_dz->>'pull_max')::bigint);
    v_ground.respawn_ms := least(v_ground.respawn_ms, (v_dz->>'respawn_ms')::int);
  end if;
$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_apply_member: DANGER-SCALE pass anchor matched % times (need 1): the body moved', v_n; end if;
    v_def := replace(v_def, v_old, v_new);
    v_old := $a$  if jsonb_typeof(p_delta->'gold') = 'number' and (p_delta->>'gold')::numeric > v_kills * v_vb_gold * v_vb_h then
$a$;
    v_new := $a$  -- DANGER-SCALE (1056-danger-scale.sql): the stored world's stance and step re-proved (hr_danger_bound raises on one it cannot accept),
  -- and what one kill on the scale may pay: XP at the step's health, Level XP at the hero's own Level share, coin at the depth ratio.
  -- Each only widens the tier bound; a world that plays the tier keeps it.
  if v_dz is not null then
    v_dz := public.hr_danger_bound(p_instance, p_user, p_slot, v_win);
    if v_dz is not null then
      v_vb_gold := greatest(v_vb_gold, ceil(v_vb_gold * (v_dz->>'coin_pm')::numeric / 1000.0)::bigint);
      v_vb_xp := greatest(v_vb_xp, ceil(v_vb_xp * (v_dz->>'hp_pm')::numeric / 1000.0)::bigint, (v_dz->>'level_xp_max')::bigint);
    end if;
  end if;
  if jsonb_typeof(p_delta->'gold') = 'number' and (p_delta->>'gold')::numeric > v_kills * v_vb_gold * v_vb_h then
$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_apply_member: DANGER-SCALE bound anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;

  -- hr_hunt_apply_instance (two anchors, lane/danger-bound-fix): the window's world proved before the member loop, and the proof cleared after it
  v_def := replace(pg_get_functiondef('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)'::regprocedure), chr(13), '');
  if strpos(v_def, 'DANGER-SCALE') = 0 then
    v_old := $a$    update public.hunt_instances set scale_level = v_scale where id = p_instance and scale_level is distinct from v_scale;
$a$;
    v_new := $a$    update public.hunt_instances set scale_level = v_scale where id = p_instance and scale_level is distinct from v_scale;
    -- DANGER-SCALE (1056-danger-scale.sql): THE WINDOW'S WORLD ON THE SCALE, proved once before any member lands, against THIS window's
    --   climb (hr_danger_prove: the world this settle carries and stores, never the one stored before it; a refusal is the instance's);
    --   each member's value bound reads what it proved (hr_danger_bound). Null off the scale. This settle's only: cleared below, and a
    --   refusal's rollback restores what stood before.
    perform set_config('hr.danger_window', coalesce(public.hr_danger_prove(p_instance, v_world, v_win)::text, ''), true);
$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_apply_instance: DANGER-SCALE proof anchor matched % times (need 1): the body moved', v_n; end if;
    v_def := replace(v_def, v_old, v_new);
    v_old := $a$    perform set_config('hr.boss_plan', '', true);
    update public.hunt_instances
$a$;
    v_new := $a$    perform set_config('hr.boss_plan', '', true);
    perform set_config('hr.danger_window', '', true);  -- DANGER-SCALE (1056-danger-scale.sql): the proof was this settle's members' only
    update public.hunt_instances
$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_apply_instance: DANGER-SCALE clear anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u   constant uuid := '000000c0-0000-4000-a000-0000da000001';
  k     text := '000000c0-0000-4000-a000-0000';
  v      jsonb;
  v_iid  uuid;
  v_sid  uuid;
  v_read jsonb;
  v_def  text;
  v_p    jsonb;
  v_wj   jsonb;   -- (g) a world of the catalogue's shape, every field null; the probes set its stance and step
  v_ri   int := (select (w.fields->'world'->>'risk')::int from public.hr_hunt_world_shape w where w.id);
  v_di   int := (select (w.fields->'world'->>'danger')::int from public.hr_hunt_world_shape w where w.id);
  v_c10  int;     -- the most a 10 s window may climb (hr_danger_rules), and a 90 s one
  v_c90  int;
  v_s0   int;     -- the step the probe's hunt froze at, and one a long window climbs to
  v_up   int;
  c_ground constant text := (select g.hunt_id from public.hr_danger_grounds g order by g.hunt_id limit 1);
  c_plain  constant text := 'mosslight_glade';
begin
  -- (a) the grants: the verb is the only client door; every helper, trigger function and the section's reader is the server's
  if not has_function_privilege('authenticated', 'public.hr_hunt_risk_set(integer,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_hunt_risk_set(integer,text,uuid)', 'execute')
     or exists (select 1 from unnest(array['anon', 'authenticated']) g(r), unnest(array['public.hr_danger_world(text)', 'public.hr_danger_of(uuid)',
                  'public.hr_danger_prove(uuid,text,bigint)', 'public.hr_danger_bound(uuid,uuid,integer,bigint)', 'public.hr_danger_view(uuid,integer)',
                  'public.hr_danger_freeze()', 'public.hr_danger_end_stamp()']) f(fn) where has_function_privilege(g.r, f.fn, 'execute')) then
    raise exception 'VERIFY(a): a grant is wrong'; end if;
  if not exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_hunt_risk_set' and grantee = 'authenticated')
     or not exists (select 1 from public.hr_state_sections where key = 'danger' and fn = 'hr_danger_view') then
    raise exception 'VERIFY(a): the verb''s baseline row or the section is missing'; end if;
  -- (b) the splices landed once each
  v_def := replace(pg_get_functiondef('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure), chr(13), '');
  if (length(v_def) - length(replace(v_def, 'public.hr_danger_bound(p_instance, p_user, p_slot, v_win)', ''))) / length('public.hr_danger_bound(p_instance, p_user, p_slot, v_win)') <> 1
     or strpos(v_def, 'v_dz := public.hr_danger_of(p_instance);') = 0 then
    raise exception 'VERIFY(b): hr_hunt_apply_member does not read the scale''s bound once'; end if;
  if strpos(replace(pg_get_functiondef('public.hr_hunt_instance_read(uuid,integer)'::regprocedure), chr(13), ''), $a$jsonb_build_object('risk', v_i.risk, 'danger', v_i.danger)$a$) = 0 then
    raise exception 'VERIFY(b): hr_hunt_instance_read does not overlay the frozen stance'; end if;
  -- the settle proves the world it CARRIES (v_world, never v_i.world: the one stored before it) with its own window, once, before the first
  -- member lands, and clears the proof after the last
  v_def := replace(pg_get_functiondef('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)'::regprocedure), chr(13), '');
  if (length(v_def) - length(replace(v_def, 'hr_danger_prove(', ''))) / length('hr_danger_prove(') <> 1
     or strpos(v_def, 'public.hr_danger_prove(p_instance, v_world, v_win)') = 0
     or strpos(v_def, 'public.hr_danger_prove(p_instance, v_world, v_win)') > strpos(v_def, 'v_h := public.hr_hunt_apply_member(')
     or strpos(v_def, $a$perform set_config('hr.danger_window', '', true);$a$) < strpos(v_def, 'v_h := public.hr_hunt_apply_member(') then
    raise exception 'VERIFY(b): hr_hunt_apply_instance does not prove the window''s own world once before its members'; end if;
  if c_ground is null then raise exception 'VERIFY(b): no ground opens the scale'; end if;
  begin
    update public.hr_hunt_config set enabled = true where id;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Probe Danger') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'danger-scale §6 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null, level_xp = public.hr_char_xp_for_level(60) where user_id = v_u and slot = 0;
    -- (c) refused, never clamped, and nothing written
    v := public.hr_hunt_risk_set(0, 'reckless', (k || 'da000001')::uuid);
    if v->>'error' is distinct from 'bad_risk' then raise exception 'VERIFY(c): an unknown stance answered %', v; end if;
    v := public.hr_hunt_risk_set(0, null, (k || 'da000002')::uuid);
    if v->>'error' is distinct from 'bad_risk' then raise exception 'VERIFY(c): no stance answered %', v; end if;
    if exists (select 1 from public.hero_plans where user_id = v_u and risk is not null) then raise exception 'VERIFY(c): a refused stance wrote the plan'; end if;
    -- (d) the pick is the plan's and the section reads it back
    v := public.hr_hunt_risk_set(0, 'steady', (k || 'da000003')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v->'envelope'->'danger'->>'risk' is distinct from 'steady' then raise exception 'VERIFY(d): the pick answered %', v; end if;
    -- (e) THE FREEZE: a hero who held step 300 here opens at 300 - start_margin, the engine reads it, the section names it
    insert into public.hunt_density (user_id, slot, hunt_id, density, danger_held) values (v_u, 0, c_ground, 0, 300)
      on conflict (user_id, slot, hunt_id) do update set danger_held = 300;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_enter(0, c_ground, '[]'::jsonb, 0, null, (k || 'da000004')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(e): entering answered %', v; end if;
    select h.id, h.instance_id into v_sid, v_iid from public.hunt_sessions h where h.user_id = v_u and h.slot = 0 and h.ended_at is null;
    if (select risk from public.hunt_instances where id = v_iid) is distinct from 'steady'
       or (select danger from public.hunt_instances where id = v_iid) is distinct from 300 - (select start_margin from public.hr_danger_rules where id) then
      raise exception 'VERIFY(e): the instance froze % at %', (select risk from public.hunt_instances where id = v_iid), (select danger from public.hunt_instances where id = v_iid); end if;
    v_read := public.hr_hunt_instance_read(v_u, 0);
    if v_read->'members'->0->'session'->'options'->>'risk' is distinct from 'steady'
       or (v_read->'members'->0->'session'->'options'->>'danger')::int is distinct from 300 - (select start_margin from public.hr_danger_rules where id) then
      raise exception 'VERIFY(e): the engine reads options %', v_read->'members'->0->'session'->'options'; end if;
    if public.hr_state_of(v_u, 0)->'danger'->'playing'->>'from' is distinct from 'steady' then
      raise exception 'VERIFY(e): the section reads %', public.hr_state_of(v_u, 0)->'danger'; end if;
    -- (f) a pick mid-hunt moves the plan, never the frozen instance
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_risk_set(0, 'bold', (k || 'da000005')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (select risk from public.hunt_instances where id = v_iid) is distinct from 'steady' then
      raise exception 'VERIFY(f): a pick mid-hunt answered % and the instance plays %', v, (select risk from public.hunt_instances where id = v_iid); end if;
    -- (g) THE PROOF (hr_danger_prove): the world a window ENDS on, against THAT window's climb over the highest step accepted before it.
    --     A world bolder than the frozen stance, or climbed past its window, is refused; an honest one raises the ceiling; the next
    --     window is held to ITS OWN climb over that ceiling (lane/danger-bound-fix: a short window after a long climb lands).
    select r.climb_max * (10000 / (r.clean_run * r.regroup_ms) + 1), r.climb_max * (90000 / (r.clean_run * r.regroup_ms) + 1)
      into v_c10, v_c90 from public.hr_danger_rules r where r.id;
    v_wj := jsonb_build_object('v', (select version from public.hr_hunt_world_shape where id), 's', (select shape from public.hr_hunt_world_shape where id),
      'w', (select jsonb_agg('null'::jsonb) from generate_series(0, (select count(*) from jsonb_object_keys((select fields->'world' from public.hr_hunt_world_shape where id)))::int - 1)),
      'u', '[]'::jsonb, 'p', '[]'::jsonb);
    -- the frozen start (e), and a step 120 over it: past a 10 s window's climb, inside a 90 s one's
    v_s0 := (select danger from public.hunt_instances where id = v_iid);
    v_up := v_s0 + 120;
    if v_s0 + v_c90 < v_up or v_s0 + v_c10 >= v_up or v_up + v_c10 + 1 > (select step_max from public.hr_danger_rules where id) then
      raise exception 'VERIFY(g): the catalogue''s climb (% / %) no longer fits these probes', v_c10, v_c90; end if;
    begin
      perform public.hr_danger_prove(v_iid, jsonb_set(jsonb_set(v_wj, array['w', v_ri::text], '"bold"'), array['w', v_di::text], to_jsonb(v_s0))::text, 10000);
      raise exception 'VERIFY(g): a bolder world than the frozen stance was accepted';
    exception when others then
      if sqlerrm not like '%danger_risk%' then raise exception 'VERIFY(g): a bolder world answered %', sqlerrm; end if;
    end;
    v_wj := jsonb_set(v_wj, array['w', v_ri::text], '"careful"');
    v_p := public.hr_danger_prove(v_iid, jsonb_set(v_wj, array['w', v_di::text], to_jsonb(v_s0))::text, 10000);
    if (v_p->>'step')::int <> v_s0 or (v_p->>'hi')::int <> v_s0 + v_c10 or v_p->>'instance' is distinct from v_iid::text then
      raise exception 'VERIFY(g): a safer honest world proved %', v_p; end if;
    -- each member's bound reads THIS instance's proof, and refuses without one
    perform set_config('hr.danger_window', '', true);
    begin
      perform public.hr_danger_bound(v_iid, v_u, 0, 10000);
      raise exception 'VERIFY(g): a member was bounded with no proof of the window';
    exception when others then
      if sqlerrm not like '%danger_unproved%' then raise exception 'VERIFY(g): a member with no proof answered %', sqlerrm; end if;
    end;
    perform set_config('hr.danger_window', (v_p || jsonb_build_object('instance', gen_random_uuid()))::text, true);
    begin
      perform public.hr_danger_bound(v_iid, v_u, 0, 10000);
      raise exception 'VERIFY(g): a member was bounded by another instance''s proof';
    exception when others then
      if sqlerrm not like '%danger_unproved%' then raise exception 'VERIFY(g): another instance''s proof answered %', sqlerrm; end if;
    end;
    perform set_config('hr.danger_window', v_p::text, true);
    v := public.hr_danger_bound(v_iid, v_u, 0, 10000);
    if (v->>'step')::int <> v_s0 or (v->>'level_xp_max')::bigint < public.hr_danger_level_xp_max(60)
       or (v->>'hp_pm')::numeric <> (select ceil(1000 * power(1 + r.power_step_ppm / 1000000.0, v_s0 + v_c10) * g.share_pm_max / 1000.0)
                                      from public.hr_danger_rules r, public.hr_danger_grounds g where r.id and g.hunt_id = c_ground) then
      raise exception 'VERIFY(g): the member''s bound read % from the proof %', v, v_p; end if;
    perform set_config('hr.danger_window', '', true);
    begin
      perform public.hr_danger_prove(v_iid, jsonb_set(v_wj, array['w', v_di::text], to_jsonb(v_up))::text, 10000);
      raise exception 'VERIFY(g): a climb of 120 steps in a 10 s window was accepted';
    exception when others then
      if sqlerrm not like '%danger_climb%' then raise exception 'VERIFY(g): a forged climb answered %', sqlerrm; end if;
    end;
    v_p := public.hr_danger_prove(v_iid, jsonb_set(v_wj, array['w', v_di::text], to_jsonb(v_up))::text, 90000);
    if (select danger_top from public.hunt_instances where id = v_iid) <> v_up then raise exception 'VERIFY(g): the accepted climb left the ceiling at %', (select danger_top from public.hunt_instances where id = v_iid); end if;
    -- THE NEXT WINDOW, SHORT: held to its own climb over the ceiling the long one set (one step past it refused, at it accepted)
    begin
      perform public.hr_danger_prove(v_iid, jsonb_set(v_wj, array['w', v_di::text], to_jsonb(v_up + v_c10 + 1))::text, 10000);
      raise exception 'VERIFY(g): a 10 s window after the long one climbed % steps', v_c10 + 1;
    exception when others then
      if sqlerrm not like '%danger_climb%' then raise exception 'VERIFY(g): a short window past its climb answered %', sqlerrm; end if;
    end;
    v_p := public.hr_danger_prove(v_iid, jsonb_set(v_wj, array['w', v_di::text], to_jsonb(v_up + v_c10))::text, 10000);
    if (v_p->>'step')::int <> v_up + v_c10 or (select danger_top from public.hunt_instances where id = v_iid) <> v_up + v_c10 then
      raise exception 'VERIFY(g): a short window after the long one proved % (ceiling %)', v_p, (select danger_top from public.hunt_instances where id = v_iid); end if;
    -- a settle that carries no world proves no step and keeps the ceiling; a world off the scale plays the tier
    v_p := public.hr_danger_prove(v_iid, null, 10000);
    if (v_p->>'step')::int <> v_up + v_c10 or (v_p->>'hi')::int <> v_up + 2 * v_c10 or (select danger_top from public.hunt_instances where id = v_iid) <> v_up + v_c10 then
      raise exception 'VERIFY(g): a settle with no world proved %', v_p; end if;
    v_p := public.hr_danger_prove(v_iid, jsonb_set(v_wj, array['w', v_ri::text], 'null')::text, 10000);
    perform set_config('hr.danger_window', v_p::text, true);
    if v_p->>'tier' is distinct from 'true' or public.hr_danger_bound(v_iid, v_u, 0, 10000) is not null then
      raise exception 'VERIFY(g): a world off the scale proved %', v_p; end if;
    perform set_config('hr.danger_window', '', true);
    -- (h) THE END STAMP: the session ends with the stored world's stance and step (the world its settle proved), and the hero's held step
    --     there is the hunt's last
    update public.hunt_instances set world = jsonb_set(v_wj, array['w', v_di::text], to_jsonb(v_up + v_c10))::text where id = v_iid;
    perform public.hr_hunt_close(v_sid, 'left', now(), true);
    if (select risk_end from public.hunt_sessions where id = v_sid) is distinct from 'careful' or (select danger_end from public.hunt_sessions where id = v_sid) is distinct from v_up + v_c10
       or (select danger_held from public.hunt_density where user_id = v_u and slot = 0 and hunt_id = c_ground) is distinct from v_up + v_c10 then
      raise exception 'VERIFY(h): the end stamped %/% and held %', (select risk_end from public.hunt_sessions where id = v_sid), (select danger_end from public.hunt_sessions where id = v_sid),
        (select danger_held from public.hunt_density where user_id = v_u and slot = 0 and hunt_id = c_ground); end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    -- (i) a ground the scale does not open plays the tier: nothing frozen, the engine reads no stance
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_enter(0, c_plain, '[]'::jsonb, 0, null, (k || 'da000006')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(i): entering the plain ground answered %', v; end if;
    select h.instance_id into v_iid from public.hunt_sessions h where h.user_id = v_u and h.slot = 0 and h.ended_at is null;
    if (select risk from public.hunt_instances where id = v_iid) is not null
       or public.hr_hunt_instance_read(v_u, 0)->'members'->0->'session'->'options'->'risk' is distinct from 'null'::jsonb then
      raise exception 'VERIFY(i): a ground off the scale froze % (options %)', (select risk from public.hunt_instances where id = v_iid),
        public.hr_hunt_instance_read(v_u, 0)->'members'->0->'session'->'options'; end if;
    raise exception using errcode = 'HR897', message = 'danger-scale §6 complete - rolling back';
  exception when sqlstate 'HR897' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.hero_plans where user_id = v_u) or exists (select 1 from public.player_state where user_id = v_u) then
    raise exception 'VERIFY(i): §6 LEAKED a probe row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'danger-scale: the stance is refused not clamped, frozen with its start a margin under the held step, read by the engine and the section, each window''s own world proved against its own climb at the settle and every member bounded by that proof, stamped at the end; all green';
end $$;
