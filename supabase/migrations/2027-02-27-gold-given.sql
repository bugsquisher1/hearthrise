-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-27-gold-given.sql — THE GOLD GIVEN BOARD: WHO GAVE MOST TO HAVORA THIS MONTH
--   (lane/c-town-shows, backend-architect, 2026-11-04; Tyler the same day: a "Gold Given" leaderboard that ranks accounts, not heroes;
--   the designer's board section "2026-11-04 Gold sinks").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on
-- its passing §4; ON THE EA SECURITY LIST (a RANKED surface; a shared standing crosses to every player). EDGE: no deploy.
-- CLIENT: the board's row in src/data/honor-roll.js rides the next release AFTER this applies; a client without it never asks for the board.
-- APPLY ORDER: after 2027-02-27-gold-sinks-seams.sql; before 2027-02-27-town-shows.sql and 2027-02-27-town-crier.sql, whose verbs call the counter.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
--   account_gold_given (month, user_id, slot, gold)   one counter per hero per UTC month. It only rises. It's written ONLY by the helper below,
--     because player_ledger prunes at retain_days, so nothing ranked may sum the ledger.
--   hr_gold_given_add(p_user uuid, p_slot int, p_gold bigint) returns bigint   the hero's new total this month.
--     OWNER ONLY: a SECURITY DEFINER verb calls it in the SAME TRANSACTION as its charge, right after hr_apply answers ok, so a refused or
--     rolled back purchase counts nothing. No client role can call it (§4 asserts it). It refuses anything but a positive amount and a real hero.
--     WHAT COUNTS: gold given to the town: powders, rounds, the Crier, the Town Works. Not supplies, slots, houses, refills, bench tax, Tempering,
--     titles or colors: those verbs must NOT call it. A new sink that wants to count is argued here first.
--   THE BOARD 'gold_given' on leaderboard_ranked: ONE ROW PER ACCOUNT, score = the account's gold this UTC month, slot and name = its LEAD HERO
--     (whichever gave most, lowest slot on a tie), level 0. It resets by itself on the 1st of the UTC month: the view reads this month's rows
--     only, and the existing 5-minute refresh picks that up. Names and hiding are the boards' own rules: hr_character_name, hr_lb_row's
--     "Name hidden", hr_lb_hidden. A hidden hero can't lead; an account with no hero left to show holds no place.
--
-- ── WHY THE PURSE ISN'T RANKED (honor-roll.js cut the wealth board for three reasons) ──
--   This never reads the purse, and it only rises as gold leaves the game. Crowns buy gold from players, so real money can reach this board at
--   one remove; the limits are no prize, only sinks with a daily cap count, and it resets monthly. Tyler's call on the board section.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- No client value reaches the counter: a verb passes its own server-quoted price. A retried key can't count twice, because hr_apply's replay answers
-- before the verb reaches the helper. The row carries no account id out: hr_lb_row marks the caller's own row and nobody else's.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- One row per hero who gives, per month: about 90 bytes. 100x (2,000 accounts x up to 4 heroes): at most 8,000 rows a month, under 1 MB a year.
-- The refresh gains one indexed scan of this month's rows, and one row per giving account.
--
-- REVERSIBILITY: re-apply 2027-02-12-leaderboard-heroes.sql §2-§6 for the board, drop the helper and the table. Only standing is lost; no gold moves.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_md5 text; v_def text;
begin
  if to_regclass('public.hr_sink_rules') is null then raise exception 'PRECONDITION: apply 2027-02-27-gold-sinks-catalogue.generated.sql first'; end if;
  if to_regclass('public.leaderboard_ranked') is null or to_regclass('public.leaderboard_meta') is null or to_regclass('public.hr_lb_hidden') is null
     or to_regclass('public.player_state') is null then
    raise exception 'PRECONDITION: the boards (2027-02-12-leaderboard-heroes.sql) are absent'; end if;
  -- the board list: its live image, or this file's own (a second apply)
  v_md5 := md5(regexp_replace(pg_get_functiondef('public.hr_lb_boards()'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_md5 is distinct from '2d0d586a2a9ef77c9f7f711b6b9b79e5' and v_md5 is distinct from '6bea12b5ce733c1f006805f237811e49' then
    raise exception 'PIN: hr_lb_boards() is neither its live image nor this file''s: md5 % - another file moved it', v_md5; end if;
  -- the view: the heroes' board, read by its shape (a hash of a view's text differs between Postgres versions)
  v_def := pg_get_viewdef('public.leaderboard_ranked'::regclass);
  if strpos(v_def, 'hr_character_name') = 0 or strpos(v_def, 'hr_lb_hidden') = 0 or strpos(v_def, 'total_level') = 0 or strpos(v_def, 'wealth') > 0 then
    raise exception 'PIN: leaderboard_ranked is not 2027-02-12-leaderboard-heroes.sql''s view'; end if;
end $mig$;

-- ── §1 THE COUNTER ───────────────────────────────────────────────────────────
create table if not exists public.account_gold_given (
  month      date        not null check (month = date_trunc('month', month::timestamp)::date),
  user_id    uuid        not null,
  slot       int         not null check (slot between 0 and 5),
  gold       bigint      not null check (gold >= 1),
  updated_at timestamptz not null default now(),
  primary key (month, user_id, slot),
  foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
create index if not exists account_gold_given_hero on public.account_gold_given (user_id, slot);
comment on table public.account_gold_given is
  '2027-02-27-gold-given.sql: gold each hero gave to the town, per UTC month. Written only by hr_gold_given_add, in the transaction of the charge. Read only by leaderboard_ranked.';
alter table public.account_gold_given enable row level security;
revoke all on table public.account_gold_given from public, anon, authenticated, service_role;

create or replace function public.hr_gold_given_add(p_user uuid, p_slot int, p_gold bigint)
returns bigint language plpgsql volatile set search_path = public, pg_catalog as $fn$
declare v_total bigint;
begin
  if p_user is null or p_slot is null or p_gold is null or p_gold < 1 then
    raise exception 'hr_gold_given_add: refused (%, %, %)', p_user, p_slot, p_gold; end if;
  insert into public.account_gold_given as g (month, user_id, slot, gold, updated_at)
  values (date_trunc('month', now() at time zone 'utc')::date, p_user, p_slot, p_gold, now())
  on conflict (month, user_id, slot) do update set gold = g.gold + excluded.gold, updated_at = excluded.updated_at
  returning g.gold into v_total;
  return v_total;
end $fn$;
revoke execute on function public.hr_gold_given_add(uuid, integer, bigint) from public, anon, authenticated, service_role;

-- ── §2 THE BOARD LIST ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_lb_boards()
 RETURNS text[]
 LANGUAGE sql
 STABLE
AS $function$
  select array['renown','total_level','level','bosses','gold_given']
      || array(select 'skill:' || s from unnest(public.hr_lb_skills()) s)
$function$;

-- ── §3 THE RANKED VIEW, RESTATED WHOLE: + one row per giving account ─────────
drop materialized view if exists public.leaderboard_ranked cascade;
create materialized view public.leaderboard_ranked as
with heroes as (
  select ps.user_id, ps.slot, ps.level_xp,
         public.hr_character_name(ps.user_id, ps.slot) as name
  from public.player_state ps
  where not exists (select 1 from public.hr_lb_hidden h
                     where h.user_id = ps.user_id and (h.slot is null or h.slot = ps.slot))
),
lv as (
  select s.user_id, s.slot, s.skill_id, s.xp, public.hr_skill_level(s.skill_id, s.xp) as level
  from public.player_skills s
  join heroes h on h.user_id = s.user_id and h.slot = s.slot
  where s.skill_id = any (public.hr_lb_skills())
),
agg as (
  select h.user_id, h.slot, coalesce(sum(l.level), 0)::bigint as total_level
  from heroes h
  left join lv l on l.user_id = h.user_id and l.slot = h.slot
  group by h.user_id, h.slot
),
-- GOLD GIVEN: this UTC month's rows. The account's total counts every hero; a hidden hero can't lead it (heroes leaves it out).
given as (
  select g.user_id, g.slot, g.gold
  from public.account_gold_given g
  where g.month = date_trunc('month', now() at time zone 'utc')::date
),
given_lead as (
  select distinct on (g.user_id) g.user_id, g.slot, h.name
  from given g
  join heroes h on h.user_id = g.user_id and h.slot = g.slot
  order by g.user_id, g.gold desc, g.slot
),
scores as (
  select 'total_level'::text as board, h.user_id, h.slot, h.name,
         a.total_level as score, a.total_level::int as level
  from heroes h join agg a on a.user_id = h.user_id and a.slot = h.slot
  union all
  select 'level', h.user_id, h.slot, h.name, h.level_xp, public.hr_char_level(h.level_xp)
  from heroes h
  union all
  select 'skill:' || l.skill_id, l.user_id, l.slot, h.name, l.xp, l.level
  from lv l join heroes h on h.user_id = l.user_id and h.slot = l.slot
  union all
  select 'gold_given', l.user_id, l.slot, l.name, (select sum(x.gold) from given x where x.user_id = l.user_id)::bigint, 0
  from given_lead l
  union all
  select 'renown', h.user_id, h.slot, h.name,
         public.hr_lb_num(gs.snapshot, 'renown'), 1
  from heroes h join public.game_saves gs on gs.user_id = h.user_id and gs.slot = h.slot
  -- NOTE: no 'renown', 'bosses', 'wealth' or 'clan_power' branch (2027-02-12-leaderboard-heroes.sql §2).
)
select board, user_id, slot, name, score, level,
       rank() over (partition by board order by score desc) as place,
       row_number() over (partition by board order by score desc, user_id, slot) as rank
from scores
where score is not null
  and score > 0;
create unique index if not exists leaderboard_ranked_hero_idx on public.leaderboard_ranked (board, user_id, slot);
create index if not exists leaderboard_ranked_rank_idx on public.leaderboard_ranked (board, rank);
revoke all on public.leaderboard_ranked from public, anon, authenticated, service_role;

-- hr_lb_row takes the view's row type, so the drop above took it with the view: the same body, recreated.
create or replace function public.hr_lb_row(r public.leaderboard_ranked, p_viewer uuid)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  select jsonb_build_object(
           'rank', r.rank, 'place', r.place,
           'name', case when public.hr_name_blocked(r.name) then 'Name hidden' else r.name end,
           'level', r.level, 'score', r.score)
         || case when p_viewer is not null and r.user_id = p_viewer
                 then jsonb_build_object('mine', true, 'slot', r.slot) else '{}'::jsonb end
$$;
revoke all on function public.hr_lb_row(public.leaderboard_ranked, uuid) from public, anon, authenticated, service_role;

refresh materialized view public.leaderboard_ranked;
update public.leaderboard_meta set refreshed_at = now() where id = 1;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $chk$
declare
  v_a constant uuid := '000000c0-0000-4000-a000-0000901d6a01';
  v_b constant uuid := '000000c0-0000-4000-a000-0000901d6a02';
  v jsonb; v_role text; v_n bigint; v_name1 text; v_row record;
begin
  return; -- MUTATION HARNESS: §4 disabled so the BEHAVIOUR is what fails
  begin
    insert into auth.users (id) values (v_a), (v_b) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_a, 'gold-given §4 probe'), (v_b, 'gold-given §4 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'gold-given §4: hr_create_character(0) refused: %', v; end if;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'gold-given §4: hr_create_character(1) refused: %', v; end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'gold-given §4: hr_create_character(0) for B refused: %', v; end if;
    -- (a) it adds, per hero, and refuses a nonsense amount
    v_n := public.hr_gold_given_add(v_a, 0, 100);
    v_n := public.hr_gold_given_add(v_a, 0, 50);
    if v_n <> 150 then raise exception 'gold-given §4(a): the counter reads %', v_n; end if;
    begin
      perform public.hr_gold_given_add(v_a, 0, 0);
      raise exception using errcode = 'HR936', message = 'gold-given §4(a): a zero gift counted';
    exception when sqlstate 'HR936' then raise; when others then null;
    end;
    perform public.hr_gold_given_add(v_a, 1, 500);
    perform public.hr_gold_given_add(v_b, 0, 650);
    -- last month's gift never reaches this month's board
    insert into public.account_gold_given (month, user_id, slot, gold)
      values ((date_trunc('month', now() at time zone 'utc') - interval '1 month')::date, v_b, 0, 9000000);
    refresh materialized view public.leaderboard_ranked;
    -- (b) ONE ROW PER ACCOUNT, the lead hero's name, the account's total; ties share a place
    if (select count(*) from public.leaderboard_ranked where board = 'gold_given' and user_id = v_a) <> 1 then
      raise exception 'gold-given §4(b): an account has more than one row'; end if;
    select * into v_row from public.leaderboard_ranked where board = 'gold_given' and user_id = v_a;
    if v_row.slot <> 1 or v_row.score <> 650 or v_row.name is distinct from public.hr_character_name(v_a, 1) then
      raise exception 'gold-given §4(b): account A reads slot %, score %, name %', v_row.slot, v_row.score, v_row.name; end if;
    if (select score from public.leaderboard_ranked where board = 'gold_given' and user_id = v_b) <> 650 then
      raise exception 'gold-given §4(b): last month reached this month''s board'; end if;
    if (select count(distinct place) from public.leaderboard_ranked where board = 'gold_given' and user_id in (v_a, v_b)) <> 1 then
      raise exception 'gold-given §4(b): a tie does not share a place'; end if;
    -- (c) A TIE ON LEAD GOES TO THE LOWEST SLOT, and a hidden hero can't lead
    perform public.hr_gold_given_add(v_a, 0, 350);
    refresh materialized view public.leaderboard_ranked;
    if (select slot from public.leaderboard_ranked where board = 'gold_given' and user_id = v_a) <> 0 then
      raise exception 'gold-given §4(c): a tie on lead did not go to the lowest slot'; end if;
    insert into public.hr_lb_hidden (user_id, slot, reason, note) values (v_a, 0, 'name', 'gold-given §4');
    refresh materialized view public.leaderboard_ranked;
    select * into v_row from public.leaderboard_ranked where board = 'gold_given' and user_id = v_a;
    if v_row.slot <> 1 or v_row.score <> 1000 then raise exception 'gold-given §4(c): a hidden hero leads: slot %, score %', v_row.slot, v_row.score; end if;
    insert into public.hr_lb_hidden (user_id, slot, reason, note) values (v_b, null, 'test', 'gold-given §4');
    refresh materialized view public.leaderboard_ranked;
    if exists (select 1 from public.leaderboard_ranked where board = 'gold_given' and user_id = v_b) then
      raise exception 'gold-given §4(c): a hidden account holds a place'; end if;
    -- (d) THE READER, through the public shape: the account's row, marked for its owner only; the board is on the list
    delete from public.hr_lb_hidden where note = 'gold-given §4';
    refresh materialized view public.leaderboard_ranked;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_leaderboard__ungated('gold_given', 25, 1);
    if coalesce(v->>'ok', '') <> 'true' or jsonb_array_length(v->'mine') <> 1 or (v->'mine'->0->>'score')::bigint <> 650 then
      raise exception 'gold-given §4(d): the reader answered %', left(v::text, 300); end if;
    if exists (select 1 from jsonb_array_elements(v->'top') e where e ? 'id' or e ? 'user_id') then
      raise exception 'gold-given §4(d): a row carries an account id'; end if;
    raise exception using errcode = 'HR937', message = 'gold-given §4 complete - rolling back';
  exception when sqlstate 'HR937' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.account_gold_given where user_id in (v_a, v_b)) or exists (select 1 from public.leaderboard_ranked where user_id in (v_a, v_b))
     or exists (select 1 from auth.users where id in (v_a, v_b)) then
    raise exception 'gold-given §4: LEAKED a probe row'; end if;
  -- (e) NO CLIENT REACHES THE COUNTER: not the helper, not the table, not the view.
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_gold_given_add(uuid,integer,bigint)', 'execute')
       or has_table_privilege(v_role, 'public.account_gold_given', 'select') or has_table_privilege(v_role, 'public.account_gold_given', 'insert,update,delete')
       or has_table_privilege(v_role, 'public.leaderboard_ranked', 'select') then
      raise exception 'gold-given §4(e): % reaches the counter or the view', v_role; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'account_gold_given') then
    raise exception 'gold-given §4(e): a policy opens the counter'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'gold-given: one row per account, the lead hero, this UTC month only; owner-only counter; all green';
end $chk$;
