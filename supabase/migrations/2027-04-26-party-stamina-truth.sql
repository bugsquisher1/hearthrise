-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-26-party-stamina-truth.sql — A SEAT'S LOW STAMINA IS ITS POOL, NEVER THE STORED COLUMN (full-game audit 2026-11-15, F7, P1)
--   (lane/c-party-stamina-truth, backend-architect, 2026-11-15; CLAUDE.md §6 "the browser never says one thing while the server
--   says another"). STAGED: tools/apply-migration.mjs, one file, never inside begin/commit. Pre-EA (CLAUDE.md §2): applies on
--   its passing §2. A READ ONLY: one projection restated. No table, column, row, grant or client verb; no value moves.
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- player_state.stamina_ms is the pool AS OF stamina_at. Everything outside a hunt refills it 1:1 (Tyler 2026-10-18), and that
-- rest is never written down: hr_stamina_of(user, slot, at) adds it each time the pool is read, and only a settle or a refill
-- writes the column. hr_hunt_party_view (`stamina_low_ms`, 2027-02-18-party-truth.sql; last restated by
-- 2027-02-27-hunt-tiers.sql) read the COLUMN. So a hero who ran dry, rested twelve hours in town and then entered a party
-- hunt was shown to every other seat as "1 min of stamina left. Their hunt ends then, and <your hero> comes home too", from
-- the Start until his first settle wrote the pool, while the server held 11 h 30 min for him (the audit's repro, local world).
-- A player acts on that line: a refill bought, a party pulled out.
--
-- ── THE CONTRACT (the shape does not move) ─────────────────────────────────
-- party.members[].stamina_low_ms   bigint | null
--   null unless the seat is HUNTING (an open session in this party's instance; a solo hero's own) and its pool is at
--   900000 ms (15 min) or under; then the pool, floored at 0.
--   THE POOL is public.hr_stamina_of(the seat's user, the seat's slot, the seat's session.settled_to): the same reader at the
--   same instant as the seat's own `stamina` section (hr_stamina_view), its refill quote (hr_stamina_refill_quote) and its next
--   settle (hr_hunt_apply_member's v_s0). So the number a friend is shown IS the number the seat itself is shown, to the
--   millisecond, and the seat's first settle starts from it.
--   AT settled_to, NOT now(): a hunting seat does not rest. Between settles the column stands at settled_to, so now() would add
--   the settle's lag as rest that never happened: nothing on a healthy hunt, minutes on one whose settle runs behind, and it
--   would hide the warning exactly on the hunt that is in trouble (§2(d)).
-- Every other key of the section, and every other line of the body, is byte for byte the image §0 pins.
--
-- ── CONCURRENCY / IDEMPOTENCY ──────────────────────────────────────────────
-- A STABLE read: no write, no lock, no key. STABLE means every read in it (hr_stamina_of's included, itself STABLE) runs on the
-- calling statement's one snapshot, so the seat's column, its stamp and its session's settled_to are one committed state: a
-- settle committing mid-read cannot pair an old pool with a new instant. The next envelope restates the whole section.
--
-- ── EXPLOIT SURFACE DELTA ──────────────────────────────────────────────────
-- None. The function stays SECURITY DEFINER and internal (no client role may execute it; §2 asserts it), reached only through
-- hr_state_of and the party verbs' answers, for the caller's own party. What a seat learns of another is unchanged in kind:
-- a pool at 15 min or under, of a hero hunting in the caller's own party. hr_stamina_of stays internal (§2 asserts it).
--
-- ── COST (rows and bytes at 100x players) ─────────────────────────────────
-- No row, no byte. One hr_stamina_of call per HUNTING seat per party read (at most 4): one primary-key read of player_state,
-- two hr_hunt_limit reads and hr_premium_until, plpgsql with cached plans. A seat in town costs nothing new
-- (tests/settle-budget.mjs holds the settle's budget with it).
--
-- EDGE: NONE. The engine reads a member's stamina through hr_hunt_member_read, already hr_stamina_of at settled_to;
--   pack-edge --hash does not move.
-- CLIENT: src/shell/alerts.js takes the line down when the server stops saying it (same lane). Either order is safe.
-- ORDER: FREE. It needs only 2027-02-27-hunt-tiers.sql before it (the image §0 pins). It restates hr_hunt_party_view and nothing
--   else, and no staged file names that function (2027-04-22-faction-*, 2027-04-23-training-gear*, 2027-04-23-session-modes*,
--   2027-04-24-hall-key-any-seat, 2027-04-25-boss-daily), so it commutes with every one of them and may apply before them.
-- REVERSIBLE: re-apply 2027-02-27-hunt-tiers.sql's hr_hunt_party_view (the image §0 pins). Nothing else to undo.
-- IDEMPOTENT: a second apply restates the same body (§0 passes its own image) and §2 rolls back its probes.
-- WIPE: no table. RESIDUE: none.
-- AFTER APPLY: live-hash-drift --live --write (hr_hunt_party_view re-measured, touched_by gains this file); restore-census
--   does not move (no table, no seeded row).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regprocedure('public.hr_hunt_party_view(uuid,integer)') is null
     or to_regprocedure('public.hr_stamina_of(uuid,integer,timestamp with time zone)') is null
     or to_regprocedure('public.hr_stamina_view(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_tier_view(uuid,integer)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: the party view (2027-02-27-hunt-tiers.sql) and the stamina pool (2026-12-17-beta-premium.sql) first'; end if;
  -- THE PIN: hr_hunt_party_view is restated below from the image the chain ends on today (2027-02-27-hunt-tiers.sql's; replay and
  -- live agreed on it, live-hash-drift 2026-11-15). A body moved since must be re-read before this lands: refuse, never guess.
  -- Its own image (a second apply) passes.
  v_md5 := md5(regexp_replace(pg_get_functiondef('public.hr_hunt_party_view(uuid,integer)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_md5 not in ('7bcaacf2d28450fafcbb5f4e599c48a2', '35792d7e813316ff125305e690db4d1a') then
    raise exception 'PIN: hr_hunt_party_view is neither the image this file restates (7bcaacf2d28450fafcbb5f4e599c48a2) nor its own (35792d7e813316ff125305e690db4d1a): md5 % - another file moved it', v_md5;
  end if;
end $mig$;

-- ── §1 THE PARTY VIEW, RESTATED WHOLE: ONE READ MOVES ────────────────────────
create or replace function public.hr_hunt_party_view(p_user uuid, p_slot integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  -- PARTY-FLOW (2026-10-28-party-flow.sql): each member row says whether it is away and how long its seat is kept.
  -- HUNT-TIERS (2027-02-27-hunt-tiers.sql): `leader_tiers`, the leader's tier picked per ground (hunt_density.tier)
  -- every seat's picker shows read-only; it replaces `leader_densities`, the dial is gone.
  -- HERO-LOOKS (2026-11-04-party-outfits.sql): each member row carries the outfit its character wears (public, as in town).
  -- PARTY-FINDER (2026-12-07-party-finder.sql): each member row of a party carries `ready` and `ready_why`, the
  -- predicate Start uses (hr_party_seat_ready) on the party's `hunt`; the CODE only, never another player's detail.
  -- PARTY-TRUTH (2027-02-18-party-truth.sql): `weapon` is what the seat wears NOW (the key the engine reads);
  -- `stamina_low_ms`, a hunting seat's stamina at 15 min or under, else null.
  -- PARTY-STAMINA-TRUTH (2027-04-26-party-stamina-truth.sql): that stamina is the POOL (hr_stamina_of) at the seat's
  -- settled_to, the instant its own `stamina` section, its refill quote and its next settle read it at; never the
  -- stored column, which is the pool as of stamina_at and misses every minute rested since.
  v_pid   uuid := public.hr_hunt_party_of(p_user, p_slot);
  v_p     public.hunt_parties%rowtype;
  v_own   public.hunt_sessions%rowtype;
  v_inst  uuid;
  v_shape public.hr_hunt_world_shape%rowtype;
  v_wj    jsonb;
  v_uf    jsonb;
  v_vit   jsonb := '{}'::jsonb;
  v_lead  int;
  v_self  int;
  v_sseat int;
  v_lseat int;
  v_mem   jsonb := '[]'::jsonb;
  v_r     record;
  v_u     jsonb;
  v_id    int;
  v_t     int;
  v_v     jsonb;
  v_secs  numeric;
  v_away  boolean;
  v_ltier jsonb;
  v_ready jsonb;
  v_mx    jsonb;   -- TOWN-DEFAULTS (2027-01-25-town-defaults.sql): a hunting member's own maxima while the pose has none
  v_stam  bigint;  -- PARTY-STAMINA-TRUTH: a hunting seat's pool at its settled_to; null for a seat in town
begin
  select * into v_own from public.hunt_sessions h
   where h.user_id = p_user and h.slot = p_slot and h.ended_at is null order by h.entered_at desc limit 1;
  if v_pid is null and v_own.id is null then return null; end if;
  if v_pid is not null then
    select * into v_p from public.hunt_parties where id = v_pid;
    v_inst := v_pid;
  else
    v_inst := v_own.instance_id;
  end if;

  -- The pose's hero vitals by unit id, and which heroes a living monster is on.
  select * into v_shape from public.hr_hunt_world_shape where id;
  begin
    select i.world::jsonb into v_wj from public.hunt_instances i where i.id = v_inst;
  exception when others then
    v_wj := null;
  end;
  if v_wj is not null and jsonb_typeof(v_wj) = 'object' and v_shape.id
     and (v_wj->>'v') = v_shape.version::text and (v_wj->>'s') = v_shape.shape::text then
    v_uf := v_shape.fields->'unit';
    if jsonb_typeof(v_wj->'w'->((v_shape.fields->'world'->>'leader')::int)) = 'number' then
      v_lead := (v_wj->'w'->>((v_shape.fields->'world'->>'leader')::int))::int;
    end if;
    for v_u in select e from jsonb_array_elements(case when jsonb_typeof(v_wj->'u') = 'array' then v_wj->'u' else '[]'::jsonb end) e loop
      v_id := (v_u->>((v_uf->>'id')::int))::int;
      if v_u->>((v_uf->>'side')::int) = 'hero' then
        v_v := jsonb_build_object(
          'hp', v_u->((v_uf->>'hp')::int), 'hp_max', v_u->((v_uf->>'maxHp')::int),
          'mana', v_u->((v_uf->>'mana')::int), 'mana_max', v_u->((v_uf->>'maxMana')::int),
          'eating', jsonb_typeof(v_u->((v_uf->>'otHp')::int)) = 'array',
          'drinking', jsonb_typeof(v_u->((v_uf->>'otMana')::int)) = 'array');
        v_vit := v_vit || jsonb_build_object(v_id::text, coalesce(v_vit->(v_id::text), '{}'::jsonb) || v_v);
      elsif (v_u->>((v_uf->>'alive')::int)) = 'true' and jsonb_typeof(v_u->((v_uf->>'target')::int)) = 'number' then
        v_t := (v_u->>((v_uf->>'target')::int))::int;
        v_vit := v_vit || jsonb_build_object(v_t::text, coalesce(v_vit->(v_t::text), '{}'::jsonb) || jsonb_build_object('aggro', true));
      end if;
    end loop;
  end if;

  for v_r in
    select m.user_id, m.slot, m.seat::int as seat, public.hr_hunt_weapon_of(m.user_id, m.slot) as weapon, h.id as sid, h.unit_id, h.preset,
           h.hunt_from, h.settled_to, m.joined_at
      from public.hunt_party_members m
      left join public.hunt_sessions h on h.user_id = m.user_id and h.slot = m.slot and h.ended_at is null and h.instance_id = v_pid
     where v_pid is not null and m.party_id = v_pid
    union all
    select p_user, p_slot, 0, public.hr_hunt_weapon_of(p_user, p_slot), v_own.id, v_own.unit_id, v_own.preset,
           v_own.hunt_from, v_own.settled_to, null::timestamptz
     where v_pid is null
     order by 3
  loop
    v_v := case when v_r.unit_id is not null then coalesce(v_vit->(v_r.unit_id::text), '{}'::jsonb) else '{}'::jsonb end;
    v_mx := case when v_r.sid is not null and (v_v->'hp_max' is null or v_v->'mana' is null or v_v->'mana_max' is null)
                 then public.hr_vitals_of(v_r.user_id, v_r.slot) end;
    v_secs := greatest(0, extract(epoch from (v_r.settled_to - v_r.hunt_from)));
    v_away := v_pid is not null and public.hr_party_away(v_r.user_id, v_r.slot, v_r.joined_at);
    v_ready := case when v_pid is not null
                    then public.hr_party_seat_ready(v_pid, v_r.user_id, v_r.slot, v_p.hunt_id, v_p.leader_user, v_r.joined_at) end;
    v_stam := case when v_r.sid is not null then public.hr_stamina_of(v_r.user_id, v_r.slot, v_r.settled_to) end;
    select jsonb_build_object(
        'unit', v_r.unit_id, 'seat', v_r.seat, 'hunting', v_r.sid is not null,
        'name', public.hr_character_name(v_r.user_id, v_r.slot),
        'level', public.hr_level_of(v_r.user_id, v_r.slot),
        'weapon', v_r.weapon,
        'role_pick', (select a.options->>'role' from public.player_action_sets a
                       where a.user_id = v_r.user_id and a.slot = v_r.slot and a.preset = coalesce(v_r.preset, 0)),
        'hp', case when v_r.sid is not null then coalesce(v_v->'hp', to_jsonb(ps.hp)) end,
        'hp_max', case when v_r.sid is not null then coalesce(v_v->'hp_max', v_mx->'max_hp') end,
        -- TOWN-DEFAULTS (2027-01-25-town-defaults.sql): before the member stands in the world it has its full mana
        -- (hunt-spawn.js heroUnit), as its HP has its stored value: never "–" before a hunt's first settle.
        'mana', case when v_r.sid is not null then coalesce(v_v->'mana', v_mx->'max_mana') end,
        'mana_max', case when v_r.sid is not null then coalesce(v_v->'mana_max', v_mx->'max_mana') end,
        'dealt', case when v_r.sid is not null then coalesce((t.dealt->>'total')::bigint, 0) end,
        'healed', case when v_r.sid is not null then coalesce((t.healed->>'total')::bigint, 0) end,
        'dps', case when v_r.sid is not null and v_secs > 0 then round(coalesce((t.dealt->>'total')::numeric, 0) / v_secs, 1) end,
        'hps', case when v_r.sid is not null and v_secs > 0 then round(coalesce((t.healed->>'total')::numeric, 0) / v_secs, 1) end,
        'eating', coalesce((v_v->>'eating')::boolean, false),
        'drinking', coalesce((v_v->>'drinking')::boolean, false), 'aggro', coalesce((v_v->>'aggro')::boolean, false),
        'away', v_away,
        -- PARTY-TRUTH: a hunting seat's stamina once it is low enough to warn of; the pool above that is its own
        -- business. A party hunt ends when any seat's does (LEAVE TOGETHER), so the seats may know.
        -- PARTY-STAMINA-TRUTH: the pool (v_stam, above), so a seat that rested since its last hunt reads rested.
        'stamina_low_ms', case when v_stam <= 900000 then greatest(v_stam, 0) end,
        -- THE OUTFIT the character chose (player_outfits, written only by hr_outfit_set), null when none or no
        -- longer owned (a lapsed premium outfit): the same look hr_town_walkers shows of it in town.
        'outfit', case when po.outfit_id is not null and po.outfit_id = any (public.hr_outfit_owned(v_r.user_id, v_r.slot))
                       then jsonb_build_object('id', po.outfit_id, 'colors', coalesce(po.colors, '{}'::jsonb)) end,
        'seat_ms', case when v_away then greatest(0, floor(extract(epoch from (public.hr_party_last_seen(v_r.user_id, v_r.joined_at)
                                                                        + public.hr_party_seat_keep() - now())) * 1000))::bigint end,
        -- SEAT READINESS (party only): would Start take this seat now, and if not, the code it would answer.
        'ready', case when v_ready is not null then coalesce(v_ready->>'ok', 'false') = 'true' end,
        'ready_why', case when v_ready is not null and coalesce(v_ready->>'ok', 'false') <> 'true' then v_ready->>'error' end)
      into v_u
      from public.player_state ps
      left join public.hunt_session_tally t on t.session_id = v_r.sid
      left join public.player_outfits po on po.user_id = v_r.user_id and po.slot = v_r.slot
     where ps.user_id = v_r.user_id and ps.slot = v_r.slot;
    if v_u is not null then v_mem := v_mem || jsonb_build_array(v_u); end if;
    if v_r.user_id = p_user and v_r.slot = p_slot then v_self := v_r.unit_id; v_sseat := v_r.seat; end if;
    if v_pid is null or (v_r.user_id = v_p.leader_user and v_r.slot = v_p.leader_slot) then
      v_lseat := v_r.seat;
      -- the leader's picks per ground, as hr_hunt_tier_pick freezes them on a party instance
      v_ltier := public.hr_hunt_tier_view(v_r.user_id, v_r.slot)->'picks';
    end if;
  end loop;

  -- The leader: the pose's pull leader, else the party leader's unit, else (solo) self.
  if v_lead is null then
    v_lead := case when v_pid is null then v_self
                   else (select h.unit_id from public.hunt_sessions h
                          where h.user_id = v_p.leader_user and h.slot = v_p.leader_slot and h.ended_at is null
                            and h.instance_id = v_pid) end;
  end if;
  return jsonb_build_object(
    'id', v_pid, 'hunt', coalesce(v_p.hunt_id, v_own.hunt_id),
    'max', coalesce(v_p.max_size::int, 1),
    'open', v_pid is not null and jsonb_array_length(v_mem) < v_p.max_size,
    'leader', v_lead, 'self', v_self, 'leader_seat', v_lseat, 'self_seat', v_sseat, 'members', v_mem,
    'listed', coalesce(v_p.listed, false), 'leader_tiers', coalesce(v_ltier, '{}'::jsonb),
    -- PARTY-HOLD (2026-12-08-party-hold.sql): who holds the pack, a seat (null = take turns; solo: null).
    'hold_seat', v_p.hold_seat,
    -- LEAVE-TOGETHER (2026-12-18-party-leave-together.sql): THIS hero's own "Leave if anyone leaves the hunt or dies".
    'leave_together', (select ps.party_leave_together from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot));
end $$;
revoke execute on function public.hr_hunt_party_view(uuid, integer) from public, anon, authenticated, service_role;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
-- The audit's repro: one account, two heroes in one party. A0 leads; A1 is the seat whose pool A0 is shown.
do $$
declare
  c_a constant uuid := '000000d9-0000-4000-a000-00005a71a001';
  k   text := '000000d9-0000-4000-a000-0000';
  v jsonb; v_hunt text; v_sid uuid; v_st timestamptz; v_seat int; v_row jsonb; v_sig text; v_src text;
begin
  begin
    update public.hr_hunt_config set enabled = true where id;
    select g.hunt_id into v_hunt from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id order by coalesce(h.band_min, 0), g.hunt_id limit 1;
    insert into auth.users (id) values (c_a) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (c_a, 'Probe Stamina Truth') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (c_a, 'party-stamina-truth §2 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'party-stamina-truth §2-harness: hr_create_character(0) refused: %', v; end if;
    -- A second hero, its slot owned the way a buyer owns it (tests/_slots.mjs ownHeroSlots).
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
      values (c_a, 0, 'flag', 'character_slot:1', 1, '', null, now()) on conflict do nothing;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'party-stamina-truth §2-harness: hr_create_character(1) refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = c_a;
    insert into public.social_presence (user_id, slot, seen_at) values (c_a, 0, now()) on conflict (user_id) do update set seen_at = now();
    insert into public.character_presence (user_id, slot, seen_at) values (c_a, 0, now()), (c_a, 1, now())
      on conflict (user_id, slot) do update set seen_at = now();
    delete from public.hr_rate_counters where user_id = c_a;
    v := public.hr_hunt_party_invite_own(0, 1, (k || '5a71a101')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-stamina-truth §2-harness: the own invite answered %', v; end if;
    select m.seat::int into v_seat from public.hunt_party_members m where m.user_id = c_a and m.slot = 1;

    -- (a) F7 AS FOUND: A1 ran dry twelve hours ago and has rested since; nothing has written the pool, so the column is still 0.
    --     The Start reads the rested pool and lets him in; the leader's party section must read it too.
    update public.player_state set stamina_ms = 0, stamina_at = now() - interval '12 hours' where user_id = c_a and slot = 1;
    v := public.hr_hunt_party_start(0, v_hunt, (k || '5a71a102')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-stamina-truth §2-harness: the start answered %', v; end if;
    select h.id, h.settled_to into v_sid, v_st from public.hunt_sessions h where h.user_id = c_a and h.slot = 1 and h.ended_at is null;
    if v_sid is null or v_seat is null
       or (select ps.stamina_ms from public.player_state ps where ps.user_id = c_a and ps.slot = 1) is distinct from 0 then
      raise exception 'party-stamina-truth §2-harness: A1 is not a hunting seat whose stored pool is still 0 (the probe no longer builds F7)'; end if;
    select e into v_row from jsonb_array_elements(public.hr_hunt_party_view(c_a, 0)->'members') e where (e->>'seat')::int = v_seat;
    if v_row->>'hunting' is distinct from 'true' or v_row->'stamina_low_ms' is distinct from 'null'::jsonb then
      raise exception 'party-stamina-truth §2(a): a seat rested twelve hours (stored pool 0) is shown as %', v_row; end if;
    -- ...and so does the envelope the client applies.
    select e into v_row from jsonb_array_elements(public.hr_state_of(c_a, 0)->'party'->'members') e where (e->>'seat')::int = v_seat;
    if v_row->>'hunting' is distinct from 'true' or v_row->'stamina_low_ms' is distinct from 'null'::jsonb then
      raise exception 'party-stamina-truth §2(a): the envelope shows the rested seat as %', v_row; end if;

    -- (b) TEN MINUTES RESTED from empty: the pool is 600000 ms at the seat's settled_to, exactly.
    update public.player_state set stamina_ms = 0, stamina_at = v_st - interval '10 minutes' where user_id = c_a and slot = 1;
    select e into v_row from jsonb_array_elements(public.hr_hunt_party_view(c_a, 0)->'members') e where (e->>'seat')::int = v_seat;
    if v_row->'stamina_low_ms' is distinct from to_jsonb(600000::bigint) then
      raise exception 'party-stamina-truth §2(b): a seat rested ten minutes from empty is shown as %', v_row->'stamina_low_ms'; end if;

    -- (c) THE LINE: 15 min is low, one millisecond over is the seat's own business.
    update public.player_state set stamina_ms = 900000, stamina_at = v_st where user_id = c_a and slot = 1;
    select e into v_row from jsonb_array_elements(public.hr_hunt_party_view(c_a, 0)->'members') e where (e->>'seat')::int = v_seat;
    if v_row->'stamina_low_ms' is distinct from to_jsonb(900000::bigint) then
      raise exception 'party-stamina-truth §2(c): a seat at 15 min is shown as %', v_row->'stamina_low_ms'; end if;
    update public.player_state set stamina_ms = 900001 where user_id = c_a and slot = 1;
    select e into v_row from jsonb_array_elements(public.hr_hunt_party_view(c_a, 0)->'members') e where (e->>'seat')::int = v_seat;
    if v_row->'stamina_low_ms' is distinct from 'null'::jsonb then
      raise exception 'party-stamina-truth §2(c): a seat one millisecond over 15 min is shown as %', v_row->'stamina_low_ms'; end if;

    -- (d) A HUNTING SEAT DOES NOT REST: its settle runs five minutes behind, and the pool is still the 14 min it wrote
    --     (read at now() it would be 19 min and the warning gone). It is the number the seat's own `stamina` section shows,
    --     and the number the seat reads of itself.
    update public.hunt_sessions set entered_at = now() - interval '7 minutes', hunt_from = now() - interval '6 minutes',
                                    settled_to = now() - interval '5 minutes' where id = v_sid;
    select h.settled_to into v_st from public.hunt_sessions h where h.id = v_sid;
    update public.player_state set stamina_ms = 840000, stamina_at = v_st where user_id = c_a and slot = 1;
    select e into v_row from jsonb_array_elements(public.hr_hunt_party_view(c_a, 0)->'members') e where (e->>'seat')::int = v_seat;
    v := public.hr_stamina_view(c_a, 1);
    if v_row->'stamina_low_ms' is distinct from to_jsonb(840000::bigint)
       or v->>'hunting' is distinct from 'true' or v->'ms' is distinct from v_row->'stamina_low_ms' then
      raise exception 'party-stamina-truth §2(d): a seat five minutes behind its settle is shown as %, its own stamina section says %', v_row->'stamina_low_ms', v; end if;
    select e into v_row from jsonb_array_elements(public.hr_hunt_party_view(c_a, 1)->'members') e where (e->>'seat')::int = v_seat;
    if v_row->'stamina_low_ms' is distinct from to_jsonb(840000::bigint) then
      raise exception 'party-stamina-truth §2(d): the seat reads itself as %', v_row->'stamina_low_ms'; end if;

    -- (e) IN TOWN there is no warning, whatever the pool: the hunt is over.
    perform public.hr_hunt_close(h.id, 'left', now(), true) from public.hunt_sessions h where h.user_id = c_a and h.ended_at is null;
    update public.player_state set stamina_ms = 0, stamina_at = now() where user_id = c_a and slot = 1;
    select e into v_row from jsonb_array_elements(public.hr_hunt_party_view(c_a, 0)->'members') e where (e->>'seat')::int = v_seat;
    if v_row is null or v_row->>'hunting' is distinct from 'false' or v_row->'stamina_low_ms' is distinct from 'null'::jsonb then
      raise exception 'party-stamina-truth §2(e): a seat in town is shown as %', v_row; end if;
    raise exception 'party-stamina-truth §2: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'party-stamina-truth §2: ok' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = c_a) or exists (select 1 from public.hunt_sessions where user_id = c_a)
     or exists (select 1 from public.hunt_party_members where user_id = c_a) or exists (select 1 from auth.users where id = c_a) then
    raise exception 'party-stamina-truth §2: a probe row LEAKED'; end if;
  -- (f) THE SHAPE: the view reads the pool through its one reader and never the column; neither is a client's.
  select replace(p.prosrc, chr(13), '') into v_src from pg_proc p where p.oid = 'public.hr_hunt_party_view(uuid,integer)'::regprocedure;
  if strpos(v_src, 'public.hr_stamina_of(v_r.user_id, v_r.slot, v_r.settled_to)') = 0 or strpos(v_src, 'ps.stamina_ms') > 0 or strpos(v_src, 'ps.stamina_at') > 0 then
    raise exception 'party-stamina-truth §2(f): hr_hunt_party_view does not read the pool through hr_stamina_of at settled_to, or still reads the column'; end if;
  foreach v_sig in array array['public.hr_hunt_party_view(uuid,integer)', 'public.hr_stamina_of(uuid,integer,timestamp with time zone)'] loop
    if has_function_privilege('anon', v_sig::regprocedure, 'execute') or has_function_privilege('authenticated', v_sig::regprocedure, 'execute')
       or has_function_privilege('service_role', v_sig::regprocedure, 'execute') then
      raise exception 'party-stamina-truth §2(f): % is reachable by a client', v_sig; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'party-stamina-truth: a rested seat reads rested, ten minutes reads 600000, the line is 15 min, a hunting seat does not rest, a seat in town warns nobody; all green';
end $$;
