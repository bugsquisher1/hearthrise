-- ════════════════════════════════════════════════════════════════════════
-- 2026-12-23-tally-tasks.sql — TAMSIN'S TALLY: SERVER-COUNTED KILL TASKS, PAID ON
-- THE WAY BACK TO TOWN (game-designer proposal 2026-10-23, approved by Tyler:
-- "build it"; rulings of record: KILL-TASK HUNTER). STAGED (lane/c-tally-tasks,
-- backend-architect, 2026-10-23). Game CLOSED: applies on its passing §8
-- (CLAUDE.md §2). MONEY + ITEM MINT: gold into the account purse and a gear piece
-- or materials into the bag — on the reopen Security review list.
--
-- ── THE RULES, AS BUILT ─────────────────────────────────────────────────────
--   TAKE   at Tamsin's board in town (no open hunt): one task per ground +
--          monster (the catalogue, 2026-12-23-tally-catalogue.generated.sql, from
--          src/data/tally-tasks.js), at most hr_tally_config.held_max (3) per hero.
--          The hero chooses ONCE the armour weight she picks for (heavy / medium /
--          light; changeable) and may reorder her slot order.
--   COUNT  inside the ONE hunt settle (hr_hunt_apply_instance, both doors: the
--          world tick with the browser closed, the player's settle while viewed),
--          for EVERY member of the instance: each member's own kills by monster
--          (the engine's countKill credits every hero standing in the world; the
--          edge sends them as the combat journal's meta.km), held to the kills the
--          settle's kill bound already proved. Never a client number.
--   PAY    in the settle that ends the hero's hunt (back in town, any end), or
--          when the hero visits her in town (hr_tally_collect): under the
--          character lock, a task whose count is done is paid ONCE — its gold
--          into the ACCOUNT purse (hr_purse_move; the purse lock last), her pick
--          into the hero's bag (the next Scarce piece of that ground in the
--          hero's weight she has not given and the hero neither carries nor
--          wears; once every piece is given, the task's materials in turn), one
--          player_ledger row (kind hunt, intent tally_pay:<task>, gold_kind tally,
--          session-stamped inside a hunt), one append-only hero_tally_claims row.
--   CAP    at most hr_tally_config.paid_per_day (3) claims per hero per server
--          (UTC) day: the claim's (hero, day, ordinal 1..3) is UNIQUE. A task
--          finished over the cap waits and pays the next day (her next payment).
--   BAG    her pick needs a new stack's room (hr_apply's rule: a held stack always
--          takes more); with none the task waits, `wait` = bag_full, nothing paid.
--   KEEP   a kept task is taken again the moment it pays (count 0, the
--          catalogue's current target), in the same place.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
--   TABLES (per hero (user_id, slot), FK player_state on delete cascade; RLS own-read;
--   NO client write privilege):
--     hero_tally         weight (null until chosen), slot_order ('{}' = her default)
--     hero_tally_tasks   place 1..3 (the held cap, structurally), task_id (FK the
--                        catalogue), kills <= target, keep, taken_at, done_at
--                        (null exactly while kills < target), wait (bag_full | null)
--     hero_tally_given   the pieces she has given this hero: (item) once, ever
--     hero_tally_claims  append-only (UPDATE refused): day, ordinal 1..3 UNIQUE per
--                        (hero, day), task, kills, gold, pick, item, qty, session
--   CLIENT RPCs (authenticated only; the caller's OWN hero: auth.uid() + p_slot,
--   no target argument exists):
--     hr_tally_view(p_slot)                                    read: her board
--     hr_tally_accept(p_slot, p_task, p_weight, p_idem)        take a task (in town)
--     hr_tally_drop(p_slot, p_task, p_idem)                    give one up (progress lost)
--     hr_tally_set(p_slot, p_task, p_keep, p_weight, p_order, p_idem)
--     hr_tally_collect(p_slot, p_idem)                         visit her in town: be paid
--     Writes: identity -> slot -> input refused (never clamped) -> idem replay ->
--     hr_rpc_gate('hunt') -> hr_hunt_lock -> state -> write -> the decision stored in
--     player_intents. accept / drop also journal a zero-gold ledger row (the count
--     a drop gave up). View: hr_rpc_gate('hunt_read').
--     ERRORS: not_signed_in, bad_slot, bad_idem, rate_limited, no_character,
--     unknown_task, bad_weight, bad_order, bad_arguments, tally_in_town (accept while
--     hunting), tally_pays_in_town (collect while hunting), already_held, tally_full,
--     weight_needed, not_held, intent_mismatch.
--   SECTION `tally` (hr_state_sections -> hr_state_of): { held: [{place, task, hunt,
--     monster, kills, target, keep, done, done_at, wait}], paid_today, per_day,
--     held_max, weight, order, recent: [{claim, at, task, gold, item, qty, pick}]
--     (the last 24 h, newest first), day_ends_at }.
--   OWNER-ONLY HELPERS: hr_tally_section, hr_tally_pick, hr_tally_count,
--     hr_tally_claim, hr_tally_journal, hr_tally_claims_immutable.
--   SPLICED: hr_hunt_apply_instance RESTATED WHOLE from 2026-12-15-account-gold.sql
--     (§0 md5 pin): step (4c) TAMSIN'S TALLY. hr_gold_kind RESTATED WHOLE (§0 pin):
--     intent tally_pay:% -> 'tally'; player_ledger_gold_kind admits 'tally'.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
--   Every write to a hero's tally rows holds that hero's character lock
--   (hr_hunt_lock: the advisory user:slot key + the player_state row), which the
--   settle takes too: a verb and a settle on one hero serialize. Lock order is the
--   house order: (instance ->) character -> the ACCOUNT purse, last. In the settle,
--   hr_hunt_apply_instance already holds every member's character lock and purse
--   (user order) before (4c) runs; hr_tally_claim takes nothing new. In town,
--   hr_tally_collect takes the character lock, then hr_purse_move takes the purse.
--   IDEMPOTENCY: a replayed settle answers `replayed` at the instance CAS before
--   (4c); a replayed verb key answers its stored decision (hr_intent_replay); a paid
--   task is reset or deleted in the same transaction as its claim, so no second
--   payment can find it done; the per-day UNIQUE (hero, day, ordinal) is the
--   structural backstop of the cap. Not provable locally: two overlapping
--   transactions (PGlite is one backend); the lock order above is what makes them safe.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
--   +5 client RPCs (above), each the caller's own hero only. None names a price, a
--   count, a monster count, a day or an item: the server reads the catalogue, the
--   settle's proven kills, its own clock and the hero's rows.
--   NEW MINT (bounded): per hero per UTC day at most paid_per_day claims, each the
--   catalogue's gold (today max 1,090) + one piece or <= 8 materials. Kills are the
--   settle's own (hr_engine-only door): a forged proposal can move at most the
--   window's bounded kill total onto the task's monster (sum(km) <= meta.kills <=
--   the kill bound), the strength of the bound that already prices every kill.
--   Shared surface: the gold lands in the ACCOUNT purse (spendable by every hero of
--   that account, the ruling); nothing crosses accounts.
--
-- ── COST (100x players, ~4,400 accounts, ~9,000 heroes) ─────────────────────
--   hero_tally_tasks <= 3 rows a hero (27k), hero_tally ~1 a hero, hero_tally_given
--   <= 51 a hero (every piece of every ground: ~460k, ~50 B each). hero_tally_claims
--   <= 3 a hero a day, ~150 B: worst case 27k rows/day (~4 MB/day); realistic
--   ~5k/day (~270 MB/year). No prune yet (listed as a known limitation). Ledger:
--   one row per claim / accept / drop (never per kill). Per settle: one indexed read
--   of the member's held tasks (<= 3 rows), nothing when none is held on the ground.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   Re-apply hr_hunt_apply_instance and hr_gold_kind from 2026-12-15-account-gold.sql
--   (the §0 pre-images); drop the five client RPCs + their baseline rows, the
--   helpers, the section row, the four hero_tally* tables and the trigger; restore
--   player_ledger_gold_kind without 'tally' only once no row carries it (paid gold
--   stays in the purses: a forward file, never a claw-back).
--
-- ORDER: after 2026-12-23-tally-catalogue.generated.sql (the catalogue), which follows
--   2026-12-20-loot-catalogue.generated.sql / 2026-12-20-hunt-sessions-catalogue.generated.sql
--   (the pieces' items and the grounds' spawns), and after 2026-12-15-account-gold.sql
--   (the purse, the ledger's purse / gold_kind, the pinned pre-images). EDGE: none
--   (the engine already sends every member's kills by monster). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS — FAIL CLOSED ────────────────────────────────
do $mig$
declare v_md5 text; r record;
begin
  if to_regclass('public.hr_tally_tasks') is null or to_regclass('public.hr_tally_config') is null
     or not exists (select 1 from public.hr_tally_tasks) then
    raise exception 'PRECONDITION: apply 2026-12-23-tally-catalogue.generated.sql first'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'account_wallet' and column_name = 'gold')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_ledger' and column_name = 'gold_kind')
     or to_regprocedure('public.hr_purse_move(uuid,bigint,bigint)') is null then
    raise exception 'PRECONDITION: apply 2026-12-15-account-gold.sql first (the account purse and the ledger''s gold_kind)'; end if;
  if to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null or to_regprocedure('public.hr_rpc_gate(text)') is null
     or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null
     or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null or to_regclass('public.hr_state_sections') is null then
    raise exception 'PRECONDITION: the verb helpers or the section registry are absent'; end if;
  for r in select * from (values
    ('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)', '0badf6bfafe9a9cc85fe059fc9f35497', 'c10fb3297365cdca0efaf23aa315ad08', '2026-12-15-account-gold.sql'),
    ('public.hr_gold_kind(text,text,uuid)', 'b0af3ecd514c0048e8c3959f8edb667e', '304b566454271cc37d9d2f0f51ce7c9a', '2026-12-15-account-gold.sql')
  ) p(sig, pre, post, src) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(r.sig);
    if v_md5 is null then raise exception 'PIN: % is missing', r.sig; end if;
    if v_md5 is distinct from r.pre and v_md5 is distinct from r.post then
      raise exception 'PIN: % is neither %''s image (%) nor this file''s (%) - md5 %: another file moved it; restate from the new image',
        r.sig, r.src, left(r.pre, 8), left(r.post, 8), v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE HERO'S TALLY ──────────────────────────────────────────────────────
create table if not exists public.hero_tally (
  user_id    uuid        not null,
  slot       int         not null,
  weight     text        check (weight in ('heavy', 'medium', 'light')),
  slot_order text[]      not null default '{}'::text[] check (cardinality(slot_order) <= 8),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot),
  foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
comment on table public.hero_tally is
  '2026-12-23-tally-tasks.sql: the armour weight Tamsin picks for this hero (null until chosen) and her slot order for it '
  '(''{}'' = hr_tally_config.slot_order). Written ONLY by hr_tally_accept / hr_tally_set under the character lock.';
create table if not exists public.hero_tally_tasks (
  user_id  uuid        not null,
  slot     int         not null,
  place    smallint    not null check (place between 1 and 3),
  task_id  text        not null references public.hr_tally_tasks (task_id),
  kills    int         not null default 0 check (kills >= 0),
  target   int         not null check (target between 1 and 100000),
  keep     boolean     not null default false,
  taken_at timestamptz not null default now(),
  done_at  timestamptz,
  wait     text        check (wait in ('bag_full')),
  primary key (user_id, slot, place),
  unique (user_id, slot, task_id),
  check (kills <= target),
  check ((done_at is null) = (kills < target)),
  foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
comment on table public.hero_tally_tasks is
  '2026-12-23-tally-tasks.sql: the kill tasks a hero holds (place 1..3 = the held cap). kills moves ONLY in the hunt settle '
  '(hr_tally_count, from the settle''s proven kills); a done task is paid once by hr_tally_claim, then deleted or (keep) taken again.';
create table if not exists public.hero_tally_given (
  user_id  uuid        not null,
  slot     int         not null,
  item_id  text        not null,
  task_id  text        not null,
  claim_id uuid        not null,
  given_at timestamptz not null default now(),
  primary key (user_id, slot, item_id),
  foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
comment on table public.hero_tally_given is
  '2026-12-23-tally-tasks.sql: every piece Tamsin has given this hero, once each, forever (her pick never repeats one).';
create table if not exists public.hero_tally_claims (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null,
  slot       int         not null,
  day        date        not null,
  ordinal    smallint    not null check (ordinal between 1 and 3),
  task_id    text        not null,
  hunt_id    text        not null,
  kills      int         not null check (kills > 0),
  gold       bigint      not null check (gold > 0),
  pick       text        not null check (pick in ('piece', 'material')),
  item_id    text        not null,
  qty        int         not null check (qty between 1 and 100),
  session_id uuid,
  at         timestamptz not null default now(),
  unique (user_id, slot, day, ordinal),
  foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
comment on table public.hero_tally_claims is
  '2026-12-23-tally-tasks.sql: APPEND-ONLY, one row per tally paid: (hero, UTC day, ordinal 1..3) is unique, which IS the '
  'per-day cap. Written ONLY by hr_tally_claim; an UPDATE is refused (hr_tally_claims_immutable).';
create index if not exists hero_tally_claims_task on public.hero_tally_claims (user_id, slot, task_id, pick);
create index if not exists hero_tally_claims_recent on public.hero_tally_claims (user_id, slot, at desc);

create or replace function public.hr_tally_claims_immutable()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  -- TALLY (2026-12-23-tally-tasks.sql): a claim is history; only a character's deletion (cascade) removes one.
  raise exception 'hero_tally_claims is append-only (attempted %)', tg_op using errcode = 'check_violation';
end $$;
drop trigger if exists hr_tally_claims_immutable on public.hero_tally_claims;
create trigger hr_tally_claims_immutable before update on public.hero_tally_claims
  for each row execute function public.hr_tally_claims_immutable();
drop trigger if exists hr_tally_given_immutable on public.hero_tally_given;
create trigger hr_tally_given_immutable before update on public.hero_tally_given
  for each row execute function public.hr_tally_claims_immutable();
revoke all on function public.hr_tally_claims_immutable() from public, anon, authenticated, service_role;

do $mig$
declare v_t text;
begin
  foreach v_t in array array['hero_tally', 'hero_tally_tasks', 'hero_tally_given', 'hero_tally_claims'] loop
    execute format('alter table public.%I enable row level security', v_t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', v_t);
    execute format('grant select on public.%I to authenticated', v_t);
    execute format('drop policy if exists %I on public.%I', v_t || ' own read', v_t);
    execute format('create policy %I on public.%I for select using ((select auth.uid()) = user_id)', v_t || ' own read', v_t);
  end loop;
end $mig$;

-- ── §2 THE LEDGER KNOWS A TALLY PAYMENT ──────────────────────────────────────
do $mig$ begin
  -- NOT VALID, as 2026-12-15-account-gold.sql made it: it binds every row written from here on.
  if not exists (select 1 from pg_constraint where conrelid = 'public.player_ledger'::regclass and conname = 'player_ledger_gold_kind'
                    and pg_get_constraintdef(oid) like '%''tally''%') then
    alter table public.player_ledger drop constraint if exists player_ledger_gold_kind;
    alter table public.player_ledger add constraint player_ledger_gold_kind
      check (gold_kind is null or gold_kind in ('hunt_loot', 'hunt_sale', 'hunt_supply', 'shop', 'house', 'vendor_sale',
        'stamina', 'blessing', 'rename', 'hero_slot', 'storage', 'farm', 'start_kit', 'town_work', 'clan', 'trade',
        'trait', 'fold', 'tally', 'other')) not valid;
  end if;
end $mig$;
-- hr_gold_kind RESTATED WHOLE (§0 pin): Tamsin's payment is its own kind, before the session branch
-- (a payment in the settle that ends a hunt is stamped with that hunt's session).
create or replace function public.hr_gold_kind(p_kind text, p_intent text, p_session uuid)
returns text language sql immutable set search_path = public as $$
  select case
    when p_intent like 'tally\_pay:%' then 'tally'
    when p_intent = 'supply_buy' then 'hunt_supply'
    when p_intent in ('vendor_cover', 'loot_sell') then 'hunt_sale'
    when p_session is not null then 'hunt_loot'
    when p_kind = 'wallet' then 'fold'
    when p_kind = 'hero_slot' then 'hero_slot'
    when p_intent like 'stamina\_refill:%' then 'stamina'
    when p_intent like 'blessing\_buy:%' then 'blessing'
    when p_intent like 'hero\_rename:%' then 'rename'
    when p_intent like 'storage\_chest:%' then 'storage'
    when p_kind = 'farm' or p_intent like 'farm\_%' then 'farm'
    when p_intent like 'vendor\_sell%' then 'vendor_sale'
    when p_kind = 'shop' then 'shop'
    when p_intent = 'create_character' then 'start_kit'
    when p_kind = 'clan' then 'clan'
    when p_kind = 'trade' then 'trade'
    when p_kind = 'trait' then 'trait'
    when p_kind in ('accrue', 'worker', 'gather', 'craft', 'combat', 'farm') then 'town_work'
    else 'other' end
$$;
revoke all on function public.hr_gold_kind(text, text, uuid) from public, anon, authenticated, service_role;

-- ── §3 THE OWNER-ONLY HELPERS ────────────────────────────────────────────────
-- THE SECTION `tally`: what the hero holds, how far along, today's payments and her settings.
create or replace function public.hr_tally_section(p_user uuid, p_slot integer)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  -- TALLY (2026-12-23-tally-tasks.sql)
  select jsonb_build_object(
    'held', coalesce((select jsonb_agg(jsonb_build_object('place', t.place, 'task', t.task_id, 'hunt', c.hunt_id,
                        'monster', c.monster_id, 'kills', t.kills, 'target', t.target, 'keep', t.keep,
                        'done', t.done_at is not null, 'done_at', t.done_at, 'wait', t.wait) order by t.place)
                        from public.hero_tally_tasks t join public.hr_tally_tasks c on c.task_id = t.task_id
                       where t.user_id = p_user and t.slot = p_slot), '[]'::jsonb),
    'paid_today', (select count(*) from public.hero_tally_claims k
                    where k.user_id = p_user and k.slot = p_slot and k.day = (now() at time zone 'UTC')::date),
    'per_day', cfg.paid_per_day,
    'held_max', cfg.held_max,
    'weight', (select h.weight from public.hero_tally h where h.user_id = p_user and h.slot = p_slot),
    'order', to_jsonb(coalesce((select nullif(h.slot_order, '{}'::text[]) from public.hero_tally h
                                 where h.user_id = p_user and h.slot = p_slot), cfg.slot_order)),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('claim', k.id, 'at', k.at, 'task', k.task_id, 'gold', k.gold,
                          'item', k.item_id, 'qty', k.qty, 'pick', k.pick) order by k.at desc)
                          from (select * from public.hero_tally_claims k
                                 where k.user_id = p_user and k.slot = p_slot and k.at > now() - interval '24 hours'
                                 order by k.at desc limit 3) k), '[]'::jsonb),
    'day_ends_at', date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' + interval '1 day')
    from public.hr_tally_config cfg where cfg.only_row
$$;

-- HER PICK for one task: the next Scarce piece of its ground in the hero's weight, in the hero's slot order
-- (tier highest first), that she has not given this hero and the hero neither carries nor wears; once there is
-- none (or no weight is chosen), the task's materials in turn (by how many she has given for it).
create or replace function public.hr_tally_pick(p_user uuid, p_slot integer, p_task text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare v_t public.hr_tally_tasks%rowtype; v_w text; v_order text[]; v_item text; v_n bigint; v_len bigint; v_m record;
begin
  -- TALLY (2026-12-23-tally-tasks.sql)
  select * into v_t from public.hr_tally_tasks where task_id = p_task;
  if not found then return null; end if;
  select h.weight, coalesce(nullif(h.slot_order, '{}'::text[]), c.slot_order) into v_w, v_order
    from public.hr_tally_config c left join public.hero_tally h on h.user_id = p_user and h.slot = p_slot
   where c.only_row;
  if v_w is not null then
    select p.item_id into v_item from public.hr_tally_pieces p
     where p.hunt_id = v_t.hunt_id and p.weight = v_w
       and not exists (select 1 from public.hero_tally_given g where g.user_id = p_user and g.slot = p_slot and g.item_id = p.item_id)
       and not exists (select 1 from public.player_inventory i where i.user_id = p_user and i.slot = p_slot and i.item_id = p.item_id)
       and not exists (select 1 from public.player_equipment e where e.user_id = p_user and e.slot = p_slot and e.item_id = p.item_id)
     order by coalesce(array_position(v_order, p.equip_slot), 99), p.tier desc, p.item_id
     limit 1;
    if v_item is not null then return jsonb_build_object('pick', 'piece', 'item', v_item, 'qty', 1); end if;
  end if;
  select count(*) into v_len from public.hr_tally_materials m where m.task_id = p_task;
  if v_len = 0 then return null; end if;
  select count(*) into v_n from public.hero_tally_claims k
   where k.user_id = p_user and k.slot = p_slot and k.task_id = p_task and k.pick = 'material';
  select m.item_id, m.qty into v_m from public.hr_tally_materials m where m.task_id = p_task order by m.ord offset (v_n % v_len) limit 1;
  return jsonb_build_object('pick', 'material', 'item', v_m.item_id, 'qty', v_m.qty);
end $$;

-- THE COUNT: one member's kills of one settle onto its held tasks on this ground. `p_meta` is the member's own
-- combat journal meta (hr_apply journalled it; hr_hunt_apply_member's kill bound held meta.kills); km = kills by
-- monster. A km that is not whole numbers of real-looking ids, or that sums past the bounded kills, is a forged
-- proposal: refused (the settle moves nothing). Returns how many tasks finished. CALLER HOLDS THE CHARACTER LOCK.
create or replace function public.hr_tally_count(p_user uuid, p_slot integer, p_session uuid, p_meta jsonb)
returns integer language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_hunt text; v_kills numeric; v_sum numeric := 0; v_k text; v_v jsonb; v_r record; v_add int; v_done int := 0;
begin
  -- TALLY (2026-12-23-tally-tasks.sql)
  if p_meta is null or jsonb_typeof(p_meta) <> 'object' or not (p_meta ? 'km') then return 0; end if;
  if jsonb_typeof(p_meta->'km') <> 'object' or jsonb_typeof(p_meta->'kills') is distinct from 'number'
     or (p_meta->>'kills') !~ '^[0-9]{1,9}$' then
    perform public.hr_reject('bad_kills', jsonb_build_object('why', 'shape'));
  end if;
  v_kills := (p_meta->>'kills')::numeric;
  for v_k, v_v in select key, value from jsonb_each(p_meta->'km') loop
    if v_k !~ '^[a-z0-9_]{1,48}$' or jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,9}$' then
      perform public.hr_reject('bad_kills', jsonb_build_object('why', 'km', 'monster', left(v_k, 48)));
    end if;
    v_sum := v_sum + (v_v #>> '{}')::numeric;
  end loop;
  if v_sum > v_kills then
    perform public.hr_reject('bad_kills', jsonb_build_object('why', 'sum', 'km', v_sum, 'kills', v_kills));
  end if;
  select h.hunt_id into v_hunt from public.hunt_sessions h where h.id = p_session and h.user_id = p_user and h.slot = p_slot;
  if v_hunt is null or v_sum = 0 then return 0; end if;
  for v_r in select t.place, t.kills, t.target, c.monster_id
               from public.hero_tally_tasks t join public.hr_tally_tasks c on c.task_id = t.task_id
              where t.user_id = p_user and t.slot = p_slot and c.hunt_id = v_hunt and t.done_at is null
              order by t.place for update of t loop
    v_add := least(v_r.target - v_r.kills, coalesce((p_meta->'km'->>v_r.monster_id)::bigint, 0))::int;
    continue when v_add <= 0;
    update public.hero_tally_tasks
       set kills = kills + v_add, done_at = case when kills + v_add >= target then now() end
     where user_id = p_user and slot = p_slot and place = v_r.place;
    if v_r.kills + v_add >= v_r.target then v_done := v_done + 1; end if;
  end loop;
  return v_done;
end $$;

-- THE PAYMENT: every DONE task of the hero, earliest finished first, while today's claims are under the cap.
-- Under the CALLER'S character lock; the account purse is locked by hr_purse_move (already held in the settle).
-- Per task, all or nothing: the claim row (its UNIQUE (hero, day, ordinal) is the cap), the piece's given-row,
-- the bag, the purse, one ledger row; then keep -> taken again, else the place frees. Returns
-- { paid: [{claim, task, gold, item, qty, pick}], wait: null | 'cap' | 'bag_full' }.
create or replace function public.hr_tally_claim(p_user uuid, p_slot integer, p_session uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_cfg public.hr_tally_config%rowtype;
  v_day date := (now() at time zone 'UTC')::date;
  v_n int; v_r record; v_pick jsonb; v_id uuid; v_cap int; v_stacks int; v_purse bigint;
  v_paid jsonb := '[]'::jsonb; v_why text;
begin
  -- TALLY (2026-12-23-tally-tasks.sql)
  select * into v_cfg from public.hr_tally_config where only_row;
  if not found then return jsonb_build_object('paid', v_paid, 'wait', 'catalogue_missing'); end if;
  select count(*) into v_n from public.hero_tally_claims k where k.user_id = p_user and k.slot = p_slot and k.day = v_day;
  select ps.bank_cap into v_cap from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
  for v_r in select t.place, t.task_id, t.kills, t.keep, c.hunt_id, c.gold, c.target as now_target
               from public.hero_tally_tasks t join public.hr_tally_tasks c on c.task_id = t.task_id
              where t.user_id = p_user and t.slot = p_slot and t.done_at is not null
              order by t.done_at, t.place for update of t loop
    if v_n >= v_cfg.paid_per_day then v_why := 'cap'; exit; end if;
    v_pick := public.hr_tally_pick(p_user, p_slot, v_r.task_id);
    if v_pick is null then v_why := coalesce(v_why, 'catalogue_missing'); continue; end if;
    -- THE BAG: a new stack needs room (a stack already held always takes more).
    if not exists (select 1 from public.player_inventory i where i.user_id = p_user and i.slot = p_slot and i.item_id = v_pick->>'item') then
      select count(*) into v_stacks from (select 1 from public.player_inventory i where i.user_id = p_user and i.slot = p_slot
                                            limit coalesce(v_cap, 0) + 1) s;
      if v_stacks >= coalesce(v_cap, 0) then
        update public.hero_tally_tasks set wait = 'bag_full' where user_id = p_user and slot = p_slot and place = v_r.place;
        v_why := 'bag_full';
        continue;
      end if;
    end if;
    v_n := v_n + 1;
    insert into public.hero_tally_claims (user_id, slot, day, ordinal, task_id, hunt_id, kills, gold, pick, item_id, qty, session_id)
      values (p_user, p_slot, v_day, v_n, v_r.task_id, v_r.hunt_id, v_r.kills, v_r.gold, v_pick->>'pick', v_pick->>'item',
              (v_pick->>'qty')::int, p_session)
      returning id into v_id;
    if v_pick->>'pick' = 'piece' then
      insert into public.hero_tally_given (user_id, slot, item_id, task_id, claim_id) values (p_user, p_slot, v_pick->>'item', v_r.task_id, v_id);
    end if;
    insert into public.player_inventory as pi (user_id, slot, item_id, qty) values (p_user, p_slot, v_pick->>'item', (v_pick->>'qty')::int)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
    v_purse := public.hr_purse_move(p_user, v_r.gold, 0);
    insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, gold_in, qty_in, meta, session_id, purse, gold_kind)
      values (p_user, p_slot, 'hunt', 'tally_pay:' || v_r.task_id, v_pick->>'item', (v_pick->>'qty')::int, v_r.gold, v_r.gold,
              (v_pick->>'qty')::int,
              jsonb_build_object('reason', 'tally', 'claim', v_id, 'task', v_r.task_id, 'hunt', v_r.hunt_id, 'kills', v_r.kills,
                                 'pick', v_pick->>'pick', 'day', v_day, 'ordinal', v_n, 'kept', v_r.keep),
              p_session, v_purse, 'tally');
    if v_r.keep then
      update public.hero_tally_tasks set kills = 0, target = v_r.now_target, taken_at = now(), done_at = null, wait = null
       where user_id = p_user and slot = p_slot and place = v_r.place;
    else
      delete from public.hero_tally_tasks where user_id = p_user and slot = p_slot and place = v_r.place;
    end if;
    v_paid := v_paid || jsonb_build_array(jsonb_build_object('claim', v_id, 'task', v_r.task_id, 'gold', v_r.gold,
                'item', v_pick->>'item', 'qty', (v_pick->>'qty')::int, 'pick', v_pick->>'pick'));
  end loop;
  -- The hero's envelope version moves with its bag (the client keeps the newest it has read).
  if jsonb_array_length(v_paid) > 0 then
    update public.player_state set version = version + 1, updated_at = now() where user_id = p_user and slot = p_slot;
  end if;
  return jsonb_build_object('paid', v_paid, 'wait', v_why);
end $$;

-- THE JOURNAL of a take or a give-up: one zero-gold ledger row (a drop records the count it gave up).
create or replace function public.hr_tally_journal(p_user uuid, p_slot integer, p_intent text, p_meta jsonb)
returns void language sql security definer set search_path = public, pg_catalog as $$
  -- TALLY (2026-12-23-tally-tasks.sql)
  insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
  values (p_user, p_slot, 'hunt', left(p_intent, 64), 0, coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('reason', 'tally'))
$$;

revoke all on function public.hr_tally_section(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.hr_tally_pick(uuid, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.hr_tally_count(uuid, integer, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.hr_tally_claim(uuid, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.hr_tally_journal(uuid, integer, text, jsonb) from public, anon, authenticated, service_role;

insert into public.hr_state_sections (key, fn, note) values
  ('tally', 'hr_tally_section', '2026-12-23-tally-tasks.sql: Tamsin''s tally: the held kill tasks (count, target, keep, done, wait), '
   'today''s payments against the per-day cap, the chosen armour weight and slot order, the last day''s payments')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §4 THE CLIENT VERBS (the caller's own hero only) ─────────────────────────
create or replace function public.hr_tally_view(p_slot integer)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid();
begin
  -- TALLY (2026-12-23-tally-tasks.sql): her board, as this hero would be paid from it now.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('hunt_read') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = v_uid and ps.slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  return jsonb_build_object('ok', true,
    'board', coalesce((select jsonb_agg(jsonb_build_object('task', t.task_id, 'hunt', t.hunt_id, 'monster', t.monster_id,
                         'target', t.target, 'gold', t.gold, 'party', t.party, 'band_min', h.band_min,
                         'held', exists (select 1 from public.hero_tally_tasks x where x.user_id = v_uid and x.slot = p_slot and x.task_id = t.task_id),
                         'pick', public.hr_tally_pick(v_uid, p_slot, t.task_id)) order by t.ord)
                         from public.hr_tally_tasks t left join public.hr_hunts h on h.hunt_id = t.hunt_id), '[]'::jsonb),
    'hunting', exists (select 1 from public.hunt_sessions s where s.user_id = v_uid and s.slot = p_slot and s.ended_at is null),
    'tally', public.hr_tally_section(v_uid, p_slot));
end $$;

create or replace function public.hr_tally_accept(p_slot integer, p_task text, p_weight text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid uuid := auth.uid(); v_verb text; v_r jsonb; v_s public.hunt_sessions%rowtype; v_t public.hr_tally_tasks%rowtype;
  v_cfg public.hr_tally_config%rowtype; v_w text; v_place int;
begin
  -- TALLY (2026-12-23-tally-tasks.sql): take a task at her board, in town.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('tally_accept', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('tally_accept', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_task is null or p_task !~ '^[a-z0-9_]{1,40}$' then
    return public.hr_note_rejection('tally_accept', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_task')); end if;
  select * into v_cfg from public.hr_tally_config where only_row;
  if p_weight is not null and not (p_weight = any (v_cfg.weights)) then
    return public.hr_note_rejection('tally_accept', p_slot, jsonb_build_object('ok', false, 'error', 'bad_weight')); end if;
  v_verb := 'tally_accept:' || p_task;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('tally_accept', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state ps where ps.user_id = v_uid and ps.slot = p_slot) then
    return public.hr_note_rejection('tally_accept', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if v_s.id is not null then
    return public.hr_note_rejection('tally_accept', p_slot, jsonb_build_object('ok', false, 'error', 'tally_in_town')); end if;
  select * into v_t from public.hr_tally_tasks where task_id = p_task;
  if not found then return public.hr_note_rejection('tally_accept', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_task')); end if;
  if exists (select 1 from public.hero_tally_tasks x where x.user_id = v_uid and x.slot = p_slot and x.task_id = p_task) then
    return public.hr_note_rejection('tally_accept', p_slot, jsonb_build_object('ok', false, 'error', 'already_held')); end if;
  select min(g) into v_place from generate_series(1, v_cfg.held_max) g
   where not exists (select 1 from public.hero_tally_tasks x where x.user_id = v_uid and x.slot = p_slot and x.place = g);
  if v_place is null then
    return public.hr_note_rejection('tally_accept', p_slot, jsonb_build_object('ok', false, 'error', 'tally_full', 'held_max', v_cfg.held_max)); end if;
  select h.weight into v_w from public.hero_tally h where h.user_id = v_uid and h.slot = p_slot;
  if p_weight is null and v_w is null then
    return public.hr_note_rejection('tally_accept', p_slot, jsonb_build_object('ok', false, 'error', 'weight_needed')); end if;
  if p_weight is not null and p_weight is distinct from v_w then
    insert into public.hero_tally as h (user_id, slot, weight) values (v_uid, p_slot, p_weight)
      on conflict (user_id, slot) do update set weight = excluded.weight, updated_at = now();
  end if;
  insert into public.hero_tally_tasks (user_id, slot, place, task_id, target) values (v_uid, p_slot, v_place, p_task, v_t.target);
  perform public.hr_tally_journal(v_uid, p_slot, v_verb, jsonb_build_object('task', p_task, 'place', v_place, 'target', v_t.target,
    'weight', coalesce(p_weight, v_w)));
  v_r := jsonb_build_object('ok', true, 'task', p_task, 'place', v_place, 'tally', public.hr_tally_section(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, jsonb_build_object('ok', true, 'task', p_task, 'place', v_place), now())
    on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_tally_drop(p_slot integer, p_task text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_verb text; v_r jsonb; v_s public.hunt_sessions%rowtype; v_t public.hero_tally_tasks%rowtype;
begin
  -- TALLY (2026-12-23-tally-tasks.sql): give a task up, anywhere; its count is lost.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('tally_drop', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('tally_drop', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_task is null or p_task !~ '^[a-z0-9_]{1,40}$' then
    return public.hr_note_rejection('tally_drop', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_task')); end if;
  v_verb := 'tally_drop:' || p_task;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('tally_drop', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  select * into v_t from public.hero_tally_tasks x where x.user_id = v_uid and x.slot = p_slot and x.task_id = p_task;
  if not found then return public.hr_note_rejection('tally_drop', p_slot, jsonb_build_object('ok', false, 'error', 'not_held')); end if;
  delete from public.hero_tally_tasks where user_id = v_uid and slot = p_slot and place = v_t.place;
  perform public.hr_tally_journal(v_uid, p_slot, v_verb, jsonb_build_object('task', p_task, 'place', v_t.place, 'kills', v_t.kills,
    'target', v_t.target, 'done', v_t.done_at is not null, 'hunting', v_s.id is not null));
  v_r := jsonb_build_object('ok', true, 'task', p_task, 'tally', public.hr_tally_section(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, jsonb_build_object('ok', true, 'task', p_task), now())
    on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_tally_set(p_slot integer, p_task text, p_keep boolean, p_weight text, p_order text[], p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_r jsonb; v_s public.hunt_sessions%rowtype; v_cfg public.hr_tally_config%rowtype;
begin
  -- TALLY (2026-12-23-tally-tasks.sql): "Keep this task", the armour weight she picks for, her slot order. Anywhere.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('tally_set', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('tally_set', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  select * into v_cfg from public.hr_tally_config where only_row;
  if (p_task is null) <> (p_keep is null) or (p_task is null and p_weight is null and p_order is null) then
    return public.hr_note_rejection('tally_set', p_slot, jsonb_build_object('ok', false, 'error', 'bad_arguments')); end if;
  if p_task is not null and p_task !~ '^[a-z0-9_]{1,40}$' then
    return public.hr_note_rejection('tally_set', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_task')); end if;
  if p_weight is not null and not (p_weight = any (v_cfg.weights)) then
    return public.hr_note_rejection('tally_set', p_slot, jsonb_build_object('ok', false, 'error', 'bad_weight')); end if;
  -- THE ORDER is a permutation of her slots: each once, nothing else.
  if p_order is not null and (cardinality(p_order) <> cardinality(v_cfg.slot_order)
       or (select count(distinct x) from unnest(p_order) x) <> cardinality(v_cfg.slot_order)
       or exists (select 1 from unnest(p_order) x where x is null or not (x = any (v_cfg.slot_order)))) then
    return public.hr_note_rejection('tally_set', p_slot, jsonb_build_object('ok', false, 'error', 'bad_order')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, 'tally_set');
  if v_r is not null then return public.hr_note_rejection('tally_set', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state ps where ps.user_id = v_uid and ps.slot = p_slot) then
    return public.hr_note_rejection('tally_set', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if p_task is not null and not exists (select 1 from public.hero_tally_tasks x where x.user_id = v_uid and x.slot = p_slot and x.task_id = p_task) then
    return public.hr_note_rejection('tally_set', p_slot, jsonb_build_object('ok', false, 'error', 'not_held')); end if;
  if p_task is not null then
    update public.hero_tally_tasks set keep = p_keep where user_id = v_uid and slot = p_slot and task_id = p_task and keep is distinct from p_keep;
  end if;
  if p_weight is not null or p_order is not null then
    insert into public.hero_tally as h (user_id, slot, weight, slot_order)
      values (v_uid, p_slot, p_weight, coalesce(p_order, '{}'::text[]))
      on conflict (user_id, slot) do update
        set weight = coalesce(p_weight, h.weight), slot_order = coalesce(p_order, h.slot_order), updated_at = now();
  end if;
  v_r := jsonb_build_object('ok', true, 'tally', public.hr_tally_section(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'tally_set', jsonb_build_object('ok', true), now())
    on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_tally_collect(p_slot integer, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_r jsonb; v_s public.hunt_sessions%rowtype; v_c jsonb;
begin
  -- TALLY (2026-12-23-tally-tasks.sql): the hero visits her in town and is paid what is done and due
  -- (a task finished over yesterday's cap, one her pick could not fit in the bag, one a forfeited hunt left).
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('tally_collect', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('tally_collect', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, 'tally_collect');
  if v_r is not null then return public.hr_note_rejection('tally_collect', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state ps where ps.user_id = v_uid and ps.slot = p_slot) then
    return public.hr_note_rejection('tally_collect', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if v_s.id is not null then
    return public.hr_note_rejection('tally_collect', p_slot, jsonb_build_object('ok', false, 'error', 'tally_pays_in_town')); end if;
  v_c := public.hr_tally_claim(v_uid, p_slot, null);
  v_r := jsonb_build_object('ok', true, 'paid', v_c->'paid', 'wait', v_c->'wait', 'tally', public.hr_tally_section(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'tally_collect', jsonb_build_object('ok', true, 'paid', v_c->'paid', 'wait', v_c->'wait'), now())
    on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- ── §5 THE ONE INSTANCE SETTLE COUNTS AND PAYS (hr_hunt_apply_instance RESTATED WHOLE from
--       2026-12-15-account-gold.sql, §0-pinned; only step (4c) and its two comment lines are new) ──
CREATE OR REPLACE FUNCTION public.hr_hunt_apply_instance(p_instance uuid, p_world_from bigint, p_settle jsonb, p_members jsonb, p_project_user uuid DEFAULT NULL::uuid, p_project_slot integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  c_skew constant interval := interval '60 seconds';
  -- A fuse on the deploy gap, not a balance figure: the catalogue and the edge land seconds to minutes apart.
  c_shape_grace constant interval := interval '30 minutes';
  v_role  text;
  v_i     public.hunt_instances%rowtype;
  v_to    timestamptz;
  v_win   bigint; v_tick bigint;
  v_wsw   bigint;
  v_world text; v_wj jsonb;
  v_shape public.hr_hunt_world_shape%rowtype;
  v_move  public.hunt_world_shape_move%rowtype;
  v_ground text;
  v_m     jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_h     jsonb;
  v_n     int;
  v_code  text; v_detail text;
  v_first jsonb;
  v_pend  jsonb := '[]'::jsonb;   -- ACCOUNT GOLD: every member's store bill, paid after every member
  v_p     jsonb; v_u uuid; v_f bigint; v_g bigint;
begin
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): a refusal after the lock is counted; the sixth in a row forfeits.
  -- DEPLOY-NO-FORFEIT (2026-12-11-hunt-deploy-no-forfeit.sql): a world of the shape the catalogue just replaced is held, not counted.
  -- TALLY (2026-12-23-tally-tasks.sql): step (4c) counts every member's kills onto its held kill tasks and pays a member
  -- whose hunt this settle ended (back in town).
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role') then
    raise exception 'hr_hunt_apply_instance: not callable by %', v_role using errcode = '42501';
  end if;
  if p_instance is null or p_world_from is null or p_settle is null or jsonb_typeof(p_settle) <> 'object'
     or p_members is null or jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) = 0
     or jsonb_array_length(p_members) > coalesce(public.hr_hunt_limit('party_max'), 1) then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments');
  end if;
  if exists (select 1 from jsonb_object_keys(p_settle) k where k not in ('to', 'world_swing', 'world'))
     or exists (select 1 from jsonb_array_elements(p_members) e
                 where jsonb_typeof(e.value) <> 'object'
                    or exists (select 1 from jsonb_object_keys(e.value) k
                                where k not in ('user', 'slot', 'session', 'version', 'intent', 'delta', 'hunt', 'analyzer'))) then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments', 'why', 'keys');
  end if;
  v_first := p_members->0;

  -- (1) THE INSTANCE LOCK and its world CAS.
  select * into v_i from public.hunt_instances where id = p_instance for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_instance'); end if;
  if v_i.world_swing <> p_world_from then
    -- A settle that already landed under these keys is a replay; anything else lost the race (not counted).
    if not exists (select 1 from jsonb_array_elements(p_members) e
                    where not exists (select 1 from public.player_intents i
                                       where i.user_id = (e.value->>'user')::uuid and i.intent_id = (e.value->>'intent')::uuid)) then
      return jsonb_build_object('ok', true, 'stage', 'replayed', 'replayed', true,
        'state', case when p_project_user is not null then public.hr_state_of(p_project_user, p_project_slot) end);
    end if;
    return jsonb_build_object('ok', false, 'error', 'session_moved', 'world_swing', v_i.world_swing);
  end if;

  -- (2) THE WINDOW and THE WORLD.
  begin v_to := date_trunc('milliseconds', (p_settle->>'to')::timestamptz);
  exception when others then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_window')); end;
  v_tick := public.hr_hunt_limit('swing_interval_ms');
  v_win := floor(extract(epoch from (v_to - v_i.settled_to)) * 1000)::bigint;
  if v_to is null or v_i.settled_to is null or v_win <= 0 or v_win % v_tick <> 0 then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
      jsonb_build_object('ok', false, 'error', 'bad_window', 'settled_to', v_i.settled_to, 'window_ms', v_win)); end if;
  if v_to > now() + c_skew then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'window_in_future')); end if;
  if jsonb_typeof(p_settle->'world_swing') is distinct from 'number' or (p_settle->>'world_swing') !~ '^[0-9]{1,15}$' then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world_swing')); end if;
  v_wsw := (p_settle->>'world_swing')::bigint;
  if v_wsw < v_i.world_swing or v_wsw > v_i.world_swing + v_win / v_tick then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
      jsonb_build_object('ok', false, 'error', 'bad_world_swing', 'from', v_i.world_swing, 'to', v_wsw)); end if;
  if jsonb_typeof(p_settle->'world') = 'string' then
    v_world := p_settle->>'world';
    if octet_length(v_world) > public.hr_hunt_limit('world_max_bytes') then
      return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
        jsonb_build_object('ok', false, 'error', 'world_too_big', 'bytes', octet_length(v_world))); end if;
    begin v_wj := v_world::jsonb;
    exception when others then
      return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world', 'why', 'json')); end;
    select * into v_shape from public.hr_hunt_world_shape where id;
    select g.ground_id into v_ground from public.hr_hunt_grounds g where g.hunt_id = v_i.hunt_id;
    -- The encoded world (world-state.js): { v, s, w: [ground, swing, …], u: [...], p: [...] }.
    if jsonb_typeof(v_wj) <> 'object' or (v_wj->>'v')::int is distinct from v_shape.version
       or (v_wj->>'s')::bigint is distinct from v_shape.shape
       or jsonb_typeof(v_wj->'w') <> 'array' or jsonb_typeof(v_wj->'u') <> 'array' or jsonb_typeof(v_wj->'p') <> 'array'
       or v_wj->'w'->>0 is distinct from v_ground or (v_wj->'w'->>1)::bigint is distinct from v_wsw then
      -- THE SERVER'S OWN DEPLOY GAP: a well-formed world of THIS instance written under exactly the field list the
      -- catalogue replaced less than c_shape_grace ago (hunt_world_shape_move, written only by the catalogue's own
      -- trigger) is held: nothing moves, nothing is counted. Every other shape still counts toward the forfeit.
      select * into v_move from public.hunt_world_shape_move where id;
      if v_move.prev_shape is not null and v_move.moved_at > now() - c_shape_grace
         and v_move.version = v_shape.version and v_move.shape = v_shape.shape
         and jsonb_typeof(v_wj) = 'object'
         and v_wj->'v' = to_jsonb(v_move.prev_version) and v_wj->'s' = to_jsonb(v_move.prev_shape)
         and jsonb_typeof(v_wj->'w') = 'array' and jsonb_typeof(v_wj->'u') = 'array' and jsonb_typeof(v_wj->'p') = 'array'
         and v_wj->'w'->>0 is not distinct from v_ground and v_wj->'w'->1 = to_jsonb(v_wsw) then
        return public.hr_hunt_settle_held(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'world_shape_moved',
          'detail', jsonb_build_object('from', jsonb_build_object('v', v_move.prev_version, 's', v_move.prev_shape),
                                       'to', jsonb_build_object('v', v_shape.version, 's', v_shape.shape), 'moved_at', v_move.moved_at)));
      end if;
      return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world', 'why', 'shape')); end if;
  elsif jsonb_typeof(p_settle->'world') is distinct from 'null' and p_settle ? 'world' then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world', 'why', 'type'));
  end if;

  -- (3) THE MEMBER SET: exactly the instance's open sessions that arrived before `to`.
  if (select count(*) from jsonb_array_elements(p_members)) <> (select count(distinct (e.value->>'session')) from jsonb_array_elements(p_members) e)
     or exists (select 1 from public.hunt_sessions h
                 where h.instance_id = p_instance and h.ended_at is null and h.hunt_from < v_to
                   and not exists (select 1 from jsonb_array_elements(p_members) e
                                    where (e.value->>'session')::uuid = h.id and (e.value->>'user')::uuid = h.user_id
                                      and (e.value->>'slot')::int = h.slot))
     or exists (select 1 from jsonb_array_elements(p_members) e
                 where not exists (select 1 from public.hunt_sessions h
                                    where h.id = (e.value->>'session')::uuid and h.instance_id = p_instance
                                      and h.user_id = (e.value->>'user')::uuid and h.slot = (e.value->>'slot')::int
                                      and h.ended_at is null and h.hunt_from < v_to)) then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'member_set'));
  end if;

  -- (4) EVERY MEMBER, IN (user_id, slot) ORDER, IN ONE SUBTRANSACTION.
  for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
    perform public.hr_hunt_lock((v_m->>'user')::uuid, (v_m->>'slot')::int);
  end loop;
  -- ACCOUNT GOLD (2026-12-15-account-gold.sql): every member's ACCOUNT PURSE, locked in user order right
  -- after the character locks and before any other shared row (a hearthfind ordinal, a tally), so two
  -- settles that share an account queue on its purse and can never hold each other's next lock.
  for v_u in select distinct (e.value->>'user')::uuid from jsonb_array_elements(p_members) e order by 1 loop
    perform public.hr_purse_lock(v_u);
  end loop;
  begin
    for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
      v_h := public.hr_hunt_apply_member(p_instance, (v_m->>'user')::uuid, (v_m->>'slot')::int, (v_m->>'session')::uuid,
        (v_m->>'intent')::uuid, v_m->'delta', v_m->'hunt', v_m->'analyzer');
      if v_h ? '_purse' then
        v_pend := v_pend || jsonb_build_array((v_h->'_purse')
                  || jsonb_build_object('user', v_m->'user', 'slot', v_m->'slot', 'session', v_m->'session'));
        v_h := v_h - '_purse';
      end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object('user', v_m->'user', 'slot', v_m->'slot',
        'hunt_settle', v_h, 'session', public.hr_hunt_view((v_m->>'session')::uuid)));
    end loop;
    -- (4b) THE STORE BILLS, PAID FROM THE ACCOUNT PURSES (2026-12-15-account-gold.sql), after EVERY member's
    --      coins, cover and sales have landed: the engine spends one purse per account in time order, so
    --      with every credit in first no bill can take a purse below 0 (the window's whole bill is what
    --      that order kept payable). A bill the purse cannot pay means another hero of the account spent
    --      it since this window was read: gold_short, nothing lands, and the edge re-reads at once.
    for v_p in select e.value from jsonb_array_elements(v_pend) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
      v_g := public.hr_purse_move((v_p->>'user')::uuid, -(v_p->>'cost')::bigint, 0);
      if v_g is null then
        perform public.hr_reject('gold_short', jsonb_build_object('why', 'purse', 'gold', public.hr_purse_of((v_p->>'user')::uuid),
          'cost', (v_p->>'cost')::bigint, 'floor', (v_p->>'floor')::bigint));
      end if;
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id, purse)
        values ((v_p->>'user')::uuid, (v_p->>'slot')::int, 'hunt', 'supply_buy', -(v_p->>'cost')::bigint, -(v_p->>'units')::bigint,
                jsonb_build_object('reason', 'supply_buy', 'source', 'store', 'items', v_p->'items', 'gold', (v_p->>'cost')::bigint),
                (v_p->>'session')::uuid, v_g);
    end loop;
    -- THE FLOOR, per account: after the window, the purse may not sit below the lowest "Keep at least" of
    -- its heroes that bought (one hero: its own floor, the pre-account-gold rule exactly).
    for v_u, v_f in select (e.value->>'user')::uuid, min((e.value->>'floor')::bigint)
                      from jsonb_array_elements(v_pend) e group by 1 order by 1 loop
      if public.hr_purse_of(v_u) < v_f then
        perform public.hr_reject('gold_short', jsonb_build_object('why', 'floor', 'gold', public.hr_purse_of(v_u), 'floor', v_f));
      end if;
    end loop;
    if exists (select 1 from jsonb_array_elements(v_out) o where coalesce((o.value->'hunt_settle'->>'replayed')::boolean, false)) then
      -- A member whose key already landed under a moved instance is a defect (the CAS above passed).
      perform public.hr_reject('session_moved', jsonb_build_object('why', 'partial_replay'));
    end if;
    -- (4c) TAMSIN'S TALLY (2026-12-23-tally-tasks.sql), EVERY member, in (user_id, slot) order, under the character
    --      locks and purses taken above: its own kills by monster (the combat journal hr_apply just wrote, held by the
    --      kill bound) onto its held tasks on this ground; then, for a member whose hunt this settle ended, the
    --      payment of what is done (hr_tally_claim: the per-day cap, the bag, the purse, one session-stamped row).
    for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
      perform public.hr_tally_count((v_m->>'user')::uuid, (v_m->>'slot')::int, (v_m->>'session')::uuid, v_m->'delta'->'journal'->'meta');
      if exists (select 1 from public.hunt_sessions h where h.id = (v_m->>'session')::uuid and h.ended_at is not null) then
        perform public.hr_tally_claim((v_m->>'user')::uuid, (v_m->>'slot')::int, (v_m->>'session')::uuid);
      end if;
    end loop;
    -- THE INSTANCE: its world (none once no session of it is open), swing counter and clock; the count starts over.
    select count(*) into v_n from public.hunt_sessions h where h.instance_id = p_instance and h.ended_at is null;
    update public.hunt_instances
       set world = case when v_n > 0 then v_world end, world_swing = v_wsw,
           settled_to = v_to, next_swing_at = v_to, refusals = 0, version = version + 1
     where id = p_instance;
  exception when sqlstate 'HR000' then
    get stacked diagnostics v_code = message_text, v_detail = pg_exception_detail;
    perform set_config('hr.hunt_session', '', true);
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
      jsonb_build_object('ok', false, 'error', v_code, 'stage', 'instance',
        'detail', case when v_detail ~ '^\{.*\}$' then v_detail::jsonb end));
  end;
  return jsonb_build_object('ok', true, 'members', v_out,
    'instance', jsonb_build_object('id', p_instance, 'world_swing', v_wsw, 'settled_to', v_to),
    'state', case when p_project_user is not null then public.hr_state_of(p_project_user, p_project_slot) end);
end $function$;

-- ── §6 GRANTS: revoke-then-grant; the client baseline ────────────────────────
revoke all on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, integer) from public, anon, authenticated, service_role, hr_tick;
grant execute on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, integer) to hr_engine;
revoke all on function public.hr_tally_view(integer) from public, anon, service_role, hr_engine, hr_tick;
revoke all on function public.hr_tally_accept(integer, text, text, uuid) from public, anon, service_role, hr_engine, hr_tick;
revoke all on function public.hr_tally_drop(integer, text, uuid) from public, anon, service_role, hr_engine, hr_tick;
revoke all on function public.hr_tally_set(integer, text, boolean, text, text[], uuid) from public, anon, service_role, hr_engine, hr_tick;
revoke all on function public.hr_tally_collect(integer, uuid) from public, anon, service_role, hr_engine, hr_tick;
grant execute on function public.hr_tally_view(integer) to authenticated;
grant execute on function public.hr_tally_accept(integer, text, text, uuid) to authenticated;
grant execute on function public.hr_tally_drop(integer, text, uuid) to authenticated;
grant execute on function public.hr_tally_set(integer, text, boolean, text, text[], uuid) to authenticated;
grant execute on function public.hr_tally_collect(integer, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated'
   and proname in ('hr_tally_view', 'hr_tally_accept', 'hr_tally_drop', 'hr_tally_set', 'hr_tally_collect');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_tally_view', 'p_slot integer', 'authenticated',
   'added 2026-12-23 (lane c-tally-tasks): Tamsin''s board for the caller''s own hero (tasks, gold, her pick now); a read'),
  ('hr_tally_accept', 'p_slot integer, p_task text, p_weight text, p_idem uuid', 'authenticated',
   'added 2026-12-23: take a kill task at Tamsin''s board in town (own hero; held cap 3; the armour weight chosen once); moves no value'),
  ('hr_tally_drop', 'p_slot integer, p_task text, p_idem uuid', 'authenticated',
   'added 2026-12-23: give up a held kill task (own hero; the count is lost and journalled); moves no value'),
  ('hr_tally_set', 'p_slot integer, p_task text, p_keep boolean, p_weight text, p_order text[], p_idem uuid', 'authenticated',
   'added 2026-12-23: keep a task, the armour weight and the slot order Tamsin picks by (own hero); moves no value'),
  ('hr_tally_collect', 'p_slot integer, p_idem uuid', 'authenticated',
   'added 2026-12-23: MONEY + ITEM MINT - be paid in town for done kill tasks (own hero, server-counted kills, 3 a UTC day, bag check, account purse); no client number');

-- ── §7 (reserved: no edge or catalogue change) ───────────────────────────────

-- ── §8 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $mig$
declare
  v_a  constant uuid := '000000c0-0000-4000-a000-0000071a0001';
  v_b  constant uuid := '000000c0-0000-4000-a000-0000071a0002';
  k    constant text := '000000c0-0000-4000-b000-071a';
  v jsonb; v_g0 bigint; v_g bigint; v_sa uuid; v_sb uuid; v_inst uuid; v_n int; v_role text; v_sig text;
  v_cell text := 'mill_cellar'; v_pick jsonb; v_first text; v_cap int;
begin
  begin
    update public.hr_hunt_config set enabled = true where id;
    -- Two accounts, one hero each; A holds the cellar task, light.
    foreach v_sig in array array[v_a::text, v_b::text] loop
      perform set_config('request.jwt.claim.sub', v_sig, true);
      insert into auth.users (id) values (v_sig::uuid) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_sig::uuid, 'tally-tasks §8 probe') on conflict (user_id) do nothing;
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(0): hr_create_character refused: %', v; end if;
      update public.player_state set active_kind = 'idle', active_id = null where user_id = v_sig::uuid and slot = 0;
    end loop;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    -- (a) THE TAKE: a weight is needed once; the task holds at place 1 with the catalogue's target.
    v := public.hr_tally_accept(0, 'cellar_giant_rats', null, (k || '00000001')::uuid);
    if v->>'error' is distinct from 'weight_needed' then raise exception 'VERIFY(a): a first take with no weight answered %', v; end if;
    delete from public.hr_rate_counters where user_id in (v_a, v_b);
    v := public.hr_tally_accept(0, 'cellar_giant_rats', 'light', (k || '00000002')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'place')::int <> 1
       or (select target from public.hero_tally_tasks where user_id = v_a and slot = 0 and task_id = 'cellar_giant_rats')
          <> (select target from public.hr_tally_tasks where task_id = 'cellar_giant_rats') then
      raise exception 'VERIFY(a): the take answered %', v; end if;
    v := public.hr_tally_accept(0, 'cellar_giant_rats', null, (k || '00000003')::uuid);
    if v->>'error' is distinct from 'already_held' then raise exception 'VERIFY(a): a second take of the same task answered %', v; end if;
    v := public.hr_tally_accept(0, 'no_such_task', null, (k || '00000004')::uuid);
    if v->>'error' is distinct from 'unknown_task' then raise exception 'VERIFY(a): an unknown task answered %', v; end if;
    -- (b) A KILL COUNTS FOR EVERY HERO IN THE INSTANCE: A and B share one cellar instance; the settle step (4c)
    --     counts each member's OWN kills by monster, held to its bounded kills; a forged sum is refused.
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_tally_accept(0, 'cellar_giant_rats', 'heavy', (k || '00000005')::uuid);
    v_inst := gen_random_uuid();
    insert into public.hunt_instances (id, hunt_id, settled_to, next_swing_at) values (v_inst, v_cell, now(), now());
    insert into public.hunt_sessions (id, user_id, slot, hunt_id, entered_at, hunt_from, settled_to, next_swing_at, instance_id)
      values (gen_random_uuid(), v_a, 0, v_cell, now(), now(), now(), now(), v_inst) returning id into v_sa;
    insert into public.hunt_sessions (id, user_id, slot, hunt_id, entered_at, hunt_from, settled_to, next_swing_at, instance_id)
      values (gen_random_uuid(), v_b, 0, v_cell, now(), now(), now(), now(), v_inst) returning id into v_sb;
    if position('perform public.hr_tally_count((v_m->>''user'')::uuid, (v_m->>''slot'')::int' in
                (select prosrc from pg_proc where oid = 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)'::regprocedure)) = 0 then
      raise exception 'VERIFY(b): the instance settle does not count every member''s kills'; end if;
    perform public.hr_tally_count(v_a, 0, v_sa, '{"kills": 7, "km": {"rat": 5, "slime": 2}}'::jsonb);
    perform public.hr_tally_count(v_b, 0, v_sb, '{"kills": 7, "km": {"rat": 5, "slime": 2}}'::jsonb);
    if (select kills from public.hero_tally_tasks where user_id = v_a and task_id = 'cellar_giant_rats') <> 5
       or (select kills from public.hero_tally_tasks where user_id = v_b and task_id = 'cellar_giant_rats') <> 5 then
      raise exception 'VERIFY(b): a party''s rat kills did not count for both heroes'; end if;
    begin
      perform public.hr_tally_count(v_a, 0, v_sa, '{"kills": 3, "km": {"rat": 5}}'::jsonb);
      raise exception 'VERIFY(b): a kills-by-monster summing past the bounded kills was counted';
    exception when sqlstate 'HR000' then null; end;
    perform public.hr_tally_count(v_a, 0, v_sa, '{"kills": 0}'::jsonb);   -- no km: nothing
    -- (c) A TASK PAYS ONCE, gold into the ACCOUNT purse, her pick (the cellar's light helm) into the bag, one ledger row.
    perform public.hr_tally_count(v_a, 0, v_sa, '{"kills": 500, "km": {"rat": 500}}'::jsonb);
    if (select kills from public.hero_tally_tasks where user_id = v_a and task_id = 'cellar_giant_rats')
       <> (select target from public.hr_tally_tasks where task_id = 'cellar_giant_rats')
       or (select done_at from public.hero_tally_tasks where user_id = v_a and task_id = 'cellar_giant_rats') is null then
      raise exception 'VERIFY(c): the count did not stop at the target and finish the task'; end if;
    update public.hunt_sessions set ended_at = now(), end_reason = 'left' where id in (v_sa, v_sb);
    v_g0 := public.hr_purse_of(v_a);
    v_pick := public.hr_tally_pick(v_a, 0, 'cellar_giant_rats');
    v := public.hr_tally_claim(v_a, 0, v_sa);
    if jsonb_array_length(v->'paid') <> 1 or public.hr_purse_of(v_a) <> v_g0 + (select gold from public.hr_tally_tasks where task_id = 'cellar_giant_rats')
       or v_pick->>'item' is distinct from 'apprentice_helmet'
       or (select qty from public.player_inventory where user_id = v_a and slot = 0 and item_id = 'apprentice_helmet') <> 1
       or (select count(*) from public.player_ledger where user_id = v_a and intent = 'tally_pay:cellar_giant_rats'
             and gold_kind = 'tally' and session_id = v_sa and purse = public.hr_purse_of(v_a)) <> 1
       or exists (select 1 from public.hero_tally_tasks where user_id = v_a) then
      raise exception 'VERIFY(c): the payment answered % (pick %)', v, v_pick; end if;
    v := public.hr_tally_claim(v_a, 0, v_sa);
    if jsonb_array_length(v->'paid') <> 0 or public.hr_purse_of(v_a) <> v_g0 + (select gold from public.hr_tally_tasks where task_id = 'cellar_giant_rats') then
      raise exception 'VERIFY(c): a second claim paid again: %', v; end if;
    -- (d) THE PICK NEVER REPEATS A PIECE: the cellar's one light piece is given; with keep on, the next payments are its
    --     materials in turn, and the given record holds the helm once.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    delete from public.hr_rate_counters where user_id in (v_a, v_b);
    v := public.hr_tally_accept(0, 'cellar_giant_rats', null, (k || '00000006')::uuid);
    v := public.hr_tally_set(0, 'cellar_giant_rats', true, null, null, (k || '00000007')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or not (select keep from public.hero_tally_tasks where user_id = v_a and task_id = 'cellar_giant_rats') then
      raise exception 'VERIFY(d): keep answered %', v; end if;
    delete from public.player_inventory where user_id = v_a and slot = 0 and item_id = 'apprentice_helmet';
    update public.hero_tally_tasks set kills = target, done_at = now() where user_id = v_a and task_id = 'cellar_giant_rats';
    v := public.hr_tally_claim(v_a, 0, null);
    v_first := v->'paid'->0->>'item';
    update public.hero_tally_tasks set kills = target, done_at = now() where user_id = v_a and task_id = 'cellar_giant_rats';
    v := public.hr_tally_claim(v_a, 0, null);
    if v_first is distinct from (select item_id from public.hr_tally_materials where task_id = 'cellar_giant_rats' and ord = 1)
       or v->'paid'->0->>'item' is distinct from (select item_id from public.hr_tally_materials where task_id = 'cellar_giant_rats' and ord = 2)
       or (select count(*) from public.hero_tally_given where user_id = v_a) <> 1
       or (select kills from public.hero_tally_tasks where user_id = v_a and task_id = 'cellar_giant_rats') <> 0 then
      raise exception 'VERIFY(d): after the helm the picks were % then % (given %)', v_first, v->'paid'->0->>'item',
        (select count(*) from public.hero_tally_given where user_id = v_a); end if;
    -- (e) THE CAP HOLDS: three claims today (c, d, d) -> a fourth done task waits `cap` and pays nothing; claims dated
    --     yesterday do not count against today.
    if (select count(*) from public.hero_tally_claims where user_id = v_a and day = (now() at time zone 'UTC')::date) <> 3 then
      raise exception 'VERIFY(e): A has % claims today, want 3', (select count(*) from public.hero_tally_claims where user_id = v_a); end if;
    update public.hero_tally_tasks set kills = target, done_at = now() where user_id = v_a and task_id = 'cellar_giant_rats';
    v_g := public.hr_purse_of(v_a);
    v := public.hr_tally_claim(v_a, 0, null);
    if jsonb_array_length(v->'paid') <> 0 or v->>'wait' is distinct from 'cap' or public.hr_purse_of(v_a) <> v_g then
      raise exception 'VERIFY(e): a claim past the day''s cap answered %', v; end if;
    begin
      insert into public.hero_tally_claims (user_id, slot, day, ordinal, task_id, hunt_id, kills, gold, pick, item_id, qty)
        values (v_a, 0, (now() at time zone 'UTC')::date, 4, 'cellar_giant_rats', v_cell, 1, 1, 'material', 'bones', 1);
      raise exception 'VERIFY(e): a fourth claim row for today was accepted';
    exception when check_violation then null; end;
    begin
      update public.hero_tally_claims set gold = gold + 1 where user_id = v_a;
      raise exception 'VERIFY(e): a claim row was updated';
    exception when check_violation then null; end;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    insert into public.hero_tally_claims (user_id, slot, day, ordinal, task_id, hunt_id, kills, gold, pick, item_id, qty)
      select v_b, 0, (now() at time zone 'UTC')::date - 1, g, 'cellar_giant_rats', v_cell, 1, 1, 'material', 'bones', 1 from generate_series(1, 3) g;
    update public.hero_tally_tasks set kills = target, done_at = now() where user_id = v_b and task_id = 'cellar_giant_rats';
    v := public.hr_tally_claim(v_b, 0, null);
    if jsonb_array_length(v->'paid') <> 1 or v->'paid'->0->>'item' is distinct from 'bronze_helm' then
      raise exception 'VERIFY(e): yesterday''s three claims held today''s payment back: %', v; end if;
    -- (f) A CLAIM NEVER PAYS TWICE UNDER RETRY: the town visit, keyed; the same key answers the same, a new key pays nothing.
    delete from public.hr_rate_counters where user_id in (v_a, v_b);
    v := public.hr_tally_accept(0, 'thicket_gray_wolves', null, (k || '00000008')::uuid);
    update public.hero_tally_tasks set kills = target, done_at = now() where user_id = v_b and task_id = 'thicket_gray_wolves';
    v_g := public.hr_purse_of(v_b);
    v := public.hr_tally_collect(0, (k || '00000009')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or jsonb_array_length(v->'paid') <> 1
       or public.hr_purse_of(v_b) <> v_g + (select gold from public.hr_tally_tasks where task_id = 'thicket_gray_wolves') then
      raise exception 'VERIFY(f): the visit answered %', v; end if;
    v := public.hr_tally_collect(0, (k || '00000009')::uuid);
    v_g := public.hr_purse_of(v_b);
    v := public.hr_tally_collect(0, (k || '0000000a')::uuid);
    if jsonb_array_length(coalesce(v->'paid', '[]'::jsonb)) <> 0 or public.hr_purse_of(v_b) <> v_g
       or (select count(*) from public.player_ledger where user_id = v_b and intent = 'tally_pay:thicket_gray_wolves') <> 1 then
      raise exception 'VERIFY(f): a retried visit paid again: %', v; end if;
    -- (g) A STRANGER CANNOT TOUCH ANOTHER'S TASKS: B's verbs name only B's hero (there is no target argument); B dropping
    --     the task A holds drops nothing of A's; no client may write a tally table.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_n := (select kills from public.hero_tally_tasks where user_id = v_a and task_id = 'cellar_giant_rats');
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_tally_drop(0, 'cellar_giant_rats', (k || '0000000b')::uuid);
    if not exists (select 1 from public.hero_tally_tasks where user_id = v_a and task_id = 'cellar_giant_rats' and kills = v_n) then
      raise exception 'VERIFY(g): B''s drop reached A''s task'; end if;
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(v_role, 'public.hero_tally_tasks', 'insert,update,delete')
         or has_table_privilege(v_role, 'public.hero_tally', 'insert,update,delete')
         or has_table_privilege(v_role, 'public.hero_tally_given', 'insert,update,delete')
         or has_table_privilege(v_role, 'public.hero_tally_claims', 'insert,update,delete') then
        raise exception 'VERIFY(g): % may write a tally table', v_role; end if;
    end loop;
    -- (h) THE BAG CHECK: a full bag holds the payment back (wait bag_full), nothing moves.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    select bank_cap into v_cap from public.player_state where user_id = v_a and slot = 0;
    delete from public.hero_tally_claims where user_id = v_a;   -- the probe's own day starts over (scoped to the probe)
    update public.hero_tally_tasks set kills = target, done_at = now() where user_id = v_a and task_id = 'cellar_giant_rats';
    delete from public.player_inventory where user_id = v_a and slot = 0
       and item_id = (public.hr_tally_pick(v_a, 0, 'cellar_giant_rats')->>'item');
    update public.player_state set bank_cap = (select count(*) from public.player_inventory where user_id = v_a and slot = 0) where user_id = v_a and slot = 0;
    v_g := public.hr_purse_of(v_a);
    v := public.hr_tally_claim(v_a, 0, null);
    if jsonb_array_length(v->'paid') <> 0 or v->>'wait' is distinct from 'bag_full' or public.hr_purse_of(v_a) <> v_g
       or (select wait from public.hero_tally_tasks where user_id = v_a and task_id = 'cellar_giant_rats') is distinct from 'bag_full' then
      raise exception 'VERIFY(h): a full bag answered %', v; end if;
    update public.player_state set bank_cap = v_cap where user_id = v_a and slot = 0;
    -- (i) THE SECTION is projected by hr_state_of.
    v := public.hr_state_of(v_a, 0)->'tally';
    if v is null or jsonb_typeof(v->'held') <> 'array' or (v->>'per_day')::int <> (select paid_per_day from public.hr_tally_config)
       or v->>'weight' is distinct from 'light' or jsonb_array_length(v->'order') < 1 then
      raise exception 'VERIFY(i): the tally section reads %', v; end if;
    raise exception using errcode = 'HR871', message = 'tally-tasks §8 complete - rolling back';
  exception when sqlstate 'HR871' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_a, v_b)) or exists (select 1 from public.hero_tally_claims where user_id in (v_a, v_b))
     or exists (select 1 from public.player_ledger where user_id in (v_a, v_b)) then
    raise exception 'VERIFY(j): §8 LEAKED a probe row'; end if;
  -- (j) THE GRANTS: the helpers reach no role; the verbs reach authenticated only; every verb is in the baseline.
  foreach v_sig in array array['public.hr_tally_section(uuid,integer)', 'public.hr_tally_pick(uuid,integer,text)',
                               'public.hr_tally_count(uuid,integer,uuid,jsonb)', 'public.hr_tally_claim(uuid,integer,uuid)',
                               'public.hr_tally_journal(uuid,integer,text,jsonb)', 'public.hr_tally_claims_immutable()',
                               'public.hr_gold_kind(text,text,uuid)'] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) and has_function_privilege(v_role, v_sig, 'execute') then
        raise exception 'VERIFY(j): % can execute %', v_role, v_sig; end if;
    end loop;
  end loop;
  foreach v_sig in array array['public.hr_tally_view(integer)', 'public.hr_tally_accept(integer,text,text,uuid)',
                               'public.hr_tally_drop(integer,text,uuid)', 'public.hr_tally_set(integer,text,boolean,text,text[],uuid)',
                               'public.hr_tally_collect(integer,uuid)'] loop
    if has_function_privilege('anon', v_sig, 'execute') or not has_function_privilege('authenticated', v_sig, 'execute')
       or has_function_privilege('hr_engine', v_sig, 'execute') then
      raise exception 'VERIFY(j): % has the wrong grants', v_sig; end if;
    if not exists (select 1 from public.hr_client_rpc_baseline b where b.grantee = 'authenticated'
                    and b.proname = split_part(replace(v_sig, 'public.', ''), '(', 1)) then
      raise exception 'VERIFY(j): % is not in hr_client_rpc_baseline', v_sig; end if;
  end loop;
  if has_function_privilege('authenticated', 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)', 'execute')
     or not has_function_privilege('hr_engine', 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)', 'execute') then
    raise exception 'VERIFY(j): the instance settle''s ACL moved'; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.hero_tally_claims'::regclass and tgname = 'hr_tally_claims_immutable' and tgenabled = 'O') then
    raise exception 'VERIFY(j): the claims trigger is not armed'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'tally-tasks: counted for every hero, paid once, 3 a UTC day, never twice on retry, own hero only, no repeated piece; all green';
end $mig$;
