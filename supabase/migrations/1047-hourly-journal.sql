-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1047-hourly-journal.sql — THE HOURLY JOURNAL: ONE ROW A HERO AN HOUR AN ACTIVITY
--   (lane/c-settle-cost FB-4, reliability-engineer, 2026-11-21; build plan 13 section 2.6 FB-4, 30-plan L13, study 48 sections
--   3 and 9, 28-platform.md change 3). Starts from the parked lane/c-ledger-fold (37484cfe1): its meta model (hr_ledger_fold_model,
--   hr_ledger_meta_plan, hr_ledger_meta_merge) is taken whole, with three keys added; its separate window table, its three days
--   of detail and its irreversible arm file are retired (why, below).
--
-- STATUS: supabase/migration-notes/1047-hourly-journal.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- REAL (28-platform.md, 48 section 8): 216 journal rows a hunted hero-hour (426 for the heavy four), 69% of the database, 84 GB a
-- month at 1,000 accounts. A hero already holds 1,458 rows of today at an average closed save (2,317 watched) and every save's
-- day budget sums them. Each row is a 10 to 100 second slice of one run: nothing on the server reads one past the save that
-- wrote it except as part of a sum over the day.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- player_ledger.folded int NULL  NEW. Null = one row as written. N = an HOUR ROW: the sum of N rows of one hero, one hour, one
--   activity (kind, intent, gold kind, hunt session and the model's labels: the ground, node, recipe...), and one sign of gold,
--   qty and xp each. Its columns are the rows' sums (gold, gold_in, xp_in, qty_in, gems_in, qty, xp), its purse the last row's,
--   its `at` the hour's start, its meta the rows' meta folded key by key INTO THE SAME SHAPE (numbers and maps summed, from the
--   earliest, to the latest, labels as they were) plus `session` (the hunt session, whose column stays null so no session
--   reader counts an hour row a second time). Written once, after its hour has closed, and never updated.
-- WHAT FOLDS: the five journal shapes a settle writes every save and nothing else: accrue of combat, gather and craft (one row
--   a save or a tick window), hunt supply_own, supply_buy and vendor_cover (one row a save each). Deaths, finds, presses, shop,
--   market, wallet, blessings, forfeits, keys and every other row keep their detail for retain_days, as before. A row whose meta
--   carries a key or type the model does not list stays detail and is counted in the answer (a writer journals something new).
-- WHEN: rows older than hr_ledger_config.detail_minutes (180) whose hour has closed, written after this file (the state row's
--   from_at: THE JOURNAL'S OLD ROWS STAY AS THEY ARE; new rows are hourly from the release). Three hours clear every reader of
--   detail: the tick-stall alarm reads two hours; the hunt folds read only the rows of the save in hand (session and its
--   high-water mark). hr-ledger-hours (cron, every 10 minutes) folds the closed hours, at most 50,000 rows a run, a hero at a time.
-- EVERY DAY CAP READS THE SAME ON A REPLAYED DAY: an hour never crosses a UTC day, and every reader of a day sums columns or
--   meta maps the hour row carries in the detail's own shape: hr_day_budget_used (gold_in, xp_in, qty_in, gems_in), the hunt
--   store's day cap (supply_buy meta.items.*.qty), the monthly rollup (gold, qty and xp by sign, rows as `folded`), the stall
--   alarm (tick windows, counted through `folded`). tests/ledger-hours.mjs replays a played day and reads each before and after.
-- THE PROOF: the fold inserts the hour rows and deletes the detail in ONE statement and then refuses (rolls back) unless rows,
--   gold, gold_in, xp_in, qty_in, gems_in, qty and xp of what it deleted equal what it wrote. hr_ledger_immutable lets a row inside
--   retain_days be deleted only by the fold (its transaction-local flag), only a foldable shape, only one written after from_at,
--   older than detail_minutes and not itself an hour row. UPDATE and TRUNCATE stay refused; an hour row is never deleted early.
-- KILL SWITCH: update hr_ledger_config set hourly = false; the next run answers "off" and every new row keeps its detail.
--
-- ── WHY NOT THE PARKED DESIGN ────────────────────────────────────────────────
-- It kept three days of detail and put the windows in a second table: every day reader would have had to sum two tables, the
-- day's rows read at each save would not have fallen (the cost 48 measures), and its arm deleted on a go with no way back.
-- Here the hour rows are journal rows, so the readers sum them unchanged, a save reads at most four hours of detail plus an
-- hour row an activity, and the switch is a column.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- One fold at a time (the state row FOR UPDATE SKIP LOCKED: a second caller answers busy). Rows of a closed hour have no writer
-- (`at` is the writing transaction's start; detail_minutes is hours past any statement timeout). The prune takes rows past
-- retain_days, the fold rows of the last day: never one row. A second apply finds the column, the rows and the bodies at their
-- post pins and restates every body byte-identical; from_at is set on the first apply only.
-- LOCKS: `add column` (no default, nullable) is a catalogue change under ACCESS EXCLUSIVE for milliseconds; lock_timeout 5 s, so
-- an apply behind a long transaction fails instead of queueing every save behind it. Retry it.
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- No client verb, grant or value path moves. What narrows: five settle shapes lose their per-save split three hours after they
-- are written; every sum, item, skill XP, kill by monster and the purse after are kept. The journal stays the complete record
-- (CLAUDE.md §1) as hourly sums. The fold runs as the owner only. ON THE EA SECURITY LIST (§3.7): a money journal surface.
-- ── COST ─────────────────────────────────────────────────────────────────────
-- Rows kept: ~216 a hunted hero-hour become 1 to 3 (MEASURED on the replayed fixtures in tests/ledger-hours.mjs). At 1,000
-- accounts: 84 GB a month becomes ~1.5 GB. WAL: the detail's delete moves from day 90 to hour 3 (the prune did it anyway), plus
-- one small insert an hour row. A run: one index range of a closed hour, a hero at a time.
--
-- EDGE: none. CLIENT: none. TOOLS: vitals, economy-watch, char-state and hunt-health read `folded` (M-05).
-- REVERSIBLE: hourly = false stops it. Undo: re-apply the pinned pre-images of the six bodies; cron drop hr-ledger-hours; the
--   hour rows are the only record of the detail they replaced: keep them (the column stays).
-- ════════════════════════════════════════════════════════════════════════

set local lock_timeout = '5s';

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- md5 of prosrc with carriage returns removed: the image this file was written against (the replayed chain on set/v0.2.144), or its own.
-- The two helpers this file only CALLS are named without their arguments (to_regproc): tests/live-hash-drift.mjs's sweep takes
-- every quoted `public.name(args)` in a file with a loop pin as a pin, and apply-order-honesty then read this staged file as
-- the last toucher of hr_cron_ensure and hr_utc_day_start, applied bodies it never reads.
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regclass('public.player_ledger') is null or to_regclass('public.hr_ledger_config') is null
     or to_regclass('public.player_ledger_rollup') is null or to_regproc('public.hr_cron_ensure') is null
     or to_regproc('public.hr_utc_day_start') is null then
    raise exception 'PRECONDITION: the journal, its config, its rollup or the cron helper is missing'; end if;
  for v_r in select * from (values
    ('public.hr_ledger_immutable()', '677a4bd4e9f3a3fb2d43a369e3408b01', '3818b2021b57770a747b3a0bd6de989f'),
    ('public.hr_ledger_prune(integer)', '373aa1f22cca7ded4825c9f9f20db974', 'ed3c4cdf57969c5435b6703e23dd4ddc'),
    ('public.hr_hunt_accrue_fence()', '05d182d69f5b39c4064d3c421ff5f1e8', 'bfe879a159216fa83a1263ce8cd6a183'),
    ('public.hr_ledger_session_stamp()', '75c356e5ecf8b6eb298acd4db0726b43', '0dc6aa8db8d29f8d5748fefae6fea7dd'),
    ('public.hr_ledger_stamp_purse()', '8f029253847b37a2ce23e38aa7644039', '9a2ba8b1b5a1bea2f9addd83d9697965'),
    ('public.hr_tick_stall_status(timestamptz,integer,integer)', '0075c410c183917969b5311e70796547', '360cac1f6f4e7e6b60208e486dd1f8b8'),
    ('public.hr_day_budget_used(uuid,integer,timestamptz)', 'd59854a9d27baf52fdfbbbaf04b44602', 'fffd1b5def8cdf306cbec1ff2be2f9c9')) t(fn, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(v_r.fn);
    if v_md5 is null then raise exception 'PIN: % is missing', v_r.fn; end if;
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither the image this file was written against (%) nor its own (%): md5 % - another file moved it; re-pin', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE COLUMN, THE DIALS, THE STATE ──────────────────────────────────────
alter table public.player_ledger add column if not exists folded int;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.player_ledger'::regclass and conname = 'player_ledger_folded_ck') then
    alter table public.player_ledger add constraint player_ledger_folded_ck check (folded is null or folded >= 1) not valid; end if;
end $mig$;
comment on column public.player_ledger.folded is
  'NULL = one row as written. N = an hour row (1047-hourly-journal.sql): the sums of N rows of one hero, hour and activity; at = the hour''s start, meta.session = the hunt session.';

alter table public.hr_ledger_config add column if not exists hourly boolean not null default true;
alter table public.hr_ledger_config add column if not exists detail_minutes int not null default 180;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.hr_ledger_config'::regclass and conname = 'hr_ledger_config_detail_minutes_ck') then
    alter table public.hr_ledger_config add constraint hr_ledger_config_detail_minutes_ck check (detail_minutes between 130 and 10080); end if;
end $mig$;
comment on column public.hr_ledger_config.hourly is 'The hourly journal''s switch (1047-hourly-journal.sql). false: hr_ledger_hours_fold folds nothing.';
comment on column public.hr_ledger_config.detail_minutes is 'How long a settle row keeps its detail before its hour folds. Never under 130: hr_tick_stall_status reads two hours of it.';

create table if not exists public.hr_ledger_hours_state (
  id          boolean primary key default true check (id),
  from_at     timestamptz not null,           -- rows written before this stay as they are (the release)
  hour        timestamptz not null,           -- the hour being folded
  after_user  uuid,                           -- ...and the last hero of it done, in (user_id, slot) order
  after_slot  int,
  rows_in     bigint not null default 0,      -- detail rows folded, all time
  rows_out    bigint not null default 0,      -- hour rows written, all time
  left_rows   bigint not null default 0,      -- rows the model could not fold, all time (a writer journals a new key)
  last        jsonb,
  updated_at  timestamptz not null default now()
);
insert into public.hr_ledger_hours_state (id, from_at, hour) values (true, now(), date_trunc('hour', now())) on conflict (id) do nothing;
alter table public.hr_ledger_hours_state enable row level security;
revoke all on table public.hr_ledger_hours_state from public, anon, authenticated, service_role;

-- ── §2 THE MODEL (lane/c-ledger-fold's, whole; + boost_ms, prize and vendor_cover) ──
create or replace function public.hr_ledger_fold_model(p_kind text, p_intent text)
returns jsonb language plpgsql immutable set search_path = public, pg_catalog as $$
begin
  if p_intent = 'accrue' and p_kind in ('gather', 'craft', 'combat') then
    -- supabase/functions/hr-accrue/accrue-hunt.js, accrue-gather.js, accrue-artisan.js, tick-gather.js, index.ts (crew); hr_apply (delta);
    -- `flame` the Remains a hunt row's window burned on the company fire (1074-inner-flame-luck.sql hr_flame_net), summed by item.
    return '{
      "ms": "sum", "ticks": "sum", "kills": "sum", "qty": "sum", "made": "sum", "burnt": "sum", "boost_ms": "sum",
      "km": {"*": "sum"},
      "from": "min", "to": "max", "w": "pair", "n": "first", "left": "last",
      "mon": "label", "node": "label", "recipe": "label", "skill": "label", "src": "label", "capped": "label", "prize": "label",
      "stopped": "label", "out_of": "label", "room_for": "label", "skipped_items": "label",
      "crew": {"ms": "sum", "qty": "sum", "workers": "label", "items": {"*": "sum"}},
      "flame": {"burned": {"*": "sum"}},
      "delta": {"g": "sum", "m": "sum", "lx": "sum", "i_n": "sum", "i_sum": "sum",
                "i": {"*": "sum"}, "x": {"*": "sum"}, "st": {"*": "sum"}, "k": "names",
                "bt": {"c": "sum", "g": "sum", "mg": "label", "cr": "last"}}
    }'::jsonb;
  elsif p_kind = 'hunt' and p_intent = 'supply_own' then
    -- hr_hunt_settle_session: one row a save, every unit used.
    return '{"side": "label", "source": "label", "reason": "label", "items": {"*": "sum"}}'::jsonb;
  elsif p_kind = 'hunt' and p_intent = 'supply_buy' then
    -- hr_hunt_apply_instance: one row a save, the store's bill. `price` is the catalogue's at the hour's last buy.
    return '{"side": "label", "source": "label", "reason": "label", "gold": "sum",
             "items": {"*": {"qty": "sum", "price": "last"}}}'::jsonb;
  elsif p_kind = 'hunt' and p_intent = 'vendor_cover' then
    -- hr_hunt_apply_member: one row a save that sold loot to pay the store. `unit` is the catalogue's at the hour's last sale.
    return '{"reason": "label", "gold": "sum", "items": {"*": {"qty": "sum", "unit": "last"}}}'::jsonb;
  end if;
  return null;
end $$;

-- Does this meta fit the model, and under which labels? {ok: true, labels} or {ok: false, why}.
create or replace function public.hr_ledger_meta_plan(p_model jsonb, p_meta jsonb, p_path text default '')
returns jsonb language plpgsql immutable set search_path = public, pg_catalog as $$
declare
  k text; v jsonb; node jsonb; how text; t text; s text; sub jsonb; seg text; v_labels jsonb := '{}'::jsonb;
begin
  if p_model is null or jsonb_typeof(p_model) <> 'object' then
    return jsonb_build_object('ok', false, 'why', 'not a folded kind'); end if;
  if p_meta is null or jsonb_typeof(p_meta) <> 'object' then
    return jsonb_build_object('ok', false, 'why', 'not an object: ' || coalesce(nullif(rtrim(p_path, '.'), ''), 'meta')); end if;
  for k, v in select e.key, e.value from jsonb_each(p_meta) e loop
    t := jsonb_typeof(v);
    continue when t = 'null';
    node := coalesce(p_model -> k, p_model -> '*');
    if node is null then return jsonb_build_object('ok', false, 'why', 'key ' || p_path || k); end if;
    seg := case when p_model ? k then k else '*' end;
    if jsonb_typeof(node) = 'object' then
      sub := public.hr_ledger_meta_plan(node, v, p_path || k || '.');
      if not (sub ->> 'ok')::boolean then
        -- a refusal under a map names the map, not the item: one line per shape, never one per item id
        return case when seg = '*' and sub ->> 'why' like 'not an object:%'
                    then jsonb_build_object('ok', false, 'why', 'type ' || p_path || '* ' || t) else sub end;
      end if;
      v_labels := v_labels || (sub -> 'labels');
      continue;
    end if;
    how := node #>> '{}';
    s := v #>> '{}';
    if (how in ('sum', 'first', 'last') and t <> 'number')
       or (how in ('min', 'max') and (t <> 'string'
             or s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'))
       or (how = 'pair' and (t <> 'string' or s !~ '^[0-9]{1,15},[0-9]{1,15}$'))
       or (how = 'names' and (t <> 'array'
             or exists (select 1 from jsonb_array_elements(v) x where jsonb_typeof(x.value) <> 'string')))
       or (how = 'label' and t not in ('string', 'boolean', 'number')) then
      return jsonb_build_object('ok', false, 'why', 'type ' || p_path || seg || ' ' || t);
    end if;
    if how = 'label' then v_labels := v_labels || jsonb_build_object(p_path || k, v); end if;
  end loop;
  return jsonb_build_object('ok', true, 'labels', v_labels);
end $$;

-- One row's meta added to the running fold. Only ever given a meta hr_ledger_meta_plan passed; anything else raises.
create or replace function public.hr_ledger_meta_merge(p_model jsonb, p_acc jsonb, p_row jsonb)
returns jsonb language plpgsql immutable set search_path = public, pg_catalog as $$
declare
  k text; v jsonb; node jsonb; how text; s text; x text[]; y text[]; nm text; m jsonb;
  a jsonb := coalesce(p_acc, '{}'::jsonb);
begin
  for k, v in select e.key, e.value from jsonb_each(p_row) e loop
    continue when jsonb_typeof(v) = 'null';
    node := coalesce(p_model -> k, p_model -> '*');
    if jsonb_typeof(node) = 'object' then
      a := a || jsonb_build_object(k, public.hr_ledger_meta_merge(node, a -> k, v));
      continue;
    end if;
    how := node #>> '{}';
    s := v #>> '{}';
    if how = 'sum' then
      a := a || jsonb_build_object(k, coalesce((a ->> k)::numeric, 0) + s::numeric);
    elsif how = 'first' then
      if not a ? k then a := a || jsonb_build_object(k, v); end if;
    elsif how in ('last', 'label') then
      a := a || jsonb_build_object(k, v);
    elsif how = 'min' then
      -- one fixed-width UTC format (the plan checked it), so the text order is the time order
      if not a ? k or s collate "C" < (a ->> k) collate "C" then a := a || jsonb_build_object(k, v); end if;
    elsif how = 'max' then
      if not a ? k or s collate "C" > (a ->> k) collate "C" then a := a || jsonb_build_object(k, v); end if;
    elsif how = 'pair' then
      x := string_to_array(s, ',');
      y := string_to_array(coalesce(a ->> k, '0,0'), ',');
      a := a || jsonb_build_object(k, (x[1]::numeric + y[1]::numeric)::text || ',' || (x[2]::numeric + y[2]::numeric)::text);
    elsif how = 'names' then
      m := coalesce(a -> k, '{}'::jsonb);
      for nm in select jsonb_array_elements_text(v) loop
        m := m || jsonb_build_object(nm, coalesce((m ->> nm)::bigint, 0) + 1);
      end loop;
      a := a || jsonb_build_object(k, m);
    else
      raise exception 'hr_ledger_meta_merge: no rule for key % (%)', k, coalesce(how, 'none') using errcode = 'check_violation';
    end if;
  end loop;
  return a;
end $$;

-- The fold of a group's meta, in id order (an aggregate over hr_ledger_meta_merge).
create or replace function public.hr_ledger_meta_fold_step(p_acc jsonb, p_model jsonb, p_meta jsonb)
returns jsonb language sql immutable set search_path = public, pg_catalog as $$ select public.hr_ledger_meta_merge(p_model, p_acc, p_meta) $$;
create or replace aggregate public.hr_ledger_meta_fold(jsonb, jsonb) (sfunc = public.hr_ledger_meta_fold_step, stype = jsonb, initcond = '{}');

-- ── §3 WHO MAY DELETE A ROW INSIDE RETENTION: THE FOLD, AND ONLY ITS ROWS ───────
create or replace function public.hr_ledger_immutable()
returns trigger language plpgsql set search_path = public as $fn$
declare v_keep int; v_c record;
begin
  if tg_op = 'DELETE' then
    select retain_days, detail_minutes into v_c from public.hr_ledger_config;
    v_keep := v_c.retain_days;
    if old.at >= now() - make_interval(days => coalesce(v_keep, 90)) then
      -- HOURLY-JOURNAL (1047-hourly-journal.sql): the fold deletes the detail it has just summed into hour rows, in the same
      -- statement (its own proof checks the sums). Only under its transaction-local flag, only a foldable shape older than
      -- detail_minutes, and never an hour row. (Which rows it selects, never one before the release, is the fold's.)
      if coalesce(current_setting('hr.ledger_fold', true), '') = 'on' and old.folded is null
         and old.at < now() - make_interval(mins => coalesce(v_c.detail_minutes, 180))
         and public.hr_ledger_fold_model(old.kind, old.intent) is not null then
        return old;
      end if;
      raise exception 'player_ledger row is inside the % day retention window and cannot be deleted',
        coalesce(v_keep, 90) using errcode = 'check_violation';
    end if;
    return old;
  end if;
  raise exception 'player_ledger is append-only (attempted %)', tg_op
    using errcode = 'check_violation';
end $fn$;

-- ── §4 THE INSERT TRIGGERS PASS AN HOUR ROW BY (one anchored splice each) ─────
-- An hour row is the fold's: it is no settle (the hunt fence), belongs to no session (the stamp) and carries the purse of
-- its last row, not the wallet now (the purse stamp). Each anchor and replacement is written here verbatim.
do $mig$
declare v_r record; v_def text; v_n int;
begin
  for v_r in select * from (values
    (1, 'public.hr_hunt_accrue_fence()',
     $a$begin
  select h.id into v_s from public.hunt_sessions h$a$,
     $b$begin
  if new.folded is not null then return new; end if;   -- HOURLY-JOURNAL (1047): an hour row is the fold's, never a settle
  select h.id into v_s from public.hunt_sessions h$b$),
    (2, 'public.hr_ledger_session_stamp()',
     $a$begin
  if v_s ~ '^[0-9a-f]{8}$a$,
     $b$begin
  if new.folded is not null then return new; end if;   -- HOURLY-JOURNAL (1047): an hour row names its session in meta only
  if v_s ~ '^[0-9a-f]{8}$b$),
    (3, 'public.hr_ledger_stamp_purse()',
     $a$begin
  if coalesce(new.gold, 0) = 0 and new.purse is null then return new; end if;$a$,
     $b$begin
  if new.folded is not null then return new; end if;   -- HOURLY-JOURNAL (1047): an hour row keeps its last row's purse
  if coalesce(new.gold, 0) = 0 and new.purse is null then return new; end if;$b$),
    -- THE ROLLUP COUNTS THE ROWS AN HOUR ROW SUMS (its `n` is journal rows, as written)
    (4, 'public.hr_ledger_prune(integer)',
     $a$             count(*),$a$,
     $b$             sum(coalesce(l.folded, 1)),$b$),
    -- THE STALL ALARM COUNTS TICK WINDOWS, AN HOUR ROW AS ITS WINDOWS
    (5, 'public.hr_tick_stall_status(timestamptz,integer,integer)',
     $a$'tick_rows',      (select count(*) from public.player_ledger pl$a$,
     $b$'tick_rows',      (select coalesce(sum(coalesce(pl.folded, 1)), 0)::bigint from public.player_ledger pl$b$),
    -- THE DAY BUDGET'S ROW COUNT IS JOURNAL ROWS AS WRITTEN (its gold, xp, qty and gems are sums already)
    (6, 'public.hr_day_budget_used(uuid,integer,timestamptz)',
     $a$           'rows', count(*),$a$,
     $b$           'rows', coalesce(sum(coalesce(folded, 1)), 0),$b$)) t(n, fn, find, repl)
    order by n loop
    v_def := replace(pg_get_functiondef(v_r.fn::regprocedure), chr(13), '');
    v_n := (length(v_def) - length(replace(v_def, v_r.find, ''))) / length(v_r.find);
    if v_n = 0 and strpos(v_def, v_r.repl) > 0 then continue; end if;   -- a second apply
    if v_n <> 1 then raise exception 'SPLICE %: % holds its anchor % times, want 1', v_r.n, v_r.fn, v_n; end if;
    execute replace(v_def, v_r.find, v_r.repl);
  end loop;
end $mig$;

-- ── §5 THE FOLD ──────────────────────────────────────────────────────────────
-- hr_ledger_hours_fold(p_limit) folds closed hours from the state's cursor, a hero at a time, until p_limit rows are folded.
-- SCOPED (the self-check and tests/ledger-hours.mjs): p_only names one account and p_from / p_now its window and clock; the
-- cursor is not read or moved and the switch is not consulted. Anything else with p_from or p_now is refused.
create or replace function public.hr_ledger_hours_one(p_user uuid, p_slot int, p_lo timestamptz, p_hi timestamptz, p_from timestamptz,
                                                      p_cut timestamptz)
returns jsonb language plpgsql volatile set search_path = public, pg_catalog as $fn$
-- One hero's one hour: insert its hour rows and delete the detail they sum, in one statement, then prove the sums.
declare v_in jsonb; v_out jsonb; v_left int;
begin
  perform set_config('hr.ledger_fold', 'on', true);
  with src as materialized (
    select l.id, l.at, l.user_id, l.slot, l.kind, l.intent, l.gold_kind, l.session_id, l.gold, l.gold_in, l.xp_in, l.qty_in,
           l.gems_in, l.qty, l.xp, l.purse, l.meta, m.model, p.plan
      from public.player_ledger l
      cross join lateral (select public.hr_ledger_fold_model(l.kind, l.intent) as model) m
      cross join lateral (select public.hr_ledger_meta_plan(m.model, l.meta) as plan offset 0) p
     where l.user_id = p_user and l.slot = p_slot and l.at >= greatest(p_lo, p_from) and l.at < least(p_hi, p_cut)
       and l.folded is null and m.model is not null and (p.plan ->> 'ok')::boolean
  ),
  grp as (
    select s.user_id, s.slot, s.kind, s.intent, s.gold_kind, s.session_id, s.plan -> 'labels' as labels,
           coalesce(s.gold, 0) < 0 as gneg, coalesce(s.qty, 0) < 0 as qneg, coalesce(s.xp, 0) < 0 as xneg,
           count(*)::int as n, sum(s.gold)::bigint as gold, sum(s.gold_in)::bigint as gold_in, sum(s.xp_in)::bigint as xp_in,
           sum(s.qty_in)::bigint as qty_in, sum(s.gems_in)::bigint as gems_in, sum(s.qty)::bigint as qty, sum(s.xp)::bigint as xp,
           (array_agg(s.purse order by s.id desc) filter (where s.purse is not null))[1] as purse,
           public.hr_ledger_meta_fold(s.model, s.meta order by s.id) as meta
      from src s
     group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
  ),
  ins as (
    insert into public.player_ledger (user_id, slot, kind, intent, gold_kind, gold, gold_in, xp_in, qty_in, gems_in, qty, xp,
                                      purse, meta, at, folded)
    select g.user_id, g.slot, g.kind, g.intent, g.gold_kind, g.gold, g.gold_in, g.xp_in, g.qty_in, g.gems_in, g.qty, g.xp,
           g.purse, g.meta || case when g.session_id is null then '{}'::jsonb else jsonb_build_object('session', g.session_id) end,
           p_lo, g.n
      from grp g
    returning folded, gold, gold_in, xp_in, qty_in, gems_in, qty, xp
  ),
  del as (
    delete from public.player_ledger l using src s where l.id = s.id and l.at = s.at and l.at >= p_lo and l.at < p_hi
    returning l.gold, l.gold_in, l.xp_in, l.qty_in, l.gems_in, l.qty, l.xp
  )
  select (select jsonb_build_object('rows', count(*), 'gold', coalesce(sum(gold), 0), 'gold_in', coalesce(sum(gold_in), 0),
                 'xp_in', coalesce(sum(xp_in), 0), 'qty_in', coalesce(sum(qty_in), 0), 'gems_in', coalesce(sum(gems_in), 0),
                 'qty', coalesce(sum(qty), 0), 'xp', coalesce(sum(xp), 0)) from del),
         (select jsonb_build_object('rows', coalesce(sum(folded), 0), 'gold', coalesce(sum(gold), 0), 'gold_in', coalesce(sum(gold_in), 0),
                 'xp_in', coalesce(sum(xp_in), 0), 'qty_in', coalesce(sum(qty_in), 0), 'gems_in', coalesce(sum(gems_in), 0),
                 'qty', coalesce(sum(qty), 0), 'xp', coalesce(sum(xp), 0), 'hours', count(*)) from ins)
    into v_in, v_out;
  perform set_config('hr.ledger_fold', '', true);
  -- THE PROOF: what was deleted is what was written, column for column (the hour rows' `hours` aside).
  if v_in is distinct from (v_out - 'hours') then
    raise exception 'hr_ledger_hours_fold: the hour rows of %/% at % do not sum their detail: in % out %', p_user, p_slot, p_lo, v_in, v_out
      using errcode = 'check_violation';
  end if;
  -- the rows of this hour the model could not fold (they keep their detail)
  select count(*) into v_left from public.player_ledger l
   where l.user_id = p_user and l.slot = p_slot and l.at >= greatest(p_lo, p_from) and l.at < least(p_hi, p_cut)
     and l.folded is null and public.hr_ledger_fold_model(l.kind, l.intent) is not null;
  return jsonb_build_object('rows_in', (v_in ->> 'rows')::bigint, 'rows_out', (v_out ->> 'hours')::bigint, 'left', v_left);
end $fn$;

create or replace function public.hr_ledger_hours_fold(p_limit int default 50000, p_only uuid default null,
                                                       p_from timestamptz default null, p_now timestamptz default null)
returns jsonb language plpgsql volatile set search_path = public, pg_catalog as $fn$
declare
  c public.hr_ledger_config%rowtype; st public.hr_ledger_hours_state%rowtype;
  v_now timestamptz := coalesce(p_now, now()); v_cut timestamptz; v_lo timestamptz; v_r record; v_one jsonb;
  v_in bigint := 0; v_out bigint := 0; v_left bigint := 0; v_hours int := 0; v_lim int := greatest(1, least(coalesce(p_limit, 50000), 500000));
  v_err int := 0; v_why text;
begin
  select * into c from public.hr_ledger_config limit 1;
  if p_only is null and (p_from is not null or p_now is not null) then
    raise exception 'hr_ledger_hours_fold: p_from and p_now are for one account (p_only) only' using errcode = 'invalid_parameter_value'; end if;
  if p_only is not null and p_from is null then
    raise exception 'hr_ledger_hours_fold: a scoped fold names its p_from' using errcode = 'invalid_parameter_value'; end if;
  -- every row older than this has had detail_minutes of detail; an hour folds once it ends before it
  v_cut := v_now - make_interval(mins => coalesce(c.detail_minutes, 180));

  if p_only is not null then
    v_lo := date_trunc('hour', p_from);
    while v_lo + interval '1 hour' <= v_cut loop
      for v_r in select distinct l.user_id, l.slot from public.player_ledger l
                  where l.user_id = p_only and l.at >= greatest(v_lo, p_from) and l.at < v_lo + interval '1 hour' and l.folded is null
                  order by 1, 2 loop
        v_one := public.hr_ledger_hours_one(v_r.user_id, v_r.slot, v_lo, v_lo + interval '1 hour', p_from, v_cut);
        v_in := v_in + (v_one ->> 'rows_in')::bigint; v_out := v_out + (v_one ->> 'rows_out')::bigint; v_left := v_left + (v_one ->> 'left')::bigint;
      end loop;
      v_lo := v_lo + interval '1 hour';
    end loop;
    return jsonb_build_object('scoped', true, 'rows_in', v_in, 'rows_out', v_out, 'left', v_left);
  end if;

  if not coalesce(c.hourly, false) then return jsonb_build_object('off', true); end if;
  -- a restore that lost the state row starts here: the hours between keep their detail (more rows, never less value)
  insert into public.hr_ledger_hours_state (id, from_at, hour) values (true, now(), date_trunc('hour', now())) on conflict (id) do nothing;
  select * into st from public.hr_ledger_hours_state where id for update skip locked;
  if not found then return jsonb_build_object('busy', true); end if;

  while st.hour + interval '1 hour' <= v_cut and v_in < v_lim loop
    for v_r in select l.user_id, l.slot from public.player_ledger l
                where l.at >= greatest(st.hour, st.from_at) and l.at < st.hour + interval '1 hour' and l.folded is null
                  and public.hr_ledger_fold_model(l.kind, l.intent) is not null
                  and (st.after_user is null or (l.user_id, l.slot) > (st.after_user, st.after_slot))
                group by 1, 2 order by 1, 2 loop
      -- ONE HERO-HOUR THAT CANNOT FOLD KEEPS ITS DETAIL (never evict on uncertainty) and the run goes on: counted, its error kept.
      begin
        v_one := public.hr_ledger_hours_one(v_r.user_id, v_r.slot, st.hour, st.hour + interval '1 hour', st.from_at, v_cut);
      exception when others then
        v_err := v_err + 1; v_why := coalesce(v_why, left(sqlerrm, 300));
        v_one := '{"rows_in": 0, "rows_out": 0, "left": 0}'::jsonb;
      end;
      v_in := v_in + (v_one ->> 'rows_in')::bigint; v_out := v_out + (v_one ->> 'rows_out')::bigint; v_left := v_left + (v_one ->> 'left')::bigint;
      st.after_user := v_r.user_id; st.after_slot := v_r.slot;
      exit when v_in >= v_lim;
    end loop;
    if v_in >= v_lim then exit; end if;
    -- the hour is done: the next one
    st.hour := st.hour + interval '1 hour'; st.after_user := null; st.after_slot := null; v_hours := v_hours + 1;
  end loop;

  update public.hr_ledger_hours_state
     set hour = st.hour, after_user = st.after_user, after_slot = st.after_slot,
         rows_in = rows_in + v_in, rows_out = rows_out + v_out, left_rows = left_rows + v_left,
         last = jsonb_build_object('at', now(), 'rows_in', v_in, 'rows_out', v_out, 'left', v_left, 'hours_done', v_hours,
                                   'hour', st.hour, 'errors', v_err, 'error', v_why),
         updated_at = now()
   where id;
  return jsonb_build_object('rows_in', v_in, 'rows_out', v_out, 'left', v_left, 'hours_done', v_hours, 'hour', st.hour,
                            'errors', v_err, 'error', v_why);
end $fn$;

do $mig$
declare r text;
begin
  foreach r in array array['public.hr_ledger_hours_fold(integer,uuid,timestamptz,timestamptz)',
                           'public.hr_ledger_hours_one(uuid,integer,timestamptz,timestamptz,timestamptz,timestamptz)',
                           'public.hr_ledger_fold_model(text,text)', 'public.hr_ledger_meta_plan(jsonb,jsonb,text)',
                           'public.hr_ledger_meta_merge(jsonb,jsonb,jsonb)', 'public.hr_ledger_meta_fold_step(jsonb,jsonb,jsonb)',
                           'public.hr_ledger_meta_fold(jsonb,jsonb)'] loop
    execute format('revoke execute on function %s from public', r);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon, authenticated, service_role', r); end if;
    if exists (select 1 from pg_roles where rolname = 'hr_engine') then
      execute format('revoke execute on function %s from hr_engine', r); end if;
    if exists (select 1 from pg_roles where rolname = 'hr_tick') then
      execute format('revoke execute on function %s from hr_tick', r); end if;
  end loop;
end $mig$;

-- ── §6 THE JOB ───────────────────────────────────────────────────────────────
do $mig$ begin perform public.hr_cron_ensure('hr-ledger-hours', '6-56/10 * * * *', 'select public.hr_ledger_hours_fold(50000)'); end $mig$;

-- ── §7 SELF-CHECK (CLAUDE.md §4), EXECUTED; every probe is rolled back ─────────
-- (a) the column, the dials, the state and the job; the bodies at their post text; owner-only grants
-- (b) a probe hero's five hours of each settle shape, plus a death, a press, a row the model cannot fold, a row before the
--     release and a row inside detail_minutes: the scoped fold leaves one hour row an hour an activity, and EVERY DAY READ
--     IS THE SAME: hr_day_budget_used, the store's day cap (supply_buy items by kind), the rollup's sums and rows by sign,
--     the journal rows counted through `folded`; the death, the press, the unknown key, the old row and the recent row are
--     where they were; a second fold moves nothing
-- (c) the fence: a delete without the fold's flag, an update of an hour row and an early delete of an hour row are refused
do $chk$
declare
  u constant uuid := '000000c0-0000-4000-a000-00004a0b1037';
  v_t0 timestamptz := date_trunc('hour', now()) - interval '9 hours';
  v_b0 jsonb; v_b1 jsonb; v_c0 jsonb; v_c1 jsonb; v_r0 jsonb; v_r1 jsonb; v_f jsonb; v_n0 bigint; v_n1 bigint; v_h int; i int;
  v_err text;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_ledger' and column_name = 'folded')
     or (select hourly from public.hr_ledger_config limit 1) is not true
     or (select detail_minutes from public.hr_ledger_config limit 1) <> 180
     or not exists (select 1 from public.hr_ledger_hours_state where id) then
    raise exception 'hourly-journal §7(a): the column, the dials or the state are missing'; end if;
  if to_regclass('cron.job') is not null and not exists (select 1 from cron.job where jobname = 'hr-ledger-hours' and active
       and schedule = '6-56/10 * * * *' and command = 'select public.hr_ledger_hours_fold(50000)') then
    raise exception 'hourly-journal §7(a): hr-ledger-hours is not scheduled every 10 minutes'; end if;
  if strpos(pg_get_functiondef('public.hr_ledger_prune(integer)'::regprocedure), 'sum(coalesce(l.folded, 1))') = 0
     or strpos(pg_get_functiondef('public.hr_tick_stall_status(timestamptz,integer,integer)'::regprocedure), 'sum(coalesce(pl.folded, 1))') = 0
     or strpos(pg_get_functiondef('public.hr_day_budget_used(uuid,integer,timestamptz)'::regprocedure), 'sum(coalesce(folded, 1))') = 0
     or strpos(pg_get_functiondef('public.hr_hunt_accrue_fence()'::regprocedure), 'new.folded is not null') = 0
     or strpos(pg_get_functiondef('public.hr_ledger_session_stamp()'::regprocedure), 'new.folded is not null') = 0
     or strpos(pg_get_functiondef('public.hr_ledger_stamp_purse()'::regprocedure), 'new.folded is not null') = 0 then
    raise exception 'hourly-journal §7(a): a reader or a trigger does not know an hour row'; end if;
  if exists (select 1 from (values ('anon'), ('authenticated'), ('service_role'), ('hr_engine'), ('hr_tick')) x(role)
              where exists (select 1 from pg_roles where rolname = x.role)
                and (has_function_privilege(x.role, 'public.hr_ledger_hours_fold(integer,uuid,timestamptz,timestamptz)', 'execute')
                  or has_function_privilege(x.role, 'public.hr_ledger_hours_one(uuid,integer,timestamptz,timestamptz,timestamptz,timestamptz)', 'execute')
                  or has_table_privilege(x.role, 'public.hr_ledger_hours_state', 'select,insert,update,delete'))) then
    raise exception 'hourly-journal §7(a): a client or engine role may run the fold or read its state'; end if;

  begin
    insert into auth.users (id) values (u) on conflict (id) do nothing;
    insert into public.account_wallet (user_id, gold) values (u, 5000) on conflict (user_id) do update set gold = 5000;
    -- five hours of settles (12 a hour of each shape), a death, a press, an unknown key, a row before the release, a recent row
    for i in 0 .. 59 loop
      insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, gold_kind, meta, at)
      values (u, 0, 'combat', 'accrue', 7, 7, 30, 2, 0, 'hunt_loot',
              jsonb_build_object('ms', 100000, 'ticks', 50, 'kills', 3, 'mon', 'krells_hold', 'km', jsonb_build_object('krell', 3),
                'from', to_char(v_t0 + make_interval(mins => i * 5), 'YYYY-MM-DD"T"HH24:MI:SS".000Z"'),
                'to', to_char(v_t0 + make_interval(mins => i * 5 + 1), 'YYYY-MM-DD"T"HH24:MI:SS".000Z"'),
                'delta', jsonb_build_object('g', 7, 'i', jsonb_build_object('bones', 2), 'x', jsonb_build_object('melee', 30), 'k', jsonb_build_array('hp', 'journal'))),
              v_t0 + make_interval(mins => i * 5));
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, gold_kind, meta, at)
      values (u, 0, 'hunt', 'supply_buy', -12, null, 'hunt_supply',
              jsonb_build_object('side', 'bag', 'source', 'store', 'gold', 12, 'items', jsonb_build_object('salted_shrimp', jsonb_build_object('qty', 3, 'price', 4))),
              v_t0 + make_interval(mins => i * 5, secs => 1));
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, at)
      values (u, 0, 'hunt', 'supply_own', 0, -2,
              jsonb_build_object('side', 'bag', 'source', 'own', 'items', jsonb_build_object('cooked_swordfish', 2)),
              v_t0 + make_interval(mins => i * 5, secs => 2));
    end loop;
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, meta, at)
      values (u, 0, 'combat', 'death', 0, 0, 0, 0, '{"monster": "krell"}', v_t0 + interval '30 minutes'),
             (u, 0, 'combat', 'accrue', 0, 0, 5, 0, '{"ms": 1, "zz_new_key": 1}', v_t0 + interval '31 minutes'),
             (u, 0, 'combat', 'accrue', 0, 0, 11, 0, '{"ms": 1}', v_t0 - interval '1 hour'),
             (u, 0, 'combat', 'accrue', 0, 0, 13, 0, '{"ms": 1}', now() - interval '10 minutes');
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_kind, meta, at)
      values (u, 0, 'shop', 'stamina_refill:probe', -3, 'stamina', '{}', v_t0 + interval '40 minutes');

    -- the day reads before (every UTC day the rows touch), as the readers make them
    select jsonb_object_agg(d::text, public.hr_day_budget_used(u, 0, d + interval '12 hours')) into v_b0
      from generate_series(date_trunc('day', v_t0 - interval '1 hour'), date_trunc('day', now()), interval '1 day') d;
    select coalesce(jsonb_object_agg(k, n), '{}') into v_c0 from (
      select date_trunc('day', l.at)::date::text || ':' || x.key as k, sum((x.value ->> 'qty')::bigint) as n
        from public.player_ledger l, jsonb_each(case when jsonb_typeof(l.meta -> 'items') = 'object' then l.meta -> 'items' else '{}'::jsonb end) x
       where l.user_id = u and l.kind = 'hunt' and l.intent = 'supply_buy' group by 1) a;
    select jsonb_object_agg(k, v) into v_r0 from (
      select l.kind || ':' || date_trunc('month', l.at)::date::text as k,
             jsonb_build_array(sum(coalesce(l.folded, 1)), sum(greatest(coalesce(l.gold, 0), 0)), sum(greatest(-coalesce(l.gold, 0), 0)),
                               sum(greatest(coalesce(l.qty, 0), 0)), sum(greatest(-coalesce(l.qty, 0), 0)), sum(coalesce(l.xp_in, 0))) as v
        from public.player_ledger l where l.user_id = u group by 1) a;
    select count(*) into v_n0 from public.player_ledger where user_id = u;

    -- (b) the fold, as if the release were the probe's first hour
    v_f := public.hr_ledger_hours_fold(50000, u, v_t0, now());
    select jsonb_object_agg(d::text, public.hr_day_budget_used(u, 0, d + interval '12 hours')) into v_b1
      from generate_series(date_trunc('day', v_t0 - interval '1 hour'), date_trunc('day', now()), interval '1 day') d;
    select coalesce(jsonb_object_agg(k, n), '{}') into v_c1 from (
      select date_trunc('day', l.at)::date::text || ':' || x.key as k, sum((x.value ->> 'qty')::bigint) as n
        from public.player_ledger l, jsonb_each(case when jsonb_typeof(l.meta -> 'items') = 'object' then l.meta -> 'items' else '{}'::jsonb end) x
       where l.user_id = u and l.kind = 'hunt' and l.intent = 'supply_buy' group by 1) a;
    select jsonb_object_agg(k, v) into v_r1 from (
      select l.kind || ':' || date_trunc('month', l.at)::date::text as k,
             jsonb_build_array(sum(coalesce(l.folded, 1)), sum(greatest(coalesce(l.gold, 0), 0)), sum(greatest(-coalesce(l.gold, 0), 0)),
                               sum(greatest(coalesce(l.qty, 0), 0)), sum(greatest(-coalesce(l.qty, 0), 0)), sum(coalesce(l.xp_in, 0))) as v
        from public.player_ledger l where l.user_id = u group by 1) a;
    select count(*) into v_n1 from public.player_ledger where user_id = u;
    if (v_f ->> 'rows_in')::int <> 180 or (v_f ->> 'left')::int <> 1 then
      raise exception 'hourly-journal §7(b): the fold took % (want 180 rows in, 1 left: the unknown key)', v_f; end if;
    if v_b1 is distinct from v_b0 then raise exception 'hourly-journal §7(b): a day budget moved: % -> %', v_b0, v_b1; end if;
    if v_c1 is distinct from v_c0 then raise exception 'hourly-journal §7(b): the store''s day cap moved: % -> %', v_c0, v_c1; end if;
    if v_r1 is distinct from v_r0 then raise exception 'hourly-journal §7(b): the rollup''s sums moved: % -> %', v_r0, v_r1; end if;
    -- five hours x three shapes = 15 hour rows; the death, the press, the unknown key, the old row and the recent row stay
    select count(*) into v_h from public.player_ledger where user_id = u and folded is not null;
    if v_h <> 15 or v_n1 <> v_n0 - 180 + 15 then
      raise exception 'hourly-journal §7(b): % hour rows, % rows from % (want 15, and 180 folded into them)', v_h, v_n1, v_n0; end if;
    if (select count(*) from public.player_ledger where user_id = u and folded is null
          and (intent = 'death' or intent like 'stamina_refill:%' or meta ? 'zz_new_key' or xp_in in (11, 13))) <> 5 then
      raise exception 'hourly-journal §7(b): a row that must keep its detail was folded'; end if;
    if exists (select 1 from public.player_ledger where user_id = u and folded is not null
                and (session_id is not null or at <> date_trunc('hour', at) or (kind = 'combat' and not (meta -> 'km' ->> 'krell')::int = 36))) then
      raise exception 'hourly-journal §7(b): an hour row is not at its hour, names a session column or lost its kills'; end if;
    if (public.hr_ledger_hours_fold(50000, u, v_t0, now()) ->> 'rows_in')::int <> 0 then
      raise exception 'hourly-journal §7(b): a second fold folded again'; end if;

    -- (c) the fence
    begin
      delete from public.player_ledger where user_id = u and meta ? 'zz_new_key';
      v_err := 'a delete without the fold''s flag';
    exception when check_violation then v_err := null;
    end;
    if v_err is not null then raise exception 'hourly-journal §7(c): % was allowed', v_err; end if;
    begin
      update public.player_ledger set gold = gold + 1 where user_id = u and folded is not null;
      v_err := 'an update of an hour row';
    exception when check_violation then v_err := null;
    end;
    if v_err is not null then raise exception 'hourly-journal §7(c): % was allowed', v_err; end if;
    begin
      perform set_config('hr.ledger_fold', 'on', true);
      delete from public.player_ledger where user_id = u and folded is not null;
      v_err := 'an early delete of an hour row under the flag';
    exception when check_violation then v_err := null;
    end;
    perform set_config('hr.ledger_fold', '', true);
    if v_err is not null then raise exception 'hourly-journal §7(c): % was allowed', v_err; end if;

    raise exception using errcode = 'HRHJ1', message = 'probe done - rolling back';
  exception when sqlstate 'HRHJ1' then null;
  end;
  if exists (select 1 from public.player_ledger where user_id = u) then
    raise exception 'hourly-journal §7: the probe left a journal row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'hourly-journal: 180 settle rows became 15 hour rows; every day read the same; the fence holds; all green';
end $chk$;
