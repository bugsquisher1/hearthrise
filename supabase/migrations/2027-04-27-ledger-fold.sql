-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-27-ledger-fold.sql — THE LEDGER'S FOLD TIER, INSTALLED OFF (2027-04-28-ledger-fold-arm.sql turns it on, on a go)
--   (lane/c-ledger-fold, reliability-engineer, 2026-11-15; designed on lane/c-restore-drill-fixes 8d53f9d34).
--   STAGED: tools/apply-migration.mjs, one file, never inside begin/commit. Pre-EA (CLAUDE.md §2): applies on its passing §6.
--   ON THE EA SECURITY LIST (§3.7): a money journal surface. It is the one path that deletes player_ledger rows inside retention.
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- Measured read-only on production 2026-11-15 (lane/c-restore-drill-fixes): player_ledger 396,544 rows, 246 MB, 69% of the
-- database, 27 days old. Today's writers make 12.1k rows and 8.3 MB a day: 0.75 GB at the 90-day line, 7.4 GB at ten times the
-- play, 74 GB at a hundred. A hunt writes 75% of the rows (one combat row a settle, its supply rows), gathering 16%, a bench 4%.
-- Each of those rows is a 10 to 100 second slice of one run; nothing on the server reads one after 48 hours (the readers are
-- listed in tests/ledger-fold.mjs, which fails on a new one). So detail older than `detail_days` is summed into ONE row per
-- hero, run and 15 minutes, in the transaction that deletes it. Simulated on the real ledger: 311,589 rows become 18,276.
--
-- ── THE CONTRACT ───────────────────────────────────────────────────────────
-- hr_ledger_config.detail_days  int NULL  NEW. NULL = no fold tier: every row keeps its detail for retain_days, as before this
--   file, and that is how this file leaves it. Set by the arm file. CHECK: >= 3 (a server reader looks back 48 hours; 3 days
--   clears it) and < retain_days.
-- hr_ledger_config.window_minutes  int  NEW, 15. A divisor of 1440 from 5 up, so a window never crosses a UTC day or month.
-- player_ledger_windows  NEW, append-only, no client grant, RLS on with no policy. One row = every folded row of one
--   (hero, kind, intent, hunt session, gold_kind, label set, window). It states: n and ids (every folded player_ledger.id),
--   first_at and last_at, the signed columns by sign (gold_pos/gold_neg, qty_pos/qty_neg, xp_pos/xp_neg: what the monthly
--   rollup needs, to the unit), the day-budget columns summed (gold_in, xp_in, qty_in, gems_in), the purse after its last row,
--   and meta: the rows' meta folded key by key into the SAME shape (hr_ledger_fold_model is the one list of keys and rules).
-- THE PROOF IS A TRIGGER (hr_ledger_window_proved, before insert): the row is refused unless it equals, column for column and
--   key for key, the fold of the player_ledger rows it lists as they stand, all of one hero, kind, intent, session, gold_kind
--   and label set, all older than detail_days, none held by another window. No window exists that does not account for its rows.
-- hr_ledger_immutable RESTATED (§0 pins the 2026-08-11-player-state.sql image). One arm added: a row inside retain_days is
--   deletable when detail_days is set, the row is older than it, AND a window lists its id. Everything else is unchanged:
--   UPDATE and TRUNCATE always refused, a row with no window refused as before.
-- hr_ledger_fold(p_limit, p_dry_run, p_only, p_detail_days) -> jsonb  NEW (postgres only). Folds whole windows from its
--   cursor up to detail_days ago, at least p_limit rows when that many wait. A row whose meta carries a key or type the model
--   does not list is LEFT as detail (it ages out through hr_ledger_prune as before) and counted in the answer by key.
--   p_only: one account's rows only, from its first row, the cursor untouched (the self-check's scope).
-- hr_ledger_fold_plan(p_limit, p_only, p_detail_days) -> jsonb  NEW (postgres only). THE DRY RUN, and what p_dry_run calls:
--   the same figures, read and not done. It is STABLE, so PostgreSQL refuses a write or a row lock inside it, and it runs in
--   a READ ONLY transaction. p_detail_days asks what N days would fold while the tier is off.
-- hr_ledger_windows_prune(p_limit, p_only) -> int  NEW (postgres only). Windows past retain_days go to player_ledger_rollup
--   with the same sums hr_ledger_prune writes from detail, then are deleted. hr_ledger_prune is NOT touched.
-- hr_ledger_fold_state  NEW, one row: the cursor (folded_to), running totals and the last run's answer.
-- CRON  hr-ledger-fold, every 10 minutes, hr_ledger_fold(20000): 2.9M rows a day, 2.4 times a hundred times today's play, in
--   batches a tenth the size an hourly job would need. While detail_days is NULL it answers "off" and reads nothing.
--   hr-ledger-windows-prune, hourly, hr_ledger_windows_prune(20000): nothing to take until a window is retain_days old.
--
-- ── CONCURRENCY / IDEMPOTENCY ──────────────────────────────────────────────
-- One fold at a time: the state row is taken FOR UPDATE SKIP LOCKED (a second caller answers busy). The batch's rows are
-- locked FOR UPDATE before they are read, so hr_ledger_prune (SKIP LOCKED) passes them by. Rows older than 3 days have no
-- other writer: `at` is the insert's now(), UPDATE is refused, and no reader takes a lock. The windows and the delete are one
-- transaction: any refusal (the proof, the count) rolls both back. A second run starts at the cursor and finds nothing.
--
-- ── EXPLOIT SURFACE DELTA ──────────────────────────────────────────────────
-- No client verb, no grant, no value moves. What narrows: a ledger row of five journal shapes (accrue of gather, craft and
-- combat; hunt supply_buy and supply_own) can be deleted after detail_days where it took retain_days, by a role that already
-- holds DELETE (the owner), and only when a proved window lists it. What is lost for good is the per-settle split of those
-- rows past detail_days; every sum, item, skill XP, kill by monster and the purse after are kept. Deaths, shop, market, wallet,
-- blessing, forfeit and every other row keep their detail for retain_days.
--
-- ── COST (rows and bytes at 100x players) ─────────────────────────────────
-- The 90-day line: about 100 MB today, 1.0 GB at ten times, 10 GB at a hundred (was 0.75, 7.4 and 74 GB); 2.5 GB of the last
-- is the 3 days of detail. The ids cost 8 bytes a folded row (7% of a window). The fold reads ten minutes of rows through the
-- (at, id) key and deletes them through (user_id, slot, at); the delete's trigger reads at most one day of that hero's windows.
-- These are the design lane's measurements scaled by the windows' own width; production was not read again in this lane.
--
-- APPLYING THIS FILE FOLDS NOTHING AND DELETES NOTHING: detail_days stays NULL, so every lock answers as it did before.
-- EDGE: NONE. CLIENT: NONE. hr_apply, the hunt settle, the day budget and hr_ledger_prune are not touched.
-- ORDER: after 2027-04-23-open-march-scaled-hunts-catalogue.generated.sql (the chain's tip); it depends on nothing staged.
-- REVERSIBLE: hr_cron_drop both jobs; re-apply 2026-08-11-player-state.sql §6a's hr_ledger_immutable; drop the eleven new
--   functions, the two tables and the two config columns. Windows already written are the only record of the detail they
--   replaced: keep that table if it holds a row.
-- IDEMPOTENT: a second apply finds the columns, tables, triggers and rows, restates every body byte-identical, and §6 rolls
--   back its probes.
-- WIPE: player_ledger_windows is on the character wipe's list (2027-02-25-character-wipe.sql, edited in this lane).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.player_ledger') is null or to_regclass('public.player_ledger_rollup') is null
     or to_regclass('public.hr_ledger_config') is null or to_regclass('public.account_wallet') is null then
    raise exception 'PRECONDITION: player_ledger, player_ledger_rollup, hr_ledger_config and account_wallet first'; end if;
  if to_regprocedure('public.hr_ledger_prune(integer)') is null or to_regprocedure('public.hr_ledger_immutable()') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: hr_ledger_prune, hr_ledger_immutable and hr_assert_grant_hygiene first'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_ledger'
                  and column_name = 'gold_kind') then
    raise exception 'PRECONDITION: player_ledger.gold_kind (2026-12-15-account-gold.sql) first'; end if;
  -- THE PIN: hr_ledger_immutable is restated below from the one image the chain holds (2026-08-11-player-state.sql; replay and
  -- live agreed, live-hash-drift 2026-11-15). Its own image (a second apply) passes; anything else is re-read, never guessed.
  v_md5 := md5(regexp_replace(pg_get_functiondef('public.hr_ledger_immutable()'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_md5 not in ('c8a9cc6f783706c0b09a023785d32a98', '9c0771e359ee79961d012d879e887bc4') then
    raise exception 'PIN: hr_ledger_immutable is neither the image this file restates (c8a9cc6f783706c0b09a023785d32a98) nor its own (9c0771e359ee79961d012d879e887bc4): md5 % - another file moved it', v_md5;
  end if;
end $mig$;

-- ── §1 THE DIALS ─────────────────────────────────────────────────────────────
alter table public.hr_ledger_config add column if not exists detail_days int;
alter table public.hr_ledger_config add column if not exists window_minutes int not null default 15;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.hr_ledger_config'::regclass and conname = 'hr_ledger_config_detail_days_ck') then
    alter table public.hr_ledger_config add constraint hr_ledger_config_detail_days_ck
      check (detail_days is null or (detail_days >= 3 and detail_days < retain_days)); end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.hr_ledger_config'::regclass and conname = 'hr_ledger_config_window_minutes_ck') then
    alter table public.hr_ledger_config add constraint hr_ledger_config_window_minutes_ck
      check (window_minutes between 5 and 1440 and 1440 % window_minutes = 0); end if;
end $mig$;
comment on column public.hr_ledger_config.detail_days is
  'NULL = no fold tier. Else hr_ledger_fold sums accrue and hunt supply rows older than this many days into player_ledger_windows and deletes them. Never below 3: hr_tick_stall_status reads 48 hours of them.';
comment on column public.hr_ledger_config.window_minutes is
  'The width of one player_ledger_windows row. A divisor of 1440, so a window never crosses a UTC day.';

-- ── §2 THE WINDOWS AND THE CURSOR ────────────────────────────────────────────
create table if not exists public.player_ledger_windows (
  id          bigserial,
  user_id     uuid not null,
  slot        int  not null,
  kind        text not null,
  intent      text not null,
  session_id  uuid,
  gold_kind   text,
  window_from timestamptz not null,
  window_to   timestamptz not null,
  n           int not null,
  ids         bigint[] not null,
  first_at    timestamptz not null,
  last_at     timestamptz not null,
  gold_pos    bigint not null default 0,
  gold_neg    bigint not null default 0,
  qty_pos     bigint not null default 0,
  qty_neg     bigint not null default 0,
  xp_pos      bigint not null default 0,
  xp_neg      bigint not null default 0,
  gold_in     bigint not null default 0,
  xp_in       bigint not null default 0,
  qty_in      bigint not null default 0,
  gems_in     bigint not null default 0,
  purse       bigint,
  meta        jsonb not null default '{}'::jsonb,
  folded_at   timestamptz not null default now(),
  -- (window_from, id), as player_ledger's (at, id): the retention scan's key, and partitioning by time stays open.
  primary key (window_from, id),
  constraint player_ledger_windows_shape check (
    n >= 1 and n = cardinality(ids) and window_to > window_from and window_to - window_from <= interval '1 day'
    and first_at >= window_from and last_at < window_to and first_at <= last_at),
  constraint player_ledger_windows_one_day check (
    (window_from at time zone 'UTC')::date = ((window_to - interval '1 microsecond') at time zone 'UTC')::date),
  constraint player_ledger_windows_nonneg check (
    gold_pos >= 0 and gold_neg >= 0 and qty_pos >= 0 and qty_neg >= 0 and xp_pos >= 0 and xp_neg >= 0
    and gold_in >= 0 and xp_in >= 0 and qty_in >= 0 and gems_in >= 0)
);
-- The delete trigger's read (one hero, one day of windows) and every per-hero report.
create index if not exists player_ledger_windows_user_idx on public.player_ledger_windows (user_id, slot, window_from);
alter table public.player_ledger_windows enable row level security;
revoke all on table public.player_ledger_windows from public, anon, authenticated, service_role;
revoke all on sequence public.player_ledger_windows_id_seq from public, anon, authenticated, service_role;
comment on table public.player_ledger_windows is
  'What hr_ledger_fold leaves of player_ledger detail older than hr_ledger_config.detail_days: one row per hero, kind, intent, hunt session, gold_kind, label set and window, proved equal to the rows it lists (ids) by hr_ledger_window_proved before they were deleted. Kept retain_days, then summed into player_ledger_rollup by hr_ledger_windows_prune.';
comment on column public.player_ledger_windows.ids      is 'Every player_ledger.id this row replaced, ascending. hr_ledger_immutable lets a ledger row inside retention go only when a window lists it here.';
comment on column public.player_ledger_windows.gold_pos is 'sum of the POSITIVE part of player_ledger.gold over the folded rows (player_ledger_rollup.gold_in when this row is pruned).';
comment on column public.player_ledger_windows.gold_neg is 'sum of the NEGATIVE part of player_ledger.gold, as a positive number (player_ledger_rollup.gold_out).';
comment on column public.player_ledger_windows.gold_in  is 'sum of player_ledger.gold_in, the day-budget column (NOT the positive part of gold: that is gold_pos).';
comment on column public.player_ledger_windows.purse    is 'player_ledger.purse of the last folded row that stated one: the account purse after this window.';
comment on column public.player_ledger_windows.meta     is 'The folded rows'' meta in their own shape: numbers summed, maps summed per key, from the earliest and to the latest, labels as they were (rows with different labels are different windows). hr_ledger_fold_model lists every key.';

create table if not exists public.hr_ledger_fold_state (
  only_row     boolean primary key default true check (only_row),
  folded_to    timestamptz,
  runs         bigint not null default 0,
  rows_folded  bigint not null default 0,
  windows      bigint not null default 0,
  rows_left    bigint not null default 0,
  last_at      timestamptz,
  last         jsonb
);
insert into public.hr_ledger_fold_state (only_row) values (true) on conflict do nothing;
alter table public.hr_ledger_fold_state enable row level security;
revoke all on table public.hr_ledger_fold_state from public, anon, authenticated, service_role;
comment on table public.hr_ledger_fold_state is
  'hr_ledger_fold''s cursor and counters. folded_to: every folded-kind row before it was folded or left as detail. Set it to NULL to read the ledger again from its start (after hr_ledger_fold_model learns a key). last: the last run''s answer; rows_left > 0 there means a writer journals a key the model lacks.';

-- ── §3 THE MODEL: WHICH ROWS FOLD, AND HOW EACH META KEY FOLDS ───────────────
-- One list. sum: a number, added. {"*": ...}: a map, each key by the rule under it. min / max: the engine's ISO instant
-- (Date.toISOString), the earliest / latest. pair: "a,b", added pairwise. first / last: a number, by id. names: an array of
-- strings, counted. label: a scalar kept as it is; rows whose labels differ fold into different windows, so no label is lost.
-- A key or a type not listed here keeps its row out of the fold. A null says nothing and is skipped.
create or replace function public.hr_ledger_fold_model(p_kind text, p_intent text)
returns jsonb language plpgsql immutable set search_path = public, pg_catalog as $$
begin
  if p_intent = 'accrue' and p_kind in ('gather', 'craft', 'combat') then
    -- supabase/functions/hr-accrue/accrual.js (the three journals), tick-gather.js foldGatherMeta, index.ts (crew), hr_apply (delta).
    return '{
      "ms": "sum", "ticks": "sum", "kills": "sum", "qty": "sum", "made": "sum", "burnt": "sum",
      "km": {"*": "sum"},
      "from": "min", "to": "max", "w": "pair", "n": "first", "left": "last",
      "mon": "label", "node": "label", "recipe": "label", "skill": "label", "src": "label", "capped": "label",
      "stopped": "label", "out_of": "label", "room_for": "label", "skipped_items": "label",
      "crew": {"ms": "sum", "qty": "sum", "workers": "label", "items": {"*": "sum"}},
      "delta": {"g": "sum", "m": "sum", "lx": "sum", "i_n": "sum", "i_sum": "sum",
                "i": {"*": "sum"}, "x": {"*": "sum"}, "st": {"*": "sum"}, "k": "names",
                "bt": {"c": "sum", "g": "sum", "mg": "label", "cr": "last"}}
    }'::jsonb;
  elsif p_kind = 'hunt' and p_intent = 'supply_own' then
    -- hr_hunt_settle_session: one row a settle, every unit used.
    return '{"side": "label", "source": "label", "reason": "label", "items": {"*": "sum"}}'::jsonb;
  elsif p_kind = 'hunt' and p_intent = 'supply_buy' then
    -- hr_hunt_apply_instance: one row a settle, the store's bill. The gold and every unit are summed; `price` is the
    -- catalogue's price at the window's last buy (a label there would split a window by WHICH supplies each settle bought).
    return '{"side": "label", "source": "label", "reason": "label", "gold": "sum",
             "items": {"*": {"qty": "sum", "price": "last"}}}'::jsonb;
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
        -- a refusal under a map names the map, not the item: one line per shape in the dry run, never one per item id
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

-- p_metas: a jsonb array of metas in id order (first and last read it).
create or replace function public.hr_ledger_meta_fold(p_model jsonb, p_metas jsonb)
returns jsonb language plpgsql immutable set search_path = public, pg_catalog as $$
declare a jsonb := '{}'::jsonb; m jsonb;
begin
  for m in select e.value from jsonb_array_elements(p_metas) with ordinality e(value, ord) order by e.ord loop
    a := public.hr_ledger_meta_merge(p_model, a, m);
  end loop;
  return a;
end $$;

-- The folded-kind rows of [p_lo, p_hi), each with its window, whether it fits the model (ok / why) and its labels.
create or replace function public.hr_ledger_fold_candidates(p_lo timestamptz, p_hi timestamptz, p_only uuid, p_width interval)
returns table (id bigint, at timestamptz, user_id uuid, slot int, kind text, intent text, session_id uuid, gold_kind text,
               gold bigint, qty bigint, xp bigint, gold_in bigint, xp_in bigint, qty_in bigint, gems_in bigint, purse bigint,
               meta jsonb, model jsonb, wf timestamptz, ok boolean, why text, labels jsonb)
language sql stable set search_path = public, pg_catalog as $$
  select c.id, c.at, c.user_id, c.slot, c.kind, c.intent, c.session_id, c.gold_kind,
         c.gold, c.qty, c.xp, c.gold_in, c.xp_in, c.qty_in, c.gems_in, c.purse, c.meta, c.model, c.wf,
         c.typed and coalesce((c.plan ->> 'ok')::boolean, false),
         case when not c.typed then 'column item_id or skill_id' else c.plan ->> 'why' end,
         c.plan -> 'labels'
    from (select l.id, l.at, l.user_id, l.slot, l.kind, l.intent, l.session_id, l.gold_kind,
                 l.gold, l.qty, l.xp, l.gold_in, l.xp_in, l.qty_in, l.gems_in, l.purse, l.meta, m.model,
                 date_bin(p_width, l.at, timestamptz '2000-01-01 00:00:00+00') as wf,
                 (l.item_id is null and l.skill_id is null) as typed,
                 public.hr_ledger_meta_plan(m.model, l.meta) as plan
            from public.player_ledger l
           cross join lateral (select public.hr_ledger_fold_model(l.kind, l.intent) as model) m
           where l.at >= coalesce(p_lo, '-infinity'::timestamptz) and l.at < p_hi
             and (p_only is null or l.user_id = p_only)
             and m.model is not null) c
$$;

-- ── §4 THE TWO LOCKS ─────────────────────────────────────────────────────────
-- (a) NO WINDOW THAT DOES NOT ACCOUNT FOR ITS ROWS. Read from player_ledger as it stands, by the ids the row lists.
create or replace function public.hr_ledger_window_proved()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
declare v_detail int; v_model jsonb; r record; v_meta jsonb; v_bad text;
begin
  select detail_days into v_detail from public.hr_ledger_config;
  if v_detail is null then
    raise exception 'player_ledger_windows: the fold tier is off (hr_ledger_config.detail_days is null)' using errcode = 'check_violation'; end if;
  v_model := public.hr_ledger_fold_model(new.kind, new.intent);
  if v_model is null then
    raise exception 'player_ledger_windows: % / % is not a folded kind', new.kind, new.intent using errcode = 'check_violation'; end if;
  if new.window_to > now() - make_interval(days => v_detail) then
    raise exception 'player_ledger_windows: a window inside the % days of detail', v_detail using errcode = 'check_violation'; end if;
  if new.ids is distinct from (select array_agg(d.x order by d.x) from (select distinct unnest(new.ids) as x) d) then
    raise exception 'player_ledger_windows: ids must be ascending and distinct' using errcode = 'check_violation'; end if;
  if exists (select 1 from public.player_ledger_windows w
              where w.user_id = new.user_id and w.slot = new.slot
                and w.window_from < new.window_to and w.window_from > new.window_from - interval '1 day'
                and w.window_to > new.window_from and w.ids && new.ids) then
    raise exception 'player_ledger_windows: another window already holds one of these rows' using errcode = 'check_violation'; end if;

  select count(*) as n,
         count(*) filter (where l.kind is distinct from new.kind or l.intent is distinct from new.intent
                             or l.session_id is distinct from new.session_id or l.gold_kind is distinct from new.gold_kind
                             or l.item_id is not null or l.skill_id is not null
                             or not coalesce((public.hr_ledger_meta_plan(v_model, l.meta) ->> 'ok')::boolean, false)) as alien,
         count(distinct public.hr_ledger_meta_plan(v_model, l.meta) -> 'labels') as label_sets,
         min(l.at) as first_at, max(l.at) as last_at,
         coalesce(sum(greatest(coalesce(l.gold, 0), 0)), 0) as gold_pos, coalesce(sum(greatest(-coalesce(l.gold, 0), 0)), 0) as gold_neg,
         coalesce(sum(greatest(coalesce(l.qty, 0), 0)), 0) as qty_pos,   coalesce(sum(greatest(-coalesce(l.qty, 0), 0)), 0) as qty_neg,
         coalesce(sum(greatest(coalesce(l.xp, 0), 0)), 0) as xp_pos,     coalesce(sum(greatest(-coalesce(l.xp, 0), 0)), 0) as xp_neg,
         coalesce(sum(coalesce(l.gold_in, 0)), 0) as gold_in, coalesce(sum(coalesce(l.xp_in, 0)), 0) as xp_in,
         coalesce(sum(coalesce(l.qty_in, 0)), 0) as qty_in,   coalesce(sum(coalesce(l.gems_in, 0)), 0) as gems_in,
         (array_agg(l.purse order by l.id desc) filter (where l.purse is not null))[1] as purse
    into r
    from public.player_ledger l
   where l.user_id = new.user_id and l.slot = new.slot
     and l.at >= new.window_from and l.at < new.window_to and l.id = any (new.ids);
  v_bad := case
    when r.n <> new.n then 'n: ' || r.n || ' of its ' || new.n || ' rows are this hero''s, in this window'
    when r.alien <> 0 then r.alien || ' row(s) of another kind, intent, session, gold_kind or shape'
    when r.label_sets <> 1 then 'rows with ' || r.label_sets || ' different label sets'
    when r.first_at <> new.first_at or r.last_at <> new.last_at then 'first_at / last_at'
    when r.gold_pos <> new.gold_pos or r.gold_neg <> new.gold_neg then 'gold'
    when r.qty_pos <> new.qty_pos or r.qty_neg <> new.qty_neg then 'qty'
    when r.xp_pos <> new.xp_pos or r.xp_neg <> new.xp_neg then 'xp'
    when r.gold_in <> new.gold_in or r.xp_in <> new.xp_in or r.qty_in <> new.qty_in or r.gems_in <> new.gems_in then 'a day-budget column'
    when r.purse is distinct from new.purse then 'purse'
  end;
  if v_bad is null then
    -- only now: every listed row fits the model, so the fold cannot meet a key it has no rule for
    select public.hr_ledger_meta_fold(v_model, jsonb_agg(l.meta order by l.id)) into v_meta
      from public.player_ledger l
     where l.user_id = new.user_id and l.slot = new.slot
       and l.at >= new.window_from and l.at < new.window_to and l.id = any (new.ids);
    if v_meta is distinct from new.meta then v_bad := 'meta'; end if;
  end if;
  if v_bad is not null then
    raise exception 'player_ledger_windows: the window does not account for its rows (%)', v_bad using errcode = 'check_violation'; end if;
  return new;
end $$;
drop trigger if exists hr_ledger_window_proved on public.player_ledger_windows;
create trigger hr_ledger_window_proved
  before insert on public.player_ledger_windows
  for each row execute function public.hr_ledger_window_proved();

-- Append-only, as the ledger is: never edited, never emptied, deleted only past retain_days (hr_ledger_windows_prune).
create or replace function public.hr_ledger_windows_immutable()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
declare v_keep int;
begin
  if tg_op = 'DELETE' then
    select retain_days into v_keep from public.hr_ledger_config;
    if old.window_to >= now() - make_interval(days => coalesce(v_keep, 90)) then
      raise exception 'player_ledger_windows row is inside the % day retention window and cannot be deleted',
        coalesce(v_keep, 90) using errcode = 'check_violation';
    end if;
    return old;
  end if;
  raise exception 'player_ledger_windows is append-only (attempted %)', tg_op
    using errcode = 'check_violation';
end $$;
drop trigger if exists hr_ledger_windows_immutable on public.player_ledger_windows;
create trigger hr_ledger_windows_immutable
  before update or delete on public.player_ledger_windows
  for each row execute function public.hr_ledger_windows_immutable();
drop trigger if exists hr_ledger_windows_no_truncate on public.player_ledger_windows;
create trigger hr_ledger_windows_no_truncate
  before truncate on public.player_ledger_windows
  for each statement execute function public.hr_ledger_windows_immutable();

-- (b) hr_ledger_immutable, RESTATED: the §0 image plus THE FOLD arm. Every other line is that image's.
create or replace function public.hr_ledger_immutable()
returns trigger language plpgsql set search_path = public as $$
declare v_keep int; v_detail int;
begin
  if tg_op = 'DELETE' then
    select retain_days, detail_days into v_keep, v_detail from public.hr_ledger_config;
    if old.at >= now() - make_interval(days => coalesce(v_keep, 90)) then
      -- THE FOLD (2027-04-27-ledger-fold.sql): past detail_days a row may go once a window lists its id. A window is only
      -- ever written proved equal to its rows (hr_ledger_window_proved), so what is deleted here is already accounted for.
      if v_detail is not null
         and old.at < now() - make_interval(days => v_detail)
         and exists (select 1 from public.player_ledger_windows w
                      where w.user_id = old.user_id and w.slot = old.slot
                        and w.window_from <= old.at and w.window_from > old.at - interval '1 day'
                        and w.window_to > old.at and old.id = any (w.ids)) then
        return old;
      end if;
      raise exception 'player_ledger row is inside the % day retention window and cannot be deleted',
        coalesce(v_keep, 90) using errcode = 'check_violation';
    end if;
    return old;
  end if;
  raise exception 'player_ledger is append-only (attempted %)', tg_op
    using errcode = 'check_violation';
end $$;

-- ── §5 THE FOLD AND THE WINDOWS' PRUNE ───────────────────────────────────────
-- Where a run starts and stops: {off} while the tier is off, {error}, or {detail_days, window_minutes, cut, lo, hi}.
-- lo is the cursor (one account's run reads that account from its first row); hi is a window boundary at or before
-- detail_days ago, so a window is folded whole or not at all, and the window the limit lands in is taken whole.
create or replace function public.hr_ledger_fold_range(p_limit int, p_only uuid, p_detail_days int)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare
  c_origin constant timestamptz := timestamptz '2000-01-01 00:00:00+00';
  v_limit  constant int := greatest(1, least(1000000, coalesce(p_limit, 20000)));
  v_cfg public.hr_ledger_config%rowtype;
  v_detail int; v_w interval; v_cut timestamptz; v_lo timestamptz; v_hi timestamptz;
begin
  select * into v_cfg from public.hr_ledger_config where only_row;
  v_detail := coalesce(p_detail_days, v_cfg.detail_days);
  if v_detail is null then return jsonb_build_object('off', true); end if;
  if v_detail < 3 or v_detail >= v_cfg.retain_days then
    return jsonb_build_object('error', 'bad_detail_days', 'min', 3, 'below', v_cfg.retain_days); end if;
  v_w := make_interval(mins => v_cfg.window_minutes);
  v_cut := date_bin(v_w, now() - make_interval(days => v_detail), c_origin);
  if p_only is null then
    select s.folded_to into v_lo from public.hr_ledger_fold_state s where s.only_row;
  end if;
  v_lo := coalesce(v_lo, '-infinity'::timestamptz);
  select date_bin(v_w, x.at, c_origin) + v_w into v_hi
    from (select l.at from public.player_ledger l
           where l.at >= v_lo and l.at < v_cut and (p_only is null or l.user_id = p_only)
             and public.hr_ledger_fold_model(l.kind, l.intent) is not null
           order by l.at, l.id offset v_limit - 1 limit 1) x;
  v_hi := greatest(least(coalesce(v_hi, v_cut), v_cut), v_lo);
  return jsonb_build_object('detail_days', v_detail, 'window_minutes', v_cfg.window_minutes, 'cut', v_cut, 'lo', v_lo, 'hi', v_hi);
end $$;

-- THE DRY RUN. What hr_ledger_fold would do with the same arguments, read and not done. STABLE: PostgreSQL itself refuses a
-- write or a row lock in it, so "changes nothing" is the function's class, not its promise; it runs in a READ ONLY transaction.
-- p_detail_days asks "what would N days fold" while the tier is off.
create or replace function public.hr_ledger_fold_plan(p_limit int default 20000, p_only uuid default null, p_detail_days int default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_t0 constant timestamptz := clock_timestamp();
  r jsonb; v_lo timestamptz; v_hi timestamptz; v_w interval;
  v_seen bigint := 0; v_ok bigint := 0; v_windows bigint := 0; v_left jsonb := '[]'::jsonb; v_by jsonb := '[]'::jsonb;
begin
  r := public.hr_ledger_fold_range(p_limit, p_only, p_detail_days);
  if r ? 'off' then return jsonb_build_object('ok', true, 'off', true, 'dry_run', true); end if;
  if r ? 'error' then return jsonb_build_object('ok', false, 'dry_run', true) || r; end if;
  v_lo := (r->>'lo')::timestamptz; v_hi := (r->>'hi')::timestamptz; v_w := make_interval(mins => (r->>'window_minutes')::int);
  if v_hi > v_lo then
    with c as materialized (select * from public.hr_ledger_fold_candidates(v_lo, v_hi, p_only, v_w)),
    g as (select c.kind, c.intent, count(*) as n from c where c.ok
           group by c.user_id, c.slot, c.kind, c.intent, c.session_id, c.gold_kind, c.wf, c.model, c.labels)
    select (select count(*) from c), (select count(*) from c where c.ok), (select count(*) from g),
           (select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'intent', x.intent, 'why', x.why, 'rows', x.n)
                                      order by x.n desc, x.kind, x.intent, x.why), '[]'::jsonb)
              from (select c.kind, c.intent, c.why, count(*) as n from c where not c.ok group by 1, 2, 3) x),
           (select coalesce(jsonb_agg(jsonb_build_object('kind', y.kind, 'intent', y.intent, 'rows', y.n, 'windows', y.w)
                                      order by y.kind, y.intent), '[]'::jsonb)
              from (select g.kind, g.intent, sum(g.n) as n, count(*) as w from g group by 1, 2) y)
      into v_seen, v_ok, v_windows, v_left, v_by;
  end if;
  return jsonb_build_object('ok', true, 'dry_run', true, 'detail_days', r->'detail_days', 'window_minutes', r->'window_minutes',
    'from', case when v_lo = '-infinity'::timestamptz then null else v_lo end, 'to', v_hi, 'cut', r->'cut',
    'more', v_hi < (r->>'cut')::timestamptz, 'seen', v_seen, 'folded', v_ok, 'windows', v_windows, 'left', v_seen - v_ok,
    'left_by', v_left, 'by', v_by, 'ms', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
end $$;

create or replace function public.hr_ledger_fold(p_limit int default 20000, p_dry_run boolean default false,
                                                 p_only uuid default null, p_detail_days int default null)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_t0 constant timestamptz := clock_timestamp();
  r jsonb; v_lo timestamptz; v_hi timestamptz; v_w interval; v_wmin timestamptz;
  v_seen bigint := 0; v_ok bigint := 0; v_windows bigint := 0; v_rows bigint := 0; v_del bigint := 0;
  v_wids bigint[] := '{}'; v_left jsonb := '[]'::jsonb; v_by jsonb := '[]'::jsonb; v_out jsonb;
begin
  if coalesce(p_dry_run, false) then return public.hr_ledger_fold_plan(p_limit, p_only, p_detail_days); end if;
  -- One fold at a time, and the cursor is read under that lock. One account's run has its own range and takes none.
  if p_only is null then
    perform 1 from public.hr_ledger_fold_state where only_row for update skip locked;
    if not found then return jsonb_build_object('ok', true, 'busy', true); end if;
  end if;
  -- A real run reads the config and nothing else: p_detail_days is the dry run's question.
  r := public.hr_ledger_fold_range(p_limit, p_only, null);
  if r ? 'off' then return jsonb_build_object('ok', true, 'off', true, 'dry_run', false); end if;
  if r ? 'error' then return jsonb_build_object('ok', false, 'dry_run', false) || r; end if;
  v_lo := (r->>'lo')::timestamptz; v_hi := (r->>'hi')::timestamptz; v_w := make_interval(mins => (r->>'window_minutes')::int);

  if v_hi > v_lo then
    -- Locked before they are read: hr_ledger_prune (skip locked) passes them by, and nothing else writes a row this old.
    perform 1 from public.player_ledger l
      where l.at >= v_lo and l.at < v_hi and (p_only is null or l.user_id = p_only)
        and public.hr_ledger_fold_model(l.kind, l.intent) is not null
      for update;
    with c as materialized (select * from public.hr_ledger_fold_candidates(v_lo, v_hi, p_only, v_w)),
    ins as (
      insert into public.player_ledger_windows
        (user_id, slot, kind, intent, session_id, gold_kind, window_from, window_to, n, ids, first_at, last_at,
         gold_pos, gold_neg, qty_pos, qty_neg, xp_pos, xp_neg, gold_in, xp_in, qty_in, gems_in, purse, meta)
      select c.user_id, c.slot, c.kind, c.intent, c.session_id, c.gold_kind, c.wf, c.wf + v_w,
             count(*)::int, array_agg(c.id order by c.id), min(c.at), max(c.at),
             coalesce(sum(greatest(coalesce(c.gold, 0), 0)), 0), coalesce(sum(greatest(-coalesce(c.gold, 0), 0)), 0),
             coalesce(sum(greatest(coalesce(c.qty, 0), 0)), 0),  coalesce(sum(greatest(-coalesce(c.qty, 0), 0)), 0),
             coalesce(sum(greatest(coalesce(c.xp, 0), 0)), 0),   coalesce(sum(greatest(-coalesce(c.xp, 0), 0)), 0),
             coalesce(sum(coalesce(c.gold_in, 0)), 0), coalesce(sum(coalesce(c.xp_in, 0)), 0),
             coalesce(sum(coalesce(c.qty_in, 0)), 0),  coalesce(sum(coalesce(c.gems_in, 0)), 0),
             (array_agg(c.purse order by c.id desc) filter (where c.purse is not null))[1],
             public.hr_ledger_meta_fold(c.model, jsonb_agg(c.meta order by c.id))
        from c where c.ok
       group by c.user_id, c.slot, c.kind, c.intent, c.session_id, c.gold_kind, c.wf, c.model, c.labels
      returning id, n, kind, intent, window_from)
    select (select count(*) from c), (select count(*) from c where c.ok),
           (select count(*) from ins), (select coalesce(sum(ins.n), 0) from ins),
           (select coalesce(array_agg(ins.id), '{}') from ins), (select min(ins.window_from) from ins),
           (select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'intent', x.intent, 'why', x.why, 'rows', x.n)
                                      order by x.n desc, x.kind, x.intent, x.why), '[]'::jsonb)
              from (select c.kind, c.intent, c.why, count(*) as n from c where not c.ok group by 1, 2, 3) x),
           (select coalesce(jsonb_agg(jsonb_build_object('kind', y.kind, 'intent', y.intent, 'rows', y.n, 'windows', y.w)
                                      order by y.kind, y.intent), '[]'::jsonb)
              from (select ins.kind, ins.intent, sum(ins.n) as n, count(*) as w from ins group by 1, 2) y)
      into v_seen, v_ok, v_windows, v_rows, v_wids, v_wmin, v_left, v_by;
    if v_rows <> v_ok then
      raise exception 'hr_ledger_fold: % rows fit the model and the windows hold % - nothing is folded', v_ok, v_rows
        using errcode = 'check_violation'; end if;
    -- THE DELETE IS DRIVEN FROM THE WINDOWS THIS CALL WROTE: only a row a proved window lists, and hr_ledger_immutable
    -- re-reads that for every row it lets go.
    delete from public.player_ledger l
     using (select w.user_id, w.slot, w.window_from, w.window_to, w.ids
              from public.player_ledger_windows w
             where w.window_from >= v_wmin and w.window_from < v_hi and w.id = any (v_wids)) w
     where (p_only is null or l.user_id = p_only)
       and l.user_id = w.user_id and l.slot = w.slot
       and l.at >= w.window_from and l.at < w.window_to and l.id = any (w.ids);
    get diagnostics v_del = row_count;
    if v_del <> v_rows then
      raise exception 'hr_ledger_fold: the windows hold % rows and % were deleted - nothing is folded', v_rows, v_del
        using errcode = 'check_violation'; end if;
  end if;

  v_out := jsonb_build_object('ok', true, 'dry_run', false, 'detail_days', r->'detail_days', 'window_minutes', r->'window_minutes',
    'from', case when v_lo = '-infinity'::timestamptz then null else v_lo end, 'to', v_hi, 'cut', r->'cut',
    'more', v_hi < (r->>'cut')::timestamptz, 'seen', v_seen, 'folded', v_rows, 'windows', v_windows, 'left', v_seen - v_ok,
    'left_by', v_left, 'by', v_by, 'ms', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  if p_only is null then
    update public.hr_ledger_fold_state s
       set folded_to = v_hi, runs = s.runs + 1, rows_folded = s.rows_folded + v_rows,
           windows = s.windows + v_windows, rows_left = s.rows_left + (v_seen - v_ok), last_at = now(), last = v_out
     where s.only_row;
  end if;
  return v_out;
end $$;

-- Windows past retain_days: into the monthly rollup, by hr_ledger_prune's own sums, then gone. A window never crosses a UTC
-- day (its CHECK), so its month is each folded row's month and fold-then-prune writes what the prune writes from detail.
create or replace function public.hr_ledger_windows_prune(p_limit int default 20000, p_only uuid default null)
returns int language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_keep int; v_cut timestamptz; v_n int;
begin
  select retain_days into v_keep from public.hr_ledger_config;
  v_cut := now() - make_interval(days => coalesce(v_keep, 90)) - interval '1 second';
  with doomed as (
    select w.id, w.window_from from public.player_ledger_windows w
     where w.window_from < v_cut and w.window_to < v_cut
       and (p_only is null or w.user_id = p_only)
     order by w.window_from, w.id
     limit greatest(1, least(100000, coalesce(p_limit, 20000)))
     for update skip locked
  ),
  rolled as (
    insert into public.player_ledger_rollup as r
      (user_id, slot, month, kind, n, gold_in, gold_out, xp_in, xp_out, qty_in, qty_out, gems_in)
      select w.user_id, w.slot, date_trunc('month', w.window_from)::date, w.kind,
             sum(w.n), sum(w.gold_pos), sum(w.gold_neg), sum(w.xp_pos), sum(w.xp_neg),
             sum(w.qty_pos), sum(w.qty_neg), sum(w.gems_in)
        from public.player_ledger_windows w join doomed d on d.id = w.id and d.window_from = w.window_from
       group by 1, 2, 3, 4
    on conflict (user_id, slot, month, kind) do update
      set n        = r.n        + excluded.n,
          gold_in  = r.gold_in  + excluded.gold_in,
          gold_out = r.gold_out + excluded.gold_out,
          xp_in    = r.xp_in    + excluded.xp_in,
          xp_out   = r.xp_out   + excluded.xp_out,
          qty_in   = r.qty_in   + excluded.qty_in,
          qty_out  = r.qty_out  + excluded.qty_out,
          gems_in  = r.gems_in  + excluded.gems_in
    returning 1
  )
  delete from public.player_ledger_windows w
   using doomed d
   where (p_only is null or w.user_id = p_only)
     and w.id = d.id and w.window_from = d.window_from;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- The jobs, in the file that makes the tables (the game_events rule: retention is scheduled where the table is born).
do $mig$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null or to_regprocedure('public.hr_cron_ensure(text,text,text)') is null then
    raise notice 'ledger-fold §5: pg_cron absent here; hr-ledger-fold and hr-ledger-windows-prune are not scheduled'; return; end if;
  perform public.hr_cron_ensure('hr-ledger-fold', '2-59/10 * * * *', 'select public.hr_ledger_fold(20000)');
  perform public.hr_cron_ensure('hr-ledger-windows-prune', '22 * * * *', 'select public.hr_ledger_windows_prune(20000)');
end $mig$;

revoke all on function public.hr_ledger_fold_model(text, text) from public, anon, authenticated, service_role;
revoke all on function public.hr_ledger_meta_plan(jsonb, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.hr_ledger_meta_merge(jsonb, jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.hr_ledger_meta_fold(jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.hr_ledger_fold_candidates(timestamptz, timestamptz, uuid, interval) from public, anon, authenticated, service_role;
revoke all on function public.hr_ledger_window_proved() from public, anon, authenticated, service_role;
revoke all on function public.hr_ledger_windows_immutable() from public, anon, authenticated, service_role;
revoke all on function public.hr_ledger_immutable() from public, anon, authenticated, service_role;
revoke all on function public.hr_ledger_fold_range(int, uuid, int) from public, anon, authenticated, service_role;
revoke all on function public.hr_ledger_fold_plan(int, uuid, int) from public, anon, authenticated, service_role;
revoke all on function public.hr_ledger_fold(int, boolean, uuid, int) from public, anon, authenticated, service_role;
revoke all on function public.hr_ledger_windows_prune(int, uuid) from public, anon, authenticated, service_role;

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- Two probe accounts no player owns. Every call is scoped to one of them (p_only), so no real row is read for folding,
-- locked or deleted here, and the bystander's rows prove the scope holds.
do $$
declare
  v_u  constant uuid := '000000c0-0000-4000-a000-00001edf01d1';
  v_b  constant uuid := '000000c0-0000-4000-a000-00001edf01d2';
  v_s  constant uuid := '000000c0-0000-4000-a000-00001edf0a01';
  v_s2 constant uuid := '000000c0-0000-4000-a000-00001edf0a02';
  v_sb constant uuid := '000000c0-0000-4000-a000-00001edf0a03';
  c_origin constant timestamptz := timestamptz '2000-01-01 00:00:00+00';
  c_fmt    constant text := 'YYYY-MM-DD"T"HH24:MI:SS".000Z"';
  -- noon UTC, ten and a hundred and twenty days back: one window, one UTC day, one month, on any date and in any time zone
  v_a   constant timestamptz := date_bin(interval '1 day', now() - interval '10 days', c_origin) + interval '12 hours';
  v_b2  constant timestamptz := v_a + interval '15 minutes';
  v_old constant timestamptz := date_bin(interval '1 day', now() - interval '120 days', c_origin) + interval '12 hours';
  v_fold bigint[]; v_fold2 bigint[]; v_r1 bigint; v_u1 bigint; v_t1 bigint; v_n1 bigint; v_n2 bigint; v_y1 bigint; v_yat timestamptz;
  v_b1 bigint; v_b2id bigint; v_b3 bigint; v_wid bigint; v_ids bigint[];
  v jsonb; v_dry jsonb; w record; rec record; v_msg text; v_got text; v_n bigint; v_gold0 numeric; v_gold1 numeric;
  v_detail0 int; v_state0 jsonb; v_fp text; v_want jsonb; v_month date;
begin
  -- (a) THE SURFACE: nothing here is reachable by a client role, the tables have no policy, every lock is armed
  if has_function_privilege('anon', 'public.hr_ledger_fold(integer,boolean,uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_ledger_fold(integer,boolean,uuid,integer)', 'execute')
     or has_function_privilege('service_role', 'public.hr_ledger_fold(integer,boolean,uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_ledger_windows_prune(integer,uuid)', 'execute')
     or has_function_privilege('service_role', 'public.hr_ledger_windows_prune(integer,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_ledger_fold_plan(integer,uuid,integer)', 'execute')
     or has_function_privilege('service_role', 'public.hr_ledger_fold_plan(integer,uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_ledger_fold_candidates(timestamptz,timestamptz,uuid,interval)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_ledger_meta_fold(jsonb,jsonb)', 'execute') then
    raise exception 'VERIFY(a): a fold function is client-executable'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) r(role),
                           unnest(array['public.player_ledger_windows', 'public.hr_ledger_fold_state']) t(tbl),
                           unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p(priv)
              where has_table_privilege(r.role, t.tbl, p.priv)) then
    raise exception 'VERIFY(a): a client role holds a privilege on player_ledger_windows or hr_ledger_fold_state'; end if;
  if (select count(*) from pg_class c where c.oid in ('public.player_ledger_windows'::regclass, 'public.hr_ledger_fold_state'::regclass)
        and c.relrowsecurity) <> 2
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('player_ledger_windows', 'hr_ledger_fold_state')) then
    raise exception 'VERIFY(a): RLS is off, or a policy opened player_ledger_windows / hr_ledger_fold_state'; end if;
  if (select count(*) from pg_trigger where not tgisinternal and tgenabled = 'O'
        and ((tgrelid = 'public.player_ledger_windows'::regclass
              and tgname in ('hr_ledger_window_proved', 'hr_ledger_windows_immutable', 'hr_ledger_windows_no_truncate'))
          or (tgrelid = 'public.player_ledger'::regclass and tgname in ('hr_ledger_immutable', 'hr_ledger_no_truncate')))) <> 5 then
    raise exception 'VERIFY(a): one of the five ledger locks is missing or disabled'; end if;
  if (select count(*) from public.hr_ledger_fold_state) <> 1 then raise exception 'VERIFY(a): hr_ledger_fold_state must hold one row'; end if;
  -- the dry run cannot write: its volatility class is what refuses, not its body
  if (select p.provolatile from pg_proc p where p.oid = 'public.hr_ledger_fold_plan(integer,uuid,integer)'::regprocedure) <> 's' then
    raise exception 'VERIFY(a): hr_ledger_fold_plan is not STABLE: a dry run that may write is not a dry run'; end if;
  if to_regclass('cron.job') is not null and (select count(*) from cron.job j
       where (j.jobname, j.schedule, j.command) in (('hr-ledger-fold', '2-59/10 * * * *', 'select public.hr_ledger_fold(20000)'),
                                                  ('hr-ledger-windows-prune', '22 * * * *', 'select public.hr_ledger_windows_prune(20000)'))) <> 2 then
    raise exception 'VERIFY(a): hr-ledger-fold or hr-ledger-windows-prune is not scheduled as this file states'; end if;
  select detail_days into v_detail0 from public.hr_ledger_config where only_row;
  select to_jsonb(s) into v_state0 from public.hr_ledger_fold_state s;

  begin
    -- ── THE PROBES ────────────────────────────────────────────────────────────
    insert into auth.users (id) values (v_u), (v_b) on conflict (id) do nothing;
    insert into public.account_wallet as aw (user_id, gold) values (v_u, 5000), (v_b, 700)
      on conflict (user_id) do update set gold = excluded.gold, version = aw.version + 1, updated_at = now();
    -- sixteen rows that fold (the first statement's purse is 5000; the second's, after a credit, 5030)
    with ins as (
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, gold_in, xp_in, qty_in, gems_in, purse, session_id, meta, at) values
      (v_u, 0, 'combat', 'accrue', 10, null, 10, 140, 2, 0, 5000, v_s, jsonb_build_object('ms', 10000, 'ticks', 5, 'kills', 2, 'mon', 'probe_ground',
         'km', jsonb_build_object('slime', 2), 'from', to_char((v_a + interval '50 seconds') at time zone 'UTC', c_fmt), 'to', to_char((v_a + interval '60 seconds') at time zone 'UTC', c_fmt),
         'delta', jsonb_build_object('g', 10, 'i', jsonb_build_object('hide', 2), 'x', jsonb_build_object('melee', 100, 'defense', 40), 'lx', 30, 'k', jsonb_build_array('accrued_to', 'hp'))),
         v_a + interval '60 seconds'),
      (v_u, 0, 'combat', 'accrue', 20, null, 20, 60, 1, 0, 5000, v_s, jsonb_build_object('ms', 10000, 'ticks', 5, 'kills', 3, 'mon', 'probe_ground',
         'km', jsonb_build_object('slime', 1, 'rat', 2), 'from', to_char((v_a + interval '110 seconds') at time zone 'UTC', c_fmt), 'to', to_char((v_a + interval '120 seconds') at time zone 'UTC', c_fmt),
         'delta', jsonb_build_object('g', 20, 'i', jsonb_build_object('hide', 1), 'x', jsonb_build_object('melee', 60), 'lx', 45, 'k', jsonb_build_array('accrued_to', 'hp', 'progress'))),
         v_a + interval '120 seconds'),
      (v_u, 0, 'combat', 'accrue', 7, null, 7, 10, 0, 0, 5000, v_s, jsonb_build_object('ms', 10000, 'ticks', 5, 'kills', 1, 'mon', 'probe_ground',
         'km', jsonb_build_object('slime', 1), 'from', to_char((v_b2 + interval '50 seconds') at time zone 'UTC', c_fmt), 'to', to_char((v_b2 + interval '60 seconds') at time zone 'UTC', c_fmt),
         'delta', jsonb_build_object('g', 7, 'x', jsonb_build_object('melee', 10), 'lx', 5, 'k', jsonb_build_array('accrued_to'))),
         v_b2 + interval '60 seconds'),
      (v_u, 0, 'hunt', 'supply_buy', -12, -6, null, null, null, null, null, v_s, jsonb_build_object('reason', 'supply_buy', 'source', 'store', 'gold', 12,
         'items', jsonb_build_object('arrow', jsonb_build_object('qty', 4, 'price', 2), 'potion', jsonb_build_object('qty', 2, 'price', 2))), v_a + interval '65 seconds'),
      (v_u, 0, 'hunt', 'supply_buy', -8, -4, null, null, null, null, null, v_s, jsonb_build_object('reason', 'supply_buy', 'source', 'store', 'gold', 8,
         'items', jsonb_build_object('arrow', jsonb_build_object('qty', 4, 'price', 2))), v_a + interval '125 seconds'),
      (v_u, 0, 'hunt', 'supply_own', 0, -3, null, null, null, null, null, v_s, jsonb_build_object('side', 'bag', 'source', 'own',
         'items', jsonb_build_object('potion', 2, 'arrow', 1)), v_a + interval '66 seconds'),
      (v_u, 0, 'hunt', 'supply_own', 0, -5, null, null, null, null, null, v_s, jsonb_build_object('side', 'bag', 'source', 'own',
         'items', jsonb_build_object('arrow', 5)), v_a + interval '126 seconds'),
      (v_u, 0, 'gather', 'accrue', 0, null, 0, 300, 12, 0, 5000, null, jsonb_build_object('ms', 90000, 'ticks', 30, 'qty', 12, 'capped', false, 'node', 'probe_node',
         'skill', 'woodcutting', 'w', '10,5', 'src', 'tick', 'from', to_char(v_a at time zone 'UTC', c_fmt), 'to', to_char((v_a + interval '90 seconds') at time zone 'UTC', c_fmt),
         'delta', jsonb_build_object('i', jsonb_build_object('oak_log', 12), 'x', jsonb_build_object('woodcutting', 300), 'k', jsonb_build_array('accrued_to'))),
         v_a + interval '90 seconds'),
      (v_u, 0, 'gather', 'accrue', 0, null, 0, 275, 12, 0, 5000, null, jsonb_build_object('ms', 90000, 'ticks', 30, 'qty', 11, 'capped', false, 'node', 'probe_node',
         'skill', 'woodcutting', 'w', '1,2', 'src', 'tick', 'from', to_char((v_a + interval '90 seconds') at time zone 'UTC', c_fmt), 'to', to_char((v_a + interval '180 seconds') at time zone 'UTC', c_fmt),
         'delta', jsonb_build_object('i', jsonb_build_object('oak_log', 11, 'bird_nest', 1), 'x', jsonb_build_object('woodcutting', 275), 'k', jsonb_build_array('accrued_to'))),
         v_a + interval '180 seconds'),
      (v_u, 0, 'gather', 'accrue', 0, null, 0, 25, 1, 0, 5000, null, jsonb_build_object('ms', 90000, 'ticks', 3, 'qty', 1, 'capped', false, 'node', 'probe_node',
         'skill', 'woodcutting', 'src', 'tick', 'stopped', 'bag_full', 'room_for', 'oak_log',
         'from', to_char((v_a + interval '180 seconds') at time zone 'UTC', c_fmt), 'to', to_char((v_a + interval '270 seconds') at time zone 'UTC', c_fmt),
         'delta', jsonb_build_object('i', jsonb_build_object('oak_log', 1), 'x', jsonb_build_object('woodcutting', 25), 'k', jsonb_build_array('accrued_to'))),
         v_a + interval '270 seconds'),
      (v_u, 0, 'craft', 'accrue', -3, null, 0, 60, 6, 0, 5000, null, jsonb_build_object('ms', 60000, 'ticks', 6, 'capped', false, 'made', 6, 'burnt', 1,
         'recipe', 'probe_recipe', 'skill', 'smithing', 'stopped', null, 'out_of', null, 'n', 20, 'left', 14,
         'from', to_char((v_a + interval '40 seconds') at time zone 'UTC', c_fmt), 'to', to_char((v_a + interval '100 seconds') at time zone 'UTC', c_fmt),
         'delta', jsonb_build_object('g', -3, 'i', jsonb_build_object('bar', 6, 'ore', -12), 'x', jsonb_build_object('smithing', 60),
                    'k', jsonb_build_array('accrued_to', 'bench_tax'), 'bt', jsonb_build_object('c', 6, 'mg', 500, 'g', 3, 'cr', 0))),
         v_a + interval '100 seconds'),
      (v_u, 0, 'combat', 'accrue', 100, null, 100, 0, 0, 0, 5000, v_s2, jsonb_build_object('ms', 10000, 'ticks', 5, 'kills', 1, 'mon', 'probe_ground',
         'km', jsonb_build_object('slime', 1), 'from', to_char((v_old + interval '50 seconds') at time zone 'UTC', c_fmt), 'to', to_char((v_old + interval '60 seconds') at time zone 'UTC', c_fmt),
         'delta', jsonb_build_object('g', 100, 'k', jsonb_build_array('accrued_to'))), v_old + interval '60 seconds'),
      (v_u, 0, 'combat', 'accrue', 50, null, 50, 0, 0, 0, 5000, v_s2, jsonb_build_object('ms', 10000, 'ticks', 5, 'kills', 2, 'mon', 'probe_ground',
         'km', jsonb_build_object('slime', 2), 'from', to_char((v_old + interval '110 seconds') at time zone 'UTC', c_fmt), 'to', to_char((v_old + interval '120 seconds') at time zone 'UTC', c_fmt),
         'delta', jsonb_build_object('g', 50, 'k', jsonb_build_array('accrued_to'))), v_old + interval '120 seconds'),
      (v_u, 0, 'hunt', 'supply_buy', -40, -4, null, null, null, null, null, v_s2, jsonb_build_object('reason', 'supply_buy', 'source', 'store', 'gold', 40,
         'items', jsonb_build_object('arrow', jsonb_build_object('qty', 4, 'price', 10))), v_old + interval '65 seconds')
      returning id)
    select array_agg(id order by id) into v_fold from ins;
    update public.account_wallet set gold = 5030, version = version + 1 where user_id = v_u;
    with ins as (
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, gold_in, xp_in, qty_in, gems_in, purse, session_id, meta, at) values
      (v_u, 0, 'combat', 'accrue', 0, null, 0, 0, 0, 0, 5030, v_s, jsonb_build_object('ms', 10000, 'ticks', 5, 'kills', 0, 'mon', 'probe_ground',
         'from', to_char((v_a + interval '170 seconds') at time zone 'UTC', c_fmt), 'to', to_char((v_a + interval '180 seconds') at time zone 'UTC', c_fmt),
         'delta', jsonb_build_object('k', jsonb_build_array('accrued_to', 'hp'))), v_a + interval '180 seconds'),
      (v_u, 0, 'craft', 'accrue', -2, null, 0, 50, 5, 0, 5030, null, jsonb_build_object('ms', 60000, 'ticks', 5, 'capped', false, 'made', 5, 'burnt', 0,
         'recipe', 'probe_recipe', 'skill', 'smithing', 'stopped', null, 'out_of', null, 'n', 14, 'left', 9,
         'from', to_char((v_a + interval '100 seconds') at time zone 'UTC', c_fmt), 'to', to_char((v_a + interval '160 seconds') at time zone 'UTC', c_fmt),
         'delta', jsonb_build_object('g', -2, 'i', jsonb_build_object('bar', 5, 'ore', -10), 'x', jsonb_build_object('smithing', 50),
                    'k', jsonb_build_array('accrued_to', 'bench_tax'), 'bt', jsonb_build_object('c', 5, 'mg', 500, 'g', 2, 'cr', 500))),
         v_a + interval '160 seconds')
      returning id)
    select array_agg(id order by id) into v_fold2 from ins;
    v_fold := v_fold || v_fold2;
    v_r1 := v_fold[1];
    -- five rows that must STAY: a key the model lacks, a typed column, a shop row, a death, and a row one day old
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, purse, session_id, meta, at)
      values (v_u, 0, 'combat', 'accrue', 0, 0, 0, 0, 0, 5030, v_s, jsonb_build_object('ms', 1, 'zz_unknown', 1), v_a + interval '200 seconds') returning id into v_u1;
    insert into public.player_ledger (user_id, slot, kind, intent, item_id, gold, gold_in, xp_in, qty_in, gems_in, purse, meta, at)
      values (v_u, 0, 'gather', 'accrue', 'probe_item', 0, 0, 0, 0, 0, 5030, '{}'::jsonb, v_a + interval '210 seconds') returning id into v_t1;
    insert into public.player_ledger (user_id, slot, kind, intent, gold, meta, at)
      values (v_u, 0, 'shop', 'shop_buy:probe', -5, '{}'::jsonb, v_a + interval '220 seconds') returning id into v_n1;
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, meta, session_id, at)
      values (v_u, 0, 'combat', 'death', 0, 0, 0, 0, jsonb_build_object('monster', 'slime'), v_s, v_a + interval '230 seconds') returning id into v_n2;
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, purse, session_id, meta, at)
      values (v_u, 0, 'combat', 'accrue', 3, 3, 0, 0, 0, 5030, v_s, jsonb_build_object('ms', 10000, 'ticks', 5, 'kills', 1, 'mon', 'probe_ground'), now() - interval '1 day')
      returning id, at into v_y1, v_yat;
    -- the bystander: two rows that would fold and one that would not, never named by a call below until (g)
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, purse, session_id, meta, at)
      values (v_b, 0, 'combat', 'accrue', 4, 4, 0, 0, 0, 700, v_sb, jsonb_build_object('ms', 10000, 'ticks', 5, 'kills', 1, 'mon', 'probe_ground',
                'km', jsonb_build_object('slime', 1), 'delta', jsonb_build_object('g', 4, 'k', jsonb_build_array('accrued_to'))), v_a + interval '60 seconds') returning id into v_b1;
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, purse, session_id, meta, at)
      values (v_b, 0, 'combat', 'accrue', 6, 6, 0, 0, 0, 700, v_sb, jsonb_build_object('ms', 10000, 'ticks', 5, 'kills', 2, 'mon', 'probe_ground',
                'km', jsonb_build_object('slime', 2), 'delta', jsonb_build_object('g', 6, 'k', jsonb_build_array('accrued_to'))), v_a + interval '120 seconds') returning id into v_b2id;
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, purse, session_id, meta, at)
      values (v_b, 0, 'combat', 'accrue', 0, 0, 0, 0, 0, 700, v_sb, jsonb_build_object('ms', 1, 'zz_unknown', 1), v_a + interval '130 seconds') returning id into v_b3;
    select coalesce(sum(gold), 0) into v_gold0 from public.player_ledger where user_id = v_u;

    -- ── (b) OFF IS OFF: with detail_days NULL nothing folds, no window can be written, and the old lock is the whole lock ──
    update public.hr_ledger_config set detail_days = null where only_row;
    v := public.hr_ledger_fold(1000, false, v_u);
    if v is distinct from jsonb_build_object('ok', true, 'off', true, 'dry_run', false) then raise exception 'VERIFY(b): the fold ran while off: %', v; end if;
    begin
      insert into public.player_ledger_windows (user_id, slot, kind, intent, session_id, window_from, window_to, n, ids, first_at, last_at, gold_pos, gold_in, purse)
        values (v_b, 0, 'combat', 'accrue', v_sb, v_a, v_b2, 2, array[v_b1, v_b2id], v_a + interval '60 seconds', v_a + interval '120 seconds', 10, 10, 700);
      raise exception 'VERIFY(b): a window was written while the fold tier is off';
    exception when check_violation then null;
    end;
    begin
      delete from public.player_ledger where id = v_r1;
      raise exception 'VERIFY(b): a ten-day-old ledger row was deletable while the fold tier is off';
    exception when check_violation then null;
    end;
    begin
      update public.hr_ledger_config set detail_days = 2 where only_row;
      raise exception 'VERIFY(b): detail_days 2 was accepted: the stall judge reads 48 hours of these rows';
    exception when check_violation then null;
    end;
    update public.hr_ledger_config set detail_days = 3, window_minutes = 15 where only_row;

    -- ── (c) A ROW WITH NO WINDOW IS REFUSED, tier on ──────────────────────────
    begin
      delete from public.player_ledger where id = v_r1;
      raise exception 'VERIFY(c): a row past detail_days with NO window was deletable';
    exception when check_violation then null;
    end;

    -- ── (d) THE DRY RUN: the real run's figures, and nothing moved ────────────
    v_dry := public.hr_ledger_fold(1000, true, v_u);
    if (v_dry->>'seen')::int <> 18 or (v_dry->>'folded')::int <> 16 or (v_dry->>'windows')::int <> 9 or (v_dry->>'left')::int <> 2
       or not (v_dry->'left_by') @> '[{"kind": "combat", "intent": "accrue", "why": "key zz_unknown", "rows": 1}]'::jsonb
       or not (v_dry->'left_by') @> '[{"kind": "gather", "intent": "accrue", "why": "column item_id or skill_id", "rows": 1}]'::jsonb then
      raise exception 'VERIFY(d): the dry run answered %', v_dry; end if;
    if (select count(*) from public.player_ledger where user_id = v_u) <> 21
       or exists (select 1 from public.player_ledger_windows where user_id in (v_u, v_b)) then
      raise exception 'VERIFY(d): the dry run moved a row'; end if;

    -- ── (e) THE FOLD ──────────────────────────────────────────────────────────
    v := public.hr_ledger_fold(1000, false, v_u);
    if (v->>'seen')::int <> 18 or (v->>'folded')::int <> 16 or (v->>'windows')::int <> 9 or (v->>'left')::int <> 2
       or v->'left_by' is distinct from v_dry->'left_by' or v->'by' is distinct from v_dry->'by' then
      raise exception 'VERIFY(e): the fold answered %, the dry run %', v, v_dry; end if;
    -- every folded row is gone, every other row stands
    if exists (select 1 from public.player_ledger where user_id = v_u and id = any (v_fold))
       or (select count(*) from public.player_ledger where user_id = v_u and id = any (array[v_u1, v_t1, v_n1, v_n2, v_y1])) <> 5
       or (select count(*) from public.player_ledger where user_id = v_u) <> 5 then
      raise exception 'VERIFY(e): the fold deleted the wrong rows'; end if;
    -- the windows list exactly the folded rows, each once
    if (select array_agg(q.x order by q.x) from (select unnest(pw.ids) as x from public.player_ledger_windows pw where pw.user_id = v_u) q)
         is distinct from (select array_agg(f.x order by f.x) from unnest(v_fold) f(x))
       or (select sum(n) from public.player_ledger_windows where user_id = v_u) <> 16 then
      raise exception 'VERIFY(e): the windows do not list exactly the folded rows'; end if;

    -- THE HUNT'S WINDOW, against figures worked by hand from the three rows above (not by the fold's own functions)
    select * into w from public.player_ledger_windows where user_id = v_u and kind = 'combat' and window_from = v_a;
    v_want := jsonb_build_object('ms', 30000, 'ticks', 15, 'kills', 5, 'mon', 'probe_ground', 'km', jsonb_build_object('slime', 3, 'rat', 2),
      'from', to_char((v_a + interval '50 seconds') at time zone 'UTC', c_fmt), 'to', to_char((v_a + interval '180 seconds') at time zone 'UTC', c_fmt),
      'delta', jsonb_build_object('g', 30, 'i', jsonb_build_object('hide', 3), 'x', jsonb_build_object('melee', 160, 'defense', 40), 'lx', 75,
                 'k', jsonb_build_object('accrued_to', 3, 'hp', 3, 'progress', 1)));
    if w.n is distinct from 3 or w.window_to <> v_b2 or w.session_id <> v_s or w.intent <> 'accrue' or w.gold_kind is null
       or w.first_at <> v_a + interval '60 seconds' or w.last_at <> v_a + interval '180 seconds'
       or (w.gold_pos, w.gold_neg, w.qty_pos, w.qty_neg, w.xp_pos, w.xp_neg, w.gold_in, w.xp_in, w.qty_in, w.gems_in) is distinct from (30, 0, 0, 0, 0, 0, 30, 200, 3, 0)
       or w.purse is distinct from 5030 or w.meta is distinct from v_want then
      raise exception 'VERIFY(e): the hunt window is %, meta wanted %', to_jsonb(w), v_want; end if;
    select * into w from public.player_ledger_windows where user_id = v_u and kind = 'combat' and window_from = v_b2;
    if w.n is distinct from 1 or (w.gold_pos, w.gold_in, w.xp_in) is distinct from (7, 7, 10) or w.purse is distinct from 5000
       or w.meta->'delta' is distinct from '{"g": 7, "x": {"melee": 10}, "lx": 5, "k": {"accrued_to": 1}}'::jsonb then
      raise exception 'VERIFY(e): the next window of the same hunt is %', to_jsonb(w); end if;
    -- THE STORE'S BILL: gold out and units to the unit, one window though the two rows bought different things
    select * into w from public.player_ledger_windows where user_id = v_u and intent = 'supply_buy' and window_from = v_a;
    if w.n is distinct from 2 or (w.gold_pos, w.gold_neg, w.qty_pos, w.qty_neg, w.gold_in) is distinct from (0, 20, 0, 10, 0) or w.purse is distinct from 5000
       or w.meta is distinct from '{"reason": "supply_buy", "source": "store", "gold": 20, "items": {"arrow": {"qty": 8, "price": 2}, "potion": {"qty": 2, "price": 2}}}'::jsonb then
      raise exception 'VERIFY(e): the store window is %', to_jsonb(w); end if;
    select * into w from public.player_ledger_windows where user_id = v_u and intent = 'supply_own';
    if w.n is distinct from 2 or (w.gold_pos, w.gold_neg, w.qty_neg) is distinct from (0, 0, 8) or w.purse is not null or w.gold_kind is not null
       or w.meta is distinct from '{"side": "bag", "source": "own", "items": {"potion": 2, "arrow": 6}}'::jsonb then
      raise exception 'VERIFY(e): the own-supplies window is %', to_jsonb(w); end if;
    -- GATHERING: the run's window, and the row that stopped on a full bag in its own (a label is never averaged away)
    select * into w from public.player_ledger_windows where user_id = v_u and kind = 'gather' and not meta ? 'stopped';
    v_want := jsonb_build_object('ms', 180000, 'ticks', 60, 'qty', 23, 'capped', false, 'node', 'probe_node', 'skill', 'woodcutting', 'w', '11,7', 'src', 'tick',
      'from', to_char(v_a at time zone 'UTC', c_fmt), 'to', to_char((v_a + interval '180 seconds') at time zone 'UTC', c_fmt),
      'delta', jsonb_build_object('i', jsonb_build_object('oak_log', 23, 'bird_nest', 1), 'x', jsonb_build_object('woodcutting', 575), 'k', jsonb_build_object('accrued_to', 2)));
    if w.n is distinct from 2 or (w.gold_pos, w.gold_neg, w.gold_in, w.xp_in, w.qty_in) is distinct from (0, 0, 0, 575, 24) or w.session_id is not null
       or w.meta is distinct from v_want then
      raise exception 'VERIFY(e): the gathering window is %, meta wanted %', to_jsonb(w), v_want; end if;
    select * into w from public.player_ledger_windows where user_id = v_u and kind = 'gather' and meta ? 'stopped';
    if w.n is distinct from 1 or w.meta->>'stopped' <> 'bag_full' or w.meta->>'room_for' <> 'oak_log' or (w.xp_in, w.qty_in) is distinct from (25, 1) then
      raise exception 'VERIFY(e): the stopped gathering row is %', to_jsonb(w); end if;
    -- THE BENCH: a tax is gold OUT, inputs are negative items, the count runs from the first row's n to the last row's left
    select * into w from public.player_ledger_windows where user_id = v_u and kind = 'craft';
    v_want := jsonb_build_object('ms', 120000, 'ticks', 11, 'capped', false, 'made', 11, 'burnt', 1, 'recipe', 'probe_recipe', 'skill', 'smithing', 'n', 20, 'left', 9,
      'from', to_char((v_a + interval '40 seconds') at time zone 'UTC', c_fmt), 'to', to_char((v_a + interval '160 seconds') at time zone 'UTC', c_fmt),
      'delta', jsonb_build_object('g', -5, 'i', jsonb_build_object('bar', 11, 'ore', -22), 'x', jsonb_build_object('smithing', 110),
                 'k', jsonb_build_object('accrued_to', 2, 'bench_tax', 2), 'bt', jsonb_build_object('c', 11, 'mg', 500, 'g', 5, 'cr', 500)));
    if w.n is distinct from 2 or (w.gold_pos, w.gold_neg, w.gold_in, w.xp_in, w.qty_in) is distinct from (0, 5, 0, 110, 11) or w.purse is distinct from 5030
       or w.meta is distinct from v_want then
      raise exception 'VERIFY(e): the bench window is %, meta wanted %', to_jsonb(w), v_want; end if;
    -- THE JOURNAL'S GOLD IS WHAT IT WAS: detail left plus the windows
    select coalesce((select sum(gold) from public.player_ledger where user_id = v_u), 0)
         + coalesce((select sum(gold_pos - gold_neg) from public.player_ledger_windows where user_id = v_u), 0) into v_gold1;
    if v_gold1 <> v_gold0 then raise exception 'VERIFY(e): the journal held % gold before the fold and % after', v_gold0, v_gold1; end if;
    -- THE SCOPE HELD: the bystander's rows stand, it has no window, and a scoped run leaves the cursor alone
    if (select count(*) from public.player_ledger where user_id = v_b) <> 3 or exists (select 1 from public.player_ledger_windows where user_id = v_b)
       or (select to_jsonb(s) from public.hr_ledger_fold_state s) is distinct from v_state0 then
      raise exception 'VERIFY(e): a call scoped to one account reached past it'; end if;

    -- ── (f) A SECOND FOLD IS A NO-OP ──────────────────────────────────────────
    select md5(string_agg(to_jsonb(x)::text, '|' order by x.id)) into v_fp from public.player_ledger_windows x where x.user_id = v_u;
    v := public.hr_ledger_fold(1000, false, v_u);
    if (v->>'folded')::int <> 0 or (v->>'windows')::int <> 0 or (v->>'left')::int <> 2
       or (select md5(string_agg(to_jsonb(x)::text, '|' order by x.id)) from public.player_ledger_windows x where x.user_id = v_u) is distinct from v_fp
       or (select count(*) from public.player_ledger where user_id = v_u) <> 5 then
      raise exception 'VERIFY(f): a second fold moved something: %', v; end if;

    -- ── (g) THE LOCKS, BY HAND ────────────────────────────────────────────────
    -- a row the fold left (no window lists it) is still refused; so is a window inside the days of detail
    begin
      delete from public.player_ledger where id = v_u1;
      raise exception 'VERIFY(g): the row the fold left behind was deletable';
    exception when check_violation then null;
    end;
    begin
      insert into public.player_ledger_windows (user_id, slot, kind, intent, session_id, window_from, window_to, n, ids, first_at, last_at, gold_pos, gold_in, purse)
        values (v_u, 0, 'combat', 'accrue', v_s, date_bin(interval '15 minutes', v_yat, c_origin), date_bin(interval '15 minutes', v_yat, c_origin) + interval '15 minutes',
                1, array[v_y1], v_yat, v_yat, 3, 3, 5030);
      raise exception 'VERIFY(g): a window was written for a row one day old';
    exception when check_violation then null;
    end;
    -- forged windows over the bystander's rows: a wrong sum, a row of another shape, another hero's row; then the true one, once
    for rec in select * from (values
        ('a wrong sum',         array[v_b1, v_b2id],        1, '%(gold)%'),
        ('a row of no shape',   array[v_b1, v_b2id, v_b3],  0, '%of another kind, intent, session, gold_kind or shape%'),
        ('another hero''s row', array[v_b1, v_b2id, v_u1],  0, '%(n: 2 of its 3 rows%'),
        ('the truth',           array[v_b1, v_b2id],        0, 'accepted'),
        ('the truth again',     array[v_b1, v_b2id],        0, '%another window already holds%')) as t(name, ids, off, want) loop
      select array_agg(i.x order by i.x) into v_ids from unnest(rec.ids) i(x);
      begin
        insert into public.player_ledger_windows (user_id, slot, kind, intent, session_id, gold_kind, window_from, window_to, n, ids, first_at, last_at,
            gold_pos, gold_in, xp_in, qty_in, purse, meta)
          select v_b, 0, 'combat', 'accrue', v_sb, max(l.gold_kind), v_a, v_b2, cardinality(v_ids), v_ids, min(l.at), max(l.at),
                 sum(l.gold) + rec.off, sum(l.gold_in), sum(l.xp_in), sum(l.qty_in), 700,
                 public.hr_ledger_meta_fold(public.hr_ledger_fold_model('combat', 'accrue'), jsonb_agg(l.meta order by l.id) filter (where l.meta ? 'kills'))
            from public.player_ledger l where l.user_id = v_b and l.id = any (v_ids);
        v_got := 'accepted';
      exception when check_violation then
        get stacked diagnostics v_msg = message_text;
        v_got := v_msg;
      end;
      if v_got not like rec.want then raise exception 'VERIFY(g): a window forged with % answered: %', rec.name, v_got; end if;
    end loop;
    -- the true window holds the two rows, so now, and only now, they may go; the third still may not
    delete from public.player_ledger where id = v_b1;
    if exists (select 1 from public.player_ledger where id = v_b1) then raise exception 'VERIFY(g): a row a proved window lists could not be deleted'; end if;
    begin
      delete from public.player_ledger where id = v_b3;
      raise exception 'VERIFY(g): a row no window lists was deletable beside one that is listed';
    exception when check_violation then null;
    end;
    -- a window is never edited and, inside retention, never deleted
    select id into v_wid from public.player_ledger_windows where user_id = v_u and kind = 'craft';
    begin
      update public.player_ledger_windows set gold_neg = gold_neg where id = v_wid;
      raise exception 'VERIFY(g): a window was updated';
    exception when check_violation then null;
    end;
    begin
      delete from public.player_ledger_windows where id = v_wid;
      raise exception 'VERIFY(g): a window inside retention was deleted';
    exception when check_violation then null;
    end;

    -- ── (h) PAST RETENTION: the windows' prune writes what hr_ledger_prune writes from detail ──
    v_month := date_trunc('month', v_old)::date;
    v_n := public.hr_ledger_windows_prune(1000, v_u);
    if v_n <> 2 then raise exception 'VERIFY(h): the prune took % windows, 2 are past retention', v_n; end if;
    if (select (r.n, r.gold_in, r.gold_out, r.xp_in, r.xp_out, r.qty_in, r.qty_out, r.gems_in) from public.player_ledger_rollup r
         where r.user_id = v_u and r.slot = 0 and r.month = v_month and r.kind = 'combat') is distinct from (2::bigint, 150::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint)
       or (select (r.n, r.gold_in, r.gold_out, r.xp_in, r.xp_out, r.qty_in, r.qty_out, r.gems_in) from public.player_ledger_rollup r
            where r.user_id = v_u and r.slot = 0 and r.month = v_month and r.kind = 'hunt') is distinct from (1::bigint, 0::bigint, 40::bigint, 0::bigint, 0::bigint, 0::bigint, 4::bigint, 0::bigint)
       or (select count(*) from public.player_ledger_rollup where user_id = v_u) <> 2 then
      raise exception 'VERIFY(h): the rollup is %', (select jsonb_agg(to_jsonb(r)) from public.player_ledger_rollup r where r.user_id = v_u); end if;
    if (select count(*) from public.player_ledger_windows where user_id = v_u) <> 7 or public.hr_ledger_windows_prune(1000, v_u) <> 0
       or (select sum(n) from public.player_ledger_rollup where user_id = v_u) <> 3 then
      raise exception 'VERIFY(h): the prune took a window inside retention, or a second prune moved the rollup'; end if;
    -- every unit of gold is still journalled, in one of the three tiers
    select coalesce((select sum(gold) from public.player_ledger where user_id = v_u), 0)
         + coalesce((select sum(gold_pos - gold_neg) from public.player_ledger_windows where user_id = v_u), 0)
         + coalesce((select sum(gold_in - gold_out) from public.player_ledger_rollup where user_id = v_u), 0) into v_gold1;
    if v_gold1 <> v_gold0 then raise exception 'VERIFY(h): the journal held % gold at the start and % across detail, windows and rollup', v_gold0, v_gold1; end if;

    raise exception using errcode = 'HR8LF', message = 'ledger-fold §6 complete - rolling back';
  exception when sqlstate 'HR8LF' then
    null;
  end;
  if exists (select 1 from public.player_ledger where user_id in (v_u, v_b))
     or exists (select 1 from public.player_ledger_windows where user_id in (v_u, v_b))
     or exists (select 1 from public.player_ledger_rollup where user_id in (v_u, v_b))
     or exists (select 1 from public.account_wallet where user_id in (v_u, v_b))
     or exists (select 1 from auth.users where id in (v_u, v_b)) then raise exception 'VERIFY(i): §6 LEAKED a probe row'; end if;
  if (select detail_days from public.hr_ledger_config where only_row) is distinct from v_detail0
     or (select to_jsonb(s) from public.hr_ledger_fold_state s) is distinct from v_state0 then
    raise exception 'VERIFY(i): §6 left the dial or the cursor moved'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'ledger-fold: off is off, a row with no window is refused, the dry run moves nothing, 16 rows fold into 9 proved windows to the unit, a second fold is a no-op, forged windows are refused, the windows roll up as the detail would; all green';
end $$;
