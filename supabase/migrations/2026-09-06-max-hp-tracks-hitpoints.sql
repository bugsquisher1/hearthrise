-- 2026-09-06-max-hp-tracks-hitpoints.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. ⚠⚠⚠
-- ⚠ SECURITY REVIEW REQUIRED before apply. It installs a TRIGGER on
--   public.player_skills — a row-level hook on the hottest progression table in
--   the game — and it BACKFILLS a column of public.player_state for every
--   character that exists. Both are ranked-surface-adjacent (hitpoints feeds
--   combat level and the skill:hitpoints board), so read §"WHAT CANNOT BE
--   MINTED" below before signing it off.
--   The Coordinator applies it by hand (execute_sql, NOT wrapped in
--   begin/commit — this file contains several `do $$` blocks and must be sent
--   as-is). NOT during [00:00,00:10) UTC: the day-key crons run there.
--
--   APPLY AFTER: 2026-08-11-player-state.sql (player_state, player_skills,
--   hr_level_from_xp, hr_xp_table, player_ledger) and the current hr_apply
--   (2026-08-25-workers.sql). §0 fails closed if any of them is absent. It
--   restates NO existing function body, so it cannot revert a live hand-patch
--   and it moves no live-hash-drift baseline entry.
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE BUG THIS FIXES — max_hp never tracked the hitpoints level
-- ══════════════════════════════════════════════════════════════════════════
-- THE RULE, everywhere else in the game: MAX HP IS THE HITPOINTS LEVEL.
--   · client  src/legacy.js hrSyncMaxHp()  — G.playerMaxHp = level('hitpoints'),
--             raise-only.
--   · import  2026-08-17-cutover-import.sql:719 —
--             v_max_hp := greatest(1, hr_level_from_xp(hitpoints xp)).
--   · kit     2026-08-11-catalogue.generated.sql:1663 asserts hr_start_kit.max_hp
--             equals the level the starting hitpoints XP buys (1154 xp -> 10).
--
-- THE DEFECT: after character creation, NOTHING ON THE SERVER EVER MOVED IT
-- AGAIN. Every writer of hitpoints XP — hr_apply's `xp` map (the accrual
-- settle), hr_credit_combat_xp (attended combat), hr_claim_goal's kill goals
-- (b492), hr_claim_bounty, hr_dungeon_settle — credits player_skills and has
-- ZERO references to max_hp. hr_create_character stamps hr_start_kit.max_hp =
-- 10 and that is the value the character keeps at hitpoints level 41.
--
-- THE SECOND GAP, IN THE ENGINE. supabase/functions/hr-accrue/accrual.js DOES
-- bump its own copy on a level-up (`if (ev.skill==='hitpoints')
-- state.playerMaxHp = ev.to`, ~1463) and reports it in the summary (~1546) —
-- but the delta it sends to hr_apply carries only `hp`, and hr_apply's contract
-- (2026-08-11-apply-engine.sql:359) says in terms: "there is no … 'bank_cap',
-- 'max_hp' or 'slot' key either", and unknown keys are REJECTED. So the
-- engine's own correct number was computed and thrown away on every settle.
-- That is deliberate — max_hp must never be a client/Edge-proposed absolute —
-- and this file does NOT open the contract. It makes the SERVER derive the
-- number instead, from XP it already owns.
--
-- WHAT IT COSTS THE PLAYER (why this is a P0 and not hygiene): every
-- server-side fight runs the character at a 10 HP ceiling, and Auto-Eat's
-- threshold is a PERCENTAGE of max_hp (supabase/functions/hr-accrue/eat.js —
-- whose §comment already names "the separate HP-derivation fix" as pending), so
-- the absolute eat trigger is scaled to 10 as well. A level-41-hitpoints
-- character fights the first night with 24% of its HP and eats at 24% of the
-- intended trigger. It compounds first-night death.
--
-- ── THE FIX: ONE DERIVATION, ATTACHED TO THE DATA, NOT TO THE CALLERS ──────
-- max_hp is not an independent fact; it is a FUNCTION of persisted hitpoints
-- XP. Six RPCs credit that XP today and the seventh is being written this
-- month, so a copy of the rule inside each credit site is a rule that WILL
-- drift — the same class as the phantom `combat` skill id that sat in
-- hr_goal_rewards from the day it shipped. So the rule lives in exactly two
-- objects:
--
--   hr_sync_max_hp(user, slot)   the derivation + the raise-only write
--   hr_player_skills_max_hp      an AFTER trigger on player_skills that calls
--                                it whenever a `hitpoints` row is written
--
-- Every credit site — including ones nobody has written yet, including
-- hr_apply, whose xp loop runs BEFORE its own `hp = least(max_hp, …)` clamp so
-- the settle's HP is now clamped to the NEW ceiling in the same transaction —
-- is covered without being touched. No existing SECURITY DEFINER body is
-- restated, which is the other half of the reason for this shape: re-emitting
-- a 900-line RPC to add one statement is how a hand-patched production body
-- gets silently reverted.
--
-- ⚠ WHAT CANNOT BE MINTED (for the security review).
--   · The trigger reads player_skills.hitpoints.xp and NOTHING ELSE. There is
--     no client input on this path at all — not a parameter, not a column, not
--     a timestamp. A forger who could set max_hp directly would have to be able
--     to set hitpoints XP directly, at which point max_hp is the least of it.
--   · It is RAISE-ONLY (`where max_hp < derived`), matching the client rule and
--     the b374 envelope derive. XP in this game is monotonic (no production
--     path lowers player_skills.xp; the only `delete from player_skills` calls
--     are inside migrations' own probe blocks), so raise-only is EXACT here,
--     not lossy — the guard asserts equality, not inequality.
--   · HP itself is only ever raised to the new ceiling for a character that was
--     ALREADY AT FULL (`hp >= old max_hp`) — the "a level-up hands you the new
--     headroom" arm of hrSyncMaxHp. A character at 0 is NOT resurrected (the
--     client's `|| !(hp>0)` arm is deliberately NOT copied: a free rez is a
--     behaviour change, and the server is the one that decides death).
--   · No version bump and no updated_at touch, on the precedent of hr_apply's
--     VOID update (2026-08-25-workers.sql): the row is already locked by the
--     caller, the caller bumps version itself, and hr_state_of is read after.
--     A second bump inside a trigger would make an honest caller's optimistic
--     version arithmetic depend on whether a level-up happened.
--   · max_hp is not tradeable, not rankable and not contributable. It cannot
--     cross into another player's economy or ranking.
--
-- ⚠ LOCK ORDER (concurrency). The trigger takes a row lock on THIS character's
--   player_state row while holding a row lock on its own player_skills row.
--   Every writer of hitpoints XP already serialises per character before it
--   writes: hr_apply takes pg_advisory_xact_lock(user:slot) and
--   `player_state … for update` first; hr_credit_combat_xp takes its own
--   advisory lock and `player_state … for update` first; the claim/bounty/
--   dungeon verbs go through hr_rpc_gate + the same per-character pattern. Two
--   transactions therefore cannot hold these two rows in opposite orders for
--   the same character, and different characters share no row. The common case
--   writes nothing at all (max_hp is already >= the derived level, the UPDATE
--   matches zero rows, no WAL, no lock upgrade).
--
-- ── THE BACKFILL (§4) ──────────────────────────────────────────────────────
-- One statement, DERIVED FROM PERSISTED XP ONLY — no seeded value, no
-- client-supplied number, no amnesty grant. It raises max_hp to the level the
-- character's own stored hitpoints XP already bought and hands the headroom to
-- characters that were at full. One player_ledger row per CORRECTED character
-- (kind 'admin'), which is the established shape for an administrative
-- correction and is bounded by the number of characters, not by the number of
-- ticks — the game_events lesson (1.6M rows / 229 MB from six players in four
-- days) is not repeated here. Re-running the file corrects nothing and
-- journals nothing.
--
-- IDEMPOTENT. Every object is create-or-replace / drop-if-exists-then-create;
-- the backfill is a raise-only UPDATE whose predicate is false on a second run.
-- Safe on a fresh rebuild (tests/schema-apply-order.json) and on production.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.player_state')  is null then raise exception 'player_state missing — apply 2026-08-11-player-state.sql first'; end if;
  if to_regclass('public.player_skills') is null then raise exception 'player_skills missing — apply 2026-08-11-player-state.sql first'; end if;
  if to_regclass('public.player_ledger') is null then raise exception 'player_ledger missing — the backfill has nowhere to journal'; end if;
  if to_regprocedure('public.hr_level_from_xp(bigint)') is null then
    raise exception 'hr_level_from_xp not found — the derivation has no curve to read';
  end if;
  if (select count(*) from public.hr_xp_table) <> 99 then
    raise exception 'hr_xp_table holds % rows, expected 99 — the level curve is not the one this file derives against',
      (select count(*) from public.hr_xp_table);
  end if;
  -- The column this file exists to maintain.
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='player_state' and column_name='max_hp') then
    raise exception 'player_state.max_hp missing — nothing to derive into';
  end if;
end $$;

-- ── 1. THE DERIVATION — one function, the single source of the rule ────────
-- STABLE, not immutable: it reads a table. SECURITY DEFINER so that a future
-- caller running as a lesser role still gets the same answer, and revoked from
-- every client role below — nobody outside the server needs to ask.
create or replace function public.hr_max_hp_for(p_user uuid, p_slot int)
returns int language sql stable security definer set search_path = public as $$
  select greatest(1, public.hr_level_from_xp(coalesce(
    (select xp from public.player_skills
      where user_id = p_user and slot = p_slot and skill_id = 'hitpoints'), 0)))
$$;
revoke execute on function public.hr_max_hp_for(uuid, int)
  from public, anon, authenticated, service_role, hr_engine;

-- ── 2. THE WRITE — raise-only, headroom for a full-HP character ────────────
-- Returns the resulting ceiling (null when the character has no player_state
-- row, which is a no-op rather than an error: player_skills is FK'd to
-- player_state, so it cannot happen through a supported path).
create or replace function public.hr_sync_max_hp(p_user uuid, p_slot int)
returns int language plpgsql volatile security definer set search_path = public as $$
declare
  v_lvl int;
  v_max int;
begin
  v_lvl := public.hr_max_hp_for(p_user, p_slot);
  -- The SET list reads the OLD row, so `ps.hp >= ps.max_hp` is "was at full
  -- before the ceiling moved" — the hrSyncMaxHp `wasFull` arm, exactly.
  update public.player_state ps
     set max_hp = v_lvl,
         hp     = case when ps.hp >= ps.max_hp then v_lvl else ps.hp end
   where ps.user_id = p_user
     and ps.slot    = p_slot
     and ps.max_hp  < v_lvl
   returning ps.max_hp into v_max;
  if v_max is null then
    select ps.max_hp into v_max from public.player_state ps
      where ps.user_id = p_user and ps.slot = p_slot;
  end if;
  return v_max;
end $$;
revoke execute on function public.hr_sync_max_hp(uuid, int)
  from public, anon, authenticated, service_role, hr_engine;

-- ── 3. THE HOOK — every hitpoints-XP write, present and future ─────────────
-- AFTER INSERT OR UPDATE OF xp, FOR EACH ROW, WHEN (new.skill_id='hitpoints').
-- The WHEN clause is evaluated by the executor before the function is entered,
-- so the other ~30 skills cost a tuple comparison and nothing else. It does not
-- write player_skills, so it cannot recurse.
create or replace function public.hr_player_skills_max_hp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.hr_sync_max_hp(new.user_id, new.slot);
  return null;   -- AFTER trigger: the return value is ignored
end $$;
revoke execute on function public.hr_player_skills_max_hp()
  from public, anon, authenticated, service_role, hr_engine;

drop trigger if exists hr_player_skills_max_hp on public.player_skills;
create trigger hr_player_skills_max_hp
  after insert or update of xp on public.player_skills
  for each row when (new.skill_id = 'hitpoints')
  execute function public.hr_player_skills_max_hp();

-- ── 4. THE BACKFILL — derived from persisted XP, journalled, raise-only ────
-- Written as a CTE so the corrected rows are counted and journalled from the
-- SAME statement that wrote them: a ledger row cannot describe a correction
-- that did not happen, and a correction cannot happen unjournalled.
with derived as (
  select ps.user_id,
         ps.slot,
         ps.max_hp                                     as old_max,
         ps.hp                                         as old_hp,
         greatest(1, public.hr_level_from_xp(coalesce(sk.xp, 0))) as new_max,
         coalesce(sk.xp, 0)                            as hp_xp
    from public.player_state ps
    left join public.player_skills sk
      on sk.user_id = ps.user_id and sk.slot = ps.slot and sk.skill_id = 'hitpoints'
),
fixed as (
  update public.player_state ps
     set max_hp = d.new_max,
         hp     = case when ps.hp >= ps.max_hp then d.new_max else ps.hp end
    from derived d
   where d.user_id = ps.user_id
     and d.slot    = ps.slot
     and ps.max_hp < d.new_max
  returning ps.user_id, ps.slot, d.old_max, d.old_hp, ps.max_hp as new_max, ps.hp as new_hp, d.hp_xp
)
insert into public.player_ledger (user_id, slot, kind, intent, skill_id, xp, meta)
select f.user_id, f.slot, 'admin', 'max_hp_derive', 'hitpoints', f.hp_xp,
       jsonb_build_object('fix', 'max_hp_tracks_hitpoints',
                          'max_hp_from', f.old_max, 'max_hp_to', f.new_max,
                          'hp_from', f.old_hp, 'hp_to', f.new_hp)
  from fixed f;

-- ── 5. VERIFY — the file cannot succeed quietly ────────────────────────────
do $$
declare
  v_bad  int;
  v_def  text;
  v_n    int;
  v_ex   text;
begin
  -- (a) THE INVARIANT ITSELF, over every row that exists. Equality, not
  --     `>=`: XP is monotonic, so raise-only lands exactly on the level.
  select count(*) into v_bad
    from public.player_state ps
    left join public.player_skills sk
      on sk.user_id = ps.user_id and sk.slot = ps.slot and sk.skill_id = 'hitpoints'
   where ps.max_hp <> greatest(1, public.hr_level_from_xp(coalesce(sk.xp, 0)));
  if v_bad > 0 then
    select string_agg(format('%s/%s max_hp=%s lvl=%s', ps.user_id, ps.slot, ps.max_hp,
             greatest(1, public.hr_level_from_xp(coalesce(sk.xp, 0)))), ', ')
      into v_ex
      from public.player_state ps
      left join public.player_skills sk
        on sk.user_id = ps.user_id and sk.slot = ps.slot and sk.skill_id = 'hitpoints'
     where ps.max_hp <> greatest(1, public.hr_level_from_xp(coalesce(sk.xp, 0)))
     limit 1;
    -- TWO DIRECTIONS, ONE MESSAGE, BOTH FAIL CLOSED.
    --   max_hp BELOW the level  -> the backfill did not land. A bug in this file.
    --   max_hp ABOVE the level  -> a row this file may not touch. The backfill is
    --     raise-only by design (it must never confiscate a ceiling a player has
    --     been fighting with), so it CANNOT correct that direction and refuses to
    --     pretend it did. No path in the server lowers hitpoints XP, so if this
    --     ever fires, go and find out who did — do not loosen the check.
    raise exception 'VERIFY(a): % character(s) disagree with their hitpoints level (e.g. %). Below '
                    'the level means the backfill did not land; above it means something outside '
                    'this file moved max_hp or lowered XP, which is an incident, not a docs gap.',
                    v_bad, v_ex;
  end if;

  -- (b) THE HOOK IS ATTACHED, ENABLED, AND ATTACHED TO THE RIGHT EVENT. A
  --     trigger that exists but fires on DELETE, or on a statement, or with the
  --     wrong WHEN clause, would leave (a) true today and false tomorrow — and
  --     (a) alone cannot tell the difference.
  select pg_get_triggerdef(t.oid) into v_def
    from pg_trigger t
   where t.tgrelid = 'public.player_skills'::regclass
     and t.tgname  = 'hr_player_skills_max_hp'
     and not t.tgisinternal;
  if v_def is null then
    raise exception 'VERIFY(b): trigger hr_player_skills_max_hp is not on player_skills — nothing keeps '
                    'max_hp tracking the hitpoints level after this file';
  end if;
  if position('AFTER INSERT OR UPDATE OF xp' in v_def) = 0
     or position('FOR EACH ROW' in v_def) = 0
     or position('hitpoints' in v_def) = 0
     or position('hr_player_skills_max_hp()' in v_def) = 0 then
    raise exception 'VERIFY(b): the trigger is not the one this file installs — %', v_def;
  end if;
  if exists (select 1 from pg_trigger t
              where t.tgrelid = 'public.player_skills'::regclass
                and t.tgname = 'hr_player_skills_max_hp'
                and t.tgenabled = 'D') then
    raise exception 'VERIFY(b): trigger hr_player_skills_max_hp is DISABLED';
  end if;

  -- (c) NOT CLIENT-EXECUTABLE. A privileged SECURITY DEFINER verb left
  --     executable by authenticated/anon is the whole game; hr_engine is on the
  --     list too, because "Edge Functions never write tables" is a control here
  --     and hr_sync_max_hp writes one.
  -- PUBLIC is covered transitively: a grant to PUBLIC is a grant to anon, so
  -- it cannot hide from this list. ('public' is a pseudo-role and
  -- has_function_privilege() refuses it by name.)
  select count(*) into v_n
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join pg_roles r
   where n.nspname = 'public'
     and p.proname in ('hr_max_hp_for','hr_sync_max_hp','hr_player_skills_max_hp')
     and r.rolname in ('anon','authenticated','service_role','hr_engine')
     and has_function_privilege(r.oid, p.oid, 'EXECUTE');
  if v_n > 0 then
    raise exception 'VERIFY(c): % client-role EXECUTE grant(s) survive on the max_hp verbs', v_n;
  end if;

  -- (d) THE FILE MUST NOT HAVE OPENED A CLIENT WRITE PATH. Re-asserted rather
  --     than assumed, because this is the first file in the program to attach a
  --     trigger to a player table and a trigger runs with the writer's rights.
  select count(*) into v_bad from pg_policies
   where schemaname = 'public' and tablename in ('player_state','player_skills')
     and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if v_bad > 0 then
    raise exception 'VERIFY(d): % client write policies on player_state/player_skills', v_bad;
  end if;
  select count(*) into v_bad from information_schema.role_table_grants
   where table_schema = 'public' and table_name in ('player_state','player_skills')
     and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
     and privilege_type <> 'SELECT';
  if v_bad > 0 then
    raise exception 'VERIFY(d): % client write grants on player_state/player_skills', v_bad;
  end if;

  select count(*) into v_n from public.player_ledger
   where kind = 'admin' and intent = 'max_hp_derive';
  raise notice 'max_hp now tracks the hitpoints level: 0 disagreeing characters, trigger armed, '
               '% correction row(s) journalled (cumulative).', v_n;
end $$;
