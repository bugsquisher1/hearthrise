-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-22-target-kind.sql — THE FIRST TARGET, PER HERO AND GROUND (the Krell's Hold design's engine piece 4, its server half)
--   (lane/c-target-kind, backend-architect, 2026-11-14). STAGED: tools/apply-migration.mjs, one file, never inside begin/commit.
--   Pre-EA (CLAUDE.md §2): applies on its passing §5. On the EA Security list: a new client verb and the engine's read restated.
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- The engine already plays a hero's KIND FIRST (lane/b-barrow-monster-kinds, src/core/hunt/targeting.js kindOf): a hero whose
-- options carry `target_kind` (a MONSTERS id; src/core/hunt-spawn.js heroSetup kindPick) takes every engaged monster of that kind
-- before any other, under any Target mode. Nothing stored or served it, so no hero could name the Pyre Priest that mends his pull,
-- Captain Hask's adds, or a mender anywhere. The design: "Target set to take them first", REMEMBERED PER GROUND, so it is set once.
-- Per ground and not per setup, on purpose: a kind means something on one ground only (a Pyre Priest is no Cellar monster), so a
-- setup-wide kind would follow a hero to grounds it names nothing on. hunt_density is already the hero's per-ground row (its tier,
-- its last setup), so the pick is one more column there.
--
-- ── THE CONTRACT ───────────────────────────────────────────────────────────
-- hunt_density.target_kind  text NULL  NEW. The kind this hero takes first on this ground; NULL = none (the Target order alone).
--   Written ONLY by hr_hunt_target_kind_set. No foreign key: the hunt-sessions catalogue deletes and rewrites hr_hunt_ground_spawns
--   (as hunt-tiers.sql said of hr_ground_tiers), and every READER below re-checks the kind against that catalogue instead, so a kind
--   a later catalogue moves off the ground reads as none everywhere, the engine included, and is never deleted for the player.
-- hr_hunt_target_kind_set(p_slot int, p_hunt text, p_kind text, p_idem uuid) -> jsonb   (authenticated; SECURITY DEFINER; VOLATILE)
--   The caller's own (auth.uid(), slot) row only; no uuid in the signature. Each hero picks its OWN, in a party too (Target is each
--   hero's own setting: the leader's pick is not everyone's, unlike the tier).
--   p_kind NULL or '' clears the pick. Otherwise it must be a monster the SERVER's catalogue says that ground can bring
--   (hr_hunt_ground_spawns: every monster a pull there can bring, its boss and its called wave included; generated from
--   src/data by tools/gen-hunt-sessions.mjs, so no copy of game data lives here). Refused, never clamped, nothing written:
--     not_signed_in · bad_slot (null, < 0, > 5) · bad_idem · rate_limited (hr_rpc_gate 'hunt', shared with the tier) ·
--     bad_hunt (no such ground in hr_hunt_grounds: a staged ground is in none) · bad_kind (not a monster of that ground) · no_character
--   OK: {ok: true, hunt, kind} (kind null when cleared). Journalled in player_intents under (user, p_idem): a replay answers the
--   stored result and writes nothing. In a hunt or out of one: the engine reads it afresh at the next settle (below), as it reads
--   the Target setting; nothing is frozen on the instance.
-- hr_hunt_target_kind_view(p_user, p_slot) -> {picks: {<hunt_id>: <monster_id>}}   (internal; the `hunt_target_kind` section)
--   Only kinds the ground's catalogue still holds; no key = none.
-- hr_hunt_instance_read RESTATED WHOLE (the 2027-03-22-live-events.sql image, which tests/patch-chain-guard.mjs counts two splices
--   deep: a third is refused, so this restates). One change: each member's session.options carries `target_kind` from its own
--   hunt_density row on the instance's ground when the catalogue holds that kind, and never carries one otherwise (any
--   options.target_kind is dropped first: hr_action_set_options refuses the key, bad_option, and this read does not trust that
--   alone). Every other line is byte for byte the image §0 pins.
--
-- ── CONCURRENCY / IDEMPOTENCY ──────────────────────────────────────────────
-- One row, one upsert on its primary key (user_id, slot, hunt_id): atomic, last write wins, which is the right answer for a
-- preference; no value moves, so there is nothing for a character lock to protect and none is taken (hr_hunt_tier_set's shape).
-- Two calls under one key: both may pass the replay read, both write the same value, the journal insert is on conflict do
-- nothing, both answer the same. A settle racing a pick reads the committed row: the window it is proposing plays the old kind,
-- the next one the new (at most one 10 s window, as for every bar setting). The engine never writes the row.
--
-- ── EXPLOIT SURFACE DELTA ──────────────────────────────────────────────────
-- A signed-in account can write ONE text column of its own per-ground row, to one of a server catalogue's monster ids or NULL.
-- It moves no gold, item, XP, drop or ranking: the engine only REORDERS which engaged monster a hero swings at, and every
-- settle bound (kills, XP, gold, drops: hr_hunt_apply_member) is unchanged and still caps the window whatever is targeted.
-- Nothing crosses to another player: another member's read carries only its own row. The engine re-validates the id twice
-- (this read's catalogue join, and heroSetup kindPick's MONSTERS check), so a forged or stale value can only fall back to the
-- Target order. Rate-gated, journalled, refusals noted (hr_note_rejection). GM wall: allowed (its own hero).
--
-- ── COST (rows and bytes at 100x players) ─────────────────────────────────
-- No new table. hunt_density gains one nullable short text (most rows NULL: 1 byte of null bitmap at most). Rows per hero stay
-- bounded by the open grounds (16 today). The section is one primary-key-prefix scan of those rows per envelope, plpgsql so its
-- plan is cached (tests/settle-budget.mjs SB-3). The instance read adds one primary-key probe of hunt_density and one of
-- hr_hunt_ground_spawns per member per settle. No journal row per tick: one player_intents row per pick.
--
-- EDGE: NONE. hr-accrue already reads options.target_kind (src/core/hunt-spawn.js heroSetup), and the viewed hunt's start point
--   carries the hero's settings (hunt-settle.js huntLive `hero`), so pack-edge --hash does not move. The world's shape does not move
--   (tkind is not persisted: combat-sim.js syncUnit writes it at every boundary).
-- CLIENT: the bar's First target pick (src/shell/widgets/first-target.js) calls the verb and reads the section; until it ships
--   nothing calls it. ORDER: after 2027-04-21-tally-tier7-names.generated.sql (the chain's tip); it restates hr_hunt_instance_read,
--   which no staged file touches, and creates the rest new. hr_hunt_settle_session is NOT touched.
-- REVERSIBLE: re-apply 2027-03-22-live-events.sql's hr_hunt_instance_read image (§0 pins it: 2027-02-27-hunt-tiers.sql's body with
--   the scaled-hunts and live-events splices); drop the verb, the view, the section row, the baseline row and the GM wall row;
--   `alter table public.hunt_density drop column target_kind`. No value moved to undo.
-- IDEMPOTENT: a second apply finds the column and its check, restates every body byte-identical, re-upserts the same rows, and §5
--   rolls back its probes.
-- WIPE: hunt_density is on the character wipe's list already (2027-02-25-character-wipe.sql); no new player table.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.hunt_density') is null or to_regclass('public.hr_hunt_grounds') is null
     or to_regclass('public.hr_hunt_ground_spawns') is null or to_regclass('public.hr_state_sections') is null
     or to_regclass('public.hr_client_rpc_baseline') is null or to_regclass('public.player_intents') is null then
    raise exception 'PRECONDITION: hunt_density, the hunt-sessions catalogue, hr_state_sections, hr_client_rpc_baseline and player_intents first'; end if;
  if to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null
     or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null
     or to_regprocedure('public.hr_hunt_member_read(public.hunt_sessions)') is null
     or to_regprocedure('public.hr_hunt_member_state(uuid,integer)') is null
     or to_regprocedure('public.hr_live_xp_windows(uuid,text,timestamp with time zone,timestamp with time zone)') is null
     or to_regprocedure('public.hr_scaled_hunt_of(uuid)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing (2027-03-21-scaled-hunts.sql, 2027-03-22-live-events.sql first)'; end if;
  -- THE PIN: hr_hunt_instance_read is restated below from the image the chain ends on today (2027-02-27-hunt-tiers.sql's body with
  -- 2027-03-21-scaled-hunts.sql's and 2027-03-22-live-events.sql's splices; replay and live agreed, live-hash-drift 2026-11-14).
  -- A body moved since must be re-read before this lands: refuse, never guess. Its own image (a second apply) passes.
  v_md5 := md5(regexp_replace(pg_get_functiondef('public.hr_hunt_instance_read(uuid,integer)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_md5 not in ('5081f20a0facc6f36375b8af8ac9f1c8', 'd0cb8c8ec3e038ff865ce81b05242d49') then
    raise exception 'PIN: hr_hunt_instance_read is neither the image this file restates (5081f20a0facc6f36375b8af8ac9f1c8) nor its own (d0cb8c8ec3e038ff865ce81b05242d49): md5 % - another file moved it', v_md5;
  end if;
end $mig$;

-- ── §1 THE COLUMN ────────────────────────────────────────────────────────────
alter table public.hunt_density add column if not exists target_kind text;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.hunt_density'::regclass and conname = 'hunt_density_target_kind_ck') then
    alter table public.hunt_density add constraint hunt_density_target_kind_ck check (target_kind is null or target_kind ~ '^[a-z0-9_]{1,64}$'); end if;
end $mig$;
comment on column public.hunt_density.target_kind is
  '2027-04-22-target-kind.sql: the monster kind this hero takes first on this ground (the First target), NULL = none. Written only by hr_hunt_target_kind_set; read, re-checked against hr_hunt_ground_spawns, by hr_hunt_instance_read and hr_hunt_target_kind_view.';

-- ── §2 THE VIEW AND THE INTENT ───────────────────────────────────────────────
create or replace function public.hr_hunt_target_kind_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
begin
  -- TARGET-KIND (2027-04-22-target-kind.sql): this hero's First target per ground, a kind that ground's catalogue still holds.
  return jsonb_build_object(
    'picks', coalesce((select jsonb_object_agg(d.hunt_id, d.target_kind order by d.hunt_id)
                         from public.hunt_density d
                         join public.hr_hunt_ground_spawns g on g.hunt_id = d.hunt_id and g.monster_id = d.target_kind
                        where d.user_id = p_user and d.slot = p_slot), '{}'::jsonb));
end $$;
revoke execute on function public.hr_hunt_target_kind_view(uuid, int) from public, anon, authenticated, service_role;

create or replace function public.hr_hunt_target_kind_set(p_slot int, p_hunt text, p_kind text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_target_kind_set';
  v_uid  uuid := auth.uid();
  v_kind text := nullif(p_kind, '');
  v_r    jsonb;
begin
  -- TARGET-KIND (2027-04-22-target-kind.sql): the caller's own First target on one ground, a kind that ground can bring or none; refused, never clamped.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_hunt is null or not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = p_hunt) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_hunt')); end if;
  -- THE SERVER'S KIND CATALOGUE: every monster a pull on this ground can bring (hr_hunt_ground_spawns, generated from src/data).
  if v_kind is not null and not exists (select 1 from public.hr_hunt_ground_spawns s where s.hunt_id = p_hunt and s.monster_id = v_kind) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_kind')); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if v_kind is null then
    -- none: the row (when there is one) keeps its tier and setup; a ground never picked needs no row to say so
    update public.hunt_density set target_kind = null, updated_at = now()
     where user_id = v_uid and slot = p_slot and hunt_id = p_hunt and target_kind is not null;
  else
    insert into public.hunt_density as d (user_id, slot, hunt_id, density, target_kind, updated_at)
      values (v_uid, p_slot, p_hunt, 0, v_kind, now())
      on conflict (user_id, slot, hunt_id) do update set target_kind = excluded.target_kind, updated_at = now();
  end if;
  v_r := jsonb_build_object('ok', true, 'hunt', p_hunt, 'kind', v_kind);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
revoke execute on function public.hr_hunt_target_kind_set(int, text, text, uuid) from public;
revoke execute on function public.hr_hunt_target_kind_set(int, text, text, uuid) from anon, service_role, hr_engine, hr_tick;
grant  execute on function public.hr_hunt_target_kind_set(int, text, text, uuid) to authenticated;

-- ── §3 THE ENGINE'S READ (restated whole: the §0 image plus the TARGET-KIND lateral) ─
create or replace function public.hr_hunt_instance_read(p_user uuid, p_slot integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $function$
declare
  v_role text;
  v_s    public.hunt_sessions%rowtype;
  v_i    public.hunt_instances%rowtype;
begin
  -- PARTY-LEADER (2026-11-01-party-leader-density.sql): each member says whether it leads the instance's party.
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): every member plays the density frozen on the instance
  -- (its options.density overlaid), the one the settle bounds count; NULL (opened before the freeze) = as stored.
  -- SETTLE-COST (2027-02-02-settle-cost.sql): each member's `state` is its ENGINE INPUTS (hr_hunt_member_state),
  -- never its whole envelope: the engine reads eleven fields of it, and nine envelopes a settle were its cost.
  -- HUNT-TIERS (2027-02-27-hunt-tiers.sql): every member plays the tier frozen on the instance too (options.tier), beside the pull it froze with it.
  -- TARGET-KIND (2027-04-22-target-kind.sql): RESTATED WHOLE (the two splices below folded in). Each member's options carry its own
  -- First target on this ground (options.target_kind, hunt-spawn.js heroSetup), read afresh every settle, never frozen.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role') then
    raise exception 'hr_hunt_instance_read: not callable by %', v_role using errcode = '42501';
  end if;
  if p_user is null or p_slot is null then return null; end if;
  select * into v_s from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null;
  if not found then return jsonb_build_object('open', false); end if;
  select * into v_i from public.hunt_instances i where i.id = v_s.instance_id;
  if not found then return jsonb_build_object('open', false); end if;
  return jsonb_build_object(
    'open', true,
    'instance', jsonb_build_object(
      'id', v_i.id, 'hunt', v_i.hunt_id, 'kind', v_i.kind, 'world', v_i.world, 'world_swing', v_i.world_swing,
      'density', v_i.density,
      'tier', v_i.tier,
      -- SCALED-HUNTS (2027-03-21-scaled-hunts.sql): the server's own scale of the next window (hr_scaled_hunt_of: { level, banked_ms,
      -- user, slot } of the leader, or null) and the Level the stored world was built on (the engine restarts a world built on another).
      'scale', public.hr_scaled_hunt_of(v_i.id), 'scale_level', v_i.scale_level,
      -- PARTY-HOLD (2026-12-08-party-hold.sql): the seat whose tank holds every lap (hunt_parties.hold_seat), null = take turns.
      'hold_seat', (select p.hold_seat from public.hunt_parties p where p.id = v_i.id and p.closed_at is null),
      -- DEPLOY-NO-FORFEIT (2026-12-11-hunt-deploy-no-forfeit.sql): the catalogue's world shape; an engine of another proposes nothing.
      'world_shape', (select jsonb_build_object('v', w.version, 's', w.shape) from public.hr_hunt_world_shape w where w.id),
      'settled_to_ms', ceil(extract(epoch from v_i.settled_to) * 1000)::bigint,
      'next_swing_at_ms', ceil(extract(epoch from v_i.next_swing_at) * 1000)::bigint,
      'enabled', coalesce((select c.enabled from public.hr_hunt_config c where c.id), false),
      -- THE INSTANCE'S KEYED SEED SECRET (hunt-seed.js): reachable by the engine only.
      'secret', public.hr_seed(null, 0, 'hunt:' || v_i.id::text)::text),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
                 'user', h.user_id, 'slot', h.slot, 'seat', h.seat, 'unit_id', h.unit_id,
                 -- LEAVE-TOGETHER (2026-12-18-party-leave-together.sql): the member's own box (combat-sim.js cascadeFrom).
                 'leave_together', (select ps.party_leave_together from public.player_state ps where ps.user_id = h.user_id and ps.slot = h.slot),
                 -- KICKED: still hunting in its party's instance but no longer seated in that party: only the leader's
                 -- hr_hunt_party_kick does that (Leave party and Disband refuse while hunting, the sweep skips
                 -- hunters). Its end sends nobody home (Coordinator ruling 2026-10-23).
                 'kicked', exists (select 1 from public.hunt_parties p where p.id = v_i.id)
                           and not exists (select 1 from public.hunt_party_members pm
                                            where pm.party_id = v_i.id and pm.user_id = h.user_id and pm.slot = h.slot),
                 -- THE PARTY LEADER (hunt_parties.leader_*; a party instance's id is its party's): its density sets the pull.
                 'leads', exists (select 1 from public.hunt_parties p where p.id = v_i.id and p.closed_at is null
                                    and p.leader_user = h.user_id and p.leader_slot = h.slot),
                 'session', case when v_i.density is null then mr.r
                                 else jsonb_set(mr.r, '{options}', coalesce(mr.r->'options', '{}'::jsonb) || jsonb_build_object('density', v_i.density, 'tier', coalesce(v_i.tier, 'normal'))) end,
                 -- LIVE-EVENTS (2027-03-22-live-events.sql): the member's own Level XP windows from the instance's clock to an hour past now
                 -- (hr_live_xp_windows: its switches, its ground, summed and capped); [] when none, so the engine sets no hook.
                 'live_xp', public.hr_live_xp_windows(h.user_id, v_i.hunt_id, v_i.settled_to, now() + interval '1 hour'),
                 'state', public.hr_hunt_member_state(h.user_id, h.slot))
                 order by h.user_id, h.slot)
               from public.hunt_sessions h cross join lateral (select public.hr_hunt_member_read(h) as r0) m0
               -- TARGET-KIND: the member's OWN hunt_density row on this ground, only a kind the catalogue holds there; no row, no key. Any
               -- options.target_kind is dropped first (hr_action_set_options refuses the key; this read does not lean on that alone).
               cross join lateral (select jsonb_set(m0.r0, '{options}', (coalesce(m0.r0->'options', '{}'::jsonb) - 'target_kind') || coalesce(
                   (select jsonb_build_object('target_kind', d.target_kind) from public.hunt_density d
                      join public.hr_hunt_ground_spawns g on g.hunt_id = d.hunt_id and g.monster_id = d.target_kind
                     where d.user_id = h.user_id and d.slot = h.slot and d.hunt_id = v_i.hunt_id), '{}'::jsonb)) as r) mr
              where h.instance_id = v_i.id and h.ended_at is null), '[]'::jsonb),
    'now_ms', floor(extract(epoch from now()) * 1000)::bigint);
end $function$;
revoke all on function public.hr_hunt_instance_read(uuid, integer) from public, anon, authenticated, service_role;
do $mig$
begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    grant execute on function public.hr_hunt_instance_read(uuid, integer) to hr_engine; end if;
end $mig$;

-- ── §4 THE SECTION, THE CLIENT SURFACE AND THE WALL ─────────────────────────
insert into public.hr_state_sections (key, fn, note) values
  ('hunt_target_kind', 'hr_hunt_target_kind_view', '2027-04-22-target-kind.sql: this hero''s First target picked per ground, { picks: { <hunt_id>: <monster_id> } } (no key = none; only a kind that ground''s catalogue still holds)')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_hunt_target_kind_set';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_hunt_target_kind_set', 'p_slot integer, p_hunt text, p_kind text, p_idem uuid', 'authenticated',
   'added 2027-04-22: the caller''s own First target on one hunt ground, a monster the ground''s catalogue holds or none, refused not clamped; moves no value');
do $mig$
begin
  if to_regclass('public.hr_gm_wall_allow') is not null then
    insert into public.hr_gm_wall_allow (rpc, why) values ('hr_hunt_target_kind_set', 'its own hero')
      on conflict (rpc) do update set why = excluded.why; end if;
end $mig$;

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u   constant uuid := '000000c0-0000-4000-a000-0000f1a70001';
  k     text := '000000c0-0000-4000-a000-0000';
  v      jsonb;
  v_read jsonb;
  c_ground constant text := 'mill_cellar';
  c_other  constant text := 'mosslight_glade';
  c_kind   constant text := 'slime';
  c_kind2  constant text := 'hive_wasp';
begin
  -- (a) the surface: the verb is client-executable, nothing it reads or the engine reads is, and the rows are registered
  if not has_function_privilege('authenticated', 'public.hr_hunt_target_kind_set(integer,text,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_hunt_target_kind_set(integer,text,text,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_hunt_target_kind_view(uuid,integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_hunt_target_kind_view(uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_hunt_instance_read(uuid,integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_hunt_instance_read(uuid,integer)', 'execute')
     or has_table_privilege('authenticated', 'public.hunt_density', 'select')
     or has_table_privilege('authenticated', 'public.hunt_density', 'update') then
    raise exception 'VERIFY(a): a grant is wrong'; end if;
  if not exists (select 1 from public.hr_state_sections where key = 'hunt_target_kind' and fn = 'hr_hunt_target_kind_view')
     or not exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_hunt_target_kind_set' and grantee = 'authenticated') then
    raise exception 'VERIFY(a): the section or the baseline row is missing'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hunt_density') then
    raise exception 'VERIFY(a): hunt_density grew a policy: it is written by its verbs only'; end if;
  -- the catalogue the verb validates against is the ground's, and the probe's kinds stand there (and not on the other ground)
  if not exists (select 1 from public.hr_hunt_ground_spawns where hunt_id = c_ground and monster_id = c_kind)
     or not exists (select 1 from public.hr_hunt_ground_spawns where hunt_id = c_ground and monster_id = c_kind2)
     or exists (select 1 from public.hr_hunt_ground_spawns where hunt_id = c_other and monster_id = c_kind) then
    raise exception 'VERIFY(a): the catalogue no longer holds the probe''s kinds where it expects them (re-aim the probe)'; end if;
  begin
    update public.hr_hunt_config set enabled = true where id;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Probe Firsts') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'target-kind §5 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    -- (b) refused, never clamped, and nothing written
    v := public.hr_hunt_target_kind_set(0, 'no_such_ground', c_kind, (k || 'f1a70001')::uuid);
    if v->>'error' is distinct from 'bad_hunt' then raise exception 'VERIFY(b): an unknown ground answered %', v; end if;
    v := public.hr_hunt_target_kind_set(0, c_ground, 'not_a_monster', (k || 'f1a70002')::uuid);
    if v->>'error' is distinct from 'bad_kind' then raise exception 'VERIFY(b): an unknown kind answered %', v; end if;
    v := public.hr_hunt_target_kind_set(0, c_other, c_kind, (k || 'f1a70003')::uuid);
    if v->>'error' is distinct from 'bad_kind' then raise exception 'VERIFY(b): a kind of another ground answered %', v; end if;
    v := public.hr_hunt_target_kind_set(0, c_ground, c_kind, null);
    if v->>'error' is distinct from 'bad_idem' then raise exception 'VERIFY(b): no key answered %', v; end if;
    v := public.hr_hunt_target_kind_set(6, c_ground, c_kind, (k || 'f1a70004')::uuid);
    if v->>'error' is distinct from 'bad_slot' then raise exception 'VERIFY(b): slot 6 answered %', v; end if;
    if exists (select 1 from public.hunt_density where user_id = v_u) then raise exception 'VERIFY(b): a refused pick wrote a row'; end if;
    -- (c) a pick is remembered per ground and read back; a replay answers the same and writes nothing; the tier is untouched
    v := public.hr_hunt_target_kind_set(0, c_ground, c_kind, (k || 'f1a70005')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v->>'kind' is distinct from c_kind then raise exception 'VERIFY(c): the pick answered %', v; end if;
    if public.hr_hunt_target_kind_view(v_u, 0) <> jsonb_build_object('picks', jsonb_build_object(c_ground, c_kind)) then
      raise exception 'VERIFY(c): the view reads %', public.hr_hunt_target_kind_view(v_u, 0); end if;
    delete from public.hr_rate_counters where user_id = v_u;
    if public.hr_hunt_target_kind_set(0, c_ground, c_kind2, (k || 'f1a70005')::uuid) is distinct from v
       or (select target_kind from public.hunt_density where user_id = v_u and slot = 0 and hunt_id = c_ground) is distinct from c_kind then
      raise exception 'VERIFY(c): a replayed key wrote or answered something new'; end if;
    if (select tier from public.hunt_density where user_id = v_u and slot = 0 and hunt_id = c_ground) is distinct from 'normal' then
      raise exception 'VERIFY(c): the pick moved the tier'; end if;
    -- (d) THE ENGINE'S READ: in a hunt the member's options carry the pick, the section names it, and a pick mid-hunt is read at once
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_enter(0, c_ground, '[]'::jsonb, 0, null, (k || 'f1a70006')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): entering answered %', v; end if;
    v_read := public.hr_hunt_instance_read(v_u, 0);
    if v_read->'members'->0->'session'->'options'->>'target_kind' is distinct from c_kind then
      raise exception 'VERIFY(d): the engine reads options %', v_read->'members'->0->'session'->'options'; end if;
    if public.hr_state_of(v_u, 0)->'hunt_target_kind'->'picks'->>c_ground is distinct from c_kind then
      raise exception 'VERIFY(d): the section reads %', public.hr_state_of(v_u, 0)->'hunt_target_kind'; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_target_kind_set(0, c_ground, c_kind2, (k || 'f1a70007')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): a pick mid-hunt answered %', v; end if;
    if public.hr_hunt_instance_read(v_u, 0)->'members'->0->'session'->'options'->>'target_kind' is distinct from c_kind2 then
      raise exception 'VERIFY(d): a pick mid-hunt is not what the engine reads next'; end if;
    -- (e) A KIND THE CATALOGUE NO LONGER HOLDS THERE reads as none, in the engine and the section, and the row keeps it
    update public.hunt_density set target_kind = 'brook_bear' where user_id = v_u and slot = 0 and hunt_id = c_ground;
    v_read := public.hr_hunt_instance_read(v_u, 0);
    if (v_read->'members'->0->'session'->'options') ? 'target_kind' or public.hr_hunt_target_kind_view(v_u, 0)->'picks' <> '{}'::jsonb then
      raise exception 'VERIFY(e): a kind off the ground was served: %', v_read->'members'->0->'session'->'options'; end if;
    -- (f) none clears it: no key in the engine's read, none in the section, the row (its tier) kept
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_target_kind_set(0, c_ground, null, (k || 'f1a70008')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or jsonb_typeof(v->'kind') is distinct from 'null' then raise exception 'VERIFY(f): none answered %', v; end if;
    if (public.hr_hunt_instance_read(v_u, 0)->'members'->0->'session'->'options') ? 'target_kind'
       or (select target_kind from public.hunt_density where user_id = v_u and slot = 0 and hunt_id = c_ground) is not null
       or not exists (select 1 from public.hunt_density where user_id = v_u and slot = 0 and hunt_id = c_ground) then
      raise exception 'VERIFY(f): none did not clear the pick, or took the row with it'; end if;
    perform public.hr_hunt_close(h.id, 'left', now(), true) from public.hunt_sessions h where h.user_id = v_u and h.ended_at is null;
    raise exception using errcode = 'HR898', message = 'target-kind §5 complete - rolling back';
  exception when sqlstate 'HR898' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.hunt_density where user_id = v_u) or exists (select 1 from public.player_state where user_id = v_u)
     or exists (select 1 from public.player_intents where user_id = v_u) then raise exception 'VERIFY(g): §5 LEAKED a probe row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'target-kind: refused never clamped, remembered per ground, the engine reads it each settle, a kind off the ground is none, none clears; all green';
end $$;
