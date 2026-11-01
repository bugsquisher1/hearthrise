-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-18-party-truth.sql — THE PARTY SAYS WHAT THE SERVER KNOWS (blind three-friends panel 2026-11-01,
-- lane/a-party-truth, systems-engineer). STAGED: tools/apply-migration.mjs, one file, never inside begin/commit, never
-- 00:00-00:10 UTC. Pre-EA (CLAUDE.md §2): applies on its passing §4; on the EA Security list (a new client verb, a new
-- table, no value moves). Reproduced on tools/qa/local-world.mjs, four accounts, real play.html. BEFORE its client half.
--
-- §1 THE ROLE WAS A PHOTOGRAPH. hunt_party_members.weapon_type was written once, at the seat, and hr_hunt_party_view
--    and the finder read it for ever after, while the engine reads the worn set at each placement (hunt-settle.js
--    memberInput, wornRoleKey). Played: a party that swapped to a bow and a staff after joining showed "Melee (shield)"
--    three times, three knights, "1 of 4 classes", over a world whose units were tank, ranger and healer and which
--    PAID as three classes: the payment was right and every word about it was wrong. The column goes, so nothing can
--    read it again; the view and the finder read hr_hunt_weapon_of, the key the engine's own read matches (an equip
--    mid-hunt is refused, equip.js, so a hunting seat's key is the one its unit was placed with). A worn weapon or
--    shield changing nudges the seat-mates' open clients (hr_party_nudge_trg), or they would stay stale in town.
-- §2 THE SILENCES. party_notices: one row per thing that happened to a hero while another player acted, read back
--    as the section `party_notices` and shown once per row (src/shell/alerts.js, as Tamsin's payments are):
--    declined (to the inviter), removed (to the removed), disbanded, left, dropped (to the other seats), ground_warn
--    (§5). A notice to the actor's own account is never written: that client already knows. It says only who
--    did what: no value, no gate reads it. An hour at most, 16 a hero, pruned as it is written; every failure degrades
--    to "no notice", never to a refused verb.
-- §3 A CROSSING INVITE IS NOT A DEAD END. Sending an invite makes a party of one, so two friends inviting each
--    other were both "already in a party". hr_party_join_for now gives up a party of one the joining hero sits alone in:
--    nobody is in it, and the invites it sent go with it (hr_party_drop). A party with anyone else in it still refuses
--    `already_in_party`, whose words say what to press. Two parties are locked in id order: two friends pressing Join
--    in the same instant cannot deadlock, and the second finds its invite expired, already in a party of two.
-- §4 WHY A FRIEND CAME HOME. hr_hunt_view's `end_by_why`: the end_reason of the member `end_by` names, so "Bramwell ran
--    out of stamina" is not "Bramwell left the hunt". The party view's `stamina_low_ms`: a hunting seat's stamina at
--    15 min or under, else null, so the party is warned first. A number no gate reads; it says nothing about the cap.
-- §5 THE LEADER'S PICK WARNS FIRST (designer list; Tyler's floor-is-a-warning stands, 10-18, and so does the leader's pick,
--    10-20: nothing here refuses anything). hr_hunt_party_warn(slot, hunt, idem), leader only: answers which seats
--    stand under the ground's floor and writes each a ground_warn notice, before the leader's second press starts.
--
-- EXPLOIT SURFACE. One new client verb (hr_hunt_party_warn: rate-gated `party`, journalled, leader-only, a catalogue
-- ground only, writes only display rows to its own party's seats). No value moves anywhere. Notices carry a server-resolved
-- name and a catalogue hunt id, never client text. A griefer's invites already spend hr_rpc_gate('party'); a decline
-- notice goes to the griefer. A push carries no state (2027-02-11-party-nudge.sql). COST: the view reads one
-- hr_hunt_weapon_of per seat (party-flow PF-ROLE; measured in the lane's report); the section one indexed read.
-- EDGE: none. RESIDUE: none. REVERSIBLE: re-add the column from hr_hunt_weapon_of, re-apply the pre-images (pinned below),
-- drop the table, its section row, the verb and its baseline row. ORDER: after the three 2027-02-16 files, no object in common.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PINS: FAIL CLOSED IF ANOTHER FILE MOVED A BODY THIS FILE RESTATES ─────
do $mig$
declare v_md5 text; r record;
begin
  for r in select * from (values
    ('public.hr_party_open(uuid,integer)', 'c88a129286e7040135189d9ab4edaab2', '047317d524a0dc5c40291e1053729842'),
    ('public.hr_party_seat_into(uuid,uuid,integer)', '9a71c80e59c257d1bf3ec56c7968959c', '6f609fcd801ce8864d77d5eed8cb7706'),
    ('public.hr_party_join_for(uuid,integer,uuid,boolean)', '1c5429747e468e00d2fc76a89e8cf859', '2330405f586dce653802866ec2d9d497'),
    ('public.hr_hunt_party_decline(integer,uuid,uuid)', 'bfb2ecb6402c31f0d199264c524b7eb5', '8cbc01a5d250a7186e4a1644a17db10d'),
    ('public.hr_hunt_party_kick(integer,integer,uuid)', 'b2e750ab039bfae2ca721e9fec9b6ec8', 'b1b39309b4d4e579d7167437c85a4651'),
    ('public.hr_hunt_party_disband(integer,uuid)', 'dc9d94d59451bfb5b003a2cecf8a568c', 'c12c2cc8a52266b7cc9591a212236118'),
    ('public.hr_hunt_party_leave(integer,uuid)', 'cf844847ee82f36b1f9a25aaf89e1f5c', '4ef2331a4b0b0cac54521e88e7728170'),
    ('public.hr_hunt_party_sweep(integer)', '6b120fe2615eb4fc73fc857f7875b371', 'db50749b9f4d4205828c8d8b9ce8e810'),
    ('public.hr_hunt_party_finder(integer,text,text)', 'db29558319529a1c0a00226c5bf4655c', '2d239ba5c88f79bdea5bfd1050228431'),
    ('public.hr_hunt_party_view(uuid,integer)', '2d8fcc3d8c3e0393424eb8682c25bc6f', '182f591a084e8947a45925e2f5451dda'),
    ('public.hr_hunt_view(uuid)', 'e1337c1b1e2922d1a2dba8dbfa8f683c', '36220d1000de5a17600b20de779b4e1f'),
    ('public.hr_party_nudge_trg()', '0b48d5148e6b395ca8f9dc510fd6f8f1', 'f890ea2bebf5bda4a508fd6ad3491cd2')
  ) p(sig, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(r.sig);
    if v_md5 is null then raise exception 'PIN: % is missing', r.sig; end if;
    if v_md5 is distinct from r.pre and v_md5 is distinct from r.post then
      raise exception 'PIN: % is neither the image this file was written over (%) nor its own (%) - md5 %: another file moved it; restate from the new image',
        r.sig, left(r.pre, 8), left(r.post, 8), v_md5; end if;
  end loop;
end $mig$;

-- ── §2 THE NOTICES ──────────────────────────────────────────────────────────
create table if not exists public.party_notices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  slot       int  not null,
  kind       text not null check (kind in ('declined', 'removed', 'disbanded', 'left', 'dropped', 'ground_warn')),
  actor_user uuid not null,
  actor_slot int  not null,
  hunt_id    text,
  at         timestamptz not null default now(),
  constraint party_notices_to_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
create index if not exists party_notices_to on public.party_notices (user_id, slot, at desc);
alter table public.party_notices enable row level security;
revoke all on public.party_notices from public, anon, authenticated, service_role;
comment on table public.party_notices is
  'What happened to this hero while another player acted (2027-02-18-party-truth.sql): who declined, removed, disbanded, left, lost a seat, or warned of a ground. Display only: an hour at most, no value, no gate reads it. Server-written by the hr_hunt_party_* verbs; read through the party_notices section.';

create or replace function public.hr_party_notice(p_user uuid, p_slot integer, p_kind text, p_actor uuid, p_actor_slot integer, p_hunt text default null)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  -- PARTY-TRUTH (2027-02-18-party-truth.sql). A courtesy over a move already made: any failure degrades to "no notice",
  -- never to a refused party verb. The actor's own account already knows (party-intents.js re-reads its heroes).
  begin
    if p_user is null or p_slot is null or p_actor is null or p_actor_slot is null or p_user = p_actor then return; end if;
    delete from public.party_notices n where n.user_id = p_user and n.slot = p_slot
       and (n.at <= now() - interval '1 hour'
            or n.id in (select o.id from public.party_notices o where o.user_id = p_user and o.slot = p_slot order by o.at desc, o.id offset 15));
    insert into public.party_notices (user_id, slot, kind, actor_user, actor_slot, hunt_id)
      values (p_user, p_slot, p_kind, p_actor, p_actor_slot, p_hunt);
  exception when others then
    raise warning 'hr_party_notice: not written for %/% (%)', p_user, p_slot, sqlerrm;
  end;
end $$;

create or replace function public.hr_party_notices_view(p_user uuid, p_slot integer)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
#variable_conflict use_column
begin
  -- PARTY-TRUTH (2027-02-18-party-truth.sql): the newest eight of the last hour; the client shows each id once.
  return (select coalesce(jsonb_agg(x.j order by x.at desc, x.id), '[]'::jsonb) from (
    select n.id, n.at, jsonb_build_object('id', n.id, 'kind', n.kind, 'who', left(public.hr_character_name(n.actor_user, n.actor_slot), 24), 'hunt', n.hunt_id) as j
      from public.party_notices n
     where n.user_id = p_user and n.slot = p_slot and n.at > now() - interval '1 hour'
     order by n.at desc, n.id limit 8) x);
end $$;

insert into public.hr_state_sections (key, fn, note) values
  ('party_notices', 'hr_party_notices_view', '2027-02-18-party-truth.sql: what happened to this hero while another player acted; each shown once')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §1 THE ROLE IS READ, NEVER PHOTOGRAPHED ─────────────────────────────────
create or replace function public.hr_party_open(p_user uuid, p_slot integer)
returns uuid language plpgsql set search_path = public, pg_catalog as $$
declare v_id uuid;
begin
  insert into public.hunt_parties (hunt_id, leader_user, leader_slot, max_size)
    values (null, p_user, p_slot, public.hr_hunt_limit('party_max')) returning id into v_id;
  insert into public.hunt_party_members (party_id, user_id, slot, seat)
    values (v_id, p_user, p_slot, 0);
  return v_id;
end $$;

create or replace function public.hr_party_seat_into(p_party uuid, p_user uuid, p_slot integer)
returns integer language plpgsql set search_path = public, pg_catalog as $$
declare v_seat int; v_max int := (select max_size from public.hunt_parties where id = p_party);
begin
  select min(s) into v_seat from generate_series(0, v_max - 1) s
   where not exists (select 1 from public.hunt_party_members m where m.party_id = p_party and m.seat = s);
  insert into public.hunt_party_members (party_id, user_id, slot, seat)
    values (p_party, p_user, p_slot, v_seat);
  delete from public.hunt_party_invites where party_id = p_party and to_user = p_user and to_slot = p_slot;
  return v_seat;
end $$;

create or replace function public.hr_hunt_party_finder(p_slot integer, p_hunt text default null::text, p_weapon text default null::text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  -- PARTY-SECURITY (2026-10-29-party-security.sql): listed only, blocks hidden.
  -- PARTY-FINDER (2026-12-07-party-finder.sql): seats carry level + leader, parties listed_ms, at most 50 parties
  -- (the cap bounds the rows, not the one aggregate), and `seekers`: heroes looking for a party (never the reader's
  -- own account, never across a block), each read off the server at this moment.
  -- PARTY-TRUTH (2027-02-18-party-truth.sql): a seat's weapon is what it wears now.
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('party_hunt_view') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_weapon is not null and not exists (select 1 from public.hr_hunt_weapon_roles w where w.weapon_type = p_weapon) then
    return jsonb_build_object('ok', false, 'error', 'bad_weapon'); end if;
  -- A seek outside its window, or whose hero has signed out, has ENDED: the first read that sees it removes it.
  delete from public.party_seekers s
   where (p_hunt is null or s.hunt_id = p_hunt) and not public.hr_party_seek_live(s.user_id, s.created_at, s.expires_at);
  return jsonb_build_object('ok', true,
    'parties', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'hunt', x.hunt_id, 'max', x.max_size,
               'listed_ms', case when x.listed_at is not null
                                 then greatest(0, floor(extract(epoch from (now() - x.listed_at)) * 1000))::bigint end,
               'seats', (select jsonb_agg(jsonb_build_object('seat', m.seat, 'weapon', public.hr_hunt_weapon_of(m.user_id, m.slot),
                           'name', public.hr_character_name(m.user_id, m.slot),
                           'level', public.hr_level_of(m.user_id, m.slot),
                           'leader', m.user_id = x.leader_user and m.slot = x.leader_slot)
                           order by m.seat) from public.hunt_party_members m where m.party_id = x.id))
               order by x.created_at, x.id)
        from (select p.id, p.hunt_id, p.max_size, p.listed_at, p.created_at, p.leader_user, p.leader_slot
                from public.hunt_parties p
               where p.closed_at is null and p.listed and (p_hunt is null or p.hunt_id = p_hunt)
                 and (select count(*) from public.hunt_party_members m where m.party_id = p.id) < p.max_size
                 and (p_weapon is null or not exists (select 1 from public.hunt_party_members m where m.party_id = p.id and public.hr_hunt_weapon_of(m.user_id, m.slot) = p_weapon))
                 and not exists (select 1 from public.hunt_party_members m where m.party_id = p.id and m.user_id <> v_uid
                                   and public.hr_social_blocked(v_uid, m.user_id))
               order by p.created_at, p.id
               limit 50) x), '[]'::jsonb),
    'seekers', coalesce((
      select jsonb_agg(jsonb_build_object('name', public.hr_character_name(y.user_id, y.slot),
               'level', public.hr_level_of(y.user_id, y.slot),
               'weapon', public.hr_hunt_weapon_of(y.user_id, y.slot),
               'hunt', y.hunt_id,
               'age_ms', greatest(0, floor(extract(epoch from (now() - y.created_at)) * 1000))::bigint)
               order by y.created_at desc, y.user_id, y.slot)
        from (select s.user_id, s.slot, s.hunt_id, s.created_at
                from public.party_seekers s
               where (p_hunt is null or s.hunt_id = p_hunt) and s.user_id <> v_uid
                 and public.hr_party_seek_live(s.user_id, s.created_at, s.expires_at)
                 and not public.hr_social_blocked(v_uid, s.user_id)
               order by s.created_at desc, s.user_id, s.slot
               limit 50) y), '[]'::jsonb));
end $$;

create or replace function public.hr_hunt_party_view(p_user uuid, p_slot integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  -- PARTY-FLOW (2026-10-28-party-flow.sql): each member row says whether it is away and how long its seat is kept.
  -- DENSITY-HOME (2026-11-17-hunt-density-home.sql): `leader_densities`, the leader's pick per ground (hunt_density)
  -- every seat's picker shows read-only; it replaces 2026-11-01's one `leader_density`.
  -- HERO-LOOKS (2026-11-04-party-outfits.sql): each member row carries the outfit its character wears (public, as in town).
  -- PARTY-FINDER (2026-12-07-party-finder.sql): each member row of a party carries `ready` and `ready_why`, the
  -- predicate Start uses (hr_party_seat_ready) on the party's `hunt`; the CODE only, never another player's detail.
  -- PARTY-TRUTH (2027-02-18-party-truth.sql): `weapon` is what the seat wears NOW (the key the engine reads);
  -- `stamina_low_ms`, a hunting seat's stamina at 15 min or under, else null.
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
  v_ldens jsonb;
  v_ready jsonb;
  v_mx    jsonb;   -- TOWN-DEFAULTS (2027-01-25-town-defaults.sql): a hunting member's own maxima while the pose has none
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
        -- PARTY-TRUTH: a hunting seat's stamina, as its last settle wrote it, once it is low enough to warn of; the pool
        -- above that is its own business. A party hunt ends when any seat's does (LEAVE TOGETHER), so the seats may know.
        'stamina_low_ms', case when v_r.sid is not null and ps.stamina_at is not null and ps.stamina_ms <= 900000 then greatest(ps.stamina_ms, 0) end,
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
      -- the leader's picks per ground, as hr_hunt_density_pick freezes them on a party instance
      v_ldens := public.hr_hunt_density_view(v_r.user_id, v_r.slot);
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
    'listed', coalesce(v_p.listed, false), 'leader_densities', coalesce(v_ldens, '{}'::jsonb),
    -- PARTY-HOLD (2026-12-08-party-hold.sql): who holds the pack, a seat (null = take turns; solo: null).
    'hold_seat', v_p.hold_seat,
    -- LEAVE-TOGETHER (2026-12-18-party-leave-together.sql): THIS hero's own "Leave if anyone leaves the hunt or dies".
    'leave_together', (select ps.party_leave_together from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot));
end $$;

alter table public.hunt_party_members drop column if exists weapon_type;

-- A worn weapon or shield changing reaches the seat-mates' open clients (the seat's own client has its envelope).
create or replace function public.hr_party_nudge_trg()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_party uuid; v_user uuid; v_slot int; r record;
begin
  if tg_table_name = 'hunt_party_invites' then
    perform public.hr_party_nudge(new.to_user, new.to_slot);
    return null;
  elsif tg_table_name = 'party_notices' then
    -- PARTY-TRUTH (2027-02-18-party-truth.sql): the notice's own hero reads itself.
    perform public.hr_party_nudge(new.user_id, new.slot);
    return null;
  elsif tg_table_name = 'hunt_sessions' then
    -- Only a party's instance (its id is the party's): a solo enter is the hero's own client's.
    if exists (select 1 from public.hunt_parties p where p.id = new.instance_id) then
      perform public.hr_party_nudge(new.user_id, new.slot);
    end if;
    return null;
  elsif tg_table_name = 'player_equipment' then
    -- PARTY-TRUTH: only the two slots a role key reads (hr_hunt_weapon_of), only for a hero in a party.
    if tg_op = 'DELETE' then
      if old.equip_slot not in ('weapon', 'shield') then return null; end if;
      v_user := old.user_id; v_slot := old.slot;
    else
      if new.equip_slot not in ('weapon', 'shield') then return null; end if;
      if tg_op = 'UPDATE' and new.item_id is not distinct from old.item_id then return null; end if;
      v_user := new.user_id; v_slot := new.slot;
    end if;
    v_party := public.hr_hunt_party_of(v_user, v_slot);
    if v_party is null then return null; end if;
  elsif tg_table_name = 'hunt_party_members' then
    if tg_op = 'DELETE' then
      v_party := old.party_id; v_user := old.user_id; v_slot := old.slot;
    else
      v_party := new.party_id; v_user := new.user_id; v_slot := new.slot;
    end if;
    perform public.hr_party_nudge(v_user, v_slot);
  else
    v_party := new.id;
  end if;
  for r in select m.user_id, m.slot from public.hunt_party_members m
            where m.party_id = v_party and (m.user_id, m.slot) is distinct from (v_user, v_slot) loop
    perform public.hr_party_nudge(r.user_id, r.slot);
  end loop;
  return null;
end $$;
drop trigger if exists hr_party_nudge_gear on public.player_equipment;
create trigger hr_party_nudge_gear after insert or delete or update of item_id on public.player_equipment
  for each row execute function public.hr_party_nudge_trg();
drop trigger if exists hr_party_nudge_notice on public.party_notices;
-- (a seat removed, left behind or closed out already hears its hunt_party_members row go: one nudge, not two)
create trigger hr_party_nudge_notice after insert on public.party_notices
  for each row when (new.kind in ('declined', 'ground_warn')) execute function public.hr_party_nudge_trg();

-- ── §3 A CROSSING INVITE ────────────────────────────────────────────────────
create or replace function public.hr_party_join_for(p_uid uuid, p_slot integer, p_party uuid, p_need_listed boolean)
returns jsonb language plpgsql set search_path = public, pg_catalog as $$
declare v_s public.hunt_sessions%rowtype; v_p public.hunt_parties%rowtype; v_own uuid;
begin
  if p_party is null then return jsonb_build_object('ok', false, 'error', 'no_party'); end if;
  -- PARTY-TRUTH (2027-02-18-party-truth.sql): both parties, in id order: two friends' crossing Joins never deadlock.
  v_own := public.hr_hunt_party_of(p_uid, p_slot);
  perform 1 from public.hunt_parties where id in (p_party, v_own) order by id for update;
  select * into v_p from public.hunt_parties where id = p_party;
  if not found or v_p.closed_at is not null then return jsonb_build_object('ok', false, 'error', 'no_party'); end if;
  if p_need_listed and not v_p.listed then return jsonb_build_object('ok', false, 'error', 'not_listed'); end if;
  v_s := public.hr_hunt_lock(p_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = p_uid and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if v_s.id is not null then return jsonb_build_object('ok', false, 'error', 'hunt_open'); end if;
  v_own := public.hr_hunt_party_of(p_uid, p_slot);
  -- A PARTY OF ONE GIVES WAY: sending an invite made it, and nobody is in it but this hero. With anyone else in it, it stays.
  if v_own is not null and (v_own = p_party or exists (select 1 from public.hunt_party_members m where m.party_id = v_own
                                                         and (m.user_id, m.slot) is distinct from (p_uid, p_slot))) then
    return jsonb_build_object('ok', false, 'error', 'already_in_party'); end if;
  if exists (select 1 from public.hunt_party_members m where m.party_id = p_party and m.user_id <> p_uid
               and public.hr_social_blocked(p_uid, m.user_id)) then
    return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
  if (select count(*) from public.hunt_party_members m where m.party_id = p_party) >= v_p.max_size then
    return jsonb_build_object('ok', false, 'error', 'party_full', 'max', v_p.max_size); end if;
  if v_own is not null then perform public.hr_party_drop(v_own, p_uid, p_slot); end if;
  perform public.hr_party_seat_into(p_party, p_uid, p_slot);
  return jsonb_build_object('ok', true, 'party', public.hr_hunt_party_view(p_uid, p_slot));
end $$;

-- ── §2 THE VERBS THAT TELL ──────────────────────────────────────────────────
create or replace function public.hr_hunt_party_decline(p_slot integer, p_invite uuid, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_from uuid; v_from_slot int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('hunt_party_decline', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('hunt_party_decline', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_invite is null then return public.hr_note_rejection('hunt_party_decline', p_slot, jsonb_build_object('ok', false, 'error', 'no_invite')); end if;
  v_verb := 'hunt_party_decline:' || p_invite;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('hunt_party_decline', p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  delete from public.hunt_party_invites i where i.id = p_invite and i.to_user = v_uid and i.to_slot = p_slot
    returning i.from_user, i.from_slot into v_from, v_from_slot;
  if not found then return public.hr_note_rejection('hunt_party_decline', p_slot, jsonb_build_object('ok', false, 'error', 'no_invite')); end if;
  -- PARTY-TRUTH (2027-02-18-party-truth.sql): the inviter hears the answer.
  perform public.hr_party_notice(v_from, v_from_slot, 'declined', v_uid, p_slot);
  v_r := jsonb_build_object('ok', true);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_hunt_party_kick(p_slot integer, p_seat integer, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  -- PARTY-SECURITY (2026-10-29-party-security.sql): a kicked hunter leaves at the next settle
  -- past the live horizon (2026-10-31-live-horizon.sql).
  c_verb constant text := 'hunt_party_kick';
  v_uid uuid := auth.uid(); v_r jsonb; v_pid uuid; v_p public.hunt_parties%rowtype; v_t record;
  v_s public.hunt_sessions%rowtype; v_leaving boolean := false;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_seat is null or p_seat < 0 or p_seat > 4 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_seat')); end if;
  v_pid := public.hr_hunt_party_of(v_uid, p_slot);
  if v_pid is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_party')); end if;
  select * into v_p from public.hunt_parties where id = v_pid for update;
  if not (v_p.leader_user = v_uid and v_p.leader_slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_leader')); end if;
  select m.user_id, m.slot into v_t from public.hunt_party_members m where m.party_id = v_pid and m.seat = p_seat;
  if v_t.user_id is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_seat')); end if;
  if v_t.user_id = v_uid and v_t.slot = p_slot then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_seat', 'why', 'self')); end if;
  -- A HUNTER OF THIS PARTY leaves its hunt at leave_at, exactly as its own Leave; out of the member set from then on.
  v_s := public.hr_hunt_lock(v_t.user_id, v_t.slot);
  if v_s.id is not null and v_s.instance_id = v_pid then
    v_leaving := true;
    -- ALWAYS PENDING (live-horizon, 2026-10-31): as its own Leave, never before the last swing shown.
    if v_s.leave_at is null and v_s.change_at is null then
      update public.hunt_sessions set leave_at = public.hr_hunt_live_horizon_at(v_s.settled_to), version = version + 1 where id = v_s.id;
    end if;
  end if;
  delete from public.hunt_party_members where party_id = v_pid and user_id = v_t.user_id and slot = v_t.slot;
  -- PARTY-TRUTH (2027-02-18-party-truth.sql): the removed hero hears who removed it.
  perform public.hr_party_notice(v_t.user_id, v_t.slot, 'removed', v_uid, p_slot);
  v_r := jsonb_build_object('ok', true, 'leaving', v_leaving, 'party', public.hr_hunt_party_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_hunt_party_disband(p_slot integer, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_party_disband';
  v_uid uuid := auth.uid(); v_r jsonb; v_pid uuid; v_p public.hunt_parties%rowtype; v_m record;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_pid := public.hr_hunt_party_of(v_uid, p_slot);
  if v_pid is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_party')); end if;
  select * into v_p from public.hunt_parties where id = v_pid for update;
  if not (v_p.leader_user = v_uid and v_p.leader_slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_leader')); end if;
  if exists (select 1 from public.hunt_sessions h where h.instance_id = v_pid and h.ended_at is null) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'party_hunting')); end if;
  -- PARTY-TRUTH (2027-02-18-party-truth.sql): every other seat hears who closed the party.
  for v_m in select m.user_id, m.slot from public.hunt_party_members m where m.party_id = v_pid order by m.seat loop
    perform public.hr_party_notice(v_m.user_id, v_m.slot, 'disbanded', v_uid, p_slot);
  end loop;
  delete from public.hunt_party_invites where party_id = v_pid;
  delete from public.hunt_party_members where party_id = v_pid;
  update public.hunt_parties set closed_at = now() where id = v_pid;
  v_r := jsonb_build_object('ok', true, 'party', null);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_hunt_party_leave(p_slot integer, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_party_leave';
  v_uid uuid := auth.uid(); v_r jsonb; v_s public.hunt_sessions%rowtype; v_pid uuid; v_p public.hunt_parties%rowtype;
  v_next record; v_m record;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_pid := public.hr_hunt_party_of(v_uid, p_slot);
  if v_pid is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_party')); end if;
  select * into v_p from public.hunt_parties where id = v_pid for update;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if v_s.id is not null and v_s.instance_id = v_pid then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunt_open')); end if;
  delete from public.hunt_party_members where party_id = v_pid and user_id = v_uid and slot = p_slot;
  if not exists (select 1 from public.hunt_party_members where party_id = v_pid) then
    update public.hunt_parties set closed_at = now() where id = v_pid;
  elsif v_p.leader_user = v_uid and v_p.leader_slot = p_slot then
    select m.user_id, m.slot into v_next from public.hunt_party_members m where m.party_id = v_pid order by m.seat limit 1;
    update public.hunt_parties set leader_user = v_next.user_id, leader_slot = v_next.slot where id = v_pid;
  end if;
  -- PARTY-TRUTH (2027-02-18-party-truth.sql): the seats left behind hear who went.
  for v_m in select m.user_id, m.slot from public.hunt_party_members m where m.party_id = v_pid order by m.seat loop
    perform public.hr_party_notice(v_m.user_id, v_m.slot, 'left', v_uid, p_slot);
  end loop;
  v_r := jsonb_build_object('ok', true, 'party', null);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_hunt_party_sweep(p_limit integer default 200)
returns integer language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_m record; v_n int := 0; v_o record;
begin
  for v_m in
    select m.party_id, m.user_id, m.slot
      from public.hunt_party_members m join public.hunt_parties p on p.id = m.party_id and p.closed_at is null
     where not exists (select 1 from public.hunt_sessions h where h.user_id = m.user_id and h.slot = m.slot and h.ended_at is null)
       and public.hr_party_last_seen(m.user_id, m.joined_at) <= now() - public.hr_party_seat_keep()
     order by m.joined_at, m.party_id, m.seat
     limit greatest(0, least(coalesce(p_limit, 200), 1000))
  loop
    perform 1 from public.hunt_parties where id = v_m.party_id and closed_at is null for update skip locked;
    continue when not found;
    -- Re-proved under the lock: still seated, still out of every hunt, still unseen.
    continue when not exists (select 1 from public.hunt_party_members m where m.party_id = v_m.party_id
                                and m.user_id = v_m.user_id and m.slot = v_m.slot
                                and public.hr_party_last_seen(m.user_id, m.joined_at) <= now() - public.hr_party_seat_keep())
               or exists (select 1 from public.hunt_sessions h where h.user_id = v_m.user_id and h.slot = v_m.slot and h.ended_at is null);
    perform public.hr_party_drop(v_m.party_id, v_m.user_id, v_m.slot);
    -- PARTY-TRUTH (2027-02-18-party-truth.sql): the seats left hear why one went.
    for v_o in select o.user_id, o.slot from public.hunt_party_members o where o.party_id = v_m.party_id order by o.seat loop
      perform public.hr_party_notice(v_o.user_id, v_o.slot, 'dropped', v_m.user_id, v_m.slot);
    end loop;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ── §4 WHY A FRIEND CAME HOME ───────────────────────────────────────────────
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
    -- PARTY-TRUTH (2027-02-18-party-truth.sql): what ended that member (stamina, left, gold_out ...), the same row's reason.
    'end_by_why', case when s.end_reason in ('party_member_died', 'party_member_left') then (
      select o.end_reason from public.hunt_sessions o
       where o.instance_id = s.instance_id and o.id <> s.id and o.ended_at = s.ended_at
         and o.end_reason <> all (array['party_member_died', 'party_member_left'])
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

-- ── §5 THE LEADER'S PICK WARNS FIRST ────────────────────────────────────────
create or replace function public.hr_hunt_party_warn(p_slot integer, p_hunt text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_party_warn';
  v_uid uuid := auth.uid(); v_r jsonb; v_pid uuid; v_p public.hunt_parties%rowtype; v_floor int; v_m record; v_lv int; v_under jsonb := '[]'::jsonb;
begin
  -- PARTY-TRUTH (2027-02-18-party-truth.sql): the floor stays a warning (Tyler 2026-10-18) and the pick the leader's (10-20):
  -- this refuses nothing and starts nothing. It says which seats stand under the ground, to the leader and to each of them.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_hunt is null or not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = p_hunt) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_ground')); end if;
  v_pid := public.hr_hunt_party_of(v_uid, p_slot);
  if v_pid is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_party')); end if;
  select * into v_p from public.hunt_parties where id = v_pid;
  if not (v_p.leader_user = v_uid and v_p.leader_slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_leader')); end if;
  select h.band_min into v_floor from public.hr_hunts h where h.hunt_id = p_hunt;
  if v_floor is not null then
    for v_m in select m.user_id, m.slot, m.seat from public.hunt_party_members m where m.party_id = v_pid order by m.seat loop
      v_lv := public.hr_level_of(v_m.user_id, v_m.slot);
      continue when v_lv >= v_floor;
      v_under := v_under || jsonb_build_array(jsonb_build_object('seat', v_m.seat, 'name', public.hr_character_name(v_m.user_id, v_m.slot), 'level', v_lv));
      perform public.hr_party_notice(v_m.user_id, v_m.slot, 'ground_warn', v_uid, p_slot, p_hunt);
    end loop;
  end if;
  v_r := jsonb_build_object('ok', true, 'floor', v_floor, 'under', v_under);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- ── THE GRANTS ──────────────────────────────────────────────────────────────
do $grants$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_party_notice(uuid,integer,text,uuid,integer,text)', 'public.hr_party_notices_view(uuid,integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then
        execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
end $grants$;
revoke execute on function public.hr_hunt_party_warn(integer, text, uuid) from public, anon, service_role;
grant  execute on function public.hr_hunt_party_warn(integer, text, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_hunt_party_warn';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_hunt_party_warn', 'p_slot integer, p_hunt text, p_idem uuid', 'authenticated',
   'added 2027-02-18: the leader, before Start, is told which seats stand under a ground, and each of them is told; display notices only; moves no value');

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ─────
do $$
declare
  c_a constant uuid := '000000d8-0000-4000-a000-00007f0c0001';
  c_b constant uuid := '000000d8-0000-4000-a000-00007f0c0002';
  c_c constant uuid := '000000d8-0000-4000-a000-00007f0c0003';
  k   text := '000000d8-0000-4000-a000-0000';
  v   jsonb; v_pid uuid; v_u uuid; v_hunt text; v_bow text; v_staff text; v_floor int; v_seat int; v_sa uuid; v_sb uuid; v_at timestamptz;
begin
  -- (a) THE SHAPE: the column is gone; the helpers are nobody's; the warn verb a signed-in client's; the surface agrees.
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hunt_party_members' and column_name = 'weapon_type') then
    raise exception 'party-truth §4(a): hunt_party_members.weapon_type survives'; end if;
  foreach v_hunt in array array['public.hr_party_notice(uuid,integer,text,uuid,integer,text)', 'public.hr_party_notices_view(uuid,integer)'] loop
    if has_function_privilege('anon', v_hunt::regprocedure, 'execute') or has_function_privilege('authenticated', v_hunt::regprocedure, 'execute')
       or has_function_privilege('service_role', v_hunt::regprocedure, 'execute') then
      raise exception 'party-truth §4(a): % is reachable by a client', v_hunt; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_hunt_party_warn(integer,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_hunt_party_warn(integer,text,uuid)', 'execute') then
    raise exception 'party-truth §4(a): the warn verb''s grants are wrong'; end if;
  if has_table_privilege('authenticated', 'public.party_notices', 'select') or has_table_privilege('anon', 'public.party_notices', 'select') then
    raise exception 'party-truth §4(a): party_notices is readable by a client'; end if;
  perform public.hr_assert_grant_hygiene(true);

  begin
    update public.hr_hunt_config set enabled = true where id;
    -- the first ground, and one whose floor a fresh hero stands under
    select g.hunt_id into v_hunt from public.hr_hunt_grounds g join public.hr_hunts h using (hunt_id) where coalesce(h.band_min, 0) > 1 order by h.band_min, g.hunt_id limit 1;
    select h.band_min into v_floor from public.hr_hunts h where h.hunt_id = v_hunt;
    select w.item_id into v_bow from public.hr_hunt_weapons w join public.hr_hunt_weapon_roles r on r.weapon_type = w.weapon_type where 'ranger' = any (r.roles) order by w.item_id limit 1;
    select w.item_id into v_staff from public.hr_hunt_weapons w join public.hr_hunt_weapon_roles r on r.weapon_type = w.weapon_type where 'healer' = any (r.roles) order by w.item_id limit 1;
    if v_hunt is null or v_bow is null or v_staff is null then raise exception 'party-truth §4-harness: no ground above the floor, bow or staff in the catalogues'; end if;
    foreach v_u in array array[c_a, c_b, c_c] loop
      insert into auth.users (id) values (v_u) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_u, 'Probe Truth ' || right(v_u::text, 1)) on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (v_u, 'party-truth §4 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_u::text, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'party-truth §4-harness: hr_create_character refused: %', v; end if;
      update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
      insert into public.social_presence (user_id, slot, seen_at) values (v_u, 0, now()) on conflict (user_id) do update set seen_at = now();
      delete from public.hr_rate_counters where user_id = v_u;
    end loop;

    -- (b) A CROSSING INVITE: A and B invite each other; A's Join seats it, A's party of one is gone, B's party holds both.
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_hunt_party_invite(0, 'Probe Truth 2', (k || '7f0c0101')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-truth §4-harness: A''s invite answered %', v; end if;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_hunt_party_invite(0, 'Probe Truth 1', (k || '7f0c0102')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-truth §4-harness: B''s invite answered %', v; end if;
    v_pid := public.hr_hunt_party_of(c_b, 0);
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_hunt_party_accept(0, (public.hr_state_of(c_a, 0)->'party_invites'->0->>'id')::uuid, (k || '7f0c0103')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or public.hr_hunt_party_of(c_a, 0) is distinct from v_pid then
      raise exception 'party-truth §4(b): a crossing invite is still a dead end: %', v; end if;
    if exists (select 1 from public.hunt_party_invites i where i.to_user = c_b) then raise exception 'party-truth §4(b): the given-up party''s invite survives'; end if;

    -- (c) ANYONE ELSE IN IT: the party is kept, and the words have their code.
    perform set_config('request.jwt.claim.sub', c_c::text, true);
    v := public.hr_hunt_party_invite(0, 'Probe Truth 1', (k || '7f0c0104')::uuid);
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_hunt_party_accept(0, (public.hr_state_of(c_a, 0)->'party_invites'->0->>'id')::uuid, (k || '7f0c0105')::uuid);
    if v->>'error' is distinct from 'already_in_party' or public.hr_hunt_party_of(c_a, 0) is distinct from v_pid then
      raise exception 'party-truth §4(c): a hero with company left it for an invite: %', v; end if;

    -- (d) A DECLINE TELLS THE INVITER, by name, once in its section. A's answer to C.
    delete from public.hr_rate_counters where user_id in (c_a, c_b, c_c);
    v := public.hr_hunt_party_decline(0, (public.hr_state_of(c_a, 0)->'party_invites'->0->>'id')::uuid, (k || '7f0c0106')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-truth §4-harness: the decline answered %', v; end if;
    v := public.hr_state_of(c_c, 0)->'party_notices';
    if jsonb_array_length(v) <> 1 or v->0->>'kind' <> 'declined' or v->0->>'who' <> 'Probe Truth 1' then
      raise exception 'party-truth §4(d): the inviter''s section reads %', v; end if;
    if jsonb_array_length(public.hr_state_of(c_a, 0)->'party_notices') <> 0 then raise exception 'party-truth §4(d): the decliner got its own notice'; end if;

    -- (e) THE ROLE IS WHAT IS WORN NOW, in the view and the finder; a swap nudges the seat-mate open in a client.
    insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (c_a, 0, 'weapon', v_bow)
      on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id;
    delete from public.player_equipment where user_id = c_a and slot = 0 and equip_slot = 'shield';
    if (select e->>'weapon' from jsonb_array_elements(public.hr_hunt_party_view(c_b, 0)->'members') e where e->>'name' = 'Probe Truth 1') is distinct from public.hr_hunt_weapon_of(c_a, 0) then
      raise exception 'party-truth §4(e): B''s view of A does not read what A wears: %', public.hr_hunt_party_view(c_b, 0)->'members'; end if;
    if public.hr_party_seat_role(v_pid, c_a, 0) is distinct from 'ranger' then
      raise exception 'party-truth §4(e): the probe bow plays %', public.hr_party_seat_role(v_pid, c_a, 0); end if;

    -- (f) THE WARNING: a member refused; the leader told who stands under; that seat's section names the ground.
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    delete from public.hr_rate_counters where user_id in (c_a, c_b, c_c);
    v := public.hr_hunt_party_warn(0, v_hunt, (k || '7f0c0107')::uuid);
    if v->>'error' is distinct from 'not_leader' then raise exception 'party-truth §4(f): a member warned: %', v; end if;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_hunt_party_warn(0, 'no_such_ground', (k || '7f0c0108')::uuid);
    if v->>'error' is distinct from 'no_ground' then raise exception 'party-truth §4(f): a ground off the catalogue answered %', v; end if;
    v := public.hr_hunt_party_warn(0, v_hunt, (k || '7f0c0109')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'floor')::int <> v_floor or jsonb_array_length(v->'under') <> 2 then
      raise exception 'party-truth §4(f): the leader was answered % (floor %)', v, v_floor; end if;
    v := public.hr_state_of(c_a, 0)->'party_notices'->0;
    if v->>'kind' <> 'ground_warn' or v->>'hunt' <> v_hunt or v->>'who' <> 'Probe Truth 2' then raise exception 'party-truth §4(f): the member under the floor reads %', v; end if;

    -- (g) WHY A FRIEND CAME HOME, and the warning before it: a stamina end names stamina, the view warns at 15 min.
    delete from public.hr_rate_counters where user_id in (c_a, c_b, c_c);
    select g.hunt_id into v_hunt from public.hr_hunt_grounds g left join public.hr_hunts h using (hunt_id) order by coalesce(h.band_min, 0), g.hunt_id limit 1;
    v := public.hr_hunt_party_start(0, v_hunt, (k || '7f0c0110')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-truth §4-harness: the start answered %', v; end if;
    select id into v_sa from public.hunt_sessions where user_id = c_a and ended_at is null;
    select id into v_sb from public.hunt_sessions where user_id = c_b and ended_at is null;
    update public.player_state set stamina_ms = 600000, stamina_at = now() where user_id = c_b and slot = 0;
    update public.player_state set stamina_ms = 3600000, stamina_at = now() where user_id = c_a and slot = 0;
    v := public.hr_hunt_party_view(c_a, 0)->'members';
    if (select (e->>'stamina_low_ms')::bigint from jsonb_array_elements(v) e where e->>'name' = 'Probe Truth 2') is distinct from 600000
       or (select e->>'stamina_low_ms' from jsonb_array_elements(v) e where e->>'name' = 'Probe Truth 1') is not null then
      raise exception 'party-truth §4(g): the low-stamina warning reads %', v; end if;
    v_at := now();
    perform public.hr_hunt_close(v_sb, 'stamina', v_at, true);
    perform public.hr_hunt_close(v_sa, 'party_member_left', v_at, true);
    v := public.hr_hunt_view(v_sa);
    if v->>'end_by' <> 'Probe Truth 2' or v->>'end_by_why' is distinct from 'stamina' then
      raise exception 'party-truth §4(g): the hero sent home reads by % why %', v->>'end_by', v->>'end_by_why'; end if;
    if public.hr_hunt_view(v_sb)->>'end_by_why' is not null then raise exception 'party-truth §4(g): a hero''s own end names a cause'; end if;

    -- (h) REMOVED, LEFT, DISBANDED each reach the other account; the actor's own account hears nothing of its own.
    perform set_config('request.jwt.claim.sub', c_c::text, true);
    delete from public.hr_rate_counters where user_id in (c_a, c_b, c_c);
    v := public.hr_hunt_party_leave(0, (k || '7f0c0111')::uuid);  -- C leaves the party of one it made: nobody to tell
    v := public.hr_hunt_party_invite(0, 'Probe Truth 1', (k || '7f0c0112')::uuid);
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_hunt_party_invite(0, 'Probe Truth 3', (k || '7f0c0113')::uuid);
    perform set_config('request.jwt.claim.sub', c_c::text, true);
    v := public.hr_hunt_party_accept(0, (public.hr_state_of(c_c, 0)->'party_invites'->0->>'id')::uuid, (k || '7f0c0114')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-truth §4-harness: C''s join answered %', v; end if;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v_seat := (select seat from public.hunt_party_members where user_id = c_a and slot = 0);
    v := public.hr_hunt_party_kick(0, v_seat, (k || '7f0c0115')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-truth §4-harness: the kick answered %', v; end if;
    if not (public.hr_state_of(c_a, 0)->'party_notices') @> '[{"kind": "removed", "who": "Probe Truth 2"}]'::jsonb then
      raise exception 'party-truth §4(h): the removed hero reads %', public.hr_state_of(c_a, 0)->'party_notices'; end if;
    delete from public.hr_rate_counters where user_id in (c_a, c_b, c_c);
    v := public.hr_hunt_party_disband(0, (k || '7f0c0116')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or not (public.hr_state_of(c_c, 0)->'party_notices') @> '[{"kind": "disbanded", "who": "Probe Truth 2"}]'::jsonb then
      raise exception 'party-truth §4(h): the seat left behind reads % after %', public.hr_state_of(c_c, 0)->'party_notices', v; end if;
    if exists (select 1 from public.party_notices n where n.user_id = n.actor_user) then raise exception 'party-truth §4(h): an account was told of its own move'; end if;
    raise exception 'party-truth §4: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'party-truth §4: ok' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  raise notice 'party-truth: the role is what is worn; a refusal, a removal, a crossing invite and a friend''s stamina each say so; nothing else moves; all green';
end $$;
