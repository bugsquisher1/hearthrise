-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-25-boss-daily.sql — A KEYED HALL'S BOSS PAYS HIS PRIZE ONCE A DAY PER HERO (lane/c-krell-daily, backend-architect, 2026-11-15;
--   Tyler 2026-11-14: "Krell should be a daily kill"; the designer's spec 3 of PRIORITY_BOARD "2026-11-14 The Barrow March hand play, ruled").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on its
-- passing §6. MONEY SURFACE (which drops a settle may credit): ON THE EA SECURITY LIST (§3.7).
-- ORDER: after 2027-04-24-hall-key-any-seat.sql (the section reads its hr_boss_hall_key_of; §0 refuses without it).
-- EDGE: MOVES (src/core/hunt-rewards.js payPrize, drops.js rollPrize, combat-sim.js, member.js, action-rules.js, the Hold's pack; accrual.js
--   `journal.meta.prize`, hunt-settle.js `prize_left`). EITHER ORDER IS SAFE FOR VALUE; EDGE FIRST IS THE CLEAN ONE:
--     new edge, old database: the read carries no `prize_left`, so the engine rolls no prize and sends no claim: Krell pays XP and coin and no
--       piece until this file lands. Nothing is shown that is not credited.
--     old edge, new database (this file first): the old engine still rolls his rows the shared way and sends no claim, so this file takes
--       every one of them off the window (journalled `boss_daily`, why `no_claim`): the log shows a drop the bag never gets, until the deploy.
--       No hunt freezes (nothing is refused) and no day is used up.
-- CLIENT: src/shell/windows/boss-hall-pane.js reads the `boss_halls` section (src/session/boss-quote.js hallStateOf).
--
-- ── THE RULE ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- A hall's boss pays his DROPS as the hall's DAILY PRIZE: each hero standing at his kill rolls ONCE, its own roll, and only if it has not
-- taken that boss's prize yet on the server's UTC day. A hero who took it today can still join and fight, and takes the kill's Level XP and
-- coin like everyone there. PER CHARACTER. THE SERVER'S CLOCK ONLY: the day is (now() at time zone 'utc')::date at the commit.
-- THE ROLL IS THE DAY'S, piece or no piece: what is once a day is the roll, not a lucky one.
--
-- NO NEW CATALOGUE: every fact is a generated row already. Which hunts are halls and who their boss is: hr_boss_halls. Which items are his
-- prize: hr_hunt_kill_bounds.drops of that boss, the rows the engine rolls (tools/gen-hunt-sessions.mjs hallRows REFUSES a hall whose boss
-- drops anything that is not a prize slice, so the two cannot drift; tests/boss-hall.mjs HL-GEN). An every-kill drop stands on an add.
--
-- ── A HERO'S FIRST WIN ALWAYS PAYS A PIECE (lane/c-krell-uniques, 2026-11-15; the QA audit's F21: "I beat the last boss and got 174 gold") ──
-- The first prize roll a hero ever makes on a boss is a SURE one: the engine gives the roll's empty part to the rows the data marks `first`
-- (his standard pieces; src/core/drops.js rollPrize), so a piece always lands, and every other row keeps its own odds. WHICH roll is the first
-- is the SERVER's: player_boss_loot_day.first is true on the one row a hero's first roll stamped, and that row is never pruned.
-- hr_boss_prize_first(p_user, p_slot, p_hunt) -> boolean (internal; NULL off a hall) says no such row exists yet; hr_hunt_instance_read carries
-- it as `prize_first` beside `prize_left` (the same splice), and the engine makes the sure roll only on an explicit true. The section says it
-- as `first` (this hero's first win is still ahead), and the ledger row of a stamped claim says `first` too. Nothing here is a client's word.
--
-- ── THE CONTRACT ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- player_boss_loot_day (user_id, slot, boss, day date, session_id, at)   NEW. PRIMARY KEY (user_id, slot, boss, day): the one-a-day rule IS
--   the key. A row = this hero made its prize roll on that boss on that UTC day. Written ONLY by hr_boss_prize_take (inside the settle).
--   RLS on, NO policy, no client grant: the client reads the `boss_halls` section. Goes with its character (FK cascade; character wipe list).
--   Rows older than 7 days are dropped for that hero and boss on its next roll (the ledger row below is the permanent record).
-- hr_boss_prize_left(p_user, p_slot, p_hunt) -> boolean   internal. NULL on any hunt that is no keyed hall; else whether today's is still to take.
-- hr_hunt_instance_read (ONE splice): each member carries `prize_left` (the above). The engine rolls a hero's prize only on an explicit true.
-- hr_boss_prize_take(p_user, p_slot, p_session, p_intent, p_hunt, p_delta) -> jsonb (the delta to apply)   internal.
--   THE CLAIM is the member's own word in its window's journal, `journal.meta.prize`: JSON true, said only when the engine made this hero's
--   roll in this window, beside the boss's kill in `journal.meta.km`. It stays in the window's own combat ledger row when it stands. Raises:
--     bad_prize   a claim that is not `true`; a claim on a hunt that is no hall; a claim whose window does not journal the boss's kill for
--                 this hero (journal.meta.km); each refuses the window whole, nothing written.
--     value_over  (what: prize) a claim carrying more than ONE piece: one roll lands one row at most.
--   A CLAIM stamps today's row (insert, on conflict do nothing). Stamped: the piece (if any) passes; ONE player_ledger row, kind `hunt`, intent
--     `boss_daily`, meta { reason boss_daily, hall, boss, day, took true, items }, stamped with the session like every row of the settle.
--   NOT STAMPED (today's is taken) or NO CLAIM: every prize row is taken OFF the delta before hr_apply sees it, and a claim that did not stand
--     leaves the journal with it; when a piece was removed, ONE ledger row, meta { ..., took false, dropped, why: taken_today | no_claim }.
--     Never a refusal: a hall hunt is never frozen by it.
--   A key that already landed (player_intents) is returned untouched: hr_apply replays it and writes nothing.
-- hr_hunt_apply_member (ONE splice, so the body stays one patch deep: tests/patch-chain-guard.mjs): hr_boss_prize_take runs on a hall hunt
--   (or on any window whose journal carries a claim) right before hr_apply, so every later bound, the loot filter and the tally read the delta
--   as it will be applied. The session half (hr_hunt_settle_session) is not touched and never hears of the prize.
-- hr_boss_halls_view(p_user, p_slot) -> jsonb   internal; the `boss_halls` section: { <hall_id>: { boss, taken, next_at, key, seats, left } }
--   taken    this hero made its roll on the hall's boss today          next_at  when it can next (the next UTC midnight), null when not taken
--   key      whose key an open would take (hr_boss_hall_key_of): { seat (null alone), own, name (the hero's, when not own) }, null = none
--   seats    the heroes an open marches in (the party's seats, 1 alone)   left   how many of them still have today's prize to take
--   Another account's uuid is never in it.
--
-- ── CONCURRENCY AND IDEMPOTENCY ───────────────────────────────────────────────────────────────────────────────────────────────
-- hr_hunt_apply_member holds the character lock (hr_hunt_lock) before the splice runs, and a hero is in one hunt at a time, so one hero's
-- claims are serial; the PRIMARY KEY is what holds the rule if they ever were not: two claims of one day cannot both insert. The engine's
-- read (`prize_left`) is advice for what to roll and to show; the insert at the commit is the decision. A day that turns between the read
-- and the commit: the row is the COMMIT's day (a kill at 23:59:59 committed at 00:00:01 uses the new day's roll; the hero had not used the
-- old day's, or the engine would not have rolled). A hero whose read said "taken" rolls nothing and sends no claim, so no day is ever
-- stamped without a roll. Replay: the settle's key (p_intent) that already landed skips the whole step and hr_apply answers `replayed`.
--
-- ── EXPLOIT SURFACE DELTA ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Closes: a hall boss's rows credited more than once a day to one hero (before: every kill, by the shared roll). Opens: nothing a client can
-- call (no new verb; every new function is internal, the table has no policy). The edge can at most claim what the row allows: one stamp a
-- hero, boss and day, one piece on it, only beside the boss's journalled kill, and the piece is still held to his kill bound like any drop.
-- A forged or buggy proposal naming prize rows without a claim loses them; it cannot gain one.
--
-- ── COST (100x players) ───────────────────────────────────────────────────────────────────────────────────────────────────────
-- player_boss_loot_day: at most 8 rows a hero and boss (7 days kept); 400 heroes x 1 boss = 3,200 rows, about 300 KB with its index.
-- player_ledger: ONE row a hero a day it kills him (never per tick, never per kill of anything else).
-- Per settle of a hall member: one probe of hr_boss_halls and one of the day table in the read; one probe each of hr_boss_halls,
-- player_intents and hr_hunt_kill_bounds at the commit. Per settle of ANY OTHER hunt: one text comparison (right(hunt_id, 5)) in the read
-- and one at the commit. Per envelope: one scan of hr_boss_halls (one row today), one party probe, and for a hero in a party at most four
-- probes each of the day table, player_inventory and player_item_rules.
--
-- REVERSIBILITY: re-apply hr_hunt_apply_member from 2027-04-24-bench-resume.sql and hr_hunt_instance_read from 2027-04-23-session-modes.sql
-- (§0 pins both images); drop the section row, hr_boss_halls_view, hr_boss_prize_take, hr_boss_prize_left and the table. No value to undo:
-- a piece already credited stays (it was a legal drop before this file too). No begin/commit (CLAUDE.md §2).
-- IDEMPOTENT: a second apply finds the table, both spliced bodies' marker, restates the three new bodies byte for byte and §6 rolls back its probes.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regclass('public.hr_boss_halls') is null or to_regclass('public.hr_hunt_kill_bounds') is null or to_regclass('public.hr_state_sections') is null
     or to_regclass('public.player_state') is null or to_regclass('public.player_intents') is null or to_regclass('public.player_ledger') is null then
    raise exception 'PRECONDITION: hr_boss_halls, hr_hunt_kill_bounds, hr_state_sections, player_state, player_intents and player_ledger first'; end if;
  if to_regprocedure('public.hr_boss_hall_key_of(uuid,uuid,integer,text)') is null then
    raise exception 'PRECONDITION: apply 2027-04-24-hall-key-any-seat.sql first (hr_boss_hall_key_of)'; end if;
  if to_regprocedure('public.hr_reject(text,jsonb)') is null or to_regprocedure('public.hr_hunt_party_of(uuid,integer)') is null
     or to_regprocedure('public.hr_character_name(uuid,integer)') is null or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing'; end if;
  -- Each body this file splices is exactly the image it was written against (production's after v0.2.134: bench-resume's 034d0bcb, session-modes'
  -- 158da9ba, equal to the replay's), or this file's own (a second apply): md5 of pg_get_functiondef with every run of whitespace one space.
  for v_r in select * from (values
    ('public.hr_hunt_instance_read(uuid,integer)', '158da9ba7d6a68295ba69ef346d77e27', '57256e05303f02ffff4227bbeab17556'),
    ('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', '034d0bcb1a3ad843d30917afb5ae7fe9', 'a25c708f695ae342e772fa583138d64f')) t(fn, pre, post) loop
    v_md5 := md5(regexp_replace(pg_get_functiondef(v_r.fn::regprocedure), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither its live pre-image (%) nor this file''s image (%): md5 % - another file moved it', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE DAY TABLE ─────────────────────────────────────────────────────────
create table if not exists public.player_boss_loot_day (
  user_id    uuid not null,
  slot       int  not null,
  boss       text not null check (boss ~ '^[a-z0-9_]{1,64}$'),
  day        date not null,
  session_id uuid,
  at         timestamptz not null default now(),
  first      boolean not null default false,   -- this row is the hero's FIRST roll on this boss, ever: kept for good (never pruned)
  primary key (user_id, slot, boss, day),
  constraint player_boss_loot_day_char_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
alter table public.player_boss_loot_day enable row level security;
revoke all on public.player_boss_loot_day from public, anon, authenticated, service_role;
comment on table public.player_boss_loot_day is
  '2027-04-25-boss-daily.sql: a row = this hero made its daily prize roll on that keyed-hall boss on that UTC day (the server''s clock). The primary key is the once-a-day rule. Written only by hr_boss_prize_take inside the hunt settle; 7 days kept. RLS on, no policy, no client grant: read through the boss_halls section.';

-- ── §2 THE READ: IS TODAY'S STILL TO TAKE ────────────────────────────────────
create or replace function public.hr_boss_prize_left(p_user uuid, p_slot int, p_hunt text)
returns boolean language plpgsql stable set search_path = public, pg_catalog as $$
declare v_boss text;
begin
  -- BOSS-DAILY (2027-04-25-boss-daily.sql): NULL on any hunt that is no keyed hall (a hall's room is its ground's id and _hall, the
  -- catalogue's own CHECK, so every other hunt costs one comparison); else whether this hero has today's prize of the hall's boss to take.
  if p_hunt is null or right(p_hunt, 5) <> '_hall' then return null; end if;
  select h.monster_id into v_boss from public.hr_boss_halls h where h.hunt_id = p_hunt;
  if not found then return null; end if;
  return not exists (select 1 from public.player_boss_loot_day d
                      where d.user_id = p_user and d.slot = p_slot and d.boss = v_boss and d.day = (now() at time zone 'utc')::date);
end $$;
revoke execute on function public.hr_boss_prize_left(uuid, int, text) from public, anon, authenticated, service_role;

create or replace function public.hr_boss_prize_first(p_user uuid, p_slot int, p_hunt text)
returns boolean language plpgsql stable set search_path = public, pg_catalog as $$
declare v_boss text;
begin
  -- BOSS-DAILY, THE FIRST WIN: NULL on any hunt that is no keyed hall; else whether this hero has NEVER made a prize roll on the hall's boss
  -- (no row marked `first`: that row is kept for good), so the roll the engine is about to make is the sure one.
  if p_hunt is null or right(p_hunt, 5) <> '_hall' then return null; end if;
  select h.monster_id into v_boss from public.hr_boss_halls h where h.hunt_id = p_hunt;
  if not found then return null; end if;
  return not exists (select 1 from public.player_boss_loot_day d where d.user_id = p_user and d.slot = p_slot and d.boss = v_boss and d.first);
end $$;
revoke execute on function public.hr_boss_prize_first(uuid, int, text) from public, anon, authenticated, service_role;

-- ── §3 THE ENGINE'S READ (hr_hunt_instance_read, one splice beside the live event's; a second apply finds the marker) ─
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_instance_read(uuid,integer)'::regprocedure), chr(13), '');
  if strpos(v_def, 'BOSS-DAILY') = 0 then
    v_old := $a$                 'live_xp', public.hr_live_xp_windows(h.user_id, v_i.hunt_id, v_i.settled_to, now() + interval '1 hour'),
$a$;
    v_new := v_old || $a$                 -- BOSS-DAILY (2027-04-25-boss-daily.sql): in a keyed hall, whether this hero's daily prize is still to take today
                 -- (hr_boss_prize_left: no player_boss_loot_day row of today's); null on every other hunt. The engine rolls only on true.
                 'prize_left', public.hr_boss_prize_left(h.user_id, h.slot, v_i.hunt_id),
                 -- ...and whether that roll is this hero's FIRST on the boss, ever (hr_boss_prize_first): the engine makes it a sure one.
                 'prize_first', public.hr_boss_prize_first(h.user_id, h.slot, v_i.hunt_id),
$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_instance_read: the BOSS-DAILY anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- ── §4 THE COMMIT: STAMP THE DAY, OR TAKE THE PRIZE OFF THE WINDOW ───────────
create or replace function public.hr_boss_prize_take(p_user uuid, p_slot int, p_session uuid, p_intent uuid, p_hunt text, p_delta jsonb)
returns jsonb language plpgsql set search_path = public, pg_catalog as $$
declare
  c_keep constant int := 7;   -- days of rows kept a hero and boss (the ledger row is the permanent record)
  v_hall text; v_boss text; v_rows jsonb; v_items jsonb; v_got jsonb; v_n bigint; v_km bigint; v_day date; v_ins int;
  v_prize jsonb := p_delta #> '{journal,meta,prize}'; v_claim boolean; v_first boolean;
begin
  -- BOSS-DAILY (2027-04-25-boss-daily.sql): a keyed hall's boss pays his drops once a day per hero. See the file's header for the contract.
  select h.hall_id, h.monster_id into v_hall, v_boss from public.hr_boss_halls h where h.hunt_id = p_hunt;
  if not found then
    if v_prize is not null then perform public.hr_reject('bad_prize', jsonb_build_object('why', 'no_hall', 'hunt', p_hunt)); end if;
    return p_delta;
  end if;
  -- THE CLAIM: journal.meta.prize, JSON true or absent, and nothing else.
  if v_prize is not null and v_prize is distinct from 'true'::jsonb then
    perform public.hr_reject('bad_prize', jsonb_build_object('why', 'shape')); end if;
  v_claim := v_prize is not null;
  -- A KEY THAT ALREADY LANDED: hr_apply replays it and writes nothing; its day and its piece went in with its first landing.
  if exists (select 1 from public.player_intents i where i.user_id = p_user and i.intent_id = p_intent) then return p_delta; end if;
  -- HIS PRIZE ROWS: his own drops, as his kill bound holds them (generated from src/data: the rows the engine rolls).
  select coalesce(b.drops, '{}'::jsonb) into v_rows from public.hr_hunt_kill_bounds b where b.monster_id = v_boss;
  v_rows := coalesce(v_rows, '{}'::jsonb);
  v_items := case when jsonb_typeof(p_delta->'items') = 'object' then p_delta->'items' else '{}'::jsonb end;
  -- what this window carries of them (a prize row is only ever credited: a positive number)
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb), coalesce(sum((e.value #>> '{}')::numeric), 0)::bigint into v_got, v_n
    from jsonb_each(v_items) e
   where v_rows ? e.key and jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric > 0;
  v_day := (now() at time zone 'utc')::date;
  if v_claim then
    -- THE CLAIM'S PROOF: this hero stood at the boss's kill, journalled in this same window (journal.meta.km, the ledger's kills by monster).
    v_km := case when jsonb_typeof(p_delta #> array['journal', 'meta', 'km', v_boss]) = 'number'
                 then (p_delta #>> array['journal', 'meta', 'km', v_boss])::numeric::bigint else 0 end;
    if v_km < 1 then perform public.hr_reject('bad_prize', jsonb_build_object('why', 'no_kill', 'boss', v_boss)); end if;
    -- THE FIRST ROLL EVER on this boss is marked, and its row kept for good (the hero's lock serialises its claims).
    v_first := not exists (select 1 from public.player_boss_loot_day d where d.user_id = p_user and d.slot = p_slot and d.boss = v_boss and d.first);
    insert into public.player_boss_loot_day (user_id, slot, boss, day, session_id, first) values (p_user, p_slot, v_boss, v_day, p_session, v_first)
      on conflict (user_id, slot, boss, day) do nothing;
    get diagnostics v_ins = row_count;
    if v_ins = 1 then
      -- ONE ROLL LANDS ONE ROW AT MOST.
      if v_n > 1 then perform public.hr_reject('value_over', jsonb_build_object('what', 'prize', 'boss', v_boss, 'units', v_n)); end if;
      delete from public.player_boss_loot_day d where d.user_id = p_user and d.slot = p_slot and d.boss = v_boss and d.day < v_day - c_keep and not d.first;
      insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
        values (p_user, p_slot, 'hunt', 'boss_daily',
                jsonb_build_object('reason', 'boss_daily', 'hall', v_hall, 'boss', v_boss, 'day', v_day, 'took', true, 'first', v_first, 'items', v_got), p_session);
      return p_delta;
    end if;
    -- TODAY'S IS TAKEN: the claim did not stand, so the window's own ledger row does not say it did.
    p_delta := p_delta #- '{journal,meta,prize}';
  end if;
  -- NO CLAIM (the engine made no roll for this hero), OR TODAY'S IS TAKEN: no prize row passes. Taken off, never refused.
  if v_n > 0 then
    v_items := v_items - array(select jsonb_object_keys(v_got));
    p_delta := case when v_items = '{}'::jsonb then p_delta - 'items' else jsonb_set(p_delta, '{items}', v_items) end;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
      values (p_user, p_slot, 'hunt', 'boss_daily',
              jsonb_build_object('reason', 'boss_daily', 'hall', v_hall, 'boss', v_boss, 'day', v_day, 'took', false, 'dropped', v_got,
                                 'why', case when v_claim then 'taken_today' else 'no_claim' end), p_session);
  end if;
  return p_delta;
end $$;
revoke execute on function public.hr_boss_prize_take(uuid, int, uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;

-- hr_hunt_apply_member, ONE splice (a second apply finds the marker): the body stays one patch deep (tests/patch-chain-guard.mjs).
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'BOSS-DAILY') = 0 then
    -- the day is stamped, or the prize taken off the window, right before hr_apply: every later bound reads the delta as applied.
    v_old := $a$  -- (3) THE VALUE HALF: hr_apply, every row it writes stamped with the session.
$a$;
    v_new := $a$  -- BOSS-DAILY (2027-04-25-boss-daily.sql): A KEYED HALL'S BOSS PAYS HIS DROPS ONCE A DAY PER HERO. The window's claim (its journal's
  -- `prize`, said only when the engine made this hero's roll) stamps today's row or finds it taken (hr_boss_prize_take): a prize row passes
  -- only on a fresh stamp, one piece at most, beside the boss's journalled kill; otherwise it is taken off the delta here, before hr_apply
  -- writes a thing. Any other hunt costs this one comparison (a hall's room is its ground's id and _hall) and one key test of its journal.
  if right(v_s.hunt_id, 5) = '_hall' or coalesce(p_delta #> '{journal,meta}', '{}'::jsonb) ? 'prize' then
    p_delta := public.hr_boss_prize_take(p_user, p_slot, p_session, p_intent, v_s.hunt_id, p_delta);
  end if;

$a$ || v_old;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_apply_member: the value-half anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- ── §5 THE SECTION ───────────────────────────────────────────────────────────
create or replace function public.hr_boss_halls_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare
  v_out jsonb := '{}'::jsonb; v_h record; v_party uuid; v_day date := (now() at time zone 'utc')::date;
  v_taken boolean; v_key jsonb; v_seats int; v_left int; v_own boolean;
begin
  -- BOSS-DAILY (2027-04-25-boss-daily.sql): every open keyed hall as this hero's page shows its door. See the file's header for the keys.
  v_party := public.hr_hunt_party_of(p_user, p_slot);
  for v_h in select h.hall_id, h.monster_id, h.key_item from public.hr_boss_halls h order by h.hall_id loop
    v_taken := exists (select 1 from public.player_boss_loot_day d
                        where d.user_id = p_user and d.slot = p_slot and d.boss = v_h.monster_id and d.day = v_day);
    if v_party is null then
      v_seats := 1; v_left := case when v_taken then 0 else 1 end;
    else
      select count(*)::int,
             count(*) filter (where not exists (select 1 from public.player_boss_loot_day d
                                                 where d.user_id = m.user_id and d.slot = m.slot and d.boss = v_h.monster_id and d.day = v_day))::int
        into v_seats, v_left
        from public.hunt_party_members m where m.party_id = v_party;
    end if;
    -- WHOSE KEY AN OPEN WOULD TAKE: the verb's own rule (hr_boss_hall_key_of), never another account's uuid.
    v_key := public.hr_boss_hall_key_of(v_party, p_user, p_slot, v_h.key_item);
    v_own := v_key is not null and (v_key->>'user')::uuid = p_user and (v_key->>'slot')::int = p_slot;
    v_out := v_out || jsonb_build_object(v_h.hall_id, jsonb_build_object(
      'boss', v_h.monster_id,
      'taken', v_taken,
      -- this hero's first win here is still ahead: its roll will be the sure one
      'first', not exists (select 1 from public.player_boss_loot_day d where d.user_id = p_user and d.slot = p_slot and d.boss = v_h.monster_id and d.first),
      'next_at', case when v_taken then ((v_day + 1)::timestamp at time zone 'utc') end,
      'key', case when v_key is null then null
                  else jsonb_build_object('seat', v_key->'seat', 'own', v_own,
                                          'name', case when v_own then null else public.hr_character_name((v_key->>'user')::uuid, (v_key->>'slot')::int) end) end,
      'seats', v_seats,
      'left', v_left));
  end loop;
  return v_out;
end $$;
revoke execute on function public.hr_boss_halls_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('boss_halls', 'hr_boss_halls_view', '2027-04-25-boss-daily.sql: each open keyed hall as this hero''s page shows its door: { <hall_id>: { boss, taken (this hero made today''s prize roll), next_at (the next UTC midnight when taken), key ({ seat, own, name } of the key an open would take, or null), seats, left (seats with today''s prize still to take) } }')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- The probe hall is 2027-04-20-boss-hall.sql §6's: the Mill Cellar's ground catalogue rows copied to mill_cellar_hall, opened by a Goblin Totem,
-- its boss the Cellar's first spawn, his prize that monster's own first drop row (his kill bound's).
do $$
declare
  c_a constant uuid := '000000da-0000-4000-a000-00007f0c0c01';
  c_room constant text := 'mill_cellar_hall';
  c_key constant text := 'goblin_totem';
  k   constant text := '000000da-0000-4000-b000-0000';
  v jsonb; v_s text; v_boss text; v_item text; v_sid uuid; v_d jsonb; v_c jsonb; v_out jsonb; v_today date := (now() at time zone 'utc')::date;
  v_err text;
begin
  -- (a) the shape: the table is the server's alone, no function here is a client's, the section and both spliced bodies are in, hygiene STRICT is green.
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.player_boss_loot_day'::regclass) then
    raise exception 'boss-daily §6(a): player_boss_loot_day has no row level security'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'player_boss_loot_day') then
    raise exception 'boss-daily §6(a): player_boss_loot_day grew a policy: it is written by the settle only and read through its section'; end if;
  foreach v_s in array array['select', 'insert', 'update', 'delete'] loop
    if has_table_privilege('authenticated', 'public.player_boss_loot_day', v_s) or has_table_privilege('anon', 'public.player_boss_loot_day', v_s) then
      raise exception 'boss-daily §6(a): a client role can % player_boss_loot_day', v_s; end if;
  end loop;
  foreach v_s in array array['public.hr_boss_prize_left(uuid,integer,text)', 'public.hr_boss_prize_first(uuid,integer,text)', 'public.hr_boss_prize_take(uuid,integer,uuid,uuid,text,jsonb)',
                             'public.hr_boss_halls_view(uuid,integer)', 'public.hr_hunt_instance_read(uuid,integer)',
                             'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'] loop
    if has_function_privilege('authenticated', v_s, 'execute') or has_function_privilege('anon', v_s, 'execute') then
      raise exception 'boss-daily §6(a): a client can execute %', v_s; end if;
  end loop;
  if not exists (select 1 from public.hr_state_sections where key = 'boss_halls' and fn = 'hr_boss_halls_view') then
    raise exception 'boss-daily §6(a): the boss_halls section is not registered'; end if;
  if strpos((select prosrc from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure), '''prize_left'', public.hr_boss_prize_left(') = 0 then
    raise exception 'boss-daily §6(a): the engine''s read carries no prize_left'; end if;
  if strpos((select prosrc from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure), '''prize_first'', public.hr_boss_prize_first(') = 0 then
    raise exception 'boss-daily §6(a): the engine''s read carries no prize_first'; end if;
  if public.hr_boss_prize_first('00000000-0000-4000-8000-000000000000'::uuid, 0, 'mill_cellar') is not null then
    raise exception 'boss-daily §6(a): a ground that is no hall has a first win'; end if;
  if strpos((select prosrc from pg_proc where oid = 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure), 'p_delta := public.hr_boss_prize_take(') = 0 then
    raise exception 'boss-daily §6(a): the commit has no prize step'; end if;
  -- the prize step stands BEFORE hr_apply, so nothing is written for a prize the day refuses
  if strpos((select prosrc from pg_proc where oid = 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure), 'p_delta := public.hr_boss_prize_take(')
     > strpos((select prosrc from pg_proc where oid = 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure), 'v_a := public.hr_apply(p_user, p_slot, v_ver, p_intent, p_delta);') then
    raise exception 'boss-daily §6(a): the prize step runs after hr_apply'; end if;
  perform public.hr_assert_grant_hygiene(true);
  -- every other hunt: no read, no step
  if public.hr_boss_prize_left('00000000-0000-4000-8000-000000000000'::uuid, 0, 'mill_cellar') is not null then
    raise exception 'boss-daily §6(a): a ground that is no hall has a prize to take'; end if;

  begin
    update public.hr_hunt_config set enabled = true where id;
    foreach v_s in array array['hr_hunts', 'hr_hunt_travel', 'hr_hunt_grounds', 'hr_hunt_ground_spawns', 'hr_ground_tiers'] loop
      continue when to_regclass('public.' || v_s) is null;
      execute format('insert into public.%1$I select (jsonb_populate_record(null::public.%1$I, to_jsonb(r) || jsonb_build_object(''hunt_id'', %2$L)'
                     || ' || case when to_jsonb(r) ? ''ground_id'' then jsonb_build_object(''ground_id'', %2$L) else ''{}''::jsonb end)).* from public.%1$I r where r.hunt_id = ''mill_cellar''',
                     v_s, c_room);
    end loop;
    select s.monster_id into v_boss from public.hr_hunt_ground_spawns s
      join public.hr_hunt_kill_bounds b on b.monster_id = s.monster_id and b.drops <> '{}'::jsonb
     where s.hunt_id = c_room order by s.monster_id limit 1;
    select kk into v_item from public.hr_hunt_kill_bounds b, jsonb_object_keys(b.drops) kk where b.monster_id = v_boss order by kk limit 1;
    if v_boss is null or v_item is null then raise exception 'boss-daily §6-harness: the probe hall has no boss with a drop row'; end if;
    insert into public.hr_boss_halls (hall_id, hunt_id, monster_id, key_item, limit_ms) values ('mill_cellar', c_room, v_boss, c_key, 600000);
    insert into auth.users (id) values (c_a) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_a, 'boss-daily §6 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'boss-daily §6-harness: hr_create_character refused: %', v; end if;
    delete from public.hr_rate_counters where user_id = c_a;
    perform set_config('request.jwt.claim.sub', '', true);
    insert into public.player_inventory (user_id, slot, item_id, qty) values (c_a, 0, c_key, 1) on conflict (user_id, slot, item_id) do update set qty = 1;

    -- (b) THE SECTION before anything: not taken, no next, this hero's own key, one seat with the prize to take.
    v := public.hr_state_of(c_a, 0)->'boss_halls'->'mill_cellar';
    if v is null or v->>'boss' is distinct from v_boss or v->>'taken' <> 'false' or jsonb_typeof(v->'next_at') <> 'null'
       or v->'key'->>'own' <> 'true' or (v->>'seats')::int <> 1 or (v->>'left')::int <> 1 then
      raise exception 'boss-daily §6(b): the section reads %', v; end if;
    if v->>'first' is distinct from 'true' then raise exception 'boss-daily §6(b): a hero who never rolled reads first %', v->'first'; end if;
    if (v->'key') ? 'user' or v::text like '%' || c_a::text || '%' then raise exception 'boss-daily §6(b): the section carries an account id: %', v; end if;

    -- (c) IN THE HALL the engine's read says today's is to take.
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_boss_hall_enter(0, 'mill_cellar', (k || '00000e01')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'boss-daily §6(c): the enter answered %', v; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    select h.id into v_sid from public.hunt_sessions h where h.user_id = c_a and h.slot = 0 and h.ended_at is null;
    if (public.hr_hunt_instance_read(c_a, 0)->'members'->0->>'prize_left') is distinct from 'true' then
      raise exception 'boss-daily §6(c): the engine reads prize_left %', public.hr_hunt_instance_read(c_a, 0)->'members'->0->'prize_left'; end if;
    if (public.hr_hunt_instance_read(c_a, 0)->'members'->0->>'prize_first') is distinct from 'true' then
      raise exception 'boss-daily §6(c): a hero who never rolled reads prize_first %', public.hr_hunt_instance_read(c_a, 0)->'members'->0->'prize_first'; end if;

    -- (d) ★ THE REFUSALS, each whole: a claim that is no `true`, a claim with no kill of the boss beside it, a claim on a ground that is no
    --     hall, a claim carrying two pieces. None stamps a day or writes a row.
    v_d := jsonb_build_object('items', jsonb_build_object(v_item, 1, 'bones', 2),
                              'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue', 'meta', jsonb_build_object('kills', 1, 'km', jsonb_build_object(v_boss, 1))));
    -- v_d: the window names the prize and makes NO claim. v_c: the same window with the claim in its journal (journal.meta.prize true).
    v_c := jsonb_set(v_d, '{journal,meta,prize}', 'true'::jsonb);
    begin v_out := public.hr_boss_prize_take(c_a, 0, v_sid, (k || '00000e02')::uuid, c_room, jsonb_set(v_d, '{journal,meta,prize}', '1'::jsonb)); v_err := 'no error';
    exception when sqlstate 'HR000' then v_err := sqlerrm; end;
    if v_err <> 'bad_prize' then raise exception 'boss-daily §6(d): a claim of 1 answered %', v_err; end if;
    begin v_out := public.hr_boss_prize_take(c_a, 0, v_sid, (k || '00000e02')::uuid, c_room, v_c #- '{journal,meta,km}'); v_err := 'no error';
    exception when sqlstate 'HR000' then v_err := sqlerrm; end;
    if v_err <> 'bad_prize' then raise exception 'boss-daily §6(d): a claim with no kill answered %', v_err; end if;
    begin v_out := public.hr_boss_prize_take(c_a, 0, v_sid, (k || '00000e02')::uuid, 'mill_cellar', v_c); v_err := 'no error';
    exception when sqlstate 'HR000' then v_err := sqlerrm; end;
    if v_err <> 'bad_prize' then raise exception 'boss-daily §6(d): a claim on a ground that is no hall answered %', v_err; end if;
    begin v_out := public.hr_boss_prize_take(c_a, 0, v_sid, (k || '00000e02')::uuid, c_room, jsonb_set(v_c, array['items', v_item], '2'::jsonb)); v_err := 'no error';
    exception when sqlstate 'HR000' then v_err := sqlerrm; end;
    if v_err <> 'value_over' then raise exception 'boss-daily §6(d): a claim of two pieces answered %', v_err; end if;
    if exists (select 1 from public.player_boss_loot_day where user_id = c_a) or exists (select 1 from public.player_ledger where user_id = c_a and intent = 'boss_daily') then
      raise exception 'boss-daily §6(d): a refused claim wrote something'; end if;
    -- a ground that is no hall, no claim: the delta untouched, nothing read
    if public.hr_boss_prize_take(c_a, 0, v_sid, (k || '00000e02')::uuid, 'mill_cellar', v_d) is distinct from v_d then
      raise exception 'boss-daily §6(d): a ground that is no hall had its delta moved'; end if;

    -- (e) ★ NO CLAIM, NO PRIZE: a window naming a prize row without the claim loses that row and only that row; one ledger row says why; no day.
    v_out := public.hr_boss_prize_take(c_a, 0, v_sid, (k || '00000e03')::uuid, c_room, v_d);
    if v_out->'items' is distinct from jsonb_build_object('bones', 2) or v_out - 'items' is distinct from v_d - 'items' then
      raise exception 'boss-daily §6(e): an unclaimed prize left the delta as %', v_out; end if;
    if exists (select 1 from public.player_boss_loot_day where user_id = c_a)
       or (select count(*) from public.player_ledger where user_id = c_a and kind = 'hunt' and intent = 'boss_daily' and meta->>'took' = 'false'
            and meta->>'why' = 'no_claim' and meta->'dropped' = jsonb_build_object(v_item, 1) and session_id = v_sid) <> 1 then
      raise exception 'boss-daily §6(e): an unclaimed prize was not journalled once, or stamped a day'; end if;

    -- (f) ★ THE CLAIM: today's row is stamped, the piece passes untouched, ONE ledger row; the engine's read and the section turn.
    v_out := public.hr_boss_prize_take(c_a, 0, v_sid, (k || '00000e04')::uuid, c_room, v_c);
    if v_out is distinct from v_c then raise exception 'boss-daily §6(f): a fresh claim moved the delta: %', v_out; end if;
    if (select count(*) from public.player_boss_loot_day where user_id = c_a and slot = 0 and boss = v_boss and day = v_today and session_id = v_sid) <> 1
       or (select count(*) from public.player_ledger where user_id = c_a and kind = 'hunt' and intent = 'boss_daily' and meta->>'took' = 'true'
            and meta->'items' = jsonb_build_object(v_item, 1) and meta->>'boss' = v_boss and session_id = v_sid) <> 1 then
      raise exception 'boss-daily §6(f): the claim did not stamp one day and journal one row'; end if;
    if (public.hr_hunt_instance_read(c_a, 0)->'members'->0->>'prize_left') is distinct from 'false' then
      raise exception 'boss-daily §6(f): after the claim the engine still reads prize_left %', public.hr_hunt_instance_read(c_a, 0)->'members'->0->'prize_left'; end if;
    v := public.hr_state_of(c_a, 0)->'boss_halls'->'mill_cellar';
    if v->>'taken' <> 'true' or (v->>'left')::int <> 0
       or (v->>'next_at')::timestamptz is distinct from ((v_today + 1)::timestamp at time zone 'utc') then
      raise exception 'boss-daily §6(f): after the claim the section reads %', v; end if;
    -- ★ THE FIRST ROLL IS MARKED, ONCE: its row and its ledger row say first, and from here the read and the section say it is behind this hero.
    if (select count(*) from public.player_boss_loot_day where user_id = c_a and first) <> 1
       or (select count(*) from public.player_ledger where user_id = c_a and intent = 'boss_daily' and meta->>'took' = 'true' and meta->>'first' = 'true') <> 1
       or (public.hr_hunt_instance_read(c_a, 0)->'members'->0->>'prize_first') is distinct from 'false' or v->>'first' is distinct from 'false' then
      raise exception 'boss-daily §6(f): the first roll was not marked once, or is still ahead: section %, read %', v, public.hr_hunt_instance_read(c_a, 0)->'members'->0->'prize_first'; end if;

    -- (g) ★ ONCE A DAY: a second claim the same day stamps nothing and loses its piece (the bones stay); a claim with no piece writes nothing more.
    v_out := public.hr_boss_prize_take(c_a, 0, v_sid, (k || '00000e05')::uuid, c_room, v_c);
    if v_out->'items' is distinct from jsonb_build_object('bones', 2) then raise exception 'boss-daily §6(g): a second claim kept %', v_out->'items'; end if;
    -- a claim that did not stand leaves the window's journal with its piece: the combat ledger row never says a roll the day refused
    if v_out #> '{journal,meta,prize}' is not null or v_out #> '{journal,meta}' is distinct from v_d #> '{journal,meta}' then
      raise exception 'boss-daily §6(g): a refused claim stayed in the journal: %', v_out->'journal'; end if;
    v_out := public.hr_boss_prize_take(c_a, 0, v_sid, (k || '00000e06')::uuid, c_room, v_c #- array['items', v_item]);
    if v_out is distinct from v_d #- array['items', v_item] then raise exception 'boss-daily §6(g): a second claim with no piece left %', v_out; end if;
    if (select count(*) from public.player_boss_loot_day where user_id = c_a) <> 1
       or (select count(*) from public.player_ledger where user_id = c_a and intent = 'boss_daily' and meta->>'why' = 'taken_today') <> 1
       or (select count(*) from public.player_ledger where user_id = c_a and intent = 'boss_daily') <> 3 then
      raise exception 'boss-daily §6(g): the second claims wrote % day rows and % ledger rows', (select count(*) from public.player_boss_loot_day where user_id = c_a),
        (select count(*) from public.player_ledger where user_id = c_a and intent = 'boss_daily'); end if;

    -- (h) ★ THE DAY ROLLS OVER on the server's clock: yesterday's row is no bar today; the next claim stamps today's; an old row is dropped.
    update public.player_boss_loot_day set day = v_today - 1 where user_id = c_a;
    insert into public.player_boss_loot_day (user_id, slot, boss, day) values (c_a, 0, v_boss, v_today - 30);
    if (public.hr_hunt_instance_read(c_a, 0)->'members'->0->>'prize_left') is distinct from 'true' then
      raise exception 'boss-daily §6(h): yesterday''s roll still bars today''s'; end if;
    v_out := public.hr_boss_prize_take(c_a, 0, v_sid, (k || '00000e07')::uuid, c_room, v_c);
    if v_out is distinct from v_c or (select array_agg(day order by day) from public.player_boss_loot_day where user_id = c_a) is distinct from array[v_today - 1, v_today] then
      raise exception 'boss-daily §6(h): the next day''s claim left days %', (select array_agg(day order by day) from public.player_boss_loot_day where user_id = c_a); end if;
    -- ★ THE SECOND DAY'S ROLL IS NO FIRST, AND THE FIRST ROW OUTLIVES THE 7 DAYS: a month on, the next claim prunes the plain old row and keeps it.
    if (select count(*) from public.player_boss_loot_day where user_id = c_a and first) <> 1 or (select first from public.player_boss_loot_day where user_id = c_a and day = v_today)
       or (select count(*) from public.player_ledger where user_id = c_a and intent = 'boss_daily' and meta->>'first' = 'true') <> 1 then
      raise exception 'boss-daily §6(h): a later roll was marked first'; end if;
    update public.player_boss_loot_day set day = v_today - 40 where user_id = c_a and first;
    update public.player_boss_loot_day set day = v_today - 20 where user_id = c_a and day = v_today;
    v_out := public.hr_boss_prize_take(c_a, 0, v_sid, (k || '00000e09')::uuid, c_room, v_c);
    if (select array_agg(day order by day) from public.player_boss_loot_day where user_id = c_a) is distinct from array[v_today - 40, v_today]
       or (public.hr_hunt_instance_read(c_a, 0)->'members'->0->>'prize_first') is distinct from 'false' then
      raise exception 'boss-daily §6(h): a month on the days read % (the first row is kept, the plain old one pruned)', (select array_agg(day order by day) from public.player_boss_loot_day where user_id = c_a); end if;

    -- (i) A KEY THAT ALREADY LANDED is returned untouched (hr_apply replays it): nothing stamped, nothing journalled, nothing taken off.
    delete from public.player_boss_loot_day where user_id = c_a;
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at) values (c_a, (k || '00000e08')::uuid, 0, 'accrue', '{"ok":true}'::jsonb, now());
    v_out := public.hr_boss_prize_take(c_a, 0, v_sid, (k || '00000e08')::uuid, c_room, v_c);
    if v_out is distinct from v_c or exists (select 1 from public.player_boss_loot_day where user_id = c_a)
       or (select count(*) from public.player_ledger where user_id = c_a and intent = 'boss_daily') <> 5 then
      raise exception 'boss-daily §6(i): a landed key was judged again'; end if;
    perform public.hr_hunt_close(h.id, 'boss_felled', now(), true) from public.hunt_sessions h where h.user_id = c_a and h.ended_at is null;
    raise exception using errcode = 'HRL24', message = 'boss-daily §6 complete - rolling back';
  exception when sqlstate 'HRL24' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from auth.users where id = c_a) or exists (select 1 from public.hr_boss_halls where hunt_id = c_room)
     or exists (select 1 from public.player_boss_loot_day where user_id = c_a) or exists (select 1 from public.player_ledger where user_id = c_a) then
    raise exception 'boss-daily §6: LEAKED a probe row'; end if;
  raise notice 'boss-daily: one prize roll a hero, boss and server day; no claim, no prize; the day rolls over; all green';
end $$;
