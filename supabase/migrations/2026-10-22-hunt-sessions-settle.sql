-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — HUNT SESSIONS: THE SETTLE (lane C2, ruling HR-2026-10-14
-- "Hunt Sessions replace away", §2 / §4 / §5 row C2).
-- STAGED, NOT APPLIED — REVIEW ONLY. Lane C: Security GO, then the Coordinator
-- applies (tools/apply-migration.mjs, one file, never inside begin/commit,
-- never 00:00–00:10 UTC). Applies AFTER 2026-10-21-hunt-sessions.sql (C1).
-- EDGE HALF: supabase/functions/hr-accrue/hunt-settle.js (the settle),
-- tick.js (the world tick carries `hunts`), index.ts (the hunt_settle /
-- hunt_use verbs). The edge and this file are safe in either order: an edge
-- without this file answers `no_hunt` (hr_hunt_open_of is absent → 42883 →
-- the hunt path is off); this file without the edge posts `hunts` to an edge
-- that ignores the key.
--
-- ── THE ONE RULE (ruling §2): THE WORLD TICK IS THE ONLY THING THAT SETTLES
--    A SESSION — plus the two hunt verbs a player can press, which run the
--    SAME settle through the SAME door.
--
-- ── WHAT ONE SETTLE IS ───────────────────────────────────────────────────────
--   The edge reads the session (hr_hunt_engine_read) and the character
--   (hr_state_of), runs computeAccrual with the session attached
--   (simulateHuntSpan — the one combat engine, per-swing keyed seeds), and
--   hands TWO halves of one proposal to ONE statement:
--
--     hr_hunt_apply(user, slot, session, version, intent, delta, hunt, buffs, press)
--       (1) the character lock + the session row (hr_hunt_lock — hr_apply's key)
--       (2) a manual press, validated exactly as hr_hunt_use validates it
--       (3) hr_apply(delta)  with hr.hunt_session set, so every ledger row it
--           writes (the accrue row, the death rows) is stamped with the session
--       (4) the press lands; the action bar's buff queue is validated + written
--      (5a) THE STAMINA POOL (Tyler 2026-10-14, "1:1 like Huntera"): the
--           window's end value, re-bounded against the pool at the window
--           start (hr_stamina_of), its paid / knocked-out time and the death
--           rows' recovery, written at `to`
--      (5b) THE SHOP, PAID PER USE (Tyler 2026-10-14): every use the window
--           bought re-priced from hr_hunt_basic_supplies, capped by the
--           window and the day, the gold debited and ONE `supply_buy` row
--           journalled (kind 'hunt'), the tally's Waste credited
--       (5) hr_hunt_settle_session(hunt): swing CAS, window, bag, use caps,
--           presses-only-shrink, falls = the death rows (3) just wrote, every
--           end re-proved, tally folded from the stamped rows, events derived
--       (6) THE PRICE OF THE FALLS (Tyler 2026-10-14): each fall's `death_xp`
--           (src/data/hunt-sessions.js DEATH_XP_LOSS, the limits row
--           `death_xp_permille`) re-bounded against player_skills, never below
--           the level the window started at, debited, ONE `death_xp` row
--           (kind 'hunt') per settle that cost anything, stated on each `fall`
--           event; a level_up event a fall took back is corrected
--       (7) AN AUTOMATIC END RESUMES WHAT THE CHARACTER WAS DOING (Tyler
--           2026-10-14): after the walk home the pointer is the character's
--           last non-hunt activity (player_state.last_activity_*), if its
--           catalogue row and skill gate still admit it; else idle. Journalled
--           (`resume`), stated on the `ended` event
--     All of (2)–(7) is ONE SUBTRANSACTION: any refusal in it (hr_apply's own
--     {ok:false}, an HR000 from the session applier) rolls every write of the
--     settle back, journals the refusal (hr_record_rejection, aggregated), and
--     answers {ok:false, error, stage}. Nothing half-lands: the value and the
--     session clock move together or not at all.
--
--   Edge decides WHAT should happen; Postgres decides WHETHER IT MAY.
--
-- ── STAMINA (Tyler 2026-10-14: "steal the stamina system, 1:1 like Huntera,
--    keep it simple"; Huntera's bar is 12 h) ────────────────────────────────
--   player_state.stamina_ms / stamina_at: the pool's value AT an instant (both
--   null = full). It DRAINS 1:1 over every swing interval a session spends
--   hunting and RESTS 1:1 over every other instant (the walk out, a knockout,
--   town, no hunt at all), capped at hr_hunt_limit('stamina_max_min') (from
--   src/data/hunt-sessions.js STAMINA_MAX_MS) and never lowered by resting.
--   The engine walks it swing by swing (src/core/action-rules.js staminaStep);
--   the settle writes the window's end value at `to` (§5 (5a)); hr_stamina_of
--   projects the rest-only stretch from the row to any later instant. At 0 the
--   hunt ends `stamina` (END_ORDER, where Vigour stood), re-proved from the row
--   by hr_hunt_settle_session; hr_hunt_enter refuses `no_stamina` at 0. The
--   envelope projects it (`stamina`: ms / at / max_ms / hunting, §4c).
--   THE REFILL HOOK (a separate reviewed lane, never Crowns): a refill adds to
--   the value at `at := coalesce(open session's settled_to, now())` — i.e.
--   `stamina_ms = hr_stamina_of(user, slot, at) + add, stamina_at = at` under
--   hr_hunt_lock — and never moves stamina_at past an open session's
--   settled_to (hr_hunt_apply refuses that row `stamina_ahead`).
--   VIGOUR PLAYS NO PART IN A HUNT any more: no end, no tail, no charge, no
--   entry gate (the engine skips the session's charge; §4c swaps the gate).
--
-- ── GOLD MOVES INSIDE THE SETTLE (Tyler 2026-10-14: the shop, paid per use) ──
--   The shop's supplies (hr_hunt_basic_supplies, generated from
--   src/data/supply-basics.js) are NOT items: a shop slot (`*heal_shop` — the
--   row for this hunt's tier — or a shop id named directly) buys one use when
--   it fires, and an empty arrow / rune line falls back per shot to the shop
--   shot with the same partner. The engine proposes USES only (`buys`); (5b)
--   prices them from the catalogue (`not_for_sale` otherwise), caps heal buys
--   + bag heals by the window's heal cooldown, drinks by the mana cooldown,
--   shots by the swings walked, every kind by the same bounds over the UTC day
--   (`too_many_buys`), refuses a debit the character's gold cannot cover
--   (`gold_short`), debits, and journals ONE row per settle. A buy the purse
--   cannot cover ends the hunt `gold_out` at the next boundary (re-proved: the
--   character's gold is below the dearest shop use the bar or the quiver could
--   need). Drinks are inert until the mana engine ships, and refused here
--   (`kind_not_sold`: no kind is sold without a cap row — master plan row 18).
--   THE GOLD FLOOR AND SELL-TO-COVER (master plan row 3): a shop use never takes
--   gold below the action set's `gold_floor` (default 300); when one would, the
--   hunt first sells THIS session's loot of the generated hr_hunt_cover_items
--   to the vendor, cheapest first. (5b) re-prices every unit at
--   hr_hunt_vendor_value and bounds it by the session's own loot still in the
--   bag (`cover_over`), credits it and journals ONE `vendor_cover` row (kind
--   'hunt', positive gold) and a `cover` event, BEFORE the buys are debited.
--
-- ── MASTER PLAN 2026-10-14 (rows 4, 5, 16, 20, 25), ALSO IN THIS FILE ─────────
--   · a knockout in a hunt is a flat KNOCKOUT_MS (60 s): a death row with any
--     other recovery_ms is refused `bad_knockout`; three falls end every hunt
--   · `stamina_low` (≤ 60 min left) replaces C1's `vigour_low` event
--   · an automatic end that resumes an activity stamps a fresh presence anchor
--     (hr_return_anchor, raise-only) at the walk-home instant
--   · hr_vigour_refill is REVOKED from clients (hunts no longer spend Vigour)
--   · a new character: shop slots OFF in the default bar, gold floor 300,
--     resume = fishing the Shrimp Spot (generated column defaults)
--
-- ── THE OLD COMBAT PATH CANNOT PAY A HUNTER (C1 note 2) ─────────────────────
--   hr_hunt_accrue_fence: a BEFORE INSERT trigger on player_ledger that refuses
--   (hr_reject 'hunt_open') a combat ACCRUE row for a character holding an open
--   session unless the row is being written inside that session's own settle
--   (hr.hunt_session names it). hr_apply turns the HR000 into {ok:false,
--   error:'hunt_open'} and writes nothing. The edge already routes around it;
--   this makes it a property of the database.
--
-- ── WHO GETS SETTLED, AND WHEN (the world tick) ─────────────────────────────
--   hr_hunt_roster (hr_tick only) hands the cron driver the OPEN sessions that
--   are DUE, leased per session (hunt_tick_lease, `for update skip locked`):
--     · a pending leave / change, or the kill switch off   → the next fire
--     · an ONLINE character (heartbeat within 75 s)         → every flush
--     · an AWAY character                                   → every flush x fold
--   the SAME geometry the gather tick uses (hr_tick_config), so a hunt writes
--   at most the accrue row's rate: 960 settles/day online, 120 away at fold 8.
--   hr_tick_cron_run (restated, §8) posts them as their own body (`hunts`,
--   empty roster) to the same edge, under shard 0's holder. A session whose
--   settle is refused stays due and is offered again: owed, never lost.
--
-- ── IDEMPOTENCY AND CONCURRENCY (Security design review 2026-10-14 item 8) ──
--   Every settle carries an intent key: the tick derives it from
--   (session, swing_from, version, the session secret); a press carries the
--   player's own key. hr_apply's player_intents makes a replay answer
--   `replayed` and the wrapper then writes NOTHING else. Two settlers racing
--   one session serialise on hr_hunt_lock (hr_apply's per-character key + the
--   session row FOR UPDATE); the loser is refused by the STORED INDEX check —
--   swing_from must equal the row's swing_index (`session_moved`), asked
--   under the lock before anything is written — and re-reads. There is NO CAS
--   on player_state.version: hr_hunt_apply hands hr_apply the version it reads
--   under the lock, so a player verb that bumps the version between the read
--   and the apply (a market listing, a bank move) can never starve the tick's
--   settle. Every input of the window the engine read and a verb could move is
--   either settle-first gated (C1's 20 s slack), on the session row (whose
--   swing_index any other settle moves), or re-proved here (the pull, the pool,
--   the gold). The lease only spares the duplicate engine work.
--
-- ── THE SPAWN CYCLE: A STATEFUL KILL CAP (Security design review items 1-2) ─
--   A ground shows `pull` foes at once and a pull is back `respawn_ms` after it
--   STARTED (src/data/hunts.js, generated into hr_hunt_travel). The pull a hunt
--   runs is the SERVER's: hr_hunt_pull_of = the action set's pull_count
--   clamped to the ground's pull and to hr_hunt_limit('pull_cap') (rule-
--   subjects.js PULL_CAP, the ONE place the player-dial ruling lands), with
--   the respawn scaled to it — so the dial moves the rhythm, never the kills
--   an hour. hunt_instances.pull_left / respawn_at (S1) carry the cycle window to
--   window (respawn_at null = the arrival). Every settle re-proves, with K the
--   kills its own stamped ledger rows journal:
--     K = pull_left_old + P x n - pull_left_new        (exact; no "+1")
--     n <= respawns the window admits after respawn_at_old
--     0 <= pull_left_new <= (n > 0 ? P : pull_left_old)
--     n = 0: respawn_at unchanged; else respawn_at_old + n x respawn
--            <= respawn_at_new < to + respawn       (forward only)
--   and refuses (`pull_over`, `bad_pull`; `session_moved` when the pull the
--   engine ran is not the one the row gives now). Kills/h is bounded by the
--   ground however the windows are cut — never by a per-settle rate.
--
-- ── SCALE (100x: ~600 hunters) ──────────────────────────────────────────────
--   rows/day per hunting character: accrue 120 (away) – 960 (online all day),
--   + one consumption row per settle that used anything (C1), + death rows
--   (ladder-bounded), + hunt_session_events (~5-30/session). hunt_tick_lease:
--   one row per open session, upserted per visit, deleted with the session.
--   At 600 hunters: ≤ ~1.2 M ledger rows/day all online, ~150 k all away —
--   inside the 480 k/day prune ceiling at realistic online share; the same
--   envelope the gather tick was sized at.
--
-- ── REVERT (targeted) ───────────────────────────────────────────────────────
--   Re-apply the hr_tick_cron_run statement of 2026-10-11-world-tick-catchup.sql
--   §2; drop trigger hr_hunt_accrue_fence; drop functions hr_hunt_roster,
--   hr_hunt_apply, hr_hunt_buffs_put, hr_hunt_engine_read, hr_hunt_open_of,
--   hr_hunt_accrue_fence, hr_stamina_view, hr_stamina_of; drop table
--   hunt_tick_lease; re-apply the hr_assert_grant_hygiene block of
--   2026-10-10-world-tick-presence-horizon.sql; re-apply hr_hunt_enter and
--   hr_hunt_settle_session from 2026-10-21-hunt-sessions.sql and hr_state_of from
--   2026-10-19-account-wallet.sql (§4c's anchored edits). The two stamina
--   columns may stay (inert without a reader). No gold, item or XP is held by
--   anything this file creates; the stamina pool is a clock, not a balance.
-- No begin/commit (CLAUDE.md §2 — tools/apply-migration.mjs sends one batch).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ───────────────────────────────────────────────────────
do $mig$
declare v_cron text;
begin
  if to_regclass('public.hunt_sessions') is null or to_regclass('public.hunt_bag') is null
     or to_regprocedure('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)') is null
     or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_view(uuid)') is null
     or to_regprocedure('public.hr_hunt_preset_slots(uuid,integer,integer)') is null
     or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null
     or to_regprocedure('public.hr_state_of(uuid,integer)') is null
     or to_regprocedure('public.hr_seed(uuid,integer,text)') is null
     or to_regclass('public.hr_item_buffs') is null or to_regclass('public.hr_hunt_supplies') is null
     or to_regclass('public.hr_tick_config') is null then
    raise exception 'PRECONDITION: the hunt-session tables / applier (2026-10-21-hunt-sessions.sql), hr_apply, '
                    'hr_state_of, hr_seed, hr_item_buffs, hr_hunt_supplies or hr_tick_config is absent';
  end if;
  -- CLOSED MODE applies first (2026-10-21-closed-mode.sql): hr_engine_closed
  -- below asks its hr_admitted.
  if to_regprocedure('public.hr_admitted(uuid)') is null
     or to_regprocedure('public.hr_record_rejection(uuid,integer,text,text,jsonb,bigint)') is null then
    raise exception 'PRECONDITION: hr_admitted (2026-10-21-closed-mode.sql) or hr_record_rejection is absent';
  end if;
  -- The C2 catalogue (2026-10-22-hunt-sessions-catalogue.generated.sql) carries
  -- the price of a fall and the stamina cap, and puts 'stamina' where 'vigour'
  -- stood in the end order; it applies first.
  if not exists (select 1 from public.hr_hunt_limits where key = 'death_xp_permille' and value > 0)
     or not exists (select 1 from public.hr_hunt_limits where key = 'stamina_max_min' and value > 0)
     or not exists (select 1 from public.hr_hunt_end_reasons where reason = 'stamina')
     or not exists (select 1 from public.hr_hunt_end_reasons where reason = 'gold_out')
     or not exists (select 1 from public.hr_hunt_limits where key = 'pull_min')
     or to_regclass('public.hr_hunt_resumable_kinds') is null
     or to_regclass('public.hr_hunt_target_modes') is null
     or to_regclass('public.hr_hunt_basic_supplies') is null or to_regclass('public.hr_hunt_slot_targets') is null
     or to_regclass('public.hr_hunt_cover_items') is null
     or not exists (select 1 from public.hr_hunt_limits where key = 'knockout_ms')
     or not exists (select 1 from public.hr_hunt_limits where key = 'stamina_low_min')
     or not exists (select 1 from public.hr_hunt_limits where key = 'gold_floor_default')
     or to_regclass('public.hr_return_anchor') is null
     or exists (select 1 from public.hr_hunt_end_reasons where reason = 'vigour') then
    raise exception 'PRECONDITION: 2026-10-22-hunt-sessions-catalogue.generated.sql is not applied '
                    '(no death_xp_permille / stamina_max_min limit, no stamina end, or vigour still ends a hunt)';
  end if;
  if to_regprocedure('public.hr_hunt_enter(integer,text,jsonb,integer,integer,integer,uuid)') is null then
    raise exception 'PRECONDITION: hr_hunt_enter (2026-10-21-hunt-sessions.sql) is absent';
  end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_cron from pg_proc p
   where p.oid = to_regprocedure('public.hr_tick_cron_run()');
  if v_cron is null or v_cron not in ('aa35ea7090c298e145d8b55e90a39645', 'd05cbc3948b4ad0a2c90a3e72ae62da8') then
    raise exception 'PRECONDITION: hr_tick_cron_run prosrc md5 is %, expected 2026-10-11-world-tick-catchup.sql''s '
                    'aa35ea7090c298e145d8b55e90a39645 or this file''s d05cbc3948b4ad0a2c90a3e72ae62da8 — restate from the installed body', v_cron;
  end if;
  -- The online test below restates hr_frame_wanted's: 75 s, not in the future.
  if position('interval ''75 seconds''' in (select p.prosrc from pg_proc p
                where p.oid = to_regprocedure('public.hr_frame_wanted(uuid,integer)'))) = 0 then
    raise exception 'PRECONDITION: hr_frame_wanted no longer uses a 75 s heartbeat; re-derive the roster''s online test.';
  end if;
end $mig$;

-- ── §1 THE TICK LEASE (one row per open session the driver is settling) ────
create table if not exists public.hunt_tick_lease (
  session_id  uuid primary key references public.hunt_sessions (id) on delete cascade,
  holder      text not null check (char_length(holder) between 1 and 64),
  lease_until timestamptz not null
);
alter table public.hunt_tick_lease enable row level security;
revoke all on public.hunt_tick_lease from public, anon, authenticated, service_role;
comment on table public.hunt_tick_lease is
  '2026-10-22 (hunt sessions C2). Which world-tick driver is settling which open session, until when. '
  'OPERATIONAL: holds no value; written only by hr_hunt_roster; deleted with its session. The lease spares '
  'duplicate engine work only — the character lock + swing CAS in hr_hunt_apply are the correctness.';

-- ── §1b THE STAMINA POOL (Tyler 2026-10-14) ───────────────────────────────
-- The value AT an instant; both null = full (a new character, or one that has
-- never hunted). Written only by hr_hunt_apply (§5 (5a)); no client role holds
-- UPDATE on player_state (its RLS has no client write policy). Upper bound a
-- week of ms: room for a refill above the cap, nowhere near an overflow.
alter table public.player_state add column if not exists stamina_ms bigint;
alter table public.player_state add column if not exists stamina_at timestamptz;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'player_state_stamina_ck'
                   and conrelid = 'public.player_state'::regclass) then
    alter table public.player_state add constraint player_state_stamina_ck
      check ((stamina_ms is null) = (stamina_at is null)
             and (stamina_ms is null or stamina_ms between 0 and 604800000));
  end if;
end $mig$;
comment on column public.player_state.stamina_ms is
  '2026-10-22 (hunt sessions C2, Tyler 2026-10-14). The stamina pool in ms AT stamina_at; null = full. '
  'Drains 1:1 while a session hunts, rests 1:1 otherwise up to hr_hunt_limit(''stamina_max_min''). '
  'Written only by hr_hunt_apply; read through hr_stamina_of.';
comment on column public.player_state.stamina_at is
  '2026-10-22 (hunt sessions C2). The instant stamina_ms holds at (a settle''s window end). Never past an open '
  'session''s settled_to.';

-- THE TALLY'S WASTE FROM THE SHOP (Tyler 2026-10-14): uses bought per shop id and
-- the gold they cost, folded by hr_hunt_apply (5b) from its own `supply_buy` row.
alter table public.hunt_session_tally add column if not exists bought jsonb not null default '{}'::jsonb;
alter table public.hunt_session_tally add column if not exists supply_gold bigint not null default 0;
-- Sell-to-cover (master plan row 3): units sold per item and the gold they fetched.
alter table public.hunt_session_tally add column if not exists covered jsonb not null default '{}'::jsonb;
alter table public.hunt_session_tally add column if not exists cover_gold bigint not null default 0;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'hunt_session_tally_buys_ck'
                   and conrelid = 'public.hunt_session_tally'::regclass) then
    alter table public.hunt_session_tally add constraint hunt_session_tally_buys_ck
      check (jsonb_typeof(bought) = 'object' and supply_gold >= 0
             and jsonb_typeof(covered) = 'object' and cover_gold >= 0);
  end if;
end $mig$;

-- THE HUNT INSTANCE (architecture contracts S1). The spawn cycle's state —
-- foes of the current pull still standing, and when the next pull is due
-- (null = the arrival, the session's hunt_from) — lives on an INSTANCE row,
-- never on hunt_sessions: a party will share ONE instance across several
-- sessions, which the one-open-session-per-character index cannot hold. A solo
-- session gets its own instance, created with it, whose id IS the session id —
-- so a solo hunt's seed labels (`hunt:<instance>:…`) and every solo replay keep
-- one identity. Written only by hr_hunt_apply, forward only; RLS on, no policy,
-- no client grant.
create table if not exists public.hunt_instances (
  id         uuid primary key,
  hunt_id    text not null check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  kind       text not null default 'solo' check (kind in ('solo', 'party')),
  pull_left  int  not null default 0 check (pull_left between 0 and 64),
  respawn_at timestamptz,
  version    bigint not null default 0,
  created_at timestamptz not null default now()
);
alter table public.hunt_instances enable row level security;
revoke all on public.hunt_instances from public, anon, authenticated, service_role;
alter table public.hunt_sessions add column if not exists instance_id uuid references public.hunt_instances (id);
-- Every session that exists before this file gets its solo instance (the wipe
-- leaves none on production; a rebuilt chain has none either).
insert into public.hunt_instances (id, hunt_id, kind)
  select h.id, h.hunt_id, 'solo' from public.hunt_sessions h
   where h.instance_id is null
  on conflict (id) do nothing;
update public.hunt_sessions set instance_id = id where instance_id is null;
alter table public.hunt_sessions alter column instance_id set not null;
create index if not exists hunt_sessions_instance_idx on public.hunt_sessions (instance_id);
create or replace function public.hr_hunt_instance_solo()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if new.instance_id is null then
    insert into public.hunt_instances (id, hunt_id, kind) values (new.id, new.hunt_id, 'solo')
      on conflict (id) do nothing;
    new.instance_id := new.id;
  end if;
  return new;
end $$;
revoke execute on function public.hr_hunt_instance_solo() from public, anon, authenticated, service_role;
drop trigger if exists hr_hunt_instance_solo on public.hunt_sessions;
create trigger hr_hunt_instance_solo before insert on public.hunt_sessions
  for each row execute function public.hr_hunt_instance_solo();
comment on table public.hunt_instances is
  '2026-10-22 (hunt sessions C2, architecture contracts S1). The shared state of one hunting ground instance '
  '(the spawn cycle). Solo: 1:1 with its session, id = session id. Written only by hr_hunt_apply.';

-- THE PULL A HUNT RUNS: the action set's pull count, clamped to the ground's
-- pull and to the ONE cap row (pull_cap; 0 = none), and the ground's respawn
-- scaled to it. Null when the catalogue row is missing (callers refuse).
create or replace function public.hr_hunt_pull_of(p_user uuid, p_slot int, p_session uuid)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  select jsonb_build_object('size', z.size,
           'respawn_ms', ceil(t.respawn_ms::numeric * z.size / t.pull_size)::bigint)
    from public.hunt_sessions h
    join public.hr_hunt_travel t on t.hunt_id = h.hunt_id
    cross join lateral (select greatest(1, least(t.pull_size,
             coalesce((select a.pull_count from public.player_action_sets a
                        where a.user_id = h.user_id and a.slot = h.slot and a.preset = h.preset),
                      public.hr_hunt_limit('pull_default'), 1),
             coalesce(nullif(public.hr_hunt_limit('pull_cap'), 0), t.pull_size))) as size) z
   where h.id = p_session and h.user_id = p_user and h.slot = p_slot
     and t.pull_size is not null and t.respawn_ms is not null
$$;

-- THE LAST NON-HUNT ACTIVITY (Tyler 2026-10-14). Every pointer move onto a
-- resumable kind (hr_hunt_resumable_kinds: gather, artisan; `training` reserved)
-- is remembered, whichever writer made it — so an automatic hunt end can send
-- the character back to it. A BEFORE trigger on the pointer columns only; it
-- never refuses a write (an id outside the catalogue shape is simply not noted).
create or replace function public.hr_last_activity_note()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  if (new.active_kind is distinct from old.active_kind or new.active_id is distinct from old.active_id)
     and new.active_id is not null and new.active_id ~ '^[a-z0-9_]{1,64}$'
     and exists (select 1 from public.hr_hunt_resumable_kinds k where k.kind = new.active_kind) then
    new.last_activity_kind := new.active_kind;
    new.last_activity_id := new.active_id;
  end if;
  return new;
end $$;
drop trigger if exists hr_last_activity_note on public.player_state;
create trigger hr_last_activity_note before update of active_kind, active_id on public.player_state
  for each row execute function public.hr_last_activity_note();

-- The pool at `p_at`, given that nothing HUNTED between stamina_at and p_at
-- (true by construction: while a session is open stamina_at = its settled_to,
-- and every earlier instant was rest). Rest never LOWERS a value (a refill may
-- hold it above the cap). Null when the cap row is missing — callers refuse.
create or replace function public.hr_stamina_of(p_user uuid, p_slot int, p_at timestamptz)
returns bigint language sql stable set search_path = public, pg_catalog as $$
  select case
           when m.cap is null then null
           when ps.stamina_at is null then m.cap
           when p_at is null or p_at <= ps.stamina_at then ps.stamina_ms
           else greatest(ps.stamina_ms, least(m.cap, ps.stamina_ms
                  + floor(extract(epoch from (p_at - ps.stamina_at)) * 1000)::bigint))
         end
    from public.player_state ps
   cross join (select public.hr_hunt_limit('stamina_max_min')::bigint * 60000 as cap) m
   where ps.user_id = p_user and ps.slot = p_slot
$$;

-- What the envelope shows (display = the server's value, CLAUDE.md §6). While
-- a session is HUNTING the value is the one its last settle wrote, at its
-- settled_to; otherwise it is the pool now. `hunting` tells the renderer which
-- way to count between envelopes — display only, replaced by the next one.
create or replace function public.hr_stamina_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare
  v_s   public.hunt_sessions%rowtype;
  v_hunting boolean;
  v_at  timestamptz;
begin
  select * into v_s from public.hunt_sessions h
   where h.user_id = p_user and h.slot = p_slot and h.ended_at is null;
  v_hunting := found and now() >= v_s.hunt_from;
  v_at := case when v_hunting then v_s.settled_to else now() end;
  return jsonb_build_object(
    'ms', public.hr_stamina_of(p_user, p_slot, v_at),
    'at', v_at,
    'max_ms', public.hr_hunt_limit('stamina_max_min')::bigint * 60000,
    'hunting', v_hunting);
end $$;

-- ── §2 hr_hunt_open_of — the engine's cheap "is a hunt open?" ──────────────
-- The accrue and collect paths ask it so the old combat pricing never runs for
-- a hunter (it answers hunt_open instead). Read-only, one indexed row.
create or replace function public.hr_hunt_open_of(p_user uuid, p_slot int)
returns uuid language sql stable security definer set search_path = public, pg_catalog as $$
  select h.id from public.hunt_sessions h
   where h.user_id = p_user and h.slot = p_slot and h.ended_at is null
$$;

-- ── §3 hr_hunt_engine_read — everything the settle needs about ONE session ──
-- Instants travel as EPOCH MILLISECONDS rounded UP (ceil): the engine walks a
-- millisecond clock, and every server instant it compares against (hunt_from
-- for the hours limit, leave_at, change_at, settled_to) must never read
-- EARLIER in the engine than in this database — an end the engine stamped a
-- microsecond before the stored instant would be refused `end_not_proven`.
-- `secret` is hr_seed(user, slot, 'hunt:' || session): the key of the edge's
-- per-swing HMAC (hunt-seed.js). Like every hr_seed value it is reachable by
-- the engine role only; no client role can call this function or hr_seed.
create or replace function public.hr_hunt_engine_read(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_role text;
  v_s    public.hunt_sessions%rowtype;
begin
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role') then
    raise exception 'hr_hunt_engine_read: not callable by %', v_role using errcode = '42501';
  end if;
  if p_user is null or p_slot is null then return null; end if;
  select * into v_s from public.hunt_sessions h
   where h.user_id = p_user and h.slot = p_slot and h.ended_at is null;
  if not found then return jsonb_build_object('open', false); end if;
  return jsonb_build_object(
    'open', true,
    'id', v_s.id, 'hunt', v_s.hunt_id, 'preset', v_s.preset, 'version', v_s.version,
    'hunt_from_ms', ceil(extract(epoch from v_s.hunt_from) * 1000)::bigint,
    'settled_to_ms', ceil(extract(epoch from v_s.settled_to) * 1000)::bigint,
    'next_swing_at_ms', ceil(extract(epoch from v_s.next_swing_at) * 1000)::bigint,
    'swing_index', v_s.swing_index, 'falls', v_s.falls, 'falls_limit', v_s.falls_limit,
    'hours_limit', v_s.hours_limit, 'down', v_s.down,
    'cooldowns', v_s.cooldowns, 'presses', v_s.presses,
    'leave_at_ms', case when v_s.leave_at is null then null else ceil(extract(epoch from v_s.leave_at) * 1000)::bigint end,
    'change_at_ms', case when v_s.change_at is null then null else ceil(extract(epoch from v_s.change_at) * 1000)::bigint end,
    'change_to', v_s.change_to,
    'bag', coalesce((select jsonb_object_agg(b.item_id, jsonb_build_object(
                       'loaded', b.qty_loaded, 'left', b.qty_left, 'essential', b.essential))
                     from public.hunt_bag b where b.session_id = v_s.id), '{}'::jsonb),
    'slots', coalesce(public.hr_hunt_preset_slots(p_user, p_slot, v_s.preset), '[]'::jsonb),
    'secret', public.hr_seed(p_user, p_slot, 'hunt:' || v_s.id::text)::text,
    'enabled', coalesce((select c.enabled from public.hr_hunt_config c where c.id), false),
    -- THE STAMINA POOL AT THE WINDOW START (settled_to), by the same function
    -- hr_hunt_apply re-derives it with under the lock.
    'stamina_ms', public.hr_stamina_of(p_user, p_slot, v_s.settled_to),
    -- THE SHOP (catalogue), the ids a shop slot resolves to at this hunt's tier,
    -- and the running action set's target mode and pull count (stored rows;
    -- the defaults when none is saved).
    'basics', coalesce((select jsonb_object_agg(b.basic_id, jsonb_build_object('kind', b.kind, 'price', b.price,
                          'heals', b.heals, 'mana', b.mana, 'partner', b.partner))
                          from public.hr_hunt_basic_supplies b), '{}'::jsonb),
    'shop', (select jsonb_build_object(
               'heal', (select b.basic_id from public.hr_hunt_basic_supplies b where b.kind = 'heal' and t.tier = any (b.tiers)
                          order by b.basic_id limit 1),
               'mana', (select b.basic_id from public.hr_hunt_basic_supplies b where b.kind = 'mana' and t.tier = any (b.tiers)
                          order by b.basic_id limit 1))
               from public.hr_hunt_travel t where t.hunt_id = v_s.hunt_id),
    'target_mode', coalesce((select a.target_mode from public.player_action_sets a
                              where a.user_id = p_user and a.slot = p_slot and a.preset = v_s.preset), 'nearest'),
    'pull_count', coalesce((select a.pull_count from public.player_action_sets a
                             where a.user_id = p_user and a.slot = p_slot and a.preset = v_s.preset),
                           public.hr_hunt_limit('pull_default')),
    -- THE SPAWN CYCLE: the pull the server runs and the row's cycle state
    -- (respawn_at null = the arrival), in engine milliseconds.
    'pull', public.hr_hunt_pull_of(p_user, p_slot, v_s.id) || (select jsonb_build_object(
              'left', i.pull_left,
              'respawn_at_ms', ceil(extract(epoch from coalesce(i.respawn_at, v_s.hunt_from)) * 1000)::bigint)
              from public.hunt_instances i where i.id = v_s.instance_id),
    -- THE INSTANCE the seeds are labelled by (`hunt:<instance>:<domain>:<i>`).
    'instance', v_s.instance_id,
    -- THE GOLD FLOOR, and what sell-to-cover may sell: every cover item's vendor
    -- price, with what THIS session looted of it, not yet sold, still in the bag.
    'gold_floor', coalesce((select a.gold_floor from public.player_action_sets a
                             where a.user_id = p_user and a.slot = p_slot and a.preset = v_s.preset),
                           public.hr_hunt_limit('gold_floor_default')),
    -- HUNT SUPPLIES (Master Design Reference §4): where supplies come from
    -- ('mine' | 'store') and what an empty carried line does ('end' | 'switch').
    -- No stored set reads 'mine' + 'end' — the store is never silent.
    'supply_source', coalesce((select a.supply_source from public.player_action_sets a
                                where a.user_id = p_user and a.slot = p_slot and a.preset = v_s.preset), 'mine'),
    'on_empty', coalesce((select a.on_empty from public.player_action_sets a
                           where a.user_id = p_user and a.slot = p_slot and a.preset = v_s.preset), 'end'),
    'cover', coalesce((select jsonb_object_agg(c.item_id, jsonb_build_object('unit', c.unit,
                 'avail', greatest(0, least(
                   coalesce((select pi.qty from public.player_inventory pi
                              where pi.user_id = p_user and pi.slot = p_slot and pi.item_id = c.item_id), 0),
                   coalesce((t.loot->>c.item_id)::numeric, 0)::bigint - coalesce((t.covered->>c.item_id)::bigint, 0)))))
                 from public.hr_hunt_cover_items c
                 left join public.hunt_session_tally t on t.session_id = v_s.id), '{}'::jsonb),
    'now_ms', floor(extract(epoch from now()) * 1000)::bigint);
end $$;

-- ── §4 hr_hunt_buffs_put — the queue the action bar leaves behind ──────────
-- The engine fires Feasts and draughts inside a window and proposes the
-- resulting queue in the server's absolute shape. It is ADMITTED, not trusted:
--   · shape: ≤ 64 segments, ≤ 8 per type, keys ⊆ {type, magnitude, until,
--     from, scale}, a known type, a magnitude some catalogued item of that
--     type carries, from ≤ until ≤ window end + 1 h, 1 ≤ scale ≤ 2;
--   · PAID FOR: a segment the stored queue did not hold (same type,
--     magnitude, until) must be backed by a bag use THIS window of an item of
--     that type and magnitude;
--   · BOUNDED: per type, the coverage the proposal adds over the stored live
--     queue (from the window start) is at most what this window's uses of that
--     type could buy at the largest scale (Σ duration × 2).
-- Refused segments refuse the whole settle (HR000 'bad_hunt_buffs' /
-- 'buff_not_paid' / 'buff_over_paid'); the queue never shrinks a player's
-- paid-for time except by the engine dropping a weaker segment its own merge
-- rule (src/core/buffs.js applyBuffSegment) covers.
create or replace function public.hr_hunt_buffs_put(p_user uuid, p_slot int, p_from timestamptz,
  p_to timestamptz, p_uses jsonb, p_buffs jsonb)
returns void language plpgsql set search_path = public, pg_catalog as $$
declare
  c_max_ms     constant bigint  := 3600000;     -- hr_apply c_buff_max_ms
  c_scale_max  constant numeric := 2;           -- hr_apply c_buff_scale_max
  c_max_segs   constant int     := 8;           -- hr_apply c_buff_max_segments
  v_e jsonb; v_t text; v_m numeric; v_u timestamptz; v_f timestamptz;
  v_stored jsonb;
  v_bad text;
begin
  if p_buffs is null then return; end if;
  if jsonb_typeof(p_buffs) <> 'array' or jsonb_array_length(p_buffs) > 64 then
    perform public.hr_reject('bad_hunt_buffs', jsonb_build_object('why', 'not_an_array_or_too_long')); end if;
  select coalesce(buffs, '[]'::jsonb) into v_stored from public.player_state where user_id = p_user and slot = p_slot;
  for v_e in select value from jsonb_array_elements(p_buffs) loop
    if jsonb_typeof(v_e) <> 'object'
       or exists (select 1 from jsonb_object_keys(v_e) k where k not in ('type', 'magnitude', 'until', 'from', 'scale'))
       or jsonb_typeof(v_e->'type') is distinct from 'string' or jsonb_typeof(v_e->'magnitude') is distinct from 'number'
       or jsonb_typeof(v_e->'until') is distinct from 'string'
       or (v_e ? 'from' and jsonb_typeof(v_e->'from') <> 'string')
       or (v_e ? 'scale' and (jsonb_typeof(v_e->'scale') <> 'number'
                              or (v_e->>'scale')::numeric < 1 or (v_e->>'scale')::numeric > c_scale_max)) then
      perform public.hr_reject('bad_hunt_buffs', jsonb_build_object('why', 'segment_shape'));
    end if;
    v_t := v_e->>'type'; v_m := (v_e->>'magnitude')::numeric;
    begin
      v_u := (v_e->>'until')::timestamptz;
      v_f := case when v_e ? 'from' then (v_e->>'from')::timestamptz end;
    exception when others then
      perform public.hr_reject('bad_hunt_buffs', jsonb_build_object('why', 'segment_time'));
    end;
    if not exists (select 1 from public.hr_item_buffs b where b.type = v_t and b.magnitude = v_m) then
      perform public.hr_reject('bad_hunt_buffs', jsonb_build_object('why', 'unknown_type_or_magnitude', 'type', left(v_t, 32)));
    end if;
    if v_u <= p_from or v_u > p_to + make_interval(secs => c_max_ms / 1000.0)
       or (v_f is not null and v_f > v_u) then
      perform public.hr_reject('bad_hunt_buffs', jsonb_build_object('why', 'segment_window', 'type', v_t));
    end if;
    -- PAID FOR: new or moved segments need a use of that type AND magnitude this window.
    if not exists (select 1 from jsonb_array_elements(v_stored) s(v)
                    where s.v->>'type' = v_t and (s.v->>'magnitude')::numeric = v_m
                      and (s.v->>'until')::timestamptz = v_u)
       and not exists (select 1 from jsonb_each_text(coalesce(p_uses, '{}'::jsonb)) u
                         join public.hr_item_buffs b on b.item_id = u.key
                        where b.type = v_t and b.magnitude = v_m and u.value::bigint > 0) then
      perform public.hr_reject('buff_not_paid', jsonb_build_object('type', v_t, 'magnitude', v_m));
    end if;
  end loop;
  -- ≤ c_max_segs live segments per type.
  select string_agg(t, ',') into v_bad from (
    select e.value->>'type' as t from jsonb_array_elements(p_buffs) e group by 1 having count(*) > c_max_segs) x;
  if v_bad is not null then
    perform public.hr_reject('bad_hunt_buffs', jsonb_build_object('why', 'segment_budget', 'types', v_bad)); end if;
  -- BOUNDED: added coverage per type ≤ Σ(uses of that type × duration × max scale).
  select string_agg(x.t, ',') into v_bad from (
    select p.t, p.cov - coalesce(s.cov, 0) as added, coalesce(u.buy, 0) as buy
      from (select e.value->>'type' as t,
                   sum(greatest(0, extract(epoch from ((e.value->>'until')::timestamptz
                        - greatest(p_from, coalesce((e.value->>'from')::timestamptz, p_from)))) * 1000)) as cov
              from jsonb_array_elements(p_buffs) e group by 1) p
      left join (select e.value->>'type' as t,
                        sum(greatest(0, extract(epoch from ((e.value->>'until')::timestamptz
                             - greatest(p_from, coalesce((e.value->>'from')::timestamptz, p_from)))) * 1000)) as cov
                   from jsonb_array_elements(v_stored) e
                  where (e.value->>'until')::timestamptz > p_from group by 1) s on s.t = p.t
      left join (select b.type as t, sum(u.value::bigint * b.duration_ms * c_scale_max) as buy
                   from jsonb_each_text(coalesce(p_uses, '{}'::jsonb)) u
                   join public.hr_item_buffs b on b.item_id = u.key group by 1) u on u.t = p.t) x
   where x.added > x.buy + 1000;
  if v_bad is not null then
    perform public.hr_reject('buff_over_paid', jsonb_build_object('types', v_bad)); end if;
  update public.player_state
     set buffs = (select coalesce(jsonb_agg(e.value order by (e.value->>'until')::timestamptz), '[]'::jsonb)
                    from jsonb_array_elements(p_buffs) e)
   where user_id = p_user and slot = p_slot;
end $$;

-- (The price of a fall is the hr_hunt_limits row `death_xp_permille`, written
-- by the GENERATED catalogue 2026-10-22-hunt-sessions-catalogue.generated.sql
-- from src/data/hunt-sessions.js DEATH_XP_LOSS — data, never a literal here.)

-- ── §4c STAMINA REPLACES VIGOUR IN THREE INSTALLED BODIES ──────────────────
-- ANCHORED EDITS: each anchor must match EXACTLY ONCE, a body already edited is
-- left alone, and nothing else in any body moves.
--   hr_hunt_enter (C1, applied)           the entry gate: `no_vigour` -> `no_stamina`
--   hr_hunt_settle_session (C1, applied)  the end proof: the dead `vigour` arm ->
--                                         `stamina`, proved from the row (5a) wrote
--   hr_state_of (2026-10-19 restatement)  the envelope gains `stamina`
--   hr_hunt_slots_check / hr_hunt_use / hr_hunt_view / hr_hunt_analyzer (C1)
--                                         slot kinds + shop targets; presses on
--                                         shop slots; the tally's shop sales;
--                                         Waste counts them
-- WHY ANCHORED, NOT RESTATED: three one-line swaps in bodies that are at most one
--   anchored patch from their last whole statement (C1's two are at zero;
--   hr_state_of takes this and the away-readers deletion, two in all), each
--   exactly-once and proven executed by §10 and tests/hunt-sessions-settle.mjs
--   STAMINA. Restating C1's 1,900-line verbs to change one line each is the
--   riskier change.
do $mig$
declare
  v_def text; v_n int;
  c_old constant text := $a$  v_vig := public.hr_vigour_of(v_uid, p_slot);
  if coalesce((v_vig->>'remaining_min')::int, 0) <= 0 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_vigour')); end if;
$a$;
  c_new constant text := $a$  -- STAMINA (2026-10-22-hunt-sessions-settle.sql §4c): an empty pool cannot start a hunt.
  if coalesce(public.hr_stamina_of(v_uid, p_slot, now()), 0) <= 0 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_stamina')); end if;
$a$;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_enter(integer,text,jsonb,integer,integer,integer,uuid)'::regprocedure), chr(13), '');
  if strpos(v_def, c_new) > 0 then raise notice 'hr_hunt_enter already gates on stamina — edit skipped'; return; end if;
  v_n := (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old);
  if v_n <> 1 then raise exception 'hr_hunt_enter: the Vigour gate matched % times (need 1) — the body moved', v_n; end if;
  execute replace(v_def, c_old, c_new);
end $mig$;
do $mig$
declare
  v_def text; v_n int;
  c_old constant text := $a$      -- Vigour is charged by hr_apply in this transaction; the engine counts
      -- milliseconds and hr_vigour_of whole minutes, so one minute of slack.
      when 'vigour' then coalesce((public.hr_vigour_of(p_user, p_slot)->>'remaining_min')::int, 0) <= 1
$a$;
  c_new constant text := $a$      -- GOLD_OUT (2026-10-22-hunt-sessions-settle.sql §4c): hr_hunt_apply (5b)
      -- credited this window's sell-to-cover and debited its buys before this
      -- call; the gold left, over the action set's floor, is below the dearest
      -- shop use the bar or the quiver could need.
      when 'gold_out' then coalesce((select ps.gold from public.player_state ps
                                      where ps.user_id = p_user and ps.slot = p_slot), 0)
                           - coalesce((select a.gold_floor from public.player_action_sets a
                                        where a.user_id = p_user and a.slot = p_slot and a.preset = v_s.preset),
                                      public.hr_hunt_limit('gold_floor_default'), 0)
                           < coalesce((select max(q.price) from public.hr_hunt_basic_supplies q
                                        where exists (
                                                 select 1 from jsonb_array_elements(coalesce(
                                                   public.hr_hunt_preset_slots(p_user, p_slot, v_s.preset), '[]'::jsonb)) e
                                                  where coalesce((e.value->>'on')::boolean, false)
                                                    and (e.value->>'item' = q.basic_id
                                                         or (e.value->>'item' = '*heal_shop' and q.kind = 'heal'
                                                             and (select t.tier from public.hr_hunt_travel t where t.hunt_id = v_s.hunt_id) = any (q.tiers))))
                                          and (q.kind = 'heal'
                                               or (q.kind = 'ammo' and q.partner = (select pe.item_id from public.player_equipment pe
                                                                                     where pe.user_id = p_user and pe.slot = p_slot
                                                                                       and pe.equip_slot = 'ammo')))), 0)
      -- STAMINA (2026-10-22-hunt-sessions-settle.sql §4c): hr_hunt_apply (5a)
      -- wrote this window's end value at `to` before this call.
      when 'stamina' then coalesce((select ps.stamina_ms from public.player_state ps
                                     where ps.user_id = p_user and ps.slot = p_slot), 1) <= 0
$a$;
  -- C1's `vigour_low` event goes (master plan row 4): hr_hunt_apply emits
  -- `stamina_low` instead, and the type is no longer in the event CHECK.
  c_old2 constant text := $a$  if not exists (select 1 from public.hunt_session_events e where e.session_id = p_session and e.type = 'vigour_low') then
    v_vig := (public.hr_vigour_of(p_user, p_slot)->>'remaining_min')::int;
    if v_vig is not null and v_vig <= coalesce(public.hr_hunt_limit('vigour_low_min'), 0) then
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'vigour_low', v_to, jsonb_build_object('n', v_vig));
      v_ev := v_ev + 1;
    end if;
  end if;
$a$;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, c_new) > 0 and strpos(v_def, c_old2) = 0 then
    raise notice 'hr_hunt_settle_session already proves stamina / gold_out and emits no vigour_low — edit skipped'; return; end if;
  v_n := (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old);
  if v_n <> 1 then raise exception 'hr_hunt_settle_session: the Vigour end arm matched % times (need 1) — the body moved', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, c_old2, ''))) / length(c_old2);
  if v_n <> 1 then raise exception 'hr_hunt_settle_session: the vigour_low block matched % times (need 1) — the body moved', v_n; end if;
  execute replace(replace(v_def, c_old, c_new), c_old2, '');
end $mig$;
-- hr_hunt_settle_session: ONE CONSUMABLE COOLDOWN LANE (Combat Design Bible
-- v1.4: food and drink share a lane; abilities and healing spells get their own
-- later). The use cap reads the one lane's cooldown for heals and buffs
-- TOGETHER, and the stored cooldowns hold only that lane's key. The reserved
-- lanes (offense, heal_spell; rule-subjects.js COOLDOWN_LANES) carry no key
-- until the ability lane ships.
do $mig$
declare
  v_def text; v_n int;
  c_old1 constant text := $a$  v_cd_heal int := public.hr_hunt_limit('cd_heal_ms');
  v_cd_buff int := public.hr_hunt_limit('cd_buff_ms');
$a$;
  c_new1 constant text := $a$  v_cd_cons int := (select l.ms from public.hr_hunt_lanes l where l.lane = 'consumable' and l.active);
$a$;
  c_old2 constant text := $a$    if v_heals > v_win / v_cd_heal + 1 or v_buffs > v_win / v_cd_buff + 1 then$a$;
  c_new2 constant text := $a$    if v_heals + v_buffs > v_win / v_cd_cons + 1 then$a$;
  c_old3 constant text := $a$c.key not in ('heal', 'buff')$a$;
  c_new3 constant text := $a$not exists (select 1 from public.hr_hunt_lanes l where l.lane = c.key and l.active)$a$;
  c_old4 constant text := $a$+ case c.key when 'heal' then v_cd_heal else v_cd_buff end$a$;
  c_new4 constant text := $a$+ v_cd_cons$a$;
  c_old5 constant text := $a$  if v_cd_heal is null or v_cd_buff is null then$a$;
  c_new5 constant text := $a$  if v_cd_cons is null then$a$;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'hr_hunt_lanes') > 0 then
    raise notice 'hr_hunt_settle_session already reads the one consumable lane — edit skipped'; return; end if;
  foreach v_n in array array[1, 2, 3, 4, 5] loop
    if (length(v_def) - length(replace(v_def, case v_n when 1 then c_old1 when 2 then c_old2 when 3 then c_old3 when 4 then c_old4 else c_old5 end, '')))
       / length(case v_n when 1 then c_old1 when 2 then c_old2 when 3 then c_old3 when 4 then c_old4 else c_old5 end) <> 1 then
      raise exception 'hr_hunt_settle_session: cooldown-lane anchor % did not match exactly once — the body moved', v_n;
    end if;
  end loop;
  execute replace(replace(replace(replace(replace(v_def, c_old1, c_new1), c_old2, c_new2), c_old3, c_new3), c_old4, c_new4), c_old5, c_new5);
end $mig$;
-- hr_hunt_slots_check: a slot may say what it HOLDS (`kind`, SLOT_KINDS); a
-- reserved kind (`spell`, until the combat redesign) is refused by name; and its
-- item may be a slot target (SLOT_TARGETS: *heal, *heal_shop, *mana, *mana_shop)
-- or a shop heal / drink (supply-basics.js) as well as a packed heal or buff.
do $mig$
declare
  v_def text; v_n int;
  c_old1 constant text := $a$    if jsonb_typeof(v_s) <> 'object' or exists (select 1 from jsonb_object_keys(v_s) k where k not in ('item', 'on', 'conditions')) then
      return jsonb_build_object('ok', false, 'error', bad, 'why', 'slot_shape', 'at', v_i); end if;
$a$;
  c_new1 constant text := $a$    if jsonb_typeof(v_s) <> 'object' or exists (select 1 from jsonb_object_keys(v_s) k where k not in ('kind', 'item', 'on', 'conditions')) then
      return jsonb_build_object('ok', false, 'error', bad, 'why', 'slot_shape', 'at', v_i); end if;
    -- WHAT THE SLOT HOLDS (2026-10-22-hunt-sessions-settle.sql §4c): absent = 'supply'.
    if v_s ? 'kind' and (jsonb_typeof(v_s->'kind') <> 'string'
                         or not exists (select 1 from public.hr_hunt_slot_kinds sk where sk.kind = v_s->>'kind')) then
      return jsonb_build_object('ok', false, 'error', bad, 'why', 'bad_kind', 'at', v_i); end if;
    if v_s ? 'kind' and not (select sk.active from public.hr_hunt_slot_kinds sk where sk.kind = v_s->>'kind') then
      return jsonb_build_object('ok', false, 'error', bad, 'why', 'kind_reserved', 'at', v_i, 'kind', v_s->>'kind'); end if;
$a$;
  c_old2 constant text := $a$    if v_item is null or not (v_item = '*heal' or exists (select 1 from public.hr_hunt_supplies p
                                                            where p.item_id = v_item and p.kind in ('heal', 'buff'))) then
$a$;
  c_new2 constant text := $a$    if v_item is null or not (exists (select 1 from public.hr_hunt_slot_targets st where st.target = v_item)
                              or exists (select 1 from public.hr_hunt_basic_supplies bs
                                          where bs.basic_id = v_item and bs.kind in ('heal', 'mana', 'ammo'))
                              or exists (select 1 from public.hr_hunt_supplies p
                                          where p.item_id = v_item and p.kind in ('heal', 'buff'))) then
$a$;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_slots_check(jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, c_new1) > 0 and strpos(v_def, c_new2) > 0 then
    raise notice 'hr_hunt_slots_check already reads a slot kind and the shop — edit skipped'; return; end if;
  v_n := (length(v_def) - length(replace(v_def, c_old1, ''))) / length(c_old1);
  if v_n <> 1 then raise exception 'hr_hunt_slots_check: the slot-shape anchor matched % times (need 1) — the body moved', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, c_old2, ''))) / length(c_old2);
  if v_n <> 1 then raise exception 'hr_hunt_slots_check: the item anchor matched % times (need 1) — the body moved', v_n; end if;
  execute replace(replace(v_def, c_old1, c_new1), c_old2, c_new2);
end $mig$;
-- hr_hunt_use: a press on a shop slot is not `bag_empty` (it buys).
do $mig$
declare
  v_def text; v_n int;
  c_old constant text := $a$                    and ((v_item = '*heal' and p.kind = 'heal') or b.item_id = v_item)) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bag_empty')); end if;
$a$;
  c_new constant text := $a$                    and ((v_item = '*heal' and p.kind = 'heal') or b.item_id = v_item))
     -- THE SHOP (2026-10-22-hunt-sessions-settle.sql §4c): a shop slot buys at the press.
     and not exists (select 1 from public.hr_hunt_slot_targets t where t.target = v_item and t.src = 'shop')
     and not exists (select 1 from public.hr_hunt_basic_supplies q where q.basic_id = v_item) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bag_empty')); end if;
$a$;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_use(integer,integer,uuid)'::regprocedure), chr(13), '');
  if strpos(v_def, c_new) > 0 then raise notice 'hr_hunt_use already admits a bought supply — edit skipped'; return; end if;
  v_n := (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old);
  if v_n <> 1 then raise exception 'hr_hunt_use: the bag_empty anchor matched % times (need 1) — the body moved', v_n; end if;
  execute replace(v_def, c_old, c_new);
end $mig$;
-- hr_hunt_view: the tally states what the shop sold this hunt and its gold.
do $mig$
declare
  v_def text; v_n int;
  c_old constant text := $a$'down_ms', t.down_ms, 'paid_ms', t.paid_ms)$a$;
  c_new constant text := $a$'down_ms', t.down_ms, 'paid_ms', t.paid_ms,
                       'bought', t.bought, 'supply_gold', t.supply_gold)$a$;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_view(uuid)'::regprocedure), chr(13), '');
  if strpos(v_def, c_new) > 0 then raise notice 'hr_hunt_view already states the shop''s sales — edit skipped'; return; end if;
  v_n := (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old);
  if v_n <> 1 then raise exception 'hr_hunt_view: the tally anchor matched % times (need 1) — the body moved', v_n; end if;
  execute replace(v_def, c_old, c_new);
end $mig$;
-- hr_hunt_analyzer: Waste counts the gold the shop was paid.
do $mig$
declare
  v_def text; v_n int;
  c_old constant text := $a$  v_gold := v_t.coins + v_loot;
$a$;
  c_new constant text := $a$  v_gold := v_t.coins + v_loot;
  -- THE SHOP (2026-10-22-hunt-sessions-settle.sql §4c): its gold is Waste.
  v_waste := v_waste + coalesce(v_t.supply_gold, 0);
$a$;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_analyzer(integer,uuid)'::regprocedure), chr(13), '');
  if strpos(v_def, c_new) > 0 then raise notice 'hr_hunt_analyzer already counts the shop''s gold — edit skipped'; return; end if;
  v_n := (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old);
  if v_n <> 1 then raise exception 'hr_hunt_analyzer: the gold anchor matched % times (need 1) — the body moved', v_n; end if;
  execute replace(v_def, c_old, c_new);
end $mig$;
do $mig$
declare
  v_def text; v_n int;
  -- ANCHORED ON THE SERVER CLOCK LINE, which every envelope keeps (architecture
  -- contracts S7): the first anchor, `dungeon_cooldowns`, leaves with the
  -- demolition, and the next edit would have found nothing to splice after.
  c_old constant text := $a$    'now', now(),
$a$;
  c_new constant text := $a$    'now', now(),
    -- ── stamina — THE HUNT POOL (ms / at / max_ms / hunting) ──
    --    introduced by 2026-10-22-hunt-sessions-settle.sql §4c
    'stamina', public.hr_stamina_view(p_user, v_st.slot),
$a$;
begin
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,integer)'::regprocedure), chr(13), '');
  if strpos(v_def, c_new) > 0 then raise notice 'hr_state_of already projects stamina — edit skipped'; return; end if;
  v_n := (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old);
  if v_n <> 1 then raise exception 'hr_state_of: the server-clock (''now'') anchor matched % times (need 1) — the body moved', v_n; end if;
  execute replace(v_def, c_old, c_new);
end $mig$;
revoke execute on function public.hr_hunt_enter(int, text, jsonb, int, int, int, uuid) from public;
revoke execute on function public.hr_hunt_enter(int, text, jsonb, int, int, int, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_enter(int, text, jsonb, int, int, int, uuid) to authenticated;
revoke execute on function public.hr_hunt_slots_check(jsonb) from public;
revoke execute on function public.hr_hunt_slots_check(jsonb) from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_hunt_use(int, int, uuid) from public;
revoke execute on function public.hr_hunt_use(int, int, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_use(int, int, uuid) to authenticated;
revoke execute on function public.hr_hunt_view(uuid) from public;
revoke execute on function public.hr_hunt_view(uuid) from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_hunt_analyzer(int, uuid) from public;
revoke execute on function public.hr_hunt_analyzer(int, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_analyzer(int, uuid) to authenticated;
revoke execute on function public.hr_hunt_settle_session(uuid, int, uuid, jsonb) from public;
revoke execute on function public.hr_hunt_settle_session(uuid, int, uuid, jsonb) from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_state_of(uuid, int) from public;
revoke execute on function public.hr_state_of(uuid, int) from anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── §4d hr_action_set_options — an action set's OPTIONS, one jsonb ─────────
-- (Tyler 2026-10-14, Huntera's bar; master plan row 3, the floor; Master
-- Design Reference §4, the hunt-supplies choice; architecture contracts S4.)
-- p_opts is an object of options; every key must name a generated
-- hr_hunt_set_options row (hunt-sessions.js ACTION_SET_OPTIONS) and every value
-- pass that row's domain — a target mode of hr_hunt_target_modes (solo sets
-- only), an integer inside its limits pair, or one of its enum values. Refused,
-- never clamped; an absent key is unchanged. A new option is a data row and a
-- column, never a new signature or client-baseline row. Mode and pull are
-- INERT until U2 (row 18). Preset 0 with no saved row is saved from the
-- catalogue default bar first. Edits to the running set wait for its settle,
-- like hr_action_set_put. C1's verb shape: identity -> slot -> idempotency
-- replay -> rate gate -> input -> lock -> state -> write -> stored result.
drop function if exists public.hr_action_set_options(int, int, text, int, bigint, uuid);
drop function if exists public.hr_action_set_options(int, int, text, int, bigint, uuid, text);
drop function if exists public.hr_action_set_options(int, int, text, int, bigint, uuid, text, text);
create or replace function public.hr_action_set_options(p_slot int, p_preset int, p_opts jsonb, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'action_set_options';
  c_slack_ms constant bigint := 20000;
  v_uid  uuid := auth.uid();
  v_r    jsonb;
  v_s    public.hunt_sessions%rowtype;
  v_k    text;
  v_v    jsonb;
  v_o    public.hr_hunt_set_options%rowtype;
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
  if p_opts is null or jsonb_typeof(p_opts) <> 'object' or p_opts = '{}'::jsonb then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_options')); end if;
  for v_k in select jsonb_object_keys(p_opts) loop
    select * into v_o from public.hr_hunt_set_options o where o.opt = v_k;
    if not found then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_option',
        'option', left(v_k, 64))); end if;
    v_v := p_opts->v_k;
    if v_o.kind = 'target' then
      if jsonb_typeof(v_v) <> 'string' or not exists (select 1 from public.hr_hunt_target_modes m where m.mode = v_v #>> '{}') then
        return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_target_mode')); end if;
      if not (select m.solo from public.hr_hunt_target_modes m where m.mode = v_v #>> '{}') then
        return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'target_mode_party_only')); end if;
    elsif v_o.kind = 'limit' then
      if jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}')::numeric <> trunc((v_v #>> '{}')::numeric)
         or (v_v #>> '{}')::numeric < public.hr_hunt_limit(v_o.limit_key || '_min')
         or (v_v #>> '{}')::numeric > public.hr_hunt_limit(v_o.limit_key || '_max') then
        return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_' || v_k,
          'min', public.hr_hunt_limit(v_o.limit_key || '_min'), 'max', public.hr_hunt_limit(v_o.limit_key || '_max'))); end if;
    else
      if jsonb_typeof(v_v) <> 'string' or not ((v_v #>> '{}') = any (v_o.vals)) then
        return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_' || v_k,
          'allowed', to_jsonb(v_o.vals))); end if;
    end if;
  end loop;

  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if v_s.id is not null and v_s.preset = p_preset and public.hr_hunt_gap_ms(v_s) > c_slack_ms then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'settle_first',
      'unsettled_ms', public.hr_hunt_gap_ms(v_s))); end if;
  if not exists (select 1 from public.player_action_sets a where a.user_id = v_uid and a.slot = p_slot and a.preset = p_preset) then
    if p_preset <> 0 then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_preset')); end if;
    insert into public.player_action_sets (user_id, slot, preset, name, slots, updated_at)
      select v_uid, p_slot, 0, d.name, d.slots, now() from public.hr_hunt_default_preset d where d.id;
  end if;
  update public.player_action_sets
     set target_mode   = coalesce(p_opts->>'target_mode', target_mode),
         pull_count    = coalesce((p_opts->>'pull_count')::int, pull_count),
         gold_floor    = coalesce((p_opts->>'gold_floor')::bigint, gold_floor),
         supply_source = coalesce(p_opts->>'supply_source', supply_source),
         on_empty      = coalesce(p_opts->>'on_empty', on_empty),
         updated_at    = now()
   where user_id = v_uid and slot = p_slot and preset = p_preset;
  select jsonb_build_object('ok', true, 'preset', p_preset, 'target_mode', a.target_mode, 'pull_count', a.pull_count,
                            'gold_floor', a.gold_floor, 'supply_source', a.supply_source, 'on_empty', a.on_empty)
    into v_r from public.player_action_sets a where a.user_id = v_uid and a.slot = p_slot and a.preset = p_preset;
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated'
   and proname in ('hr_action_set_mode', 'hr_action_set_options', 'hr_vigour_refill');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_action_set_options', 'p_slot integer, p_preset integer, p_opts jsonb, p_idem uuid',
   'authenticated',
   'added 2026-10-22 (hunt sessions C2, Tyler 2026-10-14 + master plan row 3 + Combat Design Bible v1.4): an action set''s target mode, pull count, gold floor and hunt-supplies choice (supply_source mine | store, on_empty end | switch) as ONE jsonb validated against hr_hunt_set_options; catalogue / limits values only, refused not clamped');
-- (master plan row 20) hr_vigour_refill leaves the client surface: hunts no
-- longer spend Vigour, so a gold-for-Vigour verb buys nothing a hunter needs.
-- (2026-10-22-hunt-sessions-delete-away.sql drops it outright; guarded so this
-- file re-applies cleanly after that one.)
do $mig$
begin
  if to_regprocedure('public.hr_vigour_refill(integer,uuid)') is not null then
    execute 'revoke execute on function public.hr_vigour_refill(int, uuid) from public';
    execute 'revoke execute on function public.hr_vigour_refill(int, uuid) from anon, authenticated, service_role';
  end if;
end $mig$;

-- ── §5 hr_hunt_apply — ONE SETTLE, ONE STATEMENT, ONE SUBTRANSACTION ───────
create or replace function public.hr_hunt_apply(p_user uuid, p_slot int, p_session uuid, p_version bigint,
  p_intent uuid, p_delta jsonb, p_hunt jsonb, p_buffs jsonb default null, p_press jsonb default null,
  p_project boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_slots     constant int := coalesce(public.hr_hunt_limit('slots'), 10);
  v_role      text;
  v_s         public.hunt_sessions%rowtype;
  v_a         jsonb;
  v_h         jsonb;
  v_bar       jsonb;
  v_item      text;
  v_pslot     int;
  v_pat_ms    bigint;
  v_to        timestamptz;
  v_out       jsonb;
  v_code      text;
  v_detail    text;
  -- THE PRICE OF A FALL (Tyler 2026-10-14; src/data/hunt-sessions.js DEATH_XP_LOSS)
  c_xp_skills constant text[] := array['attack', 'defense', 'magic', 'ranged', 'strength'];
  v_hunt      jsonb;
  v_dx        jsonb;
  v_nd        int;
  v_el        jsonb;
  v_k         text;
  v_v         jsonb;
  v_lost      jsonb := '{}'::jsonb;
  v_rate      int;
  v_xp0       jsonb := '{}'::jsonb;
  v_ev0       bigint := 0;
  v_n         bigint;
  v_cur       bigint;
  v_lv        int;
  v_lv0       int;
  v_fin       int;
  v_fi        int;
  v_r         record;
  -- THE STAMINA POOL (Tyler 2026-10-14)
  v_stam      jsonb;
  v_cap       bigint;
  v_sat       timestamptz;
  v_rec0      timestamptz;
  v_s0        bigint;
  v_e         bigint;
  v_win       bigint;
  v_paid      bigint;
  v_down      bigint;
  v_nsw       bigint;
  v_tick      bigint;
  v_dmax      bigint;
  -- THE SHOP, PAID PER USE (Tyler 2026-10-14)
  c_day_ms    constant bigint := 86400000;
  c_min_swing constant bigint := 500;         -- hr_hunt_settle_session's swing-count fuse
  v_buys      jsonb;
  v_cost      bigint := 0;
  v_units     bigint := 0;
  v_items     jsonb := '{}'::jsonb;
  v_price     bigint;
  v_kind      text;
  v_bk        jsonb := '{}'::jsonb;    -- units bought per supply kind, this settle
  v_day       jsonb := '{}'::jsonb;    -- units bought per supply kind, earlier today
  v_ukind     jsonb := '{}'::jsonb;    -- bag uses per supply kind, this settle
  v_cdh       int;
  v_gold_now  bigint;
  v_cover     jsonb;
  v_cgold     bigint := 0;
  v_cunits    bigint := 0;
  v_citems    jsonb := '{}'::jsonb;
  v_unit      bigint;
  v_avail     bigint;
  v_floor     bigint;
  v_ko        int;
  -- THE SPAWN CYCLE (Security design review 2026-10-14 items 1-2)
  v_pull      jsonb;
  v_psrv      jsonb;
  v_psz       bigint;
  v_prs       bigint;
  v_pn        bigint;
  v_pl1       bigint;
  v_r0ms      bigint;
  v_r1ms      bigint;
  v_ipl       bigint;
  v_ira       timestamptz;
  v_tomms     bigint;
  v_pmax      bigint;
  v_kills     bigint;
  v_ver       bigint;
  v_lmax      bigint;
  -- THE RESUME (Tyler 2026-10-14)
  v_end       text;
  v_lk        text;
  v_li        text;
  v_home      timestamptz;
  v_ok        boolean;
begin
  -- (0) IDENTITY: the engine, never a request role (the primary control is the
  --     GRANT in §9; this is the hr_apply-style secondary seam).
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role') then
    raise exception 'hr_hunt_apply: not callable by %', v_role using errcode = '42501';
  end if;
  if p_user is null or p_slot is null or p_session is null or p_version is null or p_intent is null
     or p_delta is null or jsonb_typeof(p_delta) <> 'object'
     or p_hunt is null or jsonb_typeof(p_hunt) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments');
  end if;

  -- (1) THE LOCK — hr_apply's advisory key + the session row, held to commit.
  v_s := public.hr_hunt_lock(p_user, p_slot);
  if v_s.id is null or v_s.id <> p_session then
    return jsonb_build_object('ok', false, 'error', 'no_hunt');
  end if;

  -- (2) A MANUAL PRESS, judged exactly as hr_hunt_use judges one, before any
  --     write. `at` is the edge's read of now(): clamped into [settled_to,
  --     now()] so it can neither reach back past the settled window nor ahead.
  if p_press is not null then
    if jsonb_typeof(p_press) <> 'object'
       or exists (select 1 from jsonb_object_keys(p_press) k where k not in ('slot', 'at'))
       or jsonb_typeof(p_press->'slot') is distinct from 'number' or (p_press->>'slot') !~ '^[0-9]{1,2}$'
       or jsonb_typeof(p_press->'at') is distinct from 'number' or (p_press->>'at') !~ '^[0-9]{1,15}$' then
      return jsonb_build_object('ok', false, 'error', 'bad_press');
    end if;
    if v_s.leave_at is not null or v_s.change_at is not null then
      return jsonb_build_object('ok', false, 'error', 'hunt_leaving'); end if;
    v_pslot := (p_press->>'slot')::int;
    if v_pslot >= c_slots then return jsonb_build_object('ok', false, 'error', 'bad_bar_slot'); end if;
    v_bar := public.hr_hunt_preset_slots(p_user, p_slot, v_s.preset) -> v_pslot;
    if v_bar is null then return jsonb_build_object('ok', false, 'error', 'bad_bar_slot'); end if;
    v_item := v_bar->>'item';
    if not exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                    where b.session_id = v_s.id and b.qty_left > 0
                      and ((v_item = '*heal' and p.kind = 'heal') or b.item_id = v_item))
       and not exists (select 1 from public.hr_hunt_slot_targets t where t.target = v_item and t.src = 'shop')
       and not exists (select 1 from public.hr_hunt_basic_supplies q where q.basic_id = v_item) then
      return jsonb_build_object('ok', false, 'error', 'bag_empty'); end if;
    if exists (select 1 from jsonb_array_elements(v_s.presses) e where (e.value->>'slot')::int = v_pslot)
       or jsonb_array_length(v_s.presses) >= c_slots then
      return jsonb_build_object('ok', false, 'error', 'press_queued'); end if;
    v_pat_ms := least(greatest((p_press->>'at')::bigint,
                               ceil(extract(epoch from v_s.settled_to) * 1000)::bigint),
                      floor(extract(epoch from now()) * 1000)::bigint);
  end if;

  -- (2a) THE STORED INDEX, under the lock (Security design review item 8): the
  --      window starts where the row stands or another settle won — before any
  --      write. NO CAS on player_state.version: hr_apply gets the version read
  --      here, so a player verb between the engine's read and this apply never
  --      starves the settle (p_version is the engine's read, kept for the
  --      intent key's derivation only).
  if jsonb_typeof(p_hunt->'swing_from') is distinct from 'number' or (p_hunt->>'swing_from') !~ '^[0-9]{1,15}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_swing');
  end if;
  -- (A key that already landed falls through: hr_apply answers it `replayed`
  -- and nothing else moves.)
  if (p_hunt->>'swing_from')::bigint <> v_s.swing_index
     and not exists (select 1 from public.player_intents i where i.user_id = p_user and i.intent_id = p_intent) then
    return jsonb_build_object('ok', false, 'error', 'session_moved', 'swing_index', v_s.swing_index);
  end if;
  select version into v_ver from public.player_state where user_id = p_user and slot = p_slot;
  if v_ver is null then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;

  -- (2b) THE PRICE OF EACH FALL, shape only (no writes). `death_xp` is ONE
  --      `{skill: xp}` per death row in p_delta, in that order; it is taken off
  --      the proposal here (hr_hunt_settle_session refuses keys it does not
  --      know) and re-checked against player_skills after hr_apply, below. A
  --      fall that states no price is refused: the engine always states one,
  --      zeros included, so silence is a defect, never a discount.
  v_dx := p_hunt->'death_xp';
  v_hunt := p_hunt - 'death_xp';
  v_nd := case when jsonb_typeof(p_delta->'deaths') = 'array' then jsonb_array_length(p_delta->'deaths') else 0 end;
  if v_dx is null and v_nd = 0 then v_dx := '[]'::jsonb; end if;
  if v_dx is null or jsonb_typeof(v_dx) <> 'array' or jsonb_array_length(v_dx) <> v_nd then
    return jsonb_build_object('ok', false, 'error', 'bad_death_xp');
  end if;
  for v_el in select value from jsonb_array_elements(v_dx) loop
    if jsonb_typeof(v_el) <> 'object' then return jsonb_build_object('ok', false, 'error', 'bad_death_xp'); end if;
    for v_k, v_v in select key, value from jsonb_each(v_el) loop
      if v_k <> all (c_xp_skills) or jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,9}$' then
        return jsonb_build_object('ok', false, 'error', 'bad_death_xp');
      end if;
      if (v_v #>> '{}')::bigint > 0 then
        v_lost := v_lost || jsonb_build_object(v_k, coalesce((v_lost->>v_k)::bigint, 0) + (v_v #>> '{}')::bigint);
      end if;
    end loop;
  end loop;
  if v_lost <> '{}'::jsonb then
    v_rate := public.hr_hunt_limit('death_xp_permille');
    if v_rate is null then return jsonb_build_object('ok', false, 'error', 'catalogue_missing'); end if;
  end if;
  -- (2b') A KNOCKOUT IN A HUNT IS FLAT (master plan row 16): every death row of a
  --       hunt settle names exactly hr_hunt_limit('knockout_ms').
  if v_nd > 0 then
    v_ko := public.hr_hunt_limit('knockout_ms');
    if v_ko is null then return jsonb_build_object('ok', false, 'error', 'catalogue_missing'); end if;
    if exists (select 1 from jsonb_array_elements(p_delta->'deaths') d
                where jsonb_typeof(d.value->'recovery_ms') is distinct from 'number'
                   or (d.value->>'recovery_ms')::numeric <> v_ko) then
      return jsonb_build_object('ok', false, 'error', 'bad_knockout', 'knockout_ms', v_ko);
    end if;
  end if;
  -- (2c) THE STAMINA POOL, shape only (no writes). `stamina` is the pool at
  --      `to` as the engine walked it; it is taken off the proposal here
  --      (hr_hunt_settle_session refuses keys it does not know) and re-bounded
  --      in (5a). The start value is the DATABASE's: the row, rested up to the
  --      window start. A row already written past the window start is refused:
  --      nothing in this lane writes one, and a refill that did would let a
  --      window be priced against a pool it never had.
  v_stam := v_hunt->'stamina';
  v_hunt := v_hunt - 'stamina';
  if v_stam is null or jsonb_typeof(v_stam) <> 'number' or (v_stam #>> '{}') !~ '^[0-9]{1,12}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_stamina');
  end if;
  v_cap := public.hr_hunt_limit('stamina_max_min')::bigint * 60000;
  if v_cap is null then return jsonb_build_object('ok', false, 'error', 'catalogue_missing'); end if;
  select stamina_at, recovering_until into v_sat, v_rec0
    from public.player_state where user_id = p_user and slot = p_slot;
  if v_sat is not null and v_sat > v_s.settled_to then
    return jsonb_build_object('ok', false, 'error', 'stamina_ahead');
  end if;
  v_s0 := public.hr_stamina_of(p_user, p_slot, v_s.settled_to);
  -- (2d) WHAT THE WINDOW BOUGHT FROM THE SHOP, shape only: `{shop id: uses}`,
  --      taken off the proposal (re-priced and debited in (5b)).
  v_buys := coalesce(v_hunt->'buys', '{}'::jsonb);
  v_hunt := v_hunt - 'buys';
  if jsonb_typeof(v_buys) <> 'object' or (select count(*) from jsonb_object_keys(v_buys)) > 20
     or exists (select 1 from jsonb_each(v_buys) x
                 where x.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number'
                    or (x.value #>> '{}') !~ '^[0-9]{1,9}$') then
    return jsonb_build_object('ok', false, 'error', 'bad_buys');
  end if;
  v_cover := coalesce(v_hunt->'cover', '{}'::jsonb);
  v_hunt := v_hunt - 'cover';
  if jsonb_typeof(v_cover) <> 'object' or (select count(*) from jsonb_object_keys(v_cover)) > 64
     or exists (select 1 from jsonb_each(v_cover) x
                 where x.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number'
                    or (x.value #>> '{}') !~ '^[0-9]{1,9}$') then
    return jsonb_build_object('ok', false, 'error', 'bad_cover');
  end if;
  -- (2e) THE SPAWN CYCLE, shape only: the pull the engine ran must be the one
  --      the row gives NOW (a pull-count edit since the engine's read means the
  --      window was priced on a stale pull: re-read), taken off the proposal and
  --      re-proved against the stamped kills after hr_apply, below.
  v_pull := v_hunt->'pull';
  v_hunt := v_hunt - 'pull';
  if v_pull is null or jsonb_typeof(v_pull) <> 'object'
     or exists (select 1 from jsonb_object_keys(v_pull) k where k not in ('size', 'respawn_ms', 'left', 'respawn_at', 'pulls'))
     or coalesce(v_pull->>'size', '') !~ '^[0-9]{1,2}$' or coalesce(v_pull->>'respawn_ms', '') !~ '^[0-9]{1,9}$'
     or coalesce(v_pull->>'left', '') !~ '^[0-9]{1,2}$' or coalesce(v_pull->>'pulls', '') !~ '^[0-9]{1,9}$'
     or jsonb_typeof(v_pull->'respawn_at') is distinct from 'string' then
    return jsonb_build_object('ok', false, 'error', 'bad_pull');
  end if;
  v_psrv := public.hr_hunt_pull_of(p_user, p_slot, p_session);
  if v_psrv is null then return jsonb_build_object('ok', false, 'error', 'catalogue_missing'); end if;
  if (v_pull->>'size')::bigint <> (v_psrv->>'size')::bigint or (v_pull->>'respawn_ms')::bigint <> (v_psrv->>'respawn_ms')::bigint then
    return jsonb_build_object('ok', false, 'error', 'session_moved', 'why', 'pull', 'pull', v_psrv);
  end if;
  v_psz := (v_psrv->>'size')::bigint; v_prs := (v_psrv->>'respawn_ms')::bigint;
  v_pn := (v_pull->>'pulls')::bigint; v_pl1 := (v_pull->>'left')::bigint;
  begin
    v_r1ms := ceil(extract(epoch from (v_pull->>'respawn_at')::timestamptz) * 1000)::bigint;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'bad_pull');
  end;
  -- The instance row is LOCKED with the session: its cycle state is read here
  -- and written once below (a party's members will settle it in a fixed order).
  select i.pull_left, i.respawn_at into v_ipl, v_ira
    from public.hunt_instances i where i.id = v_s.instance_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_instance'); end if;
  v_r0ms := ceil(extract(epoch from coalesce(v_ira, v_s.hunt_from)) * 1000)::bigint;
  -- The skills as this window found them (the level a fall may never go below),
  -- and the newest event, so this settle's own fall / level_up rows are known.
  select coalesce(jsonb_object_agg(skill_id, xp), '{}'::jsonb) into v_xp0
    from public.player_skills where user_id = p_user and slot = p_slot and skill_id = any (c_xp_skills);
  select coalesce(max(id), 0) into v_ev0 from public.hunt_session_events where session_id = p_session;

  -- (3)–(5) ONE SUBTRANSACTION: a refusal anywhere in it un-writes all of it.
  begin
    perform set_config('hr.hunt_session', p_session::text, true);
    v_a := public.hr_apply(p_user, p_slot, v_ver, p_intent, p_delta);
    perform set_config('hr.hunt_session', '', true);
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      -- hr_apply wrote nothing but its own rejection record; answer as-is.
      return v_a || jsonb_build_object('stage', 'apply');
    end if;
    if coalesce(v_a->>'replayed', 'false') = 'true' then
      -- THIS window already landed under this key: nothing else may move.
      return v_a || jsonb_build_object('stage', 'replayed');
    end if;
    if p_press is not null then
      update public.hunt_sessions
         set presses = presses || jsonb_build_array(jsonb_build_object('slot', v_pslot, 'at', v_pat_ms)),
             version = version + 1
       where id = p_session;
    end if;
    if p_buffs is not null then
      begin v_to := (p_hunt->>'to')::timestamptz;
      exception when others then perform public.hr_reject('bad_window'); end;
      perform public.hr_hunt_buffs_put(p_user, p_slot, v_s.settled_to, v_to, p_hunt->'uses', p_buffs);
    end if;
    -- (4b) THE SPAWN CYCLE, RE-PROVED (Security design review items 1-2). K =
    --      the kills THIS settle's stamped rows journal (they are the only rows
    --      above the tally's high-water mark; hr_hunt_settle_session folds them
    --      below). Exact, no "+1": K = left_old + P x n - left_new; n within
    --      the respawns (respawn_at_old, to] admits; the pair forward only.
    begin v_to := (p_hunt->>'to')::timestamptz;
    exception when others then perform public.hr_reject('bad_window'); end;
    v_tomms := ceil(extract(epoch from v_to) * 1000)::bigint;
    select coalesce(sum(case when jsonb_typeof(l.meta->'kills') = 'number' then (l.meta->>'kills')::numeric else 0 end), 0)::bigint
      into v_kills
      from public.player_ledger l
     where l.session_id = p_session and l.kind <> 'hunt'
       and l.id > coalesce((select t.ledger_hwm from public.hunt_session_tally t where t.session_id = p_session), 0)
       and l.at >= now() - interval '25 hours';
    v_pmax := case when v_r0ms < v_tomms then (v_tomms - 1 - v_r0ms) / v_prs + 1 else 0 end;
    if v_pn > v_pmax then
      perform public.hr_reject('pull_over', jsonb_build_object('pulls', v_pn, 'max', v_pmax));
    end if;
    v_lmax := v_ipl;
    if v_pn > 0 then v_lmax := v_psz; end if;
    if v_pl1 > v_lmax
       or v_kills <> v_ipl + v_psz * v_pn - v_pl1
       or (v_pn = 0 and v_r1ms <> v_r0ms)
       or (v_pn > 0 and (v_r1ms < v_r0ms + v_pn * v_prs or v_r1ms >= v_tomms + v_prs)) then
      perform public.hr_reject('pull_over', jsonb_build_object('kills', v_kills, 'left_old', v_ipl,
        'pulls', v_pn, 'left', v_pl1, 'size', v_psz, 'respawn_at_old_ms', v_r0ms, 'respawn_at_ms', v_r1ms));
    end if;
    update public.hunt_instances
       set pull_left = v_pl1,
           respawn_at = case when v_pn = 0 then respawn_at
                             else 'epoch'::timestamptz + make_interval(secs => v_r1ms / 1000.0) end,
           version = version + 1
     where id = v_s.instance_id;
    -- (5a) THE STAMINA POOL, RE-BOUNDED AND WRITTEN (before the session half,
    --      whose `stamina` end proof reads this row). Every swing interval of
    --      the window is either PAID (hunting: drains 1:1) or KNOCKED OUT
    --      (rest: 1:1 up to the cap), so with W the window, P paid, D down:
    --        P + D = W (the 1 ms an empty window stands on aside);
    --        D ≤ the recovery the database knows: the stored line past the
    --            window start + each death row's recovery_ms, each rounded up
    --            to a whole interval (hr_apply validated those rows above);
    --        max(0, S0 − P) ≤ E ≤ max(0, S0 − P + D), and E ≤ max(S0, cap) —
    --            the floor at 0 only bites on the swing that empties the pool,
    --            after which the next boundary ends the hunt;
    --        an empty pool at the window start may walk no swing (the engine
    --            owed the `stamina` end at its first boundary).
    begin v_to := (p_hunt->>'to')::timestamptz;
    exception when others then perform public.hr_reject('bad_window'); end;
    if jsonb_typeof(p_hunt->'paid_ms') is distinct from 'number' or jsonb_typeof(p_hunt->'down_ms') is distinct from 'number'
       or jsonb_typeof(p_hunt->'swing_to') is distinct from 'number'
       or (p_hunt->>'paid_ms')::numeric not between 0 and 1e12 or (p_hunt->>'down_ms')::numeric not between 0 and 1e12
       or (p_hunt->>'swing_to')::numeric not between 0 and 1e15 then
      perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'shape'));
    end if;
    v_e    := (v_stam #>> '{}')::bigint;
    v_paid := (p_hunt->>'paid_ms')::numeric::bigint;
    v_down := (p_hunt->>'down_ms')::numeric::bigint;
    v_nsw  := (p_hunt->>'swing_to')::numeric::bigint - v_s.swing_index;
    v_win  := floor(extract(epoch from (v_to - v_s.settled_to)) * 1000)::bigint;
    if v_win < 0 or v_nsw < 0 or v_paid + v_down > v_win or v_paid + v_down < v_win - 1 then
      perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'window', 'window_ms', v_win,
        'paid_ms', v_paid, 'down_ms', v_down));
    end if;
    -- HUNTING TIME IS EXACT (architecture contracts X1/S3): every swing the
    -- window walked is ONE catalogue interval (hr_hunt_limits.swing_interval_ms
    -- = the engine's COMBAT_BALANCE.tickMs), either paid or knocked out — so
    -- P + D is the swing count times the interval, to the millisecond. Stamina
    -- and every future preparation clock (5c) drain from this figure.
    v_tick := public.hr_hunt_limit('swing_interval_ms');
    if v_tick is null or v_tick <= 0 or v_paid + v_down <> v_nsw * v_tick then
      perform public.hr_reject('bad_clock', jsonb_build_object('paid_ms', v_paid, 'down_ms', v_down,
        'swings', v_nsw, 'interval_ms', v_tick));
    end if;
    v_dmax := case when v_rec0 is not null and v_rec0 > v_s.settled_to
                   then floor(extract(epoch from (v_rec0 - v_s.settled_to)) * 1000)::bigint + v_tick else 0 end
            + coalesce((select sum(greatest(0, coalesce((d.value->>'recovery_ms')::bigint, 0)) + v_tick)
                          from jsonb_array_elements(case when jsonb_typeof(p_delta->'deaths') = 'array'
                                                         then p_delta->'deaths' else '[]'::jsonb end) d
                         where coalesce((d.value->>'recovery_ms')::bigint, 0) > 0), 0);
    if v_down > v_dmax then
      perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'down_unbacked', 'down_ms', v_down, 'max_ms', v_dmax));
    end if;
    if v_e < greatest(0, v_s0 - v_paid) or v_e > greatest(0, v_s0 - v_paid + v_down) or v_e > greatest(v_s0, v_cap) then
      perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'bound', 'from_ms', v_s0, 'ms', v_e,
        'paid_ms', v_paid, 'down_ms', v_down));
    end if;
    if v_s0 <= 0 and v_nsw > 0 then
      perform public.hr_reject('end_missing', jsonb_build_object('reason', 'stamina'));
    end if;
    update public.player_state set stamina_ms = v_e, stamina_at = v_to
     where user_id = p_user and slot = p_slot;

    -- (5c) THE HUNTING CLOCKS (architecture contracts S6/X1), RESERVED. The one
    --      place a hunting-time debit will run — preparations (honing stones,
    --      imbuements, charms) drain by exactly v_paid, the window's checked
    --      hunting ms above, and by nothing else (never cron, never wall time).
    --      Empty until the preparation lane ships; deliberately placed after the
    --      stamina pool (5a) and before the shop (5b).
    -- (5b) THE SHOP: PRICED BY THE CATALOGUE, CAPPED, DEBITED, JOURNALLED.
    --      Uses only crossed the wire; the price is hr_hunt_basic_supplies.price.
    --      Caps (blast radius of a compromised engine, never balance):
    --        per window — heal + drink buys + heal / buff bag uses ≤ W / the
    --        consumable lane's cooldown + 1 (ONE lane, Combat Design Bible
    --        v1.4), shots ≤ the swings walked + 1;
    --        per UTC day — the lane's buys today, and the shots, ≤ the same bound over 24 h.
    --      The gold must cover the cost after hr_apply credited the window's
    --      coins (`gold_short` otherwise); ONE `supply_buy` row per settle.
    v_floor := coalesce((select a.gold_floor from public.player_action_sets a
                          where a.user_id = p_user and a.slot = p_slot and a.preset = v_s.preset),
                        public.hr_hunt_limit('gold_floor_default'), 0);
    -- SELL-TO-COVER FIRST (master plan row 3): each unit is a cover item, at the
    -- vendor's own price, and bounded by what THIS session looted of it (the
    -- folded tally + this window's loot) less what was already sold, and by the
    -- bag. Credited, taken out of the bag, journalled once, stated as an event.
    if v_cover <> '{}'::jsonb then
      for v_k, v_v in select key, value from jsonb_each(v_cover) order by key loop
        v_n := (v_v #>> '{}')::bigint;
        continue when v_n = 0;
        select c.unit into v_unit from public.hr_hunt_cover_items c where c.item_id = v_k;
        if v_unit is null then perform public.hr_reject('not_coverable', jsonb_build_object('item', v_k)); end if;
        select least(
                 coalesce((select pi.qty from public.player_inventory pi
                            where pi.user_id = p_user and pi.slot = p_slot and pi.item_id = v_k), 0),
                 coalesce((select (t.loot->>v_k)::numeric from public.hunt_session_tally t where t.session_id = p_session), 0)::bigint
                 + greatest(0, coalesce(case when jsonb_typeof(p_delta->'items'->v_k) = 'number'
                                             then (p_delta->'items'->>v_k)::numeric end, 0))::bigint
                 - coalesce((select (t.covered->>v_k)::bigint from public.hunt_session_tally t where t.session_id = p_session), 0))
          into v_avail;
        if v_n > coalesce(v_avail, 0) then
          perform public.hr_reject('cover_over', jsonb_build_object('item', v_k, 'units', v_n, 'avail', v_avail));
        end if;
        -- (the bag's rows hold qty > 0: the last units take the row with them)
        delete from public.player_inventory where user_id = p_user and slot = p_slot and item_id = v_k and qty = v_n;
        update public.player_inventory set qty = qty - v_n where user_id = p_user and slot = p_slot and item_id = v_k;
        v_citems := v_citems || jsonb_build_object(v_k, jsonb_build_object('qty', v_n, 'unit', v_unit));
        v_cgold := v_cgold + v_n * v_unit;
        v_cunits := v_cunits + v_n;
        v_unit := null; v_avail := null;
      end loop;
      if v_cgold > 0 then
        update public.player_state set gold = gold + v_cgold where user_id = p_user and slot = p_slot;
        insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id)
          values (p_user, p_slot, 'hunt', 'vendor_cover', v_cgold, -v_cunits,
                  jsonb_build_object('reason', 'vendor_cover', 'items', v_citems, 'gold', v_cgold), p_session);
        update public.hunt_session_tally t
           set covered = public.hr_jsonb_add(t.covered, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                            from jsonb_each(v_citems) i)),
               cover_gold = t.cover_gold + v_cgold
         where t.session_id = p_session;
        insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
          values (p_session, p_user, p_slot, 'cover', v_to, jsonb_build_object('n', v_cunits, 'gold', v_cgold));
      end if;
      -- Loot is sold only to pay the shop: a window that sold and bought nothing is refused.
      if v_buys = '{}'::jsonb then perform public.hr_reject('cover_unspent'); end if;
    end if;
    if v_buys <> '{}'::jsonb then
      v_cdh := (select l.ms from public.hr_hunt_lanes l where l.lane = 'consumable' and l.active);
      if v_cdh is null then perform public.hr_reject('catalogue_missing'); end if;
      for v_k, v_v in select key, value from jsonb_each(v_buys) order by key loop
        v_n := (v_v #>> '{}')::bigint;
        continue when v_n = 0;
        select q.price, q.kind into v_price, v_kind from public.hr_hunt_basic_supplies q where q.basic_id = v_k;
        if v_price is null then perform public.hr_reject('not_for_sale', jsonb_build_object('item', v_k)); end if;
        -- No kind is sold without a cap row (master plan row 18): drinks wait for mana.
        if v_kind not in ('heal', 'ammo') then perform public.hr_reject('kind_not_sold', jsonb_build_object('item', v_k, 'kind', v_kind)); end if;
        -- GOLD MOVES ONLY THROUGH A SLOT THAT SHOWS ITS PRICE (master plan row 1):
        -- the running bar names this shop use in a slot that is on (a shop heal
        -- may be named by `*heal_shop` at this hunt's tier).
        if not exists (select 1 from jsonb_array_elements(coalesce(
                         public.hr_hunt_preset_slots(p_user, p_slot, v_s.preset), '[]'::jsonb)) e
                        where coalesce((e.value->>'on')::boolean, false)
                          and (e.value->>'item' = v_k
                               or (e.value->>'item' = '*heal_shop' and v_kind = 'heal'
                                   and exists (select 1 from public.hr_hunt_basic_supplies q
                                                where q.basic_id = v_k
                                                  and (select t.tier from public.hr_hunt_travel t where t.hunt_id = v_s.hunt_id) = any (q.tiers))))) then
          perform public.hr_reject('not_on_bar', jsonb_build_object('item', v_k));
        end if;
        -- THE STORE IS USED ONLY ON THE PLAYER'S CHOICE (Master Design Reference
        -- §4): ANY shop buy — heal, drink or shot — needs the running set to
        -- read supply_source 'store' or on_empty 'switch'. (Whether a 'switch'
        -- buy came after the carried line was empty is the engine's walk; the
        -- money half here is that the player opted into the store at all.)
        if not exists (select 1 from public.player_action_sets a
                        where a.user_id = p_user and a.slot = p_slot and a.preset = v_s.preset
                          and (a.supply_source = 'store' or a.on_empty = 'switch')) then
          perform public.hr_reject('store_off', jsonb_build_object('item', v_k)); end if;
        v_bk := v_bk || jsonb_build_object(v_kind, coalesce((v_bk->>v_kind)::bigint, 0) + v_n);
        v_items := v_items || jsonb_build_object(v_k, jsonb_build_object('qty', v_n, 'price', v_price));
        v_cost := v_cost + v_n * v_price;
        v_units := v_units + v_n;
        v_price := null; v_kind := null;
      end loop;
      select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_ukind from (
        select q.kind as k, sum((u.value #>> '{}')::bigint) as n
          from jsonb_each(case when jsonb_typeof(p_hunt->'uses') = 'object' then p_hunt->'uses' else '{}'::jsonb end) u
          join public.hr_hunt_supplies q on q.item_id = u.key
         where jsonb_typeof(u.value) = 'number' group by q.kind) a;
      select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_day from (
        select q.kind as k, sum((x.value->>'qty')::bigint) as n
          from public.player_ledger l, jsonb_each(case when jsonb_typeof(l.meta->'items') = 'object' then l.meta->'items' else '{}'::jsonb end) x
          join public.hr_hunt_basic_supplies q on q.basic_id = x.key
         where l.user_id = p_user and l.slot = p_slot and l.kind = 'hunt' and l.intent = 'supply_buy'
           and l.at >= public.hr_utc_day_start(now()) group by q.kind) a;
      if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_bk->>'mana')::bigint, 0)
           + coalesce((v_ukind->>'heal')::bigint, 0) + coalesce((v_ukind->>'buff')::bigint, 0) > v_win / v_cdh + 1
         or coalesce((v_bk->>'ammo')::bigint, 0) > v_nsw + 1 then
        perform public.hr_reject('too_many_buys', jsonb_build_object('bought', v_bk, 'used', v_ukind, 'window_ms', v_win));
      end if;
      if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_day->>'heal')::bigint, 0)
           + coalesce((v_bk->>'mana')::bigint, 0) + coalesce((v_day->>'mana')::bigint, 0) > c_day_ms / v_cdh + 1
         or coalesce((v_bk->>'ammo')::bigint, 0) + coalesce((v_day->>'ammo')::bigint, 0) > c_day_ms / c_min_swing + 1 then
        perform public.hr_reject('too_many_buys', jsonb_build_object('why', 'day', 'bought', v_bk, 'today', v_day));
      end if;
      -- THE FLOOR: after the window's coins and cover, the buys may not take
      -- gold below the action set's floor.
      select gold into v_gold_now from public.player_state where user_id = p_user and slot = p_slot;
      if coalesce(v_gold_now, 0) - v_cost < v_floor then
        perform public.hr_reject('gold_short', jsonb_build_object('gold', v_gold_now, 'cost', v_cost, 'floor', v_floor));
      end if;
      if v_cost > 0 then
        update public.player_state set gold = gold - v_cost where user_id = p_user and slot = p_slot;
        insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id)
          values (p_user, p_slot, 'hunt', 'supply_buy', -v_cost, -v_units,
                  jsonb_build_object('reason', 'supply_buy', 'items', v_items, 'gold', v_cost), p_session);
        update public.hunt_session_tally t
           set bought = public.hr_jsonb_add(t.bought, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                          from jsonb_each(v_items) i)),
               supply_gold = t.supply_gold + v_cost
         where t.session_id = p_session;
      end if;
    end if;

    v_h := public.hr_hunt_settle_session(p_user, p_slot, p_session, v_hunt);
    -- C1 rev. 1 answered refusals as {ok:false}; the contract is a rollback.
    if coalesce(v_h->>'ok', 'true') = 'false' then
      perform public.hr_reject(coalesce(v_h->>'error', 'hunt_settle_refused'), v_h);
    end if;
    -- STAMINA LOW (master plan row 4): once per hunt, when the pool this window
    -- left is at or under the limits row, stamped at its end.
    if v_e <= coalesce(public.hr_hunt_limit('stamina_low_min'), 0)::bigint * 60000
       and not exists (select 1 from public.hunt_session_events e where e.session_id = p_session and e.type = 'stamina_low') then
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'stamina_low', v_to, jsonb_build_object('n', v_e / 60000));
    end if;

    -- (6) THE PRICE OF THE FALLS, RE-CHECKED AND DEBITED. After hr_apply has
    --     credited the window, each skill's xp is the highest it reached, so
    --     its level's gap bounds EVERY fall's share (the XP curve's gaps only
    --     grow); and the debit may never take the skill below the level the
    --     window STARTED at. Any refusal rolls the whole settle back.
    if v_lost <> '{}'::jsonb then
      for v_k, v_n in select key, (value #>> '{}')::bigint from jsonb_each(v_lost) order by key loop
        select xp into v_cur from public.player_skills
         where user_id = p_user and slot = p_slot and skill_id = v_k for update;
        if v_cur is null then perform public.hr_reject('bad_death_xp', jsonb_build_object('skill', v_k)); end if;
        v_lv := public.hr_level_from_xp(v_cur);
        if v_lv >= 99 or exists (
             select 1 from jsonb_array_elements(v_dx) e
              where coalesce((e.value->>v_k)::bigint, 0)
                    > floor((public.hr_xp_for_level(v_lv + 1) - public.hr_xp_for_level(v_lv)) * v_rate / 1000.0)) then
          perform public.hr_reject('death_xp_over', jsonb_build_object('skill', v_k, 'level', v_lv));
        end if;
        v_lv0 := public.hr_level_from_xp(coalesce((v_xp0->>v_k)::bigint, 0));
        if v_cur - v_n < public.hr_xp_for_level(v_lv0) then
          perform public.hr_reject('death_xp_over', jsonb_build_object('skill', v_k, 'floor_level', v_lv0));
        end if;
        update public.player_skills set xp = xp - v_n
         where user_id = p_user and slot = p_slot and skill_id = v_k;
      end loop;
      -- ONE row per settle that cost anything (journal rule 6): kind 'hunt', so
      -- the session fold never counts it as gain; stamped with the session.
      insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
        values (p_user, p_slot, 'hunt', 'death_xp',
                jsonb_build_object('reason', 'death_xp', 'xp', v_lost, 'falls', v_nd, 'permille', v_rate), p_session);
      -- A level the falls took back is not reached: hr_hunt_settle_session
      -- derived this settle's level_up events from the xp BEFORE the debit.
      for v_r in select e.id, e.data->>'skill' as sk, (e.data->>'level')::int as lv
                   from public.hunt_session_events e
                  where e.session_id = p_session and e.id > v_ev0 and e.type = 'level_up'
                    and v_lost ? (e.data->>'skill') loop
        v_fin := public.hr_level_from_xp((select xp from public.player_skills
                                           where user_id = p_user and slot = p_slot and skill_id = v_r.sk));
        v_lv0 := public.hr_level_from_xp(coalesce((v_xp0->>v_r.sk)::bigint, 0));
        if v_r.lv > v_fin then
          if v_fin > v_lv0 then
            update public.hunt_session_events set data = data || jsonb_build_object('level', v_fin) where id = v_r.id;
          else
            delete from public.hunt_session_events where id = v_r.id;
          end if;
        end if;
      end loop;
    end if;
    -- Every fall of this settle states its own price, in fall order (one
    -- `fall` row per death row, inserted in death-row order), zeros included.
    v_fi := 0;
    for v_r in select e.id from public.hunt_session_events e
                where e.session_id = p_session and e.id > v_ev0 and e.type = 'fall' order by e.id loop
      v_el := coalesce(v_dx->v_fi, '{}'::jsonb);
      update public.hunt_session_events
         set data = data || jsonb_build_object('xp_lost', v_el,
                     'xp', (select coalesce(sum((x.value #>> '{}')::bigint), 0) from jsonb_each(v_el) x))
       where id = v_r.id;
      v_fi := v_fi + 1;
    end loop;

    -- (7) AN AUTOMATIC END RESUMES WHAT THE CHARACTER WAS DOING. The reason
    --     admits it (hr_hunt_end_reasons.resumes, from RESUME_AFTER_END: never a
    --     manual leave or change); the remembered activity must still be in the
    --     catalogue and pass its skill gate against SERVER xp (hr_apply's own
    --     rule); it starts when the walk home ends (ended_at + the hunt's walk),
    --     the same instant however the windows were cut. Else idle, as C1 left
    --     it. Journalled either way; stated on this settle's `ended` event.
    v_end := v_h->>'ended';
    if v_end is not null and coalesce((select r.resumes from public.hr_hunt_end_reasons r where r.reason = v_end), false) then
      select ps.last_activity_kind, ps.last_activity_id into v_lk, v_li
        from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
      select h.ended_at + make_interval(secs => coalesce((select t.travel_s from public.hr_hunt_travel t where t.hunt_id = h.hunt_id), 0))
        into v_home from public.hunt_sessions h where h.id = p_session;
      v_ok := v_lk is not null and v_home is not null
        and exists (select 1 from public.hr_activities a where a.kind = v_lk and a.activity_id = v_li)
        and not exists (select 1 from public.hr_activities a
                         where a.kind = v_lk and a.activity_id = v_li
                           and a.req_skill is not null and a.req_lv is not null
                           and coalesce((select public.hr_level_from_xp(sk.xp) from public.player_skills sk
                                          where sk.user_id = p_user and sk.slot = p_slot and sk.skill_id = a.req_skill), 1) < a.req_lv);
      if v_ok then
        update public.player_state
           set active_kind = v_lk, active_id = v_li, active_since = v_home, accrued_to = v_home,
               fight = '{}'::jsonb, version = version + 1, updated_at = now()
         where user_id = p_user and slot = p_slot;
        -- A FRESH PRESENCE ANCHOR at the walk-home instant (master plan row 5):
        -- the resumed activity's unattended horizon runs from there, so "hunt
        -- 12 h, then train / gather 12 h" pays. Raise-only.
        insert into public.hr_return_anchor (user_id, slot, real_return_at, updated_at)
          values (p_user, p_slot, v_home, now())
          on conflict (user_id, slot) do update
            set real_return_at = greatest(public.hr_return_anchor.real_return_at, excluded.real_return_at),
                updated_at = now();
      end if;
      insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
        values (p_user, p_slot, 'hunt', 'resume',
                jsonb_build_object('reason', v_end, 'resumed', v_ok, 'kind', v_lk, 'id', v_li, 'at', v_home), p_session);
      update public.hunt_session_events e
         set data = e.data || jsonb_build_object('resume', case when v_ok
                       then jsonb_build_object('kind', v_lk, 'id', v_li, 'at', v_home) else null end)
       where e.session_id = p_session and e.id > v_ev0 and e.type = 'ended';
    end if;
  exception when sqlstate 'HR000' then
    get stacked diagnostics v_code = message_text, v_detail = pg_exception_detail;
    perform set_config('hr.hunt_session', '', true);
    perform public.hr_record_rejection(p_user, p_slot, 'hunt_settle', v_code,
      jsonb_build_object('session', p_session, 'swing_from', p_hunt->'swing_from'));
    return jsonb_build_object('ok', false, 'error', v_code, 'stage', 'session',
      'detail', case when v_detail ~ '^\{.*\}$' then v_detail::jsonb end);
  end;

  v_out := case when p_project then public.hr_state_of(p_user, p_slot) else v_a end;
  return v_out || jsonb_build_object('ok', true, 'hunt_settle', v_h,
                                     'session', public.hr_hunt_view(p_session));
end $$;

-- ── §6 THE FENCE: no accrue row OF ANY KIND for a hunter outside its own
--    settle (Security design review 2026-10-14 item 11: combat, gather,
--    artisan, party — whatever the journal names, a hunter is paid by the
--    hunt settle or not at all) ─────────────────────────────────────────────
create or replace function public.hr_hunt_accrue_fence()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
declare v_s uuid; v_g text := coalesce(current_setting('hr.hunt_session', true), '');
begin
  select h.id into v_s from public.hunt_sessions h
   where h.user_id = new.user_id and h.slot = new.slot and h.ended_at is null;
  if v_s is not null and v_g <> v_s::text then
    perform public.hr_reject('hunt_open', jsonb_build_object('session', v_s));
  end if;
  return new;
end $$;
revoke execute on function public.hr_hunt_accrue_fence() from public, anon, authenticated, service_role;
drop trigger if exists hr_hunt_accrue_fence on public.player_ledger;
-- HIRED HANDS ARE NOT THE HERO (design ruling, Coordinator 2026-10-15): a
-- worker crew works independently of the hero's hunt and KEEPS BANKING during
-- it, so a `kind 'worker'` accrue row passes; every other accrue kind is fenced.
create trigger hr_hunt_accrue_fence before insert on public.player_ledger
  for each row when (new.intent = 'accrue' and new.kind <> 'worker')
  execute function public.hr_hunt_accrue_fence();

-- ── §6b THE TWO CLIENT CREDIT DOORS ARE SHUT FOR A HUNTER ───────────────────
-- hr_credit_combat_xp (live combat XP) and hr_credit_kills (attended kill
-- credit) let the CLIENT report what its own 2.4 s fight did. A hunt has no
-- client fight: the hunt settle pays every swing's XP and files every kill
-- counter itself, ignoring combat_xp_accrued_to — so a credit on top would pay
-- the same fight TWICE (XP is ranked; the kill counters feed bounties, dailies
-- and renown). Each wrapper is RESTATED WHOLE from its installed body (md5
-- pinned below) with ONE change: the call to __ungated is skipped, and
-- `hunt_open` answered instead, while the caller holds an open session. Still
-- ONE hr_note_rejection seam per wrapper (tests/rejections-journal.mjs P6).
-- hr_credit_kills is dropped outright by 2026-10-22-hunt-sessions-drop-away.sql;
-- this covers the window between the C2 deploy and that apply.
do $mig$
declare v_md5 text;
begin
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc
   where oid = to_regprocedure('public.hr_credit_combat_xp(integer,jsonb,text)');
  if v_md5 is null or (v_md5 <> 'b96fd20d3a8e7226a69a3857653212df'
       and strpos((select prosrc from pg_proc where oid = 'public.hr_credit_combat_xp(integer,jsonb,text)'::regprocedure),
                  'hr_hunt_open_of') = 0) then
    raise exception 'hr_credit_combat_xp is not the body this file restates (md5 %) — restate from the installed body', v_md5;
  end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc
   where oid = to_regprocedure('public.hr_credit_kills(integer,text,bigint,text)');
  if v_md5 is not null and v_md5 <> 'b5362b470a8b442e1ba8ed72fafcb7ed'
     and strpos((select prosrc from pg_proc where oid = to_regprocedure('public.hr_credit_kills(integer,text,bigint,text)')),
                'hr_hunt_open_of') = 0 then
    raise exception 'hr_credit_kills is not the body this file restates (md5 %) — restate from the installed body', v_md5;
  end if;
end $mig$;

CREATE OR REPLACE FUNCTION public.hr_credit_combat_xp(p_slot integer, p_xp jsonb, p_idem text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  if not public.hr_rpc_gate('hr_credit_combat_xp') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  -- HUNT SESSIONS (2026-10-22-hunt-sessions-settle.sql §6b): a hunter's combat
  -- XP is the hunt settle's to pay; a client credit on top would pay it twice.
  return public.hr_note_rejection('hr_credit_combat_xp', p_slot,
    case when public.hr_hunt_open_of(auth.uid(), coalesce(p_slot, 0)) is not null
         then jsonb_build_object('ok', false, 'error', 'hunt_open')
         else public.hr_credit_combat_xp__ungated($1, $2, $3) end);
end $function$;
revoke execute on function public.hr_credit_combat_xp(integer, jsonb, text) from public, anon, service_role;
grant execute on function public.hr_credit_combat_xp(integer, jsonb, text) to authenticated;

do $mig$
begin
  if to_regprocedure('public.hr_credit_kills(integer,text,bigint,text)') is null then return; end if;
  execute $def$
CREATE OR REPLACE FUNCTION public.hr_credit_kills(p_slot integer, p_target text, p_claimed bigint, p_idem text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  -- SETTLE-BEFORE-MUTATE (2026-09-28-settle-before-mutate.sql, Security F2). An
  -- unpaid window is priced at the state that existed during it, so nothing that
  -- moves a priced input lands while one is open. Refuses before anything else
  -- and writes nothing to the character. (A nested block, not an exception
  -- block: no subtransaction on the accepted path.)
  declare v_settle jsonb := public.hr_settle_first_noted('hr_credit_kills', auth.uid(), p_slot);
  begin
    if v_settle is not null then return v_settle; end if;
  end;
  if not public.hr_rpc_gate('hr_credit_kills') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  -- HUNT SESSIONS (2026-10-22-hunt-sessions-settle.sql §6b): a hunter's kill
  -- counters are the hunt settle's to file; a client credit would file them twice.
  return public.hr_note_rejection('hr_credit_kills', p_slot,
    case when public.hr_hunt_open_of(auth.uid(), coalesce(p_slot, 0)) is not null
         then jsonb_build_object('ok', false, 'error', 'hunt_open')
         else public.hr_credit_kills__ungated($1, $2, $3, $4) end);
end $function$;
$def$;
  execute 'revoke execute on function public.hr_credit_kills(integer, text, bigint, text) from public, anon, service_role';
  execute 'grant execute on function public.hr_credit_kills(integer, text, bigint, text) to authenticated';
end $mig$;

-- ── §7 hr_hunt_roster — the due open sessions, leased to ONE driver ────────
create or replace function public.hr_hunt_roster(p_holder text, p_limit int default 200, p_lease_ms int default 30000)
returns table (user_id uuid, slot int, session_id uuid)
language plpgsql security definer set search_path = public, pg_catalog as $$
#variable_conflict use_column
declare
  c_max_rows constant int := 500;
  v_role    text;
  v_limit   int;
  v_lease   interval;
  v_holder  text;
  v_flush   interval;
  v_fold    int;
  v_enabled boolean;
begin
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_engine') then
    raise exception 'hr_hunt_roster: not callable by %', v_role using errcode = '42501';
  end if;
  v_limit  := least(greatest(coalesce(p_limit, 200), 1), c_max_rows);
  v_lease  := make_interval(secs => least(greatest(coalesce(p_lease_ms, 30000), 5000), 300000) / 1000.0);
  v_holder := left(coalesce(nullif(p_holder, ''), 'unnamed'), 64);
  select make_interval(secs => c.flush_seconds), c.fold_windows into v_flush, v_fold
    from public.hr_tick_config c where c.id;
  v_flush := coalesce(v_flush, interval '90 seconds');
  v_fold  := least(greatest(coalesce(v_fold, 1), 1), 8);
  v_enabled := coalesce((select c.enabled from public.hr_hunt_config c where c.id), false);
  return query
  with due as (
    select h.id, h.user_id as uid, h.slot as sl, h.settled_to
      from public.hunt_sessions h
      join public.player_state ps on ps.user_id = h.user_id and ps.slot = h.slot
      left join public.hunt_tick_lease l on l.session_id = h.id
     where h.ended_at is null
       and h.settled_to <= now()                                  -- not walking, not ahead
       and (l.session_id is null or l.lease_until < now() or l.holder = v_holder)
       and (h.leave_at is not null or h.change_at is not null or not v_enabled
            or h.settled_to <= now() - v_flush * (
                 case when coalesce(ps.last_seen_at >  now() - interval '75 seconds'
                                and ps.last_seen_at <= now() + interval '60 seconds', false)
                      then 1 else v_fold end))
     order by h.settled_to, h.id
     limit v_limit
     for update of h skip locked
  ), leased as (
    insert into public.hunt_tick_lease as t (session_id, holder, lease_until)
    select d.id, v_holder, now() + v_lease from due d
    on conflict (session_id) do update set holder = excluded.holder, lease_until = excluded.lease_until
    returning t.session_id
  )
  select d.uid, d.sl, d.id from due d join leased x on x.session_id = d.id
   order by d.settled_to, d.id;
end $$;

-- ── §8 hr_tick_cron_run — RESTATED WHOLE: the catch-up body + the hunts ────
-- 2026-10-11-world-tick-catchup.sql §2 (md5 aa35ea7090c298e145d8b55e90a39645)
-- with THREE insertions and one widened predicate, nothing else:
--   + v_hunts / v_nh declared
--   + after the shard loop: hr_hunt_roster under shard 0's holder; when it
--     returns sessions they ride THEIR OWN body (`roster: []`, `hunts: [...]`)
--     so every gather body stays byte-identical
--   ~ `if v_n = 0` → `if v_n = 0 and v_nh = 0` (a fire with only hunts posts)
--   + the fire log and the answer carry `hunts`
create or replace function public.hr_tick_cron_run()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
as $$
declare
  v_t0       timestamptz := clock_timestamp();
  v_cfg      public.hr_tick_config%rowtype;
  -- THE FAN-OUT (2026-10-11, world-tick scale S2). One POST per SHARD per
  -- fire, each to its own edge invocation, each under its own lease holder.
  -- Shard 0's holder is byte-identical to the single-POST driver's, so at
  -- shards = 1 every byte this function stamps, posts and logs is unchanged
  -- except the roster rows' dead `state` key (S1 made it NULL) and the
  -- cursor's home (hr_tick_shard_cursor).
  v_shards   int;
  k          int;
  v_holders  text[]  := '{}';
  v_bodies   text[]  := '{}';
  v_counts   int[]   := '{}';
  v_auths    text[]  := '{}';
  v_holder   text;
  v_batch    jsonb;
  v_nk       int;
  v_n        int := 0;
  v_last_u   uuid;
  v_last_s   int;
  v_last_a   timestamptz;
  v_cur      public.hr_tick_shard_cursor%rowtype;
  v_wrapped  boolean := true;
  v_gateway  text;
  v_body_sha text;
  v_bucket   bigint;
  v_auth     text;
  -- The BOOLEAN the fire log carries, computed before the note rather than
  -- inside it. d8b's rule is blunt on purpose — no `hr_tick_cron_note(...)`
  -- argument list may name `v_auth` at all — and a rule with an exception for
  -- "but only in a predicate" is a rule that stops being checkable.
  v_have_tok boolean := true;
  v_eff      int := 0;
  -- THE ADMISSION COUNTER (2026-10-06, ruling 1: shadow-chain admission ends
  -- LOUDLY). Owned, on-channel, unpartied characters the roster's admission
  -- predicate dropped, by reason. NULL when nobody was dropped, so a healthy
  -- fire's log row does not grow.
  v_adm      jsonb;
  v_out      text;
  v_ms       int;
  v_posted   int := 0;
  -- HUNT SESSIONS (2026-10-22-hunt-sessions-settle.sql): the due OPEN
  -- sessions, leased under shard 0's holder, posted as their own body.
  v_hunts    jsonb;
  v_nh       int := 0;
begin
  -- ── (1) THE ADVISORY LOCK, TAKEN FIRST. Unchanged: `_xact_` so pg_cron's own
  --        transaction releases it at commit even if this function raises, and
  --        `pg_try_` so a held lock means SKIP THIS FIRE rather than queue. ONE
  --        lock for every shard: the shards are one fire.
  if not pg_try_advisory_xact_lock(hashtext('hr_tick_cron_run')) then
    perform public.hr_tick_cron_note('locked', 0);
    return jsonb_build_object('ok', true, 'outcome', 'locked');
  end if;

  -- ── (2) THE KILL SWITCH, FAILING CLOSED. A missing row is "off".
  select * into v_cfg from public.hr_tick_config where id;
  if not found or not v_cfg.enabled then
    perform public.hr_tick_cron_note('disabled', 0);
    return jsonb_build_object('ok', true, 'outcome', 'disabled');
  end if;
  if v_cfg.edge_url is null or v_cfg.edge_url = '' then
    perform public.hr_tick_cron_note('no_edge_url', 0);
    return jsonb_build_object('ok', false, 'outcome', 'no_edge_url');
  end if;
  -- The CHECK holds shards to 1..16; a NULL (impossible: NOT NULL) reads as 1.
  v_shards := least(greatest(coalesce(v_cfg.shards, 1), 1), 16);

  -- ── (2b) WHO ADMISSION DROPPED, COUNTED (2026-10-06). Unchanged: once per
  --         fire, over the whole owned cohort (every shard).
  select case when count(*) = 0 then null
              else jsonb_object_agg(x.why, x.n) end
    into v_adm
    from (select ad.why, count(*)::int as n
            from public.hr_tick_ownership o
            join public.player_state ps
              on ps.user_id = o.user_id and ps.slot = o.slot
           cross join lateral (
             select coalesce(o.channel = any (v_cfg.armed_channels), false) as armed) a
           cross join lateral (
             select public.hr_tick_admit(a.armed, ps.accrued_to,
                      case when not a.armed
                           then greatest(ps.accrued_to, coalesce(o.shadow_accrued_to, ps.accrued_to))
                           else ps.accrued_to end) as why) ad
           where o.owned
             and o.channel = ps.active_kind
             and ps.active_kind = any (v_cfg.channels)
             and not public.hr_partied(o.user_id, o.slot)
             and ad.why <> 'admit'
           group by ad.why) x;

  -- ── (3) THE BATCHES, ONE PER SHARD. `hr_shard_of` (a stable hash of user_id
  --        mod shards) partitions the owned cohort, so the shards' rosters are
  --        DISJOINT by construction; the per-shard holder makes a character
  --        leased by one shard unclaimable by another until that lease ends
  --        (the roster's lease predicate), which is what keeps a change of
  --        `shards` from ever handing one character to two invocations.
  --        `r.accrued_to` is the EFFECTIVE watermark (Security M-1).
  for k in 0 .. v_shards - 1 loop
    -- THE HOLDER. Shard 0: the single-POST driver's expression, unchanged.
    -- Shard k > 0: the same prefix cut to 58 so ':s<k>' always fits in 64 and
    -- can never be truncated into shard 0's name. tick.js TICK_HOLDER_SQL is
    -- the same expression; tests/world-tick-scale.mjs H1 drives both.
    v_holder := case when k = 0 then left('cron:' || coalesce(current_database(), 'db'), 64)
                     else left('cron:' || coalesce(current_database(), 'db'), 58) || ':s' || k end;
    select * into v_cur from public.hr_tick_shard_cursor where shard = k;
    if not found then
      v_cur.cursor_at := null; v_cur.cursor_user := null; v_cur.cursor_slot := null;
    end if;
    select jsonb_agg(jsonb_build_object(
             'user_id', r.user_id, 'slot', r.slot, 'shard', r.shard,
             'active_kind', r.active_kind, 'active_id', r.active_id,
             'active_since', r.active_since, 'accrued_to', r.accrued_to,
             'shadow_accrued_to', r.shadow_accrued_to,
             'version', r.version, 'seed', r.seed)
             order by r.accrued_to, r.user_id, r.slot),
           count(*),
           max(r.accrued_to)
      into v_batch, v_nk, v_last_a
      from public.hr_tick_roster(v_cfg.channels, k, v_cfg.batch_limit, v_holder,
                                 v_cfg.lease_ms, v_cur.cursor_at, v_cur.cursor_user,
                                 v_cur.cursor_slot) r;
    v_nk := coalesce(v_nk, 0);

    if v_nk < v_cfg.batch_limit then
      insert into public.hr_tick_shard_cursor (shard, cursor_at, cursor_user, cursor_slot, updated_at)
      values (k, null, null, null, now())
      on conflict (shard) do update set cursor_at = null, cursor_user = null,
             cursor_slot = null, updated_at = now();
    else
      v_wrapped := false;
      select (e->>'user_id')::uuid, (e->>'slot')::int
        into v_last_u, v_last_s
        from jsonb_array_elements(v_batch) e
       order by (e->>'accrued_to')::timestamptz desc, (e->>'user_id')::uuid desc, (e->>'slot')::int desc
       limit 1;
      insert into public.hr_tick_shard_cursor (shard, cursor_at, cursor_user, cursor_slot, updated_at)
      values (k, v_last_a, v_last_u, v_last_s, now())
      on conflict (shard) do update set cursor_at = excluded.cursor_at, cursor_user = excluded.cursor_user,
             cursor_slot = excluded.cursor_slot, updated_at = now();
    end if;

    if v_nk > 0 then
      v_n := v_n + v_nk;
      v_eff := greatest(v_eff,
        v_cfg.cadence_seconds * greatest(1, ceil(v_nk::numeric / greatest(1, v_cfg.batch_limit))::int));
      v_holders := v_holders || v_holder;
      v_counts  := v_counts || v_nk;
      -- ── (4a) THE BODY, AS TEXT, BECAUSE THE MAC BINDS THE BYTES.
      --         `net.http_post` stores `convert_to(body::text,'UTF8')` and sends
      --         those bytes verbatim, so hashing this exact text and posting
      --         `v_body_txt::jsonb` hashes what leaves. `shard` is the one new
      --         key: the edge derives its holder from it (a SELECTOR, bound by
      --         the MAC like every byte here; the fence still refuses any
      --         character whose lease is not that holder's).
      v_bodies := v_bodies || (jsonb_build_object('op', 'tick', 'holder', v_holder,
                                   'shard', k,
                                   -- per channel since 2026-10-06; the
                                   -- edge IGNORES this key (tick.js reads
                                   -- the mode off the fence), it is here
                                   -- for the operator reading the queue.
                                   'armed', to_jsonb(v_cfg.armed_channels),
                                   'cadence_ms', v_cfg.cadence_seconds * 1000,
                                   'flush_ms', v_cfg.flush_seconds * 1000,
                                   -- CATCH-UP AND FOLD (2026-10-11, S3/S4):
                                   -- how many flush windows one visit may
                                   -- settle, and how many of them one settle
                                   -- (one ledger row) may carry. GEOMETRY
                                   -- like cadence/flush: clamped again by the
                                   -- edge; the fence decides every payment.
                                   'catchup_windows', v_cfg.catchup_windows,
                                   'fold_windows', v_cfg.fold_windows,
                                   'roster', v_batch)::text);
    end if;
  end loop;

  -- The single-POST driver kept its cursor on the config row. Retired there
  -- (hr_tick_shard_cursor is the cursor now); cleared so nobody reads a stale one.
  update public.hr_tick_config set cursor_at = null, cursor_user = null,
         cursor_slot = null, updated_at = now() where id;

  -- ── (3c) THE HUNTS (2026-10-22, lane C2). The due open hunt sessions
  --         (hr_hunt_roster: a pending leave/change or the kill switch at
  --         the next fire, an online character every flush, an away one every
  --         flush x fold), leased to shard 0's holder. They ride THEIR OWN
  --         body — an empty roster and a `hunts` array — so every gather body
  --         above is byte-identical to the catch-up driver's. SELECTORS only:
  --         the edge re-reads every session and the character itself, and
  --         hr_hunt_apply decides whether anything may land.
  v_holder := left('cron:' || coalesce(current_database(), 'db'), 64);
  select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'slot', r.slot, 'session_id', r.session_id)),
         count(*)
    into v_hunts, v_nh
    from public.hr_hunt_roster(v_holder, v_cfg.batch_limit, v_cfg.lease_ms) r;
  v_nh := coalesce(v_nh, 0);
  if v_nh > 0 then
    v_holders := v_holders || v_holder;
    v_counts  := v_counts || v_nh;
    v_bodies := v_bodies || (jsonb_build_object('op', 'tick', 'holder', v_holder,
                                 'shard', 0,
                                 'armed', to_jsonb(v_cfg.armed_channels),
                                 'cadence_ms', v_cfg.cadence_seconds * 1000,
                                 'flush_ms', v_cfg.flush_seconds * 1000,
                                 'catchup_windows', 1,
                                 'fold_windows', 1,
                                 'roster', '[]'::jsonb,
                                 'hunts', v_hunts)::text);
  end if;

  if v_n = 0 and v_nh = 0 then
    perform public.hr_tick_cron_note('empty',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, 0, null,
     case when v_adm is null then null else jsonb_build_object('admission', v_adm) end);
    return jsonb_build_object('ok', true, 'outcome', 'empty');
  end if;

  -- ── (4) THE GATEWAY KEY. STILL A VARIABLE, AND THAT IS CORRECT: it is the
  --        project ANON key, public by design (src/net/supabase-bootstrap.js),
  --        read from Vault only so a project move is a Vault write rather than
  --        a migration. `supabase/config.toml` pins `verify_jwt = true` on
  --        hr-accrue and it STAYS ON (tests/edge-jwt-gate.mjs --strict), so the
  --        Supabase gateway refuses the request before the function runs unless
  --        `Authorization` carries a JWT it accepts. IT IS NOT THE TICK'S
  --        AUTHORISATION and must never be mistaken for it.
  if to_regclass('vault.decrypted_secrets') is null then
    v_gateway := null;
  else
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
      into v_gateway using 'hr_tick_gateway_key';
  end if;

  -- T-5.3's bucket, on `now()` (transaction time) exactly as the ruling spells
  -- it. The edge accepts {n-1, n, n+1}, so the ≤90 s window absorbs both the
  -- fire's own duration and any Postgres↔edge skew. One bucket per fire.
  v_bucket := floor(extract(epoch from now()) / 30)::bigint;

  -- ── (4b) THE DERIVATION, PER BODY. pgcrypto absent is `no_hmac` and NOTHING
  --         IS POSTED for any shard: there is no static fallback, by
  --         construction — this function has no code path that can put a
  --         long-lived secret on the wire. Every MAC is derived before any POST,
  --         so a fire either posts every shard's body or none.
  for k in 1 .. cardinality(v_bodies) loop
    v_body_sha := public.hr_tick_body_sha256(v_bodies[k]);
    if v_body_sha is null then
      perform public.hr_tick_cron_note('no_hmac',
       floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
       jsonb_build_object('hint', 'pgcrypto is not reachable: create extension if not exists pgcrypto'));
      return jsonb_build_object('ok', false, 'outcome', 'no_hmac', 'rostered', v_n);
    end if;
    v_auth := public.hr_tick_auth_header(v_bucket, v_body_sha);
    v_have_tok := v_have_tok and v_auth is not null;
    v_auths := v_auths || v_auth;
  end loop;

  if not v_have_tok or v_gateway is null or v_gateway = '' then
    perform public.hr_tick_cron_note('no_secret',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
     -- ⚠ THE HINT DOES NOT NAME THE TICK SECRET, and that is load-bearing
     --   rather than coy: d9 asserts that `hr_tick_cron_run`'s installed body
     --   mentions it NOWHERE, which is what makes "exactly one routine in
     --   public can reach the plaintext" a checkable equality instead of a
     --   claim. §6 of 2026-09-22-world-tick-derived-token.sql carries both names
     --   for the operator.
     jsonb_build_object('hint', 'vault needs the tick token secret (>= 32 chars) and the gateway key'
                                ' — see §6 of 2026-09-22-world-tick-derived-token.sql',
                        'have_tick_token', v_have_tok,
                        'have_gateway_key', v_gateway is not null and v_gateway <> ''));
    return jsonb_build_object('ok', false, 'outcome', 'no_secret', 'rostered', v_n);
  end if;

  -- ── (5) THE POSTS. Dynamic EXECUTE so this file APPLIES where pg_net is not
  --        installed; the job then reports `pg_net_absent` every fire, which is
  --        a visible, harmless, fixable state rather than a migration that will
  --        not replay. pg_net sends the queued requests CONCURRENTLY after this
  --        transaction commits: N shards are N parallel edge invocations.
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    perform public.hr_tick_cron_note('pg_net_absent',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
     jsonb_build_object('hint', 'create extension if not exists pg_net'));
    return jsonb_build_object('ok', false, 'outcome', 'pg_net_absent', 'rostered', v_n);
  end if;

  v_out := 'posted';
  for k in 1 .. cardinality(v_bodies) loop
    begin
      execute 'select net.http_post($1, $2, $3, $4, $5)'
        using v_cfg.edge_url,
              v_bodies[k]::jsonb,
              '{}'::jsonb,
              jsonb_build_object('Content-Type', 'application/json',
                                 -- the GATEWAY's gate...
                                 'Authorization', 'Bearer ' || v_gateway,
                                 -- ...and the tick's own, DERIVED PER BODY. The
                                 -- Vault secret is not here and never was: this
                                 -- value is a mac over (bucket, body hash).
                                 'X-HR-Tick-Auth', v_auths[k]),
              greatest(1000, v_cfg.cadence_seconds * 1000 - 1000);
      v_posted := v_posted + 1;
    exception when others then
      -- Nothing derived from a secret reaches the log even in an error path.
      -- The shards already queued stay queued (their sub-transactions
      -- committed); the fire is logged `error` with how many went out.
      perform public.hr_tick_cron_note('error',
       floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
       jsonb_build_object('sqlstate', sqlstate, 'posted_shards', v_posted));
      return jsonb_build_object('ok', false, 'outcome', 'error', 'sqlstate', sqlstate);
    end;
  end loop;

  -- ⚠ THE MAC IS NOT JOURNALLED EITHER. It is not the secret, but it is a valid
  --   credential for one body for ≤90 s, and `hr_tick_cron_log` exists to be
  --   read by an operator. `bucket` is logged because it is a clock reading and
  --   nothing else. d8 executes the absence of any 64-hex run in `detail`.
  --   `shards` / `rostered_by_shard` appear only when the fire fanned out, so a
  --   one-shard fire's log row is the single-POST driver's, key for key.
  v_ms := floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int;
  perform public.hr_tick_cron_note(v_out, v_ms, v_n, v_eff,
    jsonb_build_object('armed', to_jsonb(v_cfg.armed_channels), 'holder', v_holders[1],
                       'auth', 'v1', 'bucket', v_bucket,
                       'cursor_wrapped', v_wrapped, 'hunts', v_nh)
    || case when v_shards > 1
            then jsonb_build_object('shards', v_shards, 'rostered_by_shard', to_jsonb(v_counts),
                                    'holders', to_jsonb(v_holders))
            else '{}'::jsonb end
    || case when v_adm is null then '{}'::jsonb else jsonb_build_object('admission', v_adm) end);
  return jsonb_build_object('ok', true, 'outcome', v_out, 'rostered', v_n,
                            'armed', to_jsonb(v_cfg.armed_channels), 'ms', v_ms,
                            'auth', 'v1',
                            'effective_cadence_seconds', v_eff, 'hunts', v_nh)
    || case when v_shards > 1 then jsonb_build_object('shards', v_shards, 'posts', v_posted)
            else '{}'::jsonb end;
end $$;

-- ── §9 GRANTS — EXACT, REVOKE FIRST ────────────────────────────────────────
-- Literal lines, one per function, so tests/run-sql-tests.mjs's grant lints
-- read every revoke (a loop of format() calls is invisible to them).
revoke execute on function public.hr_hunt_open_of(uuid, int) from public;
revoke execute on function public.hr_hunt_open_of(uuid, int) from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_hunt_engine_read(uuid, int) from public;
revoke execute on function public.hr_hunt_engine_read(uuid, int) from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_hunt_buffs_put(uuid, int, timestamptz, timestamptz, jsonb, jsonb) from public;
revoke execute on function public.hr_hunt_buffs_put(uuid, int, timestamptz, timestamptz, jsonb, jsonb) from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_hunt_apply(uuid, int, uuid, bigint, uuid, jsonb, jsonb, jsonb, jsonb, boolean) from public;
revoke execute on function public.hr_hunt_apply(uuid, int, uuid, bigint, uuid, jsonb, jsonb, jsonb, jsonb, boolean) from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_hunt_roster(text, int, int) from public;
revoke execute on function public.hr_hunt_roster(text, int, int) from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_tick_cron_run() from public;
revoke execute on function public.hr_tick_cron_run() from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_stamina_of(uuid, int, timestamptz) from public;
revoke execute on function public.hr_stamina_of(uuid, int, timestamptz) from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_hunt_pull_of(uuid, int, uuid) from public;
revoke execute on function public.hr_hunt_pull_of(uuid, int, uuid) from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_stamina_view(uuid, int) from public;
revoke execute on function public.hr_stamina_view(uuid, int) from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_last_activity_note() from public;
revoke execute on function public.hr_last_activity_note() from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_action_set_options(int, int, jsonb, uuid) from public;
revoke execute on function public.hr_action_set_options(int, int, jsonb, uuid) from anon, service_role, hr_engine, hr_tick;
grant  execute on function public.hr_action_set_options(int, int, jsonb, uuid) to authenticated;
grant execute on function public.hr_hunt_open_of(uuid, int) to hr_engine;
grant execute on function public.hr_hunt_engine_read(uuid, int) to hr_engine;
grant execute on function public.hr_hunt_apply(uuid, int, uuid, bigint, uuid, jsonb, jsonb, jsonb, jsonb, boolean) to hr_engine;
grant execute on function public.hr_hunt_roster(text, int, int) to hr_tick;

-- ── THE EDGE'S CLOSED-MODE ANSWER (Security, closed-mode review item 4) ─────
-- hr_rate_gate (closed-mode L3) refuses a non-admitted account with a bare
-- `false`, which the edge answered 429 rate_limited — a refusal a player would
-- read as "slow down", and one no ledger could tell from a burst. Asked ONLY
-- after the gate refused: when the account is not admitted it journals ONE
-- hr_rejections aggregate upsert, code 'closed', for (user, slot, verb), and
-- answers true; the edge then answers 403 {error:'closed'}. An admitted
-- account that was genuinely rate-limited reads false and keeps its 429.
-- SECURITY DEFINER (hr_admitted is invoker and hr_engine holds no table
-- privilege); hr_engine only (c_engine_allow, link 18).
create or replace function public.hr_engine_closed(p_user uuid, p_slot int, p_verb text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
begin
  if p_user is null or public.hr_admitted(p_user) then return false; end if;
  perform public.hr_record_rejection(p_user, least(greatest(coalesce(p_slot, 0), 0), 5),
    left(coalesce(nullif(p_verb, ''), 'accrue'), 40), 'closed', jsonb_build_object('gate', 'edge'), 1);
  return true;
end $$;
revoke execute on function public.hr_engine_closed(uuid, int, text) from public;
revoke execute on function public.hr_engine_closed(uuid, int, text) from anon, authenticated, service_role, hr_tick;
grant execute on function public.hr_engine_closed(uuid, int, text) to hr_engine;

-- THE DETECTOR learns the three engine entries (link 18 of
-- HR_GRANT_HYGIENE_CHAIN): an INSERTION at the head of c_engine_allow, derived
-- from 2026-10-10-world-tick-presence-horizon.sql's committed block by
-- tools/derive-grant-hygiene.mjs — never hand-edited.
-- ⟦DERIVED hr_assert_grant_hygiene — tools/derive-grant-hygiene.mjs, do not hand-edit⟧
create or replace function public.hr_assert_grant_hygiene(p_strict boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_public_exec   jsonb;   -- D1 + D3: PUBLIC holds EXECUTE (functions AND procedures)
  v_unapproved    jsonb;   -- D2: client-executable but not in the baseline
  v_lost          jsonb;   -- baseline rows whose function is gone (reported)
  v_client_trunc  jsonb;   -- TRUNCATE/REFERENCES/TRIGGER on any relation
  v_defacl_open   jsonb;   -- D4: owners with no fail-closed GLOBAL default ACL
  v_platform      jsonb;   -- residual, reported only
  v_engine_extra  jsonb;   -- S9: hr_engine EXECUTE outside its allowlist
  v_engine_tables jsonb;   -- S9: hr_engine holding any table privilege
  v_ungated       jsonb;   -- A9: client-callable SECURITY DEFINER with no rate gate
  v_ops_reach     jsonb;   -- T-5: the pg_net sink hr_ops reachable by a client/engine role
  v_report jsonb;

  -- ══════════════════════════════════════════════════════════════════════
  -- S9 — THE hr_engine CAPABILITY PIN, MOVED HERE (Security, 2026-08-11)
  -- ──────────────────────────────────────────────────────────────────────
  -- It used to live in 2026-08-11-market-v2.sql §9(i), which is three defects
  -- at once and the reason it is now here:
  --
  --   1. IT DOES NOT RUN. market-v2 is UNAPPLIED and cannot be applied until
  --      the server owns gold and inventory. A pin inside an unapplied
  --      migration is a comment. hr_assert_grant_hygiene runs at every apply
  --      AND nightly via pg_cron, and its failures surface as maintenance_alerts.
  --   2. IT MATCHED ON `proname`. `p.proname <> all (array[...])` accepts ANY
  --      overload of an approved name — `hr_seed(text)` added next to
  --      `hr_seed(uuid,int,text)` would pass silently. Keyed on
  --      `p.oid::regprocedure::text` an overload is a different string and is
  --      therefore a finding, which is the correct answer.
  --   3. IT FILTERED `prokind = 'f'`. A PROCEDURE was invisible to it — exactly
  --      defect D1 that this file's own rewrite was written to fix, reproduced
  --      one section later.
  --
  -- ⚠ EVERY ENTRY CARRIES A ONE-LINE JUSTIFICATION. In the old list only entry
  --   8 did, which meant the first seven were "bounded and fine" by tradition.
  --   Adding an entry is a CLAIM: read-only or self-validating, and it accepts
  --   no target the caller is not already authorised for. Re-derive that for
  --   the whole list every time it changes.
  c_engine_allow constant text[] := array[
    -- ── ADDED 2026-10-22 — THE HUNT SETTLE (ruling HR-2026-10-14, lane C2) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Each claim re-derived:
    --
    -- read-only: the id of the character's OPEN session or null. Same target
    -- argument as hr_state_of (p_user, p_slot), one indexed row.
    'hr_hunt_open_of(uuid,integer)',
    -- read-only (STABLE): one open session — clock, bag, action bar — and the
    -- session secret hr_seed(user, slot, 'hunt:' || id), i.e. a value the
    -- engine could already ask hr_seed for. Accepts no target the engine is
    -- not already authorised for (the hr_apply/hr_state_of pair).
    'hr_hunt_engine_read(uuid,integer)',
    -- SELF-VALIDATING, the hr_apply claim: it CALLS hr_apply (which re-checks
    -- every invariant of the value half under its own version CAS) and
    -- hr_hunt_settle_session (swing CAS, window, bag, use caps, presses only
    -- shrink, falls journalled, every end re-proved), in ONE subtransaction —
    -- a refusal in either half rolls both back. Its own writes are the press
    -- (validated as hr_hunt_use validates one) and a buff queue admitted only
    -- when this window's bag uses paid for every new segment. It pays nothing
    -- hr_apply would refuse.
    'hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
    -- NOT READ-ONLY, bounded: the CLOSED-MODE answer for a refused edge call
    -- (Security, closed-mode review item 4). Asked only after hr_rate_gate
    -- refused (p_user, p_slot) — the pair the engine already passes it. It
    -- reads hr_admitted for that user and, when not admitted, writes ONE
    -- hr_rejections aggregate upsert (code 'closed') for that user; it moves
    -- no value and names no other target.
    'hr_engine_closed(uuid,integer,text)',
    -- ── ADDED 2026-10-10 — THE PRESENCE HORIZON (Game Designer ruling on B1) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list.
    --
    -- NOT READ-ONLY, and the claim rests on SELF-VALIDATING: the caller names
    -- only (p_user, p_slot), the pair it already passes to hr_state_of. The
    -- answer is hr_offline_cap_ms bounded by the character's own
    -- hr_return_anchor; its ONE write is a forfeit of an absence whose horizon
    -- is spent and past, made THROUGH hr_apply (version CAS, journalled
    -- intent horizon_forfeit, key derived from the anchor) and moving only
    -- accrued_to forward to now(). It can pay nothing: no gold, no item, no XP.
    'hr_accrue_cap_ms(uuid,integer)',
    -- ── ADDED 2026-10-06 — THE SHADOW PARITY PROBE (Security ruling 1) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- READ-ONLY (STABLE): the fetch returns ONE open probe row of ONE
    -- character, and only to the holder the ROSTER leased that character to,
    -- inside the lease. Its payload is a snapshot the engine itself built from
    -- hr_state_of, which hr_engine already reads for any character it names.
    -- NO NEW TARGET: (p_user, p_slot) is the pair the engine already passes to
    -- hr_state_of and hr_tick_settle.
    'hr_tick_probe_fetch(text,uuid,integer,text)',
    -- NOT READ-ONLY, and the claim rests on its WRITE TARGET: its only write
    -- is the operator table the probe owns (RLS forced, no policy, no client
    -- or engine grant, classified operational + player_value_exempt). It
    -- writes no player_state, no ledger, no inventory, no hr_tick_ownership
    -- (it takes no row lock either), no shadow row and no frame — proved by
    -- execution over EVERY user table's transaction tuple counters in its
    -- migration's p3. SELF-VALIDATING: the caller names a holder, a character
    -- and a window, and the window must be the character's journalled SHADOW
    -- CHAIN HEAD under a lease the roster stamped — so it can only measure a
    -- span the fence actually tiled, never invent one, and an armed channel
    -- cannot reach it at all. Nothing reads its rows to decide a number a
    -- player can spend, rank or trade. NO NEW TARGET.
    'hr_tick_probe_commit(text,uuid,integer,text,timestamp with time zone,timestamp with time zone,text,bigint,jsonb,jsonb)',
    -- ── ADDED 2026-09-23 — THE PARTY FENCE AND ITS PREDICATE (M8 S2) ────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- ⚠ hr_party_tick_settle IS NOT READ-ONLY, and the claim rests on
    -- SELF-VALIDATING, re-derived rather than carried across from
    -- hr_tick_settle's entry. It is the world tick's ONE door to player value
    -- for a PARTY, and its whole caller-supplied surface is a holder name, a
    -- party id, a window [from,to), an idempotency uuid and an array of 1..4
    -- member objects — every one of which is CHECKED AGAINST THE DATABASE
    -- before a value moves:
    --   * THE LEASE, at party grain. The caller must name a party the ROSTER
    --     handed it, in its own holder name, inside the lease window.
    --     hr_party_roster is executable by `hr_tick` and by NOTHING ELSE, and
    --     hr_engine is asserted NOT to hold it, so a settling role
    --     structurally cannot stamp its own lease.
    --   * THE PARTY LOCK, taken FIRST, which is what serialises a settle
    --     against a join, a leave and a kick.
    --   * THE WATERMARK CAS, the PARTY's, computed once under that lock and
    --     byte-identical in every term to hr_tick_settle's own.
    --   * INVARIANT 8, PER MEMBER: `player_state.accrued_to` must EQUAL the
    --     party watermark. An inequality either way is a broken invariant and
    --     the whole call is refused — there is no branch that reconciles.
    --   * THE LIVE MEMBER SET, re-counted UNDER THE LOCK and asserted equal to
    --     the declared set with no member named twice. A subset is a partial
    --     settle, which pays some members a split computed from all of them —
    --     a mint, and the one defect that cannot be recovered after the fact.
    --   * THE DECLARED WINDOW IS BOUND TO THE PAID ONE per member
    --     (`delta->>'accrued_to' = p_window_to`), and the delta's top-level
    --     key set is asserted to be a solo combat settle's, so attribution
    --     cannot ride in the delta and no unknown key can reach hr_apply.
    --   * AND THEN hr_apply RE-VALIDATES EVERY INVARIANT regardless of caller.
    --     It is the only money writer; this function computes and fences and
    --     never moves a value except through it, once per member, inside ONE
    --     transaction whose savepoint rolls the whole fan-out back if any
    --     member cannot be paid.
    -- NO NEW TARGET: the members it names are (user, slot) pairs the engine
    -- already passes to hr_apply and hr_state_of. The holder of hr_apply can
    -- already WRITE any character it names; this is strictly NARROWER.
    --
    -- ⚠ hr_partied IS READ-ONLY, which is the strongest form an entry here can
    -- take: `stable sql`, one EXISTS over party_member joined to party_hunt,
    -- no row written, so it cannot be replayed into a gain. NO NEW TARGET —
    -- (p_user, p_slot), the same pair again. WHY THE ENGINE NEEDS IT: it is
    -- invariant 8's fence at the intent door. A partied character's own
    -- `accrue` is refused `party_settle_required` and every other
    -- collectsFirst verb `party_hunt_running`, because the timing of an
    -- ordinary client intent would otherwise re-price a window three other
    -- players are paid from — CLAUDE.md §1's target property failing by timing
    -- rather than by number. No client role holds it: a client-callable
    -- membership predicate is an oracle it can sweep.
    'hr_party_tick_settle(text,uuid,timestamp with time zone,timestamp with time zone,uuid,jsonb)',
    'hr_partied(uuid,integer)',
    -- ── ADDED 2026-09-22 — THE HUNT'S TWO READS (M6) ───────────────────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- ⚠ BOTH ARE READ-ONLY, WHICH IS THE WHOLE CLAIM, and it is the strongest
    -- form an entry on this list can take: neither writes a row, so neither can
    -- be replayed into a gain, and a forged call returns another shape of data
    -- the caller can already reach. Both are asserted STABLE and both are
    -- asserted free of INSERT/UPDATE/DELETE by their own migrations' section-4
    -- gates, which run at apply time and refuse to install a body that grew a
    -- write.
    --
    -- NO NEW TARGET. Each takes (p_user, p_slot) — the SAME pair the engine
    -- already passes to hr_state_of and hr_apply, both of which it already
    -- holds. The holder of hr_apply can already WRITE any character it names;
    -- these are strictly NARROWER than what it already has, and they exist so
    -- the ONE envelope the client renders carries the hunt readout rather than
    -- the browser growing a second read of its own (HUNT_ANALYZER_UI.md §6).
    --
    -- WHY THE ENGINE NEEDS THEM: hr_state_of calls both, and hr_state_of is
    -- itself engine-only. They are granted to hr_engine ONLY — no client role
    -- holds either, which tests/hunt-analyzer.mjs A5 and the vigour guard both
    -- assert by executing has_function_privilege rather than by reading a grant
    -- line.
    'hr_hunt_analyzer(uuid,integer)',
    'hr_vigour_of(uuid,integer)',
    -- ── ADDED 2026-09-22 — THE BESTIARY TROPHY PAIR ─────────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8/9:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- read-only (STABLE) projection of the CLAIMED trophy rows for ONE
    -- character: kind='collection', period_key='', key like 'trophy:%'. It
    -- writes nothing and calls nothing that writes. SELF-VALIDATING: the row
    -- set is bounded STRUCTURALLY by the key prefix and by (user, slot) — there
    -- is no parameter through which a caller can widen it. WHY THE ENGINE NEEDS
    -- IT: 2026-09-22-state-of-trophy-prefix.sql removed the trophy population
    -- from hr_state_of's generic envelope (it would breach the 1000-row cap and
    -- silently truncate a player's quest state), so this is now the ONLY door
    -- to it — the same position hr_bestiary_of and hr_collection_of are in.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of.
    'hr_trophy_of(uuid,integer)',
    -- NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a MONSTER ID
    -- (validated against hr_activities kind='combat', the generated,
    -- client-unwritable catalogue), a STAGE (bounded 1..4 against the server's
    -- own ladder) and an idempotency uuid. THERE IS NO KILL-COUNT PARAMETER —
    -- the threshold is judged against a counter the function reads itself from
    -- player_progress, under the SAME advisory lock hr_apply takes — so a
    -- forged count is not refused, it is unrepresentable.
    -- ⚠ AND IT MINTS NOTHING: no gold, no gems, no items, no XP, no multiplier.
    -- It writes ONE flag row (value 1, on conflict do nothing, so a replay is a
    -- refusal) and ONE zero-valued ledger row. The trophy's power is DERIVED
    -- from the kill counters on every read (src/core/trophies.js) and is
    -- already on before this is called, so there is no value here for a forged
    -- or replayed call to move — which is why the CLAUDE.md §1 target property
    -- holds by construction rather than by a clamp. Measured, not asserted:
    -- the migration's §5(e) compares gold/gems/xp/inventory AND accrued_to
    -- across a real claim. NO NEW TARGET: p_user again.
    'hr_trophy_claim(uuid,integer,text,integer,text)',
    -- ── ADDED 2026-09-21 — THE WORLD TICK'S ONE DOOR ───────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8/9:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived.
    -- hr_tick_settle is the FENCE in front of hr_apply for the world tick, and
    -- it is the ONLY route the tick has to player value: the roster WITHDREW
    -- the tick's raw hr_apply grant and this function replaced it. Its whole
    -- caller-supplied surface is a holder name, a (user, slot, channel), a
    -- version, a window [from,to), an idempotency uuid and a delta — and every
    -- one of those is CHECKED AGAINST THE DATABASE before a value moves:
    --   * THE LEASE. The caller must name a character the ROSTER handed it, in
    --     its own holder name, inside the lease window. hr_tick_roster is
    --     executable by `hr_tick` and by NOTHING ELSE, and hr_engine is
    --     asserted NOT to hold it (fence e19), so a settling role structurally
    --     cannot stamp its own lease. "Choose whose world ticks" is closed one
    --     level deeper than a grant.
    --   * THE WATERMARK CAS, under `select ... for update` on player_state
    --     taken BEFORE any comparison: a window at or after the settled mark is
    --     accepted, a window behind it is refused whatever its version and
    --     whatever its key. This holds against a client accrue, a client
    --     collect, a second tick process and a replay of the same call.
    --   * THE DECLARED WINDOW IS BOUND TO THE PAID ONE
    --     (`p_delta->>'accrued_to' = p_window_to`), so a caller cannot name
    --     ten seconds and hand over an hour.
    --   * THE VERSION, and then hr_apply re-validates every invariant regardless
    --     of caller — ONE call site, after every check, no tick-specific clamp
    --     and no fast path.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. The holder of hr_apply can already WRITE any
    -- character it names; this is strictly NARROWER than what it already has.
    -- WHY THE ENGINE NEEDS IT: hr_apply's impersonation seam tests
    -- `v_role = 'hr_engine'` literally, so the tick cannot reach hr_apply as
    -- `hr_tick` at all (S-1, proved by execution); the edge arrives as
    -- hr_engine and this is the door it knocks on. Granted to hr_engine ONLY —
    -- fence e18c asserts `hr_tick` does NOT hold it, because that would be
    -- a door that cannot open and would journal a forgery alert every fire.
    -- ── RESTATED 2026-09-23 — THE TENTH ARGUMENT (M3 shadow-state chain) ─
    -- A REPLACEMENT, not an insertion: this chain's first, and the removed
    -- line is declared in tests/run-sql-tests.mjs PART 1f-ii. The entry is
    -- keyed on `regprocedure`, so a signature change is a DIFFERENT string
    -- and the old one now names a function that does not exist — reported
    -- under `lost` while the real door raises
    -- `engine_execute_outside_allowlist` on the nightly cron every night.
    --
    -- ⚠ THE CLAIM IS UNCHANGED, AND IT IS RE-DERIVED RATHER THAN CARRIED.
    -- The tenth argument is `p_shadow_state jsonb`, and it is the ONLY
    -- caller-supplied value on this function that is neither checked against
    -- the database nor handed to hr_apply. It does not need to be, because it
    -- cannot reach player value at all:
    --   * IT IS WRITTEN ONLY ON THE SHADOW BRANCH, the branch with no
    --     hr_apply call in it, under the same row lock as the watermark it
    --     chains. On the ARMED branch a non-null one is REFUSED
    --     (`shadow_state_while_armed`) before hr_apply is reached — never
    --     ignored, because a carrier silently dropped on the branch that pays
    --     is how a stale proposal would be believed.
    --   * IT IS STORED VERBATIM AND READ BACK BY THE SAME ROLE that wrote it,
    --     into `hr_tick_ownership.shadow_state` — a column on an operator
    --     table that no client role can read or write, bounded by its own
    --     CHECK constraint, and CLEARED together with `shadow_accrued_to`
    --     the moment an armed settle succeeds.
    --   * NOTHING READS IT TO DECIDE A NUMBER A PLAYER CAN SPEND. Its only
    --     consumer is the next SHADOW window, whose entire output is
    --     `hr_tick_shadow` — classified `operational` +
    --     `player_value_exempt` in tests/restore-census.baseline.json on
    --     exactly the basis that losing every row of it costs a measurement
    --     and not a progression.
    -- NO NEW TARGET: p_user is still the parameter the engine already passes
    -- to hr_apply and hr_state_of, and every other check of the fence — the
    -- lease, the watermark CAS under `for update`, the declared-window
    -- binding, the version — is untouched and runs in the same order.
    'hr_tick_settle(text,uuid,integer,text,bigint,timestamp with time zone,timestamp with time zone,uuid,jsonb,jsonb)',
    -- ── ADDED 2026-09-11 — THE QUARTERMASTER SPEND WRITER ───────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a version, an
    -- idempotency uuid, and an OFFER ID (a primary key in the generated,
    -- client-unwritable hr_qm_offers). No item, no qty, no price and no scrip
    -- amount cross. The PRICE and the ITEM come from hr_qm_offers; the scrip
    -- balance is the character's OWN player_state row read under the SAME advisory
    -- lock hr_apply takes; the debit is bounded by that balance
    -- (insufficient_scrip). NO NEW TARGET: p_user is the parameter the engine
    -- already passes to hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT:
    -- dungeon scrip is server-of-record and its SPEND (the Quartermaster) must be
    -- one server transaction with the item grant, or the b372 half-undo returns —
    -- and NO other RPC debits player_state.dungeon_scrip, so without this the only
    -- writer of the spend is the client.
    'hr_quartermaster_buy(uuid,integer,bigint,uuid,text)',
    -- ── ADDED 2026-09-10 — THE DUNGEON SETTLE WRITER ───────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a version, an
    -- idempotency uuid, a DUNGEON ID (a primary key in the generated,
    -- client-unwritable hr_dungeons), a MODE (auto|manual|scavenger), and a
    -- p_quality CLAMPED server-side to [0,1] that scales SELF-ONLY scrip and
    -- touches NO loot. No item, no qty, no chance, no price and no timestamp
    -- cross. Every number it writes comes from hr_dungeons / hr_dungeon_loot or
    -- the character's OWN row read under the SAME advisory lock hr_apply takes;
    -- loot is rolled by the server hr_seed PRNG (never a client value); the entry
    -- KEY is debited from the caller's own player_inventory (the load-bearing
    -- gate); the cooldown and the per-day scrip cap read now() and the
    -- append-only ledger. NO NEW TARGET: p_user is the parameter the engine
    -- already passes to hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT:
    -- dungeon scrip + run loot are server-of-record (dungeon-settlement.md
    -- §1/§2) and NO other RPC writes player_state.dungeon_scrip, so without this
    -- the only writer of the currency is the client.
    'hr_dungeon_settle(uuid,integer,bigint,uuid,text,text,numeric)',
    -- ── ADDED 2026-09-10 — THE ATTENDED KILL LEDGER PROJECTION ──────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1, 2, 5 and
    -- 6: it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- READ-ONLY: `language sql`, `stable` — three CTEs over hr_kill_credit_log
    -- and player_state and a jsonb_build_object. No PL/pgSQL body through which a
    -- later edit could smuggle a write without the language keyword changing,
    -- which is the same strongest-available shape the three link-6 projections
    -- carry. The authoring migration's GATE(b) asserts that shape rather than
    -- describing it.
    -- SELF-VALIDATING: fixed output, its own per-target and per-key ceilings, and
    -- it sums `credit` (what hr_bounty_kill_cap allowed) and never `claimed`
    -- (what the client sent). GATE(e2) executes that distinction.
    -- NO NEW TARGET: (p_user, p_slot) — the exact pair the engine already hands
    -- hr_apply and hr_state_of. The holder of hr_apply can already WRITE any
    -- character it names; this lets it READ one integer per monster for one of
    -- them, out of a table hr_engine holds no privilege on (GATE(c)). The third
    -- argument, p_upto, is the engine's own hr_state_of now() and is CLAMPED with
    -- least(p_upto, now()), so it can only ever SHRINK the projected window —
    -- Security condition C6, executed by that migration's GATE(e6).
    -- WHY THE ENGINE NEEDS IT: the settle is the ONE writer of loot and gold, and
    -- it priced attended windows by re-simulating them as unattended — measured
    -- 9 kills against 15 the server had already accepted, i.e. 38% of a session's
    -- drops confiscated. See docs/design/attended-loot-credit.md.
    'hr_attended_kills(uuid,integer,timestamp with time zone)',
    -- ── ADDED 2026-08-20 — THE THREE LIVE-PROGRESS READ PROJECTIONS ─────
    -- At the HEAD again, an INSERTION, for the same reason as links 1, 2 and 5:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- All three are READ-ONLY (`stable sql`) dedicated projections for ONE
    -- character, added by 2026-08-20-bestiary.sql / 2026-08-21-collection.sql /
    -- 2026-08-20-renown.sql. hr_state_of stopped serving the ev:kill_monster:%
    -- and ev:loot:% populations (2026-08-21-streak-state.sql) because together
    -- they approach its 1000-row envelope cap, so the engine reads them through
    -- these instead. SELF-VALIDATING and NO NEW TARGET, the same claim
    -- hr_state_of / hr_perks_of make: each takes (p_user, p_slot) — the exact
    -- pair the engine already passes to hr_apply and hr_state_of — reads a
    -- STRICT SUBSET of what hr_state_of's envelope used to carry, writes nothing,
    -- calls nothing that writes, and exposes no target the holder of hr_apply
    -- could not already reach.
    'hr_bestiary_of(uuid,integer)',
    'hr_collection_of(uuid,integer)',
    'hr_renown_of(uuid,integer)',
    -- ── ADDED 2026-08-17 — THE THREE MARKET WRITERS ─────────────────────
    -- At the HEAD, an insertion, for the same reason as links 1 and 2: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ THE LARGEST SINGLE WIDENING SINCE hr_apply: three writers at once, and
    -- ONE OF THEM MOVES VALUE BETWEEN TWO PLAYERS. The c_engine_allow claim is
    -- "read-only or SELF-VALIDATING, and it accepts no target the caller is not
    -- already authorised for". None of these is read-only, so the whole claim
    -- rests on the other two clauses, re-derived rather than asserted:
    --
    --   SELF-VALIDATING. The entire caller-supplied surface of the three is a
    --   character slot, an idempotency uuid, a version, and then: an ITEM ID +
    --   COUNT + ASK (list), a LISTING ID (cancel), a LISTING ID + COUNT (buy).
    --   No price crosses on a buy — ask_each is read off the listing row under
    --   its own lock — no timestamp, no name, no fee rate, no counterparty. The
    --   item must be `tradeable` in the generated, client-unwritable hr_items;
    --   the tax rate and every ceiling come from hr_market_config; the seller
    --   name is derived from profiles; every clock is now(). Each function
    --   re-reads its listing FOR UPDATE and re-validates under hr_apply's own
    --   advisory lock, refuses a stale version, and is clamped per call (a gross
    --   ceiling) AND per DAY (list churn; gold sent; gold received) from the
    --   append-only ledger — the dimension a rate limit does not bound.
    --
    --   THE TARGET CLAUSE, STATED HONESTLY (Security M2). The earlier draft
    --   claimed "the engine cannot select a victim". That is FALSE and is the
    --   correction: the engine holds hr_market_list(p_user, …) for ANY user, so a
    --   compromised engine can open a listing FOR a victim it names and then
    --   settle it to itself with hr_market_buy — it can choose both sides of a
    --   trade. What admits these three is therefore NOT "no victim" but BOUNDED
    --   BLAST RADIUS: every path is a CONSERVED transfer of TRADEABLE items
    --   (buyer -gross, seller +net, tax burned — nothing minted, nothing an
    --   honest player did not already own), the item must be `tradeable` in the
    --   client-unwritable hr_items, BOTH SIDES ARE JOURNALLED (transfer +
    --   self_trade in meta), and the flows are CLAMPED PER DAY off the
    --   append-only ledger on three dimensions the engine cannot widen: escrowed
    --   item quantity (list), gold sent (buy) and gold received (buy).
    --   ⚠ THOSE CLAMPS ARE THE MARKET'S OWN, NOT hr_day_budget_check. A market
    --   transfer is conserved, so it is deliberately absent from the mint
    --   budget's qty dimension — charging a sale to the seller's daily inflow
    --   would let a stranger drain their accrual (the griefing vector in
    --   hr_market_buy's header). So the item-drain and gold-move ceilings live
    --   here and only here. p_user is the parameter the engine already passes to
    --   hr_apply.
    --
    --   WHY THE ENGINE NEEDS THEM: hr_apply is single-character by construction
    --   — one lock, one version, one journal target — so a delta shape that
    --   could move a second player's gold would be the most dangerous key in the
    --   engine's vocabulary. Without these three, the only writer of a
    --   cross-player transfer is the client, which is the hole this whole
    --   program was opened to close.
    'hr_market_list(uuid,integer,bigint,uuid,text,bigint,bigint)',
    'hr_market_cancel(uuid,integer,bigint,uuid,uuid)',
    'hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint)',
    -- ── ADDED 2026-08-16 — THE FIRST WRITER ADDED SINCE hr_apply ────────
    -- At the HEAD again, and for the same reason as the link above: an
    -- insertion removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim is made on the OTHER clause. It writes
    -- one player_progress unlock row, one player_state gold/version update and
    -- one player_ledger row. SELF-VALIDATING is what admits it, and concretely:
    -- its whole caller-supplied surface is ONE OFFER ID (a primary key in the
    -- generated, client-unwritable hr_unlock_offers) — no price, no quantity,
    -- no item, no rung, no timestamp; every number it writes comes from that
    -- table or from the character's own row read under the SAME advisory lock
    -- hr_apply takes; the row it writes is independently policed by the
    -- player_progress_unlock_guard trigger, which refuses an off-ladder rung, a
    -- regression and a mis-filed kind whatever this function proposes; and it
    -- is clamped per call (one rung) and per DAY (20 unlocks, counted from the
    -- append-only ledger), which is the dimension a rate limit does not bound.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT: hr_apply structurally
    -- cannot write a level ('unlock' is deliberately absent from its delta
    -- allowlist), so without this the only writer of a permanent capability is
    -- the client.
    'hr_unlock_buy(uuid,integer,bigint,uuid,text)',
    -- ── ADDED 2026-08-16 — TWO REVIEWED ENGINE READS ────────────────────
    -- At the HEAD, not appended: this array is DERIVED from
    -- 2026-08-11-grant-hygiene.sql by tools/derive-grant-hygiene.mjs, and an
    -- append would have to rewrite the previous last entry to add a comma —
    -- a MODIFIED line. An insertion removes nothing, which is why this chain's
    -- declared-removals list in PART 1f-ii is empty. Position carries no
    -- meaning here: check (7) tests membership with `<> all (...)`.
    --
    -- read-only (STABLE, and 2026-08-16-claim-reward.sql §4 asserts the
    -- declaration rather than trusting it) claim lookup for ONE character.
    -- SELF-VALIDATING in the dimension that matters: the period keys it reads
    -- are the server's own hr_utc_day_key(now()), never an argument, so the
    -- row set is structurally bounded to '' + today + yesterday and no call
    -- can widen it into a history scan. It adds NO TARGET the engine could
    -- not already reach — the engine already holds hr_apply(uuid,…) and
    -- hr_state_of(uuid,int), both of which take the same p_user — so this is
    -- strictly a narrower read of data hr_state_of's envelope is the peer of.
    'hr_claim_lookup(uuid,integer,text,text)',
    -- read-only permanent-capability read for one character: rooms, plots,
    -- property tier and unlocked recipes. Writes nothing and calls nothing
    -- that writes. On the list for the same reason hr_offline_cap_ms is —
    -- a perk multiplies a whole night's grant, so the engine must be TOLD its
    -- capabilities rather than compute them. Same target argument as above:
    -- p_user is a parameter the engine already passes to hr_apply.
    'hr_perks_of(uuid,integer)',
    -- the only writer; bounded by its own re-validation, which is the design
    'hr_apply(uuid,integer,bigint,uuid,jsonb)',
    -- returns the post-write envelope for one character the engine was told to act for
    'hr_state_of(uuid,integer)',
    -- the accrual PRNG seed; returns a hash, never the 256-bit server secret
    'hr_seed(uuid,integer,text)',
    -- derived leaderboard value; read-only, one character
    'hr_total_level(uuid,integer)',
    -- pure function of its argument
    'hr_level_from_xp(bigint)',
    -- pure function of its argument
    'hr_xp_for_level(integer)',
    -- read-only, one integer, bounded at 24h by its own ceiling; on the list because
    -- capMs multiplies a whole night's grant, so the engine must not own its own cap
    'hr_offline_cap_ms(uuid,integer)',
    -- writes one UNLOGGED counter row for the user it was handed; on the list because
    -- the alternative, granting hr_rate_ok, lets the caller name its own limit
    'hr_rate_gate(uuid,integer,text)'
  ];
begin
  -- (1) PUBLIC=EXECUTE, asked directly.
  --     `proacl is null` is NOT "no grants" — it means the ACL is the hardwired
  --     acldefault('f', owner), which contains PUBLIC=X. That is the exact
  --     state a `create function` with no revoke lands in, so it is the single
  --     most important row of this whole function.
  select coalesce(jsonb_agg(format('%s(%s)', p.proname,
                                   pg_get_function_identity_arguments(p.oid))
                            order by p.proname), '[]'::jsonb)
    into v_public_exec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p')
     and (p.proacl is null or p.proacl::text ~ '(\{|,)=[a-zA-Z*]*X');

  -- (2) Client-executable and NOT approved. Covers anon and authenticated, and
  --     covers procedures, and covers a new overload of an approved name.
  select coalesce(jsonb_agg(format('%s(%s) → %s', x.proname, x.identity_args, x.grantee)
                            order by x.proname, x.grantee), '[]'::jsonb)
    into v_unapproved
    from (
      select p.proname, pg_get_function_identity_arguments(p.oid) as identity_args, g.grantee
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'),('authenticated')) g(grantee)
       where n.nspname = 'public' and p.prokind in ('f','p')
         and has_function_privilege(g.grantee, p.oid, 'execute')
    ) x
   where not exists (select 1 from public.hr_client_rpc_baseline b
                      where b.proname = x.proname and b.identity_args = x.identity_args
                        and b.grantee = x.grantee);

  -- (3) An approved RPC that is no longer reachable. Not a security failure —
  --     a BROKEN FEATURE — so it is reported, loudly, and never fatal.
  select coalesce(jsonb_agg(format('%s(%s) → %s', b.proname, b.identity_args, b.grantee)
                            order by b.proname), '[]'::jsonb)
    into v_lost
    from public.hr_client_rpc_baseline b
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = b.proname
        and pg_get_function_identity_arguments(p.oid) = b.identity_args
        and has_function_privilege(b.grantee, p.oid, 'execute'));

  -- (4) TRUNCATE bypasses row-level security entirely, so RLS is not a backstop
  --     for it. No client ever needs TRUNCATE, REFERENCES or TRIGGER.
  --     b354 (Security C3) — WIDENED, and the second half is the interesting
  --     one. A client WRITE grant on a table that has RLS ON and NO WRITE
  --     POLICY AT ALL is a grant nothing intends to use: the only thing between
  --     it and the table is row-level security, and one `create policy` — or
  --     one `alter table ... disable row level security` typed during an
  --     incident — turns it into a client-writable table. Security found six of
  --     them live (hr_castle_*, hr_hunt_*): pure content catalogues carrying
  --     anon/authenticated INSERT/UPDATE/DELETE.
  --     WHY IT IS A BASELINE AND NOT A BAN: 21 further tables were in this class
  --     when the check was written (clan_*, world_event_*, raid_*, maintenance_*,
  --     display_names, leaderboard_meta) — all written only by SECURITY DEFINER
  --     RPCs, all dead grants, and none of them safe to sweep in the same change
  --     that introduced the detector. They are RECORDED in
  --     hr_client_write_baseline, which makes each one a claim somebody has to
  --     justify, and makes anything NEW fatal.
  --     service_role is deliberately NOT in the grantee list: Supabase's platform
  --     default grants it every privilege on every table in public, so including
  --     it would report all 40-odd tables and the check could never be strict.
  --     That is a platform posture and a separate program; stated here so its
  --     absence is a decision rather than an oversight.
  --     b350 (Security batch 5) — THE DETECTOR TAKEOVER. This query no longer
  --     reads information_schema.role_table_grants, which reports SQL-standard
  --     privileges ONLY: it cannot see MAINTAIN (the PG17 VACUUM/ANALYZE/CLUSTER/
  --     REINDEX/REFRESH privilege) and it OMITS materialized views entirely. Both
  --     are exactly where dead client write grants hid — 28 MAINTAIN pairs and the
  --     leaderboard_ranked matview were invisible to every nightly run.
  --     has_table_privilege over pg_class sees the full PG17 vocabulary AND every
  --     relkind. Two arms, the same meaning check (4) has always had:
  --       ARM 1 — a verb NO CLIENT EVER NEEDS, on ANY relation (table, partition
  --               or MATVIEW): TRUNCATE, REFERENCES, TRIGGER, and now MAINTAIN. A
  --               write policy is no defence against any of these, so the grant is
  --               a finding wherever it lives.
  --       ARM 2 — INSERT/UPDATE/DELETE on a table with RLS ON and NO write policy,
  --               minus hr_client_write_baseline. Unchanged. Matviews carry no RLS
  --               and cannot be written through any path, so an i/u/d bit on one is
  --               inert and deliberately NOT arm 2's business.
  --     PUBLIC is not enumerated separately: a grant to PUBLIC makes
  --     has_table_privilege true for anon AND authenticated, so it surfaces under
  --     both without a third grantee.
  select coalesce(jsonb_agg(distinct x.g order by x.g), '[]'::jsonb) into v_client_trunc from (
    select c.relname || ':' || gg || ':' || pv as g
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','m')
       and has_table_privilege(gg, c.oid, pv)
    union all
    select c.relname || ':' || gg || ':' || pv
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['INSERT','UPDATE','DELETE']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
       and c.relrowsecurity
       and has_table_privilege(gg, c.oid, pv)
       and not exists (select 1 from pg_policies pp
                        where pp.schemaname = 'public' and pp.tablename = c.relname
                          and pp.cmd in ('INSERT','UPDATE','DELETE','ALL'))
       and not exists (select 1 from public.hr_client_write_baseline bl
                        where bl.table_name = c.relname and bl.grantee = gg)
  ) x;

  -- (5) D4 — THE POSITIVE ASSERTION. For every role that owns a function in
  --     public there must be a GLOBAL default-ACL row (defaclnamespace = 0)
  --     for functions, and it must grant EXECUTE to none of PUBLIC / anon /
  --     authenticated. Only a GLOBAL row replaces acldefault(); a schema-scoped
  --     one can only ADD to it, which is why the 2026-08-10 attempt at this
  --     changed nothing. Absence of the row IS the finding.
  select coalesce(jsonb_agg(r.rolname order by r.rolname), '[]'::jsonb)
    into v_defacl_open
    from (select distinct p.proowner from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind in ('f','p')) o
    join pg_roles r on r.oid = o.proowner
   where not exists (
     select 1 from pg_default_acl d
      where d.defaclrole = o.proowner
        and d.defaclnamespace = 0
        and d.defaclobjtype = 'f'
        and not exists (
          select 1 from aclexplode(d.defaclacl) a
          left join pg_roles rr on rr.oid = a.grantee   -- grantee 0 = PUBLIC
           where a.privilege_type = 'EXECUTE'
             and (a.grantee = 0 or rr.rolname in ('anon','authenticated'))));

  -- (6) Residual: platform-owned SCHEMA default ACLs we genuinely cannot edit
  --     (supabase_admin). Reported so the residual stays visible. This is the
  --     check revision 1 mistook for the real one — kept, demoted, labelled.
  select coalesce(jsonb_agg(d.defaclrole::regrole::text || ':' || n.nspname
                            order by d.defaclrole::regrole::text), '[]'::jsonb)
    into v_platform
    from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
   where n.nspname = 'public' and d.defaclobjtype = 'f'
     and d.defaclacl::text ~ '(anon|authenticated)=[a-zA-Z*]*X';

  -- (7) S9 — hr_engine's EXECUTE surface, keyed on the FULL SIGNATURE and with
  --     no prokind filter, so an overload and a procedure are both visible.
  --     Skipped silently if the role does not exist: this file must stand alone
  --     on a database that has not had the server-authority bundle applied.
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
      into v_engine_extra
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f','p')
       and has_function_privilege('hr_engine', p.oid, 'execute')
       and p.oid::regprocedure::text <> all (c_engine_allow);
    -- "Zero table privileges" is the other half of the capability claim, and
    -- column grants are invisible to role_table_grants, so both are asked.
    select coalesce(jsonb_agg(x.g order by x.g), '[]'::jsonb) into v_engine_tables from (
      select table_name || ':' || privilege_type as g
        from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'hr_engine'
      union all
      select table_name || '.' || column_name || ':' || privilege_type
        from information_schema.role_column_grants
       where table_schema = 'public' and grantee = 'hr_engine') x;
  else
    v_engine_extra  := '[]'::jsonb;
    v_engine_tables := '[]'::jsonb;
  end if;

  -- (8) A9 — every client-callable SECURITY DEFINER function must reference a
  --     rate gate. This is the RUNTIME twin of the static lint in
  --     tests/run-sql-tests.mjs, and it exists for one specific reason: the A9
  --     retrofit in 2026-08-11-authenticated-surface-lockdown.sql installs thin
  --     wrappers over renamed `__ungated` bodies, so RE-APPLYING an older
  --     migration that `create or replace`s a wrapped name would silently
  --     replace the wrapper with the ungated body and delete the gate. A repo
  --     lint cannot see that; this can, within a day.
  --     Matching on prosrc is deliberately crude — it proves the gate is
  --     MENTIONED, not that it is reached. It catches the whole class this is
  --     written for (a body that has never heard of a gate) and nothing subtler.
  select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
    into v_ungated
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p') and p.prosecdef
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'))
     and p.prosrc !~ 'hr_rpc_gate|hr_rate_gate|hr_rate_ok';

  -- (9) T-5 — hr_ops STAYS A SINK (2026-09-28). hr_ops holds the operator-only
  --     routines that read net._http_response, a table PUBLIC can read and our
  --     roles cannot revoke. Keeping hr_ops out of PostgREST's exposed list is
  --     half the property; the other half is that no client or engine role can
  --     USE the schema, CREATE in it, or EXECUTE anything in it — reachability
  --     is the arming condition. tests/pg-net-queue-unreachable.mjs Q-5 guards
  --     the repo; this asks the CATALOGUE, so a grant typed in the dashboard, by
  --     support or by a platform migration is a finding by the next nightly run.
  --     The roles are the six the sink was built against — PUBLIC, anon,
  --     authenticated, service_role, hr_engine, hr_tick — and the two LOGIN
  --     roles those are reached through before SET ROLE: authenticator
  --     (PostgREST) and hr_engine_login (the edge); both are NOINHERIT, so only
  --     a DIRECT grant to them reads here (Security, 2026-09-28). Superusers
  --     and pg_read_all_data (USAGE on every schema, no EXECUTE) are the owner
  --     class and are out of scope by construction. A role that does not
  --     exist is skipped (this file must stand alone), and so is a database
  --     with no hr_ops at all: no sink, nothing to reach. prokind is NOT
  --     filtered — a procedure or an aggregate in hr_ops is reachable too.
  if exists (select 1 from pg_namespace where nspname = 'hr_ops') then
    select coalesce(jsonb_agg(x.g order by x.g), '[]'::jsonb) into v_ops_reach from (
      select 'schema:' || r.role || ':' || pv as g
        from (values ('public'),('anon'),('authenticated'),('service_role'),('hr_engine'),('hr_tick'),
                     ('authenticator'),('hr_engine_login')) r(role)
        cross join unnest(array['USAGE','CREATE']) pv
       where (r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role))
         and has_schema_privilege(r.role, 'hr_ops', pv)
      union all
      select p.oid::regprocedure::text || ':' || r.role
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('public'),('anon'),('authenticated'),('service_role'),('hr_engine'),('hr_tick'),
                     ('authenticator'),('hr_engine_login')) r(role)
       where n.nspname = 'hr_ops'
         and (r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role))
         and has_function_privilege(r.role, p.oid, 'execute')) x;
  else
    v_ops_reach := '[]'::jsonb;
  end if;

  v_report := jsonb_build_object(
    'public_execute_functions',        v_public_exec,
    'unapproved_client_rpcs',          v_unapproved,
    'baseline_rows_no_longer_live',    v_lost,
    'client_truncate_grants',          v_client_trunc,
    'owners_without_failclosed_defacl',v_defacl_open,
    'platform_schema_defacls_open',    v_platform,
    'engine_execute_outside_allowlist',v_engine_extra,
    'engine_table_privileges',         v_engine_tables,
    'hr_ops_reachable',                v_ops_reach,
    'ungated_client_rpcs',             v_ungated);

  if jsonb_array_length(v_lost) > 0 then
    raise warning 'GRANT HYGIENE: % approved client RPC(s) are no longer reachable — %',
      jsonb_array_length(v_lost), v_lost::text;
  end if;

  if p_strict and (jsonb_array_length(v_public_exec) > 0
                or jsonb_array_length(v_unapproved) > 0
                or jsonb_array_length(v_client_trunc) > 0
                or jsonb_array_length(v_defacl_open) > 0
                or jsonb_array_length(v_engine_extra) > 0
                or jsonb_array_length(v_engine_tables) > 0
                or jsonb_array_length(v_ops_reach) > 0
                or jsonb_array_length(v_ungated) > 0) then
    raise exception 'GRANT HYGIENE FAILED: %', v_report::text;
  end if;
  return v_report;
end $$;
-- ⟦/DERIVED hr_assert_grant_hygiene⟧
revoke execute on function public.hr_assert_grant_hygiene(boolean) from public, anon, authenticated, service_role;

-- ── §10 SELF-CHECK (CLAUDE.md §4), EXECUTED AND ROLLED BACK ────────────────
do $$
declare
  v_uid  uuid := '00000000-0000-4000-8000-0000000c2b01';
  v_r    jsonb;
  v_sid  uuid;
  v_ver  bigint;
  v_from timestamptz;
  v_to   timestamptz;
  v_n    bigint;
  v_gold bigint;
  v_h    jsonb;
  v_f    text;
  v_role text;
  v_hunt jsonb;
  v_delta jsonb;
  v_cap  bigint := public.hr_hunt_limit('stamina_max_min')::bigint * 60000;
  v_to2  timestamptz;
  v_act  text;
  v_pz   jsonb;
begin
  -- The fixtures below write whole swings of the catalogue interval (2 s, Tyler
  -- 2026-10-14). A different interval must re-derive them, not drift past them.
  if public.hr_hunt_limit('swing_interval_ms') is distinct from 2000 then
    raise exception 'SELF-CHECK: the fixtures assume a 2000 ms swing; the catalogue says % — re-derive them', public.hr_hunt_limit('swing_interval_ms');
  end if;
  -- (a) PRIVILEGES. Engine functions: hr_engine only. The roster: hr_tick only.
  --     The buff writer and the fence: nobody. The lease table: no grant.
  foreach v_f in array array['public.hr_hunt_open_of(uuid,integer)', 'public.hr_hunt_engine_read(uuid,integer)',
      'public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)'] loop
    if not has_function_privilege('hr_engine', v_f, 'execute') then raise exception 'GATE(a): hr_engine cannot execute %', v_f; end if;
    foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_tick'] loop
      if has_function_privilege(v_role, v_f, 'execute') then raise exception 'GATE(a): % can execute %', v_role, v_f; end if;
    end loop;
  end loop;
  if not has_function_privilege('hr_tick', 'public.hr_hunt_roster(text,integer,integer)', 'execute') then
    raise exception 'GATE(a): hr_tick cannot execute hr_hunt_roster'; end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_roster(text,integer,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_buffs_put(uuid,integer,timestamp with time zone,timestamp with time zone,jsonb,jsonb)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_accrue_fence()', 'execute')
       or has_function_privilege(v_role, 'public.hr_tick_cron_run()', 'execute')
       or has_table_privilege(v_role, 'public.hunt_tick_lease', 'select,insert,update,delete')
       or has_function_privilege(v_role, 'public.hr_stamina_of(uuid,integer,timestamp with time zone)', 'execute')
       or has_function_privilege(v_role, 'public.hr_stamina_view(uuid,integer)', 'execute') then
      raise exception 'GATE(a): % reaches an internal of this file', v_role; end if;
  end loop;
  -- (a2) NO CLIENT ROLE CAN WRITE THE POOL.
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_column_privilege(v_role, 'public.player_state', 'stamina_ms', 'update')
       or has_column_privilege(v_role, 'public.player_state', 'stamina_at', 'update') then
      raise exception 'GATE(a2): % can write the stamina pool', v_role; end if;
  end loop;
  if v_cap is null or v_cap <= 0 then raise exception 'GATE(a2): no stamina_max_min limit row'; end if;
  if position('''hunts''' in (select p.prosrc from pg_proc p where p.oid = 'public.hr_tick_cron_run()'::regprocedure)) = 0
     or position('hr_hunt_roster(' in (select p.prosrc from pg_proc p where p.oid = 'public.hr_tick_cron_run()'::regprocedure)) = 0 then
    raise exception 'GATE(a): the installed driver does not post hunts';
  end if;

  begin  -- ── SUBTRANSACTION: every probe row is discarded at HRC2B ──────────
    insert into auth.users (id) values (v_uid);
    /* CLOSED MODE (2026-10-21-closed-mode.sql, applied first): the probe is
       ADMITTED for the length of this subtransaction, which discards it. */
    if to_regclass('public.hr_access_allowlist') is not null then
      execute 'insert into public.hr_access_allowlist (user_id, note) values ($1, ''c2 self-check probe'')' using v_uid;
    end if;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'GATE(b): no probe character: %', v_r; end if;
    delete from public.player_inventory where user_id = v_uid and slot = 0;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_uid, 0, 'cooked_shrimp', 20);
    update public.hr_hunt_config set enabled = true where id;
    v_r := public.hr_hunt_enter(0, 'mill_cellar', '[{"item":"cooked_shrimp","qty":12}]', 0, null, null, gen_random_uuid());
    if coalesce(v_r->>'ok', 'false') <> 'true' then raise exception 'GATE(b): enter answered %', v_r; end if;
    v_sid := (v_r->'session'->>'id')::uuid;
    -- (m) AN ACTION SET'S TARGET MODE AND PULL COUNT: catalogue values only,
    --     refused not clamped, stored, and read back by the engine read.
    v_r := public.hr_action_set_options(0, 0, '{"target_mode":"follow","pull_count":3}'::jsonb, gen_random_uuid());
    if v_r->>'error' is distinct from 'target_mode_party_only' then
      raise exception 'GATE(m): a party-only target mode on a solo set answered %', v_r; end if;
    v_r := public.hr_action_set_options(0, 0, '{"target_mode":"weakest","pull_count":9}'::jsonb, gen_random_uuid());
    if v_r->>'error' is distinct from 'bad_pull_count' then raise exception 'GATE(m): a pull of 9 answered %', v_r; end if;
    v_r := public.hr_action_set_options(0, 0, '{"surprise":1}'::jsonb, gen_random_uuid());
    if v_r->>'error' is distinct from 'bad_option' then raise exception 'GATE(m): an unknown option answered %', v_r; end if;
    v_r := public.hr_action_set_options(0, 0, '{"supply_source":"anywhere"}'::jsonb, gen_random_uuid());
    if v_r->>'error' is distinct from 'bad_supply_source' then raise exception 'GATE(m): a supply source off its domain answered %', v_r; end if;
    v_r := public.hr_action_set_options(0, 0, '{"target_mode":"weakest","pull_count":3,"gold_floor":0}'::jsonb, gen_random_uuid());
    if coalesce(v_r->>'ok', 'false') <> 'true' then raise exception 'GATE(m): an honest mode answered %', v_r; end if;
    v_r := public.hr_action_set_put(0, 1, 'spells', '[{"kind":"spell","item":"cooked_shrimp","on":true,"conditions":[]}]'::jsonb,
                                    gen_random_uuid());
    if v_r->>'why' is distinct from 'kind_reserved' then raise exception 'GATE(m): a spell slot answered %', v_r; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    set local role hr_engine;
    v_h := public.hr_hunt_engine_read(v_uid, 0);
    reset role;
    if v_h->>'target_mode' is distinct from 'weakest' or (v_h->>'pull_count')::int is distinct from 3 then
      raise exception 'GATE(m): the engine read answered target % pull %', v_h->>'target_mode', v_h->>'pull_count'; end if;
    -- (m2) THE PULL A HUNT RUNS is the server's: the stored 3 clamped to the
    --      ground's pull and to pull_cap, the respawn scaled to it; a fresh
    --      session's pull is empty and due at the arrival.
    if (v_h->'pull'->>'size')::int is distinct from (select least(t.pull_size, 3,
             coalesce(nullif(public.hr_hunt_limit('pull_cap'), 0), t.pull_size)) from public.hr_hunt_travel t where t.hunt_id = 'mill_cellar')
       or (v_h->'pull'->>'left')::int is distinct from 0
       or (v_h->'pull'->>'respawn_at_ms')::bigint is distinct from (v_h->>'hunt_from_ms')::bigint then
      raise exception 'GATE(m2): the engine read answered pull %', v_h->'pull'; end if;

    update public.hunt_sessions set entered_at = now() - interval '10 minutes', hunt_from = now() - interval '9 minutes',
                                    settled_to = now() - interval '9 minutes', next_swing_at = now() - interval '9 minutes'
     where id = v_sid;
    select settled_to into v_from from public.hunt_sessions where id = v_sid;
    v_to := v_from + interval '20 seconds';
    select version, gold into v_ver, v_gold from public.player_state where user_id = v_uid and slot = 0;
    perform set_config('request.jwt.claim.sub', '', true);

    -- (b) THE ENGINE READ answers the session, the bag and a 64-bit secret text.
    set local role hr_engine;
    v_h := public.hr_hunt_engine_read(v_uid, 0);
    reset role;
    if coalesce(v_h->>'open', 'false') <> 'true' or (v_h->>'id')::uuid <> v_sid
       or (v_h->'bag'->'cooked_shrimp'->>'left')::int <> 12 or (v_h->>'secret') !~ '^-?[0-9]{1,20}$'
       or (v_h->>'settled_to_ms')::bigint < floor(extract(epoch from v_from) * 1000) then
      raise exception 'GATE(b): the engine read answered %', v_h; end if;

    v_delta := jsonb_build_object('gold', 10, 'xp', jsonb_build_object('attack', 5),
      'accrued_to', to_jsonb(v_to),
      'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
        'meta', jsonb_build_object('ms', 20000, 'ticks', 10, 'kills', 1, 'mon', 'mill_cellar')));
    v_hunt := jsonb_build_object('swing_from', 0, 'swing_to', 10, 'to', to_jsonb(v_to), 'next_swing_at', to_jsonb(v_to),
      'uses', jsonb_build_object('cooked_shrimp', 2), 'falls', 0, 'down', false, 'down_ms', 0, 'paid_ms', 20000,
      'stamina', v_cap - 20000);
    -- THE SPAWN CYCLE of the kill: one pull of the server's size at the arrival
    -- (v_from), the next due one respawn later; the rest left standing.
    v_pz := public.hr_hunt_pull_of(v_uid, 0, v_sid);
    if (v_pz->>'respawn_ms')::bigint <= 20000 then
      raise exception 'GATE(b): the probe needs a respawn longer than its 24 s window (Mill Cellar %)', v_pz; end if;
    v_hunt := v_hunt || jsonb_build_object('pull', v_pz || jsonb_build_object('left', (v_pz->>'size')::int - 1, 'pulls', 1,
      'respawn_at', to_jsonb(v_from + make_interval(secs => (v_pz->>'respawn_ms')::numeric / 1000))));

    -- (s0) THE ENVELOPE PROJECTS THE POOL: a character that never hunted is
    --      full, and a hunting session reads it at its settled_to.
    v_r := public.hr_state_of(v_uid, 0);
    if (v_r->'stamina'->>'ms')::bigint is distinct from v_cap or (v_r->'stamina'->>'max_ms')::bigint is distinct from v_cap
       or (v_r->'stamina'->>'hunting')::boolean is distinct from true then
      raise exception 'GATE(s0): the envelope projected stamina %', v_r->'stamina'; end if;

    -- (c) THE FENCE: the OLD combat path cannot pay a hunter.
    set local role hr_engine;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), v_delta);
    reset role;
    if v_r->>'error' is distinct from 'hunt_open'
       or (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold then
      raise exception 'GATE(c): a bare combat accrue for a hunter answered % (and must move nothing)', v_r; end if;

    -- (c2) THE FENCE HOLDS FOR EVERY ACCRUE KIND (Security design review item 11).
    set local role hr_engine;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object('xp', jsonb_build_object('mining', 5),
             'accrued_to', to_jsonb(v_to), 'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
               'meta', jsonb_build_object('ms', 20000))));
    reset role;
    if v_r->>'error' is distinct from 'hunt_open' then
      raise exception 'GATE(c2): a bare gather accrue for a hunter answered %', v_r; end if;

    -- (c3) HIRED HANDS KEEP BANKING DURING A HUNT (design ruling 2026-10-15): a
    --      worker accrue for the same hunter LANDS. Probed in a subtransaction
    --      and rolled back, so the version the steps below read is untouched.
    begin
      set local role hr_engine;
      v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object('gold', 1,
               'journal', jsonb_build_object('kind', 'worker', 'intent', 'accrue', 'meta', jsonb_build_object('c3', true))));
      reset role;
      if coalesce(v_r->>'ok', 'false') <> 'true' then
        raise exception 'GATE(c3): a worker accrue during the hunt answered %', v_r; end if;
      raise exception 'HRC3OK';
    exception when others then
      if sqlerrm <> 'HRC3OK' then raise; end if;
    end;

    -- (p) THE SPAWN CYCLE IS A STATEFUL CAP: a third kill the cycle cannot
    --     explain, a pull more than the respawns admit, a respawn moved back,
    --     and a pull the row no longer gives are each refused and move nothing.
    foreach v_f in array array['kills', 'pulls', 'back', 'size'] loop
      set local role hr_engine;
      v_r := public.hr_hunt_apply(v_uid, 0, v_sid, v_ver, gen_random_uuid(),
               case when v_f = 'kills' then jsonb_set(v_delta, '{journal,meta,kills}', '2') else v_delta end,
               case v_f
                 when 'kills' then v_hunt
                 when 'pulls' then jsonb_set(jsonb_set(v_hunt, '{pull,pulls}', '9'), '{pull,left}',
                                     to_jsonb(9 * (v_pz->>'size')::int - 1))
                 when 'back'  then jsonb_set(v_hunt, '{pull,respawn_at}', to_jsonb(v_from))
                 else jsonb_set(v_hunt, '{pull,size}', to_jsonb((v_pz->>'size')::int + 1)) end);
      reset role;
      v_act := 'pull_over';
      if v_f = 'size' then v_act := 'session_moved'; end if;
      if v_r->>'error' is distinct from v_act
         or (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold
         or (select swing_index from public.hunt_sessions where id = v_sid) <> 0 then
        raise exception 'GATE(p): a % the cycle cannot explain answered %', v_f, v_r; end if;
    end loop;

    -- (d) A REFUSED SESSION HALF UN-WRITES THE VALUE HALF (stale swing).
    select count(*) into v_n from public.player_ledger where user_id = v_uid;
    set local role hr_engine;
    v_r := public.hr_hunt_apply(v_uid, 0, v_sid, v_ver, gen_random_uuid(), v_delta,
             v_hunt || jsonb_build_object('swing_from', 7));
    reset role;
    if v_r->>'error' is distinct from 'session_moved'
       or (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold
       or (select count(*) from public.player_ledger where user_id = v_uid) <> v_n
       or (select swing_index from public.hunt_sessions where id = v_sid) <> 0
       or (select stamina_at from public.player_state where user_id = v_uid and slot = 0) is not null then
      raise exception 'GATE(d): a refused settle answered % or left a write behind', v_r; end if;

    -- (s1) A POOL THAT DID NOT DRAIN FOR THE TIME IT HUNTED is refused, and
    --      moves nothing (24 s paid, 0 knocked out: the end value is fixed).
    set local role hr_engine;
    v_r := public.hr_hunt_apply(v_uid, 0, v_sid, v_ver, gen_random_uuid(), v_delta,
             v_hunt || jsonb_build_object('stamina', v_cap));
    reset role;
    if v_r->>'error' is distinct from 'bad_stamina'
       or (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold
       or (select stamina_at from public.player_state where user_id = v_uid and slot = 0) is not null then
      raise exception 'GATE(s1): an undrained pool answered % or moved value', v_r; end if;
    -- (s1b) KNOCKED-OUT TIME NO RECOVERY BACKS (no fall, no stored line) is refused.
    set local role hr_engine;
    v_r := public.hr_hunt_apply(v_uid, 0, v_sid, v_ver, gen_random_uuid(), v_delta,
             v_hunt || jsonb_build_object('paid_ms', 0, 'down_ms', 20000, 'stamina', v_cap));
    reset role;
    if v_r->>'error' is distinct from 'bad_stamina'
       or (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold then
      raise exception 'GATE(s1b): unbacked knocked-out time answered %', v_r; end if;
    -- (s2) A `stamina` END ON A POOL THAT IS NOT EMPTY is not proven.
    set local role hr_engine;
    v_r := public.hr_hunt_apply(v_uid, 0, v_sid, v_ver, gen_random_uuid(), v_delta,
             v_hunt || jsonb_build_object('ended', jsonb_build_object('reason', 'stamina', 'at', to_jsonb(v_to))));
    reset role;
    if v_r->>'error' is distinct from 'end_not_proven'
       or (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold then
      raise exception 'GATE(s2): a stamina end on a full pool answered %', v_r; end if;

    -- (e) AN UNPAID BUFF refuses the whole settle.
    select jsonb_build_array(jsonb_build_object('type', b.type, 'magnitude', b.magnitude,
             'until', to_jsonb(v_to + interval '5 minutes')))
      into v_h from public.hr_item_buffs b order by b.item_id limit 1;
    set local role hr_engine;
    v_r := public.hr_hunt_apply(v_uid, 0, v_sid, v_ver, gen_random_uuid(), v_delta, v_hunt, v_h);
    reset role;
    if v_r->>'error' is distinct from 'buff_not_paid'
       or (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold then
      raise exception 'GATE(e): an unpaid buff segment answered % or moved gold', v_r; end if;

    -- (f) THE HONEST SETTLE, with a press that stays queued: value + session move together.
    --     NO VERSION CAS (Security design review item 8): a player verb bumped
    --     the version after the engine read it, and the settle still lands.
    update public.player_state set version = version + 3 where user_id = v_uid and slot = 0;
    set local role hr_engine;
    v_r := public.hr_hunt_apply(v_uid, 0, v_sid, v_ver, '00000000-0000-4000-8000-0000000c2bf1', v_delta,
             v_hunt || jsonb_build_object('presses_left', jsonb_build_array(0)), null,
             jsonb_build_object('slot', 0, 'at', floor(extract(epoch from v_from) * 1000)::bigint + 30000), true);
    reset role;
    if coalesce(v_r->>'ok', 'false') <> 'true' then raise exception 'GATE(f): the honest settle answered %', v_r; end if;
    if (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold + 10
       or (select swing_index from public.hunt_sessions where id = v_sid) <> 10
       or (select qty_left from public.hunt_bag where session_id = v_sid and item_id = 'cooked_shrimp') <> 10
       or (select coins from public.hunt_session_tally where session_id = v_sid) <> 10
       or (select kills from public.hunt_session_tally where session_id = v_sid) <> 1
       or jsonb_array_length((select presses from public.hunt_sessions where id = v_sid)) <> 1
       or (select count(*) from public.player_ledger where user_id = v_uid and kind = 'combat' and intent = 'accrue'
                                                     and session_id = v_sid) <> 1
       or (select stamina_ms from public.player_state where user_id = v_uid and slot = 0) <> v_cap - 20000
       or (select stamina_at from public.player_state where user_id = v_uid and slot = 0) <> v_to
       or (select i.pull_left from public.hunt_instances i join public.hunt_sessions h on h.instance_id = i.id where h.id = v_sid) <> (v_pz->>'size')::int - 1
       or (select i.respawn_at from public.hunt_instances i join public.hunt_sessions h on h.instance_id = i.id where h.id = v_sid)
          <> v_from + make_interval(secs => (v_pz->>'respawn_ms')::numeric / 1000) then
      raise exception 'GATE(f): the settle did not move gold / clock / bag / tally / press / stamp / stamina / pull together'; end if;
    -- (f2) IDEMPOTENT: the same key replays and moves nothing more.
    set local role hr_engine;
    v_r := public.hr_hunt_apply(v_uid, 0, v_sid, v_ver, '00000000-0000-4000-8000-0000000c2bf1', v_delta, v_hunt);
    reset role;
    if v_r->>'stage' is distinct from 'replayed'
       or (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold + 10
       or (select swing_index from public.hunt_sessions where id = v_sid) <> 10 then
      raise exception 'GATE(f2): a replayed key answered % or moved value again', v_r; end if;

    -- (f3) THE PRICE OF A FALL is stated, matched to the death rows, or the
    --      settle is refused before any write (§5 (2b)); the limits row the
    --      bound is read from exists. (The debit itself — the bound, the level
    --      floor, the journal row, the fall events — is driven through the real
    --      engine by tests/hunt-sessions-settle.mjs DEATHXP.)
    if coalesce(public.hr_hunt_limit('death_xp_permille'), 0) <= 0 then
      raise exception 'GATE(f3): hr_hunt_limits has no death_xp_permille row'; end if;
    set local role hr_engine;
    v_r := public.hr_hunt_apply(v_uid, 0, v_sid, v_ver, gen_random_uuid(), v_delta,
             v_hunt || jsonb_build_object('swing_from', 10, 'death_xp', jsonb_build_array(jsonb_build_object('attack', 1))));
    reset role;
    if v_r->>'error' is distinct from 'bad_death_xp'
       or (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold + 10 then
      raise exception 'GATE(f3): a price for a fall that did not happen answered %', v_r; end if;
    set local role hr_engine;
    v_r := public.hr_hunt_apply(v_uid, 0, v_sid, v_ver, gen_random_uuid(),
             v_delta || jsonb_build_object('deaths', jsonb_build_array(jsonb_build_object('monster', 'rat'))),
             v_hunt || jsonb_build_object('swing_from', 10));
    reset role;
    if v_r->>'error' is distinct from 'bad_death_xp'
       or (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold + 10 then
      raise exception 'GATE(f3): a fall with no stated price answered %', v_r; end if;

    -- (s3) THE POOL RESTS 1:1 FROM ITS ROW, never past the cap, never DOWN to it.
    update public.player_state set stamina_ms = 0, stamina_at = v_to where user_id = v_uid and slot = 0;
    if public.hr_stamina_of(v_uid, 0, v_to + interval '1 hour') <> 3600000
       or public.hr_stamina_of(v_uid, 0, v_to + interval '13 hours') <> v_cap
       or public.hr_stamina_of(v_uid, 0, v_to - interval '1 hour') <> 0 then
      raise exception 'GATE(s3): the pool does not rest 1:1 up to the cap'; end if;
    update public.player_state set stamina_ms = v_cap + 1000 where user_id = v_uid and slot = 0;
    if public.hr_stamina_of(v_uid, 0, v_to + interval '1 hour') <> v_cap + 1000 then
      raise exception 'GATE(s3): resting took a pool above the cap DOWN to it'; end if;
    -- (s3b) A ROW WRITTEN PAST THE WINDOW START (the refill hook's rule) refuses the settle.
    update public.player_state set stamina_ms = 5000, stamina_at = v_to + interval '1 second' where user_id = v_uid and slot = 0;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    set local role hr_engine;
    v_r := public.hr_hunt_apply(v_uid, 0, v_sid, v_ver, gen_random_uuid(), v_delta, v_hunt || jsonb_build_object('swing_from', 10));
    reset role;
    if v_r->>'error' is distinct from 'stamina_ahead' then
      raise exception 'GATE(s3b): a pool written past the window start answered %', v_r; end if;
    update public.player_state set stamina_ms = v_cap - 20000, stamina_at = v_to where user_id = v_uid and slot = 0;

    -- (g) THE ROSTER offers a due session once, leased; a second driver skips it.
    update public.hunt_sessions set entered_at = now() - interval '30 minutes', hunt_from = now() - interval '25 minutes',
                                    settled_to = now() - interval '20 minutes', next_swing_at = now() - interval '20 minutes'
     where id = v_sid;
    set local role hr_tick;
    select count(*) into v_n from public.hr_hunt_roster('selfcheck:a', 50, 30000) r where r.session_id = v_sid;
    if v_n <> 1 then reset role; raise exception 'GATE(g): a due session was not rostered (%)', v_n; end if;
    select count(*) into v_n from public.hr_hunt_roster('selfcheck:b', 50, 30000) r where r.session_id = v_sid;
    reset role;
    if v_n <> 0 then raise exception 'GATE(g): a leased session was handed to a second driver'; end if;

    -- (h) THE CLIENT CREDIT DOORS ARE SHUT FOR A HUNTER (§6b).
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_credit_combat_xp(0, '{"attack": 5}'::jsonb, 'c2-selfcheck');
    if v_r->>'error' is distinct from 'hunt_open' then
      raise exception 'GATE(h): a hunter''s client combat-XP credit answered %', v_r; end if;
    if to_regprocedure('public.hr_credit_kills(integer,text,bigint,text)') is not null then
      v_r := public.hr_credit_kills(0, 'rat', 3, 'c2-selfcheck');
      if v_r->>'error' is distinct from 'hunt_open' and v_r->>'error' is distinct from 'settle_first' then
        raise exception 'GATE(h): a hunter''s client kill credit answered %', v_r; end if;
    end if;
    -- (n) A SHOP USE is priced by the CATALOGUE and debited in the settle:
    --     one `supply_buy` row, the tally's Waste; an item that is no shop
    --     supply, an over-cap buy and a buy the gold cannot cover are refused.
    --     (The probe's purse is a fixture, rolled back with all else at HRC2B.)
    select price into v_n from public.hr_hunt_basic_supplies where basic_id = 'salted_shrimp';
    if v_n is null then raise exception 'GATE(n): the shop catalogue has no salted_shrimp'; end if;
    -- The probe's bar turns the shop heal ON (a new bar has it off): gold moves
    -- only through a slot that shows its price.
    update public.player_action_sets set slots = '[{"item":"*heal_shop","on":true,"conditions":[]}]'::jsonb
     where user_id = v_uid and slot = 0 and preset = 0;
    update public.player_state set gold = 10 * v_n where user_id = v_uid and slot = 0;
    -- (the roster gate moved the session clock: the window starts at its settled_to,
    --  and the pool is pinned there so (5a) prices it from a known start)
    select settled_to into v_from from public.hunt_sessions where id = v_sid;
    update public.player_state set stamina_ms = v_cap - 20000, stamina_at = v_from where user_id = v_uid and slot = 0;
    v_to2 := v_from + interval '2 seconds';
    v_delta := jsonb_build_object('gold', 1, 'accrued_to', to_jsonb(v_to2),
      'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
        'meta', jsonb_build_object('ms', 2000, 'ticks', 1, 'kills', 0, 'mon', 'mill_cellar')));
    v_hunt := jsonb_build_object('swing_from', 10, 'swing_to', 11, 'to', to_jsonb(v_to2), 'next_swing_at', to_jsonb(v_to2),
      'falls', 0, 'down', false, 'down_ms', 0, 'paid_ms', 2000, 'stamina', v_cap - 22000,
      'pull', v_pz || jsonb_build_object('pulls', 0, 'left', (select i.pull_left from public.hunt_instances i join public.hunt_sessions h on h.instance_id = i.id where h.id = v_sid),
        'respawn_at', to_jsonb((select i.respawn_at from public.hunt_instances i join public.hunt_sessions h on h.instance_id = i.id where h.id = v_sid))));
    select version, gold into v_ver, v_gold from public.player_state where user_id = v_uid and slot = 0;
    -- The store is used only on the player's choice (Master Design Reference
    -- §4): a new set reads mine + end, so a shop heal on the bar is refused
    -- store_off; the probe then opts into the store.
    set local role hr_engine;
    v_r := public.hr_hunt_apply(v_uid, 0, v_sid, v_ver, gen_random_uuid(), v_delta,
             v_hunt || jsonb_build_object('buys', jsonb_build_object('salted_shrimp', 1)));
    reset role;
    if v_r->>'error' is distinct from 'store_off' then raise exception 'GATE(n): a shop heal on a mine+end set answered %', v_r; end if;
    update public.player_action_sets set supply_source = 'store'
     where user_id = v_uid and slot = 0 and preset = 0;
    set local role hr_engine;
    v_r := public.hr_hunt_apply(v_uid, 0, v_sid, v_ver, gen_random_uuid(), v_delta,
             v_hunt || jsonb_build_object('buys', jsonb_build_object('cooked_shrimp', 1)));
    reset role;
    if v_r->>'error' is distinct from 'not_for_sale' then raise exception 'GATE(n): a buy of a packed item answered %', v_r; end if;
    set local role hr_engine;
    v_r := public.hr_hunt_apply(v_uid, 0, v_sid, v_ver, gen_random_uuid(), v_delta,
             v_hunt || jsonb_build_object('buys', jsonb_build_object('salted_shrimp', 3)));
    reset role;
    if v_r->>'error' is distinct from 'too_many_buys' then raise exception 'GATE(n): 3 heals in 2 s answered %', v_r; end if;
    update public.player_state set gold = 0 where user_id = v_uid and slot = 0;
    set local role hr_engine;
    v_r := public.hr_hunt_apply(v_uid, 0, v_sid, v_ver, gen_random_uuid(), v_delta,
             v_hunt || jsonb_build_object('buys', jsonb_build_object('salted_shrimp', 2)));
    reset role;
    update public.player_state set gold = v_gold where user_id = v_uid and slot = 0;
    if v_r->>'error' is distinct from 'gold_short' then raise exception 'GATE(n): a buy past the purse answered %', v_r; end if;
    set local role hr_engine;
    v_r := public.hr_hunt_apply(v_uid, 0, v_sid, v_ver, '00000000-0000-4000-8000-0000000c2bf2', v_delta,
             v_hunt || jsonb_build_object('buys', jsonb_build_object('salted_shrimp', 1)));
    reset role;
    if coalesce(v_r->>'ok', 'false') <> 'true' then raise exception 'GATE(n): an honest buy answered %', v_r; end if;
    if (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold + 1 - v_n
       or (select count(*) from public.player_ledger where user_id = v_uid and kind = 'hunt' and intent = 'supply_buy'
                                                     and gold = -v_n and session_id = v_sid) <> 1
       or (select supply_gold from public.hunt_session_tally where session_id = v_sid) <> v_n
       or ((select bought from public.hunt_session_tally where session_id = v_sid)->>'salted_shrimp')::int <> 1 then
      raise exception 'GATE(n): the buy did not debit % gold, journal one row and credit the tally''s Waste', v_n; end if;

    -- (r) AN AUTOMATIC END SENDS THE CHARACTER BACK TO ITS LAST ACTIVITY after
    --     the walk home (the kill switch's `server` end, proved from the config).
    select a.activity_id into v_act from public.hr_activities a
     where a.kind = 'gather' and (a.req_lv is null or a.req_lv <= 1) order by a.activity_id limit 1;
    if v_act is null then raise exception 'GATE(r): the catalogue has no level-1 gather activity to resume'; end if;
    update public.player_state set last_activity_kind = 'gather', last_activity_id = v_act where user_id = v_uid and slot = 0;
    update public.hr_hunt_config set enabled = false where id;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    set local role hr_engine;
    v_r := public.hr_hunt_apply(v_uid, 0, v_sid, v_ver, gen_random_uuid(),
             jsonb_build_object('accrued_to', to_jsonb(v_to2 + interval '1 millisecond'),
               'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
                 'meta', jsonb_build_object('ms', 0, 'ticks', 0, 'kills', 0, 'mon', 'mill_cellar'))),
             jsonb_build_object('swing_from', 11, 'swing_to', 11, 'to', to_jsonb(v_to2 + interval '1 millisecond'),
               'next_swing_at', to_jsonb(v_to2 + interval '1 millisecond'), 'falls', 0, 'down', false,
               'down_ms', 0, 'paid_ms', 0, 'stamina', v_cap - 22000, 'pull', v_hunt->'pull',
               'ended', jsonb_build_object('reason', 'server', 'at', to_jsonb(v_to2))));
    reset role;
    update public.hr_hunt_config set enabled = true where id;
    if coalesce(v_r->>'ok', 'false') <> 'true' then raise exception 'GATE(r): the server end answered %', v_r; end if;
    if (select active_kind || ':' || active_id from public.player_state where user_id = v_uid and slot = 0) <> 'gather:' || v_act
       or (select active_since from public.player_state where user_id = v_uid and slot = 0)
          <> v_to2 + make_interval(secs => (select travel_s from public.hr_hunt_travel where hunt_id = 'mill_cellar'))
       or (select count(*) from public.player_ledger where user_id = v_uid and kind = 'hunt' and intent = 'resume'
                                                     and (meta->>'resumed')::boolean) <> 1
       or not exists (select 1 from public.hunt_session_events where session_id = v_sid and type = 'ended'
                        and data->'resume'->>'id' = v_act)
       or coalesce((select real_return_at from public.hr_return_anchor where user_id = v_uid and slot = 0), '-infinity')
          < v_to2 + make_interval(secs => (select travel_s from public.hr_hunt_travel where hunt_id = 'mill_cellar')) then
      raise exception 'GATE(r): the automatic end did not resume % after the walk home (with a fresh presence anchor)', v_act; end if;

    -- (s4) AN EMPTY POOL CANNOT START A HUNT (§4c's gate on hr_hunt_enter).
    update public.hunt_sessions set ended_at = settled_to, end_reason = 'left' where id = v_sid;
    update public.player_state set active_kind = 'idle', active_id = null, stamina_ms = 0, stamina_at = now()
     where user_id = v_uid and slot = 0;
    v_r := public.hr_hunt_enter(0, 'mill_cellar', '[{"item":"cooked_shrimp","qty":2}]', 0, null, null, gen_random_uuid());
    if v_r->>'error' is distinct from 'no_stamina' then
      raise exception 'GATE(s4): an empty pool entered a hunt: %', v_r; end if;
    perform set_config('request.jwt.claim.sub', '', true);

    raise exception using errcode = 'HRC2B', message = 'hunt-sessions-settle §10 complete — rolling back';
  exception when sqlstate 'HRC2B' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  -- (z) NOTHING LEAKED.
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from public.hunt_sessions where user_id = v_uid)
     or exists (select 1 from public.hr_rejections where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE(z): §10 LEAKED a probe row'; end if;

  -- (y) THE DETECTOR IS GREEN.
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    v_h := public.hr_assert_grant_hygiene(true);
    if v_h is null
       or jsonb_array_length(coalesce(v_h->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_h->'ungated_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_h->'engine_execute_outside_allowlist', '[]'::jsonb)) <> 0 then
      raise exception 'GATE(y): hr_assert_grant_hygiene is RED after this file: %', v_h; end if;
  end if;
  raise notice 'hunt-sessions-settle: EXECUTED - engine-only read/apply, tick-only roster, the fence refuses a bare '
               'combat accrue for a hunter, a refused session half un-writes the value half, an unpaid buff refuses, '
               'value + clock + bag + tally + press move together, a replay moves nothing, the lease holds; net zero';
end $$;
