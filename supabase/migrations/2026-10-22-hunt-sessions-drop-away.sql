-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — HUNT SESSIONS: DROP THE AWAY OBJECTS (lane C1, ruling
-- HR-2026-10-14 §3 "Delete"). STAGED, ORDERED AFTER LANE C2.
--
-- Drops, once nothing reads them:
--   player_state.last_away_receipt                       (away receipt)
--   player_state.auto_eat_enabled / _food / _pct / _set_at  (Auto-Eat -> the action bar)
--   hr_set_auto_eat(...)                                 (its client RPC + baseline row)
--   hr_credit_kills(...) / hr_credit_kills__ungated(...)  (attended kill credit + baseline row)
--   hr_offline_cap_ms(uuid, int)                         (the offline cap as a gameplay rule)
-- and restates hr_vigour_of so the daily grant no longer reads the offline cap:
-- a flat 720 min plus the clan perk (+60 at clan level 4, +120 more at 7),
-- which is the SAME number today's cap-derived grant produces for every
-- character (12 h base, +1 h, +2 h), so no Vigour moves on apply.
--
-- FAILS CLOSED. §1 lists every function body that still names one of these
-- objects outside a comment and REFUSES the whole file while any exists. On
-- the 2026-10-21 chain the readers are hr_apply, hr_state_of, hr_tick_settle,
-- hr_party_tick_settle, hr_party_hunt_view, hr_party_reap_stale,
-- hr_accrue_cap_ms, hr_return_anchor_presence, hr_create_character,
-- hr_put_client_state__ungated, hr_renown_of, hr_credit_combat_xp__ungated and
-- the four callers of hr_set_auto_eat's name — C2 (edge settle, horizon and
-- receipt removal) and the hr_apply / hr_state_of restatements remove them.
-- Two bodies name them as DATA, not code, and are exempt by name:
--   hr_rpc_gate              the dead 'hr_credit_kills' rate bucket (inert string)
--   hr_assert_grant_hygiene  its engine allowlist text (no call)
-- tests/hunt-sessions-db.mjs D1 proves the refusal on today's chain and that the
-- refusal is the only thing standing between this file and the drops.
--
-- EXCLUDED from the replay chain until C2 places it: a rebuilt database keeps
-- the objects until their readers are gone, exactly as production does.
-- REVERT: none needed before apply (it refuses). After apply, re-adding the
-- columns restores no data (the beta was wiped; the values were display-only).
-- No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ───────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hunt_sessions') is null then
    raise exception 'PRECONDITION: 2026-10-21-hunt-sessions.sql is not applied'; end if;
end $mig$;

-- ── §1 NOTHING MAY STILL READ WHAT IS ABOUT TO GO (hr_vigour_of excepted: §2 restates it) ─────────────────────────
do $mig$
declare v_readers text;
begin
  select string_agg(distinct p.oid::regprocedure::text || ' -> ' || o.obj, '; ')
    into v_readers
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
         unnest(array['last_away_receipt', 'auto_eat_enabled', 'auto_eat_food', 'auto_eat_pct', 'auto_eat_set_at',
                      'hr_credit_kills', 'hr_set_auto_eat', 'hr_offline_cap_ms']) o(obj)
   where n.nspname = 'public'
     and p.proname not in ('hr_set_auto_eat', 'hr_credit_kills', 'hr_credit_kills__ungated', 'hr_offline_cap_ms',
                           'hr_rpc_gate', 'hr_assert_grant_hygiene', 'hr_vigour_of')
     and regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^\n]*', '', 'g') ~ ('\m' || o.obj || '\M');
  if v_readers is not null then
    raise exception 'hunt-sessions-drop-away: still read by % — apply after lane C2 removes these readers', v_readers;
  end if;
end $mig$;

-- ── §2 hr_vigour_of: the grant stops reading the offline cap ───────────────
do $mig$
declare v_md5 text;
begin
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_vigour_of(uuid,integer)'::regprocedure;
  if v_md5 <> '7945f3149e7933788d855bb9fde6b26c' and strpos((select prosrc from pg_proc
       where oid = 'public.hr_vigour_of(uuid,integer)'::regprocedure), 'c_clan_lv4_min') = 0 then
    raise exception 'hr_vigour_of is not the body this file restates (md5 %); restate from that body instead', v_md5;
  end if;
end $mig$;

CREATE OR REPLACE FUNCTION public.hr_vigour_of(p_user uuid, p_slot integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- THE DAILY GRANT, in minutes (ruling HR-2026-10-14 §3): a flat 720 plus the
  -- clan perk, no longer derived from the offline cap. Mirrors src/core/hunt.js
  -- VIGOUR_FLOOR_MIN.
  c_floor_min    constant int := 720;
  c_clan_lv4_min constant int := 60;
  c_clan_lv7_min constant int := 120;
  -- The hard daily ceiling on PAID minutes. src/core/hunt.js VIGOUR_CEILING_MIN.
  c_ceiling_min constant int := 22 * 60;
  -- Minutes one refill adds (design 4.4). The PRICE and the per-day CAP are
  -- hr_vigour_price_rule's row, read through hr_vigour_refill_price.
  c_refill_min  constant int := 120;
  -- THE READ CLAMP on the day's counter: the most refills any rule row could
  -- ever have sold (refills_max CHECK <= 11, because 11 x 120 = the ceiling).
  c_refills_bound constant int := 11;
  v_day       text := public.hr_utc_day_key(now());
  v_slot      int  := coalesce(p_slot, 0);
  v_clan_lv   int;
  v_cap       int;
  v_grant     int;
  v_refills   int;
  v_bought    int;
  v_budget    int;
  v_left      int;
  v_next      jsonb;
  v_spent     bigint;
  v_spent_ms  bigint;
begin
  if p_user is null then return null; end if;

  -- (1) THE GRANT. Clan level from clan_members (no client write policy; the
  --     clan RPCs are its only writers), cumulative rungs as the clan perk table.
  select c.level into v_clan_lv
    from public.clan_members m join public.clans c on c.id = m.clan_id
   where m.user_id = p_user limit 1;
  v_grant := c_floor_min
           + case when coalesce(v_clan_lv, 0) >= 4 then c_clan_lv4_min else 0 end
           + case when coalesce(v_clan_lv, 0) >= 7 then c_clan_lv7_min else 0 end;

  -- (2) WHAT WAS BOUGHT TODAY, from the append-only daily counter the refill
  --     verb increments. The per-day cap gates what is still FOR SALE (3b),
  --     never what was bought (Security VP-1).
  select coalesce(value, 0)::int into v_refills from public.player_progress
   where user_id = p_user and slot = v_slot
     and kind = 'daily' and key = 'ev:vigour_refills' and period_key = v_day;
  v_refills := greatest(0, coalesce(v_refills, 0));
  select refills_max into v_cap from public.hr_vigour_price_rule where id;
  v_refills := least(c_refills_bound, v_refills);
  v_bought  := v_refills * c_refill_min;

  -- (3) THE BUDGET. The ceiling is applied here and only here.
  v_budget := least(c_ceiling_min, v_grant + v_bought);

  -- (3b) WHAT IS STILL FOR SALE, AND AT WHAT PRICE.
  v_left := greatest(0, least(coalesce(v_cap, 0) - v_refills,
                              (c_ceiling_min - v_budget) / c_refill_min));
  if v_left > 0 then
    v_next := public.hr_vigour_refill_price(p_user, v_slot, v_refills + 1);
  end if;
  if v_next is null then v_left := 0; end if;

  -- (4) WHAT HAS BEEN SPENT TODAY: the quotient and the remainder rows, summed
  --     and divided ONCE (finding S-1).
  select coalesce(sum(case when key = 'ev:vigour_min' then value else 0 end), 0) * 60000
       + coalesce(sum(case when key = 'ev:vigour_rem_ms' then value else 0 end), 0)
    into v_spent_ms
    from public.player_progress
   where user_id = p_user and slot = v_slot
     and kind = 'daily' and key in ('ev:vigour_min', 'ev:vigour_rem_ms')
     and period_key = v_day;
  v_spent := greatest(0, coalesce(v_spent_ms, 0)) / 60000;

  -- Vigour at 0 ENDS a hunt (ruling §2 end order); there is no dry-rate tail,
  -- so `dry_mult` is gone from the answer.
  return jsonb_build_object(
    'day_key',       v_day,
    'grant_min',     v_grant,
    'refills',       v_refills,
    'refills_max',   coalesce(v_cap, 0),
    'refill_min',    c_refill_min,
    'refills_left',  v_left,
    'next_refill_gold', (v_next->>'gold')::bigint,
    'level',         (v_next->>'level')::int,
    'bought_min',    v_bought,
    'budget_min',    v_budget,
    'ceiling_min',   c_ceiling_min,
    'spent_min',     v_spent,
    'remaining_min', greatest(0, v_budget - v_spent));
end $function$;

-- ── §3 THE DROPS ───────────────────────────────────────────────────────────
drop function if exists public.hr_set_auto_eat(integer, boolean, text, integer, boolean);
drop function if exists public.hr_credit_kills(integer, text, bigint, text);
drop function if exists public.hr_credit_kills__ungated(integer, text, bigint, text);
drop function if exists public.hr_offline_cap_ms(uuid, integer);
alter table public.player_state drop column if exists last_away_receipt;
alter table public.player_state drop column if exists auto_eat_enabled;
alter table public.player_state drop column if exists auto_eat_food;
alter table public.player_state drop column if exists auto_eat_pct;
alter table public.player_state drop column if exists auto_eat_set_at;
delete from public.hr_client_rpc_baseline
 where grantee = 'authenticated' and proname in ('hr_set_auto_eat', 'hr_credit_kills');

-- ── §4 SELF-CHECK, EXECUTED ────────────────────────────────────────────────
do $mig$
declare v_h jsonb;
begin
  if to_regprocedure('public.hr_set_auto_eat(integer,boolean,text,integer,boolean)') is not null
     or to_regprocedure('public.hr_credit_kills(integer,text,bigint,text)') is not null
     or to_regprocedure('public.hr_offline_cap_ms(uuid,integer)') is not null
     or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_state'
                  and column_name in ('last_away_receipt', 'auto_eat_enabled', 'auto_eat_food', 'auto_eat_pct', 'auto_eat_set_at')) then
    raise exception 'GATE(a): an away object survived the drop'; end if;
  if (public.hr_vigour_of(gen_random_uuid(), 0)->>'grant_min')::int <> 720 then
    raise exception 'GATE(b): a clanless character''s grant is not 720'; end if;
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    v_h := public.hr_assert_grant_hygiene(true);
    if jsonb_array_length(coalesce(v_h->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_h->'ungated_client_rpcs', '[]'::jsonb)) <> 0 then
      raise exception 'GATE(c): hr_assert_grant_hygiene is RED after the drop: %', v_h; end if;
  end if;
end $mig$;
