-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-24-boss-call-series.sql — CALL OUT, A SERIES: N FIGHTS IN A ROW, EACH PAID IN STAMINA AND A SMALL FEE, DROPS ON A WIN
--   (lane/c-boss-call-b, backend-architect, 2026-11-15; Tyler 2026-11-14 "BOSS CALL = option B with your adjustments": a slider to fight the
--   called boss N times in a row, idle, on the one engine; each fight costs stamina (less than walking the route) plus a small gold fee; no
--   daily cap (stamina is the limit); pays ONLY the boss's drops, no XP, coin or trash loot; drops only on a win. It supersedes the 3-a-day
--   cap and the no-stamina framing. The designer's numbers and words: src/data/boss-calls.js; the spec: PRIORITY_BOARD "Boss call drops".)
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on
-- its passing §6. MONEY SURFACE (a gold sink, a stamina sink and a drop source): ON THE EA SECURITY LIST (§3.7).
-- ORDER: LAST of three. 2027-04-23-boss-call-drops-items-catalogue.generated.sql (the two call-only pieces), then
--   2027-04-23-boss-call-drops-hunt-sessions-catalogue.generated.sql (the called bosses' kill bounds carry their tables; hr_boss_calls gains
--   fight_fee, fight_stamina_ms, max_fights and loses fee and per_day), then THIS FILE, at once: between the catalogue and this file the old
--   quote names a column that is gone, so Call out answers an error and charges nothing. §0 refuses without both catalogues.
--   EDGE: the hr-accrue carrying src/data/boss-calls.js `dropsLive: true` and src/core/combat-sim.js (a called room proposes no stamina)
--   deploys RIGHT AFTER this file. Before it: an old engine's win carries no item and still lands; its window's stamina number is ignored
--   (§3), never refused. After it and before this file: every win would be refused `called_pays`, so this file goes first.
--   CLIENT: the old client's press names the four-argument verb, which is gone, so its Call out answers "not found" and charges nothing
--   until the release that ships src/shell/windows/boss-call-pane.js's slider (it rides the next release, after the edge).
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- WHO DECIDES WHAT. The engine plays ONE fight: his kill ends it `boss_felled`, a death or the limit ends it (src/core/combat-sim.js,
--   unchanged). THE SERVER OWNS THE SERIES: how many fights, which one this is, what each costs, whether the next may start. The engine
--   never counts a fight and no number of the series crosses from the edge or the client but N itself, which is only bounded here.
-- hunt_sessions gains, on a called room's session only (CHECK hunt_sessions_call_ck): call_fights (N, 1..1000), call_fight (the fight in
--   progress = the fights charged so far, 1..N), call_won (0..call_fight: A WIN IS ALWAYS A PAID FIGHT'S, held by the CHECK itself, whatever
--   writes the row), call_fee and call_stamina_ms (one fight's price as the SERVER quoted it at the press, kept for the whole series),
--   fight_from (the instant the fight in progress began). No client write policy; written only by hr_boss_call and hr_boss_call_step.
-- hr_boss_call_quote(user, slot, call) RESTATED: { call, available, why, who, price (one fight's fee for this hero: hr_boss_calls.fight_fee x
--   the account's live fee dial, rounded up), fight_fee, fee_pm, event, fight_stamina_ms, max_fights, limit_ms, stamina_ms (this hero's pool
--   now), covers (the fights the room's stamina and gold pay for right now, at most max_fights), heroes (this account's heroes in the room),
--   seats, alone, totals { fee: [n fights' gold for this account, n = 1..max_fights], stamina_ms: [n fights' stamina a hero] } }. The pane
--   renders every number from it and sums nothing. `why`, in order: call_leader (in a party and not its leader), call_stamina (this hero's
--   pool is under one fight's), insufficient_gold (the purse is under this account's first fight), party_stamina / party_gold (another
--   seat can't pay the first fight; `who` is that hero's name from the server's own row). No daily cap: `used`, `per_day`, `left` are gone.
-- hr_boss_call(p_slot, p_call, p_fights, p_price, p_idem) -> jsonb. Client verb (authenticated). The four-argument verb is DROPPED.
--   Refusals, each charging nothing and opening nothing: not_signed_in, bad_slot, bad_idem, bad_fights (N not 1..max_fights: a forged
--   count; `max_fights` the server's), bad_quote, call_unknown, intent_mismatch, rate_limited, the quote's `why` (with the quote),
--   quote_changed (p_price is not the server's price: a forged or stale fee; the quote rides the answer), every refusal of the start a
--   hunt runs (hr_hunt_party_start / hr_hunt_enter_for), hr_apply's insufficient_gold. On success EVERY SEAT pays the FIRST fight, its own
--   stamina (hr_boss_calls.fight_stamina_ms off its pool as it stands at its arrival) and its own fee (its account's dial), or nobody
--   enters: the caller's through ONE hr_apply on the caller's key (kind shop, intent boss_call:<call>:<fights>:<price>), every other
--   seat's by hr_purse_move with its own ledger row (kind shop, intent boss_call:<call>:fight). The room's sessions carry the series
--   (call_fights N, call_fight 1) and no hours limit (a series ends at its count). Answer: { ok, version, gold, fights, entered, party,
--   boss_call (the quote) }.
-- THE SETTLE (anchored splices, each marked CALL-SERIES; a second apply finds its own image):
--   hr_hunt_member_read: in a called room the engine's hunt starts with the FIGHT in progress (hunt_from_ms = fight_from), so the limit and
--     the quiet clock are a fight's and the engine needs no knowledge of the series.
--   hr_hunt_apply_instance: BEFORE any member lands, hr_boss_call_plan decides the room's next step once (the GUC hr.boss_plan, this
--     transaction only): null (no step: someone did not win, the last fight, no series), or { next, stop, at }. `next` when EVERY hero in
--     the room proposes `boss_felled` on the window's own instant, fights are left, and every hero can pay the next: its pool (the room
--     never drains or rests it) holds call_stamina_ms, and its account's purse, less this window's own store bills and the account's fees,
--     stays at or over the hero's own "Keep at least". Else `stop` names who can't: `gold_out` (ahead of `stamina`, END_ORDER). On `next`,
--     once every member has landed, the stored world is dropped and each session's record of the fight (hunt_session_tally.fight, ONE
--     fight's) is cleared: the next fight starts in a fresh room on the same instant.
--   hr_hunt_settle_session: a fight's limit is proved and owed from fight_from; a `boss_felled` in a room with a plan is HELD (not
--     closed) and answered `held`.
--   hr_hunt_apply_member: a called window's stamina is the server's alone (the pool as it stood at the window's start, stamped at its end:
--     no drain, no rest; the engine's proposal, null or an old engine's number, is ignored); the ground's kill-count item bound steps aside
--     for the room's own (hr_boss_call_pays); after the session half, hr_boss_call_step.
--   hr_boss_call_pays RESTATED: a window that carries his kill (the one counter his title reads, exactly once) may also carry `items`, each
--     an id of his kill bound at most its count, their `ev:loot:<id>` stats and `rare_drops`; every other window keeps the old allowlist.
--   hr_boss_call_step (after the session half): THE WIN IS PROVEN BOTH WAYS from the window's own kill (a `boss_felled` with no kill is
--     end_not_proven; a kill with no `boss_felled`, or `died` in the same swing, is called_pays), then counted (call_won + 1, under the
--     CHECK). A held end then follows the plan: `next` charges THIS hero the next fight (stamina, the fee, ONE ledger row kind shop, intent
--     boss_call:<call>:fight, the session named in meta) and moves the session to it (call_fight + 1, fight_from and the session clock on
--     the room's instant); otherwise the session closes here: the plan's reason for a hero who can't pay
--     (`stamina`, `gold_out`), and everyone else comes home with it (`party_member_left`: hr_hunt_view names that hero and why, so each
--     card says who ran out of what; the win itself is counted and paid all the same).
--   hr_hunt_view: a session of a series shows `call` { fights, fight, won, fee, stamina_ms, paid_gold, paid_stamina_ms }; no other hunt's
--     section gains a key.
--
-- ── CONCURRENCY AND IDEMPOTENCY ───────────────────────────────────────────────
-- hr_boss_call: the party row, then hr:boss:<uid> (only this verb takes it), then inside the start each seat's character, bag and play
--   locks; then, seat by seat in (user, slot) order, the account purses. The settle takes characters then purses: the same order, no cycle.
--   The key: hr_intent_replay first; the caller's hr_apply journals it and every other seat's charge is in the same transaction, so a
--   replay answers once and charges once, every seat or none. A purse that moved between the quote and the charge raises inside the
--   subtransaction: every seat rolls back out and nothing is charged.
-- The next fight's charge runs inside hr_hunt_apply_instance under every member's character lock and purse lock, taken first: no new
--   lock. Its idempotency is the window's (the instance's world CAS, each member's key) plus a CAS on call_fight. The plan is made under
--   those locks from rows only this transaction can move; a purse another hero of the account spent since the read answers gold_short,
--   which the edge already retries on a fresh read.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- One client verb changes shape (N added) and no grant moves. No client value prices anything: p_price is only compared with the server's
--   quote, p_fights only bounded by the catalogue. A called room still pays no XP and no coin by any route. It now pays ITEMS, only in
--   the window that carries his kill, only ids of his own kill bound at most its count; each kill must end its fight in the same settle,
--   each ended fight is either the series' last or followed by a charged one, and call_won <= call_fight is a table CHECK. So a compromised
--   engine can claim at most one table roll per PAID fight, and a paid fight costs every hero stamina whatever the engine says: stamina
--   bounds the rolls, as the ruling intends. A fee waived by a live event waives gold only. FOR THE EA REVIEW: (1) a gold fee for a fight
--   with random drops (the 11-04 gold-for-a-roll line; stamina is now the main cost); (2) `rare_drops` on a win is bounded by the kinds the
--   window carries, not by their rarity (hr_items holds none); (3) the leader's press charges every READY seat its own fee and stamina.
--
-- ── COST ─────────────────────────────────────────────────────────────────────
-- Per settle of ANY hunt: one primary-key probe of hr_boss_calls (2 rows) in hr_hunt_apply_instance and one more in hr_hunt_apply_member
-- (which already made one); nothing else. Per called settle: the plan's reads (each member's session and pool, one purse an account). Per
-- fight: one ledger row a hero (a fight is 1-10 minutes; a normal hunt journals a row a window). At 100x players, 60 heroes in series
-- at once: about 1,800 rows an hour, pruned with the ledger. No new table, no index; six nullable columns on hunt_sessions.
-- REVERSIBLE: restate the quote and the four-argument verb from 2027-04-05-call-out-alone.sql, hr_boss_call_pays from
-- 2027-03-12-boss-call.sql, re-apply the catalogue before 2027-04-23 for hr_boss_calls; the splices come out by their CALL-SERIES lines;
-- drop hr_boss_call_plan, hr_boss_call_step, the CHECK and the six columns. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_r record; v_m text;
begin
  if to_regclass('public.hr_boss_calls') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_boss_calls' and column_name = 'fight_stamina_ms')
     or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_boss_calls' and column_name in ('fee', 'per_day')) then
    raise exception 'PRECONDITION: apply 2027-04-23-boss-call-drops-hunt-sessions-catalogue.generated.sql first (hr_boss_calls: fight_fee, fight_stamina_ms, max_fights)'; end if;
  if exists (select 1 from public.hr_boss_calls c
              where not exists (select 1 from public.hr_hunt_kill_bounds b where b.monster_id = c.monster_id and b.drops <> '{}'::jsonb)
                 or exists (select 1 from public.hr_hunt_kill_bounds b, jsonb_object_keys(b.drops) k
                             where b.monster_id = c.monster_id and not exists (select 1 from public.hr_items i where i.item_id = k))) then
    raise exception 'PRECONDITION: apply both 2027-04-23-boss-call-drops catalogues first (a called boss''s kill bound carries his table, every id in hr_items)'; end if;
  if to_regprocedure('public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)') is null or to_regprocedure('public.hr_live_fee_of(uuid,text,timestamp with time zone)') is null
     or to_regprocedure('public.hr_purse_move(uuid,bigint,bigint)') is null or to_regprocedure('public.hr_purse_of(uuid)') is null
     or to_regprocedure('public.hr_stamina_of(uuid,integer,timestamp with time zone)') is null or to_regprocedure('public.hr_hunt_supply_of(uuid,integer,integer)') is null
     or to_regprocedure('public.hr_hunt_active_set(uuid,integer)') is null or to_regprocedure('public.hr_character_name(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_close(uuid,text,timestamp with time zone,boolean)') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing'; end if;
  -- Each restated body is the image this file was written against (md5 of its source, carriage returns removed) or already this file's own.
  for v_r in select * from (values
    ('hr_boss_call_quote', 'ecde8394ba99405baed5ac983c997c34'),
    ('hr_boss_call',       'd5fc3843302fdc73c1b1295d9f99223b'),
    ('hr_boss_call_pays',  '8d05b612d40f3eb36e143d0cfea941fd')) t(fn, pre) loop
    for v_m in select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
                where p.pronamespace = 'public'::regnamespace and p.proname = v_r.fn and strpos(p.prosrc, 'CALL-SERIES') = 0 loop
      if v_m is distinct from v_r.pre then
        raise exception 'PIN: % is neither its expected image (%) nor this file''s: md5 % - another file moved it', v_r.fn, v_r.pre, v_m; end if;
    end loop;
  end loop;
end $mig$;

-- ── §1 THE SERIES ON THE SESSION ─────────────────────────────────────────────
alter table public.hunt_sessions
  add column if not exists call_fights     int,
  add column if not exists call_fight      int,
  add column if not exists call_won        int,
  add column if not exists call_fee        bigint,
  add column if not exists call_stamina_ms int,
  add column if not exists fight_from      timestamptz;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'hunt_sessions_call_ck' and conrelid = 'public.hunt_sessions'::regclass) then
    -- ALL OR NONE, on a called room only, and A WIN IS ALWAYS A PAID FIGHT'S: call_won never passes call_fight, call_fight never passes call_fights.
    alter table public.hunt_sessions add constraint hunt_sessions_call_ck check (
      (call_fights is null and call_fight is null and call_won is null and call_fee is null and call_stamina_ms is null and fight_from is null)
      or (right(hunt_id, 7) = '_called' and call_fights between 1 and 1000 and call_fight between 1 and call_fights and call_won between 0 and call_fight
          and call_fee between 0 and 1000000000 and call_stamina_ms between 1000 and 3600000 and fight_from is not null));
  end if;
end $mig$;
comment on column public.hunt_sessions.call_fights is
  '2027-04-24-boss-call-series.sql: a Call out series (Tyler 2026-11-14). call_fights the count picked, call_fight the fight in progress (= the fights charged so far), call_won its wins (never more than call_fight: the CHECK), call_fee and call_stamina_ms one fight''s price as the server quoted it at the press, fight_from the fight''s start. Null on every other hunt. Written only by hr_boss_call and hr_boss_call_step.';

-- ── §2 THE MONEY LINE, THE PLAN AND THE STEP (owner-only) ────────────────────
-- WHAT A WINDOW ON A CALLED ROOM MAY SAY, and nothing else. Every window: the clock, the hero's HP, its journal row with no kill, a death and the
-- stats a death writes. THE WINDOW HIS KILL FELL IN (the one counter his title reads, exactly once) may also carry his drops: `items`, each an id of
-- his kill bound (hr_hunt_kill_bounds, the called row's own table) at most its count, the `ev:loot:<id>` stat of an item it carries at most its
-- quantity, and `rare_drops` at most the kinds it carries. An allowlist, so a new payout route is refused until someone decides it belongs here.
-- Answers the first thing it found, or null.
create or replace function public.hr_boss_call_pays(p_delta jsonb, p_monster text)
returns text language plpgsql stable set search_path = public, pg_catalog as $fn$
declare v_k text; v_op jsonb; v_win boolean; v_kills int; v_drops jsonb; v_items jsonb := '{}'::jsonb; v_kinds int := 0;
begin
  -- CALL-SERIES (2027-04-24-boss-call-series.sql): a win pays his table (Tyler 2026-11-14), and only a win.
  select count(*) into v_kills
    from jsonb_array_elements(case when jsonb_typeof(p_delta->'progress') = 'array' then p_delta->'progress' else '[]'::jsonb end) o
   where o.value->>'kind' = 'stat' and o.value->>'key' = 'ev:kill_monster:' || p_monster and o.value->>'period' = '' and o.value->>'add' = '1';
  if v_kills > 1 then return 'progress:ev:kill_monster'; end if;
  v_win := v_kills = 1;
  select k into v_k from jsonb_object_keys(p_delta) k
   where k not in ('accrued_to', 'hp', 'journal', 'progress', 'deaths') and not (v_win and k = 'items') order by 1 limit 1;
  if v_k is not null then return v_k; end if;
  if coalesce((p_delta->'journal'->'meta'->>'kills')::numeric, 0) <> 0 or (p_delta->'journal'->'meta') ? 'km' then return 'kills'; end if;
  if v_win and p_delta ? 'items' then
    if jsonb_typeof(p_delta->'items') <> 'object' then return 'items'; end if;
    v_items := p_delta->'items';
    select b.drops into v_drops from public.hr_hunt_kill_bounds b where b.monster_id = p_monster;
    select e.key into v_k from jsonb_each(v_items) e
     where jsonb_typeof(e.value) <> 'number' or (e.value #>> '{}') !~ '^[0-9]{1,6}$' or (e.value #>> '{}')::int < 1
        or (e.value #>> '{}')::int > coalesce((v_drops->>e.key)::int, 0)
     order by 1 limit 1;
    if v_k is not null then return 'item:' || left(v_k, 48); end if;
    v_kinds := (select count(*) from jsonb_object_keys(v_items))::int;
  end if;
  for v_op in select value from jsonb_array_elements(case when jsonb_typeof(p_delta->'progress') = 'array' then p_delta->'progress' else '[]'::jsonb end) loop
    continue when v_op->>'kind' = 'stat' and v_op->>'key' = 'deaths';
    continue when v_op->>'kind' = 'stat' and v_op->>'key' = 'ev:kill_monster:' || p_monster and v_op->>'period' = '' and v_op->>'add' = '1';
    continue when v_win and v_op->>'kind' = 'stat' and v_op->>'key' like 'ev:loot:%' and (v_op->>'add') ~ '^[0-9]{1,6}$'
                  and (v_op->>'add')::int between 1 and coalesce((v_items->>substr(v_op->>'key', 9))::int, 0);
    continue when v_win and v_op->>'kind' = 'stat' and v_op->>'key' = 'rare_drops' and (v_op->>'add') ~ '^[0-9]{1,6}$'
                  and (v_op->>'add')::int between 1 and v_kinds;
    return 'progress:' || coalesce(left(v_op->>'key', 48), '?');
  end loop;
  return null;
end $fn$;

-- THE ROOM'S NEXT STEP, decided ONCE for the whole room before any member lands (hr_hunt_apply_instance, under every member's character lock
-- and every account's purse lock). Null: no step (not a called room, not every hero won on the window's own instant, the last fight, no
-- series): a `boss_felled` then closes as proposed. Else { next, stop, at }: `next` when every hero can pay the next fight, `stop` naming who
-- can't ("<user>:<slot>" -> gold_out | stamina), `at` the room's instant. A hero pays when its pool (the room never drains or rests it: as it
-- stood at its window's start) holds its fight's stamina, and its account's purse, less this window's own store bills and the account's fees for
-- the next fight, stays at or over the hero's own "Keep at least". The window's own credits (loot it sold) are not counted: a purse within one
-- fee of its floor ends the series a fight early rather than a fight late.
create or replace function public.hr_boss_call_plan(p_instance uuid, p_members jsonb, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_m record; v_stop jsonb := '{}'::jsonb; v_short text; v_p bigint; v_b bigint; v_f bigint; v_floor bigint;
begin
  if not exists (select 1 from public.hunt_instances i join public.hr_boss_calls c on c.hunt_id = i.hunt_id where i.id = p_instance) then return null; end if;
  begin
    if exists (select 1 from jsonb_array_elements(p_members) e
                where e.value->'hunt'->'ended'->>'reason' is distinct from 'boss_felled'
                   or (e.value->'hunt'->'ended'->>'at')::timestamptz is distinct from p_to) then return null; end if;
  exception when others then return null;
  end;
  if exists (select 1 from jsonb_array_elements(p_members) e
              left join public.hunt_sessions h on h.id = (e.value->>'session')::uuid
              where h.id is null or h.call_fights is null or h.call_fight >= h.call_fights) then return null; end if;
  for v_m in select h.id, h.user_id, h.slot, h.preset, h.settled_to, h.call_fee, h.call_stamina_ms
               from jsonb_array_elements(p_members) e join public.hunt_sessions h on h.id = (e.value->>'session')::uuid
              order by h.user_id, h.slot loop
    v_short := null;
    if public.hr_stamina_of(v_m.user_id, v_m.slot, v_m.settled_to) < v_m.call_stamina_ms then v_short := 'stamina'; end if;
    if v_m.call_fee > 0 then
      v_p := public.hr_purse_of(v_m.user_id);
      select coalesce(sum((x.value #>> '{}')::bigint * q.price), 0) into v_b
        from jsonb_array_elements(p_members) e
        cross join lateral jsonb_each(case when jsonb_typeof(e.value->'hunt'->'buys') = 'object' then e.value->'hunt'->'buys' else '{}'::jsonb end) x
        join public.hr_hunt_basic_supplies q on q.basic_id = x.key
       where (e.value->>'user')::uuid = v_m.user_id and jsonb_typeof(x.value) = 'number' and (x.value #>> '{}') ~ '^[0-9]{1,9}$';
      select coalesce(sum(h.call_fee), 0) into v_f
        from jsonb_array_elements(p_members) e join public.hunt_sessions h on h.id = (e.value->>'session')::uuid
       where h.user_id = v_m.user_id;
      v_floor := greatest(0, coalesce((public.hr_hunt_supply_of(v_m.user_id, v_m.slot, v_m.preset)->>'gold_floor')::bigint, 0));
      -- END_ORDER: gold_out is ahead of stamina.
      if coalesce(v_p, 0) - v_b - v_f < v_floor then v_short := 'gold_out'; end if;
    end if;
    if v_short is not null then v_stop := v_stop || jsonb_build_object(v_m.user_id::text || ':' || v_m.slot::text, v_short); end if;
  end loop;
  return jsonb_build_object('next', v_stop = '{}'::jsonb, 'stop', v_stop, 'at', p_to);
end $fn$;

-- THE ROOM'S WIN AND ITS NEXT FIGHT, per member, right after its session half (hr_hunt_apply_member; the character and its purse are locked by
-- hr_hunt_apply_instance). p_h is the session half's answer: `ended` (the session closed) or `held` (a won fight in a room with a plan).
create or replace function public.hr_boss_call_step(p_user uuid, p_slot int, p_session uuid, p_delta jsonb, p_h jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_s public.hunt_sessions%rowtype; v_c public.hr_boss_calls%rowtype; v_plan jsonb; v_won boolean; v_end text; v_held text;
  v_why text; v_at timestamptz; v_g bigint;
begin
  select * into v_s from public.hunt_sessions where id = p_session;
  select * into v_c from public.hr_boss_calls where hunt_id = v_s.hunt_id;
  if not found then return p_h; end if;
  v_end := p_h->>'ended'; v_held := p_h->>'held';
  v_won := exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_delta->'progress') = 'array' then p_delta->'progress' else '[]'::jsonb end) o
                    where o.value->>'kind' = 'stat' and o.value->>'key' = 'ev:kill_monster:' || v_c.monster_id);
  -- THE WIN IS PROVEN FROM THE WINDOW'S OWN KILL, BOTH WAYS: his kill ends the fight in the same settle (`died` for a hero the same swing took),
  -- and a fight that ends `boss_felled` carries his kill. So a win's drops are one fight's, and a fight can't be called won without them.
  if v_won and coalesce(v_held, v_end) is distinct from 'boss_felled' and v_end is distinct from 'died' then
    perform public.hr_reject('called_pays', jsonb_build_object('hunt', v_s.hunt_id, 'what', 'kill_without_end')); end if;
  if coalesce(v_held, v_end) = 'boss_felled' and not v_won then
    perform public.hr_reject('end_not_proven', jsonb_build_object('reason', 'boss_felled')); end if;
  -- EVERY WIN IS A PAID FIGHT'S: counted here, held by hunt_sessions_call_ck (call_won <= call_fight).
  if v_won and v_s.call_fights is not null then
    update public.hunt_sessions set call_won = call_won + 1 where id = p_session;
  end if;
  if v_held is distinct from 'boss_felled' then return p_h; end if;
  v_plan := nullif(current_setting('hr.boss_plan', true), '')::jsonb;
  if v_plan is null or v_s.call_fights is null then perform public.hr_reject('session_moved', jsonb_build_object('why', 'boss_plan')); end if;
  v_at := (v_plan->>'at')::timestamptz;
  if (v_plan->>'next')::boolean then
    -- THE NEXT FIGHT, CHARGED AS IT STARTS, win or lose: this hero's stamina and this hero's fee, the price the server quoted at the press.
    update public.player_state set stamina_ms = stamina_ms - v_s.call_stamina_ms, stamina_at = v_at
     where user_id = p_user and slot = p_slot and stamina_ms >= v_s.call_stamina_ms;
    if not found then perform public.hr_reject('session_moved', jsonb_build_object('why', 'boss_stamina')); end if;
    if v_s.call_fee > 0 then
      v_g := public.hr_purse_move(p_user, -v_s.call_fee, 0);
      if v_g is null then perform public.hr_reject('gold_short', jsonb_build_object('why', 'boss_call', 'fee', v_s.call_fee)); end if;
    else
      v_g := public.hr_purse_of(p_user);
    end if;
    -- A PURCHASE (kind shop; the session in meta, never session_id: a session-stamped row folds into the hunt's own coins).
    insert into public.player_ledger (user_id, slot, kind, intent, gold, meta, purse, gold_kind)
      values (p_user, p_slot, 'shop', 'boss_call:' || v_c.call_id || ':fight', nullif(-v_s.call_fee, 0),
              jsonb_build_object('reason', 'boss_call', 'call', v_c.call_id, 'hunt', v_s.hunt_id, 'fight', v_s.call_fight + 1, 'fights', v_s.call_fights,
                                 'fee', v_s.call_fee, 'stamina_ms', v_s.call_stamina_ms, 'session', p_session),
              v_g, 'shop');
    update public.hunt_sessions
       set call_fight = call_fight + 1, fight_from = v_at, settled_to = v_at, next_swing_at = v_at, version = version + 1
     where id = p_session and call_fight = v_s.call_fight and ended_at is null;
    if not found then perform public.hr_reject('session_moved', jsonb_build_object('why', 'boss_fight')); end if;
    -- (The record of the fight just won is cleared by hr_hunt_apply_instance once every member has landed: this member's own tally write,
    -- which carries that record, runs after this step.)
    return (p_h - 'held') || jsonb_build_object('fight', jsonb_build_object('n', v_s.call_fight + 1, 'of', v_s.call_fights,
                                                                           'fee', v_s.call_fee, 'stamina_ms', v_s.call_stamina_ms));
  end if;
  -- THE SERIES ENDS HERE, on the win: a hero who can't pay the next fight ends for that reason (`gold_out`, `stamina`); everyone else comes home
  -- with it (`party_member_left`: hr_hunt_view's end_by names that hero and what it ran out of, so the card says why the fights stopped).
  v_why := coalesce(v_plan->'stop'->>(p_user::text || ':' || p_slot::text), 'party_member_left');
  perform public.hr_hunt_close(p_session, v_why, v_at, true);
  return (p_h - 'held') || jsonb_build_object('ended', v_why);
end $fn$;

revoke execute on function public.hr_boss_call_pays(jsonb, text) from public, anon, authenticated, service_role;
revoke execute on function public.hr_boss_call_plan(uuid, jsonb, timestamptz) from public, anon, authenticated, service_role;
revoke execute on function public.hr_boss_call_step(uuid, int, uuid, jsonb, jsonb) from public, anon, authenticated, service_role;

-- ── §3 THE SETTLE (anchored splices; a second apply finds the post image) ────
-- THE ENGINE'S HUNT STARTS WITH THE FIGHT (hr_hunt_member_read, one splice).
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_member_read(public.hunt_sessions)'::regprocedure), chr(13), '');
  if strpos(v_def, 'CALL-SERIES') = 0 then
    v_old := $a$    'hunt_from_ms', ceil(extract(epoch from p_s.hunt_from) * 1000)::bigint,$a$;
    v_new := $a$    -- CALL-SERIES (2027-04-24-boss-call-series.sql): in a called room the engine's hunt starts with the FIGHT in progress (its limit and
    -- its quiet clock are a fight's); the series is the server's and the engine never counts one.
    'hunt_from_ms', ceil(extract(epoch from coalesce(p_s.fight_from, p_s.hunt_from)) * 1000)::bigint,$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_member_read: CALL-SERIES anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- THE ROOM'S PLAN (hr_hunt_apply_instance, three splices).
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)'::regprocedure), chr(13), '');
  if strpos(v_def, 'CALL-SERIES') = 0 then
    v_old := $a$    -- SCALED-HUNTS: THE SCALE THIS WINDOW PLAYED, re-proved against the server's own rule before any member lands (each member's kill$a$;
    v_new := $a$    -- CALL-SERIES (2027-04-24-boss-call-series.sql): THE ROOM'S NEXT STEP, decided once for the whole room before any member lands
    --   (hr_boss_call_plan, under the locks above): every hero is charged the next fight, or the series ends for everyone on this win. The
    --   plan lives for this settle only (hr.boss_plan): hr_hunt_settle_session holds a won fight's end for it and hr_boss_call_step follows it.
    perform set_config('hr.boss_plan', coalesce(public.hr_boss_call_plan(p_instance, p_members, v_to)::text, ''), true);
$a$ || v_old;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_apply_instance: the plan''s anchor matched % times (need 1): the body moved', v_n; end if;
    v_def := replace(v_def, v_old, v_new);
    v_old := $a$    select count(*) into v_n from public.hunt_sessions h where h.instance_id = p_instance and h.ended_at is null;$a$;
    v_new := v_old || $a$
    -- CALL-SERIES: the next fight starts in a fresh room (no stored world) with no record of the last one (hunt_session_tally.fight is ONE
    -- fight's: the losing line reads it; each member's own tally write landed after its step, so it is cleared here), and the plan ends with this settle.
    if coalesce((nullif(current_setting('hr.boss_plan', true), '')::jsonb->>'next')::boolean, false) then
      v_world := null;
      update public.hunt_session_tally t set fight = null
        from public.hunt_sessions h where h.instance_id = p_instance and h.ended_at is null and t.session_id = h.id and t.fight is not null;
    end if;
    perform set_config('hr.boss_plan', '', true);$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_apply_instance: the world''s anchor matched % times (need 1): the body moved', v_n; end if;
    v_def := replace(v_def, v_old, v_new);
    v_old := $a$    perform set_config('hr.frame_defer', '', true);   -- FRAME-PUSH: a refused settle sends nothing$a$;
    v_new := v_old || $a$
    perform set_config('hr.boss_plan', '', true);     -- CALL-SERIES: a refused settle plans nothing$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_apply_instance: the handler''s anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- A FIGHT'S LIMIT AND A HELD WIN (hr_hunt_settle_session, five splices).
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'CALL-SERIES') = 0 then
    v_old := $a$v_next_id uuid;$a$;
    v_new := v_old || $a$
  v_held text;  -- CALL-SERIES (2027-04-24-boss-call-series.sql): a won fight's end, held for hr_boss_call_step$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_settle_session: the declare anchor matched % times (need 1): the body moved', v_n; end if;
    v_def := replace(v_def, v_old, v_new);
    -- the limit, proved from the fight's own start
    v_old := $a$and v_end_at >= v_s.hunt_from + make_interval(secs => c.limit_ms / 1000.0) - c_skew)$a$;
    v_new := $a$and v_end_at >= coalesce(v_s.fight_from, v_s.hunt_from) + make_interval(secs => c.limit_ms / 1000.0) - c_skew) -- CALL-SERIES: from the FIGHT's start$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_settle_session: the limit''s proof anchor matched % times (need 1): the body moved', v_n; end if;
    v_def := replace(v_def, v_old, v_new);
    -- the limit, owed from the fight's own start
    v_old := $a$where c.hunt_id = v_s.hunt_id and v_to > v_s.hunt_from + make_interval(secs => c.limit_ms / 1000.0) + c_skew) then$a$;
    v_new := $a$where c.hunt_id = v_s.hunt_id and v_to > coalesce(v_s.fight_from, v_s.hunt_from) + make_interval(secs => c.limit_ms / 1000.0) + c_skew) then$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_settle_session: the owed limit''s anchor matched % times (need 1): the body moved', v_n; end if;
    v_def := replace(v_def, v_old, v_new);
    -- the held win
    v_old := $a$  elsif v_end is not null then
    perform public.hr_hunt_close(p_session, v_end, v_end_at, true);
  end if;$a$;
    v_new := $a$  elsif v_end = 'boss_felled' and nullif(current_setting('hr.boss_plan', true), '') is not null
        and exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id) then
    -- CALL-SERIES (2027-04-24-boss-call-series.sql): a won fight in a room with a plan is HELD, not closed. hr_boss_call_step
    -- (hr_hunt_apply_member, right after this half) charges the next fight or ends the series, as hr_hunt_apply_instance planned for the room.
    v_held := v_end; v_end := null;
  elsif v_end is not null then
    perform public.hr_hunt_close(p_session, v_end, v_end_at, true);
  end if;$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_settle_session: the end''s anchor matched % times (need 1): the body moved', v_n; end if;
    v_def := replace(v_def, v_old, v_new);
    v_old := $a$'version', (select version from public.hunt_sessions where id = p_session));$a$;
    v_new := $a$'version', (select version from public.hunt_sessions where id = p_session))
         || case when v_held is not null then jsonb_build_object('held', v_held) else '{}'::jsonb end;$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_settle_session: the answer''s anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- THE ROOM'S STAMINA, ITS OWN ITEM BOUND AND THE STEP (hr_hunt_apply_member, five splices).
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'CALL-SERIES') = 0 then
    v_old := $a$  v_train boolean;  -- TRAINING (2027-04-16-combat-training.sql): this session trains on a training ground (hr_training_grounds)$a$;
    v_new := v_old || $a$
  v_call  boolean;  -- CALL-SERIES (2027-04-24-boss-call-series.sql): this session fights in a called room (hr_boss_calls)$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_apply_member: the declare anchor matched % times (need 1): the body moved', v_n; end if;
    v_def := replace(v_def, v_old, v_new);
    -- the shape of the proposal: a called room's stamina is the server's alone
    v_old := $a$  if v_train then
    if v_stam is null or jsonb_typeof(v_stam) <> 'null' then perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'training')); end if;
  elsif v_stam is null$a$;
    v_new := $a$  -- CALL-SERIES (2027-04-24-boss-call-series.sql): a called room's TIME spends no stamina (each fight is charged as it starts: hr_boss_call,
  -- hr_boss_call_step), so its window's pool is the server's alone: whatever the engine proposes (null; a number from an engine that
  -- predates this file) is ignored. Unlike training the pool does NOT rest in the room: it is stamped unchanged below.
  v_call := exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id);
  if v_train then
    if v_stam is null or jsonb_typeof(v_stam) <> 'null' then perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'training')); end if;
  elsif v_call then
    if v_stam is not null and jsonb_typeof(v_stam) not in ('null', 'number') then perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'call')); end if;
  elsif v_stam is null$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_apply_member: the stamina shape anchor matched % times (need 1): the body moved', v_n; end if;
    v_def := replace(v_def, v_old, v_new);
    -- the ground's kill-count item bound steps aside for the room's own
    v_old := $a$  if jsonb_typeof(p_delta->'items') = 'object' then
    select e.key into v_vb_item from jsonb_each(p_delta->'items') e$a$;
    v_new := $a$  -- CALL-SERIES: a called room journals no kill, so its items are held by its own bound instead (hr_boss_call_pays above: only the window
  -- his kill fell in, only his table, at most its count), never by kills x the ground's spawns.
  if jsonb_typeof(p_delta->'items') = 'object' and not v_call then
    select e.key into v_vb_item from jsonb_each(p_delta->'items') e$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_apply_member: the item bound anchor matched % times (need 1): the body moved', v_n; end if;
    v_def := replace(v_def, v_old, v_new);
    -- the pool, written
    v_old := $a$  if not v_train then
    if v_e <> greatest(0, v_s0 - v_paid) then$a$;
    v_new := $a$  -- CALL-SERIES: a called room's window drains nothing and RESTS nothing: the pool as it stood at the window's start, stamped at its end.
  if v_call then
    v_e := v_s0;
    update public.player_state set stamina_ms = v_e, stamina_at = v_to where user_id = p_user and slot = p_slot;
  elsif not v_train then
    if v_e <> greatest(0, v_s0 - v_paid) then$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_apply_member: the stamina write anchor matched % times (need 1): the body moved', v_n; end if;
    v_def := replace(v_def, v_old, v_new);
    -- the step
    v_old := $a$  if v_train then v_h := public.hr_training_hour(p_user, p_slot, p_session, v_to, v_cost, v_floor, v_h); end if;$a$;
    v_new := v_old || $a$
  -- CALL-SERIES (2027-04-24-boss-call-series.sql): THE ROOM'S WIN AND ITS NEXT FIGHT (hr_boss_call_step): the win is proved from this window's
  -- own kill and counted; a held end is charged its next fight or closed, as the room's plan says. Its end, if any, rides the answer.
  if v_call then v_h := public.hr_boss_call_step(p_user, p_slot, p_session, p_delta, v_h); end if;$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_apply_member: the step''s anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- THE SERIES READS WITH THE SESSION (hr_hunt_view, one splice): a key only on a session that has one.
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_view(uuid)'::regprocedure), chr(13), '');
  if strpos(v_def, 'CALL-SERIES') = 0 then
    v_old := $a$
  from public.hunt_sessions s where s.id = p_session$a$;
    v_new := $a$
    -- CALL-SERIES (2027-04-24-boss-call-series.sql): a Call out series, the server's own count and bill; no other hunt gains a key.
    || case when s.call_fights is null then '{}'::jsonb else jsonb_build_object('call', jsonb_build_object(
         'fights', s.call_fights, 'fight', s.call_fight, 'won', s.call_won, 'fee', s.call_fee, 'stamina_ms', s.call_stamina_ms,
         'paid_gold', s.call_fight::bigint * s.call_fee, 'paid_stamina_ms', s.call_fight::bigint * s.call_stamina_ms)) end
  from public.hunt_sessions s where s.id = p_session$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_view: CALL-SERIES anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- ── §4 THE QUOTE AND THE VERB ────────────────────────────────────────────────
create or replace function public.hr_boss_call_quote(p_user uuid, p_slot int, p_call text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare
  r public.hr_boss_calls%rowtype; v_party uuid; v_p public.hunt_parties%rowtype; v_seats int := 1; v_why text; v_who text;
  v_fee jsonb; v_price bigint; v_stam bigint; v_mine int := 0; v_bill bigint := 0; v_covers bigint;
  v_m record; v_a record; v_pm int; v_ms bigint;
begin
  -- CALL-SERIES (2027-04-24-boss-call-series.sql): one fight's price for this hero, and what the room can pay right now. No daily cap.
  -- LIVE-EVENTS (2027-03-22-live-events.sql): the price is the row's fee x the account's live fee dial (Open Halls: 0), rounded up: gold only.
  -- CALL-OUT-ALONE (2027-04-05-call-out-alone.sql): a hero in no party is quoted and calls alone; in a party only its leader calls.
  select * into r from public.hr_boss_calls where call_id = p_call;
  if not found then return null; end if;
  v_party := public.hr_hunt_party_of(p_user, p_slot);
  if v_party is not null then
    select * into v_p from public.hunt_parties where id = v_party;
    v_seats := greatest(1, (select count(*) from public.hunt_party_members m where m.party_id = v_party)::int);
  end if;
  v_fee := public.hr_live_fee_of(p_user, r.call_id, now());
  v_price := (r.fight_fee::bigint * (v_fee->>'pm')::int + 999) / 1000;
  v_stam := public.hr_stamina_of(p_user, p_slot, now());
  v_why := case when v_party is not null and not (v_p.leader_user = p_user and v_p.leader_slot = p_slot) then 'call_leader' end;
  -- EVERY SEAT'S FIRST FIGHT and what the room covers: each hero its own pool, each account its own purse for all its heroes in the room.
  v_covers := r.max_fights;
  for v_m in select s.user_id, s.slot from (
               select m.user_id, m.slot from public.hunt_party_members m where m.party_id = v_party
               union select p_user, p_slot) s order by (s.user_id = p_user and s.slot = p_slot) desc, s.user_id, s.slot loop
    v_ms := public.hr_stamina_of(v_m.user_id, v_m.slot, now());
    v_covers := least(v_covers, coalesce(v_ms, 0) / r.fight_stamina_ms);
    if v_m.user_id = p_user then v_mine := v_mine + 1; end if;
    if v_why is null and coalesce(v_ms, 0) < r.fight_stamina_ms then
      if v_m.user_id = p_user and v_m.slot = p_slot then v_why := 'call_stamina';
      else v_why := 'party_stamina'; v_who := public.hr_character_name(v_m.user_id, v_m.slot); end if;
    end if;
  end loop;
  v_bill := v_price * v_mine;
  for v_a in select s.user_id, count(*)::int as n, min(s.slot) as slot0,
                    max(greatest(0, coalesce((public.hr_hunt_supply_of(s.user_id, s.slot, public.hr_hunt_active_set(s.user_id, s.slot))->>'gold_floor')::bigint, 0))) as keep
               from (select m.user_id, m.slot from public.hunt_party_members m where m.party_id = v_party
                     union select p_user, p_slot) s
              group by s.user_id order by (s.user_id = p_user) desc, s.user_id loop
    v_pm := (public.hr_live_fee_of(v_a.user_id, r.call_id, now())->>'pm')::int;
    v_ms := ((r.fight_fee::bigint * v_pm + 999) / 1000) * v_a.n;   -- this account's gold a fight
    continue when v_ms = 0;
    if coalesce(public.hr_purse_of(v_a.user_id), 0) < v_ms then
      v_covers := 0;
      if v_why is null then
        if v_a.user_id = p_user then v_why := 'insufficient_gold';
        else v_why := 'party_gold'; v_who := public.hr_character_name(v_a.user_id, v_a.slot0); end if;
      end if;
    else
      -- the first fight is the press's own; every later one keeps the purse at or over "Keep at least"
      v_covers := least(v_covers, greatest(1, (coalesce(public.hr_purse_of(v_a.user_id), 0) - v_a.keep) / v_ms));
    end if;
  end loop;
  return jsonb_build_object('call', r.call_id, 'available', v_why is null, 'why', v_why, 'who', v_who, 'price', v_price,
                            'fight_fee', r.fight_fee, 'fee_pm', (v_fee->>'pm')::int, 'event', v_fee->'event',
                            'fight_stamina_ms', r.fight_stamina_ms, 'max_fights', r.max_fights, 'limit_ms', r.limit_ms,
                            'stamina_ms', v_stam, 'covers', greatest(0, v_covers), 'heroes', v_mine, 'seats', v_seats, 'alone', v_seats = 1,
                            'totals', jsonb_build_object(
                              'fee', (select jsonb_agg(v_bill * g order by g) from generate_series(1, r.max_fights) g),
                              'stamina_ms', (select jsonb_agg(r.fight_stamina_ms::bigint * g order by g) from generate_series(1, r.max_fights) g)));
end $fn$;
revoke execute on function public.hr_boss_call_quote(uuid, int, text) from public, anon, authenticated, service_role;

drop function if exists public.hr_boss_call(int, text, bigint, uuid);
create or replace function public.hr_boss_call(p_slot int, p_call text, p_fights int, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'boss_call';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_q jsonb; v_c public.hr_boss_calls%rowtype; v_party uuid; v_ver bigint; v_a jsonb; v_no jsonb;
  v_room uuid; v_m record; v_fee bigint; v_pm int; v_stam bigint; v_g bigint; v_meta jsonb;
begin
  -- CALL-SERIES (2027-04-24-boss-call-series.sql): N fights in a row. The count is bounded by the catalogue, the price compared with the
  -- server's quote; every seat pays the first fight, its own stamina and its own fee, or nobody enters.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_price is null or p_price < 0 or p_price > 1000000000 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  select * into v_c from public.hr_boss_calls where call_id = p_call;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'call_unknown')); end if;
  -- THE COUNT: 1 to the catalogue's top, the server's number. A forged N is refused, never clamped.
  if p_fights is null or p_fights < 1 or p_fights > v_c.max_fights then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_fights', 'max_fights', v_c.max_fights)); end if;
  v_verb := 'boss_call:' || p_call || ':' || p_fights || ':' || p_price;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- THE LOCKS: the party row (every party verb's first), then this account's key, so a second press on any of its heroes waits. No other path takes this key.
  v_party := public.hr_hunt_party_of(v_uid, p_slot);
  if v_party is not null then perform 1 from public.hunt_parties p where p.id = v_party for update; end if;
  perform pg_advisory_xact_lock(hashtextextended('hr:boss:' || v_uid::text, 0));
  v_q := public.hr_boss_call_quote(v_uid, p_slot, p_call);
  if not (v_q->>'available')::boolean then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', v_q->>'why', 'boss_call', v_q)); end if;
  if (v_q->>'price')::bigint <> p_price then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'boss_call', v_q)); end if;
  -- EVERY MEMBER OR NONE, AND THE FIRST FIGHT'S CHARGE WITH THEM: a start or a seat that can't pay rolls every seat back out.
  begin
    perform set_config('hr.boss_call', v_c.hunt_id, true);
    if v_party is null then
      -- CALL-OUT-ALONE (2027-04-05-call-out-alone.sql): a hero in no party opens the room for ONE seat, through the start its own enter runs,
      -- on what a party Start gives a seat: its saved bag and its set. No hours limit: a series ends at its count.
      v_r := public.hr_hunt_enter_for(v_uid, p_slot, v_c.hunt_id, public.hr_hunt_saved_bag(v_uid, p_slot), public.hr_hunt_active_set(v_uid, p_slot), null);
      if coalesce(v_r->>'ok', 'false') = 'true' then v_r := jsonb_build_object('ok', true, 'entered', 1, 'party', null); end if;
    else
      -- Its own key: this one is the charge's, and a replay of it must answer the charge (hr_hunt_party_start journals what it was asked under).
      v_r := public.hr_hunt_party_start(p_slot, v_c.hunt_id, md5('boss_call:start:' || p_idem::text)::uuid);
    end if;
    perform set_config('hr.boss_call', '', true);
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      v_no := v_r; raise exception using errcode = 'HR879', message = 'call_refused'; end if;
    select h.instance_id into v_room from public.hunt_sessions h where h.user_id = v_uid and h.slot = p_slot and h.hunt_id = v_c.hunt_id and h.ended_at is null;
    if v_room is null then v_no := jsonb_build_object('ok', false, 'error', 'no_hunt'); raise exception using errcode = 'HR879', message = 'call_refused'; end if;
    -- THE CALLER'S FIRST FIGHT: one hr_apply on the caller's key (a replay charges once). A free fight moves no gold and still journals its row.
    select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, (case when p_price > 0 then jsonb_build_object('gold', -p_price) else '{}'::jsonb end) || jsonb_build_object(
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'boss_call', 'call', p_call, 'hunt', v_c.hunt_id, 'fight', 1, 'fights', p_fights,
                                                                      'fee', p_price, 'stamina_ms', v_c.fight_stamina_ms, 'party', v_party,
                                                                      'fee_pm', (v_q->>'fee_pm')::int, 'event', v_q->'event'))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      v_no := v_a || jsonb_build_object('ok', false); raise exception using errcode = 'HR879', message = 'call_refused'; end if;
    -- EVERY SEAT, in (user, slot) order: its stamina off its pool as it stands at its arrival, its fee from its own account (its own dial),
    -- and the series on its session. The start above holds every seat's character; the purses are taken here, in the same order as a settle.
    for v_m in select h.id, h.user_id, h.slot, h.hunt_from from public.hunt_sessions h
                where h.instance_id = v_room and h.hunt_id = v_c.hunt_id and h.ended_at is null order by h.user_id, h.slot loop
      v_stam := public.hr_stamina_of(v_m.user_id, v_m.slot, v_m.hunt_from);
      if coalesce(v_stam, 0) < v_c.fight_stamina_ms then
        v_no := jsonb_build_object('ok', false, 'error', case when v_m.user_id = v_uid and v_m.slot = p_slot then 'call_stamina' else 'party_stamina' end,
                                   'who', public.hr_character_name(v_m.user_id, v_m.slot));
        raise exception using errcode = 'HR879', message = 'call_refused'; end if;
      if v_m.user_id = v_uid and v_m.slot = p_slot then
        v_fee := p_price;
      else
        v_pm := (public.hr_live_fee_of(v_m.user_id, v_c.call_id, now())->>'pm')::int;
        v_fee := (v_c.fight_fee::bigint * v_pm + 999) / 1000;
        if v_fee > 0 then
          v_g := public.hr_purse_move(v_m.user_id, -v_fee, 0);
          if v_g is null then
            v_no := jsonb_build_object('ok', false, 'error', case when v_m.user_id = v_uid then 'insufficient_gold' else 'party_gold' end,
                                       'who', public.hr_character_name(v_m.user_id, v_m.slot));
            raise exception using errcode = 'HR879', message = 'call_refused'; end if;
        else
          v_g := public.hr_purse_of(v_m.user_id);
        end if;
        v_meta := jsonb_build_object('reason', 'boss_call', 'call', p_call, 'hunt', v_c.hunt_id, 'fight', 1, 'fights', p_fights, 'fee', v_fee,
                                     'stamina_ms', v_c.fight_stamina_ms, 'party', v_party, 'session', v_m.id, 'fee_pm', v_pm);
        insert into public.player_ledger (user_id, slot, kind, intent, gold, meta, purse, gold_kind)
          values (v_m.user_id, v_m.slot, 'shop', 'boss_call:' || p_call || ':fight', nullif(-v_fee, 0), v_meta, v_g, 'shop');
      end if;
      update public.player_state set stamina_ms = v_stam - v_c.fight_stamina_ms, stamina_at = v_m.hunt_from, version = version + 1, updated_at = now()
       where user_id = v_m.user_id and slot = v_m.slot;
      update public.hunt_sessions
         set call_fights = p_fights, call_fight = 1, call_won = 0, call_fee = v_fee, call_stamina_ms = v_c.fight_stamina_ms,
             fight_from = hunt_from, hours_limit = null, version = version + 1
       where id = v_m.id;
    end loop;
  exception when sqlstate 'HR879' then
    perform set_config('hr.boss_call', '', true);
    return public.hr_note_rejection(c_verb, p_slot, v_no);
  end;
  return jsonb_build_object('ok', true, 'version', (select version from public.player_state where user_id = v_uid and slot = p_slot),
                            'gold', -p_price, 'fights', p_fights, 'entered', v_r->'entered', 'party', v_r->'party',
                            'boss_call', public.hr_boss_call_quote(v_uid, p_slot, p_call));
end $fn$;
revoke execute on function public.hr_boss_call(int, text, int, bigint, uuid) from public;
revoke execute on function public.hr_boss_call(int, text, int, bigint, uuid) from anon, service_role;
grant  execute on function public.hr_boss_call(int, text, int, bigint, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_boss_call';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_boss_call', 'p_slot integer, p_call text, p_fights integer, p_price bigint, p_idem uuid', 'authenticated',
   'added 2027-03-12 (lane/c-boss-call), reshaped 2027-04-24 (lane/c-boss-call-b): MONEY (a gold and stamina sink, a drop source) - a hero in no party alone, or a party''s leader with every member, starts a series of N called fights; every seat pays the first fight (its own stamina and its own fee, the server''s), the settle charges each later one; refuses bad_fights and quote_changed; no daily cap');
update public.hr_client_rpc_baseline
   set note = 'added 2027-03-12 (lane/c-boss-call): read - the call as the server prices it (one fight''s stamina and fee, the slider''s top, the totals a count, what the room covers now), for the ground''s page while it is open'
 where proname = 'hr_boss_call_view' and grantee = 'authenticated';

-- ── §5 (reserved) ────────────────────────────────────────────────────────────

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  c_a constant uuid := '000000d8-0000-4000-a000-00007f0c0a01';   -- a hero in no party
  c_b constant uuid := '000000d8-0000-4000-a000-00007f0c0a02';   -- a party's leader
  c_c constant uuid := '000000d8-0000-4000-a000-00007f0c0a03';   -- a seated member
  k   constant text := '000000d8-0000-4000-b000-0000';
  v jsonb; v_q jsonb; v_pid uuid; v_s text; v_c public.hr_boss_calls%rowtype; v_sid uuid; v_inst uuid; v_plan jsonb; v_h jsonb;
  v_stam bigint; v_at timestamptz; v_kill jsonb; v_mem jsonb; v_n int; v_ok boolean; v_keep bigint;
begin
  select * into v_c from public.hr_boss_calls where call_id = 'rat_king';
  -- (a) THE SHAPE: a signed-in client calls the five-argument verb, nobody else; the four-argument one is gone; the helpers are owner-only;
  --     no client writes hunt_sessions; hygiene STRICT is green; every splice is in.
  if to_regprocedure('public.hr_boss_call(integer,text,bigint,uuid)') is not null then raise exception 'boss-call-series §6(a): the one-fight verb is still here'; end if;
  if has_function_privilege('anon', 'public.hr_boss_call(integer,text,integer,bigint,uuid)', 'execute')
     or has_function_privilege('service_role', 'public.hr_boss_call(integer,text,integer,bigint,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_boss_call(integer,text,integer,bigint,uuid)', 'execute') then
    raise exception 'boss-call-series §6(a): the grants on hr_boss_call are wrong'; end if;
  foreach v_s in array array['public.hr_boss_call_quote(uuid,integer,text)', 'public.hr_boss_call_pays(jsonb,text)',
                             'public.hr_boss_call_plan(uuid,jsonb,timestamp with time zone)', 'public.hr_boss_call_step(uuid,integer,uuid,jsonb,jsonb)'] loop
    if has_function_privilege('authenticated', v_s, 'execute') or has_function_privilege('anon', v_s, 'execute') or has_function_privilege('service_role', v_s, 'execute') then
      raise exception 'boss-call-series §6(a): a client can execute %', v_s; end if;
  end loop;
  foreach v_s in array array['public.hr_hunt_member_read(public.hunt_sessions)', 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)',
                             'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)', 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)',
                             'public.hr_hunt_view(uuid)', 'public.hr_boss_call_quote(uuid,integer,text)', 'public.hr_boss_call(integer,text,integer,bigint,uuid)',
                             'public.hr_boss_call_pays(jsonb,text)'] loop
    if strpos((select prosrc from pg_proc where oid = v_s::regprocedure), 'CALL-SERIES') = 0 then raise exception 'boss-call-series §6(a): % has no splice', v_s; end if;
  end loop;
  if has_table_privilege('authenticated', 'public.hunt_sessions', 'insert,update,delete,truncate') or has_table_privilege('anon', 'public.hunt_sessions', 'select,insert,update,delete,truncate')
     or exists (select 1 from pg_policy where polrelid = 'public.hunt_sessions'::regclass and polcmd <> 'r') then
    raise exception 'boss-call-series §6(a): a client can write hunt_sessions'; end if;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'hr\_boss\_%' and (p.prosrc like '%per\_day%' or p.prosrc ~ '\mr\.fee\M')) then
    raise exception 'boss-call-series §6(a): a boss-call body still reads the one-fight fee or the daily cap'; end if;
  perform public.hr_assert_grant_hygiene(true);

  -- (b) THE MONEY LINE: a clean window and a win with his table pass; everything else is named.
  v_kill := jsonb_build_object('kind', 'stat', 'key', 'ev:kill_monster:rat_king_called', 'period', '', 'add', 1);
  if public.hr_boss_call_pays(jsonb_build_object('accrued_to', 'x', 'hp', 1, 'journal', '{"meta":{"kills":0}}'::jsonb, 'progress', jsonb_build_array(v_kill)), 'rat_king_called') is not null then
    raise exception 'boss-call-series §6(b): a clean win reads as paying'; end if;
  if public.hr_boss_call_pays(jsonb_build_object('hp', 1, 'journal', '{"meta":{"kills":0}}'::jsonb, 'items', '{"rat_tail":1,"kingstooth":1}'::jsonb,
       'progress', jsonb_build_array(v_kill, '{"kind":"stat","key":"ev:loot:rat_tail","period":"","add":1}'::jsonb, '{"kind":"stat","key":"rare_drops","period":"","add":1}'::jsonb)), 'rat_king_called') is not null then
    raise exception 'boss-call-series §6(b): a win with his table is refused: %',
      public.hr_boss_call_pays(jsonb_build_object('hp', 1, 'items', '{"rat_tail":1,"kingstooth":1}'::jsonb, 'progress', jsonb_build_array(v_kill)), 'rat_king_called'); end if;
  foreach v_s in array array[
      '{"items":{"rat_tail":1}}',                                                                           -- drops with no kill
      '{"gold":1}', '{"xp":{"melee":1}}', '{"level_xp":1}', '{"hearthfind":{}}', '{"journal":{"meta":{"kills":1}}}',
      '{"progress":[{"kind":"stat","key":"ev:loot:rat_tail","period":"","add":1}]}',                      -- a loot stat with no kill
      '{"progress":[{"kind":"stat","key":"ev:kill_monster:rat_king_called","period":"","add":2}]}'] loop
    if public.hr_boss_call_pays(v_s::jsonb, 'rat_king_called') is null then raise exception 'boss-call-series §6(b): % passed the money line', v_s; end if;
  end loop;
  foreach v_s in array array[
      '{"items":{"steel_platebody":1}}', '{"items":{"rat_tail":2}}', '{"items":{"rat_tail":0}}', '{"items":[1]}', '{"gold":1}', '{"xp":{"melee":1}}', '{"level_xp":1}'] loop
    -- the same plants riding a real kill: an item off his table, over its count, coin, XP
    if public.hr_boss_call_pays(v_s::jsonb || jsonb_build_object('progress', jsonb_build_array(v_kill)), 'rat_king_called') is null then
      raise exception 'boss-call-series §6(b): a win carried % past the money line', v_s; end if;
  end loop;
  if public.hr_boss_call_pays(jsonb_build_object('progress', jsonb_build_array(v_kill, v_kill)), 'rat_king_called') is null
     or public.hr_boss_call_pays(jsonb_build_object('progress', jsonb_build_array(v_kill, '{"kind":"stat","key":"ev:loot:rat_tail","period":"","add":1}'::jsonb)), 'rat_king_called') is null
     or public.hr_boss_call_pays(jsonb_build_object('items', '{"rat_tail":1}'::jsonb, 'progress', jsonb_build_array(v_kill, '{"kind":"stat","key":"rare_drops","period":"","add":2}'::jsonb)), 'rat_king_called') is null then
    raise exception 'boss-call-series §6(b): two kills, a loot stat with no item or a rare count past the kinds passed'; end if;

  begin
    update public.hr_hunt_config set enabled = true where id;
    foreach v_s in array array[c_a::text, c_b::text, c_c::text] loop
      insert into auth.users (id) values (v_s::uuid) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_s::uuid, 'boss-call-series §6 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_s, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'boss-call-series §6-harness: hr_create_character refused: %', v; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', '', true);
    update public.account_wallet set gold = 100000 where user_id in (c_a, c_b, c_c);
    v_stam := public.hr_stamina_of(c_a, 0, now());
    -- the hero's own "Keep at least" (the catalogue's default until a player moves it): a later fight never takes the purse under it
    v_keep := greatest(0, coalesce((public.hr_hunt_supply_of(c_a, 0, public.hr_hunt_active_set(c_a, 0))->>'gold_floor')::bigint, 0));

    -- (c) THE QUOTE: one fight's price and the slider's table, the server's; no daily cap in it.
    v_q := public.hr_boss_call_quote(c_a, 0, 'rat_king');
    if coalesce((v_q->>'available')::boolean, false) is not true or (v_q->>'price')::bigint <> v_c.fight_fee or (v_q->>'fight_stamina_ms')::int <> v_c.fight_stamina_ms
       or (v_q->>'max_fights')::int <> v_c.max_fights or (v_q->>'alone')::boolean is not true or v_q ? 'per_day' or v_q ? 'left'
       or jsonb_array_length(v_q->'totals'->'fee') <> v_c.max_fights or (v_q->'totals'->'fee'->>2)::bigint <> 3 * v_c.fight_fee
       or (v_q->'totals'->'stamina_ms'->>2)::bigint <> 3 * v_c.fight_stamina_ms::bigint
       or (v_q->>'covers')::int <> least(v_c.max_fights, v_stam / v_c.fight_stamina_ms, greatest(1, (100000 - v_keep) / v_c.fight_fee))::int then
      raise exception 'boss-call-series §6(c): a hero alone is quoted %', v_q - 'totals'; end if;

    -- (d) ★ A FORGED COUNT OR FEE IS REFUSED, charges nothing and opens nothing.
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    foreach v_n in array array[0, -1, v_c.max_fights + 1, 1000000] loop
      v := public.hr_boss_call(0, 'rat_king', v_n, v_c.fight_fee, (k || '00000d01')::uuid);
      if v->>'error' is distinct from 'bad_fights' or (v->>'max_fights')::int <> v_c.max_fights then raise exception 'boss-call-series §6(d): % fights answered %', v_n, v; end if;
    end loop;
    v := public.hr_boss_call(0, 'rat_king', null, v_c.fight_fee, (k || '00000d01')::uuid);
    if v->>'error' is distinct from 'bad_fights' then raise exception 'boss-call-series §6(d): no count answered %', v; end if;
    foreach v_n in array array[0, 1, v_c.fight_fee::int - 1, v_c.fight_fee::int + 1] loop
      v := public.hr_boss_call(0, 'rat_king', 3, v_n, (k || '00000d02')::uuid);
      if v->>'error' is distinct from 'quote_changed' or (v->'boss_call'->>'price')::bigint <> v_c.fight_fee then raise exception 'boss-call-series §6(d): a fee of % answered %', v_n, v - 'boss_call'; end if;
    end loop;
    if (select gold from public.account_wallet where user_id = c_a) <> 100000 or exists (select 1 from public.hunt_sessions where user_id = c_a)
       or public.hr_stamina_of(c_a, 0, now()) <> v_stam then raise exception 'boss-call-series §6(d): a refusal moved something'; end if;

    -- (e) ★ THE LONE CALL FOR THREE: the first fight's fee and stamina, one shop row, the series on the session; a replay charges nothing.
    v := public.hr_boss_call(0, 'rat_king', 3, v_c.fight_fee, (k || '00000d03')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'entered')::int <> 1 or (v->>'fights')::int <> 3 then raise exception 'boss-call-series §6(e): the lone call answered %', v - 'boss_call'; end if;
    select h.id, h.instance_id into v_sid, v_inst from public.hunt_sessions h where h.user_id = c_a and h.slot = 0 and h.hunt_id = v_c.hunt_id and h.ended_at is null;
    if (select gold from public.account_wallet where user_id = c_a) <> 100000 - v_c.fight_fee then raise exception 'boss-call-series §6(e): the purse reads %', (select gold from public.account_wallet where user_id = c_a); end if;
    if (select stamina_ms from public.player_state where user_id = c_a and slot = 0) <> v_stam - v_c.fight_stamina_ms then
      raise exception 'boss-call-series §6(e): the pool reads %, want %', (select stamina_ms from public.player_state where user_id = c_a and slot = 0), v_stam - v_c.fight_stamina_ms; end if;
    if not exists (select 1 from public.hunt_sessions h where h.id = v_sid and h.call_fights = 3 and h.call_fight = 1 and h.call_won = 0 and h.call_fee = v_c.fight_fee
                     and h.call_stamina_ms = v_c.fight_stamina_ms and h.fight_from = h.hunt_from and h.hours_limit is null) then
      raise exception 'boss-call-series §6(e): the session reads %', (select to_jsonb(h) from public.hunt_sessions h where h.id = v_sid); end if;
    if (select count(*) from public.player_ledger where user_id = c_a and kind = 'shop' and intent = 'boss_call:rat_king:3:' || v_c.fight_fee and gold = -v_c.fight_fee) <> 1 then
      raise exception 'boss-call-series §6(e): not one ledger row'; end if;
    v := public.hr_boss_call(0, 'rat_king', 3, v_c.fight_fee, (k || '00000d03')::uuid);
    if (select gold from public.account_wallet where user_id = c_a) <> 100000 - v_c.fight_fee
       or (select count(*) from public.player_ledger where user_id = c_a and kind = 'shop' and intent like 'boss\_call:%') <> 1
       or (select stamina_ms from public.player_state where user_id = c_a and slot = 0) <> v_stam - v_c.fight_stamina_ms then
      raise exception 'boss-call-series §6(e): a replay charged again: %', v - 'boss_call'; end if;
    if (public.hr_hunt_view(v_sid)->'call'->>'fights')::int <> 3 or (public.hr_hunt_view(v_sid)->'call'->>'paid_gold')::bigint <> v_c.fight_fee then
      raise exception 'boss-call-series §6(e): the view reads %', public.hr_hunt_view(v_sid)->'call'; end if;
    -- the engine's hunt starts with the fight
    if (public.hr_hunt_member_read((select h from public.hunt_sessions h where h.id = v_sid))->>'hunt_from_ms')::bigint
       <> (select ceil(extract(epoch from h.fight_from) * 1000)::bigint from public.hunt_sessions h where h.id = v_sid) then
      raise exception 'boss-call-series §6(e): the engine''s hunt does not start with the fight'; end if;

    -- (f) ★ A WIN IS ALWAYS A PAID FIGHT'S: the table itself refuses a win past the fights charged, and a fight past the count.
    v_ok := false;
    begin update public.hunt_sessions set call_won = 2 where id = v_sid; exception when check_violation then v_ok := true; end;
    if not v_ok then raise exception 'boss-call-series §6(f): the session took a second win on one paid fight'; end if;
    v_ok := false;
    begin update public.hunt_sessions set call_fight = 4 where id = v_sid; exception when check_violation then v_ok := true; end;
    if not v_ok then raise exception 'boss-call-series §6(f): the session took a fight past its count'; end if;

    -- (g) ★ THE PLAN AND THE STEP: every hero won, a fight is left, the hero can pay: the next fight is charged and the session moves to it.
    perform set_config('request.jwt.claim.sub', '', true);
    v_at := (select h.hunt_from + interval '40 seconds' from public.hunt_sessions h where h.id = v_sid);
    v_mem := jsonb_build_array(jsonb_build_object('user', c_a, 'slot', 0, 'session', v_sid, 'hunt', jsonb_build_object('ended', jsonb_build_object('reason', 'boss_felled', 'at', v_at))));
    v_plan := public.hr_boss_call_plan(v_inst, v_mem, v_at);
    if v_plan is null or (v_plan->>'next')::boolean is not true or v_plan->'stop' <> '{}'::jsonb then raise exception 'boss-call-series §6(g): the plan reads %', v_plan; end if;
    -- a death beside the win, another instant, no window at all: no plan
    if public.hr_boss_call_plan(v_inst, jsonb_build_array(jsonb_build_object('user', c_a, 'slot', 0, 'session', v_sid, 'hunt', jsonb_build_object('ended', jsonb_build_object('reason', 'died', 'at', v_at)))), v_at) is not null
       or public.hr_boss_call_plan(v_inst, v_mem, v_at + interval '2 seconds') is not null
       or public.hr_boss_call_plan(v_inst, jsonb_build_array(jsonb_build_object('user', c_a, 'slot', 0, 'session', v_sid, 'hunt', '{"ended":null}'::jsonb)), v_at) is not null then
      raise exception 'boss-call-series §6(g): a plan was made for a room that did not win'; end if;
    perform set_config('hr.boss_plan', v_plan::text, true);
    -- a held win with no kill in its window is not proven; a kill with no end is refused
    v_ok := false;
    begin perform public.hr_boss_call_step(c_a, 0, v_sid, '{"progress":[]}'::jsonb, '{"ok":true,"held":"boss_felled"}'::jsonb);
    exception when sqlstate 'HR000' then v_ok := sqlerrm = 'end_not_proven'; end;
    if not v_ok then raise exception 'boss-call-series §6(g): a won fight with no kill in its window was taken'; end if;
    v_ok := false;
    begin perform public.hr_boss_call_step(c_a, 0, v_sid, jsonb_build_object('progress', jsonb_build_array(v_kill)), '{"ok":true,"ended":null}'::jsonb);
    exception when sqlstate 'HR000' then v_ok := sqlerrm = 'called_pays'; end;
    if not v_ok then raise exception 'boss-call-series §6(g): a kill that ended nothing was taken'; end if;
    v_h := public.hr_boss_call_step(c_a, 0, v_sid, jsonb_build_object('progress', jsonb_build_array(v_kill)), '{"ok":true,"held":"boss_felled"}'::jsonb);
    if v_h ? 'held' or v_h->>'ended' is not null or (v_h->'fight'->>'n')::int <> 2 then raise exception 'boss-call-series §6(g): the step answered %', v_h; end if;
    if not exists (select 1 from public.hunt_sessions h where h.id = v_sid and h.ended_at is null and h.call_fight = 2 and h.call_won = 1 and h.fight_from = v_at
                     and h.settled_to = v_at and h.next_swing_at = v_at) then
      raise exception 'boss-call-series §6(g): the session reads %', (select to_jsonb(h) from public.hunt_sessions h where h.id = v_sid); end if;
    if (select gold from public.account_wallet where user_id = c_a) <> 100000 - 2 * v_c.fight_fee
       or (select stamina_ms from public.player_state where user_id = c_a and slot = 0) <> v_stam - 2 * v_c.fight_stamina_ms
       or (select stamina_at from public.player_state where user_id = c_a and slot = 0) <> v_at
       or (select count(*) from public.player_ledger where user_id = c_a and kind = 'shop' and intent = 'boss_call:rat_king:fight' and gold = -v_c.fight_fee
                and (meta->>'fight')::int = 2 and (meta->>'session')::uuid = v_sid and session_id is null) <> 1 then
      raise exception 'boss-call-series §6(g): the second fight was not charged once: purse %, pool %', (select gold from public.account_wallet where user_id = c_a),
        (select stamina_ms from public.player_state where user_id = c_a and slot = 0); end if;

    -- (h) ★ OUT OF STAMINA: the plan names it, nothing is charged, the session ends `stamina` on the win.
    update public.player_state set stamina_ms = v_c.fight_stamina_ms - 1 where user_id = c_a and slot = 0;
    v_at := v_at + interval '40 seconds';
    v_mem := jsonb_build_array(jsonb_build_object('user', c_a, 'slot', 0, 'session', v_sid, 'hunt', jsonb_build_object('ended', jsonb_build_object('reason', 'boss_felled', 'at', v_at))));
    v_plan := public.hr_boss_call_plan(v_inst, v_mem, v_at);
    if (v_plan->>'next')::boolean is not false or v_plan->'stop'->>(c_a::text || ':0') is distinct from 'stamina' then raise exception 'boss-call-series §6(h): the plan reads %', v_plan; end if;
    -- OUT OF GOLD is said ahead of it (END_ORDER), and a purse that only just covers the fee over the hero's "Keep at least" still pays
    update public.account_wallet set gold = v_c.fight_fee + v_keep - 1 where user_id = c_a;
    if public.hr_boss_call_plan(v_inst, v_mem, v_at)->'stop'->>(c_a::text || ':0') is distinct from 'gold_out' then
      raise exception 'boss-call-series §6(h): a short purse reads %', public.hr_boss_call_plan(v_inst, v_mem, v_at); end if;
    update public.player_state set stamina_ms = v_c.fight_stamina_ms where user_id = c_a and slot = 0;
    if public.hr_boss_call_plan(v_inst, v_mem, v_at)->'stop'->>(c_a::text || ':0') is distinct from 'gold_out' then
      raise exception 'boss-call-series §6(h): a short purse with stamina reads %', public.hr_boss_call_plan(v_inst, v_mem, v_at); end if;
    update public.account_wallet set gold = v_c.fight_fee + v_keep where user_id = c_a;
    if (public.hr_boss_call_plan(v_inst, v_mem, v_at)->>'next')::boolean is not true then
      raise exception 'boss-call-series §6(h): an exact purse and an exact pool read %', public.hr_boss_call_plan(v_inst, v_mem, v_at); end if;
    update public.account_wallet set gold = v_c.fight_fee + v_keep - 1 where user_id = c_a;
    v_plan := public.hr_boss_call_plan(v_inst, v_mem, v_at);
    perform set_config('hr.boss_plan', v_plan::text, true);
    v_h := public.hr_boss_call_step(c_a, 0, v_sid, jsonb_build_object('progress', jsonb_build_array(v_kill)), '{"ok":true,"held":"boss_felled"}'::jsonb);
    if v_h->>'ended' is distinct from 'gold_out' or v_h ? 'held' then raise exception 'boss-call-series §6(h): the step answered %', v_h; end if;
    if not exists (select 1 from public.hunt_sessions h where h.id = v_sid and h.end_reason = 'gold_out' and h.ended_at = v_at and h.call_fight = 2 and h.call_won = 2)
       or (select gold from public.account_wallet where user_id = c_a) <> v_c.fight_fee + v_keep - 1
       or (select stamina_ms from public.player_state where user_id = c_a and slot = 0) <> v_c.fight_stamina_ms then
      raise exception 'boss-call-series §6(h): a series that ran out charged, or did not end: %', (select to_jsonb(h) from public.hunt_sessions h where h.id = v_sid); end if;
    perform set_config('hr.boss_plan', '', true);

    -- (i) THE LAST FIGHT HAS NO PLAN: a series of one ends on its win as any call did.
    update public.account_wallet set gold = 100000 where user_id = c_a;
    update public.player_state set stamina_ms = v_stam, stamina_at = now() where user_id = c_a and slot = 0;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_boss_call(0, 'rat_king', 1, v_c.fight_fee, (k || '00000d04')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'boss-call-series §6(i): a series of one answered %', v - 'boss_call'; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    select h.id, h.instance_id, h.hunt_from + interval '40 seconds' into v_sid, v_inst, v_at
      from public.hunt_sessions h where h.user_id = c_a and h.slot = 0 and h.ended_at is null;
    if public.hr_boss_call_plan(v_inst, jsonb_build_array(jsonb_build_object('user', c_a, 'slot', 0, 'session', v_sid,
         'hunt', jsonb_build_object('ended', jsonb_build_object('reason', 'boss_felled', 'at', v_at)))), v_at) is not null then
      raise exception 'boss-call-series §6(i): the last fight has a plan'; end if;
    perform public.hr_hunt_close(v_sid, 'boss_felled', v_at, true);

    -- (j) A PARTY: only the leader calls; every seat pays its own first fight; a seat that can't is named and nobody is charged.
    v_pid := public.hr_party_open(c_b, 0);
    perform public.hr_party_seat_into(v_pid, c_c, 0);
    update public.player_state set stamina_ms = v_c.fight_stamina_ms - 1, stamina_at = now() + interval '1 hour' where user_id = c_c and slot = 0;
    v_q := public.hr_boss_call_quote(c_b, 0, 'rat_king');
    if (v_q->>'available')::boolean is not false or v_q->>'why' is distinct from 'party_stamina' or (v_q->>'covers')::int <> 0 or v_q->>'who' is null then
      raise exception 'boss-call-series §6(j): a seat with no stamina is quoted %', v_q - 'totals'; end if;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_boss_call(0, 'rat_king', 2, v_c.fight_fee, (k || '00000d05')::uuid);
    if v->>'error' is distinct from 'party_stamina' or (select gold from public.account_wallet where user_id = c_b) <> 100000
       or exists (select 1 from public.hunt_sessions where instance_id = v_pid) then raise exception 'boss-call-series §6(j): a seat with no stamina answered %', v - 'boss_call'; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    update public.player_state set stamina_ms = v_stam, stamina_at = now() where user_id = c_c and slot = 0;
    update public.account_wallet set gold = v_c.fight_fee - 1 where user_id = c_c;
    v_q := public.hr_boss_call_quote(c_b, 0, 'rat_king');
    if v_q->>'why' is distinct from 'party_gold' then raise exception 'boss-call-series §6(j): a seat with no gold is quoted %', v_q - 'totals'; end if;
    update public.account_wallet set gold = 100000 where user_id = c_c;
    perform set_config('request.jwt.claim.sub', c_c::text, true);
    v := public.hr_boss_call(0, 'rat_king', 2, v_c.fight_fee, (k || '00000d06')::uuid);
    if v->>'error' is distinct from 'call_leader' then raise exception 'boss-call-series §6(j): a member answered %', v - 'boss_call'; end if;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_boss_call(0, 'rat_king', 2, v_c.fight_fee, (k || '00000d07')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'boss-call-series §6(j): the party''s call answered %', v - 'boss_call'; end if;
    if (select gold from public.account_wallet where user_id = c_b) <> 100000 - v_c.fight_fee or (select gold from public.account_wallet where user_id = c_c) <> 100000 - v_c.fight_fee
       or (select count(*) from public.hunt_sessions h where h.instance_id = v_pid and h.ended_at is null and h.call_fights = 2 and h.call_fight = 1) <> 2
       or (select count(*) from public.player_ledger where user_id = c_c and kind = 'shop' and intent = 'boss_call:rat_king:fight' and gold = -v_c.fight_fee) <> 1
       or (select stamina_ms from public.player_state where user_id = c_c and slot = 0) <> v_stam - v_c.fight_stamina_ms then
      raise exception 'boss-call-series §6(j): the party''s first fight was not charged to every seat once'; end if;
    -- one hero short of the next fight ends the series for both: the plan names it alone
    perform set_config('request.jwt.claim.sub', '', true);
    update public.player_state set stamina_ms = 0 where user_id = c_c and slot = 0;
    select h.hunt_from + interval '40 seconds' into v_at from public.hunt_sessions h where h.instance_id = v_pid and h.user_id = c_b;
    select jsonb_agg(jsonb_build_object('user', h.user_id, 'slot', h.slot, 'session', h.id, 'hunt', jsonb_build_object('ended', jsonb_build_object('reason', 'boss_felled', 'at', v_at))))
      into v_mem from public.hunt_sessions h where h.instance_id = v_pid and h.ended_at is null;
    v_plan := public.hr_boss_call_plan(v_pid, v_mem, v_at);
    if (v_plan->>'next')::boolean is not false or v_plan->'stop' <> jsonb_build_object(c_c::text || ':0', 'stamina') then raise exception 'boss-call-series §6(j): the party''s plan reads %', v_plan; end if;
    raise exception using errcode = 'HRL23', message = 'boss-call-series §6 complete - rolling back';
  exception when sqlstate 'HRL23' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('hr.boss_plan', '', true);
  if exists (select 1 from auth.users where id in (c_a, c_b, c_c)) then raise exception 'boss-call-series §6: LEAKED a probe row'; end if;
  raise notice 'boss-call-series: a forged count or fee is refused, every seat pays each fight, a win is a paid fight''s, the series ends on stamina or gold; all green';
end $$;
