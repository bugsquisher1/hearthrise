-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — HUNT SESSIONS: THE DATABASE HALF (lane C1, ruling HR-2026-10-14
-- "Hunt Sessions replace away", §2 / §4 / §5 row C1).
-- Depends on 2026-10-21-hunt-sessions-catalogue.generated.sql (the catalogue
-- every intent here is validated against) and 2026-10-20-hunts-* (hr_hunts,
-- hr_hunt_gate).
--
-- ── WHAT A HUNT IS, IN ROWS ─────────────────────────────────────────────────
--   hunt_sessions        one row per hunt; AT MOST ONE OPEN per character
--                        (partial unique index on ended_at is null).
--                        prev_session_id links a hunt to the one it changed from.
--   hunt_bag             the packed supplies: (session, item) -> loaded / left.
--                        CHECK 0 <= qty_left <= qty_loaded; at most 10 lines
--                        (trigger). Bagged items are NOT in player_inventory, so
--                        nothing that sells, trades, lists, banks, deposits or
--                        eats from inventory can reach them: every such verb
--                        reads player_inventory under the same character lock.
--   hunt_session_tally   one row per session. coins / xp / loot / kills /
--                        deaths / supplies are FOLDED FROM player_ledger rows
--                        stamped with the session (never taken from a caller),
--                        so "tally = Σ ledger" holds by construction.
--                        down_ms / paid_ms / raw_xp are display figures from
--                        the engine, clamped to the settled window.
--   hunt_session_events  the timeline (entered, level_up, rare_drop, fall,
--                        slot_dry, vigour_low, ended), written in the same
--                        transaction as the settle that caused them. Every
--                        event is DERIVED by Postgres from the rows it wrote;
--                        the engine may only supply a time hint (clamped into
--                        the window) and the rare-drop item (accepted only if
--                        this settle's own ledger rows looted it).
--   player_action_sets   up to 5 presets x 10 slots x 3 conditions. Stored in
--                        canonical form rebuilt here; every subject, operator,
--                        parameter and value is checked against the catalogue
--                        and a value outside its range is REFUSED, never
--                        clamped (src/data/rule-subjects.js is explicit).
--   player_ledger.session_id   stamped on every ledger row a session's
--                        transaction writes: explicitly by these RPCs, and by
--                        a BEFORE INSERT trigger from the transaction-local GUC
--                        `hr.hunt_session` for rows another writer (hr_apply,
--                        under C2's settle) inserts. The trigger stamps only a
--                        session that belongs to the row's own (user, slot).
--   hr_hunt_config       the operator kill switch (operator_tunable), SEEDED OFF:
--                        no hunt opens until C2 deploys and flips it.
--
-- ── THE CLIENT SURFACE (ids and small whole numbers only) ───────────────────
--   hr_hunt_enter(slot, hunt, bag[{item,qty,essential?}], preset, falls, hours, idem)
--   hr_hunt_leave(slot, idem)            hr_hunt_change(slot, hunt, idem)
--   hr_hunt_restock(slot, item, qty, idem)
--   hr_hunt_use(slot, bar_slot, idem)    hr_hunt_set_preset(slot, preset, idem)
--   hr_action_set_put(slot, preset, name, slots, idem)
--   hr_action_set_delete(slot, preset, idem)
--   hr_mark_seen(slot, session, event_id)   (moves a read cursor forward only)
--   hr_hunt_analyzer(slot, session)         (read; Gold at vendor value, Waste,
--                                            Balance, per hour, ETA, lasts ~Xh)
-- No time, HP, count, loot or price crosses from the client. Every writer:
-- rate gate (hr_rpc_gate buckets hunt 30/min, hunt_use 60/min, hunt_read
-- 60/min), idempotency key (player_intents, per (key, intent, slot)), the
-- character lock (the SAME advisory key hr_apply and hr_tick_settle take, so
-- a session verb and a settle serialise), journal, version bump.
--
-- ── THE SETTLE APPLIER (owner-only here; lane C2 grants it to the engine) ───
--   hr_hunt_settle_session(user, slot, session, delta) — Edge proposes, Postgres
--   decides: swing CAS (stale refused), window bounds (server clock), per-group
--   use caps from the cooldown catalogue (a manual press can re-order uses but
--   never add one), bag sufficiency, presses only shrink, falls equal the death
--   rows stamped in this transaction, every end reason re-proved from server
--   state, and an end the engine owed but did not report is refused. Every
--   refusal RAISES (hr_reject) so the hr_apply that ran before it in the same
--   transaction rolls back with it; SECURITY DEFINER. Writes ONE
--   consumption row per settle (items in meta.items): the accrue row's own rate
--   under the world tick's flush/fold, never per swing (journal aggregates).
--
-- ── SCALE (100x: ~600 hunters) ──────────────────────────────────────────────
--   ledger   +1 consumption row per settle that used anything (<= the accrue
--            rows the same settle writes: 120-960 per hunting character-day)
--            plus 2 rows per pack / restock / return line (a handful a hunt).
--   sessions a few per character-day; the last 20 kept (older pruned at enter).
--   events   ~5-30 per session, <= 512 B each; tally 1 row per session.
--
-- ── SEED (ruling §4, engine lane E) ─────────────────────────────────────────
--   ONE secret seed per session: hr_seed(user, slot, 'hunt:' || session_id),
--   fetched once per settle by the settler and mixed per swing with the label
--   'hunt:<session>:<swing_index>' (src/core/action-rules.js huntSwingSeed).
--   No column holds it and no client role can call hr_seed. Recorded for
--   Security in .claude/coordination/CONFLICTS.md.
--
-- ── WHAT THIS FILE DOES NOT DO ──────────────────────────────────────────────
--   Settle anything (C2: the world tick calls the applier inside one locked
--   transaction with hr_apply), project sessions into hr_state_of (C2/B1; the
--   tables are own-row readable), or drop the away objects (staged separately:
--   2026-10-22-hunt-sessions-drop-away.sql, ordered after C2).
--
-- REVERT (targeted): drop the ten client RPCs and their baseline rows, the
-- internals, the two triggers, the six tables, player_ledger.session_id; restate
-- hr_rpc_gate from its pre-image (md5 f04a3c97af94a538eb01a7f5521fc37b);
-- narrow player_ledger_kind_check by removing 'hunt' (only if no such row).
-- No begin/commit (CLAUDE.md §2 — tools/apply-migration.mjs sends one batch).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ───────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_hunt_supplies') is null or to_regclass('public.hr_hunt_limits') is null
     or to_regclass('public.hr_hunts') is null or to_regprocedure('public.hr_hunt_gate(uuid,integer,text)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null or to_regclass('public.hr_client_rpc_baseline') is null
     or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null
     or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_vigour_of(uuid,integer)') is null then
    raise exception 'PRECONDITION: the hunt-session catalogue, hr_hunts / hr_hunt_gate, hr_rpc_gate, the RPC baseline, hr_intent_replay, hr_note_rejection or hr_vigour_of is absent';
  end if;
end $mig$;

-- ── §1 TABLES ──────────────────────────────────────────────────────────────
-- THE KILL SWITCH SHIPS OFF (Security GO-WITH-CHANGES on e482cc54, item 1).
-- Between this apply and lane C2 the old accrue / world-tick path still pays a
-- combat pointer, and hr_hunt_enter points the character at combat:<hunt>; an
-- open session would then be paid once by that path and again by C2's first
-- settle. So no hunt can open until C2 deploys and flips `enabled` in its own
-- reviewed file. `on conflict do nothing`: a re-apply never re-closes a switch
-- an operator (or C2) has opened.
create table if not exists public.hr_hunt_config (
  id      boolean primary key default true check (id),
  enabled boolean not null default false
);
insert into public.hr_hunt_config (id, enabled) values (true, false) on conflict (id) do nothing;

create table if not exists public.hunt_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  slot            int  not null,
  hunt_id         text not null check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  prev_session_id uuid references public.hunt_sessions (id) on delete set null,
  preset          smallint not null default 0 check (preset between 0 and 4),
  falls_limit     smallint not null check (falls_limit between 1 and 6),
  hours_limit     smallint check (hours_limit between 1 and 24),
  entered_at      timestamptz not null default now(),
  hunt_from       timestamptz not null,
  settled_to      timestamptz not null,
  next_swing_at   timestamptz not null,
  swing_index     bigint not null default 0 check (swing_index >= 0),
  falls           int not null default 0 check (falls >= 0),
  down            boolean not null default false,
  cooldowns       jsonb not null default '{}'::jsonb check (jsonb_typeof(cooldowns) = 'object'),
  presses         jsonb not null default '[]'::jsonb check (jsonb_typeof(presses) = 'array' and jsonb_array_length(presses) <= 10),
  leave_at        timestamptz,
  change_at       timestamptz,
  change_to       text check (change_to ~ '^[a-z0-9_]{1,64}$'),
  ended_at        timestamptz,
  end_reason      text check (end_reason in ('falls', 'heals_out', 'ammo_out', 'vigour', 'hours', 'left', 'changed', 'server')),
  seen_event_id   bigint not null default 0,
  version         bigint not null default 0,
  constraint hunt_sessions_char_fk foreign key (user_id, slot)
    references public.player_state (user_id, slot) on delete cascade,
  constraint hunt_sessions_end_ck check ((ended_at is null) = (end_reason is null)),
  constraint hunt_sessions_change_ck check ((change_at is null) = (change_to is null)),
  constraint hunt_sessions_clock_ck check (hunt_from >= entered_at and settled_to >= hunt_from)
);
create unique index if not exists hunt_sessions_one_open on public.hunt_sessions (user_id, slot) where ended_at is null;
create index if not exists hunt_sessions_char_recent on public.hunt_sessions (user_id, slot, entered_at desc);
create index if not exists hunt_sessions_prev on public.hunt_sessions (prev_session_id) where prev_session_id is not null;

create table if not exists public.hunt_bag (
  session_id uuid not null references public.hunt_sessions (id) on delete cascade,
  user_id    uuid not null,
  slot       int  not null,
  item_id    text not null check (item_id ~ '^[a-z0-9_]{1,64}$'),
  qty_loaded bigint not null check (qty_loaded >= 0 and qty_loaded <= 1000000),
  qty_left   bigint not null,
  essential  boolean not null,
  primary key (session_id, item_id),
  constraint hunt_bag_left_ck check (qty_left >= 0 and qty_left <= qty_loaded)
);

create table if not exists public.hunt_session_tally (
  session_id uuid primary key references public.hunt_sessions (id) on delete cascade,
  user_id    uuid not null,
  slot       int  not null,
  kills      bigint not null default 0 check (kills >= 0),
  xp         jsonb  not null default '{}'::jsonb check (jsonb_typeof(xp) = 'object'),
  raw_xp     jsonb  not null default '{}'::jsonb check (jsonb_typeof(raw_xp) = 'object'),
  coins      bigint not null default 0,
  loot       jsonb  not null default '{}'::jsonb check (jsonb_typeof(loot) = 'object'),
  supplies   jsonb  not null default '{}'::jsonb check (jsonb_typeof(supplies) = 'object'),
  deaths     int    not null default 0 check (deaths >= 0),
  down_ms    bigint not null default 0 check (down_ms >= 0),
  paid_ms    bigint not null default 0 check (paid_ms >= 0),
  ledger_hwm bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.hunt_session_events (
  id         bigint generated always as identity primary key,
  session_id uuid not null references public.hunt_sessions (id) on delete cascade,
  user_id    uuid not null,
  slot       int  not null,
  type       text not null check (type in ('entered', 'level_up', 'rare_drop', 'fall', 'slot_dry', 'vigour_low', 'ended')),
  at         timestamptz not null,
  data       jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 512)
);
create index if not exists hunt_session_events_session on public.hunt_session_events (session_id, id);

create table if not exists public.player_action_sets (
  user_id    uuid not null,
  slot       int  not null,
  preset     smallint not null check (preset between 0 and 4),
  name       text not null check (char_length(name) between 1 and 32),
  slots      jsonb not null check (jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) <= 10),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot, preset),
  constraint player_action_sets_char_fk foreign key (user_id, slot)
    references public.player_state (user_id, slot) on delete cascade
);

-- RLS: own rows readable, NO write policy anywhere. Every write is an RPC below.
do $mig$
declare v_t text;
begin
  foreach v_t in array array['hunt_sessions', 'hunt_bag', 'hunt_session_tally', 'hunt_session_events', 'player_action_sets'] loop
    execute format('alter table public.%I enable row level security', v_t);
    execute format('drop policy if exists %I on public.%I', v_t || ' own read', v_t);
    execute format('create policy %I on public.%I for select using ((select auth.uid()) = user_id)', v_t || ' own read', v_t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', v_t);
    execute format('grant select on public.%I to authenticated, service_role', v_t);
  end loop;
end $mig$;
alter table public.hr_hunt_config enable row level security;
revoke all on public.hr_hunt_config from public, anon, authenticated, service_role;

-- ── §2 THE LEDGER: kind 'hunt' and session_id ───────────────────────────────
alter table public.player_ledger add column if not exists session_id uuid;
create index if not exists player_ledger_session on public.player_ledger (session_id, id) where session_id is not null;

do $mig$
declare v_def text; v_new text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'public.player_ledger'::regclass and conname = 'player_ledger_kind_check';
  if v_def is null then raise exception 'player_ledger_kind_check is absent'; end if;
  if strpos(v_def, '''hunt''::text') > 0 then
    raise notice 'player_ledger.kind already admits ''hunt'''; return; end if;
  if array_length(string_to_array(v_def, '''accrue''::text'), 1) <> 2 then
    raise exception 'player_ledger_kind_check has no single ''accrue''::text anchor (%) — refusing to widen blind', v_def; end if;
  v_new := replace(v_def, '''accrue''::text', '''hunt''::text, ''accrue''::text');
  execute 'alter table public.player_ledger drop constraint player_ledger_kind_check';
  execute 'alter table public.player_ledger add constraint player_ledger_kind_check ' || v_new;
end $mig$;

-- THE STAMP. A row another writer inserts inside a session's transaction (C2
-- sets the GUC before hr_apply) carries the session, but only a session of the
-- row's own character: a clan or market row for another user in the same
-- transaction is left alone. Never raises; never overwrites an explicit stamp.
create or replace function public.hr_ledger_session_stamp()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
declare v_s text := current_setting('hr.hunt_session', true);
begin
  if v_s ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and exists (select 1 from public.hunt_sessions h
                  where h.id = v_s::uuid and h.user_id = new.user_id and h.slot = new.slot) then
    new.session_id := v_s::uuid;
  end if;
  return new;
end $$;
revoke execute on function public.hr_ledger_session_stamp() from public, anon, authenticated, service_role;
drop trigger if exists hr_ledger_session_stamp on public.player_ledger;
create trigger hr_ledger_session_stamp before insert on public.player_ledger
  for each row when (new.session_id is null and coalesce(current_setting('hr.hunt_session', true), '') <> '')
  execute function public.hr_ledger_session_stamp();

-- THE POINTER GUARD. While a hunt is open the character's activity pointer is
-- the session's; any writer that moves it (an activity switch through hr_apply,
-- a party start) is refused `hunt_open`. Only the session verbs below move it,
-- and they hold `hr.hunt_ptr` = 'on' for exactly that one statement.
create or replace function public.hr_hunt_pointer_guard()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  if coalesce(current_setting('hr.hunt_ptr', true), '') <> 'on'
     and exists (select 1 from public.hunt_sessions h
                  where h.user_id = old.user_id and h.slot = old.slot and h.ended_at is null) then
    perform public.hr_reject('hunt_open', jsonb_build_object('active_kind', old.active_kind, 'active_id', old.active_id));
  end if;
  return new;
end $$;
revoke execute on function public.hr_hunt_pointer_guard() from public, anon, authenticated, service_role;
drop trigger if exists hr_hunt_pointer_guard on public.player_state;
create trigger hr_hunt_pointer_guard before update on public.player_state
  for each row when (old.active_kind is distinct from new.active_kind or old.active_id is distinct from new.active_id)
  execute function public.hr_hunt_pointer_guard();

-- THE BAG-LINE FUSE (ruling: at most 10 lines). The RPCs refuse first with a
-- machine code; this makes the rule a property of the table.
create or replace function public.hr_hunt_bag_fuse()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  if (select count(*) from public.hunt_bag b where b.session_id = new.session_id)
     >= coalesce((select value from public.hr_hunt_limits where key = 'bag_lines'), 0) then
    raise exception 'hunt_bag: session % already holds the maximum number of lines', new.session_id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function public.hr_hunt_bag_fuse() from public, anon, authenticated, service_role;
drop trigger if exists hr_hunt_bag_fuse on public.hunt_bag;
create trigger hr_hunt_bag_fuse before insert on public.hunt_bag
  for each row execute function public.hr_hunt_bag_fuse();

-- ── §3 INTERNALS (owner-only: no role may execute them) ────────────────────
create or replace function public.hr_hunt_limit(p_key text)
returns int language sql stable set search_path = public, pg_catalog as $$
  select value from public.hr_hunt_limits where key = p_key
$$;

-- Sum two {key: number} objects key by key.
create or replace function public.hr_jsonb_add(p_a jsonb, p_b jsonb)
returns jsonb language sql immutable set search_path = public, pg_catalog as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
    select k, sum(v) as v from (
      select key as k, value::numeric as v from jsonb_each_text(coalesce(p_a, '{}'::jsonb))
      union all
      select key, value::numeric from jsonb_each_text(coalesce(p_b, '{}'::jsonb))) s
    group by k) t
$$;

-- The two ledger rows of one inventory <-> bag (or bag <-> bag) move. They
-- cancel: the `inventory` side and the `bag` side carry opposite quantities.
create or replace function public.hr_hunt_ledger_pair(p_user uuid, p_slot int, p_from_session uuid,
  p_to_session uuid, p_item text, p_qty bigint, p_intent text)
returns void language plpgsql set search_path = public, pg_catalog as $$
begin
  if p_qty is null or p_qty <= 0 then return; end if;
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta, session_id)
  values (p_user, p_slot, 'hunt', p_intent, p_item, -p_qty,
          jsonb_build_object('side', case when p_from_session is null then 'inventory' else 'bag' end),
          p_from_session),
         (p_user, p_slot, 'hunt', p_intent, p_item, p_qty,
          jsonb_build_object('side', case when p_to_session is null then 'inventory' else 'bag' end),
          p_to_session);
end $$;

-- An engine time hint (epoch ms) as a timestamp, or NULL when it is not a
-- plain whole number. Callers clamp it into the settled window.
create or replace function public.hr_hunt_hint_at(p_v jsonb)
returns timestamptz language sql immutable set search_path = public, pg_catalog as $$
  select case when jsonb_typeof(p_v) = 'number' and (p_v #>> '{}') ~ '^[0-9]{1,15}$'
              then to_timestamp((p_v #>> '{}')::numeric / 1000.0) end
$$;

-- What a client is shown about one session: the row, its bag and its tally.
create or replace function public.hr_hunt_view(p_session uuid)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  select jsonb_build_object(
    'id', s.id, 'hunt', s.hunt_id, 'prev', s.prev_session_id, 'preset', s.preset,
    'falls_limit', s.falls_limit, 'hours_limit', s.hours_limit,
    'entered_at', s.entered_at, 'hunt_from', s.hunt_from, 'settled_to', s.settled_to,
    'falls', s.falls, 'down', s.down, 'presses', s.presses,
    'leave_at', s.leave_at, 'change_at', s.change_at, 'change_to', s.change_to,
    'ended_at', s.ended_at, 'end_reason', s.end_reason, 'home_at',
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
                       'supplies', t.supplies, 'deaths', t.deaths, 'down_ms', t.down_ms, 'paid_ms', t.paid_ms)
              from public.hunt_session_tally t where t.session_id = s.id))
  from public.hunt_sessions s where s.id = p_session
$$;

-- The effective slots of a preset: the stored row, or the catalogue default for
-- preset 0 when the character never saved one. NULL: no such preset.
create or replace function public.hr_hunt_preset_slots(p_user uuid, p_slot int, p_preset int)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  select coalesce(
    (select a.slots from public.player_action_sets a where a.user_id = p_user and a.slot = p_slot and a.preset = p_preset),
    (select d.slots from public.hr_hunt_default_preset d where d.id and p_preset = 0))
$$;

-- An action bar, validated against the catalogue and rebuilt in canonical form.
-- Returns {ok:true, slots} or {ok:false, error:'bad_slots', why, at}.
create or replace function public.hr_hunt_slots_check(p_slots jsonb)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare
  v_max_slots int := public.hr_hunt_limit('slots');
  v_max_conds int := public.hr_hunt_limit('conditions');
  v_out  jsonb := '[]'::jsonb;
  v_s    jsonb; v_c jsonb; v_conds jsonb;
  v_i    int := 0;
  v_item text; v_subj text; v_base text; v_param text; v_op text;
  v_spec public.hr_hunt_rule_subjects%rowtype;
  v_val  numeric;
  bad    constant text := 'bad_slots';
begin
  if v_max_slots is null or v_max_conds is null then
    return jsonb_build_object('ok', false, 'error', bad, 'why', 'catalogue_missing'); end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    return jsonb_build_object('ok', false, 'error', bad, 'why', 'not_an_array'); end if;
  if jsonb_array_length(p_slots) > v_max_slots then
    return jsonb_build_object('ok', false, 'error', bad, 'why', 'too_many_slots', 'max', v_max_slots); end if;
  for v_s in select value from jsonb_array_elements(p_slots) loop
    if jsonb_typeof(v_s) <> 'object' or exists (select 1 from jsonb_object_keys(v_s) k where k not in ('item', 'on', 'conditions')) then
      return jsonb_build_object('ok', false, 'error', bad, 'why', 'slot_shape', 'at', v_i); end if;
    v_item := case when jsonb_typeof(v_s->'item') = 'string' then v_s->>'item' end;
    if v_item is null or not (v_item = '*heal' or exists (select 1 from public.hr_hunt_supplies p
                                                            where p.item_id = v_item and p.kind in ('heal', 'buff'))) then
      return jsonb_build_object('ok', false, 'error', bad, 'why', 'item_not_fireable', 'at', v_i); end if;
    if jsonb_typeof(v_s->'on') is distinct from 'boolean' then
      return jsonb_build_object('ok', false, 'error', bad, 'why', 'on_not_boolean', 'at', v_i); end if;
    v_conds := coalesce(v_s->'conditions', '[]'::jsonb);
    if jsonb_typeof(v_conds) <> 'array' or jsonb_array_length(v_conds) > v_max_conds then
      return jsonb_build_object('ok', false, 'error', bad, 'why', 'too_many_conditions', 'at', v_i, 'max', v_max_conds); end if;
    for v_c in select value from jsonb_array_elements(v_conds) loop
      if jsonb_typeof(v_c) <> 'object' or exists (select 1 from jsonb_object_keys(v_c) k where k not in ('subject', 'op', 'value')) then
        return jsonb_build_object('ok', false, 'error', bad, 'why', 'condition_shape', 'at', v_i); end if;
      v_subj := case when jsonb_typeof(v_c->'subject') = 'string' then v_c->>'subject' end;
      if v_subj is null or v_subj !~ '^[a-z0-9_]{1,64}(:[a-z0-9_]{1,64})?$' then
        return jsonb_build_object('ok', false, 'error', bad, 'why', 'subject_shape', 'at', v_i); end if;
      v_base := split_part(v_subj, ':', 1);
      v_param := nullif(split_part(v_subj, ':', 2), '');
      select * into v_spec from public.hr_hunt_rule_subjects where subject = v_base;
      if not found then
        return jsonb_build_object('ok', false, 'error', bad, 'why', 'unknown_subject', 'at', v_i); end if;
      if (v_spec.param is null) <> (v_param is null)
         or (v_spec.param = 'buff' and not exists (select 1 from public.hr_hunt_buff_types b where b.buff_type = v_param))
         or (v_spec.param = 'item' and not exists (select 1 from public.hr_hunt_supplies p where p.item_id = v_param)) then
        return jsonb_build_object('ok', false, 'error', bad, 'why', 'bad_param', 'at', v_i); end if;
      if v_spec.lo is null then
        if v_c ? 'op' or v_c ? 'value' then
          return jsonb_build_object('ok', false, 'error', bad, 'why', 'takes_no_value', 'at', v_i); end if;
      else
        v_op := case when jsonb_typeof(v_c->'op') = 'string' then v_c->>'op' end;
        if v_op is null or v_op not in ('<=', '>=') then
          return jsonb_build_object('ok', false, 'error', bad, 'why', 'bad_op', 'at', v_i); end if;
        if jsonb_typeof(v_c->'value') is distinct from 'number' then
          return jsonb_build_object('ok', false, 'error', bad, 'why', 'value_not_number', 'at', v_i); end if;
        v_val := (v_c->>'value')::numeric;
        if v_val <> trunc(v_val) or v_val < v_spec.lo or v_val > v_spec.hi then
          return jsonb_build_object('ok', false, 'error', bad, 'why', 'value_out_of_range', 'at', v_i,
                                    'lo', v_spec.lo, 'hi', v_spec.hi); end if;
      end if;
    end loop;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'item', v_item, 'on', (v_s->>'on')::boolean,
      'conditions', coalesce((select jsonb_agg(case when s.lo is null
                                                    then jsonb_build_object('subject', c->>'subject')
                                                    else jsonb_build_object('subject', c->>'subject', 'op', c->>'op',
                                                                            'value', (c->>'value')::numeric::bigint) end
                                               order by o)
                              from jsonb_array_elements(v_conds) with ordinality as e(c, o)
                              join public.hr_hunt_rule_subjects s on s.subject = split_part(c->>'subject', ':', 1)),
                             '[]'::jsonb)));
    v_i := v_i + 1;
  end loop;
  return jsonb_build_object('ok', true, 'slots', v_out);
end $$;

-- May this character fight this hunt? NULL when yes, else the refusal. A named
-- hunt asks hr_hunt_gate (band floor + every spawn's own gate); a training hunt
-- asks its one monster's requirement, exactly as hr_hunt_gate asks a spawn's.
create or replace function public.hr_hunt_admit(p_user uuid, p_slot int, p_hunt text)
returns jsonb language plpgsql set search_path = public, pg_catalog as $$
declare v_training boolean;
begin
  select training into v_training from public.hr_hunt_travel where hunt_id = p_hunt;
  if v_training is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_hunt', 'hunt', p_hunt); end if;
  if not v_training then
    begin
      perform public.hr_hunt_gate(p_user, p_slot, p_hunt);
    exception when sqlstate 'HR000' then
      return jsonb_build_object('ok', false, 'error', sqlerrm, 'hunt', p_hunt);
    end;
    return null;
  end if;
  if exists (select 1 from public.hr_activities a
              where a.kind = 'combat' and a.activity_id = p_hunt
                and (a.is_boss
                     or (a.req_skill is not null and a.req_lv is not null
                         and coalesce((select public.hr_level_from_xp(ps.xp) from public.player_skills ps
                                        where ps.user_id = p_user and ps.slot = p_slot
                                          and ps.skill_id = a.req_skill), 1) < a.req_lv)))
     or not exists (select 1 from public.hr_activities a where a.kind = 'combat' and a.activity_id = p_hunt) then
    return jsonb_build_object('ok', false, 'error', 'activity_locked', 'hunt', p_hunt);
  end if;
  return null;
end $$;

-- Move the character's activity pointer (the only writer the guard admits).
create or replace function public.hr_hunt_point(p_user uuid, p_slot int, p_hunt text)
returns void language plpgsql set search_path = public, pg_catalog as $$
begin
  perform set_config('hr.hunt_ptr', 'on', true);
  if p_hunt is null then
    update public.player_state
       set active_kind = 'idle', active_id = null, active_since = now(), fight = '{}'::jsonb,
           version = version + 1, updated_at = now()
     where user_id = p_user and slot = p_slot;
  else
    -- An idle character accrues nothing, so moving accrued_to to now() forfeits
    -- nothing; it stops any combat-keyed reader pricing the idle gap.
    update public.player_state
       set active_kind = 'combat', active_id = p_hunt, active_since = now(), accrued_to = now(),
           combat_xp_accrued_to = greatest(combat_xp_accrued_to, now()), fight = '{}'::jsonb,
           version = version + 1, updated_at = now()
     where user_id = p_user and slot = p_slot;
  end if;
  perform set_config('hr.hunt_ptr', '', true);
end $$;

-- A new session row (+ tally + `entered`), returning its id. The caller holds
-- the character lock and has validated everything.
create or replace function public.hr_hunt_new_session(p_user uuid, p_slot int, p_hunt text, p_prev uuid,
  p_preset int, p_falls int, p_hours int)
returns uuid language plpgsql set search_path = public, pg_catalog as $$
declare
  v_id   uuid := gen_random_uuid();
  v_from timestamptz := now() + make_interval(secs => (select travel_s from public.hr_hunt_travel where hunt_id = p_hunt));
  v_keep int := coalesce(public.hr_hunt_limit('sessions_kept'), 20);
begin
  -- RETENTION: the character keeps its last `sessions_kept` hunts, this one
  -- included. Ended ones only; their ledger rows are never touched.
  delete from public.hunt_sessions h
   where h.user_id = p_user and h.slot = p_slot and h.ended_at is not null
     and h.id not in (select x.id from public.hunt_sessions x
                       where x.user_id = p_user and x.slot = p_slot and x.ended_at is not null
                       order by x.entered_at desc, x.id limit greatest(0, v_keep - 1));
  insert into public.hunt_sessions (id, user_id, slot, hunt_id, prev_session_id, preset, falls_limit, hours_limit,
                                    entered_at, hunt_from, settled_to, next_swing_at)
  values (v_id, p_user, p_slot, p_hunt, p_prev, p_preset, p_falls, p_hours, now(), v_from, v_from, v_from);
  insert into public.hunt_session_tally (session_id, user_id, slot) values (v_id, p_user, p_slot);
  insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
  values (v_id, p_user, p_slot, 'entered', now(), jsonb_build_object('hunt', p_hunt));
  return v_id;
end $$;

-- END A SESSION. Leftovers go back to inventory as matched pairs (unless the
-- bag moves on with a change), the pointer goes idle (or to the next hunt), and
-- `ended` is journalled. The caller holds the character lock.
create or replace function public.hr_hunt_close(p_session uuid, p_reason text, p_at timestamptz, p_return_bag boolean)
returns void language plpgsql set search_path = public, pg_catalog as $$
declare v_s public.hunt_sessions%rowtype; v_b record;
begin
  select * into v_s from public.hunt_sessions where id = p_session for update;
  if not found or v_s.ended_at is not null then return; end if;
  if p_return_bag then
    for v_b in select item_id, qty_left from public.hunt_bag where session_id = p_session and qty_left > 0 order by item_id loop
      -- Never refused for a full inventory: an over-cap stack is better than a lost one.
      insert into public.player_inventory as pi (user_id, slot, item_id, qty)
        values (v_s.user_id, v_s.slot, v_b.item_id, v_b.qty_left)
        on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
      perform public.hr_hunt_ledger_pair(v_s.user_id, v_s.slot, p_session, null, v_b.item_id, v_b.qty_left, 'hunt_return');
    end loop;
    update public.hunt_bag set qty_left = 0 where session_id = p_session and qty_left > 0;
  end if;
  update public.hunt_sessions
     set ended_at = greatest(p_at, entered_at), end_reason = p_reason, presses = '[]'::jsonb,
         leave_at = null, change_at = null, change_to = null, version = version + 1
   where id = p_session;
  insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
  values (p_session, v_s.user_id, v_s.slot, 'ended', greatest(p_at, v_s.entered_at), jsonb_build_object('reason', p_reason));
  if p_return_bag then perform public.hr_hunt_point(v_s.user_id, v_s.slot, null); end if;
end $$;

-- CHANGE HUNT: open the next session, move every bag line into it as a bag ->
-- bag pair, end the old one `changed`. Returns the new session id.
create or replace function public.hr_hunt_swap(p_session uuid, p_at timestamptz)
returns uuid language plpgsql set search_path = public, pg_catalog as $$
declare v_s public.hunt_sessions%rowtype; v_new uuid; v_b record;
begin
  select * into v_s from public.hunt_sessions where id = p_session for update;
  if not found or v_s.ended_at is not null or v_s.change_to is null then return null; end if;
  -- The old session ends first so the one-open index admits the new one.
  perform public.hr_hunt_close(p_session, 'changed', p_at, false);
  v_new := public.hr_hunt_new_session(v_s.user_id, v_s.slot, v_s.change_to, p_session,
                                      v_s.preset, v_s.falls_limit, v_s.hours_limit);
  for v_b in select item_id, qty_left, essential from public.hunt_bag where session_id = p_session and qty_left > 0 order by item_id loop
    insert into public.hunt_bag (session_id, user_id, slot, item_id, qty_loaded, qty_left, essential)
      values (v_new, v_s.user_id, v_s.slot, v_b.item_id, v_b.qty_left, v_b.qty_left, v_b.essential);
    perform public.hr_hunt_ledger_pair(v_s.user_id, v_s.slot, p_session, v_new, v_b.item_id, v_b.qty_left, 'hunt_move');
  end loop;
  update public.hunt_bag set qty_left = 0 where session_id = p_session and qty_left > 0;
  perform public.hr_hunt_point(v_s.user_id, v_s.slot, v_s.change_to);
  return v_new;
end $$;

-- The character lock (hr_apply's key, byte for byte) and the open session.
create or replace function public.hr_hunt_lock(p_user uuid, p_slot int)
returns public.hunt_sessions language plpgsql set search_path = public, pg_catalog as $$
declare v_s public.hunt_sessions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_slot::text, 0));
  perform 1 from public.player_state where user_id = p_user and slot = p_slot for update;
  select * into v_s from public.hunt_sessions
   where user_id = p_user and slot = p_slot and ended_at is null for update;
  return v_s;
end $$;

-- How far behind the settle is. Mid-hunt verbs need it within the slack, so an
-- edit lands at (or within two ticks of) the next swing boundary, never into a
-- long unsettled past. Negative while walking.
create or replace function public.hr_hunt_gap_ms(p_s public.hunt_sessions)
returns bigint language sql stable set search_path = public, pg_catalog as $$
  select floor(extract(epoch from (now() - p_s.settled_to)) * 1000)::bigint
$$;

-- ── §4 THE CLIENT RPCs ─────────────────────────────────────────────────────
-- Shared shape: identity -> slot -> idempotency replay -> rate gate -> input ->
-- lock -> state checks -> write -> journal -> version -> stored result.
-- A refusal is noted (hr_note_rejection) and never consumes the key.

-- Two constants every mid-hunt verb shares. Named once, in SQL, here:
--   c_slack_ms 20000  two world ticks: the most unsettled time a mid-hunt edit
--                     may land behind (stated limitation, under-pay direction).
--   c_stall_ms 900000 past this the tick is presumed down: leave/change close at
--                     once and forfeit the unsettled time rather than strand a bag.

create or replace function public.hr_hunt_enter(p_slot int, p_hunt text, p_bag jsonb, p_preset int,
  p_falls int, p_hours int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_enter';
  v_uid  uuid := auth.uid();
  v_r    jsonb;
  v_s    public.hunt_sessions%rowtype;
  v_st   public.player_state%rowtype;
  v_lines int := public.hr_hunt_limit('bag_lines');
  v_line jsonb; v_item text; v_qty bigint; v_ess boolean; v_have bigint;
  v_items text[] := '{}';
  v_falls int; v_id uuid;
  v_vig  jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not coalesce((select enabled from public.hr_hunt_config where id), false) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunts_paused')); end if;
  if p_hunt is null or not exists (select 1 from public.hr_hunt_travel where hunt_id = p_hunt) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_hunt')); end if;
  if p_preset is null or p_preset < 0 or p_preset >= public.hr_hunt_limit('presets') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset')); end if;
  v_falls := coalesce(p_falls, public.hr_hunt_limit('falls_default'));
  if v_falls < public.hr_hunt_limit('falls_min') or v_falls > public.hr_hunt_limit('falls_max') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_falls')); end if;
  if p_hours is not null and (p_hours < public.hr_hunt_limit('hours_min') or p_hours > public.hr_hunt_limit('hours_max')) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_hours')); end if;
  -- THE BAG, shape only (stock is checked under the lock).
  if p_bag is null then p_bag := '[]'::jsonb; end if;
  if jsonb_typeof(p_bag) <> 'array' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_bag')); end if;
  if jsonb_array_length(p_bag) > v_lines then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'too_many_lines', 'max', v_lines)); end if;
  for v_line in select value from jsonb_array_elements(p_bag) loop
    if jsonb_typeof(v_line) <> 'object' or exists (select 1 from jsonb_object_keys(v_line) k where k not in ('item', 'qty', 'essential'))
       or jsonb_typeof(v_line->'item') is distinct from 'string' or jsonb_typeof(v_line->'qty') is distinct from 'number'
       or (v_line ? 'essential' and jsonb_typeof(v_line->'essential') <> 'boolean') then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_bag')); end if;
    v_item := v_line->>'item';
    if not exists (select 1 from public.hr_hunt_supplies where item_id = v_item) then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_supply', 'item', left(v_item, 64))); end if;
    if v_item = any (v_items) then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'duplicate_line', 'item', v_item)); end if;
    v_items := v_items || v_item;
    if (v_line->>'qty') !~ '^[0-9]{1,7}$' or (v_line->>'qty')::bigint < 1 or (v_line->>'qty')::bigint > 100000 then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_qty', 'item', v_item)); end if;
  end loop;

  v_s := public.hr_hunt_lock(v_uid, p_slot);
  select * into v_st from public.player_state where user_id = v_uid and slot = p_slot;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if v_s.id is not null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunt_open', 'session', v_s.id)); end if;
  if v_st.active_kind <> 'idle' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'activity_running', 'active_kind', v_st.active_kind)); end if;
  if public.hr_partied(v_uid, p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'party_hunt_running')); end if;
  if public.hr_hunt_preset_slots(v_uid, p_slot, p_preset) is null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_preset')); end if;
  v_r := public.hr_hunt_admit(v_uid, p_slot, p_hunt);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  v_vig := public.hr_vigour_of(v_uid, p_slot);
  if coalesce((v_vig->>'remaining_min')::int, 0) <= 0 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_vigour')); end if;
  for v_line in select value from jsonb_array_elements(p_bag) loop
    select qty into v_have from public.player_inventory
     where user_id = v_uid and slot = p_slot and item_id = v_line->>'item' for update;
    if coalesce(v_have, 0) < (v_line->>'qty')::bigint then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'insufficient_item',
        'item', v_line->>'item', 'have', coalesce(v_have, 0), 'need', (v_line->>'qty')::bigint)); end if;
  end loop;

  v_id := public.hr_hunt_new_session(v_uid, p_slot, p_hunt, null, p_preset, v_falls, p_hours);
  for v_line in select value from jsonb_array_elements(p_bag) loop
    v_item := v_line->>'item'; v_qty := (v_line->>'qty')::bigint;
    v_ess := coalesce((v_line->>'essential')::boolean, (select essential from public.hr_hunt_supplies where item_id = v_item));
    update public.player_inventory set qty = qty - v_qty
     where user_id = v_uid and slot = p_slot and item_id = v_item and qty > v_qty;
    if not found then
      delete from public.player_inventory where user_id = v_uid and slot = p_slot and item_id = v_item and qty = v_qty;
    end if;
    insert into public.hunt_bag (session_id, user_id, slot, item_id, qty_loaded, qty_left, essential)
      values (v_id, v_uid, p_slot, v_item, v_qty, v_qty, v_ess);
    perform public.hr_hunt_ledger_pair(v_uid, p_slot, null, v_id, v_item, v_qty, 'hunt_pack');
  end loop;
  perform public.hr_hunt_point(v_uid, p_slot, p_hunt);
  update public.hunt_sessions set version = version + 1 where id = v_id;

  v_r := jsonb_build_object('ok', true, 'session', public.hr_hunt_view(v_id),
                            'version', (select version from public.player_state where user_id = v_uid and slot = p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_hunt_leave(p_slot int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_leave';
  c_slack_ms constant bigint := 20000;
  c_stall_ms constant bigint := 900000;
  v_uid uuid := auth.uid();
  v_r   jsonb;
  v_s   public.hunt_sessions%rowtype;
  v_gap bigint;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;

  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if v_s.id is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_hunt')); end if;
  v_gap := public.hr_hunt_gap_ms(v_s);
  if v_gap <= c_slack_ms or v_gap > c_stall_ms then
    -- AT ONCE: walking, freshly settled, or the tick is down. At most the slack
    -- of unsettled hunting is forfeited (or a stalled window: no loot, no use).
    perform public.hr_hunt_close(v_s.id, 'left', now(), true);
    v_r := jsonb_build_object('ok', true, 'pending', false, 'session', public.hr_hunt_view(v_s.id));
  else
    -- PENDING: the next settle walks to leave_at and ends the hunt `left`.
    if v_s.leave_at is null and v_s.change_at is null then
      update public.hunt_sessions set leave_at = now(), version = version + 1 where id = v_s.id;
    end if;
    v_r := jsonb_build_object('ok', true, 'pending', true, 'session', public.hr_hunt_view(v_s.id));
  end if;
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_hunt_change(p_slot int, p_hunt text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_change';
  c_slack_ms constant bigint := 20000;
  c_stall_ms constant bigint := 900000;
  v_uid uuid := auth.uid();
  v_r   jsonb;
  v_s   public.hunt_sessions%rowtype;
  v_gap bigint;
  v_new uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not coalesce((select enabled from public.hr_hunt_config where id), false) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunts_paused')); end if;
  if p_hunt is null or not exists (select 1 from public.hr_hunt_travel where hunt_id = p_hunt) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_hunt')); end if;

  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if v_s.id is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_hunt')); end if;
  if v_s.leave_at is not null or v_s.change_at is not null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunt_leaving')); end if;
  if v_s.hunt_id = p_hunt then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'same_hunt')); end if;
  v_r := public.hr_hunt_admit(v_uid, p_slot, p_hunt);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  update public.hunt_sessions set change_at = now(), change_to = p_hunt, version = version + 1 where id = v_s.id;
  v_gap := public.hr_hunt_gap_ms(v_s);
  if v_gap <= c_slack_ms or v_gap > c_stall_ms then
    v_new := public.hr_hunt_swap(v_s.id, now());
    v_r := jsonb_build_object('ok', true, 'pending', false, 'session', public.hr_hunt_view(v_new),
                              'previous', public.hr_hunt_view(v_s.id));
  else
    v_r := jsonb_build_object('ok', true, 'pending', true, 'session', public.hr_hunt_view(v_s.id));
  end if;
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_hunt_restock(p_slot int, p_item text, p_qty bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_restock';
  c_slack_ms constant bigint := 20000;
  v_uid  uuid := auth.uid();
  v_r    jsonb;
  v_s    public.hunt_sessions%rowtype;
  v_have bigint;
  v_line public.hunt_bag%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_item is null or not exists (select 1 from public.hr_hunt_supplies where item_id = p_item) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_supply')); end if;
  if p_qty is null or p_qty < 1 or p_qty > 100000 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_qty')); end if;

  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if v_s.id is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_hunt')); end if;
  if v_s.leave_at is not null or v_s.change_at is not null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunt_leaving')); end if;
  if public.hr_hunt_gap_ms(v_s) > c_slack_ms then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'settle_first',
      'unsettled_ms', public.hr_hunt_gap_ms(v_s))); end if;
  select * into v_line from public.hunt_bag where session_id = v_s.id and item_id = p_item for update;
  if v_line.session_id is null
     and (select count(*) from public.hunt_bag where session_id = v_s.id) >= public.hr_hunt_limit('bag_lines') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'too_many_lines')); end if;
  if coalesce(v_line.qty_loaded, 0) + p_qty > 1000000 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_qty')); end if;
  select qty into v_have from public.player_inventory
   where user_id = v_uid and slot = p_slot and item_id = p_item for update;
  if coalesce(v_have, 0) < p_qty then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'insufficient_item',
      'item', p_item, 'have', coalesce(v_have, 0), 'need', p_qty)); end if;

  if v_have = p_qty then
    delete from public.player_inventory where user_id = v_uid and slot = p_slot and item_id = p_item;
  else
    update public.player_inventory set qty = qty - p_qty where user_id = v_uid and slot = p_slot and item_id = p_item;
  end if;
  insert into public.hunt_bag as b (session_id, user_id, slot, item_id, qty_loaded, qty_left, essential)
    values (v_s.id, v_uid, p_slot, p_item, p_qty, p_qty, (select essential from public.hr_hunt_supplies where item_id = p_item))
    on conflict (session_id, item_id) do update set qty_loaded = b.qty_loaded + excluded.qty_loaded,
                                                    qty_left = b.qty_left + excluded.qty_left;
  perform public.hr_hunt_ledger_pair(v_uid, p_slot, null, v_s.id, p_item, p_qty, 'hunt_pack');
  update public.hunt_sessions set version = version + 1 where id = v_s.id;
  update public.player_state set version = version + 1, updated_at = now() where user_id = v_uid and slot = p_slot;
  v_r := jsonb_build_object('ok', true, 'session', public.hr_hunt_view(v_s.id),
                            'version', (select version from public.player_state where user_id = v_uid and slot = p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- A MANUAL PRESS queues one action-bar slot for the next swing boundary. It
-- writes no bag, ledger or tally row: the settle fires it inside the same
-- per-group, per-swing and cooldown limits the rules obey (and the applier
-- caps each group's uses by the window), so a press can re-order uses the rules
-- already allow and can never add one.
create or replace function public.hr_hunt_use(p_slot int, p_bar_slot int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_use';
  c_slack_ms constant bigint := 20000;
  v_uid   uuid := auth.uid();
  v_r     jsonb;
  v_s     public.hunt_sessions%rowtype;
  v_slots jsonb; v_bar jsonb; v_item text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt_use') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_bar_slot is null or p_bar_slot < 0 or p_bar_slot >= public.hr_hunt_limit('slots') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_bar_slot')); end if;

  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if v_s.id is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_hunt')); end if;
  if v_s.leave_at is not null or v_s.change_at is not null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunt_leaving')); end if;
  if public.hr_hunt_gap_ms(v_s) > c_slack_ms then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'settle_first',
      'unsettled_ms', public.hr_hunt_gap_ms(v_s))); end if;
  v_slots := public.hr_hunt_preset_slots(v_uid, p_slot, v_s.preset);
  v_bar := v_slots -> p_bar_slot;
  if v_bar is null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_bar_slot')); end if;
  v_item := v_bar->>'item';
  if not exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                  where b.session_id = v_s.id and b.qty_left > 0
                    and ((v_item = '*heal' and p.kind = 'heal') or b.item_id = v_item)) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bag_empty')); end if;
  if exists (select 1 from jsonb_array_elements(v_s.presses) e where (e.value->>'slot')::int = p_bar_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'press_queued')); end if;
  if jsonb_array_length(v_s.presses) >= public.hr_hunt_limit('slots') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'press_queued')); end if;
  update public.hunt_sessions
     set presses = presses || jsonb_build_array(jsonb_build_object('slot', p_bar_slot,
                    'at', floor(extract(epoch from now()) * 1000)::bigint)),
         version = version + 1
   where id = v_s.id;
  v_r := jsonb_build_object('ok', true, 'session', public.hr_hunt_view(v_s.id));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_hunt_set_preset(p_slot int, p_preset int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_set_preset';
  c_slack_ms constant bigint := 20000;
  v_uid uuid := auth.uid();
  v_r   jsonb;
  v_s   public.hunt_sessions%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_preset is null or p_preset < 0 or p_preset >= public.hr_hunt_limit('presets') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset')); end if;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if v_s.id is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_hunt')); end if;
  if v_s.leave_at is not null or v_s.change_at is not null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunt_leaving')); end if;
  if public.hr_hunt_gap_ms(v_s) > c_slack_ms then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'settle_first',
      'unsettled_ms', public.hr_hunt_gap_ms(v_s))); end if;
  if public.hr_hunt_preset_slots(v_uid, p_slot, p_preset) is null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_preset')); end if;
  -- Queued presses name slots of the OLD bar; they are dropped with it.
  update public.hunt_sessions set preset = p_preset, presses = '[]'::jsonb, version = version + 1 where id = v_s.id;
  v_r := jsonb_build_object('ok', true, 'session', public.hr_hunt_view(v_s.id));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_action_set_put(p_slot int, p_preset int, p_name text, p_slots jsonb, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'action_set_put';
  c_slack_ms constant bigint := 20000;
  v_uid  uuid := auth.uid();
  v_r    jsonb;
  v_s    public.hunt_sessions%rowtype;
  v_name text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_preset is null or p_preset < 0 or p_preset >= public.hr_hunt_limit('presets') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset')); end if;
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '[^[:print:]]', '', 'g'));
  if v_name = '' then v_name := 'Preset ' || (p_preset + 1); end if;
  if char_length(v_name) > 32 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_name')); end if;
  v_r := public.hr_hunt_slots_check(p_slots);
  if not (v_r->>'ok')::boolean then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;

  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- An edit to the bar a hunt is running lands from the next swing boundary.
  if v_s.id is not null and v_s.preset = p_preset and public.hr_hunt_gap_ms(v_s) > c_slack_ms then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'settle_first',
      'unsettled_ms', public.hr_hunt_gap_ms(v_s))); end if;
  insert into public.player_action_sets as a (user_id, slot, preset, name, slots, updated_at)
    values (v_uid, p_slot, p_preset, v_name, v_r->'slots', now())
    on conflict (user_id, slot, preset) do update set name = excluded.name, slots = excluded.slots, updated_at = now();
  if v_s.id is not null and v_s.preset = p_preset then
    update public.hunt_sessions set presses = '[]'::jsonb, version = version + 1 where id = v_s.id;
  end if;
  v_r := jsonb_build_object('ok', true, 'preset', p_preset, 'name', v_name, 'slots', v_r->'slots');
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_action_set_delete(p_slot int, p_preset int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'action_set_delete';
  v_uid uuid := auth.uid();
  v_r   jsonb;
  v_s   public.hunt_sessions%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_preset is null or p_preset < 0 or p_preset >= public.hr_hunt_limit('presets') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset')); end if;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if v_s.id is not null and v_s.preset = p_preset then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'preset_in_use')); end if;
  delete from public.player_action_sets where user_id = v_uid and slot = p_slot and preset = p_preset;
  v_r := jsonb_build_object('ok', true, 'preset', p_preset);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- The read cursor only moves forward, and never past the session's last event.
create or replace function public.hr_mark_seen(p_slot int, p_session uuid, p_event_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_seen bigint;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('hunt_read') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_slot is null or p_session is null or p_event_id is null or p_event_id < 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments'); end if;
  update public.hunt_sessions s
     set seen_event_id = greatest(s.seen_event_id, least(p_event_id,
           coalesce((select max(e.id) from public.hunt_session_events e where e.session_id = s.id), 0)))
   where s.id = p_session and s.user_id = v_uid and s.slot = p_slot
  returning s.seen_event_id into v_seen;
  if v_seen is null then return jsonb_build_object('ok', false, 'error', 'no_hunt'); end if;
  return jsonb_build_object('ok', true, 'session', p_session, 'seen_event_id', v_seen);
end $$;

-- THE ANALYZER. Read-only over the caller's own rows. Gold is coins plus loot at
-- VENDOR VALUE (hr_hunt_vendor_value, the vendor's bid), Waste is the supplies
-- used at the same value, Balance = Gold - Waste; per-hour figures over WALL
-- time (entered -> ended or now). Next-level ETA from the xp rate; "lasts ~Xh"
-- per bag line from its use rate over hunting time.
create or replace function public.hr_hunt_analyzer(p_slot int, p_session uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid  uuid := auth.uid();
  v_s    public.hunt_sessions%rowtype;
  v_t    public.hunt_session_tally%rowtype;
  v_loot bigint; v_waste bigint; v_gold bigint;
  v_wall_h numeric; v_hunt_h numeric;
  v_eta  jsonb; v_bag jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('hunt_read') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  select * into v_s from public.hunt_sessions s
   where s.user_id = v_uid and s.slot = p_slot and (p_session is null or s.id = p_session)
   order by s.entered_at desc, s.id limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_hunt'); end if;
  select * into v_t from public.hunt_session_tally where session_id = v_s.id;
  select coalesce(sum(floor(l.value::numeric) * v.unit), 0)::bigint into v_loot
    from jsonb_each_text(v_t.loot) l join public.hr_hunt_vendor_value v on v.item_id = l.key;
  select coalesce(sum(floor(l.value::numeric) * v.unit), 0)::bigint into v_waste
    from jsonb_each_text(v_t.supplies) l join public.hr_hunt_vendor_value v on v.item_id = l.key;
  v_gold := v_t.coins + v_loot;
  v_wall_h := greatest(extract(epoch from (coalesce(v_s.ended_at, now()) - v_s.entered_at)) / 3600.0, 0);
  v_hunt_h := greatest(extract(epoch from (least(coalesce(v_s.ended_at, v_s.settled_to), v_s.settled_to) - v_s.hunt_from)) / 3600.0, 0);
  select coalesce(jsonb_object_agg(x.key, jsonb_build_object('xp', x.gain, 'per_hour',
           case when v_wall_h > 0 then round(x.gain / v_wall_h) end,
           'level', public.hr_level_from_xp(coalesce(ps.xp, 0)),
           'eta_h', case when v_wall_h > 0 and x.gain > 0 then round(greatest(0,
               coalesce((select xt.xp from public.hr_xp_table xt
                          where xt.level = public.hr_level_from_xp(coalesce(ps.xp, 0)) + 1), 0) - coalesce(ps.xp, 0))
               / (x.gain / v_wall_h), 2) end)), '{}'::jsonb)
    into v_eta
    from (select key, value::numeric as gain from jsonb_each_text(v_t.xp)) x
    left join public.player_skills ps on ps.user_id = v_uid and ps.slot = p_slot and ps.skill_id = x.key;
  select coalesce(jsonb_agg(jsonb_build_object('item', b.item_id, 'loaded', b.qty_loaded, 'left', b.qty_left,
           'used', b.qty_loaded - b.qty_left, 'essential', b.essential,
           'value', coalesce(v.unit, 0),
           'lasts_h', case when v_s.ended_at is null and v_hunt_h > 0 and b.qty_loaded > b.qty_left
                           then round(b.qty_left / ((b.qty_loaded - b.qty_left) / v_hunt_h), 2) end)
           order by b.item_id), '[]'::jsonb)
    into v_bag
    from public.hunt_bag b left join public.hr_hunt_vendor_value v on v.item_id = b.item_id
   where b.session_id = v_s.id;
  return jsonb_build_object('ok', true, 'session', public.hr_hunt_view(v_s.id),
    'gold', v_gold, 'gold_basis', 'vendor_value', 'coins', v_t.coins, 'loot_value', v_loot,
    'waste', v_waste, 'balance', v_gold - v_waste,
    'wall_ms', floor(v_wall_h * 3600000)::bigint, 'hunt_ms', floor(v_hunt_h * 3600000)::bigint,
    'per_hour', case when v_wall_h > 0 then jsonb_build_object(
        'gold', round(v_gold / v_wall_h), 'waste', round(v_waste / v_wall_h),
        'balance', round((v_gold - v_waste) / v_wall_h), 'kills', round(v_t.kills / v_wall_h, 1)) end,
    'skills', v_eta, 'bag', v_bag,
    'unseen', (select count(*) from public.hunt_session_events e where e.session_id = v_s.id and e.id > v_s.seen_event_id),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'session', e.session_id, 'type', e.type,
                          'at', e.at, 'data', e.data) order by e.id)
                        from (select x.* from public.hunt_sessions h join public.hunt_session_events x on x.session_id = h.id
                               where h.user_id = v_uid and h.slot = p_slot
                               order by x.id desc limit 50) e), '[]'::jsonb));
end $$;

-- ── §5 THE SETTLE APPLIER (owner-only; lane C2 grants it to the engine) ────
-- The edge proposes one window of one session; this decides whether it may
-- land and applies it. Value movement through hr_apply happens in the SAME
-- transaction, before this call, with `hr.hunt_session` set so its rows are
-- stamped; this folds them.
-- EVERY REFUSAL RAISES (hr_reject, SQLSTATE HR000, message = the code), never
-- `return {ok:false}` (Security GO-WITH-CHANGES on e482cc54, item 2): by the
-- time this runs, hr_apply has already moved value in the same transaction, so
-- a soft refusal would commit that value with no settle behind it. A raise rolls
-- the whole transaction (or the caller's savepoint) back, hr_apply included.
-- SECURITY DEFINER with a pinned search_path, so the engine role C2 grants it to
-- never needs a direct grant on any table it writes.
create or replace function public.hr_hunt_settle_session(p_user uuid, p_slot int, p_session uuid, p_delta jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_skew       constant interval := interval '60 seconds';
  c_max_window constant bigint   := 24 * 3600000;   -- the outage fuse, never a gameplay cap
  c_min_swing_ms constant bigint := 500;            -- fuse on the swing count, not a balance figure
  c_keys constant text[] := array['swing_from', 'swing_to', 'to', 'next_swing_at', 'uses', 'cooldowns',
                                  'presses_left', 'falls', 'down', 'down_ms', 'paid_ms', 'raw_xp', 'hints', 'ended'];
  v_s      public.hunt_sessions%rowtype;
  v_to     timestamptz; v_next timestamptz;
  v_win    bigint;
  v_from_i bigint; v_to_i bigint;
  v_cd_heal int := public.hr_hunt_limit('cd_heal_ms');
  v_cd_buff int := public.hr_hunt_limit('cd_buff_ms');
  v_heals  bigint := 0; v_buffs bigint := 0;
  v_k text; v_v jsonb; v_kind text; v_left bigint; v_n bigint;
  v_stored jsonb; v_keep jsonb; v_i int; v_j int;
  v_deaths int; v_falls int;
  v_end text; v_end_at timestamptz;
  v_hwm bigint; v_new_hwm bigint;
  v_coins bigint; v_kills bigint;
  v_xp jsonb; v_loot jsonb; v_sup jsonb;
  v_ev int := 0; v_r record; v_hint jsonb; v_at timestamptz;
  v_vig int; v_next_id uuid;
  v_cool jsonb;
  v_raw jsonb;
  v_used   jsonb := '{}'::jsonb;
  v_used_n bigint := 0;
  -- THE FOLD'S TIME BOUND. Every row this folds was stamped in the transaction
  -- of a settle (C2 sets hr.hunt_session immediately before hr_apply), and a
  -- window is at most c_max_window, so nothing it must read is older than 25 h;
  -- the bound keeps every read far inside the ledger's retention (ledger-rollup).
  v_fold_from timestamptz := now() - interval '25 hours';
begin
  -- ── VALIDATE (no writes) ───────────────────────────────────────────────
  if p_user is null or p_slot is null or p_session is null or p_delta is null or jsonb_typeof(p_delta) <> 'object' then
    perform public.hr_reject('bad_arguments'); end if;
  if exists (select 1 from jsonb_object_keys(p_delta) k where k <> all (c_keys)) then
    perform public.hr_reject('unknown_delta_key'); end if;
  if v_cd_heal is null or v_cd_buff is null then perform public.hr_reject('catalogue_missing'); end if;
  v_s := public.hr_hunt_lock(p_user, p_slot);
  if v_s.id is null or v_s.id <> p_session then perform public.hr_reject('no_hunt'); end if;

  if jsonb_typeof(p_delta->'swing_from') is distinct from 'number' or jsonb_typeof(p_delta->'swing_to') is distinct from 'number'
     or (p_delta->>'swing_from') !~ '^[0-9]{1,15}$' or (p_delta->>'swing_to') !~ '^[0-9]{1,15}$' then
    perform public.hr_reject('bad_swing'); end if;
  v_from_i := (p_delta->>'swing_from')::bigint; v_to_i := (p_delta->>'swing_to')::bigint;
  if v_from_i <> v_s.swing_index then
    perform public.hr_reject('session_moved', jsonb_build_object('swing_index', v_s.swing_index)); end if;
  begin
    v_to := (p_delta->>'to')::timestamptz;
    v_next := (p_delta->>'next_swing_at')::timestamptz;
  exception when others then
    perform public.hr_reject('bad_window');
  end;
  if v_to is null or v_next is null or v_to <= v_s.settled_to then
    perform public.hr_reject('bad_window', jsonb_build_object('settled_to', v_s.settled_to)); end if;
  if v_to > now() + c_skew then perform public.hr_reject('window_in_future'); end if;
  v_win := floor(extract(epoch from (v_to - v_s.settled_to)) * 1000)::bigint;
  if v_win > c_max_window then perform public.hr_reject('window_too_long'); end if;
  if v_next < v_to or v_next > v_to + c_skew then perform public.hr_reject('bad_next_swing'); end if;
  if v_to_i < v_from_i or v_to_i - v_from_i > v_win / c_min_swing_ms + 1 then
    perform public.hr_reject('bad_swing'); end if;

  -- USES: bag lines only, never more than is left, and each cooldown group
  -- capped by what its cooldown admits in this window.
  if p_delta ? 'uses' then
    if jsonb_typeof(p_delta->'uses') <> 'object' or (select count(*) from jsonb_object_keys(p_delta->'uses')) > 10 then
      perform public.hr_reject('bad_uses'); end if;
    for v_k, v_v in select key, value from jsonb_each(p_delta->'uses') loop
      if jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,9}$' then
        perform public.hr_reject('bad_uses', jsonb_build_object('item', left(v_k, 64))); end if;
      v_n := (v_v #>> '{}')::bigint;
      select b.qty_left, p.kind into v_left, v_kind
        from public.hunt_bag b left join public.hr_hunt_supplies p on p.item_id = b.item_id
       where b.session_id = p_session and b.item_id = v_k;
      if v_left is null then perform public.hr_reject('not_in_bag', jsonb_build_object('item', left(v_k, 64))); end if;
      if v_n > v_left then perform public.hr_reject('bag_short', jsonb_build_object('item', v_k, 'left', v_left)); end if;
      if v_kind = 'heal' then v_heals := v_heals + v_n; elsif v_kind = 'buff' then v_buffs := v_buffs + v_n; end if;
      v_left := null; v_kind := null;
    end loop;
    if v_heals > v_win / v_cd_heal + 1 or v_buffs > v_win / v_cd_buff + 1 then
      perform public.hr_reject('too_many_uses', jsonb_build_object('heals', v_heals, 'buffs', v_buffs, 'window_ms', v_win)); end if;
  end if;

  -- COOLDOWNS: absolute instants no later than the window end plus one cooldown.
  v_cool := coalesce(p_delta->'cooldowns', v_s.cooldowns);
  if jsonb_typeof(v_cool) <> 'object'
     or exists (select 1 from jsonb_each(v_cool) c where c.key not in ('heal', 'buff') or jsonb_typeof(c.value) <> 'number'
                   or (c.value #>> '{}')::numeric < 0
                   or (c.value #>> '{}')::numeric > extract(epoch from v_to) * 1000
                        + case c.key when 'heal' then v_cd_heal else v_cd_buff end) then
    perform public.hr_reject('bad_cooldowns'); end if;

  -- PRESSES ONLY SHRINK: what is left is the stored queue with some removed,
  -- order kept. A settle can never invent a press.
  v_stored := v_s.presses; v_keep := '[]'::jsonb;
  if p_delta ? 'presses_left' then
    if jsonb_typeof(p_delta->'presses_left') <> 'array' then perform public.hr_reject('bad_presses'); end if;
    v_j := 0;
    for v_i in 0 .. jsonb_array_length(p_delta->'presses_left') - 1 loop
      while v_j < jsonb_array_length(v_stored)
            and ((v_stored->v_j->>'slot') is distinct from (p_delta->'presses_left'->>v_i)) loop
        v_j := v_j + 1;
      end loop;
      if v_j >= jsonb_array_length(v_stored) then perform public.hr_reject('bad_presses'); end if;
      v_keep := v_keep || jsonb_build_array(v_stored->v_j);
      v_j := v_j + 1;
    end loop;
  else
    v_keep := v_stored;
  end if;

  -- FALLS equal the death rows hr_apply stamped with this session since the last fold.
  select t.ledger_hwm into v_hwm from public.hunt_session_tally t where t.session_id = p_session;
  v_hwm := coalesce(v_hwm, 0);
  select count(*) into v_deaths from public.player_ledger l
   where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind = 'combat' and l.intent = 'death';
  v_falls := v_s.falls + v_deaths;
  if (p_delta ? 'falls') and (jsonb_typeof(p_delta->'falls') <> 'number' or (p_delta->>'falls')::numeric <> v_falls) then
    perform public.hr_reject('falls_mismatch', jsonb_build_object('journalled', v_falls)); end if;
  if (p_delta ? 'down' and jsonb_typeof(p_delta->'down') <> 'boolean')
     or (p_delta ? 'down_ms' and (jsonb_typeof(p_delta->'down_ms') <> 'number' or (p_delta->>'down_ms')::numeric < 0
                                  or (p_delta->>'down_ms')::numeric > v_win))
     or (p_delta ? 'paid_ms' and (jsonb_typeof(p_delta->'paid_ms') <> 'number' or (p_delta->>'paid_ms')::numeric < 0
                                  or (p_delta->>'paid_ms')::numeric > v_win)) then
    perform public.hr_reject('bad_counts'); end if;
  v_raw := coalesce(p_delta->'raw_xp', '{}'::jsonb);
  if jsonb_typeof(v_raw) <> 'object' or (select count(*) from jsonb_object_keys(v_raw)) > 24
     or exists (select 1 from jsonb_each(v_raw) x where x.key !~ '^[a-zA-Z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number'
                   or (x.value #>> '{}')::numeric < 0 or (x.value #>> '{}')::numeric > 1e12) then
    perform public.hr_reject('bad_counts'); end if;

  -- THE END, re-proved from server state as it will stand after the uses.
  if p_delta ? 'ended' and jsonb_typeof(p_delta->'ended') = 'object' then
    v_end := p_delta->'ended'->>'reason';
    begin v_end_at := (p_delta->'ended'->>'at')::timestamptz;
    exception when others then perform public.hr_reject('bad_end'); end;
    if v_end is null or not exists (select 1 from public.hr_hunt_end_reasons where reason = v_end)
       or v_end_at is null or v_end_at < v_s.settled_to or v_end_at > v_to then
      perform public.hr_reject('bad_end'); end if;
    if not coalesce(case v_end
      when 'falls' then v_falls >= v_s.falls_limit
      when 'heals_out' then not exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                         where b.session_id = p_session and p.kind = 'heal' and b.essential
                                           and b.qty_left - coalesce((p_delta->'uses'->>b.item_id)::bigint, 0) > 0)
                        and exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                     where b.session_id = p_session and p.kind = 'heal' and b.essential)
      when 'ammo_out' then not exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                        where b.session_id = p_session and p.kind = 'ammo' and b.essential
                                          and b.qty_left - coalesce((p_delta->'uses'->>b.item_id)::bigint, 0) > 0)
                       and exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                    where b.session_id = p_session and p.kind = 'ammo' and b.essential)
      -- Vigour is charged by hr_apply in this transaction; the engine counts
      -- milliseconds and hr_vigour_of whole minutes, so one minute of slack.
      when 'vigour' then coalesce((public.hr_vigour_of(p_user, p_slot)->>'remaining_min')::int, 0) <= 1
      when 'hours' then v_s.hours_limit is not null and v_end_at >= v_s.hunt_from + make_interval(hours => v_s.hours_limit)
      when 'left' then v_s.leave_at is not null and v_end_at >= v_s.leave_at
      when 'changed' then v_s.change_at is not null and v_end_at >= v_s.change_at
      when 'server' then not coalesce((select enabled from public.hr_hunt_config where id), false)
      else false end, false) then
      perform public.hr_reject('end_not_proven', jsonb_build_object('reason', v_end));
    end if;
  elsif p_delta ? 'ended' and jsonb_typeof(p_delta->'ended') <> 'null' then
    perform public.hr_reject('bad_end');
  else
    -- AN END THE ENGINE OWED: the falls limit reached, a leave/change/hours
    -- instant more than one skew behind the window end, or the kill switch.
    if v_falls >= v_s.falls_limit
       or (v_s.leave_at is not null and v_to > v_s.leave_at + c_skew)
       or (v_s.change_at is not null and v_to > v_s.change_at + c_skew)
       or (v_s.hours_limit is not null and v_to > v_s.hunt_from + make_interval(hours => v_s.hours_limit) + c_skew) then
      perform public.hr_reject('end_missing'); end if;
  end if;
  v_hint := coalesce(p_delta->'hints', '{}'::jsonb);
  if jsonb_typeof(v_hint) <> 'object' then perform public.hr_reject('bad_hints'); end if;

  -- ── APPLY ──────────────────────────────────────────────────────────────
  -- (1) Consumption: the bag, and ONE journal row per settle carrying every
  --     item used in meta.items (qty = the units destroyed, negative). One
  --     row per settle is the accrue row's own rate (world-tick flush/fold),
  --     never per swing (CLAUDE.md rule 6).
  if p_delta ? 'uses' then
    for v_k, v_v in select key, value from jsonb_each(p_delta->'uses') order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      update public.hunt_bag set qty_left = qty_left - v_n where session_id = p_session and item_id = v_k
        returning qty_left into v_left;
      v_used := v_used || jsonb_build_object(v_k, v_n);
      v_used_n := v_used_n + v_n;
      if v_left = 0 then
        v_at := least(greatest(coalesce(public.hr_hunt_hint_at(v_hint->'slot_dry'->v_k), v_to), v_s.settled_to), v_to);
        insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
          values (p_session, p_user, p_slot, 'slot_dry', v_at, jsonb_build_object('item', v_k));
        v_ev := v_ev + 1;
      end if;
    end loop;
    if v_used_n > 0 then
      insert into public.player_ledger (user_id, slot, kind, intent, qty, meta, session_id)
        values (p_user, p_slot, 'hunt', 'hunt_consume', -v_used_n,
                jsonb_build_object('side', 'bag', 'items', v_used), p_session);
    end if;
  end if;

  -- (2) THE FOLD: every row stamped with this session since the high-water mark.
  select coalesce(sum(case when l.kind <> 'hunt' then coalesce(l.gold, 0) else 0 end), 0),
         coalesce(sum(case when jsonb_typeof(l.meta->'kills') = 'number' then greatest(0, (l.meta->>'kills')::numeric) else 0 end), 0)::bigint,
         max(l.id)
    into v_coins, v_kills, v_new_hwm
    from public.player_ledger l where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from;
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_xp from (
    select x.key as k, sum(x.value::numeric) as v
      from public.player_ledger l, jsonb_each_text(case when jsonb_typeof(l.meta->'delta'->'x') = 'object'
                                                         then l.meta->'delta'->'x' else '{}'::jsonb end) x
     where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind <> 'hunt'
     group by x.key) a;
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_loot from (
    select k, sum(v) as v from (
      select i.key as k, i.value::numeric as v
        from public.player_ledger l, jsonb_each_text(case when jsonb_typeof(l.meta->'delta'->'i') = 'object'
                                                           then l.meta->'delta'->'i' else '{}'::jsonb end) i
       where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind <> 'hunt'
      union all
      select '*', (l.meta->'delta'->>'i_sum')::numeric
        from public.player_ledger l
       where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind <> 'hunt'
         and jsonb_typeof(l.meta->'delta'->'i_sum') = 'number') u
    group by k) a;
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_sup from (
    select i.key as k, sum(i.value::numeric) as n
      from public.player_ledger l, jsonb_each_text(case when jsonb_typeof(l.meta->'items') = 'object'
                                                         then l.meta->'items' else '{}'::jsonb end) i
     where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind = 'hunt' and l.intent = 'hunt_consume'
     group by i.key) a;
  update public.hunt_session_tally t
     set coins = t.coins + v_coins, kills = t.kills + v_kills, deaths = t.deaths + v_deaths,
         xp = public.hr_jsonb_add(t.xp, v_xp), loot = public.hr_jsonb_add(t.loot, v_loot),
         supplies = public.hr_jsonb_add(t.supplies, v_sup), raw_xp = public.hr_jsonb_add(t.raw_xp, v_raw),
         down_ms = t.down_ms + coalesce((p_delta->>'down_ms')::numeric, 0)::bigint,
         paid_ms = t.paid_ms + coalesce((p_delta->>'paid_ms')::numeric, 0)::bigint,
         ledger_hwm = greatest(t.ledger_hwm, coalesce(v_new_hwm, 0)), updated_at = now()
   where t.session_id = p_session;

  -- (3) DERIVED EVENTS. Falls from the death rows; level-ups from the xp the
  --     fold credited; rare drops only for items this fold looted.
  v_i := 0;
  for v_r in select l.at, l.meta->>'monster' as monster from public.player_ledger l
              where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind = 'combat' and l.intent = 'death' order by l.id loop
    v_at := least(greatest(coalesce(public.hr_hunt_hint_at(v_hint->'fall'->v_i), v_r.at), v_s.settled_to), v_to);
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      values (p_session, p_user, p_slot, 'fall', v_at, jsonb_build_object('monster', left(coalesce(v_r.monster, ''), 64)));
    v_i := v_i + 1; v_ev := v_ev + 1;
  end loop;
  for v_r in select x.key as skill, public.hr_level_from_xp(ps.xp) as lv_now,
                    public.hr_level_from_xp(greatest(0, ps.xp - floor(x.value::numeric)::bigint)) as lv_then
               from jsonb_each_text(v_xp) x
               join public.player_skills ps on ps.user_id = p_user and ps.slot = p_slot and ps.skill_id = x.key
              where x.value::numeric > 0 loop
    if v_r.lv_now > v_r.lv_then then
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'level_up', v_to, jsonb_build_object('skill', left(v_r.skill, 64), 'level', v_r.lv_now));
      v_ev := v_ev + 1;
    end if;
  end loop;
  if jsonb_typeof(v_hint->'rare_drop') = 'array' then
    for v_r in select distinct on (e.value->>'item') e.value->>'item' as item, e.value->'at' as at_ms
                 from jsonb_array_elements(v_hint->'rare_drop') with ordinality e(value, o)
                where jsonb_typeof(e.value) = 'object' and coalesce((v_loot->>(e.value->>'item'))::numeric, 0) > 0
                order by e.value->>'item', e.o limit 10 loop
      v_at := least(greatest(coalesce(public.hr_hunt_hint_at(v_r.at_ms), v_to), v_s.settled_to), v_to);
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'rare_drop', v_at, jsonb_build_object('item', left(v_r.item, 64)));
      v_ev := v_ev + 1;
    end loop;
  end if;
  if not exists (select 1 from public.hunt_session_events e where e.session_id = p_session and e.type = 'vigour_low') then
    v_vig := (public.hr_vigour_of(p_user, p_slot)->>'remaining_min')::int;
    if v_vig is not null and v_vig <= coalesce(public.hr_hunt_limit('vigour_low_min'), 0) then
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'vigour_low', v_to, jsonb_build_object('n', v_vig));
      v_ev := v_ev + 1;
    end if;
  end if;

  -- (4) THE SESSION CLOCK.
  update public.hunt_sessions
     set swing_index = v_to_i, settled_to = v_to, next_swing_at = v_next, cooldowns = v_cool, presses = v_keep,
         falls = v_falls, down = coalesce((p_delta->>'down')::boolean, down), version = version + 1
   where id = p_session;

  -- (5) THE END.
  if v_end = 'changed' then
    v_next_id := public.hr_hunt_swap(p_session, v_end_at);
  elsif v_end is not null then
    perform public.hr_hunt_close(p_session, v_end, v_end_at, true);
  end if;

  return jsonb_build_object('ok', true, 'session', p_session, 'swing_index', v_to_i, 'settled_to', v_to,
                            'ended', v_end, 'next_session', v_next_id, 'events', v_ev,
                            'version', (select version from public.hunt_sessions where id = p_session));
end $$;

-- ── §6 hr_rpc_gate RESTATED WHOLE, + hunt / hunt_use / hunt_read ───────────
-- Pinned: the restatement runs only over the chain-end body (md5 below), so a
-- bucket another file spliced in meanwhile is refused, never clobbered. A body
-- that already IS this restatement is a no-op.
do $mig$
declare v_md5 text;
begin
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_rpc_gate(text)'::regprocedure;
  if v_md5 <> 'f04a3c97af94a538eb01a7f5521fc37b' and strpos((select prosrc from pg_proc where oid = 'public.hr_rpc_gate(text)'::regprocedure),
                                                           '''hunt_use''') = 0 then
    raise exception 'hr_rpc_gate is not the body this file restates (md5 %) — a bucket was spliced since 2026-10-20; restate from that body instead', v_md5;
  end if;
end $mig$;

CREATE OR REPLACE FUNCTION public.hr_rpc_gate(p_bucket text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  c_unkeyed_limit constant int := 600;
  v_uid    uuid := auth.uid();
  v_limit  int;
  v_window constant interval := interval '1 minute';
  v_weight bigint;
  v_ip     text;
  v_bucket text;
  v_key    uuid;
begin
  case p_bucket
    when 'clan_seat_read', 'clan_vote_read', 'hr_leaderboard',
         'hr_rally_pledge_state', 'hr_display_name_available', 'hr_server_now',
         'clan_invites_list',
         'hr_goal_state'
      then v_limit := 120;
    when 'buy_listing', 'clan_board_claim', 'clan_board_progress', 'clan_contribute',
         'clan_deposit', 'clan_feast_deposit', 'clan_rested_grant', 'clan_vote_cast',
         'clan_work_complete', 'clan_work_labour', 'clan_work_supply',
         'raid_claim', 'raid_strike',
         'world_event_absence_claim', 'world_event_claim', 'world_event_contribute',
         'world_event_join', 'world_event_pledge', 'world_event_pledge_settle',
         'farm_plant', 'farm_harvest', 'farm_water',
         'worker_hire', 'worker_assign',
         'bank_move',
         'hr_credit_kills', 'hr_credit_combat_xp',
         'client_state_put'
      then v_limit := 60;
    when 'hr_set_style'
      then v_limit := 30;
    when 'bug_report_submit', 'claim_beta_invite', 'claim_display_name',
         'clan_board_roll', 'clan_feast_call', 'clan_hunt_declare', 'clan_tier_up',
         'clan_vice_set', 'clan_vote_close', 'clan_vote_open', 'clan_work_post',
         'clan_create', 'clan_join', 'clan_leave', 'clan_kick',
         'clan_invite', 'clan_invite_revoke', 'clan_join_policy_set',
         'hr_claim_quest', 'hr_claim_daily', 'hr_claim_milestone', 'hr_claim_rank',
         'hr_accept_bounty', 'hr_claim_bounty',
         'hr_bounty_spend',
         'hr_trait_buy', 'hr_claim_goal'
      then v_limit := 12;
    when 'beta_invite_check'
      then v_limit := 20;
    when 'hr_buy_hero_slot' then v_limit := 12;
    when 'hr_heartbeat' then v_limit := 6;
    when 'hr_town_of' then v_limit := 30;
    when 'hr_set_presence_quiet' then v_limit := 4;
    when 'hr_world_finds_of' then v_limit := 6;
    when 'hr_buy_gem_unlock' then v_limit := 12;
    when 'hr_recipe_learn' then v_limit := 12;
    when 'hr_vigour_refill' then v_limit := 6;
    when 'party' then v_limit := 12;
    when 'party_hunt_view' then v_limit := 20;
    when 'hr_claim_discord_gift' then v_limit := 6;
    when 'hr_tally_state' then v_limit := 120;
    -- HUNT SESSIONS (2026-10-21-hunt-sessions.sql): every session / bag /
    -- action-bar write shares `hunt`; a manual press is `hunt_use` (one per
    -- second is the action bar's own buff cooldown); the Analyzer and the read
    -- cursor are `hunt_read`.
    when 'hunt' then v_limit := 30;
    when 'hunt_use' then v_limit := 60;
    when 'hunt_read' then v_limit := 60;
    else return false;
  end case;

  if v_uid is not null then
    v_key    := v_uid;
    v_bucket := 'rpc:' || p_bucket;
  else
    v_ip := public.hr_request_ip();
    if v_ip is not null then
      v_key    := md5('anon-ip:' || v_ip)::uuid;
      v_bucket := 'rpc:anon:' || p_bucket;
    else
      v_key    := md5('anon-unkeyed')::uuid;
      v_bucket := 'rpc:anon-unkeyed:' || p_bucket;
      v_limit  := c_unkeyed_limit;
    end if;
  end if;

  if public.hr_rate_ok(v_key, v_bucket, v_limit, v_window) then
    return true;
  end if;

  v_weight := public.hr_rate_sample_weight(
                public.hr_rate_over(v_key, v_bucket) - v_limit);
  if v_weight > 0 then
    perform public.hr_record_rejection(v_key, 0,
      case when v_uid is null then 'anon:' || p_bucket else p_bucket end,
      'rate_limited',
      jsonb_build_object('limit', v_limit, 'per', v_window::text, 'gate', 'rpc',
                         'anon', v_uid is null), v_weight);
  end if;
  return false;
end $function$;
revoke execute on function public.hr_rpc_gate(text) from public;
revoke execute on function public.hr_rpc_gate(text) from anon, authenticated, service_role;

-- ── §7 GRANTS — EXACT, REVOKE FIRST — AND THE BASELINE ROWS ───────────────
do $mig$
declare r text; f text;
begin
  foreach f in array array[
    'public.hr_hunt_limit(text)', 'public.hr_jsonb_add(jsonb, jsonb)', 'public.hr_hunt_hint_at(jsonb)',
    'public.hr_hunt_ledger_pair(uuid, int, uuid, uuid, text, bigint, text)', 'public.hr_hunt_view(uuid)',
    'public.hr_hunt_preset_slots(uuid, int, int)', 'public.hr_hunt_slots_check(jsonb)',
    'public.hr_hunt_admit(uuid, int, text)', 'public.hr_hunt_point(uuid, int, text)',
    'public.hr_hunt_new_session(uuid, int, text, uuid, int, int, int)',
    'public.hr_hunt_close(uuid, text, timestamptz, boolean)', 'public.hr_hunt_swap(uuid, timestamptz)',
    'public.hr_hunt_lock(uuid, int)', 'public.hr_hunt_gap_ms(public.hunt_sessions)',
    'public.hr_hunt_settle_session(uuid, int, uuid, jsonb)',
    'public.hr_hunt_enter(int, text, jsonb, int, int, int, uuid)', 'public.hr_hunt_leave(int, uuid)',
    'public.hr_hunt_change(int, text, uuid)', 'public.hr_hunt_restock(int, text, bigint, uuid)',
    'public.hr_hunt_use(int, int, uuid)', 'public.hr_hunt_set_preset(int, int, uuid)',
    'public.hr_action_set_put(int, int, text, jsonb, uuid)', 'public.hr_action_set_delete(int, int, uuid)',
    'public.hr_mark_seen(int, uuid, bigint)', 'public.hr_hunt_analyzer(int, uuid)'] loop
    execute format('revoke execute on function %s from public', f);
    foreach r in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('revoke execute on function %s from %I', f, r);
      end if;
    end loop;
  end loop;
end $mig$;
grant execute on function public.hr_hunt_enter(int, text, jsonb, int, int, int, uuid) to authenticated;
grant execute on function public.hr_hunt_leave(int, uuid) to authenticated;
grant execute on function public.hr_hunt_change(int, text, uuid) to authenticated;
grant execute on function public.hr_hunt_restock(int, text, bigint, uuid) to authenticated;
grant execute on function public.hr_hunt_use(int, int, uuid) to authenticated;
grant execute on function public.hr_hunt_set_preset(int, int, uuid) to authenticated;
grant execute on function public.hr_action_set_put(int, int, text, jsonb, uuid) to authenticated;
grant execute on function public.hr_action_set_delete(int, int, uuid) to authenticated;
grant execute on function public.hr_mark_seen(int, uuid, bigint) to authenticated;
grant execute on function public.hr_hunt_analyzer(int, uuid) to authenticated;

delete from public.hr_client_rpc_baseline
 where grantee = 'authenticated'
   and proname in ('hr_hunt_enter', 'hr_hunt_leave', 'hr_hunt_change', 'hr_hunt_restock', 'hr_hunt_use',
                   'hr_hunt_set_preset', 'hr_action_set_put', 'hr_action_set_delete', 'hr_mark_seen', 'hr_hunt_analyzer');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_hunt_enter', 'p_slot integer, p_hunt text, p_bag jsonb, p_preset integer, p_falls integer, p_hours integer, p_idem uuid', 'authenticated',
   'added 2026-10-21 (hunt sessions C1): opens a hunt and packs the bag from inventory (matched ledger pairs); ids and clamped ints only'),
  ('hr_hunt_leave', 'p_slot integer, p_idem uuid', 'authenticated',
   'added 2026-10-21 (hunt sessions C1): leave now, or at the next settle; the bag returns as matched pairs'),
  ('hr_hunt_change', 'p_slot integer, p_hunt text, p_idem uuid', 'authenticated',
   'added 2026-10-21 (hunt sessions C1): move to another hunt; the bag moves session to session as matched pairs'),
  ('hr_hunt_restock', 'p_slot integer, p_item text, p_qty bigint, p_idem uuid', 'authenticated',
   'added 2026-10-21 (hunt sessions C1): inventory -> bag mid-hunt, matched pair, qty bounded by stock'),
  ('hr_hunt_use', 'p_slot integer, p_bar_slot integer, p_idem uuid', 'authenticated',
   'added 2026-10-21 (hunt sessions C1): queues a manual press; writes no value, the settle caps uses'),
  ('hr_hunt_set_preset', 'p_slot integer, p_preset integer, p_idem uuid', 'authenticated',
   'added 2026-10-21 (hunt sessions C1): switch the running hunt''s action bar'),
  ('hr_action_set_put', 'p_slot integer, p_preset integer, p_name text, p_slots jsonb, p_idem uuid', 'authenticated',
   'added 2026-10-21 (hunt sessions C1): save an action-bar preset, validated against the rule catalogue'),
  ('hr_action_set_delete', 'p_slot integer, p_preset integer, p_idem uuid', 'authenticated',
   'added 2026-10-21 (hunt sessions C1): delete a preset not in use'),
  ('hr_mark_seen', 'p_slot integer, p_session uuid, p_event_id bigint', 'authenticated',
   'added 2026-10-21 (hunt sessions C1): moves the timeline read cursor forward; no value'),
  ('hr_hunt_analyzer', 'p_slot integer, p_session uuid', 'authenticated',
   'added 2026-10-21 (hunt sessions C1): read-only Analyzer over the caller''s own session');

-- ── §8 SELF-CHECK (CLAUDE.md §4), EXECUTED AND ROLLED BACK ─────────────────
do $mig$
declare
  v_uid  uuid := '00000000-0000-4000-8000-00000000c1b1';
  v_r    jsonb;
  v_sid  uuid;
  v_sid2 uuid;
  v_n    bigint;
  v_role text;
  v_f    text;
  v_h    jsonb;
  v_ver  bigint;
  v_from timestamptz;
  v_err  text;
  v_cfg  boolean := (select enabled from public.hr_hunt_config where id);
  c_fns  constant text[] := array[
    'public.hr_hunt_enter(integer,text,jsonb,integer,integer,integer,uuid)', 'public.hr_hunt_leave(integer,uuid)',
    'public.hr_hunt_change(integer,text,uuid)', 'public.hr_hunt_restock(integer,text,bigint,uuid)',
    'public.hr_hunt_use(integer,integer,uuid)', 'public.hr_hunt_set_preset(integer,integer,uuid)',
    'public.hr_action_set_put(integer,integer,text,jsonb,uuid)', 'public.hr_action_set_delete(integer,integer,uuid)',
    'public.hr_mark_seen(integer,uuid,bigint)', 'public.hr_hunt_analyzer(integer,uuid)'];
  c_internal constant text[] := array[
    'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)', 'public.hr_hunt_close(uuid,text,timestamp with time zone,boolean)',
    'public.hr_hunt_swap(uuid,timestamp with time zone)', 'public.hr_hunt_point(uuid,integer,text)',
    'public.hr_hunt_new_session(uuid,integer,text,uuid,integer,integer,integer)', 'public.hr_hunt_lock(uuid,integer)',
    'public.hr_hunt_ledger_pair(uuid,integer,uuid,uuid,text,bigint,text)', 'public.hr_hunt_admit(uuid,integer,text)'];
begin
  -- (a) PRIVILEGES. The ten verbs: authenticated only. Internals: nobody.
  --     Tables: own-row SELECT, no write grant, no write policy, RLS on.
  foreach v_f in array c_fns loop
    if not has_function_privilege('authenticated', v_f, 'execute') then raise exception 'GATE(a): authenticated cannot execute %', v_f; end if;
    if has_function_privilege('anon', v_f, 'execute') then raise exception 'GATE(a): anon can execute %', v_f; end if;
  end loop;
  -- (every one is rate-gated: hr_assert_grant_hygiene's ungated_client_rpcs, at (y))
  foreach v_f in array c_internal loop
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(v_role, v_f, 'execute') then raise exception 'GATE(a): % can execute %', v_role, v_f; end if;
    end loop;
  end loop;
  foreach v_f in array array['hunt_sessions', 'hunt_bag', 'hunt_session_tally', 'hunt_session_events', 'player_action_sets', 'hr_hunt_config'] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(v_role, 'public.' || v_f, 'insert,update,delete,truncate,references,trigger') then
        raise exception 'GATE(a): % holds a write privilege on %', v_role, v_f; end if;
    end loop;
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_f)::regclass) then
      raise exception 'GATE(a): RLS is off on %', v_f; end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = v_f and cmd <> 'SELECT') then
      raise exception 'GATE(a): a write policy exists on %', v_f; end if;
  end loop;

  begin  -- ── SUBTRANSACTION: every probe row is discarded at HRC1B ──────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'GATE(b): no probe character: %', v_r; end if;
    delete from public.player_inventory where user_id = v_uid and slot = 0;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_uid, 0, 'cooked_shrimp', 20), (v_uid, 0, 'bronze_arrows', 50);

    -- (b0) THE SWITCH SHIPS OFF: while disabled no hunt opens. The probe opens
    --      it inside this rolled-back block only.
    update public.hr_hunt_config set enabled = false where id;
    v_r := public.hr_hunt_enter(0, 'mill_cellar', '[{"item":"cooked_shrimp","qty":5}]', 0, null, null, gen_random_uuid());
    if v_r->>'error' is distinct from 'hunts_paused' or exists (select 1 from public.hunt_sessions where user_id = v_uid) then
      raise exception 'GATE(b0): an enter while hunts are paused answered %', v_r; end if;
    update public.hr_hunt_config set enabled = true where id;

    -- (b) FORGED / MALFORMED BAGS are refused and move nothing.
    v_r := public.hr_hunt_enter(0, 'mill_cellar', '[{"item":"cooked_shrimp","qty":999}]', 0, null, null, gen_random_uuid());
    if v_r->>'error' is distinct from 'insufficient_item' then raise exception 'GATE(b): a forged qty answered %', v_r; end if;
    v_r := public.hr_hunt_enter(0, 'mill_cellar', '[{"item":"iron_bar","qty":1}]', 0, null, null, gen_random_uuid());
    if v_r->>'error' is distinct from 'unknown_supply' then raise exception 'GATE(b): a non-supply answered %', v_r; end if;
    v_r := public.hr_hunt_enter(0, 'mill_cellar', '[{"item":"cooked_shrimp","qty":1.5}]', 0, null, null, gen_random_uuid());
    if v_r->>'error' is distinct from 'bad_qty' then raise exception 'GATE(b): a fractional qty answered %', v_r; end if;
    v_r := public.hr_hunt_enter(0, 'mill_cellar', '[{"item":"cooked_shrimp","qty":1,"at":0}]', 0, null, null, gen_random_uuid());
    if v_r->>'error' is distinct from 'bad_bag' then raise exception 'GATE(b): a client time answered %', v_r; end if;
    v_r := public.hr_hunt_enter(0, 'not_a_hunt', '[]', 0, null, null, gen_random_uuid());
    if v_r->>'error' is distinct from 'unknown_hunt' then raise exception 'GATE(b): an unknown hunt answered %', v_r; end if;
    v_r := public.hr_hunt_enter(0, 'ridge_camp', '[]', 0, null, null, gen_random_uuid());
    if v_r->>'error' is distinct from 'activity_locked' then raise exception 'GATE(b): ridge_camp below band answered %', v_r; end if;
    v_r := public.hr_hunt_enter(0, 'mill_cellar', '[]', 0, 9, null, gen_random_uuid());
    if v_r->>'error' is distinct from 'bad_falls' then raise exception 'GATE(b): falls 9 answered %', v_r; end if;
    if (select qty from public.player_inventory where user_id = v_uid and slot = 0 and item_id = 'cooked_shrimp') <> 20
       or exists (select 1 from public.hunt_sessions where user_id = v_uid) then
      raise exception 'GATE(b): a refused enter moved something'; end if;

    -- (c) ENTER: inventory -> bag as a matched pair; the pointer is the hunt.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_hunt_enter(0, 'mill_cellar', '[{"item":"cooked_shrimp","qty":12},{"item":"bronze_arrows","qty":50}]', 0, null, null,
                                '00000000-0000-4000-8000-0000000c1b01');
    if coalesce(v_r->>'ok', 'false') <> 'true' then raise exception 'GATE(c): enter answered %', v_r; end if;
    v_sid := (v_r->'session'->>'id')::uuid;
    if (select qty from public.player_inventory where user_id = v_uid and slot = 0 and item_id = 'cooked_shrimp') <> 8
       or exists (select 1 from public.player_inventory where user_id = v_uid and slot = 0 and item_id = 'bronze_arrows')
       or (select qty_left from public.hunt_bag where session_id = v_sid and item_id = 'cooked_shrimp') <> 12
       or (select active_kind || ':' || active_id from public.player_state where user_id = v_uid and slot = 0) <> 'combat:mill_cellar'
       or (select version from public.player_state where user_id = v_uid and slot = 0) <= v_ver then
      raise exception 'GATE(c): the pack did not land as inventory 8 / bag 12 / pointer combat:mill_cellar'; end if;
    if (select coalesce(sum(qty), 1) from public.player_ledger where user_id = v_uid and kind = 'hunt') <> 0
       or (select count(*) from public.player_ledger where user_id = v_uid and kind = 'hunt' and intent = 'hunt_pack') <> 4 then
      raise exception 'GATE(c): the pack pairs do not cancel'; end if;
    -- (c2) IDEMPOTENT: the same key answers the same session, opens nothing.
    v_r := public.hr_hunt_enter(0, 'mill_cellar', '[{"item":"cooked_shrimp","qty":12}]', 0, null, null,
                                '00000000-0000-4000-8000-0000000c1b01');
    if (v_r->'session'->>'id')::uuid is distinct from v_sid or (select count(*) from public.hunt_sessions where user_id = v_uid) <> 1 then
      raise exception 'GATE(c2): a replayed key was not idempotent: %', v_r; end if;
    -- (c3) ONE OPEN SESSION.
    v_r := public.hr_hunt_enter(0, 'goblin_warren', '[]', 0, null, null, gen_random_uuid());
    if v_r->>'error' is distinct from 'hunt_open' then raise exception 'GATE(c3): a second enter answered %', v_r; end if;
    begin
      insert into public.hunt_sessions (user_id, slot, hunt_id, falls_limit, hunt_from, settled_to, next_swing_at)
        values (v_uid, 0, 'rat', 3, now(), now(), now());
      raise exception 'GATE(c3): the partial unique index admitted a second open session';
    exception when unique_violation then null;
    end;
    -- (c4) THE POINTER GUARD refuses any other writer while a hunt is open.
    begin
      update public.player_state set active_kind = 'idle', active_id = null where user_id = v_uid and slot = 0;
      raise exception 'GATE(c4): the pointer moved while a hunt was open';
    exception when sqlstate 'HR000' then
      if sqlerrm <> 'hunt_open' then raise; end if;
    end;
    -- (c5) BAGGED ITEMS ARE OUT OF REACH: the CHECK holds the floor.
    begin
      update public.hunt_bag set qty_left = -1 where session_id = v_sid and item_id = 'cooked_shrimp';
      raise exception 'GATE(c5): qty_left went negative';
    exception when check_violation then null;
    end;

    -- (d) A PRESS ONLY QUEUES: no bag, ledger or tally row moves.
    select count(*) into v_n from public.player_ledger where user_id = v_uid;
    v_r := public.hr_hunt_use(0, 0, gen_random_uuid());
    if coalesce(v_r->>'ok', 'false') <> 'true' then raise exception 'GATE(d): a press answered %', v_r; end if;
    if (select count(*) from public.player_ledger where user_id = v_uid) <> v_n
       or (select qty_left from public.hunt_bag where session_id = v_sid and item_id = 'cooked_shrimp') <> 12
       or jsonb_array_length((select presses from public.hunt_sessions where id = v_sid)) <> 1 then
      raise exception 'GATE(d): a press moved value'; end if;
    v_r := public.hr_hunt_use(0, 0, gen_random_uuid());
    if v_r->>'error' is distinct from 'press_queued' then raise exception 'GATE(d): a second press answered %', v_r; end if;

    -- (e) THE SETTLE: the engine's stamped rows are folded, uses come out of the
    --     bag as ONE consumption row, and the tally equals Σ ledger. Every
    --     refusal RAISES (HR000), so it is caught here, never read from a result.
    select hunt_from into v_from from public.hunt_sessions where id = v_sid;
    update public.hunt_sessions set entered_at = now() - interval '10 minutes', hunt_from = now() - interval '9 minutes',
                                    settled_to = now() - interval '9 minutes', next_swing_at = now() - interval '9 minutes'
     where id = v_sid;
    select settled_to into v_from from public.hunt_sessions where id = v_sid;
    -- (e0) A REFUSAL AFTER hr_apply LEAVES NOTHING (Security item 2): a real
    --      hr_apply moves a stamped ledger row and the version, then a stale
    --      settle raises, and both are gone with the block.
    select count(*) into v_n from public.player_ledger where user_id = v_uid;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_err := null;
    begin
      perform set_config('hr.hunt_session', v_sid::text, true);
      v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
               '{"fight":{"monster":"rat","hp":3,"kills":0},"journal":{"intent":"set_activity"}}'::jsonb);
      perform set_config('hr.hunt_session', '', true);
      if coalesce(v_r->>'ok', 'false') <> 'true'
         or not exists (select 1 from public.player_ledger where user_id = v_uid and session_id = v_sid) then
        raise exception 'GATE(e0) CANNOT RUN: hr_apply answered % and stamped no ledger row', v_r; end if;
      perform public.hr_hunt_settle_session(v_uid, 0, v_sid, jsonb_build_object('swing_from', 5, 'swing_to', 6, 'to', v_from + interval '60 seconds', 'next_swing_at', v_from + interval '61 seconds'));
    exception when sqlstate 'HR000' then v_err := sqlerrm;
    end;
    if v_err is distinct from 'session_moved'
       or (select count(*) from public.player_ledger where user_id = v_uid) <> v_n
       or (select version from public.player_state where user_id = v_uid and slot = 0) <> v_ver then
      raise exception 'GATE(e0): a refused settle after hr_apply kept value (refusal %, ledger % -> %)', v_err, v_n,
        (select count(*) from public.player_ledger where user_id = v_uid); end if;
    perform set_config('hr.hunt_session', v_sid::text, true);
    insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
      values (v_uid, 0, 'accrue', 'tick', 40, '{"delta":{"g":40,"x":{"attack":30},"i":{"bones":3}},"kills":6}');
    insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
      values (v_uid, 0, 'combat', 'death', 0, '{"monster":"rat"}');
    perform set_config('hr.hunt_session', '', true);
    if (select count(*) from public.player_ledger where session_id = v_sid and kind in ('accrue', 'combat')) <> 2 then
      raise exception 'GATE(e): the GUC stamp did not mark the engine rows'; end if;
    -- stale swing / bag short / cap / hidden fall / unproven end / invented press — all raise, nothing written
    v_err := null;
    begin
      perform public.hr_hunt_settle_session(v_uid, 0, v_sid, jsonb_build_object('swing_from', 5, 'swing_to', 6, 'to', v_from + interval '60 seconds', 'next_swing_at', v_from + interval '61 seconds'));
    exception when sqlstate 'HR000' then v_err := sqlerrm;
    end;
    if v_err is distinct from 'session_moved' then raise exception 'GATE(e): a stale swing answered %', v_err; end if;
    v_err := null;
    begin
      perform public.hr_hunt_settle_session(v_uid, 0, v_sid, jsonb_build_object('swing_from', 0, 'swing_to', 25, 'to', v_from + interval '60 seconds', 'next_swing_at', v_from + interval '61 seconds', 'falls', 1, 'uses', jsonb_build_object('cooked_shrimp', 40)));
    exception when sqlstate 'HR000' then v_err := sqlerrm;
    end;
    if v_err is distinct from 'bag_short' then raise exception 'GATE(e): 40 from a bag of 12 answered %', v_err; end if;
    v_err := null;
    begin
      perform public.hr_hunt_settle_session(v_uid, 0, v_sid, jsonb_build_object('swing_from', 0, 'swing_to', 5, 'to', v_from + interval '10 seconds', 'next_swing_at', v_from + interval '11 seconds', 'falls', 1, 'uses', jsonb_build_object('cooked_shrimp', 10)));
    exception when sqlstate 'HR000' then v_err := sqlerrm;
    end;
    if v_err is distinct from 'too_many_uses' then raise exception 'GATE(e): 10 heals in 10 s answered %', v_err; end if;
    v_err := null;
    begin
      perform public.hr_hunt_settle_session(v_uid, 0, v_sid, jsonb_build_object('swing_from', 0, 'swing_to', 25, 'to', v_from + interval '60 seconds', 'next_swing_at', v_from + interval '61 seconds', 'falls', 0));
    exception when sqlstate 'HR000' then v_err := sqlerrm;
    end;
    if v_err is distinct from 'falls_mismatch' then raise exception 'GATE(e): hiding a journalled fall answered %', v_err; end if;
    v_err := null;
    begin
      perform public.hr_hunt_settle_session(v_uid, 0, v_sid, jsonb_build_object('swing_from', 0, 'swing_to', 25, 'to', v_from + interval '60 seconds', 'next_swing_at', v_from + interval '61 seconds', 'falls', 1, 'ended', jsonb_build_object('reason', 'heals_out', 'at', v_from + interval '30 seconds')));
    exception when sqlstate 'HR000' then v_err := sqlerrm;
    end;
    if v_err is distinct from 'end_not_proven' then raise exception 'GATE(e): an unproven end answered %', v_err; end if;
    v_err := null;
    begin
      perform public.hr_hunt_settle_session(v_uid, 0, v_sid, jsonb_build_object('swing_from', 0, 'swing_to', 25, 'to', v_from + interval '60 seconds', 'next_swing_at', v_from + interval '61 seconds', 'falls', 1, 'presses_left', jsonb_build_array(0, 0)));
    exception when sqlstate 'HR000' then v_err := sqlerrm;
    end;
    if v_err is distinct from 'bad_presses' then raise exception 'GATE(e): an invented press answered %', v_err; end if;
    if (select swing_index from public.hunt_sessions where id = v_sid) <> 0
       or (select ledger_hwm from public.hunt_session_tally where session_id = v_sid) <> 0 then
      raise exception 'GATE(e): a refused settle wrote'; end if;
    v_r := public.hr_hunt_settle_session(v_uid, 0, v_sid, jsonb_build_object('swing_from', 0, 'swing_to', 25,
             'to', v_from + interval '60 seconds', 'next_swing_at', v_from + interval '61 seconds', 'falls', 1,
             'uses', jsonb_build_object('cooked_shrimp', 4, 'bronze_arrows', 25), 'presses_left', '[]'::jsonb,
             'down_ms', 2000, 'paid_ms', 58000, 'hints', jsonb_build_object('rare_drop', jsonb_build_array(
               jsonb_build_object('item', 'bones'), jsonb_build_object('item', 'dragon_bones')))));
    if coalesce(v_r->>'ok', 'false') <> 'true' then raise exception 'GATE(e): an honest settle answered %', v_r; end if;
    if (select coins from public.hunt_session_tally where session_id = v_sid) <> 40
       or (select kills from public.hunt_session_tally where session_id = v_sid) <> 6
       or (select deaths from public.hunt_session_tally where session_id = v_sid) <> 1
       or (select (xp->>'attack')::numeric from public.hunt_session_tally where session_id = v_sid) <> 30
       or (select (loot->>'bones')::numeric from public.hunt_session_tally where session_id = v_sid) <> 3
       or (select (supplies->>'cooked_shrimp')::numeric from public.hunt_session_tally where session_id = v_sid) <> 4
       or (select qty_left from public.hunt_bag where session_id = v_sid and item_id = 'cooked_shrimp') <> 8
       or (select falls from public.hunt_sessions where id = v_sid) <> 1 then
      raise exception 'GATE(e): the tally / bag / falls after the settle are wrong: %',
        (select row_to_json(t) from public.hunt_session_tally t where session_id = v_sid); end if;
    if (select count(*) from public.player_ledger where session_id = v_sid and intent = 'hunt_consume') <> 1
       or (select qty from public.player_ledger where session_id = v_sid and intent = 'hunt_consume') <> -29 then
      raise exception 'GATE(e): consumption was not ONE row of -29 for the settle'; end if;
    if (select count(*) from public.hunt_session_events where session_id = v_sid and type = 'fall') <> 1
       or (select count(*) from public.hunt_session_events where session_id = v_sid and type = 'rare_drop') <> 1 then
      raise exception 'GATE(e): the derived events are wrong (a fall, and only the looted rare drop)'; end if;
    -- tally = Σ ledger, by construction and by measurement
    if (select coins from public.hunt_session_tally where session_id = v_sid)
       <> (select coalesce(sum(gold), 0) from public.player_ledger where session_id = v_sid and kind <> 'hunt')
       or (select (supplies->>'bronze_arrows')::numeric from public.hunt_session_tally where session_id = v_sid)
       <> (select sum((meta->'items'->>'bronze_arrows')::numeric) from public.player_ledger where session_id = v_sid and intent = 'hunt_consume') then
      raise exception 'GATE(e): tally <> Σ ledger'; end if;
    -- an owed end: the falls limit reached without an end is refused
    update public.hunt_sessions set falls_limit = 1 where id = v_sid;
    v_err := null;
    begin
      perform public.hr_hunt_settle_session(v_uid, 0, v_sid, jsonb_build_object('swing_from', 25, 'swing_to', 30, 'to', v_from + interval '70 seconds', 'next_swing_at', v_from + interval '71 seconds', 'falls', 1));
    exception when sqlstate 'HR000' then v_err := sqlerrm;
    end;
    if v_err is distinct from 'end_missing' then raise exception 'GATE(e): an owed end answered %', v_err; end if;
    update public.hunt_sessions set falls_limit = 3 where id = v_sid;

    -- (f) ACTION SETS: the catalogue decides; out-of-range values are refused.
    v_r := public.hr_action_set_put(0, 1, 'Burst', '[{"item":"*heal","on":true,"conditions":[{"subject":"self_hp_pct","op":"<=","value":60}]},{"item":"tomato_soup","on":true,"conditions":[{"subject":"buff_missing:damage"}]}]', gen_random_uuid());
    if coalesce(v_r->>'ok', 'false') <> 'true' then raise exception 'GATE(f): a valid preset answered %', v_r; end if;
    v_r := public.hr_action_set_put(0, 1, 'x', '[{"item":"*heal","on":true,"conditions":[{"subject":"self_hp_pct","op":"<=","value":100}]}]', gen_random_uuid());
    if v_r->>'why' is distinct from 'value_out_of_range' then raise exception 'GATE(f): hp 100%% answered %', v_r; end if;
    v_r := public.hr_action_set_put(0, 1, 'x', '[{"item":"*heal","on":true,"conditions":[{"subject":"monster_hp","op":"<=","value":5}]}]', gen_random_uuid());
    if v_r->>'why' is distinct from 'unknown_subject' then raise exception 'GATE(f): an unknown subject answered %', v_r; end if;
    v_r := public.hr_action_set_put(0, 1, 'x', '[{"item":"iron_bar","on":true,"conditions":[]}]', gen_random_uuid());
    if v_r->>'why' is distinct from 'item_not_fireable' then raise exception 'GATE(f): a non-supply slot answered %', v_r; end if;
    v_r := public.hr_action_set_delete(0, 0, gen_random_uuid());
    if v_r->>'error' is distinct from 'preset_in_use' then raise exception 'GATE(f): deleting the running preset answered %', v_r; end if;

    -- (g) RESTOCK refuses a forged qty and moves a real one as a pair.
    v_r := public.hr_hunt_restock(0, 'cooked_shrimp', 9, gen_random_uuid());
    if v_r->>'error' is distinct from 'insufficient_item' and v_r->>'error' is distinct from 'settle_first' then
      raise exception 'GATE(g): restocking 9 of 8 answered %', v_r; end if;
    update public.hunt_sessions set settled_to = now(), next_swing_at = now() where id = v_sid;
    v_r := public.hr_hunt_restock(0, 'cooked_shrimp', 9, gen_random_uuid());
    if v_r->>'error' is distinct from 'insufficient_item' then raise exception 'GATE(g): restocking 9 of 8 answered %', v_r; end if;
    v_r := public.hr_hunt_restock(0, 'cooked_shrimp', 3, gen_random_uuid());
    if coalesce(v_r->>'ok', 'false') <> 'true'
       or (select qty_left from public.hunt_bag where session_id = v_sid and item_id = 'cooked_shrimp') <> 11
       or (select qty from public.player_inventory where user_id = v_uid and slot = 0 and item_id = 'cooked_shrimp') <> 5 then
      raise exception 'GATE(g): a restock of 3 answered % or did not move', v_r; end if;

    -- (h) CHANGE: the bag moves session to session as pairs; nothing to inventory.
    v_r := public.hr_hunt_change(0, 'goblin_warren', gen_random_uuid());
    if coalesce(v_r->>'ok', 'false') <> 'true' or (v_r->>'pending')::boolean then
      raise exception 'GATE(h): change answered %', v_r; end if;
    v_sid2 := (v_r->'session'->>'id')::uuid;
    if (select prev_session_id from public.hunt_sessions where id = v_sid2) is distinct from v_sid
       or (select end_reason from public.hunt_sessions where id = v_sid) is distinct from 'changed'
       or (select qty_left from public.hunt_bag where session_id = v_sid2 and item_id = 'cooked_shrimp') <> 11
       or (select coalesce(sum(qty_left), 0) from public.hunt_bag where session_id = v_sid) <> 0
       or (select qty from public.player_inventory where user_id = v_uid and slot = 0 and item_id = 'cooked_shrimp') <> 5
       or (select active_id from public.player_state where user_id = v_uid and slot = 0) <> 'goblin_warren' then
      raise exception 'GATE(h): the change did not move the bag'; end if;

    -- (i) LEAVE: the bag returns as pairs and every bag side nets to zero.
    v_r := public.hr_hunt_leave(0, gen_random_uuid());
    if coalesce(v_r->>'ok', 'false') <> 'true' or (v_r->>'pending')::boolean then raise exception 'GATE(i): leave answered %', v_r; end if;
    if (select qty from public.player_inventory where user_id = v_uid and slot = 0 and item_id = 'cooked_shrimp') <> 16
       or (select qty from public.player_inventory where user_id = v_uid and slot = 0 and item_id = 'bronze_arrows') <> 25
       or (select active_kind from public.player_state where user_id = v_uid and slot = 0) <> 'idle'
       or exists (select 1 from public.hunt_sessions where user_id = v_uid and ended_at is null) then
      raise exception 'GATE(i): leave did not return the bag (shrimp 16, arrows 25) or free the pointer'; end if;
    -- BAG CONSERVATION: per session, the bag side of the journal equals the bag.
    --     (pairs carry item_id; the per-settle consumption row carries meta.items)
    if exists (select 1 from (select session_id, item_id, sum(q) as j from (
                                 select l.session_id, l.item_id, l.qty as q from public.player_ledger l
                                  where l.user_id = v_uid and l.kind = 'hunt' and l.meta->>'side' = 'bag' and l.item_id is not null
                                 union all
                                 select l.session_id, i.key, -(i.value::bigint) from public.player_ledger l, jsonb_each_text(l.meta->'items') i
                                  where l.user_id = v_uid and l.kind = 'hunt' and l.intent = 'hunt_consume') u
                               group by 1, 2) x
                where x.j <> coalesce((select b.qty_left from public.hunt_bag b where b.session_id = x.session_id and b.item_id = x.item_id), 0)) then
      raise exception 'GATE(i): the bag side of the journal does not equal the bag'; end if;
    -- INVENTORY CONSERVATION: start 20 shrimp + 50 arrows = inventory + consumed.
    if (select qty from public.player_inventory where user_id = v_uid and slot = 0 and item_id = 'cooked_shrimp') + 4 <> 20
       or (select qty from public.player_inventory where user_id = v_uid and slot = 0 and item_id = 'bronze_arrows') + 25 <> 50 then
      raise exception 'GATE(i): items were minted or lost across pack / change / leave'; end if;

    -- (j) THE ANALYZER reads it back: gold at vendor value, waste, balance.
    v_r := public.hr_hunt_analyzer(0, v_sid);
    if coalesce(v_r->>'ok', 'false') <> 'true' or (v_r->>'coins')::bigint <> 40
       or (v_r->>'balance')::bigint <> (v_r->>'gold')::bigint - (v_r->>'waste')::bigint
       or (v_r->>'waste')::bigint <= 0 then
      raise exception 'GATE(j): the analyzer answered %', v_r; end if;
    v_r := public.hr_mark_seen(0, v_sid, 999999999);
    if (v_r->>'seen_event_id')::bigint <> (select max(id) from public.hunt_session_events where session_id = v_sid) then
      raise exception 'GATE(j): mark_seen moved past the last event: %', v_r; end if;

    raise exception using errcode = 'HRC1B', message = 'hunt-sessions §8 complete — rolling back';
  exception when sqlstate 'HRC1B' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  -- (z) NOTHING LEAKED — and the kill switch is where this file found it.
  if (select enabled from public.hr_hunt_config where id) is distinct from v_cfg then
    raise exception 'GATE(z): §8 moved the hunt kill switch'; end if;
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from public.player_intents where user_id = v_uid)
     or exists (select 1 from public.hunt_sessions where user_id = v_uid)
     or exists (select 1 from public.hr_rejections where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE(z): §8 LEAKED a probe row'; end if;

  -- (y) THE DETECTOR IS GREEN.
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    v_h := public.hr_assert_grant_hygiene(true);
    if v_h is null
       or jsonb_array_length(coalesce(v_h->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_h->'ungated_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_h->'engine_execute_outside_allowlist', '[]'::jsonb)) <> 0 then
      raise exception 'GATE(y): hr_assert_grant_hygiene is RED after this file: %', v_h; end if;
  end if;
  raise notice 'hunt-sessions: EXECUTED - forged/malformed bags refused, pack/change/leave move matched pairs, one open session, '
               'pointer guarded, a press moves no value, the settle folds the ledger (tally = Σ ledger) and refuses stale/short/'
               'over-cap/unproven/owed/invented-press windows, action sets validated, analyzer reads back; net zero';
end $mig$;
